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
import { normalizeNameLookupKey } from "@/lib/quickAccess";
import { logAuditEvent } from "@/lib/serverAudit";

const SIGN_IN_MAX_ATTEMPTS = 10;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
const QUICK_ACCESS_MAX_ATTEMPTS = 20;
const QUICK_ACCESS_WINDOW_MS = 15 * 60 * 1000;
const DISABLE_RATE_LIMITS = process.env.E2E_DISABLE_RATE_LIMITS === "true";

function getCredentialString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isQuickAccessCredential(value: unknown): boolean {
  return value === "true" || value === true;
}

async function findQuickAccessProfile({
  communityName,
  playerName,
}: {
  communityName: string;
  playerName: string;
}) {
  const communityKey = normalizeNameLookupKey(communityName);
  const playerKey = normalizeNameLookupKey(playerName);

  if (!communityKey || !playerKey) {
    return null;
  }

  const communities = await prisma.community.findMany({
    select: {
      id: true,
      name: true,
    },
  });
  const matchingCommunities = communities.filter(
    (community) => normalizeNameLookupKey(community.name) === communityKey
  );

  if (matchingCommunities.length !== 1) {
    return null;
  }

  const community = matchingCommunities[0];
  const members = await prisma.communityMember.findMany({
    where: { communityId: community.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          isActive: true,
          isClaimed: true,
        },
      },
    },
  });
  const matchingPlayers = members
    .map((member) => member.user)
    .filter(
      (user) =>
        user.isActive &&
        !user.isClaimed &&
        user.email === null &&
        user.passwordHash === null &&
        normalizeNameLookupKey(user.name) === playerKey
    );

  if (matchingPlayers.length !== 1) {
    return null;
  }

  return {
    community,
    user: matchingPlayers[0],
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        quickAccess: { label: "Quick access", type: "text" },
        communityName: { label: "Community name", type: "text" },
        playerName: { label: "Player name", type: "text" },
      },
      async authorize(credentials, request) {
        if (isQuickAccessCredential(credentials?.quickAccess)) {
          const communityName = getCredentialString(credentials?.communityName);
          const playerName = getCredentialString(credentials?.playerName);
          const communityKey = normalizeNameLookupKey(communityName ?? "");
          const playerKey = normalizeNameLookupKey(playerName ?? "");

          if (!communityName || !playerName || !communityKey || !playerKey) {
            return null;
          }

          try {
            const rateLimit = DISABLE_RATE_LIMITS
              ? null
              : applyRateLimit({
                  key: buildRateLimitKey([
                    "auth",
                    "quick_access",
                    communityKey,
                    playerKey,
                    getRequestRateLimitSource(request),
                  ]),
                  max: QUICK_ACCESS_MAX_ATTEMPTS,
                  windowMs: QUICK_ACCESS_WINDOW_MS,
                });
            if (rateLimit && !rateLimit.allowed) {
              logAuditEvent({
                action: "auth.quick_access",
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
                  id: `${communityKey}:${playerKey}`,
                  type: "quick_access_profile",
                },
              });
              return null;
            }

            const match = await findQuickAccessProfile({
              communityName,
              playerName,
            });
            if (!match) {
              logAuditEvent({
                action: "auth.quick_access",
                details: {
                  reason: "invalid_quick_access_profile",
                },
                outcome: "denied",
                request,
                scope: {
                  route: "/api/auth/[...nextauth]",
                },
                target: {
                  id: `${communityKey}:${playerKey}`,
                  type: "quick_access_profile",
                },
              });
              return null;
            }

            logAuditEvent({
              action: "auth.quick_access",
              actor: {
                userId: match.user.id,
              },
              outcome: "success",
              request,
              scope: {
                communityId: match.community.id,
                route: "/api/auth/[...nextauth]",
              },
              target: {
                id: match.user.id,
                name: match.user.name,
                type: "user",
              },
            });

            return {
              id: match.user.id,
              email: null,
              name: match.user.name,
              isAdmin: false,
              isQuickAccess: true,
              quickAccessCommunityId: match.community.id,
            };
          } catch (error) {
            logAuditEvent({
              action: "auth.quick_access",
              details: {
                errorMessage:
                  error instanceof Error ? error.message : "Unknown error",
                reason: "quick_access_error",
              },
              outcome: "error",
              request,
              scope: {
                route: "/api/auth/[...nextauth]",
              },
              target: {
                id: `${communityKey}:${playerKey}`,
                type: "quick_access_profile",
              },
            });
            throw error;
          }
        }

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = normalizeAuthEmail(credentials.email as string);
        if (!normalizedEmail) {
          return null;
        }

        try {
          const rateLimit = DISABLE_RATE_LIMITS
            ? null
            : applyRateLimit({
                key: buildRateLimitKey([
                  "auth",
                  "signin",
                  normalizedEmail,
                  getRequestRateLimitSource(request),
                ]),
                max: SIGN_IN_MAX_ATTEMPTS,
                windowMs: SIGN_IN_WINDOW_MS,
              });
          if (rateLimit && !rateLimit.allowed) {
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
        token.email = typeof user.email === "string" ? user.email : null;
        token.isQuickAccess = !!user.isQuickAccess;
        token.quickAccessCommunityId =
          typeof user.quickAccessCommunityId === "string"
            ? user.quickAccessCommunityId
            : null;
        token.isAdmin = token.isQuickAccess ? false : !!user.isAdmin;
      } else if (typeof token.email === "string") {
        token.isAdmin = token.isQuickAccess ? false : isGlobalAdminEmail(token.email);
      }
      if (typeof token.isAdmin !== "boolean") token.isAdmin = false;
      if (typeof token.isQuickAccess !== "boolean") token.isQuickAccess = false;
      if (token.isQuickAccess && typeof token.quickAccessCommunityId !== "string") {
        token.quickAccessCommunityId = null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email =
          typeof token.email === "string" ? token.email : "";
        session.user.isAdmin = !!token.isAdmin;
        session.user.isQuickAccess = !!token.isQuickAccess;
        session.user.quickAccessCommunityId =
          typeof token.quickAccessCommunityId === "string"
            ? token.quickAccessCommunityId
            : null;
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
