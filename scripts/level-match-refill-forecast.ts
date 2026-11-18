import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { getArrivalPriorityTime } from "@/lib/matchmaking/arrivalPriority";
import { evaluateBalancedPartitions } from "@/lib/matchmaking/ladder/balance";
import { buildActivePlayers } from "@/lib/matchmaking/ladder/fairness";
import {
  buildLevelCompatibilityScorer, LEVEL_SEVERE_COMPATIBILITY, LEVEL_SKILL_UNIT, type LevelCompatibility,
} from "@/lib/matchmaking/ladder/levelCompatibility";
import { buildLevelDistributionContext } from "@/lib/matchmaking/ladder/levelDistribution";
import { buildLevelGrouping, compareLevelVectors, getLevelBalancePolicy } from "@/lib/matchmaking/ladder/levelPolicy";
import {
  findBestLevelBatchSelection, type LevelBatchResult, type LevelSelectionOptions,
} from "@/lib/matchmaking/ladder/levelSelection";
import type { ActiveMatchmakerLadderPlayer, MatchmakerLadderPlayer } from "@/lib/matchmaking/ladder/types";
import { buildBalanceGuardrail } from "@/lib/matchmaking/v3/balanceGuardrail";
import { getSocialStarvationVector } from "@/lib/matchmaking/v3/scoring";
import { SessionBalanceMetric, SessionMode } from "@/types/enums";

type Result = LevelBatchResult<ActiveMatchmakerLadderPlayer>;
type Refill = NonNullable<Result["selection"]>["selections"][number];
type Finish = { severe: boolean; safeSameSideMask: number };
type Outcome = "ineligible" | "budget" | "no-risk" | "inconclusive" | "no-alternative" | "retained" | "switched";

const quartetKey = (ids: readonly string[]) => [...ids].sort().join("|");
const recoveryAllowance = 0.75 * LEVEL_SKILL_UNIT;

export function projectLevelRefillPlayers(
  players: readonly MatchmakerLadderPlayer[],
  proposed: readonly string[],
  finishing: readonly string[],
  completionTime: Date,
) {
  const starting = new Set(proposed);
  const finished = new Set(finishing);
  return players.map((player) => {
    // Arrival priority is cleared at assignment. Credits are carried on top
    // of actual matches played, so both counts rise when the game finishes.
    if (finished.has(player.userId)) return {
      ...player, isBusy: false, matchesPlayed: player.matchesPlayed + 1,
      matchmakingBaseline: player.matchmakingBaseline + 1,
      availableSince: completionTime, restTurns: 0, arrivalPriorityAt: null,
    };
    if (starting.has(player.userId)) return { ...player, isBusy: true, arrivalPriorityAt: null };
    if (player.isBusy || player.isPaused || player.availableSince >= completionTime) return player;
    return { ...player, restTurns: (player.restTurns ?? 0) + 1 };
  });
}

export function compareRefillForecast(baseline: readonly Finish[], alternative: readonly Finish[]) {
  if (baseline.length !== alternative.length) return "inconclusive";
  if (alternative.some((next, i) => next.severe && !baseline[i].severe)) return "newSevere";
  if (alternative.some((next, i) =>
    (next.safeSameSideMask & baseline[i].safeSameSideMask) !== baseline[i].safeSameSideMask)) return "lostSameSide";
  return alternative.some((next, i) => !next.severe && baseline[i].severe) ? "improved" : "noImprovement";
}

/**
 * Exact one-court admission for the hypothetical state. Scoring and legal
 * partitions are shared with the selector. Ratings and sides stay fixed, so
 * quartet work can be shared between the different finish orders.
 */
