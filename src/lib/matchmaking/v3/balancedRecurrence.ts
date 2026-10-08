/** Exact Balanced recurrence selector. Search shortcuts use admissible bounds and dominance proofs. */
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
  buildSocialStructuralVarietyContext, buildSocialVarietyContext, createSocialVarietyCoverageScorer, getSocialVarietyGains,
  getSocialVarietySnapshot, sumSocialVarietyGains,
} from "./socialVariety";
import type {
  SocialCoverageGainMetric, SocialVarietyContext, SocialVarietyCoverageScorer,
} from "./socialVariety";
import { buildRecentMatchTypeWindows } from "./socialRollingVariety";
import type { RecentMatchType, RollingMatchType } from "./socialRollingVariety";
import {
  compareCourtmateCoverageProfiles,
  createSocialCourtmatePriorityScorer,
} from "./socialCourtmatePriority";
import {
  buildOptimisticCourtmateCoverageProfile,
  isStrictlyDominantSocialCourtPartition,
} from "./socialFrontierSearchBounds";
import type { SocialCourtPartitionDominanceMetrics } from "./socialFrontierSearchBounds";
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

/** Exact one-pair admission rule used by internal beneficial-rescue ranking. */
function isCourtmateBeneficialRescueAdmissible(
  candidateCourtmateGain: number,
  maximumCourtmateGain: number,
  candidateRollingTypeGainUnits: bigint,
  bestRollingTypeGainAtMaximumUnits: bigint
): boolean {
  return candidateCourtmateGain === maximumCourtmateGain ||
    (candidateCourtmateGain === maximumCourtmateGain - 1 &&
      candidateRollingTypeGainUnits > bestRollingTypeGainAtMaximumUnits);
}

