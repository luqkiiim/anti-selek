export interface GroupRotationCourt {
  id: string;
  courtNumber: number;
}

export interface GroupRotationMatch {
  courtId: string;
  courtGroupType?: string | null;
  createdAt?: Date | string | null;
}

function toTimestamp(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Ranks currently open courts so a generated group composition rotates across
 * physical court numbers instead of repeatedly occupying the lowest number.
 */
export function rankOpenCourtsForGroupType<TCourt extends GroupRotationCourt>(
  courts: readonly TCourt[],
  matches: readonly GroupRotationMatch[],
  courtGroupType: string | null | undefined
) {
  if (!courtGroupType) {
    return [...courts].sort(
      (left, right) => left.courtNumber - right.courtNumber
    );
  }

  const historyByCourtId = new Map<string, GroupRotationMatch[]>();
  for (const match of matches) {
    const history = historyByCourtId.get(match.courtId) ?? [];
    history.push(match);
    historyByCourtId.set(match.courtId, history);
  }

  return [...courts].sort((left, right) => {
    const leftHistory = historyByCourtId.get(left.id) ?? [];
    const rightHistory = historyByCourtId.get(right.id) ?? [];
    const leftSameType = leftHistory.filter(
      (match) => match.courtGroupType === courtGroupType
    );
    const rightSameType = rightHistory.filter(
      (match) => match.courtGroupType === courtGroupType
    );

    if (leftSameType.length !== rightSameType.length) {
      return leftSameType.length - rightSameType.length;
    }

    const getLatest = (history: GroupRotationMatch[]) =>
      history.reduce<GroupRotationMatch | null>((latest, match) => {
        if (!latest) return match;
        return toTimestamp(match.createdAt) > toTimestamp(latest.createdAt)
          ? match
          : latest;
      }, null);
    const leftLatest = getLatest(leftHistory);
    const rightLatest = getLatest(rightHistory);
    const leftRepeated = leftLatest?.courtGroupType === courtGroupType ? 1 : 0;
    const rightRepeated = rightLatest?.courtGroupType === courtGroupType ? 1 : 0;

    if (leftRepeated !== rightRepeated) {
      return leftRepeated - rightRepeated;
    }

    const getLatestSameTypeAt = (history: GroupRotationMatch[]) =>
      history.reduce(
        (latest, match) =>
          match.courtGroupType === courtGroupType
            ? Math.max(latest, toTimestamp(match.createdAt))
            : latest,
        0
      );
    const sameTypeRecency =
      getLatestSameTypeAt(leftHistory) - getLatestSameTypeAt(rightHistory);
    if (sameTypeRecency !== 0) {
      return sameTypeRecency;
    }

    if (leftHistory.length !== rightHistory.length) {
      return leftHistory.length - rightHistory.length;
    }

    return left.courtNumber - right.courtNumber;
  });
}
