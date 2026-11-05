import NextAuth, { type NextAuthConfig, type User } from "next-auth";
import { isGlobalClubViewerEmail } from "@/lib/globalClubViewer";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail, normalizeAuthEmail } from "@/lib/globalAdmin";
import { areRateLimitsDisabled, checkRateLimit } from "@/lib/rateLimit";
import { getSessionAccountId, normalizeNameLookupKey } from "@/lib/quickAccess";
import { hasAccountPassword } from "@/lib/accountPassword";
import { getSafeCallbackUrl, withCallbackUrl } from "@/lib/authCallback";
import { isGoogleEnrollmentOpen, isGoogleSignInConfigured } from "@/lib/googleAuthConfig";
import { clearGoogleCompletion, consumeGoogleIntent, readGoogleCompletion, writeGoogleCompletion } from "@/lib/googleAuthCookies";
import { checkGooglePasswordRateLimit, connectGoogleAccount, createGoogleAccount, findGoogleAccount, getVerifiedGoogleIdentity, googleAccountSelect, isPasswordOnlyEmail } from "@/lib/googleAccounts";
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
    where: { clubId: club.id, archivedAt: null, retiredByAdmissionEventId: null, ownerUserId: null },
    include: {
      player: {
        select: { id: true, name: true, isActive: true },
      },
    },
  });
  const matchingPlayers = members
    .map((member) => member.player)
    .filter(
      (user) =>
        user.isActive &&
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

const googleProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  gender: z.enum(["MALE", "FEMALE"]),
});

