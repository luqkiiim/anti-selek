import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const { code } = await params;
    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json(
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
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { status } = body as { status?: unknown };
    if (
      status !== SessionClubStatus.ACCEPTED &&
      status !== SessionClubStatus.REJECTED
    ) {
      return NextResponse.json({ error: "Invalid collab status" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        status: true,
        sessionCommunities: {
          where: {
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.PENDING,
          },
          select: {
            id: true,
            communityId: true,
            community: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!sessionData || sessionData.sessionCommunities.length === 0) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const partnerLink = sessionData.sessionCommunities[0];
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: partnerLink.communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (!session.user.isAdmin && membership?.role !== "ADMIN") {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const updated = await prisma.sessionCommunity.update({
      where: { id: partnerLink.id },
      data: {
        status,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        community: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      id: updated.id,
      communityId: updated.communityId,
      communityName: updated.community.name,
      role: updated.role,
      status: updated.status,
      reviewedAt: updated.reviewedAt,
    });
  } catch (error) {
    logError("Review collab session error", error);
    return safeErrorResponse();
  }
}
