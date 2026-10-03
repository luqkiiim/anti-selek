import { SessionType } from "../../../types/enums";
import { getArrivalPriorityTime } from "../arrivalPriority";

import type {
  ActiveMatchmakerV3Player,
  V3BatchPairingRandomMode,
  V3BatchSelection,
  V3DoublesPartition,
  V3SingleCourtSelection,
  V3RestSummary,
  V3SocialStarvationSummary,
} from "./types";

export const ELO_EXACT_REMATCH_BALANCE_TOLERANCE = 30;
export const ELO_BALANCE_GAP_CEILING = 50;
export const POINTS_BALANCE_VARIETY_TOLERANCE = 1.5;
export const FULL_SHARED_COURT_REPEAT_PENALTY = 6;
export const FULL_REPEAT_REST_TOLERANCE = 1;
const MIXED_VARIETY_COMPARE_EPSILON = 1e-9;

export const SOCIAL_STARVATION_METRIC_COUNT = 3;

export interface SocialStarvationPlayer {
  userId: string;
  restTurns: number;
}

export interface SocialStarvationContext {
  /** Full unpaused session roster size, including busy players. */
  activePlayerCount: number;
  /** Players currently available to be selected, before candidate compression. */
  availablePlayers: readonly SocialStarvationPlayer[];
}

export type SocialStarvationSummary = V3SocialStarvationSummary;

function isSocialSession(sessionType: SessionType): boolean {
  return sessionType === SessionType.SOCIAL_MIX;
}

/** Count fairness and arrival are the primary Social fairness priorities. */
export function getSocialFairnessVector(
  players: readonly ActiveMatchmakerV3Player[]
) {
  const counts = players.map((player) => player.effectiveMatchCount).sort((a, b) => a - b);
  const arrivalTimes = players
    .map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);
  const vector = [...counts, -arrivalTimes.length, ...arrivalTimes];
  while (vector.length < players.length * 2 + 1) vector.push(Number.POSITIVE_INFINITY);
  return vector;
}

/** Ordinary rest is a Social tie-break after group rules and ongoing variety. */
export function getSocialRestVector(
  players: readonly ActiveMatchmakerV3Player[]
) {
  const rest = buildRestSummary([...players]);
  return [
    -rest.totalRestTurns,
    -rest.minimumRestTurns,
    ...rest.restTurnVector.map((turns) => -turns),
  ];
}

export function getSocialIdealRestGap(activePlayerCount: number) {
  return Math.max(0, Math.ceil((Math.max(0, activePlayerCount) - 4) / 4));
}

/**
 * Minimize overdue available players left out. With no overdue player left out,
 * the all-zero vector leaves variety free to decide among the selected group.
 */
export function getSocialStarvationSummary(
  selectedPlayers: readonly SocialStarvationPlayer[],
  context: SocialStarvationContext
): SocialStarvationSummary {
  const idealRestGap = getSocialIdealRestGap(context.activePlayerCount);
  const selectedIds = new Set(selectedPlayers.map((player) => player.userId));
  const overduePlayers = context.availablePlayers.filter(
    (player) => player.restTurns > idealRestGap
  );
  const leftOut = overduePlayers.filter((player) => !selectedIds.has(player.userId));
  return {
    idealRestGap,
    availableOverdueCount: overduePlayers.length,
    selectedOverdueCount: overduePlayers.length - leftOut.length,
    leftOutOverdueCount: leftOut.length,
    highestLeftOutRestTurns: leftOut.length ? Math.max(...leftOut.map((player) => player.restTurns)) : 0,
    totalLeftOutRestTurns: leftOut.reduce((total, player) => total + player.restTurns, 0),
  };
}

export function getSocialStarvationVector(
  selectedPlayers: readonly SocialStarvationPlayer[],
  context: SocialStarvationContext
) {
  const summary = getSocialStarvationSummary(selectedPlayers, context);
  return [
    summary.leftOutOverdueCount,
    summary.highestLeftOutRestTurns,
    summary.totalLeftOutRestTurns,
  ];
}

export function compareSocialStarvationPlayers(
  left: readonly SocialStarvationPlayer[],
  right: readonly SocialStarvationPlayer[],
  context: SocialStarvationContext
) {
  return compareSocialNumberVectors(
    getSocialStarvationVector(left, context),
    getSocialStarvationVector(right, context)
  );
}

