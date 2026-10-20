import { SessionBalanceMetric, SessionMode } from "@/types/enums";
import { getArrivalPriorityTime } from "../arrivalPriority";
import { buildBalanceGuardrail, isBalanceGuardrailAdmissible } from "../v3/balanceGuardrail";
import { getExactPartitionKey } from "../v3/rematch";
import { getSocialStarvationVector } from "../v3/scoring";
import type { MatchmakingSearchBudget } from "../v3/searchBudget";
import { evaluateBalancedPartitions } from "./balance";
import { buildActivePlayers } from "./fairness";
import {
  buildLevelGrouping, compareLevelVectors, getLevelBalancePolicy, getLevelQualityVector,
  type LevelPolicy, type LevelSelectionContext,
} from "./levelPolicy";
import { buildRestSummary, getQuartetRandomScore } from "./scoring";
import type {
  ActiveMatchmakerLadderPlayer, LadderBatchDebug, LadderBatchResult, LadderBatchSelection,
  LadderSelectionConstraints, LadderSingleCourtSelection, MatchmakerLadderPlayer,
} from "./types";

export interface LevelSchedule<T extends ActiveMatchmakerLadderPlayer> {
  rank: number;
  courts: LadderSelectionConstraints<T>[];
}

export interface LevelSelectionOptions<T extends MatchmakerLadderPlayer> {
  courtCount: number;
  sessionMode: SessionMode;
  levelPolicy: LevelPolicy;
  respectPlayerRest?: boolean;
  randomFn?: () => number;
  schedules?: LevelSchedule<ActiveMatchmakerLadderPlayer<T>>[];
  selectionConstraints?: LadderSelectionConstraints<ActiveMatchmakerLadderPlayer<T>>;
  lockedPlayerIds?: ReadonlySet<string>;
  excludedQuartetKeys?: ReadonlySet<string>;
  excludedPartitionKey?: string;
  /** Reuse the original baseline when a host explicitly asks for an alternative. */
  selectionContext?: LevelSelectionContext;
  searchLimits?: { maxBranches?: number; maxMs?: number };
  searchBudget?: MatchmakingSearchBudget;
}

export interface LevelBatchResult<T extends ActiveMatchmakerLadderPlayer> extends LadderBatchResult<T> {
  scheduleIndex: number | null;
}

function summarize<T extends ActiveMatchmakerLadderPlayer>(
  selections: LadderSingleCourtSelection<T>[]
): LadderBatchSelection<T> {
  return {
    selections,
    restSummary: buildRestSummary(selections.flatMap((selection) => selection.players)),
    maxLadderGap: Math.max(0, ...selections.map((selection) => selection.groupingSummary.maxLadderGap)),
    totalLadderGap: selections.reduce((sum, selection) => sum + selection.groupingSummary.totalLadderGap, 0),
    totalPointDiffGap: 0,
    maxBalanceGap: Math.max(0, ...selections.map((selection) => selection.balanceGap)),
    totalBalanceGap: selections.reduce((sum, selection) => sum + selection.balanceGap, 0),
    maxPointDiffBalanceGap: Math.max(0, ...selections.map((selection) => selection.pointDiffGap)),
    totalPointDiffBalanceGap: selections.reduce((sum, selection) => sum + selection.pointDiffGap, 0),
    maxStrengthGap: Math.max(0, ...selections.map((selection) => selection.strengthGap)),
    totalStrengthGap: selections.reduce((sum, selection) => sum + selection.strengthGap, 0),
    totalRandomScore: selections.reduce((sum, selection) => sum + selection.randomScore, 0),
  };
}

