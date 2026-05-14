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
import { CommunityPlayerStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

function isValidCommunityPlayerStatus(
  value: unknown
): value is CommunityPlayerStatus {
  return (
    value === CommunityPlayerStatus.CORE ||
    value === CommunityPlayerStatus.OCCASIONAL
  );
}

async function ensureCanManageCommunity(communityId: string, userId: string) {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:members:link:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:communities:id:members:link");
    }

    const { id: communityId } = await params;
    if (typeof communityId !== "string" || communityId.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:members:link"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManage =
      !!session.user.isAdmin ||
      (await ensureCanManageCommunity(communityId, session.user.id));
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:members:link");
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const existingMembers = await prisma.communityMember.findMany({
      where: { communityId },
      select: { userId: true },
    });
    const existingUserIds = new Set(existingMembers.map((member) => member.userId));

    const candidates = await prisma.user.findMany({
      where: {
        isClaimed: false,
        id: { notIn: Array.from(existingUserIds) },
        ...(search.length > 0 ? { name: { contains: search } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
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
      take: 30,
    });

    return NextResponse.json(
      candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        gender: candidate.gender,
        partnerPreference: candidate.partnerPreference,
        mixedSideOverride: candidate.mixedSideOverride,
        communities: candidate.communities.map((membership) => ({
          id: membership.community.id,
          name: membership.community.name,
          elo: membership.elo,
        })),
      }))
    );
  } catch (error) {
    logError("List linkable players error", error);
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
      "api:communities:id:members:link:post",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:communities:id:members:link");
    }

    const { id: communityId } = await params;
    if (typeof communityId !== "string" || communityId.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:members:link"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const canManage =
      !!session.user.isAdmin ||
      (await ensureCanManageCommunity(communityId, session.user.id));
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:members:link");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { userId, status } = body as {
      userId?: unknown;
      status?: unknown;
    };
    if (typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Player is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });
    if (!user || user.isClaimed) {
      return invalidTargetResponse(request, "api:communities:id:members:link");
    }

    const membership = await prisma.communityMember.create({
      data: {
        communityId,
        userId,
        role: "MEMBER",
        status: isValidCommunityPlayerStatus(status)
          ? status
          : CommunityPlayerStatus.CORE,
      },
      select: {
        role: true,
        elo: true,
        status: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      status:
        membership.status === CommunityPlayerStatus.OCCASIONAL
          ? CommunityPlayerStatus.OCCASIONAL
          : CommunityPlayerStatus.CORE,
      gender: user.gender,
      partnerPreference: user.partnerPreference,
      mixedSideOverride: user.mixedSideOverride,
      elo: membership.elo,
      isActive: user.isActive,
      isClaimed: user.isClaimed,
      createdAt: user.createdAt,
      role: membership.role,
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "Player already belongs to this community" },
        { status: 409 }
      );
    }

    logError("Link player into community error", error);
    return safeErrorResponse();
  }
}
