import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import { GenerateMatchError } from "./shared";

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
  }
) {
  const match = await tx.match.create({
    data: {
      sessionId,
      courtId: assignment.courtId,
      status: MatchStatus.IN_PROGRESS,
      team1User1Id: assignment.partition.team1[0],
      team1User2Id: assignment.partition.team1[1],
      team2User1Id: assignment.partition.team2[0],
      team2User2Id: assignment.partition.team2[1],
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

  return match;
}

export async function createMatchesForAssignments(
  sessionId: string,
  assignments: Array<{
    courtId: string;
    selectedIds: string[];
    partition: ManualMatchTeams;
  }>
) {
  return prisma.$transaction(async (tx) => {
    await assertAssignmentsAvailable(tx, sessionId, assignments);

    const matches = [];

    for (const assignment of assignments) {
      const match = await createMatchAssignment(tx, sessionId, assignment);
      matches.push(match);
    }

    return matches;
  });
}

export async function replaceCurrentCourtMatchAssignment({
  sessionId,
  courtId,
  currentMatchId,
  selectedIds,
  partition,
}: {
  sessionId: string;
  courtId: string;
  currentMatchId: string;
  selectedIds: string[];
  partition: ManualMatchTeams;
}) {
  return prisma.$transaction(async (tx) => {
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
        currentMatchId: currentMatchId,
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

    return createMatchAssignment(tx, sessionId, {
      courtId,
      partition,
    });
  });
}

export async function createQueuedMatchAssignment({
  sessionId,
  queuedMatchId,
  courtId,
  partition,
}: {
  sessionId: string;
  queuedMatchId: string;
  courtId: string;
  partition: ManualMatchTeams;
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

    const match = await createMatchAssignment(tx, sessionId, {
      courtId,
      partition,
    });

    await tx.queuedMatch.deleteMany({
      where: {
        id: queuedMatchId,
        sessionId,
      },
    });

    return match;
  });
}
