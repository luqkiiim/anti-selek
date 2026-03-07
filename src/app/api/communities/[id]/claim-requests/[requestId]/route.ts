import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  approveCommunityClaimRequest,
  CommunityClaimError,
} from "@/lib/communityClaims";
import { ClaimRequestStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId, requestId } = await params;
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (membership?.role !== "ADMIN" && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action } = body as { action?: unknown };
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "APPROVE") {
      const approved = await prisma.$transaction((tx) =>
        approveCommunityClaimRequest(tx, {
          communityId,
          requestId,
          reviewerUserId: session.user.id,
        })
      );

      return NextResponse.json(approved);
    }

    const existingRequest = await prisma.claimRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        communityId: true,
        status: true,
      },
    });

    if (!existingRequest || existingRequest.communityId !== communityId) {
      return NextResponse.json({ error: "Claim request not found" }, { status: 404 });
    }

    if (existingRequest.status !== ClaimRequestStatus.PENDING) {
      return NextResponse.json(
        { error: "Claim request is no longer pending" },
        { status: 409 }
      );
    }

    const reviewedAt = new Date();
    const rejected = await prisma.claimRequest.update({
      where: { id: requestId },
      data: {
        status: ClaimRequestStatus.REJECTED,
        reviewedById: session.user.id,
        reviewedAt,
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
      },
    });

    return NextResponse.json(rejected);
  } catch (error) {
    if (error instanceof CommunityClaimError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("Review community claim request error:", error);
    return NextResponse.json(
      { error: "Failed to review claim request" },
      { status: 500 }
    );
  }
}
