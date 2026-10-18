import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDir = path.join(root, "private");
const progressPath = path.join(privateDir, "grouped-capacity-matrix-progress.json");
const splitCases = [[11, 11], [12, 10], [12, 12], [14, 10], [16, 8]];
const seeds = [1, 4729, 104729];
const profiles = ["balanced", "skewed"];
const refills = ["joint", "individual"];
const regressionCases = [
  { countA: 4, countB: 4, seed: 1, profile: "balanced", refill: "joint" },
  { countA: 8, countB: 8, seed: 1, profile: "balanced", refill: "joint" },
];
const cases = [
  ...splitCases.flatMap(([countA, countB]) => profiles.flatMap((profile) =>
    seeds.flatMap((seed) => refills.map((refill) => ({ countA, countB, seed, profile, refill }))))),
  ...regressionCases,
];
// Fifteen rows are the theoretical minimum: every split must meet every seed.
// The two binary assignments cover every other factor pair within those rows.
const smokeCases = [
  ...splitCases.flatMap(([countA, countB], splitIndex) => seeds.map((seed, seedIndex) => ({
    countA, countB, seed,
    profile: profiles[(splitIndex + seedIndex) % profiles.length],
    refill: refills[(Math.floor(splitIndex / 2) + seedIndex) % refills.length],
  }))),
  ...regressionCases,
];

function verifySmokePairwiseCoverage() {
  const fields = ["countA", "countB", "seed", "profile", "refill"];
  const regular = cases.slice(0, 60);
  const smoke = smokeCases.slice(0, 15);
  // Group counts are one factor, represented by the ordered pair A/B.
  const factors = [caseData => `${caseData.countA}/${caseData.countB}`,
    ...fields.slice(2).map((field) => caseData => String(caseData[field]))];
  let coveredPairCount = 0;
  for (let left = 0; left < factors.length; left += 1) {
    for (let right = left + 1; right < factors.length; right += 1) {
      const projection = (caseData) => `${factors[left](caseData)}|${factors[right](caseData)}`;
      const required = new Set(regular.map(projection));
      const observed = new Set(smoke.map(projection));
      for (const pair of required) if (!observed.has(pair)) {
        throw new Error(`Smoke matrix misses factor pair ${left}/${right}: ${pair}`);
      }
      coveredPairCount += required.size;
    }
  }
  if (smoke.length !== 15 || smokeCases.length !== 17 ||
      smokeCases.some((caseData) => !cases.some((fullCase) => keyFor(fullCase) === keyFor(caseData)))) {
    throw new Error("Invalid smoke matrix composition.");
  }
  return { regularCases: smoke.length, regressions: 2, coveredPairCount };
}

const keyFor = ({ countA, countB, seed, profile, refill }) =>
  `${countA}-${countB}-${profile}-${seed}-${refill}`;
const artifactFor = (caseData) => path.join(privateDir,
  `grouped-capacity-trajectory-${keyFor(caseData)}.json`);

function sourcePaths() {
  const v3Dir = path.join(root, "src/lib/matchmaking/v3");
  const v3Sources = fs.readdirSync(v3Dir).filter((name) =>
    name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `src/lib/matchmaking/v3/${name}`);
  return [
    "src/lib/matchmaking/groupedCapacityBenchmark.test.ts",
    "scripts/run-grouped-capacity-matrix.mjs",
    "src/app/api/sessions/[code]/generate-match/selection.ts",
    "src/app/api/sessions/[code]/generate-match/queueBudget.ts",
    "src/app/api/sessions/[code]/generate-match/shared.ts",
    "src/lib/sessionSettings.ts",
    "src/lib/matchmaking/playerGroupPlanner.ts",
    "src/lib/playerGroups.ts",
    "src/lib/mixedSide.ts",
    ...v3Sources,
  ].sort();
}

function fingerprint(paths) {
  const hash = createHash("sha256");
  for (const relativePath of paths) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, filePath);
}

const args = process.argv.slice(2);
const execute = args.includes("--run");
const force = args.includes("--force");
const smokeOnly = args.includes("--smoke");
const caseArgument = args.find((arg) => arg.startsWith("--case="));
const maxArgument = args.find((arg) => arg.startsWith("--max-cases="));
const selectedKey = caseArgument?.slice("--case=".length);
const maxCases = maxArgument ? Number(maxArgument.slice("--max-cases=".length)) : 1;
if (!Number.isInteger(maxCases) || maxCases < 1) throw new Error("--max-cases must be a positive integer");
if (args.some((arg) => !["--run", "--force", "--smoke"].includes(arg) && !arg.startsWith("--case=") && !arg.startsWith("--max-cases=")))
  throw new Error("Unknown argument. Use --run, --smoke, --case=<key>, --max-cases=<count>, or --force.");
