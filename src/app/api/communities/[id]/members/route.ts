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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const canManage = !!session.user.isAdmin || requesterMembership?.role === "ADMIN";
    if (!canManage) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, email } = body as { name?: unknown; email?: unknown };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Player name must be at least 2 characters" }, { status: 400 });
    }
    if (email !== undefined && typeof email !== "string") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const normalizedName = name.trim();
    const normalizedEmail =
      typeof email === "string" && email.trim().length > 0 ? email.trim().toLowerCase() : null;

    let user: { id: string; name: string; email: string | null; elo: number };
    if (normalizedEmail) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, name: true, email: true, elo: true },
      });

      if (!existingUser) {
        return NextResponse.json(
          {
            error:
              "No user found with that email. Ask them to sign up first, or leave email empty to create an unclaimed player profile.",
          },
          { status: 404 }
        );
      }
      user = existingUser;
    } else {
      const existingUnclaimed = await prisma.user.findFirst({
        where: { name: normalizedName, isClaimed: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, elo: true },
      });

      if (existingUnclaimed) {
        user = existingUnclaimed;
      } else {
        user = await prisma.user.create({
          data: {
            name: normalizedName,
            email: null,
            passwordHash: null,
            isClaimed: false,
          },
          select: { id: true, name: true, email: true, elo: true },
        });
      }
    }

    const membership = await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        communityId: id,
        userId: user.id,
        role: "MEMBER",
      },
      select: {
        role: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      elo: user.elo,
      role: membership.role,
    });
  } catch (error) {
    console.error("Add community member error:", error);
    return NextResponse.json({ error: "Failed to add player to community" }, { status: 500 });
  }
}
