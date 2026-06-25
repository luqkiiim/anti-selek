import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { calculateNoCatchUpMatchmakingCredit } from "@/lib/matchmaking/matchmakingCredit";
import {
  isValidMixedSide,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { prisma } from "@/lib/prisma";
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:join");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => ({}));
    const {
      userId: targetUserId,
      gender: overrideGender,
      partnerPreference: overridePreference,
      mixedSideOverride: overrideMixedSideOverride,
      pool: overridePool,
      representingClubId,
    } =
      body as {
        userId?: unknown;
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
      return NextResponse.json(
        { error: "Invalid representing club" },
        { status: 400 }
      );
    }

    // Determine who is joining
    let userIdToJoin = session.user.id;

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
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }

    const requesterMembership = await getSessionMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    const requesterOperatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    if (sessionData.clubId) {
      if (!requesterMembership && !session.user.isAdmin) {
        return NextResponse.json({ error: "Not a member of this club" }, { status: 403 });
      }
    }

    // If admin is trying to add someone else
    if (typeof targetUserId === "string" && targetUserId !== session.user.id) {
      if (!session.user.isAdmin && !requesterOperatorMembership) {
        return NextResponse.json({ error: "Only club admins or staff can add other players" }, { status: 403 });
      }
      userIdToJoin = targetUserId;
    }

    let targetNeedsMoreRest = false;
    if (sessionData.clubId) {
      const targetMembership = await getSessionMembership(prisma, {
        session: sessionData,
        userId: userIdToJoin,
        acceptedOnly: true,
      });
      if (!targetMembership) {
        return NextResponse.json({ error: "Target player is not a member of this club" }, { status: 400 });
      }
      targetNeedsMoreRest = targetMembership.needsMoreRest ?? false;
    }

    // Check if already in session
    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId: userIdToJoin,
        },
      },
    });

    if (existing) {
      return NextResponse.json(sessionData);
    }

    const userProfile = await prisma.user.findUnique({
      where: { id: userIdToJoin },
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
    const resolvedMixedState = resolveMixedSideState({
      gender: sessionGender,
      mixedSideOverride:
        isValidMixedSide(overrideMixedSideOverride) ||
        overrideMixedSideOverride === null
          ? overrideMixedSideOverride
          : hasOverrideGender
            ? null
            : userProfile.mixedSideOverride,
      partnerPreference:
        typeof overridePreference === "string"
          ? overridePreference
          : hasOverrideGender
            ? undefined
            : userProfile.partnerPreference,
    });
    const matchmakingMatchesCredit =
      sessionData.status === SessionStatus.ACTIVE
        ? calculateNoCatchUpMatchmakingCredit({
            player: { matchesPlayed: 0, matchmakingMatchesCredit: 0 },
            activePlayers: sessionData.players
              .filter((player) => !player.isPaused)
              .map((player) => ({
                matchesPlayed: player.matchesPlayed,
                matchmakingMatchesCredit: player.matchmakingMatchesCredit,
              })),
          })
        : 0;
    const joinedAt = new Date();
    const arrivalPriorityAt =
      sessionData.status === SessionStatus.ACTIVE ? joinedAt : null;
    let normalizedRepresentingClubId: string | null = null;

    if (isInterclubSession(sessionData)) {
      const acceptedInterclubClubIds = getAcceptedInterclubClubIds(sessionData);
      const clubBadges = await getPlayerClubBadges(
        prisma,
        acceptedInterclubClubIds,
        [userIdToJoin]
      );
      const eligibleClubIds = (clubBadges.get(userIdToJoin) ?? [])
        .map((badge) => badge.id)
        .filter((clubId) => acceptedInterclubClubIds.includes(clubId));
      const uniqueEligibleClubIds = Array.from(new Set(eligibleClubIds));

      if (uniqueEligibleClubIds.length === 0) {
        return NextResponse.json(
          { error: "Player must belong to one of the two clubs" },
          { status: 400 }
        );
      }

      if (typeof representingClubId === "string" && representingClubId !== "") {
        if (!uniqueEligibleClubIds.includes(representingClubId)) {
          return NextResponse.json(
            { error: "Player can only represent a club they belong to" },
            { status: 400 }
          );
        }

        normalizedRepresentingClubId = representingClubId;
      } else if (uniqueEligibleClubIds.length === 1) {
        normalizedRepresentingClubId = uniqueEligibleClubIds[0];
      }
    }

    const updatedSession = await prisma.session.update({
      where: { id: sessionData.id },
      data: {
        players: {
          create: {
            userId: userIdToJoin,
            isGuest: false,
            representingClubId: normalizedRepresentingClubId,
            gender: sessionGender,
            partnerPreference: resolvedMixedState.partnerPreference,
            mixedSideOverride: resolvedMixedState.mixedSideOverride,
            needsMoreRest: targetNeedsMoreRest,
            pool:
              sessionData.poolsEnabled && isValidSessionPool(overridePool)
                ? overridePool
                : SessionPool.A,
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
            user: {
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
    const playerIds = updatedSession.players.map((p) => p.userId);
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

    return NextResponse.json({ ...updatedSession, players, queuedMatch });
  } catch (error) {
    logError("Join session error", error);
    return safeErrorResponse();
  }
}
