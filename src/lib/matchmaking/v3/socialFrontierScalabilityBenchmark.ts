import { MixedSide, PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { SessionMode as ControlSessionMode, SessionType as ControlSessionType } from "../../../../benchmarks/fixtures/social-frontier-control/src/types/enums";
import {
  findBestRotationBatchSelection as findControlRotationBatchSelection,
  type RotationBatchOptions as ControlRotationBatchOptions,
} from "../../../../benchmarks/fixtures/social-frontier-control/src/lib/matchmaking/v3/socialBatch";
import type { MatchmakerV3Player as ControlMatchmakerV3Player } from "../../../../benchmarks/fixtures/social-frontier-control/src/lib/matchmaking/v3/types";
import { scoreSocialGeneralizationPrefix, type SocialGeneralizationPrefixResult } from "./socialGeneralizationAudit";
import { buildSocialVarietyContext, buildSocialVarietySnapshot } from "./socialVariety";
import { scoreSocialVariety3211, type SocialVariety3211Score } from "./socialRollingVariety";
import { findBestRotationBatchSelection, type RotationBatchOptions } from "./socialBatch";
import type { MatchmakerV3Player, SocialHistoryMatch, SocialVarietySnapshot, V3DoublesPartition } from "./types";

export interface SocialFrontierScalabilityScenario {
  readonly id: string;
  readonly upperCount: number;
  readonly lowerCount: number;
  readonly courtCount: number;
  readonly openingOnly?: boolean;
}

export const SOCIAL_FRONTIER_SCALABILITY_SCENARIOS: readonly SocialFrontierScalabilityScenario[] = [
  { id: "frontier-14-7-7-2c", upperCount: 7, lowerCount: 7, courtCount: 2 },
  { id: "frontier-16-8-8-2c", upperCount: 8, lowerCount: 8, courtCount: 2 },
  { id: "frontier-18-9-9-3c", upperCount: 9, lowerCount: 9, courtCount: 3 },
  { id: "frontier-regression-14-8-6-2c", upperCount: 8, lowerCount: 6, courtCount: 2 },
  { id: "frontier-regression-14-10-4-2c", upperCount: 10, lowerCount: 4, courtCount: 2 },
  { id: "frontier-opening-20-10-10-3c", upperCount: 10, lowerCount: 10, courtCount: 3, openingOnly: true },
  { id: "frontier-opening-24-12-12-3c", upperCount: 12, lowerCount: 12, courtCount: 3, openingOnly: true },
];

export const SOCIAL_FRONTIER_SCALABILITY_DEFAULT_SEEDS = [1, 4729, 104729] as const;
export const SOCIAL_FRONTIER_SCALABILITY_DEFAULT_ENGINES: readonly SocialFrontierEngineVersion[] = ["original-control", "current"];
export const SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES = 100;
export const SOCIAL_FRONTIER_SCALABILITY_REFERENCE_PATH =
  "benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/beneficial/social-courtmate-beneficial-rescue-100-beneficial-courtmate-rescue.json";

export type SocialFrontierSessionStatus = "completed" | "search-limited" | "uncertified-selection" | "stalled" | "opening-probe";
export type SocialFrontierEngineVersion = "original-control" | "current";

export interface SocialFrontierDecisionRecord {
  readonly decisionIndex: number;
  readonly kind: "opening" | "refill";
  readonly afterCompletedMatches: number;
  readonly refillCourtIndex: number | null;
  readonly courtCount: number;
  readonly elapsedMs: number;
  readonly attempted: true;
  readonly executed: boolean;
  readonly certificationSucceeded: boolean;
  completed: boolean;
  completedAfterMatchNumber: number | null;
  readonly selectedAssignments: Array<{
    ids: string[];
    partition: V3DoublesPartition;
    socialVariety: SocialVarietySnapshot;
  }>;
  readonly result: {
    selectionReturned: boolean;
    failureReason: string | null;
    exploredBranches: number;
    prunedBranches: number;
    searchLimitReached: boolean;
    fairnessCertified: boolean;
    starvationCertified: boolean;
    varietyOptimal: boolean;
    priorityCertified: boolean | null;
    courtmateGainMaximumCertified: boolean | null;
    courtmateGainMaximum: number | null;
    chosenCourtmateGain: number | null;
    chosenCourtmateGainDeficit: number | null;
    bestRollingMatchTypeGainAtGmax: number | null;
    chosenRollingMatchTypeGain: number | null;
    replayCertified: boolean;
    coverageGateCertified: boolean;
    replayEnvelopeStatus: string;
    coverageGateStatus: string;
  };
}

export interface SocialFrontierScalabilityCheckpoint {
  readonly completedMatches: number;
  readonly scores: SocialGeneralizationPrefixResult;
  readonly socialVariety3211: SocialVariety3211Score;
  readonly fairness: {
    minimumMatchCount: number;
    maximumMatchCount: number;
    countSpread: number;
    playerMatchCounts: Array<{ userId: string; matchesPlayed: number }>;
  };
  readonly rest: {
    assignmentCount: number;
    meanRestTurns: number | null;
    p95RestTurns: number | null;
    maximumRestTurns: number;
    backToBackAssignments: number;
    longestOtherCompletionGap: number;
  };
}

export interface SocialFrontierJointProbe {
  readonly requestedPrefix: 20 | 50;
  readonly observedCompletedMatches: number;
  readonly drainedCourtIndexes: number[];
  readonly drainedCompletedMatches: number;
  readonly status: "certified" | "search-limited" | "uncertified-selection" | "stalled";
  readonly elapsedMs: number;
  readonly result: SocialFrontierDecisionRecord["result"];
  readonly selectedAssignments: SocialFrontierDecisionRecord["selectedAssignments"];
  readonly executed: false;
  readonly randomStream: "isolated-probe-seed";
}

export interface SocialFrontierScalabilitySession {
  readonly scenario: SocialFrontierScalabilityScenario;
  readonly seed: number;
  readonly engineVersion: SocialFrontierEngineVersion;
  readonly targetMatches: number;
  status: SocialFrontierSessionStatus;
  stopReason: string | null;
  readonly decisions: SocialFrontierDecisionRecord[];
  readonly completedHistory: SocialHistoryMatch[];
  readonly checkpoints: SocialFrontierScalabilityCheckpoint[];
  readonly jointFrontierProbes: SocialFrontierJointProbe[];
  readonly diagnostics: {
    attemptedCalls: number;
    certifiedCalls: number;
    callsWithSelection: number;
    searchLimitCalls: number;
    fairnessCertifiedCalls: number;
    starvationCertifiedCalls: number;
    gMaximumCertifiedCalls: number;
    fullPriorityCertifiedCalls: number;
    totalEngineMs: number;
    maximumEngineMs: number;
    defaultSearchBudgets: true;
  };
}

export interface SocialFrontierScalabilityBenchmarkReport {
  readonly schemaVersion: "social-frontier-scalability-v1";
  readonly validationStatus: "pending";
  readonly generatedAt: string;
  readonly seeds: number[];
  readonly targetMatches: number;
  readonly scenarios: SocialFrontierScalabilityScenario[];
  readonly policy: "courtmate-beneficial-rescue";
  readonly engineVersions: SocialFrontierEngineVersion[];
  readonly methodology: {
    readonly engineBudget: "Default matcher budgets; no candidate/search limit overrides.";
    readonly execution: "Only batches with returned selections and fairness, starvation, Gmax, and full priority certificates execute; uncertified proposals are recorded and stop that session.";
    readonly scheduler: "Park–Miller seeds and asynchronous court completion fallback match the frozen Social generalization harness; active assignments enter socialHistoryMatches, while completedMatches remains completed-only.";
  };
  readonly sessions: SocialFrontierScalabilitySession[];
}

export interface RunSocialFrontierScalabilityOptions {
  readonly scenarioIds?: readonly string[];
  readonly seeds?: readonly number[];
  readonly targetMatches?: number;
  readonly engineVersions?: readonly SocialFrontierEngineVersion[];
  readonly onProgress?: (session: SocialFrontierScalabilitySession, completedSessions: number, totalSessions: number) => void;
}

interface MutableAssignment {
  readonly id: string;
  readonly courtIndex: number;
  readonly decisionIndex: number;
  readonly ids: string[];
  readonly partition: V3DoublesPartition;
  readonly socialVariety: SocialVarietySnapshot;
  remaining: boolean;
}

interface FrontierPlayer extends MatchmakerV3Player {
  readonly side: "UPPER" | "LOWER";
}

function seededParkMiller(seed: number) {
  let value = Math.abs(Math.floor(seed)) % 2_147_483_647;
  if (value === 0) value = 1;
  return () => {
    value = (value * 48_271) % 2_147_483_647;
    return value / 2_147_483_647;
  };
}

function makePlayers(scenario: SocialFrontierScalabilityScenario): FrontierPlayer[] {
  const size = scenario.upperCount + scenario.lowerCount;
  return Array.from({ length: size }, (_value, index) => {
    const upper = index < scenario.upperCount;
    const userId = `P${index + 1}`;
    return {
      userId,
      side: upper ? "UPPER" : "LOWER",
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      restTurns: 0,
      strength: 10 + (size - index - 1) * 0.1,
      pointDiff: 0,
      gender: upper ? PlayerGender.MALE : PlayerGender.FEMALE,
      partnerPreference: upper ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: upper ? MixedSide.UPPER : MixedSide.LOWER,
      isBusy: false,
      isPaused: false,
      arrivalPriorityAt: null,
    };
  });
}

function selectionFor(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return (result.selection?.selections ?? []).map((selection) => ({
    ids: [...selection.ids],
    partition: {
      team1: [...selection.partition.team1] as [string, string],
      team2: [...selection.partition.team2] as [string, string],
    },
    socialVariety: selection.socialVariety ?? buildSocialVarietySnapshot(selection.partition, selection.players),
  }));
}

function activeReservationHistory(assignments: readonly MutableAssignment[]): SocialHistoryMatch[] {
  return assignments.filter((assignment) => assignment.remaining).map((assignment) => ({
    id: `active-${assignment.id}`,
    team1: [...assignment.partition.team1] as [string, string],
    team2: [...assignment.partition.team2] as [string, string],
    socialVariety: assignment.socialVariety,
  }));
}

function p95(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? null;
}

function checkpoint(
  completedMatches: number,
  players: readonly FrontierPlayer[],
  history: readonly SocialHistoryMatch[],
  restSamples: readonly number[],
  backToBackAssignments: number,
  longestOtherCompletionGap: number,
): SocialFrontierScalabilityCheckpoint {
  const counts = players.map((player) => ({ userId: player.userId, matchesPlayed: player.matchesPlayed }));
  const minimumMatchCount = Math.min(...counts.map((row) => row.matchesPlayed));
  const maximumMatchCount = Math.max(...counts.map((row) => row.matchesPlayed));
  return {
    completedMatches,
    scores: scoreSocialGeneralizationPrefix({ structuralRoster: players, completedHistory: history }),
    socialVariety3211: scoreSocialVariety3211(buildSocialVarietyContext(players, history, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    }), history),
    fairness: { minimumMatchCount, maximumMatchCount, countSpread: maximumMatchCount - minimumMatchCount, playerMatchCounts: counts },
    rest: {
      assignmentCount: restSamples.length,
      meanRestTurns: restSamples.length ? restSamples.reduce((sum, value) => sum + value, 0) / restSamples.length : null,
      p95RestTurns: p95(restSamples),
      maximumRestTurns: restSamples.length ? Math.max(...restSamples) : 0,
      backToBackAssignments,
      longestOtherCompletionGap,
    },
  };
}

