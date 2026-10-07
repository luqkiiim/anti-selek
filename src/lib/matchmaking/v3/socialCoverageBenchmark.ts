import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { buildBalanceGuardrail } from "./balanceGuardrail";
import { getDoublesPartitions } from "./balance";
import { buildSocialVarietyContext, buildSocialVarietySnapshot, getSocialVarietyCoverage, getSocialVarietyGains, getSocialVarietySnapshot } from "./socialVariety";
import { analyzeStaticBalancedRelationshipFeasibility } from "./benchmarkBalanceFeasibility";
import type { StaticBalanceFeasibilityReport } from "./benchmarkBalanceFeasibility";
import { scoreSocialHorizon321 } from "./socialHorizonCoverageScoring";
import type { SocialHorizon321Score } from "./socialHorizonCoverageScoring";
import { scoreSocialVariety3211 } from "./socialRollingVariety";
import type { RollingCoverageGainMetric, SocialVariety3211Score } from "./socialRollingVariety";
import * as rotationApi from "./socialBatch";
import type { RotationBatchOptions } from "./socialBatch";
import type { MatchmakerV3Player, SocialHistoryMatch, SocialVarietySnapshot, V3DoublesPartition } from "./types";

const PLAYER_COUNT = 14;
const COURT_COUNT = 2;
const IDEAL_REST_GAP = Math.ceil((PLAYER_COUNT - 4) / 4);
const FORMAT_ORDER = [SessionType.SOCIAL_MIX, SessionType.POINTS, SessionType.ELO] as const;
const RELATION_FACETS = ["courtmates", "partners", "opponents"] as const;

export type BenchmarkProfile = "narrow" | "wide";

export interface BenchmarkCheckpoint {
  completedMatches: number;
  completedMatchTypeCounts: { MIXED: number; OWN_SIDE: number };
  varietyCoverageScore: number | null;
  /** Weighted C/O/P horizon score; absent only in older saved benchmark artifacts. */
  socialHorizon321?: SocialHorizon321Score;
  /** Completed-only structural 3/2/1 relationship plus rolling-type score. */
  socialVariety3211?: SocialVariety3211Score;
  partnerCoverage: number | null;
  opponentCoverage: number | null;
  courtmateCoverage: number | null;
  matchTypeCoverage: { MIXED: number | null; OWN_SIDE: number | null };
  normalizedEntropyScore: number | null;
  relationshipEntropyScore: number | null;
  matchTypeEntropyScore: number | null;
  /** Rest turns accumulated while the player was available, sampled at assignment. */
  assignmentRestGap: { max: number; mean: number | null; p95: number | null; count: number };
  /** Global completion events between two own match completions, including time spent playing. */
  betweenOwnCompletionEventGap: { max: number; mean: number | null; p95: number | null; count: number };
  backToBack: { count: number; eligibleAssignments: number; rate: number | null };
  reachedIdealPlusOne: number;
  reachedIdealPlusTwo: number;
  starvation: StarvationSummary;
  replayEnvelope: ReplayEnvelopeSummary;
  coverageGate: CoverageGateSummary;
  /** Present only for the opt-in Social courtmate-priority experiment. */
  socialPriority?: SocialPrioritySummary;
  /** Present only for the opt-in one-pair courtmate-rescue experiment. */
  socialCourtmateRescue?: SocialCourtmateRescueSummary;
  /** Present only for the opt-in strictly beneficial match-type rescue experiment. */
  socialCourtmateBeneficialRescue?: SocialCourtmateBeneficialRescueSummary;
  typePriorityOverrides: {
    policyApplied: boolean;
    refillDecisions: number | null;
    decisionsWithLowerZeroTypeTradeoff: number | null;
    rateAcrossRefills: number | null;
    selectedMatchTypeGainMean: number | null;
    selectedRelationshipGainMean: number | null;
  };
  optimizer: OptimizerSummary;
  matchCountSpread: number;
  playerMatchCounts: Array<{ userId: string; matchesPlayed: number }>;
  minimumPlayerMatchCount: number;
  maximumPlayerMatchCount: number;
  allPlayersExactlySixMatches: boolean | null;
  maximumFairnessSpread: number;
  minimumFairnessSpread: number;
  maximumBalanceGap: number;
  externalBusyEventCount: number;
  maximumObservedAvailableRestTurns: number;
  ongoingAvailableFiveTurnWaits: Array<{ userId: string; restTurns: number; initiatingReplay: ReplayInitiationTrace | null }>;
  inProgressFiveTurnAssignments: Array<{ userId: string; assignmentId: string; restTurns: number; initiatingReplay: ReplayInitiationTrace | null }>;
}

export interface SocialPrioritySummary {
  policyApplied: true;
  /** Includes the opening two-court batch and each subsequent one-court refill. */
  objectiveDecisions: number;
  objectiveCertifiedDecisions: number;
  objectiveUncertifiedDecisions: number;
  rankingDiscrepancies: number;
  fairnessCertificateFailures: number;
  starvationSafetyFailures: number;
  searchLimitDecisions: number;
  incompleteCounterfactualDecisions: number;
  /** Started no-starvation wrapper audits; a match may still be unfinished at a checkpoint. */
  counterfactualAuditDecisions: number;
  counterfactualCertifiedDecisions: number;
  counterfactualUncertifiedDecisions: number;
  counterfactualRankingDiscrepancies: number;
  counterfactualFairnessCertificateFailures: number;
  counterfactualSearchLimitDecisions: number;
  counterfactualIncompleteDecisions: number;
  /** The production minimum-replay and coverage gates are intentionally inactive. */
  coverageGateStatus: "DISABLED";
  replayEnvelopeStatus: "DISABLED";
}

export interface SocialCourtmateRescueTypeWindowWitness {
  userId: string;
  feasibleTypes: CompletedMatchType[];
  recentTypesBefore: Array<CompletedMatchType | null>;
  recentTypesAfter: Array<CompletedMatchType | null>;
  beforeT: number;
  afterT: number;
  deltaT: number;
  missingTypesBefore: CompletedMatchType[];
  missingTypesAfter: CompletedMatchType[];
  restoredTypes: CompletedMatchType[];
  expiredTypes: CompletedMatchType[];
}

export interface SocialCourtmateRescueDecisionWitness {
  started: true;
  /** All assignments in the real decision have completed; counterfactuals use null. */
  completed: boolean | null;
  completedAfterMatchNumber: number | null;
  auditCompleted: boolean;
  counterfactual: boolean;
  respectStarvation: boolean;
  label: string;
  afterCompletedMatches: number;
  courtCount: 1 | 2;
  selectedCourts: Array<{ ids: string[]; partition: V3DoublesPartition }>;
  independentCandidateCount: number;
  admittedCandidateCount: number;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  gMaxCertified: boolean;
  policyCertified: boolean;
  rankingMatches: boolean;
  courtmateCoverageProfileMatches: boolean;
  searchLimitReached: boolean;
  courtMateGainMaximum: number | null;
  chosenCourtmateGain: number | null;
  chosenCourtmateGainDeficit: number | null;
  bestRollingMatchTypeGainAtGmax: number | null;
  chosenRollingMatchTypeGain: number | null;
  incrementalTGainVsBestFullGainCandidate: number | null;
  rollingTypeGainDenominator: string;
  selectedCourtmateCoverageProfile: Array<{ userId: string; covered: number; possible: number }>;
  engineCourtmateCoverageProfile: Array<{ userId: string; covered: number; possible: number }> | null;
  bestGmaxCourts: Array<{ ids: string[]; partition: V3DoublesPartition }> | null;
  bestGmaxFullTypePlayerCount: number | null;
  chosenFullTypePlayerCount: number | null;
  fullTypePlayerCountDeltaVsGmax: number | null;
  zeroTBenefitSacrifice: boolean;
  /** Included for one-pair sacrifices so each restored or expired type is reviewable. */
  perPlayerTypeWindows: SocialCourtmateRescueTypeWindowWitness[];
}

export interface SocialCourtmateRescueSummary {
  policyApplied: true;
  coverageGateStatus: "DISABLED";
  replayEnvelopeStatus: "DISABLED";
  /** Optimizer calls audited, including the opening two-court decision. */
  startedDecisions: number;
  /** Started real decisions whose full assigned batch has completed by this checkpoint. */
  completedDecisions: number;
  auditCompletedDecisions: number;
  certifiedDecisions: number;
  uncertifiedDecisions: number;
  rankingDiscrepancies: number;
  fairnessCertificateFailures: number;
  starvationSafetyFailures: number;
  gMaxCertificationFailures: number;
  admissionFailures: number;
  searchLimitDecisions: number;
  incompleteAuditDecisions: number;
  /** Completed real decisions only; a pending assignment never contributes. */
  completedChosenCourtmatePairSacrifice: number;
  completedOnePairSacrifices: number;
  completedOnePairSacrificesWithPositiveTBenefit: number;
  completedOnePairSacrificesWithZeroTBenefit: number;
  completedOnePairSacrificesWithNegativeTBenefit: number;
  completedSignedRollingTGain: number;
  completedBestGmaxSignedRollingTGain: number;
  completedIncrementalTGainVsBestFullGain: number;
  completedTGainDenominator: string;
  /** Started no-starvation counterfactual oracle audits in their own fairness class. */
  counterfactualStartedDecisions: number;
  counterfactualAuditCompletedDecisions: number;
  counterfactualCertifiedDecisions: number;
  counterfactualUncertifiedDecisions: number;
  counterfactualRankingDiscrepancies: number;
  counterfactualFairnessCertificateFailures: number;
  counterfactualGMaxCertificationFailures: number;
  counterfactualAdmissionFailures: number;
  counterfactualSearchLimitDecisions: number;
  counterfactualIncompleteAuditDecisions: number;
  witnesses: SocialCourtmateRescueDecisionWitness[];
  counterfactualWitnesses: SocialCourtmateRescueDecisionWitness[];
}

export interface SocialCourtmateBeneficialRescueDecisionWitness extends SocialCourtmateRescueDecisionWitness {
  /** The strict courtmate-first winner among every independently enumerated Gmax candidate. */
  strictWinnerRollingMatchTypeGainAtGmax: number;
  strictWinnerAtGmaxCourts: Array<{ ids: string[]; partition: V3DoublesPartition }>;
  strictWinnerAtGmaxFullTypePlayerCount: number;
  /** Chosen ΔT minus strict-winner ΔT only when the chosen batch retains Gmax; otherwise zero. */
  fullGmaxTBenefitVsStrict: number;
}

export interface SocialCourtmateBeneficialRescueSummary extends SocialCourtmateRescueSummary {
  completedAtGmaxDecisions: number;
  completedAtGmaxWithPositiveSignedTGain: number;
  completedAtGmaxWithStrictOrderingBenefit: number;
  completedAtGmaxIncrementalTVsStrictWinner: number;
  completedAtGmaxExtraBothTypePlayerWindowsVsStrictWinner: number;
  witnesses: SocialCourtmateBeneficialRescueDecisionWitness[];
  counterfactualWitnesses: SocialCourtmateBeneficialRescueDecisionWitness[];
}

interface MutableSocialCourtmateRescueCounters {
  startedDecisions: number;
  auditCompletedDecisions: number;
  certifiedDecisions: number;
  uncertifiedDecisions: number;
  rankingDiscrepancies: number;
  fairnessCertificateFailures: number;
  starvationSafetyFailures: number;
  gMaxCertificationFailures: number;
  admissionFailures: number;
  searchLimitDecisions: number;
  incompleteAuditDecisions: number;
  counterfactualStartedDecisions: number;
  counterfactualAuditCompletedDecisions: number;
  counterfactualCertifiedDecisions: number;
  counterfactualUncertifiedDecisions: number;
  counterfactualRankingDiscrepancies: number;
  counterfactualFairnessCertificateFailures: number;
  counterfactualGMaxCertificationFailures: number;
  counterfactualAdmissionFailures: number;
  counterfactualSearchLimitDecisions: number;
  counterfactualIncompleteAuditDecisions: number;
  rollingTypeGainDenominator: string;
  witnesses: SocialCourtmateRescueDecisionWitness[];
  counterfactualWitnesses: SocialCourtmateRescueDecisionWitness[];
}

interface MutableSocialCourtmateBeneficialRescueCounters extends Omit<
  MutableSocialCourtmateRescueCounters,
  "witnesses" | "counterfactualWitnesses"
> {
  witnesses: SocialCourtmateBeneficialRescueDecisionWitness[];
  counterfactualWitnesses: SocialCourtmateBeneficialRescueDecisionWitness[];
}

export interface StarvationSummary {
  completedRotationDecisions: number;
  decisionsWithOverdueAvailable: number;
  overduePlayerEvents: number;
  materiallyChangedPlayerSet: number;
  certifiedCounterfactualDecisions: number;
  uncertifiedCounterfactualDecisions: number;
  rateWhenOverdue: number | null;
  rateAcrossCompletedDecisions: number | null;
  rateAmongCertifiedCounterfactualDecisions: number | null;
}

export interface ReplayEnvelopeSummary {
  /** One-court refill cohort only; opening two-court decision is excluded. */
  policyApplied: boolean;
  productionRefillDecisions: number;
  productionReplayEnvelopeCertifiedDecisions: number;
  productionCertifiedDecisions: number;
  productionUncertifiedDecisions: number;
  noStarvationRefillDecisions: number;
  noStarvationReplayEnvelopeCertifiedDecisions: number;
  noStarvationCertifiedDecisions: number;
  noStarvationUncertifiedDecisions: number;
  noStarvationCounterfactualDecisions: number;
  acceptedPlusOneDecisions: number;
  acceptedPlusOneRate: number | null;
  betterEntropyBeyondAllowanceDecisions: number;
  betterEntropyBeyondAllowanceCandidateCount: number;
  fivePlusCompletedRestEpisodes: number;
  fivePlusEpisodesLinkedAcceptedPlusOneReplay: number;
  fivePlusEpisodesLinkedOtherRestZeroReplay: number;
  fivePlusEpisodesWithoutLinkedRestZeroReplay: number;
  witnesses: ReplayEnvelopeWitness[];
}

export interface CoverageGateSummary {
  policyApplied: boolean;
  refillDecisions: number;
  certifiedDecisions: number;
  uncertifiedDecisions: number;
  noStarvationRefillDecisions: number;
  noStarvationCertifiedDecisions: number;
  noStarvationUncertifiedDecisions: number;
  plusOneAvailableDecisions: number;
  plusOneAvailableCandidates: number;
  plusOneCoverageEligibleDecisions: number;
  plusOneCoverageEligibleCandidates: number;
  plusOneSelectedDecisions: number;
  plusOneSelectedCandidates: number;
  plusOneRejectedWithoutImprovedCoverageDecisions: number;
  plusOneRejectedWithoutImprovedCoverageCandidates: number;
  zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions: number;
  zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates: number;
  acceptedGreaterCoverageDecisions: number;
  acceptedGreaterCoverageCandidates: number;
  higherEntropyBeyondAllowanceDecisions: number;
  higherEntropyBeyondAllowanceCandidates: number;
  fivePlusCompletedRestEpisodes: number;
  fivePlusEpisodesLinkedAcceptedPlusOneReplay: number;
  witnesses: CoverageGateWitness[];
}

export interface CoverageGateWitness {
  afterCompletedMatches: number;
  bestImmediateReplayCount: number;
  allowedImmediateReplayCount: number;
  chosenImmediateReplayCount: number;
  bestMinimumReplayCoverageGain: number;
  chosenImmediateCoverageGain: number;
  chosenReplayCoverageEligible: boolean;
  selected: EntropyCandidateWitness;
  fairnessVector: number[];
  starvationVector: number[];
  minimumReplayCoverageGainIsZero: boolean;
  higherTypeGainRejectedPlusOneCandidateCount: number;
  bestMinimumReplayCoverageCandidate: EntropyCandidateWitness | null;
  bestCoverageEligiblePlusOne: EntropyCandidateWitness | null;
  bestCoverageRejectedPlusOne: EntropyCandidateWitness | null;
  higherTypeGainRejectedPlusOne: EntropyCandidateWitness | null;
  bestEntropyRejectedBeyondAllowance: EntropyCandidateWitness | null;
  plusOneAvailableCandidates: number;
    plusOneCoverageEligibleCandidates: number;
    plusOneRejectedWithoutImprovedCoverageCandidates: number;
  withoutStarvation: null | {
    ids: string[];
    bestImmediateReplayCount: number;
    allowedImmediateReplayCount: number;
    bestMinimumReplayCoverageGain: number;
    chosenImmediateCoverageGain: number;
    chosenImmediateReplayCount: number;
    coverageGateCertified: boolean;
  };
}

export interface ReplayEnvelopeWitness {
  afterCompletedMatches: number;
  fairnessVector: number[];
  starvationVector: number[];
  balanceEnvelopeCandidateCount: number;
  bestImmediateReplayCount: number;
  allowedImmediateReplayCount: number;
  chosenImmediateReplayCount: number;
  selected: EntropyCandidateWitness;
  strongestRejectedCandidate: EntropyCandidateWitness | null;
  rejectedCandidateCount: number;
  withoutStarvation: null | {
    ids: string[];
    balanceGap: number;
    zeroRestCount: number;
    bestImmediateReplayCount: number;
    allowedImmediateReplayCount: number;
    effectiveCombinedEntropyGain: number;
    replayEnvelopeCertified: boolean;
    engineCertified: boolean;
  };
}

export interface EntropyCandidateWitness {
  ids: string[];
  partition: V3DoublesPartition;
  balanceGap: number;
  zeroRestCount: number;
  restTurnsByPlayer: Array<{ userId: string; restTurns: number }>;
  softRestVector: number[];
  rawMatchTypeGain: number;
  effectiveMatchTypeGain: number;
  rawRelationshipGain: number;
  effectiveRelationshipGain: number;
  rawCombinedEntropyGain: number;
  effectiveCombinedEntropyGain: number;
  immediateCoverageGain: number;
  immediateCoverageGainNumerator: string;
  immediateCoverageGainDenominator: string;
}

export interface OptimizerSummary {
  callsStarted: number;
  callsCompleted: number;
  ordinaryProductionCalls: number;
  ordinaryProductionWallMs: number;
  counterfactualWrapperCalls: number;
  counterfactualWrapperWallMs: number;
  searchLimitCalls: number;
  fairnessCertificateFailures: number;
  starvationCertificateFailures: number;
  balanceCertificateFailures: number;
  incompleteCounterfactualCalls: number;
}

export interface RelationshipKey {
  facet: (typeof RELATION_FACETS)[number];
  players: [string, string];
}

export interface MissingRelationship extends RelationshipKey {
  measuredPolicy: BenchmarkEnginePolicy;
  frontierDiagnosticPolicy: "current-coverage-gated-oracle";
  observedStrongRotationOpportunities: number;
  observedBalanceEnvelopeOpportunities: number;
  observedMatchTypeFrontierOpportunities: number;
  observedCadenceAdmissibleOpportunities: number;
  observedRelationshipEntropyFrontierOpportunities: number;
  observedSoftCadenceFrontierOpportunities: number;
  observedReplayMinimumOpportunities: number;
  observedReplayAllowanceOpportunities: number;
  observedCombinedEntropyFrontierOpportunities: number;
  observedCombinedSoftCadenceFrontierOpportunities: number;
  observedPolicyAdmissionOpportunities: number;
  observedPolicyEntropyFrontierOpportunities: number;
  observedPolicyFinalFrontierOpportunities: number;
  observedCoverageGateRejectedPlusOneOpportunities: number;
  classification:
    | "admissible_but_unselected"
    | "soft_cadence_priority_excluded_in_observed_opportunities"
    | "legacy_rest_priority_excluded_in_observed_opportunities"
    | "relationship_entropy_priority_excluded_in_observed_opportunities"
    | "immediate_replay_priority_excluded_in_observed_opportunities"
    | "match_type_entropy_priority_excluded_in_observed_opportunities"
    | "combined_entropy_priority_excluded_in_observed_opportunities"
    | "coverage_gate_priority_excluded_in_observed_opportunities"
    | "replay_allowance_priority_excluded_in_observed_opportunities"
    | "strict_cadence_priority_excluded_in_observed_opportunities"
    | "strict_entropy_priority_excluded_in_observed_opportunities"
    | "excluded_by_balance_envelope_in_observed_opportunities"
    | "never_in_strongest_rotation_class_during_observed_refills";
}

export interface ReplayInitiationTrace {
  assignmentId: string;
  assignedAfterCompletedMatches: number;
  priorOwnCompletionEvent: number;
  fairAlternativeSetsWithoutPlayer: number;
  starvationEquivalentAlternativeSetsWithoutPlayer: number;
  balanceAdmissibleAlternativeSetsWithoutPlayer: number;
  betterZeroRestSetsWithoutPlayer: number;
  /** Legacy strict-policy witness: full rest vector improves inside the stronger class. */
  smootherBalanceAdmissibleSetsWithoutPlayer: number;
  /** A type-entropy-first mixed candidate with fewer immediate replays existed. */
  betterTypeGainLowerZeroRestSetsWithoutPlayer: number;
  /** The selected refill was certified at exactly one above its minimum zero-rest count. */
  acceptedPlusOneReplay?: boolean;
  acceptedGreaterCoverageReplay?: boolean;
  coverageGateCertified?: boolean;
  bestMinimumReplayCoverageGain?: number;
  selectedImmediateCoverageGain?: number;
  bestImmediateReplayCount?: number;
  allowedImmediateReplayCount?: number;
  chosenImmediateReplayCount?: number;
  selectedDecisionIds?: string[];
  marginalPlayerAttribution?: "decision_level_only";
}

export interface TypePriorityOverrideWitness {
  afterCompletedMatches: number;
  fairnessVector: number[];
  starvationVector: number[];
  balanceEnvelopeCandidateCount: number;
  selected: {
    ids: string[];
    balanceGap: number;
    zeroRestCount: number;
    restVector: number[];
    rawMatchTypeGain: number;
    effectiveMatchTypeGain: number;
    rawRelationshipGain: number;
    effectiveRelationshipGain: number;
  };
  lowerZeroRestCompetitor: {
    ids: string[];
    balanceGap: number;
    zeroRestCount: number;
    restVector: number[];
    rawMatchTypeGain: number;
    effectiveMatchTypeGain: number;
    rawRelationshipGain: number;
    effectiveRelationshipGain: number;
  };
}

export interface BenchmarkSessionResult {
  profile: BenchmarkProfile;
  sessionType: SessionType;
  seed: number;
  latentRankStrengths: number[];
  strengthUnits: string;
  externalCompletionSchedule: Array<0 | 1>;
  /** Completed-only match types in event order, used for early/late session counts. */
  completedMatchTypes: Array<"MIXED" | "OWN_SIDE">;
  /** Optional completed court/team tuples, emitted by the horizon rescore runner only. */
  completedHistory?: Array<{
    completedMatchNumber: number;
    team1: [string, string];
    team2: [string, string];
    matchType: "MIXED" | "OWN_SIDE";
  }>;
  checkpoints: Record<string, BenchmarkCheckpoint>;
  maximumMatchCountSpread: number;
  fiveGapEpisodes: FiveGapEpisode[];
  missingRelationships: MissingRelationship[];
  relationshipOpportunityCounts: Record<string, Record<string, number>>;
  everStrongRotationRelationshipCounts: Record<string, number>;
  everBalanceEnvelopeRelationshipCounts: Record<string, number>;
  everMatchTypeFrontierRelationshipCounts: Record<string, number>;
  everCadenceAdmissibleRelationshipCounts: Record<string, number>;
  everRelationshipEntropyFrontierRelationshipCounts: Record<string, number>;
  everSoftCadenceFrontierRelationshipCounts: Record<string, number>;
  everReplayMinimumRelationshipCounts: Record<string, number>;
  everReplayAllowanceRelationshipCounts: Record<string, number>;
  everCombinedEntropyFrontierRelationshipCounts: Record<string, number>;
  everCombinedSoftCadenceFrontierRelationshipCounts: Record<string, number>;
  typePriorityOverrides: {
    scope: string;
    applicable: boolean;
    refillDecisions: number | null;
    certifiedRefillDecisions: number | null;
    decisionsWithLowerZeroTypeTradeoff: number | null;
    rateAcrossCertifiedRefillDecisions: number | null;
    selectedMatchTypeGainMean: number | null;
    selectedRelationshipGainMean: number | null;
    witnesses: TypePriorityOverrideWitness[];
  };
  replayEnvelope: ReplayEnvelopeSummary;
  structuralOpportunityAudit: {
    partnerPairs: number;
    opponentPairs: number;
    courtmatePairs: number;
  };
  staticBalanceFeasibility: StaticBalanceFeasibilityReport | null;
  staticBalanceFeasibilityMs: number;
  /** Complete session wall time, including matcher, independent oracle and report instrumentation. */
  performanceMs: number;
}

export interface FiveGapEpisode {
  traceId: string;
  userId: string;
  restGap: number;
  initiatingReplay: ReplayInitiationTrace | null;
  classification:
    | "avoidable_equal_priority_smoother_alternative"
    | "avoidable_equal_priority_zero_rest_alternative"
    | "type_entropy_priority_override"
    | "match_type_entropy_priority_exclusion"
    | "immediate_replay_priority_exclusion"
    | "relationship_entropy_priority_exclusion"
    | "soft_cadence_priority_exclusion"
    | "zero_rest_frontier_inclusion_available"
    | "no_equal_priority_inclusion_candidate"
    | "fairness_or_mixed_legality"
    | "starvation_priority"
    | "balance_guardrail"
    | "cadence_priority_exclusion"
    | "cadence_tie_later_tiebreak"
    | "accepted_plus_one_replay_origin"
    | "combined_entropy_priority_exclusion"
    | "coverage_gate_priority_exclusion"
    | "strict_entropy_priority_exclusion"
    | "legacy_rest_priority_exclusion"
    | "no_equal_priority_smoother_replay_witness"
    | "not_classified";
  hadFairnessClassOpportunity: boolean;
  hadStarvationClassOpportunity: boolean;
  hadBalanceAdmissibleOpportunity: boolean;
  hadMatchTypeFrontierOpportunity: boolean;
  hadZeroRestFrontierOpportunity: boolean;
  hadRelationshipEntropyFrontierOpportunity: boolean;
  hadSoftCadenceFrontierOpportunity: boolean;
  hadReplayMinimumOpportunity: boolean;
  hadReplayAllowanceOpportunity: boolean;
  hadCombinedEntropyFrontierOpportunity: boolean;
  hadCombinedSoftCadenceFrontierOpportunity: boolean;
  hadCoverageGateRejectedPlusOneOpportunity: boolean;
  hadBeyondReplayAllowanceOpportunity: boolean;
  hadPolicyAdmissionOpportunity: boolean;
  hadPolicyEntropyFrontierOpportunity: boolean;
  hadPolicyFinalFrontierOpportunity: boolean;
  hadSmootherAlternative: boolean;
  hadCadenceOptimalOpportunity: boolean;
  hadCadenceSuboptimalOpportunity: boolean;
  lastDeferredWitness: DeferredRefillWitness | null;
  cadenceOptimalAlternativeWitness: DeferredRefillWitness | null;
  strictlyBetterCadenceWitness: DeferredRefillWitness | null;
  cadenceSuboptimalAlternativeWitness: DeferredRefillWitness | null;
  currentWaitClassification: FiveGapEpisode["classification"];
  replayClassification: "avoidable_equal_priority_smoother_alternative" | "avoidable_equal_priority_zero_rest_alternative" | "type_entropy_priority_override" | "accepted_plus_one_replay_origin" | "no_equal_priority_smoother_alternative" | "no_linked_rest0_replay";
}

export interface DeferredRefillWitness {
  afterCompletedMatches: number;
  playerRestTurns: number;
  chosenIds: string[];
  chosenRestVector: number[];
  chosenZeroRestCount: number;
  chosenSoftRestVector: number[];
  chosenRawMatchTypeGain: number;
  chosenEffectiveMatchTypeGain: number;
  chosenRawRelationshipGain: number;
  chosenEffectiveRelationshipGain: number;
  chosenRawCombinedEntropyGain: number;
  chosenEffectiveCombinedEntropyGain: number;
  fairnessCandidateCount: number;
  starvationEquivalentCandidateCount: number;
  balanceEnvelopeCandidateCount: number;
  matchTypeFrontierCandidateCount: number;
  cadenceFrontierCandidateCount: number;
  relationshipEntropyFrontierCandidateCount: number;
  softCadenceFrontierCandidateCount: number;
  replayMinimumCandidateCount: number;
  replayAllowanceCandidateCount: number;
  combinedEntropyFrontierCandidateCount: number;
  combinedSoftCadenceFrontierCandidateCount: number;
  bestBalanceCandidate: {
    ids: string[];
    partition: V3DoublesPartition;
    restVector: number[];
    zeroRestCount: number;
    softRestVector: number[];
    rawMatchTypeGain: number;
    effectiveMatchTypeGain: number;
    rawRelationshipGain: number;
    effectiveRelationshipGain: number;
    rawCombinedEntropyGain: number;
    effectiveCombinedEntropyGain: number;
  } | null;
  bestCandidateVsChosenMatchType: "better" | "equal" | "worse" | "none";
  bestCandidateVsChosenCadence: "strictly_better" | "equal" | "worse" | "none";
  bestCandidateVsChosenZeroRest: "strictly_better" | "equal" | "worse" | "none";
  bestCandidateVsChosenRelationshipGain: "better" | "equal" | "worse" | "none";
  bestCandidateVsChosenSoftRest: "strictly_better" | "equal" | "worse" | "none";
  bestCandidateVsChosenCombinedEntropy: "better" | "equal" | "worse" | "none";
  bestCandidateVsChosenReplayAllowance: "within_allowance" | "outside_allowance" | "none";
}

export interface BenchmarkReport {
  schemaVersion: 1;
  /** Manual-run artifact status; pending means the simulation completed but assertions did not finish. */
  validationStatus?: "pending" | "passed";
  sourceRevision: string;
  sourceProvenance: {
    commitSha: string;
    workingTreeDirty: boolean;
    workingTreeNote: string;
    policyLabel: string;
    engineSourceSha256: string | null;
    measurementHarnessSha256: string | null;
    coreEngineTrackedDiffPaths: string[];
    sharedVarietyTrackedDiffPaths: string[];
    measurementHarnessTrackedDiffPaths: string[];
  };
  generatedAt: string;
  seedCount: number;
  wideSeedCount: number;
  enginePolicy: "current" | "strict" | "baseline" | "type-first" | "replay-envelope";
  setup: {
    roster: "14 players: P1-P7 male, P8-P14 female (FEMALE_FLEX)";
    sessionMode: "MIXICANO";
    courts: 2;
    completionSchedule: "Independent seeded event sequence; each event completes one occupied court, then refills that court.";
    checkpoints: [21, 400];
    coverageHistory: "Completed matches only; active assignments are used by matchmaking and excluded from coverage.";
    restDefinition: "Completed-match events while available; players in an active match do not accrue rest turns.";
    skillProfiles: Record<BenchmarkProfile, string>;
    pointDiff: "0 for all players; the benchmark has no match score outcomes.";
  };
  sessions: BenchmarkSessionResult[];
}

export interface SocialHorizonCoverageReport {
  schemaVersion: "social-horizon-321-v1";
  sourceRevision: string;
  sourceProvenance: BenchmarkReport["sourceProvenance"];
  generatedAt: string;
  enginePolicy: BenchmarkReport["enginePolicy"];
  targetMatches: number;
  matcherCoverageGainMetric: "legacy-equal" | "social-horizon-321" | RollingCoverageGainMetric;
  /** Omitted for legacy production runs; opt-in experiment only supports Social. */
  socialPriorityPolicy?: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue";
  /** Omitted when the default three-format roster was used. */
  sessionTypes?: SessionType[];
  seeds: number[];
  metric: {
    id: "social-horizon-321";
    formula: "Per player: (3C + 2O + P) / the total weight of meaningful facets; C/O/P are capped unique feasible peers divided by min(feasible peers, 13/12/6).";
    weights: { courtmates: 3; opponents: 2; partners: 1 };
    caps: { courtmates: 13; opponents: 12; partners: 6 };
    opportunityScope: "Full structural roster opportunity sets; availability, active status, player history, and balance are not filters.";
    emptyFacetRule: "Exclude empty facets and renormalize the remaining per-player weights.";
    historyRule: "Completed matches only; active assignments and reservations are excluded from the score.";
  };
  sessions: BenchmarkSessionResult[];
}

export function assertBenchmarkReportReadyForRendering(report: Pick<BenchmarkReport, "validationStatus">) {
  if (report.validationStatus === "pending") {
    throw new Error("Cannot render a benchmark report with validationStatus=pending.");
  }
}

export interface BenchmarkPlayer extends MatchmakerV3Player {
  restTurns: number;
  gender: string;
  partnerPreference: string;
  pointDiff: number;
  isBusy: boolean;
  isPaused: boolean;
  arrivalPriorityAt: Date | string | null;
}

interface ActiveAssignment {
  assignmentId: string;
  court: 0 | 1;
  partition: V3DoublesPartition;
  ids: string[];
  socialVariety: SocialVarietySnapshot;
  decisionId: number;
  decisionMeta: DecisionMeta;
  restTurnsAtAssignment: Map<string, number>;
  hadPriorMatchAtAssignment: Set<string>;
  balanceGap: number;
  replayInitiationByPlayer: Map<string, ReplayInitiationTrace>;
}

interface ReplayAssignmentContext {
  certified: boolean;
  bestImmediateReplayCount: number;
  allowedImmediateReplayCount: number;
  chosenImmediateReplayCount: number;
  bestMinimumReplayCoverageGain: number;
  chosenImmediateCoverageGain: number;
  coverageGateCertified: boolean;
  coverageEligiblePlusOne: boolean;
  coverageGatePolicy: boolean;
}

interface DecisionMeta {
  pendingAssignments: number;
  overdueAvailable: number;
  overduePlayerCount: number;
  counterfactualComplete: boolean;
  counterfactualChanged: boolean | null;
  socialCourtmateRescueWitness?: SocialCourtmateRescueDecisionWitness;
  socialCourtmateBeneficialRescueWitness?: SocialCourtmateBeneficialRescueDecisionWitness;
}

interface CounterfactualSelectionProof {
  selections: Array<{ ids: string[]; partition: V3DoublesPartition; balanceGap: number }>;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  varietyOptimal: boolean;
  priorityCertified?: boolean;
  balanceCertified: boolean | undefined;
  bestImmediateReplayCount: number | null;
  allowedImmediateReplayCount: number | null;
  chosenImmediateReplayCount: number | null;
  replayCertified: boolean | null;
  replayEnvelopeStatus: "DISABLED" | "CERTIFIED" | "UNCERTIFIED" | "NO_SELECTION" | null;
  bestMinimumReplayCoverageGain?: number | null;
  chosenImmediateCoverageGain?: number | null;
  coverageGateCertified?: boolean | null;
  coverageGateStatus?: "CERTIFIED" | "UNCERTIFIED" | "NO_SELECTION" | "DISABLED" | null;
  chosenReplayCoverageEligible?: boolean | null;
  coverageGainMetric?: "legacy-four-facet" | "social-horizon-321" | RollingCoverageGainMetric | null;
  socialPriorityPolicy?: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue" | null;
  courtmateGainMaximumCertified?: boolean;
  courtmateGainMaximum?: number | null;
  chosenCourtmateGainDeficit?: number | null;
  bestRollingMatchTypeGainAtGmax?: number | null;
  chosenNewCourtmatePairCount?: number | null;
  chosenRollingMatchTypeGain?: number | null;
  chosenPostBatchCourtmateCoverage?: Array<{ userId: string; covered: number; possible: number }> | null;
  searchLimitReached?: boolean;
}

interface WaitEpisodeMeta {
  hadFairnessClassOpportunity: boolean;
  hadStarvationClassOpportunity: boolean;
  hadBalanceAdmissibleOpportunity: boolean;
  hadMatchTypeFrontierOpportunity: boolean;
  hadZeroRestFrontierOpportunity: boolean;
  hadRelationshipEntropyFrontierOpportunity: boolean;
  hadSoftCadenceFrontierOpportunity: boolean;
  hadReplayMinimumOpportunity: boolean;
  hadReplayAllowanceOpportunity: boolean;
  hadCombinedEntropyFrontierOpportunity: boolean;
  hadCombinedSoftCadenceFrontierOpportunity: boolean;
  hadCoverageGateRejectedPlusOneOpportunity: boolean;
  hadBeyondReplayAllowanceOpportunity: boolean;
  hadPolicyAdmissionOpportunity: boolean;
  hadPolicyEntropyFrontierOpportunity: boolean;
  hadPolicyFinalFrontierOpportunity: boolean;
  hadSmootherAlternative: boolean;
  hadCadenceOptimalOpportunity: boolean;
  hadCadenceSuboptimalOpportunity: boolean;
  lastDeferredWitness: DeferredRefillWitness | null;
  cadenceOptimalAlternativeWitness: DeferredRefillWitness | null;
  strictlyBetterCadenceWitness: DeferredRefillWitness | null;
  cadenceSuboptimalAlternativeWitness: DeferredRefillWitness | null;
  hadLegalCandidate: boolean;
}

interface OracleCandidate {
  ids: string[];
  partition: V3DoublesPartition;
  fairness: number[];
  starvation: number[];
  zeroRestCount: number;
  softRest: number[];
  rest: number[];
  rawMatchTypeGain: number;
  effectiveMatchTypeGain: number;
  rawRelationshipGain: number;
  effectiveRelationshipGain: number;
  rawCombinedEntropyGain: number;
  effectiveCombinedEntropyGain: number;
  immediateCoverageGain: number;
  immediateCoverageGainNumerator: bigint;
  immediateCoverageGainDenominator: bigint;
  balanceGap: number;
}

