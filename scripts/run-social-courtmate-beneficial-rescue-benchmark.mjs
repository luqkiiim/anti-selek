import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  assertSocialCourtmateBeneficialRescueCheckpoint,
  assertSocialCourtmateRescueCheckpoint,
} from "./social-courtmate-beneficial-rescue-validation.mjs";

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
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/social-courtmate-beneficial-rescue"));
const generatedRoot = path.resolve(root, "benchmarks/generated");
const testFile = "src/lib/matchmaking/v3/socialCourtmateBeneficialRescueBenchmark.test.ts";
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const seeds = pilot ? [1] : [1, 4729, 104729, 130363, 2097593];
const referenceReports = {
  baseline: "benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/baseline/social-courtmate-rescue-100-baseline-production.json",
  strict: "benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/strict/social-courtmate-rescue-100-strict-courtmate-first.json",
  rescue: "benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/rescue/social-courtmate-rescue-100-rescue-courtmate-near-best.json",
};

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
  "scripts/run-social-courtmate-beneficial-rescue-benchmark.mjs",
  "scripts/social-courtmate-beneficial-rescue-validation.mjs",
  "scripts/social-courtmate-rescue-validation.mjs",
  ...Object.values(referenceReports),
];
const policies = {
  baseline: {
    socialPriorityPolicy: "production",
    label: "Baseline: production Social priority",
    stem: "baseline-production",
  },
  strict: {
    socialPriorityPolicy: "courtmate-first",
    label: "Strict: courtmate-first Social priority",
    stem: "strict-courtmate-first",
  },
  rescue: {
    socialPriorityPolicy: "courtmate-near-best",
    label: "Rescue: courtmate-near-best Social priority",
    stem: "rescue-courtmate-near-best",
  },
  beneficial: {
    socialPriorityPolicy: "courtmate-beneficial-rescue",
    label: "Beneficial rescue: courtmate-beneficial-rescue Social priority",
    stem: "beneficial-courtmate-rescue",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function readReference(file, policy) {
  assert(existsSync(path.join(root, file)), `Missing frozen ${policy} 100-match report ${file}.`);
  const report = JSON.parse(readFileSync(path.join(root, file), "utf8"));
  assert(report.validationStatus === "passed", `Frozen ${policy} reference was not validated.`);
  assert(report.socialCourtmateRescuePolicy === policy, `Frozen ${policy} reference carries the wrong arm label.`);
  assert(report.targetMatches === 100 && report.seeds?.join(",") === "1,4729,104729,130363,2097593",
    `Frozen ${policy} reference has unexpected seeds or horizon.`);
  assert(report.sessions?.length === 5 && report.sessions.every((session) =>
    session.sessionType === "SOCIAL_MIX" && session.profile === "narrow" && session.completedHistory?.length === 100),
  `Frozen ${policy} reference is not five complete narrow Social sessions.`);
  return report;
}

function validateReport(file, policy, config) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  assert(report.validationStatus === "pending" && existsSync(`${file}.pending`), `${policy}: raw report was not left pending for the runner's final validation.`);
  assert(report.targetMatches === targetMatches && JSON.stringify(report.seeds) === JSON.stringify(seeds), `${policy}: target or seeds differ from the requested run.`);
  assert(report.socialCourtmateRescuePolicy === policy, `${policy}: report policy label mismatch.`);
  assert(report.sessions?.length === seeds.length, `${policy}: expected one Social-only session per seed.`);
  assert(report.sessions.every((session) => session.sessionType === "SOCIAL_MIX" && session.profile === "narrow"), `${policy}: report must contain only narrow SOCIAL_MIX sessions.`);
  assert(report.courtmateBeneficialRescueAnalysis?.sessions?.length === seeds.length, `${policy}: independent analysis is incomplete.`);
  assert(report.sourceProvenance?.socialPriorityPolicy === config.socialPriorityPolicy, `${policy}: provenance policy mismatch.`);
  for (const session of report.sessions) {
    assert(session.completedHistory?.length === targetMatches, `${policy}/${session.seed}: incomplete completed history.`);
    for (const horizon of new Set([21, targetMatches])) {
      const checkpoint = session.checkpoints?.[String(horizon)];
      assert(checkpoint?.completedMatches === horizon, `${policy}/${session.seed}: missing ${horizon} checkpoint.`);
      if (policy === "beneficial") assertSocialCourtmateBeneficialRescueCheckpoint(checkpoint, "beneficial", `${policy}/${session.seed}/${horizon}`);
      else assertSocialCourtmateRescueCheckpoint(checkpoint, policy, `${policy}/${session.seed}/${horizon}`);
    }
  }
  return report;
}

function promoteValidatedReport(file) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  report.validationStatus = "passed";
  const writingPath = `${file}.writing`;
  writeFileSync(writingPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(writingPath, file);
  unlinkSync(`${file}.pending`);
}

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/run-social-courtmate-beneficial-rescue-benchmark.mjs [--pilot] [--target-matches 21|100] [--only-policy baseline|strict|rescue|beneficial] [--out-dir benchmarks/generated/social-courtmate-beneficial-rescue]\n" +
    "Defaults: five fixed seeds, 100 completed matches, Social-only. --pilot uses seed 1 and 21 matches. This experiment never runs beyond 100.\n"
  );
}

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}
assert(targetMatches === 21 || targetMatches === 100, "--target-matches must be exactly 21 or 100; this experiment is capped at 100.");
assert(!pilot || targetMatches === 21, "--pilot always runs seed 1 to 21 completed matches.");
assert(!selectedPolicy || Object.hasOwn(policies, selectedPolicy), "--only-policy must be baseline, strict, rescue, or beneficial.");
assert(outputDir !== generatedRoot && outputDir.startsWith(`${generatedRoot}${path.sep}`), "Benchmark outputs must stay below ignored benchmarks/generated/.");
assert(existsSync(vitest), `Vitest executable is missing at ${vitest}.`);
const frozenBaseline = readReference(referenceReports.baseline, "baseline");
const frozenStrict = readReference(referenceReports.strict, "strict");
const frozenRescue = readReference(referenceReports.rescue, "rescue");
const references = { baseline: frozenBaseline, strict: frozenStrict, rescue: frozenRescue };

