import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildAvatarObjectKey,
  getAvatarUploadValidationError,
  isAvatarStorageConfigured,
  resolveAvatarUrl,
} from "@/lib/avatar";
import {
  cleanupSupersededAvatar,
  rollbackUploadedAvatar,
  uploadAvatarObject,
} from "@/lib/avatarStorage";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getAvatarTargetUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      avatarKey: true,
      isClaimed: true,
      name: true,
    },
  });
}

async function canManageAvatar({
  communityId,
  requesterId,
  requesterIsAdmin,
  requesterIsQuickAccess,
  targetUserId,
  targetIsClaimed,
}: {
  communityId: string | null;
  requesterId: string;
  requesterIsAdmin: boolean;
  requesterIsQuickAccess: boolean;
  targetUserId: string;
  targetIsClaimed: boolean;
}) {
  if (requesterIsAdmin) {
    return true;
  }

  if (requesterIsQuickAccess) {
    return false;
  }

  if (requesterId === targetUserId && targetIsClaimed) {
    return true;
  }

  if (!communityId) {
    return false;
  }

  const [requesterMembership, targetMembership] = await Promise.all([
    prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: requesterId,
        },
      },
      select: { role: true },
    }),
    prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: targetUserId,
        },
      },
      select: { role: true },
    }),
  ]);

  return requesterMembership?.role === "ADMIN" && !!targetMembership;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedAvatarUrl: string | null = null;

  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:users:id:avatar:post",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
      "api:users:id:avatar"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");

    const targetUser = await getAvatarTargetUser(id);
    if (!targetUser) {
      return invalidTargetResponse(request, "api:users:id:avatar");
    }

    const requesterIsQuickAccess = isQuickAccessSession(session);
    const allowed = await canManageAvatar({
      communityId,
      requesterId: session.user.id,
      requesterIsAdmin: !!session.user.isAdmin,
      requesterIsQuickAccess,
      targetUserId: targetUser.id,
      targetIsClaimed: targetUser.isClaimed,
    });
    if (!allowed) {
      return invalidTargetResponse(request, "api:users:id:avatar");
    }

    if (!isAvatarStorageConfigured()) {
      return NextResponse.json(
        { error: "Avatar storage is not configured" },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const avatarFile = formData.get("avatar");
    if (!(avatarFile instanceof File)) {
      return NextResponse.json(
        { error: "Choose an image file to upload" },
        { status: 400 }
      );
    }

    const validationError = getAvatarUploadValidationError({
      mimeType: avatarFile.type,
      size: avatarFile.size,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const avatarPathname = buildAvatarObjectKey({
      userId: targetUser.id,
      mimeType: avatarFile.type as "image/jpeg" | "image/png" | "image/webp",
    });

    uploadedAvatarUrl = await uploadAvatarObject({
      avatarPathname,
      body: avatarFile,
      contentType: avatarFile.type,
    });

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { avatarKey: uploadedAvatarUrl },
      select: { avatarKey: true },
    });

    await cleanupSupersededAvatar({
      previousAvatarKey: targetUser.avatarKey,
      nextAvatarKey: updatedUser.avatarKey,
    });

    return NextResponse.json({
      avatarUrl: resolveAvatarUrl(updatedUser.avatarKey),
    });
  } catch (error) {
    await rollbackUploadedAvatar({
      uploadedAvatarKey: uploadedAvatarUrl,
    });
    logError("Upload avatar error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:users:id:avatar:delete",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
      "api:users:id:avatar"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");

    const targetUser = await getAvatarTargetUser(id);
    if (!targetUser) {
      return invalidTargetResponse(request, "api:users:id:avatar");
    }

    const allowed = await canManageAvatar({
      communityId,
      requesterId: session.user.id,
      requesterIsAdmin: !!session.user.isAdmin,
      requesterIsQuickAccess: isQuickAccessSession(session),
      targetUserId: targetUser.id,
      targetIsClaimed: targetUser.isClaimed,
    });
    if (!allowed) {
      return invalidTargetResponse(request, "api:users:id:avatar");
    }

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { avatarKey: null },
    });

    await cleanupSupersededAvatar({
      previousAvatarKey: targetUser.avatarKey,
      nextAvatarKey: null,
    });

    return NextResponse.json({ avatarUrl: null });
  } catch (error) {
    logError("Delete avatar error", error);
    return safeErrorResponse();
  }
}