interface RotationAudit {
  legalCandidates: OracleCandidate[];
  fairnessClass: OracleCandidate[];
  rotationClass: OracleCandidate[];
  balanceEnvelope: OracleCandidate[];
  replayMinimum: OracleCandidate[];
  replayCoverageFrontier: OracleCandidate[];
  replayAllowance: OracleCandidate[];
  legacyReplayAllowance: OracleCandidate[];
  legacyCombinedEntropyFrontier: OracleCandidate[];
  legacyCombinedSoftCadenceFrontier: OracleCandidate[];
  baselineEntropyFrontier: OracleCandidate[];
  baselineSoftCadenceFrontier: OracleCandidate[];
  strictEntropyFrontier: OracleCandidate[];
  strictSoftCadenceFrontier: OracleCandidate[];
  matchTypeFrontier: OracleCandidate[];
  cadenceAdmissible: OracleCandidate[];
  combinedEntropyFrontier: OracleCandidate[];
  combinedSoftCadenceFrontier: OracleCandidate[];
  relationshipEntropyFrontier: OracleCandidate[];
  softCadenceFrontier: OracleCandidate[];
  strictCadenceAdmissible: OracleCandidate[];
  bestMatchTypeGain: number | null;
  bestZeroRestCount: number | null;
  allowedZeroRestCount: number | null;
  bestMinimumReplayCoverageGain: number | null;
  bestMinimumReplayCoverageGainNumerator: bigint | null;
  bestCombinedEntropyGain: number | null;
  bestRelationshipGain: number | null;
  bestSoftRestVector: number[] | null;
  bestCadenceVector: number[] | null;
  fairnessClassIds: Set<string>;
  rotationClassIds: Set<string>;
  balanceEnvelopeIds: Set<string>;
  replayMinimumIds: Set<string>;
  replayCoverageFrontierIds: Set<string>;
  replayAllowanceIds: Set<string>;
  legacyReplayAllowanceIds: Set<string>;
  legacyCombinedEntropyFrontierIds: Set<string>;
  legacyCombinedSoftCadenceFrontierIds: Set<string>;
  matchTypeFrontierIds: Set<string>;
  cadenceAdmissibleIds: Set<string>;
  combinedEntropyFrontierIds: Set<string>;
  combinedSoftCadenceFrontierIds: Set<string>;
  relationshipEntropyFrontierIds: Set<string>;
  softCadenceFrontierIds: Set<string>;
  legalCandidateIds: Set<string>;
  fairnessClassKeys: Set<string>;
  rotationClassKeys: Set<string>;
  balanceEnvelopeKeys: Set<string>;
  replayMinimumKeys: Set<string>;
  replayCoverageFrontierKeys: Set<string>;
  replayAllowanceKeys: Set<string>;
  legacyReplayAllowanceKeys: Set<string>;
  legacyCombinedEntropyFrontierKeys: Set<string>;
  legacyCombinedSoftCadenceFrontierKeys: Set<string>;
  baselineEntropyFrontierKeys: Set<string>;
  baselineSoftCadenceFrontierKeys: Set<string>;
  strictEntropyFrontierKeys: Set<string>;
  strictSoftCadenceFrontierKeys: Set<string>;
  matchTypeFrontierKeys: Set<string>;
  cadenceAdmissibleKeys: Set<string>;
  combinedEntropyFrontierKeys: Set<string>;
  combinedSoftCadenceFrontierKeys: Set<string>;
  relationshipEntropyFrontierKeys: Set<string>;
  softCadenceFrontierKeys: Set<string>;
  strictCadenceAdmissibleKeys: Set<string>;
}

type PairCounts = Map<string, number>;
type RelationshipCounts = Record<(typeof RELATION_FACETS)[number], PairCounts>;
const staticBalanceCache = new Map<string, StaticBalanceFeasibilityReport>();

function seededRandom(initialSeed: number) {
  let value = Math.abs(Math.floor(initialSeed)) % 2_147_483_647;
  if (value === 0) value = 1;
  return () => {
    value = (value * 48_271) % 2_147_483_647;
    return value / 2_147_483_647;
  };
}

function seededExternalSchedule(seed: number, completedMatches: number): Array<0 | 1> {
  const random = seededRandom(seed ^ 0x6d2b79f5);
  return Array.from({ length: completedMatches }, () => (random() < 0.5 ? 0 : 1));
}

