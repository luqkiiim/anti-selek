import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
