import { SessionMode, SessionType } from "../../../types/enums";
import { getArrivalPriorityTime } from "../arrivalPriority";

import type {
  ActiveMatchmakerV3Player,
  V3BatchPairingRandomMode,
  V3BatchSelection,
  V3DoublesPartition,
  V3SingleCourtSelection,
  V3RestSummary,
  SocialVarietyGains,
  V3SocialStarvationSummary,
} from "./types";





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

/** First cadence layer: minimize selected players with no completed-match rest. */
export function getImmediateReplayCount(
  players: readonly Pick<ActiveMatchmakerV3Player, "restTurns">[]
) {
  return players.filter((player) => player.restTurns === 0).length;
}

/**
 * Late cadence tie-break: maximize the ascending sorted rest vector.
 * Negation makes a lexicographically smaller vector better for the search.
 */
export function getSoftCadenceVector(
  players: readonly Pick<ActiveMatchmakerV3Player, "restTurns">[]
) {
  return players
    .map((player) => player.restTurns)
    .sort((left, right) => left - right)
    .map((turns) => (turns === 0 ? 0 : -turns));
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

export function compareImmediateReplayPlayers(
  left: readonly ActiveMatchmakerV3Player[],
  right: readonly ActiveMatchmakerV3Player[]
) {
  return getImmediateReplayCount(left) - getImmediateReplayCount(right);
}

export function compareSoftCadencePlayers(
  left: readonly ActiveMatchmakerV3Player[],
  right: readonly ActiveMatchmakerV3Player[]
) {
  return compareSocialNumberVectors(getSoftCadenceVector(left), getSoftCadenceVector(right));
}

/** Stable summation makes global batch entropy scores independent of court order. */
export function canonicalSumEntropyGains(values: readonly number[]) {
  return [...values].sort((left, right) => left - right).reduce((sum, value) => sum + value, 0);
}

export function getSocialMatchTypeEntropyGain(gains?: Partial<SocialVarietyGains> | null) {
  return gains?.matchType ?? 0;
}

export function getSocialRelationshipEntropyGain(gains?: Partial<SocialVarietyGains> | null) {
  return canonicalSumEntropyGains([
    gains?.courtmates ?? 0,
    gains?.partners ?? 0,
    gains?.opponents ?? 0,
  ]);
}

/** Combined four-facet gain, using the same deterministic grouping as batches. */
export function getSocialTotalEntropyGain(
  gains: Partial<SocialVarietyGains> | null | undefined,
  sessionMode: SessionMode
) {
  return canonicalSumEntropyGains([
    sessionMode === SessionMode.MIXICANO ? getSocialMatchTypeEntropyGain(gains) : 0,
    getSocialRelationshipEntropyGain(gains),
  ]);
}

function getSelectionTotalEntropyGain<T extends ActiveMatchmakerV3Player>(
  selection: V3SingleCourtSelection<T>, sessionMode: SessionMode
) {
  return selection.socialVarietyGains
    ? getSocialTotalEntropyGain(selection.socialVarietyGains, sessionMode)
    : selection.socialVarietyGain ?? 0;
}

function getBatchTotalEntropyGain<T extends ActiveMatchmakerV3Player>(
  selection: V3BatchSelection<T>, sessionMode: SessionMode
) {
  return selection.totalSocialVarietyGains
    ? getSocialTotalEntropyGain(selection.totalSocialVarietyGains, sessionMode)
    : selection.totalSocialVarietyGain ?? 0;
}

export function compareSocialBatchSelections<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  options?: {
    respectPlayerRest?: boolean;
    sessionMode?: SessionMode;
    leftSchedulingRank?: number;
    rightSchedulingRank?: number;
    starvationContext?: SocialStarvationContext;
  }
) {
  // This ordering compares candidates already admitted by the shared search's
  // frozen whole-batch replay envelope and, for Balanced, its fixed balance
  // envelope. The +1 replay admissibility rule is not a pairwise comparator.
  const leftPlayers = left.selections.flatMap((selection) => selection.players);
  const rightPlayers = right.selections.flatMap((selection) => selection.players);
  return compareSocialFairnessPlayers(
    leftPlayers,
    rightPlayers
  ) ||
    (options?.leftSchedulingRank ?? 0) - (options?.rightSchedulingRank ?? 0) ||
    (options?.starvationContext ? compareSocialStarvationPlayers(leftPlayers, rightPlayers, options.starvationContext) : 0) ||
    getBatchTotalEntropyGain(right, options?.sessionMode ?? SessionMode.MEXICANO) -
      getBatchTotalEntropyGain(left, options?.sessionMode ?? SessionMode.MEXICANO) ||
    (options?.respectPlayerRest === false ? 0 : compareSoftCadencePlayers(leftPlayers, rightPlayers)) ||
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

/** Social keeps exact entropy ordering; Balanced uses transitive fixed 1e-12 buckets. */
export function getRotationVarietyScore(gain: number, sessionType: SessionType) {
  return sessionType === SessionType.SOCIAL_MIX ? gain : Math.round(gain * 1e12) / 1e12;
}

/**
 * Balanced comparisons operate on candidates already admitted by a fixed batch
 * envelope. Balance is never traded against entropy here; the shared search
 * establishes the stronger class and admissibility before calling this policy.
 */
export function compareSingleCourtSelections<T extends ActiveMatchmakerV3Player>(
  left: V3SingleCourtSelection<T>,
  right: V3SingleCourtSelection<T>,
  sessionType: SessionType,
  options?: { respectPlayerRest?: boolean; sessionMode?: SessionMode; starvationContext?: SocialStarvationContext }
) {
  // Search has already established the global batch replay/balance envelope;
  // this helper only orders candidates inside that admissible space.
  const social = isSocialSession(sessionType);
  const sessionMode = options?.sessionMode ?? SessionMode.MEXICANO;
  return compareSocialFairnessPlayers(left.players, right.players) ||
    (options?.starvationContext ? compareSocialStarvationPlayers(left.players, right.players, options.starvationContext) : 0) ||
    getRotationVarietyScore(getSelectionTotalEntropyGain(right, sessionMode), sessionType) -
      getRotationVarietyScore(getSelectionTotalEntropyGain(left, sessionMode), sessionType) ||
    (options?.respectPlayerRest === false ? 0 : compareSoftCadencePlayers(left.players, right.players)) ||
    left.balanceGap - right.balanceGap ||
    (social || sessionType === SessionType.POINTS ? left.pointDiffGap - right.pointDiffGap : 0) ||
    (social ? left.partnerRepeatPenalty - right.partnerRepeatPenalty : 0) ||
    (social ? left.opponentRepeatPenalty - right.opponentRepeatPenalty : 0) ||
    left.exactRematchPenalty - right.exactRematchPenalty ||
    compareSingleCourtRandomTieBreak(left, right);
}

/** Search freezes the global replay and balance envelopes before this ordering. */
export function compareBatchSelections<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>,
  sessionType: SessionType,
  options?: {
    respectPlayerRest?: boolean;
    sessionMode?: SessionMode;
    pairingRandomMode?: V3BatchPairingRandomMode;
    starvationContext?: SocialStarvationContext;
    leftSchedulingRank?: number;
    rightSchedulingRank?: number;
  }
) {
  if (isSocialSession(sessionType)) return compareSocialBatchSelections(left, right, options);
  const leftPlayers = left.selections.flatMap((selection) => selection.players);
  const rightPlayers = right.selections.flatMap((selection) => selection.players);
  const sessionMode = options?.sessionMode ?? SessionMode.MEXICANO;
  return compareSocialFairnessPlayers(leftPlayers, rightPlayers) ||
    (options?.leftSchedulingRank ?? 0) - (options?.rightSchedulingRank ?? 0) ||
    (options?.starvationContext ? compareSocialStarvationPlayers(leftPlayers, rightPlayers, options.starvationContext) : 0) ||
    getRotationVarietyScore(getBatchTotalEntropyGain(right, sessionMode), sessionType) -
      getRotationVarietyScore(getBatchTotalEntropyGain(left, sessionMode), sessionType) ||
    (options?.respectPlayerRest === false ? 0 : compareSoftCadencePlayers(leftPlayers, rightPlayers)) ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap ||
    (sessionType === SessionType.POINTS ? left.maxPointDiffGap - right.maxPointDiffGap : 0) ||
    (sessionType === SessionType.POINTS ? left.totalPointDiffGap - right.totalPointDiffGap : 0) ||
    left.totalExactRematchPenalty - right.totalExactRematchPenalty ||
    compareBatchRandomTieBreak(left, right);
}
