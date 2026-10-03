import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const parseSeeds = (raw, fallback) => raw ? raw.split(",").map((item) => Number(item.trim())).filter(Number.isFinite) : fallback;

const pilot = has("--pilot");
const seeds = parseSeeds(valueAfter("--seeds"), pilot ? [1] : [1, 4729, 104729, 130363, 2097593]);
const wideSeeds = parseSeeds(valueAfter("--wide-seeds"), pilot ? [] : [30011, 65537, 999983]);
const baselineWorktree = valueAfter("--baseline-worktree", process.env.BENCHMARK_BASELINE_WORKTREE);
const strictWorktree = valueAfter("--strict-worktree", process.env.BENCHMARK_STRICT_WORKTREE);
const suppliedBaselineJson = valueAfter("--baseline-json");
const suppliedStrictJson = valueAfter("--strict-json");
const suppliedTypeFirstJson = valueAfter("--type-first-json");
const suppliedCurrentJson = valueAfter("--current-json");
const suppliedCurrentMarkdown = valueAfter("--current-markdown");
const skipBaseline = has("--skip-baseline");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks"));
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const testFile = "src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts";
const coreEnginePaths = [
  "src/lib/matchmaking/v3/socialBatch.ts",
  "src/lib/matchmaking/v3/scoring.ts",
  "src/lib/matchmaking/v3/singleCourt.ts",
  "src/lib/matchmaking/v3/balanceGuardrail.ts",
  "src/lib/matchmaking/v3/types.ts",
];
const sharedVarietyPaths = ["src/lib/matchmaking/v3/socialVariety.ts"];
const measurementPaths = [
  "src/lib/matchmaking/v3/socialCoverageBenchmark.ts",
  "src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts",
  "src/lib/matchmaking/v3/benchmarkBalanceFeasibility.ts",
  "scripts/run-matchmaking-benchmark.mjs",
];
const seedText = seeds.join(",");
const wideSeedText = wideSeeds.join(",");
const runTag = pilot ? "pilot" : "full";

