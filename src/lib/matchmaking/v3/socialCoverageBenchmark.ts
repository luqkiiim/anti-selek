import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { buildBalanceGuardrail } from "./balanceGuardrail";
import { getDoublesPartitions } from "./balance";
import { buildSocialVarietyContext, buildSocialVarietySnapshot, getSocialVarietyCoverage, getSocialVarietyGains } from "./socialVariety";
import { analyzeStaticBalancedRelationshipFeasibility } from "./benchmarkBalanceFeasibility";
import type { StaticBalanceFeasibilityReport } from "./benchmarkBalanceFeasibility";
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
  typePriorityOverrides: {
    policyApplied: boolean;
    refillDecisions: number;
    decisionsWithLowerZeroTypeTradeoff: number;
    rateAcrossRefills: number | null;
    selectedMatchTypeGainMean: number | null;
    selectedRelationshipGainMean: number | null;
  };
  optimizer: OptimizerSummary;
  matchCountSpread: number;
  maximumFairnessSpread: number;
  minimumFairnessSpread: number;
  maximumBalanceGap: number;
  externalBusyEventCount: number;
  maximumObservedAvailableRestTurns: number;
  ongoingAvailableFiveTurnWaits: Array<{ userId: string; restTurns: number; initiatingReplay: ReplayInitiationTrace | null }>;
  inProgressFiveTurnAssignments: Array<{ userId: string; assignmentId: string; restTurns: number; initiatingReplay: ReplayInitiationTrace | null }>;
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
  observedStrongRotationOpportunities: number;
  observedBalanceEnvelopeOpportunities: number;
  observedMatchTypeFrontierOpportunities: number;
  observedCadenceAdmissibleOpportunities: number;
  observedRelationshipEntropyFrontierOpportunities: number;
  observedSoftCadenceFrontierOpportunities: number;
  classification:
    | "admissible_but_unselected"
    | "soft_cadence_priority_excluded_in_observed_opportunities"
    | "relationship_entropy_priority_excluded_in_observed_opportunities"
    | "immediate_replay_priority_excluded_in_observed_opportunities"
    | "match_type_entropy_priority_excluded_in_observed_opportunities"
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
  typePriorityOverrides: {
    scope: "type-entropy-first policy; certified one-court refills only, opening two-court decision excluded";
    applicable: boolean;
    refillDecisions: number;
    certifiedRefillDecisions: number;
    decisionsWithLowerZeroTypeTradeoff: number;
    rateAcrossCertifiedRefillDecisions: number | null;
    selectedMatchTypeGainMean: number | null;
    selectedRelationshipGainMean: number | null;
    witnesses: TypePriorityOverrideWitness[];
  };
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
    | "no_equal_priority_smoother_replay_witness"
    | "not_classified";
  hadFairnessClassOpportunity: boolean;
  hadStarvationClassOpportunity: boolean;
  hadBalanceAdmissibleOpportunity: boolean;
  hadMatchTypeFrontierOpportunity: boolean;
  hadZeroRestFrontierOpportunity: boolean;
  hadRelationshipEntropyFrontierOpportunity: boolean;
  hadSoftCadenceFrontierOpportunity: boolean;
  hadSmootherAlternative: boolean;
  hadCadenceOptimalOpportunity: boolean;
  hadCadenceSuboptimalOpportunity: boolean;
  lastDeferredWitness: DeferredRefillWitness | null;
  cadenceOptimalAlternativeWitness: DeferredRefillWitness | null;
  strictlyBetterCadenceWitness: DeferredRefillWitness | null;
  cadenceSuboptimalAlternativeWitness: DeferredRefillWitness | null;
  currentWaitClassification: FiveGapEpisode["classification"];
  replayClassification: "avoidable_equal_priority_smoother_alternative" | "avoidable_equal_priority_zero_rest_alternative" | "type_entropy_priority_override" | "no_equal_priority_smoother_alternative" | "no_linked_rest0_replay";
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
  fairnessCandidateCount: number;
  starvationEquivalentCandidateCount: number;
  balanceEnvelopeCandidateCount: number;
  matchTypeFrontierCandidateCount: number;
  cadenceFrontierCandidateCount: number;
  relationshipEntropyFrontierCandidateCount: number;
  softCadenceFrontierCandidateCount: number;
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
  } | null;
  bestCandidateVsChosenMatchType: "better" | "equal" | "worse" | "none";
  bestCandidateVsChosenCadence: "strictly_better" | "equal" | "worse" | "none";
  bestCandidateVsChosenZeroRest: "strictly_better" | "equal" | "worse" | "none";
  bestCandidateVsChosenRelationshipGain: "better" | "equal" | "worse" | "none";
  bestCandidateVsChosenSoftRest: "strictly_better" | "equal" | "worse" | "none";
}

