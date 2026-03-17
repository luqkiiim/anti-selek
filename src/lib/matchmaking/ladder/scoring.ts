import type {
  ActiveMatchmakerLadderPlayer,
  LadderBatchSelection,
  LadderGroupingSummary,
  LadderSingleCourtSelection,
  LadderWaitSummary,
} from "./types";
import { compareLadderGroupingSummaries } from "./ladderGrouping";

export function buildWaitSummary<
  T extends Pick<ActiveMatchmakerLadderPlayer, "waitMs">,
>(players: T[]): LadderWaitSummary {
  const waitVector = [...players]
    .map((player) => player.waitMs)
    .sort((left, right) => right - left);

  return {
    totalWaitMs: waitVector.reduce((sum, waitMs) => sum + waitMs, 0),
    minimumWaitMs: waitVector[waitVector.length - 1] ?? 0,
    waitVector,
  };
}

export function getQuartetRandomScore<
  T extends Pick<ActiveMatchmakerLadderPlayer, "randomScore">,
>(players: T[]) {
  return players.reduce((sum, player) => sum + player.randomScore, 0);
}

export function compareWaitSummaries(
  left: LadderWaitSummary,
  right: LadderWaitSummary
) {
  if (left.totalWaitMs !== right.totalWaitMs) {
    return right.totalWaitMs - left.totalWaitMs;
  }

  if (left.minimumWaitMs !== right.minimumWaitMs) {
    return right.minimumWaitMs - left.minimumWaitMs;
  }

  for (
    let index = 0;
    index < Math.max(left.waitVector.length, right.waitVector.length);
    index++
  ) {
    const leftWaitMs = left.waitVector[index] ?? 0;
    const rightWaitMs = right.waitVector[index] ?? 0;

    if (leftWaitMs !== rightWaitMs) {
      return rightWaitMs - leftWaitMs;
    }
  }

  return 0;
}

export function compareSingleCourtSelections<
  T extends ActiveMatchmakerLadderPlayer,
>(
  left: LadderSingleCourtSelection<T>,
  right: LadderSingleCourtSelection<T>
) {
  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  const groupingCompare = compareLadderGroupingSummaries(
    left.groupingSummary,
    right.groupingSummary
  );
  if (groupingCompare !== 0) {
    return groupingCompare;
  }

  if (left.balanceGap !== right.balanceGap) {
    return left.balanceGap - right.balanceGap;
  }

  return left.randomScore - right.randomScore;
}

export function compareBatchSelections<T extends ActiveMatchmakerLadderPlayer>(
  left: LadderBatchSelection<T>,
  right: LadderBatchSelection<T>
) {
  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  if (left.maxLadderGap !== right.maxLadderGap) {
    return left.maxLadderGap - right.maxLadderGap;
  }

  if (left.totalLadderGap !== right.totalLadderGap) {
    return left.totalLadderGap - right.totalLadderGap;
  }

  if (left.totalPointDiffGap !== right.totalPointDiffGap) {
    return left.totalPointDiffGap - right.totalPointDiffGap;
  }

  if (left.maxBalanceGap !== right.maxBalanceGap) {
    return left.maxBalanceGap - right.maxBalanceGap;
  }

  if (left.totalBalanceGap !== right.totalBalanceGap) {
    return left.totalBalanceGap - right.totalBalanceGap;
  }

  return left.totalRandomScore - right.totalRandomScore;
}

export function isGroupingBetter(
  left: LadderGroupingSummary,
  right: LadderGroupingSummary
) {
  return compareLadderGroupingSummaries(left, right) < 0;
}
