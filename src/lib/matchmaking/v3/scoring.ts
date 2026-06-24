import { SessionType } from "../../../types/enums";

import type {
  ActiveMatchmakerV3Player,
  V3BatchSelection,
  V3SingleCourtSelection,
  V3RestSummary,
} from "./types";

export const ELO_EXACT_REMATCH_BALANCE_TOLERANCE = 30;
export const ELO_BALANCE_VARIETY_TOLERANCE = 75;
export const POINTS_BALANCE_VARIETY_TOLERANCE = 1.5;
export const FULL_SHARED_COURT_REPEAT_PENALTY = 6;
export const FULL_REPEAT_REST_TOLERANCE = 1;

export function buildRestSummary<
  T extends Pick<ActiveMatchmakerV3Player, "restTurns">,
>(players: T[]): V3RestSummary {
  const restTurnVector = [...players]
    .map((player) => player.restTurns)
    .sort((left, right) => right - left);

  return {
    totalRestTurns: restTurnVector.reduce(
      (sum, restTurns) => sum + restTurns,
      0
    ),
    minimumRestTurns: restTurnVector[restTurnVector.length - 1] ?? 0,
    restTurnVector,
  };
}

export function getQuartetRandomScore<
  T extends Pick<ActiveMatchmakerV3Player, "randomScore">,
>(players: T[]) {
  return players.reduce((sum, player) => sum + player.randomScore, 0);
}

function getMoreRestDeficitTotal<
  T extends Pick<ActiveMatchmakerV3Player, "moreRestDeficit">,
>(players: T[]) {
  return players.reduce((sum, player) => sum + player.moreRestDeficit, 0);
}

function compareMoreRestDeficitTotals<T extends ActiveMatchmakerV3Player>(
  leftPlayers: T[],
  rightPlayers: T[]
) {
  return (
    getMoreRestDeficitTotal(leftPlayers) -
    getMoreRestDeficitTotal(rightPlayers)
  );
}

function usesConsecutivePlayPreference(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
  );
}

function usesSharedCourtRepeatGuardrail(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
  );
}

function shouldRespectPlayerRest(options?: { respectPlayerRest?: boolean }) {
  return options?.respectPlayerRest !== false;
}

export function getBalanceVarietyTolerance(sessionType: SessionType) {
  if (sessionType === SessionType.POINTS) {
    return POINTS_BALANCE_VARIETY_TOLERANCE;
  }

  if (sessionType === SessionType.ELO) {
    return ELO_BALANCE_VARIETY_TOLERANCE;
  }

  return null;
}

function compareBalanceFirstVariety<T extends ActiveMatchmakerV3Player>(
  left: V3SingleCourtSelection<T>,
  right: V3SingleCourtSelection<T>
) {
  return (
    left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
    left.partnerCoveragePenalty - right.partnerCoveragePenalty ||
    left.opponentCoveragePenalty - right.opponentCoveragePenalty ||
    left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
    left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
    left.exactRematchPenalty - right.exactRematchPenalty
  );
}

function compareBalanceFirstBatchVariety<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>
) {
  return (
    left.totalSharedCourtRepeatPenalty - right.totalSharedCourtRepeatPenalty ||
    left.totalPartnerCoveragePenalty - right.totalPartnerCoveragePenalty ||
    left.totalOpponentCoveragePenalty - right.totalOpponentCoveragePenalty ||
    left.totalPartnerRepeatPenalty - right.totalPartnerRepeatPenalty ||
    left.totalOpponentRepeatPenalty - right.totalOpponentRepeatPenalty ||
    left.totalExactRematchPenalty - right.totalExactRematchPenalty
  );
}

function isWithinFullRepeatRestTolerance(
  alternative: V3RestSummary,
  fullRepeat: V3RestSummary
) {
  for (
    let index = 0;
    index <
    Math.max(
      alternative.restTurnVector.length,
      fullRepeat.restTurnVector.length
    );
    index++
  ) {
    const alternativeRestTurns = alternative.restTurnVector[index] ?? 0;
    const fullRepeatRestTurns = fullRepeat.restTurnVector[index] ?? 0;

    if (
      fullRepeatRestTurns - alternativeRestTurns >
      FULL_REPEAT_REST_TOLERANCE
    ) {
      return false;
    }
  }

  return true;
}

