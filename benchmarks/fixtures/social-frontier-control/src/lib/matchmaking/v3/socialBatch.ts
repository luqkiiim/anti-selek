import { SessionMode, SessionType } from "../../../types/enums";
import {
  buildBalanceGuardrail, getBalanceGuardrailPolicy, isBalanceGuardrailAdmissible,
} from "./balanceGuardrail";
import type { BalanceGuardrailPolicy } from "./balanceGuardrail";
import { buildActivePlayers } from "./fairness";
import { evaluateBalancedPartitions, isValidPartitionForMode, getPartitionBalanceGap, getPartitionPointDiffGap } from "./balance";
import { buildConsecutivePlayHistory, getConsecutivePlayMetrics } from "./consecutive";
import {
  buildExactRematchHistory, buildOpponentRepeatHistory, buildPartnerRepeatHistory,
  buildSocialMixHistory, getExactPartitionKey, getExactRematchPenalty,
  getOpponentCoveragePenalty, getOpponentRepeatPenalty, getPartnerCoveragePenalty,
  getPartnerRepeatPenalty, getSharedCourtEncounterFrequencyPenalty, getSharedCourtRepeatPenalty,
} from "./rematch";
import {
  buildRestSummary, compareSocialNumberVectors, getSocialFairnessVector,
  getImmediateReplayCount, getSoftCadenceVector,
  getSocialIdealRestGap, getSocialStarvationSummary, getSocialStarvationVector,
  SOCIAL_STARVATION_METRIC_COUNT,
  canonicalSumEntropyGains, getSocialMatchTypeEntropyGain, getSocialRelationshipEntropyGain,
  getSocialTotalEntropyGain,
  getBatchPairingRandomScore, getBatchSidePairingKeys, getBatchSidePairingRandomScores,
  getPartitionPairingRandomScore, getQuartetRandomScore,
  getRotationVarietyScore,
} from "./scoring";
import {
  buildSocialVarietyContext, createSocialHorizonCoverageScorer, createSocialVarietyCoverageScorer, getSocialVarietyGains,
  getSocialVarietySnapshot, sumSocialVarietyGains,
} from "./socialVariety";
import type { SocialCoverageGainMetric, SocialVarietyContext, SocialVarietyCoverageScorer } from "./socialVariety";
import { createRollingSocialCoverageScorer } from "./socialRollingVariety";
import {
  compareCourtmateCoverageProfiles,
  createSocialCourtmatePriorityScorer,
} from "./socialCourtmatePriority";
import type {
  SocialCourtmatePriorityPartitionMetrics,
} from "./socialCourtmatePriority";
import type {
  ActiveMatchmakerV3Player, MatchmakerV3Player, SocialHistoryMatch,
  SocialCourtmateCoverageEntry,
  V3BatchPairingRandomMode, V3BatchPairingRandomSalts, V3BatchResult, V3BatchSelection,
  V3CandidatePool, V3CompletedMatch, V3SelectionConstraints, V3SingleCourtSelection,
  V3SocialStarvationSummary, SocialVarietyGains,
  V3BalanceGuardrail, V3CoverageGateStatus, V3FinalTieBreak, V3ReplayEnvelopeStatus,
  SocialPriorityPolicy,
} from "./types";

export { compareSocialBatchSelections, compareSocialFairnessPlayers } from "./scoring";

/** Exact one-pair admission rule shared by the beneficial-rescue policy and its contract tests. */
export function isCourtmateBeneficialRescueAdmissible(
  candidateCourtmateGain: number,
  maximumCourtmateGain: number,
  candidateRollingTypeGainUnits: bigint,
  bestRollingTypeGainAtMaximumUnits: bigint
): boolean {
  return candidateCourtmateGain === maximumCourtmateGain ||
    (candidateCourtmateGain === maximumCourtmateGain - 1 &&
      candidateRollingTypeGainUnits > bestRollingTypeGainAtMaximumUnits);
}

/** Negative means the left candidate wins the new policy's T-then-gain tie-break. */
export function compareCourtmateBeneficialRescuePrimary(
  leftRollingTypeGainUnits: bigint,
  leftCourtmateGain: number,
  rightRollingTypeGainUnits: bigint,
  rightCourtmateGain: number
): number {
  if (leftRollingTypeGainUnits !== rightRollingTypeGainUnits) {
    return leftRollingTypeGainUnits > rightRollingTypeGainUnits ? -1 : 1;
  }
  if (leftCourtmateGain !== rightCourtmateGain) {
    return leftCourtmateGain > rightCourtmateGain ? -1 : 1;
  }
  return 0;
}

function canonicalSum(values: number[]) {
  return values.sort((a, b) => a - b).reduce((total, value) => total + value, 0);
}

function getSocialVarietyTotals<T extends ActiveMatchmakerV3Player>(
  selections: readonly V3SingleCourtSelection<T>[],
  sessionMode: SessionMode
) {
  const totalSocialVarietyGains = {
    courtmates: canonicalSum(selections.map((selection) => selection.socialVarietyGains?.courtmates ?? 0)),
    partners: canonicalSum(selections.map((selection) => selection.socialVarietyGains?.partners ?? 0)),
    opponents: canonicalSum(selections.map((selection) => selection.socialVarietyGains?.opponents ?? 0)),
    matchType: sessionMode === SessionMode.MIXICANO
      ? canonicalSum(selections.map((selection) => selection.socialVarietyGains?.matchType ?? 0))
      : 0,
  };
  const matchTypeEntropyGain = getSocialMatchTypeEntropyGain(totalSocialVarietyGains);
  const relationshipEntropyGain = getSocialRelationshipEntropyGain(totalSocialVarietyGains);
  return {
    totalSocialVarietyGains,
    totalMatchTypeEntropyGain: matchTypeEntropyGain,
    totalRelationshipEntropyGain: relationshipEntropyGain,
    totalSocialVarietyGain: getSocialTotalEntropyGain(totalSocialVarietyGains, sessionMode),
  };
}

export interface SocialCourtSchedule<T extends ActiveMatchmakerV3Player> {
  rank: number;
  courts: Array<V3SelectionConstraints<T> | undefined>;
}

export interface SocialBatchOptions<T extends MatchmakerV3Player> {
  courtCount: number;
  sessionMode: SessionMode;
  respectPlayerRest?: boolean;
  /** Full unpaused roster size, including busy players. */
  rotationPlayerCount?: number;
  completedMatches?: V3CompletedMatch[];
  socialHistoryMatches?: SocialHistoryMatch[];
  socialVarietyContext?: SocialVarietyContext;
  randomFn?: () => number;
  candidatePool?: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
  lockedPlayerIds?: ReadonlySet<string>;
  schedules?: SocialCourtSchedule<ActiveMatchmakerV3Player<T>>[];
  selectionConstraints?: V3SelectionConstraints<ActiveMatchmakerV3Player<T>>;
  /** Benchmark-only Social lexicographic policy. Rejected outside SOCIAL_MIX. */
  socialPriorityPolicy?: SocialPriorityPolicy;
  pairingRandomMode?: V3BatchPairingRandomMode;
  searchLimits?: { maxBranches?: number; maxMs?: number };
  excludedQuartetKeys?: ReadonlySet<string>;
  excludedPartitionKey?: string;
}

export interface RotationBatchOptions<T extends MatchmakerV3Player> extends SocialBatchOptions<T> {
  sessionType: SessionType;
  balanceGuardrailPolicy?: Partial<Pick<BalanceGuardrailPolicy, "nearBestWindow" | "absoluteCeiling">>;
  /** Benchmark-only opt-in. Omitted keeps the production legacy four-facet gate. */
  coverageGainMetric?: "social-horizon-321" | "rolling-equal" | "social-horizon-3211";
}

export interface RotationStarvationInterventionMeasurement<T extends ActiveMatchmakerV3Player> {
  /** The normal policy result, with starvation protection enabled. */
  production: SocialBatchResult<T>;
  /** Diagnostic counterfactual; never used by production selection adapters. */
  withoutStarvation: SocialBatchResult<T>;
  /** Null when either search cannot certify a complete selected batch. */
  selectedSetChanged: boolean | null;
  measurementComplete: boolean;
}

export function usesRotationMatchmaking(sessionType: SessionType | string) {
  return sessionType === SessionType.SOCIAL_MIX || sessionType === SessionType.POINTS || sessionType === SessionType.ELO;
}

export type SocialBatchResult<T extends ActiveMatchmakerV3Player> = V3BatchResult<T> & {
  scheduleIndex: number | null;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  bestImmediateReplayCount: number | null;
  allowedImmediateReplayCount: number | null;
  chosenImmediateReplayCount: number | null;
  replayCertified: boolean;
  replayEnvelopeStatus: V3ReplayEnvelopeStatus;
  bestMinimumReplayCoverageGain: number | null;
  chosenImmediateCoverageGain: number | null;
  coverageGateCertified: boolean;
  coverageGateStatus: V3CoverageGateStatus;
  chosenReplayCoverageEligible: boolean | null;
  coverageGainMetric: SocialCoverageGainMetric;
  varietyOptimal: boolean;
  balanceCertified?: boolean;
  socialPriorityPolicy?: SocialPriorityPolicy;
  priorityCertified?: boolean;
  chosenNewCourtmatePairCount?: number | null;
  chosenPostBatchCourtmateCoverage?: SocialCourtmateCoverageEntry[] | null;
  chosenRollingMatchTypeGain?: number | null;
  courtmateGainMaximumCertified?: boolean;
  courtmateGainMaximum?: number | null;
  chosenCourtmateGainDeficit?: number | null;
  bestRollingMatchTypeGainAtGmax?: number | null;
};

export function summarizeSocialBatch<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  salts: V3BatchPairingRandomSalts = { combined: 0, sides: [0, 0] },
  sessionMode = SessionMode.MEXICANO
): V3BatchSelection<T> {
  const sum = (get: (selection: V3SingleCourtSelection<T>) => number) =>
    selections.reduce((total, selection) => total + get(selection), 0);
  return {
    selections,
    restSummary: buildRestSummary(selections.flatMap((selection) => selection.players)),
    maxBalanceGap: Math.max(0, ...selections.map((selection) => selection.balanceGap)),
    totalBalanceGap: sum((selection) => selection.balanceGap),
    maxPointDiffGap: Math.max(0, ...selections.map((selection) => selection.pointDiffGap)),
    totalPointDiffGap: sum((selection) => selection.pointDiffGap),
    totalSharedCourtRepeatPenalty: sum((selection) => selection.sharedCourtRepeatPenalty),
    totalSharedCourtEncounterFrequencyPenalty: sum((selection) => selection.sharedCourtEncounterFrequencyPenalty ?? 0),
    totalPartnerCoveragePenalty: sum((selection) => selection.partnerCoveragePenalty),
    totalOpponentCoveragePenalty: sum((selection) => selection.opponentCoveragePenalty),
    totalPartnerRepeatPenalty: sum((selection) => selection.partnerRepeatPenalty),
    totalOpponentRepeatPenalty: sum((selection) => selection.opponentRepeatPenalty),
    totalExactRematchPenalty: sum((selection) => selection.exactRematchPenalty),
    ...getSocialVarietyTotals(selections, sessionMode),
    totalRandomScore: sum((selection) => selection.randomScore),
    totalPairingRandomScore: getBatchPairingRandomScore(selections, salts.combined),
    sidePairingLayoutKeys: getBatchSidePairingKeys(selections),
    sidePairingRandomScores: getBatchSidePairingRandomScores(selections, salts.sides),
  };
}

type Candidate<T extends ActiveMatchmakerV3Player> = {
  selection: V3SingleCourtSelection<T>;
  mask: bigint;
  varietyScored: boolean;
  coverageGainUnits?: bigint;
  socialPriorityMetrics?: SocialCourtmatePriorityPartitionMetrics;
  priorityRankingMetrics?: SocialPriorityBatchMetrics;
};

type SocialPriorityBatchMetrics = {
  newCourtmatePairs: number;
  courtmateCoverageProfile: readonly SocialCourtmateCoverageEntry[];
  rollingMatchTypeGainUnits: bigint;
  immediateReplayCount: number;
  softCadenceVector: number[];
  newPartnerPairs: number;
  newOpponentPairs: number;
  relationshipEntropyGain: number;
  sharedCourtRepeatPenalty: number;
  sharedCourtEncounterFrequencyPenalty: number;
  partnerRepeatPenalty: number;
  opponentRepeatPenalty: number;
  exactRematchPenalty: number;
  maxBalanceGap: number;
  totalBalanceGap: number;
  maxPointDiffGap: number;
  totalPointDiffGap: number;
};

type SocialPriorityRotationClass = {
  fairness: number[];
  rank: number;
  starvation: number[];
};

function compareSocialPriorityRotationClasses(
  left: SocialPriorityRotationClass,
  right: SocialPriorityRotationClass
): number {
  return compareSocialNumberVectors(left.fairness, right.fairness) ||
    left.rank - right.rank ||
    compareSocialNumberVectors(left.starvation, right.starvation);
}

