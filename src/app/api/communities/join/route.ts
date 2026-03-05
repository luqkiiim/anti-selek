import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, password } = body as { name?: unknown; password?: unknown };
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Community name is required" }, { status: 400 });
    }

    const community = await prisma.community.findUnique({
      where: { name: name.trim() },
      select: {
        id: true,
        name: true,
        isPasswordProtected: true,
        passwordHash: true,
      },
    });

    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    if (community.isPasswordProtected) {
      if (typeof password !== "string" || password.length === 0) {
        return NextResponse.json({ error: "Password is required" }, { status: 400 });
      }
      const ok = await bcrypt.compare(password, community.passwordHash || "");
      if (!ok) {
        return NextResponse.json({ error: "Invalid password" }, { status: 403 });
      }
    }
    const shouldBeAdmin =
      !!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null);

    const membership = await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: community.id,
          userId: session.user.id,
        },
      },
      update: shouldBeAdmin ? { role: "ADMIN" } : {},
      create: {
        communityId: community.id,
        userId: session.user.id,
        role: shouldBeAdmin ? "ADMIN" : "MEMBER",
      },
      select: {
        role: true,
        community: {
          select: {
            id: true,
            name: true,
            isPasswordProtected: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: membership.community.id,
      name: membership.community.name,
      role: membership.role,
      isPasswordProtected: membership.community.isPasswordProtected,
      createdAt: membership.community.createdAt,
    });
  } catch (error) {
    console.error("Join community error:", error);
    return NextResponse.json({ error: "Failed to join community" }, { status: 500 });
  }
}
