import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAvatarUrl } from "@/lib/avatar";
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
    if (email !== undefined || body.ownerUserId !== undefined) return NextResponse.json({ error: "Manage account credentials and identity claims separately" }, { status: 400 });

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
    const user = await prisma.player.findUnique({
      where: { id },
      include: {
        clubMemberships: {
          where: { retiredByAdmissionEventId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }
    if (user.clubMemberships.length > 0) {
      return NextResponse.json({ error: "Retired player profiles cannot be changed" }, { status: 409 });
    }
    if (
      typeof name === "string" &&
      user.ownerUserId &&
      name.trim() !== user.name
    ) {
      return NextResponse.json(
        { error: "Player owners manage their own player name" },
        { status: 403 }
      );
    }

    const updated = await prisma.player.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,

        elo: elo !== undefined ? elo : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        avatarKey: true,
        elo: true,
        isActive: true,

        createdAt: true,
      },
    });

    const { avatarKey, ...rest } = updated;
    return NextResponse.json({
      ...rest,
      avatarUrl: resolveAvatarUrl(avatarKey), email: null, isClaimed: !!updated.ownerUserId,
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

    // Check the target and retirement state before attempting to archive it.
    const user = await prisma.player.findUnique({
      where: { id },
      include: {
        clubMemberships: {
          where: { retiredByAdmissionEventId: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id");
    }
    if (user.clubMemberships.length > 0) {
      return NextResponse.json({ error: "Retired player profiles cannot be changed" }, { status: 409 });
    }
    if (user.ownerUserId === session.user.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    // Archive the durable sporting identity; all historical references remain intact.
    await prisma.player.update({ where: { id }, data: { isActive: false } });



    logAuditEvent({
      action: "admin.player.archive",
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
        type: "player",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Admin delete player error details", error);
    return safeErrorResponse();
  }
}
