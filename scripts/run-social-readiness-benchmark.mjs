import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { assertSocialReadinessClockReport, assertSocialReadinessClockTamperResistance } from "./social-readiness-validation.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value after ${flag}.`);
  return args[index + 1];
};
const hasFlag = (flag) => args.includes(flag);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const defaultSeeds = [1, 4729, 104729];
const scenarioMap = {
  "balanced-10-5-5-2c": { id: "balanced-10-5-5-2c", upper: 5, lower: 5, courtCount: 2 },
  "balanced-12-6-6-2c": { id: "balanced-12-6-6-2c", upper: 6, lower: 6, courtCount: 2 },
  "fixed-14-7-7-2c": { id: "fixed-14-7-7-2c", upper: 7, lower: 7, courtCount: 2 },
  "balanced-16-8-8-2c": { id: "balanced-16-8-8-2c", upper: 8, lower: 8, courtCount: 2 },
  "fixed-14-8-6-2c": { id: "fixed-14-8-6-2c", upper: 8, lower: 6, courtCount: 2 },
  "fixed-14-9-5-2c": { id: "fixed-14-9-5-2c", upper: 9, lower: 5, courtCount: 2 },
  "fixed-14-10-4-2c": { id: "fixed-14-10-4-2c", upper: 10, lower: 4, courtCount: 2 },
  "readiness-15-8-7-3c": { id: "readiness-15-8-7-3c", upper: 8, lower: 7, courtCount: 3 },
  "readiness-16-8-8-3c": { id: "readiness-16-8-8-3c", upper: 8, lower: 8, courtCount: 3 },
  "balanced-18-9-9-3c": { id: "balanced-18-9-9-3c", upper: 9, lower: 9, courtCount: 3 },
};
const allScenarioIds = Object.keys(scenarioMap);
const arms = ["production-immediate", "beneficial-immediate", "beneficial-conditional-wait"];
const engineFiles = [
  "src/lib/matchmaking/v3/socialBatch.ts",
  "src/lib/matchmaking/v3/socialCourtmatePriority.ts",
  "src/lib/matchmaking/v3/socialFrontierSearchBounds.ts",
  "src/lib/matchmaking/v3/socialVariety.ts",
  "src/lib/matchmaking/v3/socialHorizonCoverageScoring.ts",
  "src/lib/matchmaking/v3/socialRollingVariety.ts",
  "src/lib/matchmaking/v3/types.ts",
  "src/lib/matchmaking/v3/singleCourt.ts",
  "src/lib/matchmaking/v3/balance.ts",
  "src/lib/matchmaking/v3/balanceGuardrail.ts",
  "src/lib/matchmaking/v3/scoring.ts",
  "src/lib/matchmaking/v3/fairness.ts",
  "src/lib/matchmaking/v3/rematch.ts",
  "src/lib/matchmaking/v3/consecutive.ts",
  "src/lib/matchmaking/arrivalPriority.ts",
  "src/lib/mixedSide.ts",
  "src/types/enums.ts",
];
const measurementFiles = [
  "src/lib/matchmaking/v3/socialJointRefillExperiment.ts",
  "src/lib/matchmaking/v3/socialReadinessBenchmark.test.ts",
  "src/lib/matchmaking/v3/socialJointRefillExperimentBenchmark.test.ts",
  "src/lib/matchmaking/v3/socialGeneralizationAudit.ts",
  "src/lib/matchmaking/v3/socialGeneralizationScenarios.ts",
  "scripts/run-social-readiness-benchmark.mjs",
  "scripts/social-readiness-validation.mjs",
  "scripts/social-joint-refill-validation.mjs",
  "scripts/social-generalization-validation.mjs",
  "docs/social-joint-refill-experiment.md",
  "docs/social-realistic-readiness-experiment.md",
];
const legacyReportPaths = [
  "benchmarks/generated/social-readiness/full-2026-10-07-v1/legacy-short-16-8-8-2c/frontier-16-8-8-2c.json",
  "benchmarks/generated/social-readiness/full-2026-10-07-v1/legacy-short-18-9-9-3c/frontier-18-9-9-3c.json",
  "benchmarks/generated/social-readiness/full-2026-10-07-v1/legacy-100-16-8-8-2c/frontier-16-8-8-2c.json",
  "benchmarks/generated/social-readiness/full-2026-10-07-v1/legacy-100-18-9-9-3c/frontier-18-9-9-3c.json",
];
const referencePaths = [
  "benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1/frontier-16-8-8-2c.json",
  "benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1/frontier-18-9-9-3c.json",
];
const expectedEngineSourceSet = "4c0b336d294b273e6d86cd4b99417b07ae4bf9d2e9ed527c10fc10d4cdd7bd5e";
const expectedBatchHash = "3fac6611ba7d116aab040b36e2f5e13b9ddfd1cbdd5d81f43d5051c83294ceb7";
const expectedFrontierBoundsHash = "e03536aaefc90b70b89c4fbd0341a7663740c0f5f1b3ea733ef20c4645c193b0";
const expectedJointRefillProtocolHash = "14aff3721946a62ed98eeca498aebe4e5665ba1fd7dec3dd886464a27d09e1cb";

