import { prisma } from "@/lib/prisma";
import { CourtGroupType, MatchStatus } from "@/types/enums";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import { parseMatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { classifyCourtGroupSnapshot } from "@/lib/playerGroups";
import { buildSessionPoolMap } from "@/lib/sessionPools";
import { consumeSkipNextMatches } from "@/lib/sessionSkipNext";
import { GenerateMatchError } from "./shared";

type MatchTimingDelegate = {
  findFirst?: (args: unknown) => Promise<{ createdAt: Date } | null>;
  findUnique?: (args: unknown) => Promise<{ createdAt?: Date } | null>;
};

async function getNextMatchCreatedAt(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId: string
) {
  const delegate = tx.match as unknown as MatchTimingDelegate;
  if (!delegate.findFirst) return undefined;

  const latest = await delegate.findFirst({
    where: { sessionId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  return new Date(
    Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)
  );
}

function getAllSelectedIds(
  assignments: Array<{
    selectedIds: string[];
  }>
) {
  return assignments.flatMap((assignment) => assignment.selectedIds);
}

async function assertAssignmentsAvailable(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId: string,
  assignments: Array<{
    selectedIds: string[];
  }>
) {
  const allSelectedIds = getAllSelectedIds(assignments);
  const uniqueSelectedIds = new Set(allSelectedIds);

  if (uniqueSelectedIds.size !== allSelectedIds.length) {
    throw new GenerateMatchError(
      409,
      "One or more selected players just started another match. Please retry."
    );
  }

  const concurrentBusyMatches = await tx.match.findMany({
    where: {
      sessionId,
      status: {
        in: [
          MatchStatus.PENDING,
          MatchStatus.IN_PROGRESS,
          MatchStatus.PENDING_APPROVAL,
        ],
      },
      OR: [
        { team1User1Id: { in: [...uniqueSelectedIds] } },
        { team1User2Id: { in: [...uniqueSelectedIds] } },
        { team2User1Id: { in: [...uniqueSelectedIds] } },
        { team2User2Id: { in: [...uniqueSelectedIds] } },
      ],
    },
  });

  if (concurrentBusyMatches.length > 0) {
    throw new GenerateMatchError(
      409,
      "One or more selected players just started another match. Please retry."
    );
  }
}

async function createMatchAssignment(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  sessionId: string,
  assignment: {
    courtId: string;
    partition: ManualMatchTeams;
    team1ClubId?: string | null;
    team2ClubId?: string | null;
    matchmakingReasonJson?: string | null;
    clearArrivalPriority?: boolean;
    courtGroupType?: CourtGroupType | string | null;
    poolASeatCount?: number | null;
    poolBSeatCount?: number | null;
    createdAt?: Date;
  }
) {
  let groupSnapshot =
    assignment.courtGroupType &&
    typeof assignment.poolASeatCount === "number" &&
    typeof assignment.poolBSeatCount === "number"
      ? {
          courtGroupType: assignment.courtGroupType,
          poolASeatCount: assignment.poolASeatCount,
          poolBSeatCount: assignment.poolBSeatCount,
        }
      : null;

  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { poolsEnabled: true },
  });
  if (session?.poolsEnabled) {
    const selectedPlayers = await tx.sessionPlayer.findMany({
      where: {
        sessionId,
        userId: {
          in: [
            assignment.partition.team1[0],
            assignment.partition.team1[1],
            assignment.partition.team2[0],
            assignment.partition.team2[1],
          ],
        },
      },
      select: { userId: true, pool: true },
    });
    const currentSnapshot = classifyCourtGroupSnapshot(
      assignment.partition.team1,
      assignment.partition.team2,
      buildSessionPoolMap(
        selectedPlayers,
        (player) => player.userId,
        (player) => player.pool
      )
    );

    if (
      groupSnapshot &&
      (groupSnapshot.courtGroupType !== currentSnapshot.courtGroupType ||
        groupSnapshot.poolASeatCount !== currentSnapshot.poolASeatCount ||
        groupSnapshot.poolBSeatCount !== currentSnapshot.poolBSeatCount)
    ) {
      throw new GenerateMatchError(
        409,
        "Player groups changed while this match was being created. Please retry."
      );
    }
    groupSnapshot = currentSnapshot;
  } else {
    groupSnapshot = null;
  }

  const createdAt =
    assignment.createdAt ?? (await getNextMatchCreatedAt(tx, sessionId));

  const match = await tx.match.create({
    data: {
      sessionId,
      courtId: assignment.courtId,
      status: MatchStatus.IN_PROGRESS,
      team1User1Id: assignment.partition.team1[0],
      team1User2Id: assignment.partition.team1[1],
      team1ClubId: assignment.team1ClubId ?? null,
      team2User1Id: assignment.partition.team2[0],
      team2User2Id: assignment.partition.team2[1],
      team2ClubId: assignment.team2ClubId ?? null,
      matchmakingReasonJson: assignment.matchmakingReasonJson ?? null,
      courtGroupType: groupSnapshot?.courtGroupType ?? null,
      poolASeatCount: groupSnapshot?.poolASeatCount ?? null,
      poolBSeatCount: groupSnapshot?.poolBSeatCount ?? null,
      ...(createdAt ? { createdAt } : {}),
    },
    include: {
      team1User1: { select: { id: true, name: true } },
      team1User2: { select: { id: true, name: true } },
      team2User1: { select: { id: true, name: true } },
      team2User2: { select: { id: true, name: true } },
    },
  });

  const updatedCourt = await tx.court.updateMany({
    where: { id: assignment.courtId, currentMatchId: null },
    data: { currentMatchId: match.id },
  });

  if (updatedCourt.count === 0) {
    throw new GenerateMatchError(
      409,
      "This court already has a match in progress."
    );
  }

  if (assignment.clearArrivalPriority) {
    await tx.sessionPlayer.updateMany({
      where: {
        sessionId,
        userId: {
          in: [
            assignment.partition.team1[0],
            assignment.partition.team1[1],
            assignment.partition.team2[0],
            assignment.partition.team2[1],
          ],
        },
      },
      data: { arrivalPriorityAt: null },
    });
  }

  const { matchmakingReasonJson, ...matchResponse } = match;

  return {
    ...matchResponse,
    matchmakingReason: parseMatchmakingReasonJson(matchmakingReasonJson),
  };
}

export async function createMatchesForAssignments(
  sessionId: string,
  assignments: Array<{
    courtId: string;
    selectedIds: string[];
    partition: ManualMatchTeams;
    team1ClubId?: string | null;
    team2ClubId?: string | null;
    matchmakingReasonJson?: string | null;
    clearArrivalPriority?: boolean;
    consumeSkipNextUserIds?: string[];
    courtGroupType?: CourtGroupType | string | null;
    poolASeatCount?: number | null;
    poolBSeatCount?: number | null;
  }>
) {
  return prisma.$transaction(async (tx) => {
    await assertAssignmentsAvailable(tx, sessionId, assignments);

    const matches = [];

    for (const assignment of assignments) {
      const match = await createMatchAssignment(tx, sessionId, assignment);
      matches.push(match);
    }

    await consumeSkipNextMatches(tx, {
      sessionId,
      userIds: assignments.flatMap(
        (assignment) => assignment.consumeSkipNextUserIds ?? []
      ),
    });

    return matches;
  });
}

export async function replaceCurrentCourtMatchAssignment({
  sessionId,
  courtId,
  currentMatchId,
  selectedIds,
  partition,
  team1ClubId,
  team2ClubId,
  matchmakingReasonJson,
  courtGroupType,
  poolASeatCount,
  poolBSeatCount,
  clearArrivalPriority,
  consumeSkipNextUserIds,
  releasePendingUserIds,
}: {
  sessionId: string;
  courtId: string;
  currentMatchId: string;
  selectedIds: string[];
  partition: ManualMatchTeams;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  matchmakingReasonJson?: string | null;
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  clearArrivalPriority?: boolean;
  consumeSkipNextUserIds?: string[];
  releasePendingUserIds?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const matchTimingDelegate = tx.match as unknown as MatchTimingDelegate;
    const replacedMatch = matchTimingDelegate.findUnique
      ? await matchTimingDelegate.findUnique({
          where: { id: currentMatchId },
          select: { createdAt: true },
        })
      : null;
    const deletedMatch = await tx.match.deleteMany({
      where: {
        id: currentMatchId,
        sessionId,
        status: {
          in: [MatchStatus.PENDING, MatchStatus.IN_PROGRESS],
        },
      },
    });

    if (deletedMatch.count === 0) {
      throw new GenerateMatchError(
        409,
        "This match is no longer available to reshuffle."
      );
    }

    const clearedCourt = await tx.court.updateMany({
      where: {
        id: courtId,
        OR: [{ currentMatchId: currentMatchId }, { currentMatchId: null }],
      },
      data: { currentMatchId: null },
    });

    if (clearedCourt.count === 0) {
      throw new GenerateMatchError(
        409,
        "This court already changed. Please refresh and try again."
      );
    }

    await assertAssignmentsAvailable(tx, sessionId, [{ selectedIds }]);

    const match = await createMatchAssignment(tx, sessionId, {
      courtId,
      partition,
      team1ClubId,
      team2ClubId,
      matchmakingReasonJson,
      courtGroupType,
      poolASeatCount,
      poolBSeatCount,
      clearArrivalPriority,
      createdAt: replacedMatch?.createdAt,
    });

    await consumeSkipNextMatches(tx, {
      sessionId,
      userIds: consumeSkipNextUserIds ?? [],
    });

    await applyPendingPlayerGroupChangesInTransaction(tx, {
      sessionId,
      userIds: releasePendingUserIds ?? [],
    });

    return match;
  });
}

