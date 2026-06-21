import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { prisma } from "@/lib/prisma";
import { isClaimableClubPlaceholder } from "@/lib/clubClaims";
import { getClaimRequesterEligibility } from "@/lib/clubClaimRules";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { ClaimRequestStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function toClaimRequestResponse(request: {
  id: string;
  clubId: string;
  requesterUserId: string;
  targetUserId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requester: { id: string; name: string; email: string | null };
  target: { id: string; name: string; email: string | null };
  linkedClubNames?: string[];
}) {
  return {
    id: request.id,
    clubId: request.clubId,
    requesterUserId: request.requesterUserId,
    requesterName: request.requester.name,
    requesterEmail: request.requester.email,
    targetUserId: request.targetUserId,
    targetName: request.target.name,
    targetEmail: request.target.email,
    status: request.status,
    note: request.note,
    linkedClubNames: request.linkedClubNames ?? [],
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

    const { id: clubId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:claim-requests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const community = await prisma.club.findUnique({
      where: { id: clubId },
      select: { isTutorial: true },
    });
    if (community?.isTutorial) {
      return NextResponse.json([]);
    }

    const adminAccess = await getClubAdminAccess(prisma, {
      clubId,
      userId: session.user.id,
      isGlobalAdmin: !!session.user.isAdmin,
    });

    const isQuickAccess = isQuickAccessSession(session);
    const isClubAdmin = !isQuickAccess && adminAccess?.canAdmin === true;
    if (!adminAccess || (!adminAccess.membershipRole && !isClubAdmin)) {
      return invalidTargetResponse(request, "api:communities:id:claim-requests");
    }

    const requests = await prisma.claimRequest.findMany({
      where: isClubAdmin
        ? {
            clubId,
            status: ClaimRequestStatus.PENDING,
          }
        : {
            clubId,
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
          linkedClubNames:
            offlineIdentityInfoByUserId
              .get(requestItem.targetUserId)
              ?.linkedClubBadges.map((badge) => badge.name) ?? [],
        })
      )
    );
  } catch (error) {
    logError("List club claim requests error", error);
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

    const { id: clubId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:claim-requests");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const community = await prisma.club.findUnique({
      where: { id: clubId },
      select: { isTutorial: true },
    });
    if (community?.isTutorial) {
      return NextResponse.json(
        { error: "Tutorial playground profiles cannot be claimed" },
        { status: 403 }
      );
    }

    const requesterMembership = await prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
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
        { error: "Join the club before requesting a profile claim" },
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
        existingClubHistory,
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
          tx.clubMember.findUnique({
            where: {
              clubId_userId: {
                clubId,
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
              clubId,
              requesterUserId: session.user.id,
              status: ClaimRequestStatus.PENDING,
            },
            select: { id: true },
          }),
          tx.claimRequest.findFirst({
            where: {
              clubId,
              targetUserId: trimmedTargetUserId,
              status: ClaimRequestStatus.PENDING,
            },
            select: { id: true },
          }),
          tx.sessionPlayer.findFirst({
            where: {
              userId: session.user.id,
              session: {
                clubId,
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
        clubElo: requesterMembership.elo,
        hasClubSessionHistory: !!existingClubHistory,
      });

      if (!requesterEligibility.canRequest) {
        throw new Error(requesterEligibility.reason ?? "Claim request is not allowed");
      }

      if (!targetMembership) {
        throw new Error("Target profile not found in this club");
      }

      if (!isClaimableClubPlaceholder(targetMembership.user)) {
        throw new Error("Only unclaimed placeholder profiles without email can be claimed");
      }

      if (existingRequesterRequest) {
        throw new Error("You already have a pending claim request in this club");
      }

      if (existingTargetRequest) {
        throw new Error("This profile already has a pending claim request");
      }

      return tx.claimRequest.create({
        data: {
          clubId,
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
      if (error.message === "Target profile not found in this club") {
        return invalidTargetResponse(request, "api:communities:id:claim-requests");
      }

      const status = (() => {
        if (
          error.message === "You already have a pending claim request in this club" ||
          error.message === "This profile already has a pending claim request"
        ) {
          return 409;
        }
        return 400;
      })();
      return NextResponse.json({ error: error.message }, { status });
    }

    logError("Create club claim request error", error);
    return safeErrorResponse();
  }
}
