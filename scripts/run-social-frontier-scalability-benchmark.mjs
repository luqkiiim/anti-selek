import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  assertSocialFrontierScalabilityReport,
  compareSocialFrontierEngineVersions,
  compareSocialFrontierSessionToSavedReference,
} from "./social-frontier-scalability-validation.mjs";

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
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const scenarios = {
  primary: ["frontier-14-7-7-2c", "frontier-16-8-8-2c", "frontier-18-9-9-3c"],
  regressions: ["frontier-regression-14-8-6-2c", "frontier-regression-14-10-4-2c"],
  opening: ["frontier-opening-20-10-10-3c", "frontier-opening-24-12-12-3c"],
};
const scenarioReferences = {
  "frontier-14-7-7-2c": "benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/beneficial/social-courtmate-beneficial-rescue-100-beneficial-courtmate-rescue.json",
  "frontier-regression-14-8-6-2c": "benchmarks/generated/social-generalization/full-2026-10-06-v1/fixed-14-8-6-2c.json",
  "frontier-regression-14-10-4-2c": "benchmarks/generated/social-generalization/full-2026-10-06-v1/fixed-14-10-4-2c.json",
};
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
  "src/lib/matchmaking/v3/socialFrontierScalabilityBenchmark.ts",
  "src/lib/matchmaking/v3/socialFrontierScalabilityBenchmark.test.ts",
  "src/lib/matchmaking/v3/socialGeneralizationAudit.ts",
  "src/lib/matchmaking/v3/socialGeneralizationScenarios.ts",
  "src/lib/matchmaking/v3/socialFrontierScalability.control.json",
  "scripts/run-social-frontier-scalability-benchmark.mjs",
  "scripts/social-frontier-scalability-validation.mjs",
  "scripts/summarize-social-frontier-scalability.mjs",
  "docs/social-frontier-scalability-experiment.md",
];
const referenceFiles = [...new Set(Object.values(scenarioReferences))];
const controlRoot = "benchmarks/fixtures/social-frontier-control";
const controlManifestPath = `${controlRoot}/source-manifest.json`;
const controlManifest = readJson(controlManifestPath);
const controlEnginePath = `${controlRoot}/src/lib/matchmaking/v3/socialBatch.ts`;
const recordedControl = readJson("src/lib/matchmaking/v3/socialFrontierScalability.control.json");
assert(sha256(readFileSync(path.join(root, controlEnginePath))) === controlManifest.engineSha256,
  "Original control source no longer matches its source manifest.");
assert(controlManifest.engineSha256 === recordedControl.controlSha256,
  "Control engine hash differs from the benchmark control fixture.");

