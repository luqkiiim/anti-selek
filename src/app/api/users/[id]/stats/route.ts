import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { buildProfileCommunityRankWindow } from "@/lib/profileCommunityRank";
import { buildPlayerProfileDerivedData } from "@/lib/profileStats";
import { canQuickAccessCommunity, isQuickAccessSession } from "@/lib/quickAccess";
import { CommunityPlayerStatus, MatchStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getUserStatsRoute(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:users:id:stats");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
  const url = new URL(request.url);
  const communityId = url.searchParams.get("communityId");

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      avatarKey: true,
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    return invalidTargetResponse(request, "api:users:id:stats");
  }

  let effectiveElo = user.elo;
  let context:
    | {
        communityId: string;
        viewerCanManageCommunity: boolean;
        rankContext: {
          leaderboardSize: number;
          currentRank: number | null;
          previousRank: number | null;
          rankDelta: number | null;
        };
      }
    | null = null;
  let viewerCanManageCommunity = false;
  let leaderboardMembers: Array<{
    userId: string;
    elo: number;
    user: {
      name: string;
    };
  }> = [];

  if (communityId) {
    if (!canQuickAccessCommunity(session, communityId)) {
      return invalidTargetResponse(request, "api:users:id:stats");
    }

    const [requesterMembership, targetMembership] = await Promise.all([
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId,
            userId: id,
          },
        },
        select: {
          elo: true,
          status: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (!requesterMembership) {
      return invalidTargetResponse(request, "api:users:id:stats");
    }

    if (!targetMembership) {
      return invalidTargetResponse(request, "api:users:id:stats");
    }

    viewerCanManageCommunity =
      !isQuickAccessSession(session) &&
      (requesterMembership.role === "ADMIN" || !!session.user.isAdmin);
    effectiveElo = targetMembership.elo;

    leaderboardMembers = await prisma.communityMember.findMany({
      where: {
        communityId,
        status: {
          not: CommunityPlayerStatus.OCCASIONAL,
        },
      },
      select: {
        userId: true,
        elo: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.COMPLETED,
      session: communityId
        ? { communityId, isTest: false }
        : { isTest: false },
      OR: [
        { team1User1Id: id },
        { team1User2Id: id },
        { team2User1Id: id },
        { team2User2Id: id },
      ],
    },
    orderBy: { completedAt: "desc" },
    include: {
      team1User1: { select: { id: true, name: true, avatarKey: true } },
      team1User2: { select: { id: true, name: true, avatarKey: true } },
      team2User1: { select: { id: true, name: true, avatarKey: true } },
      team2User2: { select: { id: true, name: true, avatarKey: true } },
      session: {
        select: {
          id: true,
          code: true,
          name: true,
          players: {
            select: {
              userId: true,
              sessionPoints: true,
              user: { select: { id: true, name: true, avatarKey: true } },
            },
          },
          matches: {
            where: { status: MatchStatus.COMPLETED },
            select: {
              id: true,
              team1User1Id: true,
              team1User2Id: true,
              team2User1Id: true,
              team2User2Id: true,
              team1Score: true,
              team2Score: true,
              winnerTeam: true,
            },
          },
        },
      },
    },
  });
  const profileData = buildPlayerProfileDerivedData(
    id,
    matches.map((match) => ({
      ...match,
      team1User1: serializeAvatarEntity(match.team1User1),
      team1User2: serializeAvatarEntity(match.team1User2),
      team2User1: serializeAvatarEntity(match.team2User1),
      team2User2: serializeAvatarEntity(match.team2User2),
      session: {
        ...match.session,
        players: match.session.players.map((player) => ({
          ...player,
          user: serializeAvatarEntity(player.user),
        })),
      },
    }))
  );

  if (communityId) {
    const recentSessionIds = profileData.recentSessions.map((session) => session.id);
    const rankWindowMatches =
      recentSessionIds.length > 0
        ? await prisma.match.findMany({
            where: {
              status: MatchStatus.COMPLETED,
              sessionId: {
                in: recentSessionIds,
              },
              session: {
                communityId,
                isTest: false,
              },
            },
            select: {
              team1User1Id: true,
              team1User2Id: true,
              team2User1Id: true,
              team2User2Id: true,
              team1EloChange: true,
              team2EloChange: true,
            },
          })
        : [];

    context = {
      communityId,
      viewerCanManageCommunity,
      rankContext: buildProfileCommunityRankWindow(
        id,
        leaderboardMembers.map((member) => ({
          userId: member.userId,
          name: member.user.name,
          elo: member.elo,
        })),
        rankWindowMatches
      ),
    };
  }

  return NextResponse.json({
    user: {
      ...serializeAvatarEntity(user),
      elo: effectiveElo,
    },
    context,
    ...profileData,
  });
}

export async function GET(...args: Parameters<typeof getUserStatsRoute>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:users:id:stats:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getUserStatsRoute(...args);
  } catch (error) {
    logError("Load user stats error", error);
    return safeErrorResponse();
  }
}
