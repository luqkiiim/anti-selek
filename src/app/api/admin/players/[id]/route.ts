import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAvatarUrl } from "@/lib/avatar";
import { cleanupSupersededAvatar } from "@/lib/avatarStorage";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:admin:players:id:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();

    if (!session?.user?.isAdmin) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:admin:players:id");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { name, email, elo, isActive } = body;

    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length === 0)
    ) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    if (
      email !== undefined &&
      email !== null &&
      (typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    ) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (
      elo !== undefined &&
      (!Number.isInteger(elo) || elo < 0 || elo > 5000)
    ) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json({ error: "Invalid isActive value" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        email: email !== undefined ? (email ? email.trim() : null) : undefined,
        elo: elo !== undefined ? elo : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarKey: true,
        elo: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });

    const { avatarKey, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      avatarUrl: resolveAvatarUrl(avatarKey),
    });
  } catch (error) {
    logError("Admin update player error details", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:admin:players:id:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();

    if (!session?.user?.isAdmin) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:admin:players:id");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    // Don't allow deleting yourself
    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        avatarKey: true,
      },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }

    // Delete the user (cascades will handle SessionPlayer and Match records)
    await prisma.user.delete({
      where: { id },
    });

    await cleanupSupersededAvatar({
      previousAvatarKey: user.avatarKey,
      nextAvatarKey: null,
    });

    logAuditEvent({
      action: "admin.user.delete",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        route: "/api/admin/players/[id]",
      },
      target: {
        id: user.id,
        name: user.name,
        type: "user",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Admin delete player error details", error);
    return safeErrorResponse();
  }
}
