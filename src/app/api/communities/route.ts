import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const isGlobalAdmin =
      !!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null);

    const memberships = await prisma.communityMember.findMany({
      where: { userId: session.user.id },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            isPasswordProtected: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                sessions: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      memberships.map((m) => ({
        id: m.community.id,
        name: m.community.name,
        role: isGlobalAdmin ? "ADMIN" : m.role,
        isPasswordProtected: m.community.isPasswordProtected,
        createdAt: m.community.createdAt,
        membersCount: m.community._count.members,
        sessionsCount: m.community._count.sessions,
      }))
    );
  } catch (error) {
    console.error("List communities error:", error);
    return NextResponse.json({ error: "Failed to load communities" }, { status: 500 });
  }
}

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
    if (typeof name !== "string" || name.trim().length < 3) {
      return NextResponse.json({ error: "Community name must be at least 3 characters" }, { status: 400 });
    }
    if (password !== undefined && typeof password !== "string") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    if (typeof password === "string" && password.length > 0 && password.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    const normalizedName = name.trim();
    const passwordHash = typeof password === "string" && password.length > 0
      ? await bcrypt.hash(password, 10)
      : null;

    const created = await prisma.community.create({
      data: {
        name: normalizedName,
        isPasswordProtected: !!passwordHash,
        passwordHash,
        createdById: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "ADMIN",
          },
        },
      },
      select: {
        id: true,
        name: true,
        isPasswordProtected: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ...created, role: "ADMIN" }, { status: 201 });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Community name already exists" }, { status: 409 });
    }
    console.error("Create community error:", error);
    return NextResponse.json({ error: "Failed to create community" }, { status: 500 });
  }
}
