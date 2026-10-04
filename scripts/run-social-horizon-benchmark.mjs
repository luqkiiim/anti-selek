import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const policy = valueAfter("--only-policy", valueAfter("--only-horizon-21"));
const targetMatches = Number(valueAfter("--target-matches", "21"));
const requestedCoverageGainMetric = valueAfter("--coverage-gain-metric");
const outputDirArgument = valueAfter("--out-dir", "benchmarks/social-horizon-321");
const outputDir = path.resolve(root, outputDirArgument);
const seeds = [1, 4729, 104729, 130363, 2097593];
const seedText = seeds.join(",");
const testFile = "src/lib/matchmaking/v3/socialHorizonCoverageBenchmark.test.ts";
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

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
  "src/lib/matchmaking/v3/socialHorizonCoverageScoring.ts",
  testFile,
  "src/lib/matchmaking/v3/benchmarkBalanceFeasibility.ts",
  "scripts/run-social-horizon-benchmark.mjs",
];

const policyConfigurations = {
  baseline: {
    enginePolicy: "baseline",
    label: "entropy-first",
    expectedCommit: "de0254f84adef7414b512e3d3fd936033d65bef8",
    worktree: valueAfter("--baseline-worktree", process.env.BENCHMARK_BASELINE_WORKTREE),
  },
  strict: {
    enginePolicy: "strict",
    label: "strict-cadence",
    expectedCommit: "93262f36336b9533ba96b4e4bec5d7e8061eef6e",
    worktree: valueAfter("--strict-worktree", process.env.BENCHMARK_STRICT_WORKTREE),
  },
  "type-first": {
    enginePolicy: "type-first",
    label: "type-entropy-first",
    expectedCommit: "bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d",
    worktree: valueAfter("--type-first-worktree", process.env.BENCHMARK_TYPE_FIRST_WORKTREE),
  },
  "replay-envelope": {
    enginePolicy: "replay-envelope",
    label: "replay-envelope-best-plus-one",
    expectedCommit: "7ab071ad0102ff8a2012a267d8cfe796a1f325a8",
    worktree: valueAfter("--replay-envelope-worktree", process.env.BENCHMARK_REPLAY_ENVELOPE_WORKTREE),
  },
  current: {
    enginePolicy: "current",
    label: "coverage-gated-best-plus-one",
    expectedCommit: null,
    worktree: valueAfter("--current-worktree", process.env.BENCHMARK_CURRENT_WORKTREE) ?? root,
  },
};

