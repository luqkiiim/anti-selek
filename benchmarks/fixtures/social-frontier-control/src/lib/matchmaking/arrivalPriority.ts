export interface ArrivalPriorityPlayer {
  userId: string;
  arrivalPriorityAt?: Date | string | null;
  rank?: number;
}

export function getArrivalPriorityTime(
  value: Date | string | null | undefined
) {
  if (!value) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function sortArrivalPriorityPlayers<T extends ArrivalPriorityPlayer>(
  players: readonly T[]
) {
  return players
    .filter((player) => getArrivalPriorityTime(player.arrivalPriorityAt) !== null)
    .sort((left, right) => {
      const leftTime = getArrivalPriorityTime(left.arrivalPriorityAt) ?? 0;
      const rightTime = getArrivalPriorityTime(right.arrivalPriorityAt) ?? 0;

      return (
        leftTime - rightTime ||
        (left.rank ?? 0) - (right.rank ?? 0) ||
        left.userId.localeCompare(right.userId)
      );
    });
}

export function mergeUniquePlayersById<T extends { userId: string }>(
  groups: Array<readonly T[]>,
  maxCount: number
) {
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const player of group) {
      if (seen.has(player.userId)) {
        continue;
      }

      seen.add(player.userId);
      merged.push(player);

      if (merged.length >= maxCount) {
        return merged;
      }
    }
  }

  return merged;
}
