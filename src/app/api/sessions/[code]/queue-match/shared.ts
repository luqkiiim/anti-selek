import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import {
  buildMatchmakingState,
  ensureEnoughPlayers,
  getRankedCandidates,
  selectReplacementMatch,
  selectSingleCourtMatch,
} from "../generate-match/selection";
import {
  GenerateMatchError,
  loadSessionRecord,
  loadSessionRecordById,
  type ReshuffleSource,
} from "../generate-match/shared";

type QueueSessionRecord = NonNullable<
  Awaited<ReturnType<typeof loadSessionRecordById>>
>;
type QueueRecord = NonNullable<QueueSessionRecord["queuedMatch"]>;

export function buildQueuedMatchResponse(
  sessionData: QueueSessionRecord,
  queuedMatch: QueueRecord
) {
  const playerById = new Map(
    sessionData.players.map((player) => [player.userId, player.user])
  );
  const team1User1 = playerById.get(queuedMatch.team1User1Id);
  const team1User2 = playerById.get(queuedMatch.team1User2Id);
  const team2User1 = playerById.get(queuedMatch.team2User1Id);
  const team2User2 = playerById.get(queuedMatch.team2User2Id);

  if (!team1User1 || !team1User2 || !team2User1 || !team2User2) {
    throw new Error("Queued match references players missing from the session.");
  }

  return {
    id: queuedMatch.id,
    createdAt: queuedMatch.createdAt,
    targetPool: queuedMatch.targetPool ?? null,
    team1User1,
    team1User2,
    team2User1,
    team2User2,
  };
}

export type QueuedMatchResponse = ReturnType<typeof buildQueuedMatchResponse>;

async function shouldSuppressAutomaticQueueCreation(
  sessionData: QueueSessionRecord
) {
  const activePlayerCount = sessionData.players.filter(
    (player) => !player.isPaused
  ).length;

  if (activePlayerCount !== 8) {
    return false;
  }

  const courtCount = await prisma.court.count({
    where: { sessionId: sessionData.id },
  });

  return courtCount === 1;
}

async function ensureQueueSlotAvailable(sessionData: QueueSessionRecord) {
  if (sessionData.status !== "ACTIVE") {
    throw new GenerateMatchError(400, "Session not active");
  }

  if (sessionData.queuedMatch) {
    throw new GenerateMatchError(409, "A next match is already queued.");
  }

  const courts = await prisma.court.findMany({
    where: { sessionId: sessionData.id },
    select: {
      id: true,
      currentMatchId: true,
    },
  });

  if (courts.some((court) => court.currentMatchId === null)) {
    throw new GenerateMatchError(
      400,
      "Queue next match is only available when all courts are in use."
    );
  }
}

