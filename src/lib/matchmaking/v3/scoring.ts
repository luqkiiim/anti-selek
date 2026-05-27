import { SessionType } from "../../../types/enums";

import type {
  ActiveMatchmakerV3Player,
  V3BatchSelection,
  V3SingleCourtSelection,
  V3WaitSummary,
} from "./types";

export const ELO_EXACT_REMATCH_BALANCE_TOLERANCE = 30;
export const ELO_PARTNER_REPEAT_BALANCE_TOLERANCE = 1;
export const POINTS_WAIT_TOLERANCE_MS = 120 * 1000;

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
  return sessionType === SessionType.ELO;
}

function usesPointsWaitTolerance(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
  );
}

function usesConsecutivePlayPreference(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
  );
}

function getPartnerRepeatBalanceTolerance() {
  return ELO_PARTNER_REPEAT_BALANCE_TOLERANCE;
}

function getWaitToleranceMs(sessionType: SessionType) {
  return usesPointsWaitTolerance(sessionType) ? POINTS_WAIT_TOLERANCE_MS : 0;
}

function shouldRespectPlayerRest(options?: { respectPlayerRest?: boolean }) {
  return options?.respectPlayerRest !== false;
}

function compareWaitValues(left: number, right: number, toleranceMs: number) {
  const diff = right - left;

  return Math.abs(diff) > toleranceMs ? diff : 0;
}

export function compareWaitSummaries(
  left: V3WaitSummary,
  right: V3WaitSummary,
  waitToleranceMs = 0
) {
  const playerCount = Math.max(left.waitVector.length, right.waitVector.length);
  const totalWaitCompare = compareWaitValues(
    left.totalWaitMs,
    right.totalWaitMs,
    waitToleranceMs * playerCount
  );

  if (totalWaitCompare !== 0) {
    return totalWaitCompare;
  }

  const minimumWaitCompare = compareWaitValues(
    left.minimumWaitMs,
    right.minimumWaitMs,
    waitToleranceMs
  );

  if (minimumWaitCompare !== 0) {
    return minimumWaitCompare;
  }

  for (
    let index = 0;
    index < Math.max(left.waitVector.length, right.waitVector.length);
    index++
  ) {
    const leftWaitMs = left.waitVector[index] ?? 0;
    const rightWaitMs = right.waitVector[index] ?? 0;
    const waitCompare = compareWaitValues(
      leftWaitMs,
      rightWaitMs,
      waitToleranceMs
    );

    if (waitCompare !== 0) {
      return waitCompare;
    }
  }

  return 0;
}

function compareConsecutivePlayFairness<T extends ActiveMatchmakerV3Player>(
  left: V3SingleCourtSelection<T>,
  right: V3SingleCourtSelection<T>
) {
  const countDiff =
    left.consecutivePlayCount - right.consecutivePlayCount;
  if (countDiff !== 0) {
    return countDiff;
  }

  const maxBurdenDiff =
    left.consecutivePlayMaxBurden - right.consecutivePlayMaxBurden;
  if (maxBurdenDiff !== 0) {
    return maxBurdenDiff;
  }

  return (
    left.consecutivePlayTotalBurden - right.consecutivePlayTotalBurden
  );
}

export function compareSingleCourtSelections<
  T extends ActiveMatchmakerV3Player,
