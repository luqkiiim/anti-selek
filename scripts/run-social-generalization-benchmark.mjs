import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertSocialGeneralizationReport } from "./social-generalization-validation.mjs";

const args = process.argv.slice(2);
const root = process.cwd();
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value after ${name}.`);
  return args[index + 1];
};
const has = (name) => args.includes(name);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const scenarioIds = [
  "fixed-14-8-6-2c", "fixed-14-9-5-2c", "fixed-14-10-4-2c",
  "balanced-10-5-5-1c", "balanced-10-5-5-2c", "balanced-12-6-6-2c",
  "balanced-16-8-8-2c", "balanced-18-9-9-3c", "edge-14-11-3-2c",
  "edge-8-8-0-2c", "edge-6-3-3-1c", "dynamic-arrival-12-6-6-to-14-after-8",
  "dynamic-feasibility-10-3-to-10-4-after-8", "dynamic-pause-resume-14-7-7-p1-at-6-12",
  "dynamic-played-departure-as-pause-14-10-4-p14-after-8", "dynamic-pause-resume-14-10-4-p14-at-8-14",
];
const pilotScenarios = ["fixed-14-8-6-2c", "edge-6-3-3-1c", "dynamic-feasibility-10-3-to-10-4-after-8", "dynamic-pause-resume-14-7-7-p1-at-6-12"];
const engineFiles = [
  "src/lib/matchmaking/v3/socialBatch.ts", "src/lib/matchmaking/v3/socialCourtmatePriority.ts",
  "src/lib/matchmaking/v3/socialVariety.ts", "src/lib/matchmaking/v3/socialRollingVariety.ts",
  "src/lib/matchmaking/v3/types.ts", "src/lib/matchmaking/v3/singleCourt.ts",
  "src/lib/matchmaking/v3/balance.ts", "src/lib/matchmaking/v3/balanceGuardrail.ts",
  "src/lib/matchmaking/v3/scoring.ts", "src/lib/matchmaking/v3/fairness.ts",
  "src/lib/matchmaking/v3/rematch.ts", "src/lib/matchmaking/v3/consecutive.ts",
];
const measurementFiles = [
  "src/lib/matchmaking/v3/socialGeneralizationScenarios.ts",
  "src/lib/matchmaking/v3/socialGeneralizationScenarios.test.ts",
  "src/lib/matchmaking/v3/socialGeneralizationAudit.ts",
  "src/lib/matchmaking/v3/socialGeneralizationAudit.test.ts",
  "src/lib/matchmaking/v3/socialGeneralizationBenchmark.ts",
  "src/lib/matchmaking/v3/socialGeneralizationBenchmark.test.ts",
  "src/lib/matchmaking/matchmakingCredit.ts",
  "scripts/run-social-generalization-benchmark.mjs", "scripts/social-generalization-validation.mjs",
];
const integrityPath = path.join(root, "benchmarks/generated/social-generalization/integrity-2026-10-06-v1.json");
const canonicalDir = path.join(root, "benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1");
const canonicalManifestPath = path.join(canonicalDir, "social-courtmate-beneficial-rescue-100-run-manifest.json");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
function hashFiles(files) {
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative); hash.update("\0"); hash.update(readFileSync(path.resolve(root, relative))); hash.update("\0");
  }
  return hash.digest("hex");
}
function git(command) {
  const result = spawnSync("git", command, { cwd: root, encoding: "utf8" });
  assert(result.status === 0, result.stderr || "Could not inspect git state.");
  return result.stdout.trim();
}
if (has("--help")) {
  console.log("Usage: node scripts/run-social-generalization-benchmark.mjs [--pilot] [--short-only] [--only-scenario ID] [--seed N] [--out-dir benchmarks/generated/...]");
  console.log("Three matched seeds and both production/beneficial arms by default. Short checkpoints target roughly six appearances/player; selected diagnostics stop at 100. Canonical 7/7 reuses the saved four-arm reference. Search-limited sessions remain explicit results.");
  process.exit(0);
}
const pilot = has("--pilot");
const mode = pilot || has("--short-only") ? "short" : "selected-long";
const selected = valueAfter("--only-scenario");
const chosenIds = selected ? [selected] : pilot ? pilotScenarios : scenarioIds;
assert(chosenIds.every((id) => scenarioIds.includes(id)), "Unknown scenario; canonical 7/7 is retained through the saved four-arm reference.");
const singleSeed = valueAfter("--seed");
const seeds = singleSeed === undefined ? pilot ? [1] : [1, 4729, 104729] : [Number(singleSeed)];
assert(seeds.every((seed) => Number.isSafeInteger(seed) && seed > 0), "Seeds must be positive safe integers.");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks/generated/social-generalization/full-2026-10-06-v1"));
const generatedRoot = path.join(root, "benchmarks/generated");
assert(outputDir.startsWith(`${generatedRoot}${path.sep}`), "Outputs must remain below ignored benchmarks/generated/.");
assert(!existsSync(outputDir), "Refusing to overwrite an existing output directory; choose a fresh --out-dir.");
const integrity = read(integrityPath);
function assertUnchangedEngine() {
  for (const [relative, expected] of Object.entries(integrity.files)) {
    const actual = createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
    assert(actual === expected, `Preserved source changed: ${relative}.`);
  }
}
assertUnchangedEngine();
const canonical = read(canonicalManifestPath);
assert(canonical.targetMatches === 100 && canonical.policyRuns.length === 4, "Expected the complete four-arm canonical reference.");
const referenceFiles = [canonicalManifestPath, ...canonical.policyRuns.map((run) => path.join(canonicalDir, run.jsonPath))];
for (const run of canonical.policyRuns) assert(read(path.join(canonicalDir, run.jsonPath)).validationStatus === "passed", `Canonical ${run.policy} report is not validated.`);
const engineHash = hashFiles(engineFiles);
assert(engineHash === canonical.engineSourceSha256, "The candidate/production engine no longer matches the canonical experiment.");
const measurementHash = hashFiles(measurementFiles);
const referenceHash = hashFiles(referenceFiles);
const sourceProvenance = {
  commitSha: git(["rev-parse", "HEAD"]), workingTreeDirty: git(["status", "--porcelain"]).length > 0,
  engineSourceSha256: engineHash, measurementHarnessSha256: measurementHash, referenceReportsSha256: referenceHash,
  fixedPolicy: "courtmate-beneficial-rescue", defaultSearchBudgets: true,
  canonicalManifestPath, preservedSourceIntegrityPath: integrityPath,
};
mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "social-generalization-run-manifest.json");
const manifest = {
  schemaVersion: "social-generalization-run-manifest-v1", generatedAt: new Date().toISOString(), mode, seeds,
  maxCompletedMatches: 100, sourceProvenance, canonicalReference: { manifestPath: canonicalManifestPath, seeds: canonical.seeds }, scenarioRuns: [],
};
writeFileSync(`${manifestPath}.pending`, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
for (const scenarioId of chosenIds) {
  assertUnchangedEngine();
  assert(hashFiles(measurementFiles) === measurementHash && hashFiles(referenceFiles) === referenceHash, "Frozen measurement or reference sources changed.");
  const file = path.join(outputDir, `${scenarioId}.json`);
  console.log(`\nRunning ${scenarioId}: ${seeds.length} seed(s), production and beneficial, ${mode}.`);
  const child = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run",
    "src/lib/matchmaking/v3/socialGeneralizationBenchmark.test.ts", "--maxWorkers=1"], {
    cwd: root, stdio: "inherit", env: { ...process.env,
      RUN_SOCIAL_GENERALIZATION_BENCHMARK: "1", GENERALIZATION_SCENARIO_ID: scenarioId,
      GENERALIZATION_SEEDS: JSON.stringify(seeds), GENERALIZATION_MODE: mode,
      GENERALIZATION_JSON_PATH: file, GENERALIZATION_PROVENANCE: JSON.stringify(sourceProvenance),
    },
  });
  assert(child.status === 0, `${scenarioId}: bridge failed; raw data remain pending.`);
  assertUnchangedEngine();
  assert(hashFiles(measurementFiles) === measurementHash && hashFiles(referenceFiles) === referenceHash, "Frozen sources changed during measurement.");
  const report = read(file);
  assert(report.validationStatus === "pending" && existsSync(`${file}.pending`), "Bridge must leave reports pending for independent promotion.");
  assert(JSON.stringify(report.sourceProvenance) === JSON.stringify(sourceProvenance), "Report provenance differs from the frozen runner inputs.");
  assertSocialGeneralizationReport(report, { scenarioId, seeds, mode });
  report.validationStatus = "passed";
  writeFileSync(`${file}.writing`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  renameSync(`${file}.writing`, file); unlinkSync(`${file}.pending`);
  manifest.scenarioRuns.push({ scenarioId, jsonPath: path.relative(outputDir, file), validationStatus: "passed" });
  writeFileSync(`${manifestPath}.pending`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Validated ${scenarioId}: ${file}`);
}
assertUnchangedEngine();
assert(hashFiles(measurementFiles) === measurementHash && hashFiles(referenceFiles) === referenceHash, "Frozen sources changed before manifest promotion.");
writeFileSync(`${manifestPath}.writing`, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
renameSync(`${manifestPath}.writing`, manifestPath); unlinkSync(`${manifestPath}.pending`);
console.log(`Run manifest: ${manifestPath}`);