const sourceRevision = git(["rev-parse", "--verify", "HEAD"]);
const workingTreeDirty = git(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0;
const frozenEngineHash = hashFiles(engineFiles);
const frozenMeasurementHash = hashFiles(measurementFiles);
const frozenReferenceHash = hashFiles(Object.values(referenceReports));
const sourceProvenanceBase = {
  commitSha: sourceRevision,
  workingTreeDirty,
  workingTreeNote: "Hashes identify the exact engine, harness, validation, test, and frozen 100-match baseline/strict/near-best reference artifacts.",
  engineSourceSha256: frozenEngineHash,
  measurementHarnessSha256: frozenMeasurementHash,
  referenceReportsSha256: frozenReferenceHash,
  coreEngineTrackedDiffPaths: statusPaths(engineFiles),
  sharedVarietyTrackedDiffPaths: statusPaths(["src/lib/matchmaking/v3/socialVariety.ts", "src/lib/matchmaking/v3/socialRollingVariety.ts"]),
  measurementHarnessTrackedDiffPaths: statusPaths(measurementFiles),
  referenceReportSourceProvenance: Object.fromEntries(Object.entries(references).map(([key, report]) => [key, report.sourceProvenance])),
  targetMatches,
  sessionTypes: ["SOCIAL_MIX"],
};
const policiesToRun = selectedPolicy ? [selectedPolicy] : Object.keys(policies);
const policyRuns = [];
mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, `social-courtmate-beneficial-rescue-${targetMatches}-run-manifest.json`);
assert(!existsSync(manifestPath) && !existsSync(`${manifestPath}.writing`), `Refusing to write into completed or pending output ${manifestPath}; choose a fresh --out-dir.`);