if (!seeds.length || seeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error("--seeds must contain one or more safe integer seeds, comma-separated.");
if (wideSeeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error("--wide-seeds must contain safe integer seeds, comma-separated.");

mkdirSync(outputDir, { recursive: true });

function hashFiles(workdir, paths) {
  const hash = createHash("sha256");
  for (const relativePath of paths) {
    const absolutePath = path.join(workdir, relativePath);
    hash.update(relativePath);
    hash.update(existsSync(absolutePath) ? readFileSync(absolutePath) : "<missing>");
  }
  return hash.digest("hex");
}

function worktreeIsDirty(workdir) {
  const result = spawnSync("git", ["status", "--porcelain=v1"], { cwd: workdir, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not inspect dirty status in ${workdir}.`);
  return result.stdout.trim().length > 0;
}

function trackedChangedPaths(workdir, paths) {
  const result = spawnSync("git", ["diff", "--name-only", "HEAD", "--", ...paths], { cwd: workdir, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not inspect tracked source changes in ${workdir}.`);
  return result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function runIn(workdir, label, enginePolicy, baselineJson = "", policyLabel = enginePolicy === "baseline" ? "entropy-first" : enginePolicy === "strict" ? "strict-cadence" : "replay-envelope-best-plus-one") {
  const jsonPath = path.join(outputDir, `social-coverage-${runTag}-${label}.json`);
  const markdownPath = path.join(outputDir, `social-coverage-${runTag}-${label}.md`);
  const commitSha = gitHead(workdir);
  const sourceRevision = commitSha;
  const sourceProvenance = {
    commitSha,
    workingTreeDirty: worktreeIsDirty(workdir),
    workingTreeNote: enginePolicy === "baseline"
      ? "Benchmark instrumentation is copied into the original entropy-first worktree. socialBatch.ts and scoring.ts are unchanged from the baseline commit; socialVariety.ts contains only the added coverage API."
      : enginePolicy === "strict"
        ? "Only benchmark measurement files are copied into the strict-policy worktree; production engine files remain at the recorded strict commit."
        : "Current checkout includes the strongest-class, Balanced-envelope, frozen best-replay-plus-one policy and benchmark instrumentation; hashes identify the exact sources used.",
    policyLabel,
    coreEngineTrackedDiffPaths: trackedChangedPaths(workdir, coreEnginePaths),
    sharedVarietyTrackedDiffPaths: trackedChangedPaths(workdir, sharedVarietyPaths),
    measurementHarnessTrackedDiffPaths: trackedChangedPaths(workdir, measurementPaths),
    engineSourceSha256: hashFiles(workdir, [
      "src/lib/matchmaking/v3/socialBatch.ts",
      "src/lib/matchmaking/v3/scoring.ts",
      "src/lib/matchmaking/v3/singleCourt.ts",
      "src/lib/matchmaking/v3/balanceGuardrail.ts",
      "src/lib/matchmaking/v3/types.ts",
      "src/lib/matchmaking/v3/socialVariety.ts",
    ]),
    measurementHarnessSha256: hashFiles(workdir, measurementPaths),
  };
  const env = {
    ...process.env,
    RUN_SOCIAL_COVERAGE_BENCHMARK: "1",
    BENCHMARK_SEEDS: seedText,
    BENCHMARK_WIDE_SEEDS: wideSeedText,
    BENCHMARK_INCLUDE_WIDE: wideSeeds.length ? "1" : "0",
    BENCHMARK_ENGINE_POLICY: enginePolicy,
    BENCHMARK_SOURCE_REVISION: sourceRevision,
    BENCHMARK_SOURCE_PROVENANCE: JSON.stringify(sourceProvenance),
    BENCHMARK_OUTPUT_JSON: jsonPath,
    BENCHMARK_OUTPUT_MARKDOWN: markdownPath,
    ...(baselineJson ? { BENCHMARK_BASELINE_JSON: baselineJson } : {}),
  };
  const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
    cwd: workdir,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return { jsonPath, markdownPath };
}

function copyHarness(workdir) {
  const relativePaths = [
    testFile,
    "src/lib/matchmaking/v3/socialCoverageBenchmark.ts",
    "src/lib/matchmaking/v3/benchmarkBalanceFeasibility.ts",
    "scripts/run-matchmaking-benchmark.mjs",
  ];
  for (const relativePath of relativePaths) {
    const destination = path.join(workdir, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, relativePath), destination);
  }
}

function gitHead(workdir) {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: workdir, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

let baselineJson = suppliedBaselineJson ? path.resolve(suppliedBaselineJson) : "";
if (!skipBaseline && !baselineJson && baselineWorktree) {
  const resolvedBaseline = path.resolve(baselineWorktree);
  if (gitHead(resolvedBaseline) !== "de0254f84adef7414b512e3d3fd936033d65bef8") throw new Error("The entropy-first baseline worktree must resolve to de0254f84adef7414b512e3d3fd936033d65bef8.");
  copyHarness(resolvedBaseline);
  baselineJson = runIn(resolvedBaseline, "baseline", "baseline", "", "entropy-first").jsonPath;
}

let strictJson = suppliedStrictJson ? path.resolve(suppliedStrictJson) : "";
if (!strictJson && strictWorktree) {
  const resolvedStrict = path.resolve(strictWorktree);
  if (gitHead(resolvedStrict) !== "93262f36336b9533ba96b4e4bec5d7e8061eef6e") throw new Error("The strict-cadence comparison worktree must resolve to 93262f36336b9533ba96b4e4bec5d7e8061eef6e.");
  copyHarness(resolvedStrict);
  strictJson = runIn(resolvedStrict, "strict", "strict", "", "strict-cadence").jsonPath;
}

const current = suppliedCurrentJson
  ? { jsonPath: path.resolve(suppliedCurrentJson), markdownPath: suppliedCurrentMarkdown ? path.resolve(suppliedCurrentMarkdown) : null }
  : runIn(root, "current", "current", baselineJson, "replay-envelope-best-plus-one");
const report = JSON.parse(readFileSync(current.jsonPath, "utf8"));
const baselineReport = baselineJson && existsSync(baselineJson) ? JSON.parse(readFileSync(baselineJson, "utf8")) : null;
const strictReport = strictJson && existsSync(strictJson) ? JSON.parse(readFileSync(strictJson, "utf8")) : null;
const typeFirstJson = suppliedTypeFirstJson ? path.resolve(suppliedTypeFirstJson) : "";
const typeFirstReport = typeFirstJson && existsSync(typeFirstJson) ? JSON.parse(readFileSync(typeFirstJson, "utf8")) : null;
const filterRequestedSessions = (policyReport) => policyReport ? {
  ...policyReport,
  sessions: policyReport.sessions.filter((session) =>
    session.profile === "narrow" ? seeds.includes(session.seed) : wideSeeds.includes(session.seed)),
} : null;
const matchedBaselineReport = filterRequestedSessions(baselineReport);
const matchedStrictReport = filterRequestedSessions(strictReport);
const matchedTypeFirstReport = filterRequestedSessions(typeFirstReport);
const sessionTypes = ["SOCIAL_MIX", "POINTS", "ELO"];
const labels = { SOCIAL_MIX: "Social", POINTS: "Balanced Points", ELO: "Balanced Rating/Elo" };
if (baselineReport && baselineReport.sourceProvenance?.policyLabel && baselineReport.sourceProvenance.policyLabel !== "entropy-first") throw new Error("--baseline-json must name an entropy-first benchmark artifact.");
if (strictReport && strictReport.sourceProvenance?.policyLabel && strictReport.sourceProvenance.policyLabel !== "strict-cadence") throw new Error("--strict-json must name a strict-cadence benchmark artifact.");
if (typeFirstReport && typeFirstReport.sourceProvenance?.policyLabel && typeFirstReport.sourceProvenance.policyLabel !== "type-entropy-first") throw new Error("--type-first-json must name a type-entropy-first benchmark artifact.");
if (report.sourceProvenance?.policyLabel && report.sourceProvenance.policyLabel !== "replay-envelope-best-plus-one") throw new Error("The newly measured report must be labeled replay-envelope-best-plus-one.");
const expectedSessionKeys = [
  ...seeds.flatMap((seed) => sessionTypes.map((sessionType) => `narrow:${sessionType}:${seed}`)),
  ...wideSeeds.flatMap((seed) => ["POINTS", "ELO"].map((sessionType) => `wide:${sessionType}:${seed}`)),
].sort();
function assertComparableReport(policyName, policyReport) {
  if (!policyReport) return;
  const sessionKeys = policyReport.sessions.map((session) => `${session.profile}:${session.sessionType}:${session.seed}`).sort();
  if (JSON.stringify(sessionKeys) !== JSON.stringify(expectedSessionKeys)) {
    throw new Error(`${policyName} artifact does not contain the exact requested profile/format/seed sessions. Expected ${expectedSessionKeys.length}, found ${sessionKeys.length}.`);
  }
  const setupFields = ["sessionMode", "courts", "roster", "completionSchedule", "checkpoints", "coverageHistory", "restDefinition", "skillProfiles", "pointDiff"];
  for (const field of setupFields) {
    if (JSON.stringify(policyReport.setup?.[field]) !== JSON.stringify(report.setup?.[field])) {
      throw new Error(`${policyName} artifact has a different ${field} definition than the current run.`);
    }
  }
  for (const session of policyReport.sessions) {
    if (session.checkpoints?.["20"]?.completedMatches !== 20 || session.checkpoints?.["400"]?.completedMatches !== 400 ||
        session.completedMatchTypes?.length !== 400 || session.externalCompletionSchedule?.length !== 400) {
      throw new Error(`${policyName} session ${session.profile}/${session.sessionType}/seed ${session.seed} does not have exact completed-only 20/400 checkpoints and 400 schedule events.`);
    }
  }
}
for (const [policyName, policyReport] of [
  ["entropy-first", matchedBaselineReport],
  ["strict-cadence", matchedStrictReport],
  ["type-entropy-first", matchedTypeFirstReport],
  ["replay-envelope-best-plus-one", filterRequestedSessions(report)],
]) assertComparableReport(policyName, policyReport);
const comparisonReports = [
  ["entropy-first", matchedBaselineReport],
  ["strict-cadence", matchedStrictReport],
  ["type-entropy-first", matchedTypeFirstReport],
].filter(([, policyReport]) => policyReport);
for (const [policyName, historical] of comparisonReports) {
  const historicalByKey = new Map(historical.sessions.map((session) => [`${session.profile}:${session.sessionType}:${session.seed}`, session]));
  for (const session of report.sessions) {
    const oldSession = historicalByKey.get(`${session.profile}:${session.sessionType}:${session.seed}`);
    if (!oldSession) continue;
    if (JSON.stringify(oldSession.externalCompletionSchedule) !== JSON.stringify(session.externalCompletionSchedule)) {
      throw new Error(`${policyName} schedule differs for ${session.profile}/${session.sessionType}/seed ${session.seed}.`);
    }
  }
}
const percent = (value) => value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
const mean = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
const populationStdDev = (items) => {
  const average = mean(items);
  return average === null ? null : Math.sqrt(items.reduce((sum, item) => sum + (item - average) ** 2, 0) / items.length);
};
const aggregate = [];
for (const profile of ["narrow", "wide"]) for (const sessionType of sessionTypes) for (const checkpoint of ["20", "400"]) {
  const sessions = report.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
  if (!sessions.length) continue;
  const average = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
  const cp = sessions.map((session) => session.checkpoints[checkpoint]);
  const sessionVcs = cp.map((item) => item.varietyCoverageScore).filter((value) => value !== null);
  const sessionPartner = cp.map((item) => item.partnerCoverage).filter((value) => value !== null);
  const sessionOpponent = cp.map((item) => item.opponentCoverage).filter((value) => value !== null);
  const sessionCourtmate = cp.map((item) => item.courtmateCoverage).filter((value) => value !== null);
  aggregate.push({
    profile,
    format: labels[sessionType],
    completed: Number(checkpoint),
    varietyCoverageMean: average(sessionVcs),
    varietyCoverageMedian: (() => { const sorted = [...sessionVcs].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; })(),
    varietyCoverageStdDev: populationStdDev(sessionVcs),
    varietyCoverageMin: sessionVcs.length ? Math.min(...sessionVcs) : null,
    varietyCoverageMax: sessionVcs.length ? Math.max(...sessionVcs) : null,
    partnerCoverageMean: average(sessionPartner),
    partnerCoverageStdDev: populationStdDev(sessionPartner),
    opponentCoverageMean: average(sessionOpponent),
    opponentCoverageStdDev: populationStdDev(sessionOpponent),
    courtmateCoverageMean: average(sessionCourtmate),
    courtmateCoverageStdDev: populationStdDev(sessionCourtmate),
    mixedCoverageMean: average(cp.map((item) => item.matchTypeCoverage.MIXED).filter((value) => value !== null)),
    ownSideCoverageMean: average(cp.map((item) => item.matchTypeCoverage.OWN_SIDE).filter((value) => value !== null)),
    completedMixedMatchesMean: average(cp.map((item) => item.completedMatchTypeCounts.MIXED)),
    completedOwnSideMatchesMean: average(cp.map((item) => item.completedMatchTypeCounts.OWN_SIDE)),
    first100OwnSideMatchesMean: average(sessions.map((session) => session.completedMatchTypes.slice(0, 100).filter((type) => type === "OWN_SIDE").length)),
    last100OwnSideMatchesMean: average(sessions.map((session) => session.completedMatchTypes.slice(300, 400).filter((type) => type === "OWN_SIDE").length)),
    relationshipEntropyMean: average(cp.map((item) => item.relationshipEntropyScore).filter((value) => value !== null)),
    matchTypeEntropyMean: average(cp.map((item) => item.matchTypeEntropyScore).filter((value) => value !== null)),
    normalizedEntropyMean: average(cp.map((item) => item.normalizedEntropyScore).filter((value) => value !== null)),
    backToBackRateMean: average(cp.map((item) => item.backToBack.rate)),
    maxAssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.max)),
    maxAssignmentRestGapWorst: cp.length ? Math.max(...cp.map((item) => item.assignmentRestGap.max)) : null,
    meanAssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.mean).filter((value) => value !== null)),
    p95AssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.p95).filter((value) => value !== null)),
    starvationInterventions: cp.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0),
    decisionsWithOverdue: cp.reduce((sum, item) => sum + item.starvation.decisionsWithOverdueAvailable, 0),
    certifiedCounterfactualDecisions: cp.reduce((sum, item) => sum + item.starvation.certifiedCounterfactualDecisions, 0),
    uncertifiedCounterfactualDecisions: cp.reduce((sum, item) => sum + item.starvation.uncertifiedCounterfactualDecisions, 0),
    completedRotationDecisions: cp.reduce((sum, item) => sum + item.starvation.completedRotationDecisions, 0),
    backToBackAssignments: cp.reduce((sum, item) => sum + item.backToBack.count, 0),
    checkpointFairnessSpreadMean: average(cp.map((item) => item.matchCountSpread)),
    maximumFairnessSpreadMean: average(cp.map((item) => item.maximumFairnessSpread)),
    pendingFiveTurnWaits: cp.reduce((sum, item) => sum + item.ongoingAvailableFiveTurnWaits.length + item.inProgressFiveTurnAssignments.length, 0),
  });
}