function compareSocialPriorityMetrics(
  left: SocialPriorityBatchMetrics,
  right: SocialPriorityBatchMetrics,
  respectRest: boolean
): number {
  if (left.newCourtmatePairs !== right.newCourtmatePairs) {
    return left.newCourtmatePairs > right.newCourtmatePairs ? -1 : 1;
  }
  const coverageComparison = compareCourtmateCoverageProfiles(
    left.courtmateCoverageProfile,
    right.courtmateCoverageProfile
  );
  if (coverageComparison !== 0) return -coverageComparison;
  if (left.rollingMatchTypeGainUnits !== right.rollingMatchTypeGainUnits) {
    return left.rollingMatchTypeGainUnits > right.rollingMatchTypeGainUnits ? -1 : 1;
  }
  if (respectRest) {
    if (left.immediateReplayCount !== right.immediateReplayCount) {
      return left.immediateReplayCount - right.immediateReplayCount;
    }
    const softDiff = compareSocialNumberVectors(left.softCadenceVector, right.softCadenceVector);
    if (softDiff !== 0) return softDiff;
  }
  if (left.newPartnerPairs !== right.newPartnerPairs) return left.newPartnerPairs > right.newPartnerPairs ? -1 : 1;
  if (left.newOpponentPairs !== right.newOpponentPairs) return left.newOpponentPairs > right.newOpponentPairs ? -1 : 1;
  if (left.relationshipEntropyGain !== right.relationshipEntropyGain) {
    return left.relationshipEntropyGain > right.relationshipEntropyGain ? -1 : 1;
  }
  return left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
    left.sharedCourtEncounterFrequencyPenalty - right.sharedCourtEncounterFrequencyPenalty ||
    left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
    left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
    left.exactRematchPenalty - right.exactRematchPenalty ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap ||
    left.maxPointDiffGap - right.maxPointDiffGap ||
    left.totalPointDiffGap - right.totalPointDiffGap;
}

function compareSocialNearBestMetrics(
  left: SocialPriorityBatchMetrics,
  right: SocialPriorityBatchMetrics,
  respectRest: boolean
): number {
  if (left.rollingMatchTypeGainUnits !== right.rollingMatchTypeGainUnits) {
    return left.rollingMatchTypeGainUnits > right.rollingMatchTypeGainUnits ? -1 : 1;
  }
  const coverageComparison = compareCourtmateCoverageProfiles(
    left.courtmateCoverageProfile,
    right.courtmateCoverageProfile
  );
  if (coverageComparison !== 0) return -coverageComparison;
  if (respectRest) {
    if (left.immediateReplayCount !== right.immediateReplayCount) {
      return left.immediateReplayCount - right.immediateReplayCount;
    }
    const softDiff = compareSocialNumberVectors(left.softCadenceVector, right.softCadenceVector);
    if (softDiff !== 0) return softDiff;
  }
  if (left.newPartnerPairs !== right.newPartnerPairs) return left.newPartnerPairs > right.newPartnerPairs ? -1 : 1;
  if (left.newOpponentPairs !== right.newOpponentPairs) return left.newOpponentPairs > right.newOpponentPairs ? -1 : 1;
  if (left.relationshipEntropyGain !== right.relationshipEntropyGain) {
    return left.relationshipEntropyGain > right.relationshipEntropyGain ? -1 : 1;
  }
  return left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
    left.sharedCourtEncounterFrequencyPenalty - right.sharedCourtEncounterFrequencyPenalty ||
    left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
    left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
    left.exactRematchPenalty - right.exactRematchPenalty ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap ||
    left.maxPointDiffGap - right.maxPointDiffGap ||
    left.totalPointDiffGap - right.totalPointDiffGap;
}

function compareSocialBeneficialRescueMetrics(
  left: SocialPriorityBatchMetrics,
  right: SocialPriorityBatchMetrics,
  respectRest: boolean
): number {
  const primaryComparison = compareCourtmateBeneficialRescuePrimary(
    left.rollingMatchTypeGainUnits,
    left.newCourtmatePairs,
    right.rollingMatchTypeGainUnits,
    right.newCourtmatePairs
  );
  if (primaryComparison !== 0) return primaryComparison;
  const coverageComparison = compareCourtmateCoverageProfiles(
    left.courtmateCoverageProfile,
    right.courtmateCoverageProfile
  );
  if (coverageComparison !== 0) return -coverageComparison;
  if (respectRest) {
    if (left.immediateReplayCount !== right.immediateReplayCount) {
      return left.immediateReplayCount - right.immediateReplayCount;
    }
    const softDiff = compareSocialNumberVectors(left.softCadenceVector, right.softCadenceVector);
    if (softDiff !== 0) return softDiff;
  }
  if (left.newPartnerPairs !== right.newPartnerPairs) return left.newPartnerPairs > right.newPartnerPairs ? -1 : 1;
  if (left.newOpponentPairs !== right.newOpponentPairs) return left.newOpponentPairs > right.newOpponentPairs ? -1 : 1;
  if (left.relationshipEntropyGain !== right.relationshipEntropyGain) {
    return left.relationshipEntropyGain > right.relationshipEntropyGain ? -1 : 1;
  }
  return left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
    left.sharedCourtEncounterFrequencyPenalty - right.sharedCourtEncounterFrequencyPenalty ||
    left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
    left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
    left.exactRematchPenalty - right.exactRematchPenalty ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap ||
    left.maxPointDiffGap - right.maxPointDiffGap ||
    left.totalPointDiffGap - right.totalPointDiffGap;
}

/** Whole-batch set packing. No Social candidate cap, local exemplars or anchor locks. */
export function findBestSocialBatchSelection<T extends MatchmakerV3Player>(
  players: T[], options: SocialBatchOptions<T>
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  return findBestRotationBatchSelection(players, { ...options, sessionType: SessionType.SOCIAL_MIX });
}

/**
 * Benchmark-only counterfactual that measures whether starvation changes the
 * selected player set. It replays the same random draws for both searches.
 */
export function measureRotationStarvationIntervention<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>
): RotationStarvationInterventionMeasurement<ActiveMatchmakerV3Player<T>> {
  const sourceRandom = options.randomFn ?? Math.random;
  const draws: number[] = [];
  let drawIndex = 0;
  const replayRandom = () => {
    if (drawIndex < draws.length) return draws[drawIndex++];
    const value = sourceRandom();
    draws.push(value);
    drawIndex++;
    return value;
  };
  const production = findBestRotationBatchSelectionInternal(players, { ...options, randomFn: replayRandom });
  drawIndex = 0;
  const withoutStarvation = findBestRotationBatchSelectionInternal(players, { ...options, randomFn: replayRandom }, true);
  const selectedSetKey = (result: SocialBatchResult<ActiveMatchmakerV3Player<T>>) =>
    result.selection?.selections.flatMap((selection) => selection.players.map((player) => player.userId))
      .sort().join("|") ?? null;
  const requiresBalanceCertificate = options.sessionType === SessionType.POINTS || options.sessionType === SessionType.ELO;
  const isComplete = (result: SocialBatchResult<ActiveMatchmakerV3Player<T>>) =>
    Boolean(result.selection && result.fairnessCertified && result.starvationCertified && result.varietyOptimal &&
      (options.respectPlayerRest === false || (result.replayCertified && result.coverageGateCertified)) &&
      (!requiresBalanceCertificate || result.balanceCertified));
  const measurementComplete = isComplete(production) && isComplete(withoutStarvation);
  return {
    production,
    withoutStarvation,
    selectedSetChanged: measurementComplete
      ? selectedSetKey(production) !== selectedSetKey(withoutStarvation)
      : null,
    measurementComplete,
  };
}

/** Shared rotation, starvation, replay/coverage gates, entropy and soft cadence; Balanced adds admissibility. */
export function findBestRotationBatchSelection<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  return findBestRotationBatchSelectionInternal(players, options);
}

