import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const pilot = hasFlag("--pilot");
const targetMatches = Number(valueAfter("--target-matches", pilot ? "21" : "400"));
const selectedPolicy = valueAfter("--only-policy");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/rolling-social-variety"));
const generatedRoot = path.resolve(root, "benchmarks/generated");
const testFile = "src/lib/matchmaking/v3/socialRollingVarietyBenchmark.test.ts";
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const seeds = pilot ? [1] : [1, 4729, 104729, 130363, 2097593];

const coreEnginePaths = [
  "src/lib/matchmaking/v3/socialBatch.ts",
  "src/lib/matchmaking/v3/socialRollingVariety.ts",
  "src/lib/matchmaking/v3/socialVariety.ts",
  "src/lib/matchmaking/v3/types.ts",
  "src/lib/matchmaking/v3/singleCourt.ts",
  "src/lib/matchmaking/v3/scoring.ts",
  "src/lib/matchmaking/v3/balanceGuardrail.ts",
];
const measurementPaths = [
  "src/lib/matchmaking/v3/socialCoverageBenchmark.ts",
  "src/lib/matchmaking/v3/socialRollingVarietyBenchmark.test.ts",
  "src/lib/matchmaking/v3/socialHorizonCoverageScoring.ts",
  "src/lib/matchmaking/v3/benchmarkBalanceFeasibility.ts",
  "scripts/run-social-rolling-variety-benchmark.mjs",
  "scripts/benchmark-artifacts.mjs",
];

const policies = {
  baseline: {
    metric: "legacy-equal",
    label: "Baseline: existing equal-facet lifetime first-exposure coverage",
    stem: "baseline-legacy-equal",
  },
  a: {
    metric: "rolling-equal",
    label: "A: relationship first exposures plus signed rolling type coverage",
    stem: "a-rolling-equal",
  },
  b: {
    metric: "social-horizon-3211",
    label: "B: capped 3:2:1 relationship plus signed rolling type coverage",
    stem: "b-social-horizon-3211",
  },
};

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/run-social-rolling-variety-benchmark.mjs [--pilot] [--target-matches 21|400] [--only-policy baseline|a|b] [--out-dir benchmarks/generated/rolling-social-variety]\n" +
    "Defaults: all three policies, five seeds, and 400 completed matches. --pilot uses seed 1 and 21 completed matches.\n"
  );
}

function runGit(args, cwd = root) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function hashFiles(paths) {
  const hash = createHash("sha256");
  for (const relativePath of paths) {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) throw new Error(`Required benchmark source is missing: ${relativePath}`);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function statusPaths(paths) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Could not inspect benchmark source changes.");
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
}

function assertSafeOutputDir() {
  if (outputDir === generatedRoot || !outputDir.startsWith(`${generatedRoot}${path.sep}`)) {
    throw new Error("Benchmark artifacts must stay below benchmarks/generated/ so the raw outputs remain ignored.");
  }
}

function validateSavedReport(file, policy, config) {
  const savedReport = JSON.parse(readFileSync(file, "utf8"));
  if (savedReport.validationStatus !== "passed") throw new Error("The saved rolling variety report is not validated.");
  if (savedReport.schemaVersion !== "social-horizon-321-v1" || savedReport.enginePolicy !== "current") {
    throw new Error("The rolling variety report does not have the expected current horizon schema.");
  }
  if (savedReport.targetMatches !== targetMatches || savedReport.matcherCoverageGainMetric !== config.metric ||
      JSON.stringify(savedReport.seeds) !== JSON.stringify(seeds) || savedReport.sessions?.length !== seeds.length * 3) {
    throw new Error(`The saved rolling variety report does not match policy ${policy}'s seed, target, or gate settings.`);
  }
  for (const session of savedReport.sessions) {
    if (session.completedHistory?.length !== targetMatches) {
      throw new Error(`Completed history is incomplete for ${session.seed}/${session.sessionType}.`);
    }
    for (const horizon of [21, targetMatches]) {
      const checkpoint = session.checkpoints?.[String(horizon)];
      if (checkpoint?.completedMatches !== horizon || !checkpoint.socialVariety3211) {
        throw new Error(`Required ${horizon}-match 3211 checkpoint is missing for ${session.seed}/${session.sessionType}.`);
      }
    }
    if (!session.completedHistory.every((match, index) => {
      const ids = [...match.team1, ...match.team2];
      return match.completedMatchNumber === index + 1 && match.team1?.length === 2 && match.team2?.length === 2 &&
        new Set(ids).size === 4 && ids.every((id) => /^P(?:[1-9]|1[0-4])$/.test(id)) &&
        (match.matchType === "MIXED" || match.matchType === "OWN_SIDE");
    })) {
      throw new Error(`Malformed completed layout for ${session.seed}/${session.sessionType}.`);
    }
  }
  return savedReport;
}

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}
if (targetMatches !== 21 && targetMatches !== 400) throw new Error("--target-matches must be exactly 21 or 400.");
if (selectedPolicy && !(selectedPolicy in policies)) throw new Error("--only-policy must be baseline, a, or b.");
if (pilot && valueAfter("--target-matches") && targetMatches !== 21) {
  throw new Error("--pilot always uses exactly 21 completed matches.");
}
assertSafeOutputDir();

