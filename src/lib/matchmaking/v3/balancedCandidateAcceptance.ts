import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { RotationBatchOptions, SocialBatchResult } from "./socialBatch";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import type {
  BalancedRecurrenceOptions,
  BalancedRecurrencePolicy,
  BalancedRecurrenceResult,
  BalancedRecurrenceStructuralOpportunityEntry,
} from "./balancedRecurrence";
import { getExactPartitionKey } from "./rematch";
import { getImmediateReplayCount, getSocialFairnessVector, getSocialStarvationSummary } from "./scoring";
import { getBalanceGuardrailPolicy } from "./balanceGuardrail";
import { getPartitionBalanceGap, isValidPartitionForMode } from "./balance";
import { buildRecentMatchTypeWindows } from "./socialRollingVariety";
import type { RecentMatchType } from "./socialRollingVariety";
import {
  buildSocialStructuralVarietyContext,
  buildSocialVarietyContext,
  createSocialVarietyCoverageScorer,
  getSocialVarietySnapshot,
} from "./socialVariety";
import type { SocialVarietyContext } from "./socialVariety";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";

export type BalancedCandidateSelectionResult<T extends MatchmakerV3Player> = BalancedRecurrenceResult<ActiveMatchmakerV3Player<T>>;
type BalancedCandidateResult<T extends MatchmakerV3Player> = BalancedCandidateSelectionResult<T>;

type AnyRecord = Record<string, unknown>;

export type BalancedCandidateSearchDiagnostics = {
  exploredBranches: number | null;
  prunedBranches: number | null;
  searchLimitReached: boolean | null;
  elapsedMs: number;
  randomDrawCount: number;
};

export type BalancedCandidateDecision = {
  version: 1;
  requestedPolicy: BalancedRecurrencePolicy | "none";
  appliedPolicy: BalancedRecurrencePolicy | "production" | "none";
  outcome: "candidate-exact" | "production-fallback" | "no-certified-selection";
  reasonCodes: string[];
  candidateProof: {
    selectionPresent: boolean;
    echoedPolicy: boolean;
    fairnessCertified: boolean;
    scheduleCertified: boolean;
    starvationCertified: boolean;
    balanceCertified: boolean;
    replayCertified: boolean;
    coverageGateCertified: boolean;
    recurrenceFrontierCertified: boolean;
    recurrenceAdmissionCertified: boolean;
    fullSearchCertified: boolean;
    structuralVocabularyVerified: boolean;
    structuralVocabularyPlayerCount: number;
    chosenReplayCount: number | null;
    replayMinimum: number | null;
    chosenCoverageGainUnits: string | null;
    chosenMatureDeltaTUnits: string | null;
    bestMatureDeltaTAtRminUnits: string | null;
  };
  fallbackProof?: {
    selectionPresent: boolean;
    certified: boolean;
    fairnessCertified: boolean;
    scheduleCertified: boolean;
    starvationCertified: boolean;
    balanceCertified: boolean;
    replayCertified: boolean;
    coverageGateCertified: boolean;
    searchLimitReached: boolean | null;
    certificationScope: "core-only" | "core-and-production-ranking" | "none";
    recurrenceCertified: false;
    lateVarietyCertified: false;
  };
  candidateSearch: BalancedCandidateSearchDiagnostics;
  fallbackSearch?: BalancedCandidateSearchDiagnostics;
  wrapperElapsedMs: number;
};

export type BalancedCandidateRun<T extends MatchmakerV3Player> = {
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>;
  decision: BalancedCandidateDecision;
  elapsedMs: number;
};

type ReplayCoverageProof = {
  chosenGainUnits: bigint;
  chosenGain: number;
  denominator: bigint;
  baselineGain: number | null;
  baselineGainUnits: bigint | null;
};

type LayoutProof = {
  reasons: string[];
  chosenReplayCount: number | null;
  maxBalanceGap: number | null;
  totalBalanceGap: number | null;
  chosenFairnessVector: number[] | null;
};

export type BalancedReplayRescueAdmissionInput = {
  chosenReplayCount: number | null;
  minimumReplayCount: number | null;
  chosenCoverageGainUnits: bigint | null;
  bestMinimumReplayCoverageGainUnits: bigint | null;
  chosenMatureDeltaTUnits: bigint | null;
  bestMatureDeltaTAtMinimumReplayUnits: bigint | null;
};

/** Apply the strict replay envelope and exact C/T tie exceptions. */
export function isBalancedStrictReplayRescueAdmissible(input: BalancedReplayRescueAdmissionInput): boolean {
  const { chosenReplayCount, minimumReplayCount } = input;
  if (!isNonnegativeInteger(chosenReplayCount) || !isNonnegativeInteger(minimumReplayCount)) return false;
  if (chosenReplayCount === minimumReplayCount) return true;
  if (chosenReplayCount !== minimumReplayCount + 1) return false;
  const coverageRescue = input.chosenCoverageGainUnits !== null &&
    input.bestMinimumReplayCoverageGainUnits !== null &&
    input.chosenCoverageGainUnits > input.bestMinimumReplayCoverageGainUnits;
  const recurrenceRescue = input.chosenMatureDeltaTUnits !== null &&
    input.bestMatureDeltaTAtMinimumReplayUnits !== null &&
    input.chosenMatureDeltaTUnits > input.bestMatureDeltaTAtMinimumReplayUnits;
  return coverageRescue || recurrenceRescue;
}

const RECURRENCE_POLICY: BalancedRecurrencePolicy = "strict-replay-rescue";

/**
 * Default Balanced Points/Elo calls to strict replay rescue. Setting the flag
 * to "0" restores the prior production-only wrapper path; an explicit strict
 * request takes precedence over that rollback switch.
 */
