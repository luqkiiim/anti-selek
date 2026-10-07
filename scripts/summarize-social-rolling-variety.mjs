import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const seeds = [1, 4729, 104729, 130363, 2097593];
const formats = ["SOCIAL_MIX", "POINTS", "ELO"];
const horizons = [21, 100, 400];
const policies = {
  baseline: { file: "baseline/social-rolling-variety-400-baseline-legacy-equal.json", metric: "legacy-equal" },
  a: { file: "a/social-rolling-variety-400-a-rolling-equal.json", metric: "rolling-equal" },
  b: { file: "b/social-rolling-variety-400-b-social-horizon-3211.json", metric: "social-horizon-3211" },
};

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function close(actual, expected, label) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}

/** Strictly recheck saved counters instead of trusting a report's passed marker. */
export function assertStrictCheckpoint(checkpoint, label = "checkpoint") {
  const zeroFields = [
    "optimizer.searchLimitCalls", "optimizer.incompleteCounterfactualCalls",
    "optimizer.fairnessCertificateFailures", "optimizer.starvationCertificateFailures", "optimizer.balanceCertificateFailures",
    "starvation.uncertifiedCounterfactualDecisions", "coverageGate.uncertifiedDecisions",
    "coverageGate.noStarvationUncertifiedDecisions", "replayEnvelope.productionUncertifiedDecisions",
    "replayEnvelope.noStarvationUncertifiedDecisions",
  ];
  const value = (field) => field.split(".").reduce((object, key) => object?.[key], checkpoint);
  const errors = zeroFields.filter((field) => value(field) !== 0).map((field) => `${field}=${value(field) ?? "missing"}`);
  const cohorts = [
    ["coverageGate.refillDecisions", checkpoint?.coverageGate?.refillDecisions],
    ["coverageGate.noStarvationRefillDecisions", checkpoint?.coverageGate?.noStarvationRefillDecisions],
    ["replayEnvelope.productionRefillDecisions", checkpoint?.replayEnvelope?.productionRefillDecisions],
    ["replayEnvelope.noStarvationRefillDecisions", checkpoint?.replayEnvelope?.noStarvationRefillDecisions],
  ];
  const expectedRefills = checkpoint?.completedMatches - 1;
  for (const [field, refills] of cohorts) {
    if (!Number.isInteger(expectedRefills) || refills !== expectedRefills) errors.push(`${field}=${refills ?? "missing"}; expected ${expectedRefills}`);
  }
  const equalities = [
    ["coverageGate.certifiedDecisions", checkpoint?.coverageGate?.certifiedDecisions, checkpoint?.coverageGate?.refillDecisions],
    ["coverageGate.noStarvationCertifiedDecisions", checkpoint?.coverageGate?.noStarvationCertifiedDecisions, checkpoint?.coverageGate?.noStarvationRefillDecisions],
    ["replayEnvelope.productionReplayEnvelopeCertifiedDecisions", checkpoint?.replayEnvelope?.productionReplayEnvelopeCertifiedDecisions, checkpoint?.replayEnvelope?.productionRefillDecisions],
    ["replayEnvelope.productionCertifiedDecisions", checkpoint?.replayEnvelope?.productionCertifiedDecisions, checkpoint?.replayEnvelope?.productionRefillDecisions],
    ["replayEnvelope.noStarvationReplayEnvelopeCertifiedDecisions", checkpoint?.replayEnvelope?.noStarvationReplayEnvelopeCertifiedDecisions, checkpoint?.replayEnvelope?.noStarvationRefillDecisions],
    ["replayEnvelope.noStarvationCertifiedDecisions", checkpoint?.replayEnvelope?.noStarvationCertifiedDecisions, checkpoint?.replayEnvelope?.noStarvationRefillDecisions],
    ["starvation.certifiedCounterfactualDecisions", checkpoint?.starvation?.certifiedCounterfactualDecisions, checkpoint?.starvation?.decisionsWithOverdueAvailable],
  ];
  for (const [field, certified, cohort] of equalities) {
    if (typeof cohort !== "number" || certified !== cohort) errors.push(`${field}=${certified ?? "missing"}; cohort=${cohort ?? "missing"}`);
  }
  if (!checkpoint?.coverageGate?.policyApplied) errors.push("coverageGate.policyApplied is false or missing");
  if (!checkpoint?.replayEnvelope?.policyApplied) errors.push("replayEnvelope.policyApplied is false or missing");
  assert(errors.length === 0, `${label} is not strictly certified: ${errors.join("; ")}`);
  return true;
}

