import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const isQuickAccess = isQuickAccessSession(session);
    const isGlobalAdmin =
      !isQuickAccess &&
      (!!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null));

    if (isQuickAccess && !session.user.quickAccessCommunityId) {
      return NextResponse.json([]);
    }

    const memberships = await prisma.communityMember.findMany({
      where: {
        userId: session.user.id,
        ...(isQuickAccess
          ? { communityId: session.user.quickAccessCommunityId ?? "" }
          : {}),
        community: { isTutorial: false },
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            createdById: true,
            isTutorial: true,
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
      memberships.map((m) => {
        const viewerIsOwner = m.community.createdById === session.user.id;

        return {
          id: m.community.id,
          name: m.community.name,
          role:
            isQuickAccess
              ? "MEMBER"
              : isGlobalAdmin || viewerIsOwner
                ? "ADMIN"
                : m.role,
          viewerIsOwner,
          isPasswordProtected: m.community.isPasswordProtected,
          createdAt: m.community.createdAt,
          membersCount: m.community._count.members,
          sessionsCount: m.community._count.sessions,
        };
      })
    );
  } catch (error) {
    logError("List communities error", error);
    return safeErrorResponse();
  }
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:post", { limit: 15, windowMs: 60_000 });
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
    const normalizedLookupName = normalizeNameLookupKey(normalizedName);
    if (!normalizedLookupName) {
      return NextResponse.json({ error: "Community name must include letters or numbers" }, { status: 400 });
    }

    const existingCommunities = await prisma.community.findMany({
      select: { name: true },
    });
    const normalizedNameExists = existingCommunities.some(
      (community) => normalizeNameLookupKey(community.name) === normalizedLookupName
    );
    if (normalizedNameExists) {
      return NextResponse.json({ error: "Community name already exists" }, { status: 409 });
    }

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

    return NextResponse.json(
      { ...created, role: "ADMIN", viewerIsOwner: true },
      { status: 201 }
    );
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Community name already exists" }, { status: 409 });
    }
    logError("Create community error", error);
    return safeErrorResponse();
  }
}