export function buildRefillForecastProbe(
  players: MatchmakerLadderPlayer[],
  options: LevelSelectionOptions<MatchmakerLadderPlayer>,
  committed: Refill,
  checkBudget: () => void,
) {
  type Quartet = [string, string, string, string];
  type Candidate = { gap: number; skill: LevelCompatibility; distributionError: number };
  const byId = new Map(players.map((player) => [player.userId, player]));
  const mode = SessionMode.MIXICANO;
  const score = buildLevelCompatibilityScorer(players, mode, SessionBalanceMetric.RATING);
  const balancePolicy = getLevelBalancePolicy(options.levelPolicy);
  const ledger = buildLevelDistributionContext(players, [
    ...(options.history ?? []), { ...committed.partition, levelMatchType: committed.levelDiagnostics?.levelMatchType },
  ], mode, false);
  const recoveryTypes = ledger.recoveryTypes();
  const errorsByType = new Map<string | null, number>();
  const cache = new Map<string, Candidate | null>();
  const candidateFor = (ids: Quartet) => {
    const key = ids.join("|");
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const partitions = evaluateBalancedPartitions(ids, byId, mode);
    if (!partitions.length) {
      cache.set(key, null);
      return null;
    }
    const members = ids.map((id) => byId.get(id)!);
    const skill = score(members, buildLevelGrouping(members));
    let distributionError = errorsByType.get(skill.matchType);
    if (distributionError === undefined) {
      const target = ledger.snapshot(partitions[0].partition, skill.matchType);
      distributionError = ledger.error([ledger.impact(target)]);
      errorsByType.set(skill.matchType, distributionError);
    }
    const candidate = { gap: Math.min(...partitions.map((entry) => entry.strengthGap)), skill, distributionError };
    cache.set(key, candidate);
    return candidate;
  };

  return (projected: MatchmakerLadderPlayer[]): Finish | null => {
    const available = buildActivePlayers(projected, { randomFn: () => 0, respectPlayerRest: false })
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const starvationContext = { availablePlayers: available, activePlayerCount: projected.filter((p) => !p.isPaused).length };
    let strongest: number[] | undefined;
    let fair: Candidate[] = [];
    for (let a = 0; a < available.length - 3; a++) {
      for (let b = a + 1; b < available.length - 2; b++) {
        for (let c = b + 1; c < available.length - 1; c++) {
          for (let d = c + 1; d < available.length; d++) {
            checkBudget();
            const quartet = [available[a], available[b], available[c], available[d]];
            const candidate = candidateFor([available[a].userId, available[b].userId, available[c].userId, available[d].userId]);
            if (!candidate) continue;
            const arrivals = quartet.map((p) => getArrivalPriorityTime(p.arrivalPriorityAt))
              .filter((at) => at !== null).sort((left, right) => left - right);
            const fairness = [
              ...quartet.map((p) => p.effectiveMatchCount).sort((left, right) => left - right),
              -arrivals.length, ...arrivals, ...Array<number>(4 - arrivals.length).fill(0),
              ...getSocialStarvationVector(quartet, starvationContext),
            ];
            const compare = strongest ? compareLevelVectors(fairness, strongest) : -1;
            if (compare < 0) { strongest = fairness; fair = []; }
            if (compare <= 0) fair.push(candidate);
          }
        }
      }
    }
    checkBudget();
    if (!fair.length) return null;
    const bestGap = fair.reduce((lowest, court) => Math.min(lowest, court.gap), Infinity);
    const guardrail = buildBalanceGuardrail(balancePolicy, { maxBalanceGap: bestGap, totalBalanceGap: bestGap });
    let best: LevelCompatibility | undefined;
    for (const court of fair) {
      if (court.gap > guardrail.allowedMaxBalanceGap) continue;
      if (!best || court.skill.worst < best.worst ||
          (court.skill.worst === best.worst && court.skill.mean < best.mean)) best = court.skill;
    }
    if (!best) return null;
    if (best.worst > LEVEL_SEVERE_COMPATIBILITY) return { severe: true, safeSameSideMask: 0 };
    const tolerance = Math.round((options.skillTolerance ?? 0.5) * LEVEL_SKILL_UNIT);
    const standardWorst = Math.min(best.worst + tolerance, LEVEL_SEVERE_COMPATIBILITY);
    const standardMean = best.mean + tolerance;
    const recoveryGap = guardrail.ceilingFeasible
      ? Math.min(guardrail.allowedMaxBalanceGap + 15, guardrail.absoluteCeiling!)
      : guardrail.allowedMaxBalanceGap;
    const standard = fair.filter((court) =>
      court.gap <= guardrail.allowedMaxBalanceGap && court.skill.worst <= standardWorst && court.skill.mean <= standardMean);
    const bestStandardError = standard.reduce((lowest, court) => Math.min(lowest, court.distributionError), Infinity);
    const recovery = fair.filter((court) =>
      (court.skill.matchType === "UPPER" || court.skill.matchType === "LOWER") && recoveryTypes.includes(court.skill.matchType) &&
      court.distributionError < bestStandardError && court.gap <= recoveryGap &&
      court.skill.worst <= Math.min(standardWorst + recoveryAllowance, LEVEL_SEVERE_COMPATIBILITY) &&
      court.skill.mean <= standardMean + recoveryAllowance);
    const safeSameSideMask = [...standard, ...recovery].reduce((mask, { skill }) =>
      mask | (skill.matchType === "UPPER" ? 1 : skill.matchType === "LOWER" ? 2 : 0), 0);
    return { severe: false, safeSameSideMask };
  };
}

