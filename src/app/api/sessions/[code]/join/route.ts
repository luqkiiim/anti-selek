import { isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { assertScopedSessionMutation } from "../players/collaborationPermissions";
import { assertSessionProfileContextsUnambiguous } from "@/lib/sessionProfileIdentity";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { resolveSessionProfilePair, assertSessionAccountSeatAvailable, withSessionProfileRatings } from "@/lib/sessionProfileIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { calculateNoCatchUpMatchmakingCredit } from "@/lib/matchmaking/matchmakingCredit";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import {
  getNormalizedSessionPool,
  isValidSessionPool,
} from "@/lib/sessionPools";
import { prisma } from "@/lib/prisma";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getAcceptedSessionClubIds,
  getPlayerClubBadges,
  getSessionMembership,
  getSessionOperatorMembership,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import {
  isInterclubSession,
} from "@/lib/sessionCollabFormat";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:join:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:join");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => ({}));
    const {
      playerId: targetPlayerIdInput,
      gender: overrideGender,
      partnerPreference: overridePreference,
      mixedSideOverride: overrideMixedSideOverride,
      pool: overridePool,
      representingClubId,
      profileClubId,
    } =
      body as {
        playerId?: unknown;
        gender?: unknown;
        partnerPreference?: unknown;
        mixedSideOverride?: unknown;
        pool?: unknown;
        representingClubId?: unknown;
        profileClubId?: unknown;
      };
    if (
      representingClubId !== undefined &&
      representingClubId !== null &&
      typeof representingClubId !== "string"
    ) {
      return sportingJson(
        { error: "Invalid representing club" },
        { status: 400 }
      );
    }

    if (profileClubId != null && typeof profileClubId !== "string") return sportingJson({ error: "Invalid club profile" }, { status: 400 });

    // Determine who is joining
    // Resolve an explicitly owned Player profile below.

    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: { players: true, sessionClubs: true },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:join");
    }
    if (!canQuickAccessClub(session, sessionData.clubId)) {
      return invalidTargetResponse(request, "api:sessions:code:join");
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:join");
    }

    if (sessionData.status === SessionStatus.COMPLETED) {
      return sportingJson(
        { error: "Tournament already ended" },
        { status: 400 }
      );
    }

    const requesterMembership = await getSessionMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    const acceptedSessionClubIds = await getAcceptedSessionClubIds(
      prisma,
      sessionData
    );
    const requesterOperatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    if (sessionData.clubId || acceptedSessionClubIds.length > 0) {
      if (!requesterMembership && !session.user.isAdmin) {
        return sportingJson({ error: "Not a member of this club" }, { status: 403 });
      }
    }

    const requestedPlayerId = typeof targetPlayerIdInput === "string" && targetPlayerIdInput ? targetPlayerIdInput : null;
    const requestedProfileClubId = typeof profileClubId === "string" && profileClubId ? profileClubId : typeof representingClubId === "string" && representingClubId ? representingClubId : null;
    const chosenPair = await resolveSessionProfilePair(prisma, { userId: session.user.id, clubIds: acceptedSessionClubIds, playerId: requestedPlayerId, profileClubId: requestedProfileClubId, isGlobalAdmin: !!session.user.isAdmin });
    const playerIdToJoin = chosenPair.playerId;

    if (overridePool !== undefined && !isValidSessionPool(overridePool)) {
      return sportingJson(
        { error: "Invalid player group" },
        { status: 400 }
      );
    }
    if (
      sessionData.poolsEnabled &&
      isValidSessionPool(overridePool) &&
      !session.user.isAdmin &&
      !requesterOperatorMembership
    ) {
      return sportingJson(
        { error: "Only club admins or staff can override a player group" },
        { status: 403 }
      );
    }

    // Check if already in session
    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_playerId: {
          sessionId: sessionData.id,
          playerId: playerIdToJoin,
        },
      },
    });

    if (existing && existing.profileClubId !== chosenPair.profileClubId) throw new IdentityConflictError("This player already joined with another club profile. Remove the entry before choosing a different profile.");

    const userProfile = await prisma.player.findUnique({
      where: { id: playerIdToJoin },
      select: {
        gender: true,
      },
    });
    if (!userProfile) {
      return invalidTargetResponse(request, "api:sessions:code:join");
    }

    const rawGender =
      isValidPlayerGender(overrideGender)
        ? (overrideGender as PlayerGender)
        : ((userProfile.gender as PlayerGender | undefined) ?? PlayerGender.UNSPECIFIED);
    const sessionGender =
      sessionData.mode === SessionMode.MIXICANO
        ? [PlayerGender.MALE, PlayerGender.FEMALE].includes(rawGender)
          ? rawGender
          : PlayerGender.MALE
        : rawGender;
    const hasOverrideGender =
      isValidPlayerGender(overrideGender);
    const hasMixedSideOverrideInput =
      isValidMixedSide(overrideMixedSideOverride) ||
      overrideMixedSideOverride === null;
    const hasPartnerPreferenceInput =
      isValidPartnerPreference(overridePreference);
    const resolvedMixedState = resolveMixedSideState({
      gender: sessionGender,
      mixedSideOverride:
        hasMixedSideOverrideInput
          ? overrideMixedSideOverride
          : hasPartnerPreferenceInput || hasOverrideGender
            ? null
            : chosenPair.mixedSideOverride,
      partnerPreference:
        hasMixedSideOverrideInput
          ? undefined
          : hasPartnerPreferenceInput
            ? overridePreference
            : hasOverrideGender
              ? undefined
              : undefined,
    });
    const joinedAt = new Date();
    const arrivalPriorityAt =
      sessionData.status === SessionStatus.ACTIVE ? joinedAt : null;
    const normalizedRepresentingClubId = isInterclubSession(sessionData) ? chosenPair.profileClubId : null;
    const targetPreferredPool = chosenPair.preferredPool === SessionPool.A ? SessionPool.A : SessionPool.B;

    const targetPool =
      sessionData.poolsEnabled && isValidSessionPool(overridePool)
        ? overridePool
        : sessionData.poolsEnabled
          ? targetPreferredPool
          : SessionPool.A;
    const matchmakingMatchesCredit =
      sessionData.status === SessionStatus.ACTIVE
        ? calculateNoCatchUpMatchmakingCredit({
            player: { matchesPlayed: 0, matchmakingMatchesCredit: 0 },
            activePlayers: sessionData.players
              .filter(
                (player) =>
                  !player.isPaused &&
                  (!sessionData.poolsEnabled ||
                    getNormalizedSessionPool(player.pool) === targetPool)
              )
              .map((player) => ({
                matchesPlayed: player.matchesPlayed,
                matchmakingMatchesCredit: player.matchmakingMatchesCredit,
              })),
          })
        : 0;

    const updatedSession = await admissionTransaction(prisma, async tx => {
      const freshSession = await tx.session.findUnique({ where: { id: sessionData.id }, select: { status: true } });
      if (!freshSession || freshSession.status === SessionStatus.COMPLETED) throw new IdentityConflictError("Tournament already ended");
      await assertSessionProfileContextsUnambiguous(tx, sessionData);
      const pair = await resolveSessionProfilePair(tx, { userId: session.user.id, clubIds: await getAcceptedSessionClubIds(tx, sessionData), playerId: playerIdToJoin, profileClubId: chosenPair.profileClubId, isGlobalAdmin: !!session.user.isAdmin });
      if (isUpgradedCollaboration(sessionData)) {
        await assertScopedSessionMutation(tx, { session: sessionData, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, clubId: pair.profileClubId });
      }
      await assertSessionAccountSeatAvailable(tx, sessionData.id, pair);
      const freshMixedState = hasMixedSideOverrideInput || hasPartnerPreferenceInput || hasOverrideGender
        ? resolvedMixedState
        : resolveMixedSideState({ gender: sessionGender, mixedSideOverride: pair.mixedSideOverride });
      const existingSeat = await tx.sessionPlayer.findUnique({ where: { sessionId_playerId: { sessionId: sessionData.id, playerId: playerIdToJoin } } });
      if (existingSeat) {
        if (existingSeat.profileClubId !== pair.profileClubId) throw new IdentityConflictError("This player already joined with another club profile. Remove the entry before choosing a different profile.");
        return tx.session.findUniqueOrThrow({ where: { id: sessionData.id }, include: { courts: { include: { currentMatch: true } }, players: { include: { player: true } } } });
      }
      return tx.session.update({
      where: { id: sessionData.id },
      data: {
        players: {
          create: {
            playerId: playerIdToJoin,
            isGuest: false,
            profileClubId: pair.profileClubId,
            participantAccountId: pair.ownerUserId,
            representingClubId: normalizedRepresentingClubId,
            gender: sessionGender,
            partnerPreference: freshMixedState.partnerPreference,
            mixedSideOverride: freshMixedState.mixedSideOverride,
            pool: targetPool,
            sessionPoints: 0,
            matchmakingMatchesCredit,
            joinedAt,
            ladderEntryAt: joinedAt,
            availableSince: joinedAt,
            arrivalPriorityAt,
          },
        },
      },
      include: {
        courts: { include: { currentMatch: true } },
        players: {
          include: {
            player: {
              select: {
                id: true,
                name: true,
                elo: true,
                gender: true,
                partnerPreference: true,
                mixedSideOverride: true,
              },
            },
          },
        },
      },
    });
    });

    const linkedClubIds = await getAcceptedSessionClubIds(
      prisma,
      updatedSession
    );
    const playerIds = updatedSession.players.map((p) => p.playerId);
    const legacyPlayers =
      updatedSession.ratingPolicyVersion === 2 ? updatedSession.players :
      linkedClubIds.length > 1 && updatedSession.players.length > 0
        ? withPlayerClubBadges(
            updatedSession.players,
            await getPlayerClubBadges(prisma, linkedClubIds, playerIds),
            updatedSession.clubId
          )
        : updatedSession.clubId && updatedSession.players.length > 0
          ? withClubElo(
              updatedSession.players,
              await getClubEloByUserId(updatedSession.clubId, playerIds)
            )
          : updatedSession.players;
    const players = await withSessionProfileRatings(prisma, updatedSession, legacyPlayers);
    const queuedMatch =
      sessionData.status === SessionStatus.ACTIVE
        ? await tryRebuildAutomaticQueuedMatchForSessionId(sessionData.id)
        : undefined;

    return sportingJson({ ...updatedSession, players, queuedMatch });
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) {
      return sportingJson({ error: error.message }, { status: error.statusCode });
    }
    logError("Join session error", error);
    return safeErrorResponse();
  }
}
