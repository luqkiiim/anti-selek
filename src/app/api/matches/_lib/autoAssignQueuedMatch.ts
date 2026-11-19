import { prisma } from "@/lib/prisma";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import { withSessionProfileRatings } from "@/lib/sessionProfileIdentity";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { getEffectiveSessionType } from "@/lib/sessionSettings";
import { SessionType } from "@/types/enums";
import { MatchmakingSearchBudgetExceededError } from "@/lib/matchmaking/v3/searchBudget";
import { rankOpenCourtsForGroupType } from "@/lib/courtGroupRotation";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import {
  createMatchesForAssignments,
  createQueuedMatchAssignment,
  getQueuedMatchAssignmentVersion,
} from "@/app/api/sessions/[code]/generate-match/assignments";
import { buildMatchmakingState } from "@/app/api/sessions/[code]/generate-match/selection";
import { assignAutomaticClubPlayQueue, selectAutomaticMatchForSession } from "@/app/api/sessions/[code]/queue-match/shared";
import { validateManualMatchRequest } from "@/app/api/sessions/[code]/generate-match/manual";
import { GenerateMatchError } from "@/app/api/sessions/[code]/generate-match/shared";
import { getInterclubTeamClubIdsForPartition } from "@/app/api/sessions/[code]/generate-match/interclub";

function canDeferClubPlayAssignment(error: unknown) {
  return error instanceof MatchmakingSearchBudgetExceededError || error instanceof IdentityConflictError ||
    (error instanceof GenerateMatchError && (error.status === 409 || error.status === 400));
}

export async function autoAssignQueuedMatch(
  sessionId: string,
  options?: { generateIfMissing?: boolean }
) {
  const record = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: { player: { select: { id: true, name: true, elo: true } } },
      },
      matches: true,
      sessionClubs: {
        include: {
          club: { select: { id: true, name: true } },
        },
      },
      queuedMatch: true,
      courts: {
        where: { isActive: true },
        include: { currentMatch: true },
      },
    },
  });

  if (!record) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }
  const clubPlay = getEffectiveSessionType(record) === SessionType.CLUB_PLAY;
  const sessionData = withLegacySportingAliases(clubPlay
    ? { ...record, players: await withSessionProfileRatings(prisma, record, record.players) }
    : record);

  if (!sessionData.queuedMatch) {
    if (!options?.generateIfMissing || !sessionData.autoQueueEnabled) {
      return {
        autoAssignedMatch: null,
        queuedMatchCleared: options?.generateIfMissing === true,
      };
    }

    try {
      const selection = await selectAutomaticMatchForSession(sessionData);
      const targetCourt = rankOpenCourtsForGroupType(
        sessionData.courts.filter((court) => !court.currentMatchId),
        sessionData.matches,
        selection.courtGroupType
      )[0];
      if (!targetCourt) {
        return { autoAssignedMatch: null, queuedMatchCleared: true };
      }

      const [autoAssignedMatch] = await createMatchesForAssignments(sessionId, [
        {
          courtId: targetCourt.id,
          selectedIds: selection.selectedIds,
          partition: selection.partition,
          team1ClubId: selection.team1ClubId,
          team2ClubId: selection.team2ClubId,
          matchmakingReasonJson: selection.matchmakingReasonJson,
          courtGroupType: selection.courtGroupType,
          poolASeatCount: selection.poolASeatCount,
          poolBSeatCount: selection.poolBSeatCount,
          clearArrivalPriority: true,
          consumeSkipNextUserIds: selection.consumedSkipUserIds,
        },
      ]);

      return { autoAssignedMatch, queuedMatchCleared: true };
    } catch (error) {
      if (error instanceof GenerateMatchError || (clubPlay && canDeferClubPlayAssignment(error))) {
        return { autoAssignedMatch: null, queuedMatchCleared: true };
      }
      throw error;
    }
  }

  const targetCourt = rankOpenCourtsForGroupType(
    sessionData.courts.filter((court) => !court.currentMatchId),
    sessionData.matches,
    clubPlay ? null : sessionData.queuedMatch.courtGroupType
  )[0];

  if (!targetCourt) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }
  if (clubPlay && sessionData.queuedMatch.isAutomatic) {
    try {
      const autoAssignedMatch = await assignAutomaticClubPlayQueue(sessionData, targetCourt.id);
      return { autoAssignedMatch, queuedMatchCleared: false };
    } catch (error) {
      if (canDeferClubPlayAssignment(error)) {
        return { autoAssignedMatch: null, queuedMatchCleared: false };
      }
      throw error;
    }
  }

  const { busyPlayerIds } = await buildMatchmakingState(sessionData, {
    reserveQueuedPlayers: false,
  });
  const partition = {
    team1: [
      sessionData.queuedMatch.team1Player1Id,
      sessionData.queuedMatch.team1Player2Id,
    ] as [string, string],
    team2: [
      sessionData.queuedMatch.team2Player1Id,
      sessionData.queuedMatch.team2Player2Id,
    ] as [string, string],
  };

  let teamClubIds: { team1ClubId?: string | null; team2ClubId?: string | null } =
    {};

  try {
    validateManualMatchRequest({
      sessionData,
      targetCourt,
      parsedTeams: partition,
      busyPlayerIds,
    });
    teamClubIds = getInterclubTeamClubIdsForPartition(sessionData, partition);
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      await prisma.$transaction(async (tx) => {
        const deletedQueuedMatch = await tx.queuedMatch.deleteMany({
          where: {
            id: sessionData.queuedMatch!.id,
            sessionId,
            ...(clubPlay ? getQueuedMatchAssignmentVersion(sessionData.queuedMatch!) : {}),
          },
        });
        if (
          deletedQueuedMatch.count > 0 &&
          !sessionData.queuedMatch!.isAutomatic
        ) {
          await applyPendingPlayerGroupChangesInTransaction(tx, {
            sessionId,
            userIds: getQueuedMatchUserIds(sessionData.queuedMatch),
          });
        }
      });
      return { autoAssignedMatch: null, queuedMatchCleared: true };
    }

    throw error;
  }

  try {
    const autoAssignedMatch = await createQueuedMatchAssignment({
      sessionId,
      queuedMatchId: sessionData.queuedMatch.id,
      courtId: targetCourt.id,
      partition,
      ...teamClubIds,
      matchmakingReasonJson: sessionData.queuedMatch.matchmakingReasonJson ?? null,
      courtGroupType: sessionData.queuedMatch.courtGroupType,
      poolASeatCount: sessionData.queuedMatch.poolASeatCount,
      poolBSeatCount: sessionData.queuedMatch.poolBSeatCount,
      isAutomatic: sessionData.queuedMatch.isAutomatic,
      ...(clubPlay ? { previousQueue: getQueuedMatchAssignmentVersion(sessionData.queuedMatch) } : {}),
    });
    return { autoAssignedMatch, queuedMatchCleared: false };
  } catch (error) {
    if (clubPlay && canDeferClubPlayAssignment(error)) {
      return { autoAssignedMatch: null, queuedMatchCleared: false };
    }
    throw error;
  }
}