export function forecastSingleLevelRefill({
  players, options, original, liveCourts, completionTime, randomForCandidate, searchStartedAt, now = () => performance.now(),
}: {
  players: MatchmakerLadderPlayer[];
  options: LevelSelectionOptions<MatchmakerLadderPlayer>;
  original: Result;
  liveCourts: readonly (readonly string[])[];
  completionTime: Date;
  randomForCandidate: () => () => number;
  searchStartedAt?: number;
  now?: () => number;
}) {
  let forecasts = 0;
  let finalists = 0;
  let baselineSevere = 0;
  let severePreventions = 0;
  const comparisonCounts = { inconclusive: 0, newSevere: 0, lostSameSide: 0, noImprovement: 0, improved: 0 };
  const finish = (outcome: Outcome, result = original) => ({
    result, outcome, forecasts, finalists, baselineSevere, comparisonCounts,
    severePreventions: outcome === "switched" ? severePreventions : 0,
  });
  const selected = original.selection?.selections[0];
  const proof = selected?.levelDiagnostics;
  const context = selected?.levelContext;
  if (!selected || !proof?.levelMatchType || !context?.skillEnvelope || original.debug.searchLimitReached ||
      options.courtCount !== 1 || options.sessionMode !== SessionMode.MIXICANO ||
      options.levelPolicy.metric !== SessionBalanceMetric.RATING || !options.level3?.recoverDistribution || options.level3.groups ||
      options.schedules || options.selectionContext || options.selectionConstraints || options.lockedPlayerIds?.size ||
      options.excludedQuartetKeys?.size || options.excludedPartitionKey ||
      liveCourts.length < 1 || liveCourts.length > 2 || proof.compatibility === undefined || proof.allowedCompatibility === undefined ||
      proof.compatibility * LEVEL_SKILL_UNIT > LEVEL_SEVERE_COMPATIBILITY) return finish("ineligible");
  const occupied = new Set(liveCourts.flat());
  if (occupied.size !== liveCourts.length * 4 || players.filter((p) => p.isBusy).length !== occupied.size ||
      players.some((p) => !Number.isFinite(p.strength) || Boolean(p.isBusy) !== occupied.has(p.userId))) {
    return finish("ineligible");
  }

  const selectionDeadline = searchStartedAt === undefined ? Infinity :
    searchStartedAt + Math.min(4_000, options.searchLimits?.maxMs ?? Infinity);
  const deadline = Math.min(now() + 40, selectionDeadline);
  const budgetReached = Symbol("preview budget");
  const checkBudget = () => {
    if (now() >= deadline || options.searchBudget?.isExpired()) throw budgetReached;
  };
  const probe = buildRefillForecastProbe(players, options, selected, checkBudget);
  const project = (ids: readonly string[]) => [...liveCourts, ids].map((finishing) => {
    checkBudget();
    forecasts++;
    return probe(projectLevelRefillPlayers(players, ids, finishing, completionTime));
  });
  try {
    const baseline = project(selected.ids);
    if (!baseline.every((value) => value !== null)) return finish("inconclusive");
    baselineSevere = baseline.filter((next) => next.severe).length;
    if (!baselineSevere) return finish("no-risk");

    const category = proof.levelMatchType.category;
    const upperCount = category === "UPPER" ? 4 : category === "MIXED" ? 2 : 0;
    const excludedQuartetKeys = new Set([quartetKey(selected.ids)]);
    const allowedMaxBalanceGap = Math.min(proof.allowedBalanceGap, selected.balanceGap + 5);
    const skillEnvelope = {
      ...context.skillEnvelope,
      allowedWorst: Math.round(Math.min(proof.allowedCompatibility, proof.compatibility + 0.10,
        LEVEL_SEVERE_COMPATIBILITY / LEVEL_SKILL_UNIT) * LEVEL_SKILL_UNIT),
      allowedTotal: proof.distributionRecovery?.used
        ? Math.round(proof.distributionRecovery.recoveryAllowedTotalCompatibility * LEVEL_SKILL_UNIT)
        : context.skillEnvelope.allowedTotal,
    };
    let best: Result | undefined;
    for (let trial = 0; trial < 3; trial++) {
      checkBudget();
      const alternative = findBestLevelBatchSelection(players, {
        ...options, randomFn: randomForCandidate(), excludedQuartetKeys,
        selectionContext: { ...context, skillEnvelope, balanceGuardrail: { ...context.balanceGuardrail, allowedMaxBalanceGap } },
        selectionConstraints: { isQuartetAllowed: (quartet) =>
          quartet.filter((p) => getEffectiveMixedSide(p) === "UPPER").length === upperCount },
        searchLimits: { ...options.searchLimits, maxMs: Math.min(deadline - now(), options.searchLimits?.maxMs ?? Infinity) },
      });
      if (alternative.debug.searchLimitReached) return finish("budget");
      const court = alternative.selection?.selections[0];
      if (!court) break;
      finalists++;
      excludedQuartetKeys.add(quartetKey(court.ids));
      const projection = project(court.ids);
      if (!projection.every((value) => value !== null)) return finish("inconclusive");
      const comparison = compareRefillForecast(baseline, projection);
      comparisonCounts[comparison]++;
      if (comparison !== "improved") continue;
      const prevented = baselineSevere - projection.filter((next) => next.severe).length;
      if (prevented > severePreventions) {
        best = alternative;
        severePreventions = prevented;
      }
    }
    checkBudget();
    return best ? finish("switched", best) : finish(finalists ? "retained" : "no-alternative");
  } catch (error) {
    if (error !== budgetReached) throw error;
    return finish("budget");
  }
}
