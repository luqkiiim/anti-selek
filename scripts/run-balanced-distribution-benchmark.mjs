import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const value = (name, fallback) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const root = path.resolve(value("root", process.cwd()));
const sourcePaths = [
  "balancedRecurrence.ts",
  "balancedCandidateAcceptance.ts",
  "balancedMatchTypes.ts",
  "socialBatch.ts",
  "types.ts",
  "balance.ts",
  "scoring.ts",
  "socialVariety.ts",
].map((file) => `src/lib/matchmaking/v3/${file}`);
sourcePaths.push("src/lib/matchmaking/balancedMatchTypeQueue.ts");
const sourceHash = () => {
  const hash = createHash("sha256");
  for (const relative of sourcePaths) {
    const file = path.join(root, relative);
    hash.update(relative);
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : "absent");
  }
  return hash.digest("hex");
};
const provenance = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  engineHash: sourceHash(),
  runnerHash: createHash("sha256")
    .update(fs.readFileSync(process.argv[1]))
    .digest("hex"),
};
const policy = value("policy", "baseline");
const evolving = value("evolving", "false") === "true";
const lifecycle = value("lifecycle", "false") === "true";
const deferConstrainedQueue =
  value(
    "defer-constrained-queue",
    policy === "candidate" ? "true" : "false",
  ) === "true";
const scheduling = value("schedule", "async");
if (!["async", "joint", "queue"].includes(scheduling))
  throw new Error("Unknown scheduling mode");
const opening = value(
  "opening",
  scheduling === "joint" ? "joint" : "sequential",
);
if (!["joint", "sequential"].includes(opening))
  throw new Error("Unknown opening mode");
const seeds = value("seeds", "1,4729,104729").split(",").map(Number);
const matches = Number(value("matches", "100"));
const metrics = value("metrics", "ELO,POINTS").split(",");
const restSettings = value("rest", "true,false")
  .split(",")
  .map((entry) => entry === "true");
const profiles = value("profiles", "narrow,wide").split(",");
const selectedCases = value(
  "cases",
  "14,14unequal,15,16,15reverse,20,20unequal",
).split(",");
const outputDirectory = path.resolve(
  value("out", "benchmarks/generated/balanced-distribution"),
);
const cases = {
  14: [7, 7, 2],
  "14unequal": [8, 6, 2],
  15: [10, 5, 2],
  16: [12, 4, 2],
  "15reverse": [5, 10, 2],
  20: [10, 10, 3],
  "20unequal": [16, 4, 3],
  "three-lower": [11, 3, 2],
  "two-lower": [12, 2, 2],
  "one-lower": [13, 1, 2],
  "upper-only": [14, 0, 2],
  "lower-only": [0, 14, 2],
  "three-upper": [3, 11, 2],
};
if (!["baseline", "candidate"].includes(policy))
  throw new Error("Unknown policy");
process.env.BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED =
  policy === "candidate" ? "1" : "0";