function createRoster(sessionType: SessionType, profile: BenchmarkProfile): BenchmarkPlayer[] {
  const latentRanks = Array.from({ length: PLAYER_COUNT }, (_value, index) => PLAYER_COUNT - index - 1);
  return latentRanks.map((rank, index) => {
    const isMale = index < 7;
    const strength = sessionType === SessionType.ELO
      ? 900 + rank * (profile === "wide" ? 40 : 4)
      : 10 + rank * (profile === "wide" ? 1 : 0.1);
    return {
      userId: `P${index + 1}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      restTurns: 0,
      strength,
      pointDiff: 0,
      gender: isMale ? PlayerGender.MALE : PlayerGender.FEMALE,
      partnerPreference: isMale ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: null,
      lastPartnerId: null,
      isBusy: false,
      isPaused: false,
      arrivalPriorityAt: null,
    };
  });
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join("|");
}

function exactCandidateKey(ids: readonly string[], partition: V3DoublesPartition) {
  const teamKey = (team: readonly string[]) => [...team].sort().join("+");
  return `${[...ids].sort().join("|")}::${[teamKey(partition.team1), teamKey(partition.team2)].sort().join("/")}`;
}

function relationshipKey(facet: (typeof RELATION_FACETS)[number], left: string, right: string) {
  return `${facet}:${pairKey(left, right)}`;
}

function getPartitionRelationships(partition: V3DoublesPartition): string[] {
  const teams = [partition.team1, partition.team2];
  const ids = [...partition.team1, ...partition.team2];
  const keys = new Set<string>();
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      keys.add(relationshipKey("courtmates", ids[left], ids[right]));
    }
  }
  for (const [teamIndex, team] of teams.entries()) {
    const otherTeam = teams[1 - teamIndex];
    keys.add(relationshipKey("partners", team[0], team[1]));
    for (const player of team) for (const opponent of otherTeam) {
      keys.add(relationshipKey("opponents", player, opponent));
    }
  }
  return [...keys];
}

function compareNumberVectors(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function getArrivalTimestamp(player: BenchmarkPlayer) {
  if (!player.arrivalPriorityAt) return null;
  const timestamp = player.arrivalPriorityAt instanceof Date
    ? player.arrivalPriorityAt.getTime()
    : new Date(player.arrivalPriorityAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getFairnessVector(selected: BenchmarkPlayer[]) {
  const counts = selected.map((player) => Math.max(player.matchesPlayed, player.matchmakingBaseline)).sort((a, b) => a - b);
  const arrival = selected.map(getArrivalTimestamp).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const result = [...counts, -arrival.length, ...arrival];
  while (result.length < selected.length * 2 + 1) result.push(Number.POSITIVE_INFINITY);
  return result;
}

function getStarvationVector(selected: BenchmarkPlayer[], available: BenchmarkPlayer[]) {
  const selectedIds = new Set(selected.map((player) => player.userId));
  const overdue = available.filter((player) => player.restTurns > IDEAL_REST_GAP);
  const leftOut = overdue.filter((player) => !selectedIds.has(player.userId));
  return [leftOut.length, leftOut.length ? Math.max(...leftOut.map((player) => player.restTurns)) : 0, leftOut.reduce((sum, player) => sum + player.restTurns, 0)];
}

function getCadenceVector(selected: BenchmarkPlayer[]) {
  const ascending = selected.map((player) => player.restTurns).sort((a, b) => a - b);
  return [ascending.filter((turns) => turns === 0).length, ...ascending.map((turns) => -turns)];
}

function getZeroRestCount(selected: BenchmarkPlayer[]) {
  return selected.filter((player) => player.restTurns === 0).length;
}

function getSoftRestVector(selected: BenchmarkPlayer[]) {
  return selected.map((player) => player.restTurns).sort((a, b) => a - b).map((turns) => -turns);
}

/** Historical entropy-first policy's rest tie: maximize total, then minimum, then the rest vector. */
export function getLegacySocialRestVectorForBenchmark(softRest: readonly number[]) {
  return [softRest.reduce((total, turns) => total + turns, 0), softRest[0] ?? 0, ...[...softRest].reverse()];
}

function getEffectiveEntropyGain(gain: number, sessionType: SessionType) {
  return sessionType === SessionType.SOCIAL_MIX ? gain : Math.round(gain * 1e12) / 1e12;
}

function canonicalSum(values: number[]) {
  return values.sort((a, b) => a - b).reduce((total, value) => total + value, 0);
}

type CoverageGateFacet = "courtmates" | "partners" | "opponents" | "matchType";
type BenchmarkCoverageGainMetric = "legacy-equal" | "social-horizon-321" | RollingCoverageGainMetric;
interface IndependentCoverageGain {
  numerator: bigint;
  denominator: bigint;
  normalized: number;
}

function getCompletedSocialMatchType(match: SocialHistoryMatch): "MIXED" | "OWN_SIDE" {
  const courtType = match.socialVariety?.courtType;
  if (courtType === "MIXED") return "MIXED";
  if (courtType === "UPPER" || courtType === "LOWER") return "OWN_SIDE";
  throw new Error(`Completed benchmark match ${match.id ?? "(unknown)"} has no completed match-type snapshot.`);
}

function greatestCommonDivisor(left: bigint, right: bigint) {
  const zero = BigInt(0);
  let a = left < zero ? -left : left;
  let b = right < zero ? -right : right;
  while (b !== zero) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left: bigint, right: bigint) {
  return left === BigInt(0) || right === BigInt(0)
    ? BigInt(0)
    : (left / greatestCommonDivisor(left, right)) * right;
}

type CompletedMatchType = "MIXED" | "OWN_SIDE";
type CompletedTypeHistory = Map<string, CompletedMatchType[]>;

function buildCompletedTypeHistory(completedHistory: readonly SocialHistoryMatch[]): CompletedTypeHistory {
  const completedTypesByPlayer: CompletedTypeHistory = new Map();
  for (const match of completedHistory) {
    const matchType = getCompletedSocialMatchType(match);
    for (const userId of [...match.team1, ...match.team2]) {
      let types = completedTypesByPlayer.get(userId);
      if (!types) {
        types = [];
        completedTypesByPlayer.set(userId, types);
      }
      types.push(matchType);
    }
  }
  return completedTypesByPlayer;
}

export interface SocialPriorityObjective {
  newCourtmatePairs: number;
  ascendingCoverageProfile: Array<{ userId: string; covered: number; possible: number }>;
  /** Exact common-denominator sum of each assigned player's signed rolling-six T change. */
  signedRollingTypeDelta: bigint;
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
}

export interface IndependentSocialPriorityAudit {
  complete: boolean;
  candidateCount: number;
  admittedCandidateCount: number;
  bestObjective: SocialPriorityObjective | null;
  selectedObjective: SocialPriorityObjective | null;
  selectedFairnessCertified: boolean;
  selectedStarvationCertified: boolean;
  courtmateGainMaximum: number | null;
  courtmateGainMaximumCertified: boolean;
  bestRollingMatchTypeGainAtGmax: bigint | null;
  bestGmaxChoices: IndependentCourtChoice[] | null;
  /** Strict courtmate-first winner over all Gmax choices; populated by the beneficial-rescue oracle. */
  strictBestGmaxChoices: IndependentCourtChoice[] | null;
  strictBestGmaxObjective: SocialPriorityObjective | null;
  bestAdmittedChoices: IndependentCourtChoice[] | null;
  rollingTypeDenominator: bigint;
}

export interface IndependentCourtChoice {
  ids: string[];
  partition: V3DoublesPartition;
  balanceGap: number;
  key: string;
  newCourtmatePairs: number;
}

interface IndependentCourtGroup {
  players: BenchmarkPlayer[];
  fairness: number[];
  starvation: number[];
  /** Each entry is one unordered two-court split. */
  divisions: Array<[IndependentCourtChoice[], IndependentCourtChoice[]]>;
}

function compareSocialPriorityObjectives(
  left: SocialPriorityObjective,
  right: SocialPriorityObjective,
  policy: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue" = "courtmate-first"
) {
  if (policy === "courtmate-first" && left.newCourtmatePairs !== right.newCourtmatePairs) {
    return right.newCourtmatePairs - left.newCourtmatePairs;
  }
  if (policy === "courtmate-near-best" && left.signedRollingTypeDelta !== right.signedRollingTypeDelta) {
    return left.signedRollingTypeDelta > right.signedRollingTypeDelta ? -1 : 1;
  }
  if (policy === "courtmate-beneficial-rescue") {
    if (left.signedRollingTypeDelta !== right.signedRollingTypeDelta) {
      return left.signedRollingTypeDelta > right.signedRollingTypeDelta ? -1 : 1;
    }
    if (left.newCourtmatePairs !== right.newCourtmatePairs) return right.newCourtmatePairs - left.newCourtmatePairs;
  }
  for (let index = 0; index < Math.max(left.ascendingCoverageProfile.length, right.ascendingCoverageProfile.length); index += 1) {
    const leftEntry = left.ascendingCoverageProfile[index];
    const rightEntry = right.ascendingCoverageProfile[index];
    if (!leftEntry || !rightEntry) return leftEntry ? -1 : rightEntry ? 1 : 0;
    const leftCross = BigInt(leftEntry.covered) * BigInt(rightEntry.possible);
    const rightCross = BigInt(rightEntry.covered) * BigInt(leftEntry.possible);
    if (leftCross !== rightCross) return leftCross > rightCross ? -1 : 1;
  }
  if ((policy === "courtmate-first" || policy === "courtmate-beneficial-rescue") &&
      left.signedRollingTypeDelta !== right.signedRollingTypeDelta) {
    return left.signedRollingTypeDelta > right.signedRollingTypeDelta ? -1 : 1;
  }
  if (left.immediateReplayCount !== right.immediateReplayCount) return left.immediateReplayCount - right.immediateReplayCount;
  const cadenceOrder = compareNumberVectors(left.softCadenceVector, right.softCadenceVector);
  if (cadenceOrder) return cadenceOrder;
  if (left.newPartnerPairs !== right.newPartnerPairs) return right.newPartnerPairs - left.newPartnerPairs;
  if (left.newOpponentPairs !== right.newOpponentPairs) return right.newOpponentPairs - left.newOpponentPairs;
  if (left.relationshipEntropyGain !== right.relationshipEntropyGain) return right.relationshipEntropyGain - left.relationshipEntropyGain;
  return left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
    left.sharedCourtEncounterFrequencyPenalty - right.sharedCourtEncounterFrequencyPenalty ||
    left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
    left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
    left.exactRematchPenalty - right.exactRematchPenalty ||
    left.maxBalanceGap - right.maxBalanceGap ||
    left.totalBalanceGap - right.totalBalanceGap;
}

/** Exact signed-unit guard used by the independent beneficial-rescue audit. */
export function isCourtmateBeneficialRescueAdmitted(
  gain: number,
  gMax: number | null,
  signedT: bigint,
  tMaxAtGmax: bigint | null
) {
  if (gMax === null) return false;
  return gain === gMax || (gain === gMax - 1 && tMaxAtGmax !== null && signedT > tMaxAtGmax);
}

function forEachCombination<T>(items: readonly T[], count: number, visit: (chosen: T[]) => void) {
  const chosen: T[] = [];
  const walk = (start: number) => {
    if (chosen.length === count) {
      visit([...chosen]);
      return;
    }
    const remaining = count - chosen.length;
    for (let index = start; index <= items.length - remaining; index += 1) {
      chosen.push(items[index]);
      walk(index + 1);
      chosen.pop();
    }
  };
  walk(0);
}

function completedRelationshipPairs(completedHistory: readonly SocialHistoryMatch[]) {
  const courtmates = new Set<string>();
  const courtmateEncounterCounts = new Map<string, number>();
  const partners = new Set<string>();
  const opponents = new Set<string>();
  const datedHistory = completedHistory.flatMap((match) => {
    const completedAt = (match as SocialHistoryMatch & { completedAt?: unknown }).completedAt;
    return completedAt instanceof Date ? [{ match, completedAt }] : [];
  }).sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());
  const partnerRepeatWeights = new Map<string, number>();
  const opponentRepeatWeights = new Map<string, number>();
  const exactRematchWeights = new Map<string, number>();
  for (const match of completedHistory) {
    for (const relationship of getPartitionRelationships(match)) {
      const [facet, key] = relationship.split(":", 2);
      if (facet === "courtmates") {
        courtmates.add(key);
        courtmateEncounterCounts.set(key, (courtmateEncounterCounts.get(key) ?? 0) + 1);
      }
      else if (facet === "partners") partners.add(key);
      else if (facet === "opponents") opponents.add(key);
    }
  }
  const datedPartnerHistory = datedHistory.slice(-8);
  for (const [index, { match }] of datedPartnerHistory.entries()) {
    const weight = 0.85 ** (datedPartnerHistory.length - index - 1);
    for (const team of [match.team1, match.team2]) {
      const key = pairKey(team[0], team[1]);
      partnerRepeatWeights.set(key, (partnerRepeatWeights.get(key) ?? 0) + weight);
    }
  }
  const datedOpponentHistory = datedHistory.slice(-8);
  for (const [index, { match }] of datedOpponentHistory.entries()) {
    const weight = 0.85 ** (datedOpponentHistory.length - index - 1);
    for (const left of match.team1) for (const right of match.team2) {
      const key = pairKey(left, right);
      opponentRepeatWeights.set(key, (opponentRepeatWeights.get(key) ?? 0) + weight);
    }
  }
  const exactMatchesByPartition = new Map<string, SocialHistoryMatch[]>();
  for (const { match } of datedHistory) {
    const teamKeys = [pairKey(match.team1[0], match.team1[1]), pairKey(match.team2[0], match.team2[1])]
      .sort();
    const key = teamKeys.join("||");
    const matches = exactMatchesByPartition.get(key) ?? [];
    matches.push(match);
    exactMatchesByPartition.set(key, matches);
  }
  for (const [key, matches] of exactMatchesByPartition) {
    const recent = matches.slice(-6);
    exactRematchWeights.set(key, recent.reduce((sum, _match, index) =>
      sum + 0.85 ** (recent.length - index - 1), 0));
  }
  return {
    courtmates, courtmateEncounterCounts, partners, opponents,
    partnerRepeatWeights, opponentRepeatWeights, exactRematchWeights,
  };
}

/**
 * Exhaustive audit for the experimental Social objective. It receives only
 * completed matches for history and uses the full roster context for structural
 * opportunities; reservations never contribute to this counterfactual.
 */
function auditCourtmatePrioritySelection(
  players: BenchmarkPlayer[],
  completedHistory: readonly SocialHistoryMatch[],
  selected: readonly { ids: string[]; partition: V3DoublesPartition }[],
  courtCount: 1 | 2,
  respectStarvation = true,
  policy: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue" = "courtmate-first"
): IndependentSocialPriorityAudit {
  const available = players.filter((player) => !player.isBusy && !player.isPaused);
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const quartetChoices = new Map<string, IndependentCourtChoice[]>();
  forEachCombination(available, 4, (quartet) => {
    const ids = quartet.map((player) => player.userId).sort((left, right) => left.localeCompare(right));
    for (const partition of getDoublesPartitions(ids as [string, string, string, string])) {
      if (!isMixedModeLegal(partition, playersById)) continue;
      const choice: IndependentCourtChoice = {
        ids,
        partition,
        balanceGap: independentBalanceGap(partition, playersById),
        key: exactCandidateKey(ids, partition),
        newCourtmatePairs: 0,
      };
      const list = quartetChoices.get(ids.join("|")) ?? [];
      list.push(choice);
      quartetChoices.set(ids.join("|"), list);
    }
  });

  const groups: IndependentCourtGroup[] = [];
  if (courtCount === 1) {
    for (const choices of quartetChoices.values()) {
      const chosenPlayers = choices[0].ids.map((id) => playersById.get(id)!);
      groups.push({
        players: chosenPlayers,
        fairness: getFairnessVector(chosenPlayers),
        starvation: getStarvationVector(chosenPlayers, available),
        divisions: [[choices, []]],
      });
    }
  } else {
    forEachCombination(available, 8, (rosterGroup) => {
      const sortedPlayers = [...rosterGroup].sort((left, right) => left.userId.localeCompare(right.userId));
      const rosterIds = sortedPlayers.map((player) => player.userId);
      const group: IndependentCourtGroup = {
        players: sortedPlayers,
        fairness: getFairnessVector(sortedPlayers),
        starvation: getStarvationVector(sortedPlayers, available),
        divisions: [],
      };
      const anchor = rosterIds[0];
      forEachCombination(rosterIds, 4, (firstCourt) => {
        if (!firstCourt.includes(anchor)) return;
        const firstKey = firstCourt.join("|");
        const firstSet = new Set(firstCourt);
        const secondCourt = rosterIds.filter((id) => !firstSet.has(id));
        const firstChoices = quartetChoices.get(firstKey);
        const secondChoices = quartetChoices.get(secondCourt.join("|"));
        if (firstChoices?.length && secondChoices?.length) {
          group.divisions.push([firstChoices, secondChoices]);
        }
      });
      if (group.divisions.length) groups.push(group);
    });
  }

  if (!groups.length) return {
    complete: true, candidateCount: 0, admittedCandidateCount: 0, bestObjective: null, selectedObjective: null,
    selectedFairnessCertified: false, selectedStarvationCertified: false, courtmateGainMaximum: null,
    courtmateGainMaximumCertified: false, bestRollingMatchTypeGainAtGmax: null, bestGmaxChoices: null,
    strictBestGmaxChoices: null, strictBestGmaxObjective: null,
    bestAdmittedChoices: null,
    rollingTypeDenominator: BigInt(1),
  };
  let bestFairness: number[] | null = null;
  let bestStarvation: number[] | null = null;
  for (const group of groups) {
    const fairnessOrder = bestFairness ? compareNumberVectors(group.fairness, bestFairness) : -1;
    if (fairnessOrder < 0 || (fairnessOrder === 0 && bestStarvation && compareNumberVectors(group.starvation, bestStarvation) < 0)) {
      bestFairness = group.fairness;
      bestStarvation = group.starvation;
    }
  }
  const strongestGroups = groups.filter((group) => bestFairness && bestStarvation &&
    compareNumberVectors(group.fairness, bestFairness) === 0 &&
    (!respectStarvation || compareNumberVectors(group.starvation, bestStarvation) === 0));
  const fullRosterContext = buildSocialVarietyContext(players, completedHistory, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  const completedPairs = completedRelationshipPairs(completedHistory);
  const completedTypesByPlayer = buildCompletedTypeHistory(completedHistory);
  let rollingTypeDenominator = BigInt(1);
  for (const playerContext of fullRosterContext.playersByUserId.values()) {
    const feasibleTypeCount = playerContext.matchType.opportunities.size;
    if (feasibleTypeCount > 0) rollingTypeDenominator = leastCommonMultiple(rollingTypeDenominator, BigInt(feasibleTypeCount));
  }
  const isStructurallyFeasiblePair = (facet: (typeof RELATION_FACETS)[number], left: string, right: string) => {
    const leftOpportunities = fullRosterContext.playersByUserId.get(left)?.[facet].opportunities;
    const rightOpportunities = fullRosterContext.playersByUserId.get(right)?.[facet].opportunities;
    return Boolean(leftOpportunities?.has(right) && rightOpportunities?.has(left));
  };
  const coveredCourtmatesByPlayer = new Map<string, Set<string>>();
  for (const [userId, history] of fullRosterContext.playersByUserId) {
    const covered = new Set<string>();
    for (const peer of history.courtmates.opportunities) {
      if ((history.courtmates.counts.get(peer) ?? 0) > 0) covered.add(peer);
    }
    coveredCourtmatesByPlayer.set(userId, covered);
  }
  for (const choices of quartetChoices.values()) {
    for (const choice of choices) {
      let newPairCount = 0;
      for (let left = 0; left < choice.ids.length; left += 1) {
        for (let right = left + 1; right < choice.ids.length; right += 1) {
          const first = choice.ids[left];
          const second = choice.ids[right];
          const key = pairKey(first, second);
          if (isStructurallyFeasiblePair("courtmates", first, second) && !completedPairs.courtmates.has(key)) {
            newPairCount += 1;
          }
        }
      }
      choice.newCourtmatePairs = newPairCount;
    }
  }
  let candidateCount = 0;
  let admittedCandidateCount = 0;
  let bestObjective: SocialPriorityObjective | null = null;
  let bestAdmittedChoices: IndependentCourtChoice[] | null = null;
  let courtmateGainMaximum: number | null = null;
  let bestRollingMatchTypeGainAtGmax: bigint | null = null;
  let bestGmaxObjective: SocialPriorityObjective | null = null;
  let bestGmaxChoices: IndependentCourtChoice[] | null = null;
  let strictBestGmaxObjective: SocialPriorityObjective | null = null;
  let strictBestGmaxChoices: IndependentCourtChoice[] | null = null;
  const scoreSelections = (choices: IndependentCourtChoice[]) => {
    const selectedIds = new Set(choices.flatMap((choice) => choice.ids));
    const selectedPlayers = [...selectedIds].map((id) => playersById.get(id)!);
    const candidateCourtPairs = new Set<string>();
    const candidatePartnerPairs = new Set<string>();
    const candidateOpponentPairs = new Set<string>();
    const recentTypesByPlayer = new Map<string, Array<CompletedMatchType | null>>();
    for (const choice of choices) {
      const ids = [...choice.partition.team1, ...choice.partition.team2];
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
          const key = pairKey(ids[left], ids[right]);
          if (isStructurallyFeasiblePair("courtmates", ids[left], ids[right]) && !completedPairs.courtmates.has(key)) {
            candidateCourtPairs.add(key);
          }
        }
      }
      const relationships = getPartitionRelationships(choice.partition);
      for (const relationship of relationships) {
        const [facet, key] = relationship.split(":", 2);
        const [left, right] = key.split("|");
        if (facet === "partners" && isStructurallyFeasiblePair("partners", left, right) && !completedPairs.partners.has(key)) {
          candidatePartnerPairs.add(key);
        }
        if (facet === "opponents" && isStructurallyFeasiblePair("opponents", left, right) && !completedPairs.opponents.has(key)) {
          candidateOpponentPairs.add(key);
        }
      }
      const type = getSocialVarietySnapshot(choice.partition, fullRosterContext).courtType;
      const matchType = type === "MIXED" ? "MIXED" : type === "UPPER" || type === "LOWER" ? "OWN_SIDE" : null;
      for (const id of ids) {
        const history = recentTypesByPlayer.get(id) ?? (completedTypesByPlayer.get(id) ?? []).slice(-6);
        recentTypesByPlayer.set(id, [...history, matchType]);
      }
    }

    const ascendingCoverageProfile = [...fullRosterContext.playersByUserId].flatMap(([userId, playerContext]) => {
      const feasiblePeers = playerContext.courtmates.opportunities;
      if (!feasiblePeers.size) return [];
      const covered = coveredCourtmatesByPlayer.get(userId) ?? new Set<string>();
      const additions = [...candidateCourtPairs].flatMap((key) => {
        const [left, right] = key.split("|");
        if (left === userId && feasiblePeers.has(right)) return [right];
        if (right === userId && feasiblePeers.has(left)) return [left];
        return [];
      });
      const after = new Set([...covered, ...additions]);
      return [{ userId, covered: Math.min(feasiblePeers.size, after.size), possible: feasiblePeers.size }];
    }).sort((left, right) => {
      const leftCross = BigInt(left.covered) * BigInt(right.possible);
      const rightCross = BigInt(right.covered) * BigInt(left.possible);
      return leftCross === rightCross ? left.userId.localeCompare(right.userId) : leftCross < rightCross ? -1 : 1;
    });
    let signedRollingTypeDelta = BigInt(0);
    for (const [userId, recentAfterCandidate] of recentTypesByPlayer) {
      const feasible = fullRosterContext.playersByUserId.get(userId)?.matchType.opportunities;
      if (!feasible?.size) continue;
      const recentBefore = (completedTypesByPlayer.get(userId) ?? []).slice(-6);
      const before = new Set(recentBefore.filter((type) => feasible.has(type)));
      const after = new Set(recentAfterCandidate.slice(-6).filter((type): type is CompletedMatchType => type !== null && feasible.has(type)));
      signedRollingTypeDelta += BigInt(after.size - before.size) *
        (rollingTypeDenominator / BigInt(feasible.size));
    }
    const relationshipGains = { courtmates: [] as number[], partners: [] as number[], opponents: [] as number[] };
    let sharedCourtRepeatPenalty = 0;
    let sharedCourtEncounterFrequencyPenalty = 0;
    let partnerRepeatPenalty = 0;
    let opponentRepeatPenalty = 0;
    let exactRematchPenalty = 0;
    const balanceGaps: number[] = [];
    for (const choice of choices) {
      balanceGaps.push(choice.balanceGap);
      const gains = getSocialVarietyGains(choice.partition, fullRosterContext);
      relationshipGains.courtmates.push(gains.courtmates);
      relationshipGains.partners.push(gains.partners);
      relationshipGains.opponents.push(gains.opponents);
      const relationships = getPartitionRelationships(choice.partition);
      for (const relationship of relationships) {
        const [facet, key] = relationship.split(":", 2);
        if (facet === "courtmates") {
          sharedCourtRepeatPenalty += Number(completedPairs.courtmates.has(key));
          sharedCourtEncounterFrequencyPenalty += completedPairs.courtmateEncounterCounts.get(key) ?? 0;
        }
      }
      for (const team of [choice.partition.team1, choice.partition.team2]) {
        partnerRepeatPenalty += completedPairs.partnerRepeatWeights.get(pairKey(team[0], team[1])) ?? 0;
      }
      for (const left of choice.partition.team1) for (const right of choice.partition.team2) {
        const repeatWeight = completedPairs.opponentRepeatWeights.get(pairKey(left, right)) ?? 0;
        opponentRepeatPenalty += repeatWeight * repeatWeight;
      }
      const exactKey = [pairKey(choice.partition.team1[0], choice.partition.team1[1]),
        pairKey(choice.partition.team2[0], choice.partition.team2[1])].sort().join("||");
      exactRematchPenalty += completedPairs.exactRematchWeights.get(exactKey) ?? 0;
    }
    const relationshipEntropyGain = canonicalSum([
      canonicalSum(relationshipGains.courtmates),
      canonicalSum(relationshipGains.partners),
      canonicalSum(relationshipGains.opponents),
    ]);
    return {
      newCourtmatePairs: candidateCourtPairs.size,
      ascendingCoverageProfile,
      signedRollingTypeDelta,
      immediateReplayCount: selectedPlayers.filter((player) => player.restTurns === 0).length,
      softCadenceVector: getSoftRestVector(selectedPlayers),
      newPartnerPairs: candidatePartnerPairs.size,
      newOpponentPairs: candidateOpponentPairs.size,
      relationshipEntropyGain,
      sharedCourtRepeatPenalty,
      sharedCourtEncounterFrequencyPenalty,
      partnerRepeatPenalty,
      opponentRepeatPenalty,
      exactRematchPenalty,
      maxBalanceGap: Math.max(0, ...balanceGaps),
      totalBalanceGap: canonicalSum(balanceGaps),
    } satisfies SocialPriorityObjective;
  };

  if (policy === "courtmate-near-best" || policy === "courtmate-beneficial-rescue") {
    // Gmax is computed independently from match-type scoring: each chosen
    // court contributes the six unordered pairs among its four players, less
    // structurally infeasible or already completed pairs.
    for (const group of strongestGroups) {
      for (const [firstChoices, secondChoices] of group.divisions) {
        if (courtCount === 1) {
          for (const first of firstChoices) {
            candidateCount += 1;
            courtmateGainMaximum = Math.max(courtmateGainMaximum ?? Number.NEGATIVE_INFINITY, first.newCourtmatePairs);
          }
          continue;
        }
        for (const first of firstChoices) for (const second of secondChoices) {
          candidateCount += 1;
          const gain = first.newCourtmatePairs + second.newCourtmatePairs;
          courtmateGainMaximum = Math.max(courtmateGainMaximum ?? Number.NEGATIVE_INFINITY, gain);
        }
      }
    }
  }

  if (policy === "courtmate-beneficial-rescue") {
    // This frontier pass independently finds both TmaxAtGmax and the strict
    // courtmate-first Gmax reference used only for the new policy diagnosis.
    for (const group of strongestGroups) {
      for (const [firstChoices, secondChoices] of group.divisions) {
        if (courtCount === 1) {
          for (const first of firstChoices) {
            if (first.newCourtmatePairs !== courtmateGainMaximum) continue;
            const objective = scoreSelections([first]);
            if (bestRollingMatchTypeGainAtGmax === null ||
                objective.signedRollingTypeDelta > bestRollingMatchTypeGainAtGmax) {
              bestRollingMatchTypeGainAtGmax = objective.signedRollingTypeDelta;
            }
            if (!bestGmaxObjective || compareSocialPriorityObjectives(
              objective, bestGmaxObjective, "courtmate-near-best"
            ) < 0) {
              bestGmaxObjective = objective;
              bestGmaxChoices = [first];
            }
            if (!strictBestGmaxObjective || compareSocialPriorityObjectives(
              objective, strictBestGmaxObjective, "courtmate-first"
            ) < 0) {
              strictBestGmaxObjective = objective;
              strictBestGmaxChoices = [first];
            }
          }
          continue;
        }
        for (const first of firstChoices) for (const second of secondChoices) {
          if (first.newCourtmatePairs + second.newCourtmatePairs !== courtmateGainMaximum) continue;
          const choices = [first, second];
          const objective = scoreSelections(choices);
          if (bestRollingMatchTypeGainAtGmax === null ||
              objective.signedRollingTypeDelta > bestRollingMatchTypeGainAtGmax) {
            bestRollingMatchTypeGainAtGmax = objective.signedRollingTypeDelta;
          }
          if (!bestGmaxObjective || compareSocialPriorityObjectives(
            objective, bestGmaxObjective, "courtmate-near-best"
          ) < 0) {
            bestGmaxObjective = objective;
            bestGmaxChoices = choices;
          }
          if (!strictBestGmaxObjective || compareSocialPriorityObjectives(
            objective, strictBestGmaxObjective, "courtmate-first"
          ) < 0) {
            strictBestGmaxObjective = objective;
            strictBestGmaxChoices = choices;
          }
        }
      }
    }
  }

  for (const group of strongestGroups) {
    for (const [firstChoices, secondChoices] of group.divisions) {
      if (courtCount === 1) {
        for (const first of firstChoices) {
          if (policy === "courtmate-first") candidateCount += 1;
          const gain = first.newCourtmatePairs;
          if (policy === "courtmate-near-best" && gain < (courtmateGainMaximum ?? 0) - 1) continue;
          const objective = scoreSelections([first]);
          if (policy === "courtmate-beneficial-rescue" && !isCourtmateBeneficialRescueAdmitted(
            gain, courtmateGainMaximum, objective.signedRollingTypeDelta, bestRollingMatchTypeGainAtGmax
          )) continue;
          admittedCandidateCount += 1;
          if (!bestObjective || compareSocialPriorityObjectives(objective, bestObjective, policy) < 0) {
            bestObjective = objective;
            bestAdmittedChoices = [first];
          }
          if (policy === "courtmate-near-best" && gain === courtmateGainMaximum &&
              (!bestGmaxObjective || compareSocialPriorityObjectives(objective, bestGmaxObjective, "courtmate-near-best") < 0)) {
            bestGmaxObjective = objective;
            bestGmaxChoices = [first];
            bestRollingMatchTypeGainAtGmax = objective.signedRollingTypeDelta;
          }
        }
        continue;
      }
      for (const first of firstChoices) for (const second of secondChoices) {
        if (policy === "courtmate-first") candidateCount += 1;
        const gain = first.newCourtmatePairs + second.newCourtmatePairs;
        if (policy === "courtmate-near-best" && gain < (courtmateGainMaximum ?? 0) - 1) continue;
        const objective = scoreSelections([first, second]);
        if (policy === "courtmate-beneficial-rescue" && !isCourtmateBeneficialRescueAdmitted(
          gain, courtmateGainMaximum, objective.signedRollingTypeDelta, bestRollingMatchTypeGainAtGmax
        )) continue;
        admittedCandidateCount += 1;
        if (!bestObjective || compareSocialPriorityObjectives(objective, bestObjective, policy) < 0) {
          bestObjective = objective;
          bestAdmittedChoices = [first, second];
        }
        if (policy === "courtmate-near-best" && gain === courtmateGainMaximum &&
            (!bestGmaxObjective || compareSocialPriorityObjectives(objective, bestGmaxObjective, "courtmate-near-best") < 0)) {
          bestGmaxObjective = objective;
          bestGmaxChoices = [first, second];
          bestRollingMatchTypeGainAtGmax = objective.signedRollingTypeDelta;
        }
      }
    }
  }

  const selectedChoices = selected.flatMap((selection) => {
    const key = [...selection.ids].sort((left, right) => left.localeCompare(right)).join("|");
    return quartetChoices.get(key)?.filter((choice) => exactCandidateKey(selection.ids, selection.partition) === choice.key) ?? [];
  });
  const selectedObjective = selectedChoices.length === courtCount ? scoreSelections(selectedChoices) : null;
  const selectedPlayers = selected.flatMap((selection) => selection.ids).map((id) => playersById.get(id)!).filter(Boolean);
  const selectedFairness = getFairnessVector(selectedPlayers);
  const selectedStarvation = getStarvationVector(selectedPlayers, available);
  return {
    complete: true,
    candidateCount,
    admittedCandidateCount,
    bestObjective,
    selectedObjective,
    selectedFairnessCertified: Boolean(bestFairness && compareNumberVectors(selectedFairness, bestFairness) === 0),
    selectedStarvationCertified: !respectStarvation || Boolean(bestFairness && bestStarvation &&
      compareNumberVectors(selectedFairness, bestFairness) === 0 &&
      compareNumberVectors(selectedStarvation, bestStarvation) === 0),
    courtmateGainMaximum,
    courtmateGainMaximumCertified: (policy === "courtmate-near-best" || policy === "courtmate-beneficial-rescue") &&
      courtmateGainMaximum !== null && candidateCount > 0,
    bestRollingMatchTypeGainAtGmax,
    bestGmaxChoices,
    strictBestGmaxChoices,
    strictBestGmaxObjective,
    bestAdmittedChoices,
    rollingTypeDenominator,
  };
}

function getRescueTypeWindowWitness(
  choices: readonly IndependentCourtChoice[],
  completedHistory: readonly SocialHistoryMatch[],
  context: ReturnType<typeof buildSocialVarietyContext>
): { players: SocialCourtmateRescueTypeWindowWitness[]; fullTypePlayerCount: number } {
  const completedTypesByPlayer = buildCompletedTypeHistory(completedHistory);
  const appendedTypeByPlayer = new Map<string, CompletedMatchType>();
  for (const choice of choices) {
    const courtType = getSocialVarietySnapshot(choice.partition, context).courtType;
    const matchType = courtType === "MIXED" ? "MIXED" : courtType === "UPPER" || courtType === "LOWER" ? "OWN_SIDE" : null;
    if (matchType) for (const id of choice.ids) appendedTypeByPlayer.set(id, matchType);
  }
  const players: SocialCourtmateRescueTypeWindowWitness[] = [];
  let fullTypePlayerCount = 0;
  for (const [userId, playerContext] of context.playersByUserId) {
    const feasibleTypes = (["MIXED", "OWN_SIDE"] as const).filter((type) => playerContext.matchType.opportunities.has(type));
    if (!feasibleTypes.length) continue;
    const recentTypesBefore = (completedTypesByPlayer.get(userId) ?? []).slice(-6);
    const appended = appendedTypeByPlayer.get(userId);
    const recentTypesAfter = (appended ? [...recentTypesBefore, appended] : recentTypesBefore).slice(-6);
    const coveredBefore = new Set(recentTypesBefore.filter((type) => feasibleTypes.includes(type))).size;
    const coveredAfter = new Set(recentTypesAfter.filter((type): type is CompletedMatchType =>
      type !== null && feasibleTypes.includes(type)
    )).size;
    const missingTypesBefore = feasibleTypes.filter((type) => !recentTypesBefore.includes(type));
    const missingTypesAfter = feasibleTypes.filter((type) => !recentTypesAfter.includes(type));
    const restoredTypes = missingTypesBefore.filter((type) => !missingTypesAfter.includes(type));
    const expiredTypes = missingTypesAfter.filter((type) => !missingTypesBefore.includes(type));
    const beforeT = coveredBefore / feasibleTypes.length;
    const afterT = coveredAfter / feasibleTypes.length;
    if (afterT === 1) fullTypePlayerCount += 1;
    players.push({
      userId,
      feasibleTypes: [...feasibleTypes],
      recentTypesBefore,
      recentTypesAfter,
      beforeT,
      afterT,
      deltaT: afterT - beforeT,
      missingTypesBefore,
      missingTypesAfter,
      restoredTypes,
      expiredTypes,
    });
  }
  return { players, fullTypePlayerCount };
}

/**
 * Independent exhaustive oracle for this benchmark's SOCIAL_MIX roster and
 * event model. It uses completed-only history and the currently available
 * roster, and certifies the modeled fairness/starvation classes; it does not
 * claim coverage of arbitrary production calendar or schedule constraints.
 */
export function auditSocialCourtmateNearBestSelection(
  players: BenchmarkPlayer[],
  completedHistory: readonly SocialHistoryMatch[],
  selected: readonly { ids: string[]; partition: V3DoublesPartition }[],
  courtCount: 1 | 2,
  respectStarvation = true
): IndependentSocialPriorityAudit {
  return auditCourtmatePrioritySelection(players, completedHistory, selected, courtCount, respectStarvation, "courtmate-near-best");
}

/**
 * Independent exhaustive oracle for the benchmark's beneficial-rescue policy.
 * This certifies the benchmark's fairness/starvation class and unconstrained
 * Social search only; it does not certify arbitrary production schedules.
 */
export function auditSocialCourtmateBeneficialRescueSelection(
  players: BenchmarkPlayer[],
  completedHistory: readonly SocialHistoryMatch[],
  selected: readonly { ids: string[]; partition: V3DoublesPartition }[],
  courtCount: 1 | 2,
  respectStarvation = true
): IndependentSocialPriorityAudit {
  return auditCourtmatePrioritySelection(
    players, completedHistory, selected, courtCount, respectStarvation, "courtmate-beneficial-rescue"
  );
}

/**
 * Independent signed rolling-type oracle. Relationship exposures use the
 * accumulated structural context, while type windows are rebuilt only from
 * the explicit completed history supplied by the simulation.
 */
function getIndependentRollingCoverageGain(
  partition: V3DoublesPartition,
  context: ReturnType<typeof buildSocialVarietyContext>,
  completedHistory: readonly SocialHistoryMatch[],
  coverageGainMetric: RollingCoverageGainMetric,
  completedTypesByPlayer: CompletedTypeHistory = buildCompletedTypeHistory(completedHistory),
  typeContext: ReturnType<typeof buildSocialVarietyContext> = context
): IndependentCoverageGain {
  const relationshipFacets = ["courtmates", "partners", "opponents"] as const;
  type RelationshipFacet = typeof relationshipFacets[number];
  type Facet = RelationshipFacet | "matchType";
  const horizonCaps: Record<RelationshipFacet, number> = { courtmates: 13, opponents: 12, partners: 6 };
  const horizonWeights: Record<RelationshipFacet, number> = { courtmates: 3, opponents: 2, partners: 1 };
  const weightedHorizon = coverageGainMetric === "social-horizon-3211";
  const players = [...context.playersByUserId].map(([userId, histograms]) => {
    const feasibleMatchTypes = [...(typeContext.playersByUserId.get(userId)?.matchType.opportunities ?? [])];
    const feasibleFacets: Facet[] = relationshipFacets.flatMap((facet) =>
      histograms[facet].opportunities.size > 0 ? [facet] : []
    );
    if (feasibleMatchTypes.length > 0) feasibleFacets.push("matchType");
    const activeWeight = feasibleFacets.reduce((sum, facet) =>
      sum + (weightedHorizon && facet !== "matchType" ? horizonWeights[facet] : 1), 0
    );
    return { userId, feasibleFacets, feasibleMatchTypes, activeWeight };
  }).filter((player) => player.activeWeight > 0);
  const eligiblePlayerCount = players.length;
  const denominatorByFacet = new Map<string, bigint>();
  let denominator = BigInt(1);
  for (const player of players) {
    const histograms = context.playersByUserId.get(player.userId)!;
    for (const facet of player.feasibleFacets) {
      const opportunities = facet === "matchType"
        ? player.feasibleMatchTypes.length
        : weightedHorizon
          ? Math.min(histograms[facet].opportunities.size, horizonCaps[facet])
          : histograms[facet].opportunities.size;
      const activeFacetWeight = weightedHorizon ? player.activeWeight : player.feasibleFacets.length;
      const facetDenominator = BigInt(eligiblePlayerCount) * BigInt(activeFacetWeight) * BigInt(opportunities);
      denominatorByFacet.set(`${player.userId}:${facet}`, facetDenominator);
      denominator = leastCommonMultiple(denominator, facetDenominator);
    }
  }

  const candidateExposures = new Map<string, Map<RelationshipFacet, Set<string>>>();
  const addRelationship = (userId: string, facet: RelationshipFacet, peerId: string) => {
    let facets = candidateExposures.get(userId);
    if (!facets) {
      facets = new Map();
      candidateExposures.set(userId, facets);
    }
    let peers = facets.get(facet);
    if (!peers) {
      peers = new Set();
      facets.set(facet, peers);
    }
    peers.add(peerId);
  };
  const teams = [partition.team1, partition.team2] as const;
  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const ownTeam = teams[teamIndex];
    const opposingTeam = teams[1 - teamIndex];
    for (const userId of ownTeam) {
      const partnerId = ownTeam.find((peerId) => peerId !== userId)!;
      addRelationship(userId, "partners", partnerId);
      addRelationship(userId, "courtmates", partnerId);
      for (const opponentId of opposingTeam) {
        addRelationship(userId, "opponents", opponentId);
        addRelationship(userId, "courtmates", opponentId);
      }
    }
  }

  const candidateCourtType = getSocialVarietySnapshot(partition, typeContext).courtType;
  const candidateMatchType = candidateCourtType === "MIXED"
    ? "MIXED"
    : candidateCourtType === "UPPER" || candidateCourtType === "LOWER" ? "OWN_SIDE" : null;
  const typeDeltaByPlayer = new Map<string, number>();
  if (candidateMatchType) {
    for (const player of players) {
      if (!partition.team1.includes(player.userId) && !partition.team2.includes(player.userId)) continue;
      if (!player.feasibleMatchTypes.includes(candidateMatchType)) continue;
      const recent = (completedTypesByPlayer.get(player.userId) ?? []).slice(-6);
      const coveredBefore = new Set(recent.filter((type) => player.feasibleMatchTypes.includes(type))).size;
      const coveredAfter = new Set([...recent, candidateMatchType].slice(-6)
        .filter((type) => player.feasibleMatchTypes.includes(type))).size;
      typeDeltaByPlayer.set(player.userId, coveredAfter - coveredBefore);
    }
  }

  let numerator = BigInt(0);
  for (const player of players) {
    const histograms = context.playersByUserId.get(player.userId)!;
    for (const facet of player.feasibleFacets) {
      const facetDenominator = denominatorByFacet.get(`${player.userId}:${facet}`)!;
      const weight = weightedHorizon && facet !== "matchType" ? horizonWeights[facet] : 1;
      const unitsPerExposure = BigInt(weight) * (denominator / facetDenominator);
      if (facet === "matchType") {
        numerator += BigInt(typeDeltaByPlayer.get(player.userId) ?? 0) * unitsPerExposure;
        continue;
      }
      const opportunities = histograms[facet].opportunities;
      const newPeers = [...(candidateExposures.get(player.userId)?.get(facet) ?? [])]
        .filter((peerId) => opportunities.has(peerId) && (histograms[facet].counts.get(peerId) ?? 0) === 0);
      const facetCapacity = weightedHorizon
        ? Math.max(0, Math.min(opportunities.size, horizonCaps[facet]) -
          [...opportunities].filter((peerId) => (histograms[facet].counts.get(peerId) ?? 0) > 0).length)
        : newPeers.length;
      numerator += BigInt(Math.min(newPeers.length, facetCapacity)) * unitsPerExposure;
    }
  }
  const normalized = denominator > BigInt(0)
    ? Number((numerator * BigInt(1_000_000_000_000_000)) / denominator) / 1_000_000_000_000_000
    : 0;
  return { numerator, denominator, normalized };
}

/**
 * Recomputes the coverage gate independently from the candidate-selection
 * policy. The opportunity vocabulary and accumulated first-exposure counts
 * come from Social's shared structural context, while partition exposures,
 * rational weights and frontier comparison are computed here.
 */
function getIndependentImmediateCoverageGain(
  partition: V3DoublesPartition,
  context: ReturnType<typeof buildSocialVarietyContext>,
  coverageGainMetric: BenchmarkCoverageGainMetric = "legacy-equal",
  completedHistory: readonly SocialHistoryMatch[] = [],
  completedTypesByPlayer?: CompletedTypeHistory,
  rollingTypeContext: ReturnType<typeof buildSocialVarietyContext> = context
): IndependentCoverageGain {
  if (coverageGainMetric === "rolling-equal" || coverageGainMetric === "social-horizon-3211") {
    return getIndependentRollingCoverageGain(partition, context, completedHistory, coverageGainMetric, completedTypesByPlayer, rollingTypeContext);
  }
  if (coverageGainMetric === "social-horizon-321") {
    const horizonFacets = ["courtmates", "opponents", "partners"] as const;
    type HorizonFacet = typeof horizonFacets[number];
    const caps: Record<HorizonFacet, number> = { courtmates: 13, opponents: 12, partners: 6 };
    const facetWeights: Record<HorizonFacet, number> = { courtmates: 3, opponents: 2, partners: 1 };
    const eligiblePlayers = [...context.playersByUserId].map(([userId, histograms]) => {
      const facets = horizonFacets.flatMap((facet) => {
        const denominator = Math.min(histograms[facet].opportunities.size, caps[facet]);
        return denominator > 0 ? [{ facet, denominator }] : [];
      });
      return {
        userId,
        facets,
        activeWeight: facets.reduce((sum, item) => sum + facetWeights[item.facet], 0),
      };
    }).filter((player) => player.activeWeight > 0);
    const eligibleCount = eligiblePlayers.length;
    const terms = eligiblePlayers.flatMap((player) => player.facets.map((item) =>
      BigInt(eligibleCount) * BigInt(player.activeWeight) * BigInt(item.denominator)
    ));
    const denominator = terms.reduce(leastCommonMultiple, BigInt(1));
    const weights = new Map<string, Map<HorizonFacet, bigint>>();
    const remaining = new Map<string, Map<HorizonFacet, number>>();
    for (const player of eligiblePlayers) {
      const playerWeights = new Map<HorizonFacet, bigint>();
      const playerRemaining = new Map<HorizonFacet, number>();
      const histograms = context.playersByUserId.get(player.userId)!;
      for (const item of player.facets) {
        const term = BigInt(eligibleCount) * BigInt(player.activeWeight) * BigInt(item.denominator);
        playerWeights.set(item.facet, BigInt(facetWeights[item.facet]) * (denominator / term));
        let covered = 0;
        for (const peer of histograms[item.facet].opportunities) {
          if ((histograms[item.facet].counts.get(peer) ?? 0) > 0) covered += 1;
        }
        playerRemaining.set(item.facet, Math.max(0, item.denominator - covered));
      }
      weights.set(player.userId, playerWeights);
      remaining.set(player.userId, playerRemaining);
    }
    const exposuresByPlayerFacet = new Map<string, Set<string>>();
    const addRelationship = (userId: string, facet: HorizonFacet, experience: string) => {
      const key = JSON.stringify([userId, facet]);
      let experiences = exposuresByPlayerFacet.get(key);
      if (!experiences) {
        experiences = new Set<string>();
        exposuresByPlayerFacet.set(key, experiences);
      }
      experiences.add(experience);
    };
    const teams = [partition.team1, partition.team2] as const;
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
      const ownTeam = teams[teamIndex];
      const opposingTeam = teams[1 - teamIndex];
      for (const userId of ownTeam) {
        const partnerId = ownTeam.find((peerId) => peerId !== userId)!;
        addRelationship(userId, "partners", partnerId);
        addRelationship(userId, "courtmates", partnerId);
        for (const opponentId of opposingTeam) {
          addRelationship(userId, "opponents", opponentId);
          addRelationship(userId, "courtmates", opponentId);
        }
      }
    }
    let numerator = BigInt(0);
    for (const [playerFacet, experiences] of exposuresByPlayerFacet) {
      const [userId, facet] = JSON.parse(playerFacet) as [string, HorizonFacet];
      const histogram = context.playersByUserId.get(userId)?.[facet];
      if (!histogram) continue;
      const availableExperiences = [...experiences].sort((left, right) => left.localeCompare(right))
        .filter((experience) => histogram.opportunities.has(experience) && (histogram.counts.get(experience) ?? 0) === 0);
      const capacity = remaining.get(userId)?.get(facet) ?? 0;
      const firstExposures = Math.min(availableExperiences.length, capacity);
      const weight = weights.get(userId)?.get(facet) ?? BigInt(0);
      numerator += BigInt(firstExposures) * weight;
    }
    const scale = BigInt(1_000_000_000_000_000);
    const normalized = denominator > BigInt(0)
      ? Number((numerator * scale) / denominator) / Number(scale)
      : 0;
    return { numerator, denominator, normalized };
  }

  const activeFacets: CoverageGateFacet[] = context.sessionMode === SessionMode.MIXICANO
    ? ["courtmates", "partners", "opponents", "matchType"]
    : ["courtmates", "partners", "opponents"];
  const players = [...context.playersByUserId].map(([userId, histograms]) => ({
    userId,
    feasible: activeFacets.filter((facet) => histograms[facet].opportunities.size > 0),
  }));
  const eligibleCount = players.filter((player) => player.feasible.length > 0).length;
  const facetDenominators = new Map<string, bigint>();
  let denominator = BigInt(1);
  for (const player of players) {
    if (!player.feasible.length) continue;
    const histograms = context.playersByUserId.get(player.userId)!;
    for (const facet of player.feasible) {
      const facetDenominator = BigInt(eligibleCount) * BigInt(player.feasible.length) * BigInt(histograms[facet].opportunities.size);
      facetDenominators.set(`${player.userId}:${facet}`, facetDenominator);
      denominator = leastCommonMultiple(denominator, facetDenominator);
    }
  }
  const weights = new Map<string, bigint>();
  for (const [key, facetDenominator] of facetDenominators) weights.set(key, denominator / facetDenominator);

  const firstExposures = new Set<string>();
  const add = (userId: string, facet: CoverageGateFacet, experience: string) => {
    firstExposures.add(JSON.stringify([userId, facet, experience]));
  };
  const teams = [partition.team1, partition.team2];
  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const ownTeam = teams[teamIndex];
    const otherTeam = teams[1 - teamIndex];
    for (let seat = 0; seat < ownTeam.length; seat += 1) {
      const userId = ownTeam[seat];
      const partnerId = ownTeam[1 - seat];
      add(userId, "courtmates", partnerId);
      add(userId, "partners", partnerId);
      for (const opponentId of otherTeam) {
        add(userId, "courtmates", opponentId);
        add(userId, "opponents", opponentId);
      }
    }
  }
  if (context.sessionMode === SessionMode.MIXICANO) {
    const courtType = getSocialVarietySnapshot(partition, context).courtType;
    const matchType = courtType === "MIXED" ? "MIXED" : "OWN_SIDE";
    for (const userId of [...partition.team1, ...partition.team2]) add(userId, "matchType", matchType);
  }

  let numerator = BigInt(0);
  for (const serialized of firstExposures) {
    const [userId, facet, experience] = JSON.parse(serialized) as [string, CoverageGateFacet, string];
    const histogram = context.playersByUserId.get(userId)?.[facet];
    if (!histogram?.opportunities.has(experience) || (histogram.counts.get(experience) ?? 0) > 0) continue;
    numerator += weights.get(`${userId}:${facet}`) ?? BigInt(0);
  }
  // The score is bounded by one; division is only for serialized diagnostics.
  const normalized = denominator > BigInt(0)
    ? Number((numerator * BigInt(1_000_000_000_000_000)) / denominator) / 1_000_000_000_000_000
    : 0;
  return { numerator, denominator, normalized };
}

export function measureIndependentCoverageGainForBenchmark(
  partition: V3DoublesPartition,
  players: readonly MatchmakerV3Player[],
  history: readonly SocialHistoryMatch[],
  coverageGainMetric: BenchmarkCoverageGainMetric = "legacy-equal",
  completedHistory: readonly SocialHistoryMatch[] = history
) {
  const context = buildSocialVarietyContext(players, history, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: coverageGainMetric === "social-horizon-321" || coverageGainMetric === "social-horizon-3211",
  });
  const rollingTypeContext = coverageGainMetric === "rolling-equal"
    ? buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO, includePausedPlayers: true })
    : context;
  const result = getIndependentImmediateCoverageGain(
    partition,
    context,
    coverageGainMetric,
    completedHistory,
    undefined,
    rollingTypeContext
  );
  return {
    numerator: result.numerator.toString(),
    denominator: result.denominator.toString(),
    normalized: result.normalized,
  };
}

export function getReplayCoverageZeroDiagnostics(
  minimumFrontierGainUnits: bigint | null,
  chosenGainUnits: bigint | null
) {
  const minimumFrontierIsZero = minimumFrontierGainUnits === BigInt(0);
  const chosenGainIsZero = chosenGainUnits === BigInt(0);
  return {
    minimumFrontierIsZero,
    chosenGainIsZero,
    minimumFrontierAndChosenGainAreZero: minimumFrontierIsZero && chosenGainIsZero,
  };
}

function compareCoverageUnits(left: OracleCandidate, right: OracleCandidate) {
  if (left.immediateCoverageGainNumerator !== right.immediateCoverageGainNumerator) {
    return left.immediateCoverageGainNumerator < right.immediateCoverageGainNumerator ? -1 : 1;
  }
  return 0;
}

export interface TypePriorityCandidateSummary {
  ids: string[];
  partition: V3DoublesPartition;
  zeroRestCount: number;
  effectiveMatchTypeGain: number;
  effectiveRelationshipGain: number;
  softRest: number[];
}

/** Selects a witness from the same stronger class/envelope supplied by the caller. */
export function findLowerZeroTypeGainCompetitor<T extends TypePriorityCandidateSummary>(
  selected: T,
  candidates: readonly T[]
): T | null {
  return [...candidates]
    .filter((candidate) => candidate.zeroRestCount < selected.zeroRestCount &&
      candidate.effectiveMatchTypeGain < selected.effectiveMatchTypeGain)
    .sort((left, right) => right.effectiveMatchTypeGain - left.effectiveMatchTypeGain ||
      right.effectiveRelationshipGain - left.effectiveRelationshipGain ||
      compareNumberVectors(left.softRest, right.softRest) ||
      exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
}

function isMixedModeLegal(partition: V3DoublesPartition, playersById: Map<string, BenchmarkPlayer>) {
  const ids = [...partition.team1, ...partition.team2];
  const sides = ids.map((id) => getEffectiveMixedSide(playersById.get(id)!));
  if (sides.some((side) => side === null)) return false;
  if (sides.every((side) => side === MixedSide.UPPER) || sides.every((side) => side === MixedSide.LOWER)) return true;
  const team1 = partition.team1.map((id) => getEffectiveMixedSide(playersById.get(id)!));
  const team2 = partition.team2.map((id) => getEffectiveMixedSide(playersById.get(id)!));
  return team1.includes(MixedSide.UPPER) && team1.includes(MixedSide.LOWER) && team2.includes(MixedSide.UPPER) && team2.includes(MixedSide.LOWER);
}

function independentBalanceGap(partition: V3DoublesPartition, playersById: Map<string, BenchmarkPlayer>) {
  const [a, b, c, d] = [...partition.team1, ...partition.team2].map((id) => playersById.get(id)!);
  return Math.abs((a.strength + b.strength) / 2 - (c.strength + d.strength) / 2);
}

function getOverduePlayerCount(available: BenchmarkPlayer[]) {
  return available.filter((player) => player.restTurns > IDEAL_REST_GAP).length;
}

/** Independent one-court oracle: enumerate each stronger class before entropy/cadence frontiers. */
function auditRotationClass(
  players: BenchmarkPlayer[],
  sessionType: SessionType,
  socialHistory: SocialHistoryMatch[],
  completedHistory: readonly SocialHistoryMatch[],
  respectStarvation = true,
  coverageGainMetric: BenchmarkCoverageGainMetric = "legacy-equal"
): RotationAudit {
  const available = players.filter((player) => !player.isBusy && !player.isPaused);
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const candidates: OracleCandidate[] = [];
  for (let a = 0; a < available.length - 3; a += 1) {
    for (let b = a + 1; b < available.length - 2; b += 1) {
      for (let c = b + 1; c < available.length - 1; c += 1) {
        for (let d = c + 1; d < available.length; d += 1) {
          const quartet = [available[a], available[b], available[c], available[d]];
          const ids = quartet.map((player) => player.userId) as [string, string, string, string];
          for (const partition of getDoublesPartitions(ids)) {
            if (!isMixedModeLegal(partition, playersById)) continue;
            candidates.push({
              ids: [...ids],
              partition,
              fairness: getFairnessVector(quartet),
              starvation: getStarvationVector(quartet, available),
              zeroRestCount: getZeroRestCount(quartet),
              softRest: getSoftRestVector(quartet),
              rest: getCadenceVector(quartet),
              rawMatchTypeGain: 0,
              effectiveMatchTypeGain: 0,
              rawRelationshipGain: 0,
              effectiveRelationshipGain: 0,
              rawCombinedEntropyGain: 0,
              effectiveCombinedEntropyGain: 0,
              immediateCoverageGain: 0,
              immediateCoverageGainNumerator: BigInt(0),
              immediateCoverageGainDenominator: BigInt(1),
              balanceGap: independentBalanceGap(partition, playersById),
            });
          }
        }
      }
    }
  }
  if (!candidates.length) return {
    legalCandidates: [], fairnessClass: [], rotationClass: [], balanceEnvelope: [], replayMinimum: [], replayCoverageFrontier: [], replayAllowance: [], legacyReplayAllowance: [], legacyCombinedEntropyFrontier: [], legacyCombinedSoftCadenceFrontier: [], baselineEntropyFrontier: [], baselineSoftCadenceFrontier: [], strictEntropyFrontier: [], strictSoftCadenceFrontier: [], matchTypeFrontier: [], cadenceAdmissible: [], combinedEntropyFrontier: [], combinedSoftCadenceFrontier: [], relationshipEntropyFrontier: [], softCadenceFrontier: [], strictCadenceAdmissible: [], bestMatchTypeGain: null, bestZeroRestCount: null, allowedZeroRestCount: null, bestMinimumReplayCoverageGain: null, bestMinimumReplayCoverageGainNumerator: null, bestCombinedEntropyGain: null, bestRelationshipGain: null, bestSoftRestVector: null, bestCadenceVector: null,
    fairnessClassIds: new Set(), rotationClassIds: new Set(), balanceEnvelopeIds: new Set(), replayMinimumIds: new Set(), replayCoverageFrontierIds: new Set(), replayAllowanceIds: new Set(), legacyReplayAllowanceIds: new Set(), legacyCombinedEntropyFrontierIds: new Set(), legacyCombinedSoftCadenceFrontierIds: new Set(), matchTypeFrontierIds: new Set(), cadenceAdmissibleIds: new Set(), combinedEntropyFrontierIds: new Set(), combinedSoftCadenceFrontierIds: new Set(), relationshipEntropyFrontierIds: new Set(), softCadenceFrontierIds: new Set(), legalCandidateIds: new Set(),
    strictCadenceAdmissibleKeys: new Set(),
    fairnessClassKeys: new Set(), rotationClassKeys: new Set(), balanceEnvelopeKeys: new Set(), replayMinimumKeys: new Set(), replayCoverageFrontierKeys: new Set(), replayAllowanceKeys: new Set(), legacyReplayAllowanceKeys: new Set(), legacyCombinedEntropyFrontierKeys: new Set(), legacyCombinedSoftCadenceFrontierKeys: new Set(), baselineEntropyFrontierKeys: new Set(), baselineSoftCadenceFrontierKeys: new Set(), strictEntropyFrontierKeys: new Set(), strictSoftCadenceFrontierKeys: new Set(), matchTypeFrontierKeys: new Set(), cadenceAdmissibleKeys: new Set(), combinedEntropyFrontierKeys: new Set(), combinedSoftCadenceFrontierKeys: new Set(), relationshipEntropyFrontierKeys: new Set(), softCadenceFrontierKeys: new Set(),
  };
  const bestFairness = candidates.reduce((best, candidate) => compareNumberVectors(candidate.fairness, best) < 0 ? candidate.fairness : best, candidates[0].fairness);
  const fairnessClass = candidates.filter((candidate) => compareNumberVectors(candidate.fairness, bestFairness) === 0);
  const bestStarvation = fairnessClass.reduce((best, candidate) => compareNumberVectors(candidate.starvation, best) < 0 ? candidate.starvation : best, fairnessClass[0].starvation);
  const starvationClass = fairnessClass.filter((candidate) => compareNumberVectors(candidate.starvation, bestStarvation) === 0);
  // The counterfactual must be audited against its own strongest class: when
  // starvation is suppressed, fairness/arrival is followed directly by the
  // format's balance envelope.
  const rotationClass = respectStarvation ? starvationClass : fairnessClass;
  let balanceEnvelope = rotationClass;
  if (sessionType === SessionType.POINTS || sessionType === SessionType.ELO) {
    const bestBalance = Math.min(...rotationClass.map((candidate) => candidate.balanceGap));
    const policy = sessionType === SessionType.ELO
      ? { mode: "RATING" as const, nearBestWindow: 30, absoluteCeiling: 50 }
      : { mode: "POINTS" as const, nearBestWindow: 1.5, absoluteCeiling: null };
    const guardrail = buildBalanceGuardrail(policy, { maxBalanceGap: bestBalance, totalBalanceGap: bestBalance });
    balanceEnvelope = rotationClass.filter((candidate) => candidate.balanceGap <= guardrail.allowedMaxBalanceGap &&
      (guardrail.allowedTotalBalanceGap === null || candidate.balanceGap <= guardrail.allowedTotalBalanceGap));
  }
  const context = buildSocialVarietyContext(players, socialHistory, {
    sessionMode: SessionMode.MIXICANO,
  });
  const coverageContext = coverageGainMetric === "social-horizon-321" || coverageGainMetric === "social-horizon-3211"
    ? buildSocialVarietyContext(players, socialHistory, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    })
    : context;
  const rollingTypeContext = coverageGainMetric === "rolling-equal"
    ? buildSocialVarietyContext(players, socialHistory, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    })
    : coverageContext;
  const completedTypesByPlayer = coverageGainMetric === "rolling-equal" || coverageGainMetric === "social-horizon-3211"
    ? buildCompletedTypeHistory(completedHistory)
    : undefined;
  for (const candidate of balanceEnvelope) {
    const gains = getSocialVarietyGains(candidate.partition, context);
    candidate.rawMatchTypeGain = gains.matchType;
    candidate.effectiveMatchTypeGain = getEffectiveEntropyGain(gains.matchType, sessionType);
    candidate.rawRelationshipGain = canonicalSum([gains.courtmates, gains.partners, gains.opponents]);
    candidate.effectiveRelationshipGain = getEffectiveEntropyGain(candidate.rawRelationshipGain, sessionType);
    // Mirror the documented gain grouping without importing the production
    // comparator: first sum the three relationship facets, then combine that
    // score with MIXICANO match-type entropy.
    candidate.rawCombinedEntropyGain = canonicalSum([
      candidate.rawMatchTypeGain,
      candidate.rawRelationshipGain,
    ]);
    candidate.effectiveCombinedEntropyGain = getEffectiveEntropyGain(candidate.rawCombinedEntropyGain, sessionType);
    const coverageGain = getIndependentImmediateCoverageGain(
      candidate.partition,
      coverageContext,
      coverageGainMetric,
      completedHistory,
      completedTypesByPlayer,
      rollingTypeContext
    );
    candidate.immediateCoverageGain = coverageGain.normalized;
    candidate.immediateCoverageGainNumerator = coverageGain.numerator;
    candidate.immediateCoverageGainDenominator = coverageGain.denominator;
  }
  const bestZeroRestCount = balanceEnvelope.length
    ? Math.min(...balanceEnvelope.map((candidate) => candidate.zeroRestCount))
    : null;
  const replayMinimum = bestZeroRestCount === null
    ? []
    : balanceEnvelope.filter((candidate) => candidate.zeroRestCount === bestZeroRestCount);
  const bestMinimumReplayCoverageCandidate = replayMinimum.length
    ? replayMinimum.reduce((best, candidate) => compareCoverageUnits(candidate, best) > 0 ? candidate : best, replayMinimum[0])
    : null;
  const bestMinimumReplayCoverageGain = bestMinimumReplayCoverageCandidate?.immediateCoverageGain ?? null;
  const bestMinimumReplayCoverageGainNumerator = bestMinimumReplayCoverageCandidate?.immediateCoverageGainNumerator ?? null;
  const replayCoverageFrontier = bestMinimumReplayCoverageCandidate
    ? replayMinimum.filter((candidate) => compareCoverageUnits(candidate, bestMinimumReplayCoverageCandidate) === 0)
    : [];
  const plusOneCoverageEligible = bestMinimumReplayCoverageCandidate
    ? balanceEnvelope.filter((candidate) => candidate.zeroRestCount === bestZeroRestCount! + 1 &&
      compareCoverageUnits(candidate, bestMinimumReplayCoverageCandidate) > 0)
    : [];
  // The frozen numeric envelope is always best + 1. The coverage gate then
  // admits only those +1 candidates that strictly improve on the best
  // minimum-replay coverage score; `replayAllowance` is that actual candidate
  // set and is what selection certification checks.
  const allowedZeroRestCount = bestZeroRestCount === null ? null : bestZeroRestCount + 1;
  const replayAllowance = allowedZeroRestCount === null
    ? []
    : balanceEnvelope.filter((candidate) => candidate.zeroRestCount === bestZeroRestCount ||
      (candidate.zeroRestCount === bestZeroRestCount! + 1 && plusOneCoverageEligible.includes(candidate)));
  const legacyReplayAllowance = bestZeroRestCount === null
    ? []
    : balanceEnvelope.filter((candidate) => candidate.zeroRestCount <= bestZeroRestCount + 1);
  const legacyBestCombinedEntropyGain = legacyReplayAllowance.length
    ? Math.max(...legacyReplayAllowance.map((candidate) => candidate.effectiveCombinedEntropyGain))
    : null;
  const legacyCombinedEntropyFrontier = legacyBestCombinedEntropyGain === null
    ? []
    : legacyReplayAllowance.filter((candidate) => candidate.effectiveCombinedEntropyGain === legacyBestCombinedEntropyGain);
  const legacyBestSoftRest = legacyCombinedEntropyFrontier.length
    ? legacyCombinedEntropyFrontier.reduce((best, candidate) => compareNumberVectors(candidate.softRest, best) < 0 ? candidate.softRest : best, legacyCombinedEntropyFrontier[0].softRest)
    : null;
  const legacyCombinedSoftCadenceFrontier = legacyBestSoftRest
    ? legacyCombinedEntropyFrontier.filter((candidate) => compareNumberVectors(candidate.softRest, legacyBestSoftRest) === 0)
    : [];
  const baselineBestEntropy = balanceEnvelope.length
    ? Math.max(...balanceEnvelope.map((candidate) => candidate.effectiveCombinedEntropyGain))
    : null;
  const baselineEntropyFrontier = baselineBestEntropy === null
    ? [] : balanceEnvelope.filter((candidate) => candidate.effectiveCombinedEntropyGain === baselineBestEntropy);
  const baselineBestSoftRest = baselineEntropyFrontier.length
    ? baselineEntropyFrontier.reduce((best, candidate) =>
      compareNumberVectors(getLegacySocialRestVectorForBenchmark(candidate.softRest), best) < 0
        ? getLegacySocialRestVectorForBenchmark(candidate.softRest) : best,
      getLegacySocialRestVectorForBenchmark(baselineEntropyFrontier[0].softRest))
    : null;
  const baselineSoftCadenceFrontier = baselineBestSoftRest
    ? baselineEntropyFrontier.filter((candidate) =>
      compareNumberVectors(getLegacySocialRestVectorForBenchmark(candidate.softRest), baselineBestSoftRest) === 0)
    : [];
  const bestCombinedEntropyGain = replayAllowance.length
    ? Math.max(...replayAllowance.map((candidate) => candidate.effectiveCombinedEntropyGain))
    : null;
  const combinedEntropyFrontier = bestCombinedEntropyGain === null
    ? []
    : replayAllowance.filter((candidate) => candidate.effectiveCombinedEntropyGain === bestCombinedEntropyGain);
  const bestCombinedSoftRestVector = combinedEntropyFrontier.length
    ? combinedEntropyFrontier.reduce((best, candidate) => compareNumberVectors(candidate.softRest, best) < 0 ? candidate.softRest : best, combinedEntropyFrontier[0].softRest)
    : null;
  const combinedSoftCadenceFrontier = bestCombinedSoftRestVector
    ? combinedEntropyFrontier.filter((candidate) => compareNumberVectors(candidate.softRest, bestCombinedSoftRestVector) === 0)
    : [];
  // Preserve the prior type-first frontiers for historical classifications and
  // reports; the new policy is independently certified by the replay and
  // combined-entropy frontiers above.
  const bestMatchTypeGain = balanceEnvelope.length
    ? Math.max(...balanceEnvelope.map((candidate) => candidate.effectiveMatchTypeGain))
    : null;
  const matchTypeFrontier = bestMatchTypeGain === null
    ? []
    : balanceEnvelope.filter((candidate) => candidate.effectiveMatchTypeGain === bestMatchTypeGain);
  const legacyBestZeroRestCount = matchTypeFrontier.length
    ? Math.min(...matchTypeFrontier.map((candidate) => candidate.zeroRestCount))
    : null;
  // Match-type entropy is the first variety layer for MIXICANO. Zero-rest
  // count is optimized only inside its best effective-gain class.
  const cadenceAdmissible = legacyBestZeroRestCount === null
    ? []
    : matchTypeFrontier.filter((candidate) => candidate.zeroRestCount === legacyBestZeroRestCount);
  const bestRelationshipGain = cadenceAdmissible.length
    ? Math.max(...cadenceAdmissible.map((candidate) => candidate.effectiveRelationshipGain))
    : null;
  const relationshipEntropyFrontier = bestRelationshipGain === null
    ? []
    : cadenceAdmissible.filter((candidate) => candidate.effectiveRelationshipGain === bestRelationshipGain);
  const bestSoftRestVector = relationshipEntropyFrontier.length
    ? relationshipEntropyFrontier.reduce((best, candidate) => compareNumberVectors(candidate.softRest, best) < 0 ? candidate.softRest : best, relationshipEntropyFrontier[0].softRest)
    : null;
  const softCadenceFrontier = bestSoftRestVector
    ? relationshipEntropyFrontier.filter((candidate) => compareNumberVectors(candidate.softRest, bestSoftRestVector) === 0)
    : [];
  const bestCadenceVector = balanceEnvelope.length
    ? balanceEnvelope.reduce((best, candidate) => compareNumberVectors(candidate.rest, best) < 0 ? candidate.rest : best, balanceEnvelope[0].rest)
    : null;
  const strictCadenceAdmissible = bestCadenceVector
    ? balanceEnvelope.filter((candidate) => compareNumberVectors(candidate.rest, bestCadenceVector) === 0)
    : [];
  const strictBestEntropy = strictCadenceAdmissible.length
    ? Math.max(...strictCadenceAdmissible.map((candidate) => candidate.effectiveCombinedEntropyGain))
    : null;
  const strictEntropyFrontier = strictBestEntropy === null
    ? [] : strictCadenceAdmissible.filter((candidate) => candidate.effectiveCombinedEntropyGain === strictBestEntropy);
  const strictBestSoftRest = strictEntropyFrontier.length
    ? strictEntropyFrontier.reduce((best, candidate) => compareNumberVectors(candidate.softRest, best) < 0 ? candidate.softRest : best, strictEntropyFrontier[0].softRest)
    : null;
  const strictSoftCadenceFrontier = strictBestSoftRest
    ? strictEntropyFrontier.filter((candidate) => compareNumberVectors(candidate.softRest, strictBestSoftRest) === 0)
    : [];
  const idsFor = (values: OracleCandidate[]) => new Set(values.flatMap((candidate) => candidate.ids));
  const keysFor = (values: OracleCandidate[]) => new Set(values.map((candidate) => exactCandidateKey(candidate.ids, candidate.partition)));
  return {
    legalCandidates: candidates,
    fairnessClass,
    rotationClass,
    balanceEnvelope,
    replayMinimum,
    replayCoverageFrontier,
    replayAllowance,
    legacyReplayAllowance,
    legacyCombinedEntropyFrontier,
    legacyCombinedSoftCadenceFrontier,
    baselineEntropyFrontier,
    baselineSoftCadenceFrontier,
    strictEntropyFrontier,
    strictSoftCadenceFrontier,
    matchTypeFrontier,
    cadenceAdmissible,
    combinedEntropyFrontier,
    combinedSoftCadenceFrontier,
    relationshipEntropyFrontier,
    softCadenceFrontier,
    strictCadenceAdmissible,
    bestMatchTypeGain,
    bestZeroRestCount,
    allowedZeroRestCount,
    bestMinimumReplayCoverageGain,
    bestMinimumReplayCoverageGainNumerator,
    bestCombinedEntropyGain,
    bestRelationshipGain,
    bestSoftRestVector,
    bestCadenceVector,
    fairnessClassIds: idsFor(fairnessClass),
    rotationClassIds: idsFor(rotationClass),
    balanceEnvelopeIds: idsFor(balanceEnvelope),
    replayMinimumIds: idsFor(replayMinimum),
    replayCoverageFrontierIds: idsFor(replayCoverageFrontier),
    replayAllowanceIds: idsFor(replayAllowance),
    legacyReplayAllowanceIds: idsFor(legacyReplayAllowance),
    legacyCombinedEntropyFrontierIds: idsFor(legacyCombinedEntropyFrontier),
    legacyCombinedSoftCadenceFrontierIds: idsFor(legacyCombinedSoftCadenceFrontier),
    matchTypeFrontierIds: idsFor(matchTypeFrontier),
    cadenceAdmissibleIds: idsFor(cadenceAdmissible),
    combinedEntropyFrontierIds: idsFor(combinedEntropyFrontier),
    combinedSoftCadenceFrontierIds: idsFor(combinedSoftCadenceFrontier),
    relationshipEntropyFrontierIds: idsFor(relationshipEntropyFrontier),
    softCadenceFrontierIds: idsFor(softCadenceFrontier),
    legalCandidateIds: idsFor(candidates),
    fairnessClassKeys: keysFor(fairnessClass),
    rotationClassKeys: keysFor(rotationClass),
    balanceEnvelopeKeys: keysFor(balanceEnvelope),
    replayMinimumKeys: keysFor(replayMinimum),
    replayCoverageFrontierKeys: keysFor(replayCoverageFrontier),
    replayAllowanceKeys: keysFor(replayAllowance),
    legacyReplayAllowanceKeys: keysFor(legacyReplayAllowance),
    legacyCombinedEntropyFrontierKeys: keysFor(legacyCombinedEntropyFrontier),
    legacyCombinedSoftCadenceFrontierKeys: keysFor(legacyCombinedSoftCadenceFrontier),
    baselineEntropyFrontierKeys: keysFor(baselineEntropyFrontier),
    baselineSoftCadenceFrontierKeys: keysFor(baselineSoftCadenceFrontier),
    strictEntropyFrontierKeys: keysFor(strictEntropyFrontier),
    strictSoftCadenceFrontierKeys: keysFor(strictSoftCadenceFrontier),
    matchTypeFrontierKeys: keysFor(matchTypeFrontier),
    cadenceAdmissibleKeys: keysFor(cadenceAdmissible),
    combinedEntropyFrontierKeys: keysFor(combinedEntropyFrontier),
    combinedSoftCadenceFrontierKeys: keysFor(combinedSoftCadenceFrontier),
    relationshipEntropyFrontierKeys: keysFor(relationshipEntropyFrontier),
    softCadenceFrontierKeys: keysFor(softCadenceFrontier),
    strictCadenceAdmissibleKeys: keysFor(strictCadenceAdmissible),
  };
}

function toEntropyCandidateWitness(candidate: OracleCandidate, playersById: Map<string, BenchmarkPlayer>): EntropyCandidateWitness {
  return {
    ids: [...candidate.ids].sort(),
    partition: candidate.partition,
    balanceGap: candidate.balanceGap,
    zeroRestCount: candidate.zeroRestCount,
    restTurnsByPlayer: candidate.ids.map((userId) => ({ userId, restTurns: playersById.get(userId)?.restTurns ?? 0 }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
    softRestVector: candidate.softRest,
    rawMatchTypeGain: candidate.rawMatchTypeGain,
    effectiveMatchTypeGain: candidate.effectiveMatchTypeGain,
    rawRelationshipGain: candidate.rawRelationshipGain,
    effectiveRelationshipGain: candidate.effectiveRelationshipGain,
    rawCombinedEntropyGain: candidate.rawCombinedEntropyGain,
    effectiveCombinedEntropyGain: candidate.effectiveCombinedEntropyGain,
    immediateCoverageGain: candidate.immediateCoverageGain,
    immediateCoverageGainNumerator: candidate.immediateCoverageGainNumerator.toString(),
    immediateCoverageGainDenominator: candidate.immediateCoverageGainDenominator.toString(),
  };
}

function certifyReplaySelection(
  proof: CounterfactualSelectionProof | null,
  audit: RotationAudit,
  description: string,
  policy: "current" | "replay-envelope" = "current",
  coverageGainMetric: BenchmarkCoverageGainMetric = "legacy-equal"
): { candidate: OracleCandidate; replayEnvelopeCertified: boolean; coverageGateCertified: boolean; engineCertified: boolean } | null {
  if (!proof || proof.selections.length !== 1) return null;
  const selection = proof.selections[0];
  const key = exactCandidateKey(selection.ids, selection.partition);
  if (!audit.fairnessClassKeys.has(key)) throw new Error(`${description}: selected partition was outside independently enumerated fairness/arrival class.`);
  if (!audit.rotationClassKeys.has(key)) throw new Error(`${description}: selected partition was outside its independently enumerated strongest rotation class.`);
  if (!audit.balanceEnvelopeKeys.has(key)) throw new Error(`${description}: selected partition was outside its independently recomputed balance envelope.`);
  const candidate = audit.balanceEnvelope.find((item) => exactCandidateKey(item.ids, item.partition) === key);
  if (!candidate) throw new Error(`${description}: selected partition was not in the independent balance-envelope candidate set.`);
  const allowedKeys = policy === "current" ? audit.replayAllowanceKeys : audit.legacyReplayAllowanceKeys;
  if (audit.bestZeroRestCount === null || audit.allowedZeroRestCount === null ||
      candidate.zeroRestCount > audit.allowedZeroRestCount || !allowedKeys.has(key)) {
    throw new Error(`${description}: selected partition exceeded the independently recomputed replay allowance.`);
  }
  const combinedAndSoftFrontierMatch = policy === "current"
    ? audit.combinedSoftCadenceFrontierKeys.has(key)
    : audit.legacyCombinedSoftCadenceFrontierKeys.has(key);
  const debugCountsMatch = proof.bestImmediateReplayCount === audit.bestZeroRestCount &&
    proof.allowedImmediateReplayCount === audit.allowedZeroRestCount &&
    proof.chosenImmediateReplayCount === candidate.zeroRestCount;
  if (proof.replayCertified === true && !debugCountsMatch) {
    throw new Error(`${description}: engine replay-envelope counters disagreed with the independent replay audit.`);
  }
  if (proof.replayCertified === true && proof.varietyOptimal && !combinedAndSoftFrontierMatch) {
    throw new Error(`${description}: engine certified combined entropy/soft cadence, but the independent frontier disagreed.`);
  }
  const expectedCoverageGain = candidate.immediateCoverageGain;
  const expectedEngineCoverageMetric = coverageGainMetric === "social-horizon-321" ||
    coverageGainMetric === "rolling-equal" || coverageGainMetric === "social-horizon-3211"
    ? coverageGainMetric
    : "legacy-four-facet";
  const coverageMetricMatches = proof.coverageGainMetric === expectedEngineCoverageMetric;
  const coverageValuesMatch = proof.bestMinimumReplayCoverageGain === audit.bestMinimumReplayCoverageGain &&
    proof.chosenImmediateCoverageGain === expectedCoverageGain &&
    proof.chosenReplayCoverageEligible === audit.replayAllowanceKeys.has(key) && coverageMetricMatches;
  if (policy === "current" && proof.coverageGateCertified === true && !coverageValuesMatch) {
    throw new Error(`${description}: engine coverage-gate score disagreed with the independent rational first-exposure oracle.`);
  }
  if (policy === "current" && proof.coverageGateCertified === true && !audit.replayAllowanceKeys.has(key)) {
    throw new Error(`${description}: engine certified its coverage gate but selected outside the independently recomputed coverage-gated replay envelope.`);
  }
  const coverageGateCertified = policy === "current" && proof.coverageGateCertified === true &&
    proof.coverageGateStatus === "CERTIFIED" && coverageValuesMatch && debugCountsMatch;
  return {
    candidate,
    replayEnvelopeCertified: proof.replayCertified === true && proof.replayEnvelopeStatus === "CERTIFIED" && debugCountsMatch,
    coverageGateCertified,
    engineCertified: proof.replayCertified === true && proof.varietyOptimal &&
      proof.replayEnvelopeStatus === "CERTIFIED" && debugCountsMatch && combinedAndSoftFrontierMatch &&
      (policy !== "current" || coverageGateCertified),
  };
}

function emptyWaitMeta(): WaitEpisodeMeta {
  return {
    hadFairnessClassOpportunity: false,
    hadStarvationClassOpportunity: false,
    hadBalanceAdmissibleOpportunity: false,
    hadMatchTypeFrontierOpportunity: false,
    hadZeroRestFrontierOpportunity: false,
    hadRelationshipEntropyFrontierOpportunity: false,
    hadSoftCadenceFrontierOpportunity: false,
    hadReplayMinimumOpportunity: false,
    hadReplayAllowanceOpportunity: false,
    hadCombinedEntropyFrontierOpportunity: false,
    hadCombinedSoftCadenceFrontierOpportunity: false,
    hadCoverageGateRejectedPlusOneOpportunity: false,
    hadBeyondReplayAllowanceOpportunity: false,
    hadPolicyAdmissionOpportunity: false,
    hadPolicyEntropyFrontierOpportunity: false,
    hadPolicyFinalFrontierOpportunity: false,
    hadSmootherAlternative: false,
    hadCadenceOptimalOpportunity: false,
    hadCadenceSuboptimalOpportunity: false,
    lastDeferredWitness: null,
    cadenceOptimalAlternativeWitness: null,
    strictlyBetterCadenceWitness: null,
    cadenceSuboptimalAlternativeWitness: null,
    hadLegalCandidate: false,
  };
}

function percentile95(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)];
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeGaps(values: number[]) {
  return { max: values.length ? Math.max(...values) : 0, mean: mean(values), p95: percentile95(values), count: values.length };
}

function summarizeSocialCourtmateRescue(
  counters: MutableSocialCourtmateRescueCounters
): SocialCourtmateRescueSummary {
  const completedWitnesses = counters.witnesses.filter((witness) => witness.completed === true);
  const sacrifices = completedWitnesses.filter((witness) => witness.chosenCourtmateGainDeficit !== null &&
    witness.chosenCourtmateGainDeficit > 0);
  const completedChosenT = completedWitnesses.reduce((sum, witness) => sum + (witness.chosenRollingMatchTypeGain ?? 0), 0);
  const completedGmaxT = completedWitnesses.reduce((sum, witness) => sum + (witness.bestRollingMatchTypeGainAtGmax ?? 0), 0);
  const completedIncrementalT = completedWitnesses.reduce((sum, witness) =>
    sum + (witness.incrementalTGainVsBestFullGainCandidate ?? 0), 0
  );
  const onePair = sacrifices.filter((witness) => witness.chosenCourtmateGainDeficit === 1);
  const benefit = (witness: SocialCourtmateRescueDecisionWitness) => witness.incrementalTGainVsBestFullGainCandidate ?? 0;
  return {
    policyApplied: true,
    coverageGateStatus: "DISABLED",
    replayEnvelopeStatus: "DISABLED",
    startedDecisions: counters.startedDecisions,
    completedDecisions: completedWitnesses.length,
    auditCompletedDecisions: counters.auditCompletedDecisions,
    certifiedDecisions: counters.certifiedDecisions,
    uncertifiedDecisions: counters.uncertifiedDecisions,
    rankingDiscrepancies: counters.rankingDiscrepancies,
    fairnessCertificateFailures: counters.fairnessCertificateFailures,
    starvationSafetyFailures: counters.starvationSafetyFailures,
    gMaxCertificationFailures: counters.gMaxCertificationFailures,
    admissionFailures: counters.admissionFailures,
    searchLimitDecisions: counters.searchLimitDecisions,
    incompleteAuditDecisions: counters.incompleteAuditDecisions,
    completedChosenCourtmatePairSacrifice: sacrifices.reduce((sum, witness) => sum + (witness.chosenCourtmateGainDeficit ?? 0), 0),
    completedOnePairSacrifices: onePair.length,
    completedOnePairSacrificesWithPositiveTBenefit: onePair.filter((witness) => benefit(witness) > 0).length,
    completedOnePairSacrificesWithZeroTBenefit: onePair.filter((witness) => benefit(witness) === 0).length,
    completedOnePairSacrificesWithNegativeTBenefit: onePair.filter((witness) => benefit(witness) < 0).length,
    // These are sums of per-decision signed deltas, not endpoint T-coverage KPIs.
    completedSignedRollingTGain: completedChosenT,
    completedBestGmaxSignedRollingTGain: completedGmaxT,
    completedIncrementalTGainVsBestFullGain: completedIncrementalT,
    completedTGainDenominator: counters.rollingTypeGainDenominator,
    counterfactualStartedDecisions: counters.counterfactualStartedDecisions,
    counterfactualAuditCompletedDecisions: counters.counterfactualAuditCompletedDecisions,
    counterfactualCertifiedDecisions: counters.counterfactualCertifiedDecisions,
    counterfactualUncertifiedDecisions: counters.counterfactualUncertifiedDecisions,
    counterfactualRankingDiscrepancies: counters.counterfactualRankingDiscrepancies,
    counterfactualFairnessCertificateFailures: counters.counterfactualFairnessCertificateFailures,
    counterfactualGMaxCertificationFailures: counters.counterfactualGMaxCertificationFailures,
    counterfactualAdmissionFailures: counters.counterfactualAdmissionFailures,
    counterfactualSearchLimitDecisions: counters.counterfactualSearchLimitDecisions,
    counterfactualIncompleteAuditDecisions: counters.counterfactualIncompleteAuditDecisions,
    witnesses: counters.witnesses.map((witness) => ({ ...witness })),
    counterfactualWitnesses: counters.counterfactualWitnesses.map((witness) => ({ ...witness })),
  };
}

function cloneBeneficialRescueWitness(
  witness: SocialCourtmateBeneficialRescueDecisionWitness
): SocialCourtmateBeneficialRescueDecisionWitness {
  const copyCourt = (court: { ids: string[]; partition: V3DoublesPartition }) => ({
    ids: [...court.ids],
    partition: {
      team1: [...court.partition.team1] as [string, string],
      team2: [...court.partition.team2] as [string, string],
    },
  });
  return {
    ...witness,
    selectedCourts: witness.selectedCourts.map(copyCourt),
    selectedCourtmateCoverageProfile: witness.selectedCourtmateCoverageProfile.map((row) => ({ ...row })),
    engineCourtmateCoverageProfile: witness.engineCourtmateCoverageProfile?.map((row) => ({ ...row })) ?? null,
    bestGmaxCourts: witness.bestGmaxCourts?.map(copyCourt) ?? null,
    strictWinnerAtGmaxCourts: witness.strictWinnerAtGmaxCourts.map(copyCourt),
    perPlayerTypeWindows: witness.perPlayerTypeWindows.map((player) => ({
      ...player,
      feasibleTypes: [...player.feasibleTypes],
      recentTypesBefore: [...player.recentTypesBefore],
      recentTypesAfter: [...player.recentTypesAfter],
      missingTypesBefore: [...player.missingTypesBefore],
      missingTypesAfter: [...player.missingTypesAfter],
      restoredTypes: [...player.restoredTypes],
      expiredTypes: [...player.expiredTypes],
    })),
  };
}

function summarizeSocialCourtmateBeneficialRescue(
  counters: MutableSocialCourtmateBeneficialRescueCounters
): SocialCourtmateBeneficialRescueSummary {
  const base = summarizeSocialCourtmateRescue(counters);
  const completedAtGmax = counters.witnesses.filter((witness) => witness.completed === true &&
    witness.chosenCourtmateGainDeficit === 0);
  return {
    ...base,
    completedAtGmaxDecisions: completedAtGmax.length,
    completedAtGmaxWithPositiveSignedTGain: completedAtGmax.filter((witness) =>
      (witness.chosenRollingMatchTypeGain ?? 0) > 0
    ).length,
    completedAtGmaxWithStrictOrderingBenefit: completedAtGmax.filter((witness) =>
      witness.fullGmaxTBenefitVsStrict > 0
    ).length,
    completedAtGmaxIncrementalTVsStrictWinner: completedAtGmax.reduce((sum, witness) =>
      sum + witness.fullGmaxTBenefitVsStrict, 0
    ),
    completedAtGmaxExtraBothTypePlayerWindowsVsStrictWinner: completedAtGmax.reduce((sum, witness) =>
      sum + (witness.chosenFullTypePlayerCount ?? 0) - witness.strictWinnerAtGmaxFullTypePlayerCount, 0
    ),
    witnesses: counters.witnesses.map(cloneBeneficialRescueWitness),
    counterfactualWitnesses: counters.counterfactualWitnesses.map(cloneBeneficialRescueWitness),
  };
}

function getEntropy(histogram: { opportunities: ReadonlySet<string>; total: number; countLogCountSum: number }) {
  if (histogram.opportunities.size < 2) return null;
  if (histogram.total === 0) return 0;
  return Math.max(0, (Math.log(histogram.total) - histogram.countLogCountSum / histogram.total) / Math.log(histogram.opportunities.size));
}

function getCheckpoint(
  players: BenchmarkPlayer[],
  completed: SocialHistoryMatch[],
  counters: {
    completedRestGaps: number[];
    assignmentRestGaps: number[];
    backToBackCount: number;
    eligibleAssignments: number;
    reachedIdealPlusOne: number;
    reachedIdealPlusTwo: number;
    starvationDecisions: number;
    overduePlayerEvents: number;
    starvationInterventions: number;
    starvationCertified: number;
    starvationUncertified: number;
    completedOptimizerDecisions: number;
    optimizerCallCount: number;
    ordinaryOptimizerMs: number;
    counterfactualWrapperCallCount: number;
    counterfactualWrapperMs: number;
    optimizerSearchLimitCount: number;
    fairnessCertificateFailures: number;
    starvationCertificateFailures: number;
    balanceCertificateFailures: number;
    incompleteCounterfactualCalls: number;
    maximumObservedAvailableRestTurns: number;
    ongoingAvailableFiveTurnWaits: BenchmarkCheckpoint["ongoingAvailableFiveTurnWaits"];
    inProgressFiveTurnAssignments: BenchmarkCheckpoint["inProgressFiveTurnAssignments"];
    maximumBalanceGap: number;
    maximumFairnessSpread: number;
    minimumFairnessSpread: number;
    externalBusyEventCount: number;
    refillDecisionCount: number;
    selectedMatchTypeGainTotal: number;
    selectedRelationshipGainTotal: number;
    typePriorityOverrideCount: number;
    typePriorityPolicyApplied: boolean;
    replayEnvelopePolicyApplied: boolean;
    productionReplayCertified: number;
    productionReplayUncertified: number;
    productionReplayEnvelopeCertified: number;
    noStarvationReplayRefillDecisions: number;
    noStarvationReplayCertified: number;
    noStarvationReplayUncertified: number;
    noStarvationReplayEnvelopeCertified: number;
    noStarvationCounterfactualDecisions: number;
    acceptedPlusOneDecisions: number;
    betterEntropyBeyondAllowanceDecisions: number;
    betterEntropyBeyondAllowanceCandidateCount: number;
    coverageGatePolicyApplied: boolean;
    coverageGateCertified: number;
    coverageGateUncertified: number;
    noStarvationCoverageGateCertified: number;
    noStarvationCoverageGateUncertified: number;
    plusOneAvailableDecisions: number;
    plusOneAvailableCandidates: number;
    plusOneCoverageEligibleDecisions: number;
    plusOneCoverageEligibleCandidates: number;
    plusOneSelectedDecisions: number;
    plusOneSelectedCandidates: number;
    plusOneRejectedWithoutImprovedCoverageDecisions: number;
    plusOneRejectedWithoutImprovedCoverageCandidates: number;
    zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions: number;
    zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates: number;
    acceptedGreaterCoverageDecisions: number;
    acceptedGreaterCoverageCandidates: number;
    higherEntropyBeyondAllowanceDecisions: number;
    higherEntropyBeyondAllowanceCandidates: number;
    coverageGateWitnesses: CoverageGateWitness[];
    replayEnvelopeWitnesses: ReplayEnvelopeWitness[];
    fivePlusCompletedRestEpisodes: number;
    fivePlusEpisodesLinkedAcceptedPlusOneReplay: number;
    fivePlusEpisodesLinkedOtherRestZeroReplay: number;
    fivePlusEpisodesWithoutLinkedRestZeroReplay: number;
    socialPriorityPolicyApplied: boolean;
    socialPriorityStrictPolicyApplied: boolean;
    socialPriorityObjectiveDecisions: number;
    socialPriorityObjectiveCertifiedDecisions: number;
    socialPriorityObjectiveUncertifiedDecisions: number;
    socialPriorityRankingDiscrepancies: number;
    socialPriorityFairnessCertificateFailures: number;
    socialPriorityStarvationSafetyFailures: number;
    socialPrioritySearchLimitDecisions: number;
    socialPriorityIncompleteCounterfactualDecisions: number;
    socialPriorityCounterfactualAuditDecisions: number;
    socialPriorityCounterfactualCertifiedDecisions: number;
    socialPriorityCounterfactualUncertifiedDecisions: number;
    socialPriorityCounterfactualRankingDiscrepancies: number;
    socialPriorityCounterfactualFairnessCertificateFailures: number;
    socialPriorityCounterfactualSearchLimitDecisions: number;
    socialPriorityCounterfactualIncompleteDecisions: number;
    socialCourtmateRescuePolicyApplied: boolean;
    socialCourtmateRescue: MutableSocialCourtmateRescueCounters;
    socialCourtmateBeneficialRescuePolicyApplied: boolean;
    socialCourtmateBeneficialRescue: MutableSocialCourtmateBeneficialRescueCounters;
  },
  completedMatches: number
): BenchmarkCheckpoint {
  const context = buildSocialVarietyContext(players, completed, { sessionMode: SessionMode.MIXICANO });
  const fullRosterContext = buildSocialVarietyContext(players, completed, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  const coverage = getSocialVarietyCoverage(context);
  const relationshipEntropies: number[] = [];
  const matchTypeEntropies: number[] = [];
  for (const player of context.playersByUserId.values()) {
    for (const facet of RELATION_FACETS) {
      const entropy = getEntropy(player[facet]);
      if (entropy !== null) relationshipEntropies.push(entropy);
    }
    const entropy = getEntropy(player.matchType);
    if (entropy !== null) matchTypeEntropies.push(entropy);
  }
  const allEntropies = [...relationshipEntropies, ...matchTypeEntropies];
  const matchedCounts = players.map((player) => player.matchesPlayed);
  const playerMatchCounts = players.map((player) => ({ userId: player.userId, matchesPlayed: player.matchesPlayed }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const starvRate = counters.starvationDecisions && counters.starvationUncertified === 0
    ? counters.starvationInterventions / counters.starvationDecisions
    : null;
  return {
    completedMatches,
    completedMatchTypeCounts: completed.reduce((counts, match) => {
      const type = match.socialVariety?.courtType;
      if (type === "MIXED") counts.MIXED += 1;
      else if (type === "UPPER" || type === "LOWER") counts.OWN_SIDE += 1;
      else throw new Error(`Completed benchmark match ${match.id ?? "(unknown)"} has no completed match-type snapshot.`);
      return counts;
    }, { MIXED: 0, OWN_SIDE: 0 }),
    varietyCoverageScore: coverage.score,
    socialHorizon321: scoreSocialHorizon321(fullRosterContext),
    socialVariety3211: scoreSocialVariety3211(fullRosterContext, completed),
    partnerCoverage: coverage.partnerScore,
    opponentCoverage: coverage.opponentScore,
    courtmateCoverage: coverage.courtmateScore,
    matchTypeCoverage: { ...coverage.matchTypeScores },
    normalizedEntropyScore: mean(allEntropies),
    relationshipEntropyScore: mean(relationshipEntropies),
    matchTypeEntropyScore: mean(matchTypeEntropies),
    assignmentRestGap: summarizeGaps(counters.assignmentRestGaps),
    betweenOwnCompletionEventGap: summarizeGaps(counters.completedRestGaps),
    backToBack: { count: counters.backToBackCount, eligibleAssignments: counters.eligibleAssignments, rate: counters.eligibleAssignments ? counters.backToBackCount / counters.eligibleAssignments : 0 },
    reachedIdealPlusOne: counters.reachedIdealPlusOne,
    reachedIdealPlusTwo: counters.reachedIdealPlusTwo,
    starvation: {
      decisionsWithOverdueAvailable: counters.starvationDecisions,
      completedRotationDecisions: counters.completedOptimizerDecisions,
      overduePlayerEvents: counters.overduePlayerEvents,
      materiallyChangedPlayerSet: counters.starvationInterventions,
      certifiedCounterfactualDecisions: counters.starvationCertified,
      uncertifiedCounterfactualDecisions: counters.starvationUncertified,
      rateWhenOverdue: starvRate,
      rateAcrossCompletedDecisions: counters.completedOptimizerDecisions && counters.starvationUncertified === 0
        ? counters.starvationInterventions / counters.completedOptimizerDecisions
        : null,
      rateAmongCertifiedCounterfactualDecisions: counters.starvationCertified
        ? counters.starvationInterventions / counters.starvationCertified
        : null,
    },
    typePriorityOverrides: {
      policyApplied: counters.typePriorityPolicyApplied,
      refillDecisions: counters.typePriorityPolicyApplied ? counters.refillDecisionCount : null,
      decisionsWithLowerZeroTypeTradeoff: counters.typePriorityPolicyApplied ? counters.typePriorityOverrideCount : null,
      rateAcrossRefills: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.typePriorityOverrideCount / counters.refillDecisionCount : null,
      selectedMatchTypeGainMean: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.selectedMatchTypeGainTotal / counters.refillDecisionCount : null,
      selectedRelationshipGainMean: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.selectedRelationshipGainTotal / counters.refillDecisionCount : null,
    },
    replayEnvelope: {
      policyApplied: counters.replayEnvelopePolicyApplied,
      productionRefillDecisions: counters.socialPriorityPolicyApplied ? 0 : counters.refillDecisionCount,
      productionReplayEnvelopeCertifiedDecisions: counters.productionReplayEnvelopeCertified,
      productionCertifiedDecisions: counters.productionReplayCertified,
      productionUncertifiedDecisions: counters.productionReplayUncertified,
      noStarvationRefillDecisions: counters.noStarvationReplayRefillDecisions,
      noStarvationReplayEnvelopeCertifiedDecisions: counters.noStarvationReplayEnvelopeCertified,
      noStarvationCertifiedDecisions: counters.noStarvationReplayCertified,
      noStarvationUncertifiedDecisions: counters.noStarvationReplayUncertified,
      noStarvationCounterfactualDecisions: counters.noStarvationCounterfactualDecisions,
      acceptedPlusOneDecisions: counters.acceptedPlusOneDecisions,
      acceptedPlusOneRate: counters.productionReplayEnvelopeCertified
        ? counters.acceptedPlusOneDecisions / counters.productionReplayEnvelopeCertified : null,
      betterEntropyBeyondAllowanceDecisions: counters.betterEntropyBeyondAllowanceDecisions,
      betterEntropyBeyondAllowanceCandidateCount: counters.betterEntropyBeyondAllowanceCandidateCount,
      fivePlusCompletedRestEpisodes: counters.fivePlusCompletedRestEpisodes,
      fivePlusEpisodesLinkedAcceptedPlusOneReplay: counters.fivePlusEpisodesLinkedAcceptedPlusOneReplay,
      fivePlusEpisodesLinkedOtherRestZeroReplay: counters.fivePlusEpisodesLinkedOtherRestZeroReplay,
      fivePlusEpisodesWithoutLinkedRestZeroReplay: counters.fivePlusEpisodesWithoutLinkedRestZeroReplay,
      witnesses: [...counters.replayEnvelopeWitnesses],
    },
    coverageGate: {
      policyApplied: counters.coverageGatePolicyApplied,
      refillDecisions: counters.socialPriorityPolicyApplied ? 0 : counters.refillDecisionCount,
      certifiedDecisions: counters.coverageGateCertified,
      uncertifiedDecisions: counters.coverageGateUncertified,
      noStarvationRefillDecisions: counters.noStarvationReplayRefillDecisions,
      noStarvationCertifiedDecisions: counters.noStarvationCoverageGateCertified,
      noStarvationUncertifiedDecisions: counters.noStarvationCoverageGateUncertified,
      plusOneAvailableDecisions: counters.plusOneAvailableDecisions,
      plusOneAvailableCandidates: counters.plusOneAvailableCandidates,
      plusOneCoverageEligibleDecisions: counters.plusOneCoverageEligibleDecisions,
      plusOneCoverageEligibleCandidates: counters.plusOneCoverageEligibleCandidates,
      plusOneSelectedDecisions: counters.plusOneSelectedDecisions,
      plusOneSelectedCandidates: counters.plusOneSelectedCandidates,
      plusOneRejectedWithoutImprovedCoverageDecisions: counters.plusOneRejectedWithoutImprovedCoverageDecisions,
      plusOneRejectedWithoutImprovedCoverageCandidates: counters.plusOneRejectedWithoutImprovedCoverageCandidates,
      zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions: counters.zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions,
      zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates: counters.zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates,
      acceptedGreaterCoverageDecisions: counters.acceptedGreaterCoverageDecisions,
      acceptedGreaterCoverageCandidates: counters.acceptedGreaterCoverageCandidates,
      higherEntropyBeyondAllowanceDecisions: counters.higherEntropyBeyondAllowanceDecisions,
      higherEntropyBeyondAllowanceCandidates: counters.higherEntropyBeyondAllowanceCandidates,
      fivePlusCompletedRestEpisodes: counters.fivePlusCompletedRestEpisodes,
      fivePlusEpisodesLinkedAcceptedPlusOneReplay: counters.fivePlusEpisodesLinkedAcceptedPlusOneReplay,
      witnesses: [...counters.coverageGateWitnesses],
    },
    ...(counters.socialPriorityStrictPolicyApplied ? {
      socialPriority: {
        policyApplied: true as const,
        objectiveDecisions: counters.socialPriorityObjectiveDecisions,
        objectiveCertifiedDecisions: counters.socialPriorityObjectiveCertifiedDecisions,
        objectiveUncertifiedDecisions: counters.socialPriorityObjectiveUncertifiedDecisions,
        rankingDiscrepancies: counters.socialPriorityRankingDiscrepancies,
        fairnessCertificateFailures: counters.socialPriorityFairnessCertificateFailures,
        starvationSafetyFailures: counters.socialPriorityStarvationSafetyFailures,
        searchLimitDecisions: counters.socialPrioritySearchLimitDecisions,
        incompleteCounterfactualDecisions: counters.socialPriorityIncompleteCounterfactualDecisions,
        counterfactualAuditDecisions: counters.socialPriorityCounterfactualAuditDecisions,
        counterfactualCertifiedDecisions: counters.socialPriorityCounterfactualCertifiedDecisions,
        counterfactualUncertifiedDecisions: counters.socialPriorityCounterfactualUncertifiedDecisions,
        counterfactualRankingDiscrepancies: counters.socialPriorityCounterfactualRankingDiscrepancies,
        counterfactualFairnessCertificateFailures: counters.socialPriorityCounterfactualFairnessCertificateFailures,
        counterfactualSearchLimitDecisions: counters.socialPriorityCounterfactualSearchLimitDecisions,
        counterfactualIncompleteDecisions: counters.socialPriorityCounterfactualIncompleteDecisions,
        coverageGateStatus: "DISABLED" as const,
        replayEnvelopeStatus: "DISABLED" as const,
      },
    } : {}),
    ...(counters.socialCourtmateRescuePolicyApplied ? {
      socialCourtmateRescue: summarizeSocialCourtmateRescue(counters.socialCourtmateRescue),
    } : {}),
    ...(counters.socialCourtmateBeneficialRescuePolicyApplied ? {
      socialCourtmateBeneficialRescue: summarizeSocialCourtmateBeneficialRescue(counters.socialCourtmateBeneficialRescue),
    } : {}),
    optimizer: {
      callsStarted: counters.optimizerCallCount,
      callsCompleted: counters.completedOptimizerDecisions,
      ordinaryProductionCalls: counters.optimizerCallCount - counters.counterfactualWrapperCallCount,
      ordinaryProductionWallMs: Math.round(counters.ordinaryOptimizerMs * 100) / 100,
      counterfactualWrapperCalls: counters.counterfactualWrapperCallCount,
      counterfactualWrapperWallMs: Math.round(counters.counterfactualWrapperMs * 100) / 100,
      searchLimitCalls: counters.optimizerSearchLimitCount,
      fairnessCertificateFailures: counters.fairnessCertificateFailures,
      starvationCertificateFailures: counters.starvationCertificateFailures,
      balanceCertificateFailures: counters.balanceCertificateFailures,
      incompleteCounterfactualCalls: counters.incompleteCounterfactualCalls,
    },
    matchCountSpread: Math.max(...matchedCounts) - Math.min(...matchedCounts),
    playerMatchCounts,
    minimumPlayerMatchCount: Math.min(...matchedCounts),
    maximumPlayerMatchCount: Math.max(...matchedCounts),
    allPlayersExactlySixMatches: completedMatches === 21
      ? matchedCounts.length === PLAYER_COUNT && matchedCounts.every((count) => count === 6)
      : null,
    maximumFairnessSpread: counters.maximumFairnessSpread,
    minimumFairnessSpread: counters.minimumFairnessSpread,
    maximumBalanceGap: counters.maximumBalanceGap,
    externalBusyEventCount: counters.externalBusyEventCount,
    maximumObservedAvailableRestTurns: counters.maximumObservedAvailableRestTurns,
    ongoingAvailableFiveTurnWaits: counters.ongoingAvailableFiveTurnWaits,
    inProgressFiveTurnAssignments: counters.inProgressFiveTurnAssignments,
  };
}

function createStructuralOpportunityCounts(players: BenchmarkPlayer[]) {
  const context = buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO });
  const result: RelationshipCounts = { courtmates: new Map(), partners: new Map(), opponents: new Map() };
  for (const [userId, facets] of context.playersByUserId) {
    for (const facet of RELATION_FACETS) {
      for (const peer of facets[facet].opportunities) {
        const key = pairKey(userId, peer);
        result[facet].set(key, 1);
      }
    }
  }
  return result;
}

function makeActiveAssignment(
  court: 0 | 1,
  selection: { partition: V3DoublesPartition; ids: string[]; balanceGap: number },
  players: BenchmarkPlayer[],
  decisionId: number,
  decisionMeta: DecisionMeta,
  assignmentId: string,
  completedEventIndex: number,
  audit: RotationAudit | null,
  lastCompletedEvent: ReadonlyMap<string, number>,
  enginePolicy: "current" | "strict" | "baseline" | "type-first" | "replay-envelope",
  replayContext: ReplayAssignmentContext | null
): ActiveAssignment {
  const selectedIds = new Set(selection.ids);
  const byId = new Map(players.map((player) => [player.userId, player]));
  const restTurnsAtAssignment = new Map<string, number>();
  const hadPriorMatchAtAssignment = new Set<string>();
  const replayInitiationByPlayer = new Map<string, ReplayInitiationTrace>();
  for (const id of selectedIds) {
    const player = byId.get(id)!;
    restTurnsAtAssignment.set(id, player.restTurns);
    if (player.matchesPlayed > 0) hadPriorMatchAtAssignment.add(id);
    player.isBusy = true;
  }
  if (audit) {
    const distinctSetsWithout = (candidates: OracleCandidate[], userId: string, predicate?: (candidate: OracleCandidate) => boolean) =>
      new Set(candidates.filter((candidate) => !candidate.ids.includes(userId) && (predicate?.(candidate) ?? true))
        .map((candidate) => candidate.ids.slice().sort().join("|"))).size;
    const selectedCadence = getCadenceVector(players.filter((player) => selectedIds.has(player.userId)));
    const selectedZeroRestCount = players.filter((player) => selectedIds.has(player.userId) && player.restTurns === 0).length;
    const selectedCandidate = audit.balanceEnvelope.find((candidate) =>
      exactCandidateKey(candidate.ids, candidate.partition) === exactCandidateKey(selection.ids, selection.partition)
    );
    for (const id of selectedIds) {
      const player = byId.get(id)!;
      if (!hadPriorMatchAtAssignment.has(id) || player.restTurns !== 0) continue;
      const priorOwnCompletionEvent = lastCompletedEvent.get(id);
      replayInitiationByPlayer.set(id, {
        assignmentId,
        assignedAfterCompletedMatches: completedEventIndex,
        priorOwnCompletionEvent: priorOwnCompletionEvent ?? -1,
        fairAlternativeSetsWithoutPlayer: distinctSetsWithout(audit.fairnessClass, id),
        starvationEquivalentAlternativeSetsWithoutPlayer: distinctSetsWithout(audit.rotationClass, id),
        balanceAdmissibleAlternativeSetsWithoutPlayer: distinctSetsWithout(audit.balanceEnvelope, id),
        betterZeroRestSetsWithoutPlayer: distinctSetsWithout(
          audit.balanceEnvelope,
          id,
          (candidate) => candidate.zeroRestCount < selectedZeroRestCount
        ),
        betterTypeGainLowerZeroRestSetsWithoutPlayer: selectedCandidate
          ? distinctSetsWithout(audit.balanceEnvelope, id, (candidate) =>
            candidate.zeroRestCount < selectedZeroRestCount &&
            candidate.effectiveMatchTypeGain < selectedCandidate.effectiveMatchTypeGain)
          : 0,
        smootherBalanceAdmissibleSetsWithoutPlayer: enginePolicy === "strict" ? distinctSetsWithout(
          audit.balanceEnvelope,
          id,
          (candidate) => enginePolicy === "strict"
            ? compareNumberVectors(candidate.rest, selectedCadence) < 0
            : false
        ) : 0,
        acceptedPlusOneReplay: replayContext?.certified === true &&
          replayContext.bestImmediateReplayCount + 1 === replayContext.chosenImmediateReplayCount &&
          (!replayContext.coverageGatePolicy || (replayContext.coverageGateCertified && replayContext.coverageEligiblePlusOne)),
        acceptedGreaterCoverageReplay: replayContext?.coverageGatePolicy === true &&
          replayContext.coverageGateCertified && replayContext.coverageEligiblePlusOne,
        coverageGateCertified: replayContext?.coverageGatePolicy ? replayContext.coverageGateCertified : undefined,
        bestMinimumReplayCoverageGain: replayContext?.coverageGatePolicy ? replayContext.bestMinimumReplayCoverageGain : undefined,
        selectedImmediateCoverageGain: replayContext?.coverageGatePolicy ? replayContext.chosenImmediateCoverageGain : undefined,
        ...(replayContext ? {
          bestImmediateReplayCount: replayContext.bestImmediateReplayCount,
          allowedImmediateReplayCount: replayContext.allowedImmediateReplayCount,
          chosenImmediateReplayCount: replayContext.chosenImmediateReplayCount,
          selectedDecisionIds: [...selectedIds].sort(),
          marginalPlayerAttribution: "decision_level_only" as const,
        } : {}),
      });
    }
  }
  return {
    assignmentId,
    court,
    partition: selection.partition,
    ids: [...selection.ids],
    socialVariety: buildSocialVarietySnapshot(selection.partition, players),
    decisionId,
    decisionMeta,
    restTurnsAtAssignment,
    hadPriorMatchAtAssignment,
    balanceGap: selection.balanceGap,
    replayInitiationByPlayer,
  };
}

function classifyPolicyFiveGap(meta: WaitEpisodeMeta, enginePolicy: BenchmarkEnginePolicy): FiveGapEpisode["classification"] {
  if (!meta.hadLegalCandidate || !meta.hadFairnessClassOpportunity) return "fairness_or_mixed_legality";
  if (!meta.hadStarvationClassOpportunity) return "starvation_priority";
  if (!meta.hadBalanceAdmissibleOpportunity) return "balance_guardrail";
  if (!meta.hadPolicyAdmissionOpportunity) {
    if (enginePolicy === "current" && meta.hadCoverageGateRejectedPlusOneOpportunity) return "coverage_gate_priority_exclusion";
    if (enginePolicy === "current" && meta.hadBeyondReplayAllowanceOpportunity) return "immediate_replay_priority_exclusion";
    if (enginePolicy === "replay-envelope") return "immediate_replay_priority_exclusion";
    if (enginePolicy === "strict") return "cadence_priority_exclusion";
    if (enginePolicy === "type-first") {
      if (!meta.hadMatchTypeFrontierOpportunity) return "match_type_entropy_priority_exclusion";
      return "immediate_replay_priority_exclusion";
    }
    return "no_equal_priority_inclusion_candidate";
  }
  if (!meta.hadPolicyEntropyFrontierOpportunity) {
    return enginePolicy === "type-first"
      ? "relationship_entropy_priority_exclusion"
      : enginePolicy === "strict" ? "strict_entropy_priority_exclusion"
        : "combined_entropy_priority_exclusion";
  }
  if (!meta.hadPolicyFinalFrontierOpportunity) {
    return enginePolicy === "baseline" ? "legacy_rest_priority_exclusion" : "soft_cadence_priority_exclusion";
  }
  return "cadence_tie_later_tiebreak";
}

function classifyReplayOrigin(trace: ReplayInitiationTrace, enginePolicy: "current" | "strict" | "baseline" | "type-first" | "replay-envelope"): FiveGapEpisode["classification"] {
  if (enginePolicy === "strict" && trace.smootherBalanceAdmissibleSetsWithoutPlayer > 0) return "avoidable_equal_priority_smoother_alternative";
  if ((enginePolicy === "current" || enginePolicy === "replay-envelope") && trace.acceptedPlusOneReplay === true) return "accepted_plus_one_replay_origin";
  if (enginePolicy === "type-first" && trace.betterTypeGainLowerZeroRestSetsWithoutPlayer > 0) return "type_entropy_priority_override";
  if (enginePolicy === "current" && trace.acceptedPlusOneReplay === false) {
    if (trace.fairAlternativeSetsWithoutPlayer === 0) return "fairness_or_mixed_legality";
    if (trace.starvationEquivalentAlternativeSetsWithoutPlayer === 0) return "starvation_priority";
    if (trace.balanceAdmissibleAlternativeSetsWithoutPlayer === 0) return "balance_guardrail";
    return "no_equal_priority_smoother_replay_witness";
  }
  if (enginePolicy !== "strict" && trace.acceptedPlusOneReplay === undefined && trace.betterZeroRestSetsWithoutPlayer > 0) return "avoidable_equal_priority_zero_rest_alternative";
  if (trace.fairAlternativeSetsWithoutPlayer === 0) return "fairness_or_mixed_legality";
  if (trace.starvationEquivalentAlternativeSetsWithoutPlayer === 0) return "starvation_priority";
  if (trace.balanceAdmissibleAlternativeSetsWithoutPlayer === 0) return "balance_guardrail";
  return "no_equal_priority_smoother_replay_witness";
}

/** The completed replay assignment starts the next rest episode; its witness is retained until that episode's next match completes. */
export function advanceReplayOriginOnCompletion(
  _previousOrigin: ReplayInitiationTrace | null | undefined,
  completedAssignmentReplayOrigin: ReplayInitiationTrace | null | undefined
): ReplayInitiationTrace | null {
  return completedAssignmentReplayOrigin ?? null;
}

export function classifyReplayOriginForBenchmark(trace: ReplayInitiationTrace, enginePolicy: "current" | "strict" | "baseline" | "type-first" | "replay-envelope" = "current"): FiveGapEpisode["classification"] {
  return classifyReplayOrigin(trace, enginePolicy);
}

type BenchmarkEnginePolicy = "current" | "strict" | "baseline" | "type-first" | "replay-envelope";

interface MissingRelationshipOpportunityCounts {
  strong: number;
  envelope: number;
  typeFrontier: number;
  cadence: number;
  relationshipFrontier: number;
  replayAllowance: number;
  policyAdmission: number;
  policyEntropy: number;
  policyFinal: number;
  gateRejected: number;
}

export function classifyMissingRelationshipForBenchmark(
  enginePolicy: BenchmarkEnginePolicy,
  counts: MissingRelationshipOpportunityCounts
): MissingRelationship["classification"] {
  const {
    strong, envelope, typeFrontier, cadence, relationshipFrontier,
    replayAllowance,
    policyAdmission, policyEntropy, policyFinal, gateRejected,
  } = counts;
  if (policyFinal > 0) return "admissible_but_unselected";
  if (policyEntropy > 0) return enginePolicy === "baseline"
    ? "legacy_rest_priority_excluded_in_observed_opportunities"
    : "soft_cadence_priority_excluded_in_observed_opportunities";
  if (policyAdmission > 0) {
    return enginePolicy === "type-first"
      ? "relationship_entropy_priority_excluded_in_observed_opportunities"
      : enginePolicy === "strict" ? "strict_entropy_priority_excluded_in_observed_opportunities"
        : "combined_entropy_priority_excluded_in_observed_opportunities";
  }
  if (enginePolicy === "current" && gateRejected > 0) return "coverage_gate_priority_excluded_in_observed_opportunities";
  if (enginePolicy === "current" && envelope > 0) return "replay_allowance_priority_excluded_in_observed_opportunities";
  if (enginePolicy === "strict" && envelope > 0) return "strict_cadence_priority_excluded_in_observed_opportunities";
  if (enginePolicy === "baseline" && envelope > 0) return "combined_entropy_priority_excluded_in_observed_opportunities";
  if (enginePolicy === "type-first" && envelope > 0) {
    return typeFrontier === 0 ? "match_type_entropy_priority_excluded_in_observed_opportunities"
      : cadence === 0 ? "immediate_replay_priority_excluded_in_observed_opportunities"
        : relationshipFrontier === 0 ? "relationship_entropy_priority_excluded_in_observed_opportunities"
          : "soft_cadence_priority_excluded_in_observed_opportunities";
  }
  if (enginePolicy === "replay-envelope" && envelope > 0) {
    return replayAllowance === 0
      ? "replay_allowance_priority_excluded_in_observed_opportunities"
      : "combined_entropy_priority_excluded_in_observed_opportunities";
  }
  if (strong > 0 && envelope === 0) return "excluded_by_balance_envelope_in_observed_opportunities";
  return "never_in_strongest_rotation_class_during_observed_refills";
}

/** Lower values mean the independent candidate has higher priority for this measured engine policy. */
function compareCandidatePolicyPriority(
  left: OracleCandidate,
  right: OracleCandidate,
  enginePolicy: BenchmarkEnginePolicy,
  audit: RotationAudit,
  sessionType: SessionType
) {
  let comparison = 0;
  if (enginePolicy === "strict") {
    comparison = compareNumberVectors(left.rest, right.rest) ||
      right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
      compareNumberVectors(left.softRest, right.softRest);
  } else if (enginePolicy === "baseline") {
    comparison = right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
      compareNumberVectors(getLegacySocialRestVectorForBenchmark(left.softRest), getLegacySocialRestVectorForBenchmark(right.softRest));
  } else if (enginePolicy === "type-first") {
    comparison = right.effectiveMatchTypeGain - left.effectiveMatchTypeGain ||
      left.zeroRestCount - right.zeroRestCount ||
      right.effectiveRelationshipGain - left.effectiveRelationshipGain ||
      compareNumberVectors(left.softRest, right.softRest);
  } else {
    const allowed = enginePolicy === "current" ? audit.replayAllowanceKeys : audit.legacyReplayAllowanceKeys;
    const leftAllowed = allowed.has(exactCandidateKey(left.ids, left.partition));
    const rightAllowed = allowed.has(exactCandidateKey(right.ids, right.partition));
    comparison = leftAllowed !== rightAllowed ? (leftAllowed ? -1 : 1)
      : right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
        compareNumberVectors(left.softRest, right.softRest);
  }
  if (comparison !== 0) return comparison;
  if (sessionType !== SessionType.SOCIAL_MIX && left.balanceGap !== right.balanceGap) {
    return left.balanceGap - right.balanceGap;
  }
  return 0;
}

function buildUnseenRelationships(
  enginePolicy: BenchmarkEnginePolicy,
  opportunities: RelationshipCounts,
  observed: RelationshipCounts,
  strongCounts: Record<string, number>,
  envelopeCounts: Record<string, number>,
  typeFrontierCounts: Record<string, number>,
  cadenceCounts: Record<string, number>,
  relationshipFrontierCounts: Record<string, number>,
  softFrontierCounts: Record<string, number>,
  replayMinimumCounts: Record<string, number>,
  replayAllowanceCounts: Record<string, number>,
  combinedEntropyCounts: Record<string, number>,
  combinedSoftCounts: Record<string, number>,
  policyAdmissionCounts: Record<string, number>,
  policyEntropyCounts: Record<string, number>,
  policyFinalCounts: Record<string, number>,
  coverageGateRejectedCounts: Record<string, number>
) {
  const unseen: MissingRelationship[] = [];
  for (const facet of RELATION_FACETS) {
    for (const relationship of opportunities[facet].keys()) {
      const key = `${facet}:${relationship}`;
      if (observed[facet].has(relationship)) continue;
      const strong = strongCounts[key] ?? 0;
      const envelope = envelopeCounts[key] ?? 0;
      const typeFrontier = typeFrontierCounts[key] ?? 0;
      const cadence = cadenceCounts[key] ?? 0;
      const relationshipFrontier = relationshipFrontierCounts[key] ?? 0;
      const softFrontier = softFrontierCounts[key] ?? 0;
      const replayMinimum = replayMinimumCounts[key] ?? 0;
      const replayAllowance = replayAllowanceCounts[key] ?? 0;
      const combinedEntropy = combinedEntropyCounts[key] ?? 0;
      const combinedSoft = combinedSoftCounts[key] ?? 0;
      const policyAdmission = policyAdmissionCounts[key] ?? 0;
      const policyEntropy = policyEntropyCounts[key] ?? 0;
      const policyFinal = policyFinalCounts[key] ?? 0;
      const gateRejected = coverageGateRejectedCounts[key] ?? 0;
      const classification = classifyMissingRelationshipForBenchmark(enginePolicy, {
        strong, envelope, typeFrontier, cadence, relationshipFrontier,
        replayAllowance,
        policyAdmission, policyEntropy, policyFinal, gateRejected,
      });
      unseen.push({
        measuredPolicy: enginePolicy,
        frontierDiagnosticPolicy: "current-coverage-gated-oracle",
        facet,
        players: relationship.split("|") as [string, string],
        observedStrongRotationOpportunities: strong,
        observedBalanceEnvelopeOpportunities: envelope,
        observedMatchTypeFrontierOpportunities: typeFrontier,
        observedCadenceAdmissibleOpportunities: cadence,
        observedRelationshipEntropyFrontierOpportunities: relationshipFrontier,
        observedSoftCadenceFrontierOpportunities: softFrontier,
        observedReplayMinimumOpportunities: replayMinimum,
        observedReplayAllowanceOpportunities: replayAllowance,
        observedCombinedEntropyFrontierOpportunities: combinedEntropy,
        observedCombinedSoftCadenceFrontierOpportunities: combinedSoft,
        observedPolicyAdmissionOpportunities: policyAdmission,
        observedPolicyEntropyFrontierOpportunities: policyEntropy,
        observedPolicyFinalFrontierOpportunities: policyFinal,
        observedCoverageGateRejectedPlusOneOpportunities: gateRejected,
        classification,
      });
    }
  }
  return unseen.sort((a, b) => a.facet.localeCompare(b.facet) || a.players.join("|").localeCompare(b.players.join("|")));
}

function getCountMapAsObject(counts: RelationshipCounts) {
  return Object.fromEntries(RELATION_FACETS.map((facet) => [facet, Object.fromEntries(counts[facet])])) as Record<string, Record<string, number>>;
}

function createSessionResult(
  profile: BenchmarkProfile,
  sessionType: SessionType,
  seed: number,
  targetMatches = 400,
  enginePolicy: "current" | "strict" | "baseline" | "type-first" | "replay-envelope" = "current",
  captureCompletedHistory = false,
  coverageGainMetric: BenchmarkCoverageGainMetric = "legacy-equal",
  socialPriorityPolicy: "production" | "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue" = "production"
): BenchmarkSessionResult {
  const socialPriorityEnabled = socialPriorityPolicy !== "production";
  const socialPriorityStrictEnabled = socialPriorityPolicy === "courtmate-first";
  const socialCourtmateRescueEnabled = socialPriorityPolicy === "courtmate-near-best";
  const socialCourtmateBeneficialRescueEnabled = socialPriorityPolicy === "courtmate-beneficial-rescue";
  if (socialPriorityEnabled && sessionType !== SessionType.SOCIAL_MIX) {
    throw new Error("The courtmate priority experiments are only available for Social/Mixed sessions.");
  }
  if (socialPriorityEnabled && enginePolicy !== "current") {
    throw new Error("The courtmate priority experiments require the current rotation matcher architecture.");
  }
  const startTime = performance.now();
  const players = createRoster(sessionType, profile);
  const latentRankStrengths = players.map((_player, index) => PLAYER_COUNT - index - 1);
  const externalCompletionSchedule = seededExternalSchedule(seed, targetMatches);
  const matcherRandom = seededRandom(seed);
  const completed: SocialHistoryMatch[] = [];
  const active = new Map<0 | 1, ActiveAssignment>();
  const decisions = new Map<number, DecisionMeta>();
  const waits = new Map(players.map((player) => [player.userId, emptyWaitMeta()]));
  const lastCompletedEvent = new Map<string, number>();
  const completedRestGaps: number[] = [];
  const assignmentRestGaps: number[] = [];
  const fiveGapEpisodes: FiveGapEpisode[] = [];
  const thresholdsByPlayer = new Map(players.map((player) => [player.userId, { plusOne: 0, plusTwo: 0 }]));
  const socialCourtmateRescue: MutableSocialCourtmateRescueCounters = {
    startedDecisions: 0,
    auditCompletedDecisions: 0,
    certifiedDecisions: 0,
    uncertifiedDecisions: 0,
    rankingDiscrepancies: 0,
    fairnessCertificateFailures: 0,
    starvationSafetyFailures: 0,
    gMaxCertificationFailures: 0,
    admissionFailures: 0,
    searchLimitDecisions: 0,
    incompleteAuditDecisions: 0,
    counterfactualStartedDecisions: 0,
    counterfactualAuditCompletedDecisions: 0,
    counterfactualCertifiedDecisions: 0,
    counterfactualUncertifiedDecisions: 0,
    counterfactualRankingDiscrepancies: 0,
    counterfactualFairnessCertificateFailures: 0,
    counterfactualGMaxCertificationFailures: 0,
    counterfactualAdmissionFailures: 0,
    counterfactualSearchLimitDecisions: 0,
    counterfactualIncompleteAuditDecisions: 0,
    rollingTypeGainDenominator: "1",
    witnesses: [],
    counterfactualWitnesses: [],
  };
  const socialCourtmateBeneficialRescue: MutableSocialCourtmateBeneficialRescueCounters = {
    startedDecisions: 0,
    auditCompletedDecisions: 0,
    certifiedDecisions: 0,
    uncertifiedDecisions: 0,
    rankingDiscrepancies: 0,
    fairnessCertificateFailures: 0,
    starvationSafetyFailures: 0,
    gMaxCertificationFailures: 0,
    admissionFailures: 0,
    searchLimitDecisions: 0,
    incompleteAuditDecisions: 0,
    counterfactualStartedDecisions: 0,
    counterfactualAuditCompletedDecisions: 0,
    counterfactualCertifiedDecisions: 0,
    counterfactualUncertifiedDecisions: 0,
    counterfactualRankingDiscrepancies: 0,
    counterfactualFairnessCertificateFailures: 0,
    counterfactualGMaxCertificationFailures: 0,
    counterfactualAdmissionFailures: 0,
    counterfactualSearchLimitDecisions: 0,
    counterfactualIncompleteAuditDecisions: 0,
    rollingTypeGainDenominator: "1",
    witnesses: [],
    counterfactualWitnesses: [],
  };
  const counters = {
    backToBackCount: 0,
    eligibleAssignments: 0,
    reachedIdealPlusOne: 0,
    reachedIdealPlusTwo: 0,
    starvationDecisions: 0,
    overduePlayerEvents: 0,
    starvationInterventions: 0,
    starvationCertified: 0,
    starvationUncertified: 0,
    completedOptimizerDecisions: 0,
    optimizerCallCount: 0,
    ordinaryOptimizerMs: 0,
    counterfactualWrapperCallCount: 0,
    counterfactualWrapperMs: 0,
    optimizerSearchLimitCount: 0,
    fairnessCertificateFailures: 0,
    starvationCertificateFailures: 0,
    balanceCertificateFailures: 0,
    incompleteCounterfactualCalls: 0,
    maximumBalanceGap: 0,
    maximumFairnessSpread: 0,
    minimumFairnessSpread: Number.POSITIVE_INFINITY,
    externalBusyEventCount: 0,
    maximumObservedAvailableRestTurns: 0,
    refillDecisionCount: 0,
    selectedMatchTypeGainTotal: 0,
    selectedRelationshipGainTotal: 0,
    typePriorityOverrideCount: 0,
    typePriorityPolicyApplied: false,
    replayEnvelopePolicyApplied: !socialPriorityEnabled && (enginePolicy === "current" || enginePolicy === "replay-envelope"),
    productionReplayCertified: 0,
    productionReplayUncertified: 0,
    productionReplayEnvelopeCertified: 0,
    noStarvationReplayRefillDecisions: 0,
    noStarvationReplayCertified: 0,
    noStarvationReplayUncertified: 0,
    noStarvationReplayEnvelopeCertified: 0,
    noStarvationCounterfactualDecisions: 0,
    acceptedPlusOneDecisions: 0,
    betterEntropyBeyondAllowanceDecisions: 0,
    betterEntropyBeyondAllowanceCandidateCount: 0,
    coverageGatePolicyApplied: enginePolicy === "current" && !socialPriorityEnabled,
    coverageGateCertified: 0,
    coverageGateUncertified: 0,
    noStarvationCoverageGateCertified: 0,
    noStarvationCoverageGateUncertified: 0,
    plusOneAvailableDecisions: 0,
    plusOneAvailableCandidates: 0,
    plusOneCoverageEligibleDecisions: 0,
    plusOneCoverageEligibleCandidates: 0,
    plusOneSelectedDecisions: 0,
    plusOneSelectedCandidates: 0,
    plusOneRejectedWithoutImprovedCoverageDecisions: 0,
    plusOneRejectedWithoutImprovedCoverageCandidates: 0,
    zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions: 0,
    zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates: 0,
    acceptedGreaterCoverageDecisions: 0,
    acceptedGreaterCoverageCandidates: 0,
    higherEntropyBeyondAllowanceDecisions: 0,
    higherEntropyBeyondAllowanceCandidates: 0,
    coverageGateWitnesses: [] as CoverageGateWitness[],
    replayEnvelopeWitnesses: [] as ReplayEnvelopeWitness[],
    fivePlusCompletedRestEpisodes: 0,
    fivePlusEpisodesLinkedAcceptedPlusOneReplay: 0,
    fivePlusEpisodesLinkedOtherRestZeroReplay: 0,
    fivePlusEpisodesWithoutLinkedRestZeroReplay: 0,
    socialPriorityPolicyApplied: socialPriorityEnabled,
    socialPriorityStrictPolicyApplied: socialPriorityStrictEnabled,
    socialPriorityObjectiveDecisions: 0,
    socialPriorityObjectiveCertifiedDecisions: 0,
    socialPriorityObjectiveUncertifiedDecisions: 0,
    socialPriorityRankingDiscrepancies: 0,
    socialPriorityFairnessCertificateFailures: 0,
    socialPriorityStarvationSafetyFailures: 0,
    socialPrioritySearchLimitDecisions: 0,
    socialPriorityIncompleteCounterfactualDecisions: 0,
    socialPriorityCounterfactualAuditDecisions: 0,
    socialPriorityCounterfactualCertifiedDecisions: 0,
    socialPriorityCounterfactualUncertifiedDecisions: 0,
    socialPriorityCounterfactualRankingDiscrepancies: 0,
    socialPriorityCounterfactualFairnessCertificateFailures: 0,
    socialPriorityCounterfactualSearchLimitDecisions: 0,
    socialPriorityCounterfactualIncompleteDecisions: 0,
    socialCourtmateRescuePolicyApplied: socialCourtmateRescueEnabled,
    socialCourtmateRescue,
    socialCourtmateBeneficialRescuePolicyApplied: socialCourtmateBeneficialRescueEnabled,
    socialCourtmateBeneficialRescue,
  };
  const opportunities = createStructuralOpportunityCounts(players);
  const observed: RelationshipCounts = { courtmates: new Map(), partners: new Map(), opponents: new Map() };
  const strongRelationshipCounts: Record<string, number> = {};
  const envelopeRelationshipCounts: Record<string, number> = {};
  const matchTypeFrontierRelationshipCounts: Record<string, number> = {};
  const cadenceRelationshipCounts: Record<string, number> = {};
  const relationshipEntropyFrontierRelationshipCounts: Record<string, number> = {};
  const softCadenceFrontierRelationshipCounts: Record<string, number> = {};
  const replayMinimumRelationshipCounts: Record<string, number> = {};
  const replayAllowanceRelationshipCounts: Record<string, number> = {};
  const combinedEntropyFrontierRelationshipCounts: Record<string, number> = {};
  const combinedSoftCadenceFrontierRelationshipCounts: Record<string, number> = {};
  const policyAdmissionRelationshipCounts: Record<string, number> = {};
  const policyEntropyFrontierRelationshipCounts: Record<string, number> = {};
  const policyFinalFrontierRelationshipCounts: Record<string, number> = {};
  const coverageGateRejectedPlusOneRelationshipCounts: Record<string, number> = {};
  const typePriorityOverrideWitnesses: TypePriorityOverrideWitness[] = [];
  const lastReplayInitiation = new Map<string, ReplayInitiationTrace>();
  let nextDecisionId = 1;
  let openingDecisionId = 0;

  const assignSelection = (
    court: 0 | 1,
    selection: { partition: V3DoublesPartition; ids: string[]; balanceGap: number },
    decisionId: number,
    decisionMeta: DecisionMeta,
    audit: RotationAudit | null = null,
    completedEventIndex = 0,
    replayContext: ReplayAssignmentContext | null = null
  ) => {
    const assignmentId = `decision-${decisionId}-court-${court}`;
    const assignment = makeActiveAssignment(
      court,
      selection,
      players,
      decisionId,
      decisionMeta,
      assignmentId,
      completedEventIndex,
      audit,
      lastCompletedEvent,
      enginePolicy,
      replayContext
    );
    active.set(court, assignment);
  };

  const callOptimizer = (courtCount: number) => {
    counters.optimizerCallCount += 1;
    const available = players.filter((player) => !player.isBusy && !player.isPaused);
    const overdueAvailable = getOverduePlayerCount(available);
    const options = {
      courtCount,
      rotationPlayerCount: PLAYER_COUNT,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      respectPlayerRest: true,
      completedMatches: completed,
      ...(socialPriorityEnabled ? { socialPriorityPolicy } : {}),
      ...(coverageGainMetric === "social-horizon-321" || coverageGainMetric === "rolling-equal" ||
          coverageGainMetric === "social-horizon-3211" ? { coverageGainMetric } : {}),
      socialHistoryMatches: [...completed, ...[...active.values()].map((assignment) => ({
        id: `active-${assignment.decisionId}-${assignment.court}`,
        ...assignment.partition,
        socialVariety: assignment.socialVariety,
      }))],
      randomFn: matcherRandom,
    };
    type OptimizerResult = ReturnType<typeof rotationApi.findBestRotationBatchSelection<BenchmarkPlayer>>;
    const snapshotResult = (candidate: OptimizerResult): CounterfactualSelectionProof => {
      const resultReplay = candidate as OptimizerResult & {
        bestImmediateReplayCount?: number | null;
        allowedImmediateReplayCount?: number | null;
        chosenImmediateReplayCount?: number | null;
        replayCertified?: boolean;
        replayEnvelopeStatus?: CounterfactualSelectionProof["replayEnvelopeStatus"];
        bestMinimumReplayCoverageGain?: number | null;
        chosenImmediateCoverageGain?: number | null;
        coverageGateCertified?: boolean | null;
        coverageGateStatus?: CounterfactualSelectionProof["coverageGateStatus"];
        chosenReplayCoverageEligible?: boolean | null;
        coverageGainMetric?: CounterfactualSelectionProof["coverageGainMetric"];
        socialPriorityPolicy?: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue";
        priorityCertified?: boolean;
        courtmateGainMaximumCertified?: boolean;
        courtmateGainMaximum?: number | null;
        chosenCourtmateGainDeficit?: number | null;
        bestRollingMatchTypeGainAtGmax?: number | null;
        chosenNewCourtmatePairCount?: number | null;
        chosenRollingMatchTypeGain?: number | null;
        chosenPostBatchCourtmateCoverage?: Array<{ userId: string; covered: number; possible: number }> | null;
      };
      const debug = candidate.debug as unknown as {
        bestImmediateReplayCount?: number | null;
        allowedImmediateReplayCount?: number | null;
        chosenImmediateReplayCount?: number | null;
        replayCertified?: boolean;
        replayEnvelopeStatus?: CounterfactualSelectionProof["replayEnvelopeStatus"];
        bestMinimumReplayCoverageGain?: number | null;
        chosenImmediateCoverageGain?: number | null;
        coverageGateCertified?: boolean | null;
        coverageGateStatus?: CounterfactualSelectionProof["coverageGateStatus"];
        chosenReplayCoverageEligible?: boolean | null;
        coverageGainMetric?: CounterfactualSelectionProof["coverageGainMetric"];
        socialPriorityPolicy?: "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue";
        priorityCertified?: boolean;
        courtmateGainMaximumCertified?: boolean;
        courtmateGainMaximum?: number | null;
        chosenCourtmateGainDeficit?: number | null;
        bestRollingMatchTypeGainAtGmax?: number | null;
        chosenNewCourtmatePairCount?: number | null;
        chosenRollingMatchTypeGain?: number | null;
        chosenPostBatchCourtmateCoverage?: Array<{ userId: string; covered: number; possible: number }> | null;
      };
      return {
        selections: candidate.selection?.selections.map((selection) => ({
          ids: [...selection.ids], partition: selection.partition, balanceGap: selection.balanceGap,
        })) ?? [],
        fairnessCertified: candidate.fairnessCertified,
        starvationCertified: candidate.starvationCertified,
        varietyOptimal: candidate.varietyOptimal,
        priorityCertified: resultReplay.priorityCertified ?? debug.priorityCertified,
        balanceCertified: candidate.balanceCertified,
        bestImmediateReplayCount: resultReplay.bestImmediateReplayCount ?? debug.bestImmediateReplayCount ?? null,
        allowedImmediateReplayCount: resultReplay.allowedImmediateReplayCount ?? debug.allowedImmediateReplayCount ?? null,
        chosenImmediateReplayCount: resultReplay.chosenImmediateReplayCount ?? debug.chosenImmediateReplayCount ?? null,
        replayCertified: resultReplay.replayCertified ?? debug.replayCertified ?? null,
        replayEnvelopeStatus: resultReplay.replayEnvelopeStatus ?? debug.replayEnvelopeStatus ?? null,
        bestMinimumReplayCoverageGain: resultReplay.bestMinimumReplayCoverageGain ?? debug.bestMinimumReplayCoverageGain ?? null,
        chosenImmediateCoverageGain: resultReplay.chosenImmediateCoverageGain ?? debug.chosenImmediateCoverageGain ?? null,
        coverageGateCertified: resultReplay.coverageGateCertified ?? debug.coverageGateCertified ?? null,
        coverageGateStatus: resultReplay.coverageGateStatus ?? debug.coverageGateStatus ?? null,
        chosenReplayCoverageEligible: resultReplay.chosenReplayCoverageEligible ?? debug.chosenReplayCoverageEligible ?? null,
        coverageGainMetric: resultReplay.coverageGainMetric ?? debug.coverageGainMetric ?? null,
        socialPriorityPolicy: resultReplay.socialPriorityPolicy ?? debug.socialPriorityPolicy ?? null,
        courtmateGainMaximumCertified: resultReplay.courtmateGainMaximumCertified ?? debug.courtmateGainMaximumCertified,
        courtmateGainMaximum: resultReplay.courtmateGainMaximum ?? debug.courtmateGainMaximum,
        chosenCourtmateGainDeficit: resultReplay.chosenCourtmateGainDeficit ?? debug.chosenCourtmateGainDeficit,
        bestRollingMatchTypeGainAtGmax: resultReplay.bestRollingMatchTypeGainAtGmax ?? debug.bestRollingMatchTypeGainAtGmax,
        chosenNewCourtmatePairCount: resultReplay.chosenNewCourtmatePairCount ?? debug.chosenNewCourtmatePairCount,
        chosenRollingMatchTypeGain: resultReplay.chosenRollingMatchTypeGain ?? debug.chosenRollingMatchTypeGain,
        chosenPostBatchCourtmateCoverage: resultReplay.chosenPostBatchCourtmateCoverage ?? debug.chosenPostBatchCourtmateCoverage,
        searchLimitReached: candidate.debug.searchLimitReached,
      };
    };
    const recordResultDiagnostics = (result: OptimizerResult) => {
      if (result.debug.searchLimitReached) counters.optimizerSearchLimitCount += 1;
      if (!result.fairnessCertified) counters.fairnessCertificateFailures += 1;
      if (!result.starvationCertified) counters.starvationCertificateFailures += 1;
      if ((sessionType === SessionType.POINTS || sessionType === SessionType.ELO) && !result.balanceCertified) {
        counters.balanceCertificateFailures += 1;
      }
    };
    const diagnostic = (rotationApi as unknown as {
      measureRotationStarvationIntervention?: (
        players: BenchmarkPlayer[],
        options: RotationBatchOptions<BenchmarkPlayer>
      ) => { production: OptimizerResult; withoutStarvation: OptimizerResult; selectedSetChanged: boolean | null; measurementComplete: boolean };
    }).measureRotationStarvationIntervention;
    if (overdueAvailable > 0 && diagnostic) {
      const callStarted = performance.now();
      const measured = diagnostic(players, options);
      counters.counterfactualWrapperCallCount += 1;
      counters.counterfactualWrapperMs += performance.now() - callStarted;
      const result = measured.production;
      recordResultDiagnostics(result);
      recordResultDiagnostics(measured.withoutStarvation);
      if (!measured.measurementComplete) counters.incompleteCounterfactualCalls += 1;
      const meta: DecisionMeta = {
        pendingAssignments: result.selection?.selections.length ?? 0,
        overdueAvailable,
        overduePlayerCount: available.filter((player) => player.restTurns > IDEAL_REST_GAP).length,
        counterfactualComplete: measured.measurementComplete,
        counterfactualChanged: measured.selectedSetChanged,
      };
      return {
        result, meta, audit: null as RotationAudit | null,
        productionProof: snapshotResult(result),
        withoutStarvation: snapshotResult(measured.withoutStarvation),
      };
    }
    const callStarted = performance.now();
    const result = rotationApi.findBestRotationBatchSelection(players, options);
    counters.ordinaryOptimizerMs += performance.now() - callStarted;
    recordResultDiagnostics(result);
    const meta: DecisionMeta = {
      pendingAssignments: result.selection?.selections.length ?? 0,
      overdueAvailable,
      overduePlayerCount: available.filter((player) => player.restTurns > IDEAL_REST_GAP).length,
      counterfactualComplete: overdueAvailable === 0,
      counterfactualChanged: overdueAvailable === 0 ? false : null,
    };
    return {
      result, meta, audit: null as RotationAudit | null,
      productionProof: snapshotResult(result),
      // With no overdue players, starvation has an all-zero vector, so this
      // production selection is also its no-starvation counterfactual.
      withoutStarvation: overdueAvailable === 0 ? snapshotResult(result) : null,
    };
  };

  const recordSocialPriorityDecision = (
    proof: CounterfactualSelectionProof,
    searchLimitReached: boolean,
    courtCount: 1 | 2,
    label: string,
    respectStarvation = true,
    counterfactualAudit = false
  ): boolean => {
    if (!socialPriorityStrictEnabled) return false;
    if (counterfactualAudit) {
      counters.socialPriorityCounterfactualAuditDecisions += 1;
      if (searchLimitReached) counters.socialPriorityCounterfactualSearchLimitDecisions += 1;
    } else {
      counters.socialPriorityObjectiveDecisions += 1;
      if (searchLimitReached) counters.socialPrioritySearchLimitDecisions += 1;
    }
    if (!proof.fairnessCertified) {
      if (counterfactualAudit) counters.socialPriorityCounterfactualFairnessCertificateFailures += 1;
      else counters.socialPriorityFairnessCertificateFailures += 1;
    }
    if (respectStarvation && !proof.starvationCertified) counters.socialPriorityStarvationSafetyFailures += 1;
    const independent = auditCourtmatePrioritySelection(players, completed, proof.selections, courtCount, respectStarvation);
    const rankingMatches = independent.complete && independent.candidateCount > 0 &&
      independent.bestObjective !== null && independent.selectedObjective !== null &&
      compareSocialPriorityObjectives(independent.selectedObjective, independent.bestObjective) === 0;
    if (!rankingMatches) {
      if (counterfactualAudit) counters.socialPriorityCounterfactualRankingDiscrepancies += 1;
      else counters.socialPriorityRankingDiscrepancies += 1;
    }
    if (!independent.selectedFairnessCertified) {
      if (counterfactualAudit) counters.socialPriorityCounterfactualFairnessCertificateFailures += 1;
      else counters.socialPriorityFairnessCertificateFailures += 1;
    }
    if (respectStarvation && !independent.selectedStarvationCertified) counters.socialPriorityStarvationSafetyFailures += 1;
    const policyEchoed = proof.socialPriorityPolicy === "courtmate-first";
    const certified = policyEchoed && proof.varietyOptimal && proof.priorityCertified === true && !searchLimitReached && independent.complete &&
      independent.candidateCount > 0 && independent.selectedFairnessCertified && rankingMatches &&
      (!respectStarvation || (proof.starvationCertified && independent.selectedStarvationCertified));
    if (counterfactualAudit) {
      if (certified) counters.socialPriorityCounterfactualCertifiedDecisions += 1;
      else counters.socialPriorityCounterfactualUncertifiedDecisions += 1;
    } else if (certified) counters.socialPriorityObjectiveCertifiedDecisions += 1;
    else counters.socialPriorityObjectiveUncertifiedDecisions += 1;
    if (!policyEchoed) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: matcher did not echo courtmate-first policy for ${label}.`);
    }
    return certified;
  };

  const recordSocialCourtmateRescueDecision = (
    proof: CounterfactualSelectionProof | null,
    searchLimitReached: boolean,
    courtCount: 1 | 2,
    label: string,
    afterCompletedMatches: number,
    respectStarvation = true,
    counterfactualAudit = false
  ): { certified: boolean; witness: SocialCourtmateRescueDecisionWitness } => {
    const rescue = counters.socialCourtmateRescue;
    if (counterfactualAudit) {
      rescue.counterfactualStartedDecisions += 1;
      if (searchLimitReached) rescue.counterfactualSearchLimitDecisions += 1;
    } else {
      rescue.startedDecisions += 1;
      if (searchLimitReached) rescue.searchLimitDecisions += 1;
    }
    const selections = proof?.selections ?? [];
    const independent = auditCourtmatePrioritySelection(
      players,
      completed,
      selections,
      courtCount,
      respectStarvation,
      "courtmate-near-best"
    );
    const selectedObjective = independent.selectedObjective;
    const bestObjective = independent.bestObjective;
    const selectedGain = selectedObjective?.newCourtmatePairs ?? null;
    const selectedDeficit = independent.courtmateGainMaximum !== null && selectedGain !== null
      ? independent.courtmateGainMaximum - selectedGain
      : null;
    const selectedRollingTypeGain = selectedObjective
      ? Number(selectedObjective.signedRollingTypeDelta) / Number(independent.rollingTypeDenominator)
      : null;
    const maxRollingTypeGainAtGmax = independent.bestRollingMatchTypeGainAtGmax !== null
      ? Number(independent.bestRollingMatchTypeGainAtGmax) / Number(independent.rollingTypeDenominator)
      : null;
    const incrementalTGainVsBestFullGainCandidate = selectedRollingTypeGain !== null && maxRollingTypeGainAtGmax !== null
      ? selectedRollingTypeGain - maxRollingTypeGainAtGmax
      : null;
    const close = (left: number | null | undefined, right: number | null | undefined) =>
      left !== null && left !== undefined && right !== null && right !== undefined && Math.abs(left - right) < 1e-9;
    const rankingMatches = independent.complete && independent.candidateCount > 0 && bestObjective !== null &&
      selectedObjective !== null && compareSocialPriorityObjectives(
        selectedObjective,
        bestObjective,
        "courtmate-near-best"
      ) === 0;
    const engineProfile = proof?.chosenPostBatchCourtmateCoverage ?? null;
    const independentProfile = selectedObjective?.ascendingCoverageProfile ?? [];
    const courtmateCoverageProfileMatches = Boolean(engineProfile && engineProfile.length === independentProfile.length &&
      engineProfile.every((entry, index) => entry.userId === independentProfile[index]?.userId &&
        entry.covered === independentProfile[index]?.covered && entry.possible === independentProfile[index]?.possible));
    const selectedInEnvelope = selectedDeficit !== null && selectedDeficit >= 0 && selectedDeficit <= 1;
    const policyEchoed = proof?.socialPriorityPolicy === "courtmate-near-best";
    const gMaxCertified = independent.courtmateGainMaximumCertified &&
      proof?.courtmateGainMaximumCertified === true &&
      close(proof.courtmateGainMaximum, independent.courtmateGainMaximum) &&
      close(proof.bestRollingMatchTypeGainAtGmax, maxRollingTypeGainAtGmax);
    const admissionCertified = selectedInEnvelope &&
      close(proof?.chosenCourtmateGainDeficit, selectedDeficit) &&
      close(proof?.chosenNewCourtmatePairCount, selectedGain) &&
      close(proof?.chosenRollingMatchTypeGain, selectedRollingTypeGain);
    const fairnessCertified = Boolean(proof?.fairnessCertified && independent.selectedFairnessCertified);
    const starvationCertified = !respectStarvation || Boolean(proof?.starvationCertified && independent.selectedStarvationCertified);
    const certified = Boolean(policyEchoed && proof?.varietyOptimal && proof.priorityCertified === true &&
      !searchLimitReached && independent.complete && independent.candidateCount > 0 &&
      independent.admittedCandidateCount > 0 && fairnessCertified && starvationCertified &&
      gMaxCertified && admissionCertified && rankingMatches && courtmateCoverageProfileMatches);
    if (counterfactualAudit) {
      if (independent.complete) rescue.counterfactualAuditCompletedDecisions += 1;
      if (!rankingMatches || !courtmateCoverageProfileMatches) rescue.counterfactualRankingDiscrepancies += 1;
      if (!fairnessCertified) rescue.counterfactualFairnessCertificateFailures += 1;
      if (!gMaxCertified) rescue.counterfactualGMaxCertificationFailures += 1;
      if (!admissionCertified) rescue.counterfactualAdmissionFailures += 1;
      if (certified) rescue.counterfactualCertifiedDecisions += 1;
      else rescue.counterfactualUncertifiedDecisions += 1;
      if (!independent.complete) rescue.counterfactualIncompleteAuditDecisions += 1;
    } else {
      if (independent.complete) rescue.auditCompletedDecisions += 1;
      if (!rankingMatches || !courtmateCoverageProfileMatches) rescue.rankingDiscrepancies += 1;
      if (!fairnessCertified) rescue.fairnessCertificateFailures += 1;
      if (respectStarvation && !starvationCertified) rescue.starvationSafetyFailures += 1;
      if (!gMaxCertified) rescue.gMaxCertificationFailures += 1;
      if (!admissionCertified) rescue.admissionFailures += 1;
      if (certified) rescue.certifiedDecisions += 1;
      else rescue.uncertifiedDecisions += 1;
      if (!independent.complete) rescue.incompleteAuditDecisions += 1;
    }
    if (independent.complete) {
      rescue.rollingTypeGainDenominator = independent.rollingTypeDenominator.toString();
    }
    const fullRosterContext = buildSocialVarietyContext(players, completed, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const selectedChoices: IndependentCourtChoice[] = selections.map((selection) => ({
      ids: [...selection.ids],
      partition: selection.partition,
      balanceGap: selection.balanceGap ?? 0,
      key: exactCandidateKey(selection.ids, selection.partition),
      newCourtmatePairs: 0,
    }));
    const selectedTypeState = selectedObjective ? getRescueTypeWindowWitness(selectedChoices, completed, fullRosterContext) : null;
    const bestGmaxChoices = independent.bestGmaxChoices;
    const bestGmaxTypeState = bestGmaxChoices
      ? getRescueTypeWindowWitness(bestGmaxChoices, completed, fullRosterContext)
      : null;
    const selectedBestType = bestGmaxChoices?.map((choice) => ({ ids: [...choice.ids], partition: choice.partition })) ?? null;
    const witness: SocialCourtmateRescueDecisionWitness = {
      started: true,
      completed: counterfactualAudit ? null : false,
      completedAfterMatchNumber: null,
      auditCompleted: independent.complete,
      counterfactual: counterfactualAudit,
      respectStarvation,
      label,
      afterCompletedMatches,
      courtCount,
      selectedCourts: selections.map((selection) => ({ ids: [...selection.ids].sort(), partition: selection.partition })),
      independentCandidateCount: independent.candidateCount,
      admittedCandidateCount: independent.admittedCandidateCount,
      fairnessCertified,
      starvationCertified,
      gMaxCertified,
      policyCertified: certified,
      rankingMatches,
      courtmateCoverageProfileMatches,
      searchLimitReached,
      courtMateGainMaximum: independent.courtmateGainMaximum,
      chosenCourtmateGain: selectedGain,
      chosenCourtmateGainDeficit: selectedDeficit,
      bestRollingMatchTypeGainAtGmax: maxRollingTypeGainAtGmax,
      chosenRollingMatchTypeGain: selectedRollingTypeGain,
      incrementalTGainVsBestFullGainCandidate,
      rollingTypeGainDenominator: independent.rollingTypeDenominator.toString(),
      selectedCourtmateCoverageProfile: selectedObjective?.ascendingCoverageProfile.map((row) => ({ ...row })) ?? [],
      engineCourtmateCoverageProfile: engineProfile ? engineProfile.map((row) => ({ ...row })) : null,
      bestGmaxCourts: selectedBestType,
      bestGmaxFullTypePlayerCount: bestGmaxTypeState?.fullTypePlayerCount ?? null,
      chosenFullTypePlayerCount: selectedTypeState?.fullTypePlayerCount ?? null,
      fullTypePlayerCountDeltaVsGmax: selectedTypeState && bestGmaxTypeState
        ? selectedTypeState.fullTypePlayerCount - bestGmaxTypeState.fullTypePlayerCount
        : null,
      zeroTBenefitSacrifice: selectedDeficit === 1 && incrementalTGainVsBestFullGainCandidate === 0,
      perPlayerTypeWindows: selectedDeficit === 1 ? selectedTypeState?.players ?? [] : [],
    };
    if (counterfactualAudit) rescue.counterfactualWitnesses.push(witness);
    else rescue.witnesses.push(witness);
    return { certified, witness };
  };

  const recordSocialCourtmateBeneficialRescueDecision = (
    proof: CounterfactualSelectionProof | null,
    searchLimitReached: boolean,
    courtCount: 1 | 2,
    label: string,
    afterCompletedMatches: number,
    respectStarvation = true,
    counterfactualAudit = false,
    expectedPolicy: "courtmate-beneficial-rescue" = "courtmate-beneficial-rescue"
  ): { certified: boolean; witness: SocialCourtmateBeneficialRescueDecisionWitness } => {
    const rescue = counters.socialCourtmateBeneficialRescue;
    if (counterfactualAudit) {
      rescue.counterfactualStartedDecisions += 1;
      if (searchLimitReached) rescue.counterfactualSearchLimitDecisions += 1;
    } else {
      rescue.startedDecisions += 1;
      if (searchLimitReached) rescue.searchLimitDecisions += 1;
    }
    const selections = proof?.selections ?? [];
    const independent = auditCourtmatePrioritySelection(
      players, completed, selections, courtCount, respectStarvation, expectedPolicy
    );
    const selectedObjective = independent.selectedObjective;
    const bestObjective = independent.bestObjective;
    const selectedGain = selectedObjective?.newCourtmatePairs ?? null;
    const selectedDeficit = independent.courtmateGainMaximum !== null && selectedGain !== null
      ? independent.courtmateGainMaximum - selectedGain
      : null;
    const selectedRollingTypeGain = selectedObjective
      ? Number(selectedObjective.signedRollingTypeDelta) / Number(independent.rollingTypeDenominator)
      : null;
    const maxRollingTypeGainAtGmax = independent.bestRollingMatchTypeGainAtGmax !== null
      ? Number(independent.bestRollingMatchTypeGainAtGmax) / Number(independent.rollingTypeDenominator)
      : null;
    const strictWinnerRollingTypeGain = independent.strictBestGmaxObjective
      ? Number(independent.strictBestGmaxObjective.signedRollingTypeDelta) / Number(independent.rollingTypeDenominator)
      : 0;
    const incrementalTGainVsBestFullGainCandidate = selectedRollingTypeGain !== null && maxRollingTypeGainAtGmax !== null
      ? selectedRollingTypeGain - maxRollingTypeGainAtGmax
      : null;
    const close = (left: number | null | undefined, right: number | null | undefined) =>
      left !== null && left !== undefined && right !== null && right !== undefined && Math.abs(left - right) < 1e-9;
    const rankingMatches = independent.complete && independent.candidateCount > 0 && bestObjective !== null &&
      selectedObjective !== null && compareSocialPriorityObjectives(
        selectedObjective, bestObjective, expectedPolicy
      ) === 0;
    const engineProfile = proof?.chosenPostBatchCourtmateCoverage ?? null;
    const independentProfile = selectedObjective?.ascendingCoverageProfile ?? [];
    const courtmateCoverageProfileMatches = Boolean(engineProfile && engineProfile.length === independentProfile.length &&
      engineProfile.every((entry, index) => entry.userId === independentProfile[index]?.userId &&
        entry.covered === independentProfile[index]?.covered && entry.possible === independentProfile[index]?.possible));
    const selectedAdmitted = selectedDeficit === 0 || (selectedDeficit === 1 &&
      selectedObjective !== null && independent.bestRollingMatchTypeGainAtGmax !== null &&
      selectedObjective.signedRollingTypeDelta > independent.bestRollingMatchTypeGainAtGmax);
    const policyEchoed = proof?.socialPriorityPolicy === expectedPolicy;
    const gMaxCertified = independent.courtmateGainMaximumCertified &&
      proof?.courtmateGainMaximumCertified === true &&
      close(proof.courtmateGainMaximum, independent.courtmateGainMaximum) &&
      close(proof.bestRollingMatchTypeGainAtGmax, maxRollingTypeGainAtGmax);
    const admissionCertified = selectedAdmitted &&
      close(proof?.chosenCourtmateGainDeficit, selectedDeficit) &&
      close(proof?.chosenNewCourtmatePairCount, selectedGain) &&
      close(proof?.chosenRollingMatchTypeGain, selectedRollingTypeGain);
    const fairnessCertified = Boolean(proof?.fairnessCertified && independent.selectedFairnessCertified);
    const starvationCertified = !respectStarvation || Boolean(proof?.starvationCertified && independent.selectedStarvationCertified);
    const certified = Boolean(policyEchoed && proof?.varietyOptimal && proof.priorityCertified === true &&
      !searchLimitReached && independent.complete && independent.candidateCount > 0 &&
      independent.admittedCandidateCount > 0 && fairnessCertified && starvationCertified &&
      gMaxCertified && admissionCertified && rankingMatches && courtmateCoverageProfileMatches);
    if (counterfactualAudit) {
      if (independent.complete) rescue.counterfactualAuditCompletedDecisions += 1;
      if (!rankingMatches || !courtmateCoverageProfileMatches) rescue.counterfactualRankingDiscrepancies += 1;
      if (!fairnessCertified) rescue.counterfactualFairnessCertificateFailures += 1;
      if (!gMaxCertified) rescue.counterfactualGMaxCertificationFailures += 1;
      if (!admissionCertified) rescue.counterfactualAdmissionFailures += 1;
      if (certified) rescue.counterfactualCertifiedDecisions += 1;
      else rescue.counterfactualUncertifiedDecisions += 1;
      if (!independent.complete) rescue.counterfactualIncompleteAuditDecisions += 1;
    } else {
      if (independent.complete) rescue.auditCompletedDecisions += 1;
      if (!rankingMatches || !courtmateCoverageProfileMatches) rescue.rankingDiscrepancies += 1;
      if (!fairnessCertified) rescue.fairnessCertificateFailures += 1;
      if (respectStarvation && !starvationCertified) rescue.starvationSafetyFailures += 1;
      if (!gMaxCertified) rescue.gMaxCertificationFailures += 1;
      if (!admissionCertified) rescue.admissionFailures += 1;
      if (certified) rescue.certifiedDecisions += 1;
      else rescue.uncertifiedDecisions += 1;
      if (!independent.complete) rescue.incompleteAuditDecisions += 1;
    }
    if (independent.complete) rescue.rollingTypeGainDenominator = independent.rollingTypeDenominator.toString();
    if (proof && !policyEchoed) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: matcher did not echo ${expectedPolicy} policy for ${label}.`);
    }
    const fullRosterContext = buildSocialVarietyContext(players, completed, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const selectedChoices: IndependentCourtChoice[] = selections.map((selection) => ({
      ids: [...selection.ids],
      partition: selection.partition,
      balanceGap: selection.balanceGap ?? 0,
      key: exactCandidateKey(selection.ids, selection.partition),
      newCourtmatePairs: 0,
    }));
    const selectedTypeState = selectedObjective
      ? getRescueTypeWindowWitness(selectedChoices, completed, fullRosterContext)
      : null;
    const bestGmaxChoices = independent.bestGmaxChoices;
    const bestGmaxTypeState = bestGmaxChoices
      ? getRescueTypeWindowWitness(bestGmaxChoices, completed, fullRosterContext)
      : null;
    const strictBestGmaxChoices = independent.strictBestGmaxChoices;
    const strictBestGmaxTypeState = strictBestGmaxChoices
      ? getRescueTypeWindowWitness(strictBestGmaxChoices, completed, fullRosterContext)
      : null;
    const chosenAtGmax = selectedDeficit === 0;
    const fullGmaxTBenefitVsStrict = chosenAtGmax && selectedRollingTypeGain !== null
      ? selectedRollingTypeGain - strictWinnerRollingTypeGain
      : 0;
    const witness: SocialCourtmateBeneficialRescueDecisionWitness = {
      started: true,
      completed: counterfactualAudit ? null : false,
      completedAfterMatchNumber: null,
      auditCompleted: independent.complete,
      counterfactual: counterfactualAudit,
      respectStarvation,
      label,
      afterCompletedMatches,
      courtCount,
      selectedCourts: selections.map((selection) => ({ ids: [...selection.ids].sort(), partition: selection.partition })),
      independentCandidateCount: independent.candidateCount,
      admittedCandidateCount: independent.admittedCandidateCount,
      fairnessCertified,
      starvationCertified,
      gMaxCertified,
      policyCertified: certified,
      rankingMatches,
      courtmateCoverageProfileMatches,
      searchLimitReached,
      courtMateGainMaximum: independent.courtmateGainMaximum,
      chosenCourtmateGain: selectedGain,
      chosenCourtmateGainDeficit: selectedDeficit,
      bestRollingMatchTypeGainAtGmax: maxRollingTypeGainAtGmax,
      chosenRollingMatchTypeGain: selectedRollingTypeGain,
      incrementalTGainVsBestFullGainCandidate,
      rollingTypeGainDenominator: independent.rollingTypeDenominator.toString(),
      selectedCourtmateCoverageProfile: selectedObjective?.ascendingCoverageProfile.map((row) => ({ ...row })) ?? [],
      engineCourtmateCoverageProfile: engineProfile ? engineProfile.map((row) => ({ ...row })) : null,
      bestGmaxCourts: bestGmaxChoices?.map((choice) => ({ ids: [...choice.ids], partition: choice.partition })) ?? null,
      bestGmaxFullTypePlayerCount: bestGmaxTypeState?.fullTypePlayerCount ?? null,
      chosenFullTypePlayerCount: selectedTypeState?.fullTypePlayerCount ?? null,
      fullTypePlayerCountDeltaVsGmax: selectedTypeState && bestGmaxTypeState
        ? selectedTypeState.fullTypePlayerCount - bestGmaxTypeState.fullTypePlayerCount
        : null,
      zeroTBenefitSacrifice: selectedDeficit === 1 && incrementalTGainVsBestFullGainCandidate === 0,
      perPlayerTypeWindows: selectedDeficit === 1 ? selectedTypeState?.players ?? [] : [],
      strictWinnerRollingMatchTypeGainAtGmax: strictWinnerRollingTypeGain,
      strictWinnerAtGmaxCourts: strictBestGmaxChoices?.map((choice) => ({
        ids: [...choice.ids], partition: choice.partition,
      })) ?? [],
      strictWinnerAtGmaxFullTypePlayerCount: strictBestGmaxTypeState?.fullTypePlayerCount ?? 0,
      fullGmaxTBenefitVsStrict,
    };
    if (counterfactualAudit) rescue.counterfactualWitnesses.push(witness);
    else rescue.witnesses.push(witness);
    return { certified, witness };
  };

  const opening = callOptimizer(COURT_COUNT);
  if (!opening.result.selection || opening.result.selection.selections.length !== COURT_COUNT) {
    throw new Error(`${sessionType}/${profile}/seed ${seed}: opening two-court batch failed (${opening.result.debug.failureReason})`);
  }
  openingDecisionId = nextDecisionId++;
  opening.meta.pendingAssignments = opening.result.selection.selections.length;
  if (socialPriorityStrictEnabled) {
    recordSocialPriorityDecision(
      opening.productionProof,
      opening.result.debug.searchLimitReached,
      2,
      "opening two-court batch"
    );
  }
  if (socialCourtmateRescueEnabled) {
    opening.meta.socialCourtmateRescueWitness = recordSocialCourtmateRescueDecision(
      opening.productionProof,
      opening.result.debug.searchLimitReached,
      2,
      "opening two-court batch",
      0
    ).witness;
  }
  if (socialCourtmateBeneficialRescueEnabled) {
    opening.meta.socialCourtmateBeneficialRescueWitness = recordSocialCourtmateBeneficialRescueDecision(
      opening.productionProof,
      opening.result.debug.searchLimitReached,
      2,
      "opening two-court batch",
      0
    ).witness;
  }
  decisions.set(openingDecisionId, opening.meta);
  for (const [courtIndex, selection] of opening.result.selection.selections.entries()) {
    const court = courtIndex as 0 | 1;
    assignSelection(court, selection, openingDecisionId, opening.meta);
    counters.maximumBalanceGap = Math.max(counters.maximumBalanceGap, selection.balanceGap);
  }

  const checkpointResults: Record<string, BenchmarkCheckpoint> = {};
  const completedMatchTypes: Array<"MIXED" | "OWN_SIDE"> = [];
  for (let eventIndex = 0; eventIndex < targetMatches; eventIndex += 1) {
    const completedCourt = externalCompletionSchedule[eventIndex];
    const finished = active.get(completedCourt);
    if (!finished) throw new Error(`External schedule selected unoccupied court ${completedCourt} at event ${eventIndex}`);
    active.delete(completedCourt);
    if (active.size > 0) counters.externalBusyEventCount += 1;
    const finishedIds = new Set(finished.ids);
    const completedMatch: SocialHistoryMatch = {
      id: `complete-${eventIndex + 1}`,
      ...finished.partition,
      socialVariety: finished.socialVariety,
    };
    completed.push(completedMatch);
    if (finished.socialVariety.courtType === "MIXED") completedMatchTypes.push("MIXED");
    else if (finished.socialVariety.courtType === "UPPER" || finished.socialVariety.courtType === "LOWER") completedMatchTypes.push("OWN_SIDE");
    else throw new Error(`Finished benchmark assignment ${finished.assignmentId} has no match type.`);
    // Update stable per-facet observed counts without rebuilding the snapshot.
    for (const key of getPartitionRelationships(finished.partition)) {
      const [facet, pair] = key.split(":") as [(typeof RELATION_FACETS)[number], string];
      observed[facet].set(pair, (observed[facet].get(pair) ?? 0) + 1);
    }
    const decision = decisions.get(finished.decisionId)!;
    decision.pendingAssignments -= 1;
    if (decision.pendingAssignments === 0) {
      if (decision.socialCourtmateRescueWitness) {
        decision.socialCourtmateRescueWitness.completed = true;
        decision.socialCourtmateRescueWitness.completedAfterMatchNumber = eventIndex + 1;
      }
      if (decision.socialCourtmateBeneficialRescueWitness) {
        decision.socialCourtmateBeneficialRescueWitness.completed = true;
        decision.socialCourtmateBeneficialRescueWitness.completedAfterMatchNumber = eventIndex + 1;
      }
      decisions.delete(finished.decisionId);
      counters.completedOptimizerDecisions += 1;
      if (decision.overdueAvailable > 0) {
        counters.starvationDecisions += 1;
        counters.overduePlayerEvents += decision.overduePlayerCount;
        if (decision.counterfactualComplete) {
          counters.starvationCertified += 1;
          if (decision.counterfactualChanged) counters.starvationInterventions += 1;
        } else counters.starvationUncertified += 1;
      }
    }
    for (const id of finishedIds) {
      const previous = lastCompletedEvent.get(id);
      if (previous !== undefined) {
        const gap = eventIndex - previous;
        completedRestGaps.push(gap);
        const assignedRest = finished.restTurnsAtAssignment.get(id) ?? 0;
        assignmentRestGaps.push(assignedRest);
        if (assignedRest === 0) counters.backToBackCount += 1;
        counters.eligibleAssignments += 1;
        if (assignedRest >= IDEAL_REST_GAP + 2) {
          const meta = waits.get(id) ?? emptyWaitMeta();
          const initiatingReplay = lastReplayInitiation.get(id) ?? null;
          counters.fivePlusCompletedRestEpisodes += 1;
          if (initiatingReplay?.acceptedPlusOneReplay === true) counters.fivePlusEpisodesLinkedAcceptedPlusOneReplay += 1;
          else if (initiatingReplay) counters.fivePlusEpisodesLinkedOtherRestZeroReplay += 1;
          else counters.fivePlusEpisodesWithoutLinkedRestZeroReplay += 1;
          const currentWaitClassification = classifyPolicyFiveGap(meta, enginePolicy);
          const originClassification = initiatingReplay ? classifyReplayOrigin(initiatingReplay, enginePolicy) : null;
          const replayClassification = originClassification === "accepted_plus_one_replay_origin" ||
            originClassification === "avoidable_equal_priority_zero_rest_alternative" ||
            originClassification === "avoidable_equal_priority_smoother_alternative" ||
            originClassification === "type_entropy_priority_override"
            ? originClassification
            : initiatingReplay ? "no_equal_priority_smoother_alternative" : "no_linked_rest0_replay";
          fiveGapEpisodes.push({
            traceId: `wait-${profile}-${sessionType}-${seed}-${id}-${eventIndex + 1}`,
            userId: id,
            restGap: assignedRest,
            initiatingReplay,
            classification: initiatingReplay ? classifyReplayOrigin(initiatingReplay, enginePolicy) : currentWaitClassification,
            hadFairnessClassOpportunity: meta.hadFairnessClassOpportunity,
            hadStarvationClassOpportunity: meta.hadStarvationClassOpportunity,
            hadBalanceAdmissibleOpportunity: meta.hadBalanceAdmissibleOpportunity,
            hadMatchTypeFrontierOpportunity: meta.hadMatchTypeFrontierOpportunity,
            hadZeroRestFrontierOpportunity: meta.hadZeroRestFrontierOpportunity,
            hadRelationshipEntropyFrontierOpportunity: meta.hadRelationshipEntropyFrontierOpportunity,
            hadSoftCadenceFrontierOpportunity: meta.hadSoftCadenceFrontierOpportunity,
            hadReplayMinimumOpportunity: meta.hadReplayMinimumOpportunity,
            hadReplayAllowanceOpportunity: meta.hadReplayAllowanceOpportunity,
            hadCombinedEntropyFrontierOpportunity: meta.hadCombinedEntropyFrontierOpportunity,
            hadCombinedSoftCadenceFrontierOpportunity: meta.hadCombinedSoftCadenceFrontierOpportunity,
            hadCoverageGateRejectedPlusOneOpportunity: meta.hadCoverageGateRejectedPlusOneOpportunity,
            hadBeyondReplayAllowanceOpportunity: meta.hadBeyondReplayAllowanceOpportunity,
            hadPolicyAdmissionOpportunity: meta.hadPolicyAdmissionOpportunity,
            hadPolicyEntropyFrontierOpportunity: meta.hadPolicyEntropyFrontierOpportunity,
            hadPolicyFinalFrontierOpportunity: meta.hadPolicyFinalFrontierOpportunity,
            hadSmootherAlternative: meta.hadSmootherAlternative,
            hadCadenceOptimalOpportunity: meta.hadCadenceOptimalOpportunity,
            hadCadenceSuboptimalOpportunity: meta.hadCadenceSuboptimalOpportunity,
            lastDeferredWitness: meta.lastDeferredWitness,
            cadenceOptimalAlternativeWitness: meta.cadenceOptimalAlternativeWitness,
            strictlyBetterCadenceWitness: meta.strictlyBetterCadenceWitness,
            cadenceSuboptimalAlternativeWitness: meta.cadenceSuboptimalAlternativeWitness,
            currentWaitClassification,
            replayClassification,
          });
        }
      }
      // The just-finished assignment becomes the origin of the next rest period.
      // Preserve an immediate-replay witness through its own completion so a
      // later long wait can be traced back to that replay.
      const completedReplayOrigin = advanceReplayOriginOnCompletion(
        lastReplayInitiation.get(id),
        finished.replayInitiationByPlayer.get(id)
      );
      if (completedReplayOrigin) lastReplayInitiation.set(id, completedReplayOrigin);
      else lastReplayInitiation.delete(id);
      lastCompletedEvent.set(id, eventIndex + 1);
      const player = players.find((candidate) => candidate.userId === id)!;
      player.matchesPlayed += 1;
      player.isBusy = false;
      player.restTurns = 0;
      player.arrivalPriorityAt = null;
      waits.set(id, emptyWaitMeta());
    }
    for (const player of players) {
      if (finishedIds.has(player.userId) || player.isBusy || player.isPaused) continue;
      const previousRest = player.restTurns;
      player.restTurns += 1;
      const counts = thresholdsByPlayer.get(player.userId)!;
      if (previousRest < IDEAL_REST_GAP + 1 && player.restTurns >= IDEAL_REST_GAP + 1) {
        counters.reachedIdealPlusOne += 1;
        counts.plusOne += 1;
      }
      if (previousRest < IDEAL_REST_GAP + 2 && player.restTurns >= IDEAL_REST_GAP + 2) {
        counters.reachedIdealPlusTwo += 1;
        counts.plusTwo += 1;
      }
    }
    counters.maximumObservedAvailableRestTurns = Math.max(
      counters.maximumObservedAvailableRestTurns,
      ...players.filter((player) => !player.isBusy && !player.isPaused).map((player) => player.restTurns)
    );
    const counts = players.map((player) => player.matchesPlayed);
    const spread = Math.max(...counts) - Math.min(...counts);
    counters.maximumFairnessSpread = Math.max(counters.maximumFairnessSpread, spread);
    counters.minimumFairnessSpread = Math.min(counters.minimumFairnessSpread, spread);

    // This independent enumeration records the strongest legal rotation class
    // and its balance envelope at every actual one-court refill.
    const refillHistory = [...completed, ...[...active.values()].map((assignment) => ({
      id: `active-${assignment.decisionId}-${assignment.court}`,
      ...assignment.partition,
      socialVariety: assignment.socialVariety,
    }))];
    const refillAudit = eventIndex + 1 < targetMatches
      ? auditRotationClass(players, sessionType, refillHistory, completed, true, coverageGainMetric)
      : null;
    if (eventIndex + 1 === 21 || eventIndex + 1 === 100 || eventIndex + 1 === 400 || eventIndex + 1 === targetMatches) {
      const completedRestValues = [...completedRestGaps];
      const assignmentRestValues = [...assignmentRestGaps];
      const ongoingAvailableFiveTurnWaits = players
        .filter((player) => !player.isBusy && !player.isPaused && player.restTurns >= IDEAL_REST_GAP + 2)
        .map((player) => ({ userId: player.userId, restTurns: player.restTurns, initiatingReplay: lastReplayInitiation.get(player.userId) ?? null }));
      const inProgressFiveTurnAssignments = [...active.values()].flatMap((assignment) => assignment.ids
        .map((userId) => ({ userId, assignment }))
        .filter(({ userId, assignment }) => (assignment.restTurnsAtAssignment.get(userId) ?? 0) >= IDEAL_REST_GAP + 2)
        .map(({ userId, assignment }) => ({
          userId,
          assignmentId: assignment.assignmentId,
          restTurns: assignment.restTurnsAtAssignment.get(userId) ?? 0,
          initiatingReplay: lastReplayInitiation.get(userId) ?? null,
        })));
      const starvationSnapshot = {
        ...counters,
        completedRestGaps: completedRestValues,
        assignmentRestGaps: assignmentRestValues,
        ongoingAvailableFiveTurnWaits,
        inProgressFiveTurnAssignments,
      };
      checkpointResults[String(eventIndex + 1)] = getCheckpoint(players, completed, starvationSnapshot, eventIndex + 1);
    }
    if (!refillAudit) continue;
    for (const candidate of refillAudit.rotationClass) {
      for (const key of getPartitionRelationships(candidate.partition)) strongRelationshipCounts[key] = (strongRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.balanceEnvelope) {
      for (const key of getPartitionRelationships(candidate.partition)) envelopeRelationshipCounts[key] = (envelopeRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.matchTypeFrontier) {
      for (const key of getPartitionRelationships(candidate.partition)) matchTypeFrontierRelationshipCounts[key] = (matchTypeFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.cadenceAdmissible) {
      for (const key of getPartitionRelationships(candidate.partition)) cadenceRelationshipCounts[key] = (cadenceRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.relationshipEntropyFrontier) {
      for (const key of getPartitionRelationships(candidate.partition)) relationshipEntropyFrontierRelationshipCounts[key] = (relationshipEntropyFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.softCadenceFrontier) {
      for (const key of getPartitionRelationships(candidate.partition)) softCadenceFrontierRelationshipCounts[key] = (softCadenceFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.replayMinimum) {
      for (const key of getPartitionRelationships(candidate.partition)) replayMinimumRelationshipCounts[key] = (replayMinimumRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.replayAllowance) {
      for (const key of getPartitionRelationships(candidate.partition)) replayAllowanceRelationshipCounts[key] = (replayAllowanceRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.combinedEntropyFrontier) {
      for (const key of getPartitionRelationships(candidate.partition)) combinedEntropyFrontierRelationshipCounts[key] = (combinedEntropyFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of refillAudit.combinedSoftCadenceFrontier) {
      for (const key of getPartitionRelationships(candidate.partition)) combinedSoftCadenceFrontierRelationshipCounts[key] = (combinedSoftCadenceFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    const measuredPolicyFrontiers = enginePolicy === "current"
      ? [refillAudit.replayAllowance, refillAudit.combinedEntropyFrontier, refillAudit.combinedSoftCadenceFrontier]
      : enginePolicy === "replay-envelope"
        ? [refillAudit.legacyReplayAllowance, refillAudit.legacyCombinedEntropyFrontier, refillAudit.legacyCombinedSoftCadenceFrontier]
        : enginePolicy === "strict"
          ? [refillAudit.strictCadenceAdmissible, refillAudit.strictEntropyFrontier, refillAudit.strictSoftCadenceFrontier]
          : enginePolicy === "type-first"
            ? [refillAudit.cadenceAdmissible, refillAudit.relationshipEntropyFrontier, refillAudit.softCadenceFrontier]
            : [refillAudit.balanceEnvelope, refillAudit.baselineEntropyFrontier, refillAudit.baselineSoftCadenceFrontier];
    for (const candidate of measuredPolicyFrontiers[0]) {
      for (const key of getPartitionRelationships(candidate.partition)) policyAdmissionRelationshipCounts[key] = (policyAdmissionRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of measuredPolicyFrontiers[1]) {
      for (const key of getPartitionRelationships(candidate.partition)) policyEntropyFrontierRelationshipCounts[key] = (policyEntropyFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    for (const candidate of measuredPolicyFrontiers[2]) {
      for (const key of getPartitionRelationships(candidate.partition)) policyFinalFrontierRelationshipCounts[key] = (policyFinalFrontierRelationshipCounts[key] ?? 0) + 1;
    }
    if (refillAudit.bestZeroRestCount !== null) {
      for (const candidate of refillAudit.balanceEnvelope.filter((item) =>
        item.zeroRestCount === refillAudit.bestZeroRestCount! + 1 && !refillAudit.replayAllowanceKeys.has(exactCandidateKey(item.ids, item.partition)))) {
        for (const key of getPartitionRelationships(candidate.partition)) coverageGateRejectedPlusOneRelationshipCounts[key] = (coverageGateRejectedPlusOneRelationshipCounts[key] ?? 0) + 1;
      }
    }
    const refill = callOptimizer(1);
    if (!refill.result.selection || refill.result.selection.selections.length !== 1) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: refill failed after completion ${eventIndex + 1} (${refill.result.debug.failureReason})`);
    }
    if (socialPriorityStrictEnabled && refill.meta.overdueAvailable > 0) {
      const engineCounterfactualComplete = refill.meta.counterfactualComplete;
      const counterfactualProof = refill.withoutStarvation;
      const objectiveCounterfactualCertified = counterfactualProof
        ? recordSocialPriorityDecision(
            counterfactualProof,
            counterfactualProof.searchLimitReached ?? false,
            1,
            `no-starvation counterfactual after completion ${eventIndex + 1}`,
            false,
            true
          )
        : (() => {
            counters.socialPriorityCounterfactualAuditDecisions += 1;
            counters.socialPriorityCounterfactualUncertifiedDecisions += 1;
            return false;
          })();
      refill.meta.counterfactualComplete = engineCounterfactualComplete && objectiveCounterfactualCertified;
      if (!refill.meta.counterfactualComplete) {
        counters.socialPriorityCounterfactualIncompleteDecisions += 1;
        counters.socialPriorityIncompleteCounterfactualDecisions += 1;
      }
    }
    if (socialCourtmateRescueEnabled && refill.meta.overdueAvailable > 0) {
      const engineCounterfactualComplete = refill.meta.counterfactualComplete;
      const counterfactualProof = refill.withoutStarvation;
      const objectiveCounterfactualCertified = recordSocialCourtmateRescueDecision(
        counterfactualProof,
        counterfactualProof?.searchLimitReached ?? false,
        1,
        `no-starvation counterfactual after completion ${eventIndex + 1}`,
        eventIndex + 1,
        false,
        true
      ).certified;
      refill.meta.counterfactualComplete = engineCounterfactualComplete && objectiveCounterfactualCertified;
      if (!refill.meta.counterfactualComplete) {
        counters.socialCourtmateRescue.counterfactualIncompleteAuditDecisions += 1;
        counters.socialPriorityIncompleteCounterfactualDecisions += 1;
      }
    }
    if (socialCourtmateBeneficialRescueEnabled && refill.meta.overdueAvailable > 0) {
      const engineCounterfactualComplete = refill.meta.counterfactualComplete;
      const counterfactualProof = refill.withoutStarvation;
      const objectiveCounterfactualCertified = recordSocialCourtmateBeneficialRescueDecision(
        counterfactualProof,
        counterfactualProof?.searchLimitReached ?? false,
        1,
        `no-starvation counterfactual after completion ${eventIndex + 1}`,
        eventIndex + 1,
        false,
        true
      ).certified;
      refill.meta.counterfactualComplete = engineCounterfactualComplete && objectiveCounterfactualCertified;
      if (!refill.meta.counterfactualComplete) {
        counters.socialCourtmateBeneficialRescue.counterfactualIncompleteAuditDecisions += 1;
        counters.socialPriorityIncompleteCounterfactualDecisions += 1;
      }
    }
    if (socialPriorityStrictEnabled) {
      recordSocialPriorityDecision(
        refill.productionProof,
        refill.result.debug.searchLimitReached,
        1,
        `refill after completion ${eventIndex + 1}`
      );
    }
    let rescueDecisionWitness: SocialCourtmateRescueDecisionWitness | undefined;
    if (socialCourtmateRescueEnabled) {
      rescueDecisionWitness = recordSocialCourtmateRescueDecision(
        refill.productionProof,
        refill.result.debug.searchLimitReached,
        1,
        `refill after completion ${eventIndex + 1}`,
        eventIndex + 1
      ).witness;
      refill.meta.socialCourtmateRescueWitness = rescueDecisionWitness;
    }
    if (socialCourtmateBeneficialRescueEnabled) {
      refill.meta.socialCourtmateBeneficialRescueWitness = recordSocialCourtmateBeneficialRescueDecision(
        refill.productionProof,
        refill.result.debug.searchLimitReached,
        1,
        `refill after completion ${eventIndex + 1}`,
        eventIndex + 1
      ).witness;
    }
    counters.refillDecisionCount += 1;
    const selection = refill.result.selection.selections[0];
    const selectedSet = new Set(selection.ids);
    const selectedPlayers = players.filter((player) => selectedSet.has(player.userId));
    const selectedRestVector = getCadenceVector(selectedPlayers);
    const selectedZeroRestCount = getZeroRestCount(selectedPlayers);
    const selectedSoftRest = getSoftRestVector(selectedPlayers);
    const chosenCandidateKey = exactCandidateKey(selection.ids, selection.partition);
    if (!refillAudit.fairnessClassKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside independent count/arrival fairness class after completion ${eventIndex + 1}`);
    }
    if (!refillAudit.rotationClassKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside independent starvation class after completion ${eventIndex + 1}`);
    }
    if (!refillAudit.balanceEnvelopeKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside independent balance envelope after completion ${eventIndex + 1}`);
    }
    const selectedOracleCandidate = refillAudit.balanceEnvelope.find((candidate) => exactCandidateKey(candidate.ids, candidate.partition) === chosenCandidateKey);
    if (!selectedOracleCandidate) throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was absent from independent balance candidate records after completion ${eventIndex + 1}`);
    let productionReplayAudit: { candidate: OracleCandidate; replayEnvelopeCertified: boolean; coverageGateCertified: boolean; engineCertified: boolean } | null = null;
    let noStarvationReplayAudit: { candidate: OracleCandidate; replayEnvelopeCertified: boolean; coverageGateCertified: boolean; engineCertified: boolean } | null = null;
    let noStarvationAudit: RotationAudit | null = null;
    if (enginePolicy === "replay-envelope") {
      productionReplayAudit = certifyReplaySelection(
        refill.productionProof,
        refillAudit,
        `${sessionType}/${profile}/seed ${seed} production after ${eventIndex + 1} completed matches`,
        "replay-envelope",
        coverageGainMetric
      );
      if (!productionReplayAudit) counters.productionReplayUncertified += 1;
      else {
        if (productionReplayAudit.replayEnvelopeCertified) counters.productionReplayEnvelopeCertified += 1;
        if (productionReplayAudit.engineCertified) counters.productionReplayCertified += 1;
        else counters.productionReplayUncertified += 1;
      }
      counters.noStarvationReplayRefillDecisions += 1;
      if (refill.meta.overdueAvailable > 0) counters.noStarvationCounterfactualDecisions += 1;
      noStarvationAudit = refill.meta.overdueAvailable > 0
        ? auditRotationClass(players, sessionType, refillHistory, completed, false, coverageGainMetric)
        : refillAudit;
      noStarvationReplayAudit = certifyReplaySelection(
        refill.withoutStarvation,
        noStarvationAudit,
        `${sessionType}/${profile}/seed ${seed} no-starvation counterfactual after ${eventIndex + 1} completed matches`,
        "replay-envelope",
        coverageGainMetric
      );
      if (noStarvationReplayAudit?.replayEnvelopeCertified) counters.noStarvationReplayEnvelopeCertified += 1;
      if (noStarvationReplayAudit?.engineCertified) counters.noStarvationReplayCertified += 1;
      else counters.noStarvationReplayUncertified += 1;

      if (productionReplayAudit?.replayEnvelopeCertified && refillAudit.bestZeroRestCount !== null &&
          selectedZeroRestCount === refillAudit.bestZeroRestCount + 1) {
        counters.acceptedPlusOneDecisions += 1;
      }
      if (productionReplayAudit?.replayEnvelopeCertified && refillAudit.bestZeroRestCount !== null && refillAudit.allowedZeroRestCount !== null) {
        const rejectedForEntropy = refillAudit.balanceEnvelope
          .filter((candidate) => candidate.zeroRestCount > refillAudit.allowedZeroRestCount! &&
            candidate.effectiveCombinedEntropyGain > selectedOracleCandidate.effectiveCombinedEntropyGain)
          .sort((left, right) => right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
            left.zeroRestCount - right.zeroRestCount ||
            compareNumberVectors(left.softRest, right.softRest) ||
            exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)));
        if (rejectedForEntropy.length) {
          counters.betterEntropyBeyondAllowanceDecisions += 1;
          counters.betterEntropyBeyondAllowanceCandidateCount += rejectedForEntropy.length;
        }
        if (selectedZeroRestCount === refillAudit.bestZeroRestCount + 1 || rejectedForEntropy.length) {
          const playersById = new Map(players.map((player) => [player.userId, player]));
          const counterfactualSelection = noStarvationReplayAudit?.candidate;
          counters.replayEnvelopeWitnesses.push({
            afterCompletedMatches: eventIndex + 1,
            fairnessVector: selectedOracleCandidate.fairness,
            starvationVector: selectedOracleCandidate.starvation,
            balanceEnvelopeCandidateCount: refillAudit.balanceEnvelope.length,
            bestImmediateReplayCount: refillAudit.bestZeroRestCount,
            allowedImmediateReplayCount: refillAudit.allowedZeroRestCount,
            chosenImmediateReplayCount: selectedOracleCandidate.zeroRestCount,
            selected: toEntropyCandidateWitness(selectedOracleCandidate, playersById),
            strongestRejectedCandidate: rejectedForEntropy[0]
              ? toEntropyCandidateWitness(rejectedForEntropy[0], playersById) : null,
            rejectedCandidateCount: rejectedForEntropy.length,
            withoutStarvation: counterfactualSelection && noStarvationAudit
              ? {
                  ids: [...counterfactualSelection.ids].sort(),
                  balanceGap: counterfactualSelection.balanceGap,
                  zeroRestCount: counterfactualSelection.zeroRestCount,
                  bestImmediateReplayCount: noStarvationAudit.bestZeroRestCount ?? -1,
                  allowedImmediateReplayCount: noStarvationAudit.allowedZeroRestCount ?? -1,
                  effectiveCombinedEntropyGain: counterfactualSelection.effectiveCombinedEntropyGain,
                  replayEnvelopeCertified: noStarvationReplayAudit?.replayEnvelopeCertified ?? false,
                  engineCertified: noStarvationReplayAudit?.engineCertified ?? false,
                }
              : null,
          });
        }
      }
    }
    if (enginePolicy === "current" && !socialPriorityEnabled) {
      productionReplayAudit = certifyReplaySelection(
        refill.productionProof,
        refillAudit,
        `${sessionType}/${profile}/seed ${seed} production after ${eventIndex + 1} completed matches`,
        "current",
        coverageGainMetric
      );
      if (!productionReplayAudit) {
        counters.productionReplayUncertified += 1;
        counters.coverageGateUncertified += 1;
      } else {
        if (productionReplayAudit.replayEnvelopeCertified) counters.productionReplayEnvelopeCertified += 1;
        if (productionReplayAudit.engineCertified) counters.productionReplayCertified += 1;
        else counters.productionReplayUncertified += 1;
        if (productionReplayAudit.coverageGateCertified) counters.coverageGateCertified += 1;
        else counters.coverageGateUncertified += 1;
      }
      counters.noStarvationReplayRefillDecisions += 1;
      if (refill.meta.overdueAvailable > 0) counters.noStarvationCounterfactualDecisions += 1;
      const noStarvationProof = refill.withoutStarvation;
      noStarvationAudit = refill.meta.overdueAvailable > 0
        ? auditRotationClass(players, sessionType, refillHistory, completed, false, coverageGainMetric)
        : refillAudit;
      noStarvationReplayAudit = certifyReplaySelection(
        noStarvationProof,
        noStarvationAudit,
        `${sessionType}/${profile}/seed ${seed} no-starvation counterfactual after ${eventIndex + 1} completed matches`,
        "current",
        coverageGainMetric
      );
      if (noStarvationReplayAudit?.replayEnvelopeCertified) counters.noStarvationReplayEnvelopeCertified += 1;
      if (noStarvationReplayAudit?.engineCertified) counters.noStarvationReplayCertified += 1;
      else counters.noStarvationReplayUncertified += 1;
      if (noStarvationReplayAudit?.coverageGateCertified) counters.noStarvationCoverageGateCertified += 1;
      else counters.noStarvationCoverageGateUncertified += 1;

      const availablePlusOne = refillAudit.bestZeroRestCount === null ? [] : refillAudit.balanceEnvelope
        .filter((candidate) => candidate.zeroRestCount === refillAudit.bestZeroRestCount! + 1);
      const coverageEligiblePlusOne = refillAudit.bestZeroRestCount === null ? [] : availablePlusOne
        .filter((candidate) => refillAudit.replayAllowanceKeys.has(exactCandidateKey(candidate.ids, candidate.partition)));
      const rejectedWithoutCoverage = availablePlusOne.filter((candidate) => !coverageEligiblePlusOne.includes(candidate));
      if (availablePlusOne.length) counters.plusOneAvailableDecisions += 1;
      counters.plusOneAvailableCandidates += availablePlusOne.length;
      if (coverageEligiblePlusOne.length) counters.plusOneCoverageEligibleDecisions += 1;
      counters.plusOneCoverageEligibleCandidates += coverageEligiblePlusOne.length;
      if (rejectedWithoutCoverage.length) counters.plusOneRejectedWithoutImprovedCoverageDecisions += 1;
      counters.plusOneRejectedWithoutImprovedCoverageCandidates += rejectedWithoutCoverage.length;

      if (productionReplayAudit?.coverageGateCertified && refillAudit.bestZeroRestCount !== null &&
          selectedZeroRestCount === refillAudit.bestZeroRestCount + 1) {
        counters.acceptedPlusOneDecisions += 1;
        counters.plusOneSelectedDecisions += 1;
        counters.plusOneSelectedCandidates += 1;
        counters.acceptedGreaterCoverageDecisions += 1;
        counters.acceptedGreaterCoverageCandidates += 1;
      }
      if (productionReplayAudit?.coverageGateCertified && refillAudit.allowedZeroRestCount !== null && refillAudit.bestZeroRestCount !== null) {
        const allowedReplayCount = refillAudit.allowedZeroRestCount;
        const rejectedForEntropy = refillAudit.balanceEnvelope
          .filter((candidate) => candidate.zeroRestCount > allowedReplayCount &&
            candidate.effectiveCombinedEntropyGain > selectedOracleCandidate.effectiveCombinedEntropyGain)
          .sort((left, right) => right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
            left.zeroRestCount - right.zeroRestCount ||
            compareNumberVectors(left.softRest, right.softRest) ||
            exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)));
        if (rejectedForEntropy.length) {
          counters.betterEntropyBeyondAllowanceDecisions += 1;
          counters.betterEntropyBeyondAllowanceCandidateCount += rejectedForEntropy.length;
          counters.higherEntropyBeyondAllowanceDecisions += 1;
          counters.higherEntropyBeyondAllowanceCandidates += rejectedForEntropy.length;
        }
        if (selectedZeroRestCount === refillAudit.bestZeroRestCount + 1 || rejectedForEntropy.length) {
          const playersById = new Map(players.map((player) => [player.userId, player]));
          const counterfactualSelection = noStarvationReplayAudit?.candidate;
          counters.replayEnvelopeWitnesses.push({
            afterCompletedMatches: eventIndex + 1,
            fairnessVector: selectedOracleCandidate.fairness,
            starvationVector: selectedOracleCandidate.starvation,
            balanceEnvelopeCandidateCount: refillAudit.balanceEnvelope.length,
            bestImmediateReplayCount: refillAudit.bestZeroRestCount,
            allowedImmediateReplayCount: refillAudit.allowedZeroRestCount,
            chosenImmediateReplayCount: selectedOracleCandidate.zeroRestCount,
            selected: toEntropyCandidateWitness(selectedOracleCandidate, playersById),
            strongestRejectedCandidate: rejectedForEntropy[0]
              ? toEntropyCandidateWitness(rejectedForEntropy[0], playersById) : null,
            rejectedCandidateCount: rejectedForEntropy.length,
            withoutStarvation: counterfactualSelection && noStarvationAudit
              ? {
                  ids: [...counterfactualSelection.ids].sort(),
                  balanceGap: counterfactualSelection.balanceGap,
                  zeroRestCount: counterfactualSelection.zeroRestCount,
                  bestImmediateReplayCount: noStarvationAudit.bestZeroRestCount ?? -1,
                  allowedImmediateReplayCount: noStarvationAudit.allowedZeroRestCount ?? -1,
                  effectiveCombinedEntropyGain: counterfactualSelection.effectiveCombinedEntropyGain,
                  replayEnvelopeCertified: noStarvationReplayAudit?.replayEnvelopeCertified ?? false,
                  engineCertified: noStarvationReplayAudit?.engineCertified ?? false,
                }
              : null,
          });
        }

        if (selectedZeroRestCount === refillAudit.bestZeroRestCount + 1 || rejectedForEntropy.length || rejectedWithoutCoverage.length) {
          const playersById = new Map(players.map((player) => [player.userId, player]));
          const bestMinimumCoverage = refillAudit.replayCoverageFrontier
            .slice().sort((left, right) => right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
              exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
          const bestCoverageEligible = coverageEligiblePlusOne
            .slice().sort((left, right) => compareCoverageUnits(right, left) ||
              right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
              exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
          const bestCoverageRejected = rejectedWithoutCoverage
            .slice().sort((left, right) => compareCoverageUnits(right, left) ||
              right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
              exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
          const higherTypeGainRejectedCandidates = rejectedWithoutCoverage
            .filter((candidate) => compareCoverageUnits(candidate, selectedOracleCandidate) === 0 &&
              candidate.effectiveMatchTypeGain > selectedOracleCandidate.effectiveMatchTypeGain)
            .filter((candidate) => candidate.immediateCoverageGainNumerator === BigInt(0))
            .sort((left, right) => right.effectiveMatchTypeGain - left.effectiveMatchTypeGain ||
              right.effectiveCombinedEntropyGain - left.effectiveCombinedEntropyGain ||
              exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)));
          const higherTypeGainRejected = higherTypeGainRejectedCandidates[0] ?? null;
          const coverageZeroDiagnostics = getReplayCoverageZeroDiagnostics(
            refillAudit.bestMinimumReplayCoverageGainNumerator,
            selectedOracleCandidate.immediateCoverageGainNumerator
          );
          const minimumCoverageGainIsZero = coverageZeroDiagnostics.minimumFrontierIsZero;
          if (coverageZeroDiagnostics.minimumFrontierAndChosenGainAreZero && higherTypeGainRejectedCandidates.length) {
            counters.zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions += 1;
            counters.zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates += higherTypeGainRejectedCandidates.length;
          }
          const highestEntropyRejected = rejectedForEntropy[0] ?? null;
          const counterfactualSelection = noStarvationReplayAudit?.candidate;
          counters.coverageGateWitnesses.push({
            afterCompletedMatches: eventIndex + 1,
            bestImmediateReplayCount: refillAudit.bestZeroRestCount,
            allowedImmediateReplayCount: refillAudit.allowedZeroRestCount,
            chosenImmediateReplayCount: selectedOracleCandidate.zeroRestCount,
            bestMinimumReplayCoverageGain: refillAudit.bestMinimumReplayCoverageGain ?? 0,
            chosenImmediateCoverageGain: selectedOracleCandidate.immediateCoverageGain,
            chosenReplayCoverageEligible: refillAudit.replayAllowanceKeys.has(chosenCandidateKey),
            selected: toEntropyCandidateWitness(selectedOracleCandidate, playersById),
            fairnessVector: selectedOracleCandidate.fairness,
            starvationVector: selectedOracleCandidate.starvation,
            minimumReplayCoverageGainIsZero: minimumCoverageGainIsZero,
            higherTypeGainRejectedPlusOneCandidateCount: higherTypeGainRejectedCandidates.length,
            bestMinimumReplayCoverageCandidate: bestMinimumCoverage ? toEntropyCandidateWitness(bestMinimumCoverage, playersById) : null,
            bestCoverageEligiblePlusOne: bestCoverageEligible ? toEntropyCandidateWitness(bestCoverageEligible, playersById) : null,
            bestCoverageRejectedPlusOne: bestCoverageRejected ? toEntropyCandidateWitness(bestCoverageRejected, playersById) : null,
            higherTypeGainRejectedPlusOne: higherTypeGainRejected ? toEntropyCandidateWitness(higherTypeGainRejected, playersById) : null,
            bestEntropyRejectedBeyondAllowance: highestEntropyRejected ? toEntropyCandidateWitness(highestEntropyRejected, playersById) : null,
            plusOneAvailableCandidates: availablePlusOne.length,
            plusOneCoverageEligibleCandidates: coverageEligiblePlusOne.length,
            plusOneRejectedWithoutImprovedCoverageCandidates: rejectedWithoutCoverage.length,
            withoutStarvation: counterfactualSelection && noStarvationAudit
              ? {
                  ids: [...counterfactualSelection.ids].sort(),
                  bestImmediateReplayCount: noStarvationAudit.bestZeroRestCount ?? -1,
                  allowedImmediateReplayCount: noStarvationAudit.allowedZeroRestCount ?? -1,
                  bestMinimumReplayCoverageGain: noStarvationAudit.bestMinimumReplayCoverageGain ?? 0,
                  chosenImmediateCoverageGain: counterfactualSelection.immediateCoverageGain,
                  chosenImmediateReplayCount: counterfactualSelection.zeroRestCount,
                  coverageGateCertified: noStarvationReplayAudit?.coverageGateCertified ?? false,
                }
              : null,
          });
        }
      }
    }
    if (enginePolicy === "strict" && !refillAudit.strictCadenceAdmissibleKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside independent strict cadence frontier after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "strict" && refillAudit.bestCadenceVector && compareNumberVectors(selectedRestVector, refillAudit.bestCadenceVector) !== 0) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected strict cadence vector ${JSON.stringify(selectedRestVector)} differed from independent optimum ${JSON.stringify(refillAudit.bestCadenceVector)} after completion ${eventIndex + 1}`);
    }
    for (const player of players.filter((candidate) => !candidate.isBusy && !candidate.isPaused &&
      candidate.restTurns >= IDEAL_REST_GAP + 1 && !selectedSet.has(candidate.userId))) {
      const meta = waits.get(player.userId)!;
      const includes = (candidate: OracleCandidate) => candidate.ids.includes(player.userId);
      const bestBalanceCandidate = refillAudit.balanceEnvelope
        .filter(includes)
        .sort((left, right) => compareCandidatePolicyPriority(left, right, enginePolicy, refillAudit, sessionType) ||
          exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
      const candidateVsChosenCadence = bestBalanceCandidate
        ? compareNumberVectors(bestBalanceCandidate.rest, selectedRestVector)
        : null;
      const candidateVsChosenZeroRest = bestBalanceCandidate
        ? bestBalanceCandidate.zeroRestCount - selectedZeroRestCount
        : null;
      const candidateVsChosenSoftRest = bestBalanceCandidate &&
        (enginePolicy === "current"
          ? refillAudit.replayAllowanceKeys.has(exactCandidateKey(bestBalanceCandidate.ids, bestBalanceCandidate.partition)) &&
            refillAudit.replayAllowanceKeys.has(chosenCandidateKey) &&
            bestBalanceCandidate.effectiveCombinedEntropyGain === selectedOracleCandidate.effectiveCombinedEntropyGain
          : bestBalanceCandidate.effectiveMatchTypeGain === selectedOracleCandidate.effectiveMatchTypeGain &&
            bestBalanceCandidate.zeroRestCount === selectedZeroRestCount &&
            bestBalanceCandidate.effectiveRelationshipGain === selectedOracleCandidate.effectiveRelationshipGain)
        ? compareNumberVectors(bestBalanceCandidate.softRest, selectedSoftRest)
        : null;
      const candidateVsChosenCombinedEntropy = bestBalanceCandidate
        ? bestBalanceCandidate.effectiveCombinedEntropyGain - selectedOracleCandidate.effectiveCombinedEntropyGain
        : null;
      const candidateVsChosenReplayAllowance = bestBalanceCandidate && refillAudit.allowedZeroRestCount !== null
        ? refillAudit.replayAllowanceKeys.has(exactCandidateKey(bestBalanceCandidate.ids, bestBalanceCandidate.partition))
        : null;
      const candidateVsChosenMatchType = bestBalanceCandidate
        ? bestBalanceCandidate.effectiveMatchTypeGain - selectedOracleCandidate.effectiveMatchTypeGain
        : null;
      const candidateVsChosenRelationship = bestBalanceCandidate
        ? bestBalanceCandidate.effectiveRelationshipGain - selectedOracleCandidate.effectiveRelationshipGain
        : null;
      const candidatePriorityComparison = bestBalanceCandidate
        ? compareCandidatePolicyPriority(bestBalanceCandidate, selectedOracleCandidate, enginePolicy, refillAudit, sessionType)
        : null;
      const cadenceFrontierCandidateCount = (enginePolicy === "strict"
        ? refillAudit.strictCadenceAdmissible
        : enginePolicy === "current" ? refillAudit.replayAllowance : refillAudit.cadenceAdmissible).filter(includes).length;
      meta.hadLegalCandidate ||= refillAudit.legalCandidates.some(includes);
      meta.hadFairnessClassOpportunity ||= refillAudit.fairnessClass.some(includes);
      meta.hadStarvationClassOpportunity ||= refillAudit.rotationClass.some(includes);
      meta.hadBalanceAdmissibleOpportunity ||= refillAudit.balanceEnvelope.some(includes);
      meta.hadMatchTypeFrontierOpportunity ||= refillAudit.matchTypeFrontier.some(includes);
      meta.hadZeroRestFrontierOpportunity ||= refillAudit.cadenceAdmissible.some(includes);
      meta.hadRelationshipEntropyFrontierOpportunity ||= refillAudit.relationshipEntropyFrontier.some(includes);
      meta.hadSoftCadenceFrontierOpportunity ||= refillAudit.softCadenceFrontier.some(includes);
      meta.hadReplayMinimumOpportunity ||= refillAudit.replayMinimum.some(includes);
      meta.hadReplayAllowanceOpportunity ||= refillAudit.replayAllowance.some(includes);
      if (refillAudit.bestZeroRestCount !== null) {
        meta.hadCoverageGateRejectedPlusOneOpportunity ||= enginePolicy === "current" && refillAudit.balanceEnvelope.some((candidate) =>
          candidate.ids.includes(player.userId) &&
          candidate.zeroRestCount === refillAudit.bestZeroRestCount! + 1 &&
          !refillAudit.replayAllowanceKeys.has(exactCandidateKey(candidate.ids, candidate.partition))
        );
        meta.hadBeyondReplayAllowanceOpportunity ||= refillAudit.balanceEnvelope.some((candidate) =>
          candidate.ids.includes(player.userId) && candidate.zeroRestCount > refillAudit.bestZeroRestCount! + 1
        );
      }
      meta.hadCombinedEntropyFrontierOpportunity ||= refillAudit.combinedEntropyFrontier.some(includes);
      meta.hadCombinedSoftCadenceFrontierOpportunity ||= refillAudit.combinedSoftCadenceFrontier.some(includes);
      meta.hadPolicyAdmissionOpportunity ||= measuredPolicyFrontiers[0].some(includes);
      meta.hadPolicyEntropyFrontierOpportunity ||= measuredPolicyFrontiers[1].some(includes);
      meta.hadPolicyFinalFrontierOpportunity ||= measuredPolicyFrontiers[2].some(includes);
      meta.hadCadenceOptimalOpportunity ||= candidatePriorityComparison !== null && candidatePriorityComparison <= 0;
      meta.hadSmootherAlternative ||= candidatePriorityComparison !== null && candidatePriorityComparison < 0;
      meta.hadCadenceSuboptimalOpportunity ||= candidatePriorityComparison !== null && candidatePriorityComparison > 0;
      const witness: DeferredRefillWitness = {
        afterCompletedMatches: eventIndex + 1,
        playerRestTurns: player.restTurns,
        chosenIds: [...selection.ids].sort(),
        chosenRestVector: selectedRestVector,
        chosenZeroRestCount: selectedZeroRestCount,
        chosenSoftRestVector: selectedSoftRest,
        chosenRawMatchTypeGain: selectedOracleCandidate.rawMatchTypeGain,
        chosenEffectiveMatchTypeGain: selectedOracleCandidate.effectiveMatchTypeGain,
        chosenRawRelationshipGain: selectedOracleCandidate.rawRelationshipGain,
        chosenEffectiveRelationshipGain: selectedOracleCandidate.effectiveRelationshipGain,
        chosenRawCombinedEntropyGain: selectedOracleCandidate.rawCombinedEntropyGain,
        chosenEffectiveCombinedEntropyGain: selectedOracleCandidate.effectiveCombinedEntropyGain,
        fairnessCandidateCount: refillAudit.fairnessClass.filter(includes).length,
        starvationEquivalentCandidateCount: refillAudit.rotationClass.filter(includes).length,
        balanceEnvelopeCandidateCount: refillAudit.balanceEnvelope.filter(includes).length,
        matchTypeFrontierCandidateCount: refillAudit.matchTypeFrontier.filter(includes).length,
        cadenceFrontierCandidateCount,
        relationshipEntropyFrontierCandidateCount: refillAudit.relationshipEntropyFrontier.filter(includes).length,
        softCadenceFrontierCandidateCount: refillAudit.softCadenceFrontier.filter(includes).length,
        replayMinimumCandidateCount: refillAudit.replayMinimum.filter(includes).length,
        replayAllowanceCandidateCount: refillAudit.replayAllowance.filter(includes).length,
        combinedEntropyFrontierCandidateCount: refillAudit.combinedEntropyFrontier.filter(includes).length,
        combinedSoftCadenceFrontierCandidateCount: refillAudit.combinedSoftCadenceFrontier.filter(includes).length,
        bestBalanceCandidate: bestBalanceCandidate ? {
          ids: [...bestBalanceCandidate.ids].sort(),
          partition: bestBalanceCandidate.partition,
          restVector: bestBalanceCandidate.rest,
          zeroRestCount: bestBalanceCandidate.zeroRestCount,
          softRestVector: bestBalanceCandidate.softRest,
          rawMatchTypeGain: bestBalanceCandidate.rawMatchTypeGain,
          effectiveMatchTypeGain: bestBalanceCandidate.effectiveMatchTypeGain,
          rawRelationshipGain: bestBalanceCandidate.rawRelationshipGain,
          effectiveRelationshipGain: bestBalanceCandidate.effectiveRelationshipGain,
          rawCombinedEntropyGain: bestBalanceCandidate.rawCombinedEntropyGain,
          effectiveCombinedEntropyGain: bestBalanceCandidate.effectiveCombinedEntropyGain,
        } : null,
        bestCandidateVsChosenMatchType: candidateVsChosenMatchType === null ? "none"
          : candidateVsChosenMatchType > 0 ? "better"
            : candidateVsChosenMatchType === 0 ? "equal" : "worse",
        bestCandidateVsChosenCadence: candidateVsChosenCadence === null ? "none"
          : candidateVsChosenCadence < 0 ? "strictly_better"
            : candidateVsChosenCadence === 0 ? "equal" : "worse",
        bestCandidateVsChosenZeroRest: candidateVsChosenZeroRest === null ? "none"
          : candidateVsChosenZeroRest < 0 ? "strictly_better"
            : candidateVsChosenZeroRest === 0 ? "equal" : "worse",
        bestCandidateVsChosenRelationshipGain: candidateVsChosenRelationship === null ? "none"
          : candidateVsChosenRelationship > 0 ? "better"
            : candidateVsChosenRelationship === 0 ? "equal" : "worse",
        bestCandidateVsChosenSoftRest: candidateVsChosenSoftRest === null ? "none"
          : candidateVsChosenSoftRest < 0 ? "strictly_better"
            : candidateVsChosenSoftRest === 0 ? "equal" : "worse",
        bestCandidateVsChosenCombinedEntropy: candidateVsChosenCombinedEntropy === null ? "none"
          : candidateVsChosenCombinedEntropy > 0 ? "better"
            : candidateVsChosenCombinedEntropy === 0 ? "equal" : "worse",
        bestCandidateVsChosenReplayAllowance: candidateVsChosenReplayAllowance === null ? "none"
          : candidateVsChosenReplayAllowance ? "within_allowance" : "outside_allowance",
      };
      meta.lastDeferredWitness = witness;
      if (candidatePriorityComparison !== null && candidatePriorityComparison <= 0) {
        meta.cadenceOptimalAlternativeWitness ??= witness;
      }
      if (candidatePriorityComparison !== null && candidatePriorityComparison < 0) {
        meta.strictlyBetterCadenceWitness ??= witness;
      }
      if (candidatePriorityComparison !== null && candidatePriorityComparison > 0) {
        meta.cadenceSuboptimalAlternativeWitness ??= witness;
      }
    }
    const newDecisionId = nextDecisionId++;
    refill.meta.pendingAssignments = 1;
    decisions.set(newDecisionId, refill.meta);
    const replayContext: ReplayAssignmentContext | null = (enginePolicy === "current" || enginePolicy === "replay-envelope") && productionReplayAudit &&
      refillAudit.bestZeroRestCount !== null && refillAudit.allowedZeroRestCount !== null
      ? {
          certified: enginePolicy === "current" ? productionReplayAudit.coverageGateCertified : productionReplayAudit.replayEnvelopeCertified,
          bestImmediateReplayCount: refillAudit.bestZeroRestCount,
          allowedImmediateReplayCount: refillAudit.allowedZeroRestCount,
          chosenImmediateReplayCount: selectedOracleCandidate.zeroRestCount,
          bestMinimumReplayCoverageGain: refillAudit.bestMinimumReplayCoverageGain ?? 0,
          chosenImmediateCoverageGain: selectedOracleCandidate.immediateCoverageGain,
          coverageGateCertified: enginePolicy === "current" ? productionReplayAudit.coverageGateCertified : false,
          coverageEligiblePlusOne: selectedOracleCandidate.zeroRestCount === refillAudit.bestZeroRestCount + 1 &&
            enginePolicy === "current" && refillAudit.replayAllowanceKeys.has(chosenCandidateKey),
          coverageGatePolicy: enginePolicy === "current",
        }
      : null;
    assignSelection(completedCourt, selection, newDecisionId, refill.meta, refillAudit, eventIndex + 1, replayContext);
    counters.maximumBalanceGap = Math.max(counters.maximumBalanceGap, selection.balanceGap);
  }

  if (!checkpointResults["21"] || !checkpointResults[String(targetMatches)]) {
    throw new Error(`Benchmark must stop on exact 21 and ${targetMatches} completed-match checkpoints.`);
  }
  const missingRelationships = buildUnseenRelationships(
    enginePolicy,
    opportunities,
    observed,
    strongRelationshipCounts,
    envelopeRelationshipCounts,
    matchTypeFrontierRelationshipCounts,
    cadenceRelationshipCounts,
    relationshipEntropyFrontierRelationshipCounts,
    softCadenceFrontierRelationshipCounts,
    replayMinimumRelationshipCounts,
    replayAllowanceRelationshipCounts,
    combinedEntropyFrontierRelationshipCounts,
    combinedSoftCadenceFrontierRelationshipCounts,
    policyAdmissionRelationshipCounts,
    policyEntropyFrontierRelationshipCounts,
    policyFinalFrontierRelationshipCounts,
    coverageGateRejectedPlusOneRelationshipCounts
  );
  let staticBalanceFeasibility: StaticBalanceFeasibilityReport | null = null;
  let staticBalanceFeasibilityMs = 0;
  if (sessionType === SessionType.POINTS || sessionType === SessionType.ELO) {
    const cacheKey = `${profile}:${sessionType}`;
    staticBalanceFeasibility = staticBalanceCache.get(cacheKey) ?? null;
    if (!staticBalanceFeasibility) {
      const staticStarted = performance.now();
      const staticRoster = players.map((player) => ({
        ...player,
        matchesPlayed: 0,
        matchmakingBaseline: 0,
        restTurns: 0,
        isBusy: false,
        isPaused: false,
      }));
      staticBalanceFeasibility = analyzeStaticBalancedRelationshipFeasibility(
        staticRoster,
        { sessionMode: SessionMode.MIXICANO, sessionType }
      );
      staticBalanceFeasibilityMs = Math.round((performance.now() - staticStarted) * 100) / 100;
      staticBalanceCache.set(cacheKey, staticBalanceFeasibility);
    }
  }
  return {
    profile,
    sessionType,
    seed,
    latentRankStrengths,
    strengthUnits: sessionType === SessionType.ELO
      ? profile === "wide" ? "rating units: 900 + 40 × latent rank"
        : "rating units: 900 + 4 × latent rank"
      : profile === "wide" ? "points-like strength units: 10 + 1 × latent rank"
        : "points-like strength units: 10 + 0.1 × latent rank",
    externalCompletionSchedule,
    completedMatchTypes,
    ...(captureCompletedHistory ? {
      completedHistory: completed.map((match, index) => ({
        completedMatchNumber: index + 1,
        team1: [...match.team1] as [string, string],
        team2: [...match.team2] as [string, string],
        matchType: match.socialVariety?.courtType === "MIXED" ? "MIXED" as const : "OWN_SIDE" as const,
      })),
    } : {}),
    checkpoints: checkpointResults,
    maximumMatchCountSpread: counters.maximumFairnessSpread,
    fiveGapEpisodes,
    missingRelationships,
    relationshipOpportunityCounts: getCountMapAsObject(opportunities),
    everStrongRotationRelationshipCounts: strongRelationshipCounts,
    everBalanceEnvelopeRelationshipCounts: envelopeRelationshipCounts,
    everMatchTypeFrontierRelationshipCounts: matchTypeFrontierRelationshipCounts,
    everCadenceAdmissibleRelationshipCounts: cadenceRelationshipCounts,
    everRelationshipEntropyFrontierRelationshipCounts: relationshipEntropyFrontierRelationshipCounts,
    everSoftCadenceFrontierRelationshipCounts: softCadenceFrontierRelationshipCounts,
    everReplayMinimumRelationshipCounts: replayMinimumRelationshipCounts,
    everReplayAllowanceRelationshipCounts: replayAllowanceRelationshipCounts,
    everCombinedEntropyFrontierRelationshipCounts: combinedEntropyFrontierRelationshipCounts,
    everCombinedSoftCadenceFrontierRelationshipCounts: combinedSoftCadenceFrontierRelationshipCounts,
    typePriorityOverrides: {
      scope: "Not applicable to the replay-envelope policy; see preserved type-entropy-first historical artifacts for those counts.",
      applicable: false,
      refillDecisions: null,
      certifiedRefillDecisions: null,
      decisionsWithLowerZeroTypeTradeoff: null,
      rateAcrossCertifiedRefillDecisions: null,
      selectedMatchTypeGainMean: null,
      selectedRelationshipGainMean: null,
      witnesses: typePriorityOverrideWitnesses,
    },
    replayEnvelope: checkpointResults[String(targetMatches)].replayEnvelope,
    structuralOpportunityAudit: {
      partnerPairs: opportunities.partners.size,
      opponentPairs: opportunities.opponents.size,
      courtmatePairs: opportunities.courtmates.size,
    },
    staticBalanceFeasibility,
    staticBalanceFeasibilityMs,
    performanceMs: Math.round(performance.now() - startTime),
  };
}

export function runSocialCoverageBenchmark({
  seeds,
  wideSeeds = [],
  includeWide = true,
  enginePolicy = "current",
  sourceRevision = "recorded by runner",
  sourceProvenance = {
    commitSha: sourceRevision,
    workingTreeDirty: false,
    workingTreeNote: "No extra change note supplied.",
    policyLabel: "unspecified",
    engineSourceSha256: null,
    measurementHarnessSha256: null,
    coreEngineTrackedDiffPaths: [],
    sharedVarietyTrackedDiffPaths: [],
    measurementHarnessTrackedDiffPaths: [],
  },
}: {
  seeds: number[];
  wideSeeds?: number[];
  includeWide?: boolean;
  enginePolicy?: "current" | "strict" | "baseline" | "type-first" | "replay-envelope";
  sourceRevision?: string;
  sourceProvenance?: BenchmarkReport["sourceProvenance"];
}): BenchmarkReport {
  const sessions: BenchmarkSessionResult[] = [];
  for (const seed of seeds) for (const sessionType of FORMAT_ORDER) sessions.push(createSessionResult("narrow", sessionType, seed, 400, enginePolicy));
  if (includeWide) for (const seed of wideSeeds) for (const sessionType of [SessionType.POINTS, SessionType.ELO] as const) sessions.push(createSessionResult("wide", sessionType, seed, 400, enginePolicy));
  return {
    schemaVersion: 1,
    sourceRevision,
    sourceProvenance,
    generatedAt: new Date().toISOString(),
    seedCount: seeds.length,
    wideSeedCount: includeWide ? wideSeeds.length : 0,
    enginePolicy,
    setup: {
      roster: "14 players: P1-P7 male, P8-P14 female (FEMALE_FLEX)",
      sessionMode: "MIXICANO",
      courts: COURT_COUNT,
      completionSchedule: "Independent seeded event sequence; each event completes one occupied court, then refills that court.",
      checkpoints: [21, 400],
      coverageHistory: "Completed matches only; active assignments are used by matchmaking and excluded from coverage.",
      restDefinition: "Completed-match events while available; players in an active match do not accrue rest turns.",
      skillProfiles: {
        narrow: "Shared latent rank profile 0..13; Social/Points strength 10+0.1×rank, Rating strength 900+4×rank (40 rating units per point).",
        wide: "Same latent rank profile; Points strength 10+1×rank, Rating strength 900+40×rank (40 rating units per point).",
      },
      pointDiff: "0 for all players; the benchmark has no match score outcomes.",
    },
    sessions,
  };
}

/**
 * Runs the fixed narrow-profile 21/400 horizon dataset and captures completed
 * match tuples for an independent rescore. The matcher gain metric is explicit
 * so legacy and social-horizon gate policies can be measured separately.
 */
export function runSocialHorizonCoverageBenchmark({
  seeds,
  enginePolicy = "current",
  sourceRevision = "recorded by runner",
  sourceProvenance = {
    commitSha: sourceRevision,
    workingTreeDirty: false,
    workingTreeNote: "No extra change note supplied.",
    policyLabel: enginePolicy,
    engineSourceSha256: null,
    measurementHarnessSha256: null,
    coreEngineTrackedDiffPaths: [],
    sharedVarietyTrackedDiffPaths: [],
    measurementHarnessTrackedDiffPaths: [],
  },
  targetMatches = 21,
  coverageGainMetric = "legacy-equal",
  socialPriorityPolicy = "production",
  sessionTypes = FORMAT_ORDER,
}: {
  seeds: number[];
  enginePolicy?: BenchmarkReport["enginePolicy"];
  sourceRevision?: string;
  sourceProvenance?: BenchmarkReport["sourceProvenance"];
  targetMatches?: 21 | 100 | 400;
  coverageGainMetric?: "legacy-equal" | "social-horizon-321" | RollingCoverageGainMetric;
  socialPriorityPolicy?: "production" | "courtmate-first" | "courtmate-near-best" | "courtmate-beneficial-rescue";
  sessionTypes?: readonly SessionType[];
}): SocialHorizonCoverageReport {
  if (seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed)) || new Set(seeds).size !== seeds.length) {
    throw new Error("Social horizon benchmark seeds must be a non-empty list of unique safe integers.");
  }
  if (targetMatches !== 21 && targetMatches !== 100 && targetMatches !== 400) {
    throw new Error("Social horizon benchmark target must be exactly 21, 100, or 400 completed matches.");
  }
  if (!sessionTypes.length || sessionTypes.some((sessionType) => !FORMAT_ORDER.includes(sessionType as (typeof FORMAT_ORDER)[number])) ||
      new Set(sessionTypes).size !== sessionTypes.length) {
    throw new Error("Social horizon benchmark session types must be a non-empty list of unique supported formats.");
  }
  if (socialPriorityPolicy !== "production" && sessionTypes.some((sessionType) => sessionType !== SessionType.SOCIAL_MIX)) {
    throw new Error("The courtmate priority experiments can only run Social/Mixed sessions.");
  }
  if (socialPriorityPolicy !== "production" && enginePolicy !== "current") {
    throw new Error("The courtmate priority experiments require the current rotation matcher architecture.");
  }
  if ((coverageGainMetric === "social-horizon-321" || coverageGainMetric === "rolling-equal" ||
      coverageGainMetric === "social-horizon-3211") && enginePolicy !== "current") {
    throw new Error("Experimental social coverage gains are only available with the current engine policy.");
  }
  const sessions = seeds.flatMap((seed) => sessionTypes.map((sessionType) =>
    createSessionResult("narrow", sessionType, seed, targetMatches, enginePolicy, true, coverageGainMetric, socialPriorityPolicy)
  ));
  return {
    schemaVersion: "social-horizon-321-v1",
    sourceRevision,
    sourceProvenance,
    generatedAt: new Date().toISOString(),
    enginePolicy,
    targetMatches,
    matcherCoverageGainMetric: coverageGainMetric,
    ...(socialPriorityPolicy !== "production" ? { socialPriorityPolicy } : {}),
    ...(sessionTypes.length !== FORMAT_ORDER.length || sessionTypes.some((sessionType, index) => sessionType !== FORMAT_ORDER[index])
      ? { sessionTypes: [...sessionTypes] } : {}),
    seeds: [...seeds],
    metric: {
      id: "social-horizon-321",
      formula: "Per player: (3C + 2O + P) / the total weight of meaningful facets; C/O/P are capped unique feasible peers divided by min(feasible peers, 13/12/6).",
      weights: { courtmates: 3, opponents: 2, partners: 1 },
      caps: { courtmates: 13, opponents: 12, partners: 6 },
      opportunityScope: "Full structural roster opportunity sets; availability, active status, player history, and balance are not filters.",
      emptyFacetRule: "Exclude empty facets and renormalize the remaining per-player weights.",
      historyRule: "Completed matches only; active assignments and reservations are excluded from the score.",
    },
    sessions,
  };
}

/** A bounded CI probe that uses the same completed-event simulator and checkpoint accounting. */
export function runSocialCoverageRegressionProbe(
  sessionType: SessionType,
  seed: number,
  targetMatches = 120,
): BenchmarkSessionResult {
  if (!Number.isSafeInteger(targetMatches) || targetMatches < 21) {
    throw new Error("The regression probe requires at least 21 completed matches.");
  }
  return createSessionResult("narrow", sessionType, seed, targetMatches, "current");
}

function formatPct(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function stats(values: number[]) {
  if (!values.length) return { mean: null as number | null, median: null as number | null, min: null as number | null, max: null as number | null, standardDeviation: null as number | null };
  const ordered = [...values].sort((a, b) => a - b);
  const average = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
  return {
    mean: average,
    median: ordered.length % 2 ? ordered[(ordered.length - 1) / 2] : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2,
    min: ordered[0], max: ordered[ordered.length - 1],
    standardDeviation: Math.sqrt(ordered.reduce((sum, value) => sum + (value - average) ** 2, 0) / ordered.length),
  };
}

export function summarizeBenchmarkGroup(report: BenchmarkReport, profile: BenchmarkProfile, sessionType: SessionType, checkpoint: "21" | "400") {
  const sessions = report.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
  const field = (key: keyof BenchmarkCheckpoint) => sessions.map((session) => session.checkpoints[checkpoint][key] as number | null);
  const hasUncertifiedOverdueDecision = sessions.some((session) =>
    session.checkpoints[checkpoint].starvation.uncertifiedCounterfactualDecisions > 0);
  const overdueStarvationRates = hasUncertifiedOverdueDecision ? [] : sessions
    .map((session) => session.checkpoints[checkpoint].starvation.rateWhenOverdue)
    .filter((value): value is number => value !== null);
  const allDecisionStarvationRates = hasUncertifiedOverdueDecision ? [] : sessions
    .map((session) => session.checkpoints[checkpoint].starvation.rateAcrossCompletedDecisions)
    .filter((value): value is number => value !== null);
  const coverage = field("varietyCoverageScore").filter((value): value is number => value !== null);
  const entropy = field("normalizedEntropyScore").filter((value): value is number => value !== null);
  return {
    n: sessions.length,
    coverage: stats(coverage),
    partnerCoverage: stats(field("partnerCoverage").filter((value): value is number => value !== null)),
    opponentCoverage: stats(field("opponentCoverage").filter((value): value is number => value !== null)),
    courtmateCoverage: stats(field("courtmateCoverage").filter((value): value is number => value !== null)),
    normalizedEntropy: stats(entropy),
    relationshipEntropy: stats(sessions.map((session) => session.checkpoints[checkpoint].relationshipEntropyScore).filter((value): value is number => value !== null)),
    matchTypeEntropy: stats(sessions.map((session) => session.checkpoints[checkpoint].matchTypeEntropyScore).filter((value): value is number => value !== null)),
    replayEnvelopeApplicable: sessions.some((session) => session.checkpoints[checkpoint].replayEnvelope?.policyApplied === true),
    replayEnvelopeRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.productionRefillDecisions).filter((value): value is number => typeof value === "number")),
    replayEnvelopeCertifiedRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.productionReplayEnvelopeCertifiedDecisions).filter((value): value is number => typeof value === "number")),
    replayEnvelopeUncertifiedRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.productionUncertifiedDecisions).filter((value): value is number => typeof value === "number")),
    replayEnvelopeFullCertifiedRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.productionCertifiedDecisions).filter((value): value is number => typeof value === "number")),
    acceptedPlusOneDecisions: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.acceptedPlusOneDecisions).filter((value): value is number => typeof value === "number")),
    acceptedPlusOneRate: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.acceptedPlusOneRate).filter((value): value is number => typeof value === "number")),
    higherEntropyBeyondAllowanceDecisions: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.betterEntropyBeyondAllowanceDecisions).filter((value): value is number => typeof value === "number")),
    higherEntropyBeyondAllowanceCandidates: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.betterEntropyBeyondAllowanceCandidateCount).filter((value): value is number => typeof value === "number")),
    fivePlusRestEpisodes: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.fivePlusCompletedRestEpisodes).filter((value): value is number => typeof value === "number")),
    fivePlusEpisodesLinkedAcceptedPlusOne: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.fivePlusEpisodesLinkedAcceptedPlusOneReplay).filter((value): value is number => typeof value === "number")),
    fivePlusEpisodesLinkedOtherRestZero: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.fivePlusEpisodesLinkedOtherRestZeroReplay).filter((value): value is number => typeof value === "number")),
    fivePlusEpisodesWithoutLinkedReplay: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.fivePlusEpisodesWithoutLinkedRestZeroReplay).filter((value): value is number => typeof value === "number")),
    noStarvationReplayCertifiedRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.noStarvationReplayEnvelopeCertifiedDecisions).filter((value): value is number => typeof value === "number")),
    noStarvationReplayUncertifiedRefills: stats(sessions.map((session) => session.checkpoints[checkpoint].replayEnvelope?.noStarvationUncertifiedDecisions).filter((value): value is number => typeof value === "number")),
    mixedTypeCoverage: stats(sessions.map((session) => session.checkpoints[checkpoint].matchTypeCoverage.MIXED).filter((value): value is number => value !== null)),
    ownSideTypeCoverage: stats(sessions.map((session) => session.checkpoints[checkpoint].matchTypeCoverage.OWN_SIDE).filter((value): value is number => value !== null)),
    completedMixedMatches: stats(sessions.map((session) => session.checkpoints[checkpoint].completedMatchTypeCounts?.MIXED).filter((value): value is number => typeof value === "number")),
    completedOwnSideMatches: stats(sessions.map((session) => session.checkpoints[checkpoint].completedMatchTypeCounts?.OWN_SIDE).filter((value): value is number => typeof value === "number")),
    first100OwnSideMatches: stats(sessions.map((session) => session.completedMatchTypes?.slice(0, 100).filter((type) => type === "OWN_SIDE").length).filter((value): value is number => typeof value === "number")),
    last100OwnSideMatches: stats(sessions.map((session) => session.completedMatchTypes?.slice(300, 400).filter((type) => type === "OWN_SIDE").length).filter((value): value is number => typeof value === "number")),
    backToBackRate: stats(sessions.map((session) => session.checkpoints[checkpoint].backToBack.rate ?? 0)),
    backToBackCount: stats(sessions.map((session) => session.checkpoints[checkpoint].backToBack.count)),
    maxAssignmentRestGap: stats(sessions.map((session) => session.checkpoints[checkpoint].assignmentRestGap.max)),
    meanAssignmentRestGap: stats(sessions.map((session) => session.checkpoints[checkpoint].assignmentRestGap.mean ?? 0)),
    p95AssignmentRestGap: stats(sessions.map((session) => session.checkpoints[checkpoint].assignmentRestGap.p95 ?? 0)),
    maxBetweenOwnCompletionEventGap: stats(sessions.map((session) => session.checkpoints[checkpoint].betweenOwnCompletionEventGap.max)),
    reachedIdealPlusOne: stats(sessions.map((session) => session.checkpoints[checkpoint].reachedIdealPlusOne)),
    reachedIdealPlusTwo: stats(sessions.map((session) => session.checkpoints[checkpoint].reachedIdealPlusTwo)),
    starvationInterventionCount: stats(sessions.map((session) => session.checkpoints[checkpoint].starvation.materiallyChangedPlayerSet)),
    starvationInterventionRate: stats(overdueStarvationRates),
    starvationAllDecisionRate: stats(allDecisionStarvationRates),
    starvationCertifiedDecisionCount: stats(sessions.map((session) => session.checkpoints[checkpoint].starvation.certifiedCounterfactualDecisions)),
    starvationUncertifiedDecisionCount: stats(sessions.map((session) => session.checkpoints[checkpoint].starvation.uncertifiedCounterfactualDecisions)),
    starvationCertifiedActivationRate: stats(sessions.map((session) => session.checkpoints[checkpoint].starvation.rateAmongCertifiedCounterfactualDecisions)
      .filter((value): value is number => value !== null)),
    starvationDecisionCohort: {
      overdue: sessions.reduce((sum, session) => sum + session.checkpoints[checkpoint].starvation.decisionsWithOverdueAvailable, 0),
      certified: sessions.reduce((sum, session) => sum + session.checkpoints[checkpoint].starvation.certifiedCounterfactualDecisions, 0),
      uncertified: sessions.reduce((sum, session) => sum + session.checkpoints[checkpoint].starvation.uncertifiedCounterfactualDecisions, 0),
    },
    completedRotationDecisions: stats(sessions.map((session) => session.checkpoints[checkpoint].starvation.completedRotationDecisions)),
    fairnessSpread: stats(sessions.map((session) => session.checkpoints[checkpoint].matchCountSpread)),
    maximumFairnessSpread: stats(sessions.map((session) => session.checkpoints[checkpoint].maximumFairnessSpread)),
    availableBusyEvents: stats(sessions.map((session) => session.checkpoints[checkpoint].externalBusyEventCount)),
    matcherOrdinaryMs: stats(sessions.map((session) => session.checkpoints[checkpoint].optimizer.ordinaryProductionWallMs)),
    matcherDiagnosticWrapperMs: stats(sessions.map((session) => session.checkpoints[checkpoint].optimizer.counterfactualWrapperWallMs)),
    matcherSearchLimitCalls: stats(sessions.map((session) => session.checkpoints[checkpoint].optimizer.searchLimitCalls)),
    matcherCertificationFailures: stats(sessions.map((session) =>
      session.checkpoints[checkpoint].optimizer.fairnessCertificateFailures +
      session.checkpoints[checkpoint].optimizer.starvationCertificateFailures +
      session.checkpoints[checkpoint].optimizer.balanceCertificateFailures
    )),
  };
}

export function matchBenchmarkBaselineToCurrentSessions(report: BenchmarkReport, baseline: BenchmarkReport): BenchmarkReport {
  const currentSessionKeys = new Set(report.sessions.map((session) => `${session.profile}:${session.sessionType}:${session.seed}`));
  const sessions = baseline.sessions.filter((session) =>
    currentSessionKeys.has(`${session.profile}:${session.sessionType}:${session.seed}`));
  return {
    ...baseline,
    seedCount: new Set(sessions.filter((session) => session.profile === "narrow").map((session) => session.seed)).size,
    wideSeedCount: new Set(sessions.filter((session) => session.profile === "wide").map((session) => session.seed)).size,
    sessions,
  };
}

export function formatBenchmarkHuman(report: BenchmarkReport, baseline?: BenchmarkReport) {
  const formats = [
    [SessionType.SOCIAL_MIX, "Social"],
    [SessionType.POINTS, "Balanced Points"],
    [SessionType.ELO, "Balanced Rating/Elo"],
  ] as const;
  const matchedBaseline = baseline ? matchBenchmarkBaselineToCurrentSessions(report, baseline) : undefined;
  const lines = [
    "# Matchmaking cadence and relationship coverage benchmark",
    "",
    `Generated ${report.generatedAt}; source commit ${report.sourceRevision}; policy ${report.sourceProvenance.policyLabel}; dirty worktree ${report.sourceProvenance.workingTreeDirty}. Primary seeds: ${report.seedCount}; wide-profile Balanced seeds: ${report.wideSeedCount}.`,
    `Rendered from saved measurement data on ${new Date().toISOString()}; measurement source hashes below identify the code used for the benchmark run.`,
    `Worktree note: ${report.sourceProvenance.workingTreeNote}`,
    `Tracked source changes from commit: core engine ${report.sourceProvenance.coreEngineTrackedDiffPaths.length ? report.sourceProvenance.coreEngineTrackedDiffPaths.join(", ") : "clean"}; shared variety ${report.sourceProvenance.sharedVarietyTrackedDiffPaths.length ? report.sourceProvenance.sharedVarietyTrackedDiffPaths.join(", ") : "clean"}; measurement harness ${report.sourceProvenance.measurementHarnessTrackedDiffPaths.length ? report.sourceProvenance.measurementHarnessTrackedDiffPaths.join(", ") : "clean"}. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.`,
    `Engine source SHA-256 ${report.sourceProvenance.engineSourceSha256 ?? "unavailable"}; measurement harness SHA-256 ${report.sourceProvenance.measurementHarnessSha256 ?? "unavailable"}.`,
    "",
    "The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.",
    "",
    "Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.",
    "",
    "## Primary narrow-skill profile",
    "",
    "| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |",
    "|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [type, label] of formats) for (const checkpoint of ["21", "400"] as const) {
    const summary = summarizeBenchmarkGroup(report, "narrow", type, checkpoint);
    const base = matchedBaseline?.sessions.some((session) => session.profile === "narrow" && session.sessionType === type)
      ? summarizeBenchmarkGroup(matchedBaseline, "narrow", type, checkpoint)
      : null;
    const fmtStats = (value: ReturnType<typeof stats>, percent = false) => value.mean === null ? "n/a" : percent
      ? `${formatPct(value.mean)}; ${formatPct(value.median)}; ${formatPct(value.min)}–${formatPct(value.max)}`
      : `${value.mean.toFixed(2)}; ${value.median!.toFixed(2)}; ${value.min!.toFixed(2)}–${value.max!.toFixed(2)}`;
    const pairCoverage = `${formatPct(summary.partnerCoverage.mean)} / ${formatPct(summary.opponentCoverage.mean)} / ${formatPct(summary.courtmateCoverage.mean)}`;
    const typeCoverage = `${formatPct(summary.mixedTypeCoverage.mean)} / ${formatPct(summary.ownSideTypeCoverage.mean)}`;
    const starvation = summary.starvationInterventionCount.mean === null ? "n/a"
      : `${summary.starvationInterventionCount.mean.toFixed(1)} changes (${summary.starvationDecisionCohort.overdue} overdue; ${summary.starvationDecisionCohort.certified} certified, ${summary.starvationDecisionCohort.uncertified} unknown; overdue ${formatPct(summary.starvationInterventionRate.mean)}, certified-only ${formatPct(summary.starvationCertifiedActivationRate.mean)})`;
    const restBeforeAfter = base
      ? `${fmtStats(base.maxAssignmentRestGap)} → ${fmtStats(summary.maxAssignmentRestGap)}`
      : fmtStats(summary.maxAssignmentRestGap);
    lines.push(`| ${label}${base ? " (before → after)" : ""} | ${checkpoint} | ${fmtStats(summary.coverage, true)} | ${pairCoverage} | ${typeCoverage} | ${formatPct(summary.normalizedEntropy.mean)} | ${formatPct(base?.backToBackRate.mean ?? null)} → ${formatPct(summary.backToBackRate.mean)} | ${restBeforeAfter} | ${fmtStats(summary.meanAssignmentRestGap)} / ${fmtStats(summary.p95AssignmentRestGap)} | ${summary.reachedIdealPlusOne.mean?.toFixed(1)} / ${summary.reachedIdealPlusTwo.mean?.toFixed(1)} | ${starvation} | ${fmtStats(summary.fairnessSpread)} / ${fmtStats(summary.maximumFairnessSpread)} |`);
  }
  lines.push("", "The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.", "");
  lines.push("Decision cohorts: coverage, rest, and match-type checkpoints use completed matches only. Starvation's completed-decision count increments when every assignment in that optimizer decision has completed. Refill/type-override counts at checkpoint N include decisions assigned after completion events 1 through N−1; the latest refill can still be active. The opening two-court decision is excluded from type-override counts.");
  lines.push("## Match-type priority overrides", "", "These historical type-first counters are unavailable for the final replay-envelope policy. They are shown only when a report was measured under the type-entropy-first policy; unavailable historical fields remain n/a.", "", "| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |", "|---|---:|---:|---:|---:|");
  for (const [type, label] of formats) {
    const sessions = report.sessions.filter((session) => session.profile === "narrow" && session.sessionType === type);
    const overrides = sessions.map((session) => session.typePriorityOverrides.decisionsWithLowerZeroTypeTradeoff).filter((value): value is number => value !== null);
    const certified = sessions.map((session) => session.typePriorityOverrides.certifiedRefillDecisions).filter((value): value is number => value !== null);
    const overrideCount = overrides.length ? overrides.reduce((sum, value) => sum + value, 0) : null;
    const certifiedCount = certified.length ? certified.reduce((sum, value) => sum + value, 0) : null;
    const typeGains = sessions.map((session) => session.typePriorityOverrides.selectedMatchTypeGainMean).filter((value) => value !== null);
    const relationshipGains = sessions.map((session) => session.typePriorityOverrides.selectedRelationshipGainMean).filter((value) => value !== null);
    lines.push(`| ${label} | ${overrideCount ?? "n/a"} / ${certifiedCount ?? "n/a"} | ${formatPct(overrideCount !== null && certifiedCount ? overrideCount / certifiedCount : null)} | ${mean(typeGains)?.toFixed(6) ?? "n/a"} | ${mean(relationshipGains)?.toFixed(6) ?? "n/a"} |`);
  }
  if (report.enginePolicy === "current") {
    lines.push("", "## Frozen best-replay-plus-one envelope", "", "After the strongest count/arrival/structure/starvation class and fixed Balanced envelope, the oracle recomputes the minimum number of immediate replays and admits candidates up to one above that minimum. The engine then optimizes combined entropy and soft rest within that frozen set.", "", "| Format | Refills / replay-certified / full variety-certified | Uncertified | +1 selected / rate | >allowed but higher-entropy candidates: decisions / candidates | ≥5-rest episodes: accepted +1 origin / other rest-zero origin / no linked origin | No-starvation replay-certified / unknown |", "|---|---:|---:|---:|---:|---:|---:|");
    for (const [type, label] of formats) {
      const summary = summarizeBenchmarkGroup(report, "narrow", type, "400");
      const replay = summary.replayEnvelopeApplicable
        ? `${summary.replayEnvelopeRefills.mean?.toFixed(0) ?? "n/a"} / ${summary.replayEnvelopeCertifiedRefills.mean?.toFixed(0) ?? "n/a"} / ${summary.replayEnvelopeFullCertifiedRefills.mean?.toFixed(0) ?? "n/a"}`
        : "n/a";
      const plusOne = summary.replayEnvelopeApplicable
        ? `${summary.acceptedPlusOneDecisions.mean?.toFixed(1) ?? "n/a"} / ${formatPct(summary.acceptedPlusOneRate.mean)}`
        : "n/a";
      const higherEntropy = summary.replayEnvelopeApplicable
        ? `${summary.higherEntropyBeyondAllowanceDecisions.mean?.toFixed(1) ?? "n/a"} / ${summary.higherEntropyBeyondAllowanceCandidates.mean?.toFixed(1) ?? "n/a"}`
        : "n/a";
      const longWaits = summary.replayEnvelopeApplicable
        ? `${summary.fivePlusEpisodesLinkedAcceptedPlusOne.mean?.toFixed(1) ?? "n/a"} / ${summary.fivePlusEpisodesLinkedOtherRestZero.mean?.toFixed(1) ?? "n/a"} / ${summary.fivePlusEpisodesWithoutLinkedReplay.mean?.toFixed(1) ?? "n/a"} of ${summary.fivePlusRestEpisodes.mean?.toFixed(1) ?? "n/a"}`
        : "n/a";
      const withoutStarvation = summary.replayEnvelopeApplicable
        ? `${summary.noStarvationReplayCertifiedRefills.mean?.toFixed(1) ?? "n/a"} / ${summary.noStarvationReplayUncertifiedRefills.mean?.toFixed(1) ?? "n/a"}`
        : "n/a";
      lines.push(`| ${label} | ${replay} | ${summary.replayEnvelopeUncertifiedRefills.mean?.toFixed(1) ?? "n/a"} | ${plusOne} | ${higherEntropy} | ${longWaits} | ${withoutStarvation} |`);
    }
    lines.push("", "A replay-origin long-wait count is decision-level evidence: it means the episode involved a rest-zero player selected by a certified decision using the +1 allowance; it does not claim that this player was uniquely the marginal extra. Counterfactual certification separately reruns the strongest class, Balanced envelope, and replay allowance without starvation. Refill decisions are counted after completed events 1 through N−1 at checkpoint N; the last refill may still be active, and the opening two-court decision is excluded.");
  }
  lines.push("");
  lines.push("## Completed match-type counts by session window", "", "These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.", "", "| Format | At 21 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |", "|---|---:|---:|---:|---:|");
  for (const [type, label] of formats) {
    const at21 = summarizeBenchmarkGroup(report, "narrow", type, "21");
    const at400 = summarizeBenchmarkGroup(report, "narrow", type, "400");
    lines.push(`| ${label} | ${at21.completedMixedMatches.mean?.toFixed(1)} / ${at21.completedOwnSideMatches.mean?.toFixed(1)} | ${at400.completedMixedMatches.mean?.toFixed(1)} / ${at400.completedOwnSideMatches.mean?.toFixed(1)} | ${at400.first100OwnSideMatches.mean?.toFixed(1)} | ${at400.last100OwnSideMatches.mean?.toFixed(1)} |`);
  }
  lines.push("", "Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.", "", "| Format | Seed | Completed counts by player ID | Min | Max | Spread | All exactly 6 |", "|---|---:|---|---:|---:|---:|---|");
  for (const [type, label] of formats) {
    const sessions = report.sessions.filter((session) => session.profile === "narrow" && session.sessionType === type)
      .sort((left, right) => left.seed - right.seed);
    for (const session of sessions) {
      const checkpoint = session.checkpoints["21"];
      const counts = checkpoint.playerMatchCounts.map(({ userId, matchesPlayed }) => `${userId}=${matchesPlayed}`).join(",");
      lines.push(`| ${label} | ${session.seed} | ${counts} | ${checkpoint.minimumPlayerMatchCount} | ${checkpoint.maximumPlayerMatchCount} | ${checkpoint.matchCountSpread} | ${checkpoint.allPlayersExactlySixMatches ? "yes" : "no"} |`);
    }
  }
  lines.push("");
  if (report.wideSeedCount) {
    lines.push("## Wide-skill guardrail sensitivity", "", "| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |", "|---|---:|---:|---|---:|---:|---:|---:|---:|");
    for (const [type, label] of formats.slice(1)) for (const checkpoint of ["21", "400"] as const) {
      const summary = summarizeBenchmarkGroup(report, "wide", type, checkpoint);
      lines.push(`| ${label} | ${checkpoint} | ${formatPct(summary.coverage.mean)} | ${formatPct(summary.partnerCoverage.mean)} / ${formatPct(summary.opponentCoverage.mean)} / ${formatPct(summary.courtmateCoverage.mean)} | ${formatPct(summary.normalizedEntropy.mean)} | ${formatPct(summary.backToBackRate.mean)} | ${summary.maxAssignmentRestGap.mean?.toFixed(2)} | ${summary.starvationInterventionCount.mean?.toFixed(2)} / ${summary.starvationDecisionCohort.certified} / ${summary.starvationDecisionCohort.uncertified} (${formatPct(summary.starvationInterventionRate.mean)}) | ${summary.fairnessSpread.mean?.toFixed(2)} / ${summary.maximumFairnessSpread.mean?.toFixed(2)} |`);
    }
    lines.push("", "The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.");
    for (const [type, label] of formats.slice(1)) {
      const reportForFormat = report.sessions.find((session) => session.profile === "wide" && session.sessionType === type)?.staticBalanceFeasibility;
      if (!reportForFormat) continue;
      const uniquePairs = new Set(reportForFormat.balanceGuardrailExcludedRelationships.map((entry) => `${entry.facet}:${[entry.playerId, entry.otherPlayerId].sort().join("|")}`));
      lines.push(`Static equal-count two-court enumeration excluded ${reportForFormat.balanceGuardrailExcludedRelationshipCount} directed opportunity records (${uniquePairs.size} distinct facet-pairs) for wide ${label}; the JSON appendix lists the exact pairs.`);
    }
    lines.push("");
  }
  const finalSessions = report.sessions.filter((session) => session.profile === "narrow" && session.checkpoints["400"].completedMatches === 400);
  lines.push("## 400-match relationship completion", "", "| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |", "|---|---:|---|---|");
  for (const [type, label] of formats) {
    const sessions = finalSessions.filter((session) => session.sessionType === type);
    const full = sessions.filter((session) => session.checkpoints["400"].varietyCoverageScore === 1).length;
    const missed = sessions.reduce((sum, session) => sum + session.missingRelationships.length, 0);
    const guardrail = type === SessionType.SOCIAL_MIX ? "No balance guardrail." : `${sessions.reduce((sum, session) => sum + session.missingRelationships.filter((relationship) => relationship.classification === "excluded_by_balance_envelope_in_observed_opportunities").length, 0)} unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope.`;
    lines.push(`| ${label} | ${full}/${sessions.length} | ${missed} total facet-pairs across seeds | ${guardrail} |`);
  }
  const unseenClassification = report.sourceProvenance.policyLabel === "replay-envelope-best-plus-one"
    ? "The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, frozen replay minimum/allowance, combined-entropy frontier, and soft-cadence frontier."
    : report.sourceProvenance.policyLabel === "type-entropy-first"
      ? "The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship-entropy frontier, and soft-cadence frontier."
      : report.sourceProvenance.policyLabel === "strict-cadence"
        ? "The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, strict-cadence frontier, and later entropy/quality ties."
        : "The unseen relationship classification is finite-session evidence across the balance envelope and the policy's entropy and late-selection frontiers.";
  lines.push("", `${unseenClassification} The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.`, "");
  const longWaits = report.sessions.flatMap((session) => session.fiveGapEpisodes.map((episode) => ({ ...episode, format: session.sessionType, profile: session.profile, seed: session.seed })));
  const waitClassCounts = longWaits.reduce<Record<string, number>>((counts, episode) => {
    counts[episode.currentWaitClassification] = (counts[episode.currentWaitClassification] ?? 0) + 1;
    return counts;
  }, {});
  const waitClassSummary = Object.entries(waitClassCounts).map(([name, count]) => `${name}: ${count}`).join("; ") || "none";
  const linkedReplayCount = longWaits.filter((episode) => episode.initiatingReplay !== null).length;
  const equalCadenceWitnessCount = longWaits.filter((episode) => episode.cadenceOptimalAlternativeWitness?.bestCandidateVsChosenCadence === "equal").length;
  const betterCadenceWitnessCount = longWaits.filter((episode) => episode.strictlyBetterCadenceWitness !== null).length;
  const worseCadenceWitnessCount = longWaits.filter((episode) => episode.cadenceSuboptimalAlternativeWitness !== null).length;
  lines.push("## Long waits", "", `There were ${longWaits.length} completed assignment gaps of at least five available completed-match rest turns in these runs. ` +
    (longWaits.length
      ? report.enginePolicy === "current"
        ? `Deferred-refill classes: ${waitClassSummary}. ${linkedReplayCount} had a linked immediately preceding rest-zero replay; ${longWaits.filter((episode) => episode.initiatingReplay?.acceptedPlusOneReplay === true).length} episodes involved a rest-zero player from a certified decision using the frozen +1 allowance. This is decision-level attribution; it does not identify a uniquely marginal player. Episode records include the strongest-class, balance-envelope, replay allowance, combined entropy, and soft-cadence evidence.`
        : `Deferred-refill classes: ${waitClassSummary}. ${linkedReplayCount} had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show ${betterCadenceWitnessCount} strictly better-vector inclusion opportunities, ${equalCadenceWitnessCount} equal-vector inclusion alternatives, and ${worseCadenceWitnessCount} worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.`
      : "No player reached a five-turn available rest gap."), "");
  lines.push("## Runtime", "", `Total measured optimizer/oracle time across sessions: ${(report.sessions.reduce((sum, session) => sum + session.performanceMs, 0) / 1000).toFixed(1)} seconds. Per-run timings are in JSON.`, "");
  return lines.join("\n");
}

export function makeBenchmarkReport({
  sessions,
  sourceRevision,
  seedCount,
  wideSeedCount,
  enginePolicy = "current",
  sourceProvenance,
}: {
  sessions: BenchmarkSessionResult[];
  sourceRevision: string;
  seedCount: number;
  wideSeedCount: number;
  enginePolicy?: "current" | "strict" | "baseline" | "type-first" | "replay-envelope";
  sourceProvenance?: BenchmarkReport["sourceProvenance"];
}): BenchmarkReport {
  return {
    schemaVersion: 1,
    sourceRevision,
    sourceProvenance: sourceProvenance ?? {
      commitSha: sourceRevision,
      workingTreeDirty: false,
      workingTreeNote: "No extra change note supplied.",
      policyLabel: enginePolicy,
      engineSourceSha256: null,
      measurementHarnessSha256: null,
      coreEngineTrackedDiffPaths: [],
      sharedVarietyTrackedDiffPaths: [],
      measurementHarnessTrackedDiffPaths: [],
    },
    generatedAt: new Date().toISOString(),
    seedCount,
    wideSeedCount,
    enginePolicy,
    setup: {
      roster: "14 players: P1-P7 male, P8-P14 female (FEMALE_FLEX)",
      sessionMode: "MIXICANO",
      courts: COURT_COUNT,
      completionSchedule: "Independent seeded event sequence; each event completes one occupied court, then refills that court.",
      checkpoints: [21, 400],
      coverageHistory: "Completed matches only; active assignments are used by matchmaking and excluded from coverage.",
      restDefinition: "Completed-match events while available; players in an active match do not accrue rest turns.",
      skillProfiles: {
        narrow: "Shared latent rank profile 0..13; Social/Points strength 10+0.1×rank, Rating strength 900+4×rank (40 rating units per point).",
        wide: "Same latent rank profile; Points strength 10+1×rank, Rating strength 900+40×rank (40 rating units per point).",
      },
      pointDiff: "0 for all players; the benchmark has no match score outcomes.",
    },
    sessions,
  };
}
