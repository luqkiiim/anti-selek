import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { assertSocialJointRefillReport, assertSocialJointRefillTamperResistance } from "./social-joint-refill-validation.mjs";

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

const scenarioMap = {
  "edge-8-8-0-2c": { upper: 8, lower: 0, courtCount: 2, engineVersions: ["production", "courtmate-beneficial-rescue"] },
  "balanced-10-5-5-2c": { upper: 5, lower: 5, courtCount: 2, engineVersions: ["production", "courtmate-beneficial-rescue"] },
  "balanced-12-6-6-2c": { upper: 6, lower: 6, courtCount: 2, engineVersions: ["courtmate-beneficial-rescue"] },
  "balanced-12-6-6-3c": { upper: 6, lower: 6, courtCount: 3, engineVersions: ["courtmate-beneficial-rescue"] },
};
const allScenarioIds = Object.keys(scenarioMap);
const defaultSeeds = [1, 4729, 104729];
const schedulers = ["immediate", "conditional-wait"];
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
  "src/lib/matchmaking/v3/socialJointRefillExperimentBenchmark.test.ts",
  "src/lib/matchmaking/v3/socialGeneralizationAudit.ts",
  "src/lib/matchmaking/v3/socialGeneralizationScenarios.ts",
  "scripts/run-social-joint-refill-experiment.mjs",
  "scripts/social-joint-refill-validation.mjs",
  "scripts/social-generalization-validation.mjs",
  "docs/social-joint-refill-experiment.md",
];
const preservedEngineHash = "4c0b336d294b273e6d86cd4b99417b07ae4bf9d2e9ed527c10fc10d4cdd7bd5e";
const preservedBatchHash = "3fac6611ba7d116aab040b36e2f5e13b9ddfd1cbdd5d81f43d5051c83294ceb7";
const preservedFrontierBoundsHash = "e03536aaefc90b70b89c4fbd0341a7663740c0f5f1b3ea733ef20c4645c193b0";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function hashFiles(files) {
  const digest = createHash("sha256");
  for (const relative of [...files].sort()) {
    const file = path.join(root, relative);
    if (!existsSync(file)) throw new Error(`Required experiment source is missing: ${relative}`);
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
  assert(hashFiles(engineFiles) === hashes.engine, "Matcher engine sources changed during the scheduler experiment.");
  assert(hashFiles(measurementFiles) === hashes.measurement, "Scheduler harness, validator, or protocol changed during the experiment.");
}

if (hasFlag("--help")) {
  console.log("Usage: node scripts/run-social-joint-refill-experiment.mjs [--scenario ID] [--seed N] [--target-matches 1..100] [--out-dir benchmarks/generated/...");
  console.log("Default: four scenarios, seeds 1/4729/104729, matched immediate/conditional-wait arms, 100 completed matches. Reports remain pending until independent trace validation passes.");
  process.exit(0);
}

const selectedScenario = valueAfter("--scenario");
const scenarioIds = selectedScenario ? [selectedScenario] : allScenarioIds;
assert(scenarioIds.every((id) => Object.hasOwn(scenarioMap, id)), "Unknown scenario ID.");
const selectedSeed = valueAfter("--seed");
const seeds = selectedSeed === undefined ? defaultSeeds : [Number(selectedSeed)];
assert(seeds.every((seed) => Number.isSafeInteger(seed) && seed > 0), "Seeds must be positive safe integers.");
const targetCompletedMatches = Number(valueAfter("--target-matches", "100"));
assert(Number.isSafeInteger(targetCompletedMatches) && targetCompletedMatches >= 1 && targetCompletedMatches <= 100,
  "Target must be from 1 to 100 completed matches.");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/social-joint-refill/full-2026-10-07-v1"));
const generatedRoot = path.resolve(root, "benchmarks/generated");
assert(outputDir.startsWith(`${generatedRoot}${path.sep}`), "Output must remain under ignored benchmarks/generated/.");
assert(!existsSync(outputDir), `Refusing to overwrite ${outputDir}; choose a fresh --out-dir.`);

const hashes = {
  engine: hashFiles(engineFiles),
  measurement: hashFiles(measurementFiles),
};
assert(hashes.engine === preservedEngineHash, "The current matcher engine differs from the source frozen for this experiment.");
assert(sha256(readFileSync(path.join(root, "src/lib/matchmaking/v3/socialBatch.ts"))) === preservedBatchHash,
  "socialBatch.ts differs from the frozen matcher hash.");
assert(sha256(readFileSync(path.join(root, "src/lib/matchmaking/v3/socialFrontierSearchBounds.ts"))) === preservedFrontierBoundsHash,
  "socialFrontierSearchBounds.ts differs from the frozen helper hash.");

const sourceProvenance = {
  commitSha: git(["rev-parse", "HEAD"]),
  workingTreeDirty: git(["status", "--porcelain=v1", "--untracked-files=all"]).length > 0,
  matcherEngineSourceSetSha256: hashes.engine,
  socialBatchSha256: preservedBatchHash,
  frontierBoundsSha256: preservedFrontierBoundsHash,
  measurementSourcesSha256: hashes.measurement,
  scenarioIds,
  seeds,
  schedulers,
  targetCompletedMatches,
  durationStream: "Park-Miller per seed and physical court; seed XOR (0x51ed270b + (courtIndex+1)*0x9e3779b1), multiplier 48271",
  durationFormula: "20*(0.8+0.4*u) minutes",
  waitThresholdMinutes: 5,
  minimumPerCourtNewCourtmatePairs: 1,
  minimumPerCourtSignedRollingTypeGain: 0.5,
  matcherSearchBudgetsOverridden: false,
};

mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "social-joint-refill-run-manifest.json");
const manifest = {
  schemaVersion: "social-joint-refill-run-manifest-v1",
  generatedAt: new Date().toISOString(),
  scenarioIds,
  seeds,
  schedulers,
  targetCompletedMatches,
  sourceProvenance,
  scenarioRuns: [],
};
writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
for (const scenarioId of scenarioIds) {
  assertFrozen(hashes);
  const reportPath = path.join(outputDir, `${scenarioId}.json`);
  console.log(`\nRunning ${scenarioId}: ${seeds.length} seed(s), ${targetCompletedMatches} match target.`);
  const child = spawnSync(process.execPath, [vitest, "run", "src/lib/matchmaking/v3/socialJointRefillExperimentBenchmark.test.ts", "--maxWorkers=1"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      RUN_SOCIAL_JOINT_REFILL_EXPERIMENT: "1",
      JOINT_REFILL_SCENARIO_ID: scenarioId,
      JOINT_REFILL_SEEDS: JSON.stringify(seeds),
      JOINT_REFILL_TARGET_MATCHES: String(targetCompletedMatches),
      JOINT_REFILL_JSON_PATH: reportPath,
      JOINT_REFILL_PROVENANCE: JSON.stringify(sourceProvenance),
    },
  });
  assert(child.status === 0, `${scenarioId}: Vitest bridge failed; raw output remains pending if it was written.`);
  assertFrozen(hashes);
  assert(existsSync(reportPath) && existsSync(`${reportPath}.pending`), `${scenarioId}: missing pending raw report or sentinel.`);
  const report = readJson(path.relative(root, reportPath));
  assert(report.validationStatus === "pending", `${scenarioId}: raw report was not left pending for independent validation.`);
  assert(JSON.stringify(report.sourceProvenance) === JSON.stringify(sourceProvenance), `${scenarioId}: source provenance mismatch.`);
  const validation = assertSocialJointRefillReport(report, { scenarioId, seeds, targetCompletedMatches });
  const tamperChecks = assertSocialJointRefillTamperResistance(report, { scenarioId, seeds, targetCompletedMatches });
  report.validationStatus = "passed";
  report.validation = { status: "passed", ...validation, tamperChecks };
  writeFileSync(`${reportPath}.writing`, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  renameSync(`${reportPath}.writing`, reportPath);
  unlinkSync(`${reportPath}.pending`);
  manifest.scenarioRuns.push({ scenarioId, file: path.basename(reportPath), validationStatus: "passed", ...validation });
  writeFileSync(`${manifestPath}.pending`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Validated ${scenarioId}: ${validation.sessionCount} sessions, ${validation.completedMatches} completed matches, ${validation.decisionCount} decisions.`);
}

assertFrozen(hashes);
writeFileSync(`${manifestPath}.writing`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
renameSync(`${manifestPath}.writing`, manifestPath);
unlinkSync(`${manifestPath}.pending`);
console.log(`Run manifest: ${manifestPath}`);
