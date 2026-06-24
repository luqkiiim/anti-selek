import { NextResponse } from "next/server";
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
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      initialElo,
      gender,
      partnerPreference,
      mixedSideOverride,
      pool,
    } =
      body as {
      name?: unknown;
      initialElo?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      pool?: unknown;
    };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Guest name must be at least 2 characters" }, { status: 400 });
    }

    let guestElo = 1000;
    if (typeof initialElo === "number") {
      if (!Number.isInteger(initialElo) || initialElo < 0 || initialElo > 5000) {
        return NextResponse.json({ error: "Invalid guest rating" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:guests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        status: true,
        mode: true,
        poolsEnabled: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:guests");
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }
    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(normalizedGender)
    ) {
      return NextResponse.json(
        { error: `${mixedModeLabel} requires guest gender (MALE/FEMALE)` },
        { status: 400 }
      );
    }

    let canManage = !!session.user.isAdmin;
    if (sessionData.clubId) {
      const membership = await getSessionOperatorMembership(prisma, {
        session: sessionData,
        userId: session.user.id,
        acceptedOnly: true,
      });
      canManage = canManage || !!membership;
    } else if (!canManage) {
      const isSessionPlayer = await prisma.sessionPlayer.findUnique({
        where: {
          sessionId_userId: {
            sessionId: sessionData.id,
            userId: session.user.id,
          },
        },
        select: { id: true },
      });
      canManage = !!isSessionPlayer;
    }

    if (!canManage) {
      return NextResponse.json({ error: "Only admins or staff can add guests" }, { status: 403 });
    }

    const guestName = name.trim();
    const activePlayers =
      sessionData.status === SessionStatus.ACTIVE
        ? await prisma.sessionPlayer.findMany({
            where: {
              sessionId: sessionData.id,
              isPaused: false,
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

    const createdGuest = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: guestName,
          email: null,
          passwordHash: null,
          isClaimed: false,
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
          userId: user.id,
          isGuest: true,
          gender: user.gender,
          partnerPreference: user.partnerPreference,
          mixedSideOverride: user.mixedSideOverride,
          needsMoreRest: false,
          pool:
            sessionData.poolsEnabled && isValidSessionPool(pool)
              ? pool
              : SessionPool.A,
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

    return NextResponse.json({
      id: createdGuest.id,
      name: createdGuest.name,
      elo: createdGuest.elo,
      isGuest: true,
      gender: createdGuest.gender,
      partnerPreference: createdGuest.partnerPreference,
      mixedSideOverride: createdGuest.mixedSideOverride,
      needsMoreRest: false,
      pool:
        sessionData.poolsEnabled && isValidSessionPool(pool)
          ? pool
          : SessionPool.A,
      ladderEntryAt: joinedAt.toISOString(),
      queuedMatch,
    });
  } catch (error) {
    logError("Create guest error", error);
    return safeErrorResponse();
  }
}
