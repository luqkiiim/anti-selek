import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:matches:id:reopen:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:matches:id:reopen");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        session: {
          select: {
            communityId: true,
          },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(_request, "api:matches:id:reopen");
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return NextResponse.json({ error: "Match is not pending approval" }, { status: 400 });
    }

    let isCommunityAdmin = false;
    if (match.session.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: match.session.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    const isAdmin = !!session.user.isAdmin || isCommunityAdmin;
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can reopen score entry" }, { status: 403 });
    }

    const updatedResult = await prisma.match.updateMany({
      where: { id, status: MatchStatus.PENDING_APPROVAL },
      data: {
        status: MatchStatus.IN_PROGRESS,
        team1Score: null,
        team2Score: null,
        winnerTeam: null,
        team1EloChange: null,
        team2EloChange: null,
        completedAt: null,
        scoreSubmittedByUserId: null,
      },
    });

    if (updatedResult.count === 0) {
      return NextResponse.json(
        { error: "Match was already updated by someone else." },
        { status: 409 }
      );
    }

    const updatedMatch = await prisma.match.findUnique({
      where: { id },
      include: {
        team1User1: { select: { id: true, name: true } },
        team1User2: { select: { id: true, name: true } },
        team2User1: { select: { id: true, name: true } },
        team2User2: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    logError("Reopen score error", error);
    return safeErrorResponse();
  }
}
