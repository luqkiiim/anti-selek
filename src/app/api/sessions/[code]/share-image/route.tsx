import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAvatarUrl } from "@/lib/avatar";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  canQuickAccessClub,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import {
  fetchShareImageAvatarDataUrls,
  buildSessionShareImageViewModel,
  renderSessionShareImage,
  SESSION_SHARE_IMAGE_HEIGHT,
  SESSION_SHARE_IMAGE_WIDTH,
} from "@/lib/sessionShareImage";
import { getSessionMembership } from "@/lib/sessionCollab";
import { getTutorialClubDisplayName } from "@/lib/tutorialPlayground";
import {
  MatchStatus,
  SessionClubRole,
  SessionClubStatus,
  SessionStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";

function getShareImageClubName(sessionData: {
  community?: { name: string; isTutorial: boolean } | null;
  sessionCommunities: Array<{
    role: string;
    status: string;
    community: { name: string; isTutorial: boolean };
  }>;
}) {
  const acceptedCommunities = sessionData.sessionCommunities.filter(
    (link) => link.status === SessionClubStatus.ACCEPTED
  );
  const hostClub =
    acceptedCommunities.find((link) => link.role === SessionClubRole.HOST)
      ?.community ?? acceptedCommunities[0]?.community;

  if (hostClub) {
    return getTutorialClubDisplayName(hostClub);
  }

  return sessionData.community
    ? getTutorialClubDisplayName(sessionData.community)
    : "Club";
}

async function getSessionShareImageRoute(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;
  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
    request,
    "api:sessions:code:share-image"
  );
  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      communityId: true,
      name: true,
      type: true,
      status: true,
      community: {
        select: {
          id: true,
          name: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      },
      sessionCommunities: {
        select: {
          role: true,
          status: true,
          community: {
            select: {
              id: true,
              name: true,
              isTutorial: true,
            },
          },
        },
      },
      players: {
        select: {
          userId: true,
          sessionPoints: true,
          joinedAt: true,
          ladderEntryAt: true,
          isGuest: true,
          user: {
            select: {
              id: true,
              name: true,
              avatarKey: true,
            },
          },
        },
      },
      matches: {
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL] },
        },
        select: {
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
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(request, "api:sessions:code:share-image");
  }

  if (
    sessionData.community?.isTutorial &&
    sessionData.community.tutorialOwnerId !== session.user.id
  ) {
    return invalidTargetResponse(request, "api:sessions:code:share-image");
  }

  if (!canQuickAccessClub(session, sessionData.communityId)) {
    return invalidTargetResponse(request, "api:sessions:code:share-image");
  }

  const membership = await getSessionMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: false,
  });
  const isSessionPlayer = sessionData.players.some(
    (player) => player.userId === session.user.id
  );
  const isQuickAccess = isQuickAccessSession(session);
  const canView =
    (!isQuickAccess && session.user.isAdmin) || !!membership || isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(request, "api:sessions:code:share-image");
  }

  if (sessionData.status !== SessionStatus.COMPLETED) {
    return NextResponse.json(
      { error: "Final standings are available after the session ends." },
      { status: 400 }
    );
  }

  if (sessionData.players.length === 0) {
    return NextResponse.json(
      { error: "There are no standings to share yet." },
      { status: 400 }
    );
  }

  const viewModel = buildSessionShareImageViewModel({
    sessionName: sessionData.name,
    communityName: getShareImageClubName(sessionData),
    sessionType: sessionData.type,
    players: sessionData.players.map((player) => ({
      userId: player.userId,
      sessionPoints: player.sessionPoints,
      joinedAt: player.joinedAt,
      ladderEntryAt: player.ladderEntryAt,
      isGuest: player.isGuest,
      user: {
        name: player.user.name,
        avatarUrl: resolveAvatarUrl(player.user.avatarKey),
      },
    })),
    matches: sessionData.matches,
  });
  const avatarDataUrlsByUserId = await fetchShareImageAvatarDataUrls(
    viewModel.standings
  );
  const imageResponse = new ImageResponse(
    renderSessionShareImage(viewModel, avatarDataUrlsByUserId),
    {
      width: SESSION_SHARE_IMAGE_WIDTH,
      height: SESSION_SHARE_IMAGE_HEIGHT,
    }
  );

  imageResponse.headers.set("Cache-Control", "private, no-store");
  return imageResponse;
}

export async function GET(...args: Parameters<typeof getSessionShareImageRoute>) {
  try {
    const rateLimitResponse = await rateLimit(
      args[0],
      "api:sessions:code:share-image:get",
      { limit: 12, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    return await getSessionShareImageRoute(...args);
  } catch (error) {
    logError("Generate session share image error", error);
    return safeErrorResponse();
  }
}