function compareFullRepeatGuardrail({
  leftRestSummary,
  rightRestSummary,
  leftRepeatPenalty,
  rightRepeatPenalty,
  sessionType,
}: {
  leftRestSummary: V3RestSummary;
  rightRestSummary: V3RestSummary;
  leftRepeatPenalty: number;
  rightRepeatPenalty: number;
  sessionType: SessionType;
}) {
  if (!usesSharedCourtRepeatGuardrail(sessionType)) {
    return 0;
  }

  if (
    leftRepeatPenalty === FULL_SHARED_COURT_REPEAT_PENALTY &&
    rightRepeatPenalty < leftRepeatPenalty &&
    isWithinFullRepeatRestTolerance(rightRestSummary, leftRestSummary)
  ) {
    return 1;
  }

  if (
    rightRepeatPenalty === FULL_SHARED_COURT_REPEAT_PENALTY &&
    leftRepeatPenalty < rightRepeatPenalty &&
    isWithinFullRepeatRestTolerance(leftRestSummary, rightRestSummary)
  ) {
    return -1;
  }

  return 0;
}

function compareBatchFullRepeatGuardrail<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  sessionType: SessionType
) {
  if (!usesSharedCourtRepeatGuardrail(sessionType)) {
    return 0;
  }

  const leftHasFullRepeat = left.selections.some(
    (selection) =>
      selection.sharedCourtRepeatPenalty === FULL_SHARED_COURT_REPEAT_PENALTY
  );
  const rightHasFullRepeat = right.selections.some(
    (selection) =>
      selection.sharedCourtRepeatPenalty === FULL_SHARED_COURT_REPEAT_PENALTY
  );

  if (
    leftHasFullRepeat &&
    right.totalSharedCourtRepeatPenalty < left.totalSharedCourtRepeatPenalty &&
    isWithinFullRepeatRestTolerance(right.restSummary, left.restSummary)
  ) {
    return 1;
  }

  if (
    rightHasFullRepeat &&
    left.totalSharedCourtRepeatPenalty < right.totalSharedCourtRepeatPenalty &&
    isWithinFullRepeatRestTolerance(left.restSummary, right.restSummary)
  ) {
    return -1;
  }

  return 0;
}

