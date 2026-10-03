import { SessionMode } from "../../../types/enums";
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

export type SocialBatchResult<T extends ActiveMatchmakerV3Player> = V3BatchResult<T> & {
  scheduleIndex: number | null;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  varietyOptimal: boolean;
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
};

/** Whole-batch set packing. No Social candidate cap, local exemplars or anchor locks. */
export function findBestSocialBatchSelection<T extends MatchmakerV3Player>(
  players: T[], options: SocialBatchOptions<T>
): SocialBatchResult<ActiveMatchmakerV3Player<T>> {
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
  const active = socialCandidatePool?.candidatePlayers ?? availablePlayers;
  const rotationPlayerCount = options.rotationPlayerCount ?? players.filter((player) => !player.isPaused).length;
  const starvationContext = { activePlayerCount: rotationPlayerCount, availablePlayers };
  const idealRestGap = getSocialIdealRestGap(rotationPlayerCount);
  const overdueAvailablePlayers = availablePlayers.filter((player) => player.restTurns > idealRestGap);
  const required = options.courtCount * 4;
  const locked = new Set([
    ...(socialCandidatePool?.lockedPlayers.map((player) => player.userId) ?? []),
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
  const partners = buildPartnerRepeatHistory(history);
  const opponents = buildOpponentRepeatHistory(history);
  const social = buildSocialMixHistory(history);
  const consecutive = buildConsecutivePlayHistory(history);
  const exact = options.courtCount <= 2 && active.length <= 14;
  // Exact small batches ignore default budgets, but explicit budgets still permit testing/cancellation.
  const maxBranches = options.searchLimits?.maxBranches ?? (exact ? Infinity : 50_000);
  const deadline = Date.now() + (options.searchLimits?.maxMs ?? (exact ? Infinity : 2_000));
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
  const candidateCache = new Map<V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined, Candidate<ActiveMatchmakerV3Player<T>>[]>();

  const outOfBudget = () => {
    if ((maxBranches !== Infinity && explored >= maxBranches) || (deadline !== Infinity && Date.now() >= deadline)) {
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
              const gains = getSocialVarietyGains(partition, context);
              const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
                ids, players: quartet, partition,
                restSummary: buildRestSummary(quartet),
                balanceGap: getPartitionBalanceGap(partition, playersById) ?? evaluation.balanceGap,
                pointDiffGap: getPartitionPointDiffGap(partition, playersById) ?? evaluation.pointDiffGap,
                sharedCourtRepeatPenalty: getSharedCourtRepeatPenalty(partition, social),
                sharedCourtEncounterFrequencyPenalty: getSharedCourtEncounterFrequencyPenalty(partition, social),
                partnerCoveragePenalty: getPartnerCoveragePenalty(partition, social),
                opponentCoveragePenalty: getOpponentCoveragePenalty(partition, social),
                partnerRepeatPenalty: getPartnerRepeatPenalty(partition, partners),
                opponentRepeatPenalty: getOpponentRepeatPenalty(partition, opponents),
                exactRematchPenalty: getExactRematchPenalty(partition, rematches),
                socialVarietyGain: sumSocialVarietyGains(gains), socialVarietyGains: gains,
                socialVariety: getSocialVarietySnapshot(partition, context),
                ...getConsecutivePlayMetrics(ids, consecutive),
                randomScore: getQuartetRandomScore(quartet),
                pairingRandomScore: getPartitionPairingRandomScore(partition, salts.combined),
              };
              candidates.push({ selection, mask });
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
      (right.selection.socialVarietyGain ?? 0) - (left.selection.socialVarietyGain ?? 0));
    candidateCache.set(constraints, candidates);
    return candidates;
  };
  const metricsFor = (selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[], selectedMask: bigint) => [
    ...getStarvation(selectedMask),
    -canonicalSum(selections.map((selection) => selection.socialVarietyGain ?? 0)),
    ...(respectRest ? getRest(selectedMask) : []),
    Math.max(...selections.map((selection) => selection.balanceGap)),
    selections.reduce((sum, selection) => sum + selection.balanceGap, 0),
    Math.max(...selections.map((selection) => selection.pointDiffGap)),
    selections.reduce((sum, selection) => sum + selection.pointDiffGap, 0),
    selections.reduce((sum, selection) => sum + selection.partnerRepeatPenalty, 0),
    selections.reduce((sum, selection) => sum + selection.opponentRepeatPenalty, 0),
    selections.reduce((sum, selection) => sum + selection.exactRematchPenalty, 0),
    selections.reduce((sum, selection) => sum + selection.randomScore, 0),
  ];
  let layoutTies: V3BatchSelection<ActiveMatchmakerV3Player<T>>[] = [];
  const layoutScheduleIndexes = new WeakMap<V3BatchSelection<ActiveMatchmakerV3Player<T>>, number>();
  const consider = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], mask: bigint, index: number) => {
    if ((mask & lockedMask) !== lockedMask) return;
    const fairness = getFairness(mask);
    const fairnessDiff = bestFairness ? compareSocialNumberVectors(fairness, bestFairness) : -1;
    if (fairnessDiff > 0) return;
    const rank = profiles[index].rank;
    if (fairnessDiff === 0 && rank > bestRank) return;
    const selections = chosen.map((candidate) => candidate.selection);
    const starvation = getStarvation(mask);
    const gain = chosen.length === 2
      ? (chosen[0].selection.socialVarietyGain ?? 0) + (chosen[1].selection.socialVarietyGain ?? 0)
      : canonicalSum(chosen.map((candidate) => candidate.selection.socialVarietyGain ?? 0));
    if (fairnessDiff === 0 && rank === bestRank && bestMetrics) {
      const starvationDiff = compareSocialNumberVectors(
        starvation,
        bestMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT)
      );
      if (starvationDiff > 0) return;
      const varietyMetricIndex = SOCIAL_STARVATION_METRIC_COUNT;
      if (starvationDiff === 0 && -gain > bestMetrics[varietyMetricIndex]) return;
    }
    const metrics = selections.length === 2
      ? [
          ...starvation,
          -gain,
          ...(respectRest ? getRest(mask) : []),
          Math.max(selections[0].balanceGap, selections[1].balanceGap), selections[0].balanceGap + selections[1].balanceGap,
          Math.max(selections[0].pointDiffGap, selections[1].pointDiffGap), selections[0].pointDiffGap + selections[1].pointDiffGap,
          selections[0].partnerRepeatPenalty + selections[1].partnerRepeatPenalty,
          selections[0].opponentRepeatPenalty + selections[1].opponentRepeatPenalty,
          selections[0].exactRematchPenalty + selections[1].exactRematchPenalty,
          selections[0].randomScore + selections[1].randomScore,
        ]
      : metricsFor(selections, mask);
    const diff = fairnessDiff || rank - bestRank || (bestMetrics ? compareSocialNumberVectors(metrics, bestMetrics) : -1);
    if (diff > 0) return;
    if (diff === 0 && best && options.pairingRandomMode !== "side-balanced" &&
      getBatchPairingRandomScore(selections, salts.combined) >= best.totalPairingRandomScore) return;
    if (diff === 0 && best && options.pairingRandomMode === "side-balanced" &&
      salts.sides[0] === 0 && salts.sides[1] === 0 && salts.combined === 0) return;
    const summary = summarizeSocialBatch(selections, salts);
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
  if (required > 0 && active.length >= required && locksFeasible) {
    for (const index of scheduleIndexes) {
      if (profiles[index].courts.length !== options.courtCount) continue;
      const lists = profiles[index].courts.map(candidatesFor);
      if (interrupted) break;
      const visit = (chosen: Candidate<ActiveMatchmakerV3Player<T>>[], used: bigint, remaining: number[]) => {
        if (outOfBudget()) return;
        explored++;
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
        if (bestFairness && compareSocialNumberVectors(fairnessBound, bestFairness) > 0) { pruned++; return; }
        let court = remaining[0];
        let compatible = lists[court].filter((candidate) => (candidate.mask & used) === BigInt(0));
        for (const other of remaining.slice(1)) {
          const options = lists[other].filter((candidate) => (candidate.mask & used) === BigInt(0));
          if (options.length < compatible.length) { court = other; compatible = options; }
        }
        if (!compatible.length) { pruned++; return; }
        // Relax overlaps for an upper bound on achievable variety gain.
        if (bestFairness && compareSocialNumberVectors(fairnessBound, bestFairness) === 0 && profiles[index].rank === bestRank && bestMetrics) {
          const starvationBound = getStarvationLowerBound(used, slots);
          const starvationDiff = compareSocialNumberVectors(
            starvationBound,
            bestMetrics.slice(0, SOCIAL_STARVATION_METRIC_COUNT)
          );
          if (starvationDiff > 0) { pruned++; return; }
          if (starvationDiff === 0) {
            const gainBound = chosen.reduce((sum, candidate) => sum + (candidate.selection.socialVarietyGain ?? 0), 0) +
              remaining.reduce((sum, other) => sum + lists[other].reduce((maximum, candidate) =>
                (candidate.mask & used) === BigInt(0) ? Math.max(maximum, candidate.selection.socialVarietyGain ?? 0) : maximum, -Infinity), 0);
            // Different relaxed addition orders can differ by a few floating-point ulps.
            const varietyMetricIndex = SOCIAL_STARVATION_METRIC_COUNT;
            const incumbentGain = -bestMetrics[varietyMetricIndex];
            const roundoff = Number.EPSILON * (chosen.length + remaining.length + 1) * Math.max(Math.abs(gainBound), Math.abs(incumbentGain));
            if (gainBound + roundoff < incumbentGain) { pruned++; return; }
          }
        }
        for (const candidate of compatible) {
          const ordered = [...chosen, candidate];
          // Return selections in physical profile order, even when search chooses a different court.
          assignments[court] = candidate;
          if (remaining.length === 1) {
            if (outOfBudget()) break;
            explored++;
            consider(assignments as Candidate<ActiveMatchmakerV3Player<T>>[], used | candidate.mask, index);
          } else visit(ordered, used | candidate.mask, remaining.filter((other) => other !== court));
          if (interrupted) break;
        }
      };
      const assignments: Array<Candidate<ActiveMatchmakerV3Player<T>>> = [];
      if (options.courtCount === 1) {
        for (const candidate of lists[0]) {
          if (outOfBudget()) break;
          explored++; consider([candidate], candidate.mask, index);
        }
      } else if (options.courtCount === 2) {
        const identical = profiles[index].courts[0] === profiles[index].courts[1];
        for (let a = 0; a < lists[0].length; a++) {
          for (let b = identical ? a + 1 : 0; b < lists[1].length; b++) {
            if (outOfBudget()) break;
            explored++;
            const left = lists[0][a], right = lists[1][b];
            if ((left.mask & right.mask) !== BigInt(0)) continue;
            consider([left, right], left.mask | right.mask, index);
          }
          if (interrupted) break;
        }
      } else visit([], BigInt(0), profiles[index].courts.map((_, court) => court));
      if (interrupted) break;
    }
  }
  // A timeout can only return an incumbent with proven count/arrival and starvation priorities.
  const fairnessCertified = !interrupted || Boolean(bestFairness && compareSocialNumberVectors(bestFairness, globalFairnessBound) === 0);
  const certifiedMetrics = bestMetrics as number[] | null;
  const starvationCertified = !interrupted || Boolean(
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
  const bestSelection = best as V3BatchSelection<ActiveMatchmakerV3Player<T>> | null;
  const starvationSummary: V3SocialStarvationSummary | undefined = bestSelection
    ? getSocialStarvationSummary(bestSelection.selections.flatMap((court) => court.players), starvationContext)
    : undefined;
  const selection = bestSelection && starvationSummary
    ? {
        ...bestSelection,
        selections: bestSelection.selections.map((court) => ({ ...court, socialStarvation: starvationSummary })),
      }
    : null;
  return {
    selection, scheduleIndex, fairnessCertified, starvationCertified, varietyOptimal: !interrupted,
    debug: {
      eligiblePlayerIds: active.map((player) => player.userId), availableCandidateCount: active.length,
      consideredCandidateCount: active.length, candidateCap: null,
      lowestBand: active.length ? Math.min(...active.map((player) => player.effectiveMatchCount)) : null,
      includedBandValues: [...new Set(active.map((player) => player.effectiveMatchCount))].sort((a, b) => a - b),
      widened: false, lockedPlayerIds: [...locked], tieZonePlayerIds: [], candidatePlayerIds: active.map((player) => player.userId),
      quartetCount, validQuartetCount: validPartitions, exploredBranches: explored, prunedBranches: pruned,
      searchAttemptCount: 1, searchLimitReached: interrupted,
      failureReason: selection ? null : interrupted ? "SEARCH_LIMIT_REACHED" : active.length < required || required <= 0 ? "INSUFFICIENT_PLAYERS" : !locksFeasible ? "LOCKED_PLAYERS_CANNOT_ALL_FIT" : "NOT_ENOUGH_NON_OVERLAPPING_COURTS",
      chosenQuartets: selection?.selections.map((court) => court.ids) ?? [],
      chosenMaxBalanceGap: selection?.maxBalanceGap ?? null, chosenTotalBalanceGap: selection?.totalBalanceGap ?? null,
      chosenMaxPointDiffGap: selection?.maxPointDiffGap ?? null, chosenTotalPointDiffGap: selection?.totalPointDiffGap ?? null,
      chosenTotalPartnerRepeatPenalty: selection?.totalPartnerRepeatPenalty ?? null,
      chosenTotalOpponentRepeatPenalty: selection?.totalOpponentRepeatPenalty ?? null,
      chosenTotalExactRematchPenalty: selection?.totalExactRematchPenalty ?? null,
      chosenTotalSharedCourtEncounterFrequencyPenalty: selection?.totalSharedCourtEncounterFrequencyPenalty ?? null,
      chosenTotalSocialVarietyGain: selection?.totalSocialVarietyGain ?? null,
      chosenTotalSocialVarietyGains: selection?.totalSocialVarietyGains ?? null,
      fairnessCertified, starvationCertified, varietyOptimal: !interrupted,
      socialIdealRestGap: idealRestGap,
      availableOverduePlayerCount: starvationSummary?.availableOverdueCount ?? overdueAvailablePlayers.length,
      selectedOverduePlayerCount: starvationSummary?.selectedOverdueCount ?? null,
      leftOutOverduePlayerCount: starvationSummary?.leftOutOverdueCount ?? null,
      highestLeftOutRestTurns: starvationSummary?.highestLeftOutRestTurns ?? null,
      totalLeftOutRestTurns: starvationSummary?.totalLeftOutRestTurns ?? null,
    },
  };
}