async function createQueuedMatchRecord(
  sessionId: string,
  partition: ManualMatchTeams,
  targetPool?: string | null
) {
  try {
    return await prisma.queuedMatch.create({
      data: {
        sessionId,
        team1User1Id: partition.team1[0],
        team1User2Id: partition.team1[1],
        team2User1Id: partition.team2[0],
        team2User2Id: partition.team2[1],
        targetPool: targetPool ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GenerateMatchError(409, "A next match is already queued.");
    }

    throw error;
  }
}

async function updateQueuedMatchRecord({
  queuedMatchId,
  partition,
  targetPool,
}: {
  queuedMatchId: string;
  partition: ManualMatchTeams;
  targetPool?: string | null;
}) {
  return prisma.queuedMatch.update({
    where: { id: queuedMatchId },
    data: {
      team1User1Id: partition.team1[0],
      team1User2Id: partition.team1[1],
      team2User1Id: partition.team2[0],
      team2User2Id: partition.team2[1],
      targetPool: targetPool ?? null,
    },
  });
}

function getQueuedReshuffleSource(sessionData: QueueSessionRecord): ReshuffleSource {
  if (!sessionData.queuedMatch) {
    throw new GenerateMatchError(400, "No queued match to reshuffle.");
  }

  return {
    ids: [
      sessionData.queuedMatch.team1User1Id,
      sessionData.queuedMatch.team1User2Id,
      sessionData.queuedMatch.team2User1Id,
      sessionData.queuedMatch.team2User2Id,
    ],
    partition: {
      team1: [
        sessionData.queuedMatch.team1User1Id,
        sessionData.queuedMatch.team1User2Id,
      ],
      team2: [
        sessionData.queuedMatch.team2User1Id,
        sessionData.queuedMatch.team2User2Id,
      ],
    },
  };
}

export async function createQueuedMatchForSession(sessionData: QueueSessionRecord) {
  await ensureQueueSlotAvailable(sessionData);

  const { busyPlayerIds, playersById, rotationHistory } =
    await buildMatchmakingState(sessionData);
  const { availableCandidates, rankedCandidates } = getRankedCandidates(
    sessionData,
    busyPlayerIds
  );

  ensureEnoughPlayers(availableCandidates.length, rankedCandidates.length, 1);

  const selection = selectSingleCourtMatch({
    rankedCandidates,
    playersById,
    sessionData,
    rotationHistory,
    reshuffleSource: null,
  });

  const queuedMatch = await createQueuedMatchRecord(
    sessionData.id,
    selection.partition,
    "targetPool" in selection ? selection.targetPool : null
  );

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function reshuffleQueuedMatchForSession(
  sessionData: QueueSessionRecord,
  options?: { excludedUserId?: string }
) {
  if (sessionData.status !== "ACTIVE") {
    throw new GenerateMatchError(400, "Session not active");
  }

  if (!sessionData.queuedMatch) {
    throw new GenerateMatchError(400, "No queued match to reshuffle.");
  }

  const excludedUserId = options?.excludedUserId;
  const reshuffleUserIds = [
    sessionData.queuedMatch.team1User1Id,
    sessionData.queuedMatch.team1User2Id,
    sessionData.queuedMatch.team2User1Id,
    sessionData.queuedMatch.team2User2Id,
  ];

  if (excludedUserId && !reshuffleUserIds.includes(excludedUserId)) {
    throw new GenerateMatchError(
      400,
      "Selected player is not part of the queued match."
    );
  }

  const reshuffleSessionData = {
    ...sessionData,
    queuedMatch: null,
  };
  const { busyPlayerIds, playersById, rotationHistory } =
    await buildMatchmakingState(reshuffleSessionData, {
      reserveQueuedPlayers: false,
    });
  const { availableCandidates, rankedCandidates } = getRankedCandidates(
    reshuffleSessionData,
    busyPlayerIds
  );
  const eligibleAvailableCandidates = excludedUserId
    ? availableCandidates.filter((candidate) => candidate.userId !== excludedUserId)
    : availableCandidates;
  const eligibleRankedCandidates = excludedUserId
    ? rankedCandidates.filter((candidate) => candidate.userId !== excludedUserId)
    : rankedCandidates;

  ensureEnoughPlayers(
    eligibleAvailableCandidates.length,
    eligibleRankedCandidates.length,
    1
  );

  const selection = selectSingleCourtMatch({
    rankedCandidates: eligibleRankedCandidates,
    playersById,
    sessionData: reshuffleSessionData,
    rotationHistory,
    reshuffleSource: getQueuedReshuffleSource(sessionData),
  });
  const queuedMatch = await updateQueuedMatchRecord({
    queuedMatchId: sessionData.queuedMatch.id,
    partition: selection.partition,
    targetPool: "targetPool" in selection ? selection.targetPool : null,
  });

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function replaceQueuedMatchPlayerForSession(
  sessionData: QueueSessionRecord,
  replaceUserId: string
) {
  if (sessionData.status !== "ACTIVE") {
    throw new GenerateMatchError(400, "Session not active");
  }

  if (!sessionData.queuedMatch) {
    throw new GenerateMatchError(400, "No queued match to replace a player in.");
  }

  const currentQueuedUserIds = [
    sessionData.queuedMatch.team1User1Id,
    sessionData.queuedMatch.team1User2Id,
    sessionData.queuedMatch.team2User1Id,
    sessionData.queuedMatch.team2User2Id,
  ];

  if (!currentQueuedUserIds.includes(replaceUserId)) {
    throw new GenerateMatchError(
      400,
      "Selected player is not part of the queued match."
    );
  }

  const retainedUserIds = currentQueuedUserIds.filter(
    (userId) => userId !== replaceUserId
  );

  if (retainedUserIds.length !== 3) {
    throw new GenerateMatchError(
      400,
      "Replace player requires exactly three retained players."
    );
  }

  const replacementSessionData = {
    ...sessionData,
    queuedMatch: null,
  };
  const { busyPlayerIds, playersById } = await buildMatchmakingState(
    replacementSessionData,
    {
      reserveQueuedPlayers: false,
    }
  );
  const { rankedCandidates } = getRankedCandidates(
    replacementSessionData,
    busyPlayerIds
  );
  const replacementSelection = selectReplacementMatch({
    rankedCandidates,
    playersById,
    sessionData: replacementSessionData,
    retainedUserIds: retainedUserIds as [string, string, string],
    excludedUserIds: currentQueuedUserIds,
  });

  const queuedMatch = await updateQueuedMatchRecord({
    queuedMatchId: sessionData.queuedMatch.id,
    partition: replacementSelection.partition,
    targetPool: sessionData.queuedMatch.targetPool ?? null,
  });

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function createManualQueuedMatchForSession(
  sessionData: QueueSessionRecord,
  partition: ManualMatchTeams,
  targetPool?: string | null
) {
  await ensureQueueSlotAvailable(sessionData);
  const queuedMatch = await createQueuedMatchRecord(
    sessionData.id,
    partition,
    targetPool
  );
  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

async function tryRebuildQueuedMatch(
  loadSessionData: () => Promise<QueueSessionRecord | null>
) {
  const sessionData = await loadSessionData();
  if (!sessionData) {
    return null;
  }

  if (sessionData.queuedMatch) {
    return buildQueuedMatchResponse(sessionData, sessionData.queuedMatch);
  }

  if (await shouldSuppressAutomaticQueueCreation(sessionData)) {
    return null;
  }

  try {
    return await createQueuedMatchForSession(sessionData);
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      if (error.status === 409) {
        const reloadedSessionData = await loadSessionData();
        if (reloadedSessionData?.queuedMatch) {
          return buildQueuedMatchResponse(
            reloadedSessionData,
            reloadedSessionData.queuedMatch
          );
        }
      }

      return null;
    }

    throw error;
  }
}

export async function tryRebuildQueuedMatchForCode(code: string) {
  return tryRebuildQueuedMatch(() => loadSessionRecord(code));
}

export async function tryRebuildQueuedMatchForSessionId(sessionId: string) {
  return tryRebuildQueuedMatch(() => loadSessionRecordById(sessionId));
}
