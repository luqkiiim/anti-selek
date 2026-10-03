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
  buildRestSummary, compareSocialNumberVectors, getSocialFairnessVector, getSocialRestVector,
  getSocialIdealRestGap, getSocialStarvationSummary, getSocialStarvationVector,
  SOCIAL_STARVATION_METRIC_COUNT,
  getBatchPairingRandomScore, getBatchSidePairingKeys, getBatchSidePairingRandomScores,
  getPartitionPairingRandomScore, getQuartetRandomScore,
  getRotationVarietyScore,
} from "./scoring";
import {
  buildSocialVarietyContext, getSocialVarietyGains, getSocialVarietySnapshot, sumSocialVarietyGains,
} from "./socialVariety";
import type { SocialVarietyContext } from "./socialVariety";
import type {
  ActiveMatchmakerV3Player, MatchmakerV3Player, SocialHistoryMatch,
  V3BatchPairingRandomMode, V3BatchPairingRandomSalts, V3BatchResult, V3BatchSelection,
  V3CandidatePool, V3CompletedMatch, V3SelectionConstraints, V3SingleCourtSelection,
  V3SocialStarvationSummary,
  V3BalanceGuardrail, V3FinalTieBreak,
} from "./types";

export { compareSocialBatchSelections, compareSocialFairnessPlayers } from "./scoring";

function canonicalSum(values: number[]) {
  return values.sort((a, b) => a - b).reduce((total, value) => total + value, 0);
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
  pairingRandomMode?: V3BatchPairingRandomMode;
  searchLimits?: { maxBranches?: number; maxMs?: number };
  excludedQuartetKeys?: ReadonlySet<string>;
  excludedPartitionKey?: string;
}

export interface RotationBatchOptions<T extends MatchmakerV3Player> extends SocialBatchOptions<T> {
  sessionType: SessionType;
  balanceGuardrailPolicy?: Partial<Pick<BalanceGuardrailPolicy, "nearBestWindow" | "absoluteCeiling">>;
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
  varietyOptimal: boolean;
  balanceCertified?: boolean;
};

export function summarizeSocialBatch<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  salts: V3BatchPairingRandomSalts = { combined: 0, sides: [0, 0] }
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
    totalSocialVarietyGain: canonicalSum(selections.map((selection) => selection.socialVarietyGain ?? 0)),
    totalSocialVarietyGains: {
      courtmates: sum((selection) => selection.socialVarietyGains?.courtmates ?? 0),
      partners: sum((selection) => selection.socialVarietyGains?.partners ?? 0),
      opponents: sum((selection) => selection.socialVarietyGains?.opponents ?? 0),
      matchType: sum((selection) => selection.socialVarietyGains?.matchType ?? 0),
    },
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
};

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

/** Shared rotation, starvation, cadence and entropy search; Balanced adds admissibility. */
export function findBestRotationBatchSelection<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  return findBestRotationBatchSelectionInternal(players, options);
}

