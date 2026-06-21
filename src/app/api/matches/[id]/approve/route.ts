import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { MATCH_SCORE_ERROR_MESSAGE, isValidMatchScore } from "@/lib/matchRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MatchStatus } from "@/types/enums";
import { reconcileSessionQueueAfterCourtChange } from "../../_lib/reconcileSessionQueue";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:matches:id:approve:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:matches:id:approve");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

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
      return invalidTargetResponse(request, "api:matches:id:approve");
    }
    if (!canQuickAccessClub(session, match.session.communityId)) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return NextResponse.json({ error: "Match not pending approval" }, { status: 400 });
    }

    // Check if admin or one of the players
    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, communityId: match.session.communityId },
      userId: session.user.id,
      acceptedOnly: true,
    });
    const isOperator =
      !isQuickAccessSession(session) &&
      (!!session.user.isAdmin || !!operatorMembership);
    const isPlayer = [
      match.team1User1Id,
      match.team1User2Id,
      match.team2User1Id,
      match.team2User2Id,
    ].includes(session.user.id);

    if (!isOperator && !isPlayer) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }

    let approverIsClaimed = false;
    if (!isOperator) {
      const approver = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isClaimed: true },
      });
      approverIsClaimed = approver?.isClaimed === true;
    }

    const isLegacyPendingMatch = !match.scoreSubmittedByUserId;
    const canApprove = isLegacyPendingMatch
      ? isOperator || isPlayer
      : canApprovePendingSubmission({
          match,
          approverUserId: session.user.id,
          approverIsAdmin: isOperator,
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

    if (isOperator && typeof team1Score === "number" && typeof team2Score === "number") {
      finalTeam1Score = team1Score;
      finalTeam2Score = team2Score;
    }

    if (typeof finalTeam1Score !== "number" || typeof finalTeam2Score !== "number") {
      return NextResponse.json({ error: "Missing match scores" }, { status: 400 });
    }
    if (!isValidMatchScore(finalTeam1Score, finalTeam2Score)) {
      return NextResponse.json(
        { error: MATCH_SCORE_ERROR_MESSAGE },
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
    logError("Approve match error", error);
    return safeErrorResponse();
  }
}