const commitSha = runGit(["rev-parse", "--verify", "HEAD"]);
const workingTreeDirty = runGit(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0;
const sourceProvenanceBase = {
  commitSha,
  workingTreeDirty,
  workingTreeNote: workingTreeDirty
    ? "The measured worktree contains local changes; source hashes identify the exact engine and benchmark files used for this run."
    : "The measured worktree was clean at run start.",
  engineSourceSha256: hashFiles(coreEnginePaths),
  measurementHarnessSha256: hashFiles(measurementPaths),
  coreEngineTrackedDiffPaths: statusPaths(coreEnginePaths),
  sharedVarietyTrackedDiffPaths: statusPaths(["src/lib/matchmaking/v3/socialVariety.ts", "src/lib/matchmaking/v3/socialRollingVariety.ts"]),
  measurementHarnessTrackedDiffPaths: statusPaths(measurementPaths),
};

const policiesToRun = selectedPolicy ? [selectedPolicy] : Object.keys(policies);
const comparisonRows = [];
mkdirSync(outputDir, { recursive: true });

for (const policy of policiesToRun) {
  const config = policies[policy];
  const policyDir = path.join(outputDir, policy);
  const stem = `social-rolling-variety-${targetMatches}-${config.stem}`;
  const jsonPath = path.join(policyDir, `${stem}.json`);
  const markdownPath = path.join(policyDir, `${stem}.md`);
  if ([jsonPath, markdownPath, `${jsonPath}.pending`, `${jsonPath}.writing`, `${markdownPath}.writing`].some(existsSync)) {
    throw new Error(`Refusing to overwrite an existing rolling variety artifact for ${policy}; choose a new --out-dir.`);
  }
  mkdirSync(policyDir, { recursive: true });
  const sourceProvenance = {
    ...sourceProvenanceBase,
    policyLabel: config.label,
    matcherLabel: config.label,
    matcherCoverageGainMetric: config.metric,
    targetMatches,
  };
  const env = {
    ...process.env,
    RUN_SOCIAL_ROLLING_VARIETY_BENCHMARK: "1",
    BENCHMARK_ROLLING_SEEDS: seeds.join(","),
    BENCHMARK_ROLLING_TARGET_MATCHES: String(targetMatches),
    BENCHMARK_ROLLING_POLICY: policy,
    BENCHMARK_ROLLING_SOURCE_REVISION: commitSha,
    BENCHMARK_ROLLING_SOURCE_PROVENANCE: JSON.stringify(sourceProvenance),
    BENCHMARK_ROLLING_OUTPUT_JSON: jsonPath,
    BENCHMARK_ROLLING_OUTPUT_MARKDOWN: markdownPath,
  };
  process.stdout.write(`\nRunning ${config.label}; ${seeds.length} seed(s), ${targetMatches} completed matches, current engine.\n`);
  const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!existsSync(jsonPath) || !existsSync(markdownPath)) {
    throw new Error(`The rolling variety benchmark test completed without both ${policy} report files.`);
  }
  const report = validateSavedReport(jsonPath, policy, config);
  comparisonRows.push({
    policy,
    metric: config.metric,
    label: config.label,
    jsonPath,
    markdownPath,
    sourceProvenance: report.sourceProvenance,
    seeds: report.seeds,
    targetMatches: report.targetMatches,
  });
  process.stdout.write(`Validated ${policy}: ${jsonPath}\nReport: ${markdownPath}\n`);
}

if (!selectedPolicy) {
  const comparisonPath = path.join(outputDir, `social-rolling-variety-${targetMatches}-run-manifest.json`);
  if (existsSync(comparisonPath)) throw new Error(`Refusing to overwrite ${comparisonPath}; choose a new --out-dir.`);
  const manifest = {
    schemaVersion: "social-rolling-variety-run-manifest-v1",
    generatedAt: new Date().toISOString(),
    seeds,
    targetMatches,
    sourceRevision: commitSha,
    workingTreeDirty,
    policyRuns: comparisonRows,
    finiteRunNote: "A finite run can show match-type disappearance and recovery; it cannot prove permanent extinction across every possible session.",
  };
  writeFileSync(comparisonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Run manifest: ${comparisonPath}\n`);
}
