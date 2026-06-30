import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
} from "@/lib/rateLimit";
import {
  canQuickAccessClub,
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import { ClubRole } from "@/types/enums";

export async function getClubMemberAccessContext({
  clubId,
  rateLimitKey,
  request,
}: {
  clubId: string;
  rateLimitKey: string;
  request: Request;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    } as const;
  }
  if (isQuickAccessSession(session)) {
    return {
      response: NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      ),
    } as const;
  }

  if (typeof clubId !== "string" || clubId.length === 0) {
    return {
      response: NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      ),
    } as const;
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
    request,
    rateLimitKey
  );

  if (invalidTargetLimitResponse) {
    return { response: invalidTargetLimitResponse } as const;
  }
  if (!canQuickAccessClub(session, clubId)) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  const viewerId = session.user.id;
  const [membership, club] = await Promise.all([
    prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId: viewerId,
        },
      },
      select: { role: true },
    }),
    prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        createdById: true,
        isTutorial: true,
        tutorialOwnerId: true,
      },
    }),
  ]);

  if (!club) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  const viewerIsOwner = club.createdById === viewerId;
  const viewerCanAdminClub =
    !!session.user.isAdmin ||
    viewerIsOwner ||
    membership?.role === ClubRole.ADMIN;

  if (club.isTutorial && club.tutorialOwnerId !== viewerId) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  if (!membership && !session.user.isAdmin && !viewerIsOwner) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  return {
    context: {
      club,
      membership,
      session,
      viewerCanAdminClub,
      viewerId,
      viewerIsOwner,
    },
  } as const;
}
