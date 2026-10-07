import { calculateNoCatchUpMatchmakingCredit } from "../matchmakingCredit";
import { MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { buildActivePlayers } from "./fairness";
import { getSocialIdealRestGap } from "./scoring";
import { auditSocialGeneralizationDecision, scoreSocialGeneralizationPrefix } from "./socialGeneralizationAudit";
import {
  getSocialGeneralizationScenario,
  getSocialGeneralizationStructuralRoster,
  SOCIAL_GENERALIZATION_SCENARIOS,
} from "./socialGeneralizationScenarios";
import { buildSocialVarietySnapshot } from "./socialVariety";
import { findBestRotationBatchSelection, measureRotationStarvationIntervention } from "./socialBatch";
import type {
  SocialGeneralizationDecisionAudit,
  SocialGeneralizationPrefixResult,
  SocialGeneralizationTypeWindowSelectionWitness,
  SocialGeneralizationTypeWindowWitness,
} from "./socialGeneralizationAudit";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  SocialVarietySnapshot,
  V3DoublesPartition,
} from "./types";
import type { SocialGeneralizationRosterEvent, SocialGeneralizationScenario } from "./socialGeneralizationScenarios";

export type SocialGeneralizationArm = "production" | "courtmate-beneficial-rescue";
export type SocialGeneralizationSessionStatus = "completed" | "search-limited" | "stalled" | "error";

export interface SocialGeneralizationDecisionAssignment {
  readonly ids: string[];
  readonly partition: V3DoublesPartition;
  readonly socialVariety: SocialVarietySnapshot;
}

export interface SocialGeneralizationEngineProof {
  readonly socialPriorityPolicy: "courtmate-beneficial-rescue" | null;
  readonly selectionReturned: boolean;
  readonly searchLimitReached: boolean;
  readonly failureReason: string | null;
  readonly exploredBranches: number;
  readonly prunedBranches: number;
  readonly fairnessCertified: boolean;
  readonly starvationCertified: boolean;
  readonly varietyOptimal: boolean;
  readonly priorityCertified: boolean | null;
  readonly coverageGateStatus: string;
  readonly coverageGateCertified: boolean;
  readonly replayEnvelopeStatus: string;
  readonly replayCertified: boolean;
  readonly chosenCourtmateGain: number | null;
  readonly courtmateGainMaximum: number | null;
  readonly courtmateGainMaximumCertified: boolean | null;
  readonly chosenCourtmateGainDeficit: number | null;
  readonly chosenRollingMatchTypeGain: number | null;
  readonly bestRollingMatchTypeGainAtGmax: number | null;
  readonly idealRestGap: number | null;
  readonly availableOverduePlayerCount: number | null;
  readonly selectedOverduePlayerCount: number | null;
  readonly leftOutOverduePlayerCount: number | null;
}

export interface SocialGeneralizationDecisionTrace {
  readonly decisionId: number;
  readonly arm: SocialGeneralizationArm;
  readonly started: true;
  completed: boolean;
  completedAfterMatchNumber: number | null;
  readonly afterCompletedMatches: number;
  readonly courtCount: number;
  readonly refillCourtIndex: number | null;
  readonly eligiblePlayerIds: string[];
  readonly structuralRosterSnapshot: MatchmakerV3Player[];
  readonly activeReservations: SocialGeneralizationDecisionAssignment[];
  readonly selectedAssignments: SocialGeneralizationDecisionAssignment[];
  assignmentsStarted: number;
  assignmentRestTurns: Array<{ userId: string; restTurns: number; priorCompletedMatches: number }>;
  readonly proposedAssignmentRestTurns: Array<{ userId: string; restTurns: number; priorCompletedMatches: number }>;
  readonly starvationCounterfactual: {
    applicable: boolean;
    status: "not-applicable" | "certified" | "unknown";
    measurementComplete: boolean | null;
    selectedSetChanged: boolean | null;
    overdueAvailableCount: number;
    productionSelectedPlayerIds: string[] | null;
    withoutStarvationSelectedPlayerIds: string[] | null;
    withoutStarvationSearchLimitReached: boolean | null;
    withoutStarvationFairnessCertified: boolean | null;
  };
  readonly engine: SocialGeneralizationEngineProof;
  readonly audit: SocialGeneralizationDecisionAudit | null;
  readonly auditStatus: "certified" | "incomplete" | "no-selection";
  readonly auditPrefixHistoryLength: number;
  readonly rescue: SocialGeneralizationRescueWitness | null;
}

export interface SocialGeneralizationRescueWitness {
  readonly courtmateGainMaximum: number;
  readonly chosenCourtmateGain: number;
  readonly chosenCourtmateGainDeficit: number;
  readonly chosenSignedRollingTypeGainUnits: string;
  readonly chosenSignedRollingTypeGain: number;
  readonly bestSignedRollingTypeGainAtGmaxUnits: string;
  readonly bestSignedRollingTypeGainAtGmax: number;
  readonly conditionalTypeBenefitUnits: string | null;
  readonly conditionalTypeBenefit: number | null;
  readonly strictBenefit: boolean;
  readonly zeroBenefit: boolean;
  readonly negativeBenefit: boolean;
  readonly bestGmaxAtFrontier: SocialGeneralizationTypeWindowSelectionWitness | null;
  readonly selectedWindows: readonly SocialGeneralizationTypeWindowWitness[] | null;
  readonly fullTypeWindowCountDeltaVsBestGmax: number | null;
  readonly bothTypeWindowCountDeltaVsBestGmax: number | null;
}

export interface SocialGeneralizationEventApplication {
  readonly eventIndex: number;
  readonly type: SocialGeneralizationRosterEvent["type"];
  readonly scheduledAfterCompletedMatches: number;
  readonly appliedAfterCompletedMatches: number | null;
  readonly status: "applied" | "deferred-player-busy" | "unapplied-at-stop";
  readonly userIds: string[];
  readonly deferredAtCompletedMatchCounts?: number[];
  readonly structuralBefore?: Array<{
    userId: string;
    feasibleMatchTypes: Array<"MIXED" | "OWN_SIDE">;
    feasibleCourtmates: number;
    distinctCourtmates: number;
    courtmateCoverage: number | null;
    T: number | null;
  }>;
  readonly structuralAfter?: Array<{
    userId: string;
    feasibleMatchTypes: Array<"MIXED" | "OWN_SIDE">;
    feasibleCourtmates: number;
    distinctCourtmates: number;
    courtmateCoverage: number | null;
    T: number | null;
  }>;
  readonly semanticNote?: string;
  readonly matchmakingCreditChanges?: Array<{ userId: string; priorCredit: number; nextCredit: number }>;
}

