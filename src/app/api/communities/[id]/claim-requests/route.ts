import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClaimableCommunityPlaceholder } from "@/lib/communityClaims";
import { ClaimRequestStatus } from "@/types/enums";

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
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId } = await params;
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const isCommunityAdmin = membership?.role === "ADMIN" || !!session.user.isAdmin;
    if (!membership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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

    return NextResponse.json(requests.map(toClaimRequestResponse));
  } catch (error) {
    console.error("List community claim requests error:", error);
    return NextResponse.json(
      { error: "Failed to load claim requests" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId } = await params;
    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: { userId: true },
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
      const [requester, targetMembership, existingRequesterRequest, existingTargetRequest] =
        await Promise.all([
          tx.user.findUnique({
            where: { id: session.user.id },
            select: {
              id: true,
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
        ]);

      if (!requester?.isClaimed) {
        throw new Error("Only claimed accounts can request a profile merge");
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
      const status =
        error.message === "Target profile not found in this community"
          ? 404
          : error.message.includes("claim")
            ? 409
            : 400;
      if (
        error.message === "Only claimed accounts can request a profile merge" ||
        error.message === "Only unclaimed placeholder profiles without email can be claimed"
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error("Create community claim request error:", error);
    return NextResponse.json(
      { error: "Failed to create claim request" },
      { status: 500 }
    );
  }
}
