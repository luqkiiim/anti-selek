import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { assertSocialCourtmatePriorityCheckpoint } from "./social-courtmate-priority-validation.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const hasFlag = (name) => args.includes(name);
const pilot = hasFlag("--pilot");
const targetMatches = Number(valueAfter("--target-matches", pilot ? "21" : "100"));
const selectedPolicy = valueAfter("--only-policy");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/social-courtmate-priority"));
const generatedRoot = path.resolve(root, "benchmarks/generated");
const testFile = "src/lib/matchmaking/v3/socialCourtmatePriorityBenchmark.test.ts";
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const fixturePath = "benchmarks/social-horizon-321/current/social-horizon-21-current-legacy-gate.json.gz";
const seeds = pilot ? [1] : [1, 4729, 104729, 130363, 2097593];

const engineFiles = [
  "src/lib/matchmaking/v3/socialBatch.ts",
  "src/lib/matchmaking/v3/socialCourtmatePriority.ts",
  "src/lib/matchmaking/v3/socialVariety.ts",
  "src/lib/matchmaking/v3/socialRollingVariety.ts",
  "src/lib/matchmaking/v3/types.ts",
  "src/lib/matchmaking/v3/singleCourt.ts",
  "src/lib/matchmaking/v3/balance.ts",
  "src/lib/matchmaking/v3/balanceGuardrail.ts",
  "src/lib/matchmaking/v3/scoring.ts",
  "src/lib/matchmaking/v3/fairness.ts",
  "src/lib/matchmaking/v3/rematch.ts",
  "src/lib/matchmaking/v3/consecutive.ts",
];
const measurementFiles = [
  "src/lib/matchmaking/v3/socialCoverageBenchmark.ts",
  testFile,
  "scripts/run-social-courtmate-priority-benchmark.mjs",
  "scripts/social-courtmate-priority-validation.mjs",
  fixturePath,
];
const policies = {
  baseline: {
    socialPriorityPolicy: "production",
    label: "Baseline: production Social priority",
    stem: "baseline-production",
  },
  candidate: {
    socialPriorityPolicy: "courtmate-first",
    label: "Candidate: courtmate-first Social priority",
    stem: "candidate-courtmate-first",
  },
};

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function hashFiles(files) {
  const hash = createHash("sha256");
  for (const relative of files) {
    const file = path.join(root, relative);
    if (!existsSync(file)) throw new Error(`Required experiment source is missing: ${relative}`);
    hash.update(relative);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function statusPaths(files) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all", "--", ...files], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Could not inspect experiment source status.");
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateReport(file, policy, config) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  assert(report.validationStatus === "passed", `${policy}: report was not validated.`);
  assert(report.targetMatches === targetMatches && JSON.stringify(report.seeds) === JSON.stringify(seeds), `${policy}: target or seeds differ from the requested run.`);
  assert(report.socialCourtmatePriorityPolicy === policy, `${policy}: policy label mismatch.`);
  assert(report.sessions?.length === seeds.length, `${policy}: expected one Social-only session per seed.`);
  assert(report.sessions.every((session) => session.sessionType === "SOCIAL_MIX" && session.profile === "narrow"), `${policy}: report must contain only narrow SOCIAL_MIX sessions.`);
  assert(report.courtPriorityAnalysis?.sessions?.length === seeds.length, `${policy}: independent analysis is incomplete.`);
  assert(report.sourceProvenance?.socialPriorityPolicy === config.socialPriorityPolicy, `${policy}: provenance policy mismatch.`);
  for (const session of report.sessions) {
    assert(session.completedHistory?.length === targetMatches, `${policy}/${session.seed}: incomplete completed history.`);
    for (const horizon of new Set([21, targetMatches])) {
      const checkpoint = session.checkpoints?.[String(horizon)];
      assert(checkpoint?.completedMatches === horizon, `${policy}/${session.seed}: missing ${horizon} checkpoint.`);
      assertSocialCourtmatePriorityCheckpoint(checkpoint, policy, `${policy}/${session.seed}/${horizon}`);
    }
  }
  return report;
}

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/run-social-courtmate-priority-benchmark.mjs [--pilot] [--target-matches 21|100] [--only-policy baseline|candidate] [--out-dir benchmarks/generated/social-courtmate-priority]\n" +
    "Defaults: five fixed seeds, 100 completed matches, Social-only. --pilot uses seed 1 and 21 completed matches. This experiment never runs beyond 100 matches.\n"
  );
}

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}
assert(targetMatches === 21 || targetMatches === 100, "--target-matches must be exactly 21 or 100; this experiment is capped at 100.");
assert(!pilot || targetMatches === 21, "--pilot always runs seed 1 to 21 completed matches.");
assert(!selectedPolicy || Object.hasOwn(policies, selectedPolicy), "--only-policy must be baseline or candidate.");
assert(outputDir !== generatedRoot && outputDir.startsWith(`${generatedRoot}${path.sep}`), "Benchmark outputs must stay below ignored benchmarks/generated/.");
assert(existsSync(path.join(root, fixturePath)), `Missing frozen baseline fixture ${fixturePath}.`);

