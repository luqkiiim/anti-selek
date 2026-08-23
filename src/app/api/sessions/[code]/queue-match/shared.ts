import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import { parseMatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { classifyCourtGroupSnapshot } from "@/lib/playerGroups";
import { buildSessionPoolMap } from "@/lib/sessionPools";
import { consumeSkipNextMatches } from "@/lib/sessionSkipNext";
import type { CourtGroupType } from "@/types/enums";
import {
  buildMatchmakingState,
  ensureEnoughPlayers,
  getRankedCandidates,
  selectReplacementMatchRespectingSkips,
  selectSingleCourtMatchRespectingSkips,
} from "../generate-match/selection";
import {
  GenerateMatchError,
  loadSessionRecord,
  loadSessionRecordById,
  type ReshuffleSource,
} from "../generate-match/shared";

export type QueueSessionRecord = NonNullable<
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
    throw new Error(
      "Queued match references players missing from the tournament."
    );
  }

  return {
    id: queuedMatch.id,
    createdAt: queuedMatch.createdAt,
    targetPool: queuedMatch.targetPool ?? null,
    courtGroupType: queuedMatch.courtGroupType ?? null,
    poolASeatCount: queuedMatch.poolASeatCount ?? null,
    poolBSeatCount: queuedMatch.poolBSeatCount ?? null,
    isAutomatic: queuedMatch.isAutomatic,
    team1ClubId: queuedMatch.team1ClubId ?? null,
    team2ClubId: queuedMatch.team2ClubId ?? null,
    matchmakingReason: parseMatchmakingReasonJson(
      queuedMatch.matchmakingReasonJson
    ),
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
  if (!sessionData.autoQueueEnabled) {
    return true;
  }

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
    throw new GenerateMatchError(400, "Tournament not active");
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

interface QueuedMatchRecordInput {
  sessionId: string;
  partition: ManualMatchTeams;
  targetPool?: string | null;
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  isAutomatic: boolean;
  matchmakingReasonJson?: string | null;
  teamClubIds?: { team1ClubId?: string | null; team2ClubId?: string | null };
  consumeSkipNextUserIds?: string[];
}

async function resolveQueuedGroupSnapshot(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  {
    sessionId,
    partition,
    isAutomatic,
    courtGroupType,
    poolASeatCount,
    poolBSeatCount,
  }: Pick<
    QueuedMatchRecordInput,
    | "sessionId"
    | "partition"
    | "isAutomatic"
    | "courtGroupType"
    | "poolASeatCount"
    | "poolBSeatCount"
  >
) {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { poolsEnabled: true },
  });
  if (!session) {
    throw new GenerateMatchError(404, "Tournament not found");
  }
  if (!session.poolsEnabled) return null;

  const selectedUserIds = [
    partition.team1[0],
    partition.team1[1],
    partition.team2[0],
    partition.team2[1],
  ];
  const selectedPlayers = await tx.sessionPlayer.findMany({
    where: { sessionId, userId: { in: selectedUserIds } },
    select: { userId: true, pool: true },
  });
  if (
    selectedPlayers.length !== selectedUserIds.length ||
    new Set(selectedPlayers.map((player) => player.userId)).size !==
      selectedUserIds.length
  ) {
    throw new GenerateMatchError(
      409,
      "The queued lineup changed while it was being created. Please retry."
    );
  }

  const currentSnapshot = classifyCourtGroupSnapshot(
    partition.team1,
    partition.team2,
    buildSessionPoolMap(
      selectedPlayers,
      (player) => player.userId,
      (player) => player.pool
    )
  );

  if (
    isAutomatic &&
    (courtGroupType !== currentSnapshot.courtGroupType ||
      poolASeatCount !== currentSnapshot.poolASeatCount ||
      poolBSeatCount !== currentSnapshot.poolBSeatCount)
  ) {
    throw new GenerateMatchError(
      409,
      "Player groups changed while the next match was being queued. Please retry."
    );
  }

  return currentSnapshot;
}