export interface SocialGeneralizationCheckpoint {
  readonly targetCompletedMatches: number;
  readonly completedMatches: number;
  readonly decisionCohort: {
    started: number;
    completed: number;
    pending: number;
    fairnessCertificateFailures: number;
    starvationCertificateFailures: number;
    engineSearchLimitDecisions: number;
    independentAuditCertified: number;
    independentAuditIncomplete: number;
    independentAuditInvalid: number;
  };
  readonly structuralRoster: Array<{ userId: string; side: "UPPER" | "LOWER" | null; isPaused: boolean }>;
  readonly scheduledStructuralRoster: ReturnType<typeof getSocialGeneralizationStructuralRoster>;
  readonly structuralRosterMatchesCatalog: boolean;
  readonly scores: SocialGeneralizationPrefixResult;
  readonly fairness: {
    countSpread: number;
    minimumMatchCount: number;
    maximumMatchCount: number;
    playerMatchCounts: Array<{ userId: string; matchesPlayed: number; effectiveMatchCount: number; matchmakingMatchesCredit: number; isPaused: boolean; arrivalPriorityAt: string | null }>;
    arrivalPriorityPlayers: string[];
    fairnessCertificateFailures: number;
  };
  readonly rest: {
    assignmentCount: number;
    backToBackAssignments: number;
    backToBackRate: number | null;
    meanRestTurns: number | null;
    p95RestTurns: number | null;
    maximumAssignmentRestTurns: number;
    /** Maximum number of other completed-match events strictly between two completions by one player. */
    longestOtherCompletionGap: number;
    starvationInterventions: number;
    starvationCounterfactualsApplicable: number;
    starvationCounterfactualsCertified: number;
    starvationCounterfactualsUnknown: number;
    maximumObservedIdealRestGap: number;
    /** Maximum completed-match event-index distance between two completions by one player, including endpoints. */
    maximumOwnCompletionEventDistance: number;
  };
  readonly rescue: {
    auditDecisionCount: number;
    completedAuditedDecisionCount: number;
    proposedOnePairConcessions: number;
    onePairConcessions: number;
    completedOnePairConcessions: number;
    totalCourtMatePairsConceded: number;
    concessionRate: number | null;
    conditionalTypeBenefitTotal: number;
    zeroBenefitConcessions: number;
    negativeBenefitConcessions: number;
    completedConditionalTypeBenefitTotal: number;
    completedZeroBenefitConcessions: number;
    completedNegativeBenefitConcessions: number;
    completedFullTypeWindowDeltaVsBestGmax: number;
    completedBothTypeWindowDeltaVsBestGmax: number;
    concessionWitnesses: Array<{
      decisionId: number;
      executed: boolean;
      completed: boolean;
      completedAfterMatchNumber: number | null;
      courtmateGainMaximum: number;
      chosenCourtmateGain: number;
      chosenCourtmateGainDeficit: number;
      chosenSignedRollingTypeGain: number;
      bestSignedRollingTypeGainAtGmax: number;
      conditionalTypeBenefit: number | null;
      strictBenefit: boolean;
      zeroBenefit: boolean;
      negativeBenefit: boolean;
      fullTypeWindowCountDeltaVsBestGmax: number | null;
      bothTypeWindowCountDeltaVsBestGmax: number | null;
    }>;
  };
  readonly currentOpportunityPlayerCount: number;
  readonly rosterEventCohort: {
    scheduled: number;
    applied: number;
    deferred: number;
    unapplied: number;
    matchmakingCreditChanges: number;
  };
}

export interface SocialGeneralizationSessionResult {
  readonly scenarioId: string;
  readonly seed: number;
  readonly arm: SocialGeneralizationArm;
  status: SocialGeneralizationSessionStatus;
  stopReason: string | null;
  readonly requestedCheckpoints: number[];
  readonly checkpoints: SocialGeneralizationCheckpoint[];
  readonly decisions: SocialGeneralizationDecisionTrace[];
  readonly completedHistory: SocialHistoryMatch[];
  readonly eventApplications: SocialGeneralizationEventApplication[];
  readonly rosterRemovalSemantics: string;
  error?: string;
}

export interface SocialGeneralizationProgress {
  readonly completedSessions: number;
  readonly totalSessions: number;
  readonly session: SocialGeneralizationSessionResult;
}

export interface SocialGeneralizationBenchmarkReport {
  readonly schemaVersion: "social-generalization-v1";
  readonly validationStatus: "pending";
  readonly generatedAt: string;
  readonly seeds: number[];
  readonly scenarios: SocialGeneralizationScenario[];
  readonly arms: readonly SocialGeneralizationArm[];
  readonly methodology: {
    readonly history: "Completed-only prefix history with assignment-time SocialVarietySnapshots; active reservations are supplied to production selection but excluded from endpoint scores and independent rescue audits.";
    readonly rest: "Discrete completed-match events while available; paused and busy players do not accrue rest turns; no time-based rest. longestOtherCompletionGap counts intervening events only; maximumOwnCompletionEventDistance includes both completion endpoints.";
    readonly arrivalCredit: "Production calculateNoCatchUpMatchmakingCredit applied against all nonpaused roster members, including busy players.";
    readonly departure: "The current production DELETE route rejects a player with match history. A played participant leaving permanently is represented as an indefinite pause and remains in structural opportunity sets.";
    readonly candidatePolicy: "courtmate-beneficial-rescue; unchanged matcher ordering and strict signed rolling-T guard.";
    readonly largeSearch: "The matcher uses its default search budget; production may continue with a returned fair heuristic selection while searchLimitReached is retained, while an uncertified experimental selection stops that candidate session.";
  };
  readonly sessions: SocialGeneralizationSessionResult[];
}

export interface RunSocialGeneralizationBenchmarkOptions {
  readonly scenarioIds?: readonly string[];
  readonly seeds?: readonly number[];
  readonly includeSelectedLongDiagnostics?: boolean;
  readonly onProgress?: (event: SocialGeneralizationProgress) => void;
}

interface MutableAssignment {
  readonly assignmentId: string;
  readonly courtIndex: number;
  readonly decisionId: number;
  readonly ids: string[];
  readonly partition: V3DoublesPartition;
  readonly socialVariety: SocialVarietySnapshot;
  readonly restTurnsAtAssignment: Map<string, number>;
  remaining: boolean;
}

interface MutablePlayer extends MatchmakerV3Player {
  matchmakingMatchesCredit: number;
  pauseStartedAfterCompletedMatches: number | null;
}

const DEFAULT_SEEDS = [1, 4729, 104729] as const;
const EPOCH_MS = Date.parse("2026-10-03T00:00:00.000Z");
const QUANTILE_P95 = 0.95;

function seededParkMiller(seed: number) {
  let value = Math.abs(Math.floor(seed)) % 2_147_483_647;
  if (value === 0) value = 1;
  return () => {
    value = (value * 48_271) % 2_147_483_647;
    return value / 2_147_483_647;
  };
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(QUANTILE_P95 * ordered.length) - 1] ?? null;
}

function makePlayer(
  userId: string,
  side: "UPPER" | "LOWER",
  rank: number,
  playerCount: number,
  arrivalPriorityAt: Date | null = null,
): MutablePlayer {
  const gender = side === "UPPER" ? PlayerGender.MALE : PlayerGender.FEMALE;
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    matchmakingMatchesCredit: 0,
    availableSince: new Date(EPOCH_MS),
    restTurns: 0,
    strength: 10 + (playerCount - rank - 1) * 0.1,
    pointDiff: 0,
    gender,
    partnerPreference: side === "UPPER" ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
    mixedSideOverride: side === "UPPER" ? MixedSide.UPPER : MixedSide.LOWER,
    isBusy: false,
    isPaused: false,
    arrivalPriorityAt,
    pauseStartedAfterCompletedMatches: null,
  };
}