const authConfig = {
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
                userId: null,
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
              id: `guest:${match.user.id}`,
              guestPlayerId: match.user.id,
              email: null,
              name: match.user.name,
              isAdmin: false,
              canBrowseAllClubs: false,
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

          if (!user || !hasAccountPassword(user.passwordHash) || !user.isActive) {
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
            sessionVersion: user.sessionVersion,
            email: resolvedEmail,
            name: user.name,
            isAdmin,
            canBrowseAllClubs: isGlobalClubViewerEmail(resolvedEmail),
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
    ...(isGoogleSignInConfigured() ? [
      Google({ checks: ["pkce", "state", "nonce"] }),
      Credentials({
        id: "google-complete",
        credentials: { name: {}, gender: {}, password: {} },
        async authorize(credentials, request) {
          if (!isGoogleEnrollmentOpen()) return null;
          const pending = await readGoogleCompletion(request);
          if (!pending) return null;

          let account;
          if (pending.link) {
            const password = getCredentialString(credentials.password);
            if (!password || !(await checkGooglePasswordRateLimit(request, pending.link.accountId)).allowed) return null;
            account = await connectGoogleAccount(pending, pending.link, password);
          } else {
            const profile = googleProfileSchema.safeParse(credentials);
            if (!profile.success) return null;
            account = await createGoogleAccount(pending, profile.data);
          }
          if (!account) return null;
          await clearGoogleCompletion(request);

          logAuditEvent({
            action: pending.link ? "auth.google_connect" : "auth.google_sign_up",
            actor: { userId: account.id },
            outcome: "success",
            request,
            target: { id: account.id, type: "account" },
          });
          return {
            id: account.id,
            name: account.name,
            email: account.email,
            sessionVersion: account.sessionVersion,
            isAdmin: false,
            googleSubject: pending.subject,
          };
        },
      }),
    ] : []),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.identityVersion = 2;
        token.sessionVersion = user.sessionVersion;
        token.id = user.id ?? "";
        token.name = user.name;
        token.email = user.email;
        token.googleSubject = user.googleSubject;
        token.isQuickAccess = !!user.isQuickAccess;
        token.guestPlayerId = user.guestPlayerId ?? null;
        token.quickAccessClubId = user.quickAccessClubId ?? null;
        token.quickAccessCommunityId = token.quickAccessClubId;
      }
      // Pre-separation tokens must never authenticate a historical Player as an account.
      if (token.identityVersion !== 2) return null;
      if (token.isQuickAccess) {
        if (typeof token.guestPlayerId !== "string" || typeof token.quickAccessClubId !== "string") return null;
        const guest = await prisma.clubMember.findUnique({
          where: { clubId_playerId: { clubId: token.quickAccessClubId, playerId: token.guestPlayerId } },
          include: { player: { select: { isActive: true } } },
        });
        if (!guest || guest.archivedAt || guest.retiredByAdmissionEventId || guest.ownerUserId !== null || !guest.player.isActive) return null;
        token.isAdmin = false;
        token.canBrowseAllClubs = false;
      } else {
        if (typeof token.id !== "string") return null;
        const account = await prisma.user.findUnique({ where: { id: token.id } });
        if (!account?.isActive || token.sessionVersion !== account.sessionVersion) return null;
        if (token.googleSubject) {
          if (!isGoogleSignInConfigured() || isPasswordOnlyEmail(account.email)) return null;
          const identity = await prisma.googleIdentity.findUnique({ where: { userId: account.id }, select: { subject: true } });
          if (identity?.subject !== token.googleSubject) return null;
        } else if (!hasAccountPassword(account.passwordHash)) {
          return null;
        }
        token.email = account.email;
        token.name = account.name;
        token.isAdmin = isGlobalAdminEmail(account.email);
        token.canBrowseAllClubs = isGlobalClubViewerEmail(account.email);
        token.guestPlayerId = null;
        token.quickAccessClubId = null;
        if (trigger === "update" && typeof session?.name === "string") token.name = account.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.userId = !token.isQuickAccess && typeof token.id === "string" ? token.id : null;
        session.user.guestPlayerId = typeof token.guestPlayerId === "string" ? token.guestPlayerId : null;
        session.user.identityVersion = typeof token.identityVersion === "number" ? token.identityVersion : undefined;
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name ?? "";
        session.user.email =
          typeof token.email === "string" ? token.email : "";
        session.user.isAdmin = !!token.isAdmin;
        session.user.canBrowseAllClubs = !token.isQuickAccess && !!token.canBrowseAllClubs;
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
    error: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth((request) => {
  if (!request || !request.nextUrl.pathname.endsWith("/callback/google")) return authConfig;

  // Auth.js verifies Google and its OAuth checks before signIn. Carry the
  // resolved local identity to jwt only within this callback request.
  let localUser: User | undefined;
  return {
    ...authConfig,
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return false;

        const intent = await consumeGoogleIntent(request);
        if (!intent) return "/signin?google=failed";

        const identity = getVerifiedGoogleIdentity(account, profile);
        if (intent.link) {
          const userId = getSessionAccountId(await auth());
          const linked = identity && isGoogleEnrollmentOpen() && userId === intent.link.accountId
            && await connectGoogleAccount(identity, intent.link);
          if (linked) {
            logAuditEvent({
              action: "auth.google_connect",
              actor: { userId },
              outcome: "success",
              request,
              target: { id: userId, type: "account" },
            });
          }
          return linked ? "/settings?google=connected" : "/settings?google=failed";
        }

        const callbackUrl = getSafeCallbackUrl(intent.callbackUrl);
        const signInError = (reason: string) => withCallbackUrl(`/signin?google=${reason}`, callbackUrl);
        if (!identity) return signInError("failed");
        if (isPasswordOnlyEmail(identity.email)) return signInError("password-only");

        const existing = await findGoogleAccount(identity.subject);
        if (existing) {
          if (!existing.isActive || isPasswordOnlyEmail(existing.email)) return signInError("failed");
          localUser = {
            id: existing.id,
            name: existing.name,
            email: existing.email,
            sessionVersion: existing.sessionVersion,
            isAdmin: false,
            googleSubject: identity.subject,
          };
          return true;
        }

        if (!isGoogleEnrollmentOpen()) return signInError("paused");
        const passwordAccount = await prisma.user.findUnique({ where: { email: identity.email }, select: googleAccountSelect });
        if (passwordAccount && (!passwordAccount.isActive || passwordAccount.googleIdentity || !hasAccountPassword(passwordAccount.passwordHash))) {
          return signInError("failed");
        }
        const link = passwordAccount ? { accountId: passwordAccount.id, sessionVersion: passwordAccount.sessionVersion } : undefined;
        await writeGoogleCompletion(request, identity, callbackUrl, link);
        return "/complete-google-profile";
      },
      jwt(args) {
        if (args.account?.provider !== "google") return authConfig.callbacks.jwt(args);
        if (!localUser) return null;
        // Keep the Auth.js token's subject and picture independent of the provider.
        return authConfig.callbacks.jwt({
          ...args,
          user: localUser,
          token: { ...args.token, sub: localUser.id, picture: undefined },
        });
      },
    },
  };
});