async function createQueuedMatchRecord({
  sessionId,
  partition,
  targetPool,
  courtGroupType,
  poolASeatCount,
  poolBSeatCount,
  isAutomatic,
  matchmakingReasonJson,
  teamClubIds,
  consumeSkipNextUserIds = [],
}: QueuedMatchRecordInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const groupSnapshot = await resolveQueuedGroupSnapshot(tx, {
        sessionId,
        partition,
        isAutomatic,
        courtGroupType,
        poolASeatCount,
        poolBSeatCount,
      });
      const queuedMatch = await tx.queuedMatch.create({
        data: {
          sessionId,
          team1User1Id: partition.team1[0],
          team1User2Id: partition.team1[1],
          team1ClubId: teamClubIds?.team1ClubId ?? null,
          team2User1Id: partition.team2[0],
          team2User2Id: partition.team2[1],
          team2ClubId: teamClubIds?.team2ClubId ?? null,
          targetPool: targetPool ?? null,
          courtGroupType: groupSnapshot?.courtGroupType ?? null,
          poolASeatCount: groupSnapshot?.poolASeatCount ?? null,
          poolBSeatCount: groupSnapshot?.poolBSeatCount ?? null,
          isAutomatic,
          matchmakingReasonJson: matchmakingReasonJson ?? null,
        },
      });

      await consumeSkipNextMatches(tx, {
        sessionId,
        userIds: consumeSkipNextUserIds,
      });

      return queuedMatch;
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

export async function selectAutomaticMatchForSession(
  sessionData: QueueSessionRecord
) {
  const { busyPlayerIds, playersById, rotationHistory } =
    await buildMatchmakingState(sessionData);
  const { availableCandidates, rankedCandidates } = getRankedCandidates(
    sessionData,
    busyPlayerIds
  );

  ensureEnoughPlayers(availableCandidates.length, rankedCandidates.length, 1);

  const { selection, consumedSkipUserIds } = selectSingleCourtMatchRespectingSkips({
    rankedCandidates,
    playersById,
    sessionData,
    rotationHistory,
    reshuffleSource: null,
  });

  return {
    selectedIds: [
      selection.partition.team1[0],
      selection.partition.team1[1],
      selection.partition.team2[0],
      selection.partition.team2[1],
    ],
    partition: selection.partition,
    targetPool: "targetPool" in selection ? selection.targetPool : null,
    courtGroupType:
      "courtGroupType" in selection ? selection.courtGroupType : null,
    poolASeatCount:
      "poolASeatCount" in selection ? selection.poolASeatCount : null,
    poolBSeatCount:
      "poolBSeatCount" in selection ? selection.poolBSeatCount : null,
    team1ClubId: "team1ClubId" in selection ? selection.team1ClubId : null,
    team2ClubId: "team2ClubId" in selection ? selection.team2ClubId : null,
    matchmakingReasonJson: selection.matchmakingReasonJson ?? null,
    consumedSkipUserIds,
  };
}

async function updateQueuedMatchRecord({
  sessionId,
  queuedMatchId,
  partition,
  targetPool,
  courtGroupType,
  poolASeatCount,
  poolBSeatCount,
  isAutomatic,
  matchmakingReasonJson,
  team1ClubId,
  team2ClubId,
  consumeSkipNextUserIds = [],
  releasePendingUserIds = [],
}: {
  sessionId: string;
  queuedMatchId: string;
  partition: ManualMatchTeams;
  targetPool?: string | null;
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  isAutomatic: boolean;
  matchmakingReasonJson?: string | null;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  consumeSkipNextUserIds?: string[];
  releasePendingUserIds?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const groupSnapshot = await resolveQueuedGroupSnapshot(tx, {
      sessionId,
      partition,
      isAutomatic,
      courtGroupType,
      poolASeatCount,
      poolBSeatCount,
    });
    const queuedMatch = await tx.queuedMatch.update({
      where: { id: queuedMatchId },
      data: {
        team1User1Id: partition.team1[0],
        team1User2Id: partition.team1[1],
        team1ClubId: team1ClubId ?? null,
        team2User1Id: partition.team2[0],
        team2User2Id: partition.team2[1],
        team2ClubId: team2ClubId ?? null,
        targetPool: targetPool ?? null,
        courtGroupType: groupSnapshot?.courtGroupType ?? null,
        poolASeatCount: groupSnapshot?.poolASeatCount ?? null,
        poolBSeatCount: groupSnapshot?.poolBSeatCount ?? null,
        isAutomatic,
        matchmakingReasonJson: matchmakingReasonJson ?? null,
      },
    });

    await consumeSkipNextMatches(tx, {
      sessionId: queuedMatch.sessionId,
      userIds: consumeSkipNextUserIds,
    });

    await applyPendingPlayerGroupChangesInTransaction(tx, {
      sessionId: queuedMatch.sessionId,
      userIds: releasePendingUserIds,
    });

    return queuedMatch;
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

  const selection = await selectAutomaticMatchForSession(sessionData);
  const queuedMatch = await createQueuedMatchRecord({
    sessionId: sessionData.id,
    partition: selection.partition,
    targetPool: selection.targetPool,
    courtGroupType: selection.courtGroupType,
    poolASeatCount: selection.poolASeatCount,
    poolBSeatCount: selection.poolBSeatCount,
    isAutomatic: true,
    matchmakingReasonJson: selection.matchmakingReasonJson ?? null,
    teamClubIds: {
      team1ClubId: selection.team1ClubId,
      team2ClubId: selection.team2ClubId,
    },
    consumeSkipNextUserIds: selection.consumedSkipUserIds,
  });

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function reshuffleQueuedMatchForSession(
  sessionData: QueueSessionRecord,
  options?: { excludedUserId?: string }
) {
  if (sessionData.status !== "ACTIVE") {
    throw new GenerateMatchError(400, "Tournament not active");
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

  const { selection, consumedSkipUserIds } = selectSingleCourtMatchRespectingSkips({
    rankedCandidates: eligibleRankedCandidates,
    playersById,
    sessionData: reshuffleSessionData,
    rotationHistory,
    reshuffleSource: getQueuedReshuffleSource(sessionData),
    requiredCourtGroupType: sessionData.queuedMatch.courtGroupType,
  });
  const queuedMatch = await updateQueuedMatchRecord({
    sessionId: sessionData.id,
    queuedMatchId: sessionData.queuedMatch.id,
    partition: selection.partition,
    targetPool: "targetPool" in selection ? selection.targetPool : null,
    courtGroupType:
      "courtGroupType" in selection ? selection.courtGroupType : null,
    poolASeatCount:
      "poolASeatCount" in selection ? selection.poolASeatCount : null,
    poolBSeatCount:
      "poolBSeatCount" in selection ? selection.poolBSeatCount : null,
    isAutomatic: sessionData.queuedMatch.isAutomatic,
    matchmakingReasonJson: selection.matchmakingReasonJson ?? null,
    team1ClubId: "team1ClubId" in selection ? selection.team1ClubId : null,
    team2ClubId: "team2ClubId" in selection ? selection.team2ClubId : null,
    consumeSkipNextUserIds: consumedSkipUserIds,
    releasePendingUserIds: sessionData.queuedMatch.isAutomatic
      ? []
      : reshuffleUserIds.filter(
          (userId) =>
            ![
              selection.partition.team1[0],
              selection.partition.team1[1],
              selection.partition.team2[0],
              selection.partition.team2[1],
            ].includes(userId)
        ),
  });

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function replaceQueuedMatchPlayerForSession(
  sessionData: QueueSessionRecord,
  replaceUserId: string
) {
  if (sessionData.status !== "ACTIVE") {
    throw new GenerateMatchError(400, "Tournament not active");
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
  const { selection: replacementSelection, consumedSkipUserIds } =
    selectReplacementMatchRespectingSkips({
      rankedCandidates,
      playersById,
    sessionData: replacementSessionData,
    retainedUserIds: retainedUserIds as [string, string, string],
    excludedUserIds: currentQueuedUserIds,
    requiredCourtGroupType: sessionData.queuedMatch.courtGroupType,
    });

  const queuedMatch = await updateQueuedMatchRecord({
    sessionId: sessionData.id,
    queuedMatchId: sessionData.queuedMatch.id,
    partition: replacementSelection.partition,
    targetPool: sessionData.queuedMatch.targetPool ?? null,
    courtGroupType:
      "courtGroupType" in replacementSelection
        ? replacementSelection.courtGroupType
        : sessionData.queuedMatch.courtGroupType,
    poolASeatCount:
      "poolASeatCount" in replacementSelection
        ? replacementSelection.poolASeatCount
        : sessionData.queuedMatch.poolASeatCount,
    poolBSeatCount:
      "poolBSeatCount" in replacementSelection
        ? replacementSelection.poolBSeatCount
        : sessionData.queuedMatch.poolBSeatCount,
    isAutomatic: sessionData.queuedMatch.isAutomatic,
    matchmakingReasonJson: replacementSelection.matchmakingReasonJson ?? null,
    team1ClubId:
      "team1ClubId" in replacementSelection
        ? replacementSelection.team1ClubId
        : sessionData.queuedMatch.team1ClubId ?? null,
    team2ClubId:
      "team2ClubId" in replacementSelection
        ? replacementSelection.team2ClubId
        : sessionData.queuedMatch.team2ClubId ?? null,
    consumeSkipNextUserIds: consumedSkipUserIds,
    releasePendingUserIds: sessionData.queuedMatch.isAutomatic
      ? []
      : [replaceUserId],
  });

  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

export async function createManualQueuedMatchForSession(
  sessionData: QueueSessionRecord,
  partition: ManualMatchTeams,
  teamClubIds?: { team1ClubId?: string | null; team2ClubId?: string | null }
) {
  await ensureQueueSlotAvailable(sessionData);
  const groupSnapshot = sessionData.poolsEnabled
    ? classifyCourtGroupSnapshot(
        partition.team1,
        partition.team2,
        buildSessionPoolMap(
          sessionData.players,
          (player) => player.userId,
          (player) => player.pool
        )
      )
    : null;
  const queuedMatch = await createQueuedMatchRecord({
    sessionId: sessionData.id,
    partition,
    targetPool: null,
    courtGroupType: groupSnapshot?.courtGroupType ?? null,
    poolASeatCount: groupSnapshot?.poolASeatCount ?? null,
    poolBSeatCount: groupSnapshot?.poolBSeatCount ?? null,
    isAutomatic: false,
    matchmakingReasonJson: null,
    teamClubIds,
  });
  return buildQueuedMatchResponse(sessionData, queuedMatch);
}

async function tryRebuildAutomaticQueuedMatch(
  loadSessionData: () => Promise<QueueSessionRecord | null>
) {
  const sessionData = await loadSessionData();
  if (!sessionData) {
    return null;
  }

  if (!sessionData.queuedMatch) {
    return tryRebuildQueuedMatch(loadSessionData);
  }

  if (!sessionData.queuedMatch.isAutomatic) {
    return buildQueuedMatchResponse(sessionData, sessionData.queuedMatch);
  }

  if (await shouldSuppressAutomaticQueueCreation(sessionData)) {
    return buildQueuedMatchResponse(sessionData, sessionData.queuedMatch);
  }

  const rebuildSessionData = {
    ...sessionData,
    queuedMatch: null,
  };

  try {
    await ensureQueueSlotAvailable(rebuildSessionData);
    const selection = await selectAutomaticMatchForSession(rebuildSessionData);
    const queuedMatch = await updateQueuedMatchRecord({
      sessionId: sessionData.id,
      queuedMatchId: sessionData.queuedMatch.id,
      partition: selection.partition,
      targetPool: selection.targetPool,
      courtGroupType: selection.courtGroupType,
      poolASeatCount: selection.poolASeatCount,
      poolBSeatCount: selection.poolBSeatCount,
      isAutomatic: true,
      matchmakingReasonJson: selection.matchmakingReasonJson,
      team1ClubId: selection.team1ClubId,
      team2ClubId: selection.team2ClubId,
      consumeSkipNextUserIds: selection.consumedSkipUserIds,
    });

    return buildQueuedMatchResponse(sessionData, queuedMatch);
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return buildQueuedMatchResponse(sessionData, sessionData.queuedMatch);
    }

    throw error;
  }
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

export async function tryRebuildAutomaticQueuedMatchForCode(code: string) {
  return tryRebuildAutomaticQueuedMatch(() => loadSessionRecord(code));
}

export async function tryRebuildAutomaticQueuedMatchForSessionId(
  sessionId: string
) {
  return tryRebuildAutomaticQueuedMatch(() => loadSessionRecordById(sessionId));
}
