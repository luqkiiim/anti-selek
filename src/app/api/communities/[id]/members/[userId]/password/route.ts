import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireCommunityAdmin(
  communityId: string,
  requesterId: string,
  isGlobalAdmin: boolean
) {
  if (isGlobalAdmin) return true;

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId: requesterId,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId, userId } = await params;
    const canManage = await requireCommunityAdmin(
      communityId,
      session.user.id,
      !!session.user.isAdmin
    );

    if (!canManage) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
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
      return NextResponse.json({ error: "Player not found in this community" }, { status: 404 });
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

    return NextResponse.json({
      success: true,
      userId,
      name: membership.user.name,
      email: membership.user.email,
    });
  } catch (error) {
    console.error("Community admin reset player password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
