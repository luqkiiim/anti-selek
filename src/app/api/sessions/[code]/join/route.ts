import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
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
import { IdentityConflictError, nonretiredPlayer, resolveOwnedSessionPlayer } from "@/lib/playerIdentity";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getAcceptedSessionClubIds,
  getPlayerClubBadges,
  getSessionMembership,
  getSessionOperatorMembership,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import {
  getAcceptedInterclubClubIds,
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
    } =
      body as {
        playerId?: unknown;
        gender?: unknown;
        partnerPreference?: unknown;
        mixedSideOverride?: unknown;
        pool?: unknown;
        representingClubId?: unknown;
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

    const acceptedInterclubClubIds = isInterclubSession(sessionData)
      ? getAcceptedInterclubClubIds(sessionData)
      : [];
    const ownedProfileClubIds = acceptedInterclubClubIds.length > 0
      ? acceptedInterclubClubIds
      : sessionData.clubId
        ? [sessionData.clubId]
        : acceptedSessionClubIds;
    const requestedPlayerId =
      typeof targetPlayerIdInput === "string" && targetPlayerIdInput.length > 0
        ? targetPlayerIdInput
        : null;
    let playerIdToJoin: string;
    let requesterOwnsTarget = false;

    if (requestedPlayerId) {
      const requestedPlayer = await prisma.player.findFirst({
        where: { id: requestedPlayerId, ...nonretiredPlayer },
        select: { ownerUserId: true },
      });
      if (!requestedPlayer) {
        return sportingJson(
          { error: "Player profile is not available for new sessions" },
          { status: 409 }
        );
      }
      requesterOwnsTarget = requestedPlayer.ownerUserId === session.user.id;
      if (!requesterOwnsTarget && !session.user.isAdmin && !requesterOperatorMembership) {
        return sportingJson(
          { error: "Only club admins or staff can add other players" },
          { status: 403 }
        );
      }
      playerIdToJoin = requestedPlayerId;
    } else {
      const ownedPlayer = await resolveOwnedSessionPlayer(prisma, {
        userId: session.user.id,
        clubIds: ownedProfileClubIds,
      });
      if (!ownedPlayer) {
        return sportingJson(
          { error: "Choose a player profile before joining this tournament" },
          { status: 400 }
        );
      }
      playerIdToJoin = ownedPlayer.id;
      requesterOwnsTarget = true;
    }

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

    if (existing) {
      return sportingJson(sessionData);
    }

    const userProfile = await prisma.player.findUnique({
      where: { id: playerIdToJoin },
      select: {
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
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
            : userProfile.mixedSideOverride,
      partnerPreference:
        hasMixedSideOverrideInput
          ? undefined
          : hasPartnerPreferenceInput
            ? overridePreference
            : hasOverrideGender
              ? undefined
              : userProfile.partnerPreference,
    });
    const joinedAt = new Date();
    const arrivalPriorityAt =
      sessionData.status === SessionStatus.ACTIVE ? joinedAt : null;
    let normalizedRepresentingClubId: string | null = null;
    let targetPreferredPool = SessionPool.B;

    if (isInterclubSession(sessionData)) {
      const acceptedInterclubClubIds = getAcceptedInterclubClubIds(sessionData);
      const clubBadges = await getPlayerClubBadges(
        prisma,
        acceptedInterclubClubIds,
        [playerIdToJoin]
      );
      const eligibleClubIds = (clubBadges.get(playerIdToJoin) ?? [])
        .map((badge) => badge.id)
        .filter((clubId) => acceptedInterclubClubIds.includes(clubId));
      const uniqueEligibleClubIds = Array.from(new Set(eligibleClubIds));

      if (uniqueEligibleClubIds.length === 0) {
        return sportingJson(
          { error: "Player must belong to one of the two clubs" },
          { status: 400 }
        );
      }

      if (typeof representingClubId === "string" && representingClubId !== "") {
        if (!uniqueEligibleClubIds.includes(representingClubId)) {
          return sportingJson(
            { error: "Player can only represent a club they belong to" },
            { status: 400 }
          );
        }

        normalizedRepresentingClubId = representingClubId;
      } else if (uniqueEligibleClubIds.length === 1) {
        normalizedRepresentingClubId = uniqueEligibleClubIds[0];
      } else {
        return sportingJson(
          { error: "Choose which club this player represents" },
          { status: 400 }
        );
      }

      const representedClubId = normalizedRepresentingClubId;
      if (!representedClubId) {
        return sportingJson(
          { error: "Choose which club this player represents" },
          { status: 400 }
        );
      }

      const targetMembership = await prisma.clubMember.findUnique({
        where: {
          clubId_playerId: {
            clubId: representedClubId,
            playerId: playerIdToJoin,
          },
          archivedAt: null,
        },
        select: {
          preferredPool: true,
        },
      });
      if (!targetMembership) {
        return sportingJson(
          { error: "Target player is not a member of this club" },
          { status: 400 }
        );
      }
      if (requesterOwnsTarget && !session.user.isAdmin) {
        const representedClubAccess = await prisma.clubAccess.findUnique({
          where: {
            clubId_userId: {
              clubId: representedClubId,
              userId: session.user.id,
            },
          },
          select: { status: true },
        });
        if (representedClubAccess?.status !== "ACTIVE") {
          return sportingJson(
            { error: "You need active access to the club this Player represents" },
            { status: 403 }
          );
        }
      }

      targetPreferredPool =
        targetMembership.preferredPool === SessionPool.A
          ? SessionPool.A
          : SessionPool.B;
    } else if (sessionData.clubId) {
      const targetMembership = await prisma.clubMember.findUnique({
        where: {
          clubId_playerId: {
            clubId: sessionData.clubId,
            playerId: playerIdToJoin,
          },
          archivedAt: null,
        },
        select: { preferredPool: true },
      });
      if (!targetMembership) {
        return sportingJson({ error: "Target player is not a member of this club" }, { status: 400 });
      }
      if (requesterOwnsTarget && !session.user.isAdmin) {
        const hostClubAccess = await prisma.clubAccess.findUnique({
          where: {
            clubId_userId: {
              clubId: sessionData.clubId,
              userId: session.user.id,
            },
          },
          select: { status: true },
        });
        if (hostClubAccess?.status !== "ACTIVE") {
          return sportingJson(
            { error: "You need active access to this club to join with this Player" },
            { status: 403 }
          );
        }
      }
      targetPreferredPool =
        targetMembership.preferredPool === SessionPool.A
          ? SessionPool.A
          : SessionPool.B;
    } else if (acceptedSessionClubIds.length > 0) {
      let targetMembership: { preferredPool: string } | null = null;
      let ownedRosterWithoutAccess = false;
      for (const linkedClubId of acceptedSessionClubIds) {
        const linkedTargetMembership = await prisma.clubMember.findUnique({
          where: {
            clubId_playerId: {
              clubId: linkedClubId,
              playerId: playerIdToJoin,
            },
            archivedAt: null,
          },
          select: { preferredPool: true },
        });
        if (!linkedTargetMembership) continue;

        if (requesterOwnsTarget && !session.user.isAdmin) {
          const linkedClubAccess = await prisma.clubAccess.findUnique({
            where: {
              clubId_userId: {
                clubId: linkedClubId,
                userId: session.user.id,
              },
            },
            select: { status: true },
          });
          if (linkedClubAccess?.status !== "ACTIVE") {
            ownedRosterWithoutAccess = true;
            continue;
          }
        }

        targetMembership = linkedTargetMembership;
        break;
      }

      if (!targetMembership) {
        if (ownedRosterWithoutAccess) {
          return sportingJson(
            { error: "You need active access to the club this Player represents" },
            { status: 403 }
          );
        }
        return sportingJson(
          { error: "Target player is not a member of this club" },
          { status: 400 }
        );
      }
      targetPreferredPool =
        targetMembership.preferredPool === SessionPool.A
          ? SessionPool.A
          : SessionPool.B;
    }

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

    const updatedSession = await prisma.session.update({
      where: { id: sessionData.id },
      data: {
        players: {
          create: {
            playerId: playerIdToJoin,
            isGuest: false,
            representingClubId: normalizedRepresentingClubId,
            gender: sessionGender,
            partnerPreference: resolvedMixedState.partnerPreference,
            mixedSideOverride: resolvedMixedState.mixedSideOverride,
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

    const linkedClubIds = await getAcceptedSessionClubIds(
      prisma,
      updatedSession
    );
    const playerIds = updatedSession.players.map((p) => p.playerId);
    const players =
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
    const queuedMatch =
      sessionData.status === SessionStatus.ACTIVE
        ? await tryRebuildAutomaticQueuedMatchForSessionId(sessionData.id)
        : undefined;

    return sportingJson({ ...updatedSession, players, queuedMatch });
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return sportingJson({ error: error.message }, { status: error.statusCode });
    }
    logError("Join session error", error);
    return safeErrorResponse();
  }
}
