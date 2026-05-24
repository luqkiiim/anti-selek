import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  createOfflineIdentityLinkRequest,
  isCommunityAdmin,
  OfflineIdentityError,
  offlineIdentityLinkRequestInclude,
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

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId } = await params;
    if (typeof communityId !== "string" || communityId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManage = await isCommunityAdmin(
      prisma,
      communityId,
      session.user.id,
      !isQuickAccessSession(session) && !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:offline-identity-links");
    }

    const requests = await prisma.offlineIdentityLinkRequest.findMany({
      where: {
        OR: [{ sourceCommunityId: communityId }, { targetCommunityId: communityId }],
      },
      include: offlineIdentityLinkRequestInclude,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests.map(toOfflineIdentityLinkResponse));
  } catch (error) {
    logError("List offline identity links error", error);
    return safeErrorResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:post",
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

    const { id: sourceCommunityId } = await params;
    if (typeof sourceCommunityId !== "string" || sourceCommunityId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManageSource = await isCommunityAdmin(
      prisma,
      sourceCommunityId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManageSource) {
      return invalidTargetResponse(request, "api:communities:id:offline-identity-links");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { sourceUserId, targetCommunityId, targetUserId } = body as {
      sourceUserId?: unknown;
      targetCommunityId?: unknown;
      targetUserId?: unknown;
    };

    if (
      typeof sourceUserId !== "string" ||
      sourceUserId.length === 0 ||
      typeof targetCommunityId !== "string" ||
      targetCommunityId.length === 0 ||
      typeof targetUserId !== "string" ||
      targetUserId.length === 0
    ) {
      return NextResponse.json({ error: "Invalid link target" }, { status: 400 });
    }

    const canManageTarget = await isCommunityAdmin(
      prisma,
      targetCommunityId,
      session.user.id,
      !!session.user.isAdmin
    );

    const created = await prisma.$transaction((tx) =>
      createOfflineIdentityLinkRequest(tx, {
        sourceCommunityId,
        sourceUserId,
        targetCommunityId,
        targetUserId,
        requestedById: session.user.id,
        autoApprove: canManageTarget,
      })
    );

    return NextResponse.json(toOfflineIdentityLinkResponse(created), {
      status: created.status === "ACCEPTED" ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof OfflineIdentityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Create offline identity link error", error);
    return safeErrorResponse();
  }
}
