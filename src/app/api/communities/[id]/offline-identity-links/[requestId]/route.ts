import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  isClubAdmin,
  OfflineIdentityError,
  reviewOfflineIdentityLinkRequest,
  toOfflineIdentityLinkResponse,
} from "@/lib/offlineIdentities";
import { prisma } from "@/lib/prisma";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { OfflineIdentityLinkStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:requestId:patch",
      { limit: 15, windowMs: 60_000 }
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

    const { id: clubId, requestId } = await params;
    if (
      typeof clubId !== "string" ||
      clubId.length === 0 ||
      typeof requestId !== "string" ||
      requestId.length === 0
    ) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links:requestId"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManage = await isClubAdmin(
      prisma,
      clubId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(
        request,
        "api:communities:id:offline-identity-links:requestId"
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { status } = body as { status?: unknown };
    if (
      status !== OfflineIdentityLinkStatus.ACCEPTED &&
      status !== OfflineIdentityLinkStatus.REJECTED
    ) {
      return NextResponse.json({ error: "Invalid link status" }, { status: 400 });
    }

    const reviewed = await prisma.$transaction((tx) =>
      reviewOfflineIdentityLinkRequest(tx, {
        requestId,
        targetClubId: clubId,
        reviewerUserId: session.user.id,
        status,
      })
    );

    return NextResponse.json(toOfflineIdentityLinkResponse(reviewed));
  } catch (error) {
    if (error instanceof OfflineIdentityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Review offline identity link error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:requestId:delete",
      { limit: 15, windowMs: 60_000 }
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

    const { id: clubId, requestId } = await params;
    if (
      typeof clubId !== "string" ||
      clubId.length === 0 ||
      typeof requestId !== "string" ||
      requestId.length === 0
    ) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links:requestId"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManage = await isClubAdmin(
      prisma,
      clubId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(
        request,
        "api:communities:id:offline-identity-links:requestId"
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const link = await tx.offlineIdentityLinkRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          offlineIdentityId: true,
          sourceClubId: true,
          targetClubId: true,
          status: true,
        },
      });

      if (
        !link ||
        (link.sourceClubId !== clubId &&
          link.targetClubId !== clubId)
      ) {
        throw new OfflineIdentityError("Offline identity link request not found", 404);
      }

      if (link.status !== OfflineIdentityLinkStatus.ACCEPTED || !link.offlineIdentityId) {
        throw new OfflineIdentityError("Only accepted links can be unlinked", 400);
      }

      const members = await tx.offlineIdentityMember.findMany({
        where: { offlineIdentityId: link.offlineIdentityId },
        select: { id: true },
      });
      if (members.length > 2) {
        throw new OfflineIdentityError(
          "This offline identity has more than two placeholders. Manual unlink required.",
          409
        );
      }

      await tx.offlineIdentityLinkRequest.delete({
        where: { id: link.id },
      });
      await tx.offlineIdentityMember.deleteMany({
        where: { offlineIdentityId: link.offlineIdentityId },
      });
      await tx.offlineIdentity.delete({
        where: { id: link.offlineIdentityId },
      });

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OfflineIdentityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Delete offline identity link error", error);
    return safeErrorResponse();
  }
}
