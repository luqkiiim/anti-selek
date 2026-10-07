import type { V3CompletedMatch } from "./types";

export interface V3ConsecutivePlayHistory {
  previousMatchPlayerIds: Set<string>;
  burdenByUserId: Map<string, number>;
}

export interface V3ConsecutivePlayMetrics {
  consecutivePlayCount: number;
  consecutivePlayMaxBurden: number;
  consecutivePlayTotalBurden: number;
}

function getMatchPlayerIds(match: V3CompletedMatch) {
  return new Set([
    match.team1[0],
    match.team1[1],
    match.team2[0],
    match.team2[1],
  ]);
}

function getChronologicalCompletedMatches(matches: V3CompletedMatch[]) {
  return matches
    .map((match, index) => ({ match, index }))
    .sort((left, right) => {
      const leftTime = left.match.completedAt?.getTime();
      const rightTime = right.match.completedAt?.getTime();

      if (typeof leftTime === "number" && typeof rightTime === "number") {
        return leftTime - rightTime || left.index - right.index;
      }

      return left.index - right.index;
    })
    .map(({ match }) => match);
}

export function buildConsecutivePlayHistory(
  matches: V3CompletedMatch[]
): V3ConsecutivePlayHistory {
  const burdenByUserId = new Map<string, number>();
  let previousMatchPlayerIds = new Set<string>();

  for (const match of getChronologicalCompletedMatches(matches)) {
    const currentPlayerIds = getMatchPlayerIds(match);

    for (const userId of currentPlayerIds) {
      if (previousMatchPlayerIds.has(userId)) {
        burdenByUserId.set(userId, (burdenByUserId.get(userId) ?? 0) + 1);
      }
    }

    previousMatchPlayerIds = currentPlayerIds;
  }

  return {
    previousMatchPlayerIds,
    burdenByUserId,
  };
}

export function getConsecutivePlayMetrics(
  userIds: readonly string[],
  history: V3ConsecutivePlayHistory
): V3ConsecutivePlayMetrics {
  const burdens = userIds
    .filter((userId) => history.previousMatchPlayerIds.has(userId))
    .map((userId) => history.burdenByUserId.get(userId) ?? 0);

  return {
    consecutivePlayCount: burdens.length,
    consecutivePlayMaxBurden: Math.max(0, ...burdens),
    consecutivePlayTotalBurden: burdens.reduce(
      (sum, burden) => sum + burden,
      0
    ),
  };
}

export function getEmptyConsecutivePlayMetrics(): V3ConsecutivePlayMetrics {
  return {
    consecutivePlayCount: 0,
    consecutivePlayMaxBurden: 0,
    consecutivePlayTotalBurden: 0,
  };
}
