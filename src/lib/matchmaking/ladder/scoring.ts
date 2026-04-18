import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { SessionMode } from "../../../types/enums";
import type {
  ActiveMatchmakerLadderPlayer,
  LadderBatchSelection,
  LadderGroupingSummary,
  LadderSingleCourtSelection,
  LadderWaitSummary,
} from "./types";
import { compareLadderGroupingSummaries } from "./ladderGrouping";

function inferMixicanoCourtType<
  T extends Pick<
    ActiveMatchmakerLadderPlayer,
    "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(players: T[]) {
  const effectiveSides = players.map((player) =>
    getEffectiveMixedSide({
      gender: player.gender,
      partnerPreference: player.partnerPreference,
      mixedSideOverride: player.mixedSideOverride,
    })
  );

  if (effectiveSides.some((side) => side === null)) {
    return "UNKNOWN";
  }

  const lowerCount = effectiveSides.filter((side) => side === "LOWER").length;

  if (lowerCount === 0) {
    return "MENS";
  }

  if (lowerCount === effectiveSides.length) {
    return "WOMENS";
  }

  if (lowerCount * 2 === effectiveSides.length) {
    return "MIXED";
  }

  return "HYBRID";
}

function getMixicanoSameGenderCourtScore<
  T extends Pick<
    ActiveMatchmakerLadderPlayer,
    "gender" | "partnerPreference" | "mixedSideOverride"
  >,
>(players: T[]) {
  const matchType = inferMixicanoCourtType(players);
  return matchType === "MENS" || matchType === "WOMENS" ? 1 : 0;
}

function getMixicanoSameGenderBatchScore<T extends ActiveMatchmakerLadderPlayer>(
  selections: LadderSingleCourtSelection<T>[]
) {
  return selections.reduce(
    (sum, selection) => sum + getMixicanoSameGenderCourtScore(selection.players),
    0
  );
}

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
  right: LadderSingleCourtSelection<T>,
  sessionMode: SessionMode
) {
  const groupingCompare = compareLadderGroupingSummaries(
    left.groupingSummary,
    right.groupingSummary
  );
  if (groupingCompare !== 0) {
    return groupingCompare;
  }

  if (sessionMode === SessionMode.MIXICANO) {
    const sameGenderCourtDiff =
      getMixicanoSameGenderCourtScore(right.players) -
      getMixicanoSameGenderCourtScore(left.players);
    if (sameGenderCourtDiff !== 0) {
      return sameGenderCourtDiff;
    }
  }

  if (left.balanceGap !== right.balanceGap) {
    return left.balanceGap - right.balanceGap;
  }

  if (left.pointDiffGap !== right.pointDiffGap) {
    return left.pointDiffGap - right.pointDiffGap;
  }

  if (left.strengthGap !== right.strengthGap) {
    return left.strengthGap - right.strengthGap;
  }

  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  return left.randomScore - right.randomScore;
}

export function compareBatchSelections<T extends ActiveMatchmakerLadderPlayer>(
  left: LadderBatchSelection<T>,
  right: LadderBatchSelection<T>,
  sessionMode: SessionMode
) {
  if (left.maxLadderGap !== right.maxLadderGap) {
    return left.maxLadderGap - right.maxLadderGap;
  }

  if (left.totalLadderGap !== right.totalLadderGap) {
    return left.totalLadderGap - right.totalLadderGap;
  }

  if (left.totalPointDiffGap !== right.totalPointDiffGap) {
    return left.totalPointDiffGap - right.totalPointDiffGap;
  }

  if (sessionMode === SessionMode.MIXICANO) {
    const sameGenderBatchDiff =
      getMixicanoSameGenderBatchScore(right.selections) -
      getMixicanoSameGenderBatchScore(left.selections);
    if (sameGenderBatchDiff !== 0) {
      return sameGenderBatchDiff;
    }
  }

  if (left.maxBalanceGap !== right.maxBalanceGap) {
    return left.maxBalanceGap - right.maxBalanceGap;
  }

  if (left.totalBalanceGap !== right.totalBalanceGap) {
    return left.totalBalanceGap - right.totalBalanceGap;
  }

  if (left.maxPointDiffBalanceGap !== right.maxPointDiffBalanceGap) {
    return left.maxPointDiffBalanceGap - right.maxPointDiffBalanceGap;
  }

  if (left.totalPointDiffBalanceGap !== right.totalPointDiffBalanceGap) {
    return left.totalPointDiffBalanceGap - right.totalPointDiffBalanceGap;
  }

  if (left.maxStrengthGap !== right.maxStrengthGap) {
    return left.maxStrengthGap - right.maxStrengthGap;
  }

  if (left.totalStrengthGap !== right.totalStrengthGap) {
    return left.totalStrengthGap - right.totalStrengthGap;
  }

  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  return left.totalRandomScore - right.totalRandomScore;
}

export function isGroupingBetter(
  left: LadderGroupingSummary,
  right: LadderGroupingSummary
) {
  return compareLadderGroupingSummaries(left, right) < 0;
}