>(
  left: V3SingleCourtSelection<T>,
  right: V3SingleCourtSelection<T>,
  sessionType: SessionType,
  options?: { respectPlayerRest?: boolean }
) {
  if (shouldRespectPlayerRest(options)) {
    const waitCompare = compareWaitSummaries(
      left.waitSummary,
      right.waitSummary,
      getWaitToleranceMs(sessionType)
    );
    if (waitCompare !== 0) {
      return waitCompare;
    }

    if (usesConsecutivePlayPreference(sessionType)) {
      const consecutivePlayCompare = compareConsecutivePlayFairness(left, right);
      if (consecutivePlayCompare !== 0) {
        return consecutivePlayCompare;
      }
    }
  }

  if (sessionType === SessionType.SOCIAL_MIX) {
    const sharedCourtDiff =
      left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty;
    if (sharedCourtDiff !== 0) {
      return sharedCourtDiff;
    }

    const partnerCoverageDiff =
      left.partnerCoveragePenalty - right.partnerCoveragePenalty;
    if (partnerCoverageDiff !== 0) {
      return partnerCoverageDiff;
    }

    const opponentCoverageDiff =
      left.opponentCoveragePenalty - right.opponentCoveragePenalty;
    if (opponentCoverageDiff !== 0) {
      return opponentCoverageDiff;
    }

    const balanceDiff = left.balanceGap - right.balanceGap;
    if (balanceDiff !== 0) {
      return balanceDiff;
    }

    const partnerDiff = left.partnerRepeatPenalty - right.partnerRepeatPenalty;
    if (partnerDiff !== 0) {
      return partnerDiff;
    }

    const opponentDiff =
      left.opponentRepeatPenalty - right.opponentRepeatPenalty;
    if (opponentDiff !== 0) {
      return opponentDiff;
    }

    const rematchDiff = left.exactRematchPenalty - right.exactRematchPenalty;
    if (rematchDiff !== 0) {
      return rematchDiff;
    }

    return left.randomScore - right.randomScore;
  }

  const balanceDiff = left.balanceGap - right.balanceGap;

  if (sessionType === SessionType.POINTS) {
    const sharedCourtDiff =
      left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty;
    if (sharedCourtDiff !== 0) {
      return sharedCourtDiff;
    }

    if (balanceDiff !== 0) {
      return balanceDiff;
    }

    const pointDiffGapDiff = left.pointDiffGap - right.pointDiffGap;
    if (pointDiffGapDiff !== 0) {
      return pointDiffGapDiff;
    }

    return left.randomScore - right.randomScore;
  }

  if (usesPartnerRepeatPreference(sessionType)) {
    const partnerDiff = left.partnerRepeatPenalty - right.partnerRepeatPenalty;

    if (
      partnerDiff !== 0 &&
      Math.abs(balanceDiff) <= getPartnerRepeatBalanceTolerance()
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
  sessionType: SessionType,
  options?: { respectPlayerRest?: boolean }
) {
  if (shouldRespectPlayerRest(options)) {
    const waitCompare = compareWaitSummaries(
      left.waitSummary,
      right.waitSummary,
      getWaitToleranceMs(sessionType)
    );
    if (waitCompare !== 0) {
      return waitCompare;
    }
  }

  if (sessionType === SessionType.SOCIAL_MIX) {
    const sharedCourtDiff =
      left.totalSharedCourtRepeatPenalty - right.totalSharedCourtRepeatPenalty;
    if (sharedCourtDiff !== 0) {
      return sharedCourtDiff;
    }

    const partnerCoverageDiff =
      left.totalPartnerCoveragePenalty - right.totalPartnerCoveragePenalty;
    if (partnerCoverageDiff !== 0) {
      return partnerCoverageDiff;
    }

    const opponentCoverageDiff =
      left.totalOpponentCoveragePenalty - right.totalOpponentCoveragePenalty;
    if (opponentCoverageDiff !== 0) {
      return opponentCoverageDiff;
    }

    const maxBalanceDiff = left.maxBalanceGap - right.maxBalanceGap;
    if (maxBalanceDiff !== 0) {
      return maxBalanceDiff;
    }

    const totalBalanceDiff = left.totalBalanceGap - right.totalBalanceGap;
    if (totalBalanceDiff !== 0) {
      return totalBalanceDiff;
    }

    const partnerDiff =
      left.totalPartnerRepeatPenalty - right.totalPartnerRepeatPenalty;
    if (partnerDiff !== 0) {
      return partnerDiff;
    }

    const opponentDiff =
      left.totalOpponentRepeatPenalty - right.totalOpponentRepeatPenalty;
    if (opponentDiff !== 0) {
      return opponentDiff;
    }

    const rematchDiff =
      left.totalExactRematchPenalty - right.totalExactRematchPenalty;
    if (rematchDiff !== 0) {
      return rematchDiff;
    }

    return left.totalRandomScore - right.totalRandomScore;
  }

  const maxBalanceDiff = left.maxBalanceGap - right.maxBalanceGap;
  const totalBalanceDiff = left.totalBalanceGap - right.totalBalanceGap;

  if (sessionType === SessionType.POINTS) {
    const sharedCourtDiff =
      left.totalSharedCourtRepeatPenalty - right.totalSharedCourtRepeatPenalty;
    if (sharedCourtDiff !== 0) {
      return sharedCourtDiff;
    }

    if (maxBalanceDiff !== 0) {
      return maxBalanceDiff;
    }

    if (totalBalanceDiff !== 0) {
      return totalBalanceDiff;
    }

    const maxPointDiffGapDiff = left.maxPointDiffGap - right.maxPointDiffGap;
    if (maxPointDiffGapDiff !== 0) {
      return maxPointDiffGapDiff;
    }

    const totalPointDiffGapDiff =
      left.totalPointDiffGap - right.totalPointDiffGap;
    if (totalPointDiffGapDiff !== 0) {
      return totalPointDiffGapDiff;
    }

    return left.totalRandomScore - right.totalRandomScore;
  }

  if (usesPartnerRepeatPreference(sessionType)) {
    const partnerDiff =
      left.totalPartnerRepeatPenalty - right.totalPartnerRepeatPenalty;
    const partnerTolerance =
      getPartnerRepeatBalanceTolerance() * left.selections.length;

    if (
      partnerDiff !== 0 &&
      Math.abs(maxBalanceDiff) <= getPartnerRepeatBalanceTolerance() &&
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
