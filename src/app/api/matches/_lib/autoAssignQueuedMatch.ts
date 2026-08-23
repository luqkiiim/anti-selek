import { prisma } from "@/lib/prisma";
import { rankOpenCourtsForGroupType } from "@/lib/courtGroupRotation";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import {
  createMatchesForAssignments,
  createQueuedMatchAssignment,
} from "@/app/api/sessions/[code]/generate-match/assignments";
import { buildMatchmakingState } from "@/app/api/sessions/[code]/generate-match/selection";
import { selectAutomaticMatchForSession } from "@/app/api/sessions/[code]/queue-match/shared";
import { validateManualMatchRequest } from "@/app/api/sessions/[code]/generate-match/manual";
import { GenerateMatchError } from "@/app/api/sessions/[code]/generate-match/shared";
import { getInterclubTeamClubIdsForPartition } from "@/app/api/sessions/[code]/generate-match/interclub";

export async function autoAssignQueuedMatch(
  sessionId: string,
  options?: { generateIfMissing?: boolean }
) {
  const sessionData = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
      matches: true,
      sessionClubs: {
        include: {
          club: { select: { id: true, name: true } },
        },
      },
      queuedMatch: true,
      courts: {
        include: { currentMatch: true },
      },
    },
  });

  if (!sessionData) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }

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
      if (error instanceof GenerateMatchError) {
        return { autoAssignedMatch: null, queuedMatchCleared: true };
      }
      throw error;
    }
  }

  const targetCourt = rankOpenCourtsForGroupType(
    sessionData.courts.filter((court) => !court.currentMatchId),
    sessionData.matches,
    sessionData.queuedMatch.courtGroupType
  )[0];

  if (!targetCourt) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }

  const { busyPlayerIds } = await buildMatchmakingState(sessionData, {
    reserveQueuedPlayers: false,
  });
  const partition = {
    team1: [
      sessionData.queuedMatch.team1User1Id,
      sessionData.queuedMatch.team1User2Id,
    ] as [string, string],
    team2: [
      sessionData.queuedMatch.team2User1Id,
      sessionData.queuedMatch.team2User2Id,
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
  });

  return { autoAssignedMatch, queuedMatchCleared: false };
}