export function compareSocialNumberVectors(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

export function compareSocialFairnessPlayers(
  left: readonly ActiveMatchmakerV3Player[],
  right: readonly ActiveMatchmakerV3Player[]
) {
  return compareSocialNumberVectors(
    getSocialFairnessVector(left),
    getSocialFairnessVector(right)
  );
}

export function compareSocialRestPlayers(
  left: readonly ActiveMatchmakerV3Player[],
  right: readonly ActiveMatchmakerV3Player[]
) {
  return compareSocialNumberVectors(
    getSocialRestVector(left),
    getSocialRestVector(right)
  );
}

export function compareSocialBatchSelections<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  options?: {
    respectPlayerRest?: boolean;
    leftSchedulingRank?: number;
    rightSchedulingRank?: number;
    starvationContext?: SocialStarvationContext;
  }
) {
  const leftPlayers = left.selections.flatMap((selection) => selection.players);
  const rightPlayers = right.selections.flatMap((selection) => selection.players);
  return compareSocialFairnessPlayers(
    leftPlayers,
    rightPlayers
  ) ||
    (options?.leftSchedulingRank ?? 0) - (options?.rightSchedulingRank ?? 0) ||
    (options?.starvationContext ? compareSocialStarvationPlayers(leftPlayers, rightPlayers, options.starvationContext) : 0) ||
    (right.totalSocialVarietyGain ?? 0) - (left.totalSocialVarietyGain ?? 0) ||
    (options?.respectPlayerRest === false ? 0 : compareSocialRestPlayers(leftPlayers, rightPlayers)) ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap ||
    left.maxPointDiffGap - right.maxPointDiffGap ||
    left.totalPointDiffGap - right.totalPointDiffGap ||
    left.totalPartnerRepeatPenalty - right.totalPartnerRepeatPenalty ||
    left.totalOpponentRepeatPenalty - right.totalOpponentRepeatPenalty ||
    left.totalExactRematchPenalty - right.totalExactRematchPenalty ||
    compareBatchRandomTieBreak(left, right);
}

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

function formatRandomScore(value: number) {
  return Number.isFinite(value) ? value.toPrecision(15) : String(value);
}

function hashUnitInterval(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 0xffffffff;
}

function getSaltedLayoutRandomScore(salt: number, layoutKey: string) {
  if (salt === 0) {
    return 0;
  }

  return hashUnitInterval(`${formatRandomScore(salt)}:${layoutKey}`);
}

function getPartnerPairKey(pair: [string, string]) {
  return [...pair].sort().join("+");
}

function getPartitionPairingKey(partition: V3DoublesPartition) {
  return [
    getPartnerPairKey(partition.team1),
    getPartnerPairKey(partition.team2),
  ]
    .sort()
    .join("/");
}

export function getPartitionPairingRandomScore(
  partition: V3DoublesPartition,
  pairingRandomSalt: number
) {
  if (pairingRandomSalt === 0) {
    return 0;
  }

  return getSaltedLayoutRandomScore(
    pairingRandomSalt,
    getPartitionPairingKey(partition)
  );
}

export function getBatchPairingRandomScore<
  T extends ActiveMatchmakerV3Player,
>(
  selections: Array<Pick<V3SingleCourtSelection<T>, "partition">>,
  pairingRandomSalt: number
) {
  if (pairingRandomSalt === 0) {
    return 0;
  }

  const batchPairingKey = selections
    .map((selection) => getPartitionPairingKey(selection.partition))
    .sort()
    .join("|");

  return getSaltedLayoutRandomScore(pairingRandomSalt, batchPairingKey);
}

export function getBatchSidePairingKeys<
  T extends ActiveMatchmakerV3Player,
>(
  selections: Array<Pick<V3SingleCourtSelection<T>, "partition">>
): [string, string] {
  const getSideKey = (side: "team1" | "team2") =>
    selections
      .map((selection) => getPartnerPairKey(selection.partition[side]))
      .sort()
      .join("|");

  return [getSideKey("team1"), getSideKey("team2")];
}

export function getBatchSidePairingRandomScores<
  T extends ActiveMatchmakerV3Player,
