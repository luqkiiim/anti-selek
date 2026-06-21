import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import {
  ClubContractAliasConflictError,
  readAliasedValue,
  withLegacyClubAliases,
} from "@/lib/clubContractAliases";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";

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

    if (isQuickAccess && !session.user.quickAccessClubId) {
      return NextResponse.json([]);
    }

    const memberships = await prisma.clubMember.findMany({
      where: {
        userId: session.user.id,
        ...(isQuickAccess
          ? { clubId: session.user.quickAccessClubId ?? "" }
          : {}),
        club: { isTutorial: false },
      },
      include: {
        club: {
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
        const viewerIsOwner = m.club.createdById === session.user.id;

        return withLegacyClubAliases({
          id: m.club.id,
          name: m.club.name,
          clubId: m.club.id,
          clubName: m.club.name,
          role:
            isQuickAccess
              ? "MEMBER"
              : isGlobalAdmin || viewerIsOwner
                ? "ADMIN"
                : m.role,
          viewerIsOwner,
          isPasswordProtected: m.club.isPasswordProtected,
          createdAt: m.club.createdAt,
          membersCount: m.club._count.members,
          sessionsCount: m.club._count.sessions,
        });
      })
    );
  } catch (error) {
    logError("List clubs error", error);
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

    const bodyRecord = body as Record<string, unknown>;
    let aliasedName: unknown;
    try {
      aliasedName = readAliasedValue(
        bodyRecord,
        "clubName",
        "communityName",
        "club name",
        {
          canonicalRoute: "/api/clubs",
          request,
          surface: "api",
        }
      );
    } catch (error) {
      if (error instanceof ClubContractAliasConflictError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    const { password } = bodyRecord as { password?: unknown };
    const name = aliasedName ?? bodyRecord.name;
    if (typeof name !== "string" || name.trim().length < 3) {
      return NextResponse.json({ error: "Club name must be at least 3 characters" }, { status: 400 });
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
      return NextResponse.json({ error: "Club name must include letters or numbers" }, { status: 400 });
    }

    const existingClubs = await prisma.club.findMany({
      select: { name: true },
    });
    const normalizedNameExists = existingClubs.some(
      (club) => normalizeNameLookupKey(club.name) === normalizedLookupName
    );
    if (normalizedNameExists) {
      return NextResponse.json({ error: "Club name already exists" }, { status: 409 });
    }

    const passwordHash = typeof password === "string" && password.length > 0
      ? await bcrypt.hash(password, 10)
      : null;

    const created = await prisma.club.create({
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
      withLegacyClubAliases({
        ...created,
        clubId: created.id,
        clubName: created.name,
        role: "ADMIN",
        viewerIsOwner: true,
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Club name already exists" }, { status: 409 });
    }
    logError("Create club error", error);
    return safeErrorResponse();
  }
}