const policyReports = [
  ...(matchedBaselineReport ? [{ label: "entropy-first", report: matchedBaselineReport }] : []),
  ...(matchedStrictReport ? [{ label: "strict-cadence", report: matchedStrictReport }] : []),
  ...(matchedTypeFirstReport ? [{ label: "type-entropy-first", report: matchedTypeFirstReport }] : []),
  { label: "replay-envelope-best-plus-one", report },
];
const policyComparison = [];
const averageValues = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
const sumValues = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) : null;
const meanAt = (checkpoints, getter) => averageValues(checkpoints.map(getter).filter((value) => typeof value === "number"));
for (const { label: policy, report: policyReport } of policyReports) {
  for (const profile of ["narrow", "wide"]) for (const sessionType of sessionTypes) {
    const sessions = policyReport.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
    if (!sessions.length) continue;
    const checkpoint20 = sessions.map((session) => session.checkpoints["20"]);
    const checkpoint400 = sessions.map((session) => session.checkpoints["400"]);
    const series = sessions.map((session) => session.completedMatchTypes ?? null).filter((value) => Array.isArray(value));
    const replay20 = checkpoint20.map((item) => item.replayEnvelope).filter((item) => item?.policyApplied === true);
    const replay400 = checkpoint400.map((item) => item.replayEnvelope).filter((item) => item?.policyApplied === true);
    const replayApplicable = sessions.some((session) => session.replayEnvelope?.policyApplied === true);
    const hasUncertifiedOverdue = checkpoint400.some((item) => item.starvation.uncertifiedCounterfactualDecisions > 0);
    policyComparison.push({
      policy,
      profile,
      format: labels[sessionType],
      seeds: sessions.map((session) => session.seed),
      ownSideCompletedAt20Mean: averageValues(checkpoint20.map((item) => item.completedMatchTypeCounts?.OWN_SIDE).filter((value) => typeof value === "number")),
      mixedCompletedAt20Mean: averageValues(checkpoint20.map((item) => item.completedMatchTypeCounts?.MIXED).filter((value) => typeof value === "number")),
      ownSideCompletedAt400Mean: averageValues(checkpoint400.map((item) => item.completedMatchTypeCounts?.OWN_SIDE).filter((value) => typeof value === "number")),
      mixedCompletedAt400Mean: averageValues(checkpoint400.map((item) => item.completedMatchTypeCounts?.MIXED).filter((value) => typeof value === "number")),
      first100OwnSideMean: averageValues(series.map((events) => events.slice(0, 100).filter((type) => type === "OWN_SIDE").length)),
      last100OwnSideMean: averageValues(series.map((events) => events.slice(300, 400).filter((type) => type === "OWN_SIDE").length)),
      relationshipCoverage20Mean: averageValues(checkpoint20.map((item) => item.varietyCoverageScore).filter((value) => typeof value === "number")),
      relationshipCoverage400Mean: averageValues(checkpoint400.map((item) => item.varietyCoverageScore).filter((value) => typeof value === "number")),
      partnerCoverage20Mean: meanAt(checkpoint20, (item) => item.partnerCoverage),
      partnerCoverage400Mean: meanAt(checkpoint400, (item) => item.partnerCoverage),
      opponentCoverage20Mean: meanAt(checkpoint20, (item) => item.opponentCoverage),
      opponentCoverage400Mean: meanAt(checkpoint400, (item) => item.opponentCoverage),
      courtmateCoverage20Mean: meanAt(checkpoint20, (item) => item.courtmateCoverage),
      courtmateCoverage400Mean: meanAt(checkpoint400, (item) => item.courtmateCoverage),
      relationshipEntropy400Mean: averageValues(checkpoint400.map((item) => item.relationshipEntropyScore).filter((value) => typeof value === "number")),
      matchTypeEntropy400Mean: averageValues(checkpoint400.map((item) => item.matchTypeEntropyScore).filter((value) => typeof value === "number")),
      normalizedEntropy400Mean: averageValues(checkpoint400.map((item) => item.normalizedEntropyScore).filter((value) => typeof value === "number")),
      relationshipEntropy20Mean: meanAt(checkpoint20, (item) => item.relationshipEntropyScore),
      matchTypeEntropy20Mean: meanAt(checkpoint20, (item) => item.matchTypeEntropyScore),
      normalizedEntropy20Mean: meanAt(checkpoint20, (item) => item.normalizedEntropyScore),
      matchTypeCoverage20: {
        mixedMean: meanAt(checkpoint20, (item) => item.matchTypeCoverage?.MIXED),
        ownSideMean: meanAt(checkpoint20, (item) => item.matchTypeCoverage?.OWN_SIDE),
      },
      matchTypeCoverage400: {
        mixedMean: meanAt(checkpoint400, (item) => item.matchTypeCoverage?.MIXED),
        ownSideMean: meanAt(checkpoint400, (item) => item.matchTypeCoverage?.OWN_SIDE),
      },
      backToBackRate400Mean: averageValues(checkpoint400.map((item) => item.backToBack.rate)),
      backToBackRate20Mean: averageValues(checkpoint20.map((item) => item.backToBack.rate)),
      assignmentRestMean20: meanAt(checkpoint20, (item) => item.assignmentRestGap.mean),
      assignmentRestMean400: meanAt(checkpoint400, (item) => item.assignmentRestGap.mean),
      assignmentRestP9520: meanAt(checkpoint20, (item) => item.assignmentRestGap.p95),
      assignmentRestP95400: meanAt(checkpoint400, (item) => item.assignmentRestGap.p95),
      assignmentRestMax20Worst: checkpoint20.length ? Math.max(...checkpoint20.map((item) => item.assignmentRestGap.max)) : null,
      reachedIdealPlusOne20Mean: meanAt(checkpoint20, (item) => item.reachedIdealPlusOne),
      reachedIdealPlusOne400Mean: meanAt(checkpoint400, (item) => item.reachedIdealPlusOne),
      reachedIdealPlusTwo20Mean: meanAt(checkpoint20, (item) => item.reachedIdealPlusTwo),
      reachedIdealPlusTwo400Mean: meanAt(checkpoint400, (item) => item.reachedIdealPlusTwo),
      maxAssignmentRest400Mean: averageValues(checkpoint400.map((item) => item.assignmentRestGap.max)),
      maxAssignmentRest400Worst: checkpoint400.length ? Math.max(...checkpoint400.map((item) => item.assignmentRestGap.max)) : null,
      matchCountSpread400Mean: averageValues(checkpoint400.map((item) => item.matchCountSpread)),
      maximumFairnessSpread400Mean: averageValues(checkpoint400.map((item) => item.maximumFairnessSpread)),
      matchCountSpread20Mean: meanAt(checkpoint20, (item) => item.matchCountSpread),
      maximumFairnessSpread20Mean: meanAt(checkpoint20, (item) => item.maximumFairnessSpread),
    fiveRestAssignments: sessions.reduce((sum, session) => sum + session.fiveGapEpisodes.length, 0),
      linkedRestZeroReplays: sessions.reduce((sum, session) => sum + session.fiveGapEpisodes.filter((episode) => episode.initiatingReplay !== null).length, 0),
      replayOriginsWithFewerZeroRestAlternative: sessions.reduce((sum, session) => sum + session.fiveGapEpisodes.filter((episode) => episode.initiatingReplay?.betterZeroRestSetsWithoutPlayer > 0).length, 0),
      starvationInterventions: hasUncertifiedOverdue ? null : checkpoint400.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0),
      overdueDecisions: checkpoint400.reduce((sum, item) => sum + item.starvation.decisionsWithOverdueAvailable, 0),
      uncertifiedOverdueDecisions: checkpoint400.reduce((sum, item) => sum + item.starvation.uncertifiedCounterfactualDecisions, 0),
      starvationRateAmongCertified: checkpoint400.reduce((sum, item) => sum + item.starvation.certifiedCounterfactualDecisions, 0)
        ? checkpoint400.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0) /
          checkpoint400.reduce((sum, item) => sum + item.starvation.certifiedCounterfactualDecisions, 0) : null,
      starvationRateWhenOverdue: hasUncertifiedOverdue || checkpoint400.reduce((sum, item) => sum + item.starvation.decisionsWithOverdueAvailable, 0) === 0
        ? null : checkpoint400.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0) /
          checkpoint400.reduce((sum, item) => sum + item.starvation.decisionsWithOverdueAvailable, 0),
      starvationRateAcrossCompletedDecisions: hasUncertifiedOverdue ? null : checkpoint400.reduce((sum, item) => sum + item.starvation.completedRotationDecisions, 0)
        ? checkpoint400.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0) /
          checkpoint400.reduce((sum, item) => sum + item.starvation.completedRotationDecisions, 0) : null,
      replayEnvelopeApplicable: replayApplicable,
      replayEnvelopeCertifiedRefills20: replayApplicable ? sumValues(replay20.map((item) => item.productionReplayEnvelopeCertifiedDecisions)) : null,
      replayEnvelopeCertifiedRefills400: replayApplicable ? sumValues(replay400.map((item) => item.productionReplayEnvelopeCertifiedDecisions)) : null,
      replayEnvelopeUncertifiedRefills400: replayApplicable ? sumValues(replay400.map((item) => item.productionUncertifiedDecisions)) : null,
      replayEnvelopeFullCertifiedRefills400: replayApplicable ? sumValues(replay400.map((item) => item.productionCertifiedDecisions)) : null,
      noStarvationReplayCertifiedRefills400: replayApplicable ? sumValues(replay400.map((item) => item.noStarvationReplayEnvelopeCertifiedDecisions)) : null,
      noStarvationReplayUncertifiedRefills400: replayApplicable ? sumValues(replay400.map((item) => item.noStarvationUncertifiedDecisions)) : null,
      acceptedPlusOneDecisions400: replayApplicable ? sumValues(replay400.map((item) => item.acceptedPlusOneDecisions)) : null,
      acceptedPlusOneRate400: replayApplicable
        ? (() => {
            const certified = sumValues(replay400.map((item) => item.productionReplayEnvelopeCertifiedDecisions)) ?? 0;
            return certified ? (sumValues(replay400.map((item) => item.acceptedPlusOneDecisions)) ?? 0) / certified : null;
          })() : null,
      higherEntropyBeyondAllowanceDecisions400: replayApplicable ? sumValues(replay400.map((item) => item.betterEntropyBeyondAllowanceDecisions)) : null,
      higherEntropyBeyondAllowanceCandidates400: replayApplicable ? sumValues(replay400.map((item) => item.betterEntropyBeyondAllowanceCandidateCount)) : null,
      fivePlusRestEpisodes400: replayApplicable ? sumValues(replay400.map((item) => item.fivePlusCompletedRestEpisodes)) : null,
      fivePlusEpisodesLinkedAcceptedPlusOne400: replayApplicable ? sumValues(replay400.map((item) => item.fivePlusEpisodesLinkedAcceptedPlusOneReplay)) : null,
      fivePlusEpisodesLinkedOtherReplay400: replayApplicable ? sumValues(replay400.map((item) => item.fivePlusEpisodesLinkedOtherRestZeroReplay)) : null,
      fivePlusEpisodesNoReplayOrigin400: replayApplicable ? sumValues(replay400.map((item) => item.fivePlusEpisodesWithoutLinkedRestZeroReplay)) : null,
      narrowSeedsAt100Percent400: profile === "narrow"
        ? sessions.filter((session) => session.checkpoints["400"].varietyCoverageScore === 1).length
        : null,
      missingBalanceEnvelopeRelationships400: sessions.reduce((sum, session) => sum + (session.missingRelationships ?? []).filter((item) => item.classification === "excluded_by_balance_envelope_in_observed_opportunities").length, 0),
      missingReplayAllowanceRelationships400: sessions.reduce((sum, session) => sum + (session.missingRelationships ?? []).filter((item) => item.classification === "replay_allowance_priority_excluded_in_observed_opportunities").length, 0),
      missingAdmissibleButUnchosenRelationships400: sessions.reduce((sum, session) => sum + (session.missingRelationships ?? []).filter((item) => item.classification === "admissible_but_unselected").length, 0),
      missingSoftOrEntropyPriorityRelationships400: sessions.reduce((sum, session) => sum + (session.missingRelationships ?? []).filter((item) =>
        item.classification === "combined_entropy_priority_excluded_in_observed_opportunities" ||
        item.classification === "soft_cadence_priority_excluded_in_observed_opportunities").length, 0),
      sourceProvenance: policyReport.sourceProvenance ?? { commitSha: policyReport.sourceRevision, policyLabel: policy, workingTreeDirty: null },
    typeEntropyOverrideDecisions: sessions.some((session) => session.typePriorityOverrides?.applicable !== false && typeof session.typePriorityOverrides?.decisionsWithLowerZeroTypeTradeoff === "number")
      ? sessions.reduce((sum, session) => sum + (session.typePriorityOverrides?.decisionsWithLowerZeroTypeTradeoff ?? 0), 0) : null,
    certifiedRefillDecisions: sessions.some((session) => session.typePriorityOverrides?.applicable !== false && typeof session.typePriorityOverrides?.certifiedRefillDecisions === "number")
      ? sessions.reduce((sum, session) => sum + (session.typePriorityOverrides?.certifiedRefillDecisions ?? 0), 0) : null,
    typeEntropyOverrideRateAcrossRefills: (() => {
      const applicable = sessions.some((session) => session.typePriorityOverrides?.applicable !== false && typeof session.typePriorityOverrides?.certifiedRefillDecisions === "number");
      if (!applicable) return null;
      const denominators = sessions.reduce((sum, session) => sum + (session.typePriorityOverrides?.certifiedRefillDecisions ?? 0), 0);
      return denominators ? sessions.reduce((sum, session) => sum + (session.typePriorityOverrides?.decisionsWithLowerZeroTypeTradeoff ?? 0), 0) / denominators : null;
    })(),
    selectedMatchTypeGainMean: averageValues(sessions.map((session) => session.typePriorityOverrides?.selectedMatchTypeGainMean).filter((value) => typeof value === "number")),
    selectedRelationshipGainMean: averageValues(sessions.map((session) => session.typePriorityOverrides?.selectedRelationshipGainMean).filter((value) => typeof value === "number")),
  });
  }
}
const comparisonJsonPath = path.join(outputDir, `social-coverage-${runTag}-policy-comparison.json`);
const comparisonMarkdownPath = path.join(outputDir, `social-coverage-${runTag}-policy-comparison.md`);
const comparisonProvenance = {
  aggregationRevision: gitHead(root),
  aggregationWorkingTreeDirty: worktreeIsDirty(root),
  aggregationHarnessSha256: hashFiles(root, measurementPaths),
  currentMeasurementHarnessSha256: report.sourceProvenance?.measurementHarnessSha256 ?? null,
};
writeFileSync(comparisonJsonPath, `${JSON.stringify({ seedCount: seeds.length, seeds, wideSeeds, comparisonProvenance, policies: policyReports.map((item) => item.label), groups: policyComparison }, null, 2)}\n`, "utf8");
const wideMissingRows = policyReports.flatMap(({ label: policy, report: policyReport }) => policyReport.sessions
  .filter((session) => session.profile === "wide" && session.checkpoints?.["400"]?.completedMatches === 400)
  .map((session) => {
    const missing = session.missingRelationships ?? [];
    const list = (classifications) => {
      const selected = missing.filter((item) => classifications.includes(item.classification));
      return selected.length ? selected.map((item) => `${item.players.join("–")} ${item.facet}`).join(", ") : "none";
    };
    return `| ${policy} | ${labels[session.sessionType]} | ${session.seed} | ${list(["excluded_by_balance_envelope_in_observed_opportunities"])} | ${list(["replay_allowance_priority_excluded_in_observed_opportunities", "immediate_replay_priority_excluded_in_observed_opportunities"])} | ${list(["admissible_but_unselected"])} | ${list(["combined_entropy_priority_excluded_in_observed_opportunities", "soft_cadence_priority_excluded_in_observed_opportunities", "relationship_entropy_priority_excluded_in_observed_opportunities"])} |`;
  }));