export function resolveBalancedCandidatePolicy(
  sessionType: SessionType,
  requestedPolicy?: BalancedRecurrencePolicy,
): BalancedRecurrencePolicy | undefined {
  if (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO) return undefined;
  if (requestedPolicy === RECURRENCE_POLICY) return RECURRENCE_POLICY;
  const enabled = process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED;
  return enabled === undefined || enabled === "1" ? RECURRENCE_POLICY : undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function sameNumber(left: unknown, right: unknown): boolean {
  return typeof left === "number" && typeof right === "number" && Object.is(left, right);
}

function sameArray(left: unknown, right: readonly unknown[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function sameStringMatrix(left: unknown, right: readonly (readonly string[])[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((row, index) =>
    Array.isArray(row) && row.length === right[index].length && row.every((value, rowIndex) => value === right[index][rowIndex])
  );
}

function asPartition(value: unknown): V3DoublesPartition | null {
  if (!isRecord(value) || !Array.isArray(value.team1) || !Array.isArray(value.team2) ||
    value.team1.length !== 2 || value.team2.length !== 2 ||
    ![...value.team1, ...value.team2].every((id) => typeof id === "string" && id.length > 0)) return null;
  return {
    team1: [value.team1[0], value.team1[1]] as [string, string],
    team2: [value.team2[0], value.team2[1]] as [string, string],
  };
}

function orderedPartitionKey(partition: V3DoublesPartition): string {
  return [
    [...partition.team1].sort().join("|"),
    [...partition.team2].sort().join("|"),
  ].join("||");
}

function getActiveConstraintPlayer<T extends MatchmakerV3Player>(player: T, rank: number): ActiveMatchmakerV3Player<T> {
  return {
    ...player,
    effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
    restTurns: Math.max(0, player.restTurns ?? 0),
    randomScore: 0,
    rank,
  };
}

function scheduleConstraints<T extends MatchmakerV3Player>(
  options: RotationBatchOptions<T> | BalancedRecurrenceOptions<T>,
  courtIndex: number,
  scheduleIndex: number,
): V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined {
  return options.schedules
    ? options.schedules[scheduleIndex]?.courts[courtIndex]
    : options.selectionConstraints;
}

function toHistoryMatch(match: {
  team1: [string, string];
  team2: [string, string];
  completedAt?: Date | null;
  id?: string;
  socialVariety?: SocialHistoryMatch["socialVariety"];
}): SocialHistoryMatch {
  return {
    team1: [...match.team1] as [string, string],
    team2: [...match.team2] as [string, string],
    ...(match.completedAt !== undefined ? { completedAt: match.completedAt } : {}),
    ...(match.id !== undefined ? { id: match.id } : {}),
    ...(match.socialVariety !== undefined ? { socialVariety: match.socialVariety } : {}),
  };
}

function parseIntegerUnits(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d*)$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parsePositiveDenominator(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function normalizedUnits(units: bigint, denominator: bigint): number {
  return Number(units) / Number(denominator);
}

function normalizedCoverageUnits(units: bigint, denominator: bigint): number {
  if (denominator <= BigInt(0) || units <= BigInt(0)) return 0;
  const scale = BigInt(1_000_000_000_000_000);
  return Number((units * scale) / denominator) / Number(scale);
}

function buildTProof<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: BalancedRecurrenceOptions<T>,
  partitions: readonly V3DoublesPartition[],
) {
  const completedMatches = options.completedMatches ?? [];
  const seenHistoryIds = new Set<string>();
  const completedHistory = completedMatches.map(toHistoryMatch).filter((match) => {
    if (!match.id) return true;
    if (seenHistoryIds.has(match.id)) return false;
    seenHistoryIds.add(match.id);
    return true;
  });
  const context = buildSocialStructuralVarietyContext(players, completedHistory, {
    sessionMode: options.sessionMode,
    opportunityConstraints: options.socialStructuralOpportunityConstraints,
  });
  const historyIds = new Set<string>();
  const appearances = new Map(players.map((player) => [player.userId, 0]));
  for (const match of completedHistory) {
    if (match.id) {
      if (historyIds.has(match.id)) continue;
      historyIds.add(match.id);
    }
    const partition = asPartition(match);
    if (!partition || new Set([...partition.team1, ...partition.team2]).size !== 4) continue;
    for (const id of [...partition.team1, ...partition.team2]) {
      if (appearances.has(id)) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
  }
  const windows = buildRecentMatchTypeWindows(completedHistory, context);
  const structuralOpportunityVocabulary: BalancedRecurrenceStructuralOpportunityEntry[] = [...context.playersByUserId]
    .map(([userId, histograms]) => ({
      userId,
      feasibleMatchTypes: (["MIXED", "OWN_SIDE"] as const).filter((type) => histograms.matchType.opportunities.has(type)),
      feasibleCourtmates: [...histograms.courtmates.opportunities].sort(),
      feasiblePartners: [...histograms.partners.opportunities].sort(),
      feasibleOpponents: [...histograms.opponents.opportunities].sort(),
    }))
    .sort((left, right) => left.userId < right.userId ? -1 : left.userId > right.userId ? 1 : 0);
  const eligible = [...context.playersByUserId].flatMap(([userId, histograms]) => {
    const feasibleTypes = (["MIXED", "OWN_SIDE"] as const).filter((type) => histograms.matchType.opportunities.has(type));
    if (!feasibleTypes.length || !feasibleTypes.every((type) => (histograms.matchType.counts.get(type) ?? 0) > 0)) return [];
    return [{
      userId,
      feasibleTypes: [...feasibleTypes],
      typeSet: new Set<"MIXED" | "OWN_SIDE">(feasibleTypes),
      before: [...(windows.get(userId) ?? [])],
      appearances: appearances.get(userId) ?? 0,
    }];
  });
  const gcd = (left: bigint, right: bigint): bigint => {
    let a = left < BigInt(0) ? -left : left;
    let b = right < BigInt(0) ? -right : right;
    while (b !== BigInt(0)) [a, b] = [b, a % b];
    return a;
  };
  const denominator = eligible.reduce((common, player) => {
    const term = BigInt(player.feasibleTypes.length);
    return (common / gcd(common, term)) * term;
  }, BigInt(1));
  const playersByType = new Map(eligible.map((player) => [player.userId, player]));
  const currentWindows = new Map(eligible.map((player) => [player.userId, [...player.before]]));
  const evidence: Array<{
    userId: string;
    firstExposureCompleteBefore: true;
    completedAppearancesBefore: number;
    feasibleMatchTypes: Array<"MIXED" | "OWN_SIDE">;
    beforeRecentMatchTypes: RecentMatchType[];
    afterRecentMatchTypes: RecentMatchType[];
    beforeT: number;
    afterT: number;
    deltaT: number;
  }> = [];
  let gainUnits = BigInt(0);
  for (const partition of partitions) {
    const courtType = options.sessionMode === SessionMode.MIXICANO
      ? getSocialVarietySnapshot(partition, context).courtType
      : null;
    const matchType: RecentMatchType = courtType === "MIXED"
      ? "MIXED"
      : courtType === "UPPER" || courtType === "LOWER" ? "OWN_SIDE" : null;
    const courtIds = [...partition.team1, ...partition.team2];
    for (const userId of courtIds) {
      const mature = playersByType.get(userId);
      if (!mature) continue;
      const before = currentWindows.get(userId) ?? [];
      const after = [...before, matchType].slice(-6);
      const beforeCount = new Set(before.filter((type) => type !== null && mature.typeSet.has(type))).size;
      const afterCount = new Set(after.filter((type) => type !== null && mature.typeSet.has(type))).size;
      const delta = afterCount - beforeCount;
      gainUnits += BigInt(delta) * (denominator / BigInt(mature.feasibleTypes.length));
      currentWindows.set(userId, after);
      evidence.push({
        userId,
        firstExposureCompleteBefore: true,
        completedAppearancesBefore: mature.appearances,
        feasibleMatchTypes: [...mature.feasibleTypes],
        beforeRecentMatchTypes: [...before],
        afterRecentMatchTypes: after,
        beforeT: beforeCount / mature.feasibleTypes.length,
        afterT: afterCount / mature.feasibleTypes.length,
        deltaT: delta / mature.feasibleTypes.length,
      });
    }
  }
  return { eligibleCount: eligible.length, denominator, gainUnits, evidence, structuralOpportunityVocabulary };
}

function proofNumber(value: unknown, code: string, reasons: string[], min = -Infinity, max = Infinity): number | null {
  if (!isFiniteNumber(value) || value < min || value > max) {
    reasons.push(code);
    return null;
  }
  return value;
}

function readMirroredBoolean(result: AnyRecord, debug: AnyRecord, key: string, reason: string, reasons: string[]): boolean {
  const valid = result[key] === true && debug[key] === true;
  if (!valid) reasons.push(reason);
  return valid;
}

function getResultParts<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null | undefined,
): { outer: AnyRecord; debug: AnyRecord; selection: AnyRecord | null } {
  const outer: AnyRecord = isRecord(result) ? result : {};
  const debug: AnyRecord = isRecord(outer.debug) ? outer.debug : {};
  const selection: AnyRecord | null = isRecord(outer.selection) ? outer.selection : null;
  return { outer, debug, selection };
}

function validateGuardrail(
  sessionType: SessionType,
  selectedMaxGap: number,
  selectedTotalGap: number,
  resultGuardrail: unknown,
  debugGuardrail: unknown,
  reasons: string[],
): boolean {
  const policy = getBalanceGuardrailPolicy(sessionType);
  const guardrail = isRecord(resultGuardrail) ? resultGuardrail : null;
  const debug = isRecord(debugGuardrail) ? debugGuardrail : null;
  if (!policy || !guardrail || !debug) {
    reasons.push("BALANCE_GUARDRAIL_MISSING");
    return false;
  }
  const bestMax = guardrail.bestMaxBalanceGap;
  const bestTotal = guardrail.bestTotalBalanceGap;
  const nearBest = guardrail.nearBestWindow;
  const allowedMax = guardrail.allowedMaxBalanceGap;
  if (!isFiniteNumber(bestMax) || bestMax < 0 || !sameNumber(bestMax, debug.bestMaxBalanceGap) ||
    !isFiniteNumber(bestTotal) || bestTotal < 0 || !sameNumber(bestTotal, debug.bestTotalBalanceGap) ||
    !isFiniteNumber(nearBest) || nearBest < 0 || !sameNumber(nearBest, debug.nearBestWindow) ||
    !isFiniteNumber(allowedMax) || allowedMax < 0 || !sameNumber(allowedMax, debug.allowedMaxBalanceGap)) {
    reasons.push("BALANCE_GUARDRAIL_NUMERIC_PROOF_INVALID");
    return false;
  }
  const ceiling = guardrail.absoluteCeiling;
  const allowedTotalValue = guardrail.allowedTotalBalanceGap;
  const allowedTotal: number | null = allowedTotalValue === null
    ? null
    : isFiniteNumber(allowedTotalValue) ? allowedTotalValue : Number.NaN;
  if (guardrail.mode !== policy.mode || guardrail.baselineCertified !== true ||
    !sameNumber(nearBest, policy.nearBestWindow) ||
    !Object.is(ceiling, policy.absoluteCeiling) ||
    (allowedTotalValue !== null && (!isFiniteNumber(allowedTotalValue) || allowedTotalValue < 0)) ||
    !Object.is(allowedTotal, debug.allowedTotalBalanceGap) ||
    guardrail.ceilingFeasible !== (policy.absoluteCeiling === null || bestMax <= policy.absoluteCeiling)) {
    reasons.push("BALANCE_GUARDRAIL_POLICY_MISMATCH");
    return false;
  }
  const ceilingFeasible = policy.absoluteCeiling === null || bestMax <= policy.absoluteCeiling;
  const expectedAllowedMax = ceilingFeasible
    ? Math.min(bestMax + policy.nearBestWindow, policy.absoluteCeiling ?? Infinity)
    : bestMax;
  const expectedAllowedTotal = ceilingFeasible ? null : bestTotal;
  if (!sameNumber(allowedMax, expectedAllowedMax) ||
    !Object.is(allowedTotal, expectedAllowedTotal) ||
    selectedMaxGap > allowedMax ||
    (allowedTotal !== null && selectedTotalGap > allowedTotal)) {
    reasons.push("BALANCE_ENVELOPE_VIOLATED");
    return false;
  }
  return true;
}

function validateLayout<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T> | BalancedRecurrenceOptions<T>,
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
  proof: ReplayCoverageProof | null,
): LayoutProof {
  const reasons: string[] = [];
  const { outer, debug, selection } = getResultParts(result);
  if (!selection || !Array.isArray(selection.selections)) {
    reasons.push("NO_SELECTION");
    return { reasons, chosenReplayCount: null, maxBalanceGap: null, totalBalanceGap: null, chosenFairnessVector: null };
  }
  const selections = selection.selections.filter(isRecord);
  if (selections.length !== options.courtCount || selection.selections.length !== options.courtCount) reasons.push("COURT_COUNT_MISMATCH");
  const scheduleCount = options.schedules?.length ?? 1;
  const scheduleIndex = outer.scheduleIndex;
  if (!Number.isInteger(scheduleIndex) || typeof scheduleIndex !== "number" || scheduleIndex < 0 || scheduleIndex >= scheduleCount) {
    reasons.push("SCHEDULE_INDEX_INVALID");
  }
  const selectedProfile = Number.isInteger(scheduleIndex) && typeof scheduleIndex === "number"
    ? options.schedules?.[scheduleIndex]
    : undefined;
  const selectedScheduleRank = selectedProfile?.rank ?? 0;
  if (selectedProfile && (!isFiniteNumber(selectedProfile.rank) || !Array.isArray(selectedProfile.courts) || selectedProfile.courts.length < options.courtCount)) {
    reasons.push("SCHEDULE_PROFILE_INVALID");
  }

  const rosterById = new Map<string, T>();
  for (const player of players) {
    if (rosterById.has(player.userId)) reasons.push("DUPLICATE_ROSTER_PLAYER_ID");
    rosterById.set(player.userId, player);
  }
  const availableIds = new Set(players.filter((player) => !player.isPaused && !player.isBusy).map((player) => player.userId));
  if (options.candidatePool?.activePlayers) {
    const candidatePoolIds = new Set(options.candidatePool.activePlayers.map((player) => player.userId));
    for (const userId of [...availableIds]) if (!candidatePoolIds.has(userId)) availableIds.delete(userId);
  }
  const requiredLockedIds = new Set([
    ...(options.lockedPlayerIds ?? []),
    ...(options.candidatePool?.lockedPlayers.map((player) => player.userId) ?? []),
  ]);
  const reportedLockedIds = new Set(Array.isArray(debug.lockedPlayerIds) ? debug.lockedPlayerIds : []);
  for (const id of requiredLockedIds) {
    if (!reportedLockedIds.has(id)) reasons.push("LOCKED_INPUT_NOT_CERTIFIED");
  }

  const selectedIds = new Set<string>();
  const canonicalSelected: Array<ActiveMatchmakerV3Player<T>> = [];
  const partitions: V3DoublesPartition[] = [];
  const balanceGaps: number[] = [];
  const replayPlayers: Array<{ restTurns: number }> = [];
  const chosenQuartets: string[][] = [];
  for (const [courtIndex, court] of selections.entries()) {
    const ids = Array.isArray(court.ids) ? court.ids : [];
    const partition = asPartition(court.partition);
    const playersList = Array.isArray(court.players) ? court.players : [];
    if (ids.length !== 4 || !ids.every((id) => typeof id === "string" && id.length > 0) || new Set(ids).size !== 4) {
      reasons.push("COURT_QUARTET_STRUCTURE_INVALID");
      continue;
    }
    if (!partition || new Set([...partition.team1, ...partition.team2]).size !== 4) {
      reasons.push("PARTITION_STRUCTURE_INVALID");
      continue;
    }
    const quartetKey = [...ids].sort().join("|");
    chosenQuartets.push(ids as string[]);
    const sortedIds = [...ids].sort();
    const selectionPlayers = playersList.map((player) => isRecord(player) ? player.userId : undefined);
    if (selectionPlayers.length !== 4 || selectionPlayers.some((id, index) => id !== ids[index]) ||
      [...partition.team1, ...partition.team2].sort().join("\u0000") !== sortedIds.join("\u0000")) {
      reasons.push("COURT_QUARTET_PLAYER_MISMATCH");
    }
    if (options.excludedQuartetKeys?.has(quartetKey)) reasons.push("EXCLUDED_QUARTET_SELECTED");
    if (options.excludedPartitionKey && getExactPartitionKey(partition) === options.excludedPartitionKey) {
      reasons.push("EXCLUDED_PARTITION_SELECTED");
    }
    const sourcePlayers = ids.map((id) => rosterById.get(id));
    if (sourcePlayers.some((player) => !player)) {
      reasons.push("AUTHORITATIVE_PLAYER_MISSING");
      continue;
    }
    const authoritative = sourcePlayers as [T, T, T, T];
    const activeQuartet = authoritative.map((player, index) => getActiveConstraintPlayer(player, index)) as [
      ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>,
    ];
    for (let index = 0; index < ids.length; index += 1) {
      const userId = ids[index] as string;
      const player = authoritative[index];
      const chosenPlayer = isRecord(playersList[index]) ? playersList[index] : {};
      if (!availableIds.has(userId)) reasons.push("INELIGIBLE_PLAYER_SELECTED");
      if (selectedIds.has(userId)) reasons.push("OVERLAPPING_COURTS");
      selectedIds.add(userId);
      if (!isFiniteNumber(player.strength) || !isFiniteNumber(player.matchesPlayed) || !isFiniteNumber(player.matchmakingBaseline)) {
        reasons.push("AUTHORITATIVE_PLAYER_NUMERIC_INVALID");
      }
      const expectedRest = Math.max(0, player.restTurns ?? 0);
      if (!isFiniteNumber(expectedRest) || !sameNumber(chosenPlayer.restTurns, expectedRest) ||
        !sameNumber(chosenPlayer.effectiveMatchCount, Math.max(player.matchesPlayed, player.matchmakingBaseline))) {
        reasons.push("SELECTED_PLAYER_STATE_MISMATCH");
      }
      const active = getActiveConstraintPlayer(player, 0);
      canonicalSelected.push(active);
      replayPlayers.push({ restTurns: expectedRest });
    }
    const constraint = scheduleConstraints(options, courtIndex, typeof scheduleIndex === "number" ? scheduleIndex : 0);
    try {
      if (constraint?.isQuartetAllowed && !constraint.isQuartetAllowed(activeQuartet)) reasons.push("SCHEDULE_CONSTRAINT_VIOLATED");
    } catch {
      reasons.push("SCHEDULE_CONSTRAINT_CHECK_FAILED");
    }
    try {
      if (!isValidPartitionForMode(partition, rosterById, options.sessionMode)) reasons.push("PARTITION_MODE_LAW_VIOLATED");
    } catch {
      reasons.push("PARTITION_MODE_LAW_CHECK_FAILED");
    }
    try {
      if (constraint?.normalizePartition) {
        const playersById = new Map<string, ActiveMatchmakerV3Player<T>>(
          players.filter((player) => !player.isPaused && !player.isBusy)
            .map((player, index) => [player.userId, getActiveConstraintPlayer(player, index)]),
        );
        const normalized = constraint.normalizePartition({ partition, players: activeQuartet, playersById });
        if (!normalized || orderedPartitionKey(normalized) !== orderedPartitionKey(partition)) reasons.push("PARTITION_NORMALIZATION_MISMATCH");
      }
    } catch {
      reasons.push("PARTITION_NORMALIZATION_CHECK_FAILED");
    }
    partitions.push(partition);
    const gap = getPartitionBalanceGap(partition, rosterById);
    if (!isFiniteNumber(gap) || gap < 0 || !sameNumber(court.balanceGap, gap)) {
      reasons.push("SELECTED_BALANCE_GAP_MISMATCH");
    } else {
      balanceGaps.push(gap);
    }
    if (!sameNumber(court.schedulingRank, selectedScheduleRank)) reasons.push("COURT_SCHEDULE_RANK_MISMATCH");
    if (!Array.isArray(selection.fairnessVector) || !sameArray(court.fairnessVector, selection.fairnessVector)) {
      reasons.push("COURT_FAIRNESS_VECTOR_MISMATCH");
    }
    if (selection.balanceGuardrail && !isRecord(court.balanceGuardrail)) reasons.push("COURT_BALANCE_GUARDRAIL_MISSING");
    else if (selection.balanceGuardrail && isRecord(court.balanceGuardrail) &&
      JSON.stringify(court.balanceGuardrail) !== JSON.stringify(selection.balanceGuardrail)) {
      reasons.push("COURT_BALANCE_GUARDRAIL_MISMATCH");
    }
  }
  for (const lockedId of requiredLockedIds) {
    if (!selectedIds.has(lockedId)) reasons.push("LOCKED_PLAYER_OMITTED");
  }
  if (!sameStringMatrix(debug.chosenQuartets, chosenQuartets)) reasons.push("OUTER_DEBUG_LAYOUT_MISMATCH");
  if (!sameNumber(selection.schedulingRank, selectedScheduleRank) || !sameNumber(debug.schedulingRank, selectedScheduleRank)) {
    reasons.push("SCHEDULE_RANK_MISMATCH");
  }

  const chosenReplayCount = getImmediateReplayCount(replayPlayers as Array<ActiveMatchmakerV3Player>);
  const expectedMaxBalanceGap = Math.max(0, ...balanceGaps);
  const expectedTotalBalanceGap = balanceGaps.reduce((sum, value) => sum + value, 0);
  if (!sameNumber(selection.maxBalanceGap, expectedMaxBalanceGap) || !sameNumber(debug.chosenMaxBalanceGap, expectedMaxBalanceGap)) {
    reasons.push("BALANCE_MAX_SUMMARY_MISMATCH");
  }
  if (!sameNumber(selection.totalBalanceGap, expectedTotalBalanceGap) || !sameNumber(debug.chosenTotalBalanceGap, expectedTotalBalanceGap)) {
    reasons.push("BALANCE_TOTAL_SUMMARY_MISMATCH");
  }
  if (proof && (!sameNumber(outer.chosenImmediateReplayCount, chosenReplayCount) ||
    !sameNumber(debug.chosenImmediateReplayCount, chosenReplayCount))) reasons.push("CHOSEN_REPLAY_RECOMPUTATION_MISMATCH");

  const expectedFairnessVector = getSocialFairnessVector(canonicalSelected);
  const outerFairnessVector = selection.fairnessVector;
  const debugFairnessVector = debug.fairnessVector;
  if (!sameArray(outerFairnessVector, expectedFairnessVector) || !sameArray(debugFairnessVector, expectedFairnessVector)) {
    reasons.push("CHOSEN_FAIRNESS_VECTOR_MISMATCH");
  }
  for (const id of Object.keys(debug)) {
    const value = debug[id];
    if (typeof value === "number" && Number.isNaN(value)) reasons.push("DEBUG_NUMBER_NAN");
  }
  return {
    reasons: [...new Set(reasons)],
    chosenReplayCount,
    maxBalanceGap: expectedMaxBalanceGap,
    totalBalanceGap: expectedTotalBalanceGap,
    chosenFairnessVector: expectedFairnessVector,
  };
}

function validateStarvation<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T> | BalancedRecurrenceOptions<T>,
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
  reasons: string[],
): void {
  const { outer, debug, selection } = getResultParts(result);
  if (!selection || !Array.isArray(selection.selections)) return;
  const activeIds = options.candidatePool?.activePlayers
    ? new Set(options.candidatePool.activePlayers.map((player) => player.userId))
    : null;
  const available = players.filter((player) => !player.isPaused && !player.isBusy && (!activeIds || activeIds.has(player.userId)))
    .map((player, index) => ({ userId: player.userId, restTurns: Math.max(0, player.restTurns ?? 0), rank: index }));
  const selectedIds = new Set<string>();
  for (const court of selection.selections) {
    if (isRecord(court) && Array.isArray(court.ids)) for (const id of court.ids) if (typeof id === "string") selectedIds.add(id);
  }
  const chosen = available.filter((player) => selectedIds.has(player.userId));
  const expected = getSocialStarvationSummary(chosen, {
    activePlayerCount: options.rotationPlayerCount ?? players.filter((player) => !player.isPaused).length,
    availablePlayers: available,
  });
  const debugFields: Record<string, number> = {
    socialIdealRestGap: expected.idealRestGap,
    availableOverduePlayerCount: expected.availableOverdueCount,
    selectedOverduePlayerCount: expected.selectedOverdueCount,
    leftOutOverduePlayerCount: expected.leftOutOverdueCount,
    highestLeftOutRestTurns: expected.highestLeftOutRestTurns,
    totalLeftOutRestTurns: expected.totalLeftOutRestTurns,
  };
  for (const [field, value] of Object.entries(debugFields)) {
    if (!sameNumber(debug[field], value)) reasons.push("STARVATION_SUMMARY_MISMATCH");
  }
  for (const court of selection.selections) {
    if (!isRecord(court) || !isRecord(court.socialStarvation)) {
      reasons.push("COURT_STARVATION_SUMMARY_MISSING");
      continue;
    }
    for (const [field, value] of Object.entries({
      idealRestGap: expected.idealRestGap,
      availableOverdueCount: expected.availableOverdueCount,
      selectedOverdueCount: expected.selectedOverdueCount,
      leftOutOverdueCount: expected.leftOutOverdueCount,
      highestLeftOutRestTurns: expected.highestLeftOutRestTurns,
      totalLeftOutRestTurns: expected.totalLeftOutRestTurns,
    })) if (!sameNumber(court.socialStarvation[field], value)) reasons.push("COURT_STARVATION_SUMMARY_MISMATCH");
  }
  void outer;
}

function makeCoverageProof<T extends MatchmakerV3Player>(
  players: readonly T[],
  recurrenceOptions: BalancedRecurrenceOptions<T>,
  legacyOptions: RotationBatchOptions<T>,
  partitions: readonly V3DoublesPartition[],
): ReplayCoverageProof {
  const legacyHistory = legacyOptions.socialHistoryMatches ?? (legacyOptions.completedMatches ?? []).map(toHistoryMatch);
  const legacyOpportunityConstraints = legacyOptions.schedules
    ? legacyOptions.schedules.flatMap((profile) => profile.courts.filter(
        (court): court is V3SelectionConstraints<ActiveMatchmakerV3Player<T>> => Boolean(court),
      ))
    : legacyOptions.selectionConstraints ? [legacyOptions.selectionConstraints] : undefined;
  const legacyContext: SocialVarietyContext = legacyOptions.socialVarietyContext?.sessionMode === recurrenceOptions.sessionMode
    ? legacyOptions.socialVarietyContext
    : buildSocialVarietyContext(players, legacyHistory, {
        sessionMode: recurrenceOptions.sessionMode,
        opportunityConstraints: legacyOpportunityConstraints,
      });
  const scorer = createSocialVarietyCoverageScorer(legacyContext, recurrenceOptions.sessionMode);
  const chosenGainUnits = scorer.getBatchGainUnits(partitions);
  const proof: ReplayCoverageProof = {
    chosenGainUnits,
    chosenGain: scorer.toNormalizedScore(chosenGainUnits),
    denominator: scorer.denominator,
    baselineGain: null,
    baselineGainUnits: null,
  };
  return proof;
}

function validateCoverageOutput<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
  proof: ReplayCoverageProof,
  candidate: boolean,
  requireBaseline: boolean,
  reasons: string[],
): ReplayCoverageProof {
  const { outer, debug } = getResultParts(result);
  const chosenGain = proofNumber(outer.chosenImmediateCoverageGain, "CHOSEN_COVERAGE_GAIN_INVALID", reasons, 0, 1);
  const bestGain = requireBaseline
    ? proofNumber(outer.bestMinimumReplayCoverageGain, "COVERAGE_FRONTIER_GAIN_INVALID", reasons, 0, 1)
    : outer.bestMinimumReplayCoverageGain === null ? null
      : proofNumber(outer.bestMinimumReplayCoverageGain, "COVERAGE_FRONTIER_GAIN_INVALID", reasons, 0, 1);
  if (chosenGain === null || debug.chosenImmediateCoverageGain !== chosenGain ||
    chosenGain !== proof.chosenGain) reasons.push("CHOSEN_COVERAGE_RECOMPUTATION_MISMATCH");
  if ((requireBaseline && bestGain === null) || !Object.is(debug.bestMinimumReplayCoverageGain, bestGain)) {
    reasons.push("OUTER_DEBUG_COVERAGE_FRONTIER_MISMATCH");
  }
  const resultCoverage = proof as ReplayCoverageProof;
  resultCoverage.baselineGain = bestGain;
  if (candidate) {
    const exact = result as BalancedCandidateResult<T>;
    const units = parseIntegerUnits(exact.chosenImmediateCoverageGainUnits);
    const baselineUnits = parseIntegerUnits(exact.bestMinimumReplayCoverageGainUnits);
    const denominator = parsePositiveDenominator(exact.coverageGainDenominator);
    if (units === null || units !== proof.chosenGainUnits ||
      (requireBaseline && baselineUnits === null) || denominator === null ||
      denominator !== proof.denominator ||
      (baselineUnits !== null && (baselineUnits < BigInt(0) || baselineUnits > denominator)) ||
      (units !== null && normalizedCoverageUnits(units, denominator ?? BigInt(0)) !== proof.chosenGain) ||
      (baselineUnits !== null && bestGain !== null && normalizedCoverageUnits(baselineUnits, denominator ?? BigInt(0)) !== bestGain)) {
      reasons.push("EXACT_COVERAGE_UNITS_INVALID_OR_FALSIFIED");
    }
    const debugExact = debug as AnyRecord;
    if (exact.chosenImmediateCoverageGainUnits !== debugExact.chosenImmediateCoverageGainUnits ||
      exact.bestMinimumReplayCoverageGainUnits !== debugExact.bestMinimumReplayCoverageGainUnits ||
      exact.coverageGainDenominator !== debugExact.coverageGainDenominator) {
      reasons.push("OUTER_DEBUG_EXACT_COVERAGE_MISMATCH");
    }
    resultCoverage.baselineGainUnits = baselineUnits;
  }
  return resultCoverage;
}

function sameStructuralVocabulary(
  actual: unknown,
  expected: Array<{
    userId: string;
    feasibleMatchTypes: Array<"MIXED" | "OWN_SIDE">;
    feasibleCourtmates: string[];
    feasiblePartners: string[];
    feasibleOpponents: string[];
  }>,
): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const project = (value: unknown): string | null => {
    if (!isRecord(value) || typeof value.userId !== "string" ||
      !Array.isArray(value.feasibleMatchTypes) || !Array.isArray(value.feasibleCourtmates) ||
      !Array.isArray(value.feasiblePartners) || !Array.isArray(value.feasibleOpponents) ||
      ![...value.feasibleMatchTypes, ...value.feasibleCourtmates, ...value.feasiblePartners, ...value.feasibleOpponents]
        .every((entry) => typeof entry === "string")) return null;
    return JSON.stringify({
      userId: value.userId,
      feasibleMatchTypes: value.feasibleMatchTypes,
      feasibleCourtmates: value.feasibleCourtmates,
      feasiblePartners: value.feasiblePartners,
      feasibleOpponents: value.feasibleOpponents,
    });
  };
  const expectedJson = expected.map((entry) => JSON.stringify(entry));
  return actual.map(project).every((value, index) => value !== null && value === expectedJson[index]);
}

