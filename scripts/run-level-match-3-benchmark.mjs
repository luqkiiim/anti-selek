import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const arg = (key, fallback) => process.argv.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const baseline = "cbbfd966c48989da3622a6afe5e8cc044995180b";
const baselineRoot = arg("baseline-worktree");
if (!baselineRoot) throw new Error("Pass --baseline-worktree=PATH for a clean checkout of Level Match 2.0.");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git(baselineRoot, "rev-parse", "HEAD") !== baseline || git(baselineRoot, "status", "--porcelain")) {
  throw new Error("The baseline worktree must be clean and at the pinned Level Match 2.0 commit.");
}
const createRunner = (root) => createServer({
  root, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, ws: false },
  resolve: { alias: { "@": path.resolve(root, "src") } },
});
const [referenceServer, candidateServer] = await Promise.all([createRunner(path.resolve(baselineRoot)), createRunner(process.cwd())]);
const load = (server, module) => server.ssrLoadModule(`/src/${module}.ts`);
const fromCandidate = (module) => load(candidateServer, module);

try {
  const reference = await load(referenceServer, "lib/matchmaking/ladder/levelSelection");
  const candidate = await fromCandidate("lib/matchmaking/ladder/levelSelection");
  const { SessionMode, SessionBalanceMetric } = await fromCandidate("types/enums");
  const { buildLevelDistributionTargets } = await fromCandidate("lib/matchmaking/ladder/levelDistribution");
  const { buildLevelGrouping } = await fromCandidate("lib/matchmaking/ladder/levelPolicy");
  const { buildLevelCompatibilityScorer } = await fromCandidate("lib/matchmaking/ladder/levelCompatibility");
  const { buildRestTurnsByUserId } = await fromCandidate("lib/matchmaking/restTurns");
  const { deriveRaceRecordsByEntryTime } = await fromCandidate("lib/matchmaking/ladder/records");
  const { getExactPartitionKey } = await fromCandidate("lib/matchmaking/v3/rematch");
  const { buildPlayerGroupCourtPlans, getPlayerGroupSelectionConstraints } = await fromCandidate("lib/matchmaking/playerGroupPlanner");
  const { classifyCourtGroupSnapshot } = await fromCandidate("lib/playerGroups");
  const { isValidPartitionForMode } = await fromCandidate("lib/matchmaking/v3/balance");
  const cases = [
    ["7-7", 7, 7, "narrow", true], ["7-7-wide", 7, 7, "wide", true],
    ["8-6", 8, 6, "narrow"], ["10-5", 10, 5, "offset", true], ["5-10", 5, 10, "reverse"],
    ["12-4", 12, 4, "reverse", true], ["4-12", 4, 12, "offset"], ["10-2", 10, 2, "overlap", true], ["2-10", 2, 10, "overlap"],
    ["one-side", 12, 0, "narrow"], ["small", 3, 3, "narrow"], ["impossible-side", 13, 1, "narrow"],
    ["outliers", 7, 7, "outliers"], ["points", 7, 7, "overlap"], ["groups", 8, 8, "narrow"],
    ["lifecycle", 7, 7, "offset"], ["three-courts", 9, 9, "overlap"], ["open", 7, 7, "overlap"],
  ];
  const caseFilter = arg("cases", cases.map(([id]) => id).join(",")).split(",");
  const schedules = arg("schedules", "async,queued,matched").split(",");
  const seeds = arg("seeds", "1,4729,104729").split(",").map(Number);
  const algorithms = arg("policies", "reference,candidate").split(",");
  const horizons = arg("horizons", "21,100").split(",").map(Number);
  const rows = [];
  const out = arg("out", "benchmarks/generated/level-match-3/results.json");
  const categories = ["UPPER", "MIXED", "LOWER"];
  const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const clock = (tick) => new Date(1_800_000_000_000 + 60_000 * tick);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const max = (values) => values.length ? Math.max(...values) : null;
  const recordOf = (keys, value) => Object.fromEntries(keys.map((key) => [key, value()]));

  function groupSchedules(players, eligible, courts, history) {
    const count = (list, pool) => list.filter((p) => !p.isPaused && p.pool === pool).length;
    const plans = buildPlayerGroupCourtPlans({ requestedCourtCount: courts, history,
      activePoolAPlayerCount: count(players, "A"), activePoolBPlayerCount: count(players, "B"),
      waitingPoolAPlayerCount: count(eligible, "A"), waitingPoolBPlayerCount: count(eligible, "B") });
    const byComposition = new Map();
    let rank = -1, last = "";
    return plans.filter((plan) => plan.filledCourtCount === courts).map((plan) => {
      const key = [plan.overflowCourtCount, plan.crossoverShortfall, plan.crossoverExcess, plan.ratioError].join("/");
      if (key !== last) rank++;
      last = key;
      return { rank, courts: plan.compositions.map((composition) => {
        const slot = `${composition.courtGroupType}:${composition.poolASeatCount}`;
        if (!byComposition.has(slot)) byComposition.set(slot, getPlayerGroupSelectionConstraints(composition));
        return byComposition.get(slot);
      }) };
    });
  }

  function nearestIntegerTarget(upper, lower, games, expected, possible) {
    const per = 4 * games / (upper + lower);
    let best = null, error = Infinity;
    for (let a = 0; a <= games; a++) for (let x = 0; x <= games - a; x++) {
      const c = games - a - x;
      if (a && !possible.UPPER || x && !possible.MIXED || c && !possible.LOWER) continue;
      const u = 4 * a + 2 * x, l = 4 * c + 2 * x;
      if (u < upper * Math.floor(per) || u > upper * Math.ceil(per) || l < lower * Math.floor(per) || l > lower * Math.ceil(per)) continue;
      const e = (a - expected.UPPER) ** 2 + (x - expected.MIXED) ** 2 + (c - expected.LOWER) ** 2;
      if (e < error) { error = e; best = { UPPER: a, MIXED: x, LOWER: c }; }
    }
    return best;
  }

  function simulate([id, upper, lower, profile], horizon, scheduling, seed, policy) {
    const enabled = policy === "candidate";
    const choose = (policy === "reference" ? reference : candidate).findBestLevelBatchSelection;
    const groups = id === "groups", lifecycle = id === "lifecycle";
    const courts = scheduling === "matched" ? 1 : id === "three-courts" ? 3 : 2;
    const sessionMode = id === "open" ? SessionMode.MEXICANO : SessionMode.MIXICANO;
    const metric = id === "points" ? SessionBalanceMetric.SESSION_POINTS : SessionBalanceMetric.RATING;
    const random = rng(seed);
    const roster = Array.from({ length: upper + lower }, (_, index) => {
      const isUpper = index < upper;
      let rating = profile === "wide" ? 650 + 640 * random() : profile === "narrow" ? 950 + 100 * random() : 820 + 360 * random();
      if (profile === "offset" || profile === "reverse") rating += isUpper === (profile === "offset") ? 230 : -120;
      if (profile === "outliers" && index < 2) rating = index ? 550 : 1520;
      return { userId: `p${index}`, gender: isUpper ? "MALE" : "FEMALE", pool: index % 2 ? "B" : "A", rating: Math.round(rating),
        matchesPlayed: 0, matchmakingBaseline: 0, availableSince: clock(0), entryAt: clock(0), isPaused: lifecycle && index === 0 };
    });
    const pool = new Map(roster.map((p) => [p.userId, p.pool]));
    const history = [], active = [], timing = [], batchTiming = [], waits = [];
    const phases = new Set();
    const perPlayer = new Map(roster.map((p) => [p.userId, { partners: new Map(), opponents: new Map(), courtmates: new Set(), own: 0, mixed: 0,
      expectedMixed: 0, compatibility: [], balance: [], mismatch: 0, partnerGap: 0 }]));
    const actual = recordOf(categories, () => 0), expected = recordOf(categories, () => 0);
    const quality = { compatibility: [], sameSide: [], withinSide: [], relative: [], balance: [] };
    const exact = new Set(), quartets = new Set();
    let tick = 0, queued = null, serial = 0, calls = 0, failed = 0, fallbacks = 0, interrupted = 0, activated = 0;
    let illegal = 0, fairness = 0, balance = 0, severe = 0, avoids = 0, repeatQuartets = 0, repeatExact = 0, maxEffectiveGap = 0;
    const effective = (p) => Math.max(p.matchesPlayed, p.matchmakingBaseline);
    let unavailableWaits = 0;

    const makePlayers = () => {
      const busy = new Set(active.flatMap((match) => match.ids));
      const rests = buildRestTurnsByUserId(roster, history);
      const entries = new Map(roster.map((p) => [p.userId, p.entryAt]));
      const records = deriveRaceRecordsByEntryTime(entries, history);
      return roster.map((p) => ({ ...p, ...records.get(p.userId), isBusy: busy.has(p.userId), restTurns: rests.get(p.userId),
        strength: metric === SessionBalanceMetric.RATING ? p.rating : records.get(p.userId).ladderScore }));
    };
    const launch = (game) => {
      const players = makePlayers();
      const byId = new Map(players.map((p) => [p.userId, p]));
      if (game.ids.some((player) => byId.get(player).isBusy || byId.get(player).isPaused)) { illegal++; return; }
      for (const player of game.ids) waits.push(byId.get(player).restTurns);
      active.push({ ...game, end: tick + 3 + (serial++ % 2) });
    };

    function select(courtCount, players, reservation) {
      const eligible = players.filter((p) => !p.isPaused && !p.isBusy);
      const matchType = scheduling === "matched" ? categories[history.length % 3] : null;
      const groupHistory = [...history, ...active.map((game) => game.commitment)].map((game) => classifyCourtGroupSnapshot(game.team1, game.team2, pool));
      const allowed = matchType ? { isQuartetAllowed: (quartet) =>
        quartet.filter((p) => p.gender === "MALE").length === ({ UPPER: 4, MIXED: 2, LOWER: 0 })[matchType] } : undefined;
      const options = { courtCount, sessionMode, levelPolicy: { metric }, randomFn: rng(seed + calls++ * 37),
        history: [...history, ...active.map((game) => game.commitment)], selectionConstraints: allowed,
        schedules: groups ? groupSchedules(players, eligible, courtCount, groupHistory) : undefined,
        ...(enabled ? { level3: { groups } } : {}) };
      const started = performance.now();
      const result = choose(players, options);
      const elapsed = performance.now() - started;
      timing.push(elapsed);
      if (courtCount > 1) batchTiming.push(elapsed);
      if (result.debug.searchLimitReached) { interrupted++; if (result.selection) fallbacks++; }
      if (!result.selection) { failed++; return []; }
      if (!result.debug.baselineCertified) fairness++;
      const byId = new Map(players.map((p) => [p.userId, p]));
      const selected = result.selection.selections.flatMap((s) => s.ids);
      if (new Set(selected).size !== 4 * courtCount || selected.some((p) => byId.get(p).isBusy || byId.get(p).isPaused)) illegal++;
      const totalLimit = result.selection.selections[0].levelContext.balanceGuardrail.allowedTotalBalanceGap;
      if (totalLimit !== null && result.selection.totalBalanceGap > totalLimit) balance++;
      const targets = buildLevelDistributionTargets(players, groups);
      return result.selection.selections.map((selection, index) => {
        const { partition, ids } = selection;
        if (!isValidPartitionForMode(partition, byId, sessionMode)) illegal++;
        if (selection.balanceGap > selection.levelDiagnostics.allowedBalanceGap) balance++;
        const measured = ids.map((p) => byId.get(p));
        const score = buildLevelCompatibilityScorer(players, sessionMode, metric)(measured, buildLevelGrouping(measured));
        const snapshot = selection.levelDiagnostics.levelMatchType ?? (sessionMode === SessionMode.MIXICANO ? targets(partition) : undefined);
        // Reference targets are measurement-only. They are invisible to the reference chooser.
        const proof = selection.levelDiagnostics;
        const [a, b, c, d] = [...partition.team1, ...partition.team2].map((p) => byId.get(p).rating);
        const won = rng(seed + (history.length + active.length + index) * 19)() < 1 / (1 + 10 ** ((c + d - a - b) / 800)) ? 1 : 2;
        return { ids, score, proof, snapshot, type: snapshot?.category, reservation, commitment: {
          ...partition, id: `${calls}:${index}`, ...(enabled && snapshot ? { levelMatchType: snapshot } : {}),
          winnerTeam: won, team1Score: won === 1 ? 21 : 18, team2Score: won === 2 ? 21 : 18,
        } };
      });
    }

    while (history.length < horizon) {
      tick++;
      if (lifecycle) for (const step of [4, 8, 12]) {
        const p = roster[step === 4 ? 0 : 1];
        if (history.length < step || phases.has(step) || active.some((game) => game.ids.includes(p.userId)) || queued?.ids.includes(p.userId)) continue;
        phases.add(step);
        p.isPaused = step === 8;
        if (!p.isPaused) {
          p.matchmakingBaseline = Math.min(...roster.filter((other) => other !== p && !other.isPaused).map(effective));
          p.availableSince = p.entryAt = p.arrivalPriorityAt = clock(tick);
        }
      }
      if (queued && active.length < courts) { launch(queued); queued = null; activated++; }
      const players = makePlayers();
      const available = players.filter((p) => !p.isBusy && !p.isPaused).length;
      const remaining = horizon - history.length - active.length;
      for (let count = Math.min(courts - active.length, remaining, Math.floor(available / 4)); count >= 1; count--) {
        const games = select(count, players, false);
        if (games.length) { for (const game of games) launch(game); break; }
      }
      if (scheduling === "queued" && !queued && active.length === courts && history.length + active.length < horizon) {
        const refreshed = makePlayers();
        if (refreshed.filter((p) => !p.isPaused && !p.isBusy).length >= 4) queued = select(1, refreshed, true)[0] ?? null;
      }
      if (!active.length) break;
      if (active.length < courts) unavailableWaits++;
      tick = Math.max(tick, Math.min(...active.map((game) => game.end)));
      for (let index = active.length - 1; index >= 0; index--) {
        if (active[index].end > tick) continue;
        const [game] = active.splice(index, 1);
        const { commitment, score, snapshot, type, proof } = game;
        history.push({ ...commitment, status: "COMPLETED", completedAt: clock(tick) });
        if (snapshot && type) {
          actual[type]++;
          for (const key of categories) expected[key] += snapshot.target[key];
        }
        quality.compatibility.push(score.worst / 1_000);
        quality.balance.push(proof.balanceGap);
        if (type === "MIXED") { quality.withinSide.push(score.withinSideGap); quality.relative.push(score.relativeGap); }
        else quality.sameSide.push(proof.levelSpread);
        if (score.worst > 2_500) { severe++; if (proof.bestCompatibility !== undefined && proof.bestCompatibility <= 2.5) avoids++; }
        const key = [...game.ids].sort().join("|");
        repeatQuartets += Number(quartets.has(key)); quartets.add(key);
        const exactKey = getExactPartitionKey(commitment);
        repeatExact += Number(exact.has(exactKey)); exact.add(exactKey);
        for (const player of roster.filter((p) => game.ids.includes(p.userId))) {
          player.matchesPlayed++; player.availableSince = clock(tick); player.arrivalPriorityAt = undefined;
          const stats = perPlayer.get(player.userId);
          const first = commitment.team1.includes(player.userId);
          const partner = (first ? commitment.team1 : commitment.team2).find((other) => other !== player.userId);
          const opponents = first ? commitment.team2 : commitment.team1;
          stats.partners.set(partner, (stats.partners.get(partner) ?? 0) + 1);
          for (const enemy of opponents) stats.opponents.set(enemy, (stats.opponents.get(enemy) ?? 0) + 1);
          for (const other of game.ids) if (other !== player.userId) stats.courtmates.add(other);
          stats.own += Number(type === "UPPER" || type === "LOWER"); stats.mixed += Number(type === "MIXED");
          stats.expectedMixed += snapshot?.mixedTargetByPlayer[player.userId] ?? 0;
          stats.compatibility.push(score.worst / 1_000); stats.balance.push(proof.balanceGap); stats.mismatch += Number(score.worst > 2_500);
          stats.partnerGap += Number(Math.abs(player.rating - roster.find((p) => p.userId === partner).rating) >= 200);
        }
      }
      const counts = roster.filter((p) => !p.isPaused).map(effective);
      maxEffectiveGap = Math.max(maxEffectiveGap, Math.max(...counts) - Math.min(...counts));
    }
    const profiles = [...roster].sort((a, b) => a.rating - b.rating || a.userId.localeCompare(b.userId)).map((p) => {
      const stats = perPlayer.get(p.userId);
      const repeats = (counts) => [...counts.values()].reduce((sum, count) => sum + count - 1, 0);
      return { player: p.userId, games: p.matchesPlayed, partners: stats.partners.size, opponents: stats.opponents.size, courtmates: stats.courtmates.size,
        partnerRepeats: repeats(stats.partners), opponentRepeats: repeats(stats.opponents), mixed: stats.mixed, own: stats.own,
        expectedMixed: stats.expectedMixed, compatibility: mean(stats.compatibility), balance: mean(stats.balance), severe: stats.mismatch, widerPartners: stats.partnerGap };
    });
    const summarize = (list, field) => mean(list.map((p) => p[field]).filter(Number.isFinite));
    const segments = recordOf(["weakest", "middle", "strongest"], () => []) ;
    for (const [index, player] of profiles.entries()) Object.values(segments)[Math.floor(3 * index / profiles.length)].push(player);
    const metrics = ["games", "opponents", "partners", "courtmates", "mixed", "own", "partnerRepeats", "opponentRepeats", "compatibility", "balance", "severe", "widerPartners"];
    const categoryGames = Object.values(actual).reduce((sum, count) => sum + count, 0);
    const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? null;
    return {
      id, seed, horizon, scheduling, policy, completed: history.length, profiles, actual, expected,
      selectionFingerprint: createHash("sha256").update(JSON.stringify(history.map(getExactPartitionKey))).digest("hex"),
      nearestInteger: !groups && !lifecycle && categoryGames ? nearestIntegerTarget(upper, lower, categoryGames, expected,
        { UPPER: upper >= 4, MIXED: upper >= 2 && lower >= 2, LOWER: lower >= 4 }) : null,
      totalVariation: categoryGames ? categories.reduce((sum, type) => sum + Math.abs(actual[type] - expected[type]), 0) / (2 * categoryGames) : null,
      ...Object.fromEntries(metrics.map((field) => [field, summarize(profiles, field)])),
      segments: Object.fromEntries(Object.entries(segments).map(([segment, profiles]) => [segment, Object.fromEntries(metrics.map((field) => [field, summarize(profiles, field)]))])),
      minOpponents: Math.min(...profiles.map((p) => p.opponents)), minPartners: Math.min(...profiles.map((p) => p.partners)),
      worst: Object.fromEntries(Object.entries(quality).map(([key, values]) => [key, max(values)])),
      means: Object.fromEntries(Object.entries(quality).map(([key, values]) => [key, mean(values)])),
      maxEffectiveGap, maxWait: max(waits), backToBack: mean(waits.map((wait) => Number(wait === 0))), repeatQuartets, repeatExact,
      illegal, fairness, guardrailViolations: balance, severeMatches: severe, avoidableSevere: avoids, interrupted, fallbacks, failed, activated, unavailableWaits,
      p95Ms: p95(timing), avgMs: mean(timing), p95BatchMs: p95(batchTiming),
    };
  }

  mkdirSync(path.dirname(out), { recursive: true });
  for (const scenario of cases.filter(([id]) => caseFilter.includes(id))) for (const schedule of schedules) for (const horizon of horizons) {
    if (schedule === "matched" && (scenario[0] !== "7-7" || horizon !== 21)) continue;
    if (horizon === 100 && !scenario[4]) continue;
    for (const seed of seeds) for (const policy of algorithms) {
      const row = simulate(scenario, horizon, schedule, seed, policy);
      rows.push(row);
      writeFileSync(out, JSON.stringify({ baseline, candidateBase: git(process.cwd(), "rev-parse", "HEAD"), rows }, null, 2));
      console.log(row.id, row.scheduling, row.horizon, row.seed, row.policy, row.completed,
        Object.values(row.actual).join("/"), row.opponents.toFixed(2), row.partners.toFixed(2), Math.round(row.p95Ms), `queue=${row.activated}`);
    }
  }
  if (algorithms.includes("reference") && algorithms.includes("disabled")) {
    const key = (row) => [row.id, row.seed, row.horizon, row.scheduling].join("/");
    const expected = new Map(rows.filter((row) => row.policy === "reference").map((row) => [key(row), row.selectionFingerprint]));
    for (const row of rows.filter((row) => row.policy === "disabled")) {
      if (expected.get(key(row)) !== row.selectionFingerprint) throw new Error(`Flag-off selection drift in ${key(row)}`);
    }
  }
} finally {
  await Promise.all([referenceServer.close(), candidateServer.close()]);
}