function findBestRotationBatchSelectionInternal<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>, ignoreStarvationForDiagnostic = false
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  const socialPriorityPolicy = options.socialPriorityPolicy;
  if (socialPriorityPolicy && options.sessionType !== SessionType.SOCIAL_MIX) {
    throw new Error("socialPriorityPolicy is supported only for SOCIAL_MIX sessions.");
  }
  if (socialPriorityPolicy && socialPriorityPolicy !== "courtmate-first" &&
    socialPriorityPolicy !== "courtmate-near-best" &&
    socialPriorityPolicy !== "courtmate-beneficial-rescue") {
    throw new Error("Unsupported socialPriorityPolicy.");
  }
  const socialCourtmateNearBest = socialPriorityPolicy === "courtmate-near-best";
  const socialCourtmateBeneficialRescue = socialPriorityPolicy === "courtmate-beneficial-rescue";
  const socialCourtmateEnvelopePolicy = socialCourtmateNearBest || socialCourtmateBeneficialRescue;
  const balancePolicy = getBalanceGuardrailPolicy(options.sessionType, options.balanceGuardrailPolicy);
  const respectRest = options.respectPlayerRest !== false;
  const gateRespectRest = respectRest && !socialPriorityPolicy;
  const randomFn = options.randomFn ?? Math.random;
  const sourcePool = options.candidatePool;
  const socialCandidatePool = sourcePool?.tieZone && sourcePool.selectionBand
    ? {
        ...sourcePool,
        selectablePlayers: [...sourcePool.selectionBand.players],
        candidatePlayers: [...sourcePool.lockedPlayers, ...sourcePool.selectionBand.players],
        tieZone: null,
    }
    : sourcePool;
  const availablePlayers = sourcePool?.activePlayers ?? buildActivePlayers(players, { randomFn, respectPlayerRest: false });
  // Balanced count/arrival fairness is certified globally rather than through
  // old rest tie zones, implicit anchors or quartet compression.
  const active = balancePolicy ? availablePlayers : socialCandidatePool?.candidatePlayers ?? availablePlayers;
  const rotationPlayerCount = options.rotationPlayerCount ?? players.filter((player) => !player.isPaused).length;
  const starvationContext = { activePlayerCount: rotationPlayerCount, availablePlayers };
  const idealRestGap = getSocialIdealRestGap(rotationPlayerCount);
  const overdueAvailablePlayers = availablePlayers.filter((player) => player.restTurns > idealRestGap);
  const required = options.courtCount * 4;
  const varietyMetricIndex = SOCIAL_STARVATION_METRIC_COUNT;
  const softCadenceMetricIndex = respectRest ? varietyMetricIndex + 1 : null;
  const locked = new Set([
    ...(!balancePolicy ? socialCandidatePool?.lockedPlayers.map((player) => player.userId) ?? [] : []),
    ...(options.lockedPlayerIds ?? []),
  ]);
  const profiles = options.schedules ?? [{ rank: 0, courts: Array.from({ length: options.courtCount }, () => options.selectionConstraints) }];
  const scheduleIndexes = profiles
    .map((_, index) => index)
    .sort((left, right) => profiles[left].rank - profiles[right].rank || left - right);
  const salts = { combined: randomFn(), sides: (options.pairingRandomMode === "side-balanced" ? [randomFn(), randomFn()] : [0, 0]) as [number, number] };
  const history = options.completedMatches ?? [];
  const context = options.socialVarietyContext?.sessionMode === options.sessionMode
    ? options.socialVarietyContext
    : buildSocialVarietyContext(players, options.socialHistoryMatches ?? history, {
        sessionMode: options.sessionMode,
        opportunityConstraints: profiles.flatMap((profile) => profile.courts.filter((court): court is V3SelectionConstraints<ActiveMatchmakerV3Player<T>> => Boolean(court))),
      });
  const priorityContext = socialPriorityPolicy
    ? buildSocialVarietyContext(players, history, {
        sessionMode: options.sessionMode,
        includePausedPlayers: true,
      })
    : context;
  const candidateScoringContext = socialPriorityPolicy ? priorityContext : context;
  const socialPriorityScorer = socialPriorityPolicy
    ? createSocialCourtmatePriorityScorer(priorityContext, history)
    : null;
  const coverageGainMetric: SocialCoverageGainMetric = options.coverageGainMetric ?? "legacy-four-facet";
  const rollingCoverage = coverageGainMetric === "rolling-equal" || coverageGainMetric === "social-horizon-3211";
  const coverageContext = (coverageGainMetric === "social-horizon-321" || rollingCoverage) &&
    players.some((player) => !context.playersByUserId.has(player.userId))
    ? buildSocialVarietyContext(players, options.socialHistoryMatches ?? history, {
        sessionMode: options.sessionMode,
        opportunityConstraints: profiles.flatMap((profile) => profile.courts.filter((court): court is V3SelectionConstraints<ActiveMatchmakerV3Player<T>> => Boolean(court))),
        includePausedPlayers: true,
      })
    : context;
  // Experimental modes change only replay admission value. Production keeps
  // its existing coverage gate and lifetime entropy ranking by default.
  const coverageScorer: SocialVarietyCoverageScorer = rollingCoverage
    ? createRollingSocialCoverageScorer(
        coverageGainMetric === "social-horizon-3211" ? coverageContext : context,
        history,
        coverageGainMetric,
        coverageContext,
      )
    : coverageGainMetric === "social-horizon-321"
      ? createSocialHorizonCoverageScorer(coverageContext)
      : createSocialVarietyCoverageScorer(context, options.sessionMode);
  const playersById = new Map(active.map((player) => [player.userId, player]));
  const bits = new Map(active.map((player, index) => [player.userId, BigInt(1) << BigInt(index)]));
  const lockedMask = [...locked].reduce((mask, id) => mask | (bits.get(id) ?? BigInt(0)), BigInt(0));
  const locksFeasible = locked.size <= required && [...locked].every((id) => playersById.has(id));
  const rematches = buildExactRematchHistory(history);
  const partners = balancePolicy ? null : buildPartnerRepeatHistory(history);
  const opponents = balancePolicy ? null : buildOpponentRepeatHistory(history);
  const social = balancePolicy ? null : buildSocialMixHistory(history);
  const consecutive = buildConsecutivePlayHistory(history);
  const exact = options.courtCount <= 2 && active.length <= 14;
  // Exact small batches ignore default budgets, but explicit budgets still permit testing/cancellation.
  const maxBranches = options.searchLimits?.maxBranches ?? (exact ? Infinity : 50_000);
  const phaseBudgetMs = options.searchLimits?.maxMs ?? (exact ? Infinity : 2_000);
  let deadline = Date.now() + phaseBudgetMs;
  let phaseExplored = 0;
  let explored = 0;
  let pruned = 0;
  let interrupted = false;
  let quartetCount = 0;
  let validPartitions = 0;
  let best: V3BatchSelection<ActiveMatchmakerV3Player<T>> | null = null;
  let bestFairness: number[] | null = null;
  let bestMetrics: number[] | null = null;
  let bestSocialPriorityMetrics: SocialPriorityBatchMetrics | null = null;
  let nearBestRotationClass: SocialPriorityRotationClass | null = null;
  let nearBestCourtmateGainMaximum: number | null = null;
  let bestRollingMatchTypeGainAtGmaxUnits: bigint | null = null;
  let nearBestFrontierPhase = false;
  let nearBestSelectionPhase = false;
  let beneficialRescueSelectionPhase = false;
  let nearBestFrontierCertified = false;
  let nearBestFrontierLimitReached = false;
  let nearBestSelectionLimitReached = false;
  let nearBestPriorityCertified = false;
  let scheduleIndex: number | null = null;
  let bestRank = Infinity;
  let balanceGuardrail: V3BalanceGuardrail | undefined;
  let balanceCertified = !balancePolicy;
  let baselinePhase = Boolean(balancePolicy);
  let replayBaselinePhase = !balancePolicy && gateRespectRest;
  let coverageBaselinePhase = false;
  let baselineProven = false;
  let replayBaselineProven = false;
  let replayBaselineLimitReached = false;
  let coverageBaselineLimitReached = false;
  let searchAttemptCount = 0;
  type LateTieFrontier = {
    strongerMetrics: number[];
    exactRematchPenalty: number;
    firstLayoutKey: string;
    multipleLayouts: boolean;
    firstRandomScore: number;
    variedRandomScores: boolean;
    exactAlternative: boolean;
  };
  let lateTieFrontier: LateTieFrontier | null = null;
  type BalanceBaseline = {
    fairness: number[]; rank: number; starvation: number[];
    maxBalanceGap: number; totalBalanceGap: number;
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[]; mask: bigint; index: number;
  };
  let baseline: BalanceBaseline | null = null;
  type ReplayBaseline = {
    fairness: number[]; rank: number; starvation: number[]; replayCount: number;
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[]; mask: bigint; index: number;
  };
  type CoverageBaseline = ReplayBaseline & { coverageGainUnits: bigint };
  let replayBaseline: ReplayBaseline | null = null;
  let coverageBaseline: CoverageBaseline | null = null;
  let bestImmediateReplayCount: number | null = null;
  let allowedImmediateReplayCount: number | null = null;
  let bestMinimumReplayCoverageGain: number | null = null;
  let coverageGateCertified = !gateRespectRest;
  let coverageGateUpperBoundCertified = false;
  let coverageGateStatus: V3CoverageGateStatus = gateRespectRest ? "UNCERTIFIED" : "DISABLED";
  let replayCertified = !gateRespectRest;
  let replayEnvelopeStatus: V3ReplayEnvelopeStatus = gateRespectRest ? "UNCERTIFIED" : "DISABLED";
  const fairnessCache = new Map<bigint, number[]>();
  const starvationCache = new Map<bigint, number[]>();
  const immediateReplayCache = new Map<bigint, number>();
  const softCadenceCache = new Map<bigint, number[]>();
  const getFairness = (mask: bigint) => {
    let vector = fairnessCache.get(mask);
    if (!vector) {
      vector = getSocialFairnessVector(active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)));
      fairnessCache.set(mask, vector);
    }
    return vector;
  };
  const getImmediateReplayCountForMask = (mask: bigint) => {
    let count = immediateReplayCache.get(mask);
    if (count === undefined) {
      count = getImmediateReplayCount(active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)));
      immediateReplayCache.set(mask, count);
    }
    return count;
  };
  const getSoftCadenceVectorForMask = (mask: bigint) => {
    let vector = softCadenceCache.get(mask);
    if (!vector) {
      vector = getSoftCadenceVector(active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)));
      softCadenceCache.set(mask, vector);
    }
    return vector;
  };
  const getCandidateCoverageGainUnits = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.coverageGainUnits === undefined) {
      candidate.coverageGainUnits = coverageScorer.getPartitionGainUnits(candidate.selection.partition);
    }
    return candidate.coverageGainUnits;
  };
  const getBatchCoverageGainUnits = (chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[]) =>
    chosen.reduce((gain, candidate) => gain + getCandidateCoverageGainUnits(candidate), BigInt(0));
  const getCandidateSocialPriorityMetrics = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.socialPriorityMetrics === undefined) {
      candidate.socialPriorityMetrics = socialPriorityScorer?.getPartitionMetrics(candidate.selection.partition);
    }
    return candidate.socialPriorityMetrics!;
  };
  const getSocialPriorityBatchMetrics = (
    chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[],
    mask: bigint,
    selections = chosen.map((candidate) => candidate.selection),
    variety = getSocialVarietyTotals(selections, options.sessionMode)
  ): SocialPriorityBatchMetrics => {
    const courtmateGains = new Map<string, number>();
    let newCourtmatePairs = 0;
    let newPartnerPairs = 0;
    let newOpponentPairs = 0;
    let rollingMatchTypeGainUnits = BigInt(0);
    for (const candidate of chosen) {
      const candidateMetrics = getCandidateSocialPriorityMetrics(candidate);
      newCourtmatePairs += candidateMetrics.newCourtmatePairs;
      newPartnerPairs += candidateMetrics.newPartnerPairs;
      newOpponentPairs += candidateMetrics.newOpponentPairs;
      rollingMatchTypeGainUnits += candidateMetrics.rollingMatchTypeGainUnits;
      for (const [userId, gain] of candidateMetrics.courtmateGainsByPlayer) {
        courtmateGains.set(userId, (courtmateGains.get(userId) ?? 0) + gain);
      }
    }
    const scorer = socialPriorityScorer!;
    return {
      newCourtmatePairs,
      courtmateCoverageProfile: scorer.getPostBatchCourtmateCoverageProfile(courtmateGains),
      rollingMatchTypeGainUnits,
      immediateReplayCount: getImmediateReplayCountForMask(mask),
      softCadenceVector: respectRest ? getSoftCadenceVectorForMask(mask) : [],
      newPartnerPairs,
      newOpponentPairs,
      relationshipEntropyGain: getSocialRelationshipEntropyGain(variety.totalSocialVarietyGains),
      sharedCourtRepeatPenalty: selections.reduce((sum, selection) => sum + selection.sharedCourtRepeatPenalty, 0),
      sharedCourtEncounterFrequencyPenalty: selections.reduce(
        (sum, selection) => sum + (selection.sharedCourtEncounterFrequencyPenalty ?? 0), 0
      ),
      partnerRepeatPenalty: selections.reduce((sum, selection) => sum + selection.partnerRepeatPenalty, 0),
      opponentRepeatPenalty: selections.reduce((sum, selection) => sum + selection.opponentRepeatPenalty, 0),
      exactRematchPenalty: selections.reduce((sum, selection) => sum + selection.exactRematchPenalty, 0),
      maxBalanceGap: Math.max(0, ...selections.map((selection) => selection.balanceGap)),
      totalBalanceGap: canonicalSum(selections.map((selection) => selection.balanceGap)),
      maxPointDiffGap: Math.max(0, ...selections.map((selection) => selection.pointDiffGap)),
      totalPointDiffGap: canonicalSum(selections.map((selection) => selection.pointDiffGap)),
    };
  };
  const getCandidatePriorityRankingMetrics = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (!candidate.priorityRankingMetrics) {
      candidate.priorityRankingMetrics = getSocialPriorityBatchMetrics(
        [candidate], candidate.mask, [candidate.selection]
      );
    }
    return candidate.priorityRankingMetrics;
  };
  const toPriorityMetricVector = (metrics: SocialPriorityBatchMetrics, starvation: readonly number[]) => [
    ...starvation,
    -metrics.newCourtmatePairs,
    ...metrics.courtmateCoverageProfile.map((entry) => -(entry.covered / entry.possible)),
    -Number(metrics.rollingMatchTypeGainUnits) /
      Number(socialPriorityScorer?.rollingTypeDenominator ?? BigInt(1)),
    ...(respectRest
      ? [metrics.immediateReplayCount, ...metrics.softCadenceVector]
      : []),
    -metrics.newPartnerPairs,
    -metrics.newOpponentPairs,
    -metrics.relationshipEntropyGain,
    metrics.sharedCourtRepeatPenalty,
    metrics.sharedCourtEncounterFrequencyPenalty,
    metrics.partnerRepeatPenalty,
    metrics.opponentRepeatPenalty,
    metrics.exactRematchPenalty,
    metrics.maxBalanceGap,
    metrics.totalBalanceGap,
    metrics.maxPointDiffGap,
    metrics.totalPointDiffGap,
  ];
  const toNearBestPriorityMetricVector = (metrics: SocialPriorityBatchMetrics, starvation: readonly number[]) => [
    ...starvation,
    -Number(metrics.rollingMatchTypeGainUnits) /
      Number(socialPriorityScorer?.rollingTypeDenominator ?? BigInt(1)),
    ...metrics.courtmateCoverageProfile.map((entry) => -(entry.covered / entry.possible)),
    ...(respectRest ? [metrics.immediateReplayCount, ...metrics.softCadenceVector] : []),
    -metrics.newPartnerPairs,
    -metrics.newOpponentPairs,
    -metrics.relationshipEntropyGain,
    metrics.sharedCourtRepeatPenalty,
    metrics.sharedCourtEncounterFrequencyPenalty,
    metrics.partnerRepeatPenalty,
    metrics.opponentRepeatPenalty,
    metrics.exactRematchPenalty,
    metrics.maxBalanceGap,
    metrics.totalBalanceGap,
    metrics.maxPointDiffGap,
    metrics.totalPointDiffGap,
  ];
  const toBeneficialRescuePriorityMetricVector = (metrics: SocialPriorityBatchMetrics, starvation: readonly number[]) => [
    ...starvation,
    -Number(metrics.rollingMatchTypeGainUnits) /
      Number(socialPriorityScorer?.rollingTypeDenominator ?? BigInt(1)),
    -metrics.newCourtmatePairs,
    ...metrics.courtmateCoverageProfile.map((entry) => -(entry.covered / entry.possible)),
    ...(respectRest ? [metrics.immediateReplayCount, ...metrics.softCadenceVector] : []),
    -metrics.newPartnerPairs,
    -metrics.newOpponentPairs,
    -metrics.relationshipEntropyGain,
    metrics.sharedCourtRepeatPenalty,
    metrics.sharedCourtEncounterFrequencyPenalty,
    metrics.partnerRepeatPenalty,
    metrics.opponentRepeatPenalty,
    metrics.exactRematchPenalty,
    metrics.maxBalanceGap,
    metrics.totalBalanceGap,
    metrics.maxPointDiffGap,
    metrics.totalPointDiffGap,
  ];
  const getGlobalCoverageGainUpperBoundUnits = () => {
    const lockedPlayers = active.filter((player) => locked.has(player.userId));
    const remainingCount = Math.max(0, required - lockedPlayers.length);
    const lockedGain = lockedPlayers.reduce((sum, player) =>
      sum + coverageScorer.getMaximumSingleMatchGainUnits(player.userId), BigInt(0));
    const remainingUpper = active
      .filter((player) => !locked.has(player.userId))
      .map((player) => coverageScorer.getMaximumSingleMatchGainUnits(player.userId))
      .sort((left, right) => left > right ? -1 : left < right ? 1 : 0)
      .slice(0, remainingCount)
      .reduce((sum, gain) => sum + gain, BigInt(0));
    return lockedGain + remainingUpper;
  };
  const getCandidateTotalEntropyGain = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) =>
    getSocialTotalEntropyGain(candidate.selection.socialVarietyGains, options.sessionMode);
  const compareCandidateStrongerClass = (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
    compareSocialNumberVectors(getFairness(left.mask), getFairness(right.mask)) ||
    compareSocialNumberVectors(getStarvation(left.mask), getStarvation(right.mask));
  const compareCandidatesForReplay = (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
    compareCandidateStrongerClass(left, right) ||
    getImmediateReplayCountForMask(left.mask) - getImmediateReplayCountForMask(right.mask) ||
    left.selection.balanceGap - right.selection.balanceGap;
  const compareCandidatesForCoverage = (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
    compareCandidateStrongerClass(left, right) ||
    getImmediateReplayCountForMask(left.mask) - getImmediateReplayCountForMask(right.mask) ||
    (getCandidateCoverageGainUnits(left) > getCandidateCoverageGainUnits(right) ? -1
      : getCandidateCoverageGainUnits(left) < getCandidateCoverageGainUnits(right) ? 1 : 0);
  const compareCandidatesForVariety = (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
    compareCandidateStrongerClass(left, right) ||
    getRotationVarietyScore(getCandidateTotalEntropyGain(right), options.sessionType) -
      getRotationVarietyScore(getCandidateTotalEntropyGain(left), options.sessionType) ||
    (respectRest ? compareSocialNumberVectors(getSoftCadenceVectorForMask(left.mask), getSoftCadenceVectorForMask(right.mask)) : 0);
  const compareCandidatesForSocialPriority = (
    left: Candidate<ActiveMatchmakerV3Player<T>>,
    right: Candidate<ActiveMatchmakerV3Player<T>>
  ) => compareCandidateStrongerClass(left, right) ||
    compareSocialPriorityMetrics(
      getCandidatePriorityRankingMetrics(left),
      getCandidatePriorityRankingMetrics(right),
      respectRest
    );
  const compareCandidatesForSocialNearBest = (
    left: Candidate<ActiveMatchmakerV3Player<T>>,
    right: Candidate<ActiveMatchmakerV3Player<T>>
  ) => compareCandidateStrongerClass(left, right) || compareSocialNearBestMetrics(
    getCandidatePriorityRankingMetrics(left),
    getCandidatePriorityRankingMetrics(right),
    respectRest
  );
  const compareCandidatesForSocialBeneficialRescue = (
    left: Candidate<ActiveMatchmakerV3Player<T>>,
    right: Candidate<ActiveMatchmakerV3Player<T>>
  ) => compareCandidateStrongerClass(left, right) || compareSocialBeneficialRescueMetrics(
    getCandidatePriorityRankingMetrics(left),
    getCandidatePriorityRankingMetrics(right),
    respectRest
  );
  const getOptimisticImmediateReplayCount = (selectedMask: bigint, remainingSlots: number) => {
    const selected = active.filter((player) => (selectedMask & bits.get(player.userId)!) !== BigInt(0));
    const selectable = active.filter((player) => (selectedMask & bits.get(player.userId)!) === BigInt(0));
    // Relax court legality, mandatory-player constraints and overlap between
    // remaining courts. Include every available positive-rest player first.
    // This is an optimistic lower bound on zero-rest assignments.
    const nonzeroRestSlots = selectable.filter((player) => player.restTurns !== 0).length;
    return getImmediateReplayCount(selected) + Math.max(0, remainingSlots - nonzeroRestSlots);
  };
  const getOptimisticSoftCadenceVector = (selectedMask: bigint, remainingSlots: number) => {
    const selected = active.filter((player) => (selectedMask & bits.get(player.userId)!) !== BigInt(0));
    // Relax court legality, mandatory-player constraints and overlap between
    // remaining courts. The highest rest turns give the best soft vector.
    const optimisticRest = active
      .filter((player) => (selectedMask & bits.get(player.userId)!) === BigInt(0))
      .sort((left, right) => right.restTurns - left.restTurns)
      .slice(0, remainingSlots);
    return getSoftCadenceVector([...selected, ...optimisticRest]);
  };
  const getOptimisticCoverageGainUnits = (
    chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[],
    remaining: readonly number[],
    used: bigint,
    lists: readonly Candidate<ActiveMatchmakerV3Player<T>>[][]
  ) => chosen.reduce((gain, candidate) => gain + getCandidateCoverageGainUnits(candidate), BigInt(0)) +
    remaining.reduce((gain, court) => {
      let maximum = BigInt(0);
      for (const candidate of lists[court]) {
        if ((candidate.mask & used) === BigInt(0)) {
          const candidateGain = getCandidateCoverageGainUnits(candidate);
          if (candidateGain > maximum) maximum = candidateGain;
        }
      }
      return gain + maximum;
    }, BigInt(0));
  const globalImmediateReplayLowerBound = gateRespectRest
    ? getOptimisticImmediateReplayCount(lockedMask, Math.max(0, required - locked.size))
    : null;
  const entropyFacets: Array<keyof SocialVarietyGains> = options.sessionMode === SessionMode.MIXICANO
    ? ["courtmates", "partners", "opponents", "matchType"]
    : ["courtmates", "partners", "opponents"];
  const getStarvation = (mask: bigint) => {
    let vector = starvationCache.get(mask);
    if (!vector) {
      vector = ignoreStarvationForDiagnostic
        ? Array.from({ length: SOCIAL_STARVATION_METRIC_COUNT }, () => 0)
        : getSocialStarvationVector(
            active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)),
            starvationContext
          );
      starvationCache.set(mask, vector);
    }
    return vector;
  };
  const getStarvationLowerBound = (selectedMask: bigint, remainingSlots: number) => {
    if (ignoreStarvationForDiagnostic) return Array.from({ length: SOCIAL_STARVATION_METRIC_COUNT }, () => 0);
    const selectedIds = new Set(active
      .filter((player) => (selectedMask & bits.get(player.userId)!) !== BigInt(0))
      .map((player) => player.userId));
    const unselectedOverdue = overdueAvailablePlayers
      .filter((player) => !selectedIds.has(player.userId))
      .sort((left, right) => left.restTurns - right.restTurns);
    const leftOutCount = Math.max(0, unselectedOverdue.length - remainingSlots);
    const optimisticLeftOut = unselectedOverdue.slice(0, leftOutCount);
    return [
      leftOutCount,
      optimisticLeftOut.length ? Math.max(...optimisticLeftOut.map((player) => player.restTurns)) : 0,
      optimisticLeftOut.reduce((total, player) => total + player.restTurns, 0),
    ];
  };
  const compareOptimisticPlayers = (left: ActiveMatchmakerV3Player<T>, right: ActiveMatchmakerV3Player<T>) =>
    compareSocialNumberVectors(getSocialFairnessVector([left]), getSocialFairnessVector([right])) ||
    Number(right.restTurns > idealRestGap) - Number(left.restTurns > idealRestGap) ||
    right.restTurns - left.restTurns;
  // Relax court compatibility. This exact player-only optimum is a fairness lower bound.
  const optimisticPlayers = [...active].sort(compareOptimisticPlayers);
  const optimisticSelection = [
    ...active.filter((player) => locked.has(player.userId)),
    ...optimisticPlayers.filter((player) => !locked.has(player.userId)).slice(0, Math.max(0, required - locked.size)),
  ];
  const globalFairnessBound = getSocialFairnessVector(optimisticSelection);
  const globalStarvationBound = ignoreStarvationForDiagnostic
    ? Array.from({ length: SOCIAL_STARVATION_METRIC_COUNT }, () => 0)
    : getSocialStarvationVector(optimisticSelection, starvationContext);
  const lowestScheduleRank = Math.min(...profiles.map((profile) => profile.rank));
  let baselineGlobalRotationClass = false;
  const candidateCache = new Map<V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined, Candidate<ActiveMatchmakerV3Player<T>>[]>();

  const outOfBudget = () => {
    if (baselinePhase && baselineProven) return true;
    if (replayBaselinePhase && replayBaselineProven) return true;
    if ((maxBranches !== Infinity && phaseExplored >= maxBranches) || (deadline !== Infinity && Date.now() >= deadline)) {
      interrupted = true;
      return true;
    }
    return false;
  };
  const candidatesFor = (constraints: V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined) => {
    const cached = candidateCache.get(constraints);
    const compareCandidateOrder = baselinePhase
      ? (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
        compareCandidateStrongerClass(left, right) || left.selection.balanceGap - right.selection.balanceGap
      : replayBaselinePhase ? compareCandidatesForReplay
        : coverageBaselinePhase ? compareCandidatesForCoverage
          : socialCourtmateNearBest ? compareCandidatesForSocialNearBest
            : socialCourtmateBeneficialRescue ? compareCandidatesForSocialBeneficialRescue
            : socialPriorityPolicy ? compareCandidatesForSocialPriority : compareCandidatesForVariety;
    if (cached) return baselinePhase ? cached : cached.sort(compareCandidateOrder);
    const candidates: Candidate<ActiveMatchmakerV3Player<T>>[] = [];
    const keys = new Set<string>();
    for (let a = 0; a < active.length - 3; a++) {
      for (let b = a + 1; b < active.length - 2; b++) {
        for (let c = b + 1; c < active.length - 1; c++) {
          for (let d = c + 1; d < active.length; d++) {
            if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
            const quartet: [ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>] = [active[a], active[b], active[c], active[d]];
            quartetCount++;
            if (constraints?.isQuartetAllowed && !constraints.isQuartetAllowed(quartet)) continue;
            const ids = quartet.map((player) => player.userId) as [string, string, string, string];
            if (options.excludedQuartetKeys?.has([...ids].sort().join("|"))) continue;
            const mask = ids.reduce((value, id) => value | bits.get(id)!, BigInt(0));
            for (const evaluation of evaluateBalancedPartitions(ids, playersById, options.sessionMode)) {
              const partition = constraints?.normalizePartition
                ? constraints.normalizePartition({ partition: evaluation.partition, players: quartet, playersById })
                : evaluation.partition;
              if (!partition || !isValidPartitionForMode(partition, playersById, options.sessionMode)) continue;
              const normalizedIds = [...partition.team1, ...partition.team2];
              if (new Set(normalizedIds).size !== 4 || normalizedIds.some((id) => !ids.includes(id))) continue;
              const key = getExactPartitionKey(partition);
              if (key === options.excludedPartitionKey || keys.has(key)) continue;
              keys.add(key);
              // The baseline needs only legality and balance. Score entropy
              // after certification, and only inside its fixed envelope.
              const gains = baselinePhase || replayBaselinePhase || coverageBaselinePhase
                ? undefined : getSocialVarietyGains(partition, candidateScoringContext);
              const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
                ids, players: quartet, partition,
                restSummary: buildRestSummary(quartet),
                balanceGap: getPartitionBalanceGap(partition, playersById) ?? evaluation.balanceGap,
                pointDiffGap: getPartitionPointDiffGap(partition, playersById) ?? evaluation.pointDiffGap,
                sharedCourtRepeatPenalty: balancePolicy ? 0 : getSharedCourtRepeatPenalty(partition, social!),
                ...(!balancePolicy ? { sharedCourtEncounterFrequencyPenalty: getSharedCourtEncounterFrequencyPenalty(partition, social!) } : {}),
                partnerCoveragePenalty: balancePolicy ? 0 : getPartnerCoveragePenalty(partition, social!),
                opponentCoveragePenalty: balancePolicy ? 0 : getOpponentCoveragePenalty(partition, social!),
                partnerRepeatPenalty: balancePolicy ? 0 : getPartnerRepeatPenalty(partition, partners!),
                opponentRepeatPenalty: balancePolicy ? 0 : getOpponentRepeatPenalty(partition, opponents!),
                exactRematchPenalty: getExactRematchPenalty(partition, rematches),
                ...(gains ? { socialVarietyGain: sumSocialVarietyGains(gains), socialVarietyGains: gains } : {}),
                ...getConsecutivePlayMetrics(ids, consecutive),
                randomScore: getQuartetRandomScore(quartet),
                pairingRandomScore: getPartitionPairingRandomScore(partition, salts.combined),
              };
              candidates.push({
                selection, mask, varietyScored: Boolean(gains),
                ...(socialPriorityScorer
                  ? { socialPriorityMetrics: socialPriorityScorer.getPartitionMetrics(partition) }
                  : {}),
              });
              validPartitions++;
            }
          }
          if (interrupted) break;
        }
        if (interrupted) break;
      }
      if (interrupted) break;
    }
    // Baseline certification only needs to find a witness on the certified
    // lower bound; sorting tens of thousands of equivalent layouts cannot
    // strengthen that proof. Later phases sort by their own objective.
    if (!baselinePhase) candidates.sort(compareCandidateOrder);
    candidateCache.set(constraints, candidates);
    return candidates;
  };
  const scoreVariety = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.varietyScored) return;
    const gains = getSocialVarietyGains(candidate.selection.partition, candidateScoringContext);
    candidate.selection = { ...candidate.selection, socialVarietyGain: sumSocialVarietyGains(gains), socialVarietyGains: gains };
    candidate.varietyScored = true;
  };
  const metricsFor = (
    chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[],
    selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[],
    selectedMask: bigint,
    variety = getSocialVarietyTotals(selections, options.sessionMode)
  ) => {
    if (socialPriorityPolicy) {
      const priorityMetrics = getSocialPriorityBatchMetrics(chosen, selectedMask, selections, variety);
      const starvation = getStarvation(selectedMask);
      return socialCourtmateBeneficialRescue
        ? toBeneficialRescuePriorityMetricVector(priorityMetrics, starvation)
        : socialCourtmateNearBest
          ? toNearBestPriorityMetricVector(priorityMetrics, starvation)
        : toPriorityMetricVector(priorityMetrics, starvation);
    }
    return [
      ...getStarvation(selectedMask),
      -getRotationVarietyScore(variety.totalSocialVarietyGain, options.sessionType),
      ...(respectRest ? getSoftCadenceVectorForMask(selectedMask) : []),
      Math.max(...selections.map((selection) => selection.balanceGap)),
      balancePolicy ? canonicalSum(selections.map((selection) => selection.balanceGap))
        : selections.reduce((sum, selection) => sum + selection.balanceGap, 0),
      balancePolicy?.mode === "RATING" ? 0 : Math.max(...selections.map((selection) => selection.pointDiffGap)),
      balancePolicy?.mode === "RATING" ? 0 : selections.reduce((sum, selection) => sum + selection.pointDiffGap, 0),
      selections.reduce((sum, selection) => sum + selection.partnerRepeatPenalty, 0),
      selections.reduce((sum, selection) => sum + selection.opponentRepeatPenalty, 0),
      selections.reduce((sum, selection) => sum + selection.exactRematchPenalty, 0),
      selections.reduce((sum, selection) => sum + selection.randomScore, 0),
    ];
  };
  let layoutTies: V3BatchSelection<ActiveMatchmakerV3Player<T>>[] = [];
  const layoutScheduleIndexes = new WeakMap<V3BatchSelection<ActiveMatchmakerV3Player<T>>, number>();
  const socialPriorityMetricsBySummary = new WeakMap<
    V3BatchSelection<ActiveMatchmakerV3Player<T>>,
    SocialPriorityBatchMetrics
  >();
  const considerNearBestFrontier = (
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number
  ) => {
    if ((mask & lockedMask) !== lockedMask) return;
    const rotationClass = {
      fairness: getFairness(mask),
      rank: profiles[index].rank,
      starvation: getStarvation(mask),
    };
    const classComparison = nearBestRotationClass
      ? compareSocialPriorityRotationClasses(rotationClass, nearBestRotationClass)
      : -1;
    if (classComparison > 0) return;
    const selections = chosen.map((candidate) => candidate.selection);
    const metrics = getSocialPriorityBatchMetrics(chosen, mask, selections);
    if (classComparison < 0) {
      nearBestRotationClass = rotationClass;
      nearBestCourtmateGainMaximum = metrics.newCourtmatePairs;
      bestRollingMatchTypeGainAtGmaxUnits = metrics.rollingMatchTypeGainUnits;
      return;
    }
    if (nearBestCourtmateGainMaximum === null || metrics.newCourtmatePairs > nearBestCourtmateGainMaximum) {
      nearBestCourtmateGainMaximum = metrics.newCourtmatePairs;
      bestRollingMatchTypeGainAtGmaxUnits = metrics.rollingMatchTypeGainUnits;
    } else if (metrics.newCourtmatePairs === nearBestCourtmateGainMaximum &&
      (bestRollingMatchTypeGainAtGmaxUnits === null ||
        metrics.rollingMatchTypeGainUnits > bestRollingMatchTypeGainAtGmaxUnits)) {
      // Record the T frontier before any coverage-profile, replay or late-tie
      // comparison. The best strict C/profile winner can have lower T.
      bestRollingMatchTypeGainAtGmaxUnits = metrics.rollingMatchTypeGainUnits;
    }
  };
  const considerNearBestSelection = (
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number
  ) => {
    if ((mask & lockedMask) !== lockedMask || !nearBestRotationClass || nearBestCourtmateGainMaximum === null) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (compareSocialPriorityRotationClasses({ fairness, rank, starvation }, nearBestRotationClass) !== 0) return;
    const selections = chosen.map((candidate) => candidate.selection);
    const variety = getSocialVarietyTotals(selections, options.sessionMode);
    const priorityMetrics = getSocialPriorityBatchMetrics(chosen, mask, selections, variety);
    if (priorityMetrics.newCourtmatePairs < nearBestCourtmateGainMaximum - 1) return;
    const metrics = toNearBestPriorityMetricVector(priorityMetrics, starvation);
    const diff = bestSocialPriorityMetrics
      ? compareSocialNearBestMetrics(priorityMetrics, bestSocialPriorityMetrics, respectRest)
      : -1;
    if (diff > 0) return;
    if (diff === 0 && best && options.pairingRandomMode !== "side-balanced" &&
      getBatchPairingRandomScore(selections, salts.combined) >= best.totalPairingRandomScore) return;
    if (diff === 0 && best && options.pairingRandomMode === "side-balanced" &&
      salts.sides[0] === 0 && salts.sides[1] === 0 && salts.combined === 0) return;

    const selectedWithSnapshots = selections.map((selection) => selection.socialVariety
      ? selection
      : { ...selection, socialVariety: getSocialVarietySnapshot(selection.partition, candidateScoringContext) });
    const summary = {
      ...summarizeSocialBatch(selectedWithSnapshots, salts, options.sessionMode),
      ...(balancePolicy ? { totalBalanceGap: canonicalSum(selections.map((selection) => selection.balanceGap)) } : {}),
    };
    layoutScheduleIndexes.set(summary, index);
    socialPriorityMetricsBySummary.set(summary, priorityMetrics);
    if (diff < 0) {
      best = summary;
      bestFairness = fairness;
      bestMetrics = metrics;
      bestRank = rank;
      scheduleIndex = index;
      bestSocialPriorityMetrics = priorityMetrics;
      layoutTies = options.pairingRandomMode === "side-balanced" ? [summary] : [];
    } else if (options.pairingRandomMode === "side-balanced") {
      layoutTies.push(summary);
    } else if (!best || summary.totalPairingRandomScore < best.totalPairingRandomScore) {
      best = summary;
      bestMetrics = metrics;
      bestSocialPriorityMetrics = priorityMetrics;
      scheduleIndex = index;
    }
  };
  const considerBeneficialRescueSelection = (
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number
  ) => {
    if ((mask & lockedMask) !== lockedMask || !nearBestRotationClass || nearBestCourtmateGainMaximum === null ||
      bestRollingMatchTypeGainAtGmaxUnits === null) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (compareSocialPriorityRotationClasses({ fairness, rank, starvation }, nearBestRotationClass) !== 0) return;
    const selections = chosen.map((candidate) => candidate.selection);
    const variety = getSocialVarietyTotals(selections, options.sessionMode);
    const priorityMetrics = getSocialPriorityBatchMetrics(chosen, mask, selections, variety);
    if (!isCourtmateBeneficialRescueAdmissible(
      priorityMetrics.newCourtmatePairs,
      nearBestCourtmateGainMaximum,
      priorityMetrics.rollingMatchTypeGainUnits,
      bestRollingMatchTypeGainAtGmaxUnits
    )) return;
    const metrics = toBeneficialRescuePriorityMetricVector(priorityMetrics, starvation);
    const diff = bestSocialPriorityMetrics
      ? compareSocialBeneficialRescueMetrics(priorityMetrics, bestSocialPriorityMetrics, respectRest)
      : -1;
    if (diff > 0) return;
    if (diff === 0 && best && options.pairingRandomMode !== "side-balanced" &&
      getBatchPairingRandomScore(selections, salts.combined) >= best.totalPairingRandomScore) return;
    if (diff === 0 && best && options.pairingRandomMode === "side-balanced" &&
      salts.sides[0] === 0 && salts.sides[1] === 0 && salts.combined === 0) return;

    const selectedWithSnapshots = selections.map((selection) => selection.socialVariety
      ? selection
      : { ...selection, socialVariety: getSocialVarietySnapshot(selection.partition, candidateScoringContext) });
    const summary = {
      ...summarizeSocialBatch(selectedWithSnapshots, salts, options.sessionMode),
      ...(balancePolicy ? { totalBalanceGap: canonicalSum(selections.map((selection) => selection.balanceGap)) } : {}),
    };
    layoutScheduleIndexes.set(summary, index);
    socialPriorityMetricsBySummary.set(summary, priorityMetrics);
    if (diff < 0) {
      best = summary;
      bestFairness = fairness;
      bestMetrics = metrics;
      bestRank = rank;
      scheduleIndex = index;
      bestSocialPriorityMetrics = priorityMetrics;
      layoutTies = options.pairingRandomMode === "side-balanced" ? [summary] : [];
    } else if (options.pairingRandomMode === "side-balanced") {
      layoutTies.push(summary);
    } else if (!best || summary.totalPairingRandomScore < best.totalPairingRandomScore) {
      best = summary;
      scheduleIndex = index;
    }
  };
  const constraintLabels = new Map(profiles.flatMap((profile) => profile.courts)
    .filter((constraints, index, all) => all.indexOf(constraints) === index)
    .map((constraints, index) => [constraints, index]));
  const recordLateTieFrontier = (
    selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[], metrics: number[], index: number
  ) => {
    if (!balancePolicy) return;
    const strongerMetrics = metrics.slice(0, -2);
    const exactRematchPenalty = metrics[metrics.length - 2];
    const randomScore = metrics[metrics.length - 1];
    const strongerDiff = lateTieFrontier
      ? compareSocialNumberVectors(strongerMetrics, lateTieFrontier.strongerMetrics) : -1;
    if (strongerDiff > 0) return;
    if (strongerDiff === 0 && lateTieFrontier) {
      if (exactRematchPenalty > lateTieFrontier.exactRematchPenalty) {
        lateTieFrontier.exactAlternative = true;
        return;
      }
      if (exactRematchPenalty === lateTieFrontier.exactRematchPenalty && lateTieFrontier.multipleLayouts) {
        lateTieFrontier.variedRandomScores ||= randomScore !== lateTieFrontier.firstRandomScore;
        return;
      }
    }
    // Swapping equivalent courts or replaying the baseline does not create a
    // distinct contender. Different structural court labels remain distinct.
    const layoutKey = selections.map((selection, court) => {
      const partitionKey = options.pairingRandomMode === "side-balanced"
        ? [...selection.partition.team1].sort().join("+") + "/" + [...selection.partition.team2].sort().join("+")
        : getExactPartitionKey(selection.partition);
      return `${constraintLabels.get(profiles[index].courts[court])}:${partitionKey}`;
    }).sort().join(";");
    const freshFrontier = (exactAlternative: boolean): LateTieFrontier => ({
      strongerMetrics, exactRematchPenalty, firstLayoutKey: layoutKey,
      multipleLayouts: false, firstRandomScore: randomScore, variedRandomScores: false, exactAlternative,
    });
    if (!lateTieFrontier || strongerDiff < 0) {
      lateTieFrontier = freshFrontier(false);
    } else if (exactRematchPenalty < lateTieFrontier.exactRematchPenalty) {
      lateTieFrontier = freshFrontier(true);
    } else if (exactRematchPenalty > lateTieFrontier.exactRematchPenalty) {
      lateTieFrontier.exactAlternative = true;
    } else if (layoutKey !== lateTieFrontier.firstLayoutKey) {
      lateTieFrontier.multipleLayouts = true;
      lateTieFrontier.variedRandomScores ||= randomScore !== lateTieFrontier.firstRandomScore;
    }
  };
  const considerBaseline = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if ((mask & lockedMask) !== lockedMask) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    const maxBalanceGap = Math.max(...chosen.map((candidate) => candidate.selection.balanceGap));
    const totalBalanceGap = canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap));
    if (baseline && (compareSocialNumberVectors(fairness, baseline.fairness) || rank - baseline.rank ||
      compareSocialNumberVectors(starvation, baseline.starvation) || maxBalanceGap - baseline.maxBalanceGap ||
      totalBalanceGap - baseline.totalBalanceGap) >= 0) return;
    baseline = { fairness, starvation, rank, maxBalanceGap, totalBalanceGap, chosen: [...chosen], mask, index };
    baselineGlobalRotationClass = compareSocialNumberVectors(fairness, globalFairnessBound) === 0 &&
      compareSocialNumberVectors(starvation, globalStarvationBound) === 0 && rank === lowestScheduleRank;
    // All objectives have reached independently valid global lower bounds.
    // This permits an early certificate without enumerating irrelevant layouts.
    baselineProven = baselineGlobalRotationClass &&
      maxBalanceGap === 0 && totalBalanceGap === 0;
  };
  const considerReplayBaseline = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if ((mask & lockedMask) !== lockedMask) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (balancePolicy && (!baseline || compareSocialNumberVectors(fairness, baseline.fairness) !== 0 ||
      rank !== baseline.rank || compareSocialNumberVectors(starvation, baseline.starvation) !== 0 ||
      !balanceGuardrail || !isBalanceGuardrailAdmissible({
        maxBalanceGap: Math.max(...chosen.map((candidate) => candidate.selection.balanceGap)),
        totalBalanceGap: canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap)),
      }, balanceGuardrail))) return;
    const replayCount = getImmediateReplayCountForMask(mask);
    if (replayBaseline && (compareSocialNumberVectors(fairness, replayBaseline.fairness) ||
      rank - replayBaseline.rank || compareSocialNumberVectors(starvation, replayBaseline.starvation) ||
      replayCount - replayBaseline.replayCount) >= 0) return;
    replayBaseline = { fairness, rank, starvation, replayCount, chosen: [...chosen], mask, index };
    const strongerClassProven = balancePolicy
      ? Boolean(baseline && compareSocialNumberVectors(fairness, baseline.fairness) === 0 &&
        rank === baseline.rank && compareSocialNumberVectors(starvation, baseline.starvation) === 0)
      : compareSocialNumberVectors(fairness, globalFairnessBound) === 0 &&
        rank === lowestScheduleRank && compareSocialNumberVectors(starvation, globalStarvationBound) === 0;
    replayBaselineProven = strongerClassProven && replayCount === globalImmediateReplayLowerBound;
  };
  const considerCoverageBaseline = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if ((mask & lockedMask) !== lockedMask || !replayBaseline) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (compareSocialNumberVectors(fairness, replayBaseline.fairness) !== 0 ||
      rank !== replayBaseline.rank || compareSocialNumberVectors(starvation, replayBaseline.starvation) !== 0) return;
    if (balancePolicy && (!baseline || !balanceGuardrail ||
      compareSocialNumberVectors(fairness, baseline.fairness) !== 0 || rank !== baseline.rank ||
      compareSocialNumberVectors(starvation, baseline.starvation) !== 0 ||
      !isBalanceGuardrailAdmissible({
        maxBalanceGap: Math.max(...chosen.map((candidate) => candidate.selection.balanceGap)),
        totalBalanceGap: canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap)),
      }, balanceGuardrail))) return;
    const replayCount = getImmediateReplayCountForMask(mask);
    if (replayCount !== replayBaseline.replayCount) return;
    const coverageGainUnits = getBatchCoverageGainUnits(chosen);
    if (coverageBaseline && coverageGainUnits <= coverageBaseline.coverageGainUnits) return;
    coverageBaseline = { fairness, rank, starvation, replayCount, coverageGainUnits, chosen: [...chosen], mask, index };
  };
  const consider = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if (baselinePhase) { considerBaseline(chosen, mask, index); return; }
    if (replayBaselinePhase) { considerReplayBaseline(chosen, mask, index); return; }
    if (coverageBaselinePhase) { considerCoverageBaseline(chosen, mask, index); return; }
    if (nearBestFrontierPhase) { considerNearBestFrontier(chosen, mask, index); return; }
    if (nearBestSelectionPhase) { considerNearBestSelection(chosen, mask, index); return; }
    if (beneficialRescueSelectionPhase) { considerBeneficialRescueSelection(chosen, mask, index); return; }
    if ((mask & lockedMask) !== lockedMask) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (balancePolicy && (!baseline || compareSocialNumberVectors(fairness, baseline.fairness) !== 0 ||
      rank !== baseline.rank || compareSocialNumberVectors(starvation, baseline.starvation) !== 0 ||
      !balanceGuardrail || !isBalanceGuardrailAdmissible({
        maxBalanceGap: Math.max(...chosen.map((candidate) => candidate.selection.balanceGap)),
        totalBalanceGap: canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap)),
      }, balanceGuardrail))) return;
    let coverageGainUnits = BigInt(0);
    let chosenReplayCoverageEligible: boolean | null = null;
    if (gateRespectRest) {
      const replayCount = getImmediateReplayCountForMask(mask);
      if (!replayCertified || !replayBaseline || !coverageGateCertified || !coverageBaseline ||
        compareSocialNumberVectors(fairness, replayBaseline.fairness) !== 0 || rank !== replayBaseline.rank ||
        compareSocialNumberVectors(starvation, replayBaseline.starvation) !== 0 ||
        replayCount > (allowedImmediateReplayCount ?? -1)) return;
      coverageGainUnits = getBatchCoverageGainUnits(chosen);
      chosenReplayCoverageEligible = replayCount === replayBaseline.replayCount ||
        (replayCount === replayBaseline.replayCount + 1 && coverageGainUnits > coverageBaseline.coverageGainUnits);
      if (!chosenReplayCoverageEligible) return;
    }
    const fairnessDiff = bestFairness ? compareSocialNumberVectors(fairness, bestFairness) : -1;
    if (fairnessDiff > 0) return;
    if (fairnessDiff === 0 && rank > bestRank) return;
    const selections = chosen.map((candidate) => candidate.selection);
    let priorityStarvationDiff = 0;
    let varietyForMetrics: ReturnType<typeof getSocialVarietyTotals<ActiveMatchmakerV3Player<T>>> | undefined;
    let socialPriorityMetricsForCandidate: SocialPriorityBatchMetrics | null = null;
    if (fairnessDiff === 0 && rank === bestRank && bestMetrics) {
      const starvationDiff = compareSocialNumberVectors(
        starvation,
        bestMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT)
      );
      priorityStarvationDiff = starvationDiff;
      if (starvationDiff > 0) return;
      let compareNextLayer = starvationDiff === 0;
      if (compareNextLayer) {
        varietyForMetrics = getSocialVarietyTotals(selections, options.sessionMode);
        if (socialPriorityPolicy) {
          socialPriorityMetricsForCandidate = getSocialPriorityBatchMetrics(chosen, mask, selections, varietyForMetrics);
          if (bestSocialPriorityMetrics && compareSocialPriorityMetrics(
            socialPriorityMetricsForCandidate, bestSocialPriorityMetrics, respectRest
          ) > 0) return;
        } else {
          const currentScore = getRotationVarietyScore(varietyForMetrics.totalSocialVarietyGain, options.sessionType);
          const incumbentScore = -bestMetrics[varietyMetricIndex];
          if (currentScore < incumbentScore) return;
          compareNextLayer = currentScore === incumbentScore;
          if (compareNextLayer && softCadenceMetricIndex !== null && compareSocialNumberVectors(
            getSoftCadenceVectorForMask(mask),
            bestMetrics.slice(softCadenceMetricIndex, softCadenceMetricIndex + required)
          ) > 0) return;
        }
      }
    }
    if (socialPriorityPolicy && !socialPriorityMetricsForCandidate) {
      varietyForMetrics ??= getSocialVarietyTotals(selections, options.sessionMode);
      socialPriorityMetricsForCandidate = getSocialPriorityBatchMetrics(chosen, mask, selections, varietyForMetrics);
    }
    const metrics = metricsFor(chosen, selections, mask, varietyForMetrics);
    recordLateTieFrontier(selections, metrics, index);
    const objectiveDiff = socialPriorityPolicy && bestSocialPriorityMetrics && socialPriorityMetricsForCandidate
      ? priorityStarvationDiff || compareSocialPriorityMetrics(
          socialPriorityMetricsForCandidate, bestSocialPriorityMetrics, respectRest
        )
      : bestMetrics ? compareSocialNumberVectors(metrics, bestMetrics) : -1;
    const diff = fairnessDiff || rank - bestRank || objectiveDiff;
    if (diff > 0) return;
    if (diff === 0 && best && options.pairingRandomMode !== "side-balanced" &&
      getBatchPairingRandomScore(selections, salts.combined) >= best.totalPairingRandomScore) {
      return;
    }
    if (diff === 0 && best && options.pairingRandomMode === "side-balanced" &&
      salts.sides[0] === 0 && salts.sides[1] === 0 && salts.combined === 0) {
      return;
    }
    const selectedWithSnapshots = selections.map((selection) => selection.socialVariety
      ? selection
        : { ...selection, socialVariety: getSocialVarietySnapshot(selection.partition, candidateScoringContext) });
    const summary = { ...summarizeSocialBatch(selectedWithSnapshots, salts, options.sessionMode),
      ...(balancePolicy ? { totalBalanceGap: canonicalSum(selections.map((selection) => selection.balanceGap)) } : {}),
    };
    layoutScheduleIndexes.set(summary, index);
    if (socialPriorityMetricsForCandidate) {
      socialPriorityMetricsBySummary.set(summary, socialPriorityMetricsForCandidate);
    }
    if (diff < 0) {
      best = summary; bestFairness = fairness; bestMetrics = metrics; bestRank = rank; scheduleIndex = index;
      bestSocialPriorityMetrics = socialPriorityMetricsForCandidate;
      layoutTies = options.pairingRandomMode === "side-balanced" ? [summary] : [];
    } else if (options.pairingRandomMode === "side-balanced") {
      layoutTies.push(summary);
    } else if (!best || summary.totalPairingRandomScore < best.totalPairingRandomScore) {
      best = summary; scheduleIndex = index;
    }
  };
  const runSearch = () => {
   searchAttemptCount++;
   if (required > 0 && active.length >= required && locksFeasible) {
    for (const index of scheduleIndexes) {
      if (profiles[index].courts.length !== options.courtCount) continue;
      const finalScheduleRank = !baselinePhase && !replayBaselinePhase
        ? (balancePolicy ? baseline?.rank
          : gateRespectRest ? replayBaseline?.rank
            : nearBestSelectionPhase || beneficialRescueSelectionPhase ? nearBestRotationClass?.rank : undefined)
        : undefined;
      if (finalScheduleRank !== undefined && profiles[index].rank !== finalScheduleRank) continue;
      const lists = profiles[index].courts.map((constraints) => {
        if (interrupted) return [];
        const candidates = candidatesFor(constraints);
        if (baselinePhase) {
          // For the baseline only, a worse partition of the same quartet can
          // never improve minimax/total balance or its rotation state.
          const bestByMask = new Map<bigint, Candidate<ActiveMatchmakerV3Player<T>>>();
          for (const candidate of candidates) {
            const incumbent = bestByMask.get(candidate.mask);
            if (!incumbent || candidate.selection.balanceGap < incumbent.selection.balanceGap) bestByMask.set(candidate.mask, candidate);
          }
          return [...bestByMask.values()].sort((left, right) =>
            compareSocialNumberVectors(getFairness(left.mask), getFairness(right.mask)) ||
            compareSocialNumberVectors(getStarvation(left.mask), getStarvation(right.mask)) ||
            left.selection.balanceGap - right.selection.balanceGap);
        }
        if (replayBaselinePhase) {
          // Replay admissibility is a player-set property. Within each global
          // balance-envelope court list, retain the best allowed layout per
          // quartet mask and avoid scoring entropy in this certification pass.
          const byMask = new Map<bigint, Candidate<ActiveMatchmakerV3Player<T>>>();
          for (const candidate of candidates) {
            if (balancePolicy && (!balanceGuardrail ||
              candidate.selection.balanceGap > balanceGuardrail.allowedMaxBalanceGap)) continue;
            const incumbent = byMask.get(candidate.mask);
            if (!incumbent || candidate.selection.balanceGap < incumbent.selection.balanceGap) byMask.set(candidate.mask, candidate);
          }
          return [...byMask.values()].sort(compareCandidatesForReplay);
        }
        if (coverageBaselinePhase) {
          // Coverage is layout-sensitive, unlike replay count. Keep every
          // partition layout in the fixed balance envelope while certifying
          // the maximum at exactly the minimum replay count.
          const eligible = balanceGuardrail
            ? candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap)
            : candidates;
          for (const candidate of eligible) {
            if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
            getCandidateCoverageGainUnits(candidate);
          }
          return eligible.sort(compareCandidatesForCoverage);
        }
        // Every candidate inside the fixed balance envelope and certified
        // replay/coverage gate remains visible to the entropy/soft search.
        const eligible = balanceGuardrail
          ? candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap)
          : candidates;
        for (const candidate of eligible) {
          if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
          scoreVariety(candidate);
        }
        return eligible.sort(socialCourtmateNearBest ? compareCandidatesForSocialNearBest : compareCandidatesForVariety);
      });
      if (interrupted) break;
      let coverageProfileUpperBound: bigint | null = null;
      if (coverageBaselinePhase) {
        let upper = BigInt(0);
        for (const candidates of lists) {
          let maximum = BigInt(0);
          for (const candidate of candidates) {
            if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
            const candidateGain = getCandidateCoverageGainUnits(candidate);
            if (candidateGain > maximum) maximum = candidateGain;
          }
          upper += maximum;
          if (interrupted) break;
        }
        if (interrupted) break;
        coverageProfileUpperBound = upper;
      }
      const coverageProfileOptimal = () => coverageProfileUpperBound !== null && coverageBaseline !== null &&
        coverageBaseline.coverageGainUnits >= coverageProfileUpperBound;
      if (coverageProfileOptimal()) continue;
      const visit = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], used: bigint, remaining: number[]) => {
        if (coverageProfileOptimal()) return;
        if (outOfBudget()) return;
        explored++; phaseExplored++;
        if (!remaining.length) { consider(chosen, used, index); return; }
        const available = active.filter((player) => (used & bits.get(player.userId)!) === BigInt(0));
        const slots = remaining.length * 4;
        if (available.length < slots) { pruned++; return; }
        const mandatory = available.filter((player) => locked.has(player.userId));
        if (mandatory.length > slots) { pruned++; return; }
        const optimistic = [...chosen.flatMap((candidate) => candidate.selection.players), ...mandatory,
          ...available.filter((player) => !locked.has(player.userId)).sort(compareOptimisticPlayers)
            .slice(0, slots - mandatory.length)];
        const fairnessBound = getSocialFairnessVector(optimistic);
        const incumbentFairness = nearBestFrontierPhase ? nearBestRotationClass?.fairness
          : baselinePhase ? baseline?.fairness
          : replayBaselinePhase ? replayBaseline?.fairness
          : gateRespectRest ? replayBaseline?.fairness : bestFairness ?? baseline?.fairness;
        if (incumbentFairness && compareSocialNumberVectors(fairnessBound, incumbentFairness) > 0) { pruned++; return; }
        let court = remaining[0];
        let compatible = lists[court].filter((candidate) => (candidate.mask & used) === BigInt(0));
        for (const other of remaining.slice(1)) {
          const options = lists[other].filter((candidate) => (candidate.mask & used) === BigInt(0));
          if (options.length < compatible.length) { court = other; compatible = options; }
        }
        if (!compatible.length) { pruned++; return; }
        // Relax overlaps for an upper bound on achievable variety gain.
        const incumbentRank = nearBestFrontierPhase ? nearBestRotationClass?.rank
          : baselinePhase ? baseline?.rank
          : replayBaselinePhase ? replayBaseline?.rank
            : gateRespectRest ? replayBaseline?.rank : baseline?.rank ?? bestRank;
        const incumbentStarvation = nearBestFrontierPhase ? nearBestRotationClass?.starvation
          : baselinePhase ? baseline?.starvation
          : replayBaselinePhase ? replayBaseline?.starvation
              : gateRespectRest ? replayBaseline?.starvation
              : bestMetrics?.slice(0, SOCIAL_STARVATION_METRIC_COUNT) ?? baseline?.starvation;
        if (incumbentFairness && compareSocialNumberVectors(fairnessBound, incumbentFairness) === 0 && profiles[index].rank === incumbentRank && incumbentStarvation) {
          const starvationBound = getStarvationLowerBound(used, slots);
          const starvationDiff = compareSocialNumberVectors(
            starvationBound,
            incumbentStarvation
          );
          if (starvationDiff > 0) { pruned++; return; }
          if (starvationDiff === 0) {
            if (baselinePhase && baseline) {
              const minimumFor = (other: number) => lists[other].reduce((minimum, candidate) =>
                (candidate.mask & used) === BigInt(0) ? Math.min(minimum, candidate.selection.balanceGap) : minimum, Infinity);
              const balanceBound = Math.max(0, ...chosen.map((candidate) => candidate.selection.balanceGap),
                ...remaining.map(minimumFor));
              const totalBound = canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap)) +
                remaining.reduce((total, other) => total + minimumFor(other), 0);
              const totalRoundoff = Number.EPSILON * (chosen.length + remaining.length + 1) *
                Math.max(Math.abs(totalBound), Math.abs(baseline.totalBalanceGap));
              if (balanceBound > baseline.maxBalanceGap ||
                (balanceBound === baseline.maxBalanceGap && totalBound - totalRoundoff > baseline.totalBalanceGap)) { pruned++; return; }
            } else if (replayBaselinePhase && replayBaseline) {
              if (getOptimisticImmediateReplayCount(used, slots) > replayBaseline.replayCount) { pruned++; return; }
            } else if (coverageBaselinePhase && coverageBaseline && replayBaseline) {
              if (getOptimisticImmediateReplayCount(used, slots) > replayBaseline.replayCount) { pruned++; return; }
              if (getOptimisticCoverageGainUnits(chosen, remaining, used, lists) <= coverageBaseline.coverageGainUnits) {
                pruned++; return;
              }
            } else if (bestMetrics && !socialPriorityPolicy) {
              const getOptimisticEntropyScore = () => {
                const facets = entropyFacets;
                const addendsByFacet = new Map(facets.map((facet) => [facet, [] as number[]]));
                for (const candidate of chosen) {
                  for (const facet of facets) {
                    addendsByFacet.get(facet)!.push(candidate.selection.socialVarietyGains?.[facet] ?? 0);
                  }
                }
                for (const other of remaining) {
                  const availableForCourt = lists[other].filter((candidate) => (candidate.mask & used) === BigInt(0));
                  for (const facet of facets) {
                    const maximum = Math.max(...availableForCourt.map((candidate) => candidate.selection.socialVarietyGains?.[facet] ?? 0));
                    addendsByFacet.get(facet)!.push(maximum);
                  }
                }
                const facetUpperBounds = new Map(facets.map((facet) => [facet, canonicalSum(addendsByFacet.get(facet)!)]));
                const relationUpperBound = canonicalSumEntropyGains(
                  ["courtmates", "partners", "opponents"].map((facet) => facetUpperBounds.get(facet as keyof SocialVarietyGains) ?? 0)
                );
                const matchTypeUpperBound = options.sessionMode === SessionMode.MIXICANO
                  ? facetUpperBounds.get("matchType") ?? 0
                  : 0;
                const rawUpperBound = canonicalSumEntropyGains([matchTypeUpperBound, relationUpperBound]);
                const absoluteAddendSum = facets.reduce((sum, facet) =>
                  sum + addendsByFacet.get(facet)!.reduce((facetSum, value) => facetSum + Math.abs(value), 0), 0);
                const operationCount = facets.length * (chosen.length + remaining.length + 1) + 4;
                // Preserve the final combined gain's grouping and account for
                // roundoff without adding a full Balanced entropy bucket.
                const roundoff = Number.EPSILON * operationCount * absoluteAddendSum;
                return getRotationVarietyScore(rawUpperBound + roundoff, options.sessionType);
              };
              if (gateRespectRest && replayBaseline && allowedImmediateReplayCount !== null) {
                const optimisticReplayCount = getOptimisticImmediateReplayCount(used, slots);
                if (optimisticReplayCount > allowedImmediateReplayCount) { pruned++; return; }
                if (coverageGateCertified && coverageBaseline &&
                  optimisticReplayCount === replayBaseline.replayCount + 1 &&
                  getOptimisticCoverageGainUnits(chosen, remaining, used, lists) <= coverageBaseline.coverageGainUnits) {
                  pruned++; return;
                }
              }
              const entropyUpper = getOptimisticEntropyScore();
              const incumbentEntropy = -bestMetrics[varietyMetricIndex];
              if (entropyUpper < incumbentEntropy) { pruned++; return; }
              if (entropyUpper === incumbentEntropy && softCadenceMetricIndex !== null && compareSocialNumberVectors(
                getOptimisticSoftCadenceVector(used, slots),
                bestMetrics.slice(softCadenceMetricIndex, softCadenceMetricIndex + required)
              ) > 0) { pruned++; return; }
            }
          }
        }
        for (const candidate of compatible) {
          const ordered = [...chosen, candidate];
          // Return selections in physical profile order, even when search chooses a different court.
          assignments[court] = candidate;
          if (remaining.length === 1) {
            if (outOfBudget()) break;
            explored++; phaseExplored++;
            consider(assignments as Candidate<ActiveMatchmakerV3Player<T>>[], used | candidate.mask, index);
          } else visit(ordered, used | candidate.mask, remaining.filter((other) => other !== court));
          if (interrupted || (baselinePhase && baselineProven) || (replayBaselinePhase && replayBaselineProven) || coverageProfileOptimal()) break;
        }
      };
      const assignments: Array<Candidate<ActiveMatchmakerV3Player<T>>> = [];
      if (options.courtCount === 1) {
        for (const candidate of lists[0]) {
          if (coverageProfileOptimal()) break;
          if (outOfBudget()) break;
          explored++; phaseExplored++; consider([candidate], candidate.mask, index);
        }
      } else if (options.courtCount === 2) {
        const identical = profiles[index].courts[0] === profiles[index].courts[1];
        for (let a = 0; a < lists[0].length; a++) {
          if (coverageProfileOptimal()) break;
          if (baselinePhase && baselineGlobalRotationClass && baseline &&
            lists[0][a].selection.balanceGap > baseline.maxBalanceGap) { pruned++; continue; }
          for (let b = identical ? a + 1 : 0; b < lists[1].length; b++) {
            if (outOfBudget()) break;
            const left = lists[0][a], right = lists[1][b];
            if (baselinePhase && baselineGlobalRotationClass && baseline) {
              const maxGap = Math.max(left.selection.balanceGap, right.selection.balanceGap);
              const totalGap = left.selection.balanceGap + right.selection.balanceGap;
              if (maxGap > baseline.maxBalanceGap ||
                (maxGap === baseline.maxBalanceGap && totalGap > baseline.totalBalanceGap)) { pruned++; continue; }
            }
            if (!baselinePhase) { explored++; phaseExplored++; }
            if ((left.mask & right.mask) !== BigInt(0)) continue;
            if (baselinePhase) { explored++; phaseExplored++; }
            consider([left, right], left.mask | right.mask, index);
            if (coverageProfileOptimal()) break;
          }
          if (interrupted || (baselinePhase && baselineProven) || (replayBaselinePhase && replayBaselineProven) || coverageProfileOptimal()) break;
        }
      } else visit([], BigInt(0), profiles[index].courts.map((_, court) => court));
      if (interrupted || (baselinePhase && baselineProven) || (replayBaselinePhase && replayBaselineProven)) break;
    }
   }
  };
  let baselineLimitReached = false;
  let varietyLimitReached = false;
  let varietyStarted = false;
  const startNextPhase = () => {
    interrupted = false;
    phaseExplored = 0;
    deadline = Date.now() + phaseBudgetMs;
  };
  const runReplayBaselinePhase = () => {
    replayBaselinePhase = true;
    baselinePhase = false;
    startNextPhase();
    runSearch();
    replayBaselineLimitReached = interrupted;
    replayCertified = Boolean(replayBaseline && (!interrupted || replayBaselineProven));
    if (replayCertified && replayBaseline) {
      bestImmediateReplayCount = replayBaseline.replayCount;
      allowedImmediateReplayCount = bestImmediateReplayCount + 1;
      replayEnvelopeStatus = "CERTIFIED";
    } else if (interrupted) {
      replayEnvelopeStatus = "UNCERTIFIED";
    } else {
      replayEnvelopeStatus = "NO_SELECTION";
      coverageGateStatus = "NO_SELECTION";
    }
  };
  const runCoverageBaselinePhase = (seed: ReplayBaseline) => {
    baselinePhase = false;
    replayBaselinePhase = false;
    coverageBaselinePhase = true;
    startNextPhase();
    considerCoverageBaseline(seed.chosen, seed.mask, seed.index);
    const coverageUpperBoundUnits = getGlobalCoverageGainUpperBoundUnits();
    const seedAttainsUpperBound = Boolean(coverageBaseline &&
      coverageBaseline.coverageGainUnits === coverageUpperBoundUnits);
    if (seedAttainsUpperBound) {
      // The relaxed player-only bound ignores legality, court disjointness,
      // fairness, starvation, replay and balance constraints. If an exact
      // minimum-replay seed attains it, no admissible batch can improve it.
      coverageGateUpperBoundCertified = true;
      searchAttemptCount += 1;
    } else {
      runSearch();
    }
    coverageBaselineLimitReached = interrupted;
    coverageGateCertified = Boolean(coverageBaseline && !interrupted);
    if (coverageGateCertified && coverageBaseline) {
      bestMinimumReplayCoverageGain = coverageScorer.toNormalizedScore(coverageBaseline.coverageGainUnits);
      coverageGateStatus = "CERTIFIED";
    } else if (interrupted) {
      coverageGateStatus = "UNCERTIFIED";
    } else {
      coverageGateStatus = "NO_SELECTION";
    }
  };
  const runVarietyPhase = (seed: Candidate<ActiveMatchmakerV3Player<T>>[] | null, requestedSeedIndex?: number) => {
    replayBaselinePhase = false;
    coverageBaselinePhase = false;
    baselinePhase = false;
    startNextPhase();
    varietyStarted = true;
    if (seed) {
      seed.forEach(scoreVariety);
      const seedMask = seed.reduce((mask, candidate) => mask | candidate.mask, BigInt(0));
      const seedIndex = requestedSeedIndex ?? (gateRespectRest
        ? coverageBaseline?.index ?? replayBaseline?.index ?? 0
        : balancePolicy ? baseline?.index ?? 0 : 0);
      consider(seed, seedMask, seedIndex);
    }
    runSearch();
    varietyLimitReached = interrupted;
  };
  const runCourtmateNearBestPolicy = () => {
    replayBaselinePhase = false;
    coverageBaselinePhase = false;
    baselinePhase = false;
    nearBestFrontierPhase = true;
    nearBestSelectionPhase = false;
    startNextPhase();
    varietyStarted = true;
    // First prove the strongest fairness/schedule/starvation class, then
    // independently measure Gmax and the maximum signed T at exactly Gmax.
    // This pass intentionally does not use any strict C/profile/T winner
    // shortcut: every candidate in the strongest class contributes to the
    // frontier proof.
    runSearch();
    nearBestFrontierLimitReached = interrupted;
    nearBestFrontierCertified = !interrupted && nearBestRotationClass !== null &&
      nearBestCourtmateGainMaximum !== null && bestRollingMatchTypeGainAtGmaxUnits !== null;
    if (!nearBestFrontierCertified) {
      varietyLimitReached = interrupted;
      nearBestPriorityCertified = false;
      return;
    }

    const frontierClass = nearBestRotationClass!;
    best = null;
    bestFairness = [...frontierClass.fairness];
    bestMetrics = [...frontierClass.starvation];
    bestSocialPriorityMetrics = null;
    scheduleIndex = null;
    bestRank = frontierClass.rank;
    layoutTies = [];
    lateTieFrontier = null;
    nearBestFrontierPhase = false;
    nearBestSelectionPhase = true;
    startNextPhase();
    runSearch();
    nearBestSelectionLimitReached = interrupted;
    varietyLimitReached = interrupted;
    nearBestPriorityCertified = nearBestFrontierCertified && !nearBestSelectionLimitReached && Boolean(best);
  };
  const runCourtmateBeneficialRescuePolicy = () => {
    replayBaselinePhase = false;
    coverageBaselinePhase = false;
    baselinePhase = false;
    nearBestFrontierPhase = true;
    nearBestSelectionPhase = false;
    beneficialRescueSelectionPhase = false;
    startNextPhase();
    varietyStarted = true;
    runSearch();
    nearBestFrontierLimitReached = interrupted;
    nearBestFrontierCertified = !interrupted && nearBestRotationClass !== null &&
      nearBestCourtmateGainMaximum !== null && bestRollingMatchTypeGainAtGmaxUnits !== null;
    if (!nearBestFrontierCertified) {
      varietyLimitReached = interrupted;
      nearBestPriorityCertified = false;
      return;
    }

    const frontierClass = nearBestRotationClass!;
    best = null;
    bestFairness = [...frontierClass.fairness];
    bestMetrics = [...frontierClass.starvation];
    bestSocialPriorityMetrics = null;
    scheduleIndex = null;
    bestRank = frontierClass.rank;
    layoutTies = [];
    lateTieFrontier = null;
    nearBestFrontierPhase = false;
    nearBestSelectionPhase = false;
    beneficialRescueSelectionPhase = true;
    startNextPhase();
    runSearch();
    nearBestSelectionLimitReached = interrupted;
    varietyLimitReached = interrupted;
    nearBestPriorityCertified = nearBestFrontierCertified && !nearBestSelectionLimitReached && Boolean(best);
  };

  // Balanced first certifies its unchanged global balance baseline/envelope.
  if (balancePolicy) {
    runSearch();
    baselineLimitReached = interrupted;
    const certifiedBaseline = baseline as BalanceBaseline | null;
    balanceCertified = Boolean(certifiedBaseline && (!interrupted || baselineProven));
    if (certifiedBaseline && balanceCertified) {
      balanceGuardrail = buildBalanceGuardrail(balancePolicy, certifiedBaseline);
      if (respectRest) {
        runReplayBaselinePhase();
        const certifiedReplayBaseline = replayBaseline as ReplayBaseline | null;
        if (replayCertified && certifiedReplayBaseline) {
          runCoverageBaselinePhase(certifiedReplayBaseline);
          const certifiedCoverageBaseline = coverageBaseline as CoverageBaseline | null;
          if (coverageGateCertified && certifiedCoverageBaseline) {
            runVarietyPhase(certifiedCoverageBaseline.chosen, certifiedCoverageBaseline.index);
          }
        }
      } else {
        replayEnvelopeStatus = "DISABLED";
        replayCertified = true;
        coverageGateStatus = "DISABLED";
        coverageGateCertified = true;
        runVarietyPhase(certifiedBaseline.chosen);
      }
    } else if (!interrupted) {
      replayEnvelopeStatus = respectRest ? "NO_SELECTION" : "DISABLED";
      coverageGateStatus = respectRest ? "NO_SELECTION" : "DISABLED";
      coverageGateCertified = !respectRest;
    }
  } else if (gateRespectRest) {
    // Social certifies its strongest class and minimum whole-batch replay
    // count before freezing the shared +1 admissibility envelope.
    runReplayBaselinePhase();
    const certifiedReplayBaseline = replayBaseline as ReplayBaseline | null;
    if (replayCertified && certifiedReplayBaseline) {
      runCoverageBaselinePhase(certifiedReplayBaseline);
      const certifiedCoverageBaseline = coverageBaseline as CoverageBaseline | null;
      if (coverageGateCertified && certifiedCoverageBaseline) {
        runVarietyPhase(certifiedCoverageBaseline.chosen, certifiedCoverageBaseline.index);
      }
    }
  } else {
    // The explicit opt-out disables ordinary replay and soft-cadence layers,
    // while the shared starvation guard remains active.
    replayEnvelopeStatus = "DISABLED";
    replayCertified = true;
    coverageGateStatus = "DISABLED";
    coverageGateCertified = true;
    if (socialCourtmateNearBest) runCourtmateNearBestPolicy();
    else if (socialCourtmateBeneficialRescue) runCourtmateBeneficialRescuePolicy();
    else runVarietyPhase(null);
  }

  const searchLimitReached = baselineLimitReached || replayBaselineLimitReached || coverageBaselineLimitReached ||
    varietyLimitReached || nearBestFrontierLimitReached || nearBestSelectionLimitReached;
  const selectedRotationClass = Boolean(best && bestFairness);
  const selectedReplayBaseline = replayBaseline as ReplayBaseline | null;
  const fairnessCertified = balancePolicy
    ? balanceCertified
    : gateRespectRest
      ? Boolean(selectedReplayBaseline && (
          !replayBaselineLimitReached ||
          compareSocialNumberVectors(selectedReplayBaseline.fairness, globalFairnessBound) === 0
        ))
      : selectedRotationClass && (!varietyLimitReached || compareSocialNumberVectors(bestFairness!, globalFairnessBound) === 0);
  const selectedRankCertified = balancePolicy
    ? balanceCertified
    : gateRespectRest
      ? Boolean(selectedReplayBaseline && (
          !replayBaselineLimitReached || selectedReplayBaseline.rank === lowestScheduleRank
        ))
      : selectedRotationClass && (!varietyLimitReached || bestRank === lowestScheduleRank);
  const selectedMetrics = bestMetrics as number[] | null;
  const selectedStarvation = selectedMetrics?.slice(0, SOCIAL_STARVATION_METRIC_COUNT) ??
    (gateRespectRest ? selectedReplayBaseline?.starvation : null);
  const starvationCertified = balancePolicy
    ? balanceCertified
    : gateRespectRest
      ? Boolean(selectedReplayBaseline && fairnessCertified && selectedRankCertified && (
          !replayBaselineLimitReached ||
          compareSocialNumberVectors(selectedReplayBaseline.starvation, globalStarvationBound) === 0
        ))
      : selectedRotationClass && selectedRankCertified &&
        (!varietyLimitReached || Boolean(selectedStarvation && compareSocialNumberVectors(selectedStarvation, globalStarvationBound) === 0));
  if (!fairnessCertified || !selectedRankCertified || !starvationCertified ||
    (gateRespectRest && (!replayCertified || !coverageGateCertified)) || (balancePolicy && !balanceCertified)) {
    best = null;
    scheduleIndex = null;
  }
  if (gateRespectRest && replayCertified && selectedReplayBaseline) {
    allowedImmediateReplayCount = selectedReplayBaseline.replayCount + 1;
  }
  if (best && layoutTies.length > 1) {
    const minima = [0, 1].map((side) => Math.min(...layoutTies.map((batch) => batch.sidePairingRandomScores[side])));
    layoutTies.sort((a, b) => {
      const left = a.sidePairingRandomScores.map((score, side) => score - minima[side]);
      const right = b.sidePairingRandomScores.map((score, side) => score - minima[side]);
      return Math.max(...left) - Math.max(...right) || left[0] + left[1] - right[0] - right[1] || a.totalPairingRandomScore - b.totalPairingRandomScore;
    });
    best = layoutTies[0];
    scheduleIndex = layoutScheduleIndexes.get(best) ?? scheduleIndex;
  }
  const finalFrontier = lateTieFrontier as LateTieFrontier | null;
  const finalTieBreak: V3FinalTieBreak | null = finalFrontier?.multipleLayouts
    ? finalFrontier.variedRandomScores || salts.combined !== 0 || salts.sides.some((salt) => salt !== 0)
      ? "RANDOM" : "DETERMINISTIC"
    : finalFrontier?.exactAlternative ? "EXACT_REMATCH" : null;
  const bestSelection = best as V3BatchSelection<ActiveMatchmakerV3Player<T>> | null;
  const starvationSummary: V3SocialStarvationSummary | undefined = bestSelection
    ? getSocialStarvationSummary(bestSelection.selections.flatMap((court) => court.players), starvationContext)
    : undefined;
  const selection = bestSelection && starvationSummary
    ? {
        ...bestSelection,
        ...(balancePolicy ? { balanceGuardrail, fairnessVector: bestFairness ?? [], schedulingRank: bestRank, finalTieBreak } : {}),
        selections: bestSelection.selections.map((court) => ({ ...court, socialStarvation: starvationSummary,
          ...(balancePolicy ? { balanceGuardrail, fairnessVector: bestFairness ?? [], schedulingRank: bestRank, finalTieBreak } : {}),
        })),
      }
    : null;
  const chosenImmediateReplayCount = bestSelection
    ? getImmediateReplayCount(bestSelection.selections.flatMap((court) => court.players))
    : null;
  const chosenCoverageGainUnits = bestSelection
    ? socialPriorityPolicy ? null : coverageScorer.getBatchGainUnits(bestSelection.selections.map((court) => court.partition))
    : null;
  const selectedCoverageBaseline = coverageBaseline as CoverageBaseline | null;
  const chosenImmediateCoverageGain = chosenCoverageGainUnits === null
    ? null : coverageScorer.toNormalizedScore(chosenCoverageGainUnits);
  const chosenReplayCoverageEligible = chosenImmediateReplayCount === null || !gateRespectRest ||
    !coverageGateCertified || !selectedCoverageBaseline || bestImmediateReplayCount === null
    ? null
    : chosenImmediateReplayCount === bestImmediateReplayCount ||
      (chosenImmediateReplayCount === bestImmediateReplayCount + 1 && chosenCoverageGainUnits! > selectedCoverageBaseline.coverageGainUnits);
  const varietyOptimal = Boolean(selection && varietyStarted && !varietyLimitReached &&
    fairnessCertified && selectedRankCertified && starvationCertified &&
    (!gateRespectRest || (replayCertified && coverageGateCertified)) && (!balancePolicy || balanceCertified));
  const selectedSocialPriorityMetrics = best
    ? socialPriorityMetricsBySummary.get(best) ?? bestSocialPriorityMetrics as SocialPriorityBatchMetrics | null
    : null;
  const finalFailureReason = selection ? null
    : searchLimitReached || (gateRespectRest && replayEnvelopeStatus === "UNCERTIFIED")
      ? "SEARCH_LIMIT_REACHED"
      : active.length < required || required <= 0 ? "INSUFFICIENT_PLAYERS"
        : !locksFeasible ? "LOCKED_PLAYERS_CANNOT_ALL_FIT"
          : balancePolicy && options.sessionMode === SessionMode.MIXICANO && validPartitions === 0
            ? "NO_VALID_MIXED_QUARTETS" : "NOT_ENOUGH_NON_OVERLAPPING_COURTS";
  return {
    selection, scheduleIndex, fairnessCertified, starvationCertified,
    bestImmediateReplayCount, allowedImmediateReplayCount, chosenImmediateReplayCount,
    replayCertified, replayEnvelopeStatus,
    bestMinimumReplayCoverageGain, chosenImmediateCoverageGain,
    coverageGateCertified, coverageGateStatus, chosenReplayCoverageEligible,
    coverageGainMetric,
    varietyOptimal,
    ...(balancePolicy ? { balanceCertified } : {}),
    ...(socialPriorityPolicy ? {
      socialPriorityPolicy,
      priorityCertified: socialCourtmateEnvelopePolicy
        ? Boolean(varietyOptimal && nearBestPriorityCertified)
        : varietyOptimal,
      chosenNewCourtmatePairCount: selectedSocialPriorityMetrics?.newCourtmatePairs ?? null,
      chosenPostBatchCourtmateCoverage: selectedSocialPriorityMetrics
        ? [...selectedSocialPriorityMetrics.courtmateCoverageProfile].map((entry) => ({ ...entry }))
        : null,
      chosenRollingMatchTypeGain: selectedSocialPriorityMetrics && socialPriorityScorer
        ? socialPriorityScorer.toNormalizedRollingTypeGain(selectedSocialPriorityMetrics.rollingMatchTypeGainUnits)
        : null,
      ...(socialCourtmateEnvelopePolicy ? {
        courtmateGainMaximumCertified: nearBestFrontierCertified,
        courtmateGainMaximum: nearBestFrontierCertified ? nearBestCourtmateGainMaximum : null,
        chosenCourtmateGainDeficit: nearBestFrontierCertified && selectedSocialPriorityMetrics && nearBestCourtmateGainMaximum !== null
          ? nearBestCourtmateGainMaximum - selectedSocialPriorityMetrics.newCourtmatePairs
          : null,
        bestRollingMatchTypeGainAtGmax: nearBestFrontierCertified && bestRollingMatchTypeGainAtGmaxUnits !== null && socialPriorityScorer
          ? socialPriorityScorer.toNormalizedRollingTypeGain(bestRollingMatchTypeGainAtGmaxUnits)
          : null,
      } : {}),
    } : {}),
    debug: {
      eligiblePlayerIds: active.map((player) => player.userId), availableCandidateCount: active.length,
      consideredCandidateCount: active.length, candidateCap: null,
      lowestBand: active.length ? Math.min(...active.map((player) => player.effectiveMatchCount)) : null,
      includedBandValues: [...new Set(active.map((player) => player.effectiveMatchCount))].sort((a, b) => a - b),
      widened: false, lockedPlayerIds: [...locked], tieZonePlayerIds: [], candidatePlayerIds: active.map((player) => player.userId),
      quartetCount, validQuartetCount: validPartitions, exploredBranches: explored, prunedBranches: pruned,
      searchAttemptCount, searchLimitReached,
      failureReason: finalFailureReason,
      chosenQuartets: selection?.selections.map((court) => court.ids) ?? [],
      chosenMaxBalanceGap: selection?.maxBalanceGap ?? null, chosenTotalBalanceGap: selection?.totalBalanceGap ?? null,
      chosenMaxPointDiffGap: selection?.maxPointDiffGap ?? null, chosenTotalPointDiffGap: selection?.totalPointDiffGap ?? null,
      chosenTotalPartnerRepeatPenalty: selection?.totalPartnerRepeatPenalty ?? null,
      chosenTotalOpponentRepeatPenalty: selection?.totalOpponentRepeatPenalty ?? null,
      chosenTotalExactRematchPenalty: selection?.totalExactRematchPenalty ?? null,
      chosenTotalSharedCourtEncounterFrequencyPenalty: selection?.totalSharedCourtEncounterFrequencyPenalty ?? null,
      chosenTotalSocialVarietyGain: selection?.totalSocialVarietyGain ?? null,
      chosenTotalSocialVarietyGains: selection?.totalSocialVarietyGains ?? null,
      chosenMatchTypeEntropyGain: selection?.totalMatchTypeEntropyGain ?? null,
      chosenRelationshipEntropyGain: selection?.totalRelationshipEntropyGain ?? null,
      chosenZeroRestPlayerCount: selection?.restSummary.restTurnVector.filter((turns) => turns === 0).length ?? null,
      chosenAscendingRestTurns: selection
        ? [...selection.restSummary.restTurnVector].sort((left, right) => left - right)
        : null,
      bestImmediateReplayCount, allowedImmediateReplayCount, chosenImmediateReplayCount,
      replayCertified, replayEnvelopeStatus,
      bestMinimumReplayCoverageGain, chosenImmediateCoverageGain,
      coverageGateCertified, coverageGateUpperBoundCertified, coverageGateStatus, chosenReplayCoverageEligible,
      coverageGainMetric,
      fairnessCertified, starvationCertified, varietyOptimal,
      ...(socialPriorityPolicy ? {
        socialPriorityPolicy,
        priorityCertified: socialCourtmateEnvelopePolicy
          ? Boolean(varietyOptimal && nearBestPriorityCertified)
          : varietyOptimal,
        chosenNewCourtmatePairCount: selectedSocialPriorityMetrics?.newCourtmatePairs ?? null,
        chosenPostBatchCourtmateCoverage: selectedSocialPriorityMetrics
          ? [...selectedSocialPriorityMetrics.courtmateCoverageProfile].map((entry) => ({ ...entry }))
          : null,
        chosenRollingMatchTypeGain: selectedSocialPriorityMetrics && socialPriorityScorer
          ? socialPriorityScorer.toNormalizedRollingTypeGain(selectedSocialPriorityMetrics.rollingMatchTypeGainUnits)
          : null,
        ...(socialCourtmateEnvelopePolicy ? {
          courtmateGainMaximumCertified: nearBestFrontierCertified,
          courtmateGainMaximum: nearBestFrontierCertified ? nearBestCourtmateGainMaximum : null,
          chosenCourtmateGainDeficit: nearBestFrontierCertified && selectedSocialPriorityMetrics && nearBestCourtmateGainMaximum !== null
            ? nearBestCourtmateGainMaximum - selectedSocialPriorityMetrics.newCourtmatePairs
            : null,
          bestRollingMatchTypeGainAtGmax: nearBestFrontierCertified && bestRollingMatchTypeGainAtGmaxUnits !== null && socialPriorityScorer
            ? socialPriorityScorer.toNormalizedRollingTypeGain(bestRollingMatchTypeGainAtGmaxUnits)
            : null,
        } : {}),
      } : {}),
      ...(balancePolicy ? { balanceCertified, balanceGuardrail, fairnessVector: bestFairness ?? undefined, schedulingRank: bestRank === Infinity ? undefined : bestRank, finalTieBreak } : {}),
      socialIdealRestGap: idealRestGap,
      availableOverduePlayerCount: starvationSummary?.availableOverdueCount ?? overdueAvailablePlayers.length,
      selectedOverduePlayerCount: starvationSummary?.selectedOverdueCount ?? null,
      leftOutOverduePlayerCount: starvationSummary?.leftOutOverdueCount ?? null,
      highestLeftOutRestTurns: starvationSummary?.highestLeftOutRestTurns ?? null,
      totalLeftOutRestTurns: starvationSummary?.totalLeftOutRestTurns ?? null,
    },
  };
}
