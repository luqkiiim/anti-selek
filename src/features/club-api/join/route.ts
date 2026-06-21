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

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:join:post", { limit: 15, windowMs: 60_000 });
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
        "club name"
      );
    } catch (error) {
      if (error instanceof ClubContractAliasConflictError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    const { password } = bodyRecord as { password?: unknown };
    const name = aliasedName ?? bodyRecord.name;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Club name is required" }, { status: 400 });
    }

    const normalizedLookupName = normalizeNameLookupKey(name);
    if (!normalizedLookupName) {
      return NextResponse.json({ error: "Club name is required" }, { status: 400 });
    }

    const matchingClubs = (
      await prisma.club.findMany({
        select: {
          id: true,
          name: true,
          isTutorial: true,
          isPasswordProtected: true,
          passwordHash: true,
        },
      })
    ).filter(
      (club) =>
        !club.isTutorial &&
        normalizeNameLookupKey(club.name) === normalizedLookupName
    );

    if (matchingClubs.length > 1) {
      return NextResponse.json({ error: "Club name is ambiguous" }, { status: 409 });
    }

    const club = matchingClubs[0] ?? null;

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    if (club.isPasswordProtected) {
      if (typeof password !== "string" || password.length === 0) {
        return NextResponse.json({ error: "Password is required" }, { status: 400 });
      }
      const ok = await bcrypt.compare(password, club.passwordHash || "");
      if (!ok) {
        return NextResponse.json({ error: "Invalid password" }, { status: 403 });
      }
    }
    const shouldBeAdmin =
      !!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null);

    const membership = await prisma.clubMember.upsert({
      where: {
        clubId_userId: {
          clubId: club.id,
          userId: session.user.id,
        },
      },
      update: shouldBeAdmin ? { role: "ADMIN" } : {},
      create: {
        clubId: club.id,
        userId: session.user.id,
        role: shouldBeAdmin ? "ADMIN" : "MEMBER",
      },
      select: {
        role: true,
        club: {
          select: {
            id: true,
            name: true,
            isPasswordProtected: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(withLegacyClubAliases({
      id: membership.club.id,
      name: membership.club.name,
      clubId: membership.club.id,
      clubName: membership.club.name,
      role: membership.role,
      isPasswordProtected: membership.club.isPasswordProtected,
      createdAt: membership.club.createdAt,
    }));
  } catch (error) {
    logError("Join club error", error);
    return safeErrorResponse();
  }
}