const sourceRevision = git(["rev-parse", "--verify", "HEAD"]);
const workingTreeDirty = git(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0;
const frozenEngineHash = hashFiles(engineFiles);
const frozenMeasurementHash = hashFiles(measurementFiles);
const sourceProvenanceBase = {
  commitSha: sourceRevision,
  workingTreeDirty,
  workingTreeNote: workingTreeDirty
    ? "Source hashes identify the exact engine, harness, test and frozen baseline fixture used for this run."
    : "The worktree was clean at run start.",
  engineSourceSha256: frozenEngineHash,
  measurementHarnessSha256: frozenMeasurementHash,
  coreEngineTrackedDiffPaths: statusPaths(engineFiles),
  sharedVarietyTrackedDiffPaths: statusPaths(["src/lib/matchmaking/v3/socialVariety.ts", "src/lib/matchmaking/v3/socialRollingVariety.ts"]),
  measurementHarnessTrackedDiffPaths: statusPaths(measurementFiles),
  socialPriorityPolicy: null,
  targetMatches,
  sessionTypes: ["SOCIAL_MIX"],
};
const policiesToRun = selectedPolicy ? [selectedPolicy] : Object.keys(policies);
const policyRuns = [];
mkdirSync(outputDir, { recursive: true });

for (const policy of policiesToRun) {
  const config = policies[policy];
  const policyDir = path.join(outputDir, policy);
  const stem = `social-courtmate-priority-${targetMatches}-${config.stem}`;
  const jsonPath = path.join(policyDir, `${stem}.json`);
  if ([jsonPath, `${jsonPath}.pending`, `${jsonPath}.writing`].some(existsSync)) {
    throw new Error(`Refusing to overwrite ${jsonPath}; choose a fresh --out-dir.`);
  }
  mkdirSync(policyDir, { recursive: true });
  const sourceProvenance = { ...sourceProvenanceBase, policyLabel: config.label, matcherLabel: config.label, socialPriorityPolicy: config.socialPriorityPolicy };
  const env = {
    ...process.env,
    RUN_SOCIAL_COURTMATE_PRIORITY_BENCHMARK: "1",
    BENCHMARK_COURTMATE_SEEDS: seeds.join(","),
    BENCHMARK_COURTMATE_TARGET_MATCHES: String(targetMatches),
    BENCHMARK_COURTMATE_POLICY: policy,
    BENCHMARK_COURTMATE_SOURCE_REVISION: sourceRevision,
    BENCHMARK_COURTMATE_SOURCE_PROVENANCE: JSON.stringify(sourceProvenance),
    BENCHMARK_COURTMATE_OUTPUT_JSON: jsonPath,
  };
  process.stdout.write(`\nRunning ${config.label}: ${seeds.length} seed(s), ${targetMatches} completed matches, SOCIAL_MIX only.\n`);
  const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `Vitest failed for ${policy} with status ${result.status}.`);
  assert(existsSync(jsonPath), `${policy}: gated test did not write its report.`);
  const report = validateReport(jsonPath, policy, config);
  assert(hashFiles(engineFiles) === frozenEngineHash, `Engine sources changed during the ${policy} measurement; discard this run.`);
  assert(hashFiles(measurementFiles) === frozenMeasurementHash, `Measurement sources changed during the ${policy} measurement; discard this run.`);
  assert(report.sourceProvenance.engineSourceSha256 === frozenEngineHash &&
    report.sourceProvenance.measurementHarnessSha256 === frozenMeasurementHash,
  `${policy}: report source hashes do not match the frozen start hashes.`);
  policyRuns.push({
    policy,
    label: config.label,
    jsonPath: path.relative(outputDir, jsonPath),
    sourceProvenance: report.sourceProvenance,
    seeds,
    targetMatches,
  });
  process.stdout.write(`Validated ${policy}: ${jsonPath}\n`);
}

assert(hashFiles(engineFiles) === frozenEngineHash, "Engine sources changed during the experiment; discard all policy reports.");
assert(hashFiles(measurementFiles) === frozenMeasurementHash, "Measurement sources changed during the experiment; discard all policy reports.");

if (!selectedPolicy) {
  const manifestPath = path.join(outputDir, `social-courtmate-priority-${targetMatches}-run-manifest.json`);
  assert(!existsSync(manifestPath), `Refusing to overwrite ${manifestPath}; choose a fresh --out-dir.`);
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: "social-courtmate-priority-run-manifest-v1",
    generatedAt: new Date().toISOString(),
    targetMatches,
    seeds,
    sourceRevision,
    workingTreeDirty,
    policyRuns,
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`Run manifest: ${manifestPath}\n`);
}