>(
  selections: Array<Pick<V3SingleCourtSelection<T>, "partition">>,
  sidePairingRandomSalts: [number, number]
): [number, number] {
  const sidePairingKeys = getBatchSidePairingKeys(selections);

  return [
    getSaltedLayoutRandomScore(
      sidePairingRandomSalts[0],
      `team1:${sidePairingKeys[0]}`
    ),
    getSaltedLayoutRandomScore(
      sidePairingRandomSalts[1],
      `team2:${sidePairingKeys[1]}`
    ),
  ];
}

function compareSingleCourtRandomTieBreak<
  T extends ActiveMatchmakerV3Player,
>(left: V3SingleCourtSelection<T>, right: V3SingleCourtSelection<T>) {
  return (
    left.randomScore - right.randomScore ||
    left.pairingRandomScore - right.pairingRandomScore
  );
}

function compareBatchRandomTieBreak<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>
) {
  const selectedPlayerRandomDiff =
    left.totalRandomScore - right.totalRandomScore;
  if (selectedPlayerRandomDiff !== 0) {
    return selectedPlayerRandomDiff;
  }

  return (
    left.totalPairingRandomScore - right.totalPairingRandomScore
  );
}

function usesConsecutivePlayPreference(sessionType: SessionType) {
  return (
    sessionType === SessionType.POINTS ||
    sessionType === SessionType.SOCIAL_MIX
  );
}

function usesSharedCourtRepeatGuardrail(sessionType: SessionType) {
  return sessionType === SessionType.POINTS;
}

function shouldRespectPlayerRest(options?: { respectPlayerRest?: boolean }) {
  return options?.respectPlayerRest !== false;
}

export function getBalanceVarietyTolerance(sessionType: SessionType) {
  if (sessionType === SessionType.POINTS) {
    return POINTS_BALANCE_VARIETY_TOLERANCE;
  }

  return null;
}