export interface BenchmarkReport {
  schemaVersion: 1;
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
  enginePolicy: "current" | "strict" | "baseline";
  setup: {
    roster: "14 players: P1-P7 male, P8-P14 female (FEMALE_FLEX)";
    sessionMode: "MIXICANO";
    courts: 2;
    completionSchedule: "Independent seeded event sequence; each event completes one occupied court, then refills that court.";
    checkpoints: [20, 400];
    coverageHistory: "Completed matches only; active assignments are used by matchmaking and excluded from coverage.";
    restDefinition: "Completed-match events while available; players in an active match do not accrue rest turns.";
    skillProfiles: Record<BenchmarkProfile, string>;
    pointDiff: "0 for all players; the benchmark has no match score outcomes.";
  };
  sessions: BenchmarkSessionResult[];
}

interface BenchmarkPlayer extends MatchmakerV3Player {
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

interface DecisionMeta {
  pendingAssignments: number;
  overdueAvailable: number;
  overduePlayerCount: number;
  counterfactualComplete: boolean;
  counterfactualChanged: boolean | null;
}

interface WaitEpisodeMeta {
  hadFairnessClassOpportunity: boolean;
  hadStarvationClassOpportunity: boolean;
  hadBalanceAdmissibleOpportunity: boolean;
  hadMatchTypeFrontierOpportunity: boolean;
  hadZeroRestFrontierOpportunity: boolean;
  hadRelationshipEntropyFrontierOpportunity: boolean;
  hadSoftCadenceFrontierOpportunity: boolean;
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
  balanceGap: number;
}

interface RotationAudit {
  legalCandidates: OracleCandidate[];
  fairnessClass: OracleCandidate[];
  rotationClass: OracleCandidate[];
  balanceEnvelope: OracleCandidate[];
  matchTypeFrontier: OracleCandidate[];
  cadenceAdmissible: OracleCandidate[];
  relationshipEntropyFrontier: OracleCandidate[];
  softCadenceFrontier: OracleCandidate[];
  strictCadenceAdmissible: OracleCandidate[];
  bestMatchTypeGain: number | null;
  bestZeroRestCount: number | null;
  bestRelationshipGain: number | null;
  bestSoftRestVector: number[] | null;
  bestCadenceVector: number[] | null;
  fairnessClassIds: Set<string>;
  rotationClassIds: Set<string>;
  balanceEnvelopeIds: Set<string>;
  matchTypeFrontierIds: Set<string>;
  cadenceAdmissibleIds: Set<string>;
  relationshipEntropyFrontierIds: Set<string>;
  softCadenceFrontierIds: Set<string>;
  legalCandidateIds: Set<string>;
  fairnessClassKeys: Set<string>;
  rotationClassKeys: Set<string>;
  balanceEnvelopeKeys: Set<string>;
  matchTypeFrontierKeys: Set<string>;
  cadenceAdmissibleKeys: Set<string>;
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

function getEffectiveEntropyGain(gain: number, sessionType: SessionType) {
  return sessionType === SessionType.SOCIAL_MIX ? gain : Math.round(gain * 1e12) / 1e12;
}

function canonicalSum(values: number[]) {
  return values.sort((a, b) => a - b).reduce((total, value) => total + value, 0);
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
  socialHistory: SocialHistoryMatch[]
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
              balanceGap: independentBalanceGap(partition, playersById),
            });
          }
        }
      }
    }
  }
  if (!candidates.length) return {
    legalCandidates: [], fairnessClass: [], rotationClass: [], balanceEnvelope: [], matchTypeFrontier: [], cadenceAdmissible: [], relationshipEntropyFrontier: [], softCadenceFrontier: [], strictCadenceAdmissible: [], bestMatchTypeGain: null, bestZeroRestCount: null, bestRelationshipGain: null, bestSoftRestVector: null, bestCadenceVector: null,
    fairnessClassIds: new Set(), rotationClassIds: new Set(), balanceEnvelopeIds: new Set(), matchTypeFrontierIds: new Set(), cadenceAdmissibleIds: new Set(), relationshipEntropyFrontierIds: new Set(), softCadenceFrontierIds: new Set(), legalCandidateIds: new Set(),
    strictCadenceAdmissibleKeys: new Set(),
    fairnessClassKeys: new Set(), rotationClassKeys: new Set(), balanceEnvelopeKeys: new Set(), matchTypeFrontierKeys: new Set(), cadenceAdmissibleKeys: new Set(), relationshipEntropyFrontierKeys: new Set(), softCadenceFrontierKeys: new Set(),
  };
  const bestFairness = candidates.reduce((best, candidate) => compareNumberVectors(candidate.fairness, best) < 0 ? candidate.fairness : best, candidates[0].fairness);
  const fairnessClass = candidates.filter((candidate) => compareNumberVectors(candidate.fairness, bestFairness) === 0);
  const bestStarvation = fairnessClass.reduce((best, candidate) => compareNumberVectors(candidate.starvation, best) < 0 ? candidate.starvation : best, fairnessClass[0].starvation);
  const rotationClass = fairnessClass.filter((candidate) => compareNumberVectors(candidate.starvation, bestStarvation) === 0);
  let balanceEnvelope = rotationClass;
  if (sessionType === SessionType.POINTS || sessionType === SessionType.ELO) {
    const bestBalance = Math.min(...rotationClass.map((candidate) => candidate.balanceGap));
    const policy = sessionType === SessionType.ELO
      ? { mode: "RATING" as const, nearBestWindow: 30, absoluteCeiling: 50 }
      : { mode: "POINTS" as const, nearBestWindow: 1.5, absoluteCeiling: null };
    const guardrail = buildBalanceGuardrail(policy, { maxBalanceGap: bestBalance, totalBalanceGap: bestBalance });
    balanceEnvelope = rotationClass.filter((candidate) => candidate.balanceGap <= guardrail.allowedMaxBalanceGap + 1e-12 &&
      (guardrail.allowedTotalBalanceGap === null || candidate.balanceGap <= guardrail.allowedTotalBalanceGap + 1e-12));
  }
  const context = buildSocialVarietyContext(players, socialHistory, { sessionMode: SessionMode.MIXICANO });
  for (const candidate of balanceEnvelope) {
    const gains = getSocialVarietyGains(candidate.partition, context);
    candidate.rawMatchTypeGain = gains.matchType;
    candidate.effectiveMatchTypeGain = getEffectiveEntropyGain(gains.matchType, sessionType);
    candidate.rawRelationshipGain = canonicalSum([gains.courtmates, gains.partners, gains.opponents]);
    candidate.effectiveRelationshipGain = getEffectiveEntropyGain(candidate.rawRelationshipGain, sessionType);
  }
  const bestMatchTypeGain = balanceEnvelope.length
    ? Math.max(...balanceEnvelope.map((candidate) => candidate.effectiveMatchTypeGain))
    : null;
  const matchTypeFrontier = bestMatchTypeGain === null
    ? []
    : balanceEnvelope.filter((candidate) => candidate.effectiveMatchTypeGain === bestMatchTypeGain);
  const bestZeroRestCount = matchTypeFrontier.length
    ? Math.min(...matchTypeFrontier.map((candidate) => candidate.zeroRestCount))
    : null;
  // Match-type entropy is the first variety layer for MIXICANO. Zero-rest
  // count is optimized only inside its best effective-gain class.
  const cadenceAdmissible = bestZeroRestCount === null
    ? []
    : matchTypeFrontier.filter((candidate) => candidate.zeroRestCount === bestZeroRestCount);
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
  const idsFor = (values: OracleCandidate[]) => new Set(values.flatMap((candidate) => candidate.ids));
  const keysFor = (values: OracleCandidate[]) => new Set(values.map((candidate) => exactCandidateKey(candidate.ids, candidate.partition)));
  return {
    legalCandidates: candidates,
    fairnessClass,
    rotationClass,
    balanceEnvelope,
    matchTypeFrontier,
    cadenceAdmissible,
    relationshipEntropyFrontier,
    softCadenceFrontier,
    strictCadenceAdmissible,
    bestMatchTypeGain,
    bestZeroRestCount,
    bestRelationshipGain,
    bestSoftRestVector,
    bestCadenceVector,
    fairnessClassIds: idsFor(fairnessClass),
    rotationClassIds: idsFor(rotationClass),
    balanceEnvelopeIds: idsFor(balanceEnvelope),
    matchTypeFrontierIds: idsFor(matchTypeFrontier),
    cadenceAdmissibleIds: idsFor(cadenceAdmissible),
    relationshipEntropyFrontierIds: idsFor(relationshipEntropyFrontier),
    softCadenceFrontierIds: idsFor(softCadenceFrontier),
    legalCandidateIds: idsFor(candidates),
    fairnessClassKeys: keysFor(fairnessClass),
    rotationClassKeys: keysFor(rotationClass),
    balanceEnvelopeKeys: keysFor(balanceEnvelope),
    matchTypeFrontierKeys: keysFor(matchTypeFrontier),
    cadenceAdmissibleKeys: keysFor(cadenceAdmissible),
    relationshipEntropyFrontierKeys: keysFor(relationshipEntropyFrontier),
    softCadenceFrontierKeys: keysFor(softCadenceFrontier),
    strictCadenceAdmissibleKeys: keysFor(strictCadenceAdmissible),
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
  },
  completedMatches: number
): BenchmarkCheckpoint {
  const context = buildSocialVarietyContext(players, completed, { sessionMode: SessionMode.MIXICANO });
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
      refillDecisions: counters.refillDecisionCount,
      decisionsWithLowerZeroTypeTradeoff: counters.typePriorityOverrideCount,
      rateAcrossRefills: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.typePriorityOverrideCount / counters.refillDecisionCount : null,
      selectedMatchTypeGainMean: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.selectedMatchTypeGainTotal / counters.refillDecisionCount : null,
      selectedRelationshipGainMean: counters.typePriorityPolicyApplied && counters.refillDecisionCount
        ? counters.selectedRelationshipGainTotal / counters.refillDecisionCount : null,
    },
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
  enginePolicy: "current" | "strict" | "baseline"
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