const mean = (values) => {
  assert(values.length > 0, "Cannot average an empty set.");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
const addCounts = (sum, counts) => ({
  mixedMatches: sum.mixedMatches + counts.mixedMatches,
  ownSideMatches: sum.ownSideMatches + counts.ownSideMatches,
});
function countTypes(matches) {
  return matches.reduce((counts, match) => {
    assert(match.matchType === "MIXED" || match.matchType === "OWN_SIDE", `Unknown type at completed match ${match.completedMatchNumber}.`);
    counts[match.matchType === "MIXED" ? "mixedMatches" : "ownSideMatches"] += 1;
    return counts;
  }, { mixedMatches: 0, ownSideMatches: 0 });
}
const checkpointCounts = (counts) => ({ mixedMatches: counts.MIXED, ownSideMatches: counts.OWN_SIDE });

function validateKpi(checkpoint, independent, label) {
  const score = checkpoint?.socialVariety3211;
  assert(score && independent, `${label}: checkpoint or independent 3211 KPI is missing.`);
  for (const key of ["score", "relationshipScore", "meanT", "fullTypeCoverageFraction", "halfTypeCoverageFraction"]) close(score[key], independent[key], `${label}.${key}`);
  close(checkpoint.socialHorizon321?.score, independent.relationshipScore, `${label}.old321`);
  close(score.relationship?.score, independent.relationshipScore, `${label}.relationship.score`);
  assert(score.players?.length === 14, `${label}: expected 14 players.`);
  for (const player of score.players) {
    assert(player.feasibleMatchTypes?.includes("MIXED") && player.feasibleMatchTypes?.includes("OWN_SIDE"), `${label}/${player.userId}: both match types must be feasible in the fixed 7/7 roster.`);
  }
}

function validateReport(policy, config, file) {
  assert(existsSync(file), `Missing ${policy} report: ${file}`);
  const report = JSON.parse(readFileSync(file, "utf8"));
  assert(report.validationStatus === "passed" && report.targetMatches === 400 && report.enginePolicy === "current", `${policy}: report metadata is invalid.`);
  assert(report.matcherCoverageGainMetric === config.metric && report.rollingVarietyAnalysis?.metric === config.metric, `${policy}: metric mismatch.`);
  assert(report.rollingVarietyAnalysis?.policy === policy, `${policy}: analysis label mismatch.`);
  assert(JSON.stringify(report.seeds) === JSON.stringify(seeds), `${policy}: seed list mismatch.`);
  assert(report.sessions?.length === 15 && report.rollingVarietyAnalysis?.sessions?.length === 15, `${policy}: expected exactly 15 raw and analyzed sessions.`);

  const raw = new Map();
  for (const session of report.sessions) {
    const key = `${session.seed}/${session.sessionType}`;
    assert(seeds.includes(session.seed) && formats.includes(session.sessionType) && !raw.has(key), `${policy}: unexpected or duplicate session ${key}.`);
    assert(session.profile === "narrow" && session.completedHistory?.length === 400, `${policy}/${key}: invalid profile or incomplete history.`);
    assert(session.completedHistory.every((match, index) => match.completedMatchNumber === index + 1), `${policy}/${key}: history order is invalid.`);
    raw.set(key, session);
  }
  const analyzed = new Map();
  for (const session of report.rollingVarietyAnalysis.sessions) {
    const key = `${session.seed}/${session.sessionType}`;
    assert(seeds.includes(session.seed) && formats.includes(session.sessionType) && !analyzed.has(key), `${policy}: unexpected or duplicate analysis ${key}.`);
    analyzed.set(key, session);
  }
  assert(raw.size === 15 && analyzed.size === 15, `${policy}: incomplete seed/format matrix.`);

  for (const seed of seeds) for (const format of formats) {
    const key = `${seed}/${format}`;
    const session = raw.get(key);
    const analysis = analyzed.get(key);
    assert(session && analysis && analysis.seed === seed && analysis.sessionType === format, `${policy}: missing or mismatched session ${key}.`);
    assert(analysis.prefixTimeSeries?.length === 400 && analysis.playerPathologies?.length === 14, `${policy}/${key}: incomplete diagnostics.`);
    for (let index = 0; index < 400; index += 1) assert(analysis.prefixTimeSeries[index].completedMatches === index + 1, `${policy}/${key}: prefix order invalid.`);
    for (const horizon of horizons) {
      const checkpoint = session.checkpoints?.[String(horizon)];
      const row = analysis.checkpoints?.[String(horizon)];
      assert(checkpoint?.completedMatches === horizon && row?.completedMatches === horizon, `${policy}/${key}/${horizon}: missing checkpoint.`);
      assertStrictCheckpoint(checkpoint, `${policy}/${key}/${horizon}`);
      validateKpi(checkpoint, row.independent, `${policy}/${key}/${horizon}`);
      const history = session.completedHistory;
      const counts = countTypes(history.slice(0, horizon));
      const final100 = countTypes(history.slice(Math.max(0, horizon - 100), horizon));
      assert(JSON.stringify(counts) === JSON.stringify(row.allMatchCounts), `${policy}/${key}/${horizon}: global M/O history mismatch.`);
      assert(JSON.stringify(final100) === JSON.stringify(row.final100MatchCounts), `${policy}/${key}/${horizon}: final-window M/O history mismatch.`);
      assert(JSON.stringify(counts) === JSON.stringify(checkpointCounts(checkpoint.completedMatchTypeCounts)), `${policy}/${key}/${horizon}: checkpoint M/O history mismatch.`);
    }
  }
  return { report, raw, analyzed };
}

function checkpointSummary(policy, format, horizon, rows) {
  const kpis = rows.map(({ analysis }) => analysis.checkpoints[String(horizon)].independent);
  const cps = rows.map(({ raw }) => raw.checkpoints[String(horizon)]);
  const countSum = (key) => cps.reduce((sum, cp) => sum + cp.starvation[key], 0);
  const failureSum = (key) => cps.reduce((sum, cp) => sum + cp.optimizer[key], 0);
  const rests = cps.map((cp) => cp.assignmentRestGap);
  const spreads = cps.map((cp) => cp.matchCountSpread);
  return {
    policy, format, horizon,
    score3211: mean(kpis.map((x) => x.score)), old321: mean(kpis.map((x) => x.relationshipScore)),
    C: mean(kpis.map((x) => x.facetMean.courtmates)), O: mean(kpis.map((x) => x.facetMean.opponents)), P: mean(kpis.map((x) => x.facetMean.partners)),
    uniqueC: mean(kpis.map((x) => x.averageDistinctCount.courtmates)),
    uniqueO: mean(kpis.map((x) => x.averageDistinctCount.opponents)),
    uniqueP: mean(kpis.map((x) => x.averageDistinctCount.partners)),
    meanT: mean(kpis.map((x) => x.meanT)),
    T1Fraction: mean(kpis.map((x) => x.fullTypeCoverageFraction)),
    ThalfFraction: mean(kpis.map((x) => x.halfTypeCoverageFraction)),
    globalMatchCounts: cps.map((cp) => checkpointCounts(cp.completedMatchTypeCounts)).reduce(addCounts, { mixedMatches: 0, ownSideMatches: 0 }),
    finalWindowGlobalMatchCounts: rows.map(({ analysis }) => analysis.checkpoints[String(horizon)].final100MatchCounts).reduce(addCounts, { mixedMatches: 0, ownSideMatches: 0 }),
    backToBackRateMeanAcrossSeeds: mean(cps.map((cp) => cp.backToBack.rate)),
    backToBackRatePooled: cps.reduce((sum, cp) => sum + cp.backToBack.count, 0) / cps.reduce((sum, cp) => sum + cp.backToBack.eligibleAssignments, 0),
    assignmentRestMeanAcrossSeeds: mean(rests.map((x) => x.mean)),
    assignmentRestP95MeanAcrossSeeds: mean(rests.map((x) => x.p95)),
    assignmentRestWorstSeedMax: Math.max(...rests.map((x) => x.max)),
    matchCountSpreadMean: mean(spreads),
    matchCountSpreadWorst: Math.max(...spreads),
    maximumFairnessSpreadWorst: Math.max(...cps.map((cp) => cp.maximumFairnessSpread)),
    starvation: {
      changedPlayerSet: countSum("materiallyChangedPlayerSet"),
      decisionsWithOverdueAvailable: countSum("decisionsWithOverdueAvailable"),
      certifiedCounterfactualDecisions: countSum("certifiedCounterfactualDecisions"),
      uncertifiedCounterfactualDecisions: countSum("uncertifiedCounterfactualDecisions"),
    },
    proofFailures: {
      fairness: failureSum("fairnessCertificateFailures"), starvation: failureSum("starvationCertificateFailures"),
      balance: failureSum("balanceCertificateFailures"), searchLimit: failureSum("searchLimitCalls"),
      incompleteCounterfactual: failureSum("incompleteCounterfactualCalls"),
    },
  };
}

function longRunSummary(policy, format, rows) {
  const analyses = rows.map(({ analysis }) => analysis);
  const players = analyses.flatMap((x) => x.playerPathologies);
  const latestSix = analyses.map((x) => x.playerPathologies.filter((p) => p.latestSixSingleType).length);
  const prefixT = analyses.map((x) => mean(x.prefixTimeSeries.filter((r) => r.completedMatches >= 301).map((r) => r.meanT)));
  const final100 = analyses.map((x) => x.checkpoints["400"].final100MatchCounts).reduce(addCounts, { mixedMatches: 0, ownSideMatches: 0 });
  return {
    policy, format, playersAcrossSeeds: players.length,
    latestSixSingleTypePlayersAt400: latestSix.reduce((a, b) => a + b, 0),
    latestSixSingleTypePlayersBySeed: latestSix,
    playersMissingEitherTypeInFinal100: players.filter((p) => p.final100MatchesByType.MIXED === 0 || p.final100MatchesByType.OWN_SIDE === 0).length,
    lifetimePlayersMissingAType: players.filter((p) => p.missingLifetimeTypes.length > 0).length,
    final100GlobalMatchCounts: final100,
    meanTAt400: mean(analyses.map((x) => x.checkpoints["400"].independent.meanT)),
    meanTAcrossPrefixes301To400: mean(prefixT),
    maximumMixedOnlyOwnAppearanceStreak: Math.max(...players.map((p) => p.maximumConsecutiveOwnSideAbsenceInPlayerMatches)),
    maximumTrailingMixedOnlyOwnAppearanceStreak: Math.max(...players.map((p) => p.trailingConsecutiveOwnSideAbsenceInPlayerMatches)),
  };
}

function writeAtomically(file, contents) {
  const temporary = `${file}.writing`;
  writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, file);
}

