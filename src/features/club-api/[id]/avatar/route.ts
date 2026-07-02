import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildClubAvatarObjectKey,
  getAvatarFileSignatureValidationError,
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
import { ClubRole } from "@/types/enums";

async function getClubAvatarTarget(clubId: string) {
  return prisma.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      avatarKey: true,
      createdById: true,
      isTutorial: true,
    },
  });
}

async function canManageClubAvatar({
  clubId,
  createdById,
  requesterId,
  requesterIsAdmin,
}: {
  clubId: string;
  createdById: string;
  requesterId: string;
  requesterIsAdmin: boolean;
}) {
  if (requesterIsAdmin || createdById === requesterId) {
    return true;
  }

  const membership = await prisma.clubMember.findUnique({
    where: {
      clubId_userId: {
        clubId,
        userId: requesterId,
      },
    },
    select: { role: true },
  });

  return membership?.role === ClubRole.ADMIN;
}

async function assertCanManageClubAvatar({
  request,
  clubId,
}: {
  request: Request;
  clubId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
      session: null,
      targetClub: null,
    };
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
    request,
    "api:clubs:id:avatar"
  );
  if (invalidTargetLimitResponse) {
    return { response: invalidTargetLimitResponse, session, targetClub: null };
  }

  const targetClub = await getClubAvatarTarget(clubId);
  if (!targetClub || isQuickAccessSession(session)) {
    return {
      response: await invalidTargetResponse(request, "api:clubs:id:avatar"),
      session,
      targetClub,
    };
  }

  const allowed = await canManageClubAvatar({
    clubId: targetClub.id,
    createdById: targetClub.createdById,
    requesterId: session.user.id,
    requesterIsAdmin: !!session.user.isAdmin,
  });
  if (!allowed) {
    return {
      response: await invalidTargetResponse(request, "api:clubs:id:avatar"),
      session,
      targetClub,
    };
  }

  if (targetClub.isTutorial) {
    return {
      response: NextResponse.json(
        { error: "Tutorial playground settings are managed by reset." },
        { status: 400 }
      ),
      session,
      targetClub,
    };
  }

  return { response: null, session, targetClub };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let uploadedAvatarUrl: string | null = null;

  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:clubs:id:avatar:post",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const access = await assertCanManageClubAvatar({ request, clubId: id });
    if (access.response) {
      return access.response;
    }
    const targetClub = access.targetClub;
    if (!targetClub) {
      return invalidTargetResponse(request, "api:clubs:id:avatar");
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

    const signatureValidationError = getAvatarFileSignatureValidationError({
      bytes: new Uint8Array(await avatarFile.slice(0, 16).arrayBuffer()),
      mimeType: avatarFile.type,
    });
    if (signatureValidationError) {
      return NextResponse.json(
        { error: signatureValidationError },
        { status: 400 }
      );
    }

    const avatarPathname = buildClubAvatarObjectKey({
      clubId: targetClub.id,
      mimeType: avatarFile.type as "image/jpeg" | "image/png" | "image/webp",
    });

    uploadedAvatarUrl = await uploadAvatarObject({
      avatarPathname,
      body: avatarFile,
      contentType: avatarFile.type,
    });

    const updatedClub = await prisma.club.update({
      where: { id: targetClub.id },
      data: { avatarKey: uploadedAvatarUrl },
      select: { avatarKey: true },
    });

    await cleanupSupersededAvatar({
      previousAvatarKey: targetClub.avatarKey,
      nextAvatarKey: updatedClub.avatarKey,
    });

    return NextResponse.json({
      avatarUrl: resolveAvatarUrl(updatedClub.avatarKey),
    });
  } catch (error) {
    await rollbackUploadedAvatar({
      uploadedAvatarKey: uploadedAvatarUrl,
    });
    logError("Upload club avatar error", error);
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
      "api:clubs:id:avatar:delete",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const access = await assertCanManageClubAvatar({ request, clubId: id });
    if (access.response) {
      return access.response;
    }
    const targetClub = access.targetClub;
    if (!targetClub) {
      return invalidTargetResponse(request, "api:clubs:id:avatar");
    }

    await prisma.club.update({
      where: { id: targetClub.id },
      data: { avatarKey: null },
    });

    await cleanupSupersededAvatar({
      previousAvatarKey: targetClub.avatarKey,
      nextAvatarKey: null,
    });

    return NextResponse.json({ avatarUrl: null });
  } catch (error) {
    logError("Delete club avatar error", error);
    return safeErrorResponse();
  }
}
