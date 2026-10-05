import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { getOwnedMatchParticipant, shouldRequireOpponentApproval } from "@/lib/matchApprovalRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionMembership, getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MATCH_SCORE_ERROR_MESSAGE, isValidMatchScore } from "@/lib/matchRules";
import { MatchStatus, SessionClubStatus } from "@/types/enums";
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:matches:id:score");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
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
            clubId: true,
            sessionClubs: {
              where: { status: SessionClubStatus.ACCEPTED },
              select: { clubId: true },
            },
            type: true,
            balanceMetric: true,
            isTest: true,
          },
        },
        team1ClubId: true,
        team2ClubId: true,
        team1Player1Id: true,
        team1Player2Id: true,
        team2Player1Id: true,
        team2Player2Id: true,
        team1Player1: {
          select: { id: true, name: true, elo: true, ownerUserId: true },
        },
        team1Player2: {
          select: { id: true, name: true, elo: true, ownerUserId: true },
        },
        team2Player1: {
          select: { id: true, name: true, elo: true, ownerUserId: true },
        },
        team2Player2: {
          select: { id: true, name: true, elo: true, ownerUserId: true },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }
    if (!canQuickAccessClub(session, match.session.clubId)) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, clubId: match.session.clubId },
      userId: session.user.id,
      acceptedOnly: true,
    });

    const isOperator =
      !!session.user.isAdmin || !!operatorMembership;
    const participant = getOwnedMatchParticipant([
      match.team1Player1, match.team1Player2, match.team2Player1, match.team2Player2,
    ], session.user.id);
    let isParticipant = false;
    if (participant) {
      const sessionClubIds = new Set([
        ...(match.session.clubId ? [match.session.clubId] : []),
        ...(match.session.sessionClubs ?? []).map((link) => link.clubId),
      ]);
      if (match.team1ClubId || match.team2ClubId) {
        const isTeam1Participant = [
          match.team1Player1Id,
          match.team1Player2Id,
        ].includes(participant.id);
        const participantClubId = isTeam1Participant
          ? match.team1ClubId
          : match.team2ClubId;
        if (participantClubId && sessionClubIds.has(participantClubId)) {
          const participantClubAccess = await prisma.clubAccess.findUnique({
            where: {
              clubId_userId: {
                clubId: participantClubId,
                userId: session.user.id,
              },
            },
            select: { status: true },
          });
          isParticipant = participantClubAccess?.status === "ACTIVE";
        }
      } else if (sessionClubIds.size === 0) {
        // Legacy clubless sessions have no ClubAccess rows to check.
        isParticipant = true;
      } else {
        const participantMembership = await getSessionMembership(prisma, {
          session: { id: match.sessionId, clubId: match.session.clubId },
          userId: session.user.id,
          acceptedOnly: true,
        });
        isParticipant = !!participantMembership;
      }
    }

    if (!isOperator && !isParticipant) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }

    if (typeof team1Score !== "number" || typeof team2Score !== "number") {
      return sportingJson({ error: "Invalid score" }, { status: 400 });
    }
    if (!isValidMatchScore(team1Score, team2Score)) {
      return sportingJson(
        { error: MATCH_SCORE_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    const winnerTeam = team1Score > team2Score ? 1 : 2;
    const claimedByUserId = new Map<string, boolean>([
      [match.team1Player1.id, !!match.team1Player1.ownerUserId],
      [match.team1Player2.id, !!match.team1Player2.ownerUserId],
      [match.team2Player1.id, !!match.team2Player1.ownerUserId],
      [match.team2Player2.id, !!match.team2Player2.ownerUserId],
    ]);
    const requiresApproval = shouldRequireOpponentApproval({
      match,
      submitterUserId: session.user.id,
      submitterPlayerId: participant?.id ?? null,
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
          scoreSubmittedByPlayerId: participant?.id ?? null,
        });
        const automaticQueueInvalidated =
          !!updated &&
          "automaticQueueInvalidated" in updated &&
          updated.automaticQueueInvalidated === true;
        const { autoAssignedMatch, queuedMatchCleared, queuedMatch } =
          await (automaticQueueInvalidated
            ? reconcileSessionQueueAfterCourtChange(match.sessionId, {
                generateAutomaticIfMissing: true,
              })
            : reconcileSessionQueueAfterCourtChange(match.sessionId));
        return sportingJson({
          ...updated,
          autoAssignedMatch,
          queuedMatchCleared,
          queuedMatch,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message === "ALREADY_PROCESSED") {
          return sportingJson(
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
        scoreSubmittedByPlayerId: participant?.id ?? null,
      },
    });

    if (updatedResult.count === 0) {
      // Re-fetch to see current status for better error message
      const currentMatch = await prisma.match.findUnique({ where: { id } });
      return sportingJson(
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
        team1Player1: { select: { id: true, name: true } },
        team1Player2: { select: { id: true, name: true } },
        team2Player1: { select: { id: true, name: true } },
        team2Player2: { select: { id: true, name: true } },
      },
    });

    return sportingJson(updated);
  } catch (error) {
    logError("Score submission error", error);
    return safeErrorResponse();
  }
}
