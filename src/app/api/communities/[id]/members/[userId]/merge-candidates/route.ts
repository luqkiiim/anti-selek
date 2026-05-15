import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function ensureCanManageCommunity(
  communityId: string,
  userId: string,
  isGlobalAdmin: boolean
) {
  if (isGlobalAdmin) return true;

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });

  return membership?.role === "ADMIN";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:members:userId:merge-candidates:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(
        request,
        "api:communities:id:members:userId:merge-candidates"
      );
    }

    const { id: communityId, userId: sourceUserId } = await params;
    if (
      typeof communityId !== "string" ||
      communityId.length === 0 ||
      typeof sourceUserId !== "string" ||
      sourceUserId.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:members:userId:merge-candidates"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const isGlobalAdmin =
      !!session.user.isAdmin ||
      isGlobalAdminEmail(session.user.email ?? null);
    const canManage = await ensureCanManageCommunity(
      communityId,
      session.user.id,
      isGlobalAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(
        request,
        "api:communities:id:members:userId:merge-candidates"
      );
    }

    const sourceMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: sourceUserId,
        },
      },
      include: {
        user: {
          select: {
            isClaimed: true,
            email: true,
          },
        },
      },
    });
    if (
      !sourceMembership ||
      sourceMembership.user.isClaimed ||
      sourceMembership.user.email !== null
    ) {
      return invalidTargetResponse(
        request,
        "api:communities:id:members:userId:merge-candidates"
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    if (search.length < 2) {
      return NextResponse.json([]);
    }

    const existingMembers = await prisma.communityMember.findMany({
      where: { communityId },
      select: { userId: true },
    });
    const excludedUserIds = Array.from(
      new Set([
        sourceUserId,
        ...existingMembers.map((member) => member.userId),
      ])
    );

    const candidates = await prisma.user.findMany({
      where: {
        id: {
          notIn: excludedUserIds,
        },
        isClaimed: false,
        email: null,
        name: { contains: search },
        communities: { some: {} },
      },
      select: {
        id: true,
        name: true,
        communities: {
          select: {
            elo: true,
            community: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 10,
    });

    return NextResponse.json(
      candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        communities: candidate.communities.map((membership) => ({
          id: membership.community.id,
          name: membership.community.name,
          elo: membership.elo,
        })),
      }))
    );
  } catch (error) {
    logError("List duplicate merge candidates error", error);
    return safeErrorResponse();
  }
}