const comparisonMarkdown = [
  "# Matchmaking policy comparison",
  "",
  `Seeds: ${seeds.join(", ")}. Wide-profile seeds: ${wideSeeds.join(", ") || "none"}. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 20/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.`,
  "",
  `Comparison aggregation revision ${comparisonProvenance.aggregationRevision}; dirty worktree ${comparisonProvenance.aggregationWorkingTreeDirty}; runner/harness SHA-256 ${comparisonProvenance.aggregationHarnessSha256}. Current measured report harness SHA-256 ${comparisonProvenance.currentMeasurementHarnessSha256 ?? "unavailable"}.`,
  "",
  "Policy provenance is per JSON row (commit, dirty state, and source hashes where available). Entropy-first is the original engine; strict-cadence is the 93262f36 engine; type-entropy-first is the preserved bcf07fb policy; replay-envelope-best-plus-one is the new policy: inside the strongest fairness/starvation class and fixed Balanced envelope, freeze best zero-rest count + 1, then maximize combined entropy, then soft-rest cadence.",
  "",
  "| Policy | Profile | Format | VCS20/400 | Partner20/400 | Opponent20/400 | Courtmate20/400 | Rel entropy20/400 | Type entropy20/400 | All entropy20/400 | B2B20/400 | Mean rest20/400 | P95 rest20/400 | Worst max rest20/400 | +1/+2 threshold reaches20/400 | MIXED/OWN_SIDE400 | First100/last100 OWN_SIDE | Fairness spread20/400/max | +1 accepted/certified; +2 rejected decisions/candidates; 5+ linked/total | Starvation changes/overdue (rate; unknown) | 100% seeds | Missing balance/replay/admissible/entropy-soft |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---|---|---|---:|---|",
  ...policyComparison.map((item) => {
    const replayStats = item.replayEnvelopeApplicable
      ? `${item.acceptedPlusOneDecisions400}/${item.replayEnvelopeCertifiedRefills400} (${percent(item.acceptedPlusOneRate400)}); ${item.higherEntropyBeyondAllowanceDecisions400}/${item.higherEntropyBeyondAllowanceCandidates400}; ${item.fivePlusEpisodesLinkedAcceptedPlusOne400}/${item.fivePlusRestEpisodes400}`
      : "n/a (unavailable)";
    const starvationChanges = item.starvationInterventions === null ? "n/a" : String(item.starvationInterventions);
    return `| ${item.policy} | ${item.profile} | ${item.format} | ${percent(item.relationshipCoverage20Mean)}/${percent(item.relationshipCoverage400Mean)} | ${percent(item.partnerCoverage20Mean)}/${percent(item.partnerCoverage400Mean)} | ${percent(item.opponentCoverage20Mean)}/${percent(item.opponentCoverage400Mean)} | ${percent(item.courtmateCoverage20Mean)}/${percent(item.courtmateCoverage400Mean)} | ${percent(item.relationshipEntropy20Mean)}/${percent(item.relationshipEntropy400Mean)} | ${percent(item.matchTypeEntropy20Mean)}/${percent(item.matchTypeEntropy400Mean)} | ${percent(item.normalizedEntropy20Mean)}/${percent(item.normalizedEntropy400Mean)} | ${percent(item.backToBackRate20Mean)}/${percent(item.backToBackRate400Mean)} | ${item.assignmentRestMean20?.toFixed(2) ?? "n/a"}/${item.assignmentRestMean400?.toFixed(2) ?? "n/a"} | ${item.assignmentRestP9520?.toFixed(2) ?? "n/a"}/${item.assignmentRestP95400?.toFixed(2) ?? "n/a"} | ${item.assignmentRestMax20Worst?.toFixed(2) ?? "n/a"}/${item.maxAssignmentRest400Worst?.toFixed(2) ?? "n/a"} | ${item.reachedIdealPlusOne20Mean?.toFixed(1) ?? "n/a"}/${item.reachedIdealPlusOne400Mean?.toFixed(1) ?? "n/a"}; ${item.reachedIdealPlusTwo20Mean?.toFixed(1) ?? "n/a"}/${item.reachedIdealPlusTwo400Mean?.toFixed(1) ?? "n/a"} | ${item.mixedCompletedAt400Mean?.toFixed(1) ?? "n/a"}/${item.ownSideCompletedAt400Mean?.toFixed(1) ?? "n/a"} | ${item.first100OwnSideMean?.toFixed(1) ?? "n/a"}/${item.last100OwnSideMean?.toFixed(1) ?? "n/a"} | ${item.matchCountSpread20Mean?.toFixed(2) ?? "n/a"}/${item.matchCountSpread400Mean?.toFixed(2) ?? "n/a"}/${item.maximumFairnessSpread400Mean?.toFixed(2) ?? "n/a"} | ${replayStats} | ${starvationChanges}/${item.overdueDecisions} (${percent(item.starvationRateWhenOverdue)}; ${item.uncertifiedOverdueDecisions} unknown) | ${item.narrowSeedsAt100Percent400 ?? "n/a"} | ${item.missingBalanceEnvelopeRelationships400}/${item.missingReplayAllowanceRelationships400}/${item.missingAdmissibleButUnchosenRelationships400}/${item.missingSoftOrEntropyPriorityRelationships400} |`;
  }),
  "",
  "Replay-envelope +1 and +2 metrics apply only to the new policy and use certified one-court refills; the opening two-court decision is excluded. A +2 rejection counts a refill when a candidate in the same strongest class and fixed Balanced envelope exceeds the frozen replay allowance and strictly beats the selected combined entropy. Historical artifacts without the counter show n/a. Starvation rates are unknown if any overdue counterfactual was uncertified.",
  "",
  "## Replay-envelope measurements (new policy)",
  "",
  "A linked ≥5-rest episode means the rest period followed an assignment involving a rest-zero player from a certified decision that used the +1 allowance. This is decision-level attribution and does not identify a uniquely marginal player.",
  "",
  "| Profile | Format | Refill / replay certified / full certified | Replay uncertified | +1 selected / rate | +2 higher-entropy rejected decisions / candidates | ≥5-rest total / linked +1 / linked other rest-zero / no replay link | No-starvation replay certified / uncertified |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
  ...policyComparison.filter((item) => item.policy === "replay-envelope-best-plus-one").map((item) => `| ${item.profile} | ${item.format} | ${item.replayEnvelopeCertifiedRefills400 ?? "n/a"} / ${item.replayEnvelopeCertifiedRefills400 ?? "n/a"} / ${item.replayEnvelopeFullCertifiedRefills400 ?? "n/a"} | ${item.replayEnvelopeUncertifiedRefills400 ?? "n/a"} | ${item.acceptedPlusOneDecisions400 ?? "n/a"} / ${percent(item.acceptedPlusOneRate400)} | ${item.higherEntropyBeyondAllowanceDecisions400 ?? "n/a"} / ${item.higherEntropyBeyondAllowanceCandidates400 ?? "n/a"} | ${item.fivePlusRestEpisodes400 ?? "n/a"} / ${item.fivePlusEpisodesLinkedAcceptedPlusOne400 ?? "n/a"} / ${item.fivePlusEpisodesLinkedOtherReplay400 ?? "n/a"} / ${item.fivePlusEpisodesNoReplayOrigin400 ?? "n/a"} | ${item.noStarvationReplayCertifiedRefills400 ?? "n/a"} / ${item.noStarvationReplayUncertifiedRefills400 ?? "n/a"} |`),
  "",
  "## Wide-profile unseen structurally feasible relationships",
  "",
  "Exact names below come from each report’s unchanged structural opportunity denominator. `Replay allowance` means the relationship appeared in the strongest-class, balance-envelope opportunity set but not inside the frozen best-plus-one replay allowance; `admissible but unchosen` uses the policy frontier recorded for that run. Legacy reports retain their original missing-reason labels; the current replay-envelope oracle is not applied retroactively. The JSON retains directed player/facet opportunity counts and every per-seed record.",
  "",
  "| Policy | Format | Seed | Balance-envelope excluded | Replay allowance excluded | Admissible but unchosen | Combined entropy / relationship entropy / soft cadence exclusions |",
  "|---|---|---:|---|---|---|---|",
  ...wideMissingRows,
].join("\n");
writeFileSync(comparisonMarkdownPath, `${comparisonMarkdown}\n`, "utf8");
for (const group of aggregate) {
  const sessions = report.sessions.filter((session) => session.profile === group.profile && session.sessionType === sessionTypes.find((type) => labels[type] === group.format));
  const checkpoint = String(group.completed);
  const unknown = sessions.reduce((sum, session) => sum + session.checkpoints[checkpoint].starvation.uncertifiedCounterfactualDecisions, 0);
  group.starvationRateWhenOverdue = unknown > 0 || group.decisionsWithOverdue === 0
    ? null : group.starvationInterventions / group.decisionsWithOverdue;
  group.starvationRateAcrossCompletedDecisions = unknown > 0 || group.completedRotationDecisions === 0
    ? null : group.starvationInterventions / group.completedRotationDecisions;
  group.starvationRateAmongCertified = group.certifiedCounterfactualDecisions > 0
    ? group.starvationInterventions / group.certifiedCounterfactualDecisions : null;
}
const appendix = [
  "",
  "## Machine-readable compact summary",
  "",
  "```json",
  JSON.stringify({ sourceRevision: report.sourceRevision, sourceProvenance: report.sourceProvenance, primarySeeds: report.seedCount, wideSeeds: report.wideSeedCount, groups: aggregate }, null, 2),
  "```",
  "",
];
const replayEnvelopeWaitClasses = report.sourceProvenance?.policyLabel === "replay-envelope-best-plus-one";
const waitClassColumns = replayEnvelopeWaitClasses
  ? [
      ["fairness_or_mixed_legality", "Fairness / legality"],
      ["starvation_priority", "Starvation"],
      ["balance_guardrail", "Balance envelope"],
      ["immediate_replay_priority_exclusion", "Replay allowance"],
      ["combined_entropy_priority_exclusion", "Combined entropy"],
      ["soft_cadence_priority_exclusion", "Soft cadence"],
      ["cadence_tie_later_tiebreak", "Later tie"],
    ]
  : [
      ["fairness_or_mixed_legality", "Fairness / legality"],
      ["starvation_priority", "Starvation"],
      ["balance_guardrail", "Balance envelope"],
      ["match_type_entropy_priority_exclusion", "Match-type entropy"],
      ["immediate_replay_priority_exclusion", "Immediate replay"],
      ["relationship_entropy_priority_exclusion", "Relationship entropy"],
      ["soft_cadence_priority_exclusion", "Soft cadence"],
      ["cadence_priority_exclusion", "Strict cadence"],
      ["cadence_tie_later_tiebreak", "Later tie"],
    ];
