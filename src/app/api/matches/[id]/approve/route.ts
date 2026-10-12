import { withMatchLocalClaimLabels } from "@/lib/matchApprovalRules";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { getSessionParticipantOwners } from "@/lib/sessionProfileIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { MATCH_SCORE_ERROR_MESSAGE, isValidMatchScore } from "@/lib/matchRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
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
    const rateLimitResponse = await rateLimit(request, "api:matches:id:approve:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:matches:id:approve");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            clubId: true,
            sessionClubs: {
              where: { status: SessionClubStatus.ACCEPTED },
              select: { clubId: true },
            },
            type: true,
            balanceMetric: true,
            ratingPolicyVersion: true,
            isTest: true,
          },
        },
        team1Player1: { select: { id: true, name: true, elo: true } },
        team1Player2: { select: { id: true, name: true, elo: true } },
        team2Player1: { select: { id: true, name: true, elo: true } },
        team2Player2: { select: { id: true, name: true, elo: true } },
      },
    });

    if (!match) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }
    if (!canQuickAccessClub(session, match.session.clubId)) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return sportingJson({ error: "Match not pending approval" }, { status: 400 });
    }

    // Check if admin or one of the players
    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, clubId: match.session.clubId },
      userId: session.user.id,
      acceptedOnly: true,
    });
    const isOperator =
      !isQuickAccessSession(session) &&
      (!!session.user.isAdmin || !!operatorMembership);
    const participantOwners = await getSessionParticipantOwners(prisma, { id: match.sessionId, clubId: match.session.clubId }, [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id]);
    const ownedIds = [...participantOwners].filter(([, owner]) => owner === session.user.id).map(([id]) => id);
    const participant = ownedIds.length === 1 ? { id: ownedIds[0] } : null;
    const isPlayer = !!participant;

    if (!isOperator && !isPlayer) {
      return invalidTargetResponse(request, "api:matches:id:approve");
    }

    const approverIsClaimed = !!participant;

    const isLegacyPendingMatch = !match.scoreSubmittedByUserId;
    const canApprove = isLegacyPendingMatch
      ? isOperator || isPlayer
      : canApprovePendingSubmission({
          match,
          approverUserId: session.user.id,
          approverPlayerId: participant?.id ?? null,
          approverIsAdmin: isOperator,
          approverIsClaimed,
          scoreSubmittedByUserId: match.scoreSubmittedByUserId,
          scoreSubmittedByPlayerId: match.scoreSubmittedByPlayerId,
        });

    if (!canApprove) {
      return sportingJson(
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
      return sportingJson({ error: "Missing match scores" }, { status: 400 });
    }
    if (!isValidMatchScore(finalTeam1Score, finalTeam2Score)) {
      return sportingJson(
        { error: MATCH_SCORE_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    try {
      const result = await finalizeMatchResult({
        match,
        actorUserId: session.user.id,
        actorIsGlobalAdmin: !!session.user.isAdmin,
        expectedStatus: MatchStatus.PENDING_APPROVAL,
        finalTeam1Score,
        finalTeam2Score,
      });

      const automaticQueueInvalidated =
        !!result &&
        "automaticQueueInvalidated" in result &&
        result.automaticQueueInvalidated === true;
      const { autoAssignedMatch, queuedMatchCleared, queuedMatch } =
        await (automaticQueueInvalidated
          ? reconcileSessionQueueAfterCourtChange(match.sessionId, {
              generateAutomaticIfMissing: true,
            })
          : reconcileSessionQueueAfterCourtChange(match.sessionId));

      return sportingJson({
        ...withMatchLocalClaimLabels(result, participantOwners),
        autoAssignedMatch,
        queuedMatchCleared,
        queuedMatch,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ALREADY_PROCESSED") {
        return sportingJson({ error: "Match already approved or modified." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof IdentityConflictError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Approve match error", error);
    return safeErrorResponse();
  }
}