if (smokeOnly && selectedKey) throw new Error("Choose --smoke or --case, not both.");
if (selectedKey && !cases.some((caseData) => keyFor(caseData) === selectedKey))
  throw new Error(`Unknown case: ${selectedKey}`);

const files = sourcePaths();
const sourceFingerprint = fingerprint(files);
const smokeCoverage = verifySmokePairwiseCoverage();
const selected = selectedKey ? cases.filter((caseData) => keyFor(caseData) === selectedKey)
  : smokeOnly ? smokeCases : cases;
const complete = (caseData) => {
  const artifact = readJson(artifactFor(caseData));
  const expectedCourtCount = caseData.countA + caseData.countB === 8 ? 1
    : caseData.countA + caseData.countB === 16 ? 2 : 3;
  return artifact?.fixtureVersion === 4 &&
    artifact.sourceFingerprint === sourceFingerprint &&
    artifact.countA === caseData.countA && artifact.countB === caseData.countB &&
    artifact.seed === caseData.seed && artifact.profile === caseData.profile &&
    artifact.refill === caseData.refill && artifact.courtCount === expectedCourtCount &&
    artifact.fixture?.pointsPolicy === true && artifact.fixture?.mixedMode === true &&
    artifact.fixture?.groupCountA === caseData.countA && artifact.fixture?.groupCountB === caseData.countB &&
    artifact.fixture?.rootBudgetPolicy === "production usesGroupedMixedCapacityBudget" &&
    artifact.completedCount === 100 && artifact.failureState === null &&
    Array.isArray(artifact.steps) && artifact.steps.length > 0 &&
    artifact.steps.every((step) => step.selectedCourts === step.requestedCourts && !step.error &&
      Number.isInteger(step.unpausedPlayerCount) && step.unpausedPlayerCount === caseData.countA + caseData.countB &&
      step.rootBudgetExpected === (step.requestedCourts === 3 && step.unpausedPlayerCount >= 12 && step.unpausedPlayerCount <= 24) &&
      step.rootBudgetApplied === step.rootBudgetExpected &&
      (step.rootBudgetApplied ? Number.isFinite(step.rootBudgetElapsedMs) && step.rootBudgetElapsedMs <= 5_100
        : step.rootBudgetElapsedMs === null));
};
function coverageLedger() {
  const regular = cases.slice(0, 60);
  const passedRegular = regular.filter(complete);
  const passed = cases.filter(complete);
  const crossoverArtifacts = passed.flatMap((caseData) => {
    const artifact = readJson(artifactFor(caseData));
    return artifact.steps.some((step) => step.courtAssignments?.some((assignment) =>
      assignment.courtGroupType === "CROSSOVER")) ? [keyFor(caseData)] : [];
  });
  return {
    actualMatcherTrajectories: { required: 60, passed: passedRegular.length, status: passedRegular.length === 60 ? "complete" : "pending" },
    groupedSplits: Object.fromEntries(splitCases.map(([countA, countB]) => {
      const matching = regular.filter((caseData) => caseData.countA === countA && caseData.countB === countB);
      return [`${countA}/${countB}`, { required: matching.length, passed: matching.filter(complete).length }];
    })),
    regressions: {
      "8-player/1-court": { status: complete(regressionCases[0]) ? "passed" : "pending" },
      "16-player/2-court": { status: complete(regressionCases[1]) ? "passed" : "pending" },
    },
    crossover: { status: crossoverArtifacts.length ? "observed" : "pending", caseKeys: crossoverArtifacts },
    partnerPreferences: { status: passed.some((caseData) => {
      const fixture = readJson(artifactFor(caseData)).fixture;
      return fixture?.openPreferenceCount > 0 && fixture?.femaleFlexPreferenceCount > 0;
    }) ? "observed" : "pending" },
    physicalCourtAssignments: { status: passed.some((caseData) =>
      readJson(artifactFor(caseData)).steps.some((step) => step.courtAssignments?.length > 1)) ? "recorded" : "pending",
      note: "Recorded assignments do not replace API persistence or browser visibility checks." },
    pauses: { status: "pending", note: "Requires a separate transition scenario." },
    lateArrivals: { status: "pending", note: "Requires a separate transition scenario." },
    skips: { status: "pending", note: "Requires a separate transition scenario." },
    busyAndQueued: { status: "pending", note: "Requires queue and busy-player integration evidence." },
    apiAndBrowserLatency: { status: "pending", note: "Preview end-to-end p95 is measured separately." },
  };
}
const pending = selected.filter((caseData) => force || !complete(caseData));
console.log(JSON.stringify({ sourceFingerprint, totalCases: cases.length, selectedCases: selected.length,
  ...(smokeOnly ? { smokeCoverage, smokeCases: selected.map(keyFor) } : {}),
  completeCases: selected.length - pending.length, pendingCases: pending.length,
  next: pending.slice(0, Math.min(maxCases, 5)).map(keyFor), executing: execute }, null, 2));