appendix.push(
  "## Seed-to-seed coverage variation (population SD)",
  "",
  "| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|",
  ...aggregate.map((item) => `| ${item.profile} | ${item.format} | ${item.completed} | ${percent(item.varietyCoverageMean)} ± ${percent(item.varietyCoverageStdDev)} | ${percent(item.varietyCoverageMedian)} | ${percent(item.varietyCoverageMin)}–${percent(item.varietyCoverageMax)} | ${percent(item.partnerCoverageStdDev)} | ${percent(item.opponentCoverageStdDev)} | ${percent(item.courtmateCoverageStdDev)} |`),
  "",
  "## Completed ≥5-rest gaps by cohort",
  "",
  `| Profile | Format | Count | ${waitClassColumns.map(([, label]) => label).join(" | ")} | Linked prior rest-zero replay |`,
  `|---|---|---:|${waitClassColumns.map(() => "---:").join("|")}|---:|`,
);
for (const profile of ["narrow", "wide"]) for (const sessionType of sessionTypes) {
  const sessions = report.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
  if (!sessions.length) continue;
  const episodes = sessions.flatMap((session) => session.fiveGapEpisodes);
  const countClass = (classification) => episodes.filter((episode) => episode.currentWaitClassification === classification).length;
  appendix.push(`| ${profile} | ${labels[sessionType]} | ${episodes.length} | ${waitClassColumns.map(([classification]) => countClass(classification)).join(" | ")} | ${episodes.filter((episode) => episode.initiatingReplay !== null).length} |`);
}
const waitStageDescription = report.sourceProvenance?.policyLabel === "replay-envelope-best-plus-one"
  ? "The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player: fairness/legal availability, starvation, balance envelope, frozen replay allowance, combined entropy, soft cadence, or a later tie. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility."
  : "The wait stage columns identify the first active selection layer that lacked a candidate including the deferred player under the recorded policy. Candidate gains and chosen sets/rest vectors are recorded per refill; these are observed finite-session opportunities, not proof of permanent impossibility.";
