import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { shouldRequireOpponentApproval } from "@/lib/matchApprovalRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessCommunity, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MATCH_SCORE_ERROR_MESSAGE, isValidMatchScore } from "@/lib/matchRules";
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
    const rateLimitResponse = await rateLimit(request, "api:matches:id:score:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:matches:id:score");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { team1Score, team2Score } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
    };

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        courtId: true,
        status: true,
        session: {
          select: {
            communityId: true,
            type: true,
            isTest: true,
          },
        },
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
        team1User1: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team1User2: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team2User1: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team2User2: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }
    if (!canQuickAccessCommunity(session, match.session.communityId)) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, communityId: match.session.communityId },
      userId: session.user.id,
      acceptedOnly: true,
    });

    const isOperator =
      !!session.user.isAdmin || !!operatorMembership;
    const isParticipant = [
      match.team1User1Id,
      match.team1User2Id,
      match.team2User1Id,
      match.team2User2Id,
    ].includes(session.user.id);

    if (!isOperator && !isParticipant) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }

    if (typeof team1Score !== "number" || typeof team2Score !== "number") {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (!isValidMatchScore(team1Score, team2Score)) {
      return NextResponse.json(
        { error: MATCH_SCORE_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    const winnerTeam = team1Score > team2Score ? 1 : 2;
    const claimedByUserId = new Map<string, boolean>([
      [match.team1User1.id, match.team1User1.isClaimed],
      [match.team1User2.id, match.team1User2.isClaimed],
      [match.team2User1.id, match.team2User1.isClaimed],
      [match.team2User2.id, match.team2User2.isClaimed],
    ]);
    const requiresApproval = shouldRequireOpponentApproval({
      match,
      submitterUserId: session.user.id,
      submitterIsAdmin: isOperator,
      claimedByUserId,
    });

    if (!requiresApproval) {
      try {
        const updated = await finalizeMatchResult({
          match,
          expectedStatus: MatchStatus.IN_PROGRESS,
          finalTeam1Score: team1Score,
          finalTeam2Score: team2Score,
          scoreSubmittedByUserId: session.user.id,
        });
        const { autoAssignedMatch, queuedMatchCleared, queuedMatch } =
          await reconcileSessionQueueAfterCourtChange(match.sessionId);
        return NextResponse.json({
          ...updated,
          autoAssignedMatch,
          queuedMatchCleared,
          queuedMatch,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message === "ALREADY_PROCESSED") {
          return NextResponse.json(
            { error: "Match already completed or updated." },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    const updatedResult = await prisma.match.updateMany({
      where: { id, status: MatchStatus.IN_PROGRESS },
      data: {
        team1Score,
        team2Score,
        winnerTeam,
        status: MatchStatus.PENDING_APPROVAL,
        completedAt: new Date(),
        scoreSubmittedByUserId: session.user.id,
      },
    });

    if (updatedResult.count === 0) {
      // Re-fetch to see current status for better error message
      const currentMatch = await prisma.match.findUnique({ where: { id } });
      return NextResponse.json(
        {
          error: `Cannot submit score. Match is currently ${currentMatch?.status || "unknown"}. Expected ${MatchStatus.IN_PROGRESS}.`,
          status: currentMatch?.status,
        },
        { status: 409 }
      );
    }

    // Fetch updated match for the response
    const updated = await prisma.match.findUnique({
      where: { id },
      include: {
        team1User1: { select: { id: true, name: true } },
        team1User2: { select: { id: true, name: true } },
        team2User1: { select: { id: true, name: true } },
        team2User2: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logError("Score submission error", error);
    return safeErrorResponse();
  }
}
