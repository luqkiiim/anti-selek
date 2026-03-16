import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import { GenerateMatchError } from "./shared";

export async function createMatchesForAssignments(
  sessionId: string,
  assignments: Array<{
    courtId: string;
    selectedIds: string[];
    partition: ManualMatchTeams;
  }>
) {
  return prisma.$transaction(async (tx) => {
    const allSelectedIds = assignments.flatMap(
      (assignment) => assignment.selectedIds
    );
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

    const matches = [];

    for (const assignment of assignments) {
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

      matches.push(match);
    }

    return matches;
  });
}