function run(args) {
  const valueAfter = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  };
  const inputDir = path.resolve(root, valueAfter("--input-dir", "benchmarks/generated/rolling-social-variety/full-2026-10-06"));
  const outputDir = path.resolve(root, valueAfter("--out-dir", path.relative(root, inputDir)));
  const generated = path.resolve(root, "benchmarks/generated");
  assert(outputDir.startsWith(`${generated}${path.sep}`), "Summary output must remain under ignored benchmarks/generated/.");
  const output = path.join(outputDir, "social-rolling-variety-400-combined-summary.json");
  assert(!existsSync(output) && !existsSync(`${output}.writing`), "Refusing to overwrite summary output; choose a new --out-dir.");

  const loaded = Object.fromEntries(Object.entries(policies).map(([name, config]) => [name, validateReport(name, config, path.join(inputDir, config.file))]));
  const provenance = loaded.baseline.report.sourceProvenance;
  for (const [policy, data] of Object.entries(loaded)) {
    assert(data.report.sourceRevision === provenance.commitSha, `${policy}: source revision and provenance disagree.`);
    for (const key of ["commitSha", "workingTreeDirty", "engineSourceSha256", "measurementHarnessSha256"]) {
      assert(data.report.sourceProvenance?.[key] === provenance[key], `${policy}: source provenance ${key} differs.`);
    }
  }
  for (const key of ["engineSourceSha256", "measurementHarnessSha256"]) assert(/^[a-f0-9]{64}$/.test(provenance[key] ?? ""), `Invalid ${key}.`);

  const checkpointRows = [];
  const longRunRows = [];
  for (const policy of Object.keys(policies)) for (const format of formats) {
    const rows = seeds.map((seed) => ({ raw: loaded[policy].raw.get(`${seed}/${format}`), analysis: loaded[policy].analyzed.get(`${seed}/${format}`) }));
    for (const horizon of horizons) checkpointRows.push(checkpointSummary(policy, format, horizon, rows));
    longRunRows.push(longRunSummary(policy, format, rows));
  }
  const summary = {
    schemaVersion: "social-rolling-variety-strict-summary-v1",
    validationStatus: "passed",
    strictCertificationStatus: "passed",
    generatedAt: new Date().toISOString(),
    source: {
      commitSha: provenance.commitSha,
      workingTreeDirty: provenance.workingTreeDirty,
      engineSourceSha256: provenance.engineSourceSha256,
      measurementHarnessSha256: provenance.measurementHarnessSha256,
    },
    inputs: Object.fromEntries(Object.entries(policies).map(([policy, config]) => [policy, { file: config.file, metric: config.metric }])),
    validation: { policies: 3, seedsPerPolicy: 5, sessions: 45, checkpoints: 135, independentlyCheckedKpiHorizons: horizons },
    checkpointRows,
    longRunRows,
  };
  mkdirSync(outputDir, { recursive: true });
  writeAtomically(output, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Strict certification passed: 45 sessions and 135 checkpoints.\n${output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
