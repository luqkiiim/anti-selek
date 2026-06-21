import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { prisma } from "@/lib/prisma";
import {
  approveClubClaimRequest,
  ClubClaimError,
} from "@/lib/clubClaims";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { ClaimRequestStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:claim-requests:requestId:patch", { limit: 15, windowMs: 60_000 });
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

    const { id: clubId, requestId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0 || typeof requestId !== "string" || requestId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:claim-requests:requestId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const adminAccess = await getClubAdminAccess(prisma, {
      clubId,
      userId: session.user.id,
      isGlobalAdmin: !!session.user.isAdmin,
    });

    if (!adminAccess?.canAdmin) {
      return invalidTargetResponse(request, "api:communities:id:claim-requests:requestId");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action } = body as { action?: unknown };
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "APPROVE") {
      const existingRequest = await prisma.claimRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          clubId: true,
          requesterUserId: true,
        },
      });

      if (!existingRequest || existingRequest.clubId !== clubId) {
        return invalidTargetResponse(request, "api:communities:id:claim-requests:requestId");
      }

      if (existingRequest.requesterUserId === session.user.id) {
        return NextResponse.json(
          { error: "You cannot approve your own claim request" },
          { status: 403 }
        );
      }

      const approved = await prisma.$transaction((tx) =>
        approveClubClaimRequest(tx, {
          clubId,
          requestId,
          reviewerUserId: session.user.id,
        })
      );

      return NextResponse.json(approved);
    }

    const existingRequest = await prisma.claimRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        clubId: true,
        status: true,
      },
    });

    if (!existingRequest || existingRequest.clubId !== clubId) {
      return invalidTargetResponse(request, "api:communities:id:claim-requests:requestId");
    }

    if (existingRequest.status !== ClaimRequestStatus.PENDING) {
      return NextResponse.json(
        { error: "Claim request is no longer pending" },
        { status: 409 }
      );
    }

    const reviewedAt = new Date();
    const rejected = await prisma.claimRequest.update({
      where: { id: requestId },
      data: {
        status: ClaimRequestStatus.REJECTED,
        reviewedById: session.user.id,
        reviewedAt,
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json(rejected);
  } catch (error) {
    if (error instanceof ClubClaimError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Review club claim request error", error);
    return safeErrorResponse();
  }
}

