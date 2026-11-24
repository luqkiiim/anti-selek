import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getClearCourtsNextUp,
  isClearableCourtMatch,
  matchesClearCourtsNextUp,
  matchesClearCourtsTargets,
  type ClearCourtsRequest,
  type ClearCourtsResponse,
} from "@/lib/clearSessionCourts";
import { ClubAdmissionError } from "@/lib/clubAdmissions";
import { logError, safeErrorResponse } from "@/lib/errors";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { checkInvalidTargetRateLimit, invalidTargetResponse, rateLimit } from "@/lib/rateLimit";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { collaborationEvent, isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { sessionMatchMutationTransaction, type SessionMutationActor } from "@/lib/sessionProfileIdentity";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { sportingJson } from "@/lib/sportingResponse";
import { GenerateMatchError } from "../../generate-match/shared";

const clearCourtsRequest = z.object({
  courts: z.array(z.object({
    courtId: z.string().min(1),
    matchId: z.string().min(1),
    scoreRevision: z.int().nonnegative(),
  })).min(1).refine(courts => new Set(courts.map(court => court.courtId)).size === courts.length),
  nextUp: z.object({
    id: z.string().min(1),
    playerIds: z.array(z.string().min(1)).length(4),
  }).nullable(),
}) satisfies z.ZodType<ClearCourtsRequest>;

function clearCourts(sessionId: string, actor: SessionMutationActor, expected: ClearCourtsRequest) {
  return sessionMatchMutationTransaction(prisma, sessionId, actor, async (tx): Promise<ClearCourtsResponse> => {
    const session = await tx.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        collaborationVersion: true,
        courts: { where: { isActive: true }, select: { id: true, currentMatch: true } },
        queuedMatch: true,
      },
    });
    const assignments = session.courts.flatMap(court =>
      court.currentMatch ? [{ courtId: court.id, match: court.currentMatch }] : [],
    );
    const assignmentsToClear = assignments.filter(({ match }) => isClearableCourtMatch(match.status));
    const clearTargets = assignmentsToClear.map(({ courtId, match }) => ({
      courtId, matchId: match.id, scoreRevision: match.scoreRevision,
    }));
    // Typed queues being repaired are hidden from the session view.
    const visibleNextUp = session.queuedMatch?.refreshToken ? null : getClearCourtsNextUp(session.queuedMatch);

    if (assignmentsToClear.some(({ courtId, match }) => match.courtId !== courtId || match.sessionId !== sessionId) ||
        !matchesClearCourtsTargets(expected.courts, clearTargets) ||
        !matchesClearCourtsNextUp(expected.nextUp, visibleNextUp)) {
      throw new GenerateMatchError(409, "A court, score, or the Next up match changed. Reopen the confirmation to review.");
    }

    const matchIds = clearTargets.map(target => target.matchId);
    const upgraded = isUpgradedCollaboration(session);
    if (upgraded) {
      await tx.sessionLineupRow.updateMany({
        where: { sessionId, matchId: { in: matchIds } },
        data: { matchId: null, revision: { increment: 1 }, hostConfirmedRevision: null, partnerConfirmedRevision: null },
      });
    }
    await tx.court.updateMany({
      where: { sessionId, isActive: true, currentMatchId: { in: matchIds } },
      data: { currentMatchId: null },
    });
    await tx.match.deleteMany({ where: { sessionId, id: { in: matchIds } } });
    if (session.queuedMatch) await tx.queuedMatch.delete({ where: { id: session.queuedMatch.id } });

    const occupiedPlayerIds = new Set(assignments
      .filter(({ match }) => !isClearableCourtMatch(match.status))
      .flatMap(({ match }) => getQueuedMatchUserIds(match)));
    const releasedPlayerIds = [...assignmentsToClear.map(({ match }) => match), session.queuedMatch]
      .flatMap(getQueuedMatchUserIds)
      .filter(playerId => !occupiedPlayerIds.has(playerId));
    await applyPendingPlayerGroupChangesInTransaction(tx, { sessionId, userIds: releasedPlayerIds });

    const clearedCourts = clearTargets.map(({ courtId, matchId }) => ({ courtId, matchId }));
    if (upgraded) {
      await tx.session.update({ where: { id: sessionId }, data: { resultsRevision: { increment: 1 } } });
      for (const { matchId } of clearedCourts) await collaborationEvent(tx, sessionId, actor.userId, "undoMatch", { matchId });
    }
    return { clearedCourts, queuedMatch: null };
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rateLimitKey = "api:sessions:code:courts:clear";
  try {
    const limited = await rateLimit(request, rateLimitKey, { limit: 15, windowMs: 60_000 });
    if (limited) return limited;

    const viewer = await auth();
    if (!viewer?.user?.id) return sportingJson({ error: "Not authenticated" }, { status: 401 });

    const { code } = await params;
    const invalidTargetLimit = await checkInvalidTargetRateLimit(request, rateLimitKey);
    if (invalidTargetLimit) return invalidTargetLimit;

    const parsed = clearCourtsRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return sportingJson({ error: "Invalid court confirmation." }, { status: 400 });

    const session = await prisma.session.findUnique({ where: { code }, select: { id: true, clubId: true } });
    const actor = { userId: viewer.user.id, isGlobalAdmin: !!viewer.user.isAdmin };
    if (!session || (!actor.isGlobalAdmin && !await getSessionOperatorMembership(prisma, { session, userId: actor.userId, acceptedOnly: true }))) {
      return invalidTargetResponse(request, rateLimitKey);
    }

    return sportingJson(await clearCourts(session.id, actor, parsed.data));
  } catch (error) {
    if (error instanceof GenerateMatchError || error instanceof ClubAdmissionError) {
      return sportingJson({ error: error.message }, { status: 409 });
    }
    logError("Clear all courts error", error);
    return safeErrorResponse();
  }
}
