import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail, normalizeAuthEmail } from "@/lib/globalAdmin";
import {
  applyRateLimit,
  buildRateLimitKey,
  getRequestRateLimitSource,
} from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/serverAudit";

const SIGN_IN_MAX_ATTEMPTS = 10;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = normalizeAuthEmail(credentials.email as string);
        if (!normalizedEmail) {
          return null;
        }

        try {
          const rateLimit = applyRateLimit({
            key: buildRateLimitKey([
              "auth",
              "signin",
              normalizedEmail,
              getRequestRateLimitSource(request),
            ]),
            max: SIGN_IN_MAX_ATTEMPTS,
            windowMs: SIGN_IN_WINDOW_MS,
          });
          if (!rateLimit.allowed) {
            logAuditEvent({
              action: "auth.sign_in",
              actor: {
                email: normalizedEmail,
              },
              details: {
                reason: "rate_limited",
                retryAfterSeconds: rateLimit.retryAfterSeconds,
              },
              outcome: "denied",
              request,
              scope: {
                route: "/api/auth/[...nextauth]",
              },
              target: {
                id: normalizedEmail,
                type: "auth_credentials",
              },
            });
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          });

          if (!user || !user.passwordHash) {
            logAuditEvent({
              action: "auth.sign_in",
              actor: {
                email: normalizedEmail,
              },
              details: {
                reason: "invalid_credentials",
              },
              outcome: "denied",
              request,
              scope: {
                route: "/api/auth/[...nextauth]",
              },
              target: {
                id: normalizedEmail,
                type: "auth_credentials",
              },
            });
            return null;
          }

          const isValid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );

          if (!isValid) {
            logAuditEvent({
              action: "auth.sign_in",
              actor: {
                email: normalizedEmail,
              },
              details: {
                reason: "invalid_credentials",
              },
              outcome: "denied",
              request,
              scope: {
                route: "/api/auth/[...nextauth]",
              },
              target: {
                id: normalizedEmail,
                type: "auth_credentials",
              },
            });
            return null;
          }

          const resolvedEmail = user.email ?? normalizedEmail;
          const isAdmin = isGlobalAdminEmail(resolvedEmail);

          logAuditEvent({
            action: "auth.sign_in",
            actor: {
              email: resolvedEmail,
              isGlobalAdmin: isAdmin,
              userId: user.id,
            },
            outcome: "success",
            request,
            scope: {
              route: "/api/auth/[...nextauth]",
            },
            target: {
              id: user.id,
              name: user.name,
              type: "user",
            },
          });

          return {
            id: user.id,
            email: resolvedEmail,
            name: user.name,
            isAdmin,
          };
        } catch (error) {
          logAuditEvent({
            action: "auth.sign_in",
            actor: {
              email: normalizedEmail,
            },
            details: {
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
              reason: "sign_in_error",
            },
            outcome: "error",
            request,
            scope: {
              route: "/api/auth/[...nextauth]",
            },
            target: {
              id: normalizedEmail,
              type: "auth_credentials",
            },
          });
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (typeof user.id === "string") {
          token.id = user.id;
        }
        if (typeof user.email === "string") {
          token.email = user.email;
        }
        token.isAdmin = !!user.isAdmin;
      } else if (typeof token.email === "string") {
        token.isAdmin = isGlobalAdminEmail(token.email);
      }
      if (typeof token.isAdmin !== "boolean") token.isAdmin = false;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.isAdmin = !!token.isAdmin;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});
