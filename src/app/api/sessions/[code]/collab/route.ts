import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { prisma } from "@/lib/prisma";
import { getAccountClubContext } from "@/lib/playerIdentity";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  SessionClubRole,
  SessionClubStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:sessions:code:collab:patch",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const { code } = await params;
    if (typeof code !== "string" || code.length === 0) {
      return sportingJson(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:sessions:code:collab"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
    }

    const { status } = body as { status?: unknown };
    if (
      status !== SessionClubStatus.ACCEPTED &&
      status !== SessionClubStatus.REJECTED
    ) {
      return sportingJson({ error: "Invalid collab status" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        status: true,
        sessionClubs: {
          where: {
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.PENDING,
          },
          select: {
            id: true,
            clubId: true,
            club: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!sessionData || sessionData.sessionClubs.length === 0) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const partnerLink = sessionData.sessionClubs[0];
    const partnerClubContext = await getAccountClubContext(prisma, {
      userId: session.user.id,
      clubId: partnerLink.clubId,
      isGlobalAdmin: !!session.user.isAdmin,
    });
    if (!partnerClubContext.canAdmin) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const updated = await prisma.sessionClub.update({
      where: { id: partnerLink.id },
      data: {
        status,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        club: { select: { id: true, name: true } },
      },
    });

    return sportingJson(withLegacyClubAliases({
      id: updated.id,
      clubId: updated.clubId,
      clubName: updated.club.name,
      role: updated.role,
      status: updated.status,
      reviewedAt: updated.reviewedAt,
    }));
  } catch (error) {
    logError("Review collab session error", error);
    return safeErrorResponse();
  }
}
