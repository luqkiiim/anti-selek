import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const arg = (key, fallback) => process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const baseline = arg("baseline", "3d6fa887");
const baselineUrl = "/src/lib/matchmaking/ladder/levelSelection.baseline.ts";
const baselinePath = path.join(root, baselineUrl).replaceAll("\\", "/");
const originalSource = execFileSync("git", ["show", `${baseline}:src/lib/matchmaking/ladder/levelSelection.ts`], { encoding: "utf8" });
const server = await createServer({
  root, configFile: false, logLevel: "error", appType: "custom",
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { middlewareMode: true },
  plugins: [{ name: "benchmark-baseline", resolveId: (id) => id === baselineUrl ? baselinePath : null,
    load: (id) => id === baselinePath ? originalSource : null }],
});

try {
  const load = (file) => server.ssrLoadModule(`/src/${file}.ts`);
  const { findBestLevelBatchSelection: oldLevel } = await server.ssrLoadModule(baselineUrl);
  const { findBestLevelBatchSelection: newLevel } = await load("lib/matchmaking/ladder/levelSelection");
  const { deriveRaceRecordsByEntryTime } = await load("lib/matchmaking/ladder/records");
  const { buildLevelGrouping } = await load("lib/matchmaking/ladder/levelPolicy");
  const { buildLevelCompatibilityScorer, LEVEL_SKILL_UNIT, LEVEL_SEVERE_COMPATIBILITY } = await load("lib/matchmaking/ladder/levelCompatibility");
  const { getExactPartitionKey, getPairKey } = await load("lib/matchmaking/v3/rematch");
  const { isValidPartitionForMode } = await load("lib/matchmaking/v3/balance");
  const { buildRestTurnsByUserId } = await load("lib/matchmaking/restTurns");
  const { buildSocialVarietyContext, buildSocialVarietySnapshot } = await load("lib/matchmaking/v3/socialVariety");
  const { runSocialCandidateWithProductionFallback } = await load("app/api/sessions/[code]/generate-match/socialCandidateAcceptance");
  const { createMatchmakingSearchBudget } = await load("lib/matchmaking/v3/searchBudget");
  const { getSocialIdealRestGap } = await load("lib/matchmaking/v3/scoring");
  const { buildPlayerGroupCourtPlans, getPlayerGroupSelectionConstraints } = await load("lib/matchmaking/playerGroupPlanner");
  const { classifyCourtGroupSnapshot } = await load("lib/playerGroups");
  const { PlayerGender, SessionBalanceMetric, SessionMode, SessionType } = await load("types/enums");

  const cases = [
    { id: "standard", upper: 7, lower: 7, courts: 2, matches: 21, profile: "narrow", open: true },
    { id: "long", upper: 7, lower: 7, courts: 2, matches: 100, profile: "overlap" },
    { id: "three-courts-18", upper: 9, lower: 9, courts: 3, matches: 21, profile: "narrow" },
    { id: "three-courts-20", upper: 10, lower: 10, courts: 3, matches: 21, profile: "overlap" },
    { id: "wide", upper: 7, lower: 7, courts: 2, matches: 21, profile: "wide", open: true },
    { id: "high-outlier", upper: 7, lower: 7, courts: 2, matches: 21, profile: "high", open: true },
    { id: "low-outlier", upper: 7, lower: 7, courts: 2, matches: 21, profile: "low", open: true },
    { id: "multiple-outliers", upper: 7, lower: 7, courts: 2, matches: 21, profile: "outliers" },
    { id: "unequal-10-5", upper: 10, lower: 5, courts: 2, matches: 21, profile: "offset" },
    { id: "unequal-12-4", upper: 12, lower: 4, courts: 2, matches: 21, profile: "reverse" },
    { id: "lifecycle", upper: 7, lower: 7, courts: 2, matches: 21, profile: "overlap", lifecycle: true },
    { id: "points", upper: 7, lower: 7, courts: 2, matches: 21, profile: "overlap", points: true },
    { id: "groups", upper: 7, lower: 7, courts: 2, matches: 21, profile: "overlap", groups: true },
  ];
  const chosen = arg("cases", cases.map((entry) => entry.id).join(",")).split(",");
  const policies = arg("policies", "baseline,social,0,0.5,1,1.5").split(",");
  const seeds = arg("seeds", "1,4729,104729").split(",").map(Number);
  const rows = [];
  const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const max = (values) => values.length ? Math.max(...values) : null;
  const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  const clock = (tick) => new Date(1_800_000_000_000 + 60_000 * tick);

  function rosterFor(scenario, seed) {
    const random = rng(seed);
    return Array.from({ length: scenario.upper + scenario.lower }, (_, index) => {
      const upper = index < scenario.upper;
      const { profile } = scenario;
      const rank = random();
      let rating = profile === "wide" ? 600 + 700 * rank : profile === "narrow" ? 930 + 140 * rank : 820 + 360 * rank;
      if (profile === "offset" || profile === "reverse") rating += upper === (profile === "offset") ? 230 : -120;
      if ((profile === "high" || profile === "outliers") && index === 0) rating = 1550;
      if ((profile === "low" || profile === "outliers") && index === 1) rating = 550;
      if (profile === "outliers" && index === scenario.upper) rating = 1470;
      return {
        userId: `p${String(index).padStart(2, "0")}`, teamSide: upper ? "UPPER" : "LOWER",
        gender: upper ? PlayerGender.MALE : PlayerGender.FEMALE,
        pool: index % 2 ? "B" : "A", rating: Math.round(rating),
        strength: Math.round(rating), matchesPlayed: 0, matchmakingBaseline: 0,
        availableSince: clock(0), entryAt: clock(0), isPaused: scenario.lifecycle && index === 0,
      };
    });
  }

  function groupOptions(scenario, players, courtCount, history) {
    if (!scenario.groups) return { schedules: undefined, structural: [] };
    const counts = (entries) => [entries.filter((player) => player.pool === "A").length, entries.filter((player) => player.pool === "B").length];
    const [activePoolAPlayerCount, activePoolBPlayerCount] = counts(players.filter((player) => !player.isPaused));
    const [waitingPoolAPlayerCount, waitingPoolBPlayerCount] = counts(players.filter((player) => !player.isPaused && !player.isBusy));
    const inputs = { activePoolAPlayerCount, activePoolBPlayerCount, waitingPoolAPlayerCount, waitingPoolBPlayerCount };
    const cache = new Map();
    const constraint = (composition) => {
      const key = `${composition.courtGroupType}/${composition.poolASeatCount}`;
      if (!cache.has(key)) cache.set(key, getPlayerGroupSelectionConstraints(composition));
      return cache.get(key);
    };
    let rank = -1;
    let priority = "";
    const schedules = buildPlayerGroupCourtPlans({ ...inputs, requestedCourtCount: courtCount, history })
      .filter((plan) => plan.filledCourtCount === courtCount).map((plan) => {
        const next = [plan.overflowCourtCount, plan.crossoverShortfall, plan.crossoverExcess, plan.ratioError].join("/");
        if (next !== priority) rank++;
        priority = next;
        return { rank, courts: plan.compositions.map(constraint) };
      });
    const structural = buildPlayerGroupCourtPlans({ ...inputs, requestedCourtCount: 1,
      waitingPoolAPlayerCount: activePoolAPlayerCount, waitingPoolBPlayerCount: activePoolBPlayerCount })
      .flatMap((plan) => plan.compositions.map(constraint));
    return { schedules, structural: [...new Set(structural)] };
  }

  function run(scenario, policy, seed) {
    const source = rosterFor(scenario, seed);
    const mode = scenario.open ? SessionMode.MEXICANO : SessionMode.MIXICANO;
    const metric = scenario.points ? SessionBalanceMetric.SESSION_POINTS : SessionBalanceMetric.RATING;
    const history = [], groupHistory = [], active = [], timing = [], batchTiming = [], waits = [], gaps = [], ratingGaps = [];
    const spreads = [], within = [], relative = [], severity = [];
    const types = { UPPER: 0, MIXED: 0, LOWER: 0, OPEN: 0 };
    const exposure = new Map(source.map((p) => [p.userId, { own: 0, mixed: 0 }]));
    const pools = new Map(source.map((p) => [p.userId, p.pool]));
    const courtmates = new Set(), partners = new Set(), opponents = new Set(), quartets = new Set(), partitions = new Set();
    let tick = 0, calls = 0, failures = 0, budgetStops = 0, fallbacks = 0, unfair = 0, illegal = 0;
    let guardrailViolations = 0, repeatQuartets = 0, repeatPartitions = 0, severe = 0, avoidableSevere = 0;
    let skillUnevaluated = 0, maxDisparity = 0, missedDueTurn = 0;
    const lifecycleSteps = new Set();
    while (history.length < scenario.matches) {
      tick++;
      if (scenario.lifecycle) {
        for (const lifecycleStep of [4, 8, 12].filter((step) => step <= history.length && !lifecycleSteps.has(step))) {
          lifecycleSteps.add(lifecycleStep);
          const target = source[lifecycleStep === 4 ? 0 : 1];
          target.isPaused = lifecycleStep === 8;
          if (!target.isPaused) {
            target.matchmakingBaseline = Math.min(...source.filter((p) => p !== target && !p.isPaused).map((p) => p.matchesPlayed));
            target.availableSince = target.entryAt = target.arrivalPriorityAt = clock(tick);
          }
        }
      }
      const busy = new Set(active.flatMap((entry) => entry.ids));
      const rests = buildRestTurnsByUserId(source, history);
      const records = deriveRaceRecordsByEntryTime(new Map(source.map((p) => [p.userId, p.entryAt])), history);
      const players = source.map((p) => ({ ...p, isBusy: busy.has(p.userId), restTurns: rests.get(p.userId),
        ...records.get(p.userId), strength: scenario.points ? records.get(p.userId).ladderScore : p.rating }));
      const byId = new Map(players.map((p) => [p.userId, p]));
      const score = buildLevelCompatibilityScorer(players.map((p) => ({ ...p, strength: p.rating })), mode, SessionBalanceMetric.RATING);
      const eligible = players.filter((p) => !p.isBusy && !p.isPaused);
      const free = Math.min(scenario.courts - active.length, scenario.matches - history.length - active.length, Math.floor(eligible.length / 4));
      for (let courtCount = free; courtCount >= 1; courtCount--) {
        const { schedules, structural } = groupOptions(scenario, players, courtCount, groupHistory);
        const started = performance.now();
        const randomFn = rng(seed + 37 * calls++);
        const options = { courtCount, sessionMode: mode, randomFn, levelPolicy: { metric }, schedules };
        let result;
        if (policy === "social") {
          const socialHistory = [...history, ...active.map((entry) => entry.commitment)];
          const budget = createMatchmakingSearchBudget();
          const social = { ...options, sessionType: SessionType.SOCIAL_MIX, rotationPlayerCount: players.filter((p) => !p.isPaused).length,
            completedMatches: history, socialHistoryMatches: socialHistory, searchBudget: budget,
            socialStructuralOpportunityConstraints: structural,
            socialVarietyContext: buildSocialVarietyContext(players, socialHistory, { sessionMode: mode, opportunityConstraints: structural }) };
          try {
            const outcome = runSocialCandidateWithProductionFallback({ candidatePlayers: players, options: social });
            result = outcome.result;
            if (outcome.decision.appliedPolicy === "production-fallback") fallbacks++;
          } catch (error) {
            if (error?.name !== "MatchmakingSearchBudgetExceededError") throw error;
            budgetStops++;
          }
        } else {
          result = policy === "baseline" ? oldLevel(players, options) : newLevel(players, {
            ...options, skillTolerance: Number(policy), history: [...history, ...active.map((entry) => entry.commitment)],
          });
        }
        const elapsed = performance.now() - started;
        timing.push(elapsed);
        if (courtCount > 1) batchTiming.push(elapsed);
        if (result?.debug.searchLimitReached) { budgetStops++; if (result.selection) fallbacks++; }
        if (!result?.selection) { failures++; continue; }
        const selections = result.selection.selections;
        let bestRatingFit;
        const getBestRatingFit = () => {
          if (bestRatingFit === undefined) {
            bestRatingFit = selections[0].levelDiagnostics?.bestCompatibility ?? newLevel(players, {
              ...options, randomFn: () => 0,
            }).debug.levelDiagnostics?.bestCompatibility ?? null;
          }
          return bestRatingFit;
        };
        const picked = selections.flatMap(({ partition }) => [...partition.team1, ...partition.team2]);
        if (new Set(picked).size !== courtCount * 4 || picked.some((id) => !byId.has(id) || byId.get(id).isBusy || byId.get(id).isPaused)) illegal++;
        const effective = (p) => Math.max(p.matchmakingBaseline, p.matchesPlayed);
        if (!scenario.groups && mode === SessionMode.MEXICANO &&
          picked.some((id) => eligible.some((other) => !picked.includes(other.userId) && effective(other) < effective(byId.get(id))))) unfair++;
        const eligibleUnpicked = eligible.filter((p) => !picked.includes(p.userId));
        if (!scenario.groups && mode === SessionMode.MEXICANO && eligibleUnpicked.some((p) => !p.arrivalPriorityAt &&
          p.restTurns > getSocialIdealRestGap(players.filter((other) => !other.isPaused).length) &&
          picked.some((id) => effective(byId.get(id)) === effective(p) && byId.get(id).restTurns < p.restTurns && !byId.get(id).arrivalPriorityAt))) missedDueTurn++;
        for (const selection of selections) {
          const { partition } = selection;
          const ids = [...partition.team1, ...partition.team2];
          if (!isValidPartitionForMode(partition, byId, mode)) illegal++;
          if (policy !== "social" && selection.balanceGap > selection.levelDiagnostics.allowedBalanceGap) guardrailViolations++;
          const snapshot = buildSocialVarietySnapshot(partition, players);
          const type = mode === SessionMode.MIXICANO ? snapshot.courtType : null;
          const rated = ids.map((id) => ({ ...byId.get(id), strength: byId.get(id).rating }));
          const raw = buildLevelGrouping(rated);
          const compatibility = score(rated, raw);
          if (type === "MIXED") { within.push(compatibility.withinSideGap); relative.push(compatibility.relativeGap); }
          else spreads.push(raw.maxLadderGap);
          const ratingGap = Math.abs((rated[0].rating + rated[1].rating - rated[2].rating - rated[3].rating) / 2);
          ratingGaps.push(ratingGap);
          gaps.push(selection.balanceGap);
          severity.push(compatibility.worst / LEVEL_SKILL_UNIT);
          if (compatibility.worst > LEVEL_SEVERE_COMPATIBILITY) {
            severe++;
            const optimum = metric === SessionBalanceMetric.RATING ? getBestRatingFit() : null;
            if (optimum !== null) avoidableSevere += Number(optimum * LEVEL_SKILL_UNIT <= LEVEL_SEVERE_COMPATIBILITY);
            else skillUnevaluated++;
          }
          types[type ?? "OPEN"]++;
          const qKey = [...ids].sort().join("|");
          const pKey = getExactPartitionKey(partition);
          repeatQuartets += Number(quartets.has(qKey));
          repeatPartitions += Number(partitions.has(pKey));
          quartets.add(qKey); partitions.add(pKey);
          for (const [index, id] of ids.entries()) {
            waits.push(byId.get(id).restTurns);
            if (type) exposure.get(id)[type === "MIXED" ? "mixed" : "own"]++;
            for (let next = index + 1; next < 4; next++) {
              const key = getPairKey(id, ids[next]);
              courtmates.add(key);
              (Math.floor(index / 2) === Math.floor(next / 2) ? partners : opponents).add(key);
            }
          }
          const end = tick + 3 + (active.length % 2);
          const resultRandom = rng(seed + 19 * (history.length + active.length))();
          const winnerTeam = resultRandom < 1 / (1 + 10 ** ((rated[2].rating + rated[3].rating - rated[0].rating - rated[1].rating) / 800)) ? 1 : 2;
          active.push({ end, ids, commitment: { ...partition, id: `m${history.length + active.length}`, socialVariety: snapshot,
            winnerTeam, team1Score: winnerTeam === 1 ? 21 : 18, team2Score: winnerTeam === 2 ? 21 : 18 } });
          groupHistory.push(classifyCourtGroupSnapshot(partition.team1, partition.team2, pools));
        }
        break;
      }
      if (!active.length) break;
      const next = Math.min(...active.map((entry) => entry.end));
      tick = Math.max(tick, next);
      for (let index = active.length - 1; index >= 0; index--) {
        if (active[index].end > tick) continue;
        const [{ ids, commitment }] = active.splice(index, 1);
        history.push({ ...commitment, completedAt: clock(tick), status: "COMPLETED" });
        for (const player of source.filter((p) => ids.includes(p.userId))) {
          player.matchesPlayed++; player.availableSince = clock(tick); player.arrivalPriorityAt = undefined;
        }
      }
      const counts = source.filter((p) => !p.isPaused).map((p) => Math.max(p.matchmakingBaseline, p.matchesPlayed));
      maxDisparity = Math.max(maxDisparity, Math.max(...counts) - Math.min(...counts));
    }
    const counts = source.map((p) => p.matchesPlayed);
    return {
      case: scenario.id, policy, seed, completed: history.length, counts, finalDisparity: Math.max(...counts) - Math.min(...counts),
      maxDisparity, unfair, illegal, missedDueTurn, guardrailViolations,
      avgCourtmates: 2 * courtmates.size / source.length,
      avgPartners: 2 * partners.size / source.length, avgOpponents: 2 * opponents.size / source.length,
      repeatQuartets, repeatPartitions, types, exposure: Object.fromEntries(exposure),
      meanSpread: avg(spreads), worstSpread: max(spreads), meanWithin: avg(within), worstWithin: max(within),
      meanRelative: avg(relative), worstRelative: max(relative), meanSeverity: avg(severity), worstSeverity: max(severity),
      severe, avoidableSevere, skillUnevaluated, meanGap: avg(gaps), worstGap: max(gaps),
      meanRatingGap: avg(ratingGaps), worstRatingGap: max(ratingGaps), maxWait: max(waits),
      longWaits: waits.filter((value) => value > 2 * scenario.courts).length,
      backToBack: avg(waits.map((value) => Number(value === 0))),
      restTurns: Object.fromEntries([...new Set(waits)].sort((a, b) => a - b).map((value) => [value, waits.filter((wait) => wait === value).length])),
      calls, failures, budgetStops, fallbacks, meanMs: avg(timing), p95Ms: p95(timing),
      meanBatchMs: avg(batchTiming), p95BatchMs: p95(batchTiming),
    };
  }

  const out = arg("out", "benchmarks/generated/level-match/results.json");
  mkdirSync(path.dirname(out), { recursive: true });
  const originalWarn = console.warn;
  console.warn = (...args) => { if (args[0] !== "social-matchmaking-policy-fallback") originalWarn(...args); };
  for (const scenario of cases.filter((entry) => chosen.includes(entry.id))) {
    for (const seed of seeds) for (const policy of policies) {
      const result = run(scenario, policy, seed);
      rows.push(result);
      writeFileSync(out, JSON.stringify({ baseline, seeds, rows }, null, 2));
      console.log(scenario.id, seed, policy, result.completed, result.avgCourtmates.toFixed(2), `${Math.round(result.p95Ms)} ms`, result.budgetStops);
    }
  }
} finally {
  await server.close();
}
