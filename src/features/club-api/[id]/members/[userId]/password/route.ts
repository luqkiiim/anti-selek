import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:userId:password:post", { limit: 15, windowMs: 60_000 });
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

    const { id: clubId, userId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId:password");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    if (!session.user.isAdmin) {
      return invalidTargetResponse(request, "api:communities:id:members:userId:password");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { password } = body as { password?: unknown };
    if (typeof password !== "string") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    const trimmedPassword = password.trim();
    if (trimmedPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const membership = await prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isClaimed: true,
          },
        },
      },
    });

    if (!membership?.user) {
      return invalidTargetResponse(request, "api:communities:id:members:userId:password");
    }

    if (!membership.user.email || !membership.user.isClaimed) {
      return NextResponse.json(
        { error: "Only claimed members with an email can have passwords reset" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(trimmedPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    logAuditEvent({
      action: "community.member.password_reset",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        clubId,
        route: "/api/clubs/[id]/members/[userId]/password",
      },
      target: {
        id: membership.user.id,
        name: membership.user.name,
        type: "user",
      },
    });

    return NextResponse.json({
      success: true,
      userId,
      name: membership.user.name,
      email: membership.user.email,
    });
  } catch (error) {
    logError("Club admin reset player password error", error);
    return safeErrorResponse();
  }
}

