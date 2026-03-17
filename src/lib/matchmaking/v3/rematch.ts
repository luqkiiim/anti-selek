import type { V3CompletedMatch, V3DoublesPartition } from "./types";

export const DEFAULT_EXACT_REMATCH_HISTORY_LIMIT = 6;
export const DEFAULT_EXACT_REMATCH_DECAY = 0.85;

function getPairKey(playerA: string, playerB: string) {
  return [playerA, playerB].sort().join("|");
}

export function getExactPartitionKey(partition: V3DoublesPartition) {
  return [
    getPairKey(partition.team1[0], partition.team1[1]),
    getPairKey(partition.team2[0], partition.team2[1]),
  ]
    .sort()
    .join("||");
}

function getChronologicalCompletedMatches(matches: V3CompletedMatch[]) {
  return matches
    .filter((match): match is V3CompletedMatch & { completedAt: Date } =>
      match.completedAt instanceof Date
    )
    .sort(
      (left, right) => left.completedAt.getTime() - right.completedAt.getTime()
    );
}

export interface V3ExactRematchHistory {
  penalties: Map<string, number>;
}

export function buildExactRematchHistory(
  matches: V3CompletedMatch[],
  {
    limit = DEFAULT_EXACT_REMATCH_HISTORY_LIMIT,
    decay = DEFAULT_EXACT_REMATCH_DECAY,
  }: {
    limit?: number;
    decay?: number;
  } = {}
): V3ExactRematchHistory {
  const matchesByPartition = new Map<string, V3CompletedMatch[]>();

  for (const match of getChronologicalCompletedMatches(matches)) {
    const key = getExactPartitionKey({
      team1: match.team1,
      team2: match.team2,
    });
    const partitionMatches = matchesByPartition.get(key);

    if (partitionMatches) {
      partitionMatches.push(match);
      continue;
    }

    matchesByPartition.set(key, [match]);
  }

  const penalties = new Map<string, number>();

  for (const [key, partitionMatches] of matchesByPartition.entries()) {
    const recentMatches = partitionMatches.slice(-limit);
    const penalty = recentMatches.reduce(
      (sum, _match, index) =>
        sum + Math.pow(decay, recentMatches.length - index - 1),
      0
    );

    penalties.set(key, penalty);
  }

  return { penalties };
}

export function getExactRematchPenalty(
  partition: V3DoublesPartition,
  history: V3ExactRematchHistory
) {
  return history.penalties.get(getExactPartitionKey(partition)) ?? 0;
}
