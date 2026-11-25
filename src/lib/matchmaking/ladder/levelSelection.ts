import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, SessionBalanceMetric, SessionMode } from "@/types/enums";
import { getArrivalPriorityTime } from "../arrivalPriority";
import { buildBalanceGuardrail, isBalanceGuardrailAdmissible } from "../v3/balanceGuardrail";
import { getExactPartitionKey, getPairKey } from "../v3/rematch";
import { getSocialStarvationVector } from "../v3/scoring";
import type { MatchmakingSearchBudget } from "../v3/searchBudget";
import { evaluateBalancedPartitions, getDoublesPartitions, hasLegalEffectiveMixedSides } from "./balance";
import { buildActivePlayers } from "./fairness";
import {
  buildLevelCompatibilityScorer, buildLevelVarietyScorer, LEVEL_SEVERE_COMPATIBILITY, LEVEL_SKILL_UNIT,
  type LevelCompatibility,
} from "./levelCompatibility";
import type { SocialHistoryMatch } from "../v3/socialVariety";
import { buildLevelDistributionContext, type LevelDistributionSnapshot } from "./levelDistribution";
import { buildClubPlayCompatibilityScorer } from "./clubPlayCompatibility";
import { buildClubPlayDistributionContext } from "./clubPlayDistribution";
import { buildClubPlayRotation, CLUB_PLAY_QUALITY_UNIT } from "./clubPlayRotation";
import { buildLevelRelationshipVariety, LEVEL_RELATIONSHIP_COST_SIZE } from "./levelRelationshipVariety";
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
  /** maxMs caps the whole invocation; each search phase also has a 2s cap. */
  searchLimits?: { maxBranches?: number; maxMs?: number };
  searchBudget?: MatchmakingSearchBudget;
  history?: readonly SocialHistoryMatch[];
  /** Internal override for comparative benchmarks, in compatibility units. */
  skillTolerance?: number;
  level3?: { groups: boolean };
}

export interface LevelBatchResult<T extends ActiveMatchmakerLadderPlayer> extends LadderBatchResult<T> {
  scheduleIndex: number | null;
}

function buildClubPlayRelationshipCost(history: readonly SocialHistoryMatch[]) {
  const exact = new Map<string, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const increment = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const match of history) {
    increment(exact, getExactPartitionKey(match));
    for (const team of [match.team1, match.team2]) increment(partners, getPairKey(...team));
    for (const left of match.team1) for (const right of match.team2) increment(opponents, getPairKey(left, right));
  }
  return (partition: SocialHistoryMatch) => [
    exact.get(getExactPartitionKey(partition)) ?? 0,
    [partition.team1, partition.team2].reduce((sum, team) => sum + (partners.get(getPairKey(...team)) ?? 0), 0),
    partition.team1.reduce((sum, left) =>
      sum + partition.team2.reduce((total, right) => total + (opponents.get(getPairKey(left, right)) ?? 0), 0), 0),
  ];
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

export function findBestLevelBatchSelection<T extends MatchmakerLadderPlayer>(
  players: T[], options: LevelSelectionOptions<T>
): LevelBatchResult<ActiveMatchmakerLadderPlayer<T>> {
  return findBestSkillBatchSelection(players, options);
}