function classifyFiveGap(meta: WaitEpisodeMeta): FiveGapEpisode["classification"] {
  if (meta.hadSmootherAlternative) return "avoidable_equal_priority_smoother_alternative";
  if (!meta.hadLegalCandidate || !meta.hadFairnessClassOpportunity) return "fairness_or_mixed_legality";
  if (!meta.hadStarvationClassOpportunity) return "starvation_priority";
  if (!meta.hadBalanceAdmissibleOpportunity) return "balance_guardrail";
  if (meta.hadCadenceOptimalOpportunity) return "cadence_tie_later_tiebreak";
  return "cadence_priority_exclusion";
}

function classifySplitFiveGap(meta: WaitEpisodeMeta): FiveGapEpisode["classification"] {
  if (!meta.hadLegalCandidate || !meta.hadFairnessClassOpportunity) return "fairness_or_mixed_legality";
  if (!meta.hadStarvationClassOpportunity) return "starvation_priority";
  if (!meta.hadBalanceAdmissibleOpportunity) return "balance_guardrail";
  if (!meta.hadMatchTypeFrontierOpportunity) return "match_type_entropy_priority_exclusion";
  if (!meta.hadZeroRestFrontierOpportunity) return "immediate_replay_priority_exclusion";
  if (!meta.hadRelationshipEntropyFrontierOpportunity) return "relationship_entropy_priority_exclusion";
  if (!meta.hadSoftCadenceFrontierOpportunity) return "soft_cadence_priority_exclusion";
  return "cadence_tie_later_tiebreak";
}