export function compareRestSummaries(
  left: V3RestSummary,
  right: V3RestSummary
) {
  if (left.totalRestTurns !== right.totalRestTurns) {
    return right.totalRestTurns - left.totalRestTurns;
  }

  if (left.minimumRestTurns !== right.minimumRestTurns) {
    return right.minimumRestTurns - left.minimumRestTurns;
  }

  for (
    let index = 0;
    index < Math.max(left.restTurnVector.length, right.restTurnVector.length);
    index++
  ) {
    const leftRestTurns = left.restTurnVector[index] ?? 0;
    const rightRestTurns = right.restTurnVector[index] ?? 0;

    if (leftRestTurns !== rightRestTurns) {
      return rightRestTurns - leftRestTurns;
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
  const balanceDiff = left.balanceGap - right.balanceGap;
  const balanceVarietyTolerance = getBalanceVarietyTolerance(sessionType);

  if (balanceVarietyTolerance !== null) {
    if (Math.abs(balanceDiff) > balanceVarietyTolerance) {
      return balanceDiff;
    }

    const varietyDiff = compareBalanceFirstVariety(left, right);
    if (varietyDiff !== 0) {
      return varietyDiff;
    }

    if (balanceDiff !== 0) {
      return balanceDiff;
    }

    if (sessionType === SessionType.POINTS) {
      const pointDiffGapDiff = left.pointDiffGap - right.pointDiffGap;
      if (pointDiffGapDiff !== 0) {
        return pointDiffGapDiff;
      }
    }

    if (shouldRespectPlayerRest(options)) {
      const moreRestCompare = compareMoreRestDeficitTotals(
        left.players,
        right.players
      );
      if (moreRestCompare !== 0) {
        return moreRestCompare;
      }

      const restCompare = compareRestSummaries(
        left.restSummary,
        right.restSummary
      );
      if (restCompare !== 0) {
        return restCompare;
      }

      const consecutivePlayCompare = compareConsecutivePlayFairness(left, right);
      if (consecutivePlayCompare !== 0) {
        return consecutivePlayCompare;
      }
    }

    return left.randomScore - right.randomScore;
  }

  if (shouldRespectPlayerRest(options)) {
    const fullRepeatGuardrailCompare = compareFullRepeatGuardrail({
      leftRestSummary: left.restSummary,
      rightRestSummary: right.restSummary,
      leftRepeatPenalty: left.sharedCourtRepeatPenalty,
      rightRepeatPenalty: right.sharedCourtRepeatPenalty,
      sessionType,
    });
    if (fullRepeatGuardrailCompare !== 0) {
      return fullRepeatGuardrailCompare;
    }

    const moreRestCompare = compareMoreRestDeficitTotals(
      left.players,
      right.players
    );
    if (moreRestCompare !== 0) {
      return moreRestCompare;
    }

    const restCompare = compareRestSummaries(
      left.restSummary,
      right.restSummary
    );
    if (restCompare !== 0) {
      return restCompare;
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

    const pointDiffGapDiff = left.pointDiffGap - right.pointDiffGap;
    if (pointDiffGapDiff !== 0) {
      return pointDiffGapDiff;
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
  const maxBalanceDiff = left.maxBalanceGap - right.maxBalanceGap;
  const totalBalanceDiff = left.totalBalanceGap - right.totalBalanceGap;
  const balanceVarietyTolerance = getBalanceVarietyTolerance(sessionType);

  if (balanceVarietyTolerance !== null) {
    if (Math.abs(maxBalanceDiff) > balanceVarietyTolerance) {
      return maxBalanceDiff;
    }

    const varietyDiff = compareBalanceFirstBatchVariety(left, right);
    if (varietyDiff !== 0) {
      return varietyDiff;
    }

    if (maxBalanceDiff !== 0) {
      return maxBalanceDiff;
    }

    if (totalBalanceDiff !== 0) {
      return totalBalanceDiff;
    }

    if (sessionType === SessionType.POINTS) {
      const maxPointDiffGapDiff = left.maxPointDiffGap - right.maxPointDiffGap;
      if (maxPointDiffGapDiff !== 0) {
        return maxPointDiffGapDiff;
      }

      const totalPointDiffGapDiff =
        left.totalPointDiffGap - right.totalPointDiffGap;
      if (totalPointDiffGapDiff !== 0) {
        return totalPointDiffGapDiff;
      }
    }

    if (shouldRespectPlayerRest(options)) {
      const moreRestCompare = compareMoreRestDeficitTotals(
        left.selections.flatMap((selection) => selection.players),
        right.selections.flatMap((selection) => selection.players)
      );
      if (moreRestCompare !== 0) {
        return moreRestCompare;
      }

      const restCompare = compareRestSummaries(
        left.restSummary,
        right.restSummary
      );
      if (restCompare !== 0) {
        return restCompare;
      }
    }

    return left.totalRandomScore - right.totalRandomScore;
  }

  if (shouldRespectPlayerRest(options)) {
    const fullRepeatGuardrailCompare = compareBatchFullRepeatGuardrail(
      left,
      right,
      sessionType
    );
    if (fullRepeatGuardrailCompare !== 0) {
      return fullRepeatGuardrailCompare;
    }

    const moreRestCompare = compareMoreRestDeficitTotals(
      left.selections.flatMap((selection) => selection.players),
      right.selections.flatMap((selection) => selection.players)
    );
    if (moreRestCompare !== 0) {
      return moreRestCompare;
    }

    const restCompare = compareRestSummaries(
      left.restSummary,
      right.restSummary
    );
    if (restCompare !== 0) {
      return restCompare;
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

    const maxPointDiffGapDiff = left.maxPointDiffGap - right.maxPointDiffGap;
    if (maxPointDiffGapDiff !== 0) {
      return maxPointDiffGapDiff;
    }

    const totalPointDiffGapDiff =
      left.totalPointDiffGap - right.totalPointDiffGap;
    if (totalPointDiffGapDiff !== 0) {
      return totalPointDiffGapDiff;
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
