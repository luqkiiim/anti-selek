import { MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { buildSocialVarietyContext, buildSocialVarietySnapshot } from "./socialVariety";
import { createSocialCourtmatePriorityScorer } from "./socialCourtmatePriority";
import { scoreSocialGeneralizationPrefix } from "./socialGeneralizationAudit";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { SocialGeneralizationPrefixResult } from "./socialGeneralizationAudit";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  SocialVarietySnapshot,
  V3DoublesPartition,
} from "./types";

export type SocialJointRefillScheduler = "immediate" | "conditional-wait";
export type SocialJointRefillEngine = "production" | "courtmate-beneficial-rescue";

export interface SocialJointRefillScenario {
  readonly id: string;
  readonly upper: number;
  readonly lower: number;
  readonly courtCount: number;
}

export const SOCIAL_JOINT_REFILL_SCENARIOS: readonly SocialJointRefillScenario[] = [
  { id: "edge-8-8-0-2c", upper: 8, lower: 0, courtCount: 2 },
  { id: "balanced-10-5-5-2c", upper: 5, lower: 5, courtCount: 2 },
  { id: "balanced-12-6-6-2c", upper: 6, lower: 6, courtCount: 2 },
  { id: "balanced-12-6-6-3c", upper: 6, lower: 6, courtCount: 3 },
];

export interface SocialJointRefillTiming {
  readonly baseDurationMinutes?: number;
  readonly durationJitterFraction?: number;
  readonly wakeThresholdMinutes?: number;
  readonly minimumNewCourtmateGainPerCourt?: number;
  readonly minimumRollingTypeGainPerCourt?: number;
  /** Deterministic unit-fixture override keyed as `courtIndex:assignmentOrdinal`. */
  readonly durationMinutesOverrides?: Readonly<Record<string, number>>;
}

export type SocialJointRefillWaitReason =
  | "opening-batch-must-start"
  | "not-conditional-arm"
  | "current-preview-uncertified"
  | "no-busy-court"
  | "wake-gap-too-long"
  | "future-preview-uncertified"
  | "no-material-gain"
  | "waited-for-next-completion"
  | "waited-but-target-reached"
  | "target-reached-before-refill";

export interface SocialJointRefillSelectedAssignment {
  readonly ids: string[];
  readonly partition: V3DoublesPartition;
  readonly socialVariety: SocialVarietySnapshot;
  readonly courtType: "MIXED" | "UPPER" | "LOWER" | null;
}

export interface SocialJointRefillMatcherCertificates {
  readonly selectionReturned: boolean;
  readonly courtCountCertified: boolean;
  readonly fairnessCertified: boolean;
  readonly starvationCertified: boolean;
  readonly replayCertified: boolean;
  readonly coverageGateCertified: boolean;
  readonly coverageGateStatus: string;
  readonly gMaxCertified: boolean | null;
  readonly priorityCertified: boolean | null;
  readonly matcherVarietyOptimal: boolean;
  /** Mirrors the actual matcher result; production acceptance does not depend on this flag. */
  readonly reportedVarietyOptimal: boolean;
  readonly searchLimitReached: boolean;
  readonly socialPriorityPolicy: string | null;
  readonly exploredBranches: number;
  readonly prunedBranches: number;
  readonly chosenCourtmateGain: number | null;
  readonly courtmateGainMaximum: number | null;
  readonly chosenCourtmateGainDeficit: number | null;
  readonly chosenRollingMatchTypeGain: number | null;
  readonly bestRollingMatchTypeGainAtGmax: number | null;
}

export interface SocialJointRefillPreview {
  readonly status: "certified" | "uncertified" | "no-selection";
  /** Ordinary execution acceptance (normal production gates, or candidate full priority proof). */
  readonly certified: boolean;
  /** Exact-search certificate needed before a preview can authorize waiting. */
  readonly waitCertified: boolean;
  readonly requiredCertificates: readonly string[];
  readonly reasons: readonly string[];
  readonly matcherCertificates: SocialJointRefillMatcherCertificates;
  readonly availablePlayerIds: readonly string[];
  readonly completedHistoryMatchIds: readonly string[];
  readonly playerStateSnapshot: readonly {
    userId: string;
    matchesPlayed: number;
    matchmakingBaseline: number;
    restTurns: number;
    isBusy: boolean;
    isPaused: boolean;
    arrivalPriorityAt: string | null;
  }[];
  readonly activeReservationSnapshots: readonly {
    assignmentId: string;
    courtIndex: number;
    ids: readonly string[];
    partition: V3DoublesPartition;
    socialVariety: SocialVarietySnapshot;
    plannedFinishAtMinutes: number;
  }[];
  readonly chosenAssignments: readonly SocialJointRefillSelectedAssignment[];
  readonly candidateCourtTypes: readonly ("MIXED" | "OWN_SIDE" | null)[];
  readonly feasibleMatchTypePlayerCounts: Readonly<Record<"MIXED" | "OWN_SIDE", number>>;
  readonly chosenCourtmateGain: number | null;
  readonly courtmateGainMaximum: number | null;
  readonly chosenCourtmateGainDeficit: number | null;
  readonly chosenRollingMatchTypeGain: number | null;
  readonly bestRollingMatchTypeGainAtGmax: number | null;
  readonly gains: {
    readonly newCourtmatePairCount: number | null;
    readonly rollingMatchTypeGain: number | null;
    readonly perCourtNewCourtmatePairs: number | null;
    readonly perCourtRollingMatchTypeGain: number | null;
  };
  readonly randomDraws: number;
  readonly randomStateBefore: number;
  readonly randomStateAfter: number;
}

export interface SocialJointRefillFuturePreview {
  readonly completionAtMinutes: number;
  readonly predictedGapMinutes: number;
  readonly finishingCourtIndices: readonly number[];
  readonly fillCourtIndices: readonly number[];
  readonly remainingBusyCourtIndices: readonly number[];
  readonly simulatedCompletionMatchIds: readonly string[];
  readonly simulatedRestUpdates: readonly { userId: string; before: number; after: number }[];
  readonly preview: SocialJointRefillPreview;
}

export interface SocialJointRefillDecisionTrace {
  readonly decisionId: number;
  readonly atMinutes: number;
  readonly currentlyFreeCourtIndices: readonly number[];
  readonly completedMatchesAtDecision: number;
  readonly availablePlayerIds: readonly string[];
  readonly immediatePreview: SocialJointRefillPreview;
  readonly futurePreview: SocialJointRefillFuturePreview | null;
  waited: boolean;
  waitReason: SocialJointRefillWaitReason;
  executedAtMinutes: number | null;
  executedCourtIndices: number[];
  executionAccepted: boolean | null;
  execution: SocialJointRefillPreview | null;
  actualRandomDrawsBefore: number | null;
  actualRandomDrawsAfter: number | null;
  actualRandomStateBefore: number | null;
  actualRandomStateAfter: number | null;
}

export interface SocialJointRefillAssignmentPlayerState {
  readonly userId: string;
  readonly restTurns: number;
  readonly priorMatchesPlayed: number;
  readonly priorCompletedAtMinutes: number | null;
  readonly elapsedRestMinutes: number | null;
}

export interface SocialJointRefillAssignmentTrace extends SocialJointRefillSelectedAssignment {
  readonly assignmentId: string;
  readonly decisionId: number;
  readonly courtIndex: number;
  readonly assignmentOrdinal: number;
  readonly startedAtMinutes: number;
  readonly plannedDurationMinutes: number;
  readonly plannedFinishAtMinutes: number;
  completedMatchNumber: number | null;
  completedAtMinutes: number | null;
  censoredAtTarget: boolean;
  readonly playerStateAtAssignment: readonly SocialJointRefillAssignmentPlayerState[];
}

export interface SocialJointRefillCompletionGroup {
  readonly eventIndex: number;
  readonly completedAtMinutes: number;
  readonly finishingCourtIndices: readonly number[];
  readonly countedCourtIndices: readonly number[];
  readonly censoredCourtIndices: readonly number[];
  readonly completedMatchNumbers: readonly number[];
}

export interface SocialJointRefillRestSummary {
  readonly eligiblePostFirstAppearances: number;
  readonly backToBackCount: number;
  readonly backToBackRate: number | null;
  readonly meanAssignmentRestTurns: number | null;
  readonly p95AssignmentRestTurns: number | null;
  readonly maximumAssignmentRestTurns: number;
  readonly meanElapsedRestMinutes: number | null;
  readonly p95ElapsedRestMinutes: number | null;
  readonly maximumElapsedRestMinutes: number;
}