function findBestRotationBatchSelectionInternal<T extends MatchmakerV3Player>(
  players: T[], options: RotationBatchOptions<T>, ignoreStarvationForDiagnostic = false
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
  const balancePolicy = getBalanceGuardrailPolicy(options.sessionType, options.balanceGuardrailPolicy);
  const respectRest = options.respectPlayerRest !== false;
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
  const varietyMetricIndex = SOCIAL_STARVATION_METRIC_COUNT + (respectRest ? required + 1 : 0);
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
  const context = options.socialVarietyContext ?? buildSocialVarietyContext(players, options.socialHistoryMatches ?? history, {
    sessionMode: options.sessionMode,
    opportunityConstraints: profiles.flatMap((profile) => profile.courts.filter((court): court is V3SelectionConstraints<ActiveMatchmakerV3Player<T>> => Boolean(court))),
  });
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
  let scheduleIndex: number | null = null;
  let bestRank = Infinity;
  let balanceGuardrail: V3BalanceGuardrail | undefined;
  let balanceCertified = !balancePolicy;
  let baselinePhase = Boolean(balancePolicy);
  let baselineProven = false;
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
  const fairnessCache = new Map<bigint, number[]>();
  const starvationCache = new Map<bigint, number[]>();
  const restCache = new Map<bigint, number[]>();
  const getFairness = (mask: bigint) => {
    let vector = fairnessCache.get(mask);
    if (!vector) {
      vector = getSocialFairnessVector(active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)));
      fairnessCache.set(mask, vector);
    }
    return vector;
  };
  const getRest = (mask: bigint) => {
    let vector = restCache.get(mask);
    if (!vector) {
      vector = getSocialRestVector(active.filter((player) => (mask & bits.get(player.userId)!) !== BigInt(0)));
      restCache.set(mask, vector);
    }
    return vector;
  };
  const getOptimisticRestVector = (selectedMask: bigint, remainingSlots: number) => {
    const selected = active.filter((player) => (selectedMask & bits.get(player.userId)!) !== BigInt(0));
    // Relax court legality, mandatory-player constraints and overlap between
    // remaining courts. This is the most optimistic cadence any completion
    // could achieve from the current partial batch.
    const optimisticRest = active
      .filter((player) => (selectedMask & bits.get(player.userId)!) === BigInt(0))
      .sort((left, right) => right.restTurns - left.restTurns)
      .slice(0, remainingSlots);
    return getSocialRestVector([...selected, ...optimisticRest]);
  };
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
    if ((maxBranches !== Infinity && phaseExplored >= maxBranches) || (deadline !== Infinity && Date.now() >= deadline)) {
      interrupted = true;
      return true;
    }
    return false;
  };
  const candidatesFor = (constraints: V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined) => {
    const cached = candidateCache.get(constraints);
    if (cached) return cached;
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
              const gains = balancePolicy ? undefined : getSocialVarietyGains(partition, context);
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
                socialVariety: getSocialVarietySnapshot(partition, context),
                ...getConsecutivePlayMetrics(ids, consecutive),
                randomScore: getQuartetRandomScore(quartet),
                pairingRandomScore: getPartitionPairingRandomScore(partition, salts.combined),
              };
              candidates.push({ selection, mask, varietyScored: Boolean(gains) });
              validPartitions++;
            }
          }
          if (interrupted) break;
        }
        if (interrupted) break;
      }
      if (interrupted) break;
    }
    candidates.sort((left, right) => compareSocialNumberVectors(getFairness(left.mask), getFairness(right.mask)) ||
      compareSocialNumberVectors(getStarvation(left.mask), getStarvation(right.mask)) ||
      (respectRest ? compareSocialNumberVectors(getRest(left.mask), getRest(right.mask)) : 0) ||
      (right.selection.socialVarietyGain ?? 0) - (left.selection.socialVarietyGain ?? 0));
    candidateCache.set(constraints, candidates);
    return candidates;
  };
  const scoreVariety = (candidate: Candidate<ActiveMatchmakerV3Player<T>>) => {
    if (candidate.varietyScored) return;
    const gains = getSocialVarietyGains(candidate.selection.partition, context);
    candidate.selection = { ...candidate.selection, socialVarietyGain: sumSocialVarietyGains(gains), socialVarietyGains: gains };
    candidate.varietyScored = true;
  };
  const metricsFor = (selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[], selectedMask: bigint) => [
    ...getStarvation(selectedMask),
    ...(respectRest ? getRest(selectedMask) : []),
    -canonicalSum(selections.map((selection) => selection.socialVarietyGain ?? 0)),
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
  let layoutTies: V3BatchSelection<ActiveMatchmakerV3Player<T>>[] = [];
  const layoutScheduleIndexes = new WeakMap<V3BatchSelection<ActiveMatchmakerV3Player<T>>, number>();
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
  const consider = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if (baselinePhase) { considerBaseline(chosen, mask, index); return; }
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
    const fairnessDiff = bestFairness ? compareSocialNumberVectors(fairness, bestFairness) : -1;
    if (fairnessDiff > 0) return;
    if (fairnessDiff === 0 && rank > bestRank) return;
    const selections = chosen.map((candidate) => candidate.selection);
    const rawGain = chosen.length === 2
      ? (chosen[0].selection.socialVarietyGain ?? 0) + (chosen[1].selection.socialVarietyGain ?? 0)
      : canonicalSum(chosen.map((candidate) => candidate.selection.socialVarietyGain ?? 0));
    // Quantization defines transitive effective ties, never a pairwise tolerance.
    const gain = getRotationVarietyScore(rawGain, options.sessionType);
    if (fairnessDiff === 0 && rank === bestRank && bestMetrics) {
      const starvationDiff = compareSocialNumberVectors(
        starvation,
        bestMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT)
      );
      if (starvationDiff > 0) return;
      if (starvationDiff === 0) {
        const cadenceDiff = respectRest
          ? compareSocialNumberVectors(
              getRest(mask),
              bestMetrics.slice(SOCIAL_STARVATION_METRIC_COUNT, varietyMetricIndex)
            )
          : 0;
        if (cadenceDiff > 0 || (cadenceDiff === 0 && -gain > bestMetrics[varietyMetricIndex])) return;
      }
    }
    const metrics = selections.length === 2
      ? [
          ...starvation,
          ...(respectRest ? getRest(mask) : []),
          -gain,
          Math.max(selections[0].balanceGap, selections[1].balanceGap), selections[0].balanceGap + selections[1].balanceGap,
          balancePolicy?.mode === "RATING" ? 0 : Math.max(selections[0].pointDiffGap, selections[1].pointDiffGap),
          balancePolicy?.mode === "RATING" ? 0 : selections[0].pointDiffGap + selections[1].pointDiffGap,
          selections[0].partnerRepeatPenalty + selections[1].partnerRepeatPenalty,
          selections[0].opponentRepeatPenalty + selections[1].opponentRepeatPenalty,
          selections[0].exactRematchPenalty + selections[1].exactRematchPenalty,
          selections[0].randomScore + selections[1].randomScore,
        ]
      : metricsFor(selections, mask);
    if (balancePolicy) metrics[varietyMetricIndex] = -gain;
    recordLateTieFrontier(selections, metrics, index);
    const diff = fairnessDiff || rank - bestRank || (bestMetrics ? compareSocialNumberVectors(metrics, bestMetrics) : -1);
    if (diff > 0) return;
    if (diff === 0 && best && options.pairingRandomMode !== "side-balanced" &&
      getBatchPairingRandomScore(selections, salts.combined) >= best.totalPairingRandomScore) {
      return;
    }
    if (diff === 0 && best && options.pairingRandomMode === "side-balanced" &&
      salts.sides[0] === 0 && salts.sides[1] === 0 && salts.combined === 0) {
      return;
    }
    const summary = { ...summarizeSocialBatch(selections, salts),
      ...(balancePolicy ? { totalBalanceGap: canonicalSum(selections.map((selection) => selection.balanceGap)) } : {}),
    };
    layoutScheduleIndexes.set(summary, index);
    if (diff < 0) {
      best = summary; bestFairness = fairness; bestMetrics = metrics; bestRank = rank; scheduleIndex = index;
      layoutTies = options.pairingRandomMode === "side-balanced" ? [summary] : [];
    } else if (options.pairingRandomMode === "side-balanced") {
      layoutTies.push(summary);
    } else if (!best || summary.totalPairingRandomScore < best.totalPairingRandomScore) {
      best = summary; scheduleIndex = index;
    }
  };
  const runSearch = () => {
   if (required > 0 && active.length >= required && locksFeasible) {
    for (const index of scheduleIndexes) {
      if (profiles[index].courts.length !== options.courtCount) continue;
      if (balancePolicy && !baselinePhase && baseline && profiles[index].rank !== baseline.rank) continue;
      const lists = profiles[index].courts.map((constraints) => {
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
        // Every entropy candidate inside the fixed envelope remains visible.
        if (!balanceGuardrail) return candidates;
        const eligible = candidates.filter((candidate) => candidate.selection.balanceGap <= balanceGuardrail!.allowedMaxBalanceGap);
        for (const candidate of eligible) {
          if (deadline !== Infinity && Date.now() >= deadline) { interrupted = true; break; }
          scoreVariety(candidate);
        }
        return eligible.sort((left, right) => compareSocialNumberVectors(getFairness(left.mask), getFairness(right.mask)) ||
          compareSocialNumberVectors(getStarvation(left.mask), getStarvation(right.mask)) ||
          (respectRest ? compareSocialNumberVectors(getRest(left.mask), getRest(right.mask)) : 0) ||
          (right.selection.socialVarietyGain ?? 0) - (left.selection.socialVarietyGain ?? 0));
      });
      if (interrupted) break;
      const visit = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], used: bigint, remaining: number[]) => {
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
        const incumbentFairness = baselinePhase ? baseline?.fairness : bestFairness ?? baseline?.fairness;
        if (incumbentFairness && compareSocialNumberVectors(fairnessBound, incumbentFairness) > 0) { pruned++; return; }
        let court = remaining[0];
        let compatible = lists[court].filter((candidate) => (candidate.mask & used) === BigInt(0));
        for (const other of remaining.slice(1)) {
          const options = lists[other].filter((candidate) => (candidate.mask & used) === BigInt(0));
          if (options.length < compatible.length) { court = other; compatible = options; }
        }
        if (!compatible.length) { pruned++; return; }
        // Relax overlaps for an upper bound on achievable variety gain.
        const incumbentRank = baselinePhase ? baseline?.rank : baseline?.rank ?? bestRank;
        const incumbentStarvation = baselinePhase ? baseline?.starvation
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
            } else if (bestMetrics) {
              const restOffset = SOCIAL_STARVATION_METRIC_COUNT;
              const restLength = respectRest ? required + 1 : 0;
              const restBoundDiff = respectRest
                ? compareSocialNumberVectors(
                    getOptimisticRestVector(used, slots),
                    bestMetrics.slice(restOffset, restOffset + restLength)
                  )
                : 0;
              if (restBoundDiff > 0) { pruned++; return; }
              if (restBoundDiff === 0) {
                const gainBound = chosen.reduce((sum, candidate) => sum + (candidate.selection.socialVarietyGain ?? 0), 0) +
                  remaining.reduce((sum, other) => sum + lists[other].reduce((maximum, candidate) =>
                    (candidate.mask & used) === BigInt(0) ? Math.max(maximum, candidate.selection.socialVarietyGain ?? 0) : maximum, -Infinity), 0);
                // Different relaxed addition orders can differ by a few floating-point ulps.
                const incumbentGain = -bestMetrics[varietyMetricIndex];
                const roundoff = Number.EPSILON * (chosen.length + remaining.length + 1) * Math.max(Math.abs(gainBound), Math.abs(incumbentGain)) + (balancePolicy ? 1e-12 : 0);
                if (gainBound + roundoff < incumbentGain) { pruned++; return; }
              }
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
          if (interrupted || (baselinePhase && baselineProven)) break;
        }
      };
      const assignments: Array<Candidate<ActiveMatchmakerV3Player<T>>> = [];
      if (options.courtCount === 1) {
        for (const candidate of lists[0]) {
          if (outOfBudget()) break;
          explored++; phaseExplored++; consider([candidate], candidate.mask, index);
        }
      } else if (options.courtCount === 2) {
        const identical = profiles[index].courts[0] === profiles[index].courts[1];
        for (let a = 0; a < lists[0].length; a++) {
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
          }
          if (interrupted || (baselinePhase && baselineProven)) break;
        }
      } else visit([], BigInt(0), profiles[index].courts.map((_, court) => court));
      if (interrupted || (baselinePhase && baselineProven)) break;
    }
   }
  };
  runSearch();
  let baselineLimitReached = false;
  if (balancePolicy) {
    baselineLimitReached = interrupted;
    // A relative envelope requires a proved baseline, not the best balance
    // encountered before a search timeout.
    const certifiedBaseline = baseline as BalanceBaseline | null;
    balanceCertified = Boolean(certifiedBaseline && (!interrupted || baselineProven));
    if (certifiedBaseline && balanceCertified) {
      balanceGuardrail = buildBalanceGuardrail(balancePolicy, certifiedBaseline);
      interrupted = false;
      phaseExplored = 0;
      deadline = Date.now() + phaseBudgetMs;
      baselinePhase = false;
      certifiedBaseline.chosen.forEach(scoreVariety);
      consider(certifiedBaseline.chosen, certifiedBaseline.mask, certifiedBaseline.index);
      runSearch();
    }
  }
  // A timeout can only return an incumbent with proven count/arrival and starvation priorities.
  const fairnessCertified = balancePolicy ? balanceCertified
    : !interrupted || Boolean(bestFairness && compareSocialNumberVectors(bestFairness, globalFairnessBound) === 0);
  const certifiedMetrics = bestMetrics as number[] | null;
  const starvationCertified = balancePolicy ? balanceCertified : !interrupted || Boolean(
    fairnessCertified && certifiedMetrics &&
    compareSocialNumberVectors(certifiedMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT), globalStarvationBound) === 0
  );
  if (!fairnessCertified || !starvationCertified) { best = null; scheduleIndex = null; }
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
  return {
    selection, scheduleIndex, fairnessCertified, starvationCertified, varietyOptimal: !interrupted && balanceCertified,
    ...(balancePolicy ? { balanceCertified } : {}),
    debug: {
      eligiblePlayerIds: active.map((player) => player.userId), availableCandidateCount: active.length,
      consideredCandidateCount: active.length, candidateCap: null,
      lowestBand: active.length ? Math.min(...active.map((player) => player.effectiveMatchCount)) : null,
      includedBandValues: [...new Set(active.map((player) => player.effectiveMatchCount))].sort((a, b) => a - b),
      widened: false, lockedPlayerIds: [...locked], tieZonePlayerIds: [], candidatePlayerIds: active.map((player) => player.userId),
      quartetCount, validQuartetCount: validPartitions, exploredBranches: explored, prunedBranches: pruned,
      searchAttemptCount: balanceGuardrail ? 2 : 1, searchLimitReached: interrupted || baselineLimitReached,
      failureReason: selection ? null : interrupted || baselineLimitReached ? "SEARCH_LIMIT_REACHED" : active.length < required || required <= 0 ? "INSUFFICIENT_PLAYERS" : !locksFeasible ? "LOCKED_PLAYERS_CANNOT_ALL_FIT" : balancePolicy && options.sessionMode === SessionMode.MIXICANO && validPartitions === 0 ? "NO_VALID_MIXED_QUARTETS" : "NOT_ENOUGH_NON_OVERLAPPING_COURTS",
      chosenQuartets: selection?.selections.map((court) => court.ids) ?? [],
      chosenMaxBalanceGap: selection?.maxBalanceGap ?? null, chosenTotalBalanceGap: selection?.totalBalanceGap ?? null,
      chosenMaxPointDiffGap: selection?.maxPointDiffGap ?? null, chosenTotalPointDiffGap: selection?.totalPointDiffGap ?? null,
      chosenTotalPartnerRepeatPenalty: selection?.totalPartnerRepeatPenalty ?? null,
      chosenTotalOpponentRepeatPenalty: selection?.totalOpponentRepeatPenalty ?? null,
      chosenTotalExactRematchPenalty: selection?.totalExactRematchPenalty ?? null,
      chosenTotalSharedCourtEncounterFrequencyPenalty: selection?.totalSharedCourtEncounterFrequencyPenalty ?? null,
      chosenTotalSocialVarietyGain: selection?.totalSocialVarietyGain ?? null,
      chosenTotalSocialVarietyGains: selection?.totalSocialVarietyGains ?? null,
      chosenZeroRestPlayerCount: selection?.restSummary.restTurnVector.filter((turns) => turns === 0).length ?? null,
      chosenAscendingRestTurns: selection
        ? [...selection.restSummary.restTurnVector].sort((left, right) => left - right)
        : null,
      fairnessCertified, starvationCertified, varietyOptimal: !interrupted && balanceCertified,
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