function clonePlayer(player: MutablePlayer): MatchmakerV3Player {
  return {
    userId: player.userId,
    matchesPlayed: player.matchesPlayed,
    matchmakingBaseline: player.matchmakingBaseline,
    availableSince: new Date(player.availableSince),
    restTurns: player.restTurns ?? 0,
    strength: player.strength,
    pointDiff: player.pointDiff ?? 0,
    gender: player.gender,
    partnerPreference: player.partnerPreference,
    mixedSideOverride: player.mixedSideOverride,
    isBusy: Boolean(player.isBusy),
    isPaused: Boolean(player.isPaused),
    arrivalPriorityAt: player.arrivalPriorityAt instanceof Date
      ? new Date(player.arrivalPriorityAt)
      : player.arrivalPriorityAt ?? null,
    lastPartnerId: player.lastPartnerId ?? null,
  };
}

function cloneHistoryMatch(match: SocialHistoryMatch): SocialHistoryMatch {
  return {
    id: match.id,
    team1: [...match.team1] as [string, string],
    team2: [...match.team2] as [string, string],
    ...(match.completedAt ? { completedAt: new Date(match.completedAt) } : {}),
    ...(match.socialVariety ? {
      socialVariety: {
        ...match.socialVariety,
        effectiveSideByUserId: { ...match.socialVariety.effectiveSideByUserId },
      },
    } : {}),
  };
}

function assignmentSnapshot(assignment: Pick<MutableAssignment, "ids" | "partition" | "socialVariety">): SocialGeneralizationDecisionAssignment {
  return {
    ids: [...assignment.ids],
    partition: {
      team1: [...assignment.partition.team1] as [string, string],
      team2: [...assignment.partition.team2] as [string, string],
    },
    socialVariety: {
      ...assignment.socialVariety,
      effectiveSideByUserId: { ...assignment.socialVariety.effectiveSideByUserId },
    },
  };
}

function percentileRest(rests: readonly number[]) {
  return percentile95(rests);
}

function makeEngineProof(result: ReturnType<typeof findBestRotationBatchSelection>): SocialGeneralizationEngineProof {
  return {
    socialPriorityPolicy: result.socialPriorityPolicy === "courtmate-beneficial-rescue"
      ? result.socialPriorityPolicy
      : null,
    selectionReturned: Boolean(result.selection),
    searchLimitReached: result.debug.searchLimitReached,
    failureReason: result.debug.failureReason,
    exploredBranches: result.debug.exploredBranches,
    prunedBranches: result.debug.prunedBranches,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    varietyOptimal: result.varietyOptimal,
    priorityCertified: result.priorityCertified ?? null,
    coverageGateStatus: result.coverageGateStatus,
    coverageGateCertified: result.coverageGateCertified,
    replayEnvelopeStatus: result.replayEnvelopeStatus,
    replayCertified: result.replayCertified,
    chosenCourtmateGain: result.chosenNewCourtmatePairCount ?? null,
    courtmateGainMaximum: result.courtmateGainMaximum ?? null,
    courtmateGainMaximumCertified: result.courtmateGainMaximumCertified ?? null,
    chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit ?? null,
    chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain ?? null,
    bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax ?? null,
    idealRestGap: result.debug.socialIdealRestGap ?? null,
    availableOverduePlayerCount: result.debug.availableOverduePlayerCount ?? null,
    selectedOverduePlayerCount: result.debug.selectedOverduePlayerCount ?? null,
    leftOutOverduePlayerCount: result.debug.leftOutOverduePlayerCount ?? null,
  };
}

function makeRescueWitness(audit: SocialGeneralizationDecisionAudit): SocialGeneralizationRescueWitness | null {
  if (!audit.complete || audit.courtmateGainMaximum === null || audit.selectedCourtmateGain === null ||
    audit.selectedSignedRollingTypeGainUnits === null || audit.selectedSignedRollingTypeGain === null ||
    audit.bestSignedRollingTypeGainAtGmaxUnits === null || audit.bestSignedRollingTypeGainAtGmax === null) {
    return null;
  }
  const deficit = audit.courtmateGainMaximum - audit.selectedCourtmateGain;
  const benefitUnits = audit.onePairConditionalTypeBenefitUnits;
  const conditionalTypeBenefit = audit.selectedSignedRollingTypeGain - audit.bestSignedRollingTypeGainAtGmax;
  const conditionalTypeBenefitUnits = audit.onePairConditionalTypeBenefitUnits;
  const exactBenefit = conditionalTypeBenefitUnits === null ? null : BigInt(conditionalTypeBenefitUnits);
  const bestGmaxWitness = audit.bestGmaxWitness;
  return {
    courtmateGainMaximum: audit.courtmateGainMaximum,
    chosenCourtmateGain: audit.selectedCourtmateGain,
    chosenCourtmateGainDeficit: deficit,
    chosenSignedRollingTypeGainUnits: audit.selectedSignedRollingTypeGainUnits,
    chosenSignedRollingTypeGain: audit.selectedSignedRollingTypeGain,
    bestSignedRollingTypeGainAtGmaxUnits: audit.bestSignedRollingTypeGainAtGmaxUnits,
    bestSignedRollingTypeGainAtGmax: audit.bestSignedRollingTypeGainAtGmax,
    conditionalTypeBenefitUnits: benefitUnits,
    conditionalTypeBenefit: deficit === 1 ? conditionalTypeBenefit : null,
    strictBenefit: deficit === 1 && exactBenefit !== null && exactBenefit > BigInt(0),
    zeroBenefit: deficit === 1 && exactBenefit === BigInt(0),
    negativeBenefit: deficit === 1 && exactBenefit !== null && exactBenefit < BigInt(0),
    bestGmaxAtFrontier: bestGmaxWitness,
    selectedWindows: audit.selectedTypeWindows,
    fullTypeWindowCountDeltaVsBestGmax: bestGmaxWitness && audit.selectedFullTypePlayerCount !== null
      ? audit.selectedFullTypePlayerCount - bestGmaxWitness.fullTypePlayerCount
      : null,
    bothTypeWindowCountDeltaVsBestGmax: bestGmaxWitness && audit.selectedBothTypePlayerCount !== null
      ? audit.selectedBothTypePlayerCount - bestGmaxWitness.bothTypePlayerCount
      : null,
  };
}

function initialPlayers(scenario: SocialGeneralizationScenario): MutablePlayer[] {
  const maxRoster = getSocialGeneralizationStructuralRoster(scenario, Number.MAX_SAFE_INTEGER);
  const rankById = new Map(maxRoster.map((player, index) => [player.userId, index]));
  const count = maxRoster.length;
  return getSocialGeneralizationStructuralRoster(scenario, 0).map((player) =>
    makePlayer(player.userId, player.side, rankById.get(player.userId) ?? 0, count));
}

function activeReservations(activeAssignments: ReadonlyArray<MutableAssignment>): SocialHistoryMatch[] {
  return activeAssignments.map((assignment) => ({
    id: `active-${assignment.assignmentId}`,
    team1: [...assignment.partition.team1] as [string, string],
    team2: [...assignment.partition.team2] as [string, string],
    socialVariety: assignment.socialVariety,
  }));
}