function hashFiles(files) {
  const digest = createHash("sha256");
  for (const relative of [...files].sort()) {
    const file = path.join(root, relative);
    if (!existsSync(file)) throw new Error(`Required experiment source is missing: ${relative}`);
    digest.update(relative); digest.update("\0"); digest.update(readFileSync(file)); digest.update("\0");
  }
  return digest.digest("hex");
}
function hashControlTree() {
  const snapshotFiles = Object.keys(controlManifest.files).map((file) => `${controlRoot}/${file}`);
  return hashFiles([...snapshotFiles, controlEnginePath, controlManifestPath]);
}
function git(command) {
  const result = spawnSync("git", command, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${command.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function assertFrozen(hashes) {
  assert(hashFiles(engineFiles) === hashes.engine, "Current engine sources changed during the measurement.");
  assert(hashControlTree() === hashes.control, "Original control snapshot changed during the measurement.");
  assert(hashFiles(measurementFiles) === hashes.measurement, "Measurement source changed during the measurement.");
  assert(hashFiles(referenceFiles) === hashes.references, "Frozen comparison reports changed during the measurement.");
}

if (hasFlag("--help")) {
  console.log("Usage: node scripts/run-social-frontier-scalability-benchmark.mjs [--profile primary|regressions|opening] [--only-scenario ID] [--seed N] [--target-matches 1..100] [--engine both|original-control|current] [--out-dir benchmarks/generated/...] ");
  console.log("Default: primary 14/16/18-player profiles, three matched seeds, both original-control and current engine, 100 completed matches. No budget overrides; every session remains pending until independent validation passes.");
  process.exit(0);
}

const profile = valueAfter("--profile", "primary");
assert(Object.hasOwn(scenarios, profile), `Unknown profile ${profile}; choose primary, regressions, or opening.`);
const requestedScenario = valueAfter("--only-scenario");
const scenarioIds = requestedScenario ? [requestedScenario] : scenarios[profile];
assert(scenarioIds.every((id) => Object.values(scenarios).flat().includes(id)), "Unknown scenario ID.");
const seedArg = valueAfter("--seed");
const seeds = seedArg === undefined ? [1, 4729, 104729] : [Number(seedArg)];
assert(seeds.length > 0 && seeds.every((seed) => Number.isSafeInteger(seed) && seed > 0), "Seeds must be positive safe integers.");
const targetMatches = Number(valueAfter("--target-matches", "100"));
assert(Number.isSafeInteger(targetMatches) && targetMatches >= 1 && targetMatches <= 100, "Target must be from 1 to 100.");
const engineFlag = valueAfter("--engine", "both");
const engineVersions = engineFlag === "both" ? ["original-control", "current"]
  : engineFlag === "original-control" || engineFlag === "current" ? [engineFlag] : null;
assert(engineVersions, "--engine must be both, original-control, or current.");
const outputDir = path.resolve(root, valueAfter("--out-dir", `benchmarks/generated/social-frontier-scalability/${profile}-2026-10-06-v1`));
const generatedRoot = path.resolve(root, "benchmarks/generated");
assert(outputDir.startsWith(`${generatedRoot}${path.sep}`), "Output directory must remain below ignored benchmarks/generated/.");
assert(!existsSync(outputDir), `Refusing to overwrite ${outputDir}; choose a new output directory.`);
assert(scenarioIds.length > 0, "No scenarios selected.");

const hashes = {
  engine: hashFiles(engineFiles),
  control: hashControlTree(),
  measurement: hashFiles(measurementFiles),
  references: hashFiles(referenceFiles),
};
const sourceProvenance = {
  commitSha: git(["rev-parse", "HEAD"]),
  workingTreeDirty: git(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0,
  currentEngineSourcesSha256: hashes.engine,
  originalControlEngineSha256: controlManifest.engineSha256,
  originalControlTreeSha256: hashes.control,
  measurementHarnessSha256: hashes.measurement,
  frozenReferenceReportsSha256: hashes.references,
  controlManifestPath,
  policy: "courtmate-beneficial-rescue",
  engineVersions,
  defaultSearchBudgets: true,
  targetMatches,
};

const seedsForManifest = seeds;
mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "social-frontier-scalability-run-manifest.json");
const manifest = {
  schemaVersion: "social-frontier-scalability-run-manifest-v1",
  generatedAt: new Date().toISOString(),
  profile,
  seeds: seedsForManifest,
  targetMatches,
  engineVersions,
  sourceProvenance,
  referencePaths: Object.fromEntries(scenarioIds.filter((id) => scenarioReferences[id]).map((id) => [id, scenarioReferences[id]])),
  scenarioRuns: [],
};
writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
const testFile = path.join(root, "node_modules/vitest/vitest.mjs");
for (const scenarioId of scenarioIds) {
  assertFrozen(hashes);
  const reportPath = path.join(outputDir, `${scenarioId}.json`);
  console.log(`\nRunning ${scenarioId}: engines=${engineVersions.join(",")}, seeds=${seeds.join(",")}, target=${targetMatches}.`);
  const child = spawnSync(process.execPath, [testFile, "run", "src/lib/matchmaking/v3/socialFrontierScalabilityBenchmark.test.ts", "--maxWorkers=1"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      RUN_SOCIAL_FRONTIER_SCALABILITY_BENCHMARK: "1",
      FRONTIER_SCALABILITY_SCENARIO_ID: scenarioId,
      FRONTIER_SCALABILITY_JSON_PATH: reportPath,
      FRONTIER_SCALABILITY_SEEDS: JSON.stringify(seeds),
      FRONTIER_SCALABILITY_ENGINE_VERSIONS: JSON.stringify(engineVersions),
      FRONTIER_SCALABILITY_TARGET_MATCHES: String(targetMatches),
      FRONTIER_SCALABILITY_PROVENANCE: JSON.stringify(sourceProvenance),
    },
  });
  assert(child.status === 0, `${scenarioId}: Vitest bridge failed. Raw report, if any, remains pending.`);
  assertFrozen(hashes);
  assert(existsSync(reportPath) && existsSync(`${reportPath}.pending`), `${scenarioId}: bridge did not retain pending raw data.`);
  const report = readJson(path.relative(root, reportPath));
  assert(JSON.stringify(report.sourceProvenance) === JSON.stringify(sourceProvenance), `${scenarioId}: report provenance mismatch.`);
  const validation = assertSocialFrontierScalabilityReport(report, { scenarioId, seeds, engineVersions, targetMatches });
  const savedReference = scenarioReferences[scenarioId];
  const referenceComparisons = [];
  if (savedReference) {
    for (const session of report.sessions) {
      referenceComparisons.push(compareSocialFrontierSessionToSavedReference(session, savedReference, {
        targetMatches,
        expectedArm: { scenarioId: scenarioId === "frontier-regression-14-8-6-2c" ? "fixed-14-8-6-2c"
          : scenarioId === "frontier-regression-14-10-4-2c" ? "fixed-14-10-4-2c" : undefined },
      }));
    }
  }
  const sessionMap = new Map(report.sessions.map((session) => [`${session.seed}/${session.engineVersion}`, session]));
  const engineComparisons = [];
  if (engineVersions.includes("original-control") && engineVersions.includes("current")) {
    for (const seed of seeds) {
      const control = sessionMap.get(`${seed}/original-control`);
      const current = sessionMap.get(`${seed}/current`);
      engineComparisons.push(compareSocialFrontierEngineVersions(control, current));
    }
  }
  report.validation = { status: "passed", validation, referenceComparisons, engineComparisons };
  report.validationStatus = "passed";
  writeFileSync(`${reportPath}.writing`, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  renameSync(`${reportPath}.writing`, reportPath);
  unlinkSync(`${reportPath}.pending`);
  manifest.scenarioRuns.push({ scenarioId, jsonPath: path.basename(reportPath), validationStatus: "passed", validation,
    referenceComparisons, engineComparisons });
  writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Validated ${scenarioId}: ${validation.decisionCount} audited calls; ${validation.completedMatches} completed matches across sessions.`);
}
assertFrozen(hashes);
writeFileSync(`${manifestPath}.writing`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
renameSync(`${manifestPath}.writing`, manifestPath);
unlinkSync(`${manifestPath}.pending`);
console.log(`Run manifest: ${manifestPath}`);
