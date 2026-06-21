import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  createOfflineIdentityLinkRequest,
  isClubAdmin,
  OfflineIdentityError,
  offlineIdentityLinkRequestInclude,
  toOfflineIdentityLinkResponse,
} from "@/lib/offlineIdentities";
import {
  ClubContractAliasConflictError,
  readAliasedValue,
} from "@/lib/clubContractAliases";
import { prisma } from "@/lib/prisma";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: clubId } = await params;
    if (typeof clubId !== "string" || clubId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { isTutorial: true },
    });
    if (club?.isTutorial) {
      return NextResponse.json([]);
    }

    const canManage = await isClubAdmin(
      prisma,
      clubId,
      session.user.id,
      !isQuickAccessSession(session) && !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:offline-identity-links");
    }

    const requests = await prisma.offlineIdentityLinkRequest.findMany({
      where: {
        OR: [{ sourceClubId: clubId }, { targetClubId: clubId }],
      },
      include: offlineIdentityLinkRequestInclude,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(requests.map(toOfflineIdentityLinkResponse));
  } catch (error) {
    logError("List offline identity links error", error);
    return safeErrorResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:offline-identity-links:post",
      { limit: 15, windowMs: 60_000 }
    );
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

    const { id: sourceClubId } = await params;
    if (typeof sourceClubId !== "string" || sourceClubId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:offline-identity-links"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const sourceClub = await prisma.club.findUnique({
      where: { id: sourceClubId },
      select: { isTutorial: true },
    });
    if (sourceClub?.isTutorial) {
      return NextResponse.json(
        { error: "Tutorial playground profiles cannot be linked" },
        { status: 403 }
      );
    }

    const canManageSource = await isClubAdmin(
      prisma,
      sourceClubId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManageSource) {
      return invalidTargetResponse(request, "api:communities:id:offline-identity-links");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const bodyRecord = body as Record<string, unknown>;
    let targetClubId: unknown;
    try {
      targetClubId = readAliasedValue(
        bodyRecord,
        "targetClubId",
        "targetCommunityId",
        "target club identifier",
        {
          canonicalRoute: "/api/clubs/[id]/offline-identity-links",
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

    const { sourceUserId, targetUserId } = bodyRecord as {
      sourceUserId?: unknown;
      targetUserId?: unknown;
    };

    if (
      typeof sourceUserId !== "string" ||
      sourceUserId.length === 0 ||
      typeof targetClubId !== "string" ||
      targetClubId.length === 0 ||
      typeof targetUserId !== "string" ||
      targetUserId.length === 0
    ) {
      return NextResponse.json({ error: "Invalid link target" }, { status: 400 });
    }

    const targetClub = await prisma.club.findUnique({
      where: { id: targetClubId },
      select: { isTutorial: true },
    });
    if (targetClub?.isTutorial) {
      return NextResponse.json(
        { error: "Tutorial playground profiles cannot be linked" },
        { status: 403 }
      );
    }

    const canManageTarget = await isClubAdmin(
      prisma,
      targetClubId,
      session.user.id,
      !!session.user.isAdmin
    );

    const created = await prisma.$transaction((tx) =>
      createOfflineIdentityLinkRequest(tx, {
        sourceClubId,
        sourceUserId,
        targetClubId,
        targetUserId,
        requestedById: session.user.id,
        autoApprove: canManageTarget,
      })
    );

    return NextResponse.json(toOfflineIdentityLinkResponse(created), {
      status: created.status === "ACCEPTED" ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ClubContractAliasConflictError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OfflineIdentityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    logError("Create offline identity link error", error);
    return safeErrorResponse();
  }
}