function classifyReplayOrigin(trace: ReplayInitiationTrace, enginePolicy: "current" | "strict" | "baseline"): FiveGapEpisode["classification"] {
  if (enginePolicy === "strict" && trace.smootherBalanceAdmissibleSetsWithoutPlayer > 0) return "avoidable_equal_priority_smoother_alternative";
  if (enginePolicy === "current" && trace.betterTypeGainLowerZeroRestSetsWithoutPlayer > 0) return "type_entropy_priority_override";
  if (enginePolicy !== "strict" && trace.betterZeroRestSetsWithoutPlayer > 0) return "avoidable_equal_priority_zero_rest_alternative";
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

export function classifyReplayOriginForBenchmark(trace: ReplayInitiationTrace, enginePolicy: "current" | "strict" | "baseline" = "current"): FiveGapEpisode["classification"] {
  return classifyReplayOrigin(trace, enginePolicy);
}

function buildUnseenRelationships(
  opportunities: RelationshipCounts,
  observed: RelationshipCounts,
  strongCounts: Record<string, number>,
  envelopeCounts: Record<string, number>,
  typeFrontierCounts: Record<string, number>,
  cadenceCounts: Record<string, number>,
  relationshipFrontierCounts: Record<string, number>,
  softFrontierCounts: Record<string, number>
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
      unseen.push({
        facet,
        players: relationship.split("|") as [string, string],
        observedStrongRotationOpportunities: strong,
        observedBalanceEnvelopeOpportunities: envelope,
        observedMatchTypeFrontierOpportunities: typeFrontier,
        observedCadenceAdmissibleOpportunities: cadence,
        observedRelationshipEntropyFrontierOpportunities: relationshipFrontier,
        observedSoftCadenceFrontierOpportunities: softFrontier,
        classification: softFrontier > 0
          ? "admissible_but_unselected"
          : relationshipFrontier > 0
            ? "soft_cadence_priority_excluded_in_observed_opportunities"
            : cadence > 0
              ? "relationship_entropy_priority_excluded_in_observed_opportunities"
              : typeFrontier > 0
                ? "immediate_replay_priority_excluded_in_observed_opportunities"
                : envelope > 0
                  ? "match_type_entropy_priority_excluded_in_observed_opportunities"
                  : strong > 0
                    ? "excluded_by_balance_envelope_in_observed_opportunities"
                    : "never_in_strongest_rotation_class_during_observed_refills",
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
  enginePolicy: "current" | "strict" | "baseline" = "current"
): BenchmarkSessionResult {
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
    typePriorityPolicyApplied: enginePolicy === "current",
  };
  const opportunities = createStructuralOpportunityCounts(players);
  const observed: RelationshipCounts = { courtmates: new Map(), partners: new Map(), opponents: new Map() };
  const strongRelationshipCounts: Record<string, number> = {};
  const envelopeRelationshipCounts: Record<string, number> = {};
  const matchTypeFrontierRelationshipCounts: Record<string, number> = {};
  const cadenceRelationshipCounts: Record<string, number> = {};
  const relationshipEntropyFrontierRelationshipCounts: Record<string, number> = {};
  const softCadenceFrontierRelationshipCounts: Record<string, number> = {};
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
    completedEventIndex = 0
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
      enginePolicy
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
      socialHistoryMatches: [...completed, ...[...active.values()].map((assignment) => ({
        id: `active-${assignment.decisionId}-${assignment.court}`,
        ...assignment.partition,
        socialVariety: assignment.socialVariety,
      }))],
      randomFn: matcherRandom,
    };
    type OptimizerResult = ReturnType<typeof rotationApi.findBestRotationBatchSelection<BenchmarkPlayer>>;
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
      return { result, meta, audit: null as RotationAudit | null };
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
    return { result, meta, audit: null as RotationAudit | null };
  };

  const opening = callOptimizer(COURT_COUNT);
  if (!opening.result.selection || opening.result.selection.selections.length !== COURT_COUNT) {
    throw new Error(`${sessionType}/${profile}/seed ${seed}: opening two-court batch failed (${opening.result.debug.failureReason})`);
  }
  openingDecisionId = nextDecisionId++;
  opening.meta.pendingAssignments = opening.result.selection.selections.length;
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
        if (assignedRest >= 5) {
          const meta = waits.get(id) ?? emptyWaitMeta();
          const initiatingReplay = lastReplayInitiation.get(id) ?? null;
          const currentWaitClassification = enginePolicy === "current" ? classifySplitFiveGap(meta) : classifyFiveGap(meta);
          const originClassification = initiatingReplay ? classifyReplayOrigin(initiatingReplay, enginePolicy) : null;
          const replayClassification = originClassification === "avoidable_equal_priority_zero_rest_alternative" ||
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
      ? auditRotationClass(players, sessionType, refillHistory)
      : null;
    if (eventIndex + 1 === 20 || eventIndex + 1 === 400 || eventIndex + 1 === targetMatches) {
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
    const refill = callOptimizer(1);
    if (!refill.result.selection || refill.result.selection.selections.length !== 1) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: refill failed after completion ${eventIndex + 1} (${refill.result.debug.failureReason})`);
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
    if (enginePolicy === "current" && !refillAudit.matchTypeFrontierKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside the independent match-type entropy frontier after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "current" && (!refillAudit.cadenceAdmissibleKeys.has(chosenCandidateKey) || selectedZeroRestCount !== refillAudit.bestZeroRestCount)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside the independent minimum-zero-rest frontier within its best match-type class after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "current" && !refillAudit.relationshipEntropyFrontierKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside the independent relationship-entropy frontier after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "current" && !refillAudit.softCadenceFrontierKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside the independent soft-cadence frontier after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "strict" && !refillAudit.strictCadenceAdmissibleKeys.has(chosenCandidateKey)) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected quartet was outside independent strict cadence frontier after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "strict" && refillAudit.bestCadenceVector && compareNumberVectors(selectedRestVector, refillAudit.bestCadenceVector) !== 0) {
      throw new Error(`${sessionType}/${profile}/seed ${seed}: selected strict cadence vector ${JSON.stringify(selectedRestVector)} differed from independent optimum ${JSON.stringify(refillAudit.bestCadenceVector)} after completion ${eventIndex + 1}`);
    }
    if (enginePolicy === "current") {
      counters.selectedMatchTypeGainTotal += selectedOracleCandidate.rawMatchTypeGain;
      counters.selectedRelationshipGainTotal += selectedOracleCandidate.rawRelationshipGain;
      const strongestLowerZeroCompetitor = findLowerZeroTypeGainCompetitor(selectedOracleCandidate, refillAudit.balanceEnvelope);
      if (strongestLowerZeroCompetitor) {
        counters.typePriorityOverrideCount += 1;
        typePriorityOverrideWitnesses.push({
          afterCompletedMatches: eventIndex + 1,
          fairnessVector: selectedOracleCandidate.fairness,
          starvationVector: selectedOracleCandidate.starvation,
          balanceEnvelopeCandidateCount: refillAudit.balanceEnvelope.length,
          selected: {
            ids: [...selectedOracleCandidate.ids].sort(),
            balanceGap: selectedOracleCandidate.balanceGap,
            zeroRestCount: selectedOracleCandidate.zeroRestCount,
            restVector: selectedOracleCandidate.rest,
            rawMatchTypeGain: selectedOracleCandidate.rawMatchTypeGain,
            effectiveMatchTypeGain: selectedOracleCandidate.effectiveMatchTypeGain,
            rawRelationshipGain: selectedOracleCandidate.rawRelationshipGain,
            effectiveRelationshipGain: selectedOracleCandidate.effectiveRelationshipGain,
          },
          lowerZeroRestCompetitor: {
            ids: [...strongestLowerZeroCompetitor.ids].sort(),
            balanceGap: strongestLowerZeroCompetitor.balanceGap,
            zeroRestCount: strongestLowerZeroCompetitor.zeroRestCount,
            restVector: strongestLowerZeroCompetitor.rest,
            rawMatchTypeGain: strongestLowerZeroCompetitor.rawMatchTypeGain,
            effectiveMatchTypeGain: strongestLowerZeroCompetitor.effectiveMatchTypeGain,
            rawRelationshipGain: strongestLowerZeroCompetitor.rawRelationshipGain,
            effectiveRelationshipGain: strongestLowerZeroCompetitor.effectiveRelationshipGain,
          },
        });
      }
    }
    for (const player of players.filter((candidate) => !candidate.isBusy && !candidate.isPaused &&
      candidate.restTurns >= IDEAL_REST_GAP + 1 && !selectedSet.has(candidate.userId))) {
      const meta = waits.get(player.userId)!;
      const includes = (candidate: OracleCandidate) => candidate.ids.includes(player.userId);
      const bestBalanceCandidate = refillAudit.balanceEnvelope
        .filter(includes)
        .sort((left, right) => (enginePolicy === "strict"
          ? compareNumberVectors(left.rest, right.rest)
          : right.effectiveMatchTypeGain - left.effectiveMatchTypeGain ||
            left.zeroRestCount - right.zeroRestCount ||
            right.effectiveRelationshipGain - left.effectiveRelationshipGain ||
            compareNumberVectors(left.softRest, right.softRest)) ||
          exactCandidateKey(left.ids, left.partition).localeCompare(exactCandidateKey(right.ids, right.partition)))[0] ?? null;
      const candidateVsChosenCadence = bestBalanceCandidate
        ? compareNumberVectors(bestBalanceCandidate.rest, selectedRestVector)
        : null;
      const candidateVsChosenZeroRest = bestBalanceCandidate
        ? bestBalanceCandidate.zeroRestCount - selectedZeroRestCount
        : null;
      const candidateVsChosenSoftRest = bestBalanceCandidate &&
        bestBalanceCandidate.effectiveMatchTypeGain === selectedOracleCandidate.effectiveMatchTypeGain &&
        bestBalanceCandidate.zeroRestCount === selectedZeroRestCount &&
        bestBalanceCandidate.effectiveRelationshipGain === selectedOracleCandidate.effectiveRelationshipGain
        ? compareNumberVectors(bestBalanceCandidate.softRest, selectedSoftRest)
        : null;
      const candidateVsChosenMatchType = bestBalanceCandidate
        ? bestBalanceCandidate.effectiveMatchTypeGain - selectedOracleCandidate.effectiveMatchTypeGain
        : null;
      const candidateVsChosenRelationship = bestBalanceCandidate
        ? bestBalanceCandidate.effectiveRelationshipGain - selectedOracleCandidate.effectiveRelationshipGain
        : null;
      const candidatePriorityComparison = enginePolicy === "strict"
        ? candidateVsChosenCadence
        : candidateVsChosenMatchType === null ? null
          : candidateVsChosenMatchType !== 0 ? (candidateVsChosenMatchType > 0 ? -1 : 1)
            : candidateVsChosenZeroRest !== null && candidateVsChosenZeroRest !== 0 ? (candidateVsChosenZeroRest < 0 ? -1 : 1)
              : candidateVsChosenRelationship !== null && candidateVsChosenRelationship !== 0 ? (candidateVsChosenRelationship > 0 ? -1 : 1)
                : candidateVsChosenSoftRest;
      const cadenceFrontierCandidateCount = (enginePolicy === "strict" ? refillAudit.strictCadenceAdmissible : refillAudit.cadenceAdmissible).filter(includes).length;
      meta.hadLegalCandidate ||= refillAudit.legalCandidates.some(includes);
      meta.hadFairnessClassOpportunity ||= refillAudit.fairnessClass.some(includes);
      meta.hadStarvationClassOpportunity ||= refillAudit.rotationClass.some(includes);
      meta.hadBalanceAdmissibleOpportunity ||= refillAudit.balanceEnvelope.some(includes);
      meta.hadMatchTypeFrontierOpportunity ||= refillAudit.matchTypeFrontier.some(includes);
      meta.hadZeroRestFrontierOpportunity ||= refillAudit.cadenceAdmissible.some(includes);
      meta.hadRelationshipEntropyFrontierOpportunity ||= refillAudit.relationshipEntropyFrontier.some(includes);
      meta.hadSoftCadenceFrontierOpportunity ||= refillAudit.softCadenceFrontier.some(includes);
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
        fairnessCandidateCount: refillAudit.fairnessClass.filter(includes).length,
        starvationEquivalentCandidateCount: refillAudit.rotationClass.filter(includes).length,
        balanceEnvelopeCandidateCount: refillAudit.balanceEnvelope.filter(includes).length,
        matchTypeFrontierCandidateCount: refillAudit.matchTypeFrontier.filter(includes).length,
        cadenceFrontierCandidateCount,
        relationshipEntropyFrontierCandidateCount: refillAudit.relationshipEntropyFrontier.filter(includes).length,
        softCadenceFrontierCandidateCount: refillAudit.softCadenceFrontier.filter(includes).length,
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
    assignSelection(completedCourt, selection, newDecisionId, refill.meta, refillAudit, eventIndex + 1);
    counters.maximumBalanceGap = Math.max(counters.maximumBalanceGap, selection.balanceGap);
  }

  if (!checkpointResults["20"] || !checkpointResults[String(targetMatches)]) {
    throw new Error(`Benchmark must stop on exact 20 and ${targetMatches} completed-match checkpoints.`);
  }
  const missingRelationships = buildUnseenRelationships(
    opportunities,
    observed,
    strongRelationshipCounts,
    envelopeRelationshipCounts,
    matchTypeFrontierRelationshipCounts,
    cadenceRelationshipCounts,
    relationshipEntropyFrontierRelationshipCounts,
    softCadenceFrontierRelationshipCounts
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
    typePriorityOverrides: {
      scope: "type-entropy-first policy; certified one-court refills only, opening two-court decision excluded",
      applicable: enginePolicy === "current",
      refillDecisions: counters.refillDecisionCount,
      certifiedRefillDecisions: enginePolicy === "current" ? counters.refillDecisionCount : 0,
      decisionsWithLowerZeroTypeTradeoff: typePriorityOverrideWitnesses.length,
      rateAcrossCertifiedRefillDecisions: enginePolicy === "current" && counters.refillDecisionCount
        ? typePriorityOverrideWitnesses.length / counters.refillDecisionCount : null,
      selectedMatchTypeGainMean: enginePolicy === "current" && counters.refillDecisionCount
        ? counters.selectedMatchTypeGainTotal / counters.refillDecisionCount : null,
      selectedRelationshipGainMean: enginePolicy === "current" && counters.refillDecisionCount
        ? counters.selectedRelationshipGainTotal / counters.refillDecisionCount : null,
      witnesses: typePriorityOverrideWitnesses,
    },
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
  enginePolicy?: "current" | "strict" | "baseline";
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
      checkpoints: [20, 400],
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

/** A bounded CI probe that uses the same completed-event simulator and checkpoint accounting. */
export function runSocialCoverageRegressionProbe(
  sessionType: SessionType,
  seed: number,
  targetMatches = 120,
): BenchmarkSessionResult {
  if (!Number.isSafeInteger(targetMatches) || targetMatches < 20) {
    throw new Error("The regression probe requires at least 20 completed matches.");
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

export function summarizeBenchmarkGroup(report: BenchmarkReport, profile: BenchmarkProfile, sessionType: SessionType, checkpoint: "20" | "400") {
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

export function formatBenchmarkHuman(report: BenchmarkReport, baseline?: BenchmarkReport) {
  const formats = [
    [SessionType.SOCIAL_MIX, "Social"],
    [SessionType.POINTS, "Balanced Points"],
    [SessionType.ELO, "Balanced Rating/Elo"],
  ] as const;
  const lines = [
    "# Matchmaking cadence and relationship coverage benchmark",
    "",
    `Generated ${report.generatedAt}; source commit ${report.sourceRevision}; policy ${report.sourceProvenance.policyLabel}; dirty worktree ${report.sourceProvenance.workingTreeDirty}. Primary seeds: ${report.seedCount}; wide-profile Balanced seeds: ${report.wideSeedCount}.`,
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
  for (const [type, label] of formats) for (const checkpoint of ["20", "400"] as const) {
    const summary = summarizeBenchmarkGroup(report, "narrow", type, checkpoint);
    const base = baseline ? summarizeBenchmarkGroup(baseline, "narrow", type, checkpoint) : null;
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
  lines.push("## Match-type priority overrides", "", "Each override is one certified one-court refill where the chosen set has more immediate replays but higher match-type entropy gain than a legal candidate in the same strongest fairness/starvation class and Balanced envelope. The denominator is certified one-court refills; the opening two-court decision is excluded. Relationship gain is courtmates + partners + opponents, scored independently from match-type gain.", "", "| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |", "|---|---:|---:|---:|---:|");
  for (const [type, label] of formats) {
    const sessions = report.sessions.filter((session) => session.profile === "narrow" && session.sessionType === type);
    const overrides = sessions.reduce((sum, session) => sum + session.typePriorityOverrides.decisionsWithLowerZeroTypeTradeoff, 0);
    const certified = sessions.reduce((sum, session) => sum + session.typePriorityOverrides.certifiedRefillDecisions, 0);
    const typeGains = sessions.map((session) => session.typePriorityOverrides.selectedMatchTypeGainMean).filter((value) => value !== null);
    const relationshipGains = sessions.map((session) => session.typePriorityOverrides.selectedRelationshipGainMean).filter((value) => value !== null);
    lines.push(`| ${label} | ${overrides} / ${certified} | ${formatPct(certified ? overrides / certified : null)} | ${mean(typeGains)?.toFixed(6) ?? "n/a"} | ${mean(relationshipGains)?.toFixed(6) ?? "n/a"} |`);
  }
  lines.push("");
  lines.push("## Completed match-type counts by session window", "", "These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.", "", "| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |", "|---|---:|---:|---:|---:|");
  for (const [type, label] of formats) {
    const at20 = summarizeBenchmarkGroup(report, "narrow", type, "20");
    const at400 = summarizeBenchmarkGroup(report, "narrow", type, "400");
    lines.push(`| ${label} | ${at20.completedMixedMatches.mean?.toFixed(1)} / ${at20.completedOwnSideMatches.mean?.toFixed(1)} | ${at400.completedMixedMatches.mean?.toFixed(1)} / ${at400.completedOwnSideMatches.mean?.toFixed(1)} | ${at400.first100OwnSideMatches.mean?.toFixed(1)} | ${at400.last100OwnSideMatches.mean?.toFixed(1)} |`);
  }
  lines.push("");
  if (report.wideSeedCount) {
    lines.push("## Wide-skill guardrail sensitivity", "", "| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |", "|---|---:|---:|---|---:|---:|---:|---:|---:|");
    for (const [type, label] of formats.slice(1)) for (const checkpoint of ["20", "400"] as const) {
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
  lines.push("", "The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship entropy frontier, and soft cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.", "");
  const longWaits = report.sessions.flatMap((session) => session.fiveGapEpisodes.map((episode) => ({ ...episode, format: session.sessionType, profile: session.profile, seed: session.seed })));
  const waitClassCounts = longWaits.reduce<Record<string, number>>((counts, episode) => {
    counts[episode.currentWaitClassification] = (counts[episode.currentWaitClassification] ?? 0) + 1;
    return counts;
  }, {});
  const waitClassSummary = Object.entries(waitClassCounts).map(([name, count]) => `${name}: ${count}`).join("; ") || "none";
  const linkedReplayCount = longWaits.filter((episode) => episode.initiatingReplay !== null).length;
  const immediateReplayExclusionCount = longWaits.filter((episode) => episode.currentWaitClassification === "immediate_replay_priority_exclusion").length;
  const typeOverrideReplayOrigins = longWaits.filter((episode) => episode.initiatingReplay?.betterTypeGainLowerZeroRestSetsWithoutPlayer).length;
  const equalCadenceWitnessCount = longWaits.filter((episode) => episode.cadenceOptimalAlternativeWitness?.bestCandidateVsChosenCadence === "equal").length;
  const betterCadenceWitnessCount = longWaits.filter((episode) => episode.strictlyBetterCadenceWitness !== null).length;
  const worseCadenceWitnessCount = longWaits.filter((episode) => episode.cadenceSuboptimalAlternativeWitness !== null).length;
  lines.push("## Long waits", "", `There were ${longWaits.length} completed assignment gaps of at least five available completed-match rest turns in these runs. ` +
    (longWaits.length
      ? report.enginePolicy === "current"
        ? `Deferred-refill classes: ${waitClassSummary}. ${linkedReplayCount} had a linked immediately preceding rest-zero replay; ${typeOverrideReplayOrigins} linked replay origins had a lower-zero alternative with lower match-type gain, so the chosen replay was an observed type-priority tradeoff. ${immediateReplayExclusionCount} long-wait episodes had no candidate in the minimum-zero frontier after the best type gain. Each wait record stores the type, zero-rest, relationship, and soft-rest frontier evidence and candidate gains.`
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
  enginePolicy?: "current" | "strict" | "baseline";
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
      checkpoints: [20, 400],
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
