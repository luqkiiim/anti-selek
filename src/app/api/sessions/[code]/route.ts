import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { MatchStatus } from "@/types/enums";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { tryRebuildQueuedMatchForSessionId } from "./queue-match/shared";

export const dynamic = "force-dynamic";

interface UpdateSessionSettingsRequest {
  autoQueueEnabled?: unknown;
}

async function getCommunityRole(
  communityId: string | null | undefined,
  userId: string
) {
  if (!communityId) {
    return null;
  }

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });

  return membership?.role ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: {
      courts: {
        include: {
          currentMatch: {
            select: {
              id: true,
              status: true,
              team1Score: true,
              team2Score: true,
              completedAt: true,
              scoreSubmittedByUserId: true,
              team1User1: { select: { id: true, name: true } },
              team1User2: { select: { id: true, name: true } },
              team2User1: { select: { id: true, name: true } },
              team2User2: { select: { id: true, name: true } },
            },
          },
        },
      },
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
        orderBy: { sessionPoints: "desc" },
      },
      matches: {
        where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] } },
        select: {
          id: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1Score: true,
          team2Score: true,
          winnerTeam: true,
          status: true,
          completedAt: true,
        },
      },
      queuedMatch: true,
    },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const communityRole = await getCommunityRole(
    sessionData.communityId,
    session.user.id
  );

  const isSessionPlayer = sessionData.players.some((p) => p.userId === session.user.id);
  const canView = session.user.isAdmin || !!communityRole || isSessionPlayer;
  if (!canView) {
    return NextResponse.json({ error: "Not authorized for this session" }, { status: 403 });
  }

  const players =
    sessionData.communityId && sessionData.players.length > 0
      ? withCommunityElo(
          sessionData.players,
          await getCommunityEloByUserId(
            sessionData.communityId,
            sessionData.players.map((p) => p.userId)
          )
        )
      : sessionData.players;

  const queuedMatch = sessionData.queuedMatch
    ? (() => {
        const playerById = new Map(
          players.map((player) => [player.userId, player.user])
        );
        const [team1User1Id, team1User2Id, team2User1Id, team2User2Id] =
          getQueuedMatchUserIds(sessionData.queuedMatch);
        const team1User1 = playerById.get(team1User1Id);
        const team1User2 = playerById.get(team1User2Id);
        const team2User1 = playerById.get(team2User1Id);
        const team2User2 = playerById.get(team2User2Id);

        if (!team1User1 || !team1User2 || !team2User1 || !team2User2) {
          return null;
        }

        return {
          id: sessionData.queuedMatch.id,
          createdAt: sessionData.queuedMatch.createdAt,
          targetPool: sessionData.queuedMatch.targetPool,
          team1User1,
          team1User2,
          team2User1,
          team2User2,
        };
      })()
    : null;

  return NextResponse.json({
    ...sessionData,
    players,
    queuedMatch,
    viewerCommunityRole: communityRole,
    viewerCanManage: session.user.isAdmin || communityRole === "ADMIN",
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body =
      (await request.json().catch(() => null)) as UpdateSessionSettingsRequest | null;
    if (!body || typeof body.autoQueueEnabled !== "boolean") {
      return NextResponse.json(
        { error: "autoQueueEnabled must be true or false" },
        { status: 400 }
      );
    }

    const { code } = await params;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
      },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const communityRole = await getCommunityRole(
      sessionData.communityId,
      session.user.id
    );
    const canManage = session.user.isAdmin || communityRole === "ADMIN";
    if (!canManage) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!body.autoQueueEnabled) {
      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionData.id },
          data: { autoQueueEnabled: false },
        }),
        prisma.queuedMatch.deleteMany({
          where: { sessionId: sessionData.id },
        }),
      ]);

      return NextResponse.json({
        autoQueueEnabled: false,
        queuedMatch: null,
      });
    }

    await prisma.session.update({
      where: { id: sessionData.id },
      data: { autoQueueEnabled: true },
    });

    return NextResponse.json({
      autoQueueEnabled: true,
      queuedMatch: await tryRebuildQueuedMatchForSessionId(sessionData.id),
    });
  } catch (error) {
    console.error("Update session settings error:", error);
    return NextResponse.json(
      { error: "Failed to update session settings" },
      { status: 500 }
    );
  }
}
