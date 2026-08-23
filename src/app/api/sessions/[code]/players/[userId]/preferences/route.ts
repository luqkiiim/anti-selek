import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { prisma } from "@/lib/prisma";
import {
  getPlayerClubBadges,
  getSessionOperatorMembership,
} from "@/lib/sessionCollab";
import {
  getAcceptedInterclubClubIds,
  isInterclubSession,
} from "@/lib/sessionCollabFormat";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { PlayerGender, SessionMode, SessionPool, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { hasQueuedMatchUser } from "@/lib/sessionQueue";
import { tryRebuildAutomaticQueuedMatchForSessionId } from "../../../queue-match/shared";

export const dynamic = "force-dynamic";

const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:players:userId:preferences:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:players:userId:preferences");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      gender,
      partnerPreference,
      mixedSideOverride,
      pool,
      needsMoreRest,
      representingClubId,
    } = body as {
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      pool?: unknown;
      needsMoreRest?: unknown;
      representingClubId?: unknown;
    };
    const hasRepresentingClubInput = Object.prototype.hasOwnProperty.call(
      body,
      "representingClubId"
    );

    if (gender !== undefined && !isValidPlayerGender(gender)) {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }
    if (
      partnerPreference !== undefined &&
      !isValidPartnerPreference(partnerPreference)
    ) {
      return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
    }
    if (
      mixedSideOverride !== undefined &&
      mixedSideOverride !== null &&
      !isValidMixedSide(mixedSideOverride)
    ) {
      return NextResponse.json({ error: "Invalid mixed side override" }, { status: 400 });
    }
    if (pool !== undefined && !isValidSessionPool(pool)) {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }
    if (needsMoreRest !== undefined && typeof needsMoreRest !== "boolean") {
      return NextResponse.json({ error: "Invalid more rest value" }, { status: 400 });
    }
    if (
      hasRepresentingClubInput &&
      representingClubId !== null &&
      typeof representingClubId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid representing club" },
        { status: 400 }
      );
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        collabFormat: true,
        mode: true,
        status: true,
        poolsEnabled: true,
        sessionClubs: true,
        queuedMatch: {
          select: {
            id: true,
            createdAt: true,
            isAutomatic: true,
            team1User1Id: true,
            team1User2Id: true,
            team2User1Id: true,
            team2User2Id: true,
          },
        },
        courts: {
          select: {
            currentMatch: {
              select: {
                team1User1Id: true,
                team1User2Id: true,
                team2User1Id: true,
                team2User2Id: true,
              },
            },
          },
        },
        _count: { select: { matches: true } },
      },
    });
    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId:preferences");
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Tournament already completed" },
        { status: 400 }
      );
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });

    if (!session.user.isAdmin && !operatorMembership) {
      return NextResponse.json({ error: "Only admins or staff can update preferences" }, { status: 403 });
    }

    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: {
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        pool: true,
        pendingPool: true,
        representingClubId: true,
        isGuest: true,
      },
    });
    if (!existing) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId:preferences");
    }

    const hasPoolInput = isValidSessionPool(pool);

    const nextGender =
      typeof gender === "string"
        ? (gender as PlayerGender)
        : (existing.gender as PlayerGender | undefined) ?? PlayerGender.UNSPECIFIED;

    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(nextGender)
    ) {
      return NextResponse.json(
        { error: `${mixedModeLabel} requires MALE/FEMALE gender for all players` },
        { status: 400 }
      );
    }
    let nextRepresentingClubId: string | null | undefined;

    if (hasRepresentingClubInput) {
      if (!isInterclubSession(sessionData)) {
        if (representingClubId !== null && representingClubId !== "") {
          return NextResponse.json(
            {
              error:
                "Representing club only applies to club vs club tournaments",
            },
            { status: 400 }
          );
        }

        nextRepresentingClubId = null;
      } else {
        const requestedRepresentingClubId =
          representingClubId === "" || representingClubId === null
            ? null
            : (representingClubId as string);
        const locked =
          sessionData._count.matches > 0 || Boolean(sessionData.queuedMatch);

        if (
          locked &&
          requestedRepresentingClubId !== existing.representingClubId
        ) {
          return NextResponse.json(
            {
              error:
                "Club side assignments are locked after the first club vs club match is created.",
            },
            { status: 409 }
          );
        }

        if (requestedRepresentingClubId === null) {
          nextRepresentingClubId = null;
        } else {
          const acceptedClubIds = getAcceptedInterclubClubIds(sessionData);
          const validClubIds = new Set(acceptedClubIds);

          if (!validClubIds.has(requestedRepresentingClubId)) {
            return NextResponse.json(
              { error: "Player must represent one of the two clubs" },
              { status: 400 }
            );
          }

          if (!existing.isGuest) {
            const clubBadges = await getPlayerClubBadges(
              prisma,
              acceptedClubIds,
              [userId]
            );
            const eligibleClubIds = new Set(
              (clubBadges.get(userId) ?? []).map((badge) => badge.id)
            );

            if (!eligibleClubIds.has(requestedRepresentingClubId)) {
              return NextResponse.json(
                { error: "Player can only represent a club they belong to" },
                { status: 400 }
              );
            }
          }

          nextRepresentingClubId = requestedRepresentingClubId;
        }
      }
    }

    const resolvedMixedState = resolveMixedSideState({
      gender: nextGender,
      mixedSideOverride:
        isValidMixedSide(mixedSideOverride) || mixedSideOverride === null
          ? mixedSideOverride
          : typeof gender === "string"
            ? null
            : existing.mixedSideOverride,
      partnerPreference: isValidPartnerPreference(partnerPreference)
        ? partnerPreference
        : typeof gender === "string"
          ? undefined
          : existing.partnerPreference,
    });

    const mutation = await prisma.$transaction(async (tx) => {
      const [freshSession, freshPlayer] = await Promise.all([
        tx.session.findUnique({
          where: { id: sessionData.id },
          select: {
            status: true,
            poolsEnabled: true,
            queuedMatch: {
              select: {
                id: true,
                createdAt: true,
                isAutomatic: true,
                team1User1Id: true,
                team1User2Id: true,
                team2User1Id: true,
                team2User2Id: true,
              },
            },
            courts: {
              select: {
                currentMatch: {
                  select: {
                    team1User1Id: true,
                    team1User2Id: true,
                    team2User1Id: true,
                    team2User2Id: true,
                  },
                },
              },
            },
          },
        }),
        tx.sessionPlayer.findUnique({
          where: {
            sessionId_userId: {
              sessionId: sessionData.id,
              userId,
            },
          },
          select: { pool: true, pendingPool: true },
        }),
      ]);

      if (!freshSession || !freshPlayer) {
        return { kind: "missing" } as const;
      }
      if (freshSession.status === SessionStatus.COMPLETED) {
        return { kind: "completed" } as const;
      }

      const changesCurrentPool =
        freshSession.poolsEnabled &&
        hasPoolInput &&
        pool !== freshPlayer.pool;
      const changesGroupState =
        freshSession.poolsEnabled &&
        hasPoolInput &&
        (changesCurrentPool || freshPlayer.pendingPool !== null);

      if (changesGroupState) {
        const isPlaying = freshSession.courts.some((court) => {
          const match = court.currentMatch;
          return (
            !!match &&
            [
              match.team1User1Id,
              match.team1User2Id,
              match.team2User1Id,
              match.team2User2Id,
            ].includes(userId)
          );
        });
        if (isPlaying) {
          return { kind: "live-match-conflict" } as const;
        }
        if (
          freshSession.queuedMatch &&
          !freshSession.queuedMatch.isAutomatic &&
          hasQueuedMatchUser(freshSession.queuedMatch, userId)
        ) {
          return { kind: "manual-queue-conflict" } as const;
        }
      }

      const updated = await tx.sessionPlayer.update({
        where: {
          sessionId_userId: {
            sessionId: sessionData.id,
            userId,
          },
        },
        data: {
          gender: typeof gender === "string" ? gender : undefined,
          partnerPreference: resolvedMixedState.partnerPreference,
          mixedSideOverride: resolvedMixedState.mixedSideOverride,
          pool: freshSession.poolsEnabled
            ? hasPoolInput
              ? pool
              : undefined
            : SessionPool.A,
          pendingPool:
            freshSession.poolsEnabled && hasPoolInput ? null : undefined,
          needsMoreRest:
            typeof needsMoreRest === "boolean" ? needsMoreRest : undefined,
          representingClubId: hasRepresentingClubInput
            ? nextRepresentingClubId ?? null
            : undefined,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      let automaticQueueInvalidated = false;
      if (changesCurrentPool && freshSession.queuedMatch?.isAutomatic) {
        const deleted = await tx.queuedMatch.deleteMany({
          where: {
            id: freshSession.queuedMatch.id,
            sessionId: sessionData.id,
            isAutomatic: true,
          },
        });
        automaticQueueInvalidated = deleted.count > 0;
      }

      return {
        kind: "updated",
        updated,
        automaticQueueInvalidated,
      } as const;
    });

    if (mutation.kind === "missing") {
      return invalidTargetResponse(
        request,
        "api:sessions:code:players:userId:preferences"
      );
    }
    if (mutation.kind === "completed") {
      return NextResponse.json(
        { error: "Tournament already completed" },
        { status: 400 }
      );
    }
    if (mutation.kind === "live-match-conflict") {
      return NextResponse.json(
        { error: "Player group cannot be changed during a live match" },
        { status: 409 }
      );
    }
    if (mutation.kind === "manual-queue-conflict") {
      return NextResponse.json(
        { error: "Player group cannot be changed while manually queued" },
        { status: 409 }
      );
    }

    const updated = mutation.updated;
    let queuedMatch: unknown = undefined;
    if (mutation.automaticQueueInvalidated) {
      queuedMatch = await tryRebuildAutomaticQueuedMatchForSessionId(
        sessionData.id
      );
    }

    return NextResponse.json({
      ...updated,
      ...(queuedMatch !== undefined ? { queuedMatch } : {}),
    });
  } catch (error) {
    logError("Update session preference error", error);
    return safeErrorResponse();
  }
}
