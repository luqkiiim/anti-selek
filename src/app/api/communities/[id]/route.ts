import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (!membership || (membership.role !== "ADMIN" && !session.user.isAdmin)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, password } = body as { name?: unknown; password?: unknown };
    const updates: {
      name?: string;
      isPasswordProtected?: boolean;
      passwordHash?: string | null;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return NextResponse.json(
          { error: "Community name must be at least 3 characters" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (password !== undefined) {
      if (typeof password !== "string") {
        return NextResponse.json({ error: "Invalid password" }, { status: 400 });
      }
      if (password.length > 0 && password.length < 4) {
        return NextResponse.json(
          { error: "Password must be at least 4 characters" },
          { status: 400 }
        );
      }
      if (password.length > 0) {
        updates.passwordHash = await bcrypt.hash(password, 10);
        updates.isPasswordProtected = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = await prisma.community.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const updatedCommunity = await prisma.community.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        isPasswordProtected: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedCommunity);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Community name already exists" }, { status: 409 });
    }
    console.error("Update community error:", error);
    return NextResponse.json({ error: "Failed to update community" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (membership.role !== "ADMIN" && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const confirmation =
      body && typeof body === "object"
        ? (body as { confirmation?: unknown }).confirmation
        : undefined;
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    const existing = await prisma.community.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    await prisma.community.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete community error:", error);
    return NextResponse.json({ error: "Failed to delete community" }, { status: 500 });
  }
}
