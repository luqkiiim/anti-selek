import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { admissionTransaction, submitClubAdmission } from "@/lib/clubAdmissions";
import { admissionError } from "@/lib/clubAdmissionApi";
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
        "club name",
        {
          canonicalRoute: "/api/clubs/join",
          request,
          surface: "api",
        }
      );
    } catch (error) {
      if (error instanceof ClubContractAliasConflictError) {
        return NextResponse.json(
          { error: error.message, field: "clubName" },
          { status: 400 }
        );
      }
      throw error;
    }
    const { password } = bodyRecord as { password?: unknown };
    const name = aliasedName ?? bodyRecord.name;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Club name is required", field: "clubName" },
        { status: 400 }
      );
    }

    const normalizedLookupName = normalizeNameLookupKey(name);
    if (!normalizedLookupName) {
      return NextResponse.json(
        { error: "Club name is required", field: "clubName" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Club name is ambiguous", field: "clubName" },
        { status: 409 }
      );
    }

    const club = matchingClubs[0] ?? null;

    if (!club) {
      return NextResponse.json(
        { error: "Club not found", field: "clubName" },
        { status: 404 }
      );
    }

    if (club.isPasswordProtected) {
      if (typeof password !== "string" || password.length === 0) {
        return NextResponse.json(
          { error: "Password is required", field: "password" },
          { status: 400 }
        );
      }
      const ok = await bcrypt.compare(password, club.passwordHash || "");
      if (!ok) {
        return NextResponse.json(
          { error: "Invalid password", field: "password" },
          { status: 403 }
        );
      }
    }
    const account = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!account?.isActive) return NextResponse.json({ error: "An active account is required" }, { status: 403 });
    const result = await admissionTransaction(prisma, tx => submitClubAdmission(tx, {
      clubId: club.id, requesterUserId: account.id,
      kind: "NEW_PLAYER", proposedPlayerName: account.name, proposedGender: account.gender,
    }));
    return NextResponse.json(withLegacyClubAliases({ ...result, clubId: club.id, clubName: club.name }));

  } catch (error) {
    return admissionError(error);
  }
}
