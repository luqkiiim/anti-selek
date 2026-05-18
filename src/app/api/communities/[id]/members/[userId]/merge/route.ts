import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  CommunityPlayerMergeError,
  mergeDuplicateUnclaimedCommunityPlayer,
} from "@/lib/communityPlayerMerge";
import { cleanupSupersededAvatar } from "@/lib/avatarStorage";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function ensureCanManageCommunity(
  communityId: string,
  userId: string,
  isGlobalAdmin: boolean
) {
  if (isGlobalAdmin) return true;

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });

  return membership?.role === "ADMIN";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:members:userId:merge:post",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(
        request,
        "api:communities:id:members:userId:merge"
      );
    }

    const { id: communityId, userId: sourceUserId } = await params;
    if (
      typeof communityId !== "string" ||
      communityId.length === 0 ||
      typeof sourceUserId !== "string" ||
      sourceUserId.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:members:userId:merge"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const isGlobalAdmin =
      !!session.user.isAdmin ||
      isGlobalAdminEmail(session.user.email ?? null);
    const canManage = await ensureCanManageCommunity(
      communityId,
      session.user.id,
      isGlobalAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(
        request,
        "api:communities:id:members:userId:merge"
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { targetUserId } = body as { targetUserId?: unknown };
    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return NextResponse.json(
        { error: "Target player is required" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction((tx) =>
      mergeDuplicateUnclaimedCommunityPlayer(tx, {
        communityId,
        sourceUserId,
        targetUserId: targetUserId.trim(),
        reviewerUserId: session.user.id,
      })
    );

    await cleanupSupersededAvatar({
      previousAvatarKey:
        typeof result.discardedAvatarKey === "string"
          ? result.discardedAvatarKey
          : null,
      nextAvatarKey: null,
    });

    return NextResponse.json({
      sourceUserId: result.sourceUserId,
      sourceName: result.sourceName,
      targetUserId: result.targetUserId,
      targetName: result.targetName,
      deletedSourceUser: result.deletedSourceUser,
    });
  } catch (error) {
    if (error instanceof CommunityPlayerMergeError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Merge duplicate unclaimed player error", error);
    return safeErrorResponse();
  }
}