function validateCandidateProofInternal<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: BalancedRecurrenceOptions<T>,
  legacyOptions: RotationBatchOptions<T>,
  result: BalancedCandidateResult<T> | null,
): string[] {
  const reasons: string[] = [];
  if (!result) return ["CANDIDATE_MATCHER_ERROR"];
  const { outer, debug, selection } = getResultParts(result);
  const proof = result as unknown as AnyRecord;
  const proofDebug = debug as AnyRecord;
  const policyEcho = outer.balancedMatureRecurrencePolicy === RECURRENCE_POLICY &&
    proofDebug.balancedMatureRecurrencePolicy === RECURRENCE_POLICY;
  if (!policyEcho) reasons.push("POLICY_ECHO_MISMATCH");
  if (options.sessionType !== SessionType.POINTS && options.sessionType !== SessionType.ELO) reasons.push("UNSUPPORTED_SESSION_TYPE");
  if (options.respectPlayerRest === false) reasons.push("REPLAY_GATES_DISABLED");
  if (options.socialStructuralOpportunityConstraints === undefined) reasons.push("STRUCTURAL_OPPORTUNITY_DEFINITION_MISSING");
  if ((options as BalancedRecurrenceOptions<T> & { socialPriorityPolicy?: unknown }).socialPriorityPolicy !== undefined) {
    reasons.push("SOCIAL_POLICY_MUST_NOT_BE_USED");
  }
  if ((options as BalancedRecurrenceOptions<T> & { coverageGainMetric?: unknown }).coverageGainMetric !== undefined ||
    (options as BalancedRecurrenceOptions<T> & { balanceGuardrailPolicy?: unknown }).balanceGuardrailPolicy !== undefined) {
    reasons.push("CANDIDATE_POLICY_OVERRIDE_NOT_ALLOWED");
  }
  if (!selection) reasons.push("NO_CANDIDATE_SELECTION");
  const mirrored = [
    ["fairnessCertified", "FAIRNESS_UNCERTIFIED"],
    ["scheduleCertified", "SCHEDULE_UNCERTIFIED"],
    ["starvationCertified", "STARVATION_UNCERTIFIED"],
    ["balanceCertified", "BALANCE_UNCERTIFIED"],
    ["replayCertified", "REPLAY_UNCERTIFIED"],
    ["coverageGateCertified", "COVERAGE_GATE_UNCERTIFIED"],
    ["recurrenceCertified", "RECURRENCE_UNCERTIFIED"],
    ["recurrenceFrontierCertified", "RECURRENCE_FRONTIER_UNCERTIFIED"],
    ["recurrenceAdmissionCertified", "RECURRENCE_ADMISSION_UNCERTIFIED"],
    ["selectedAdmissionEligible", "SELECTED_ADMISSION_NOT_CERTIFIED"],
    ["varietyOptimal", "VARIETY_SEARCH_INCOMPLETE"],
  ] as const;
  for (const [key, reason] of mirrored) readMirroredBoolean(outer, debug, key, reason, reasons);
  if (debug.searchLimitReached !== false) reasons.push("SEARCH_LIMIT_REACHED_OR_UNKNOWN");
  if (outer.varietyOptimal !== true || debug.varietyOptimal !== true) reasons.push("FULL_SEARCH_UNCERTIFIED");
  if (debug.failureReason !== null) reasons.push("NON_NULL_FAILURE_REASON");
  if (outer.replayEnvelopeStatus !== "CERTIFIED" || debug.replayEnvelopeStatus !== "CERTIFIED") reasons.push("REPLAY_ENVELOPE_UNCERTIFIED");
  if (outer.coverageGateStatus !== "CERTIFIED" || debug.coverageGateStatus !== "CERTIFIED") reasons.push("COVERAGE_GATE_STATUS_UNCERTIFIED");
  if (outer.coverageGainMetric !== "legacy-four-facet" || debug.coverageGainMetric !== "legacy-four-facet") reasons.push("LEGACY_COVERAGE_METRIC_MISMATCH");
  if (outer.recurrenceFrontierCertified !== true || debug.recurrenceFrontierCertified !== true) reasons.push("RECURRENCE_FRONTIER_MISSING");
  if (outer.recurrenceCertified !== true || debug.recurrenceCertified !== true) reasons.push("RECURRENCE_PROOF_MISSING");

  const layout = validateLayout(players, options, result, null);
  reasons.push(...layout.reasons);
  validateStarvation(players, options, result, reasons);
  const policy = getBalanceGuardrailPolicy(options.sessionType);
  const guardrailSource = selection?.balanceGuardrail ?? debug.balanceGuardrail;
  const guardrail = isRecord(guardrailSource) ? guardrailSource : null;
  if (layout.maxBalanceGap !== null && layout.totalBalanceGap !== null) {
    validateGuardrail(options.sessionType, layout.maxBalanceGap, layout.totalBalanceGap,
      guardrailSource, debug.balanceGuardrail, reasons);
  }
  if (!policy || outer.balanceCertified !== true || debug.balanceCertified !== true) reasons.push("BALANCE_BASELINE_UNCERTIFIED");
  if (guardrail && selection && !isRecord(selection.balanceGuardrail)) reasons.push("SELECTION_BALANCE_GUARDRAIL_MISSING");

  const partitions = selection && Array.isArray(selection.selections)
    ? selection.selections.flatMap((court) => {
        const partition = isRecord(court) ? asPartition(court.partition) : null;
        return partition ? [partition] : [];
      })
    : [];
  const coverageProof = validateCoverageOutput(result, makeCoverageProof(players, options, legacyOptions, partitions), true, true, reasons);
  const chosenReplayCount = layout.chosenReplayCount;
  const minReplay = proofNumber(outer.bestImmediateReplayCount, "REPLAY_MINIMUM_INVALID", reasons, 0, options.courtCount * 4);
  if (minReplay === null || !Number.isInteger(minReplay) || debug.bestImmediateReplayCount !== minReplay) reasons.push("REPLAY_MINIMUM_OUTER_DEBUG_MISMATCH");
  const allowedReplay = proofNumber(outer.allowedImmediateReplayCount, "REPLAY_ENVELOPE_INVALID", reasons, 0, options.courtCount * 4 + 1);
  if (allowedReplay === null || allowedReplay !== (minReplay === null ? null : minReplay + 1) || debug.allowedImmediateReplayCount !== allowedReplay) {
    reasons.push("REPLAY_ENVELOPE_MISMATCH");
  }
  if (chosenReplayCount === null || !sameNumber(outer.chosenImmediateReplayCount, chosenReplayCount) ||
    !sameNumber(debug.chosenImmediateReplayCount, chosenReplayCount)) reasons.push("CHOSEN_REPLAY_RECOMPUTATION_MISMATCH");
  if (chosenReplayCount !== null && minReplay !== null && chosenReplayCount !== minReplay && chosenReplayCount !== minReplay + 1) {
    reasons.push("REPLAY_PLUS_TWO_OR_MORE");
  }

  const t = buildTProof(players, options, partitions);
  if (!sameStructuralVocabulary(proof.structuralOpportunityVocabulary, t.structuralOpportunityVocabulary)) {
    reasons.push("STRUCTURAL_OPPORTUNITY_VOCABULARY_MISMATCH");
  }
  const chosenTUnits = parseIntegerUnits(outer.chosenMatureDeltaTUnits);
  const tDenominator = parsePositiveDenominator(outer.matureDeltaTDenominator);
  const frontierUnits = parseIntegerUnits(outer.bestMatureDeltaTAtRminUnits);
  const frontierDenominator = parsePositiveDenominator(outer.bestMatureDeltaTAtRminDenominator);
  const chosenT = proofNumber(outer.chosenMatureDeltaT, "CHOSEN_T_INVALID", reasons, -options.courtCount * 4, options.courtCount * 4);
  const frontierT = proofNumber(outer.bestMatureDeltaTAtRmin, "FRONTIER_T_INVALID", reasons, -options.courtCount * 4, options.courtCount * 4);
  if (chosenTUnits === null || chosenTUnits !== t.gainUnits || tDenominator === null || tDenominator !== t.denominator ||
    chosenT === null || chosenT !== normalizedUnits(t.gainUnits, t.denominator) ||
    outer.chosenMatureDeltaTUnits !== debug.chosenMatureDeltaTUnits ||
    outer.matureDeltaTDenominator !== debug.matureDeltaTDenominator) {
    reasons.push("CHOSEN_T_RECOMPUTATION_MISMATCH");
  }
  if (frontierUnits === null || frontierDenominator === null || frontierDenominator !== t.denominator ||
    frontierT === null || frontierT !== normalizedUnits(frontierUnits, t.denominator) ||
    !sameNumber(debug.bestMatureDeltaTAtRmin, frontierT) ||
    outer.bestMatureDeltaTAtRminUnits !== debug.bestMatureDeltaTAtRminUnits ||
    outer.bestMatureDeltaTAtRminDenominator !== debug.bestMatureDeltaTAtRminDenominator) {
    reasons.push("T_FRONTIER_PROOF_INVALID");
  }
  if (!sameNumber(debug.chosenMatureDeltaT, chosenT)) reasons.push("OUTER_DEBUG_CHOSEN_T_MISMATCH");
  if (!isNonnegativeInteger(outer.matureTypeEligiblePlayerCount) || outer.matureTypeEligiblePlayerCount !== t.eligibleCount ||
    outer.firstExposureCompletePlayerCount !== t.eligibleCount ||
    outer.matureTypeEligiblePlayerCount !== debug.matureTypeEligiblePlayerCount ||
    outer.firstExposureCompletePlayerCount !== debug.firstExposureCompletePlayerCount) {
    reasons.push("MATURE_TYPE_PLAYER_COUNT_MISMATCH");
  }
  if (!sameRecurrenceEvidence(outer.matureRecurrencePlayers, debug.matureRecurrencePlayers, t.evidence)) {
    reasons.push("STRUCTURAL_VOCABULARY_OR_T_EVIDENCE_MISMATCH");
  }

  const coverageBaselineUnits = coverageProof.baselineGainUnits;
  const coverageException = chosenReplayCount !== null && minReplay !== null && chosenReplayCount === minReplay + 1 &&
    coverageProof.chosenGainUnits > (coverageBaselineUnits ?? BigInt(0));
  const recurrenceException = chosenReplayCount !== null && minReplay !== null && chosenReplayCount === minReplay + 1 &&
    chosenTUnits !== null && frontierUnits !== null && chosenTUnits > frontierUnits;
  const admissionExpected = isBalancedStrictReplayRescueAdmissible({
    chosenReplayCount,
    minimumReplayCount: minReplay,
    chosenCoverageGainUnits: coverageProof.chosenGainUnits,
    bestMinimumReplayCoverageGainUnits: coverageBaselineUnits,
    chosenMatureDeltaTUnits: chosenTUnits,
    bestMatureDeltaTAtMinimumReplayUnits: frontierUnits,
  });
  if (chosenReplayCount === minReplay && minReplay !== null) {
    if (!Array.isArray(outer.admissionReasons) || outer.admissionReasons.join("|") !== "replay-minimum" ||
      !Array.isArray(debug.admissionReasons) || debug.admissionReasons.join("|") !== "replay-minimum") {
      reasons.push("ADMISSION_REASON_MISMATCH");
    }
  } else {
    const expectedReasons = [
      ...(coverageException ? ["first-exposure"] : []),
      ...(recurrenceException ? ["recurrence"] : []),
    ];
    if (!Array.isArray(outer.admissionReasons) || outer.admissionReasons.join("|") !== expectedReasons.join("|") ||
      !Array.isArray(debug.admissionReasons) || debug.admissionReasons.join("|") !== expectedReasons.join("|")) {
      reasons.push("ADMISSION_REASON_MISMATCH");
    }
  }
  if (!admissionExpected) reasons.push("SELECTED_ADMISSION_RULE_VIOLATED");
  if (outer.selectedAdmissionEligible !== admissionExpected || debug.selectedAdmissionEligible !== admissionExpected) reasons.push("SELECTED_ADMISSION_MISMATCH");
  if (outer.coverageExceptionEligible !== coverageException || debug.coverageExceptionEligible !== coverageException) reasons.push("COVERAGE_EXCEPTION_MISMATCH");
  if (outer.recurrenceExceptionEligible !== recurrenceException || debug.recurrenceExceptionEligible !== recurrenceException ||
    outer.chosenRecurrenceRescue !== recurrenceException || debug.chosenRecurrenceRescue !== recurrenceException) {
    reasons.push("RECURRENCE_EXCEPTION_MISMATCH");
  }
  const coverageOnlyEligibility = chosenReplayCount !== null && minReplay !== null &&
    (chosenReplayCount === minReplay || coverageException);
  if (outer.chosenReplayCoverageEligible !== coverageOnlyEligibility || debug.chosenReplayCoverageEligible !== coverageOnlyEligibility) {
    reasons.push("LEGACY_COVERAGE_ADMISSION_MISMATCH");
  }
  const expectedConditionalTBenefit = recurrenceException && chosenTUnits !== null && frontierUnits !== null
    ? normalizedUnits(chosenTUnits - frontierUnits, t.denominator)
    : admissionExpected ? 0 : null;
  if (expectedConditionalTBenefit === null
    ? outer.conditionalTBenefit !== null || debug.conditionalTBenefit !== null
    : !sameNumber(outer.conditionalTBenefit, expectedConditionalTBenefit) || !sameNumber(debug.conditionalTBenefit, expectedConditionalTBenefit)) {
    reasons.push("CONDITIONAL_T_BENEFIT_MISMATCH");
  }
  return [...new Set(reasons)];
}