function gitHead(workdir) {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: workdir, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not read Git HEAD in ${workdir}.`);
  return result.stdout.trim();
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

function hashFiles(workdir, paths) {
  const hash = createHash("sha256");
  for (const relativePath of paths) {
    const absolutePath = path.join(workdir, relativePath);
    hash.update(relativePath);
    hash.update(existsSync(absolutePath) ? readFileSync(absolutePath) : "<missing>");
  }
  return hash.digest("hex");
}

function copyBenchmarkFiles(workdir) {
  for (const relativePath of measurementPaths) {
    const source = path.join(root, relativePath);
    if (!existsSync(source)) throw new Error(`Required horizon benchmark file is missing: ${relativePath}`);
    const destination = path.join(workdir, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    if (!existsSync(destination)) throw new Error(`Could not copy horizon benchmark file into the selected worktree: ${relativePath}`);
  }
}

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/run-social-horizon-benchmark.mjs --only-policy <baseline|strict|type-first|replay-envelope|current> [--target-matches 21|400] [--coverage-gain-metric legacy-equal|social-horizon-321] [--out-dir benchmarks/social-horizon-321] [--baseline-worktree PATH] [--strict-worktree PATH] [--type-first-worktree PATH] [--replay-envelope-worktree PATH] [--current-worktree PATH]\n"
  );
}

if (!policy) {
  printUsage();
  process.exit(2);
}
const config = policyConfigurations[policy];
if (!config) throw new Error(`--only-policy must be one of ${Object.keys(policyConfigurations).join(", ")}.`);
if (targetMatches !== 21 && targetMatches !== 400) throw new Error("--target-matches must be exactly 21 or 400.");
if (!config.worktree) throw new Error(`--only-horizon-21 ${policy} requires its corresponding policy worktree option.`);
const coverageGainMetric = requestedCoverageGainMetric ?? "legacy-equal";
if (coverageGainMetric !== "legacy-equal" && coverageGainMetric !== "social-horizon-321") {
  throw new Error("--coverage-gain-metric must be legacy-equal or social-horizon-321.");
}
if (policy !== "current" && coverageGainMetric !== "legacy-equal") {
  throw new Error("Historical policy worktrees only support their recorded legacy-equal gate metric.");
}

const workdir = path.resolve(config.worktree);
const actualCommit = gitHead(workdir);
if (config.expectedCommit && actualCommit !== config.expectedCommit) {
  throw new Error(`The ${policy} worktree must resolve to ${config.expectedCommit}, found ${actualCommit}.`);
}
if (policy !== "current") copyBenchmarkFiles(workdir);

const metricLabel = coverageGainMetric === "social-horizon-321" ? "horizon-321-gate" : "legacy-gate";
const reportStem = `social-horizon-${targetMatches}-${policy}-${metricLabel}`;
const jsonPath = path.join(outputDir, policy, `${reportStem}.json`);
const markdownPath = path.join(outputDir, policy, `${reportStem}.md`);
if (existsSync(jsonPath) || existsSync(markdownPath)) {
  throw new Error(`Refusing to overwrite an existing horizon artifact for ${policy}; choose a new --out-dir.`);
}
mkdirSync(path.dirname(jsonPath), { recursive: true });
const sourceProvenance = {
  commitSha: actualCommit,
  workingTreeDirty: worktreeIsDirty(workdir),
  workingTreeNote: policy === "current"
    ? "The recorded engine commit is the measured policy source; hashes identify the benchmark metric/helper and engine files used."
    : `Benchmark-only horizon instrumentation is copied into the pinned ${policy} worktree; matchmaking implementation files remain at the recorded policy commit.`,
  policyLabel: policy === "current" && coverageGainMetric === "social-horizon-321"
    ? "coverage-gate-horizon-321"
    : config.label,
  metric: "social-horizon-321",
  gateMetric: coverageGainMetric,
  targetMatches,
  coreEngineTrackedDiffPaths: trackedChangedPaths(workdir, coreEnginePaths),
  sharedVarietyTrackedDiffPaths: trackedChangedPaths(workdir, sharedVarietyPaths),
  measurementHarnessTrackedDiffPaths: trackedChangedPaths(workdir, measurementPaths),
  engineSourceSha256: hashFiles(workdir, [...coreEnginePaths, ...sharedVarietyPaths]),
  measurementHarnessSha256: hashFiles(workdir, measurementPaths),
};

const env = {
  ...process.env,
  RUN_SOCIAL_HORIZON_BENCHMARK: "1",
  BENCHMARK_HORIZON_SEEDS: seedText,
  BENCHMARK_HORIZON_POLICY: config.enginePolicy,
  BENCHMARK_HORIZON_POLICY_LABEL: config.label,
  BENCHMARK_HORIZON_TARGET_MATCHES: String(targetMatches),
  BENCHMARK_HORIZON_COVERAGE_GAIN_METRIC: coverageGainMetric,
  BENCHMARK_HORIZON_SOURCE_REVISION: actualCommit,
  BENCHMARK_HORIZON_SOURCE_PROVENANCE: JSON.stringify(sourceProvenance),
  BENCHMARK_HORIZON_OUTPUT_JSON: jsonPath,
  BENCHMARK_HORIZON_OUTPUT_MARKDOWN: markdownPath,
};
const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
  cwd: workdir,
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(jsonPath) || !existsSync(markdownPath)) throw new Error("The horizon benchmark test completed without writing both report files.");
const savedReport = JSON.parse(readFileSync(jsonPath, "utf8"));
if (savedReport.validationStatus !== "passed") throw new Error("The horizon report is not marked validationStatus=passed and cannot be treated as complete.");
if (savedReport.schemaVersion !== "social-horizon-321-v1" || savedReport.sessions?.length !== seeds.length * 3) {
  throw new Error("The saved horizon report does not contain the expected five-seed, three-format run.");
}
if (savedReport.targetMatches !== targetMatches || savedReport.matcherCoverageGainMetric !== coverageGainMetric ||
    JSON.stringify(savedReport.seeds) !== JSON.stringify(seeds)) {
  throw new Error("The saved horizon report does not match the requested checkpoint, gate metric, and seed list.");
}
for (const session of savedReport.sessions) {
  const checkpoint = session.checkpoints?.["21"];
  const finalCheckpoint = session.checkpoints?.[String(targetMatches)];
  if (checkpoint?.completedMatches !== 21 || finalCheckpoint?.completedMatches !== targetMatches ||
      finalCheckpoint.socialHorizon321?.players?.length !== 14 || session.completedHistory?.length !== targetMatches) {
    throw new Error(`The saved horizon checkpoint is incomplete for seed ${session.seed} / ${session.sessionType}.`);
  }
  const completedPlayerAppearances = checkpoint.playerMatchCounts.reduce((sum, item) => sum + item.matchesPlayed, 0);
  if (checkpoint.completedMatches !== 21 || completedPlayerAppearances !== 84) {
    throw new Error(`The 21-match horizon checkpoint has an invalid completed-player count for seed ${session.seed} / ${session.sessionType}.`);
  }
  for (const match of session.completedHistory) {
    const ids = [...match.team1, ...match.team2];
    if (match.completedMatchNumber < 1 || match.completedMatchNumber > targetMatches ||
        match.team1.length !== 2 || match.team2.length !== 2 || new Set(ids).size !== 4) {
      throw new Error(`The completed history contains a malformed layout for seed ${session.seed} / ${session.sessionType}.`);
    }
  }
}

process.stdout.write(`\nCompleted isolated ${sourceProvenance.policyLabel} Social Horizon ${targetMatches} benchmark (${seedText}; ${coverageGainMetric} gate).\nSaved JSON: ${jsonPath}\nSaved report: ${markdownPath}\n`);
