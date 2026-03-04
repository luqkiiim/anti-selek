import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
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
    });

    if (!membership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const members = await prisma.communityMember.findMany({
      where: { communityId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            elo: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        elo: m.user.elo,
        role: m.role,
      }))
    );
  } catch (error) {
    console.error("List community members error:", error);
    return NextResponse.json({ error: "Failed to load community members" }, { status: 500 });
  }
}