export interface SocialJointRefillCheckpoint {
  readonly targetCompletedMatches: number;
  readonly completedMatches: number;
  readonly atMinutes: number;
  readonly completedMatchTypeCounts: Readonly<Record<"MIXED" | "OWN_SIDE", number>>;
  readonly scores: SocialGeneralizationPrefixResult;
  readonly matchCountFairness: {
    readonly minimum: number;
    readonly maximum: number;
    readonly spread: number;
    readonly playerMatchCounts: readonly { userId: string; matchesPlayed: number }[];
  };
  readonly rest: SocialJointRefillRestSummary;
  readonly time: {
    readonly elapsedMinutes: number;
    readonly busyCourtMinutes: number;
    readonly idleCourtMinutes: number;
    readonly idleFraction: number | null;
    readonly closedRefillDelayCount: number;
    readonly meanRefillDelayMinutes: number | null;
    readonly p95RefillDelayMinutes: number | null;
    readonly maximumRefillDelayMinutes: number | null;
    readonly terminalOpenRefillIntervalCount: number;
  };
}

export interface SocialJointRefillSessionResult {
  readonly scenario: SocialJointRefillScenario;
  readonly seed: number;
  readonly scheduler: SocialJointRefillScheduler;
  readonly engineVersion: SocialJointRefillEngine;
  readonly targetCompletedMatches: number;
  readonly timing: {
    readonly baseDurationMinutes: number;
    readonly durationJitterFraction: number;
    readonly wakeThresholdMinutes: number;
    readonly minimumNewCourtmateGainPerCourt: number;
    readonly minimumRollingTypeGainPerCourt: number;
    readonly durationMinutesOverrides: Readonly<Record<string, number>>;
  };
  status: "completed" | "search-limited" | "stalled" | "error";
  stopReason: string | null;
  readonly methodology: {
    readonly durationStream: string;
    readonly durationFormula: string;
    readonly restEventOrder: string;
    readonly completionTieHandling: string;
    readonly checkpointBoundary: string;
    readonly conditionalWait: string;
    readonly varietyClaim: string;
  };
  readonly decisions: SocialJointRefillDecisionTrace[];
  readonly assignments: SocialJointRefillAssignmentTrace[];
  readonly completionGroups: SocialJointRefillCompletionGroup[];
  readonly completedHistory: SocialHistoryMatch[];
  readonly checkpoints: SocialJointRefillCheckpoint[];
  readonly waiting: {
    readonly conditionalWaitDecisions: number;
    readonly waitsTaken: number;
    readonly waitsDeclinedByReason: Readonly<Record<SocialJointRefillWaitReason, number>>;
  };
  readonly finalTime: {
    readonly elapsedMinutes: number;
    readonly busyCourtMinutes: number;
    readonly idleCourtMinutes: number;
    readonly idleFraction: number | null;
    readonly closedRefillDelayCount: number;
    readonly meanRefillDelayMinutes: number | null;
    readonly p95RefillDelayMinutes: number | null;
    readonly maximumRefillDelayMinutes: number | null;
    readonly terminalOpenRefillIntervalCount: number;
    readonly ongoingAssignmentsAtStop: readonly {
      assignmentId: string;
      courtIndex: number;
      observedElapsedMinutes: number;
      plannedFinishAtMinutes: number;
    }[];
  };
  error?: string;
}

export interface SocialJointRefillExperimentOptions {
  readonly scenarioIds?: readonly string[];
  readonly seeds?: readonly number[];
  readonly targetCompletedMatches?: number;
  readonly timing?: SocialJointRefillTiming;
  readonly onProgress?: (session: SocialJointRefillSessionResult, completedSessions: number, totalSessions: number) => void;
}

export interface SocialJointRefillExperimentReport {
  readonly schemaVersion: "social-joint-refill-v1";
  readonly targetCompletedMatches: number;
  readonly seeds: readonly number[];
  readonly scenarios: readonly SocialJointRefillScenario[];
  readonly schedulers: readonly SocialJointRefillScheduler[];
  readonly engineVersions: readonly SocialJointRefillEngine[];
  readonly sessions: readonly SocialJointRefillSessionResult[];
}

export interface SocialJointRefillWaitEvaluationInput {
  readonly scheduler: SocialJointRefillScheduler;
  readonly isOpening: boolean;
  readonly currentPreview: SocialJointRefillPreview;
  readonly futurePreview: SocialJointRefillFuturePreview | null;
  readonly futureUnavailableReason?: "no-busy-court" | "target-reached-before-refill";
  readonly wakeThresholdMinutes: number;
  readonly minimumNewCourtmateGainPerCourt: number;
  readonly minimumRollingTypeGainPerCourt: number;
}

export interface SocialJointRefillWaitEvaluation {
  readonly waited: boolean;
  readonly reason: SocialJointRefillWaitReason;
}

/** Applies the predeclared conditional-wait trigger to two independently certified previews. */
export function evaluateConditionalWait(
  input: SocialJointRefillWaitEvaluationInput
): SocialJointRefillWaitEvaluation {
  if (input.isOpening) return { waited: false, reason: "opening-batch-must-start" };
  if (input.scheduler !== "conditional-wait") return { waited: false, reason: "not-conditional-arm" };
  if (!input.currentPreview.waitCertified) return { waited: false, reason: "current-preview-uncertified" };
  if (!input.futurePreview) {
    return { waited: false, reason: input.futureUnavailableReason ?? "no-busy-court" };
  }
  if (input.futurePreview.predictedGapMinutes > input.wakeThresholdMinutes) {
    return { waited: false, reason: "wake-gap-too-long" };
  }
  if (!input.futurePreview.preview.waitCertified) {
    return { waited: false, reason: "future-preview-uncertified" };
  }

  const currentC = input.currentPreview.gains.perCourtNewCourtmatePairs;
  const futureC = input.futurePreview.preview.gains.perCourtNewCourtmatePairs;
  const currentT = input.currentPreview.gains.perCourtRollingMatchTypeGain;
  const futureT = input.futurePreview.preview.gains.perCourtRollingMatchTypeGain;
  if (currentC === null || futureC === null || currentT === null || futureT === null) {
    return { waited: false, reason: "future-preview-uncertified" };
  }
  const courtmateThresholdMet = futureC - currentC >= input.minimumNewCourtmateGainPerCourt;
  const rollingTypeThresholdMet = futureT - currentT >= input.minimumRollingTypeGainPerCourt;
  return courtmateThresholdMet || rollingTypeThresholdMet
    ? { waited: true, reason: "waited-for-next-completion" }
    : { waited: false, reason: "no-material-gain" };
}

const DEFAULT_SEEDS = [1, 4729, 104729] as const;
const DEFAULT_TARGET_MATCHES = 100;
const START_EPOCH_MS = Date.parse("2026-10-03T00:00:00.000Z");
const PARK_MILLER_MODULUS = 2_147_483_647;

type MutablePlayer = MatchmakerV3Player;

class CloneableParkMiller {
  private stateValue: number;
  private drawCountValue = 0;

  constructor(seed: number, state?: number, draws = 0) {
    let initial = Math.abs(Math.floor(seed)) % PARK_MILLER_MODULUS;
    if (initial === 0) initial = 1;
    this.stateValue = state ?? initial;
    this.drawCountValue = draws;
  }

  next(): number {
    this.stateValue = (this.stateValue * 48_271) % PARK_MILLER_MODULUS;
    this.drawCountValue += 1;
    return this.stateValue / PARK_MILLER_MODULUS;
  }

  clone(): CloneableParkMiller {
    return new CloneableParkMiller(1, this.stateValue, this.drawCountValue);
  }

  get state(): number {
    return this.stateValue;
  }

  get draws(): number {
    return this.drawCountValue;
  }
}

function clonePartition(partition: V3DoublesPartition): V3DoublesPartition {
  return {
    team1: [...partition.team1] as [string, string],
    team2: [...partition.team2] as [string, string],
  };
}

function cloneSnapshot(snapshot: SocialVarietySnapshot): SocialVarietySnapshot {
  return {
    ...snapshot,
    effectiveSideByUserId: { ...snapshot.effectiveSideByUserId },
  };
}