for (const policy of policiesToRun) {
  assert(hashFiles(engineFiles) === frozenEngineHash, `Engine source changed before ${policy}; discard this experiment.`);
  assert(hashFiles(measurementFiles) === frozenMeasurementHash, `Measurement source changed before ${policy}; discard this experiment.`);
  assert(hashFiles(Object.values(referenceReports)) === frozenReferenceHash, `Reference reports changed before ${policy}; discard this experiment.`);
  const config = policies[policy];
  const policyDir = path.join(outputDir, policy);
  const stem = `social-courtmate-beneficial-rescue-${targetMatches}-${config.stem}`;
  const jsonPath = path.join(policyDir, `${stem}.json`);
  if ([jsonPath, `${jsonPath}.pending`, `${jsonPath}.writing`].some(existsSync)) {
    throw new Error(`Refusing to overwrite ${jsonPath}; choose a fresh --out-dir.`);
  }
  mkdirSync(policyDir, { recursive: true });
  const sourceProvenance = {
    ...sourceProvenanceBase,
    policyLabel: config.label,
    matcherLabel: config.label,
    socialPriorityPolicy: config.socialPriorityPolicy,
  };
  const env = {
    ...process.env,
    RUN_SOCIAL_COURTMATE_BENEFICIAL_RESCUE_BENCHMARK: "1",
    BENCHMARK_BENEFICIAL_RESCUE_SEEDS: seeds.join(","),
    BENCHMARK_BENEFICIAL_RESCUE_TARGET_MATCHES: String(targetMatches),
    BENCHMARK_BENEFICIAL_RESCUE_POLICY: policy,
    BENCHMARK_BENEFICIAL_RESCUE_SOURCE_REVISION: sourceRevision,
    BENCHMARK_BENEFICIAL_RESCUE_SOURCE_PROVENANCE: JSON.stringify(sourceProvenance),
    BENCHMARK_BENEFICIAL_RESCUE_OUTPUT_JSON: jsonPath,
    BENCHMARK_BENEFICIAL_RESCUE_REFERENCE_BASELINE_JSON: path.join(root, referenceReports.baseline),
    BENCHMARK_BENEFICIAL_RESCUE_REFERENCE_STRICT_JSON: path.join(root, referenceReports.strict),
    BENCHMARK_BENEFICIAL_RESCUE_REFERENCE_RESCUE_JSON: path.join(root, referenceReports.rescue),
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
  assert(hashFiles(engineFiles) === frozenEngineHash, `Engine sources changed during ${policy}; discard this run.`);
  assert(hashFiles(measurementFiles) === frozenMeasurementHash, `Measurement sources changed during ${policy}; discard this run.`);
  assert(hashFiles(Object.values(referenceReports)) === frozenReferenceHash, `Reference reports changed during ${policy}; discard this run.`);
  assert(report.sourceProvenance.engineSourceSha256 === frozenEngineHash &&
    report.sourceProvenance.measurementHarnessSha256 === frozenMeasurementHash &&
    report.sourceProvenance.referenceReportsSha256 === frozenReferenceHash,
  `${policy}: report source hashes do not match the frozen start hashes.`);
  promoteValidatedReport(jsonPath);
  policyRuns.push({ policy, label: config.label, jsonPath: path.relative(outputDir, jsonPath), seeds, targetMatches });
  process.stdout.write(`Validated ${policy}: ${jsonPath}\n`);
}

assert(hashFiles(engineFiles) === frozenEngineHash, "Engine sources changed during the experiment; discard all policy reports.");
assert(hashFiles(measurementFiles) === frozenMeasurementHash, "Measurement sources changed during the experiment; discard all policy reports.");
assert(hashFiles(Object.values(referenceReports)) === frozenReferenceHash, "Reference reports changed during the experiment; discard all policy reports.");
if (!selectedPolicy) {
  assert(!existsSync(manifestPath), `Refusing to overwrite ${manifestPath}; choose a fresh --out-dir.`);
  const writingPath = `${manifestPath}.writing`;
  writeFileSync(writingPath, `${JSON.stringify({
    schemaVersion: "social-courtmate-beneficial-rescue-run-manifest-v1",
    generatedAt: new Date().toISOString(),
    targetMatches,
    seeds,
    sourceRevision,
    workingTreeDirty,
    engineSourceSha256: frozenEngineHash,
    measurementHarnessSha256: frozenMeasurementHash,
    referenceReportsSha256: frozenReferenceHash,
    policyRuns,
  }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  // Manifest promotion is atomic; report data is independently promoted only after validation.
  renameSync(writingPath, manifestPath);
  process.stdout.write(`Run manifest: ${manifestPath}\n`);
}