if (!execute) process.exit(0);

const existingProgress = readJson(progressPath);
if (existingProgress && existingProgress.sourceFingerprint !== sourceFingerprint) {
  const previous = String(existingProgress.sourceFingerprint ?? "unknown").slice(0, 16);
  fs.copyFileSync(progressPath, progressPath.replace(/\.json$/, `.previous-${previous}.json`));
}

const progress = {
  fixtureVersion: 4,
  sourceFingerprint,
  sourceFiles: files,
  updatedAt: new Date().toISOString(),
  coverage: coverageLedger(),
  cases: Object.fromEntries(cases.map((caseData) => [keyFor(caseData),
    complete(caseData) ? { status: "passed", artifact: path.relative(root, artifactFor(caseData)) } : { status: "pending" }])),
};
writeJson(progressPath, progress);
for (const caseData of pending.slice(0, maxCases)) {
  const key = keyFor(caseData);
  if (fingerprint(sourcePaths()) !== sourceFingerprint) {
    throw new Error("Matcher or fixture source changed during the matrix; rerun with a fresh fingerprint.");
  }
  const existing = readJson(artifactFor(caseData));
  if (existing && existing.sourceFingerprint !== sourceFingerprint) {
    const oldFingerprint = String(existing.sourceFingerprint ?? "unknown").slice(0, 16);
    fs.copyFileSync(artifactFor(caseData), artifactFor(caseData).replace(/\.json$/, `.previous-${oldFingerprint}.json`));
  }
  progress.cases[key] = { status: "running", startedAt: new Date().toISOString() };
  progress.updatedAt = new Date().toISOString();
  progress.coverage = coverageLedger();
  writeJson(progressPath, progress);
  console.log(`Running ${key}`);
  const child = spawnSync(process.execPath, [
    "node_modules/vitest/vitest.mjs", "run", "src/lib/matchmaking/groupedCapacityBenchmark.test.ts",
    "-t", "completes 100 actual grouped matcher assignments", "--reporter=verbose",
  ], {
    cwd: root,
    env: { ...process.env,
      RUN_GROUPED_CAPACITY_TRAJECTORY: "1", GROUPED_CAPACITY_FINGERPRINT: sourceFingerprint,
      GROUPED_CAPACITY_A: String(caseData.countA), GROUPED_CAPACITY_B: String(caseData.countB),
      GROUPED_CAPACITY_SEED: String(caseData.seed), GROUPED_CAPACITY_PROFILE: caseData.profile,
      GROUPED_CAPACITY_REFILL: caseData.refill,
    },
    stdio: "inherit", timeout: 960_000,
  });
  const artifact = readJson(artifactFor(caseData));
  const passed = child.status === 0 && complete(caseData);
  progress.cases[key] = {
    status: passed ? "passed" : "failed",
    finishedAt: new Date().toISOString(),
    exitCode: child.status,
    signal: child.signal,
    error: child.error?.message ?? null,
    completedCount: artifact?.completedCount ?? null,
    artifact: path.relative(root, artifactFor(caseData)),
  };
  progress.updatedAt = new Date().toISOString();
  progress.coverage = coverageLedger();
  writeJson(progressPath, progress);
  if (!passed) {
    console.log(JSON.stringify({ sourceFingerprint, selectedCases: selected.length,
      passedThisInvocation: Object.values(progress.cases).filter((entry) => entry.status === "passed").length,
      failedCase: key, completedMatches: artifact?.completedCount ?? null,
      artifact: path.relative(root, artifactFor(caseData)) }, null, 2));
    throw new Error(`Trajectory ${key} failed. Inspect ${artifactFor(caseData)} and ${progressPath}.`);
  }
}
console.log(JSON.stringify({ sourceFingerprint, selectedCases: selected.length,
  completedThisInvocation: Math.min(maxCases, pending.length),
  acceptedAcrossFullMatrix: cases.filter(complete).length,
  pendingAcrossFullMatrix: cases.filter((caseData) => !complete(caseData)).length,
  progress: path.relative(root, progressPath) }, null, 2));