/** Public, side-effect-free acceptance check for focused callers and benchmarks. */
export function verifyBalancedCandidateAcceptance<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: BalancedRecurrenceOptions<T>,
  legacyOptions: RotationBatchOptions<T>,
  result: BalancedCandidateSelectionResult<T> | null,
): string[] {
  try {
    return validateCandidateProofInternal(players, options, legacyOptions, result);
  } catch {
    return ["CANDIDATE_ACCEPTANCE_CHECK_FAILED"];
  }
}

function sameRecurrenceEvidence(
  outerEvidence: unknown,
  debugEvidence: unknown,
  expected: Array<{
    userId: string;
    firstExposureCompleteBefore: true;
    completedAppearancesBefore: number;
    feasibleMatchTypes: Array<"MIXED" | "OWN_SIDE">;
    beforeRecentMatchTypes: RecentMatchType[];
    afterRecentMatchTypes: RecentMatchType[];
    beforeT: number;
    afterT: number;
    deltaT: number;
  }>,
): boolean {
  if (!Array.isArray(outerEvidence) || !Array.isArray(debugEvidence) || outerEvidence.length !== expected.length || debugEvidence.length !== expected.length) return false;
  const normalize = (value: unknown): string | null => {
    if (!isRecord(value) || typeof value.userId !== "string" || !isNonnegativeInteger(value.completedAppearancesBefore) ||
      value.firstExposureCompleteBefore !== true || !Array.isArray(value.feasibleMatchTypes) ||
      !Array.isArray(value.beforeRecentMatchTypes) || !Array.isArray(value.afterRecentMatchTypes) ||
      !isFiniteNumber(value.beforeT) || !isFiniteNumber(value.afterT) || !isFiniteNumber(value.deltaT)) return null;
    return JSON.stringify({
      userId: value.userId,
      firstExposureCompleteBefore: value.firstExposureCompleteBefore,
      completedAppearancesBefore: value.completedAppearancesBefore,
      feasibleMatchTypes: value.feasibleMatchTypes,
      beforeRecentMatchTypes: value.beforeRecentMatchTypes,
      afterRecentMatchTypes: value.afterRecentMatchTypes,
      beforeT: value.beforeT,
      afterT: value.afterT,
      deltaT: value.deltaT,
    });
  };
  const expectedJson = expected.map((entry) => JSON.stringify(entry));
  const outerJson = outerEvidence.map(normalize);
  const debugJson = debugEvidence.map(normalize);
  return outerJson.every((value, index) => value === expectedJson[index]) &&
    debugJson.every((value, index) => value === expectedJson[index]);
}