appendix.push(
  "",
  waitStageDescription,
  "",
  "## Static balance-guardrail dominance for wide skill profile",
  "",
);
for (const sessionType of ["POINTS", "ELO"]) {
  const staticReport = report.sessions.find((session) => session.profile === "wide" && session.sessionType === sessionType)?.staticBalanceFeasibility;
  if (!staticReport) continue;
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    const key = `${relation.facet}:${pair}`;
    distinct.set(key, { facet: relation.facet, pair, minimum: Math.min(distinct.get(key)?.minimum ?? Infinity, relation.minimumSingleCourtBalanceGap ?? Infinity) });
  }
  const pairs = [...distinct.values()].sort((left, right) => left.facet.localeCompare(right.facet) || left.pair.localeCompare(right.pair));
  const allowed = staticReport.allowedMaxBalanceGap;
  const everyPairDominated = pairs.length > 0 && pairs.every((entry) => Number.isFinite(entry.minimum) && allowed !== null && entry.minimum > allowed);
  appendix.push(`### Wide ${labels[sessionType]}: ${pairs.length} excluded feasible facet-pairs; allowed max gap ${allowed}.`);
  appendix.push(`Exhaustive standard Mixed-legal layout enumeration found minimum single-court gap above that window for every listed pair${everyPairDominated ? "; these are guardrail-inadmissible for the fixed wide roster and rules." : "; see per-pair evidence before drawing an exclusion conclusion."}`);
  for (const entry of pairs) appendix.push(`- ${entry.pair} ${entry.facet}: minimum gap ${entry.minimum} > ${allowed}.`);
  appendix.push("");
}
if (matchedBaselineReport) {
  const sumOptimizer = (benchmark) => {
    const sessions = benchmark.sessions.filter((session) => session.profile === "narrow");
    const sum = (key) => sessions.reduce((total, session) => total + session.checkpoints["400"].optimizer[key], 0);
    return {
      sessions: sessions.length,
      directMs: sum("ordinaryProductionWallMs"),
      directCalls: sum("ordinaryProductionCalls"),
      wrapperMs: sum("counterfactualWrapperWallMs"),
      wrapperCalls: sum("counterfactualWrapperCalls"),
      searchLimitCalls: sum("searchLimitCalls"),
      certificationFailures: sum("fairnessCertificateFailures") + sum("starvationCertificateFailures") + sum("balanceCertificateFailures"),
      harnessMs: sessions.reduce((total, session) => total + session.performanceMs, 0),
    };
  };
  const baselineTiming = sumOptimizer(matchedBaselineReport);
  const currentTiming = sumOptimizer(report);
  const baselineDecisions = baselineTiming.directCalls + baselineTiming.wrapperCalls;
  const currentDecisions = currentTiming.directCalls + currentTiming.wrapperCalls;
  const currentCombinedMs = currentTiming.directMs + currentTiming.wrapperMs;
  appendix.push(
    "## Before/after optimizer timing (same narrow cohort)",
    "",
    "| Engine | Production decisions | Direct optimizer calls / time | Paired starvation diagnostics | Diagnostic-inclusive time per decision | Search-limit / certification failures |",
    "|---|---:|---:|---:|---:|---:|",
    `| Baseline ${matchedBaselineReport.sourceRevision} | ${baselineDecisions} | ${baselineTiming.directCalls} / ${(baselineTiming.directMs / 1000).toFixed(1)} s | none available | ${(baselineTiming.directMs / Math.max(1, baselineDecisions)).toFixed(2)} ms | ${baselineTiming.searchLimitCalls} / ${baselineTiming.certificationFailures} |`,
    `| Current ${report.sourceRevision} | ${currentDecisions} | ${currentTiming.directCalls} / ${(currentTiming.directMs / 1000).toFixed(1)} s | ${currentTiming.wrapperCalls} wrappers / ${(currentTiming.wrapperMs / 1000).toFixed(1)} s | ${(currentCombinedMs / Math.max(1, currentDecisions)).toFixed(2)} ms | ${currentTiming.searchLimitCalls} / ${currentTiming.certificationFailures} |`,
    "",
    `Both rows cover the same ${new Set(report.sessions.filter((session) => session.profile === "narrow").map((session) => session.seed)).size} narrow seed(s) × ${new Set(report.sessions.filter((session) => session.profile === "narrow").map((session) => session.sessionType)).size} formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.`,
    `Per-session harness totals including matcher, independent oracle, and report instrumentation were ${(baselineTiming.harnessMs / 1000).toFixed(1)} s baseline and ${(currentTiming.harnessMs / 1000).toFixed(1)} s current; this broader scope is not production-only matcher latency.`,
    "",
  );
}
const staticDominanceSummary = [];
for (const sessionType of ["POINTS", "ELO"]) {
  const staticReport = report.sessions.find((session) => session.profile === "wide" && session.sessionType === sessionType)?.staticBalanceFeasibility;
  if (!staticReport) continue;
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    const key = `${relation.facet}:${pair}`;
    distinct.set(key, { facet: relation.facet, pair, minimum: Math.min(distinct.get(key)?.minimum ?? Infinity, relation.minimumSingleCourtBalanceGap ?? Infinity) });
  }
  staticDominanceSummary.push({ sessionType, staticReport, pairs: [...distinct.values()] });
}
for (const item of staticDominanceSummary) {
  const minimum = Math.min(...item.pairs.map((pair) => pair.minimum));
  const aboveWindow = item.staticReport.allowedMaxBalanceGap !== null && minimum > item.staticReport.allowedMaxBalanceGap;
  const pairList = item.pairs.map((pair) => `${pair.pair} ${pair.facet} (min gap ${pair.minimum})`).join(", ");
  appendix.push(`## Fixed-wide-profile same-quartet balance proof: ${labels[item.sessionType]}`, "", `All ${item.pairs.length} structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (${minimum} minimum > ${item.staticReport.allowedMaxBalanceGap}); ${aboveWindow ? "the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile" : "the static report alone does not establish a universal exclusion"}. Exact pairs: ${pairList}. The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.`, "");
}
appendix.push("## Exact unseen relationship list and traces", "");
for (const session of report.sessions.filter((item) => item.profile === "narrow" && item.checkpoints["400"].completedMatches === 400)) {
  appendix.push(`### ${labels[session.sessionType]} narrow seed ${session.seed}: unseen at 400`);
  if (!session.missingRelationships.length) appendix.push("All structurally feasible player/facet relationships were observed.");
  for (const relation of session.missingRelationships) appendix.push(`- ${relation.players[0]}–${relation.players[1]} ${relation.facet}: ${relation.classification}; strongest ${relation.observedStrongRotationOpportunities}, balance-envelope ${relation.observedBalanceEnvelopeOpportunities}, cadence-frontier ${relation.observedCadenceAdmissibleOpportunities}.`);
  appendix.push("");
}
for (const session of report.sessions.filter((item) => item.staticBalanceFeasibility)) {
  const staticReport = session.staticBalanceFeasibility;
  appendix.push(`### ${labels[session.sessionType]} ${session.profile}: static equal-count, two-court balance exclusions`);
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    distinct.set(`${relation.facet}:${pair}`, `${pair} ${relation.facet}`);
  }
  appendix.push(`Static excluded ${staticReport.balanceGuardrailExcludedRelationshipCount} directed entries (${distinct.size} distinct facet-pairs); Rating ceiling fallback: ${staticReport.ratingCeilingFallback}.`);
  for (const relation of distinct.values()) appendix.push(`- ${relation}`);
  appendix.push("");
}
appendix.push("### Completed ≥5-rest assignments");
const fiveGapRows = report.sessions.flatMap((session) => session.fiveGapEpisodes.map((episode) => ({ session, episode })));
if (!fiveGapRows.length) appendix.push("None.");
for (const { session, episode } of fiveGapRows) {
  const trace = episode.initiatingReplay;
  appendix.push(`- ${episode.traceId}: ${labels[session.sessionType]} ${session.profile} seed ${session.seed}, ${episode.userId}, rest ${episode.restGap}, classification ${episode.classification}, current wait ${episode.currentWaitClassification}; ` +
    (trace ? `origin ${trace.assignmentId}, fair alternatives ${trace.fairAlternativeSetsWithoutPlayer}, starvation-equivalent ${trace.starvationEquivalentAlternativeSetsWithoutPlayer}, balance-admissible ${trace.balanceAdmissibleAlternativeSetsWithoutPlayer}, smoother ${trace.smootherBalanceAdmissibleSetsWithoutPlayer}.` : "no linked immediately preceding rest-zero replay."));
}
appendix.push("", "### Censored at the 400-match checkpoint");
let censoredCount = 0;
for (const session of report.sessions) {
  const checkpoint = session.checkpoints["400"];
  for (const wait of checkpoint.ongoingAvailableFiveTurnWaits) {
    censoredCount += 1;
    appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ${wait.userId} still available at rest ${wait.restTurns}${wait.initiatingReplay ? `, origin ${wait.initiatingReplay.assignmentId}` : ""}.`);
  }
  for (const assignment of checkpoint.inProgressFiveTurnAssignments) {
    censoredCount += 1;
    appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ${assignment.userId} assigned at rest ${assignment.restTurns}, current assignment ${assignment.assignmentId}${assignment.initiatingReplay ? `, prior rest-zero origin ${assignment.initiatingReplay.assignmentId}` : ""}.`);
  }
}
if (!censoredCount) appendix.push("None.");
appendix.push("", "### Search and timing scope", "");
for (const session of report.sessions) {
  const checkpoint = session.checkpoints["400"];
  appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ordinary optimizer ${checkpoint.optimizer.ordinaryProductionWallMs.toFixed(2)} ms; counterfactual wrapper ${checkpoint.optimizer.counterfactualWrapperWallMs.toFixed(2)} ms (two searches); search-limit runs ${checkpoint.optimizer.searchLimitCalls}; fairness/starvation/balance certification failures ${checkpoint.optimizer.fairnessCertificateFailures}/${checkpoint.optimizer.starvationCertificateFailures}/${checkpoint.optimizer.balanceCertificateFailures}; static-feasibility cache miss ${session.staticBalanceFeasibilityMs.toFixed(2)} ms; whole harness ${session.performanceMs} ms.`);
}
appendix.push("", "## Compact human-readable checkpoint summary", "", "| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE player coverage | Completed MIXED / OWN_SIDE | First100 / last100 OWN_SIDE | Entropy people / type / all | B2B | Worst max / mean of per-seed maxima / mean / p95 assignment rest | Starvation changed / overdue / all completed |", "|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|", ...aggregate.map((item) =>
  `| ${item.profile} | ${item.format} | ${item.completed} | ${percent(item.varietyCoverageMean)} | ${percent(item.partnerCoverageMean)} / ${percent(item.opponentCoverageMean)} / ${percent(item.courtmateCoverageMean)} | ${percent(item.mixedCoverageMean)} / ${percent(item.ownSideCoverageMean)} | ${item.completedMixedMatchesMean?.toFixed(1)} / ${item.completedOwnSideMatchesMean?.toFixed(1)} | first100 OWN_SIDE ${item.first100OwnSideMatchesMean?.toFixed(1)} / last100 ${item.last100OwnSideMatchesMean?.toFixed(1)} | ${percent(item.relationshipEntropyMean)} / ${percent(item.matchTypeEntropyMean)} / ${percent(item.normalizedEntropyMean)} | ${percent(item.backToBackRateMean)} | ${item.maxAssignmentRestGapWorst?.toFixed(2)} / ${item.maxAssignmentRestGapMean?.toFixed(2)} / ${item.meanAssignmentRestGapMean?.toFixed(2)} / ${item.p95AssignmentRestGapMean?.toFixed(2)} | ${item.starvationInterventions} / ${item.decisionsWithOverdue} / ${item.completedRotationDecisions} (${percent(item.starvationRateWhenOverdue)} / ${percent(item.starvationRateAcrossCompletedDecisions)}; certified ${percent(item.starvationRateAmongCertified)}; unknown ${item.uncertifiedCounterfactualDecisions}) |`
));
if (current.markdownPath) writeFileSync(current.markdownPath, `${readFileSync(current.markdownPath, "utf8").trimEnd()}\n${appendix.join("\n")}\n`, "utf8");
process.stdout.write("\nCompact human-readable results (coverage and completed-match counts are means across seeds):\n");
for (const item of aggregate) process.stdout.write(`- ${item.profile} ${item.format} after ${item.completed}: VCS ${percent(item.varietyCoverageMean)}; partner/opponent/court ${percent(item.partnerCoverageMean)}/${percent(item.opponentCoverageMean)}/${percent(item.courtmateCoverageMean)}; MIXED/OWN_SIDE player coverage ${percent(item.mixedCoverageMean)}/${percent(item.ownSideCoverageMean)}; completed MIXED/OWN_SIDE ${item.completedMixedMatchesMean?.toFixed(1)}/${item.completedOwnSideMatchesMean?.toFixed(1)}; first100/last100 OWN_SIDE ${item.first100OwnSideMatchesMean?.toFixed(1)}/${item.last100OwnSideMatchesMean?.toFixed(1)}; entropy people/type/all ${percent(item.relationshipEntropyMean)}/${percent(item.matchTypeEntropyMean)}/${percent(item.normalizedEntropyMean)}; B2B ${percent(item.backToBackRateMean)}; worst max/mean-of-per-seed-maxima/mean/p95 assignment rest ${item.maxAssignmentRestGapWorst?.toFixed(2)}/${item.maxAssignmentRestGapMean?.toFixed(2)}/${item.meanAssignmentRestGapMean?.toFixed(2)}/${item.p95AssignmentRestGapMean?.toFixed(2)}; starvation changed ${item.starvationInterventions} of ${item.decisionsWithOverdue} overdue decisions.\n`);
process.stdout.write(`\nPolicy comparison (${policyReports.map((item) => item.label).join(", ")}):\n`);
for (const item of policyComparison) {
  const replaySummary = item.replayEnvelopeApplicable
    ? `best+1 ${item.acceptedPlusOneDecisions400}/${item.replayEnvelopeCertifiedRefills400}, +2 entropy rejection ${item.higherEntropyBeyondAllowanceDecisions400} decisions/${item.higherEntropyBeyondAllowanceCandidates400} candidates, ≥5-rest linked+1 ${item.fivePlusEpisodesLinkedAcceptedPlusOne400}/${item.fivePlusRestEpisodes400}`
    : "best+1/+2 diagnostics n/a";
  process.stdout.write(`- ${item.policy} ${item.profile} ${item.format}: VCS20/400 ${percent(item.relationshipCoverage20Mean)}/${percent(item.relationshipCoverage400Mean)}, partner20/400 ${percent(item.partnerCoverage20Mean)}/${percent(item.partnerCoverage400Mean)}; OWN_SIDE20/400 ${item.ownSideCompletedAt20Mean?.toFixed(1) ?? "n/a"}/${item.ownSideCompletedAt400Mean?.toFixed(1) ?? "n/a"}, first100/last100 ${item.first100OwnSideMean?.toFixed(1) ?? "n/a"}/${item.last100OwnSideMean?.toFixed(1) ?? "n/a"}; entropy people/type/all 20=${percent(item.relationshipEntropy20Mean)}/${percent(item.matchTypeEntropy20Mean)}/${percent(item.normalizedEntropy20Mean)} and 400=${percent(item.relationshipEntropy400Mean)}/${percent(item.matchTypeEntropy400Mean)}/${percent(item.normalizedEntropy400Mean)}; B2B ${percent(item.backToBackRate20Mean)}/${percent(item.backToBackRate400Mean)}, worst max assignment rest ${item.maxAssignmentRest400Worst?.toFixed(2) ?? "n/a"}, ${replaySummary}; starvation ${item.starvationInterventions ?? "n/a"}/${item.overdueDecisions} overdue (${item.uncertifiedOverdueDecisions} unknown).\n`);
}
process.stdout.write(`\nCompact machine-readable results:\n${JSON.stringify({ sourceRevision: report.sourceRevision, sourceProvenance: report.sourceProvenance, primarySeeds: report.seedCount, wideSeeds: report.wideSeedCount, groups: aggregate, policyComparison })}\n`);
process.stdout.write(`\nSaved benchmark JSON: ${current.jsonPath}${current.markdownPath ? `\nSaved human report: ${current.markdownPath}` : ""}\nSaved policy comparison JSON: ${comparisonJsonPath}\nSaved policy comparison report: ${comparisonMarkdownPath}\n`);