function hashFiles(files) {
  const digest = createHash("sha256");
  for (const relative of [...files].sort()) {
    const file = path.join(root, relative);
    if (!existsSync(file)) throw new Error(`Required readiness source or report is missing: ${relative}`);
    digest.update(relative); digest.update("\0"); digest.update(readFileSync(file)); digest.update("\0");
  }
  return digest.digest("hex");
}

function git(command) {
  const result = spawnSync("git", command, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${command.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function assertFrozen(hashes) {
  assert(hashFiles(engineFiles) === hashes.engine, "Matcher engine sources changed during readiness measurement.");
  assert(hashFiles(measurementFiles) === hashes.measurement, "Readiness harness, validator, or conditional-wait protocol changed during measurement.");
  assert(hashFiles(legacyReportPaths) === hashes.legacyReports, "Validated legacy readiness reports changed during measurement.");
  assert(hashFiles(referencePaths) === hashes.references, "Frozen current-engine comparison reports changed during measurement.");
}

if (hasFlag("--help")) {
  console.log("Usage: node scripts/run-social-readiness-benchmark.mjs [--only-scenario ID] [--out-dir benchmarks/generated/...] [--preflight]");
  console.log("Default runs all 10 realistic profiles, three matched seeds, and 3 arms to 100 completed matches. Engine budgets and the five-minute conditional-wait rule are unchanged.");
  process.exit(0);
}

const requestedScenario = valueAfter("--only-scenario");
const scenarioIds = requestedScenario ? [requestedScenario] : allScenarioIds;
assert(scenarioIds.every((id) => Object.hasOwn(scenarioMap, id)), "Unknown scenario ID.");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/social-readiness/full-2026-10-07-v1/real-clock-grid"));
const generatedRoot = path.resolve(root, "benchmarks/generated");
assert(outputDir.startsWith(`${generatedRoot}${path.sep}`), "Output directory must remain below ignored benchmarks/generated/.");
assert(!existsSync(outputDir), `Refusing to overwrite ${outputDir}; choose a new output directory.`);

const legacyReportHashes = Object.fromEntries(legacyReportPaths.map((relative) => [relative, sha256(readFileSync(path.join(root, relative)))]));
const referenceReportHashes = Object.fromEntries(referencePaths.map((relative) => [relative, sha256(readFileSync(path.join(root, relative)))]));
const hashes = {
  engine: hashFiles(engineFiles),
  measurement: hashFiles(measurementFiles),
  legacyReports: hashFiles(legacyReportPaths),
  references: hashFiles(referencePaths),
};
assert(hashes.engine === expectedEngineSourceSet, "Current matcher source set differs from the previously frozen beneficial-rescue engine.");
assert(sha256(readFileSync(path.join(root, "src/lib/matchmaking/v3/socialBatch.ts"))) === expectedBatchHash,
  "socialBatch.ts differs from the matcher source frozen for the earlier experiments.");
assert(sha256(readFileSync(path.join(root, "src/lib/matchmaking/v3/socialFrontierSearchBounds.ts"))) === expectedFrontierBoundsHash,
  "socialFrontierSearchBounds.ts differs from the matcher source frozen for the earlier experiments.");
assert(sha256(readFileSync(path.join(root, "src/lib/matchmaking/v3/socialJointRefillExperiment.ts"))) === expectedJointRefillProtocolHash,
  "socialJointRefillExperiment.ts differs from the scheduler protocol frozen for the earlier experiment.");
for (const relative of legacyReportPaths) {
  const report = readJson(relative);
  assert(report.validationStatus === "passed", `Legacy phase input was not validated: ${relative}`);
}

const sourceProvenance = {
  commitSha: git(["rev-parse", "HEAD"]),
  workingTreeDirty: git(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0,
  matcherEngineSourceSetSha256: hashes.engine,
  socialBatchSha256: expectedBatchHash,
  frontierBoundsSha256: expectedFrontierBoundsHash,
  jointRefillProtocolSourceSha256: expectedJointRefillProtocolHash,
  jointRefillValidatorSourceSha256: sha256(readFileSync(path.join(root, "scripts/social-joint-refill-validation.mjs"))),
  priorJointRefillRuleAndProtocolMeasurementSha256: "9903c7260a3c17e960fefbca971d7f3bfeb526d90b8f1ce216c06721af5499cf",
  measurementSourcesSha256: hashes.measurement,
  legacyPhaseReportsSha256: hashes.legacyReports,
  frozenReferenceReportsSha256: hashes.references,
  legacyReportHashes,
  frozenReferenceReportHashes: referenceReportHashes,
  policy: "courtmate-beneficial-rescue",
  arms,
  seeds: defaultSeeds,
  targetCompletedMatches: 100,
  defaultSearchBudgets: true,
  matcherSearchBudgetsOverridden: false,
  durationFormula: "20 * (0.8 + 0.4*u) minutes; Park-Miller independent stream by seed, physical court, and assignment ordinal.",
  conditionalWaitRule: "At most one wait for the next busy completion group; predicted gap <=5 minutes; both immediate and future previews must pass the existing wait certification; wait if per-court completed-only new-C gain improves >=1 or signed rolling-six T gain improves >=0.5; actual matcher RNG is consumed only on execution.",
  conditionalWaitThresholdsRetuned: false,
};
if (hasFlag("--preflight")) {
  console.log(JSON.stringify({
    matcherEngineSourceSetSha256: hashes.engine,
    measurementSourcesSha256: hashes.measurement,
    legacyPhaseReportsSha256: hashes.legacyReports,
    frozenReferenceReportsSha256: hashes.references,
    sourceProvenance,
  }, null, 2));
  process.exit(0);
}
mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "social-readiness-clock-run-manifest.json");
const manifest = {
  schemaVersion: "social-realistic-readiness-clock-manifest-v1",
  validationStatus: "pending",
  generatedAt: new Date().toISOString(),
  scope: scenarioIds.length === allScenarioIds.length ? "full-grid" : "scenario-subset",
  scenarioIds,
  seeds: sourceProvenance.seeds,
  arms,
  targetCompletedMatches: 100,
  sourceProvenance,
  legacyPhaseReports: legacyReportPaths.map((file) => ({ file, sha256: legacyReportHashes[file] })),
  frozenReferences: referencePaths.map((file) => ({ file, sha256: referenceReportHashes[file] })),
  reports: legacyReportPaths.map((file, index) => ({
    path: path.relative(root, file),
    sha256: legacyReportHashes[file],
    kind: index < 2 ? "legacy-short" : "legacy-100",
  })),
  scenarioRuns: [],
};
writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
const vitestPath = path.join(root, "node_modules/vitest/vitest.mjs");
for (const scenarioId of scenarioIds) {
  assertFrozen(hashes);
  const reportPath = path.join(outputDir, `${scenarioId}.json`);
  console.log(`\nRunning ${scenarioId}: seeds=${sourceProvenance.seeds.join(",")}, arms=${arms.join(",")}, target=100.`);
  const child = spawnSync(process.execPath, [vitestPath, "run", "src/lib/matchmaking/v3/socialReadinessBenchmark.test.ts", "--maxWorkers=1"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      RUN_SOCIAL_READINESS_CLOCK_GRID: "1",
      READINESS_SCENARIO: JSON.stringify(scenarioMap[scenarioId]),
      READINESS_SEEDS: JSON.stringify(sourceProvenance.seeds),
      READINESS_TARGET_MATCHES: "100",
      READINESS_JSON_PATH: reportPath,
      READINESS_PROVENANCE: JSON.stringify(sourceProvenance),
    },
  });
  assert(child.status === 0, `${scenarioId}: Vitest bridge failed; pending trace, if written, remains for diagnosis.`);
  assertFrozen(hashes);
  assert(existsSync(reportPath) && existsSync(`${reportPath}.pending`), `${scenarioId}: pending raw report is missing.`);
  const report = readJson(path.relative(root, reportPath));
  assert(JSON.stringify(report.sourceProvenance) === JSON.stringify(sourceProvenance), `${scenarioId}: source provenance mismatch.`);
  const validation = assertSocialReadinessClockReport(report, {
    scenario: scenarioMap[scenarioId],
    seeds: sourceProvenance.seeds,
    targetCompletedMatches: 100,
  });
  const tamperChecks = assertSocialReadinessClockTamperResistance(report, {
    scenario: scenarioMap[scenarioId],
    seeds: sourceProvenance.seeds,
    targetCompletedMatches: 100,
  });
  report.validation = { status: "passed", ...validation, tamperChecks };
  report.validationStatus = "passed";
  writeFileSync(`${reportPath}.writing`, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  renameSync(`${reportPath}.writing`, reportPath);
  unlinkSync(`${reportPath}.pending`);
  manifest.scenarioRuns.push({
    scenarioId,
    file: path.basename(reportPath),
    sha256: sha256(readFileSync(reportPath)),
    validationStatus: "passed",
    successfulSessions: validation.successfulSessions,
    failedOrIncompleteSessions: validation.failedOrIncompleteSessions,
    matcherCallCount: validation.matcherCallCount,
    completedMatches: validation.completedMatches,
    waitsTaken: validation.waitsTaken,
    pairedOpeningChecks: validation.pairedOpeningChecks,
  });
  manifest.reports.push({
    path: path.relative(root, reportPath),
    sha256: sha256(readFileSync(reportPath)),
    kind: "real-clock-grid",
  });
  writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Validated ${scenarioId}: ${validation.sessionCount} traces, ${validation.successfulSessions}/9 full horizons, ${validation.matcherCallCount} matcher calls, ${validation.waitsTaken} waits.`);
}
assertFrozen(hashes);
manifest.validationStatus = "passed";
manifest.gridComplete = scenarioIds.length === allScenarioIds.length;
writeFileSync(`${manifestPath}.writing`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
renameSync(`${manifestPath}.writing`, manifestPath);
unlinkSync(`${manifestPath}.pending`);
console.log(`Clock readiness manifest: ${manifestPath}`);