function getCandidateProof<T extends MatchmakerV3Player>(
  result: BalancedCandidateResult<T> | null,
  structuralVocabularyVerified = false,
): BalancedCandidateDecision["candidateProof"] {
  const { outer, debug } = getResultParts(result);
  const finiteOrNull = (value: unknown) => isFiniteNumber(value) ? value : null;
  return {
    selectionPresent: Boolean(outer.selection),
    echoedPolicy: outer.balancedMatureRecurrencePolicy === RECURRENCE_POLICY && debug.balancedMatureRecurrencePolicy === RECURRENCE_POLICY,
    fairnessCertified: outer.fairnessCertified === true && debug.fairnessCertified === true,
    scheduleCertified: outer.scheduleCertified === true && debug.scheduleCertified === true,
    starvationCertified: outer.starvationCertified === true && debug.starvationCertified === true,
    balanceCertified: outer.balanceCertified === true && debug.balanceCertified === true,
    replayCertified: outer.replayCertified === true && debug.replayCertified === true && debug.replayEnvelopeStatus === "CERTIFIED",
    coverageGateCertified: outer.coverageGateCertified === true && debug.coverageGateCertified === true && debug.coverageGateStatus === "CERTIFIED",
    recurrenceFrontierCertified: outer.recurrenceFrontierCertified === true && debug.recurrenceFrontierCertified === true,
    recurrenceAdmissionCertified: outer.recurrenceAdmissionCertified === true && debug.recurrenceAdmissionCertified === true,
    fullSearchCertified: outer.varietyOptimal === true && debug.varietyOptimal === true && debug.searchLimitReached === false,
    structuralVocabularyVerified,
    structuralVocabularyPlayerCount: structuralVocabularyVerified && Array.isArray(outer.structuralOpportunityVocabulary)
      ? outer.structuralOpportunityVocabulary.length
      : 0,
    chosenReplayCount: finiteOrNull(outer.chosenImmediateReplayCount),
    replayMinimum: finiteOrNull(outer.bestImmediateReplayCount),
    chosenCoverageGainUnits: typeof outer.chosenImmediateCoverageGainUnits === "string" ? outer.chosenImmediateCoverageGainUnits : null,
    chosenMatureDeltaTUnits: typeof outer.chosenMatureDeltaTUnits === "string" ? outer.chosenMatureDeltaTUnits : null,
    bestMatureDeltaTAtRminUnits: typeof outer.bestMatureDeltaTAtRminUnits === "string" ? outer.bestMatureDeltaTAtRminUnits : null,
  };
}

