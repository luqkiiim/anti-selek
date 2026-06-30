import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { buildClubPulse } from "@/lib/clubPulse";
import { prisma } from "@/lib/prisma";
import { listSessionsForClub } from "@/app/api/sessions/listSessionsService";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import {
  canQuickAccessClub,
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import { ClubRole } from "@/types/enums";

async function buildCurrentClubPulse({
  clubId,
  viewerId,
  viewerCanAdminClub,
}: {
  clubId: string;
  viewerId: string;
  viewerCanAdminClub: boolean;
}) {
  const [members, completedMatches, sessions] = await Promise.all([
    prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarKey: true,
          },
        },
      },
    }),
    prisma.match.findMany({
      where: {
        status: "COMPLETED",
        session: {
          isTest: false,
          OR: [
            { clubId },
            {
              sessionClubs: {
                some: {
                  clubId,
                  status: "ACCEPTED",
                },
              },
            },
          ],
        },
      },
      select: {
        id: true,
        completedAt: true,
        winnerTeam: true,
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
        team1Score: true,
        team2Score: true,
        team1EloChange: true,
        team2EloChange: true,
        team1User1: { select: { id: true, name: true, avatarKey: true } },
        team1User2: { select: { id: true, name: true, avatarKey: true } },
        team2User1: { select: { id: true, name: true, avatarKey: true } },
        team2User2: { select: { id: true, name: true, avatarKey: true } },
        eloAdjustments: {
          where: { clubId },
          select: {
            userId: true,
            delta: true,
            beforeElo: true,
            afterElo: true,
          },
        },
        session: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            createdAt: true,
            endedAt: true,
          },
        },
      },
    }),
    listSessionsForClub({
      clubId,
      viewerId,
      viewerIsAdmin: viewerCanAdminClub,
    }),
  ]);

  return buildClubPulse({
    members: members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      avatarUrl: serializeAvatarEntity(member.user).avatarUrl,
      elo: member.elo,
    })),
    sessions,
    completedMatches: completedMatches.map((match) => ({
      ...match,
      team1User1: serializeAvatarEntity(match.team1User1),
      team1User2: serializeAvatarEntity(match.team1User2),
      team2User1: serializeAvatarEntity(match.team2User1),
      team2User2: serializeAvatarEntity(match.team2User2),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:clubs:id:news-likes",
      { limit: 60, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:clubs:id:news-likes"
    );

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    if (!canQuickAccessClub(session, id)) {
      return invalidTargetResponse(request, "api:clubs:id:news-likes");
    }

    const body = await request.json().catch(() => null);
    const newsItemId =
      body && typeof body === "object"
        ? (body as { newsItemId?: unknown }).newsItemId
        : null;
    const liked =
      body && typeof body === "object"
        ? (body as { liked?: unknown }).liked
        : null;

    if (
      typeof newsItemId !== "string" ||
      newsItemId.length === 0 ||
      newsItemId.length > 300 ||
      typeof liked !== "boolean"
    ) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const viewerId = session.user.id;
    const [membership, club] = await Promise.all([
      prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: viewerId,
          },
        },
        select: { role: true },
      }),
      prisma.club.findUnique({
        where: { id },
        select: {
          id: true,
          createdById: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      }),
    ]);

    if (!club) {
      return invalidTargetResponse(request, "api:clubs:id:news-likes");
    }

    const viewerIsOwner = club.createdById === viewerId;
    const viewerCanAdminClub =
      !!session.user.isAdmin ||
      viewerIsOwner ||
      membership?.role === ClubRole.ADMIN;

    if (club.isTutorial && club.tutorialOwnerId !== viewerId) {
      return invalidTargetResponse(request, "api:clubs:id:news-likes");
    }

    if (!membership && !session.user.isAdmin && !viewerIsOwner) {
      return invalidTargetResponse(request, "api:clubs:id:news-likes");
    }

    const clubPulse = await buildCurrentClubPulse({
      clubId: id,
      viewerId,
      viewerCanAdminClub,
    });
    const newsItem = clubPulse.sessionNews.find(
      (item) => item.id === newsItemId
    );

    if (!newsItem) {
      return NextResponse.json(
        { error: "News item is no longer available" },
        { status: 400 }
      );
    }

    if (liked) {
      await prisma.clubNewsLike.upsert({
        where: {
          newsItemId_userId: {
            newsItemId,
            userId: viewerId,
          },
        },
        update: {},
        create: {
          clubId: id,
          sessionId: newsItem.session.id,
          newsItemId,
          userId: viewerId,
        },
      });
    } else {
      await prisma.clubNewsLike.deleteMany({
        where: {
          newsItemId,
          userId: viewerId,
        },
      });
    }

    const [likeCount, likedByMe] = await Promise.all([
      prisma.clubNewsLike.count({
        where: {
          clubId: id,
          newsItemId,
        },
      }),
      prisma.clubNewsLike.count({
        where: {
          newsItemId,
          userId: viewerId,
        },
      }),
    ]);

    return NextResponse.json({
      newsItemId,
      likedByMe: likedByMe > 0,
      likeCount,
    });
  } catch (error) {
    logError("Toggle club news like error", error);
    return safeErrorResponse();
  }
}