export function findBestSkillBatchSelection<T extends MatchmakerLadderPlayer>(
  players: T[], options: LevelSelectionOptions<T> & { clubPlay?: { requiredPartitionKey?: string } },
): LevelBatchResult<ActiveMatchmakerLadderPlayer<T>> {
  type Player = ActiveMatchmakerLadderPlayer<T>;
  type Selection = LadderSingleCourtSelection<Player>;
  type Phase = "preparation" | "baseline" | "quality";
  type Alternative = Pick<Selection, "partition" | "balanceGap" | "pointDiffGap">;
  type DistributionImpact = ReturnType<ReturnType<typeof buildLevelDistributionContext>["impact"]>;
  type Candidate = {
    selection: Selection; mask: bigint; order: number; skill: LevelCompatibility;
    alternatives: Alternative[]; variety?: readonly number[]; quality?: number[];
    distribution?: { impact: DistributionImpact; exposure: number };
    clubCost?: { cost: number; boost: number };
  };
  type Baseline = { batch: LadderBatchSelection<Player>; candidates: Candidate[]; scheduleIndex: number };
  type State = {
    selected: Player[]; remaining: Player[];
    optimistic: Map<number, number[]>; stronger: Map<number, number[]>;
    qualityTail?: number[];
  };
  type Compatible = {
    candidates: Candidate[]; minBalance: number; minSpread: number;
    minPairwise: number; minPointDiff: number; minVariety: number[];
    minClubCost: number; minClubCostWithBoost: number;
    distribution?: { min: DistributionImpact; max: DistributionImpact };
  };
  const startedAt = performance.now();
  const totalDeadline = startedAt + Math.min(4_000, options.searchLimits?.maxMs ?? Infinity);
  let deadline = Math.min(totalDeadline, startedAt + 2_000);
  let phase: Phase = "preparation";
  let phaseStartedAt = startedAt;
  const phaseElapsedMs = { preparation: 0, baseline: 0, quality: 0 };
  const maxBranches = options.searchLimits?.maxBranches ?? 200_000;
  let branches = 0;
  let pruned = 0;
  let limitReached = false;
  let limitPhase: Phase | null = null;
  const interrupted = Symbol("Level search interrupted");
  const checkBudget = () => {
    if (branches >= maxBranches || performance.now() >= deadline || options.searchBudget?.isExpired()) {
      limitReached = true;
      limitPhase ??= phase;
      throw interrupted;
    }
  };
  let scanOperations = 0;
  const checkScanBudget = () => {
    if ((scanOperations++ & 63) === 0) checkBudget();
  };
  const enterPhase = (next: Phase) => {
    const now = performance.now();
    phaseElapsedMs[phase] += now - phaseStartedAt;
    phaseStartedAt = now;
    phase = next;
    if (next === "quality") deadline = Math.min(totalDeadline, now + 2_000);
  };
  const runWithinBudget = (work: () => void) => {
    try { work(); } catch (error) { if (error !== interrupted) throw error; }
  };
  const respectRest = options.respectPlayerRest !== false;
  const points = options.levelPolicy.metric === SessionBalanceMetric.SESSION_POINTS;
  const requiredCount = options.courtCount * 4;
  const clubPlay = options.clubPlay;
  const effectiveSides = clubPlay && options.sessionMode === SessionMode.MIXICANO
    ? new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)])) : null;
  const eligiblePlayers = effectiveSides
    ? players.filter((player) => effectiveSides.get(player.userId)) : players;
  const active = buildActivePlayers(eligiblePlayers, { randomFn: options.randomFn, respectPlayerRest: false });
  const available = [...active].sort((a, b) => a.userId.localeCompare(b.userId));
  const byId = new Map(available.map((player) => [player.userId, player]));
  const bits = new Map(available.map((player, index) => [player.userId, BigInt(1) << BigInt(index)]));
  const required = options.lockedPlayerIds ?? new Set<string>();
  const requiredMask = [...required].reduce((mask, id) => mask | (bits.get(id) ?? BigInt(0)), BigInt(0));
  const context = options.selectionContext;
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
  const finishDebug = () => {
    phaseElapsedMs[phase] += performance.now() - phaseStartedAt;
    debug.phaseElapsedMs = phaseElapsedMs;
    debug.searchLimitPhase = limitPhase;
    debug.searchLimitReached = limitReached;
    debug.exploredBranches = branches;
    debug.prunedBranches = pruned;
  };
  const empty = (): LevelBatchResult<Player> => {
    finishDebug();
    return { selection: null, scheduleIndex: null, debug };
  };
  if (requiredCount <= 0 || available.length < requiredCount || required.size > requiredCount ||
    [...required].some((id) => !byId.has(id)) || active.some((player) => !Number.isFinite(player.strength))) return empty();

  const clubSkill = clubPlay ? buildClubPlayCompatibilityScorer(players, options.sessionMode) : null;
  const scoreSkill = clubSkill?.score ?? buildLevelCompatibilityScorer(players, options.sessionMode, options.levelPolicy.metric);
  const history = options.history ?? [];
  const clubDistribution = clubPlay && options.sessionMode === SessionMode.MIXICANO
    ? buildClubPlayDistributionContext(players, history) : null;
  const clubRotation = clubSkill ? buildClubPlayRotation(players, history, clubSkill) : null;
  const distribution = clubDistribution ?? (options.level3
    ? buildLevelDistributionContext(players, history, options.sessionMode, options.level3.groups) : null);
  const relationships = options.level3 ? buildLevelRelationshipVariety(history) : null;
  const scoreLegacyVariety = !clubPlay && !options.level3 && history.length
    ? buildLevelVarietyScorer(players, history, options.sessionMode) : null;
  const scoreClubPlayVariety = clubSkill ? buildClubPlayRelationshipCost(history) : null;
  const scoreVariety = relationships || scoreLegacyVariety || scoreClubPlayVariety;
  const varietySize = relationships ? LEVEL_RELATIONSHIP_COST_SIZE : 6;
  const distributionFor = (candidate: Candidate) => {
    if (!distribution) return undefined;
    if (!candidate.distribution) {
      const target = distribution.snapshot(candidate.selection.partition, candidate.skill.matchType);
      candidate.distribution = {
        impact: distribution.impact(target),
        exposure: clubDistribution ? clubDistribution.absoluteExposureChange(target) : distribution.exposureCost(target),
      };
    }
    return candidate.distribution;
  };
  const relationshipCost = (candidate: Candidate, partition: Alternative["partition"]) => {
    if (scoreClubPlayVariety) return scoreClubPlayVariety(partition);
    const exposure = distributionFor(candidate)?.exposure ?? 0;
    return relationships ? relationships.score(partition, exposure) : scoreLegacyVariety!(partition, candidate.skill.matchType);
  };
  const tolerance = Math.round((options.skillTolerance ?? 0.5) * LEVEL_SKILL_UNIT);
  const skillOf = (candidates: readonly Candidate[]) => [
    Math.max(0, ...candidates.map((candidate) => candidate.skill.worst)),
    candidates.reduce((sum, candidate) => sum + candidate.skill.mean, 0),
  ];
  const varietyOf = (candidates: readonly Candidate[]) => Array.from({ length: varietySize }, (_, index) =>
    candidates.reduce((sum, candidate) => sum + candidate.variety![index], 0));
  // Treat minor differences inside the certified window as comparable.
  // Compare relative to the strongest achievable court for this decision.
  const skillBands = ([worst]: readonly number[]) => [
    Math.floor(Math.max(0, worst - (skillEnvelope?.bestWorst ?? 0)) / (LEVEL_SKILL_UNIT * 0.4)),
  ];
  const impactsOf = (candidates: readonly Candidate[]) => candidates.map((candidate) => distributionFor(candidate)!.impact);
  const qualityVector = (skill: number[], balanceAndRest: number[], variety: number[] = [], distributionBand?: number) => {
    return [
      ...(distributionBand === undefined ? [] : [distributionBand, ...skillBands(skill)]),
      ...variety,
      ...skill,
      ...balanceAndRest,
    ];
  };
  const clubCostOf = (candidate: Candidate) => {
    if (!candidate.clubCost) {
      const rotation = clubRotation!.cost(candidate.selection.ids);
      const exposure = Math.round((distributionFor(candidate)?.exposure ?? 0) * CLUB_PLAY_QUALITY_UNIT / 4);
      candidate.clubCost = {
        cost: candidate.skill.worst + candidate.skill.mean + rotation.repeat + exposure,
        boost: rotation.boost,
      };
    }
    return candidate.clubCost;
  };
  const clubMixCost = (chosen: readonly Candidate[], remaining?: Compatible[]) => clubDistribution
    ? Math.round(clubDistribution.absoluteDeviationChange(
      impactsOf(chosen), remaining?.map((summary) => summary.distribution!),
    ) * CLUB_PLAY_QUALITY_UNIT / 4) : 0;
  const clubScoreOf = (chosen: readonly Candidate[], remaining: Compatible[] = [], withBoost = true) => {
    const costs = chosen.map(clubCostOf);
    return costs.reduce((sum, entry) => sum + entry.cost, 0) +
      remaining.reduce((sum, summary) => sum + summary.minClubCost, 0) +
      clubMixCost(chosen, remaining) -
      (withBoost ? Math.max(0, ...costs.map((entry) => entry.boost),
        ...remaining.map((summary) => summary.minClubCost - summary.minClubCostWithBoost)) : 0);
  };
  const qualityOf = (candidates: readonly Candidate[], variety = false, withBoost = true) => {
    const skill = skillOf(candidates);
    const balanceAndRest = getLevelQualityVector(
      candidates.map((candidate) => candidate.selection), options.levelPolicy, respectRest,
    ).slice(2);
    return clubPlay
      ? [clubScoreOf(candidates, [], withBoost), ...skill, ...balanceAndRest]
      : qualityVector(skill, balanceAndRest, variety ? varietyOf(candidates) : [],
        variety && distribution ? distribution.band(impactsOf(candidates)) : undefined);
  };

  const starvationContext = {
    activePlayerCount: eligiblePlayers.filter((player) => !player.isPaused).length,
    availablePlayers: available,
  };
  const arrivalVector = (selected: readonly Player[]) => {
    const times = selected.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null).sort((a, b) => a - b);
    return [-times.length, ...times, ...Array(requiredCount - times.length).fill(0)];
  };
  // Request-local caches contain only state-derived values, never incumbent
  // assumptions. Bound their size so a difficult search cannot retain every scan.
  const remember = <K, V>(cache: Map<K, V>, key: K, value: V, cap = 4_096): V => {
    if (cache.size < cap) cache.set(key, value);
    return value;
  };
  const states = new Map<bigint, State>();
  const stateFor = (mask: bigint): State => {
    const cached = states.get(mask);
    if (cached) return cached;
    const selected: Player[] = [];
    const remaining: Player[] = [];
    for (const player of available) {
      ((mask & bits.get(player.userId)!) !== BigInt(0) ? selected : remaining).push(player);
    }
    return remember(states, mask, { selected, remaining, optimistic: new Map(), stronger: new Map() });
  };
  const strongerFor = (state: State, rank: number) => {
    const cached = state.stronger.get(rank);
    if (cached) return cached;
    return remember(state.stronger, rank, [
      ...state.selected.map((player) => player.effectiveMatchCount).sort((a, b) => a - b),
      ...arrivalVector(state.selected), rank,
      ...getSocialStarvationVector(state.selected, starvationContext),
    ]);
  };
  const optimisticFor = (state: State, rank: number) => {
    const cached = state.optimistic.get(rank);
    if (cached) return cached;
    const { selected, remaining } = state;
    const slots = requiredCount - selected.length;
    const counts = [...selected.map((player) => player.effectiveMatchCount),
      ...remaining.map((player) => player.effectiveMatchCount).sort((a, b) => a - b).slice(0, slots)].sort((a, b) => a - b);
    const selectedTimes = selected.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null);
    const extraTimes = remaining.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null).sort((a, b) => a - b).slice(0, slots);
    const times = [...selectedTimes, ...extraTimes].sort((a, b) => a - b);
    const bestRestSelection = [...selected, ...[...remaining].sort((a, b) => b.restTurns - a.restTurns).slice(0, slots)];
    return remember(state.optimistic, rank, [
      ...counts, -times.length, ...times, ...Array(requiredCount - times.length).fill(0), rank,
      ...getSocialStarvationVector(bestRestSelection, starvationContext),
    ]);
  };
  const qualityTailFor = (state: State) => state.qualityTail ??= [
    ...(respectRest ? [...state.selected, ...[...state.remaining].sort((a, b) => b.restTurns - a.restTurns)
      .slice(0, requiredCount - state.selected.length)].map((player) => player.restTurns).sort((a, b) => a - b).map((turns) => -turns) : []),
    state.selected.reduce((sum, player) => sum + player.randomScore, 0) +
      state.remaining.map((player) => player.randomScore).sort((a, b) => a - b)
        .slice(0, requiredCount - state.selected.length).reduce((sum, score) => sum + score, 0),
  ];
  const qualityFor = (candidate: Candidate) => candidate.quality ??=
    qualityOf([candidate], candidate.variety !== undefined);

  const unconstrained: LadderSelectionConstraints<Player> = options.selectionConstraints ?? {};
  const schedules = options.schedules ?? [{ rank: 0, courts: Array.from({ length: options.courtCount }, () => unconstrained) }];
  const candidateCache = new Map<LadderSelectionConstraints<Player>, Candidate[]>();
  const quartets: Array<[Player, Player, Player, Player]> = [];
  const candidatesFor = (constraints: LadderSelectionConstraints<Player>) => {
    const cached = candidateCache.get(constraints);
    if (cached) return cached;
    const candidates: Candidate[] = [];
    for (let order = 0; order < quartets.length; order++) {
      checkScanBudget();
      const quartet = quartets[order];
      if (constraints.isQuartetAllowed && !constraints.isQuartetAllowed(quartet)) continue;
      const ids = quartet.map((player) => player.userId) as [string, string, string, string];
      if (options.excludedQuartetKeys?.has([...ids].sort().join("|"))) continue;
      const groupingSummary = buildLevelGrouping(quartet);
      const skill = scoreSkill(quartet, groupingSummary);
      const restSummary = buildRestSummary(quartet);
      const randomScore = getQuartetRandomScore(quartet);
      let best: Selection | null = null;
      const alternatives: Alternative[] = [];
      const seenPartitions = scoreVariety ? new Set<string>() : null;
      const partitions = clubPlay ? getDoublesPartitions(ids).filter((partition) => !effectiveSides ||
        hasLegalEffectiveMixedSides(partition, (id) => effectiveSides.get(id))) :
        evaluateBalancedPartitions(ids, byId, options.sessionMode).map(({ partition }) => partition);
      for (const candidatePartition of partitions) {
        const partition = constraints.normalizePartition
          ? constraints.normalizePartition({ partition: candidatePartition, players: quartet, playersById: byId })
          : candidatePartition;
        if (!partition) continue;
        if (seenPartitions || options.excludedPartitionKey || clubPlay?.requiredPartitionKey) {
          const key = getExactPartitionKey(partition);
          if (key === options.excludedPartitionKey || seenPartitions?.has(key) ||
            (clubPlay?.requiredPartitionKey && clubPlay.requiredPartitionKey !== key)) continue;
          seenPartitions?.add(key);
        }
        const team1 = partition.team1.map((id) => byId.get(id)!);
        const team2 = partition.team2.map((id) => byId.get(id)!);
        const gap = Math.abs((team1[0].strength + team1[1].strength - team2[0].strength - team2[1].strength) / 2);
        const pointDiffGap = points
          ? Math.abs((team1[0].pointDiff + team1[1].pointDiff - team2[0].pointDiff - team2[1].pointDiff) / 2) : 0;
        if (scoreVariety) alternatives.push({ partition, balanceGap: gap, pointDiffGap });
        if (!best || compareLevelVectors([gap, pointDiffGap], [best.balanceGap, best.pointDiffGap]) < 0) {
          best = { ids, players: quartet, partition, groupingSummary, restSummary,
            balanceGap: gap, strengthGap: gap, pointDiffGap, randomScore };
        }
      }
      if (best) {
        candidates.push({ selection: best, order, skill, alternatives,
          mask: ids.reduce((mask, id) => mask | bits.get(id)!, BigInt(0)) });
      }
    }
    candidateCache.set(constraints, candidates);
    return candidates;
  };
  const prepared: Array<LevelSchedule<Player> & { index: number; candidates: Candidate[][] }> = [];
  runWithinBudget(() => {
    checkBudget();
    const lower = effectiveSides ? available.map((player) => Number(effectiveSides.get(player.userId) === MixedSide.LOWER)) : null;
    for (let a = 0; a < available.length - 3; a++) {
      for (let b = a + 1; b < available.length - 2; b++) {
        for (let c = b + 1; c < available.length - 1; c++) {
          for (let d = c + 1; d < available.length; d++) {
            checkScanBudget();
            if (lower && (lower[a] + lower[b] + lower[c] + lower[d]) % 2 !== 0) continue;
            quartets.push([available[a], available[b], available[c], available[d]]);
          }
        }
      }
    }
    for (const [index, schedule] of schedules.entries()) {
      checkBudget();
      if (schedule.courts.length !== options.courtCount) continue;
      const candidates = schedule.courts.map(candidatesFor);
      if (candidates.every((list) => list.length)) prepared.push({ ...schedule, index, candidates });
    }
    checkBudget();
  });
  debug.quartetCount = quartets.length;
  debug.validQuartetCount = [...candidateCache.values()].reduce((sum, candidates) => sum + candidates.length, 0);
  if (limitReached || !prepared.length) return empty();

  let bestStronger = context?.strongerPriorityVector ?? null;
  let baseline: Baseline | null = null;
  let baselineProven = false;
  let best: LadderBatchSelection<Player> | null = null;
  let bestCandidates: Candidate[] = [];
  let bestQuality: number[] | null = null;
  let bestSchedule: number | null = null;
  let guardrail = context?.balanceGuardrail ?? null;
  let skillEnvelope = clubPlay ? undefined : context?.skillEnvelope;
  const admitsSkill = ([worst, total]: readonly number[]) => !skillEnvelope ||
    (worst <= skillEnvelope.allowedWorst && total <= skillEnvelope.allowedTotal);
  const globalLowerBound = optimisticFor(stateFor(BigInt(0)), Math.min(...prepared.map((schedule) => schedule.rank)));

  const runPass = (searchPhase: "baseline" | "skill" | "variety") => {
    const useVariety = searchPhase === "variety";
    const orderPartition = (scores: readonly number[], balance: number, pointDiff: number) => clubPlay
      ? [balance, ...scores] : [...scores, balance, pointDiff];
    const admitsPartition = (candidate: Candidate, alternative: Alternative) => !!guardrail &&
      alternative.balanceGap <= guardrail.allowedMaxBalanceGap &&
      (guardrail.allowedTotalBalanceGap === null || alternative.balanceGap <= candidate.selection.balanceGap);
    if (useVariety && relationships && history.length) {
      for (const list of new Set(prepared.flatMap((schedule) => schedule.candidates))) for (const candidate of list) {
        checkScanBudget();
        if (!admitsSkill([candidate.skill.worst, candidate.skill.mean])) continue;
        for (const alternative of candidate.alternatives) {
          if (admitsPartition(candidate, alternative)) relationships.opportunities(alternative.partition);
        }
      }
      relationships.finalize();
    }
    if (useVariety && !clubPlay && bestCandidates.length) {
      bestCandidates = bestCandidates.map((candidate) => ({ ...candidate,
        variety: relationshipCost(candidate, candidate.selection.partition),
      }));
      bestQuality = qualityOf(bestCandidates, true);
    }
    const sortedLists = new Map<Candidate[], Candidate[]>();
    const cappedLists = new WeakMap<Candidate[], Map<number, Candidate[]>>();
    const compatibleCache = new WeakMap<Candidate[], Map<string, Compatible>>();
    const listFor = (source: Candidate[]) => {
      const cached = sortedLists.get(source);
      if (cached) return cached;
      const list: Candidate[] = [];
      for (const candidate of source) {
        checkScanBudget();
        if (searchPhase === "baseline") { list.push(candidate); continue; }
        if (!guardrail || candidate.selection.balanceGap > guardrail.allowedMaxBalanceGap ||
          !admitsSkill([candidate.skill.worst, candidate.skill.mean])) continue;
        if (!useVariety || !scoreVariety) { list.push(candidate); continue; }
        let chosen: Candidate | null = null;
        for (const alternative of candidate.alternatives) {
          // With a total cap, a higher-gap split cannot belong to the
          // globally certified best worst/total balance batch.
          if (!admitsPartition(candidate, alternative) ||
            (clubPlay && alternative.balanceGap > candidate.selection.balanceGap)) continue;
          const cost = relationshipCost(candidate, alternative.partition);
          if (!chosen || compareLevelVectors(orderPartition(cost, alternative.balanceGap, alternative.pointDiffGap),
            orderPartition(chosen.variety!, chosen.selection.balanceGap, chosen.selection.pointDiffGap)) < 0) {
            chosen = { ...candidate, variety: cost, quality: undefined, selection: {
              ...candidate.selection, ...alternative, strengthGap: alternative.balanceGap,
            } };
          }
        }
        if (chosen) list.push(chosen);
      }
      list.sort((left, right) => {
        checkScanBudget();
        return searchPhase === "baseline"
          ? left.selection.balanceGap - right.selection.balanceGap ||
            left.selection.groupingSummary.maxLadderGap - right.selection.groupingSummary.maxLadderGap ||
            left.order - right.order
          : compareLevelVectors(qualityFor(left), qualityFor(right)) || left.order - right.order;
      });
      sortedLists.set(source, list);
      return list;
    };
    const cappedAt = (source: Candidate[], maximum: number) => {
      let cache = cappedLists.get(source);
      if (!cache) { cache = new Map(); cappedLists.set(source, cache); }
      const cached = cache.get(maximum);
      if (cached) return cached;
      const list: Candidate[] = [];
      for (const candidate of source) {
        checkScanBudget();
        if (candidate.selection.balanceGap <= maximum) list.push(candidate);
      }
      return remember(cache, maximum, list, 64);
    };
    const compatibleFor = (list: Candidate[], mask: bigint, minimumOrder: number): Compatible => {
      let cache = compatibleCache.get(list);
      if (!cache) { cache = new Map(); compatibleCache.set(list, cache); }
      const key = mask.toString() + ":" + minimumOrder;
      const cached = cache.get(key);
      if (cached) return cached;
      const summary: Compatible = {
        candidates: [], minBalance: Infinity, minSpread: Infinity, minPairwise: Infinity, minPointDiff: Infinity,
        minVariety: useVariety && !clubPlay ? Array<number>(varietySize).fill(Infinity) : [],
        minClubCost: Infinity, minClubCostWithBoost: Infinity,
        ...(useVariety && distribution ? { distribution: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } } : {}),
      };
      for (const candidate of list) {
        checkScanBudget();
        if (candidate.order <= minimumOrder || (candidate.mask & mask) !== BigInt(0)) continue;
        summary.candidates.push(candidate);
        summary.minBalance = Math.min(summary.minBalance, candidate.selection.balanceGap);
        if (searchPhase !== "baseline") {
          summary.minSpread = Math.min(summary.minSpread, candidate.skill.worst);
          summary.minPairwise = Math.min(summary.minPairwise, candidate.skill.mean);
          if (clubPlay) {
            const { cost, boost } = clubCostOf(candidate);
            summary.minClubCost = Math.min(summary.minClubCost, cost);
            summary.minClubCostWithBoost = Math.min(summary.minClubCostWithBoost, cost - boost);
          }
          if (points) summary.minPointDiff = Math.min(summary.minPointDiff, candidate.selection.pointDiffGap);
          if (useVariety) for (let index = 0; index < summary.minVariety.length; index++) {
            summary.minVariety[index] = Math.min(summary.minVariety[index], candidate.variety![index]);
          }
          if (summary.distribution && candidate.distribution) for (let index = 0; index < 3; index++) {
            const impact = candidate.distribution.impact[index];
            summary.distribution.min[index] = Math.min(summary.distribution.min[index], impact);
            summary.distribution.max[index] = Math.max(summary.distribution.max[index], impact);
          }
        }
      }
      return remember(cache, key, summary, 256);
    };

    for (const schedule of prepared) {
      checkBudget();
      const lists = schedule.candidates.map(listFor);
      const visit = (chosen: Candidate[], mask: bigint) => {
        checkBudget();
        branches++;
        const state = stateFor(mask);
        const optimistic = optimisticFor(state, schedule.rank);
        const fairnessBound = bestStronger ? compareLevelVectors(optimistic, bestStronger) : -1;
        if (fairnessBound > 0) { pruned++; return; }
        let missingMandatory = 0;
        for (let missing = requiredMask & ~mask; missing !== BigInt(0); missing &= missing - BigInt(1)) missingMandatory++;
        if (missingMandatory > requiredCount - state.selected.length) { pruned++; return; }
        const depth = chosen.length;
        if (depth === options.courtCount) {
          if ((mask & requiredMask) !== requiredMask) return;
          const stronger = strongerFor(state, schedule.rank);
          const fairnessCompare = bestStronger ? compareLevelVectors(stronger, bestStronger) : -1;
          const batch = summarize(chosen.map((candidate) => candidate.selection));
          if (searchPhase === "baseline") {
            if (fairnessCompare < 0 || (fairnessCompare === 0 && (!baseline ||
              compareLevelVectors([batch.maxBalanceGap, batch.totalBalanceGap],
                [baseline.batch.maxBalanceGap, baseline.batch.totalBalanceGap]) < 0))) {
              bestStronger = stronger;
              baseline = { batch, candidates: chosen, scheduleIndex: schedule.index };
              // A legal witness reaching independent lower bounds proves the
              // optimum, even with surplus players and unvisited schedules.
              baselineProven = compareLevelVectors(stronger, globalLowerBound) === 0 &&
                batch.maxBalanceGap === 0 && batch.totalBalanceGap === 0;
            }
          } else if (fairnessCompare === 0 && guardrail && isBalanceGuardrailAdmissible(batch, guardrail) && admitsSkill(skillOf(chosen))) {
            const quality = qualityOf(chosen, useVariety);
            if (!bestQuality || compareLevelVectors(quality, bestQuality) < 0) {
              best = batch; bestQuality = quality; bestSchedule = schedule.index;
              bestCandidates = chosen;
            }
          }
          return;
        }
        const compatible = lists.slice(depth).map((source, offset) => {
          const courtIndex = depth + offset;
          let minimumOrder = -1;
          // Court permutations are equivalent only for identical constraints.
          // Ordering quartets never chooses which optional players must play.
          for (let previous = depth - 1; previous >= 0; previous--) {
            if (schedule.courts[previous] === schedule.courts[courtIndex]) {
              minimumOrder = chosen[previous].order;
              break;
            }
          }
          const list = searchPhase === "baseline" && baseline && fairnessBound === 0
            ? cappedAt(source, baseline.batch.maxBalanceGap)
            : source;
          return compatibleFor(list, mask, minimumOrder);
        });
        if (compatible.some((summary) => !summary.candidates.length)) { pruned++; return; }
        const selections = chosen.map((candidate) => candidate.selection);
        const chosenMax = Math.max(0, ...selections.map((selection) => selection.balanceGap));
        const chosenTotal = selections.reduce((sum, selection) => sum + selection.balanceGap, 0);
        const lowerBalance = {
          maxBalanceGap: Math.max(chosenMax, ...compatible.map((summary) => summary.minBalance)),
          totalBalanceGap: chosenTotal + compatible.reduce((sum, summary) => sum + summary.minBalance, 0),
        };
        const baselineCannotImprove = () => baseline && bestStronger &&
          compareLevelVectors(optimistic, bestStronger) === 0 &&
          compareLevelVectors([lowerBalance.maxBalanceGap, lowerBalance.totalBalanceGap],
            [baseline.batch.maxBalanceGap, baseline.batch.totalBalanceGap]) >= 0;
        if (searchPhase === "baseline" && baselineCannotImprove()) { pruned++; return; }
        let lowerQuality: number[] | null = null;
        if (searchPhase !== "baseline") {
          if (!guardrail || !isBalanceGuardrailAdmissible(lowerBalance, guardrail)) { pruned++; return; }
          const skillBound = [
            Math.max(0, ...chosen.map((candidate) => candidate.skill.worst),
              ...compatible.map((summary) => summary.minSpread)),
            chosen.reduce((sum, candidate) => sum + candidate.skill.mean, 0) +
              compatible.reduce((sum, summary) => sum + summary.minPairwise, 0),
          ];
          if (!admitsSkill(skillBound)) { pruned++; return; }
          const balanceAndRestBound = [
            lowerBalance.maxBalanceGap, lowerBalance.totalBalanceGap,
            ...(points ? [
              Math.max(0, ...selections.map((selection) => selection.pointDiffGap),
                ...compatible.map((summary) => summary.minPointDiff)),
              selections.reduce((sum, selection) => sum + selection.pointDiffGap, 0) +
                compatible.reduce((sum, summary) => sum + summary.minPointDiff, 0),
            ] : []),
            ...qualityTailFor(state),
          ];
          lowerQuality = clubPlay
            ? [clubScoreOf(chosen, compatible), ...skillBound, ...balanceAndRestBound]
            : qualityVector(skillBound, balanceAndRestBound, useVariety ? varietyOf(chosen).map((value, index) => value +
              compatible.reduce((sum, summary) => sum + summary.minVariety[index], 0)) : [],
            useVariety && distribution
              ? distribution.band(impactsOf(chosen), compatible.map((summary) => summary.distribution!)) : undefined);
          if (bestQuality && compareLevelVectors(lowerQuality, bestQuality) >= 0) { pruned++; return; }
        }
        for (const candidate of compatible[0].candidates) {
          checkScanBudget();
          if (searchPhase === "baseline") {
            if (baselineProven || baselineCannotImprove()) break;
            // Re-read the incumbent: an earlier sibling may have tightened it.
            if (baseline && bestStronger && compareLevelVectors(optimistic, bestStronger) === 0) {
              const nextMax = Math.max(chosenMax, candidate.selection.balanceGap);
              if (nextMax > baseline.batch.maxBalanceGap ||
                (nextMax === baseline.batch.maxBalanceGap &&
                  chosenTotal + candidate.selection.balanceGap >= baseline.batch.totalBalanceGap)) {
                pruned++;
                continue;
              }
            }
          } else if (lowerQuality && bestQuality && compareLevelVectors(lowerQuality, bestQuality) >= 0) break;
          visit([...chosen, candidate], mask | candidate.mask);
        }
      };
      visit([], BigInt(0));
      if (searchPhase === "baseline" && baselineProven) break;
    }
    // A zero-balance witness at the global fairness bound has already proved
    // the baseline. Let the next phase observe any newly exhausted budget.
    if (searchPhase !== "baseline" || !baselineProven) checkBudget();
  };

  if (!context) {
    enterPhase("baseline");
    runWithinBudget(() => runPass("baseline"));
  }
  // Assignments inside runPass deliberately survive its budget interruption.
  const established = baseline as Baseline | null;
  debug.baselineCertified = context ? context.balanceGuardrail.baselineCertified : !limitReached && established !== null;
  if (debug.baselineCertified && bestStronger) {
    if (established) {
      guardrail = buildBalanceGuardrail(getLevelBalancePolicy(options.levelPolicy), established.batch);
      best = established.batch;
      bestCandidates = established.candidates;
      bestQuality = qualityOf(bestCandidates, false, false);
      bestSchedule = established.scheduleIndex;
    }
    if (!limitReached) {
      enterPhase("quality");
      if (clubPlay) {
        runWithinBudget(() => runPass("variety"));
      } else if (!skillEnvelope) {
        runWithinBudget(() => runPass("skill"));
        if (!limitReached && bestCandidates.length) {
          const [worst, total] = skillOf(bestCandidates);
          // Spend the variety allowance only while the fit is reasonable.
          // An unavoidable wider court remains eligible under the same fairness class.
          skillEnvelope = {
            bestWorst: worst,
            allowedWorst: Math.min(worst + tolerance, Math.max(worst, LEVEL_SEVERE_COMPATIBILITY)),
            allowedTotal: total + tolerance * options.courtCount,
          };
        }
      }
      if (!clubPlay && scoreVariety && skillEnvelope && !limitReached) {
        runWithinBudget(() => runPass("variety"));
      } else if (!clubPlay && context?.skillEnvelope && !scoreVariety) {
        runWithinBudget(() => runPass("skill"));
      }
    }
  }
  if (!debug.baselineCertified || !best || !guardrail || !bestStronger) return empty();
  const selection = best as LadderBatchSelection<Player>;
  const selectionContext: LevelSelectionContext = { strongerPriorityVector: bestStronger, balanceGuardrail: guardrail, skillEnvelope };
  const distributionSnapshots: (LevelDistributionSnapshot | undefined)[] = distribution
    ? selection.selections.map((chosen, index) => distribution.snapshot(chosen.partition, bestCandidates[index].skill.matchType))
    : [];
  const distributionDiagnostics = distribution?.diagnostics(distributionSnapshots);
  // A balance-only fallback did not spend the session's play-up boost.
  const rankedForClubPlay = Boolean(clubPlay && best !== established?.batch);
  const clubPlayRank = clubPlay ? qualityOf(bestCandidates, false, rankedForClubPlay) : [];
  const boosted = rankedForClubPlay
    ? bestCandidates.reduce<Candidate | undefined>((winner, candidate) =>
      clubCostOf(candidate).boost > (winner ? clubCostOf(winner).boost : 0) ? candidate : winner, undefined)
    : undefined;
  selection.selections = selection.selections.map((chosen, index) => {
    const diagnostics = {
      metric: options.levelPolicy.metric, levelSpread: chosen.groupingSummary.maxLadderGap,
      compatibility: bestCandidates[index].skill.worst / LEVEL_SKILL_UNIT,
      bestCompatibility: skillEnvelope === undefined ? undefined : skillEnvelope.bestWorst / LEVEL_SKILL_UNIT,
      allowedCompatibility: skillEnvelope === undefined ? undefined : skillEnvelope.allowedWorst / LEVEL_SKILL_UNIT,
      withinSideGap: bestCandidates[index].skill.withinSideGap,
      relativeGap: bestCandidates[index].skill.relativeGap,
      matchType: bestCandidates[index].skill.matchType,
      balanceGap: chosen.balanceGap, bestBalanceGap: guardrail!.bestMaxBalanceGap,
      allowedBalanceGap: guardrail!.allowedMaxBalanceGap, ceilingFeasible: guardrail!.ceilingFeasible,
      baselineCertified: true, searchLimitReached: limitReached,
    };
    if (clubPlay) return {
      ...chosen,
      clubPlayContext: selectionContext,
      clubPlayRank,
      clubPlayDiagnostics: {
        ...diagnostics,
        clubPlayMatchType: distributionSnapshots[index],
        clubPlayBoosted: bestCandidates[index] === boosted,
        clubPlayPlayedUp: clubRotation!.playedUp(chosen.ids),
        distribution: distributionDiagnostics,
        fallback: !limitReached ? "none" : best === established?.batch ? "balance-baseline" : "quality",
      },
    };
    return {
      ...chosen,
      levelContext: selectionContext,
      levelDiagnostics: {
        ...diagnostics,
        ...(distribution ? { levelMatchType: distributionSnapshots[index], levelDistribution: distributionDiagnostics } : {}),
      },
    };
  });
  debug.levelDiagnostics = selection.selections[0]?.levelDiagnostics;
  if (clubPlay) debug.clubPlayDiagnostics = selection.selections[0]?.clubPlayDiagnostics;
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
  finishDebug();
  return { selection, scheduleIndex: bestSchedule, debug };
}