function validateFallback<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T>,
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null,
): { reasons: string[]; proof: NonNullable<BalancedCandidateDecision["fallbackProof"]> } {
  const reasons: string[] = [];
  if (!result) {
    return {
      reasons: ["PRODUCTION_FALLBACK_MATCHER_ERROR"],
      proof: {
        selectionPresent: false, certified: false, fairnessCertified: false, scheduleCertified: false,
        starvationCertified: false, balanceCertified: false, replayCertified: false, coverageGateCertified: false,
        searchLimitReached: null, certificationScope: "none", recurrenceCertified: false, lateVarietyCertified: false,
      },
    };
  }
  const { outer, debug, selection } = getResultParts(result);
  const checkBoolean = (key: string, reason: string) => readMirroredBoolean(outer, debug, key, reason, reasons);
  const fairness = checkBoolean("fairnessCertified", "PRODUCTION_FALLBACK_FAIRNESS_UNCERTIFIED");
  const schedule = checkBoolean("scheduleCertified", "PRODUCTION_FALLBACK_SCHEDULE_UNCERTIFIED");
  const starvation = checkBoolean("starvationCertified", "PRODUCTION_FALLBACK_STARVATION_UNCERTIFIED");
  const balance = checkBoolean("balanceCertified", "PRODUCTION_FALLBACK_BALANCE_UNCERTIFIED");
  const replay = checkBoolean("replayCertified", "PRODUCTION_FALLBACK_REPLAY_UNCERTIFIED");
  const coverage = checkBoolean("coverageGateCertified", "PRODUCTION_FALLBACK_COVERAGE_UNCERTIFIED");
  const replayEnabled = options.respectPlayerRest !== false;
  const expectedReplayStatus = replayEnabled ? "CERTIFIED" : "DISABLED";
  const expectedCoverageStatus = replayEnabled ? "CERTIFIED" : "DISABLED";
  if (outer.replayEnvelopeStatus !== expectedReplayStatus || debug.replayEnvelopeStatus !== expectedReplayStatus) {
    reasons.push("PRODUCTION_FALLBACK_REPLAY_ENVELOPE_UNCERTIFIED");
  }
  if (outer.coverageGateStatus !== expectedCoverageStatus || debug.coverageGateStatus !== expectedCoverageStatus) {
    reasons.push("PRODUCTION_FALLBACK_COVERAGE_STATUS_UNCERTIFIED");
  }
  if (!selection) reasons.push("PRODUCTION_FALLBACK_NO_SELECTION");
  const candidateOptions = {
    ...options,
    recurrencePolicy: RECURRENCE_POLICY,
    socialStructuralOpportunityConstraints: options.socialStructuralOpportunityConstraints ?? [],
  } as BalancedRecurrenceOptions<T>;
  const partitions = selection && Array.isArray(selection.selections)
    ? selection.selections.flatMap((court) => {
        const partition = isRecord(court) ? asPartition(court.partition) : null;
        return partition ? [partition] : [];
      })
    : [];
  const coverageProof = makeCoverageProof(players, candidateOptions, options, partitions);
  validateCoverageOutput(result, coverageProof, false, replayEnabled, reasons);
  const layout = validateLayout(players, options, result, coverageProof);
  reasons.push(...layout.reasons);
  validateStarvation(players, options, result, reasons);
  const minReplay = replayEnabled
    ? proofNumber(outer.bestImmediateReplayCount, "PRODUCTION_FALLBACK_REPLAY_MINIMUM_INVALID", reasons, 0, options.courtCount * 4)
    : null;
  const allowedReplay = replayEnabled
    ? proofNumber(outer.allowedImmediateReplayCount, "PRODUCTION_FALLBACK_REPLAY_ENVELOPE_INVALID", reasons, 0, options.courtCount * 4 + 1)
    : null;
  if (replayEnabled && (minReplay === null || allowedReplay !== minReplay + 1 ||
    debug.bestImmediateReplayCount !== minReplay || debug.allowedImmediateReplayCount !== allowedReplay)) {
    reasons.push("PRODUCTION_FALLBACK_REPLAY_ENVELOPE_MISMATCH");
  }
  if (!replayEnabled && (outer.bestImmediateReplayCount !== null || outer.allowedImmediateReplayCount !== null ||
    debug.bestImmediateReplayCount !== null || debug.allowedImmediateReplayCount !== null)) {
    reasons.push("PRODUCTION_FALLBACK_DISABLED_REPLAY_VALUES_MISMATCH");
  }
  if (layout.chosenReplayCount === null || !sameNumber(outer.chosenImmediateReplayCount, layout.chosenReplayCount) ||
    !sameNumber(debug.chosenImmediateReplayCount, layout.chosenReplayCount)) reasons.push("PRODUCTION_FALLBACK_CHOSEN_REPLAY_MISMATCH");
  if (replayEnabled && minReplay !== null && layout.chosenReplayCount !== minReplay && layout.chosenReplayCount !== minReplay + 1) {
    reasons.push("PRODUCTION_FALLBACK_REPLAY_PLUS_TWO_OR_MORE");
  }
  const chosenCoverageEligible = replayEnabled
    ? layout.chosenReplayCount === minReplay ||
      (layout.chosenReplayCount === (minReplay ?? -100) + 1 && coverageProof.baselineGain !== null && coverageProof.chosenGain > coverageProof.baselineGain)
    : null;
  if (outer.chosenReplayCoverageEligible !== chosenCoverageEligible || debug.chosenReplayCoverageEligible !== chosenCoverageEligible) {
    reasons.push("PRODUCTION_FALLBACK_COVERAGE_ADMISSION_MISMATCH");
  }
  if (replayEnabled && chosenCoverageEligible !== true) {
    reasons.push("PRODUCTION_FALLBACK_COVERAGE_ADMISSION_VIOLATED");
  }
  const guardrail = isRecord(selection?.balanceGuardrail) ? selection.balanceGuardrail : debug.balanceGuardrail;
  if (layout.maxBalanceGap !== null && layout.totalBalanceGap !== null) {
    validateGuardrail(options.sessionType, layout.maxBalanceGap, layout.totalBalanceGap, guardrail, debug.balanceGuardrail, reasons);
  }
  if (debug.searchLimitReached !== true && debug.searchLimitReached !== false) reasons.push("PRODUCTION_FALLBACK_SEARCH_LIMIT_STATUS_UNKNOWN");
  if (outer.varietyOptimal !== debug.varietyOptimal) reasons.push("PRODUCTION_FALLBACK_RANKING_CERTIFICATE_MISMATCH");
  if (outer.coverageGainMetric !== "legacy-four-facet" || debug.coverageGainMetric !== "legacy-four-facet") {
    reasons.push("PRODUCTION_FALLBACK_COVERAGE_METRIC_MISMATCH");
  }
  const certified = Boolean(selection && fairness && schedule && starvation && balance && replay && coverage && reasons.length === 0);
  const scope = !certified ? "none"
    : debug.searchLimitReached === true || outer.varietyOptimal !== true || debug.varietyOptimal !== true
      ? "core-only"
      : "core-and-production-ranking";
  return {
    reasons: [...new Set(reasons)],
    proof: {
      selectionPresent: Boolean(selection), certified, fairnessCertified: fairness, scheduleCertified: schedule,
      starvationCertified: starvation, balanceCertified: balance, replayCertified: replay, coverageGateCertified: coverage,
      searchLimitReached: typeof debug.searchLimitReached === "boolean" ? debug.searchLimitReached : null,
      certificationScope: scope,
      recurrenceCertified: false,
      lateVarietyCertified: false,
    },
  };
}