export function usesBalanceFirstVariety(sessionType: SessionType) {
  return sessionType === SessionType.POINTS || sessionType === SessionType.ELO;
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

function compareRestSummariesWithTolerance(
  left: V3RestSummary,
  right: V3RestSummary,
  tolerance = 1
) {
  const totalDiff = right.totalRestTurns - left.totalRestTurns;
  if (Math.abs(totalDiff) > tolerance) {
    return totalDiff;
  }

  const minimumDiff = right.minimumRestTurns - left.minimumRestTurns;
  if (Math.abs(minimumDiff) > tolerance) {
    return minimumDiff;
  }

  for (
    let index = 0;
    index < Math.max(left.restTurnVector.length, right.restTurnVector.length);
    index++
  ) {
    const leftRestTurns = left.restTurnVector[index] ?? 0;
    const rightRestTurns = right.restTurnVector[index] ?? 0;
    const restDiff = rightRestTurns - leftRestTurns;
    if (Math.abs(restDiff) > tolerance) {
      return restDiff;
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
  options?: { respectPlayerRest?: boolean; starvationContext?: SocialStarvationContext }
) {
  if (isSocialSession(sessionType)) {
    return compareSocialFairnessPlayers(left.players, right.players) ||
      (options?.starvationContext ? compareSocialStarvationPlayers(left.players, right.players, options.starvationContext) : 0) ||
      (right.socialVarietyGain ?? 0) - (left.socialVarietyGain ?? 0) ||
      (options?.respectPlayerRest === false ? 0 : compareSocialRestPlayers(left.players, right.players)) ||
      left.balanceGap - right.balanceGap || left.pointDiffGap - right.pointDiffGap ||
      left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
      left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
      left.exactRematchPenalty - right.exactRematchPenalty || compareSingleCourtRandomTieBreak(left, right);
  }
  const balanceDiff = left.balanceGap - right.balanceGap;
  const balanceVarietyTolerance = getBalanceVarietyTolerance(sessionType);

  if (sessionType === SessionType.ELO) {
    const leftWithinCeiling = left.balanceGap <= ELO_BALANCE_GAP_CEILING;
    const rightWithinCeiling = right.balanceGap <= ELO_BALANCE_GAP_CEILING;
    if (leftWithinCeiling !== rightWithinCeiling) {
      return leftWithinCeiling ? -1 : 1;
    }
    if (!leftWithinCeiling && balanceDiff !== 0) {
      return balanceDiff;
    }
  }

  if (usesBalanceFirstVariety(sessionType)) {
    if (
      balanceVarietyTolerance !== null &&
      Math.abs(balanceDiff) > balanceVarietyTolerance
    ) {
      return balanceDiff;
    }

    if (
      usesBalanceFirstVariety(sessionType) &&
      shouldRespectPlayerRest(options)
    ) {
      const consecutivePlayCompare = compareConsecutivePlayFairness(left, right);
      if (consecutivePlayCompare !== 0) {
        return consecutivePlayCompare;
      }
    }

    if (
      left.mixedVarietyPenalty !== undefined ||
      right.mixedVarietyPenalty !== undefined
    ) {
      if (shouldRespectPlayerRest(options)) {
        const restCompare = compareRestSummariesWithTolerance(
          left.restSummary,
          right.restSummary
        );
        if (restCompare !== 0) {
          return restCompare;
        }
      }

      const mixedVarietyDiff =
        (left.mixedVarietyPenalty ?? 0) -
        (right.mixedVarietyPenalty ?? 0);
      if (Math.abs(mixedVarietyDiff) > MIXED_VARIETY_COMPARE_EPSILON) {
        return mixedVarietyDiff;
      }

      const mixedGlobalVarietyDiff =
        (left.mixedGlobalVarietyPenalty ?? 0) -
        (right.mixedGlobalVarietyPenalty ?? 0);
      if (Math.abs(mixedGlobalVarietyDiff) > MIXED_VARIETY_COMPARE_EPSILON) {
        return mixedGlobalVarietyDiff;
      }
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

    return compareSingleCourtRandomTieBreak(left, right);
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

  return compareSingleCourtRandomTieBreak(left, right);
}

export function compareBatchSelections<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  sessionType: SessionType,
  options?: {
    respectPlayerRest?: boolean;
    pairingRandomMode?: V3BatchPairingRandomMode;
    starvationContext?: SocialStarvationContext;
  }
) {
  if (isSocialSession(sessionType)) return compareSocialBatchSelections(left, right, options);
  const maxBalanceDiff = left.maxBalanceGap - right.maxBalanceGap;
  const totalBalanceDiff = left.totalBalanceGap - right.totalBalanceGap;
  const balanceVarietyTolerance = getBalanceVarietyTolerance(sessionType);

  if (sessionType === SessionType.ELO) {
    const leftWithinCeiling = left.maxBalanceGap <= ELO_BALANCE_GAP_CEILING;
    const rightWithinCeiling = right.maxBalanceGap <= ELO_BALANCE_GAP_CEILING;
    if (leftWithinCeiling !== rightWithinCeiling) {
      return leftWithinCeiling ? -1 : 1;
    }
    if (!leftWithinCeiling) {
      if (maxBalanceDiff !== 0) {
        return maxBalanceDiff;
      }
      if (totalBalanceDiff !== 0) {
        return totalBalanceDiff;
      }
    }
  }

  if (usesBalanceFirstVariety(sessionType)) {
    if (
      balanceVarietyTolerance !== null &&
      Math.abs(maxBalanceDiff) > balanceVarietyTolerance
    ) {
      return maxBalanceDiff;
    }

    if (
      left.totalMixedVarietyPenalty !== undefined ||
      right.totalMixedVarietyPenalty !== undefined
    ) {
      if (shouldRespectPlayerRest(options)) {
        const restCompare = compareRestSummariesWithTolerance(
          left.restSummary,
          right.restSummary
        );
        if (restCompare !== 0) {
          return restCompare;
        }
      }

      const mixedVarietyDiff =
        (left.totalMixedVarietyPenalty ?? 0) -
        (right.totalMixedVarietyPenalty ?? 0);
      if (Math.abs(mixedVarietyDiff) > MIXED_VARIETY_COMPARE_EPSILON) {
        return mixedVarietyDiff;
      }

      const mixedGlobalVarietyDiff =
        (left.totalMixedGlobalVarietyPenalty ?? 0) -
        (right.totalMixedGlobalVarietyPenalty ?? 0);
      if (Math.abs(mixedGlobalVarietyDiff) > MIXED_VARIETY_COMPARE_EPSILON) {
        return mixedGlobalVarietyDiff;
      }
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
      const restCompare = compareRestSummaries(
        left.restSummary,
        right.restSummary
      );
      if (restCompare !== 0) {
        return restCompare;
      }
    }

    return compareBatchRandomTieBreak(left, right);
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

    const restCompare = compareRestSummaries(
      left.restSummary,
      right.restSummary
    );
    if (restCompare !== 0) {
      return restCompare;
    }
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

  return compareBatchRandomTieBreak(left, right);
}
