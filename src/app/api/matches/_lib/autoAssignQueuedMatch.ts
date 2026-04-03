import { prisma } from "@/lib/prisma";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { createQueuedMatchAssignment } from "@/app/api/sessions/[code]/generate-match/assignments";
import {
  applyPoolSelectionOutcome,
  buildMatchmakingState,
} from "@/app/api/sessions/[code]/generate-match/selection";
import { validateManualMatchRequest } from "@/app/api/sessions/[code]/generate-match/manual";
import { GenerateMatchError } from "@/app/api/sessions/[code]/generate-match/shared";
import { SessionPool } from "@/types/enums";

export async function autoAssignQueuedMatch(sessionId: string) {
  const sessionData = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
      matches: true,
      queuedMatch: true,
      courts: {
        include: { currentMatch: true },
      },
    },
  });

  if (!sessionData?.queuedMatch) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }

  const targetCourt = sessionData.courts
    .filter((court) => !court.currentMatchId)
    .sort((left, right) => left.courtNumber - right.courtNumber)[0];

  if (!targetCourt) {
    return { autoAssignedMatch: null, queuedMatchCleared: false };
  }

  const { playersById, rotationHistory } = await buildMatchmakingState(
    sessionData,
    { reserveQueuedPlayers: false }
  );
  const busyPlayerIds = getBusyPlayerIds(sessionData.matches);
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

  try {
    validateManualMatchRequest({
      sessionData,
      targetCourt,
      parsedTeams: partition,
      busyPlayerIds,
      playersById,
      rotationHistory,
    });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      await prisma.queuedMatch.deleteMany({
        where: {
          id: sessionData.queuedMatch.id,
          sessionId,
        },
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
  });

  if (sessionData.poolsEnabled && sessionData.queuedMatch.targetPool) {
    const nextPoolState = applyPoolSelectionOutcome(sessionData, {
      targetPool: sessionData.queuedMatch.targetPool as SessionPool,
      missedPool: null,
    });
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        poolACourtAssignments: nextPoolState.poolACourtAssignments,
        poolBCourtAssignments: nextPoolState.poolBCourtAssignments,
        poolAMissedTurns: nextPoolState.poolAMissedTurns,
        poolBMissedTurns: nextPoolState.poolBMissedTurns,
      },
    });
  }

  return { autoAssignedMatch, queuedMatchCleared: false };
}