export type BalancedFallbackValidation = {
  reasons: string[];
  proof: NonNullable<BalancedCandidateDecision["fallbackProof"]>;
};

/** Verify production core certificates independently of late variety ranking. */
export function verifyBalancedProductionFallback<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T>,
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null,
): BalancedFallbackValidation {
  try {
    return validateFallback(players, options, result);
  } catch {
    return {
      reasons: ["PRODUCTION_FALLBACK_ACCEPTANCE_CHECK_FAILED"],
      proof: {
        selectionPresent: false, certified: false, fairnessCertified: false, scheduleCertified: false,
        starvationCertified: false, balanceCertified: false, replayCertified: false, coverageGateCertified: false,
        searchLimitReached: null, certificationScope: "none", recurrenceCertified: false, lateVarietyCertified: false,
      },
    };
  }
}

function createDiagnostics(
  result: unknown,
  elapsedMs: number,
  randomDrawCount: number,
): BalancedCandidateSearchDiagnostics {
  const debug = isRecord(result) && isRecord(result.debug) ? result.debug : {};
  return {
    exploredBranches: isNonnegativeInteger(debug.exploredBranches) ? debug.exploredBranches : null,
    prunedBranches: isNonnegativeInteger(debug.prunedBranches) ? debug.prunedBranches : null,
    searchLimitReached: typeof debug.searchLimitReached === "boolean" ? debug.searchLimitReached : null,
    elapsedMs: Math.max(0, elapsedMs),
    randomDrawCount,
  };
}

function isExhaustiveNoSelection<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
): boolean {
  if (result.selection !== null || result.debug.searchLimitReached !== false) return false;
  return result.debug.failureReason === "INSUFFICIENT_PLAYERS" ||
    result.debug.failureReason === "LOCKED_PLAYERS_CANNOT_ALL_FIT" ||
    result.debug.failureReason === "NO_VALID_MIXED_QUARTETS" ||
    result.debug.failureReason === "NOT_ENOUGH_NON_OVERLAPPING_COURTS";
}

function buildSafeNoSelection<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  const exhaustiveNoSelection = isExhaustiveNoSelection(result);
  return {
    ...result,
    selection: null,
    scheduleIndex: null,
    scheduleCertified: false,
    fairnessCertified: false,
    starvationCertified: false,
    bestImmediateReplayCount: null,
    allowedImmediateReplayCount: null,
    chosenImmediateReplayCount: null,
    replayCertified: false,
    replayEnvelopeStatus: "NO_SELECTION",
    bestMinimumReplayCoverageGain: null,
    chosenImmediateCoverageGain: null,
    coverageGateCertified: false,
    coverageGateStatus: "NO_SELECTION",
    chosenReplayCoverageEligible: null,
    varietyOptimal: false,
    balanceCertified: false,
    debug: {
      ...result.debug,
      fairnessCertified: false,
      scheduleCertified: false,
      starvationCertified: false,
      balanceCertified: false,
      replayCertified: false,
      replayEnvelopeStatus: "NO_SELECTION",
      bestImmediateReplayCount: null,
      allowedImmediateReplayCount: null,
      bestMinimumReplayCoverageGain: null,
      coverageGateCertified: false,
      coverageGateUpperBoundCertified: false,
      coverageGateStatus: "NO_SELECTION",
      chosenReplayCoverageEligible: null,
      varietyOptimal: false,
      fairnessVector: undefined,
      schedulingRank: undefined,
      chosenQuartets: [],
      chosenMaxBalanceGap: null,
      chosenTotalBalanceGap: null,
      chosenMaxPointDiffGap: null,
      chosenTotalPointDiffGap: null,
      chosenImmediateReplayCount: null,
      chosenImmediateCoverageGain: null,
      selectedOverduePlayerCount: null,
      leftOutOverduePlayerCount: null,
      searchLimitReached: !exhaustiveNoSelection,
      failureReason: exhaustiveNoSelection ? result.debug.failureReason : "SEARCH_LIMIT_REACHED",
    },
  };
}

