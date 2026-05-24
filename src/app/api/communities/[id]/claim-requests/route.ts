import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClaimableCommunityPlaceholder } from "@/lib/communityClaims";
import { getClaimRequesterEligibility } from "@/lib/communityClaimRules";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { ClaimRequestStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function toClaimRequestResponse(request: {
  id: string;
  communityId: string;
  requesterUserId: string;
  targetUserId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requester: { id: string; name: string; email: string | null };
  target: { id: string; name: string; email: string | null };
  linkedCommunityNames?: string[];
}) {
  return {
    id: request.id,
    communityId: request.communityId,
    requesterUserId: request.requesterUserId,
    requesterName: request.requester.name,
    requesterEmail: request.requester.email,
    targetUserId: request.targetUserId,
    targetName: request.target.name,
    targetEmail: request.target.email,
    status: request.status,
    note: request.note,
    linkedCommunityNames: request.linkedCommunityNames ?? [],
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:claim-requests:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId } = await params;

    if (typeof communityId !== "string" || communityId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:claim-requests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const isQuickAccess = isQuickAccessSession(session);
    const isCommunityAdmin =
      !isQuickAccess && (membership?.role === "ADMIN" || !!session.user.isAdmin);
    if (!membership && !session.user.isAdmin) {
      return invalidTargetResponse(request, "api:communities:id:claim-requests");
    }

    const requests = await prisma.claimRequest.findMany({
      where: isCommunityAdmin
        ? {
            communityId,
            status: ClaimRequestStatus.PENDING,
          }
        : {
            communityId,
            requesterUserId: session.user.id,
            status: ClaimRequestStatus.PENDING,
          },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        target: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const offlineIdentityInfoByUserId = await getOfflineIdentityInfoByUserId(
      prisma,
      requests.map((item) => item.targetUserId)
    );

    return NextResponse.json(
      requests.map((requestItem) =>
        toClaimRequestResponse({
          ...requestItem,
          linkedCommunityNames:
            offlineIdentityInfoByUserId
              .get(requestItem.targetUserId)
              ?.linkedCommunityBadges.map((badge) => badge.name) ?? [],
        })
      )
    );
  } catch (error) {
    logError("List community claim requests error", error);
    return safeErrorResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:claim-requests:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: "Sign up or log in with a full account to request a profile claim" },
        { status: 403 }
      );
    }

    const { id: communityId } = await params;

    if (typeof communityId !== "string" || communityId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:claim-requests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: {
        userId: true,
        elo: true,
      },
    });

    if (!requesterMembership) {
      return NextResponse.json(
        { error: "Join the community before requesting a profile claim" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { targetUserId, note } = body as {
      targetUserId?: unknown;
      note?: unknown;
    };

    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return NextResponse.json({ error: "Target profile is required" }, { status: 400 });
    }
    if (note !== undefined && typeof note !== "string") {
      return NextResponse.json({ error: "Invalid note" }, { status: 400 });
    }

    const trimmedTargetUserId = targetUserId.trim();
    const trimmedNote = typeof note === "string" && note.trim().length > 0 ? note.trim() : null;
    if (trimmedTargetUserId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot claim your own account" },
        { status: 400 }
      );
    }

    const createdRequest = await prisma.$transaction(async (tx) => {
      const [
        requester,
        targetMembership,
        existingRequesterRequest,
        existingTargetRequest,
        existingCommunityHistory,
      ] =
        await Promise.all([
          tx.user.findUnique({
            where: { id: session.user.id },
            select: {
              id: true,
              name: true,
              isClaimed: true,
            },
          }),
          tx.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId,
                userId: trimmedTargetUserId,
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  isClaimed: true,
                },
              },
            },
          }),
          tx.claimRequest.findFirst({
            where: {
              communityId,
              requesterUserId: session.user.id,
              status: ClaimRequestStatus.PENDING,
            },
            select: { id: true },
          }),
          tx.claimRequest.findFirst({
            where: {
              communityId,
              targetUserId: trimmedTargetUserId,
              status: ClaimRequestStatus.PENDING,
            },
            select: { id: true },
          }),
          tx.sessionPlayer.findFirst({
            where: {
              userId: session.user.id,
              session: {
                communityId,
              },
            },
            select: { id: true },
          }),
        ]);

      if (!requester) {
        throw new Error("Requester account not found");
      }

      const requesterEligibility = getClaimRequesterEligibility({
        isClaimed: requester.isClaimed,
        communityElo: requesterMembership.elo,
        hasCommunitySessionHistory: !!existingCommunityHistory,
      });

      if (!requesterEligibility.canRequest) {
        throw new Error(requesterEligibility.reason ?? "Claim request is not allowed");
      }

      if (!targetMembership) {
        throw new Error("Target profile not found in this community");
      }

      if (!isClaimableCommunityPlaceholder(targetMembership.user)) {
        throw new Error("Only unclaimed placeholder profiles without email can be claimed");
      }

      if (existingRequesterRequest) {
        throw new Error("You already have a pending claim request in this community");
      }

      if (existingTargetRequest) {
        throw new Error("This profile already has a pending claim request");
      }

      return tx.claimRequest.create({
        data: {
          communityId,
          requesterUserId: session.user.id,
          targetUserId: trimmedTargetUserId,
          note: trimmedNote,
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          target: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    return NextResponse.json(toClaimRequestResponse(createdRequest), { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Target profile not found in this community") {
        return invalidTargetResponse(request, "api:communities:id:claim-requests");
      }

      const status = (() => {
        if (
          error.message === "You already have a pending claim request in this community" ||
          error.message === "This profile already has a pending claim request"
        ) {
          return 409;
        }
        return 400;
      })();
      return NextResponse.json({ error: error.message }, { status });
    }

    logError("Create community claim request error", error);
    return safeErrorResponse();
  }
}