/** Negative means the left candidate wins the beneficial-rescue T-then-gain tie-break. */
function compareCourtmateBeneficialRescuePrimary(
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

interface MatureRecurrenceScorer {
  readonly denominator: bigint;
  readonly typeEligiblePlayerCount: number;
  score(partitions: readonly V3SingleCourtSelection<ActiveMatchmakerV3Player>[]): {
    readonly gainUnits: bigint;
    readonly players: MatureRecurrencePlayerWindowEvidence[];
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left: bigint, right: bigint): bigint {
  return left === BigInt(0) || right === BigInt(0)
    ? BigInt(0)
    : (left / greatestCommonDivisor(left, right)) * right;
}

function uniqueCompletedPartitionIds(match: SocialHistoryMatch): string[] | null {
  const ids = [...match.team1, ...match.team2];
  return ids.length === 4 && ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === 4 ? ids : null;
}

function deduplicateCompletedHistory(matches: readonly SocialHistoryMatch[]): SocialHistoryMatch[] {
  const seenIds = new Set<string>();
  const unique: SocialHistoryMatch[] = [];
  for (const match of matches) {
    if (match.id) {
      if (seenIds.has(match.id)) continue;
      seenIds.add(match.id);
    }
    unique.push(match);
  }
  return unique;
}

function coveredFeasibleTypeCount(
  window: readonly RecentMatchType[],
  feasibleTypes: ReadonlySet<RollingMatchType>
): number {
  const covered = new Set<RollingMatchType>();
  for (const type of window) if (type !== null && feasibleTypes.has(type)) covered.add(type);
  return covered.size;
}

function createMatureRecurrenceScorer(
  players: readonly MatchmakerV3Player[],
  completedHistory: readonly SocialHistoryMatch[],
  context: SocialVarietyContext
): MatureRecurrenceScorer {
  const appearanceCounts = new Map(players.map((player) => [player.userId, 0]));
  const seenHistoryIds = new Set<string>();
  for (const match of completedHistory) {
    if (match.id) {
      if (seenHistoryIds.has(match.id)) continue;
      seenHistoryIds.add(match.id);
    }
    const ids = uniqueCompletedPartitionIds(match);
    if (!ids) continue;
    for (const userId of ids) {
      if (appearanceCounts.has(userId)) appearanceCounts.set(userId, appearanceCounts.get(userId)! + 1);
    }
  }
  const windows = buildRecentMatchTypeWindows(completedHistory, context);
  const maturePlayers = [...context.playersByUserId].flatMap(([userId, histograms]) => {
    const completedAppearancesBefore = appearanceCounts.get(userId) ?? 0;
    const feasibleMatchTypes = (["MIXED", "OWN_SIDE"] as const)
      .filter((type) => histograms.matchType.opportunities.has(type));
    if (!feasibleMatchTypes.length) return [];
    // Complete lifetime first exposure to every structurally feasible type is
    // the eligibility rule; the rolling score itself remains capped at six.
    const firstExposureCompleteBefore = feasibleMatchTypes.every(
      (type) => (histograms.matchType.counts.get(type) ?? 0) > 0
    );
    if (!firstExposureCompleteBefore) return [];
    return [{
      userId,
      firstExposureCompleteBefore,
      completedAppearancesBefore,
      feasibleMatchTypes,
      feasibleTypeSet: new Set<RollingMatchType>(feasibleMatchTypes),
      baselineWindow: [...(windows.get(userId) ?? [])],
    }];
  });
  const denominator = maturePlayers.reduce(
    (common, player) => leastCommonMultiple(common, BigInt(player.feasibleMatchTypes.length)),
    BigInt(1)
  );
  const playersByUserId = new Map(maturePlayers.map((player) => [player.userId, player]));

  return {
    denominator,
    typeEligiblePlayerCount: maturePlayers.length,
    score: (partitions) => {
      const currentWindows = new Map(maturePlayers.map((player) => [player.userId, [...player.baselineWindow]]));
      const initialWindows = new Map(maturePlayers.map((player) => [player.userId, [...player.baselineWindow]]));
      let gainUnits = BigInt(0);
      for (const selection of partitions) {
        const ids = [...selection.partition.team1, ...selection.partition.team2];
        if (ids.length !== 4 || new Set(ids).size !== 4) continue;
        const courtType = context.sessionMode === SessionMode.MIXICANO
          ? getSocialVarietySnapshot(selection.partition, context).courtType
          : null;
        const candidateType: RecentMatchType = courtType === "MIXED"
          ? "MIXED"
          : courtType === "UPPER" || courtType === "LOWER" ? "OWN_SIDE" : null;
        for (const userId of ids) {
          const maturePlayer = playersByUserId.get(userId);
          if (!maturePlayer) continue;
          const beforeWindow = currentWindows.get(userId) ?? [];
          const beforeCount = coveredFeasibleTypeCount(beforeWindow, maturePlayer.feasibleTypeSet);
          const afterWindow = [...beforeWindow, candidateType].slice(-6);
          const afterCount = coveredFeasibleTypeCount(afterWindow, maturePlayer.feasibleTypeSet);
          gainUnits += BigInt(afterCount - beforeCount) *
            (denominator / BigInt(maturePlayer.feasibleMatchTypes.length));
          currentWindows.set(userId, afterWindow);
        }
      }

      const evidence = partitions.flatMap((selection) => {
        const ids = [...selection.partition.team1, ...selection.partition.team2];
        if (ids.length !== 4 || new Set(ids).size !== 4) return [];
        const courtType = context.sessionMode === SessionMode.MIXICANO
          ? getSocialVarietySnapshot(selection.partition, context).courtType
          : null;
        const candidateType: RecentMatchType = courtType === "MIXED"
          ? "MIXED"
          : courtType === "UPPER" || courtType === "LOWER" ? "OWN_SIDE" : null;
        return ids.flatMap((userId) => {
          const player = playersByUserId.get(userId);
          if (!player) return [];
          const beforeWindow = initialWindows.get(userId) ?? [];
          const afterWindow = [...beforeWindow, candidateType].slice(-6);
          const beforeCount = coveredFeasibleTypeCount(beforeWindow, player.feasibleTypeSet);
          const afterCount = coveredFeasibleTypeCount(afterWindow, player.feasibleTypeSet);
          return [{
            userId,
            firstExposureCompleteBefore: player.firstExposureCompleteBefore,
            completedAppearancesBefore: player.completedAppearancesBefore,
            feasibleMatchTypes: [...player.feasibleMatchTypes],
            beforeRecentMatchTypes: [...beforeWindow],
            afterRecentMatchTypes: afterWindow,
            beforeT: beforeCount / player.feasibleMatchTypes.length,
            afterT: afterCount / player.feasibleMatchTypes.length,
            deltaT: (afterCount - beforeCount) / player.feasibleMatchTypes.length,
          }];
        });
      });
      return { gainUnits, players: evidence };
    },
  };
}

interface SocialCourtSchedule<T extends ActiveMatchmakerV3Player> {
  rank: number;
  courts: Array<V3SelectionConstraints<T> | undefined>;
}

interface SocialBatchOptions<T extends MatchmakerV3Player> {
  courtCount: number;
  sessionMode: SessionMode;
  respectPlayerRest?: boolean;
  /** Full unpaused roster size, including busy players. */
  rotationPlayerCount?: number;
  completedMatches?: V3CompletedMatch[];
  socialHistoryMatches?: SocialHistoryMatch[];
  socialVarietyContext?: SocialVarietyContext;
  /**
   * Full-roster legal opportunity structure for candidate scoring, distinct
   * from temporary per-search schedules/constraints and legacy history.
   */
  socialStructuralOpportunityConstraints?: Array<V3SelectionConstraints<ActiveMatchmakerV3Player<T>>>;
  randomFn?: () => number;
  candidatePool?: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
  lockedPlayerIds?: ReadonlySet<string>;
  schedules?: SocialCourtSchedule<ActiveMatchmakerV3Player<T>>[];
  selectionConstraints?: V3SelectionConstraints<ActiveMatchmakerV3Player<T>>;
  /** Social lexicographic policy. Rejected outside SOCIAL_MIX. */
  socialPriorityPolicy?: SocialPriorityPolicy;
  pairingRandomMode?: V3BatchPairingRandomMode;
  searchLimits?: { maxBranches?: number; maxMs?: number };
  excludedQuartetKeys?: ReadonlySet<string>;
  excludedPartitionKey?: string;
}

interface RotationBatchOptions<T extends MatchmakerV3Player> extends SocialBatchOptions<T> {
  sessionType: SessionType;
  balanceGuardrailPolicy?: Partial<Pick<BalanceGuardrailPolicy, "nearBestWindow" | "absoluteCeiling">>;
  /** Balanced recurrence policy, used only by the Balanced recurrence selector. */
  recurrencePolicy?: BalancedRecurrencePolicy;
}

export type BalancedRecurrencePolicy = "strict-replay-rescue";

export type BalancedRecurrenceOptions<T extends MatchmakerV3Player> = Omit<
  RotationBatchOptions<T>,
  "socialPriorityPolicy" | "balanceGuardrailPolicy" | "recurrencePolicy"
> & {
  sessionType: SessionType.POINTS | SessionType.ELO;
  recurrencePolicy: BalancedRecurrencePolicy;
};

interface MatureRecurrencePlayerWindowEvidence {
  userId: string;
  firstExposureCompleteBefore: boolean;
  completedAppearancesBefore: number;
  feasibleMatchTypes: RollingMatchType[];
  beforeRecentMatchTypes: RecentMatchType[];
  afterRecentMatchTypes: RecentMatchType[];
  beforeT: number | null;
  afterT: number | null;
  deltaT: number;
}

export interface BalancedRecurrenceStructuralOpportunityEntry {
  userId: string;
  feasibleMatchTypes: RollingMatchType[];
  feasibleCourtmates: string[];
  feasiblePartners: string[];
  feasibleOpponents: string[];
}

export interface BalancedRecurrenceProof {
  balancedMatureRecurrencePolicy: BalancedRecurrencePolicy;
  recurrenceCertified: boolean;
  matureTypeEligiblePlayerCount: number;
  firstExposureCompletePlayerCount: number;
  chosenMatureDeltaT: number | null;
  chosenMatureDeltaTUnits: string | null;
  matureDeltaTDenominator: string;
  /** The best signed sum of per-player rolling-T deltas among Rmin batches. */
  bestMatureDeltaTAtRmin: number | null;
  bestMatureDeltaTAtRminUnits: string | null;
  bestMatureDeltaTAtRminDenominator: string | null;
  recurrenceFrontierCertified: boolean | null;
  chosenRecurrenceRescue: boolean | null;
  conditionalTBenefit: number | null;
  coverageExceptionEligible: boolean | null;
  recurrenceExceptionEligible: boolean | null;
  recurrenceAdmissionCertified: boolean;
  selectedAdmissionEligible: boolean | null;
  admissionReasons: Array<"replay-minimum" | "first-exposure" | "recurrence"> | null;
  matureRecurrencePlayers: MatureRecurrencePlayerWindowEvidence[];
}

export type BalancedRecurrenceResult<T extends ActiveMatchmakerV3Player> =
  SocialBatchResult<T> & BalancedRecurrenceProof & {
    structuralOpportunityVocabulary: BalancedRecurrenceStructuralOpportunityEntry[];
    debug: SocialBatchResult<T>["debug"] & BalancedRecurrenceProof;
  };
type SocialBatchResult<T extends ActiveMatchmakerV3Player> = V3BatchResult<T> & {
  scheduleIndex: number | null;
  scheduleCertified: boolean;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  bestImmediateReplayCount: number | null;
  allowedImmediateReplayCount: number | null;
  chosenImmediateReplayCount: number | null;
  replayCertified: boolean;
  replayEnvelopeStatus: V3ReplayEnvelopeStatus;
  bestMinimumReplayCoverageGain: number | null;
  bestMinimumReplayCoverageGainUnits: string | null;
  chosenImmediateCoverageGain: number | null;
  chosenImmediateCoverageGainUnits: string | null;
  coverageGainDenominator: string;
  structuralOpportunityVocabulary: BalancedRecurrenceStructuralOpportunityEntry[];
  debug: V3BatchResult<T>["debug"] & {
    bestMinimumReplayCoverageGainUnits: string | null;
    chosenImmediateCoverageGainUnits: string | null;
    coverageGainDenominator: string;
  };
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

type IsolatedBatchResult<T extends ActiveMatchmakerV3Player> = SocialBatchResult<T> &
  Partial<BalancedRecurrenceProof> & {
    debug: SocialBatchResult<T>["debug"] & Partial<BalancedRecurrenceProof>;
  };

function summarizeSocialBatch<T extends ActiveMatchmakerV3Player>(
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
  matureRecurrenceGainUnits?: bigint;
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

type BeneficialCourtBounds = {
  hasCandidates: boolean;
  maximumRollingTypeGainUnits: bigint;
  maximumCourtmateGainsByPlayer: Map<string, number>;
  maximumCourtmatePairs: number;
  maximumPartnerPairs: number;
  maximumOpponentPairs: number;
  maximumVarietyGainByFacet: Map<keyof SocialVarietyGains, number>;
  minimumPenaltyByMetric: Map<
    "sharedCourtRepeatPenalty" | "sharedCourtEncounterFrequencyPenalty" |
    "partnerRepeatPenalty" | "opponentRepeatPenalty" | "exactRematchPenalty",
    number
  >;
  minimumBalanceGap: number;
  minimumPointDiffGap: number;
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

/** Select a certified Balanced Points/Elo batch under the strict replay-rescue policy. */
export function findBestBalancedRecurrenceSelection<T extends MatchmakerV3Player>(
  players: T[],
  options: BalancedRecurrenceOptions<T>
): BalancedRecurrenceResult<ActiveMatchmakerV3Player<T>> {
  if (options.sessionType !== SessionType.POINTS && options.sessionType !== SessionType.ELO) {
    throw new Error("Balanced recurrence selection supports only POINTS and ELO sessions.");
  }
  if ((options as BalancedRecurrenceOptions<T> & { socialPriorityPolicy?: unknown }).socialPriorityPolicy !== undefined) {
    throw new Error("Balanced recurrence selection does not accept a Social priority policy.");
  }
  const runtimeOptions = options as BalancedRecurrenceOptions<T> & {
    coverageGainMetric?: unknown;
    balanceGuardrailPolicy?: unknown;
  };
  if (runtimeOptions.coverageGainMetric !== undefined) {
    throw new Error("Balanced recurrence selection uses the fixed production first-exposure gate.");
  }
  if (runtimeOptions.balanceGuardrailPolicy !== undefined) {
    throw new Error("Balanced recurrence selection uses the fixed production Balanced envelope.");
  }
  if (options.respectPlayerRest === false) {
    throw new Error("Balanced recurrence selection requires the existing replay and first-exposure gates.");
  }
  if (options.recurrencePolicy !== "strict-replay-rescue") {
    throw new Error("Unsupported Balanced recurrence policy.");
  }
  return findBestRotationBatchSelectionInternal(players, options) as BalancedRecurrenceResult<
    ActiveMatchmakerV3Player<T>
  >;
}

function findBestRotationBatchSelectionInternal<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>
): IsolatedBatchResult<ActiveMatchmakerV3Player<T>> {
  const socialPriorityPolicy = options.socialPriorityPolicy;
  const recurrencePolicy = options.recurrencePolicy;
  if (recurrencePolicy && (options.sessionType !== SessionType.POINTS && options.sessionType !== SessionType.ELO)) {
    throw new Error("Balanced recurrence policy is supported only for POINTS and ELO sessions.");
  }
  if (recurrencePolicy && recurrencePolicy !== "strict-replay-rescue") {
    throw new Error("Unsupported Balanced recurrence policy.");
  }
  if (recurrencePolicy && socialPriorityPolicy) {
    throw new Error("Balanced recurrence policy cannot be combined with a Social priority policy.");
  }
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
  const varietyMetricIndex = SOCIAL_STARVATION_METRIC_COUNT + (recurrencePolicy ? 1 : 0);
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
  const completedRecurrenceHistory = recurrencePolicy ? deduplicateCompletedHistory(history) : history;
  const context = options.socialVarietyContext?.sessionMode === options.sessionMode
    ? options.socialVarietyContext
    : buildSocialVarietyContext(players, options.socialHistoryMatches ?? history, {
        sessionMode: options.sessionMode,
        opportunityConstraints: profiles.flatMap((profile) => profile.courts.filter((court): court is V3SelectionConstraints<ActiveMatchmakerV3Player<T>> => Boolean(court))),
      });
  const matureRecurrenceContext = recurrencePolicy
    ? buildSocialStructuralVarietyContext(players, completedRecurrenceHistory, {
        sessionMode: options.sessionMode,
        opportunityConstraints: options.socialStructuralOpportunityConstraints,
      })
    : null;
  const structuralOpportunityVocabulary: BalancedRecurrenceStructuralOpportunityEntry[] = matureRecurrenceContext
    ? [...matureRecurrenceContext.playersByUserId]
        .map(([userId, histograms]) => ({
          userId,
          feasibleMatchTypes: (["MIXED", "OWN_SIDE"] as const).filter(
            (type): type is RollingMatchType => histograms.matchType.opportunities.has(type)
          ),
          feasibleCourtmates: [...histograms.courtmates.opportunities].sort(),
          feasiblePartners: [...histograms.partners.opportunities].sort(),
          feasibleOpponents: [...histograms.opponents.opportunities].sort(),
        }))
        .sort((left, right) => left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0)
    : [];
  const matureRecurrenceScorer = matureRecurrenceContext && recurrencePolicy
    ? createMatureRecurrenceScorer(players, completedRecurrenceHistory, matureRecurrenceContext)
    : null;
  const priorityContext = socialPriorityPolicy
    ? buildSocialStructuralVarietyContext(players, history, {
        sessionMode: options.sessionMode,
        opportunityConstraints: options.socialStructuralOpportunityConstraints,
      })
    : context;
  const candidateScoringContext = socialPriorityPolicy ? priorityContext : context;
  const socialPriorityScorer = socialPriorityPolicy
    ? createSocialCourtmatePriorityScorer(priorityContext, history)
    : null;
  const coverageGainMetric: SocialCoverageGainMetric = "legacy-four-facet";
  const coverageScorer: SocialVarietyCoverageScorer = createSocialVarietyCoverageScorer(context, options.sessionMode);
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
  let bestMatureRecurrenceGainUnits: bigint | null = null;
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
  let recurrenceFrontierPhase = false;
  let recurrenceFrontierLimitReached = false;
  let recurrenceFrontierCertified = false;
  let bestMatureDeltaTAtRminUnits: bigint | null = null;
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
  const retainPerMaskMetricFrontier = (
    candidates: Candidate<ActiveMatchmakerV3Player<T>>[],
    getMetric: (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => bigint,
    totalBalanceBoundActive: boolean
  ) => {
    // For a fixed quartet mask, a replacement has exactly the same batch
    // compatibility and rotation state. If total balance is bounded, a
    // candidate with no lower exact metric and no higher gap dominates. Gaps
    // are nonnegative, and canonicalSum sorts them before reduction; lowering
    // one gap makes the sorted order statistics componentwise no larger.
    // IEEE-754 addition is monotone for finite operands, so this substitution
    // cannot increase the batch total even when gaps are fractional.
    const groups = new Map<bigint, Candidate<ActiveMatchmakerV3Player<T>>[]>();
    for (const candidate of candidates) {
      const group = groups.get(candidate.mask) ?? [];
      group.push(candidate);
      groups.set(candidate.mask, group);
    }

    const retained = new Set<Candidate<ActiveMatchmakerV3Player<T>>>();
    for (const group of groups.values()) {
      if (!totalBalanceBoundActive) {
        let maximum = getMetric(group[0]!);
        for (const candidate of group.slice(1)) {
          const metric = getMetric(candidate);
          if (metric > maximum) maximum = metric;
        }
        const winner = group.find((candidate) => getMetric(candidate) === maximum);
        if (winner) retained.add(winner);
        continue;
      }

      for (let candidateIndex = 0; candidateIndex < group.length; candidateIndex += 1) {
        const candidate = group[candidateIndex]!;
        const metric = getMetric(candidate);
        const gap = candidate.selection.balanceGap;
        const dominated = group.some((other, otherIndex) => {
          if (other === candidate) return false;
          const otherMetric = getMetric(other);
          const otherGap = other.selection.balanceGap;
          if (otherMetric < metric || otherGap > gap) return false;
          if (otherMetric > metric || otherGap < gap) return true;
          // Equivalent witnesses have the same proof value and balance cost;
          // retain the first generated one to keep deterministic ordering.
          return otherIndex < candidateIndex;
        });
        if (!dominated) retained.add(candidate);
      }
    }

    const result = candidates.filter((candidate) => retained.has(candidate));
    pruned += candidates.length - result.length;
    return result;
  };
  const getBatchCoverageGainUnits = (chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[]) =>
    chosen.reduce((gain, candidate) => gain + getCandidateCoverageGainUnits(candidate), BigInt(0));
  const getCandidateMatureRecurrenceGainUnits = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.matureRecurrenceGainUnits === undefined) {
      candidate.matureRecurrenceGainUnits = matureRecurrenceScorer
        ?.score([candidate.selection]).gainUnits ?? BigInt(0);
    }
    return candidate.matureRecurrenceGainUnits;
  };
  const getBatchMatureRecurrenceGainUnits = (chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[]) =>
    chosen.reduce((gain, candidate) => gain + getCandidateMatureRecurrenceGainUnits(candidate), BigInt(0));
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
  const compareCandidatesForRecurrenceFrontier = (
    left: Candidate<ActiveMatchmakerV3Player<T>>,
    right: Candidate<ActiveMatchmakerV3Player<T>>
  ) => compareCandidateStrongerClass(left, right) ||
    (getCandidateMatureRecurrenceGainUnits(left) > getCandidateMatureRecurrenceGainUnits(right) ? -1
      : getCandidateMatureRecurrenceGainUnits(left) < getCandidateMatureRecurrenceGainUnits(right) ? 1 : 0);
  const compareCandidatesForMatureRecurrence = (
    left: Candidate<ActiveMatchmakerV3Player<T>>,
    right: Candidate<ActiveMatchmakerV3Player<T>>
  ) => compareCandidatesForRecurrenceFrontier(left, right) || compareCandidatesForVariety(left, right);
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
  const beneficialCourtBoundsCache = new WeakMap<
    Candidate<ActiveMatchmakerV3Player<T>>[],
    BeneficialCourtBounds
  >();
  const compatibleCandidatesCache = new WeakMap<
    Candidate<ActiveMatchmakerV3Player<T>>[],
    Map<string, Candidate<ActiveMatchmakerV3Player<T>>[]>
  >();
  const getCompatibleCandidates = (
    candidates: Candidate<ActiveMatchmakerV3Player<T>>[],
    used: bigint,
    minimumOrdinal: number | null,
    candidateOrdinal: ReadonlyMap<Candidate<ActiveMatchmakerV3Player<T>>, number> | null
  ) => {
    const key = `${used.toString()}:${minimumOrdinal ?? "none"}`;
    let byState = compatibleCandidatesCache.get(candidates);
    if (!byState) {
      byState = new Map();
      compatibleCandidatesCache.set(candidates, byState);
    }
    const cached = byState.get(key);
    if (cached) return cached;
    const compatible = candidates.filter((candidate) =>
      (candidate.mask & used) === BigInt(0) &&
      (minimumOrdinal === null || !candidateOrdinal ||
        (candidateOrdinal.get(candidate) ?? -1) > minimumOrdinal)
    );
    byState.set(key, compatible);
    return compatible;
  };
  const getBeneficialCourtBounds = (
    candidates: Candidate<ActiveMatchmakerV3Player<T>>[]
  ): BeneficialCourtBounds => {
    const cached = beneficialCourtBoundsCache.get(candidates);
    if (cached) return cached;
    const penalties = [
      "sharedCourtRepeatPenalty",
      "sharedCourtEncounterFrequencyPenalty",
      "partnerRepeatPenalty",
      "opponentRepeatPenalty",
      "exactRematchPenalty",
    ] as const;
    const result: BeneficialCourtBounds = {
      hasCandidates: candidates.length > 0,
      maximumRollingTypeGainUnits: BigInt(0),
      maximumCourtmateGainsByPlayer: new Map(),
      maximumCourtmatePairs: 0,
      maximumPartnerPairs: 0,
      maximumOpponentPairs: 0,
      maximumVarietyGainByFacet: new Map(entropyFacets.map((facet) => [facet, -Infinity])),
      minimumPenaltyByMetric: new Map(penalties.map((metric) => [metric, Infinity])),
      minimumBalanceGap: Infinity,
      minimumPointDiffGap: Infinity,
    };
    let first = true;
    for (const candidate of candidates) {
      const priority = getCandidateSocialPriorityMetrics(candidate);
      if (first || priority.rollingMatchTypeGainUnits > result.maximumRollingTypeGainUnits) {
        result.maximumRollingTypeGainUnits = priority.rollingMatchTypeGainUnits;
      }
      result.maximumPartnerPairs = Math.max(result.maximumPartnerPairs, priority.newPartnerPairs);
      result.maximumOpponentPairs = Math.max(result.maximumOpponentPairs, priority.newOpponentPairs);
      result.maximumCourtmatePairs = Math.max(result.maximumCourtmatePairs, priority.newCourtmatePairs);
      for (const [userId, gain] of priority.courtmateGainsByPlayer) {
        result.maximumCourtmateGainsByPlayer.set(
          userId,
          Math.max(result.maximumCourtmateGainsByPlayer.get(userId) ?? 0, gain)
        );
      }
      for (const facet of entropyFacets) {
        const gain = candidate.selection.socialVarietyGains?.[facet] ?? 0;
        result.maximumVarietyGainByFacet.set(
          facet,
          Math.max(result.maximumVarietyGainByFacet.get(facet) ?? -Infinity, gain)
        );
      }
      for (const metric of penalties) {
        result.minimumPenaltyByMetric.set(
          metric,
          Math.min(result.minimumPenaltyByMetric.get(metric) ?? Infinity,
            metric === "sharedCourtRepeatPenalty" ? candidate.selection.sharedCourtRepeatPenalty
              : metric === "sharedCourtEncounterFrequencyPenalty" ? candidate.selection.sharedCourtEncounterFrequencyPenalty ?? 0
                : metric === "partnerRepeatPenalty" ? candidate.selection.partnerRepeatPenalty
                  : metric === "opponentRepeatPenalty" ? candidate.selection.opponentRepeatPenalty
                    : candidate.selection.exactRematchPenalty)
        );
      }
      result.minimumBalanceGap = Math.min(result.minimumBalanceGap, candidate.selection.balanceGap);
      result.minimumPointDiffGap = Math.min(result.minimumPointDiffGap, candidate.selection.pointDiffGap);
      first = false;
    }
    beneficialCourtBoundsCache.set(candidates, result);
    return result;
  };
  const getBeneficialRemainingBounds = (
    remaining: readonly number[],
    lists: readonly Candidate<ActiveMatchmakerV3Player<T>>[][],
    listOverrides?: ReadonlyMap<number, Candidate<ActiveMatchmakerV3Player<T>>[]>
  ) => {
    const courtBounds = remaining.map((court) =>
      getBeneficialCourtBounds(listOverrides?.get(court) ?? lists[court])
    );
    const maximumCourtmateGainsByPlayer = new Map<string, number>();
    const maximumVarietyGainByFacet = new Map<keyof SocialVarietyGains, number[]>(
      entropyFacets.map((facet) => [facet, []])
    );
    const minimumPenaltyByMetric = new Map<
      "sharedCourtRepeatPenalty" | "sharedCourtEncounterFrequencyPenalty" |
      "partnerRepeatPenalty" | "opponentRepeatPenalty" | "exactRematchPenalty",
      number
    >();
    let maximumRollingTypeGainUnits = BigInt(0);
    let maximumCourtmatePairs = 0;
    let maximumPartnerPairs = 0;
    let maximumOpponentPairs = 0;
    let hasCandidates = true;
    for (const court of courtBounds) {
      if (!court.hasCandidates) hasCandidates = false;
      maximumRollingTypeGainUnits += court.maximumRollingTypeGainUnits;
      maximumCourtmatePairs += court.maximumCourtmatePairs;
      maximumPartnerPairs += court.maximumPartnerPairs;
      maximumOpponentPairs += court.maximumOpponentPairs;
      for (const [userId, gain] of court.maximumCourtmateGainsByPlayer) {
        maximumCourtmateGainsByPlayer.set(
          userId,
          Math.max(maximumCourtmateGainsByPlayer.get(userId) ?? 0, gain)
        );
      }
      for (const facet of entropyFacets) {
        maximumVarietyGainByFacet.get(facet)!.push(court.maximumVarietyGainByFacet.get(facet) ?? -Infinity);
      }
      for (const [metric, minimum] of court.minimumPenaltyByMetric) {
        minimumPenaltyByMetric.set(metric, (minimumPenaltyByMetric.get(metric) ?? 0) + minimum);
      }
    }
    return {
      hasCandidates,
      maximumRollingTypeGainUnits,
      maximumCourtmatePairs,
      maximumCourtmateGainsByPlayer,
      maximumPartnerPairs,
      maximumOpponentPairs,
      maximumVarietyGainByFacet,
      minimumPenaltyByMetric,
      minimumBalanceGap: Math.max(0, ...courtBounds.map((court) => court.minimumBalanceGap)),
      minimumPointDiffGap: Math.max(0, ...courtBounds.map((court) => court.minimumPointDiffGap)),
    };
  };
  const shouldPruneBeneficialPriorityBranch = (
    chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[],
    used: bigint,
    remaining: readonly number[],
    lists: readonly Candidate<ActiveMatchmakerV3Player<T>>[][],
    index: number,
    remainingListOverrides?: ReadonlyMap<number, Candidate<ActiveMatchmakerV3Player<T>>[]>,
    onPreBalancePrefixCertified?: () => void
  ) => {
    if (!socialCourtmateBeneficialRescue || remaining.length === 0) return false;
    const remainingBounds = getBeneficialRemainingBounds(remaining, lists, remainingListOverrides);
    if (!remainingBounds.hasCandidates) return true;

    let chosenCourtmatePairs = 0;
    let chosenRollingTypeGainUnits = BigInt(0);
    let chosenPartnerPairs = 0;
    let chosenOpponentPairs = 0;
    const chosenCourtmateGains = new Map<string, number>();
    const chosenFacetGains = new Map<keyof SocialVarietyGains, number[]>();
    const chosenPenaltyValues = new Map<
      "sharedCourtRepeatPenalty" | "sharedCourtEncounterFrequencyPenalty" |
      "partnerRepeatPenalty" | "opponentRepeatPenalty" | "exactRematchPenalty",
      number[]
    >();
    let chosenMaxBalanceGap = 0;
    let chosenMaxPointDiffGap = 0;
    for (const facet of entropyFacets) chosenFacetGains.set(facet, []);
    for (const metric of [
      "sharedCourtRepeatPenalty",
      "sharedCourtEncounterFrequencyPenalty",
      "partnerRepeatPenalty",
      "opponentRepeatPenalty",
      "exactRematchPenalty",
    ] as const) chosenPenaltyValues.set(metric, []);
    for (const candidate of chosen) {
      const priority = getCandidateSocialPriorityMetrics(candidate);
      chosenCourtmatePairs += priority.newCourtmatePairs;
      chosenRollingTypeGainUnits += priority.rollingMatchTypeGainUnits;
      chosenPartnerPairs += priority.newPartnerPairs;
      chosenOpponentPairs += priority.newOpponentPairs;
      for (const [userId, gain] of priority.courtmateGainsByPlayer) {
        chosenCourtmateGains.set(userId, (chosenCourtmateGains.get(userId) ?? 0) + gain);
      }
      for (const facet of entropyFacets) {
        chosenFacetGains.get(facet)!.push(candidate.selection.socialVarietyGains?.[facet] ?? 0);
      }
      chosenPenaltyValues.get("sharedCourtRepeatPenalty")!.push(candidate.selection.sharedCourtRepeatPenalty);
      chosenPenaltyValues.get("sharedCourtEncounterFrequencyPenalty")!.push(
        candidate.selection.sharedCourtEncounterFrequencyPenalty ?? 0
      );
      chosenPenaltyValues.get("partnerRepeatPenalty")!.push(candidate.selection.partnerRepeatPenalty);
      chosenPenaltyValues.get("opponentRepeatPenalty")!.push(candidate.selection.opponentRepeatPenalty);
      chosenPenaltyValues.get("exactRematchPenalty")!.push(candidate.selection.exactRematchPenalty);
      chosenMaxBalanceGap = Math.max(chosenMaxBalanceGap, candidate.selection.balanceGap);
      chosenMaxPointDiffGap = Math.max(chosenMaxPointDiffGap, candidate.selection.pointDiffGap);
    }

    const endpointGainUpper = [...remainingBounds.maximumCourtmateGainsByPlayer]
      .filter(([userId]) => (used & (bits.get(userId) ?? BigInt(0))) === BigInt(0))
      .map(([, gain]) => gain)
      .sort((left, right) => right - left)
      .slice(0, remaining.length * 4)
      .reduce((total, gain) => total + gain, 0);
    const courtmateGainUpper = chosenCourtmatePairs + Math.min(
      Math.floor(endpointGainUpper / 2),
      remainingBounds.maximumCourtmatePairs
    );
    const rollingTypeGainUpper = chosenRollingTypeGainUnits + remainingBounds.maximumRollingTypeGainUnits;

    if (nearBestFrontierPhase) {
      if (!nearBestRotationClass || nearBestCourtmateGainMaximum === null ||
        bestRollingMatchTypeGainAtGmaxUnits === null) return false;
      const chosenPlayers = chosen.flatMap((candidate) => candidate.selection.players);
      const available = active.filter((player) => (used & bits.get(player.userId)!) === BigInt(0));
      const mandatory = available.filter((player) => locked.has(player.userId));
      const slots = remaining.length * 4;
      const optimisticPlayers = [...chosenPlayers, ...mandatory,
        ...available.filter((player) => !locked.has(player.userId)).sort(compareOptimisticPlayers)
          .slice(0, Math.max(0, slots - mandatory.length))];
      const fairnessBound = getSocialFairnessVector(optimisticPlayers);
      const fairnessDiff = compareSocialNumberVectors(fairnessBound, nearBestRotationClass.fairness);
      if (fairnessDiff > 0) return true;
      if (fairnessDiff < 0 || profiles[index].rank < nearBestRotationClass.rank) return false;
      if (profiles[index].rank > nearBestRotationClass.rank) return true;
      const starvationBound = getStarvationLowerBound(used, slots);
      const starvationDiff = compareSocialNumberVectors(starvationBound, nearBestRotationClass.starvation);
      if (starvationDiff > 0) return true;
      if (starvationDiff < 0) return false;
      return courtmateGainUpper < nearBestCourtmateGainMaximum ||
        (courtmateGainUpper === nearBestCourtmateGainMaximum &&
          rollingTypeGainUpper <= bestRollingMatchTypeGainAtGmaxUnits);
    }

    if (!beneficialRescueSelectionPhase || !nearBestRotationClass ||
      nearBestCourtmateGainMaximum === null || bestRollingMatchTypeGainAtGmaxUnits === null) return false;
    const chosenPlayers = chosen.flatMap((candidate) => candidate.selection.players);
    const available = active.filter((player) => (used & bits.get(player.userId)!) === BigInt(0));
    const mandatory = available.filter((player) => locked.has(player.userId));
    const slots = remaining.length * 4;
    const optimisticPlayers = [...chosenPlayers, ...mandatory,
      ...available.filter((player) => !locked.has(player.userId)).sort(compareOptimisticPlayers)
        .slice(0, Math.max(0, slots - mandatory.length))];
    const fairnessBound = getSocialFairnessVector(optimisticPlayers);
    if (compareSocialNumberVectors(fairnessBound, nearBestRotationClass.fairness) > 0) return true;
    const starvationBound = getStarvationLowerBound(used, slots);
    if (compareSocialNumberVectors(fairnessBound, nearBestRotationClass.fairness) === 0 &&
      compareSocialNumberVectors(starvationBound, nearBestRotationClass.starvation) > 0) return true;

    const maximumCourtmateGain = nearBestCourtmateGainMaximum;
    if (courtmateGainUpper < maximumCourtmateGain - 1) return true;
    if (courtmateGainUpper === maximumCourtmateGain - 1 &&
      rollingTypeGainUpper <= bestRollingMatchTypeGainAtGmaxUnits) return true;
    const incumbent = bestSocialPriorityMetrics;
    if (!incumbent) return false;

    if (rollingTypeGainUpper < incumbent.rollingMatchTypeGainUnits) return true;
    if (rollingTypeGainUpper > incumbent.rollingMatchTypeGainUnits) return false;
    if (courtmateGainUpper < incumbent.newCourtmatePairs) return true;
    if (courtmateGainUpper > incumbent.newCourtmatePairs) return false;

    const chosenProfile = socialPriorityScorer!.getPostBatchCourtmateCoverageProfile(chosenCourtmateGains);
    const fixedIds = new Set(active
      .filter((player) => (used & bits.get(player.userId)!) !== BigInt(0))
      .map((player) => player.userId));
    const coverageUpper = buildOptimisticCourtmateCoverageProfile(
      chosenProfile,
      remainingBounds.maximumCourtmateGainsByPlayer,
      fixedIds,
      slots
    );
    const coverageDiff = compareCourtmateCoverageProfiles(coverageUpper, incumbent.courtmateCoverageProfile);
    if (coverageDiff < 0) return true;
    if (coverageDiff > 0) return false;

    if (respectRest) {
      const replayLower = getOptimisticImmediateReplayCount(used, slots);
      if (replayLower > incumbent.immediateReplayCount) return true;
      if (replayLower < incumbent.immediateReplayCount) return false;
      const softCadenceLower = getOptimisticSoftCadenceVector(used, slots);
      const softDiff = compareSocialNumberVectors(softCadenceLower, incumbent.softCadenceVector);
      if (softDiff > 0) return true;
      if (softDiff < 0) return false;
    }
    const partnerUpper = chosenPartnerPairs + remainingBounds.maximumPartnerPairs;
    if (partnerUpper < incumbent.newPartnerPairs) return true;
    if (partnerUpper > incumbent.newPartnerPairs) return false;
    const opponentUpper = chosenOpponentPairs + remainingBounds.maximumOpponentPairs;
    if (opponentUpper < incumbent.newOpponentPairs) return true;
    if (opponentUpper > incumbent.newOpponentPairs) return false;

    const facetTotals = new Map<keyof SocialVarietyGains, number>();
    for (const facet of entropyFacets) {
      const addends = [
        ...(chosenFacetGains.get(facet) ?? []),
        ...(remainingBounds.maximumVarietyGainByFacet.get(facet) ?? []),
      ];
      facetTotals.set(facet, canonicalSum(addends));
    }
    // This uses the same per-facet and final canonical grouping as the batch
    // scorer. Coordinate-wise maxima dominate every legal completion, and the
    // monotone sorted finite additions preserve an admissible upper bound.
    const entropyUpper = getSocialRelationshipEntropyGain({
      courtmates: facetTotals.get("courtmates"),
      partners: facetTotals.get("partners"),
      opponents: facetTotals.get("opponents"),
    });
    if (entropyUpper < incumbent.relationshipEntropyGain) return true;
    if (entropyUpper > incumbent.relationshipEntropyGain) return false;

    const penaltyKeys = [
      "sharedCourtRepeatPenalty",
      "sharedCourtEncounterFrequencyPenalty",
      "partnerRepeatPenalty",
      "opponentRepeatPenalty",
      "exactRematchPenalty",
    ] as const;
    for (const metric of penaltyKeys) {
      const values = [...(chosenPenaltyValues.get(metric) ?? []),
        remainingBounds.minimumPenaltyByMetric.get(metric) ?? 0];
      const sum = canonicalSum(values);
      const roundoff = Number.EPSILON * 4 * (values.length + 1) *
        values.reduce((total, value) => total + Math.abs(value), 0);
      const penaltyLower = Math.max(0, sum - roundoff);
      if (penaltyLower > incumbent[metric]) return true;
      if (penaltyLower < incumbent[metric]) return false;
    }
    onPreBalancePrefixCertified?.();
    const balanceGapLower = Math.max(chosenMaxBalanceGap, remainingBounds.minimumBalanceGap);
    if (balanceGapLower > incumbent.maxBalanceGap) return true;
    if (balanceGapLower < incumbent.maxBalanceGap) return false;
    const totalBalanceGapLower = canonicalSum([
      ...chosen.map((candidate) => candidate.selection.balanceGap),
      ...remaining.map((court) => getBeneficialCourtBounds(remainingListOverrides?.get(court) ?? lists[court]).minimumBalanceGap),
    ]);
    if (totalBalanceGapLower > incumbent.totalBalanceGap) return true;
    if (totalBalanceGapLower < incumbent.totalBalanceGap) return false;
    const pointDiffGapLower = Math.max(chosenMaxPointDiffGap, remainingBounds.minimumPointDiffGap);
    if (pointDiffGapLower > incumbent.maxPointDiffGap) return true;
    if (pointDiffGapLower < incumbent.maxPointDiffGap) return false;
    const totalPointDiffGapLower = canonicalSum([
      ...chosen.map((candidate) => candidate.selection.pointDiffGap),
      ...remaining.map((court) => getBeneficialCourtBounds(remainingListOverrides?.get(court) ?? lists[court]).minimumPointDiffGap),
    ]);
    return totalPointDiffGapLower > incumbent.totalPointDiffGap;
  };
  const shouldPruneBeneficialTwoCourtSuffix = (
    chosen: readonly Candidate<ActiveMatchmakerV3Player<T>>[],
    used: bigint,
    index: number,
    rightCandidates: Candidate<ActiveMatchmakerV3Player<T>>[],
    lists: readonly Candidate<ActiveMatchmakerV3Player<T>>[][]
  ) => {
    if (!socialCourtmateBeneficialRescue || !nearBestRotationClass || !rightCandidates.length) return false;
    const slots = 4;
    const available = active.filter((player) => (used & bits.get(player.userId)!) === BigInt(0));
    const mandatory = available.filter((player) => locked.has(player.userId));
    const optimisticPlayers = [
      ...chosen.flatMap((candidate) => candidate.selection.players),
      ...mandatory,
      ...available.filter((player) => !locked.has(player.userId)).sort(compareOptimisticPlayers)
        .slice(0, Math.max(0, slots - mandatory.length)),
    ];
    const fairnessBound = getSocialFairnessVector(optimisticPlayers);
    const fairnessDiff = compareSocialNumberVectors(fairnessBound, nearBestRotationClass.fairness);
    if (fairnessDiff > 0) return true;
    if (fairnessDiff < 0 || profiles[index].rank < nearBestRotationClass.rank) return false;
    if (profiles[index].rank > nearBestRotationClass.rank) return true;
    const starvationBound = getStarvationLowerBound(used, slots);
    const starvationDiff = compareSocialNumberVectors(starvationBound, nearBestRotationClass.starvation);
    if (starvationDiff > 0) return true;
    if (starvationDiff < 0) return false;
    let prefixCertified = false;
    const shouldPrune = shouldPruneBeneficialPriorityBranch(
      chosen,
      used,
      [1],
      lists,
      index,
      undefined,
      () => { prefixCertified = true; }
    );
    if (shouldPrune) return true;
    if (prefixCertified && bestSocialPriorityMetrics) {
      for (let candidateIndex = rightCandidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
        if (rightCandidates[candidateIndex].selection.balanceGap > bestSocialPriorityMetrics.maxBalanceGap) {
          rightCandidates.splice(candidateIndex, 1);
        }
      }
    }
    return rightCandidates.length === 0;
  };
  const globalImmediateReplayLowerBound = gateRespectRest
    ? getOptimisticImmediateReplayCount(lockedMask, Math.max(0, required - locked.size))
    : null;
  const entropyFacets: Array<keyof SocialVarietyGains> = options.sessionMode === SessionMode.MIXICANO
    ? ["courtmates", "partners", "opponents", "matchType"]
    : ["courtmates", "partners", "opponents"];
  const getStarvation = (mask: bigint) => {
    let vector = starvationCache.get(mask);
    if (!vector) {
      vector = getSocialStarvationVector(
        active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)),
        starvationContext
      );
      starvationCache.set(mask, vector);
    }
    return vector;
  };
  const getStarvationLowerBound = (selectedMask: bigint, remainingSlots: number) => {
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
  const globalStarvationBound = getSocialStarvationVector(optimisticSelection, starvationContext);
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
    const deferCandidateSorting = socialCourtmateBeneficialRescue &&
      (nearBestFrontierPhase || beneficialRescueSelectionPhase);
    const deferCandidateEntropy = socialCourtmateBeneficialRescue && nearBestFrontierPhase;
    const cached = candidateCache.get(constraints);
    const compareCandidateOrder = baselinePhase
      ? (left: Candidate<ActiveMatchmakerV3Player<T>>, right: Candidate<ActiveMatchmakerV3Player<T>>) =>
        compareCandidateStrongerClass(left, right) || left.selection.balanceGap - right.selection.balanceGap
      : replayBaselinePhase ? compareCandidatesForReplay
        : coverageBaselinePhase ? compareCandidatesForCoverage
          : recurrenceFrontierPhase ? compareCandidatesForRecurrenceFrontier
          : socialCourtmateNearBest ? compareCandidatesForSocialNearBest
            : socialCourtmateBeneficialRescue ? compareCandidatesForSocialBeneficialRescue
              : recurrencePolicy ? compareCandidatesForMatureRecurrence
                : socialPriorityPolicy ? compareCandidatesForSocialPriority : compareCandidatesForVariety;
    if (cached) {
      if (baselinePhase || deferCandidateSorting) return cached;
      // The additional certification pass must not perturb production's stable
      // ordering of equivalent court slots before the final ranking pass.
      return (recurrenceFrontierPhase ? [...cached] : cached).sort(compareCandidateOrder);
    }
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
              const gains = baselinePhase || replayBaselinePhase || coverageBaselinePhase || recurrenceFrontierPhase || deferCandidateEntropy
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
    if (!baselinePhase && !deferCandidateSorting) candidates.sort(compareCandidateOrder);
    candidateCache.set(constraints, candidates);
    return candidates;
  };
  const scoreVariety = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.varietyScored) return;
    const gains = getSocialVarietyGains(candidate.selection.partition, candidateScoringContext);
    candidate.selection = { ...candidate.selection, socialVarietyGain: sumSocialVarietyGains(gains), socialVarietyGains: gains };
    candidate.varietyScored = true;
  };
  const dominanceMetricsByCandidate = new WeakMap<
    Candidate<ActiveMatchmakerV3Player<T>>,
    SocialCourtPartitionDominanceMetrics
  >();
  const getCandidateDominanceMetrics = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    const cached = dominanceMetricsByCandidate.get(candidate);
    if (cached) return cached;
    scoreVariety(candidate);
    const partitionMetrics = getCandidateSocialPriorityMetrics(candidate);
    const gains = candidate.selection.socialVarietyGains;
    const metrics: SocialCourtPartitionDominanceMetrics = {
      newCourtmatePairs: partitionMetrics.newCourtmatePairs,
      rollingMatchTypeGainUnits: partitionMetrics.rollingMatchTypeGainUnits,
      courtmateCoverage: socialPriorityScorer!.getPostBatchCourtmateCoverageProfile(
        partitionMetrics.courtmateGainsByPlayer
      ),
      newPartnerPairs: partitionMetrics.newPartnerPairs,
      newOpponentPairs: partitionMetrics.newOpponentPairs,
      relationshipFacetGains: [gains?.courtmates ?? 0, gains?.partners ?? 0, gains?.opponents ?? 0],
      penalties: [
        candidate.selection.sharedCourtRepeatPenalty,
        candidate.selection.sharedCourtEncounterFrequencyPenalty ?? 0,
        candidate.selection.partnerRepeatPenalty,
        candidate.selection.opponentRepeatPenalty,
        candidate.selection.exactRematchPenalty,
      ],
      balanceGap: candidate.selection.balanceGap,
      pointDiffGap: candidate.selection.pointDiffGap,
    };
    dominanceMetricsByCandidate.set(candidate, metrics);
    return metrics;
  };
  const filterDominatedBeneficialPartitions = (
    lists: Candidate<ActiveMatchmakerV3Player<T>>[][]
  ): Candidate<ActiveMatchmakerV3Player<T>>[][] => {
    const maximumAbsoluteBatchMetric = (get: (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => number) => {
      let total = 0;
      for (const candidates of lists) {
        let maximum = 0;
        for (const candidate of candidates) {
          if (deadline !== Infinity && Date.now() >= deadline) {
            interrupted = true;
            return Infinity;
          }
          const value = Math.abs(get(candidate));
          if (!Number.isFinite(value)) return Infinity;
          maximum = Math.max(maximum, value);
        }
        total += maximum;
        if (!Number.isFinite(total)) return Infinity;
      }
      return total;
    };
    const maximumAbsoluteBalanceGap = maximumAbsoluteBatchMetric((candidate) => candidate.selection.balanceGap);
    const maximumAbsolutePointDiffGap = maximumAbsoluteBatchMetric((candidate) => candidate.selection.pointDiffGap);

    return lists.map((candidates) => {
      if (interrupted) return candidates;
      const groups = new Map<string, Candidate<ActiveMatchmakerV3Player<T>>[]>();
      for (const candidate of candidates) {
        if (deadline !== Infinity && Date.now() >= deadline) {
          interrupted = true;
          return candidates;
        }
        const partitionMetrics = getCandidateSocialPriorityMetrics(candidate);
        const key = `${candidate.mask.toString()}:${partitionMetrics.rollingMatchTypeGainUnits.toString()}`;
        const group = groups.get(key) ?? [];
        group.push(candidate);
        groups.set(key, group);
      }

      const dominated = new Set<Candidate<ActiveMatchmakerV3Player<T>>>();
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        for (const candidate of group) {
          if (deadline !== Infinity && Date.now() >= deadline) {
            interrupted = true;
            return candidates;
          }
          getCandidateDominanceMetrics(candidate);
        }
        for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
          if (deadline !== Infinity && Date.now() >= deadline) {
            interrupted = true;
            return candidates;
          }
          const left = group[leftIndex];
          if (!left || dominated.has(left)) continue;
          const leftMetrics = getCandidateDominanceMetrics(left);
          for (let rightIndex = 0; rightIndex < group.length; rightIndex += 1) {
            if (rightIndex === leftIndex) continue;
            const right = group[rightIndex];
            if (!right || dominated.has(right)) continue;
            if (isStrictlyDominantSocialCourtPartition(
              leftMetrics,
              getCandidateDominanceMetrics(right),
              options.courtCount,
              maximumAbsoluteBalanceGap,
              maximumAbsolutePointDiffGap
            )) dominated.add(right);
          }
        }
      }
      pruned += dominated.size;
      return candidates.filter((candidate) => !dominated.has(candidate));
    });
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
      ...(recurrencePolicy && matureRecurrenceScorer
        ? [-Number(getBatchMatureRecurrenceGainUnits(chosen)) / Number(matureRecurrenceScorer.denominator)]
        : []),
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
    let newCourtmatePairs: number;
    let rollingMatchTypeGainUnits: bigint;
    if (socialCourtmateBeneficialRescue) {
      newCourtmatePairs = 0;
      rollingMatchTypeGainUnits = BigInt(0);
      for (const candidate of chosen) {
        const candidateMetrics = getCandidateSocialPriorityMetrics(candidate);
        newCourtmatePairs += candidateMetrics.newCourtmatePairs;
        rollingMatchTypeGainUnits += candidateMetrics.rollingMatchTypeGainUnits;
      }
    } else {
      const selections = chosen.map((candidate) => candidate.selection);
      const metrics = getSocialPriorityBatchMetrics(chosen, mask, selections);
      newCourtmatePairs = metrics.newCourtmatePairs;
      rollingMatchTypeGainUnits = metrics.rollingMatchTypeGainUnits;
    }
    if (classComparison < 0) {
      nearBestRotationClass = rotationClass;
      nearBestCourtmateGainMaximum = newCourtmatePairs;
      bestRollingMatchTypeGainAtGmaxUnits = rollingMatchTypeGainUnits;
      return;
    }
    if (nearBestCourtmateGainMaximum === null || newCourtmatePairs > nearBestCourtmateGainMaximum) {
      nearBestCourtmateGainMaximum = newCourtmatePairs;
      bestRollingMatchTypeGainAtGmaxUnits = rollingMatchTypeGainUnits;
    } else if (newCourtmatePairs === nearBestCourtmateGainMaximum &&
      (bestRollingMatchTypeGainAtGmaxUnits === null ||
        rollingMatchTypeGainUnits > bestRollingMatchTypeGainAtGmaxUnits)) {
      // Record the T frontier before any coverage-profile, replay or late-tie
      // comparison. The best strict C/profile winner can have lower T.
      bestRollingMatchTypeGainAtGmaxUnits = rollingMatchTypeGainUnits;
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
  const considerMatureRecurrenceFrontier = (
    chosen: Candidate<ActiveMatchmakerV3Player<T>>[],
    mask: bigint,
    index: number
  ) => {
    if ((mask & lockedMask) !== lockedMask || !replayBaseline || !matureRecurrenceScorer) return;
    const fairness = getFairness(mask);
    const starvation = getStarvation(mask);
    const rank = profiles[index].rank;
    if (compareSocialNumberVectors(fairness, replayBaseline.fairness) !== 0 ||
      rank !== replayBaseline.rank ||
      compareSocialNumberVectors(starvation, replayBaseline.starvation) !== 0 ||
      getImmediateReplayCountForMask(mask) !== replayBaseline.replayCount) return;
    if (balancePolicy && (!baseline || !balanceGuardrail ||
      compareSocialNumberVectors(fairness, baseline.fairness) !== 0 || rank !== baseline.rank ||
      compareSocialNumberVectors(starvation, baseline.starvation) !== 0 ||
      !isBalanceGuardrailAdmissible({
        maxBalanceGap: Math.max(...chosen.map((candidate) => candidate.selection.balanceGap)),
        totalBalanceGap: canonicalSum(chosen.map((candidate) => candidate.selection.balanceGap)),
      }, balanceGuardrail))) return;
    const gainUnits = getBatchMatureRecurrenceGainUnits(chosen);
    if (bestMatureDeltaTAtRminUnits === null || gainUnits > bestMatureDeltaTAtRminUnits) {
      bestMatureDeltaTAtRminUnits = gainUnits;
    }
  };
  const consider = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if (baselinePhase) { considerBaseline(chosen, mask, index); return; }
    if (replayBaselinePhase) { considerReplayBaseline(chosen, mask, index); return; }
    if (coverageBaselinePhase) { considerCoverageBaseline(chosen, mask, index); return; }
    if (recurrenceFrontierPhase) { considerMatureRecurrenceFrontier(chosen, mask, index); return; }
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
    if (gateRespectRest) {
      const replayCount = getImmediateReplayCountForMask(mask);
      if (!replayCertified || !replayBaseline || !coverageGateCertified || !coverageBaseline ||
        compareSocialNumberVectors(fairness, replayBaseline.fairness) !== 0 || rank !== replayBaseline.rank ||
        compareSocialNumberVectors(starvation, replayBaseline.starvation) !== 0 ||
        (replayCount !== replayBaseline.replayCount && replayCount !== replayBaseline.replayCount + 1)) return;
      coverageGainUnits = getBatchCoverageGainUnits(chosen);
      const coverageExceptionEligible = replayCount === replayBaseline.replayCount + 1 &&
        coverageGainUnits > coverageBaseline.coverageGainUnits;
      const recurrenceExceptionEligible = recurrencePolicy === "strict-replay-rescue" &&
        recurrenceFrontierCertified && bestMatureDeltaTAtRminUnits !== null &&
        replayCount === replayBaseline.replayCount + 1 &&
        getBatchMatureRecurrenceGainUnits(chosen) > bestMatureDeltaTAtRminUnits;
      if (replayCount !== replayBaseline.replayCount &&
        !(coverageExceptionEligible || recurrenceExceptionEligible)) return;
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
      if (compareNextLayer && !recurrencePolicy) {
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
    let objectiveDiff: number;
    if (recurrencePolicy && bestMetrics && matureRecurrenceScorer && bestMatureRecurrenceGainUnits !== null) {
      const starvationDiff = compareSocialNumberVectors(
        metrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT),
        bestMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT)
      );
      const candidateMatureGainUnits = getBatchMatureRecurrenceGainUnits(chosen);
      const recurrenceDiff = candidateMatureGainUnits === bestMatureRecurrenceGainUnits
        ? 0 : candidateMatureGainUnits > bestMatureRecurrenceGainUnits ? -1 : 1;
      objectiveDiff = starvationDiff || recurrenceDiff || compareSocialNumberVectors(
        metrics.slice(SOCIAL_STARVATION_METRIC_COUNT + 1),
        bestMetrics.slice(SOCIAL_STARVATION_METRIC_COUNT + 1)
      );
    } else if (socialPriorityPolicy && bestSocialPriorityMetrics && socialPriorityMetricsForCandidate) {
      objectiveDiff = priorityStarvationDiff || compareSocialPriorityMetrics(
        socialPriorityMetricsForCandidate, bestSocialPriorityMetrics, respectRest
      );
    } else {
      objectiveDiff = bestMetrics ? compareSocialNumberVectors(metrics, bestMetrics) : -1;
    }
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
      bestMatureRecurrenceGainUnits = recurrencePolicy ? getBatchMatureRecurrenceGainUnits(chosen) : null;
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
      if (recurrenceFrontierPhase && replayBaseline && profiles[index].rank !== replayBaseline.rank) continue;
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
          // Coverage varies by layout, but for a fixed quartet it is a scalar
          // maximum. Preserve its per-mask Pareto frontier when the certified
          // total-balance fallback is active; otherwise only maximum-C layouts
          // can affect this proof.
          const eligible = balanceGuardrail
            ? candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap)
            : candidates;
          for (const candidate of eligible) {
            if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
            getCandidateCoverageGainUnits(candidate);
          }
          const frontier = retainPerMaskMetricFrontier(
            eligible,
            getCandidateCoverageGainUnits,
            balanceGuardrail?.allowedTotalBalanceGap !== null &&
              balanceGuardrail?.allowedTotalBalanceGap !== undefined
          );
          return frontier.sort(compareCandidatesForCoverage);
        }
        if (recurrenceFrontierPhase) {
          // This proof needs only the strongest class, frozen envelope,
          // replay minimum and signed T. For one quartet mask, lower T can
          // never improve a batch; with a total-balance fallback, retain the
          // exact T/balance Pareto frontier. Keep entropy lazy so this proof
          // pass cannot alter stable final ordering through shared objects.
          const eligible = candidates.filter((candidate) => !balanceGuardrail ||
            candidate.selection.balanceGap <= balanceGuardrail.allowedMaxBalanceGap
          );
          const frontier = retainPerMaskMetricFrontier(
            eligible,
            getCandidateMatureRecurrenceGainUnits,
            balanceGuardrail?.allowedTotalBalanceGap !== null &&
              balanceGuardrail?.allowedTotalBalanceGap !== undefined
          );
          return frontier.sort(compareCandidatesForRecurrenceFrontier);
        }
        if (nearBestFrontierPhase && socialCourtmateBeneficialRescue) {
          // The G/T frontier depends on the quartet mask and court type, not
          // the team partition. Keep the best T representative per mask and
          // defer all entropy/layout scoring until the exact selection pass.
          const frontierCandidates = balanceGuardrail
            ? candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap)
            : candidates;
          const bestByMask = new Map<bigint, Candidate<ActiveMatchmakerV3Player<T>>>();
          for (const candidate of frontierCandidates) {
            const candidateMetrics = getCandidateSocialPriorityMetrics(candidate);
            const incumbent = bestByMask.get(candidate.mask);
            if (!incumbent || candidateMetrics.rollingMatchTypeGainUnits >
              getCandidateSocialPriorityMetrics(incumbent).rollingMatchTypeGainUnits) {
              bestByMask.set(candidate.mask, candidate);
            }
          }
          return [...bestByMask.values()].sort((left, right) => {
            const classDiff = compareCandidateStrongerClass(left, right);
            if (classDiff !== 0) return classDiff;
            const leftMetrics = getCandidateSocialPriorityMetrics(left);
            const rightMetrics = getCandidateSocialPriorityMetrics(right);
            return rightMetrics.newCourtmatePairs - leftMetrics.newCourtmatePairs ||
              (leftMetrics.rollingMatchTypeGainUnits > rightMetrics.rollingMatchTypeGainUnits ? -1
                : leftMetrics.rollingMatchTypeGainUnits < rightMetrics.rollingMatchTypeGainUnits ? 1 : 0);
          });
        }
        if (beneficialRescueSelectionPhase) {
          // Keep the admitted list in original generation order until strict
          // same-quartet, same-T Pareto losers are removed. Exact ties remain
          // available for the existing batch-hash tie rules.
          return balanceGuardrail
            ? candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap)
            : candidates;
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
      if (beneficialRescueSelectionPhase) {
        const retainedLists = filterDominatedBeneficialPartitions(lists);
        if (interrupted) break;
        for (const candidates of retainedLists) {
          for (const candidate of candidates) {
            if (deadline !== Infinity && Date.now() >= deadline) {
              interrupted = true;
              break;
            }
            scoreVariety(candidate);
            // Do not carry a ranking cached before entropy was materialized
            // into the exact selection pass.
            candidate.priorityRankingMetrics = undefined;
          }
          if (interrupted) break;
          candidates.sort(compareCandidatesForSocialBeneficialRescue);
        }
        if (interrupted) break;
        lists.splice(0, lists.length, ...retainedLists);
      }
      const identicalPhysicalCourts = recurrencePolicy !== undefined && options.courtCount > 1 &&
        profiles[index].courts.length === options.courtCount &&
        profiles[index].courts.every((court) => court === profiles[index].courts[0]);
      const permutationInvariantProofPhase = baselinePhase || replayBaselinePhase ||
        coverageBaselinePhase || recurrenceFrontierPhase;
      let maxDoubledBalanceGap = 0;
      let exactBalanceAggregation = false;
      if (identicalPhysicalCourts && options.courtCount > 2 && permutationInvariantProofPhase) {
        exactBalanceAggregation = true;
        for (const candidates of lists) {
          for (const candidate of candidates) {
            if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
            const doubledGap = candidate.selection.balanceGap * 2;
            if (!Number.isSafeInteger(doubledGap)) {
              exactBalanceAggregation = false;
              break;
            }
            maxDoubledBalanceGap = Math.max(maxDoubledBalanceGap, doubledGap);
          }
          if (interrupted || !exactBalanceAggregation) break;
        }
        if (interrupted) break;
        exactBalanceAggregation = exactBalanceAggregation &&
          Number.isSafeInteger(maxDoubledBalanceGap * options.courtCount);
      }
      if (interrupted) break;
      // For 3+ courts, quotient permutations only in proof phases and only
      // when every retained gap is an exact half-integer and the largest
      // possible doubled total stays safe. That makes total-balance sums
      // order-independent under IEEE-754. Two identical courts already used
      // `a < b` in the frozen search, so preserve that path in every phase.
      const canonicalCourtOrder = identicalPhysicalCourts && (
        options.courtCount === 2 || (permutationInvariantProofPhase && exactBalanceAggregation)
      );
      const candidateOrdinal = canonicalCourtOrder
        ? new Map(lists[0].map((candidate, ordinal) => [candidate, ordinal]))
        : null;
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
      if (recurrenceFrontierPhase) {
        // Mature-T adds across disjoint courts. Summing each filtered court
        // list's maximum is a relaxed upper bound: it ignores player overlap,
        // fairness, replay, and schedule-specific compatibility. If the
        // certified C-frontier witness (or a prior profile witness) reaches
        // this bound, no batch on this profile can improve the exact frontier.
        let upperBound: bigint | null = BigInt(0);
        for (const candidates of lists) {
          if (!candidates.length) {
            upperBound = null;
            break;
          }
          let maximum = getCandidateMatureRecurrenceGainUnits(candidates[0]!);
          for (const candidate of candidates.slice(1)) {
            const gain = getCandidateMatureRecurrenceGainUnits(candidate);
            if (gain > maximum) maximum = gain;
          }
          if (upperBound !== null) upperBound += maximum;
        }
        if (upperBound === null || (bestMatureDeltaTAtRminUnits !== null &&
          bestMatureDeltaTAtRminUnits >= upperBound)) continue;
      }
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
        const previousOrdinal = candidateOrdinal && chosen.length
          ? candidateOrdinal.get(chosen[chosen.length - 1]!) ?? null
          : null;
        const compatibleByCourt = new Map<number, Candidate<ActiveMatchmakerV3Player<T>>[]>();
        for (const other of remaining) {
          const options = socialCourtmateBeneficialRescue || candidateOrdinal
            ? getCompatibleCandidates(lists[other], used, previousOrdinal, candidateOrdinal)
            : lists[other].filter((candidate) => (candidate.mask & used) === BigInt(0));
          compatibleByCourt.set(other, options);
        }
        let court = remaining[0];
        let compatible = compatibleByCourt.get(court)!;
        for (const other of remaining.slice(1)) {
          const options = compatibleByCourt.get(other)!;
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
            } else if (bestMetrics && !socialPriorityPolicy && !recurrenceFrontierPhase) {
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
              let recurrenceGainCanTieOrWin = true;
              const collectLateMetricMinimums = recurrencePolicy === "strict-replay-rescue" &&
                matureRecurrenceScorer?.typeEligiblePlayerCount === 0 && bestMetrics !== null &&
                options.pairingRandomMode !== "side-balanced";
              const lateMetricMinimumsByCourt = new Map<number, {
                balanceGap: number;
                pointDiffGap: number;
                partnerRepeatPenalty: number;
                opponentRepeatPenalty: number;
                exactRematchPenalty: number;
                randomScore: number;
              }>();
              if (recurrencePolicy && matureRecurrenceScorer && bestMatureRecurrenceGainUnits !== null) {
                // T is an exact BigInt sum over disjoint court selections.
                // Sum the best compatible gain for each remaining court while
                // relaxing overlap among those courts; this is an admissible
                // upper bound for every completion of the branch.
                let recurrenceUpper = getBatchMatureRecurrenceGainUnits(chosen);
                for (const other of remaining) {
                  const available = compatibleByCourt.get(other) ?? [];
                  if (!available.length) {
                    recurrenceGainCanTieOrWin = false;
                    break;
                  }
                  let maximum = getCandidateMatureRecurrenceGainUnits(available[0]!);
                  const minimums = {
                    balanceGap: available[0]!.selection.balanceGap,
                    pointDiffGap: available[0]!.selection.pointDiffGap,
                    partnerRepeatPenalty: available[0]!.selection.partnerRepeatPenalty,
                    opponentRepeatPenalty: available[0]!.selection.opponentRepeatPenalty,
                    exactRematchPenalty: available[0]!.selection.exactRematchPenalty,
                    randomScore: available[0]!.selection.randomScore,
                  };
                  for (const candidate of available.slice(1)) {
                    const gain = getCandidateMatureRecurrenceGainUnits(candidate);
                    if (gain > maximum) maximum = gain;
                    if (collectLateMetricMinimums) {
                      minimums.balanceGap = Math.min(minimums.balanceGap, candidate.selection.balanceGap);
                      minimums.pointDiffGap = Math.min(minimums.pointDiffGap, candidate.selection.pointDiffGap);
                      minimums.partnerRepeatPenalty = Math.min(
                        minimums.partnerRepeatPenalty, candidate.selection.partnerRepeatPenalty
                      );
                      minimums.opponentRepeatPenalty = Math.min(
                        minimums.opponentRepeatPenalty, candidate.selection.opponentRepeatPenalty
                      );
                      minimums.exactRematchPenalty = Math.min(
                        minimums.exactRematchPenalty, candidate.selection.exactRematchPenalty
                      );
                      minimums.randomScore = Math.min(minimums.randomScore, candidate.selection.randomScore);
                    }
                  }
                  if (collectLateMetricMinimums) lateMetricMinimumsByCourt.set(other, minimums);
                  recurrenceUpper += maximum;
                }
                if (!recurrenceGainCanTieOrWin || recurrenceUpper < bestMatureRecurrenceGainUnits) {
                  pruned++;
                  return;
                }
                recurrenceGainCanTieOrWin = recurrenceUpper === bestMatureRecurrenceGainUnits;
              }
              if (gateRespectRest && replayBaseline && allowedImmediateReplayCount !== null) {
                const optimisticReplayCount = getOptimisticImmediateReplayCount(used, slots);
                if (optimisticReplayCount > allowedImmediateReplayCount) { pruned++; return; }
                if (recurrencePolicy !== "strict-replay-rescue" && coverageGateCertified && coverageBaseline &&
                  optimisticReplayCount === replayBaseline.replayCount + 1 &&
                  getOptimisticCoverageGainUnits(chosen, remaining, used, lists) <= coverageBaseline.coverageGainUnits) {
                  pruned++; return;
                }
              }
              if (recurrenceGainCanTieOrWin) {
                const entropyUpper = getOptimisticEntropyScore();
                const incumbentEntropy = -bestMetrics[varietyMetricIndex];
                if (entropyUpper < incumbentEntropy) { pruned++; return; }
                if (entropyUpper === incumbentEntropy) {
                  const softCadenceLower = softCadenceMetricIndex === null
                    ? [] : getOptimisticSoftCadenceVector(used, slots);
                  const softCadenceComparison = softCadenceMetricIndex === null ? 0 : compareSocialNumberVectors(
                    softCadenceLower,
                    bestMetrics.slice(softCadenceMetricIndex, softCadenceMetricIndex + required)
                  );
                  if (softCadenceComparison > 0) { pruned++; return; }

                  if (softCadenceComparison === 0 && collectLateMetricMinimums) {
                    // `assignments` is indexed by physical court and keeps
                    // stale values while the DFS tries a different adaptive
                    // court order. Only courts absent from this branch's
                    // `remaining` list are actually assigned in this branch;
                    // checking candidate identity here could mistake a stale
                    // value for a current assignment when the same quartet
                    // fits another court.
                    const remainingSet = new Set(remaining);
                    const minimaByPhysicalCourt = profiles[index].courts.map((_constraints, court) => {
                      const assigned = assignments[court];
                      if (!remainingSet.has(court) && assigned) {
                        return {
                          balanceGap: assigned.selection.balanceGap,
                          pointDiffGap: assigned.selection.pointDiffGap,
                          partnerRepeatPenalty: assigned.selection.partnerRepeatPenalty,
                          opponentRepeatPenalty: assigned.selection.opponentRepeatPenalty,
                          exactRematchPenalty: assigned.selection.exactRematchPenalty,
                          randomScore: assigned.selection.randomScore,
                        };
                      }
                      return lateMetricMinimumsByCourt.get(court) ?? null;
                    });
                    if (minimaByPhysicalCourt.every((value) => value !== null)) {
                      const metricValues = minimaByPhysicalCourt as Array<NonNullable<typeof minimaByPhysicalCourt[number]>>;
                      const finiteLowerBounds = metricValues.every((value) =>
                        Object.values(value).every(Number.isFinite)
                      );
                      if (finiteLowerBounds) {
                        const balanceGaps = metricValues.map((value) => value.balanceGap);
                        const pointDiffGaps = metricValues.map((value) => value.pointDiffGap);
                        const maxBalanceGapLower = Math.max(0, ...balanceGaps);
                        // `canonicalSum` sorts nonnegative gaps. Replacing any
                        // court gap by a smaller compatible minimum makes its
                        // sorted order statistics componentwise no larger;
                        // IEEE-754 addition is monotone for finite operands.
                        const totalBalanceGapLower = canonicalSum([...balanceGaps]);
                        const pointsAreBalanceIrrelevant = balancePolicy?.mode === "RATING";
                        const maxPointDiffGapLower = pointsAreBalanceIrrelevant
                          ? 0 : Math.max(0, ...pointDiffGaps);
                        const totalPointDiffGapLower = pointsAreBalanceIrrelevant
                          ? 0 : pointDiffGaps.reduce((sum, value) => sum + value, 0);
                        const totalPartnerRepeatLower = metricValues.reduce(
                          (sum, value) => sum + value.partnerRepeatPenalty, 0
                        );
                        const totalOpponentRepeatLower = metricValues.reduce(
                          (sum, value) => sum + value.opponentRepeatPenalty, 0
                        );
                        const totalExactRematchLower = metricValues.reduce(
                          (sum, value) => sum + value.exactRematchPenalty, 0
                        );
                        let totalRandomScoreLower = metricValues.reduce(
                          (sum, value) => sum + value.randomScore, 0
                        );
                        const optimisticLatePrefix = [
                          -entropyUpper,
                          ...softCadenceLower,
                          maxBalanceGapLower,
                          totalBalanceGapLower,
                          maxPointDiffGapLower,
                          totalPointDiffGapLower,
                          totalPartnerRepeatLower,
                          totalOpponentRepeatLower,
                        ];
                        const bestLatePrefix = bestMetrics.slice(varietyMetricIndex, -2);
                        const prefixComparison = compareSocialNumberVectors(optimisticLatePrefix, bestLatePrefix);
                        const latePrefix = lateTieFrontier?.strongerMetrics.slice(varietyMetricIndex) ?? null;
                        const latePrefixComparison = latePrefix
                          ? compareSocialNumberVectors(optimisticLatePrefix, latePrefix) : -1;
                        if (prefixComparison > 0 && latePrefixComparison > 0) { pruned++; return; }

                        // The salted whole-layout hash is intentionally left
                        // exhaustive. We can discard a higher quartet-random
                        // sum only after a varied late-tie frontier is already
                        // fixed, and only when this branch cannot add a better
                        // or lower-rematch alternative to that diagnostic.
                        const lateFrontierAlreadyRandom = Boolean(lateTieFrontier?.multipleLayouts &&
                          lateTieFrontier.variedRandomScores);
                        const cannotChangeLateTieFrontier = Boolean(latePrefixComparison > 0 ||
                          (latePrefixComparison === 0 && lateFrontierAlreadyRandom && lateTieFrontier &&
                            totalExactRematchLower >= lateTieFrontier.exactRematchPenalty));
                        const incumbentExactRematch = bestMetrics[bestMetrics.length - 2];
                        const incumbentRandomScore = bestMetrics[bestMetrics.length - 1];
                        if (prefixComparison === 0 && totalExactRematchLower === incumbentExactRematch &&
                          cannotChangeLateTieFrontier && active.every((player) =>
                            Number.isFinite(player.randomScore) && player.randomScore >= 0 && player.randomScore <= 1
                          )) {
                          // Every legal completion uses distinct players. The
                          // lowest remaining player RNG slots therefore give
                          // a stronger relaxed bound than independent court
                          // minima, which may reuse the same quartet. Widen it
                          // downward for both quartet grouping and the final
                          // physical-court reduction; equal random sums still
                          // reach the salted whole-layout hash.
                          const chosenPlayers = active.filter((player) =>
                            (used & bits.get(player.userId)!) !== BigInt(0)
                          );
                          const mandatoryPlayers = active.filter((player) =>
                            locked.has(player.userId) && (used & bits.get(player.userId)!) === BigInt(0)
                          );
                          const optionalPlayers = active.filter((player) =>
                            !locked.has(player.userId) && (used & bits.get(player.userId)!) === BigInt(0)
                          ).sort((left, right) => left.randomScore - right.randomScore);
                          const optionalSlots = slots - mandatoryPlayers.length;
                          if (optionalSlots >= 0 && optionalSlots <= optionalPlayers.length) {
                            const lowestDistinctScores = [
                              ...chosenPlayers,
                              ...mandatoryPlayers,
                              ...optionalPlayers.slice(0, optionalSlots),
                            ].map((player) => player.randomScore).sort((left, right) => left - right);
                            const relaxedPlayerSum = lowestDistinctScores.reduce((sum, score) => sum + score, 0);
                            const roundingOperations = 5 * options.courtCount + required + active.length + 8;
                            const roundoffCushion = Number.EPSILON * roundingOperations * Math.max(1, active.length);
                            const distinctPlayerLowerBound = Math.max(0, relaxedPlayerSum - roundoffCushion);
                            if (Number.isFinite(distinctPlayerLowerBound)) {
                              totalRandomScoreLower = Math.max(totalRandomScoreLower, distinctPlayerLowerBound);
                            }
                          }
                        }
                        const cannotWinLateMetrics = prefixComparison > 0 ||
                          (prefixComparison === 0 && (
                            totalExactRematchLower > incumbentExactRematch ||
                            (totalExactRematchLower === incumbentExactRematch &&
                              totalRandomScoreLower > incumbentRandomScore)
                          ));
                        if (cannotWinLateMetrics && cannotChangeLateTieFrontier) {
                          pruned++;
                          return;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (socialCourtmateBeneficialRescue) {
          let prefixCertified = false;
          if (shouldPruneBeneficialPriorityBranch(
            chosen,
            used,
            remaining,
            lists,
            index,
            compatibleByCourt,
            () => { prefixCertified = true; }
          )) {
            pruned++;
            return;
          }
          if (prefixCertified && bestSocialPriorityMetrics) {
            for (const other of remaining) {
              compatibleByCourt.set(other, compatibleByCourt.get(other)!.filter((candidate) =>
                candidate.selection.balanceGap <= bestSocialPriorityMetrics!.maxBalanceGap
              ));
            }
            compatible = compatibleByCourt.get(court)!;
            if (!compatible.length) { pruned++; return; }
          }
        }
        for (const candidate of compatible) {
          if (candidateOrdinal && chosen.length > 0) {
            const previousOrdinal = candidateOrdinal.get(chosen[chosen.length - 1]);
            const nextOrdinal = candidateOrdinal.get(candidate);
            // In the identical two-court case, the frozen loop already used
            // ascending pairs (`a < b`). Preserve that first representative.
            if (previousOrdinal !== undefined && nextOrdinal !== undefined && nextOrdinal <= previousOrdinal) continue;
          }
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
      } else if (options.courtCount === 2 && recurrencePolicy === "strict-replay-rescue" &&
        identicalPhysicalCourts) {
        // Use the exact branch-and-bound walk for identical strict-rescue
        // courts. It keeps the same ascending first permutation as the former
        // pair loop and can apply admissible T, entropy, replay, and balance
        // bounds before expanding every right-court candidate.
        visit([], BigInt(0), profiles[index].courts.map((_, court) => court));
      } else if (options.courtCount === 2) {
        const identical = profiles[index].courts[0] === profiles[index].courts[1];
        if (socialCourtmateBeneficialRescue && !baselinePhase) {
          for (let a = 0; a < lists[0].length; a++) {
            if (outOfBudget()) break;
            const left = lists[0][a];
            const suffixStart = identical ? a + 1 : 0;
            const rightCandidates = lists[1]
              .slice(suffixStart)
              .filter((candidate) => (left.mask & candidate.mask) === BigInt(0));
            explored++;
            phaseExplored++;
            if (!rightCandidates.length) { pruned++; continue; }
            if (shouldPruneBeneficialTwoCourtSuffix([left], left.mask, index, rightCandidates, lists)) {
              pruned++;
              continue;
            }
            for (const right of rightCandidates) {
              if (outOfBudget()) break;
              explored++;
              phaseExplored++;
              consider([left, right], left.mask | right.mask, index);
              if (coverageProfileOptimal()) break;
            }
            if (interrupted || coverageProfileOptimal()) break;
          }
        } else {
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
  const runMatureRecurrenceFrontierPhase = () => {
    baselinePhase = false;
    replayBaselinePhase = false;
    coverageBaselinePhase = false;
    recurrenceFrontierPhase = true;
    startNextPhase();
    if (matureRecurrenceScorer?.typeEligiblePlayerCount === 0 && coverageBaseline) {
      // With no mature players the scorer is identically zero for every legal
      // batch. The certified replay-minimum coverage witness therefore proves
      // the entire signed-T frontier without a search or an appearance-count
      // threshold.
      bestMatureDeltaTAtRminUnits = BigInt(0);
      recurrenceFrontierCertified = true;
      recurrenceFrontierPhase = false;
      return;
    }

    // The already certified C-frontier witness is also a feasible Rmin
    // witness for the T frontier. Its score supplies a lower bound before the
    // relaxed per-court upper bounds are checked in runSearch.
    if (coverageBaseline) {
      considerMatureRecurrenceFrontier(
        coverageBaseline.chosen,
        coverageBaseline.mask,
        coverageBaseline.index
      );
    }
    runSearch();
    recurrenceFrontierLimitReached = interrupted;
    recurrenceFrontierCertified = !interrupted && bestMatureDeltaTAtRminUnits !== null;
    recurrenceFrontierPhase = false;
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
            if (recurrencePolicy === "strict-replay-rescue") {
              runMatureRecurrenceFrontierPhase();
              if (recurrenceFrontierCertified) {
                runVarietyPhase(certifiedCoverageBaseline.chosen, certifiedCoverageBaseline.index);
              } else {
                varietyLimitReached = recurrenceFrontierLimitReached;
              }
            } else {
              runVarietyPhase(certifiedCoverageBaseline.chosen, certifiedCoverageBaseline.index);
            }
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
    varietyLimitReached || nearBestFrontierLimitReached || nearBestSelectionLimitReached || recurrenceFrontierLimitReached;
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
  if (recurrencePolicy && (!balancePolicy || !balanceCertified || !fairnessCertified || !selectedRankCertified ||
    !starvationCertified || !replayCertified || !coverageGateCertified || searchLimitReached ||
    !varietyStarted || varietyLimitReached || !matureRecurrenceScorer ||
    (recurrencePolicy === "strict-replay-rescue" && !recurrenceFrontierCertified))) {
    // Balanced recurrence never returns a partial proposal as a certified
    // choice when its complete search proof is unavailable.
    best = null;
    scheduleIndex = null;
  }
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
    (!gateRespectRest || (replayCertified && coverageGateCertified)) && (!balancePolicy || balanceCertified) &&
    (recurrencePolicy !== "strict-replay-rescue" || recurrenceFrontierCertified));
  const matureRecurrenceScore = recurrencePolicy && matureRecurrenceScorer && bestSelection
    ? matureRecurrenceScorer.score(bestSelection.selections)
    : null;
  const recurrenceCertified = Boolean(recurrencePolicy && selection && varietyOptimal && !searchLimitReached &&
    balancePolicy && balanceCertified && fairnessCertified && selectedRankCertified && starvationCertified &&
    replayCertified && coverageGateCertified && matureRecurrenceScorer &&
    (recurrencePolicy !== "strict-replay-rescue" || recurrenceFrontierCertified));
  const chosenMatureGainUnits = recurrenceCertified ? matureRecurrenceScore?.gainUnits ?? null : null;
  const certifiedRecurrenceTUnits: bigint | null = recurrenceFrontierCertified
    ? bestMatureDeltaTAtRminUnits as bigint | null
    : null;
  const coverageExceptionEligible = recurrenceCertified && bestSelection && selectedReplayBaseline && selectedCoverageBaseline &&
    chosenImmediateReplayCount === selectedReplayBaseline.replayCount + 1 && chosenCoverageGainUnits !== null
    ? chosenCoverageGainUnits > selectedCoverageBaseline.coverageGainUnits
    : bestSelection && recurrenceCertified ? false : null;
  const recurrenceExceptionEligible = recurrencePolicy === "strict-replay-rescue" && recurrenceCertified &&
    bestSelection && selectedReplayBaseline && recurrenceFrontierCertified && certifiedRecurrenceTUnits !== null &&
    chosenImmediateReplayCount === selectedReplayBaseline.replayCount + 1 && chosenMatureGainUnits !== null
    ? chosenMatureGainUnits > certifiedRecurrenceTUnits
    : recurrencePolicy === "strict-replay-rescue" && bestSelection && recurrenceCertified ? false : null;
  const selectedAdmissionEligible = recurrenceCertified && bestSelection && selectedReplayBaseline
    ? chosenImmediateReplayCount === selectedReplayBaseline.replayCount ||
      coverageExceptionEligible === true || recurrenceExceptionEligible === true
    : null;
  const admissionReasons: Array<"replay-minimum" | "first-exposure" | "recurrence"> | null =
    !selectedAdmissionEligible || !selectedReplayBaseline ? null
      : chosenImmediateReplayCount === selectedReplayBaseline.replayCount
        ? ["replay-minimum"]
        : [
            ...(coverageExceptionEligible ? ["first-exposure" as const] : []),
            ...(recurrenceExceptionEligible ? ["recurrence" as const] : []),
          ];
  const conditionalTBenefit = recurrencePolicy === "strict-replay-rescue" && recurrenceExceptionEligible &&
    chosenMatureGainUnits !== null && certifiedRecurrenceTUnits !== null && matureRecurrenceScorer
    ? Number(chosenMatureGainUnits - certifiedRecurrenceTUnits) / Number(matureRecurrenceScorer.denominator)
    : recurrencePolicy === "strict-replay-rescue" && selectedAdmissionEligible ? 0 : null;
  const matureRecurrenceProof: Partial<BalancedRecurrenceProof> = recurrencePolicy
    ? {
        balancedMatureRecurrencePolicy: recurrencePolicy,
        recurrenceCertified,
        matureTypeEligiblePlayerCount: matureRecurrenceScorer?.typeEligiblePlayerCount ?? 0,
        firstExposureCompletePlayerCount: matureRecurrenceScorer?.typeEligiblePlayerCount ?? 0,
        chosenMatureDeltaT: recurrenceCertified && matureRecurrenceScorer && chosenMatureGainUnits !== null
          ? Number(chosenMatureGainUnits) / Number(matureRecurrenceScorer.denominator)
          : null,
        chosenMatureDeltaTUnits: recurrenceCertified && chosenMatureGainUnits !== null
          ? chosenMatureGainUnits.toString()
          : null,
        matureDeltaTDenominator: (matureRecurrenceScorer?.denominator ?? BigInt(1)).toString(),
        bestMatureDeltaTAtRmin: recurrencePolicy === "strict-replay-rescue" && recurrenceFrontierCertified &&
          matureRecurrenceScorer && certifiedRecurrenceTUnits !== null
          ? Number(certifiedRecurrenceTUnits) / Number(matureRecurrenceScorer.denominator)
          : null,
        bestMatureDeltaTAtRminUnits: recurrencePolicy === "strict-replay-rescue" && recurrenceFrontierCertified
          ? certifiedRecurrenceTUnits?.toString() ?? null
          : null,
        bestMatureDeltaTAtRminDenominator: recurrencePolicy === "strict-replay-rescue" && recurrenceFrontierCertified
          ? matureRecurrenceScorer?.denominator.toString() ?? null
          : null,
        recurrenceFrontierCertified: recurrencePolicy === "strict-replay-rescue" ? recurrenceFrontierCertified : null,
        chosenRecurrenceRescue: recurrenceExceptionEligible,
        conditionalTBenefit,
        coverageExceptionEligible,
        recurrenceExceptionEligible,
        recurrenceAdmissionCertified: recurrenceCertified,
        selectedAdmissionEligible,
        admissionReasons,
        matureRecurrencePlayers: recurrenceCertified ? matureRecurrenceScore?.players ?? [] : [],
      }
    : {};
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
    selection, scheduleIndex, scheduleCertified: selectedRankCertified, fairnessCertified, starvationCertified,
    bestImmediateReplayCount, allowedImmediateReplayCount, chosenImmediateReplayCount,
    replayCertified, replayEnvelopeStatus,
    bestMinimumReplayCoverageGain, chosenImmediateCoverageGain,
    bestMinimumReplayCoverageGainUnits: coverageGateCertified && selectedCoverageBaseline
      ? selectedCoverageBaseline.coverageGainUnits.toString() : null,
    chosenImmediateCoverageGainUnits: chosenCoverageGainUnits?.toString() ?? null,
    coverageGainDenominator: coverageScorer.denominator.toString(),
    coverageGateCertified, coverageGateStatus, chosenReplayCoverageEligible,
    coverageGainMetric,
    varietyOptimal,
    ...(balancePolicy ? { balanceCertified } : {}),
    structuralOpportunityVocabulary,
    ...matureRecurrenceProof,
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
      bestMinimumReplayCoverageGainUnits: coverageGateCertified && selectedCoverageBaseline
        ? selectedCoverageBaseline.coverageGainUnits.toString() : null,
      chosenImmediateCoverageGainUnits: chosenCoverageGainUnits?.toString() ?? null,
      coverageGainDenominator: coverageScorer.denominator.toString(),
      coverageGateCertified, coverageGateUpperBoundCertified, coverageGateStatus, chosenReplayCoverageEligible,
      coverageGainMetric,
      fairnessCertified, scheduleCertified: selectedRankCertified, starvationCertified, varietyOptimal,
      ...matureRecurrenceProof,
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