function buildNoSelectionFallback<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T>,
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  const ids = players.filter((player) => !player.isPaused && !player.isBusy).map((player) => player.userId);
  const debug = {
    eligiblePlayerIds: ids,
    availableCandidateCount: ids.length,
    consideredCandidateCount: ids.length,
    candidateCap: null,
    lowestBand: null,
    includedBandValues: [],
    widened: false,
    lockedPlayerIds: [...(options.lockedPlayerIds ?? [])],
    tieZonePlayerIds: [],
    candidatePlayerIds: ids,
    quartetCount: 0,
    validQuartetCount: 0,
    exploredBranches: 0,
    prunedBranches: 0,
    searchAttemptCount: 0,
    searchLimitReached: true,
    failureReason: "SEARCH_LIMIT_REACHED" as const,
    chosenQuartets: [],
    chosenMaxBalanceGap: null,
    chosenTotalBalanceGap: null,
    chosenMaxPointDiffGap: null,
    chosenTotalPointDiffGap: null,
    chosenTotalPartnerRepeatPenalty: null,
    chosenTotalOpponentRepeatPenalty: null,
    chosenTotalExactRematchPenalty: null,
    chosenZeroRestPlayerCount: null,
    chosenAscendingRestTurns: null,
    bestImmediateReplayCount: null,
    allowedImmediateReplayCount: null,
    chosenImmediateReplayCount: null,
    replayCertified: false,
    replayEnvelopeStatus: "NO_SELECTION" as const,
    bestMinimumReplayCoverageGain: null,
    chosenImmediateCoverageGain: null,
    coverageGateCertified: false,
    coverageGateStatus: "NO_SELECTION" as const,
    chosenReplayCoverageEligible: null,
    coverageGainMetric: "legacy-four-facet" as const,
    fairnessCertified: false,
    scheduleCertified: false,
    starvationCertified: false,
    balanceCertified: false,
    balanceGuardrail: undefined,
    fairnessVector: undefined,
    schedulingRank: undefined,
    varietyOptimal: false,
    socialIdealRestGap: 0,
    availableOverduePlayerCount: 0,
    selectedOverduePlayerCount: null,
    leftOutOverduePlayerCount: null,
    highestLeftOutRestTurns: null,
    totalLeftOutRestTurns: null,
  };
  return {
    selection: null,
    scheduleIndex: null,
    scheduleCertified: false,
    fairnessCertified: false,
    starvationCertified: false,
    bestImmediateReplayCount: null,
    allowedImmediateReplayCount: null,
    chosenImmediateReplayCount: null,
    replayCertified: false,
    replayEnvelopeStatus: "NO_SELECTION",
    bestMinimumReplayCoverageGain: null,
    chosenImmediateCoverageGain: null,
    coverageGateCertified: false,
    coverageGateStatus: "NO_SELECTION",
    chosenReplayCoverageEligible: null,
    coverageGainMetric: "legacy-four-facet",
    varietyOptimal: false,
    balanceCertified: false,
    debug,
  } as SocialBatchResult<ActiveMatchmakerV3Player<T>>;
}

/**
 * Accept only a fully certified recurrence candidate; otherwise verify the
 * unchanged production selector before returning a fallback.
 */
export function runBalancedCandidateWithProductionFallback<T extends MatchmakerV3Player>({
  candidatePlayers,
  productionPlayers = candidatePlayers,
  options,
  candidateOptions,
  requestedPolicy,
}: {
  candidatePlayers: T[];
  productionPlayers?: T[];
  options: RotationBatchOptions<T>;
  candidateOptions?: BalancedRecurrenceOptions<T>;
  requestedPolicy?: BalancedRecurrencePolicy;
}): BalancedCandidateRun<T> {
  const wrapperStartedAt = Date.now();
  const requested = resolveBalancedCandidatePolicy(options.sessionType, requestedPolicy);
  if (!requested) {
    let productionResult: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null = null;
    const sourceRandom = options.randomFn ?? Math.random;
    let directDrawCount = 0;
    const directRandom = () => {
      directDrawCount += 1;
      return sourceRandom();
    };
    const fallbackStartedAt = Date.now();
    try {
      productionResult = findBestRotationBatchSelection(productionPlayers, { ...options, randomFn: directRandom });
    } catch {
      productionResult = null;
    }
    const fallbackElapsed = Date.now() - fallbackStartedAt;
    const hasProductionSelection = Boolean(productionResult?.selection);
    const decision: BalancedCandidateDecision = {
      version: 1,
      requestedPolicy: "none",
      appliedPolicy: hasProductionSelection ? "production" : "none",
      outcome: hasProductionSelection ? "production-fallback" : "no-certified-selection",
      reasonCodes: ["POLICY_NOT_REQUESTED"],
      candidateProof: getCandidateProof<T>(null),
      candidateSearch: { exploredBranches: null, prunedBranches: null, searchLimitReached: null, elapsedMs: 0, randomDrawCount: 0 },
      fallbackSearch: createDiagnostics(productionResult, fallbackElapsed, directDrawCount),
      wrapperElapsedMs: Date.now() - wrapperStartedAt,
    };
    const result = productionResult ?? buildNoSelectionFallback(productionPlayers, options);
    return { result, decision, elapsedMs: decision.wrapperElapsedMs };
  }

  const requestedOptions = candidateOptions ?? ({
    ...options,
    recurrencePolicy: RECURRENCE_POLICY,
  } as BalancedRecurrenceOptions<T>);
  const effectiveCandidateOptions: BalancedRecurrenceOptions<T> = {
    ...requestedOptions,
    sessionType: options.sessionType as SessionType.POINTS | SessionType.ELO,
    sessionMode: options.sessionMode,
    courtCount: options.courtCount,
    recurrencePolicy: RECURRENCE_POLICY,
  };
  const sourceRandom = options.randomFn ?? Math.random;
  const recordedDraws: number[] = [];
  const candidateRandom = () => {
    const value = sourceRandom();
    recordedDraws.push(value);
    return value;
  };
  let candidateResult: BalancedCandidateResult<T> | null = null;
  let candidateThrew = false;
  const candidateStartedAt = Date.now();
  try {
    candidateResult = findBestBalancedRecurrenceSelection(candidatePlayers, {
      ...effectiveCandidateOptions,
      socialPriorityPolicy: undefined,
      coverageGainMetric: undefined,
      balanceGuardrailPolicy: undefined,
      recurrencePolicy: RECURRENCE_POLICY,
      randomFn: candidateRandom,
    } as BalancedRecurrenceOptions<T>) as BalancedCandidateResult<T>;
  } catch {
    candidateThrew = true;
  }
  const candidateElapsed = Date.now() - candidateStartedAt;
  const candidateReasons = candidateThrew
    ? [
        "CANDIDATE_MATCHER_ERROR",
        ...(effectiveCandidateOptions.respectPlayerRest === false ? ["REPLAY_GATES_DISABLED"] : []),
      ]
    : verifyBalancedCandidateAcceptance(candidatePlayers, effectiveCandidateOptions, options, candidateResult);
  const candidateDiagnostics = createDiagnostics(candidateResult, candidateElapsed, recordedDraws.length);
  if (!candidateThrew && candidateReasons.length === 0 && candidateResult) {
    const decision: BalancedCandidateDecision = {
      version: 1,
      requestedPolicy: RECURRENCE_POLICY,
      appliedPolicy: RECURRENCE_POLICY,
      outcome: "candidate-exact",
      reasonCodes: [],
      candidateProof: getCandidateProof(candidateResult, true),
      candidateSearch: candidateDiagnostics,
      wrapperElapsedMs: Date.now() - wrapperStartedAt,
    };
    return { result: candidateResult, decision, elapsedMs: decision.wrapperElapsedMs };
  }

  let replayIndex = 0;
  let fallbackDrawCount = 0;
  const fallbackRandom = () => {
    const value = replayIndex < recordedDraws.length ? recordedDraws[replayIndex] : sourceRandom();
    replayIndex += 1;
    fallbackDrawCount += 1;
    return value;
  };
  let productionResult: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null = null;
  const fallbackStartedAt = Date.now();
  try {
    productionResult = findBestRotationBatchSelection(productionPlayers, {
      ...options,
      socialPriorityPolicy: undefined,
      randomFn: fallbackRandom,
    });
  } catch {
    productionResult = null;
  }
  const fallbackElapsed = Date.now() - fallbackStartedAt;
  const fallback = verifyBalancedProductionFallback(productionPlayers, options, productionResult);
  const fallbackDiagnostics = createDiagnostics(productionResult, fallbackElapsed, fallbackDrawCount);
  const decision: BalancedCandidateDecision = {
    version: 1,
    requestedPolicy: RECURRENCE_POLICY,
    appliedPolicy: fallback.proof.certified ? "production" : "none",
    outcome: fallback.proof.certified ? "production-fallback" : "no-certified-selection",
    reasonCodes: [...new Set([...candidateReasons, ...fallback.reasons])],
    candidateProof: getCandidateProof(candidateResult),
    fallbackProof: fallback.proof,
    candidateSearch: candidateDiagnostics,
    fallbackSearch: fallbackDiagnostics,
    wrapperElapsedMs: Date.now() - wrapperStartedAt,
  };
  const result = productionResult
    ? fallback.proof.certified ? productionResult : buildSafeNoSelection(productionResult)
    : buildNoSelectionFallback(productionPlayers, options);
  return { result, decision, elapsedMs: decision.wrapperElapsedMs };
}

/** Merge Balanced metadata without changing Social's existing decision field. */
export function withBalancedCandidateDecision<T extends object>(
  selection: T,
  decision: BalancedCandidateDecision | undefined,
): T & { balancedPolicyDecision?: BalancedCandidateDecision; matchmakingReasonJson?: string | null } {
  if (!decision) return selection as T & { balancedPolicyDecision?: BalancedCandidateDecision; matchmakingReasonJson?: string | null };
  const reasonJson = (selection as T & { matchmakingReasonJson?: string | null }).matchmakingReasonJson;
  let matchmakingReasonJson: string;
  try {
    const parsed: unknown = reasonJson ? JSON.parse(reasonJson) : {};
    matchmakingReasonJson = isRecord(parsed)
      ? JSON.stringify({ ...parsed, balancedPolicyDecision: decision })
      : JSON.stringify({ balancedPolicyDecision: decision, originalReasonJson: reasonJson ?? null });
  } catch {
    matchmakingReasonJson = JSON.stringify({ balancedPolicyDecision: decision, originalReasonJson: reasonJson ?? null });
  }
  return { ...selection, balancedPolicyDecision: decision, matchmakingReasonJson };
}
