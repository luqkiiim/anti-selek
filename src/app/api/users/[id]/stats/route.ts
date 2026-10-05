import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { clubGuestWhere } from "@/lib/clubGuest";
import { guestRatingFromMatches } from "@/lib/guestRating";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { getClubStatUserResolver } from "@/lib/offlineIdentities";
import { prisma } from "@/lib/prisma";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import { buildProfileClubRankWindow } from "@/lib/profileClubRank";
import { buildMemberProfileData } from "@/lib/memberProfile";
import { buildPlayerProfileDerivedData } from "@/lib/profileStats";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import {
  ClubContractAliasConflictError,
  readAliasedSearchParam,
  withLegacyClubAliases,
} from "@/lib/clubContractAliases";
import { ClubPlayerStatus, MatchStatus, SessionClubStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function getClubScopedSessionWhere(clubId: string) {
  return {
    isTest: false,
    OR: [
      { clubId },
      {
        sessionClubs: {
          some: {
            clubId,
            status: SessionClubStatus.ACCEPTED,
          },
        },
      },
    ],
  };
}

async function getUserStatsRoute(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return sportingJson({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  if (typeof id !== "string" || id.length === 0) {
    return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:users:id:stats");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
  const url = new URL(request.url);
  const clubId = readAliasedSearchParam(
    url.searchParams,
    "clubId",
    "communityId",
    "club identifier",
    {
      canonicalRoute: "/api/users/[id]/stats",
      request,
      surface: "api",
    }
  );

  const user = await prisma.player.findUnique({
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

  let targetMemberStatus: string | null = null;
  let targetMemberId: string | null = null;
  let effectiveElo = user.elo;
  let usesClubRating = false;
  let context:
    | {
        clubId: string;
        viewerCanManageClub: boolean;
        canAddGuestToClub: boolean;
        rankContext: {
          leaderboardSize: number;
          currentRank: number | null;
          previousRank: number | null;
          rankDelta: number | null;
        };
      }
    | null = null;
  let viewerCanManageClub = false;
  let canAddGuestToClub = false;
  let leaderboardMembers: Array<{
    playerId: string;
    elo: number;
    player: {
      name: string;
    };
  }> = [];
  let leaderboardMatchCountByUserId = new Map<string, number>();
  let resolveClubStatUserId = (playerId: string) => playerId;

  if (clubId) {
    if (!canQuickAccessClub(session, clubId)) {
      return invalidTargetResponse(request, "api:users:id:stats");
    }

    const [requesterMembership, targetMembership] = await Promise.all([
      prisma.clubAccess.findUnique({
        where: {
          clubId_userId: {
            clubId,
            userId: session.user.id,
          },
        },
        select: { role: true, status: true },
      }),
      prisma.clubMember.findUnique({
        where: {
          clubId_playerId: {
            clubId,
            playerId: id,
          },
        },
        select: {
          id: true,
          elo: true,
          status: true,
          player: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const quickAccessMembership = isQuickAccessSession(session) && session.user.guestPlayerId
      ? await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId: session.user.guestPlayerId } }, select: { id: true } })
      : null;
    if (requesterMembership?.status !== "ACTIVE" && !quickAccessMembership && !session.user.isAdmin) {
      return invalidTargetResponse(request, "api:users:id:stats");
    }

    if (!targetMembership) {
      const guest = await prisma.sessionPlayer.findFirst({ where: clubGuestWhere(clubId, id), select: { id: true } });
      if (!guest) return invalidTargetResponse(request, "api:users:id:stats");
    }

    viewerCanManageClub =
      !isQuickAccessSession(session) &&
      ((requesterMembership?.status === "ACTIVE" && (requesterMembership.role === "ADMIN" || requesterMembership.role === "OWNER")) || !!session.user.isAdmin);
    canAddGuestToClub = !targetMembership && viewerCanManageClub;
    targetMemberStatus = targetMembership?.status ?? null;
    targetMemberId = targetMembership?.id ?? null;
    usesClubRating = !!targetMembership;
    effectiveElo = targetMembership?.elo ?? user.elo;

    leaderboardMembers = await prisma.clubMember.findMany({
      where: {
        clubId,
        status: {
          not: ClubPlayerStatus.OCCASIONAL,
        },
      },
      select: {
        playerId: true,
        elo: true,
        player: {
          select: {
            name: true,
          },
        },
      },
    });
    resolveClubStatUserId = await getClubStatUserResolver(prisma, {
      clubId,
      memberUserIds: leaderboardMembers.map((member) => member.playerId),
    });

    const leaderboardMatches = await prisma.match.findMany({
      where: {
        status: MatchStatus.COMPLETED,
        session: getClubScopedSessionWhere(clubId),
      },
      select: {
        team1Player1Id: true,
        team1Player2Id: true,
        team2Player1Id: true,
        team2Player2Id: true,
      },
    });
    leaderboardMatchCountByUserId = new Map(
      leaderboardMembers.map((member) => [member.playerId, 0])
    );

    for (const match of leaderboardMatches) {
      const participantIds = new Set(
        [
          match.team1Player1Id,
          match.team1Player2Id,
          match.team2Player1Id,
          match.team2Player2Id,
        ].map(resolveClubStatUserId)
      );

      for (const participantId of participantIds) {
        if (leaderboardMatchCountByUserId.has(participantId)) {
          leaderboardMatchCountByUserId.set(
            participantId,
            (leaderboardMatchCountByUserId.get(participantId) ?? 0) + 1
          );
        }
      }
    }
  }

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.COMPLETED,
      session: clubId
        ? getClubScopedSessionWhere(clubId)
        : { isTest: false },
      OR: [
        { team1Player1Id: id },
        { team1Player2Id: id },
        { team2Player1Id: id },
        { team2Player2Id: id },
      ],
    },
    orderBy: { completedAt: "desc" },
    include: {
      team1Player1: { select: { id: true, name: true, avatarKey: true } },
      team1Player2: { select: { id: true, name: true, avatarKey: true } },
      team2Player1: { select: { id: true, name: true, avatarKey: true } },
      team2Player2: { select: { id: true, name: true, avatarKey: true } },
      session: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          clubId: true,
          isTest: true,
          type: true,
          createdAt: true,
          endedAt: true,
          players: {
            select: {
              playerId: true,
              isGuest: true,
              sessionPoints: true,
              player: { select: { id: true, name: true, avatarKey: true } },
            },
          },
          matches: {
            where: { status: MatchStatus.COMPLETED },
            select: {
              id: true,
              team1Player1Id: true,
              team1Player2Id: true,
              team2Player1Id: true,
              team2Player2Id: true,
              team1Score: true,
              team2Score: true,
              winnerTeam: true,
            },
          },
        },
      },
    },
  });
  if (!usesClubRating) {
    effectiveElo = guestRatingFromMatches(id, effectiveElo, withLegacySportingAliases(matches.filter((match) =>
      match.session.players.some((player) => player.playerId === id && player.isGuest))
    ));
  }
  const profileData = buildPlayerProfileDerivedData(
    id,
    withLegacySportingAliases(matches.map((match) => ({
      ...match,
      team1Player1: serializeAvatarEntity(match.team1Player1),
      team1Player2: serializeAvatarEntity(match.team1Player2),
      team2Player1: serializeAvatarEntity(match.team2Player1),
      team2Player2: serializeAvatarEntity(match.team2Player2),
      session: {
        ...match.session,
        players: match.session.players.map((player) => ({
          ...player,
          player: serializeAvatarEntity(player.player),
        })),
      },
    })))
  );

  if (clubId) {
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
                ...getClubScopedSessionWhere(clubId),
              },
            },
            select: {
              team1Player1Id: true,
              team1Player2Id: true,
              team2Player1Id: true,
              team2Player2Id: true,
              team1EloChange: true,
              team2EloChange: true,
            },
          })
        : [];

    context = withLegacyClubAliases({
      clubId,
      viewerCanManageClub,
      canAddGuestToClub,
      rankContext: buildProfileClubRankWindow(
        id,
        leaderboardMembers.map((member) => ({
          userId: member.playerId,
          name: member.player.name,
          elo: member.elo,
          isLeaderboardEligible:
            (leaderboardMatchCountByUserId.get(member.playerId) ?? 0) > 0,
        })),
        withLegacySportingAliases(rankWindowMatches)
      ),
    });
  }

  const profile = clubId && targetMemberId ? buildMemberProfileData({
    clubId,
    userId: id,
    memberStatus: targetMemberStatus,
    currentCoreMemberIds: leaderboardMembers.map(member => member.playerId),
    matches: withLegacySportingAliases(matches.map(match => ({ ...match,
      team1Player1: serializeAvatarEntity(match.team1Player1),
      team1Player2: serializeAvatarEntity(match.team1Player2),
      team2Player1: serializeAvatarEntity(match.team2Player1),
      team2Player2: serializeAvatarEntity(match.team2Player2),
    }))),
    matchEloAdjustments: withLegacySportingAliases(await prisma.matchEloAdjustment.findMany({ where: { clubId, playerId: id } })),
    manualRatingAdjustments: await prisma.clubRatingAdjustment.findMany({ where: { memberId: targetMemberId } }),
    historyOffset: Number(url.searchParams.get("historyOffset") ?? 0),
    historyLimit: Number(url.searchParams.get("historyLimit") ?? 3),
  }) : undefined;

  return sportingJson({
    player: {
      ...serializeAvatarEntity(user),
      elo: effectiveElo,
    },
    context,
    ...profileData,
    ...(profile ? { profile } : {}),
  });
}

export async function GET(...args: Parameters<typeof getUserStatsRoute>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:users:id:stats:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getUserStatsRoute(...args);
  } catch (error) {
    if (error instanceof ClubContractAliasConflictError) {
      return sportingJson({ error: error.message }, { status: 400 });
    }
    logError("Load user stats error", error);
    return safeErrorResponse();
  }
}