export async function createQueuedMatchAssignment({
  sessionId,
  queuedMatchId,
  courtId,
  partition,
  team1ClubId,
  team2ClubId,
  matchmakingReasonJson,
  courtGroupType,
  poolASeatCount,
  poolBSeatCount,
  isAutomatic,
  consumeSkipNextUserIds,
}: {
  sessionId: string;
  queuedMatchId: string;
  courtId: string;
  partition: ManualMatchTeams;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  matchmakingReasonJson?: string | null;
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  isAutomatic?: boolean;
  consumeSkipNextUserIds?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    await assertAssignmentsAvailable(tx, sessionId, [
      {
        selectedIds: [
          partition.team1[0],
          partition.team1[1],
          partition.team2[0],
          partition.team2[1],
        ],
      },
    ]);

    const removedQueue = await tx.queuedMatch.deleteMany({
      where: {
        id: queuedMatchId,
        sessionId,
      },
    });
    if (removedQueue.count === 0) {
      throw new GenerateMatchError(
        409,
        "This queued match is no longer available. Please refresh and retry."
      );
    }

    const match = await createMatchAssignment(tx, sessionId, {
      courtId,
      partition,
      team1ClubId,
      team2ClubId,
      matchmakingReasonJson,
      courtGroupType,
      poolASeatCount,
      poolBSeatCount,
      clearArrivalPriority: isAutomatic ?? matchmakingReasonJson != null,
    });

    await consumeSkipNextMatches(tx, {
      sessionId,
      userIds: consumeSkipNextUserIds ?? [],
    });

    return match;
  });
}
