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
import { getAccountClubContext } from "@/lib/playerIdentity";

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
  const { membership: playerMembership, club, access, role, canAdmin: viewerCanAdminClub, canAccess, isOwner: viewerIsOwner } = await getAccountClubContext(prisma, { clubId, userId: viewerId, isGlobalAdmin: session.user.isAdmin });
  const membership = access?.status === "ACTIVE" ? { ...access, role } : null;

  if (!club) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }


  if (club.isTutorial && club.tutorialOwnerId !== viewerId) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  if (!canAccess) {
    return {
      response: await invalidTargetResponse(request, rateLimitKey),
    } as const;
  }

  return {
    context: {
      club,
      membership,
      playerMembership,
      viewerPlayerId: playerMembership?.playerId ?? null,
      session,
      viewerCanAdminClub,
      viewerId,
      viewerIsOwner,
    },
  } as const;
}