function cloneHistoryMatch(match: SocialHistoryMatch): SocialHistoryMatch {
  return {
    id: match.id,
    team1: [...match.team1] as [string, string],
    team2: [...match.team2] as [string, string],
    ...(match.completedAt ? { completedAt: new Date(match.completedAt) } : {}),
    ...(match.socialVariety ? { socialVariety: cloneSnapshot(match.socialVariety) } : {}),
  };
}

function clonePlayer(player: MutablePlayer): MutablePlayer {
  return {
    ...player,
    availableSince: new Date(player.availableSince),
    arrivalPriorityAt: player.arrivalPriorityAt instanceof Date
      ? new Date(player.arrivalPriorityAt)
      : player.arrivalPriorityAt ?? null,
  };
}

function clonePlayers(players: readonly MutablePlayer[]): MutablePlayer[] {
  return players.map(clonePlayer);
}

function makePlayers(scenario: SocialJointRefillScenario): MutablePlayer[] {
  const rows: Array<{ userId: string; side: "UPPER" | "LOWER" }> = [];
  for (let index = 1; index <= scenario.upper; index += 1) {
    rows.push({ userId: `P${index}`, side: "UPPER" });
  }
  for (let index = 1; index <= scenario.lower; index += 1) {
    rows.push({ userId: `P${scenario.upper + index}`, side: "LOWER" });
  }
  const playerCount = rows.length;
  return rows.map((row, rank): MutablePlayer => ({
    userId: row.userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date(START_EPOCH_MS),
    restTurns: 0,
    strength: 10 + (playerCount - rank - 1) * 0.1,
    pointDiff: 0,
    gender: row.side === "UPPER" ? PlayerGender.MALE : PlayerGender.FEMALE,
    partnerPreference: row.side === "UPPER" ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
    mixedSideOverride: row.side === "UPPER" ? MixedSide.UPPER : MixedSide.LOWER,
    isBusy: false,
    isPaused: false,
    arrivalPriorityAt: null,
  }));
}

function buildReservationHistory(
  activeAssignments: readonly SocialJointRefillAssignmentTrace[]
): SocialHistoryMatch[] {
  return activeAssignments.map((assignment) => ({
    id: `active-${assignment.assignmentId}`,
    team1: [...assignment.partition.team1] as [string, string],
    team2: [...assignment.partition.team2] as [string, string],
    socialVariety: cloneSnapshot(assignment.socialVariety),
  }));
}

function sortUniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function quantile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null;
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function roundTraceNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function courtOrdinalStreamSeed(seed: number, courtIndex: number): number {
  const courtSalt = (0x51ed270b + Math.imul(courtIndex + 1, 0x9e3779b1)) >>> 0;
  return (Math.abs(Math.floor(seed)) ^ courtSalt) >>> 0;
}

