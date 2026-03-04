import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (requesterMembership?.role !== "ADMIN") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const targetMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Player not found in this community" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { elo: 1000 },
      select: {
        id: true,
        name: true,
        email: true,
        elo: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ...updated, role: targetMembership.role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Community admin reset ELO error:", error);
    return NextResponse.json({ error: `Failed to reset ELO: ${message}` }, { status: 500 });
  }
}