/** No match-history or variety input is read by this selector. */
export function findBestLevelBatchSelection<T extends MatchmakerLadderPlayer>(
  players: T[], options: LevelSelectionOptions<T>
): LevelBatchResult<ActiveMatchmakerLadderPlayer<T>> {
  type Player = ActiveMatchmakerLadderPlayer<T>;
  type Selection = LadderSingleCourtSelection<Player>;
  const respectRest = options.respectPlayerRest !== false;
  const requiredCount = options.courtCount * 4;
  const active = buildActivePlayers(players, { randomFn: options.randomFn, respectPlayerRest: false });
  const available = [...active].sort((a, b) => a.userId.localeCompare(b.userId));
  const byId = new Map(available.map((player) => [player.userId, player]));
  const required = options.lockedPlayerIds ?? new Set<string>();
  const context = options.selectionContext;
  const startedAt = performance.now();
  const maxMs = options.searchLimits?.maxMs ?? 1_500;
  const maxBranches = options.searchLimits?.maxBranches ?? 200_000;
  let branches = 0;
  let pruned = 0;
  let limitReached = false;
  const expired = () => {
    if (branches >= maxBranches || performance.now() - startedAt >= maxMs || options.searchBudget?.isExpired()) {
      limitReached = true;
    }
    return limitReached;
  };
  const debug: LadderBatchDebug = {
    eligiblePlayerIds: available.map((player) => player.userId),
    lowestBand: active[0]?.effectiveMatchCount ?? null,
    includedBandValues: [...new Set(active.map((player) => player.effectiveMatchCount))],
    widened: false, lockedPlayerIds: [...required], tieZonePlayerIds: [],
    candidatePlayerIds: available.map((player) => player.userId),
    quartetCount: 0, validQuartetCount: 0, exploredBranches: 0, prunedBranches: 0,
    chosenQuartets: [], chosenMaxLadderGap: null, chosenTotalLadderGap: null,
    chosenTotalPointDiffGap: null, chosenMaxBalanceGap: null, chosenTotalBalanceGap: null,
    chosenMaxPointDiffBalanceGap: null, chosenTotalPointDiffBalanceGap: null,
    chosenMaxStrengthGap: null, chosenTotalStrengthGap: null,
    searchLimitReached: false, baselineCertified: false,
  };
  const empty = (): LevelBatchResult<Player> => ({ selection: null, scheduleIndex: null, debug });
  if (requiredCount <= 0 || available.length < requiredCount || required.size > requiredCount ||
    [...required].some((id) => !byId.has(id)) || active.some((player) => !Number.isFinite(player.strength))) return empty();

  const starvationContext = {
    activePlayerCount: players.filter((player) => !player.isPaused).length,
    availablePlayers: available,
  };
  const arrivalVector = (selected: readonly Player[]) => {
    const times = selected.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null).sort((a, b) => a - b);
    return [-times.length, ...times, ...Array(requiredCount - times.length).fill(0)];
  };
  const strongerVector = (selected: readonly Player[], rank: number) => [
    ...selected.map((player) => player.effectiveMatchCount).sort((a, b) => a - b),
    ...arrivalVector(selected), rank,
    ...getSocialStarvationVector(selected, starvationContext),
  ];
  const optimisticStrongerVector = (selected: readonly Player[], remaining: readonly Player[], rank: number) => {
    const slots = requiredCount - selected.length;
    const counts = [...selected.map((player) => player.effectiveMatchCount),
      ...remaining.map((player) => player.effectiveMatchCount).sort((a, b) => a - b).slice(0, slots)].sort((a, b) => a - b);
    const selectedTimes = selected.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null);
    const extraTimes = remaining.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null).sort((a, b) => a - b).slice(0, slots);
    const times = [...selectedTimes, ...extraTimes].sort((a, b) => a - b);
    const bestRestSelection = [...selected, ...[...remaining].sort((a, b) => b.restTurns - a.restTurns).slice(0, slots)];
    return [...counts, -times.length, ...times, ...Array(requiredCount - times.length).fill(0), rank,
      ...getSocialStarvationVector(bestRestSelection, starvationContext)];
  };

  const unconstrained: LadderSelectionConstraints<Player> = options.selectionConstraints ?? {};
  const schedules = options.schedules ?? [{ rank: 0, courts: Array.from({ length: options.courtCount }, () => unconstrained) }];
  const quartets: Array<[Player, Player, Player, Player]> = [];
  for (let a = 0; a < available.length - 3; a++) {
    for (let b = a + 1; b < available.length - 2; b++) {
      for (let c = b + 1; c < available.length - 1; c++) {
        for (let d = c + 1; d < available.length; d++) {
          if ((quartets.length & 255) === 0 && expired()) break;
          quartets.push([available[a], available[b], available[c], available[d]]);
        }
        if (limitReached) break;
      }
      if (limitReached) break;
    }
    if (limitReached) break;
  }
  debug.quartetCount = quartets.length;
  const cache = new Map<LadderSelectionConstraints<Player>, Selection[]>();
  const candidatesFor = (constraints: LadderSelectionConstraints<Player>) => {
    const cached = cache.get(constraints);
    if (cached) return cached;
    const candidates: Selection[] = [];
    for (const quartet of quartets) {
      if ((candidates.length & 127) === 0 && expired()) break;
      if (constraints.isQuartetAllowed && !constraints.isQuartetAllowed(quartet)) continue;
      const ids = quartet.map((player) => player.userId) as [string, string, string, string];
      if (options.excludedQuartetKeys?.has([...ids].sort().join("|"))) continue;
      let best: Selection | null = null;
      for (const evaluation of evaluateBalancedPartitions(ids, byId, options.sessionMode)) {
        const partition = constraints.normalizePartition
          ? constraints.normalizePartition({ partition: evaluation.partition, players: quartet, playersById: byId })
          : evaluation.partition;
        if (!partition || getExactPartitionKey(partition) === options.excludedPartitionKey) continue;
        const team1 = partition.team1.map((id) => byId.get(id)!);
        const team2 = partition.team2.map((id) => byId.get(id)!);
        const gap = Math.abs((team1[0].strength + team1[1].strength - team2[0].strength - team2[1].strength) / 2);
        const pointDiffGap = options.levelPolicy.metric === SessionBalanceMetric.SESSION_POINTS
          ? Math.abs((team1[0].pointDiff + team1[1].pointDiff - team2[0].pointDiff - team2[1].pointDiff) / 2) : 0;
        const selection: Selection = {
          ids, players: quartet, partition, groupingSummary: buildLevelGrouping(quartet),
          restSummary: buildRestSummary(quartet), balanceGap: gap, strengthGap: gap, pointDiffGap,
          randomScore: getQuartetRandomScore(quartet),
        };
        if (!best || compareLevelVectors([gap, pointDiffGap], [best.balanceGap, best.pointDiffGap]) < 0) best = selection;
      }
      if (best) candidates.push(best);
    }
    cache.set(constraints, candidates);
    return candidates;
  };
  const prepared = schedules.map((schedule, index) => ({
    ...schedule, index, candidates: schedule.courts.map(candidatesFor),
  })).filter((schedule) => schedule.courts.length === options.courtCount && schedule.candidates.every((candidates) => candidates.length));
  debug.validQuartetCount = [...cache.values()].reduce((sum, candidates) => sum + candidates.length, 0);
  if (limitReached) {
    debug.searchLimitReached = true;
    return empty();
  }

  let bestStronger = context?.strongerPriorityVector ?? null;
  let baseline: { maxBalanceGap: number; totalBalanceGap: number } | null = context ? {
    maxBalanceGap: context.balanceGuardrail.bestMaxBalanceGap,
    totalBalanceGap: context.balanceGuardrail.bestTotalBalanceGap,
  } : null;
  let best: LadderBatchSelection<Player> | null = null;
  let bestSchedule: number | null = null;
  let guardrail = context?.balanceGuardrail ?? null;
  const selectedPlayers = (chosen: Selection[]) => chosen.flatMap((selection) => selection.players);

  const runPass = (phase: "baseline" | "quality") => {
    for (const schedule of prepared) {
      const lists = schedule.candidates.map((candidates) => [...candidates].sort((left, right) =>
        phase === "baseline"
          ? compareLevelVectors([left.balanceGap, left.groupingSummary.maxLadderGap], [right.balanceGap, right.groupingSummary.maxLadderGap])
          : compareLevelVectors(getLevelQualityVector([left], options.levelPolicy, respectRest), getLevelQualityVector([right], options.levelPolicy, respectRest))
      ));
      const visit = (chosen: Selection[], used: Set<string>) => {
        branches++;
        if (expired()) return;
        const selected = selectedPlayers(chosen);
        const remaining = available.filter((player) => !used.has(player.userId));
        const missingMandatory = [...required].filter((id) => !used.has(id));
        if (missingMandatory.length > requiredCount - selected.length) { pruned++; return; }
        if (bestStronger && compareLevelVectors(optimisticStrongerVector(selected, remaining, schedule.rank), bestStronger) > 0) { pruned++; return; }
        const depth = chosen.length;
        if (depth === options.courtCount) {
          if (missingMandatory.length) return;
          const stronger = strongerVector(selected, schedule.rank);
          const fairnessCompare = bestStronger ? compareLevelVectors(stronger, bestStronger) : -1;
          const batch = summarize(chosen);
          if (phase === "baseline") {
            if (fairnessCompare < 0 || (fairnessCompare === 0 && (!baseline ||
              compareLevelVectors([batch.maxBalanceGap, batch.totalBalanceGap], [baseline.maxBalanceGap, baseline.totalBalanceGap]) < 0))) {
              bestStronger = stronger;
              baseline = { maxBalanceGap: batch.maxBalanceGap, totalBalanceGap: batch.totalBalanceGap };
            }
          } else if (fairnessCompare === 0 && guardrail && isBalanceGuardrailAdmissible(batch, guardrail) &&
            (!best || compareLevelVectors(getLevelQualityVector(chosen, options.levelPolicy, respectRest),
              getLevelQualityVector(best.selections, options.levelPolicy, respectRest)) < 0)) {
            best = batch;
            bestSchedule = schedule.index;
          }
          return;
        }
        const compatible = lists.slice(depth).map((candidates) => candidates.filter((candidate) => !candidate.ids.some((id) => used.has(id))));
        if (compatible.some((candidates) => candidates.length === 0)) { pruned++; return; }
        const lowerBalance = {
          maxBalanceGap: Math.max(0, ...chosen.map((selection) => selection.balanceGap),
            ...compatible.map((candidates) => Math.min(...candidates.map((candidate) => candidate.balanceGap)))),
          totalBalanceGap: chosen.reduce((sum, selection) => sum + selection.balanceGap, 0) +
            compatible.reduce((sum, candidates) => sum + Math.min(...candidates.map((candidate) => candidate.balanceGap)), 0),
        };
        if (phase === "baseline" && baseline && bestStronger &&
          compareLevelVectors(optimisticStrongerVector(selected, remaining, schedule.rank), bestStronger) === 0 &&
          compareLevelVectors([lowerBalance.maxBalanceGap, lowerBalance.totalBalanceGap], [baseline.maxBalanceGap, baseline.totalBalanceGap]) >= 0) { pruned++; return; }
        if (phase === "quality" && guardrail && !isBalanceGuardrailAdmissible(lowerBalance, guardrail)) { pruned++; return; }
        const lowerQuality = [
          Math.max(0, ...chosen.map((candidate) => candidate.groupingSummary.maxLadderGap),
            ...compatible.map((candidates) => Math.min(...candidates.map((candidate) => candidate.groupingSummary.maxLadderGap)))),
          chosen.reduce((sum, candidate) => sum + candidate.groupingSummary.totalLadderGap, 0) +
            compatible.reduce((sum, candidates) => sum + Math.min(...candidates.map((candidate) => candidate.groupingSummary.totalLadderGap)), 0),
          lowerBalance.maxBalanceGap, lowerBalance.totalBalanceGap,
          ...(options.levelPolicy.metric === SessionBalanceMetric.SESSION_POINTS ? [
            Math.max(0, ...chosen.map((candidate) => candidate.pointDiffGap),
              ...compatible.map((candidates) => Math.min(...candidates.map((candidate) => candidate.pointDiffGap)))),
            chosen.reduce((sum, candidate) => sum + candidate.pointDiffGap, 0) +
              compatible.reduce((sum, candidates) => sum + Math.min(...candidates.map((candidate) => candidate.pointDiffGap)), 0),
          ] : []),
          ...(respectRest ? [...selected, ...[...remaining].sort((a, b) => b.restTurns - a.restTurns)
            .slice(0, requiredCount - selected.length)].map((player) => player.restTurns).sort((a, b) => a - b).map((turns) => -turns) : []),
          selected.reduce((sum, player) => sum + player.randomScore, 0) +
            remaining.map((player) => player.randomScore).sort((a, b) => a - b)
              .slice(0, requiredCount - selected.length).reduce((sum, score) => sum + score, 0),
        ];
        if (phase === "quality" && best && compareLevelVectors(lowerQuality,
          getLevelQualityVector(best.selections, options.levelPolicy, respectRest)) >= 0) { pruned++; return; }
        // Identical remaining courts are interchangeable. Anchor only when every
        // remaining player must play, otherwise an optional player could be forced.
        const symmetric = schedule.courts.slice(depth).every((constraints) => constraints === schedule.courts[depth]);
        const anchor = symmetric && remaining.length === (options.courtCount - depth) * 4 ? remaining[0]?.userId : null;
        for (const candidate of compatible[0]) {
          if (anchor && !candidate.ids.includes(anchor)) continue;
          const nextUsed = new Set(used);
          candidate.ids.forEach((id) => nextUsed.add(id));
          visit([...chosen, candidate], nextUsed);
          if (limitReached) return;
          if (phase === "baseline" && baseline && bestStronger &&
            compareLevelVectors(optimisticStrongerVector(selected, remaining, schedule.rank), bestStronger) === 0 &&
            compareLevelVectors([lowerBalance.maxBalanceGap, lowerBalance.totalBalanceGap], [baseline.maxBalanceGap, baseline.totalBalanceGap]) >= 0) break;
          if (phase === "quality" && best && compareLevelVectors(lowerQuality,
            getLevelQualityVector(best.selections, options.levelPolicy, respectRest)) >= 0) break;
        }
      };
      visit([], new Set());
      if (limitReached) break;
    }
  };
  if (!context) runPass("baseline");
  debug.baselineCertified = !limitReached && baseline !== null;
  if (!limitReached && bestStronger && baseline) {
    guardrail ??= buildBalanceGuardrail(getLevelBalancePolicy(options.levelPolicy), baseline);
    runPass("quality");
  }
  debug.searchLimitReached = limitReached;
  debug.exploredBranches = branches;
  debug.prunedBranches = pruned;
  // An interrupted baseline cannot establish which fairness class or balance
  // limit is safe. An interrupted final ranking may return its admitted witness.
  if (!debug.baselineCertified || !best || !guardrail || !bestStronger) return empty();
  const selection = best as LadderBatchSelection<Player>;
  const selectionContext: LevelSelectionContext = { strongerPriorityVector: bestStronger, balanceGuardrail: guardrail };
  selection.selections = selection.selections.map((chosen) => ({
    ...chosen,
    levelContext: selectionContext,
    levelDiagnostics: {
      metric: options.levelPolicy.metric, levelSpread: chosen.groupingSummary.maxLadderGap,
      balanceGap: chosen.balanceGap, bestBalanceGap: guardrail!.bestMaxBalanceGap,
      allowedBalanceGap: guardrail!.allowedMaxBalanceGap, ceilingFeasible: guardrail!.ceilingFeasible,
      baselineCertified: true, searchLimitReached: limitReached,
    },
  }));
  debug.levelDiagnostics = selection.selections[0]?.levelDiagnostics;
  debug.chosenQuartets = selection.selections.map((chosen) => chosen.ids);
  debug.chosenMaxLadderGap = selection.maxLadderGap;
  debug.chosenTotalLadderGap = selection.totalLadderGap;
  debug.chosenTotalPointDiffGap = 0;
  debug.chosenMaxBalanceGap = selection.maxBalanceGap;
  debug.chosenTotalBalanceGap = selection.totalBalanceGap;
  debug.chosenMaxPointDiffBalanceGap = selection.maxPointDiffBalanceGap;
  debug.chosenTotalPointDiffBalanceGap = selection.totalPointDiffBalanceGap;
  debug.chosenMaxStrengthGap = selection.maxStrengthGap;
  debug.chosenTotalStrengthGap = selection.totalStrengthGap;
  return { selection, scheduleIndex: bestSchedule, debug };
}