function selectedAssignments(result: ReturnType<typeof findBestRotationBatchSelection>): SocialGeneralizationDecisionAssignment[] {
  return (result.selection?.selections ?? []).map((selection) => ({
    ids: [...selection.ids],
    partition: {
      team1: [...selection.partition.team1] as [string, string],
      team2: [...selection.partition.team2] as [string, string],
    },
    socialVariety: selection.socialVariety ?? buildSocialVarietySnapshot(selection.partition, selection.players),
  }));
}

function selectedPlayerIsBusy(userId: string, activeAssignments: ReadonlyArray<MutableAssignment>) {
  return activeAssignments.some((assignment) => assignment.remaining && assignment.ids.includes(userId));
}

function dateForRosterEvent(eventIndex: number, completedMatchCount: number): Date {
  return new Date(EPOCH_MS + completedMatchCount * 60_000 + eventIndex * 1_000);
}

function playerSnapshotForEvent(
  scenario: SocialGeneralizationScenario,
  count: number,
  currentPlayerCount: number,
): { userId: string; side: "UPPER" | "LOWER"; rank: number }[] {
  const finalRoster = getSocialGeneralizationStructuralRoster(scenario, Number.MAX_SAFE_INTEGER);
  const rankById = new Map(finalRoster.map((player, index) => [player.userId, index]));
  return getSocialGeneralizationStructuralRoster(scenario, count)
    .filter((player) => !player.isPaused)
    .map((player) => ({ userId: player.userId, side: player.side, rank: rankById.get(player.userId) ?? currentPlayerCount }));
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeCheckpoint(
  scenario: SocialGeneralizationScenario,
  arm: SocialGeneralizationArm,
  target: number,
  completedMatches: number,
  players: readonly MutablePlayer[],
  history: readonly SocialHistoryMatch[],
  decisions: readonly SocialGeneralizationDecisionTrace[],
  eventApplications: readonly SocialGeneralizationEventApplication[],
  assignmentRestTurns: readonly number[],
  backToBackAssignments: number,
  eligibleBackToBackAssignments: number,
  longestOtherCompletionGap: number,
  maximumOwnCompletionEventDistance: number,
): SocialGeneralizationCheckpoint {
  const structuralRoster = players.map((player) => ({
    userId: player.userId,
    side: player.mixedSideOverride === MixedSide.UPPER || player.gender === PlayerGender.MALE ? "UPPER" as const
      : player.mixedSideOverride === MixedSide.LOWER || player.gender === PlayerGender.FEMALE ? "LOWER" as const
        : null,
    isPaused: Boolean(player.isPaused),
  }));
  const opportunityRoster = arm === "production" ? players.filter((player) => !player.isPaused) : players;
  const scores = scoreSocialGeneralizationPrefix({
    structuralRoster: players,
    opportunityRoster,
    completedHistory: history,
  });
  const scheduledStructuralRoster = getSocialGeneralizationStructuralRoster(scenario, completedMatches);
  const liveStructural = structuralRoster.map(({ userId, side, isPaused }) => ({ userId, side, isPaused }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const scheduledNormalized = scheduledStructuralRoster.map(({ userId, side, isPaused }) => ({ userId, side, isPaused }))
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const rosterMatch = JSON.stringify(liveStructural) === JSON.stringify(scheduledNormalized);
  const matchCounts = players.map((player) => player.matchesPlayed);
  const minCount = matchCounts.length ? Math.min(...matchCounts) : 0;
  const maxCount = matchCounts.length ? Math.max(...matchCounts) : 0;
  const started = decisions.filter((decision) => decision.afterCompletedMatches <= completedMatches).length;
  const completed = decisions.filter((decision) => decision.completedAfterMatchNumber !== null &&
    decision.completedAfterMatchNumber <= completedMatches).length;
  const checkpointDecisions = decisions.filter((decision) => decision.afterCompletedMatches <= completedMatches);
  const audits = checkpointDecisions.filter((decision) => decision.audit !== null);
  const applicableCounterfactuals = checkpointDecisions.filter((decision) => decision.starvationCounterfactual.applicable);
  const concessionWitnesses = checkpointDecisions.flatMap((decision) => {
    if (!decision.rescue || decision.rescue.chosenCourtmateGainDeficit !== 1) return [];
    const completed = decision.completedAfterMatchNumber !== null && decision.completedAfterMatchNumber <= completedMatches;
    return [{
      decisionId: decision.decisionId,
      executed: decision.assignmentsStarted > 0,
      completed,
      completedAfterMatchNumber: decision.completedAfterMatchNumber,
      courtmateGainMaximum: decision.rescue.courtmateGainMaximum,
      chosenCourtmateGain: decision.rescue.chosenCourtmateGain,
      chosenCourtmateGainDeficit: decision.rescue.chosenCourtmateGainDeficit,
      chosenSignedRollingTypeGain: decision.rescue.chosenSignedRollingTypeGain,
      bestSignedRollingTypeGainAtGmax: decision.rescue.bestSignedRollingTypeGainAtGmax,
      conditionalTypeBenefit: decision.rescue.conditionalTypeBenefit,
      strictBenefit: decision.rescue.strictBenefit,
      zeroBenefit: decision.rescue.zeroBenefit,
      negativeBenefit: decision.rescue.negativeBenefit,
      fullTypeWindowCountDeltaVsBestGmax: decision.rescue.fullTypeWindowCountDeltaVsBestGmax,
      bothTypeWindowCountDeltaVsBestGmax: decision.rescue.bothTypeWindowCountDeltaVsBestGmax,
    }];
  });
  const proposedConcessions = concessionWitnesses;
  const concessionWitnessesExecuted = proposedConcessions.filter((witness) => witness.executed);
  const completedConcessions = concessionWitnessesExecuted.filter((witness) => witness.completed);
  const onePair = concessionWitnessesExecuted.length;
  const auditCertified = audits.filter((decision) => decision.audit?.complete && decision.audit.selectedValid &&
    decision.audit.selectedFairnessCertified && decision.audit.selectedStarvationCertified).length;
  const auditInvalid = audits.filter((decision) => !decision.audit?.selectedValid ||
    !decision.audit?.selectedFairnessCertified || !decision.audit?.selectedStarvationCertified).length;
  const auditedBenefitTotal = concessionWitnessesExecuted.reduce((sum, witness) => sum + (witness.conditionalTypeBenefit ?? 0), 0);
  const completedBenefitTotal = completedConcessions.reduce((sum, witness) => sum + (witness.conditionalTypeBenefit ?? 0), 0);
  const nonPausedPlayerCount = players.filter((player) => !player.isPaused).length;
  const relevantRestTurns = assignmentRestTurns;
  const startedForArm = checkpointDecisions;
  const fairnessFailures = startedForArm.filter((decision) => !decision.engine.fairnessCertified).length;
  const starvationFailures = startedForArm.filter((decision) => !decision.engine.starvationCertified).length;
  const starvationInterventions = applicableCounterfactuals.filter((decision) =>
    decision.starvationCounterfactual.status === "certified" && decision.starvationCounterfactual.selectedSetChanged === true).length;
  const auditIncomplete = audits.filter((decision) => !decision.audit?.complete).length;
  const assignmentCount = relevantRestTurns.length;
  const checkpointEvents = eventApplications.filter((event) => event.scheduledAfterCompletedMatches <= completedMatches);

  return {
    targetCompletedMatches: target,
    completedMatches,
    decisionCohort: {
      started,
      completed,
      pending: started - completed,
      fairnessCertificateFailures: fairnessFailures,
      starvationCertificateFailures: starvationFailures,
      engineSearchLimitDecisions: checkpointDecisions.filter((decision) => decision.engine.searchLimitReached).length,
      independentAuditCertified: auditCertified,
      independentAuditIncomplete: auditIncomplete,
      independentAuditInvalid: auditInvalid,
    },
    structuralRoster: liveStructural,
    scheduledStructuralRoster,
    structuralRosterMatchesCatalog: rosterMatch,
    scores,
    fairness: {
      countSpread: maxCount - minCount,
      minimumMatchCount: minCount,
      maximumMatchCount: maxCount,
      playerMatchCounts: players.map((player) => ({
        userId: player.userId,
        matchesPlayed: player.matchesPlayed,
        effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
        matchmakingMatchesCredit: player.matchmakingMatchesCredit,
        isPaused: Boolean(player.isPaused),
        arrivalPriorityAt: player.arrivalPriorityAt instanceof Date ? player.arrivalPriorityAt.toISOString()
          : typeof player.arrivalPriorityAt === "string" ? player.arrivalPriorityAt : null,
      })),
      arrivalPriorityPlayers: players.filter((player) => player.arrivalPriorityAt).map((player) => player.userId),
      fairnessCertificateFailures: fairnessFailures,
    },
    rest: {
      assignmentCount,
      backToBackAssignments,
      backToBackRate: eligibleBackToBackAssignments ? backToBackAssignments / eligibleBackToBackAssignments : null,
      meanRestTurns: average(relevantRestTurns),
      p95RestTurns: percentileRest(relevantRestTurns),
      maximumAssignmentRestTurns: relevantRestTurns.length ? Math.max(...relevantRestTurns) : 0,
      longestOtherCompletionGap,
      starvationInterventions,
      starvationCounterfactualsApplicable: applicableCounterfactuals.length,
      starvationCounterfactualsCertified: applicableCounterfactuals.filter((decision) =>
        decision.starvationCounterfactual.status === "certified").length,
      starvationCounterfactualsUnknown: applicableCounterfactuals.filter((decision) =>
        decision.starvationCounterfactual.status === "unknown").length,
      maximumObservedIdealRestGap: nonPausedPlayerCount ? getSocialIdealRestGap(nonPausedPlayerCount) : 0,
      maximumOwnCompletionEventDistance,
    },
    rescue: {
      auditDecisionCount: audits.length,
      completedAuditedDecisionCount: audits.filter((decision) => decision.completedAfterMatchNumber !== null &&
        decision.completedAfterMatchNumber <= completedMatches).length,
      proposedOnePairConcessions: proposedConcessions.length,
      onePairConcessions: onePair,
      completedOnePairConcessions: completedConcessions.length,
      totalCourtMatePairsConceded: onePair,
      concessionRate: audits.length ? onePair / audits.length : null,
      conditionalTypeBenefitTotal: auditedBenefitTotal,
      zeroBenefitConcessions: concessionWitnessesExecuted.filter((witness) => witness.zeroBenefit).length,
      negativeBenefitConcessions: concessionWitnessesExecuted.filter((witness) => witness.negativeBenefit).length,
      completedConditionalTypeBenefitTotal: completedBenefitTotal,
      completedZeroBenefitConcessions: completedConcessions.filter((witness) => witness.zeroBenefit).length,
      completedNegativeBenefitConcessions: completedConcessions.filter((witness) => witness.negativeBenefit).length,
      completedFullTypeWindowDeltaVsBestGmax: completedConcessions.reduce((sum, witness) => sum + (witness.fullTypeWindowCountDeltaVsBestGmax ?? 0), 0),
      completedBothTypeWindowDeltaVsBestGmax: completedConcessions.reduce((sum, witness) => sum + (witness.bothTypeWindowCountDeltaVsBestGmax ?? 0), 0),
      concessionWitnesses: concessionWitnesses as typeof concessionWitnesses,
    },
    currentOpportunityPlayerCount: opportunityRoster.length,
    rosterEventCohort: {
      scheduled: scenario.events.filter((event) => event.afterCompletedMatches <= completedMatches).length,
      applied: checkpointEvents.filter((event) => event.status === "applied" && event.appliedAfterCompletedMatches !== null &&
        event.appliedAfterCompletedMatches <= completedMatches).length,
      deferred: checkpointEvents.filter((event) => event.deferredAtCompletedMatchCounts?.some((count) => count <= completedMatches)).length,
      unapplied: checkpointEvents.filter((event) => event.status === "unapplied-at-stop").length,
      matchmakingCreditChanges: checkpointEvents.reduce((sum, event) => sum + (event.matchmakingCreditChanges?.length ?? 0), 0),
    },
  };
}

function applyEvent(
  event: SocialGeneralizationRosterEvent,
  eventIndex: number,
  scenario: SocialGeneralizationScenario,
  completedMatches: number,
  players: MutablePlayer[],
  activeAssignments: readonly MutableAssignment[],
): SocialGeneralizationEventApplication | null {
  const userIds = event.type === "join" ? event.players.map((player) => player.userId) : [event.userId];
  if (event.type !== "join" && selectedPlayerIsBusy(event.userId, activeAssignments)) return null;
  const appliedAt = dateForRosterEvent(eventIndex, completedMatches);
  const creditChanges: Array<{ userId: string; priorCredit: number; nextCredit: number }> = [];
  if (event.type === "join") {
    const rosterRows = playerSnapshotForEvent(scenario, completedMatches, players.length);
    const rosterCountAfterJoin = getSocialGeneralizationStructuralRoster(scenario, Number.MAX_SAFE_INTEGER).length;
    for (const joiningPlayer of event.players) {
      const priorCredit = 0;
      const matchmakingMatchesCredit = calculateNoCatchUpMatchmakingCredit({
        player: { matchesPlayed: 0, matchmakingMatchesCredit: 0 },
        activePlayers: players.filter((player) => !player.isPaused).map((player) => ({
          matchesPlayed: player.matchesPlayed,
          matchmakingMatchesCredit: player.matchmakingMatchesCredit,
        })),
      });
      const rankInfo = rosterRows.find((player) => player.userId === joiningPlayer.userId);
      const side = joiningPlayer.side;
      const player = makePlayer(
        joiningPlayer.userId,
        side,
        rankInfo?.rank ?? players.length,
        rosterCountAfterJoin,
        appliedAt,
      );
      player.matchmakingMatchesCredit = matchmakingMatchesCredit;
      player.matchmakingBaseline = player.matchesPlayed + matchmakingMatchesCredit;
      player.availableSince = appliedAt;
      players.push(player);
      creditChanges.push({ userId: player.userId, priorCredit, nextCredit: matchmakingMatchesCredit });
    }
  } else {
    const player = players.find((candidate) => candidate.userId === event.userId);
    if (!player) {
      return {
        eventIndex,
        type: event.type,
        scheduledAfterCompletedMatches: event.afterCompletedMatches,
        appliedAfterCompletedMatches: completedMatches,
        status: "applied",
        userIds,
        semanticNote: "Catalog event referenced a missing player; no roster mutation was possible.",
      };
    }
    if (event.type === "pause") {
      player.isPaused = true;
      player.pauseStartedAfterCompletedMatches = completedMatches;
    } else {
      const pauseStartedAt = player.pauseStartedAfterCompletedMatches;
      const otherMatchesCompletedWhilePaused = pauseStartedAt !== null && completedMatches > pauseStartedAt;
      if (otherMatchesCompletedWhilePaused) {
        const priorCredit = player.matchmakingMatchesCredit;
        const nextCredit = calculateNoCatchUpMatchmakingCredit({
          player,
          activePlayers: players.filter((candidate) => candidate.userId !== player.userId && !candidate.isPaused).map((candidate) => ({
            matchesPlayed: candidate.matchesPlayed,
            matchmakingMatchesCredit: candidate.matchmakingMatchesCredit,
          })),
        });
        player.matchmakingMatchesCredit = nextCredit;
        creditChanges.push({ userId: player.userId, priorCredit, nextCredit });
        player.arrivalPriorityAt = appliedAt;
        player.availableSince = appliedAt;
        player.restTurns = 0;
      }
      player.isPaused = false;
      player.pauseStartedAfterCompletedMatches = null;
    }
  }
  return {
    eventIndex,
    type: event.type,
    scheduledAfterCompletedMatches: event.afterCompletedMatches,
    appliedAfterCompletedMatches: completedMatches,
    status: "applied",
    userIds,
    semanticNote: event.type === "pause" && scenario.id.includes("played-departure")
      ? "Played permanent departure is represented as indefinite pause because DELETE rejects recorded match history; structural opportunity remains."
      : undefined,
    ...(creditChanges.length ? { matchmakingCreditChanges: creditChanges } : {}),
  };
}

function eventStructuralState(players: readonly MutablePlayer[], history: readonly SocialHistoryMatch[]) {
  return scoreSocialGeneralizationPrefix({ structuralRoster: players, completedHistory: history }).structural.players.map((player) => ({
    userId: player.userId,
    feasibleMatchTypes: [...player.feasibleMatchTypes],
    feasibleCourtmates: player.feasibleCourtmates,
    distinctCourtmates: player.distinctCourtmates,
    courtmateCoverage: player.courtmateCoverage,
    T: player.T,
  }));
}

function snapshotAfterEvent(event: SocialGeneralizationRosterEvent, players: MutablePlayer[]) {
  if (event.type === "join") return;
  const player = players.find((candidate) => candidate.userId === event.userId);
  if (player) player.matchmakingBaseline = player.matchesPlayed + player.matchmakingMatchesCredit;
}

export async function runSocialGeneralizationSession({
  scenario,
  seed,
  arm,
  includeLongDiagnostic = false,
}: {
  scenario: SocialGeneralizationScenario;
  seed: number;
  arm: SocialGeneralizationArm;
  includeLongDiagnostic?: boolean;
}): Promise<SocialGeneralizationSessionResult> {
  const requestedCheckpoints = [scenario.shortHorizonMatches];
  if (includeLongDiagnostic && scenario.longDiagnostic && !requestedCheckpoints.includes(100)) requestedCheckpoints.push(100);
  const result: SocialGeneralizationSessionResult = {
    scenarioId: scenario.id,
    seed,
    arm,
    status: "completed",
    stopReason: null,
    requestedCheckpoints,
    checkpoints: [],
    decisions: [],
    completedHistory: [],
    eventApplications: [],
    rosterRemovalSemantics: "Played participants cannot be deleted through the production player DELETE route after match history exists; a permanent departure remains paused in the structural roster.",
  };

  try {
    const players = initialPlayers(scenario);
    const playerById = new Map<string, MutablePlayer>();
    for (const player of players) playerById.set(player.userId, player);
    const matchRandom = seededParkMiller(seed);
    const courtScheduleRandom = seededParkMiller(seed ^ 0x6d2b79f5);
    const assignmentsByCourt = new Map<number, MutableAssignment>();
    const activeAssignments: MutableAssignment[] = [];
    const assignmentRestTurns: number[] = [];
    const lastCompletionEventByPlayer = new Map<string, number>();
    let longestOtherCompletionGap = 0;
    let maximumOwnCompletionEventDistance = 0;
    let backToBackAssignments = 0;
    let eligibleBackToBackAssignments = 0;
    let completedMatches = 0;
    let nextDecisionId = 1;
    let nextAssignmentId = 1;
    const appliedEventIndexes = new Set<number>();
    const requestedEnd = requestedCheckpoints[requestedCheckpoints.length - 1] ?? scenario.shortHorizonMatches;

    const processDueEvents = () => {
      for (let index = 0; index < scenario.events.length; index += 1) {
        if (appliedEventIndexes.has(index)) continue;
        const event = scenario.events[index];
        if (event.afterCompletedMatches > completedMatches) continue;
        const before = eventStructuralState(players, result.completedHistory);
        const application = applyEvent(event, index, scenario, completedMatches, players, activeAssignments);
        if (!application) {
          const priorIndex = result.eventApplications.findIndex((entry) => entry.eventIndex === index);
          const prior = priorIndex >= 0 ? result.eventApplications[priorIndex] : null;
          const deferredAtCompletedMatchCounts = [...(prior?.deferredAtCompletedMatchCounts ?? []), completedMatches];
          const deferred: SocialGeneralizationEventApplication = {
            eventIndex: index,
            type: event.type,
            scheduledAfterCompletedMatches: event.afterCompletedMatches,
            appliedAfterCompletedMatches: null,
            status: "deferred-player-busy",
            userIds: event.type === "join" ? event.players.map((player) => player.userId) : [event.userId],
            deferredAtCompletedMatchCounts,
            semanticNote: "Event was retained until the target player had no active assignment.",
          };
          if (priorIndex >= 0) result.eventApplications[priorIndex] = deferred;
          else result.eventApplications.push(deferred);
          continue;
        }
        appliedEventIndexes.add(index);
        const priorIndex = result.eventApplications.findIndex((entry) => entry.eventIndex === index);
        const prior = priorIndex >= 0 ? result.eventApplications[priorIndex] : null;
        snapshotAfterEvent(event, players);
        for (const id of application.userIds) {
          const joined = players.find((player) => player.userId === id);
          if (joined) playerById.set(id, joined);
        }
        const after = eventStructuralState(players, result.completedHistory);
        const applied: SocialGeneralizationEventApplication = {
          ...application,
          ...(prior?.deferredAtCompletedMatchCounts?.length
            ? { deferredAtCompletedMatchCounts: [...prior.deferredAtCompletedMatchCounts] }
            : {}),
          structuralBefore: before,
          structuralAfter: after,
        };
        if (priorIndex >= 0) result.eventApplications[priorIndex] = applied;
        else result.eventApplications.push(applied);
      }
    };

    const maybeCheckpoint = () => {
      while (result.checkpoints.length < requestedCheckpoints.length && completedMatches >= requestedCheckpoints[result.checkpoints.length]) {
        const target = requestedCheckpoints[result.checkpoints.length];
        const checkpoint = summarizeCheckpoint(
          scenario,
          arm,
          target,
          completedMatches,
          players,
          result.completedHistory,
          result.decisions,
          result.eventApplications,
          assignmentRestTurns,
          backToBackAssignments,
          eligibleBackToBackAssignments,
          longestOtherCompletionGap,
          maximumOwnCompletionEventDistance,
        );
        result.checkpoints.push(checkpoint);
      }
    };

    const startDecision = (courtCount: number, refillCourtIndex: number | null) => {
      for (const player of players) player.matchmakingBaseline = player.matchesPlayed + player.matchmakingMatchesCredit;
      const rosterSnapshot = players.map(clonePlayer);
      const activeReservationsSnapshot = activeAssignments.filter((assignment) => assignment.remaining).map(assignmentSnapshot);
      const debugPool = buildActivePlayers(players, { randomFn: () => 0, respectPlayerRest: false });
      const rotationPlayerCount = players.filter((player) => !player.isPaused).length;
      const matcherOptions = {
        courtCount,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        respectPlayerRest: true,
        rotationPlayerCount,
        completedMatches: result.completedHistory,
        socialHistoryMatches: [...result.completedHistory, ...activeReservations(activeAssignments.filter((assignment) => assignment.remaining))],
        randomFn: matchRandom,
        ...(arm === "production" ? {} : { socialPriorityPolicy: "courtmate-beneficial-rescue" as const }),
      };
      const idealRestGap = getSocialIdealRestGap(rotationPlayerCount);
      const overdueAvailableCount = debugPool.filter((player) => player.restTurns > idealRestGap).length;
      const counterfactualMeasurement = overdueAvailableCount > 0
        ? measureRotationStarvationIntervention(players, matcherOptions)
        : null;
      const engine = counterfactualMeasurement?.production ?? findBestRotationBatchSelection(players, matcherOptions);
      const selectedSet = (selection: typeof engine.selection) => selection
        ? selection.selections.flatMap((court) => court.ids).sort()
        : null;
      const starvationCounterfactual: SocialGeneralizationDecisionTrace["starvationCounterfactual"] =
        counterfactualMeasurement === null
          ? {
              applicable: false,
              status: "not-applicable",
              measurementComplete: null,
              selectedSetChanged: null,
              overdueAvailableCount: 0,
              productionSelectedPlayerIds: null,
              withoutStarvationSelectedPlayerIds: null,
              withoutStarvationSearchLimitReached: null,
              withoutStarvationFairnessCertified: null,
            }
          : {
              applicable: true,
              status: counterfactualMeasurement.measurementComplete ? "certified" : "unknown",
              measurementComplete: counterfactualMeasurement.measurementComplete,
              selectedSetChanged: counterfactualMeasurement.selectedSetChanged,
              overdueAvailableCount,
              productionSelectedPlayerIds: selectedSet(counterfactualMeasurement.production.selection),
              withoutStarvationSelectedPlayerIds: selectedSet(counterfactualMeasurement.withoutStarvation.selection),
              withoutStarvationSearchLimitReached: counterfactualMeasurement.withoutStarvation.debug.searchLimitReached,
              withoutStarvationFairnessCertified: counterfactualMeasurement.withoutStarvation.fairnessCertified,
            };
      const chosen = selectedAssignments(engine);
      const audit = chosen.length === courtCount
        ? auditSocialGeneralizationDecision({
            structuralRoster: rosterSnapshot,
            availablePlayers: debugPool,
            completedHistory: result.completedHistory.map(cloneHistoryMatch),
            selected: chosen.map(({ ids, partition }) => ({ ids, partition })),
            courtCount,
            respectStarvation: true,
            rotationPlayerCount,
          })
        : null;
      const decisionId = nextDecisionId++;
      const proof = makeEngineProof(engine);
      const restAtDecision = chosen.flatMap((assignment) => assignment.ids.map((userId) => {
        const player = playerById.get(userId)!;
        return {
          userId,
          restTurns: Math.max(0, player.restTurns ?? 0),
          priorCompletedMatches: player.matchesPlayed,
        };
      }));
      const trace: SocialGeneralizationDecisionTrace = {
        decisionId,
        arm,
        started: true,
        completed: false,
        completedAfterMatchNumber: null,
        afterCompletedMatches: completedMatches,
        courtCount,
        refillCourtIndex,
        eligiblePlayerIds: debugPool.map((player) => player.userId),
        structuralRosterSnapshot: rosterSnapshot,
        activeReservations: activeReservationsSnapshot,
        selectedAssignments: chosen.map((assignment) => ({
          ids: [...assignment.ids],
          partition: assignment.partition,
          socialVariety: assignment.socialVariety,
        })),
        assignmentsStarted: 0,
        assignmentRestTurns: [],
        proposedAssignmentRestTurns: restAtDecision,
        starvationCounterfactual,
        engine: proof,
        audit,
        auditStatus: audit === null ? "no-selection" : audit.complete
          ? audit.selectedValid && audit.selectedFairnessCertified && audit.selectedStarvationCertified ? "certified" : "incomplete"
          : "incomplete",
        auditPrefixHistoryLength: result.completedHistory.length,
        rescue: audit ? makeRescueWitness(audit) : null,
      };
      result.decisions.push(trace);

      if (!engine.selection) {
        result.status = "search-limited";
        result.stopReason = engine.debug.searchLimitReached
          ? "matcher-search-limit-no-selection"
          : `matcher-no-selection:${engine.debug.failureReason ?? "unknown"}`;
        return false;
      }

      if (arm === "courtmate-beneficial-rescue") {
        const independentlyCertified = audit?.complete && audit.selectedValid && audit.selectedFairnessCertified &&
          audit.selectedStarvationCertified && audit.beneficialRescueAdmitted;
        if (!engine.fairnessCertified || !engine.starvationCertified || engine.priorityCertified !== true ||
          !independentlyCertified) {
          result.status = "search-limited";
          result.stopReason = !independentlyCertified
            ? "independent-objective-audit-incomplete-or-rejected"
            : "matcher-priority-certification-incomplete";
          return false;
        }
      } else if (!engine.fairnessCertified || !engine.starvationCertified || !engine.replayCertified || !engine.coverageGateCertified) {
        result.status = "search-limited";
        result.stopReason = "production-selection-certificate-incomplete";
        return false;
      }

      const targetCourts = refillCourtIndex === null ? chosen.map((_selection, index) => index) : [refillCourtIndex];
      if (chosen.length !== targetCourts.length) {
        result.status = "stalled";
        result.stopReason = "matcher-returned-unexpected-court-count";
        return false;
      }
      if (targetCourts.some((courtIndex) => assignmentsByCourt.has(courtIndex))) {
        result.status = "stalled";
        result.stopReason = `refill-court-${targetCourts.find((courtIndex) => assignmentsByCourt.has(courtIndex))}-was-not-free`;
        return false;
      }
      for (const entry of restAtDecision) {
        assignmentRestTurns.push(entry.restTurns);
        if (entry.priorCompletedMatches > 0) {
          eligibleBackToBackAssignments += 1;
          if (entry.restTurns === 0) backToBackAssignments += 1;
        }
      }
      trace.assignmentRestTurns = restAtDecision;
      for (let selectionIndex = 0; selectionIndex < chosen.length; selectionIndex += 1) {
        const assignment = chosen[selectionIndex];
        const courtIndex = targetCourts[selectionIndex];
        const mutable: MutableAssignment = {
          assignmentId: `A${nextAssignmentId++}`,
          courtIndex,
          decisionId,
          ids: [...assignment.ids],
          partition: assignment.partition,
          socialVariety: assignment.socialVariety,
          restTurnsAtAssignment: new Map(assignment.ids.map((userId) => [userId, playerById.get(userId)?.restTurns ?? 0])),
          remaining: true,
        };
        assignmentsByCourt.set(courtIndex, mutable);
        activeAssignments.push(mutable);
        for (const id of assignment.ids) {
          const player = playerById.get(id);
          if (!player) continue;
          player.isBusy = true;
          player.arrivalPriorityAt = null;
        }
      }
      trace.assignmentsStarted = chosen.length;
      return true;
    };

    processDueEvents();
    if (!startDecision(scenario.courtCount, null)) {
      maybeCheckpoint();
      return result;
    }

    while (completedMatches < requestedEnd) {
      const occupiedCourts = [...assignmentsByCourt.entries()]
        .filter(([, assignment]) => assignment.remaining)
        .map(([courtIndex]) => courtIndex);
      if (occupiedCourts.length === 0) {
        result.status = "stalled";
        result.stopReason = "no-active-assignment-before-requested-horizon";
        break;
      }
      const scheduledCourt = Math.floor(courtScheduleRandom() * scenario.courtCount);
      const courtIndex = assignmentsByCourt.has(scheduledCourt) && assignmentsByCourt.get(scheduledCourt)!.remaining
        ? scheduledCourt
        : occupiedCourts[0];
      const completedAssignment = assignmentsByCourt.get(courtIndex)!;
      completedMatches += 1;
      completedAssignment.remaining = false;
      assignmentsByCourt.delete(courtIndex);
      const completed: SocialHistoryMatch = {
        id: `M${completedMatches}`,
        team1: [...completedAssignment.partition.team1] as [string, string],
        team2: [...completedAssignment.partition.team2] as [string, string],
        socialVariety: completedAssignment.socialVariety,
      };
      result.completedHistory.push(completed);
      for (const player of players) {
        if (!player.isPaused && !player.isBusy) player.restTurns = Math.max(0, player.restTurns ?? 0) + 1;
      }
      for (const userId of completedAssignment.ids) {
        const player = playerById.get(userId);
        if (!player) continue;
        player.matchesPlayed += 1;
        player.matchmakingBaseline = player.matchesPlayed + player.matchmakingMatchesCredit;
        player.isBusy = false;
        player.restTurns = 0;
        const priorEvent = lastCompletionEventByPlayer.get(userId);
        if (priorEvent !== undefined) {
          const eventDistance = completedMatches - priorEvent;
          maximumOwnCompletionEventDistance = Math.max(maximumOwnCompletionEventDistance, eventDistance);
          longestOtherCompletionGap = Math.max(longestOtherCompletionGap, Math.max(0, eventDistance - 1));
        }
        lastCompletionEventByPlayer.set(userId, completedMatches);
      }
      const completedDecision = result.decisions.find((decision) => decision.decisionId === completedAssignment.decisionId);
      if (completedDecision && !activeAssignments.some((assignment) => assignment.remaining && assignment.decisionId === completedAssignment.decisionId)) {
        completedDecision.completed = true;
        completedDecision.completedAfterMatchNumber = completedMatches;
      }

      processDueEvents();
      maybeCheckpoint();
      if (completedMatches >= requestedEnd) break;

      if (!startDecision(1, courtIndex)) break;
    }

    for (let index = 0; index < scenario.events.length; index += 1) {
      if (appliedEventIndexes.has(index)) continue;
      const event = scenario.events[index];
      const priorIndex = result.eventApplications.findIndex((application) => application.eventIndex === index);
      if (priorIndex >= 0) {
        const previous = result.eventApplications[priorIndex];
        result.eventApplications[priorIndex] = {
          ...previous,
          status: "unapplied-at-stop",
          appliedAfterCompletedMatches: null,
        };
      } else {
        result.eventApplications.push({
          eventIndex: index,
          type: event.type,
          scheduledAfterCompletedMatches: event.afterCompletedMatches,
          appliedAfterCompletedMatches: null,
          status: "unapplied-at-stop",
          userIds: event.type === "join" ? event.players.map((player) => player.userId) : [event.userId],
        });
      }
    }
    maybeCheckpoint();
    if (result.status === "completed" && completedMatches < requestedEnd) {
      result.status = "search-limited";
      result.stopReason ??= "simulation-stopped-before-requested-horizon";
    }
    if (completedMatches >= requestedEnd) result.stopReason = "requested-horizon-reached";
    return result;
  } catch (error) {
    result.status = "error";
    result.stopReason = "simulation-threw";
    result.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
    return result;
  }
}

export async function runSocialGeneralizationBenchmark(
  options: RunSocialGeneralizationBenchmarkOptions = {},
): Promise<SocialGeneralizationBenchmarkReport> {
  const seeds = [...(options.seeds ?? DEFAULT_SEEDS)];
  if (seeds.some((seed) => !Number.isSafeInteger(seed))) throw new TypeError("All Social generalization seeds must be safe integers.");
  const scenarios = options.scenarioIds
    ? options.scenarioIds.map(getSocialGeneralizationScenario)
    : [...SOCIAL_GENERALIZATION_SCENARIOS];
  const includeLongDiagnostics = options.includeSelectedLongDiagnostics === true;
  const totalSessions = scenarios.length * seeds.length * 2;
  const sessions: SocialGeneralizationSessionResult[] = [];
  let completedSessions = 0;
  for (const scenario of scenarios) {
    for (const seed of seeds) {
      for (const arm of ["production", "courtmate-beneficial-rescue"] as const) {
        const session = await runSocialGeneralizationSession({
          scenario,
          seed,
          arm,
          includeLongDiagnostic: includeLongDiagnostics,
        });
        sessions.push(session);
        completedSessions += 1;
        options.onProgress?.({ completedSessions, totalSessions, session });
      }
    }
  }
  return {
    schemaVersion: "social-generalization-v1",
    validationStatus: "pending",
    generatedAt: new Date().toISOString(),
    seeds,
    scenarios: [...scenarios],
    arms: ["production", "courtmate-beneficial-rescue"],
    methodology: {
      history: "Completed-only prefix history with assignment-time SocialVarietySnapshots; active reservations are supplied to production selection but excluded from endpoint scores and independent rescue audits.",
      rest: "Discrete completed-match events while available; paused and busy players do not accrue rest turns; no time-based rest. longestOtherCompletionGap counts intervening events only; maximumOwnCompletionEventDistance includes both completion endpoints.",
      arrivalCredit: "Production calculateNoCatchUpMatchmakingCredit applied against all nonpaused roster members, including busy players.",
      departure: "The current production DELETE route rejects a player with match history. A played participant leaving permanently is represented as an indefinite pause and remains in structural opportunity sets.",
      candidatePolicy: "courtmate-beneficial-rescue; unchanged matcher ordering and strict signed rolling-T guard.",
      largeSearch: "The matcher uses its default search budget; production may continue with a returned fair heuristic selection while searchLimitReached is retained, while an uncertified experimental selection stops that candidate session.",
    },
    sessions,
  };
}