function proofResult(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return {
    selectionReturned: Boolean(result.selection),
    failureReason: result.debug.failureReason,
    exploredBranches: result.debug.exploredBranches,
    prunedBranches: result.debug.prunedBranches,
    searchLimitReached: result.debug.searchLimitReached,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    varietyOptimal: result.varietyOptimal,
    priorityCertified: result.priorityCertified ?? null,
    courtmateGainMaximumCertified: result.courtmateGainMaximumCertified ?? null,
    courtmateGainMaximum: result.courtmateGainMaximum ?? null,
    chosenCourtmateGain: result.chosenNewCourtmatePairCount ?? null,
    chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit ?? null,
    bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax ?? null,
    chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain ?? null,
    replayCertified: result.replayCertified,
    coverageGateCertified: result.coverageGateCertified,
    replayEnvelopeStatus: result.replayEnvelopeStatus,
    coverageGateStatus: result.coverageGateStatus,
  };
}

function runEngineVersion(
  engineVersion: SocialFrontierEngineVersion,
  players: FrontierPlayer[],
  options: Omit<RotationBatchOptions<FrontierPlayer>, "sessionMode" | "sessionType">,
): ReturnType<typeof findBestRotationBatchSelection> {
  const currentOptions: RotationBatchOptions<FrontierPlayer> = {
    ...options,
    sessionMode: SessionMode.MIXICANO,
    sessionType: SessionType.SOCIAL_MIX,
  };
  if (engineVersion === "current") return findBestRotationBatchSelection(players, currentOptions);
  const controlOptions = {
    ...options,
    sessionMode: ControlSessionMode.MIXICANO,
    sessionType: ControlSessionType.SOCIAL_MIX,
  } as unknown as ControlRotationBatchOptions<ControlMatchmakerV3Player>;
  return findControlRotationBatchSelection(
    players as unknown as ControlMatchmakerV3Player[],
    controlOptions,
  ) as unknown as ReturnType<typeof findBestRotationBatchSelection>;
}

