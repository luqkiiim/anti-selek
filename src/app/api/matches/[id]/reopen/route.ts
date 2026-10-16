import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { assertSessionMutationActor, assertSessionProfileContextsUnambiguous } from "@/lib/sessionProfileIdentity";
import { bumpSessionResultsRevision } from "@/lib/matchCompletion";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:matches:id:reopen");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        status: true,
        scoreRevision: true,
        session: {
          select: {
            clubId: true,
            ratingPolicyVersion: true,
            collaborationVersion: true,
          },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(_request, "api:matches:id:reopen");
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return sportingJson({ error: "Match is not pending approval" }, { status: 400 });
    }

    const body = await _request.json().catch(() => ({}));
    const scoreRevision = body && typeof body === "object" ? body.scoreRevision : undefined;
    if ((match.session.collaborationVersion ?? 1) >= 2 && scoreRevision === undefined) return sportingJson({ error: "Refresh the match before reopening its score." }, { status: 409 });
    if (scoreRevision !== undefined && (!Number.isSafeInteger(scoreRevision) || scoreRevision !== match.scoreRevision)) return sportingJson({ error: "This score changed. Refresh before reopening." }, { status: 409 });

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, clubId: match.session.clubId },
      userId: session.user.id,
      acceptedOnly: true,
    });

    const canOperate = !!session.user.isAdmin || !!operatorMembership;
    if (!canOperate) {
      return sportingJson({ error: "Only admins or staff can reopen score entry" }, { status: 403 });
    }

    const updatedResult = await admissionTransaction(prisma, async tx => {
      await assertSessionMutationActor(tx, { session: { id: match.sessionId, ...match.session }, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
      await assertSessionProfileContextsUnambiguous(tx, { id: match.sessionId, ...match.session });
      const changed = await tx.match.updateMany({
      where: { id, status: MatchStatus.PENDING_APPROVAL, ...(match.scoreRevision !== undefined ? { scoreRevision: match.scoreRevision } : {}) },
      data: {
        status: MatchStatus.IN_PROGRESS,
        gameScoresJson: null,
        scoreRevision: { increment: 1 },
        team1Score: null,
        team2Score: null,
        winnerTeam: null,
        team1EloChange: null,
        team2EloChange: null,
        completedAt: null,
        scoreSubmittedByUserId: null,
        scoreSubmittedByPlayerId: null,
      },
    });
      if (changed.count > 0) await bumpSessionResultsRevision(tx, match.sessionId);
      return changed;
    });

    if (updatedResult.count === 0) {
      return sportingJson(
        { error: "Match was already updated by someone else." },
        { status: 409 }
      );
    }

    const updatedMatch = await prisma.match.findUnique({
      where: { id },
      include: {
        team1Player1: { select: { id: true, name: true } },
        team1Player2: { select: { id: true, name: true } },
        team2Player1: { select: { id: true, name: true } },
        team2Player2: { select: { id: true, name: true } },
      },
    });

    return sportingJson(updatedMatch);
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Reopen score error", error);
    return safeErrorResponse();
  }
}
