import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildProfileCommunityRankWindow } from "@/lib/profileCommunityRank";
import { buildPlayerProfileDerivedData } from "@/lib/profileStats";
import { CommunityPlayerStatus, MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const communityId = url.searchParams.get("communityId");

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let effectiveElo = user.elo;
  let context:
    | {
        communityId: string;
        rankContext: {
          leaderboardSize: number;
          currentRank: number | null;
          previousRank: number | null;
          rankDelta: number | null;
        };
      }
    | null = null;
  let leaderboardMembers: Array<{
    userId: string;
    elo: number;
    user: {
      name: string;
    };
  }> = [];

  if (communityId) {
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
      return NextResponse.json({ error: "Not authorized for this community" }, { status: 403 });
    }

    if (!targetMembership) {
      return NextResponse.json({ error: "Player is not in this community" }, { status: 404 });
    }

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
      team1User1: { select: { id: true, name: true } },
      team1User2: { select: { id: true, name: true } },
      team2User1: { select: { id: true, name: true } },
      team2User2: { select: { id: true, name: true } },
      session: { select: { id: true, code: true, name: true } },
    },
  });
  const profileData = buildPlayerProfileDerivedData(id, matches);

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
      ...user,
      elo: effectiveElo,
    },
    context,
    ...profileData,
  });
}
