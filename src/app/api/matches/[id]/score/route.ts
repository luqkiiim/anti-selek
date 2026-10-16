import { withMatchLocalClaimLabels } from "@/lib/matchApprovalRules";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { getSessionParticipantOwners } from "@/lib/sessionProfileIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { bumpSessionResultsRevision, finalizeMatchResult } from "@/lib/matchCompletion";
import { shouldRequireOpponentApproval } from "@/lib/matchApprovalRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MATCH_SCORE_ERROR_MESSAGE, SERIES_SCORE_ERROR_MESSAGE, resolveMatchScoreInput } from "@/lib/matchRules";
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

    const { team1Score, team2Score, gameScores, finalize, scoreRevision } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
      gameScores?: unknown;
      finalize?: unknown;
      scoreRevision?: unknown;
    };

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        courtId: true,
        status: true,
        scoringFormat: true,
        gameScoresJson: true,
        scoreRevision: true,
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
            ratingMode: true,
            collaborationVersion: true,
            status: true,
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
          select: { id: true, name: true, elo: true },
        },
        team1Player2: {
          select: { id: true, name: true, elo: true },
        },
        team2Player1: {
          select: { id: true, name: true, elo: true },
        },
        team2Player2: {
          select: { id: true, name: true, elo: true },
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
    const participantOwners = await getSessionParticipantOwners(prisma, { id: match.sessionId, clubId: match.session.clubId }, [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id]);
    const ownedIds = [...participantOwners].filter(([, owner]) => owner === session.user.id).map(([id]) => id);
    const participant = ownedIds.length === 1 ? { id: ownedIds[0] } : null;
    const isParticipant = !!participant;

    if (!isOperator && !isParticipant) {
      return invalidTargetResponse(request, "api:matches:id:score");
    }

    if (finalize !== undefined && typeof finalize !== "boolean") return sportingJson({ error: "Invalid finalize option" }, { status: 400 });
    if ((match.session.collaborationVersion ?? 1) >= 2 && scoreRevision === undefined) return sportingJson({ error: "Refresh the match before saving its score." }, { status: 409 });
    if (scoreRevision !== undefined && (!Number.isSafeInteger(scoreRevision) || (scoreRevision as number) < 0)) return sportingJson({ error: "Invalid score revision" }, { status: 400 });
    if (typeof scoreRevision === "number" && scoreRevision !== match.scoreRevision) return sportingJson({ error: "This score changed. Refresh before saving." }, { status: 409 });
    if (match.session.status && match.session.status !== "ACTIVE") return sportingJson({ error: "Only active tournaments can record scores" }, { status: 409 });
    const saveDraft = finalize === false;
    if (saveDraft && match.scoringFormat !== "BEST_OF_THREE") return sportingJson({ error: "Progress saving is available for best of three" }, { status: 400 });
    const result = resolveMatchScoreInput({ scoringFormat: match.scoringFormat, team1Score, team2Score, gameScores }, { allowIncomplete: saveDraft });
    if (!result) return sportingJson({ error: match.scoringFormat === "BEST_OF_THREE" ? SERIES_SCORE_ERROR_MESSAGE : MATCH_SCORE_ERROR_MESSAGE }, { status: 400 });
    const winnerTeam = result.winnerTeam;
    const claimedByUserId = new Map([...participantOwners].map(([id, owner]) => [id, !!owner]));
    const requiresApproval = shouldRequireOpponentApproval({
      match,
      submitterUserId: session.user.id,
      submitterPlayerId: participant?.id ?? null,
      submitterIsAdmin: isOperator,
      claimedByUserId,
    });

    if (!requiresApproval && !saveDraft) {
      try {
        const updated = await finalizeMatchResult({
          match,
          actorUserId: session.user.id,
          actorIsGlobalAdmin: !!session.user.isAdmin,
          expectedStatus: MatchStatus.IN_PROGRESS,
          finalTeam1Score: result.team1Score,
          finalTeam2Score: result.team2Score,
          finalGameScores: match.scoringFormat === "BEST_OF_THREE" ? result.gameScores : undefined,
          expectedScoreRevision: typeof scoreRevision === "number" ? scoreRevision : match.scoreRevision,
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
          ...withMatchLocalClaimLabels(updated, participantOwners),
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

    const updatedResult = await admissionTransaction(prisma, async tx => {
      const freshOperator = session.user.isAdmin || await getSessionOperatorMembership(tx, { session: { id: match.sessionId, clubId: match.session.clubId }, userId: session.user.id, acceptedOnly: true });
      const freshOwners = await getSessionParticipantOwners(tx, { id: match.sessionId, clubId: match.session.clubId }, [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id]);
      if (!freshOperator && (!participant || freshOwners.get(participant.id) !== session.user.id)) throw new IdentityConflictError("Your ownership or club access changed. Refresh before submitting the score.");
      const changed = await tx.match.updateMany({
      where: { id, status: MatchStatus.IN_PROGRESS, ...(match.scoreRevision !== undefined ? { scoreRevision: typeof scoreRevision === "number" ? scoreRevision : match.scoreRevision } : {}) },
      data: {
        team1Score: result.team1Score,
        team2Score: result.team2Score,
        ...(match.scoringFormat === "BEST_OF_THREE" ? { gameScoresJson: JSON.stringify(result.gameScores) } : {}),
        scoreRevision: { increment: 1 },
        winnerTeam: saveDraft ? null : winnerTeam,
        status: saveDraft ? MatchStatus.IN_PROGRESS : MatchStatus.PENDING_APPROVAL,
        completedAt: saveDraft ? null : new Date(),
        scoreSubmittedByUserId: session.user.id,
        scoreSubmittedByPlayerId: participant?.id ?? null,
      },
    });
      if (changed.count > 0) await bumpSessionResultsRevision(tx, match.sessionId);
      return changed;
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

    return sportingJson(withMatchLocalClaimLabels(updated, participantOwners));
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Score submission error", error);
    return safeErrorResponse();
  }
}