/**
 * Runs the frozen Social roster/completion protocol with the current exact
 * courtmate-beneficial-rescue engine and default search budgets. This is a
 * fixed-roster scaling harness; it makes no claim about arbitrary production
 * schedules or dynamic roster events.
 */
export async function runSocialFrontierScalabilitySession({
  scenario,
  seed,
  engineVersion = "current",
  targetMatches = 100,
}: {
  scenario: SocialFrontierScalabilityScenario;
  seed: number;
  engineVersion?: SocialFrontierEngineVersion;
  targetMatches?: number;
}): Promise<SocialFrontierScalabilitySession> {
  if (!Number.isSafeInteger(seed) || seed <= 0) throw new RangeError("seed must be a positive safe integer");
  if (!Number.isSafeInteger(targetMatches) || targetMatches < 1 || targetMatches > SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES) {
    throw new RangeError(`targetMatches must be between 1 and ${SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES}`);
  }
  if (scenario.upperCount + scenario.lowerCount < 4 * scenario.courtCount) {
    throw new RangeError("Scenario roster must fill every opening court.");
  }
  const result: SocialFrontierScalabilitySession = {
    scenario,
    seed,
    engineVersion,
    targetMatches,
    status: "completed",
    stopReason: null,
    decisions: [],
    completedHistory: [],
    checkpoints: [],
    jointFrontierProbes: [],
    diagnostics: {
      attemptedCalls: 0,
      certifiedCalls: 0,
      callsWithSelection: 0,
      searchLimitCalls: 0,
      fairnessCertifiedCalls: 0,
      starvationCertifiedCalls: 0,
      gMaximumCertifiedCalls: 0,
      fullPriorityCertifiedCalls: 0,
      totalEngineMs: 0,
      maximumEngineMs: 0,
      defaultSearchBudgets: true,
    },
  };
  const players = makePlayers(scenario);
  const playerById = new Map(players.map((player) => [player.userId, player]));
  const matchRandom = seededParkMiller(seed);
  const courtScheduleRandom = seededParkMiller(seed ^ 0x6d2b79f5);
  const assignmentsByCourt = new Map<number, MutableAssignment>();
  const assignments: MutableAssignment[] = [];
  const restSamples: number[] = [];
  const lastCompletionEvent = new Map<string, number>();
  let backToBackAssignments = 0;
  let longestOtherCompletionGap = 0;
  let nextAssignmentId = 1;
  const checkpointTargets = [21, 100].filter((value) => value <= targetMatches);
  let nextCheckpoint = 0;

  const runIsolatedJointProbe = (requestedPrefix: 20 | 50) => {
    const clonedPlayers: FrontierPlayer[] = players.map((player) => ({
      ...player,
      availableSince: new Date(player.availableSince),
      arrivalPriorityAt: player.arrivalPriorityAt instanceof Date ? new Date(player.arrivalPriorityAt) : player.arrivalPriorityAt,
    }));
    const clonedById = new Map(clonedPlayers.map((player) => [player.userId, player]));
    const drained = Array.from(assignmentsByCourt.values())
      .filter((assignment) => assignment.remaining)
      .sort((left, right) => left.courtIndex - right.courtIndex);
    const probeHistory: SocialHistoryMatch[] = [...result.completedHistory];
    let drainedCompletedMatches = probeHistory.length;
    for (const assignment of drained) {
      for (const player of clonedPlayers) {
        if (!player.isPaused && !player.isBusy) player.restTurns = Math.max(0, player.restTurns ?? 0) + 1;
      }
      drainedCompletedMatches += 1;
      probeHistory.push({
        id: `M${drainedCompletedMatches}`,
        team1: [...assignment.partition.team1] as [string, string],
        team2: [...assignment.partition.team2] as [string, string],
        socialVariety: assignment.socialVariety,
      });
      for (const id of assignment.ids) {
        const player = clonedById.get(id);
        if (!player) continue;
        player.matchesPlayed += 1;
        player.matchmakingBaseline = player.matchesPlayed;
        player.isBusy = false;
        player.restTurns = 0;
      }
    }
    const startedAt = performance.now();
    const engine = runEngineVersion(engineVersion, clonedPlayers, {
      courtCount: scenario.courtCount,
      respectPlayerRest: true,
      rotationPlayerCount: clonedPlayers.filter((player) => !player.isPaused).length,
      completedMatches: probeHistory,
      socialHistoryMatches: probeHistory,
      randomFn: seededParkMiller(seed ^ (requestedPrefix === 20 ? 0x3a5f1 : 0x4a6f1)),
      socialPriorityPolicy: "courtmate-beneficial-rescue",
    });
    const elapsedMs = performance.now() - startedAt;
    const selectedAssignments = selectionFor(engine);
    const proof = proofResult(engine);
    const certified = Boolean(engine.selection && engine.fairnessCertified && engine.starvationCertified &&
      engine.courtmateGainMaximumCertified && engine.priorityCertified && engine.varietyOptimal);
    const status: SocialFrontierJointProbe["status"] = certified ? "certified"
      : engine.debug.searchLimitReached && !engine.selection ? "search-limited"
        : !engine.selection ? "stalled" : "uncertified-selection";
    result.jointFrontierProbes.push({
      requestedPrefix,
      observedCompletedMatches: result.completedHistory.length,
      drainedCourtIndexes: drained.map((assignment) => assignment.courtIndex),
      drainedCompletedMatches,
      status,
      elapsedMs,
      result: proof,
      selectedAssignments,
      executed: false,
      randomStream: "isolated-probe-seed",
    });
  };

  const makeDecision = (courtCount: number, refillCourtIndex: number | null) => {
    for (const player of players) player.matchmakingBaseline = player.matchesPlayed;
    const startedAt = performance.now();
    const engine = runEngineVersion(engineVersion, players, {
      courtCount,
      respectPlayerRest: true,
      rotationPlayerCount: players.filter((player) => !player.isPaused).length,
      completedMatches: result.completedHistory,
      socialHistoryMatches: [
        ...result.completedHistory,
        ...activeReservationHistory(assignments),
      ],
      randomFn: matchRandom,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
    });
    const elapsedMs = performance.now() - startedAt;
    const selectedAssignments = selectionFor(engine);
    const resultProof = proofResult(engine);
    const certificationSucceeded = Boolean(engine.selection && engine.fairnessCertified && engine.starvationCertified &&
      engine.courtmateGainMaximumCertified && engine.priorityCertified && engine.varietyOptimal);
    const decisionIndex = result.decisions.length + 1;
    const executed = !scenario.openingOnly && certificationSucceeded && selectedAssignments.length === courtCount &&
      (refillCourtIndex === null || !assignmentsByCourt.has(refillCourtIndex));
    result.decisions.push({
      decisionIndex,
      kind: refillCourtIndex === null ? "opening" : "refill",
      afterCompletedMatches: result.completedHistory.length,
      refillCourtIndex,
      courtCount,
      elapsedMs,
      attempted: true,
      executed,
      certificationSucceeded,
      completed: false,
      completedAfterMatchNumber: null,
      selectedAssignments,
      result: resultProof,
    });
    result.diagnostics.attemptedCalls += 1;
    result.diagnostics.totalEngineMs += elapsedMs;
    result.diagnostics.maximumEngineMs = Math.max(result.diagnostics.maximumEngineMs, elapsedMs);
    if (engine.selection) result.diagnostics.callsWithSelection += 1;
    if (engine.debug.searchLimitReached) result.diagnostics.searchLimitCalls += 1;
    if (engine.fairnessCertified) result.diagnostics.fairnessCertifiedCalls += 1;
    if (engine.starvationCertified) result.diagnostics.starvationCertifiedCalls += 1;
    if (engine.courtmateGainMaximumCertified) result.diagnostics.gMaximumCertifiedCalls += 1;
    if (certificationSucceeded) {
      result.diagnostics.certifiedCalls += 1;
      result.diagnostics.fullPriorityCertifiedCalls += 1;
    }

    if (scenario.openingOnly) {
      result.status = "opening-probe";
      result.stopReason = "opening-frontier-only-no-assignments-executed";
      return false;
    }
    if (!engine.selection) {
      result.status = engine.debug.searchLimitReached ? "search-limited" : "stalled";
      result.stopReason = engine.debug.searchLimitReached
        ? "matcher-search-limit-no-selection"
        : `matcher-no-selection:${engine.debug.failureReason ?? "unknown"}`;
      return false;
    }
    if (!certificationSucceeded) {
      result.status = "uncertified-selection";
      result.stopReason = "selection-returned-without-complete-fairness-starvation-gmax-priority-proof";
      return false;
    }
    if (!executed) {
      result.status = "stalled";
      result.stopReason = "certified-selection-had-unexpected-court-count-or-occupied-refill";
      return false;
    }

    const courtIndexes = refillCourtIndex === null
      ? selectedAssignments.map((_assignment, index) => index)
      : [refillCourtIndex];
    for (let index = 0; index < selectedAssignments.length; index += 1) {
      const assignment = selectedAssignments[index];
      const courtIndex = courtIndexes[index];
      const mutable: MutableAssignment = {
        id: `A${nextAssignmentId++}`,
        courtIndex,
        decisionIndex,
        ids: [...assignment.ids],
        partition: assignment.partition,
        socialVariety: assignment.socialVariety,
        remaining: true,
      };
      assignmentsByCourt.set(courtIndex, mutable);
      assignments.push(mutable);
      for (const id of assignment.ids) {
        const player = playerById.get(id);
        if (player) {
          player.isBusy = true;
          player.arrivalPriorityAt = null;
        }
      }
    }
    return true;
  };

  if (!makeDecision(scenario.courtCount, null)) return result;
  if (scenario.openingOnly) return result;

  while (result.completedHistory.length < targetMatches) {
    const occupiedCourts = [...assignmentsByCourt.entries()].filter(([, assignment]) => assignment.remaining).map(([index]) => index);
    if (!occupiedCourts.length) {
      result.status = "stalled";
      result.stopReason = "no-active-assignment-before-target";
      break;
    }
    const randomCourt = Math.floor(courtScheduleRandom() * scenario.courtCount);
    const courtIndex = assignmentsByCourt.has(randomCourt) && assignmentsByCourt.get(randomCourt)!.remaining
      ? randomCourt
      : occupiedCourts[0];
    const assignment = assignmentsByCourt.get(courtIndex)!;
    assignment.remaining = false;
    assignmentsByCourt.delete(courtIndex);
    const completedNumber = result.completedHistory.length + 1;
    result.completedHistory.push({
      id: `M${completedNumber}`,
      team1: [...assignment.partition.team1] as [string, string],
      team2: [...assignment.partition.team2] as [string, string],
      socialVariety: assignment.socialVariety,
    });
    for (const player of players) {
      if (!player.isPaused && !player.isBusy) player.restTurns = Math.max(0, player.restTurns ?? 0) + 1;
    }
    for (const id of assignment.ids) {
      const player = playerById.get(id);
      if (!player) continue;
      const before = lastCompletionEvent.get(id);
      player.matchesPlayed += 1;
      player.matchmakingBaseline = player.matchesPlayed;
      player.isBusy = false;
      const restTurns = Math.max(0, player.restTurns ?? 0);
      restSamples.push(restTurns);
      if (player.matchesPlayed > 1 && restTurns === 0) backToBackAssignments += 1;
      player.restTurns = 0;
      lastCompletionEvent.set(id, completedNumber);
      if (before !== undefined) longestOtherCompletionGap = Math.max(longestOtherCompletionGap, completedNumber - before - 1);
    }
    const owningDecision = result.decisions[assignment.decisionIndex - 1];
    if (owningDecision && !assignments.some((candidate) => candidate.remaining && candidate.decisionIndex === assignment.decisionIndex)) {
      owningDecision.completed = true;
      owningDecision.completedAfterMatchNumber = completedNumber;
    }

    if (nextCheckpoint < checkpointTargets.length && completedNumber === checkpointTargets[nextCheckpoint]) {
      result.checkpoints.push(checkpoint(
        completedNumber,
        players,
        result.completedHistory,
        restSamples,
        backToBackAssignments,
        longestOtherCompletionGap,
      ));
      nextCheckpoint += 1;
    }
    if (scenario.id === "frontier-18-9-9-3c" && (completedNumber === 20 || completedNumber === 50)) {
      runIsolatedJointProbe(completedNumber);
    }
    if (completedNumber >= targetMatches) break;
    if (!makeDecision(1, courtIndex)) break;
  }
  if (result.completedHistory.length === targetMatches && result.status === "completed") result.stopReason = "target-reached";
  return result;
}

