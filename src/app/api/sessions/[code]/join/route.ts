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
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      userId: targetUserId,
      gender: overrideGender,
      partnerPreference: overridePreference,
      mixedSideOverride: overrideMixedSideOverride,
      pool: overridePool,
    } =
      body as {
        userId?: unknown;
        gender?: unknown;
        partnerPreference?: unknown;
        mixedSideOverride?: unknown;
        pool?: unknown;
      };

    // Determine who is joining
    let userIdToJoin = session.user.id;

    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: { players: true },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }

    let requesterCommunityRole: string | null = null;
    if (sessionData.communityId) {
      const requesterMembership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      requesterCommunityRole = requesterMembership?.role ?? null;
      if (!requesterCommunityRole && !session.user.isAdmin) {
        return NextResponse.json({ error: "Not a member of this community" }, { status: 403 });
      }
    }

    // If admin is trying to add someone else
    if (typeof targetUserId === "string" && targetUserId !== session.user.id) {
      const isCommunityAdmin = requesterCommunityRole === "ADMIN";
      if (!session.user.isAdmin && !isCommunityAdmin) {
        return NextResponse.json({ error: "Only community admins can add other players" }, { status: 403 });
      }
      userIdToJoin = targetUserId;
    }

    if (sessionData.communityId) {
      const targetMembership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: userIdToJoin,
          },
        },
      });
      if (!targetMembership) {
        return NextResponse.json({ error: "Target player is not a member of this community" }, { status: 400 });
      }
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

    const updatedSession = await prisma.session.update({
      where: { id: sessionData.id },
      data: {
        players: {
          create: {
            userId: userIdToJoin,
            isGuest: false,
            gender: sessionGender,
            partnerPreference: resolvedMixedState.partnerPreference,
            mixedSideOverride: resolvedMixedState.mixedSideOverride,
            pool:
              sessionData.poolsEnabled && isValidSessionPool(overridePool)
                ? overridePool
                : SessionPool.A,
            sessionPoints: 0,
            matchmakingMatchesCredit,
            joinedAt: new Date(),
            ladderEntryAt: new Date(),
            availableSince: new Date(),
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

    const players =
      updatedSession.communityId && updatedSession.players.length > 0
        ? withCommunityElo(
            updatedSession.players,
            await getCommunityEloByUserId(
              updatedSession.communityId,
              updatedSession.players.map((p) => p.userId)
            )
          )
        : updatedSession.players;

    return NextResponse.json({ ...updatedSession, players });
  } catch (error) {
    console.error("Join session error:", error);
    return NextResponse.json({ error: "Failed to join session" }, { status: 500 });
  }
}
