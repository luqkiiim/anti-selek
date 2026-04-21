import { SessionType } from "../../../types/enums";

import type {
  ActiveMatchmakerV3Player,
  V3BatchSelection,
  V3SingleCourtSelection,
  V3WaitSummary,
} from "./types";

export const ELO_EXACT_REMATCH_BALANCE_TOLERANCE = 30;
export const PARTNER_REPEAT_BALANCE_TOLERANCE = 1;

export function buildWaitSummary<
  T extends Pick<ActiveMatchmakerV3Player, "waitMs">,
>(players: T[]): V3WaitSummary {
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
  T extends Pick<ActiveMatchmakerV3Player, "randomScore">,
>(players: T[]) {
  return players.reduce((sum, player) => sum + player.randomScore, 0);
}

function usesPartnerRepeatPreference(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS || sessionType === SessionType.ELO
  );
}

export function compareWaitSummaries(left: V3WaitSummary, right: V3WaitSummary) {
  if (left.totalWaitMs !== right.totalWaitMs) {
    return right.totalWaitMs - left.totalWaitMs;
  }

  if (left.minimumWaitMs !== right.minimumWaitMs) {
    return right.minimumWaitMs - left.minimumWaitMs;
  }

  for (let index = 0; index < Math.max(left.waitVector.length, right.waitVector.length); index++) {
    const leftWaitMs = left.waitVector[index] ?? 0;
    const rightWaitMs = right.waitVector[index] ?? 0;

    if (leftWaitMs !== rightWaitMs) {
      return rightWaitMs - leftWaitMs;
    }
  }

  return 0;
}

export function compareSingleCourtSelections<
  T extends ActiveMatchmakerV3Player,
>(
  left: V3SingleCourtSelection<T>,
  right: V3SingleCourtSelection<T>,
  sessionType: SessionType
) {
  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  const balanceDiff = left.balanceGap - right.balanceGap;

  if (usesPartnerRepeatPreference(sessionType)) {
    const partnerDiff = left.partnerRepeatPenalty - right.partnerRepeatPenalty;

    if (
      partnerDiff !== 0 &&
      Math.abs(balanceDiff) <= PARTNER_REPEAT_BALANCE_TOLERANCE
    ) {
      return partnerDiff;
    }

    if (balanceDiff !== 0) {
      return balanceDiff;
    }

    return left.randomScore - right.randomScore;
  }

  const rematchDiff = left.exactRematchPenalty - right.exactRematchPenalty;

  if (
    rematchDiff !== 0 &&
    Math.abs(balanceDiff) <= ELO_EXACT_REMATCH_BALANCE_TOLERANCE
  ) {
    return rematchDiff;
  }

  if (balanceDiff !== 0) {
    return balanceDiff;
  }

  if (rematchDiff !== 0) {
    return rematchDiff;
  }

  return left.randomScore - right.randomScore;
}

export function compareBatchSelections<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  sessionType: SessionType
) {
  const waitCompare = compareWaitSummaries(left.waitSummary, right.waitSummary);
  if (waitCompare !== 0) {
    return waitCompare;
  }

  const maxBalanceDiff = left.maxBalanceGap - right.maxBalanceGap;
  const totalBalanceDiff = left.totalBalanceGap - right.totalBalanceGap;

  if (usesPartnerRepeatPreference(sessionType)) {
    const partnerDiff =
      left.totalPartnerRepeatPenalty - right.totalPartnerRepeatPenalty;
    const partnerTolerance =
      PARTNER_REPEAT_BALANCE_TOLERANCE * left.selections.length;

    if (
      partnerDiff !== 0 &&
      Math.abs(maxBalanceDiff) <= PARTNER_REPEAT_BALANCE_TOLERANCE &&
      Math.abs(totalBalanceDiff) <= partnerTolerance
    ) {
      return partnerDiff;
    }

    if (maxBalanceDiff !== 0) {
      return maxBalanceDiff;
    }

    if (totalBalanceDiff !== 0) {
      return totalBalanceDiff;
    }

    return left.totalRandomScore - right.totalRandomScore;
  }

  const rematchDiff =
    left.totalExactRematchPenalty - right.totalExactRematchPenalty;
  const rematchTolerance =
    ELO_EXACT_REMATCH_BALANCE_TOLERANCE * left.selections.length;

  if (
    rematchDiff !== 0 &&
    Math.abs(maxBalanceDiff) <= ELO_EXACT_REMATCH_BALANCE_TOLERANCE &&
    Math.abs(totalBalanceDiff) <= rematchTolerance
  ) {
    return rematchDiff;
  }

  if (maxBalanceDiff !== 0) {
    return maxBalanceDiff;
  }

  if (totalBalanceDiff !== 0) {
    return totalBalanceDiff;
  }

  if (rematchDiff !== 0) {
    return rematchDiff;
  }

  return left.totalRandomScore - right.totalRandomScore;
}