export async function runSocialFrontierScalabilityBenchmark(
  options: RunSocialFrontierScalabilityOptions = {},
): Promise<SocialFrontierScalabilityBenchmarkReport> {
  const seeds = [...(options.seeds ?? SOCIAL_FRONTIER_SCALABILITY_DEFAULT_SEEDS)];
  if (!seeds.length || seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
    throw new RangeError("seeds must be positive safe integers");
  }
  const targetMatches = options.targetMatches ?? SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES;
  if (!Number.isSafeInteger(targetMatches) || targetMatches < 1 || targetMatches > SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES) {
    throw new RangeError(`targetMatches must be between 1 and ${SOCIAL_FRONTIER_SCALABILITY_MAX_MATCHES}`);
  }
  const scenarios = options.scenarioIds
    ? options.scenarioIds.map((id) => {
        const scenario = SOCIAL_FRONTIER_SCALABILITY_SCENARIOS.find((candidate) => candidate.id === id);
        if (!scenario) throw new Error(`Unknown frontier scalability scenario: ${id}`);
        return scenario;
      })
    : SOCIAL_FRONTIER_SCALABILITY_SCENARIOS.filter((scenario) => !scenario.openingOnly).slice(0, 3);
  const engineVersions = [...(options.engineVersions ?? SOCIAL_FRONTIER_SCALABILITY_DEFAULT_ENGINES)];
  if (!engineVersions.length || engineVersions.some((version) => version !== "original-control" && version !== "current")) {
    throw new RangeError("engineVersions must include original-control and/or current");
  }
  const sessions: SocialFrontierScalabilitySession[] = [];
  const total = scenarios.length * seeds.length * engineVersions.length;
  for (const scenario of scenarios) {
    for (const engineVersion of engineVersions) {
      for (const seed of seeds) {
        const session = await runSocialFrontierScalabilitySession({ scenario, seed, engineVersion, targetMatches });
        sessions.push(session);
        options.onProgress?.(session, sessions.length, total);
      }
    }
  }
  return {
    schemaVersion: "social-frontier-scalability-v1",
    validationStatus: "pending",
    generatedAt: new Date().toISOString(),
    seeds,
    targetMatches,
    scenarios: [...scenarios],
    policy: "courtmate-beneficial-rescue",
    engineVersions,
    methodology: {
      engineBudget: "Default matcher budgets; no candidate/search limit overrides.",
      execution: "Only batches with returned selections and fairness, starvation, Gmax, and full priority certificates execute; uncertified proposals are recorded and stop that session.",
      scheduler: "Park–Miller seeds and asynchronous court completion fallback match the frozen Social generalization harness; active assignments enter socialHistoryMatches, while completedMatches remains completed-only.",
    },
    sessions,
  };
}