function normalizeTiming(timing: SocialJointRefillTiming = {}) {
  const baseDurationMinutes = timing.baseDurationMinutes ?? 20;
  const durationJitterFraction = timing.durationJitterFraction ?? 0.2;
  const wakeThresholdMinutes = timing.wakeThresholdMinutes ?? 5;
  const minimumNewCourtmateGainPerCourt = timing.minimumNewCourtmateGainPerCourt ?? 1;
  const minimumRollingTypeGainPerCourt = timing.minimumRollingTypeGainPerCourt ?? 0.5;
  if (!Number.isFinite(baseDurationMinutes) || baseDurationMinutes <= 0) {
    throw new RangeError("baseDurationMinutes must be a positive finite number");
  }
  if (!Number.isFinite(durationJitterFraction) || durationJitterFraction < 0 || durationJitterFraction > 0.5) {
    throw new RangeError("durationJitterFraction must be between 0 and 0.5");
  }
  if (!Number.isFinite(wakeThresholdMinutes) || wakeThresholdMinutes < 0) {
    throw new RangeError("wakeThresholdMinutes must be a non-negative finite number");
  }
  if (!Number.isFinite(minimumNewCourtmateGainPerCourt) || minimumNewCourtmateGainPerCourt < 0 ||
      !Number.isFinite(minimumRollingTypeGainPerCourt) || minimumRollingTypeGainPerCourt < 0) {
    throw new RangeError("wait gain thresholds must be non-negative finite numbers");
  }
  const durationMinutesOverrides = timing.durationMinutesOverrides ?? {};
  for (const [key, value] of Object.entries(durationMinutesOverrides)) {
    if (!/^\d+:\d+$/.test(key) || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Invalid duration override for ${key}`);
    }
  }
  return {
    baseDurationMinutes,
    durationJitterFraction,
    wakeThresholdMinutes,
    minimumNewCourtmateGainPerCourt,
    minimumRollingTypeGainPerCourt,
    durationMinutesOverrides,
  };
}

type RotationResult = ReturnType<typeof findBestRotationBatchSelection<MutablePlayer>>;

interface EvaluatedSelection {
  readonly preview: SocialJointRefillPreview;
  readonly result: RotationResult;
}

interface MutableRefillInterval {
  readonly courtIndex: number;
  readonly startedAtMinutes: number;
  closedAtMinutes: number | null;
}

function publicSelectedAssignments(
  result: RotationResult,
  players: readonly MutablePlayer[]
): SocialJointRefillSelectedAssignment[] {
  return (result.selection?.selections ?? []).map((selection) => {
    const socialVariety = selection.socialVariety ?? buildSocialVarietySnapshot(selection.partition, players);
    return {
      ids: [...selection.ids],
      partition: clonePartition(selection.partition),
      socialVariety: cloneSnapshot(socialVariety),
      courtType: socialVariety.courtType,
    };
  });
}

function evaluateSelection(
  players: readonly MutablePlayer[],
  completedHistory: readonly SocialHistoryMatch[],
  activeAssignments: readonly SocialJointRefillAssignmentTrace[],
  courtCount: number,
  engineVersion: SocialJointRefillEngine,
  random: CloneableParkMiller,
): EvaluatedSelection {
  const randomStateBefore = random.state;
  const randomDrawsBefore = random.draws;
  const workingPlayers = clonePlayers(players);
  for (const player of workingPlayers) {
    player.matchmakingBaseline = player.matchesPlayed;
  }
  const completed = completedHistory.map(cloneHistoryMatch);
  const reservations = buildReservationHistory(activeAssignments);
  const options = {
    courtCount,
    rotationPlayerCount: workingPlayers.filter((player) => !player.isPaused).length,
    sessionMode: SessionMode.MIXICANO,
    sessionType: SessionType.SOCIAL_MIX,
    respectPlayerRest: true,
    completedMatches: completed,
    socialHistoryMatches: [...completed, ...reservations],
    randomFn: () => random.next(),
  };
  const result = engineVersion === "courtmate-beneficial-rescue"
    ? findBestRotationBatchSelection(workingPlayers, {
        ...options,
        socialPriorityPolicy: "courtmate-beneficial-rescue",
      })
    : findBestRotationBatchSelection(workingPlayers, options);
  const chosenAssignments = publicSelectedAssignments(result, workingPlayers);
  const partitions = chosenAssignments.map((assignment) => assignment.partition);
  const context = buildSocialVarietyContext(workingPlayers, completed, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  const scorer = createSocialCourtmatePriorityScorer(context, completed);
  const independent = result.selection && partitions.length > 0
    ? scorer.getBatchMetrics(partitions)
    : null;
  const courtCountCertified = Boolean(result.selection && result.selection.selections.length === courtCount);
  const normalRequired = engineVersion === "courtmate-beneficial-rescue"
    ? ["selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified", "priorityCertified", "gMaxCertified", "varietyOptimal"]
    : ["selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified", "replayCertified", "coverageGateCertified"];
  const searchLimitReached = result.debug.searchLimitReached;
  const candidatePriorityCertified = engineVersion === "courtmate-beneficial-rescue"
    ? result.priorityCertified === true && result.courtmateGainMaximumCertified === true
    : null;
  const certificates: SocialJointRefillMatcherCertificates = {
    selectionReturned: Boolean(result.selection),
    courtCountCertified,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    replayCertified: result.replayCertified,
    coverageGateCertified: result.coverageGateCertified,
    coverageGateStatus: result.coverageGateStatus,
    gMaxCertified: engineVersion === "courtmate-beneficial-rescue"
      ? result.courtmateGainMaximumCertified === true
      : null,
    priorityCertified: engineVersion === "courtmate-beneficial-rescue"
      ? result.priorityCertified === true
      : null,
    matcherVarietyOptimal: result.varietyOptimal,
    reportedVarietyOptimal: result.varietyOptimal,
    searchLimitReached,
    socialPriorityPolicy: result.socialPriorityPolicy ?? null,
    exploredBranches: result.debug.exploredBranches,
    prunedBranches: result.debug.prunedBranches,
    chosenCourtmateGain: result.chosenNewCourtmatePairCount ?? independent?.newCourtmatePairs ?? null,
    courtmateGainMaximum: result.courtmateGainMaximum ?? null,
    chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit ?? null,
    chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain ??
      (independent ? scorer.toNormalizedRollingTypeGain(independent.rollingMatchTypeGainUnits) : null),
    bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax ?? null,
  };
  const missingReasons: string[] = [];
  if (!result.selection) missingReasons.push(`no-selection:${result.debug.failureReason ?? "unknown"}`);
  if (!courtCountCertified) missingReasons.push("wrong-court-count");
  if (!certificates.fairnessCertified) missingReasons.push("fairness-not-certified");
  if (!certificates.starvationCertified) missingReasons.push("starvation-not-certified");
  if (engineVersion === "production") {
    if (!certificates.replayCertified) missingReasons.push("replay-not-certified");
    if (!certificates.coverageGateCertified) missingReasons.push("coverage-gate-not-certified");
  } else {
    if (!certificates.gMaxCertified) missingReasons.push("gmax-not-certified");
    if (!certificates.priorityCertified) missingReasons.push("priority-not-certified");
    if (!certificates.matcherVarietyOptimal) missingReasons.push("variety-not-optimal");
  }
  if (searchLimitReached) missingReasons.push("search-limit-reached");
  const ordinaryCertified = Boolean(result.selection && courtCountCertified && result.fairnessCertified && result.starvationCertified &&
    (engineVersion === "production"
      ? result.replayCertified && result.coverageGateCertified
      : candidatePriorityCertified && result.varietyOptimal && !searchLimitReached));
  const waitCertified = Boolean(ordinaryCertified && result.varietyOptimal && !searchLimitReached &&
    (engineVersion === "production" || candidatePriorityCertified));
  const feasibleMatchTypePlayerCounts = { MIXED: 0, OWN_SIDE: 0 };
  for (const player of context.playersByUserId.values()) {
    if (player.matchType.opportunities.has("MIXED")) feasibleMatchTypePlayerCounts.MIXED += 1;
    if (player.matchType.opportunities.has("OWN_SIDE")) feasibleMatchTypePlayerCounts.OWN_SIDE += 1;
  }
  const selectedCourtCount = partitions.length;
  const rollingMatchTypeGain = independent
    ? scorer.toNormalizedRollingTypeGain(independent.rollingMatchTypeGainUnits)
    : null;
  const chosenRollingMatchTypeGain = result.chosenRollingMatchTypeGain ??
    (independent ? scorer.toNormalizedRollingTypeGain(independent.rollingMatchTypeGainUnits) : null);
  const preview: SocialJointRefillPreview = {
    status: !result.selection ? "no-selection" : ordinaryCertified ? "certified" : "uncertified",
    certified: ordinaryCertified,
    waitCertified,
    requiredCertificates: normalRequired,
    reasons: missingReasons,
    matcherCertificates: certificates,
    availablePlayerIds: workingPlayers.filter((player) => !player.isBusy && !player.isPaused)
      .map((player) => player.userId).sort(),
    completedHistoryMatchIds: completed.map((match) => match.id ?? ""),
    playerStateSnapshot: workingPlayers.map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingBaseline: player.matchmakingBaseline,
      restTurns: Math.max(0, player.restTurns ?? 0),
      isBusy: Boolean(player.isBusy),
      isPaused: Boolean(player.isPaused),
      arrivalPriorityAt: player.arrivalPriorityAt instanceof Date
        ? player.arrivalPriorityAt.toISOString()
        : typeof player.arrivalPriorityAt === "string" ? player.arrivalPriorityAt : null,
    })),
    activeReservationSnapshots: activeAssignments.map((assignment) => ({
      assignmentId: assignment.assignmentId,
      courtIndex: assignment.courtIndex,
      ids: [...assignment.ids],
      partition: clonePartition(assignment.partition),
      socialVariety: cloneSnapshot(assignment.socialVariety),
      plannedFinishAtMinutes: assignment.plannedFinishAtMinutes,
    })).sort((left, right) => left.courtIndex - right.courtIndex),
    chosenAssignments,
    candidateCourtTypes: chosenAssignments.map((assignment) =>
      assignment.socialVariety.courtType === "MIXED" ? "MIXED"
        : assignment.socialVariety.courtType === "UPPER" || assignment.socialVariety.courtType === "LOWER" ? "OWN_SIDE" : null
    ),
    feasibleMatchTypePlayerCounts,
    chosenCourtmateGain: certificates.chosenCourtmateGain,
    courtmateGainMaximum: certificates.courtmateGainMaximum,
    chosenCourtmateGainDeficit: certificates.chosenCourtmateGainDeficit,
    chosenRollingMatchTypeGain,
    bestRollingMatchTypeGainAtGmax: certificates.bestRollingMatchTypeGainAtGmax,
    gains: {
      newCourtmatePairCount: independent?.newCourtmatePairs ?? null,
      rollingMatchTypeGain,
      perCourtNewCourtmatePairs: independent && selectedCourtCount
        ? independent.newCourtmatePairs / selectedCourtCount
        : null,
      perCourtRollingMatchTypeGain: rollingMatchTypeGain !== null && selectedCourtCount
        ? rollingMatchTypeGain / selectedCourtCount
        : null,
    },
    randomDraws: random.draws - randomDrawsBefore,
    randomStateBefore,
    randomStateAfter: random.state,
  };
  return { preview, result };
}

function applyCompletedMatchEvent(
  assignment: SocialJointRefillAssignmentTrace,
  players: MutablePlayer[],
  history: SocialHistoryMatch[],
  atMinutes: number,
  lastCompletedAt: Map<string, number>,
  updateCompletedAssignment: boolean,
): { matchId: string; restUpdates: Array<{ userId: string; before: number; after: number }> } {
  const restUpdates: Array<{ userId: string; before: number; after: number }> = [];
  for (const player of players) {
    if (!player.isPaused && !player.isBusy) {
      const before = Math.max(0, player.restTurns ?? 0);
      const after = before + 1;
      player.restTurns = after;
      restUpdates.push({ userId: player.userId, before, after });
    }
  }
  const matchNumber = history.length + 1;
  const matchId = `M${matchNumber}`;
  history.push({
    id: matchId,
    team1: [...assignment.partition.team1] as [string, string],
    team2: [...assignment.partition.team2] as [string, string],
    completedAt: new Date(START_EPOCH_MS + atMinutes * 60_000),
    socialVariety: cloneSnapshot(assignment.socialVariety),
  });
  const playerById = new Map(players.map((player) => [player.userId, player]));
  for (const userId of assignment.ids) {
    const player = playerById.get(userId);
    if (!player) continue;
    player.matchesPlayed += 1;
    player.matchmakingBaseline = player.matchesPlayed;
    player.isBusy = false;
    player.restTurns = 0;
    lastCompletedAt.set(userId, atMinutes);
  }
  if (updateCompletedAssignment) {
    assignment.completedMatchNumber = matchNumber;
    assignment.completedAtMinutes = atMinutes;
    assignment.censoredAtTarget = false;
  }
  return { matchId, restUpdates };
}

function getTimeMetrics(
  courtCount: number,
  atMinutes: number,
  assignments: readonly SocialJointRefillAssignmentTrace[],
  refillIntervals: readonly MutableRefillInterval[],
): SocialJointRefillCheckpoint["time"] {
  const busyCourtMinutes = assignments.reduce((sum, assignment) => {
    if (assignment.startedAtMinutes >= atMinutes) return sum;
    const elapsed = Math.max(0, Math.min(assignment.plannedFinishAtMinutes, atMinutes) - assignment.startedAtMinutes);
    return sum + elapsed;
  }, 0);
  const capacityMinutes = courtCount * atMinutes;
  const idleCourtMinutes = Math.max(0, capacityMinutes - busyCourtMinutes);
  const closed = refillIntervals.flatMap((interval) =>
    interval.closedAtMinutes !== null && interval.closedAtMinutes < atMinutes
      ? [Math.max(0, interval.closedAtMinutes - interval.startedAtMinutes)]
      : []
  );
  const openCount = refillIntervals.filter((interval) => interval.startedAtMinutes <= atMinutes &&
    (interval.closedAtMinutes === null || interval.closedAtMinutes >= atMinutes)).length;
  return {
    elapsedMinutes: atMinutes,
    busyCourtMinutes: roundTraceNumber(busyCourtMinutes),
    idleCourtMinutes: roundTraceNumber(idleCourtMinutes),
    idleFraction: capacityMinutes > 0 ? idleCourtMinutes / capacityMinutes : null,
    closedRefillDelayCount: closed.length,
    meanRefillDelayMinutes: mean(closed),
    p95RefillDelayMinutes: quantile95(closed),
    maximumRefillDelayMinutes: closed.length ? Math.max(...closed) : null,
    terminalOpenRefillIntervalCount: openCount,
  };
}

function summarizeRestAtCheckpoint(
  targetCompletedMatches: number,
  assignments: readonly SocialJointRefillAssignmentTrace[]
): SocialJointRefillRestSummary {
  const eligible = assignments
    .filter((assignment) => assignment.completedMatchNumber !== null &&
      assignment.completedMatchNumber <= targetCompletedMatches)
    .flatMap((assignment) => assignment.playerStateAtAssignment.filter((entry) => entry.priorMatchesPlayed > 0));
  const turns = eligible.map((entry) => entry.restTurns);
  const elapsed = eligible.flatMap((entry) => entry.elapsedRestMinutes === null ? [] : [entry.elapsedRestMinutes]);
  const backToBackCount = turns.filter((value) => value === 0).length;
  return {
    eligiblePostFirstAppearances: eligible.length,
    backToBackCount,
    backToBackRate: eligible.length ? backToBackCount / eligible.length : null,
    meanAssignmentRestTurns: mean(turns),
    p95AssignmentRestTurns: quantile95(turns),
    maximumAssignmentRestTurns: turns.length ? Math.max(...turns) : 0,
    meanElapsedRestMinutes: mean(elapsed),
    p95ElapsedRestMinutes: quantile95(elapsed),
    maximumElapsedRestMinutes: elapsed.length ? Math.max(...elapsed) : 0,
  };
}

function makeCheckpoint(
  scenario: SocialJointRefillScenario,
  target: number,
  history: readonly SocialHistoryMatch[],
  players: readonly MutablePlayer[],
  assignments: readonly SocialJointRefillAssignmentTrace[],
  refillIntervals: readonly MutableRefillInterval[],
): SocialJointRefillCheckpoint {
  const prefix = history.slice(0, target).map(cloneHistoryMatch);
  const completedMatches = prefix.length;
  const terminalAssignment = assignments.find((assignment) => assignment.completedMatchNumber === completedMatches);
  const atMinutes = completedMatches
    ? terminalAssignment?.completedAtMinutes ??
      Math.max(0, ((prefix[completedMatches - 1].completedAt?.getTime() ?? START_EPOCH_MS) - START_EPOCH_MS) / 60_000)
    : 0;
  const playerMatchCounts = new Map(players.map((player) => [player.userId, 0]));
  for (const match of prefix) {
    for (const userId of [...match.team1, ...match.team2]) {
      if (playerMatchCounts.has(userId)) playerMatchCounts.set(userId, playerMatchCounts.get(userId)! + 1);
    }
  }
  const rows = [...playerMatchCounts].map(([userId, matchesPlayed]) => ({ userId, matchesPlayed }));
  const counts = rows.map((row) => row.matchesPlayed);
  const minimum = counts.length ? Math.min(...counts) : 0;
  const maximum = counts.length ? Math.max(...counts) : 0;
  const completedMatchTypeCounts = { MIXED: 0, OWN_SIDE: 0 };
  for (const match of prefix) {
    const courtType = match.socialVariety?.courtType;
    if (courtType === "MIXED") completedMatchTypeCounts.MIXED += 1;
    else if (courtType === "UPPER" || courtType === "LOWER") completedMatchTypeCounts.OWN_SIDE += 1;
  }
  const scores = scoreSocialGeneralizationPrefix({ structuralRoster: players, completedHistory: prefix });
  const time = getTimeMetrics(scenario.courtCount, atMinutes, assignments, refillIntervals);
  return {
    targetCompletedMatches: target,
    completedMatches,
    atMinutes,
    completedMatchTypeCounts,
    scores,
    matchCountFairness: {
      minimum,
      maximum,
      spread: maximum - minimum,
      playerMatchCounts: rows,
    },
    rest: summarizeRestAtCheckpoint(target, assignments),
    time,
  };
}

function getFreeCourtIndices(
  courtCount: number,
  activeByCourt: ReadonlyMap<number, SocialJointRefillAssignmentTrace>
): number[] {
  const free: number[] = [];
  for (let courtIndex = 0; courtIndex < courtCount; courtIndex += 1) {
    if (!activeByCourt.has(courtIndex)) free.push(courtIndex);
  }
  return free;
}

function getNextFinishGroup(
  activeByCourt: ReadonlyMap<number, SocialJointRefillAssignmentTrace>
): { atMinutes: number; assignments: SocialJointRefillAssignmentTrace[] } | null {
  const active = [...activeByCourt.values()];
  if (active.length === 0) return null;
  const atMinutes = Math.min(...active.map((assignment) => assignment.plannedFinishAtMinutes));
  return {
    atMinutes,
    assignments: active.filter((assignment) => assignment.plannedFinishAtMinutes === atMinutes)
      .sort((left, right) => left.courtIndex - right.courtIndex),
  };
}

function cloneAssignmentTrace(assignment: SocialJointRefillAssignmentTrace): SocialJointRefillAssignmentTrace {
  return {
    ...assignment,
    ids: [...assignment.ids],
    partition: clonePartition(assignment.partition),
    socialVariety: cloneSnapshot(assignment.socialVariety),
    playerStateAtAssignment: assignment.playerStateAtAssignment.map((entry) => ({ ...entry })),
  };
}

const WAIT_REASONS: readonly SocialJointRefillWaitReason[] = [
  "opening-batch-must-start",
  "not-conditional-arm",
  "current-preview-uncertified",
  "no-busy-court",
  "wake-gap-too-long",
  "future-preview-uncertified",
  "no-material-gain",
  "waited-for-next-completion",
  "waited-but-target-reached",
  "target-reached-before-refill",
];

function emptyWaitReasonCounts(): Record<SocialJointRefillWaitReason, number> {
  return Object.fromEntries(WAIT_REASONS.map((reason) => [reason, 0])) as Record<SocialJointRefillWaitReason, number>;
}

function isValidScenario(scenario: SocialJointRefillScenario): boolean {
  return Boolean(scenario && typeof scenario.id === "string" && scenario.id.length > 0 &&
    Number.isInteger(scenario.upper) && scenario.upper >= 0 &&
    Number.isInteger(scenario.lower) && scenario.lower >= 0 &&
    Number.isInteger(scenario.courtCount) && scenario.courtCount > 0 &&
    scenario.upper + scenario.lower >= scenario.courtCount * 4);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runSocialJointRefillSession({
  scenario,
  seed,
  scheduler,
  engineVersion,
  targetCompletedMatches = DEFAULT_TARGET_MATCHES,
  timing,
}: {
  scenario: SocialJointRefillScenario;
  seed: number;
  scheduler: SocialJointRefillScheduler;
  engineVersion: SocialJointRefillEngine;
  targetCompletedMatches?: number;
  timing?: SocialJointRefillTiming;
}): SocialJointRefillSessionResult {
  if (!isValidScenario(scenario)) throw new RangeError("Scenario must have integer rosters and enough players for its opening courts");
  if (!Number.isInteger(seed)) throw new RangeError("seed must be an integer");
  if (!Number.isInteger(targetCompletedMatches) || targetCompletedMatches < 1 || targetCompletedMatches > DEFAULT_TARGET_MATCHES) {
    throw new RangeError(`targetCompletedMatches must be an integer from 1 to ${DEFAULT_TARGET_MATCHES}`);
  }
  if (scheduler !== "immediate" && scheduler !== "conditional-wait") throw new RangeError("Unsupported scheduler arm");
  if (engineVersion !== "production" && engineVersion !== "courtmate-beneficial-rescue") throw new RangeError("Unsupported matcher arm");

  const config = normalizeTiming(timing);
  const players = makePlayers(scenario);
  const playerById = new Map(players.map((player) => [player.userId, player]));
  const matchRandom = new CloneableParkMiller(seed);
  const durationRandoms = new Map<number, CloneableParkMiller>();
  const assignmentOrdinals = new Map<number, number>();
  const activeByCourt = new Map<number, SocialJointRefillAssignmentTrace>();
  const completedHistory: SocialHistoryMatch[] = [];
  const assignments: SocialJointRefillAssignmentTrace[] = [];
  const decisions: SocialJointRefillDecisionTrace[] = [];
  const completionGroups: SocialJointRefillCompletionGroup[] = [];
  const refillIntervals: MutableRefillInterval[] = [];
  const openRefillByCourt = new Map<number, MutableRefillInterval>();
  const lastCompletedAt = new Map<string, number>();
  const checkpoints: SocialJointRefillCheckpoint[] = [];
  const checkpointTargets = sortUniqueNumbers([
    Math.round((scenario.upper + scenario.lower) * 1.5),
    50,
    targetCompletedMatches,
  ]).filter((target) => target > 0 && target <= targetCompletedMatches);
  const recordedCheckpoints = new Set<number>();
  const waitsDeclinedByReason = emptyWaitReasonCounts();
  let conditionalWaitDecisions = 0;
  let waitsTaken = 0;
  let nextDecisionId = 1;
  let nextAssignmentOrdinalId = 1;
  let completionEventIndex = 1;
  let currentTime = 0;
  let status: SocialJointRefillSessionResult["status"] = "completed";
  let stopReason: string | null = null;
  let pendingWaitDecision: SocialJointRefillDecisionTrace | null = null;

  const durationFor = (courtIndex: number, assignmentOrdinal: number): number => {
    let stream = durationRandoms.get(courtIndex);
    if (!stream) {
      stream = new CloneableParkMiller(courtOrdinalStreamSeed(seed, courtIndex));
      durationRandoms.set(courtIndex, stream);
    }
    const draw = stream.next();
    const override = config.durationMinutesOverrides[`${courtIndex}:${assignmentOrdinal}`];
    if (override !== undefined) return override;
    const factor = 1 - config.durationJitterFraction + (2 * config.durationJitterFraction * draw);
    return config.baseDurationMinutes * factor;
  };

  const saveCheckpointsIfDue = () => {
    for (const target of checkpointTargets) {
      if (target > completedHistory.length || recordedCheckpoints.has(target)) continue;
      checkpoints.push(makeCheckpoint(scenario, target, completedHistory, players, assignments, refillIntervals));
      recordedCheckpoints.add(target);
    }
  };

  const getCurrentPreview = (courtIndices: readonly number[]) => evaluateSelection(
    players,
    completedHistory,
    [...activeByCourt.values()],
    courtIndices.length,
    engineVersion,
    matchRandom.clone(),
  );

  const futurePreviewFor = (
    nowMinutes: number,
    currentFreeCourts: readonly number[],
  ): { future: SocialJointRefillFuturePreview | null; unavailableReason: "no-busy-court" | "target-reached-before-refill" } => {
    const next = getNextFinishGroup(activeByCourt);
    if (!next) return { future: null, unavailableReason: "no-busy-court" };
    if (completedHistory.length + next.assignments.length >= targetCompletedMatches) {
      return { future: null, unavailableReason: "target-reached-before-refill" };
    }

    const futurePlayers = clonePlayers(players);
    const futureHistory = completedHistory.map(cloneHistoryMatch);
    const futureActive = new Map<number, SocialJointRefillAssignmentTrace>(
      [...activeByCourt].map(([courtIndex, assignment]) => [courtIndex, cloneAssignmentTrace(assignment)])
    );
    const futureLastCompletedAt = new Map(lastCompletedAt);
    const simulatedCompletionMatchIds: string[] = [];
    const simulatedRestUpdates: Array<{ userId: string; before: number; after: number }> = [];
    for (const source of next.assignments) {
      const assignment = futureActive.get(source.courtIndex)!;
      futureActive.delete(source.courtIndex);
      const completed = applyCompletedMatchEvent(
        assignment,
        futurePlayers,
        futureHistory,
        next.atMinutes,
        futureLastCompletedAt,
        true,
      );
      simulatedCompletionMatchIds.push(completed.matchId);
      simulatedRestUpdates.push(...completed.restUpdates);
    }
    const fillCourtIndices = sortUniqueNumbers([...currentFreeCourts, ...next.assignments.map((assignment) => assignment.courtIndex)]);
    const remainingBusyCourtIndices = [...futureActive.keys()].sort((left, right) => left - right);
    const evaluated = evaluateSelection(
      futurePlayers,
      futureHistory,
      [...futureActive.values()],
      fillCourtIndices.length,
      engineVersion,
      matchRandom.clone(),
    );
    return {
      future: {
        completionAtMinutes: next.atMinutes,
        predictedGapMinutes: Math.max(0, next.atMinutes - nowMinutes),
        finishingCourtIndices: next.assignments.map((assignment) => assignment.courtIndex),
        fillCourtIndices,
        remainingBusyCourtIndices,
        simulatedCompletionMatchIds,
        simulatedRestUpdates,
        preview: evaluated.preview,
      },
      unavailableReason: "no-busy-court",
    };
  };

  const closeRefillIntervals = (courtIndices: readonly number[], atMinutes: number) => {
    for (const courtIndex of courtIndices) {
      const interval = openRefillByCourt.get(courtIndex);
      if (!interval) continue;
      interval.closedAtMinutes = atMinutes;
      openRefillByCourt.delete(courtIndex);
    }
  };

  const openRefillIntervals = (courtIndices: readonly number[], atMinutes: number) => {
    for (const courtIndex of courtIndices) {
      if (openRefillByCourt.has(courtIndex)) continue;
      const interval: MutableRefillInterval = { courtIndex, startedAtMinutes: atMinutes, closedAtMinutes: null };
      refillIntervals.push(interval);
      openRefillByCourt.set(courtIndex, interval);
    }
  };

  const executeDecision = (
    trace: SocialJointRefillDecisionTrace,
    courtIndices: readonly number[],
    atMinutes: number,
  ): boolean => {
    const randomStateBefore = matchRandom.state;
    const randomDrawsBefore = matchRandom.draws;
    const evaluated = evaluateSelection(
      players,
      completedHistory,
      [...activeByCourt.values()],
      courtIndices.length,
      engineVersion,
      matchRandom,
    );
    trace.execution = evaluated.preview;
    trace.actualRandomDrawsBefore = randomDrawsBefore;
    trace.actualRandomDrawsAfter = matchRandom.draws;
    trace.actualRandomStateBefore = randomStateBefore;
    trace.actualRandomStateAfter = matchRandom.state;

    if (!evaluated.preview.certified) {
      trace.executionAccepted = false;
      status = evaluated.preview.matcherCertificates.searchLimitReached ? "search-limited" : "stalled";
      stopReason = engineVersion === "production"
        ? "production-required-certificate-missing"
        : "candidate-priority-certificate-missing";
      return false;
    }
    const selected = evaluated.preview.chosenAssignments;
    if (selected.length !== courtIndices.length) {
      trace.executionAccepted = false;
      status = "stalled";
      stopReason = "matcher-returned-wrong-number-of-courts";
      return false;
    }
    if (courtIndices.some((courtIndex) => activeByCourt.has(courtIndex))) {
      trace.executionAccepted = false;
      status = "stalled";
      stopReason = `refill-included-a-busy-court-${courtIndices.find((courtIndex) => activeByCourt.has(courtIndex))}`;
      return false;
    }

    closeRefillIntervals(courtIndices, atMinutes);
    for (let index = 0; index < selected.length; index += 1) {
      const courtIndex = courtIndices[index];
      const ordinal = (assignmentOrdinals.get(courtIndex) ?? 0) + 1;
      assignmentOrdinals.set(courtIndex, ordinal);
      const plannedDurationMinutes = durationFor(courtIndex, ordinal);
      const chosen = selected[index];
      const playerStateAtAssignment = chosen.ids.flatMap((userId) => {
        const player = playerById.get(userId);
        if (!player) return [];
        const priorCompletedAtMinutes = lastCompletedAt.get(userId) ?? null;
        return [{
          userId,
          restTurns: Math.max(0, player.restTurns ?? 0),
          priorMatchesPlayed: player.matchesPlayed,
          priorCompletedAtMinutes,
          elapsedRestMinutes: priorCompletedAtMinutes === null
            ? null : Math.max(0, atMinutes - priorCompletedAtMinutes),
        }];
      }).sort((left, right) => left.userId.localeCompare(right.userId));
      const assignment: SocialJointRefillAssignmentTrace = {
        assignmentId: `A${nextAssignmentOrdinalId++}`,
        decisionId: trace.decisionId,
        courtIndex,
        assignmentOrdinal: ordinal,
        ids: [...chosen.ids],
        partition: clonePartition(chosen.partition),
        socialVariety: cloneSnapshot(chosen.socialVariety),
        courtType: chosen.courtType,
        startedAtMinutes: atMinutes,
        plannedDurationMinutes,
        plannedFinishAtMinutes: atMinutes + plannedDurationMinutes,
        completedMatchNumber: null,
        completedAtMinutes: null,
        censoredAtTarget: false,
        playerStateAtAssignment,
      };
      assignments.push(assignment);
      activeByCourt.set(courtIndex, assignment);
      for (const userId of chosen.ids) {
        const player = playerById.get(userId);
        if (player) {
          player.isBusy = true;
          player.arrivalPriorityAt = null;
        }
      }
    }
    trace.executedAtMinutes = atMinutes;
    trace.executedCourtIndices = [...courtIndices];
    trace.executionAccepted = true;
    return true;
  };

  const startDecision = (isOpening: boolean): SocialJointRefillDecisionTrace | null => {
    const atMinutes = currentTime;
    const currentlyFreeCourtIndices = getFreeCourtIndices(scenario.courtCount, activeByCourt);
    if (currentlyFreeCourtIndices.length === 0) return null;
    const evaluatedCurrent = getCurrentPreview(currentlyFreeCourtIndices);
    let futurePreview: SocialJointRefillFuturePreview | null = null;
    let futureUnavailableReason: "no-busy-court" | "target-reached-before-refill" | undefined;
    if (!isOpening && scheduler === "conditional-wait" && evaluatedCurrent.preview.waitCertified) {
      const future = futurePreviewFor(atMinutes, currentlyFreeCourtIndices);
      futurePreview = future.future;
      futureUnavailableReason = future.future ? undefined : future.unavailableReason;
    } else if (!isOpening && scheduler === "conditional-wait" && activeByCourt.size === 0) {
      futureUnavailableReason = "no-busy-court";
    }
    const waitEvaluation = evaluateConditionalWait({
      scheduler,
      isOpening,
      currentPreview: evaluatedCurrent.preview,
      futurePreview,
      futureUnavailableReason,
      wakeThresholdMinutes: config.wakeThresholdMinutes,
      minimumNewCourtmateGainPerCourt: config.minimumNewCourtmateGainPerCourt,
      minimumRollingTypeGainPerCourt: config.minimumRollingTypeGainPerCourt,
    });
    const trace: SocialJointRefillDecisionTrace = {
      decisionId: nextDecisionId++,
      atMinutes,
      currentlyFreeCourtIndices,
      completedMatchesAtDecision: completedHistory.length,
      availablePlayerIds: [...evaluatedCurrent.preview.availablePlayerIds],
      immediatePreview: evaluatedCurrent.preview,
      futurePreview,
      waited: waitEvaluation.waited,
      waitReason: waitEvaluation.reason,
      executedAtMinutes: null,
      executedCourtIndices: [],
      executionAccepted: null,
      execution: null,
      actualRandomDrawsBefore: null,
      actualRandomDrawsAfter: null,
      actualRandomStateBefore: null,
      actualRandomStateAfter: null,
    };
    decisions.push(trace);
    if (!isOpening && scheduler === "conditional-wait") conditionalWaitDecisions += 1;
    if (waitEvaluation.waited) {
      waitsTaken += 1;
      pendingWaitDecision = trace;
      return trace;
    }
    waitsDeclinedByReason[waitEvaluation.reason] += 1;
    if (!executeDecision(trace, currentlyFreeCourtIndices, atMinutes)) return trace;
    return trace;
  };

  const processCompletionGroup = (
    group: { atMinutes: number; assignments: SocialJointRefillAssignmentTrace[] }
  ): SocialJointRefillCompletionGroup => {
    currentTime = group.atMinutes;
    const finishingCourtIndices = group.assignments.map((assignment) => assignment.courtIndex).sort((left, right) => left - right);
    openRefillIntervals(finishingCourtIndices, group.atMinutes);
    const countedCourtIndices: number[] = [];
    const censoredCourtIndices: number[] = [];
    const completedMatchNumbers: number[] = [];
    for (const source of group.assignments) {
      activeByCourt.delete(source.courtIndex);
      if (completedHistory.length >= targetCompletedMatches) {
        source.censoredAtTarget = true;
        source.completedAtMinutes = null;
        source.completedMatchNumber = null;
        censoredCourtIndices.push(source.courtIndex);
        continue;
      }
      applyCompletedMatchEvent(source, players, completedHistory, group.atMinutes, lastCompletedAt, true);
      const number = completedHistory.length;
      countedCourtIndices.push(source.courtIndex);
      completedMatchNumbers.push(number);
    }
    const trace: SocialJointRefillCompletionGroup = {
      eventIndex: completionEventIndex++,
      completedAtMinutes: group.atMinutes,
      finishingCourtIndices,
      countedCourtIndices,
      censoredCourtIndices,
      completedMatchNumbers,
    };
    completionGroups.push(trace);
    return trace;
  };

  const run = (): SocialJointRefillSessionResult => {
    startDecision(true);
    if (stopReason) {
      status = status === "completed" ? "stalled" : status;
    }

    while (!stopReason && completedHistory.length < targetCompletedMatches) {
      const next = getNextFinishGroup(activeByCourt);
      if (!next) {
        status = "stalled";
        stopReason = "no-active-court-before-target";
        break;
      }
      processCompletionGroup(next);
      if (completedHistory.length >= targetCompletedMatches) {
        saveCheckpointsIfDue();
        if (pendingWaitDecision) {
          pendingWaitDecision.waitReason = "waited-but-target-reached";
          pendingWaitDecision = null;
        }
        status = "completed";
        stopReason = "completed-target";
        break;
      }

      if (pendingWaitDecision) {
        const trace = pendingWaitDecision;
        pendingWaitDecision = null;
        const freeCourts = getFreeCourtIndices(scenario.courtCount, activeByCourt);
        if (!executeDecision(trace, freeCourts, currentTime)) break;
        saveCheckpointsIfDue();
        continue;
      }

      const current = startDecision(false);
      if (!current) {
        status = "stalled";
        stopReason = "no-free-court-after-completion";
        break;
      }
      saveCheckpointsIfDue();
      if (stopReason) break;
    }

    if (!stopReason) {
      status = "completed";
      stopReason = "completed-target";
    }
    const lastCountedAssignment = assignments.find((assignment) => assignment.completedMatchNumber === completedHistory.length);
    const finalTime = completedHistory.length
      ? lastCountedAssignment?.completedAtMinutes ??
        Math.max(0, ((completedHistory[completedHistory.length - 1].completedAt?.getTime() ?? START_EPOCH_MS) - START_EPOCH_MS) / 60_000)
      : currentTime;
    if (completedHistory.length >= targetCompletedMatches) {
      for (const assignment of assignments) {
        if (assignment.completedMatchNumber === null && assignment.startedAtMinutes <= finalTime) {
          assignment.censoredAtTarget = true;
        }
      }
    }
    const time = getTimeMetrics(scenario.courtCount, finalTime, assignments, refillIntervals);
    const finalizedCheckpoints = checkpointTargets
      .filter((target) => target <= completedHistory.length)
      .map((target) => makeCheckpoint(scenario, target, completedHistory, players, assignments, refillIntervals));
    const ongoingAssignmentsAtStop = [...activeByCourt.values()]
      .filter((assignment) => assignment.plannedFinishAtMinutes > finalTime)
      .sort((left, right) => left.courtIndex - right.courtIndex)
      .map((assignment) => ({
        assignmentId: assignment.assignmentId,
        courtIndex: assignment.courtIndex,
        observedElapsedMinutes: Math.max(0, finalTime - assignment.startedAtMinutes),
        plannedFinishAtMinutes: assignment.plannedFinishAtMinutes,
      }));
    const result: SocialJointRefillSessionResult = {
      scenario: { ...scenario },
      seed,
      scheduler,
      engineVersion,
      targetCompletedMatches,
      timing: {
        baseDurationMinutes: config.baseDurationMinutes,
        durationJitterFraction: config.durationJitterFraction,
        wakeThresholdMinutes: config.wakeThresholdMinutes,
        minimumNewCourtmateGainPerCourt: config.minimumNewCourtmateGainPerCourt,
        minimumRollingTypeGainPerCourt: config.minimumRollingTypeGainPerCourt,
        durationMinutesOverrides: { ...config.durationMinutesOverrides },
      },
      status,
      stopReason,
      methodology: {
        durationStream: "Park-Miller 48271, seeded independently by seed XOR ((0x51ed270b + imul(courtIndex+1, 0x9e3779b1)) >>> 0); one draw per physical-court assignment ordinal.",
        durationFormula: "baseDurationMinutes * (1 - durationJitterFraction + 2 * durationJitterFraction * u); defaults are 20 * (0.8 + 0.4*u).",
        restEventOrder: "For each counted completed match, increment restTurns for every nonpaused, nonbusy player before releasing that match's players; then update completed count and reset their restTurns to zero. True ties are processed by court index and matching happens only after the group.",
        completionTieHandling: "Equal finish timestamps form one event group; court order determines match IDs and per-match rest updates. The target cap counts only through the exact requested match number and records excess same-time completions as censored.",
        checkpointBoundary: "A checkpoint uses the exact target completed-match prefix and is observed at that match's completion instant before any same-clock refill starts; same-clock starts and closes do not enter its time-delay sample.",
        conditionalWait: "At most one wait per refill decision. Wait only if both previews satisfy normal execution gates plus exact varietyOptimal, predicted gap is at most the threshold, and per-court independent completed-only C gain improves by its threshold or signed rolling-six T improves by its threshold. The future batch fills only already-free plus next-finishing courts; actual RNG is untouched until execution.",
        varietyClaim: "The matcher varietyOptimal flag is preserved as returned. Production acceptance does not rely on it; conditional waiting requires an exact completed preview. Candidate execution requires full priority certification.",
      },
      decisions,
      assignments,
      completionGroups,
      completedHistory: completedHistory.map(cloneHistoryMatch),
      checkpoints: finalizedCheckpoints,
      waiting: {
        conditionalWaitDecisions,
        waitsTaken,
        waitsDeclinedByReason: { ...waitsDeclinedByReason },
      },
      finalTime: {
        elapsedMinutes: finalTime,
        busyCourtMinutes: time.busyCourtMinutes,
        idleCourtMinutes: time.idleCourtMinutes,
        idleFraction: time.idleFraction,
        closedRefillDelayCount: time.closedRefillDelayCount,
        meanRefillDelayMinutes: time.meanRefillDelayMinutes,
        p95RefillDelayMinutes: time.p95RefillDelayMinutes,
        maximumRefillDelayMinutes: time.maximumRefillDelayMinutes,
        terminalOpenRefillIntervalCount: time.terminalOpenRefillIntervalCount,
        ongoingAssignmentsAtStop,
      },
    };
    return result;
  };

  try {
    return run();
  } catch (error) {
    return {
      scenario: { ...scenario },
      seed,
      scheduler,
      engineVersion,
      targetCompletedMatches,
      timing: {
        baseDurationMinutes: config.baseDurationMinutes,
        durationJitterFraction: config.durationJitterFraction,
        wakeThresholdMinutes: config.wakeThresholdMinutes,
        minimumNewCourtmateGainPerCourt: config.minimumNewCourtmateGainPerCourt,
        minimumRollingTypeGainPerCourt: config.minimumRollingTypeGainPerCourt,
        durationMinutesOverrides: { ...config.durationMinutesOverrides },
      },
      status: "error",
      stopReason: "session-error",
      methodology: {
        durationStream: "Park-Miller 48271, independently seeded per physical court and ordinal.",
        durationFormula: "baseDurationMinutes * (1 - durationJitterFraction + 2 * durationJitterFraction * u); defaults are 20 * (0.8 + 0.4*u).",
        restEventOrder: "One available-rest increment per completed-match event, before releasing the completing players.",
        completionTieHandling: "Tied finish times are grouped before matching.",
        checkpointBoundary: "Exact target prefix at the completion instant, before any same-clock refill starts.",
        conditionalWait: "Single next-completion lookahead; actual matcher RNG is untouched by previews.",
        varietyClaim: "Matcher flags are preserved; production does not use varietyOptimal for its execution acceptance gate.",
      },
      decisions,
      assignments,
      completionGroups,
      completedHistory: completedHistory.map(cloneHistoryMatch),
      checkpoints,
      waiting: {
        conditionalWaitDecisions,
        waitsTaken,
        waitsDeclinedByReason: { ...waitsDeclinedByReason },
      },
      finalTime: {
        elapsedMinutes: currentTime,
        busyCourtMinutes: 0,
        idleCourtMinutes: 0,
        idleFraction: null,
        closedRefillDelayCount: 0,
        meanRefillDelayMinutes: null,
        p95RefillDelayMinutes: null,
        maximumRefillDelayMinutes: null,
        terminalOpenRefillIntervalCount: 0,
        ongoingAssignmentsAtStop: [],
      },
      error: toErrorMessage(error),
    };
  }
}

export function runSocialJointRefillExperiment(
  options: SocialJointRefillExperimentOptions = {}
): SocialJointRefillExperimentReport {
  const targetCompletedMatches = options.targetCompletedMatches ?? DEFAULT_TARGET_MATCHES;
  if (!Number.isInteger(targetCompletedMatches) || targetCompletedMatches < 1 || targetCompletedMatches > DEFAULT_TARGET_MATCHES) {
    throw new RangeError(`targetCompletedMatches must be an integer from 1 to ${DEFAULT_TARGET_MATCHES}`);
  }
  const scenarios = options.scenarioIds
    ? options.scenarioIds.map((id) => {
        const scenario = SOCIAL_JOINT_REFILL_SCENARIOS.find((candidate) => candidate.id === id);
        if (!scenario) throw new Error(`Unknown Social joint-refill scenario: ${id}`);
        return scenario;
      })
    : [...SOCIAL_JOINT_REFILL_SCENARIOS];
  const seeds = options.seeds ? [...options.seeds] : [...DEFAULT_SEEDS];
  if (seeds.some((seed) => !Number.isInteger(seed))) throw new RangeError("All seeds must be integers");
  const sessions: SocialJointRefillSessionResult[] = [];
  const totalSessions = scenarios.reduce((total, scenario) => {
    const engineCount = scenario.id === "balanced-12-6-6-2c" || scenario.id === "balanced-12-6-6-3c" ? 1 : 2;
    return total + engineCount * 2 * seeds.length;
  }, 0);
  for (const scenario of scenarios) {
    const engineVersions: readonly SocialJointRefillEngine[] = scenario.id === "balanced-12-6-6-2c" || scenario.id === "balanced-12-6-6-3c"
      ? ["courtmate-beneficial-rescue"]
      : ["production", "courtmate-beneficial-rescue"];
    for (const engineVersion of engineVersions) {
      for (const scheduler of ["immediate", "conditional-wait"] as const) {
        for (const seed of seeds) {
          const session = runSocialJointRefillSession({
            scenario,
            seed,
            scheduler,
            engineVersion,
            targetCompletedMatches,
            timing: options.timing,
          });
          sessions.push(session);
          options.onProgress?.(session, sessions.length, totalSessions);
        }
      }
    }
  }
  return {
    schemaVersion: "social-joint-refill-v1",
    targetCompletedMatches,
    seeds,
    scenarios,
    schedulers: ["immediate", "conditional-wait"],
    engineVersions: [...new Set(sessions.map((session) => session.engineVersion))],
    sessions,
  };
}
