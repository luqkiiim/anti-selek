import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { isValidBadmintonScore } from "@/lib/matchRules";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";
import { reconcileSessionQueueAfterCourtChange } from "../../_lib/reconcileSessionQueue";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        session: {
          select: { communityId: true, type: true, isTest: true },
        },
        team1User1: { select: { id: true, name: true, elo: true } },
        team1User2: { select: { id: true, name: true, elo: true } },
        team2User1: { select: { id: true, name: true, elo: true } },
        team2User2: { select: { id: true, name: true, elo: true } },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return NextResponse.json({ error: "Match not pending approval" }, { status: 400 });
    }

    // Check if admin or one of the players
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
    const isPlayer = [
      match.team1User1Id,
      match.team1User2Id,
      match.team2User1Id,
      match.team2User2Id,
    ].includes(session.user.id);

    if (!isAdmin && !isPlayer) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    let approverIsClaimed = false;
    if (!isAdmin) {
      const approver = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isClaimed: true },
      });
      approverIsClaimed = approver?.isClaimed === true;
    }

    const isLegacyPendingMatch = !match.scoreSubmittedByUserId;
    const canApprove = isLegacyPendingMatch
      ? isAdmin || isPlayer
      : canApprovePendingSubmission({
          match,
          approverUserId: session.user.id,
          approverIsAdmin: isAdmin,
          approverIsClaimed,
          scoreSubmittedByUserId: match.scoreSubmittedByUserId,
        });

    if (!canApprove) {
      return NextResponse.json(
        { error: "Only a claimed opponent or admin can confirm this result" },
        { status: 403 }
      );
    }

    // Allow admin to override scores
    const body = await request.json().catch(() => ({}));
    const { team1Score, team2Score } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
    };
    let finalTeam1Score = match.team1Score;
    let finalTeam2Score = match.team2Score;

    if (isAdmin && typeof team1Score === "number" && typeof team2Score === "number") {
      finalTeam1Score = team1Score;
      finalTeam2Score = team2Score;
    }

    if (typeof finalTeam1Score !== "number" || typeof finalTeam2Score !== "number") {
      return NextResponse.json({ error: "Missing match scores" }, { status: 400 });
    }
    if (!isValidBadmintonScore(finalTeam1Score, finalTeam2Score)) {
      return NextResponse.json(
        { error: "Score must be 21+ win by 2, or 30-29 cap" },
        { status: 400 }
      );
    }

    try {
      const result = await finalizeMatchResult({
        match,
        expectedStatus: MatchStatus.PENDING_APPROVAL,
        finalTeam1Score,
        finalTeam2Score,
      });

      const { autoAssignedMatch, queuedMatchCleared, queuedMatch } =
        await reconcileSessionQueueAfterCourtChange(match.sessionId);

      return NextResponse.json({
        ...result,
        autoAssignedMatch,
        queuedMatchCleared,
        queuedMatch,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ALREADY_PROCESSED") {
        return NextResponse.json({ error: "Match already approved or modified." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error("Approve match error:", error);
    return NextResponse.json({ error: "Failed to approve match" }, { status: 500 });
  }
}
