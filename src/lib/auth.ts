import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail, normalizeAuthEmail } from "@/lib/globalAdmin";
import { areRateLimitsDisabled, checkRateLimit } from "@/lib/rateLimit";
import { normalizeNameLookupKey } from "@/lib/quickAccess";
import { logAuditEvent } from "@/lib/serverAudit";

const SIGN_IN_MAX_ATTEMPTS = 10;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
const QUICK_ACCESS_MAX_ATTEMPTS = 20;
const QUICK_ACCESS_WINDOW_MS = 15 * 60 * 1000;

function getCredentialString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isQuickAccessCredential(value: unknown): boolean {
  return value === "true" || value === true;
}

async function findQuickAccessProfile({
  clubName,
  playerName,
}: {
  clubName: string;
  playerName: string;
}) {
  const clubKey = normalizeNameLookupKey(clubName);
  const playerKey = normalizeNameLookupKey(playerName);

  if (!clubKey || !playerKey) {
    return null;
  }

  const clubs = await prisma.club.findMany({
    select: {
      id: true,
      name: true,
      isTutorial: true,
    },
  });
  const matchingClubs = clubs.filter(
    (club) =>
      !club.isTutorial &&
      normalizeNameLookupKey(club.name) === clubKey
  );

  if (matchingClubs.length !== 1) {
    return null;
  }

  const club = matchingClubs[0];
  const members = await prisma.clubMember.findMany({
    where: { clubId: club.id },
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
    club,
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
        clubName: { label: "Club name", type: "text" },
        communityName: { label: "Club name", type: "text" },
        playerName: { label: "Player name", type: "text" },
      },
      async authorize(credentials, request) {
        if (isQuickAccessCredential(credentials?.quickAccess)) {
          const rawClubName = getCredentialString(credentials?.clubName);
          const rawCommunityName = getCredentialString(credentials?.communityName);
          if (
            rawClubName &&
            rawCommunityName &&
            rawClubName !== rawCommunityName
          ) {
            return null;
          }
          const clubName = rawClubName ?? rawCommunityName;
          const playerName = getCredentialString(credentials?.playerName);
          const clubKey = normalizeNameLookupKey(clubName ?? "");
          const playerKey = normalizeNameLookupKey(playerName ?? "");

          if (!clubName || !playerName || !clubKey || !playerKey) {
            return null;
          }

          try {
            const rateLimit = areRateLimitsDisabled()
              ? null
              : await checkRateLimit(request, "auth:quick_access", {
                  applyHighRiskBucket: false,
                  identity: `${clubKey}:${playerKey}`,
                  limit: QUICK_ACCESS_MAX_ATTEMPTS,
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
                  id: `${clubKey}:${playerKey}`,
                  type: "quick_access_profile",
                },
              });
              return null;
            }

            const match = await findQuickAccessProfile({
              clubName,
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
                  id: `${clubKey}:${playerKey}`,
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
                clubId: match.club.id,
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
              quickAccessClubId: match.club.id,
              quickAccessCommunityId: match.club.id,
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
                id: `${clubKey}:${playerKey}`,
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
          const rateLimit = areRateLimitsDisabled()
            ? null
            : await checkRateLimit(request, "auth:signin", {
                applyHighRiskBucket: false,
                identity: normalizedEmail,
                limit: SIGN_IN_MAX_ATTEMPTS,
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
    async jwt({ token, user, trigger, session }) {
      if (user) {
        if (typeof user.id === "string") {
          token.id = user.id;
        }
        if (typeof user.name === "string") {
          token.name = user.name;
        }
        token.email = typeof user.email === "string" ? user.email : null;
        token.isQuickAccess = !!user.isQuickAccess;
        token.quickAccessClubId =
          typeof user.quickAccessClubId === "string"
            ? user.quickAccessClubId
            : typeof user.quickAccessCommunityId === "string"
              ? user.quickAccessCommunityId
            : null;
        token.quickAccessCommunityId = token.quickAccessClubId;
        token.isAdmin = token.isQuickAccess ? false : !!user.isAdmin;
      } else if (trigger === "update" && typeof session?.name === "string") {
        token.name = session.name;
      } else if (typeof token.email === "string") {
        token.isAdmin = token.isQuickAccess ? false : isGlobalAdminEmail(token.email);
      }
      if (typeof token.isAdmin !== "boolean") token.isAdmin = false;
      if (typeof token.isQuickAccess !== "boolean") token.isQuickAccess = false;
      if (token.isQuickAccess && typeof token.quickAccessClubId !== "string") {
        token.quickAccessClubId =
          typeof token.quickAccessCommunityId === "string"
            ? token.quickAccessCommunityId
            : null;
      }
      token.quickAccessCommunityId = token.quickAccessClubId ?? null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name ?? "";
        session.user.email =
          typeof token.email === "string" ? token.email : "";
        session.user.isAdmin = !!token.isAdmin;
        session.user.isQuickAccess = !!token.isQuickAccess;
        session.user.quickAccessClubId =
          typeof token.quickAccessClubId === "string"
            ? token.quickAccessClubId
            : null;
        session.user.quickAccessCommunityId = session.user.quickAccessClubId;
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
