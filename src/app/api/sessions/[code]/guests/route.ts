import { isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { assertScopedSessionMutation } from "../players/collaborationPermissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { calculateNoCatchUpMatchmakingCredit } from "@/lib/matchmaking/matchmakingCredit";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership, isAccountSessionPlayer } from "@/lib/sessionCollab";
import {
  getAcceptedInterclubClubIds,
  isInterclubSession,
} from "@/lib/sessionCollabFormat";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { tryRebuildAutomaticQueuedMatchForSessionId } from "../queue-match/shared";
import {
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";

const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:guests:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      initialElo,
      gender,
      partnerPreference,
      mixedSideOverride,
      pool,
      representingClubId,
      profileClubId,
    } =
      body as {
      name?: unknown;
      initialElo?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      pool?: unknown;
      representingClubId?: unknown;
      profileClubId?: unknown;
    };
    if (typeof name !== "string" || name.trim().length < 2) {
      return sportingJson({ error: "Guest name must be at least 2 characters" }, { status: 400 });
    }

    let guestElo = 1000;
    if (typeof initialElo === "number") {
      if (!Number.isInteger(initialElo) || initialElo < 0 || initialElo > 5000) {
        return sportingJson({ error: "Invalid guest rating" }, { status: 400 });
      }
      guestElo = initialElo;
    }

    const normalizedGender =
      isValidPlayerGender(gender)
        ? (gender as PlayerGender)
        : PlayerGender.MALE;
    const normalizedMixedState = resolveMixedSideState({
      gender: normalizedGender,
      mixedSideOverride:
        isValidMixedSide(mixedSideOverride) || mixedSideOverride === null
          ? mixedSideOverride
          : undefined,
      partnerPreference: isValidPartnerPreference(partnerPreference)
        ? partnerPreference
        : undefined,
    });

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:guests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        collabFormat: true,
        collaborationVersion: true,
        status: true,
        mode: true,
        poolsEnabled: true,
        sessionClubs: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:guests");
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return sportingJson(
        { error: "Tournament already ended" },
        { status: 400 }
      );
    }
    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(normalizedGender)
    ) {
      return sportingJson(
        { error: `${mixedModeLabel} requires guest gender (MALE/FEMALE)` },
        { status: 400 }
      );
    }

    const acceptedSessionClubIds = getAcceptedInterclubClubIds(sessionData);
    const hasClubContext = acceptedSessionClubIds.length > 0;
    let canManage = !!session.user.isAdmin;
    if (hasClubContext) {
      const membership = await getSessionOperatorMembership(prisma, {
        session: sessionData,
        userId: session.user.id,
        acceptedOnly: true,
      });
      canManage = canManage || !!membership;
    } else if (!canManage) {
      canManage =
        canManage ||
        (await isAccountSessionPlayer(prisma, sessionData.id, session.user.id));
    }

    if (!canManage) {
      return sportingJson({ error: "Only admins or staff can add guests" }, { status: 403 });
    }

    const acceptedInterclubClubIds = getAcceptedInterclubClubIds(sessionData);
    let normalizedRepresentingClubId: string | null = null;

    if (isInterclubSession(sessionData)) {
      if (
        typeof representingClubId !== "string" ||
        !acceptedInterclubClubIds.includes(representingClubId)
      ) {
        return sportingJson(
          {
            error:
              "Guests in club vs club tournaments must represent one club",
          },
          { status: 400 }
        );
      }

      normalizedRepresentingClubId = representingClubId;
    }

    const guestClubId = isUpgradedCollaboration(sessionData)
      ? normalizedRepresentingClubId ?? (typeof profileClubId === "string" && profileClubId ? profileClubId : typeof representingClubId === "string" && representingClubId ? representingClubId : null)
      : null;
    if (isUpgradedCollaboration(sessionData) && (!guestClubId || !acceptedSessionClubIds.includes(guestClubId))) {
      return sportingJson({ error: "Choose which club is adding this guest" }, { status: 400 });
    }

    if (guestClubId) normalizedRepresentingClubId = guestClubId;

    const guestName = name.trim();
    const targetPool =
      sessionData.poolsEnabled && isValidSessionPool(pool)
        ? pool
        : sessionData.poolsEnabled
          ? SessionPool.B
          : SessionPool.A;
    const activePlayers =
      sessionData.status === SessionStatus.ACTIVE
        ? await prisma.sessionPlayer.findMany({
            where: {
              sessionId: sessionData.id,
              isPaused: false,
              ...(sessionData.poolsEnabled ? { pool: targetPool } : {}),
            },
            select: {
              matchesPlayed: true,
              matchmakingMatchesCredit: true,
            },
          })
        : [];
    const matchmakingMatchesCredit =
      sessionData.status === SessionStatus.ACTIVE
        ? calculateNoCatchUpMatchmakingCredit({
            player: { matchesPlayed: 0, matchmakingMatchesCredit: 0 },
            activePlayers,
          })
        : 0;
    const joinedAt = new Date();
    const arrivalPriorityAt =
      sessionData.status === SessionStatus.ACTIVE ? joinedAt : null;

    const createdGuest = await admissionTransaction(prisma, async (tx) => {
      await assertScopedSessionMutation(tx, { session: sessionData, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, clubId: guestClubId, allowContextlessParticipant: true });
      const user = await tx.player.create({
        data: {
          name: guestName,
          ownerUserId: null,
          elo: guestElo,
          gender: normalizedGender,
          partnerPreference: normalizedMixedState.partnerPreference,
          mixedSideOverride: normalizedMixedState.mixedSideOverride,
        },
        select: {
          id: true,
          name: true,
          elo: true,
          gender: true,
          partnerPreference: true,
          mixedSideOverride: true,
        },
      });

      await tx.sessionPlayer.create({
        data: {
          sessionId: sessionData.id,
          playerId: user.id,
          isGuest: true,
          representingClubId: normalizedRepresentingClubId,
          gender: user.gender,
          partnerPreference: user.partnerPreference,
          mixedSideOverride: user.mixedSideOverride,
          pool: targetPool,
          sessionPoints: 0,
          matchmakingMatchesCredit,
          joinedAt,
          ladderEntryAt: joinedAt,
          availableSince: joinedAt,
          arrivalPriorityAt,
        },
      });

      return user;
    });
    const queuedMatch =
      sessionData.status === SessionStatus.ACTIVE
        ? await tryRebuildAutomaticQueuedMatchForSessionId(sessionData.id)
        : undefined;

    return sportingJson({
      id: createdGuest.id,
      name: createdGuest.name,
      elo: createdGuest.elo,
      isGuest: true,
      gender: createdGuest.gender,
      partnerPreference: createdGuest.partnerPreference,
      mixedSideOverride: createdGuest.mixedSideOverride,
      representingClubId: normalizedRepresentingClubId,
      profileClubId: null,
      pool: targetPool,
      ladderEntryAt: joinedAt.toISOString(),
      queuedMatch,
    });
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Create guest error", error);
    return safeErrorResponse();
  }
}