delete process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED;
const { createServer } = await import(
  pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js")).href
);
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { middlewareMode: true },
  appType: "custom",
});
const randomSource = (initial) => {
  let seed = initial;
  return () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
};
// Independent benchmark expectations, including categories made impossible by size.
const expectedTarget = (upper, lower) => {
  const n = upper + lower;
  if (n < 4) return null;
  const p = upper / n;
  let mixed = (Math.sqrt(1 + 12 * p * (1 - p)) - 1) / 3;
  if (upper < 4 && lower < 4) {
    if (upper !== lower || upper < 2) return null;
    mixed = 1;
  } else if (upper < 4) mixed = 2 * p;
  else if (lower < 4) mixed = 2 * (1 - p);
  if (mixed > 0 && (upper < 2 || lower < 2)) return null;
  return { UPPER: p - mixed / 2, MIXED: mixed, LOWER: 1 - p - mixed / 2 };
};
try {
  const { runBalancedCandidateWithProductionFallback } =
    await server.ssrLoadModule(
      "/src/lib/matchmaking/v3/balancedCandidateAcceptance.ts",
    );
  const { getBalancedQueueDeferralReason } =
    policy === "candidate"
      ? await server.ssrLoadModule(
          "/src/lib/matchmaking/balancedMatchTypeQueue.ts",
        )
      : {};
  const { buildBalancedMatchTypeContext } =
    policy === "candidate"
      ? await server.ssrLoadModule(
          "/src/lib/matchmaking/v3/balancedMatchTypes.ts",
        )
      : {};
  const {
    buildSocialVarietySnapshot,
    buildSocialVarietyContext,
    getSocialVarietyCoverage,
  } = await server.ssrLoadModule("/src/lib/matchmaking/v3/socialVariety.ts");
  const { calculateRestTurnsForPlayer } = await server.ssrLoadModule(
    "/src/lib/matchmaking/restTurns.ts",
  );
  const { scoreSocialHorizon321 } = await server.ssrLoadModule(
    "/src/lib/matchmaking/v3/socialHorizonCoverageScoring.ts",
  );
  const { getStandingPointsForTeam } = await server.ssrLoadModule(
    "/src/lib/sessionStandings.ts",
  );
  const { calculateNoCatchUpMatchmakingCredit } = await server.ssrLoadModule(
    "/src/lib/matchmaking/matchmakingCredit.ts",
  );
  const { getPartitionBalanceGap } = await server.ssrLoadModule(
    "/src/lib/matchmaking/v3/balance.ts",
  );
  const { createMatchmakingSearchBudget } = await server.ssrLoadModule(
    "/src/lib/matchmaking/v3/searchBudget.ts",
  );
  const { SessionMode, SessionType } = await server.ssrLoadModule(
    "/src/types/enums.ts",
  );
  fs.mkdirSync(outputDirectory, { recursive: true });
  const runs = [];
  for (const name of selectedCases)
    for (const metric of metrics)
      for (const rest of restSettings)
        for (const profile of profiles)
          for (const seed of seeds) {
            const [upper, lower, courtCount] = cases[name];
            const randomFn = randomSource(seed);
            const scoreRandom = randomSource(seed + 10000);
            const players = [];
            for (const [count, side] of [
              [upper, "UPPER"],
              [lower, "LOWER"],
            ])
              for (let index = 0; index < count; index++) {
                const strengthStep =
                  profile === "flat"
                    ? 0
                    : metric === "ELO"
                      ? profile === "wide"
                        ? 90
                        : 8
                      : profile === "wide"
                        ? 1.5
                        : 0.15;
                players.push({
                  userId: `${side}-${index + 1}`,
                  gender: side === "UPPER" ? "MALE" : "FEMALE",
                  partnerPreference: side === "UPPER" ? "OPEN" : "FEMALE_FLEX",
                  mixedSideOverride: null,
                  strength:
                    (metric === "ELO" ? 1000 : 10) +
                    (((index + (seed % 5) + (side === "LOWER" ? 1 : 0)) %
                      Math.max(upper, lower)) -
                      Math.max(upper, lower) / 2) *
                      strengthStep,
                  pointDiff: 0,
                  matchesPlayed: 0,
                  matchmakingBaseline: 0,
                  matchmakingCredit: 0,
                  availableSince: new Date("2026-11-17T00:00:00Z"),
                  restTurns: 0,
                  isPaused: false,
                  isBusy: false,
                  lastPartnerId: null,
                });
              }
            const byId = new Map(
              players.map((player) => [player.userId, player]),
            );
            const arriving = lifecycle
              ? players.findLast((player) => player.gender === "FEMALE")
              : null;
            if (arriving) arriving.isPaused = true;
            const lifecycleEvents = [];
            const history = [],
              active = new Map(),
              timings = [],
              outcomes = {},
              checkpoints = {},
              trace = [];
            let assignmentNumber = 0,
              optionalQueueFailures = 0,
              queueDeferrals = 0,
              backToBack = 0,
              repeatAssignments = 0,
              maximumWait = 0,
              failed = null;
            const reasonCounts = {};
            const choose = (count, optional = false) => {
              const start = performance.now();
              const options = {
                courtCount: count,
                sessionMode: SessionMode.MIXICANO,
                sessionType: SessionType[metric],
                respectPlayerRest: rest,
                socialStructuralOpportunityConstraints: [],
                completedMatches: history,
                socialHistoryMatches: [...history, ...active.values()],
                randomFn,
                searchBudget: createMatchmakingSearchBudget(),
              };
              const run = runBalancedCandidateWithProductionFallback({
                candidatePlayers: players,
                options,
              });
              timings.push(performance.now() - start);
              outcomes[run.decision.outcome] =
                (outcomes[run.decision.outcome] ?? 0) + 1;
              for (const reason of run.decision.reasonCodes)
                reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
              trace.push({
                at: history.length,
                kind: optional ? "queue" : "court",
                waiting: players
                  .filter((player) => !player.isBusy)
                  .map((player) => ({
                    id: player.userId,
                    n: player.matchesPlayed,
                    r: player.restTurns,
                  })),
                chosen: run.result.selection?.selections.map((court) => ({
                  ids: court.ids,
                  partition: court.partition,
                  gap: court.balanceGap,
                  type: court.balancedMatchType,
                  rest: run.result.chosenImmediateReplayCount,
                })),
                distribution: run.decision.matchTypeDistribution,
                minReplay: run.result.bestImmediateReplayCount,
              });
              if (
                !run.result.selection ||
                run.result.selection.selections.length !== count
              ) {
                if (optional) optionalQueueFailures++;
                else
                  failed = {
                    at: history.length,
                    reasons: run.decision.reasonCodes,
                  };
                return [];
              }
              if (
                !run.result.fairnessCertified ||
                !run.result.scheduleCertified ||
                !run.result.starvationCertified ||
                !run.result.balanceCertified ||
                (rest &&
                  (!run.result.replayCertified ||
                    !run.result.coverageGateCertified))
              )
                throw new Error("Uncertified hard scheduling contract");
              for (const court of run.result.selection.selections) {
                const recomputed = getPartitionBalanceGap(
                  court.partition,
                  byId,
                );
                const guard = court.balanceGuardrail;
                if (
                  recomputed === null ||
                  Math.abs(recomputed - court.balanceGap) > 1e-8 ||
                  !guard ||
                  recomputed > guard.allowedMaxBalanceGap + 1e-8
                )
                  throw new Error("Invalid native balance or envelope");
              }
              return run.result.selection.selections;
            };
            const recordStart = (ids) => {
              for (const id of ids) {
                const player = byId.get(id);
                if (player.matchesPlayed > 0) {
                  repeatAssignments++;
                  if (player.restTurns === 0) backToBack++;
                }
                maximumWait = Math.max(maximumWait, player.restTurns);
              }
            };
            const assign = (court, selection) => {
              const partition = selection.partition;
              const ids = [...partition.team1, ...partition.team2];
              if (
                new Set(ids).size !== 4 ||
                ids.some((id) => byId.get(id).isBusy || byId.get(id).isPaused)
              )
                throw new Error("Illegal busy/duplicate assignment");
              const socialVariety = buildSocialVarietySnapshot(
                partition,
                players,
              );
              if (!socialVariety.courtType)
                throw new Error("Illegal Mixed teams");
              const activeUpper = players.filter(
                (player) => !player.isPaused && player.gender === "MALE",
              ).length;
              const activeLower = players.filter(
                (player) => !player.isPaused && player.gender === "FEMALE",
              ).length;
              const benchmarkTarget = expectedTarget(activeUpper, activeLower);
              if (
                selection.balancedMatchType &&
                benchmarkTarget &&
                Object.keys(benchmarkTarget).some(
                  (category) =>
                    Math.abs(
                      selection.balancedMatchType.target[category] -
                        benchmarkTarget[category],
                    ) > 1e-8,
                )
              )
                throw new Error(
                  "Assignment target disagrees with independent fair target",
                );
              const committedTarget =
                selection.balancedMatchType ??
                (policy === "candidate"
                  ? buildBalancedMatchTypeContext(players, [
                      ...history,
                      ...active.values(),
                    ]).snapshot(partition)
                  : null);
              active.set(court, {
                id: `a${assignmentNumber++}`,
                ...partition,
                socialVariety,
                nativeGap: selection.balanceGap,
                ceilingFeasible: selection.balanceGuardrail?.ceilingFeasible,
                benchmarkTarget,
                benchmarkMixedTargetByPlayer: Object.fromEntries(
                  ids.map((id) => [
                    id,
                    benchmarkTarget
                      ? (benchmarkTarget.MIXED * (activeUpper + activeLower)) /
                        (2 *
                          (byId.get(id).gender === "MALE"
                            ? activeUpper
                            : activeLower))
                      : 0,
                  ]),
                ),
                ...(committedTarget
                  ? { balancedMatchType: committedTarget }
                  : {}),
              });
              if (court !== -1) recordStart(ids);
              for (const id of ids) {
                const player = byId.get(id);
                player.isBusy = true;
                player.arrivalPriorityAt = null;
              }
            };
            if (opening === "joint")
              choose(courtCount).forEach((selection, court) =>
                assign(court, selection),
              );
            else
              for (let court = 0; court < courtCount && !failed; court++)
                choose(1).forEach((selection) => assign(court, selection));
            const tryQueue = () => {
              if (
                scheduling !== "queue" ||
                active.has(-1) ||
                assignmentNumber >= matches ||
                players.filter((player) => !player.isBusy && !player.isPaused)
                  .length < 4
              )
                return;
              const selections = choose(1, true);
              const proposed = selections[0];
              const deferral =
                proposed &&
                deferConstrainedQueue &&
                getBalancedQueueDeferralReason?.({
                  players,
                  availablePlayerIds: new Set(
                    players
                      .filter((player) => !player.isBusy && !player.isPaused)
                      .map((player) => player.userId),
                  ),
                  partition: proposed.partition,
                  reasonJson: JSON.stringify({
                    balancedMatchType: proposed.balancedMatchType,
                  }),
                  history: [...history, ...active.values()],
                });
              if (deferral) {
                queueDeferrals++;
                trace.at(-1).queueDeferral = deferral;
                return;
              }
              selections.forEach((selection) => assign(-1, selection));
            };
            tryQueue();
            const record = () => {
              const counts = { UPPER: 0, MIXED: 0, LOWER: 0 };
              const expected = { UPPER: 0, MIXED: 0, LOWER: 0 };
              const targetedActual = { UPPER: 0, MIXED: 0, LOWER: 0 };
              let targetedMatches = 0;
              const individual = Object.fromEntries(
                players.map((player) => [
                  player.userId,
                  { games: player.matchesPlayed, mixed: 0, expectedMixed: 0 },
                ]),
              );
              for (const match of history) {
                counts[match.socialVariety.courtType]++;
                if (match.benchmarkTarget) {
                  targetedMatches++;
                  targetedActual[match.socialVariety.courtType]++;
                  for (const category of Object.keys(expected))
                    expected[category] += match.benchmarkTarget[category];
                }
                for (const id of [...match.team1, ...match.team2])
                  individual[id].expectedMixed +=
                    match.benchmarkMixedTargetByPlayer[id];
                if (match.socialVariety.courtType === "MIXED")
                  for (const id of [...match.team1, ...match.team2])
                    individual[id].mixed++;
              }
              const context = buildSocialVarietyContext(players, history, {
                sessionMode: SessionMode.MIXICANO,
              });
              const coverage = getSocialVarietyCoverage(context);
              const relation = Object.fromEntries(
                ["courtmates", "partners", "opponents"].map((facet) => [
                  facet,
                  [...context.playersByUserId.values()].reduce(
                    (sum, player) => {
                      const possible = player[facet].opportunities;
                      return (
                        sum +
                        (possible.size
                          ? [...possible].filter(
                              (id) => (player[facet].counts.get(id) ?? 0) > 0,
                            ).length / possible.size
                          : 1)
                      );
                    },
                    0,
                  ) / players.length,
                ]),
              );
              const gameCounts = players.map((player) => player.matchesPlayed);
              return {
                counts,
                distribution: {
                  expected,
                  actualPercent: Object.fromEntries(
                    Object.entries(counts).map(([type, count]) => [
                      type,
                      count / history.length,
                    ]),
                  ),
                  targetPercent: targetedMatches
                    ? Object.fromEntries(
                        Object.entries(expected).map(([type, count]) => [
                          type,
                          count / targetedMatches,
                        ]),
                      )
                    : null,
                  totalVariation: targetedMatches
                    ? Object.keys(expected).reduce(
                        (sum, type) =>
                          sum + Math.abs(targetedActual[type] - expected[type]),
                        0,
                      ) /
                      (2 * targetedMatches)
                    : null,
                  untargetedMatches: history.length - targetedMatches,
                },
                individual,
                minGames: Math.min(...gameCounts),
                maxGames: Math.max(...gameCounts),
                activeEffectiveGames: (() => {
                  const activeCounts = players
                    .filter((player) => !player.isPaused)
                    .map((player) =>
                      Math.max(
                        player.matchesPlayed,
                        player.matchmakingBaseline,
                      ),
                    );
                  return {
                    min: Math.min(...activeCounts),
                    max: Math.max(...activeCounts),
                  };
                })(),
                coverage: relation,
                rawCoverage: coverage.score,
                socialCoverage: scoreSocialHorizon321(context).score,
                balance: {
                  mean:
                    history.reduce((sum, match) => sum + match.nativeGap, 0) /
                    history.length,
                  max: Math.max(...history.map((match) => match.nativeGap)),
                  unavoidableRatingCeiling: history.filter(
                    (match) => match.ceilingFeasible === false,
                  ).length,
                },
                backToBackRate: repeatAssignments
                  ? backToBack / repeatAssignments
                  : 0,
                maximumWait,
              };
            };
            for (let event = 0; event < matches && !failed; event++) {
              const court = event % courtCount,
                finished = active.get(court);
              if (!finished) {
                failed = { at: history.length, reasons: ["NO_LIVE_COURT"] };
                break;
              }
              active.delete(court);
              const completedAt = new Date(
                Date.UTC(2026, 10, 17) + (event + 1) * 300000,
              );
              history.push({ ...finished, completedAt });
              const teamAverage = (team) =>
                team.reduce((sum, id) => sum + byId.get(id).strength, 0) / 2;
              const expectedTeam1 =
                metric === "ELO"
                  ? 1 /
                    (1 +
                      10 **
                        ((teamAverage(finished.team2) -
                          teamAverage(finished.team1)) /
                          400))
                  : 0.5;
              const winnerTeam = scoreRandom() < expectedTeam1 ? 1 : 2;
              const loserScore = 11 + Math.floor(scoreRandom() * 10);
              const expectedWinner =
                winnerTeam === 1 ? expectedTeam1 : 1 - expectedTeam1;
              const delta = Math.round(
                32 * (1 - expectedWinner) * (1 + (21 - loserScore - 2) * 0.05),
              );
              for (const team of [finished.team1, finished.team2])
                for (const id of team) {
                  const player = byId.get(id);
                  player.isBusy = false;
                  player.matchesPlayed++;
                  player.matchmakingBaseline =
                    player.matchesPlayed + player.matchmakingCredit;
                  player.availableSince = completedAt;
                  player.lastPartnerId = team.find((peer) => peer !== id);
                  const teamNumber = team === finished.team1 ? 1 : 2;
                  const won = teamNumber === winnerTeam;
                  if (evolving) {
                    player.pointDiff += (won ? 1 : -1) * (21 - loserScore);
                    player.strength +=
                      metric === "ELO"
                        ? won
                          ? delta
                          : -delta
                        : getStandingPointsForTeam(winnerTeam, teamNumber);
                  }
                }
              for (const player of players)
                player.restTurns = calculateRestTurnsForPlayer(player, history);
              if (arriving && history.length === 6) {
                const credit = calculateNoCatchUpMatchmakingCredit({
                  player: {
                    matchesPlayed: arriving.matchesPlayed,
                    matchmakingMatchesCredit: arriving.matchmakingCredit,
                  },
                  activePlayers: players
                    .filter((player) => !player.isPaused)
                    .map((player) => ({
                      matchesPlayed: player.matchesPlayed,
                      matchmakingMatchesCredit: player.matchmakingCredit,
                    })),
                });
                arriving.matchmakingCredit = credit;
                arriving.matchmakingBaseline = arriving.matchesPlayed + credit;
                arriving.isPaused = false;
                arriving.availableSince = completedAt;
                arriving.arrivalPriorityAt = completedAt;
                arriving.restTurns = 0;
                lifecycleEvents.push({
                  at: history.length,
                  type: "arrival",
                  id: arriving.userId,
                  credit,
                });
              }
              if (lifecycle && history.length === 14) {
                const leaving = players.find(
                  (player) =>
                    player.gender === "MALE" &&
                    !player.isBusy &&
                    !player.isPaused,
                );
                if (leaving) {
                  leaving.isPaused = true;
                  lifecycleEvents.push({
                    at: history.length,
                    type: "departure",
                    id: leaving.userId,
                  });
                }
              }
              const queuedIds = new Set(
                active.has(-1)
                  ? [...active.get(-1).team1, ...active.get(-1).team2]
                  : [],
              );
              maximumWait = Math.max(
                maximumWait,
                ...players
                  .filter(
                    (player) =>
                      (!player.isBusy || queuedIds.has(player.userId)) &&
                      !player.isPaused,
                  )
                  .map((player) => player.restTurns),
              );
              if ([12, 21, 45, 50, 100, matches].includes(history.length))
                checkpoints[history.length] = record();
              if (scheduling === "joint") {
                if (active.size === 0 && assignmentNumber < matches)
                  choose(
                    Math.min(courtCount, matches - assignmentNumber),
                  ).forEach((selection, nextCourt) =>
                    assign(nextCourt, selection),
                  );
              } else {
                if (active.has(-1)) {
                  recordStart([
                    ...active.get(-1).team1,
                    ...active.get(-1).team2,
                  ]);
                  active.set(court, active.get(-1));
                  active.delete(-1); // Activate the existing reservation without recounting it.
                } else if (assignmentNumber < matches)
                  choose(1).forEach((selection) => assign(court, selection));
                tryQueue();
              }
            }
            const sorted = [...timings].sort((a, b) => a - b);
            const result = {
              name,
              upper,
              lower,
              courtCount,
              metric,
              rest,
              profile,
              seed,
              policy,
              evolving,
              lifecycle,
              lifecycleEvents,
              scheduling,
              opening,
              matches: history.length,
              failed,
              outcomes,
              reasonCounts,
              optionalQueueFailures,
              queueDeferrals,
              deferConstrainedQueue,
              trace,
              timings: {
                mean: timings.reduce((sum, x) => sum + x, 0) / timings.length,
                p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
                max: sorted.at(-1),
              },
              checkpoints,
            };
            runs.push(result);
            fs.writeFileSync(
              path.join(
                outputDirectory,
                `${policy}-${name}-${metric}-${rest}-${profile}-${seed}.json`,
              ),
              JSON.stringify(result, null, 2),
            );
            console.log(
              JSON.stringify({
                name,
                metric,
                rest,
                profile,
                seed,
                policy,
                completed: history.length,
                failed,
                counts: checkpoints[history.length]?.counts,
                outcomes,
                p95: result.timings.p95,
              }),
            );
          }
  fs.writeFileSync(
    path.join(outputDirectory, `${policy}-summary.json`),
    JSON.stringify(
      {
        policy,
        root,
        seeds,
        matches,
        evolving,
        lifecycle,
        deferConstrainedQueue,
        scheduling,
        opening,
        provenance,
        sourceStable: sourceHash() === provenance.engineHash,
        runs,
      },
      null,
      2,
    ),
  );
  if (sourceHash() !== provenance.engineHash)
    throw new Error(
      "Engine source changed during the benchmark; retain outputs as diagnostics only",
    );
} finally {
  await server.close();
}
