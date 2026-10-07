import { createHash } from "node:crypto";
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value after ${flag}.`);
  return args[index + 1];
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const expectedScenarios = {
  "edge-8-8-0-2c": { upper: 8, lower: 0, courtCount: 2, engines: ["production", "courtmate-beneficial-rescue"] },
  "balanced-10-5-5-2c": { upper: 5, lower: 5, courtCount: 2, engines: ["production", "courtmate-beneficial-rescue"] },
  "balanced-12-6-6-2c": { upper: 6, lower: 6, courtCount: 2, engines: ["courtmate-beneficial-rescue"] },
  "balanced-12-6-6-3c": { upper: 6, lower: 6, courtCount: 3, engines: ["courtmate-beneficial-rescue"] },
};
const expectedSeeds = [1, 4729, 104729];
const expectedSchedulers = ["immediate", "conditional-wait"];
const defaultInputDirectory = "benchmarks/generated/social-joint-refill/full-2026-10-07-v1";

const METRIC_PATHS = [
  "time.elapsedMinutes",
  "time.busyCourtMinutes",
  "time.idleCourtMinutes",
  "time.idleFraction",
  "time.closedRefillDelayCount",
  "time.terminalOpenRefillIntervalCount",
  "time.meanRefillDelayMinutes",
  "time.p95RefillDelayMinutes",
  "time.maximumRefillDelayMinutes",
  "matchCountFairness.minimum",
  "matchCountFairness.maximum",
  "matchCountFairness.spread",
  "rest.eligiblePostFirstAppearances",
  "rest.backToBackCount",
  "rest.backToBackRate",
  "rest.meanAssignmentRestTurns",
  "rest.p95AssignmentRestTurns",
  "rest.maximumAssignmentRestTurns",
  "rest.meanElapsedRestMinutes",
  "rest.p95ElapsedRestMinutes",
  "rest.maximumElapsedRestMinutes",
  "completedMatchTypeCounts.MIXED",
  "completedMatchTypeCounts.OWN_SIDE",
  ...["structural", "opportunity"].flatMap((roster) => [
    ...["courtmates", "partners", "opponents"].flatMap((facet) => [
      `scores.${roster}.${facet}.averageDistinctPeers`,
      `scores.${roster}.${facet}.minimumDistinctPeers`,
      `scores.${roster}.${facet}.meanCoverage`,
      `scores.${roster}.${facet}.worstPlayerCoverage`,
      `scores.${roster}.${facet}.fullyCoveredPlayerCount`,
      `scores.${roster}.${facet}.feasiblePairCount`,
      `scores.${roster}.${facet}.coveredPairCount`,
      `scores.${roster}.${facet}.meanNormalizedEntropy`,
    ]),
    `scores.${roster}.meanT`,
    `scores.${roster}.fullTypeCoverageFraction`,
    `scores.${roster}.halfTypeCoverageFraction`,
    `scores.${roster}.typeEligiblePlayerCount`,
    `scores.${roster}.oneTypePlayerCount`,
    `scores.${roster}.longestSingleTypeAppearanceRun`,
    `scores.${roster}.typeCoverage.fullTypePlayerCount`,
    `scores.${roster}.typeCoverage.halfTypePlayerCount`,
    `scores.${roster}.typeCoverage.zeroTypePlayerCount`,
    `scores.${roster}.typeCoverage.bothTypeEligiblePlayerCount`,
    `scores.${roster}.typeCoverage.bothTypeCoveredPlayerCount`,
    `scores.${roster}.typeCoverage.bothTypeCoverageFraction`,
  ]),
];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function mean(values) {
  const finite = values.filter(isFiniteNumber);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function range(values) {
  const finite = values.filter(isFiniteNumber);
  return finite.length ? { minimum: Math.min(...finite), maximum: Math.max(...finite) } : { minimum: null, maximum: null };
}

function summarizeFacet(facet) {
  if (!facet) return null;
  return {
    averageDistinctPeers: facet.averageDistinctPeers,
    minimumDistinctPeers: facet.minimumDistinctPeers,
    meanCoverage: facet.meanCoverage,
    worstPlayerCoverage: facet.worstPlayerCoverage,
    fullyCoveredPlayerCount: facet.fullyCoveredPlayerCount,
    feasiblePairCount: facet.feasiblePairCount,
    coveredPairCount: facet.coveredPairCount,
    meanNormalizedEntropy: facet.meanNormalizedEntropy,
  };
}

function summarizePrefix(prefix) {
  if (!prefix) return null;
  const players = prefix.players ?? [];
  const eligible = players.filter((player) => player.T !== null && player.T !== undefined);
  const bothTypeEligible = players.filter((player) => player.feasibleMatchTypes?.length === 2);
  const bothTypeCovered = bothTypeEligible.filter((player) => {
    const observed = new Set((player.recentMatchTypes ?? []).filter(Boolean));
    return observed.size === 2;
  });
  const fullTypePlayerCount = eligible.filter((player) => player.T === 1).length;
  const halfTypePlayerCount = eligible.filter((player) => player.T === 0.5).length;
  const zeroTypePlayerCount = eligible.filter((player) => player.T === 0).length;
  return {
    playerCount: prefix.playerCount,
    courtmates: summarizeFacet(prefix.courtmates),
    partners: summarizeFacet(prefix.partners),
    opponents: summarizeFacet(prefix.opponents),
    meanT: prefix.meanT,
    fullTypeCoverageFraction: prefix.fullTypeCoverageFraction,
    halfTypeCoverageFraction: prefix.halfTypeCoverageFraction,
    typeEligiblePlayerCount: prefix.typeEligiblePlayerCount,
    oneTypePlayerCount: prefix.oneTypePlayerCount,
    feasibleTypePlayerCounts: prefix.feasibleTypePlayerCounts,
    completedMatchTypeCounts: prefix.completedMatchTypeCounts,
    longestSingleTypeAppearanceRun: prefix.longestSingleTypeAppearanceRun,
    typeCoverage: {
      eligiblePlayerCount: eligible.length,
      fullTypePlayerCount,
      halfTypePlayerCount,
      zeroTypePlayerCount,
      bothTypeEligiblePlayerCount: bothTypeEligible.length,
      bothTypeCoveredPlayerCount: bothTypeCovered.length,
      bothTypeCoverageFraction: bothTypeEligible.length ? bothTypeCovered.length / bothTypeEligible.length : null,
    },
  };
}

function summarizeCheckpoint(checkpoint) {
  return {
    targetCompletedMatches: checkpoint.targetCompletedMatches,
    completedMatches: checkpoint.completedMatches,
    atMinutes: checkpoint.atMinutes,
    completedMatchTypeCounts: checkpoint.completedMatchTypeCounts,
    scores: {
      structural: summarizePrefix(checkpoint.scores?.structural),
      opportunity: summarizePrefix(checkpoint.scores?.opportunity),
    },
    matchCountFairness: checkpoint.matchCountFairness ? {
      minimum: checkpoint.matchCountFairness.minimum,
      maximum: checkpoint.matchCountFairness.maximum,
      spread: checkpoint.matchCountFairness.spread,
    } : null,
    rest: checkpoint.rest,
    time: checkpoint.time,
  };
}

function openingSummary(session) {
  const opening = session.assignments
    .filter((assignment) => assignment.assignmentOrdinal === 1)
    .sort((left, right) => left.courtIndex - right.courtIndex);
  const typeCounts = {};
  const typedOpening = opening.map((assignment) => {
    const varietyType = assignment.socialVariety?.courtType;
    const matchType = varietyType === "MIXED" ? "MIXED"
      : varietyType === "UPPER" || varietyType === "LOWER" ? "OWN_SIDE" : "UNKNOWN";
    return { assignment, matchType };
  });
  for (const { matchType } of typedOpening) {
    const type = matchType;
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }
  return {
    courtCountStarted: opening.length,
    typePattern: typedOpening.map(({ matchType }) => matchType).join("+") || null,
    typeCounts,
    assignments: typedOpening.map(({ assignment, matchType }) => ({
      courtIndex: assignment.courtIndex,
      ids: [...assignment.ids].sort(),
      matchType,
    })),
  };
}

function summarizeCertificateSet(previews) {
  const rows = previews.filter(Boolean);
  const fields = [
    "selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified",
    "replayCertified", "coverageGateCertified", "gMaxCertified", "priorityCertified",
  ];
  const counts = Object.fromEntries(fields.map((field) => [field, {
    true: rows.filter((preview) => preview.matcherCertificates?.[field] === true).length,
    false: rows.filter((preview) => preview.matcherCertificates?.[field] === false).length,
    notApplicable: rows.filter((preview) => preview.matcherCertificates?.[field] == null).length,
  }]));
  const variety = {
    true: rows.filter((preview) => preview.matcherCertificates?.matcherVarietyOptimal === true).length,
    false: rows.filter((preview) => preview.matcherCertificates?.matcherVarietyOptimal === false).length,
  };
  return {
    calls: rows.length,
    certified: rows.filter((preview) => preview.certified === true).length,
    waitCertified: rows.filter((preview) => preview.waitCertified === true).length,
    searchLimitReached: rows.filter((preview) => preview.matcherCertificates?.searchLimitReached === true).length,
    statuses: rows.reduce((result, preview) => {
      result[preview.status] = (result[preview.status] ?? 0) + 1;
      return result;
    }, {}),
    varietyOptimal: variety,
    certificates: counts,
  };
}

function summarizeCompletedSameFourReplay(session) {
  const historyByPlayer = new Map();
  for (const match of session.completedHistory ?? []) {
    const quartet = [...new Set([...(match.team1 ?? []), ...(match.team2 ?? [])])].sort();
    for (const userId of quartet) {
      const history = historyByPlayer.get(userId) ?? [];
      history.push(quartet);
      historyByPlayer.set(userId, history);
    }
  }

  const completedRefillAssignments = (session.assignments ?? []).filter((assignment) =>
    assignment.assignmentOrdinal > 1 && assignment.censoredAtTarget !== true &&
    Number.isFinite(assignment.completedMatchNumber)
  );
  let sameFourReplays = 0;
  for (const assignment of completedRefillAssignments) {
    const selectedIds = [...new Set(assignment.ids ?? [])].sort();
    const states = assignment.playerStateAtAssignment ?? [];
    const lastQuartets = selectedIds.map((userId) => {
      const state = states.find((player) => player.userId === userId);
      if (!state || !Number.isInteger(state.priorMatchesPlayed) || state.priorMatchesPlayed <= 0) return null;
      const priorHistory = (historyByPlayer.get(userId) ?? []).slice(0, state.priorMatchesPlayed);
      assert(priorHistory.length === state.priorMatchesPlayed,
        `${session.scenario.id}/${session.engineVersion}/${session.scheduler}/seed${session.seed}/${assignment.assignmentId}: completed-history prefix does not match priorMatchesPlayed for ${userId}.`);
      return priorHistory.at(-1);
    });
    if (lastQuartets.length === 4 && lastQuartets.every((quartet) =>
      quartet !== null && quartet.length === selectedIds.length && quartet.every((userId, index) => userId === selectedIds[index])
    )) sameFourReplays += 1;
  }
  return {
    completedRefillAssignments: completedRefillAssignments.length,
    sameFourReplays,
    rate: completedRefillAssignments.length ? sameFourReplays / completedRefillAssignments.length : null,
    definition: "A completed assignment after that physical court's opening is a replay only if all four players' most recent completed-history quartet at their assignment-time priorMatchesPlayed cutoff is exactly the selected quartet.",
  };
}

function summarizeOperationalTrace(session) {
  const decisions = session.decisions ?? [];
  const currentPreviews = decisions.map((decision) => decision.immediatePreview).filter(Boolean);
  const futurePreviews = decisions.map((decision) => decision.futurePreview?.preview).filter(Boolean);
  const executed = decisions.filter((decision) => decision.execution);
  const waitReasons = decisions.reduce((result, decision) => {
    result[decision.waitReason] = (result[decision.waitReason] ?? 0) + 1;
    return result;
  }, {});
  const partialTwoOfThreeJointRefills = decisions.filter((decision) =>
    session.scenario.courtCount === 3 && decision.waited && decision.executionAccepted === true &&
    decision.futurePreview?.fillCourtIndices.length === 2 &&
    decision.futurePreview?.remainingBusyCourtIndices.length === 1 &&
    decision.execution?.chosenAssignments.length === 2
  ).length;
  const fullCourtJointRefills = decisions.filter((decision) =>
    decision.waited && decision.executionAccepted === true &&
    (decision.executedCourtIndices ?? []).length === session.scenario.courtCount
  ).length;
  const actualRejected = executed.filter((decision) => decision.executionAccepted !== true).length;
  return {
    decisionCount: decisions.length,
    conditionalWaitDecisionCount: session.waiting.conditionalWaitDecisions,
    waitsTaken: session.waiting.waitsTaken,
    waitReasons,
    waitsDeclinedByReason: session.waiting.waitsDeclinedByReason,
    partialTwoOfThreeJointRefills,
    fullCourtJointRefills,
    actualExecutions: executed.length,
    actualExecutionsAccepted: executed.filter((decision) => decision.executionAccepted === true).length,
    actualExecutionsRejected: actualRejected,
    actualExecutionsMissing: decisions.filter((decision) => decision.executedAtMinutes !== null && !decision.execution).length,
    completedSameFourReplay: summarizeCompletedSameFourReplay(session),
    searchLimitReached: {
      immediatePreview: currentPreviews.filter((preview) => preview.matcherCertificates?.searchLimitReached).length,
      futurePreview: futurePreviews.filter((preview) => preview.matcherCertificates?.searchLimitReached).length,
      actualExecution: executed.filter((decision) => decision.execution?.matcherCertificates?.searchLimitReached).length,
    },
    certificates: {
      immediatePreview: summarizeCertificateSet(currentPreviews),
      futurePreview: summarizeCertificateSet(futurePreviews),
      actualExecution: summarizeCertificateSet(executed.map((decision) => decision.execution)),
    },
    productionVarietyOptimalActual: session.engineVersion === "production"
      ? {
          true: executed.filter((decision) => decision.execution?.matcherCertificates?.reportedVarietyOptimal === true).length,
          false: executed.filter((decision) => decision.execution?.matcherCertificates?.reportedVarietyOptimal === false).length,
          missing: executed.filter((decision) => decision.execution?.matcherCertificates?.reportedVarietyOptimal == null).length,
        }
      : null,
  };
}

function summarizeSession(session, earlyCheckpoint) {
  const checkpoints = Object.fromEntries(session.checkpoints
    .slice()
    .sort((left, right) => left.completedMatches - right.completedMatches)
    .map((checkpoint) => [String(checkpoint.completedMatches), summarizeCheckpoint(checkpoint)]));
  assert(Object.hasOwn(checkpoints, String(earlyCheckpoint)), `${session.scenario.id}/${session.engineVersion}/${session.scheduler}/seed${session.seed}: missing early checkpoint ${earlyCheckpoint}.`);
  assert(Object.hasOwn(checkpoints, "50") && Object.hasOwn(checkpoints, "100"), `${session.scenario.id}: missing checkpoint 50 or 100.`);
  return {
    scenarioId: session.scenario.id,
    scenario: session.scenario,
    engineVersion: session.engineVersion,
    scheduler: session.scheduler,
    seed: session.seed,
    status: session.status,
    stopReason: session.stopReason,
    targetCompletedMatches: session.targetCompletedMatches,
    completedMatches: session.completedHistory.length,
    checkpoints,
    finalTime: session.finalTime,
    opening: openingSummary(session),
    operational: summarizeOperationalTrace(session),
  };
}

function aggregateValues(values) {
  const valid = values.filter(isFiniteNumber);
  return {
    sampleCount: valid.length,
    mean: mean(valid),
    ...range(valid),
  };
}

function aggregateCheckpointRows(rows, checkpointId) {
  const result = {
    checkpointCompletedMatches: Number(checkpointId),
    scenarioId: rows[0]?.scenarioId,
    engineVersion: rows[0]?.engineVersion,
    schedulers: {},
    pairedConditionalMinusImmediate: {},
  };
  for (const scheduler of expectedSchedulers) {
    const schedulerRows = rows.filter((row) => row.scheduler === scheduler);
    result.schedulers[scheduler] = {
      seedCount: schedulerRows.length,
      seeds: schedulerRows.map((row) => row.seed).sort((a, b) => a - b),
      metrics: Object.fromEntries(METRIC_PATHS.map((metricPath) => [
        metricPath,
        aggregateValues(schedulerRows.map((row) => getPath(row.checkpoints[String(checkpointId)], metricPath))),
      ])),
    };
  }
  const immediateBySeed = new Map(rows.filter((row) => row.scheduler === "immediate").map((row) => [row.seed, row]));
  const conditionalBySeed = new Map(rows.filter((row) => row.scheduler === "conditional-wait").map((row) => [row.seed, row]));
  for (const metricPath of METRIC_PATHS) {
    const paired = [...immediateBySeed.keys()].sort((a, b) => a - b).flatMap((seed) => {
      const immediate = getPath(immediateBySeed.get(seed)?.checkpoints[String(checkpointId)], metricPath);
      const conditional = getPath(conditionalBySeed.get(seed)?.checkpoints[String(checkpointId)], metricPath);
      return isFiniteNumber(immediate) && isFiniteNumber(conditional)
        ? [{ seed, immediate, conditionalWait: conditional, deltaConditionalMinusImmediate: conditional - immediate }]
        : [];
    });
    result.pairedConditionalMinusImmediate[metricPath] = {
      seedCount: paired.length,
      mean: mean(paired.map((row) => row.deltaConditionalMinusImmediate)),
      ...range(paired.map((row) => row.deltaConditionalMinusImmediate)),
      bySeed: paired,
    };
  }
  return result;
}

function validateAndLoad(inputDirectory) {
  const generatedRoot = path.resolve(root, "benchmarks/generated");
  assert(inputDirectory.startsWith(`${generatedRoot}${path.sep}`), "Input directory must be under ignored benchmarks/generated/.");
  const manifestPath = path.join(inputDirectory, "social-joint-refill-run-manifest.json");
  assert(existsSync(manifestPath), `Missing run manifest: ${manifestPath}`);
  assert(!existsSync(`${manifestPath}.pending`) && !existsSync(`${manifestPath}.writing`), "Manifest still has a pending/writing marker.");
  const manifest = readJson(manifestPath);
  assert(manifest.schemaVersion === "social-joint-refill-run-manifest-v1", "Unexpected joint-refill manifest schema.");
  assert(isDeepStrictEqual(manifest.scenarioIds, Object.keys(expectedScenarios)), "Manifest does not contain the four expected scenarios in order.");
  assert(isDeepStrictEqual(manifest.seeds, expectedSeeds), "Manifest seeds do not match the frozen three-seed cohort.");
  assert(isDeepStrictEqual(manifest.schedulers, expectedSchedulers), "Manifest scheduler arms differ from the frozen cohort.");
  assert(manifest.targetCompletedMatches === 100, "Joint-refill summary requires the exact 100-match horizon.");
  assert(manifest.scenarioRuns?.length === Object.keys(expectedScenarios).length, "Manifest must contain exactly four scenario runs.");
  assert(manifest.sourceProvenance?.matcherEngineSourceSetSha256 && manifest.sourceProvenance?.measurementSourcesSha256,
    "Manifest is missing matcher or measurement source hashes.");
  assert(manifest.sourceProvenance?.targetCompletedMatches === 100, "Manifest source provenance target differs from 100.");
  assert(manifest.sourceProvenance?.matcherSearchBudgetsOverridden === false, "Matcher search budgets were overridden.");

  const reportFiles = [];
  const sessionsByScenario = new Map();
  for (const scenarioId of Object.keys(expectedScenarios)) {
    const runEntry = manifest.scenarioRuns.find((entry) => entry.scenarioId === scenarioId);
    assert(runEntry, `Manifest is missing ${scenarioId}.`);
    assert(runEntry.validationStatus === "passed", `${scenarioId} manifest entry is not independently validated.`);
    assert(path.basename(runEntry.file) === runEntry.file && runEntry.file.endsWith(".json"), `${scenarioId} manifest report filename is invalid.`);
    const reportPath = path.join(inputDirectory, runEntry.file);
    assert(existsSync(reportPath), `Missing report for ${scenarioId}: ${reportPath}`);
    assert(!existsSync(`${reportPath}.pending`) && !existsSync(`${reportPath}.writing`), `${scenarioId} report still has a pending/writing marker.`);
    const reportBytes = readFileSync(reportPath);
    const report = JSON.parse(reportBytes.toString("utf8"));
    assert(report.schemaVersion === "social-joint-refill-v1", `${scenarioId} report schema mismatch.`);
    assert(report.validationStatus === "passed" && report.validation?.status === "passed", `${scenarioId} raw report validation did not pass.`);
    assert(isDeepStrictEqual(report.sourceProvenance, manifest.sourceProvenance), `${scenarioId} provenance differs from the manifest.`);
    assert(report.targetCompletedMatches === 100 && isDeepStrictEqual(report.seeds, expectedSeeds), `${scenarioId} target/seeds mismatch.`);
    assert(report.scenarios?.length === 1 && report.scenarios[0]?.id === scenarioId, `${scenarioId} report scenario mismatch.`);
    assert(report.validation?.sessionCount === report.sessions?.length, `${scenarioId} validation session count mismatch.`);
    assert(report.validation?.tamperChecks && Object.values(report.validation.tamperChecks).every((value) => value === "rejected"),
      `${scenarioId} tamper checks are incomplete or failed.`);
    const scenario = expectedScenarios[scenarioId];
    const expectedSessionCount = expectedSeeds.length * expectedSchedulers.length * scenario.engines.length;
    assert(report.sessions?.length === expectedSessionCount, `${scenarioId} expected ${expectedSessionCount} sessions, found ${report.sessions?.length}.`);
    const keys = new Set();
    for (const session of report.sessions) {
      assert(session.scenario?.id === scenarioId, `${scenarioId} report contains a different scenario.`);
      assert(session.status === "completed" && session.completedHistory?.length === 100, `${scenarioId} contains an incomplete session.`);
      assert(session.targetCompletedMatches === 100, `${scenarioId} contains a non-100 session target.`);
      assert(scenario.engines.includes(session.engineVersion), `${scenarioId} has an unexpected engine arm ${session.engineVersion}.`);
      assert(expectedSchedulers.includes(session.scheduler), `${scenarioId} has an unexpected scheduler ${session.scheduler}.`);
      assert(expectedSeeds.includes(session.seed), `${scenarioId} has an unexpected seed ${session.seed}.`);
      const key = `${session.engineVersion}/${session.scheduler}/${session.seed}`;
      assert(!keys.has(key), `${scenarioId} contains duplicate session ${key}.`);
      keys.add(key);
      const early = Math.round((scenario.upper + scenario.lower) * 1.5);
      const checkpointSet = new Set(session.checkpoints?.map((checkpoint) => checkpoint.completedMatches));
      assert(checkpointSet.has(early) && checkpointSet.has(50) && checkpointSet.has(100), `${scenarioId}/${key} lacks a required checkpoint.`);
    }
    assert(keys.size === expectedSessionCount, `${scenarioId} session matrix is incomplete.`);
    sessionsByScenario.set(scenarioId, report.sessions);
    reportFiles.push({ file: runEntry.file, sha256: sha256(reportBytes), sessionCount: report.sessions.length });
  }

  const summarySessions = [];
  for (const scenarioId of Object.keys(expectedScenarios)) {
    const scenario = expectedScenarios[scenarioId];
    const earlyCheckpoint = Math.round((scenario.upper + scenario.lower) * 1.5);
    for (const rawSession of sessionsByScenario.get(scenarioId)) {
      summarySessions.push(summarizeSession(rawSession, earlyCheckpoint));
    }
  }
  assert(summarySessions.length === 36, `Expected 36 sessions in total, found ${summarySessions.length}.`);
  return { manifest, manifestBytes: readFileSync(manifestPath), reportFiles, summarySessions };
}

function buildSummary(inputDirectory, loaded) {
  const checkpointAggregates = [];
  const pairedComparisons = [];
  const operationalAggregates = [];
  for (const scenarioId of Object.keys(expectedScenarios)) {
    const scenario = expectedScenarios[scenarioId];
    const early = Math.round((scenario.upper + scenario.lower) * 1.5);
    const engines = scenario.engines;
    for (const engineVersion of engines) {
      const rows = loaded.summarySessions.filter((row) => row.scenarioId === scenarioId && row.engineVersion === engineVersion);
      for (const checkpointId of [early, 50, 100]) {
        checkpointAggregates.push(aggregateCheckpointRows(rows, checkpointId));
        for (const seed of expectedSeeds) {
          const immediate = rows.find((row) => row.seed === seed && row.scheduler === "immediate");
          const conditional = rows.find((row) => row.seed === seed && row.scheduler === "conditional-wait");
          assert(immediate && conditional, `Missing paired scheduler rows for ${scenarioId}/${engineVersion}/seed${seed}.`);
          const immediateCheckpoint = immediate.checkpoints[String(checkpointId)];
          const conditionalCheckpoint = conditional.checkpoints[String(checkpointId)];
          const metricDeltas = Object.fromEntries(METRIC_PATHS.map((metricPath) => {
            const immediateValue = getPath(immediateCheckpoint, metricPath);
            const conditionalValue = getPath(conditionalCheckpoint, metricPath);
            return [metricPath, isFiniteNumber(immediateValue) && isFiniteNumber(conditionalValue)
              ? conditionalValue - immediateValue : null];
          }));
          pairedComparisons.push({
            scenarioId,
            engineVersion,
            seed,
            checkpointCompletedMatches: checkpointId,
            deltaDefinition: "conditional-wait minus immediate; signed values are preserved",
            immediateOpening: immediate.opening,
            conditionalOpening: conditional.opening,
            metricDeltas,
          });
        }
      }
      for (const scheduler of expectedSchedulers) {
        const schedulerRows = rows.filter((row) => row.scheduler === scheduler);
        const sum = (selector) => schedulerRows.reduce((total, row) => total + selector(row), 0);
        const openingPatterns = {};
        for (const row of schedulerRows) {
          const pattern = row.opening.typePattern ?? "none";
          openingPatterns[pattern] = (openingPatterns[pattern] ?? 0) + 1;
        }
        const waitsByReason = {};
        for (const row of schedulerRows) {
          for (const [reason, count] of Object.entries(row.operational.waitReasons)) {
            waitsByReason[reason] = (waitsByReason[reason] ?? 0) + count;
          }
        }
        operationalAggregates.push({
          scenarioId,
          engineVersion,
          scheduler,
          seedCount: schedulerRows.length,
          openingTypePatternsBySeed: openingPatterns,
          conditionalWaitDecisionCount: sum((row) => row.operational.conditionalWaitDecisionCount),
          waitsTaken: sum((row) => row.operational.waitsTaken),
          waitReasons: waitsByReason,
          waitsDeclinedByReason: Object.fromEntries(Object.keys(schedulerRows[0]?.operational.waitsDeclinedByReason ?? {}).map((reason) => [
            reason,
            sum((row) => row.operational.waitsDeclinedByReason[reason] ?? 0),
          ])),
          partialTwoOfThreeJointRefills: sum((row) => row.operational.partialTwoOfThreeJointRefills),
          fullCourtJointRefills: sum((row) => row.operational.fullCourtJointRefills),
          actualExecutions: sum((row) => row.operational.actualExecutions),
          actualExecutionsAccepted: sum((row) => row.operational.actualExecutionsAccepted),
          actualExecutionsRejected: sum((row) => row.operational.actualExecutionsRejected),
          completedSameFourReplay: {
            completedRefillAssignments: sum((row) => row.operational.completedSameFourReplay.completedRefillAssignments),
            sameFourReplays: sum((row) => row.operational.completedSameFourReplay.sameFourReplays),
            rate: (() => {
              const denominator = sum((row) => row.operational.completedSameFourReplay.completedRefillAssignments);
              return denominator ? sum((row) => row.operational.completedSameFourReplay.sameFourReplays) / denominator : null;
            })(),
          },
          searchLimitReached: {
            immediatePreview: sum((row) => row.operational.searchLimitReached.immediatePreview),
            futurePreview: sum((row) => row.operational.searchLimitReached.futurePreview),
            actualExecution: sum((row) => row.operational.searchLimitReached.actualExecution),
          },
          productionVarietyOptimalActual: engineVersion === "production" ? {
            true: sum((row) => row.operational.productionVarietyOptimalActual.true),
            false: sum((row) => row.operational.productionVarietyOptimalActual.false),
            missing: sum((row) => row.operational.productionVarietyOptimalActual.missing),
          } : null,
          certificates: {
            immediatePreview: combineCertificateSummaries(schedulerRows.map((row) => row.operational.certificates.immediatePreview)),
            futurePreview: combineCertificateSummaries(schedulerRows.map((row) => row.operational.certificates.futurePreview)),
            actualExecution: combineCertificateSummaries(schedulerRows.map((row) => row.operational.certificates.actualExecution)),
          },
        });
      }
    }
  }
  const manifest = loaded.manifest;
  return {
    schemaVersion: "social-joint-refill-summary-v1",
    validationStatus: "passed",
    generatedAt: new Date().toISOString(),
    input: {
      directory: path.relative(root, inputDirectory),
      manifestSha256: sha256(loaded.manifestBytes),
      reports: loaded.reportFiles,
      validationRequirement: "Four source-coherent reports and the run manifest must already carry passed independent validation, no pending/writing markers, and all validation tamper mutations must be rejected.",
    },
    analysisTool: {
      file: path.relative(root, process.argv[1]),
      sha256: sha256(readFileSync(process.argv[1])),
      role: "Read-only postprocessor; recorded separately from measurement-source provenance.",
    },
    sourceProvenance: manifest.sourceProvenance,
    design: {
      sessionCount: 36,
      seeds: expectedSeeds,
      schedulers: expectedSchedulers,
      targetCompletedMatches: 100,
      checkpointRule: "round(1.5 * initialPlayerCount), plus 50 and 100 completed matches; the early checkpoints are 12, 15, and 18 for rosters of 8, 10, and 12.",
      waitRule: "Exact next completion-group forecast, maximum five-minute delay, both current/future wait certificates required; wait when future-minus-current new courtmate pairs are at least 1 per court OR signed rolling-six type gain is at least 0.5 per court.",
      durationRule: manifest.sourceProvenance.durationFormula,
      historyRule: "Prefix variety/C/P/O use completed-only history; production selector receives active reservations through its existing social-history input.",
      typeFrequencyRule: "No uniform MIXED/OWN_SIDE frequency target. T is the fraction of structurally feasible match types seen in each player's rolling six appearances.",
    },
    metricDefinitions: {
      courtmateCoverage: "Unique unordered completed-history partner-or-opponent pairs divided by structurally feasible courtmate pairs.",
      relationshipCoverage: "For partner and opponent facets, unique observed relationship peers divided by structural peer opportunities.",
      fullTypeCoverage: "Player has T=1 in the latest six appearances; the reported fraction uses type-eligible players as denominator.",
      bothTypeCoverage: "Among players with both MIXED and OWN_SIDE structurally feasible, count whose latest six appearances include both types.",
      longestSingleTypeRun: "Longest consecutive run in completed history where a player's observed type does not change; never interpreted as an extinction proof.",
      rest: "Rest-turn values use completed-match event ordering; elapsed rest uses simulated wall-clock minutes. Back-to-back rate denominator is eligible post-first assignments.",
      pairedDeltas: "Every delta is conditional-wait minus immediate, in the metric's native units, with signed values retained.",
    },
    scenarios: Object.entries(expectedScenarios).map(([id, value]) => ({
      id,
      ...value,
      earlyCheckpointMatches: Math.round((value.upper + value.lower) * 1.5),
    })),
    checkpointAggregates,
    pairedComparisons,
    operationalAggregates,
    sessionSummaries: loaded.summarySessions,
  };
}

function combineCertificateSummaries(rows) {
  const fields = Object.keys(rows[0]?.certificates ?? {});
  const certificates = Object.fromEntries(fields.map((field) => [field, {
    true: rows.reduce((total, row) => total + row.certificates[field].true, 0),
    false: rows.reduce((total, row) => total + row.certificates[field].false, 0),
    notApplicable: rows.reduce((total, row) => total + row.certificates[field].notApplicable, 0),
  }]));
  return {
    calls: rows.reduce((total, row) => total + row.calls, 0),
    certified: rows.reduce((total, row) => total + row.certified, 0),
    waitCertified: rows.reduce((total, row) => total + row.waitCertified, 0),
    searchLimitReached: rows.reduce((total, row) => total + row.searchLimitReached, 0),
    varietyOptimal: {
      true: rows.reduce((total, row) => total + row.varietyOptimal.true, 0),
      false: rows.reduce((total, row) => total + row.varietyOptimal.false, 0),
    },
    certificates,
  };
}

function main() {
  if (args.includes("--help")) {
    console.log("Usage: node scripts/summarize-social-joint-refill-experiment.mjs [--input-dir benchmarks/generated/social-joint-refill/full-2026-10-07-v1] [--out-json PATH]");
    console.log("Reads four already-validated 100-match scenario reports and writes a source-coherent combined JSON summary; it never changes raw reports.");
    return;
  }
  const inputDirectory = path.resolve(root, valueAfter("--input-dir", defaultInputDirectory));
  const outputPath = path.resolve(root, valueAfter("--out-json", path.join(path.relative(root, inputDirectory), "social-joint-refill-summary.json")));
  const generatedRoot = path.resolve(root, "benchmarks/generated");
  assert(outputPath.startsWith(`${generatedRoot}${path.sep}`), "Summary output must remain under ignored benchmarks/generated/.");
  assert(!existsSync(outputPath), `Refusing to overwrite ${outputPath}. Choose a fresh --out-json path.`);
  assert(!existsSync(`${outputPath}.writing`), `A writing marker already exists for ${outputPath}.`);
  const loaded = validateAndLoad(inputDirectory);
  const summary = buildSummary(inputDirectory, loaded);
  const writingPath = `${outputPath}.writing`;
  writeFileSync(writingPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  // A same-directory hard link atomically claims the destination without
  // replacing a summary another process created after the initial check.
  linkSync(writingPath, outputPath);
  unlinkSync(writingPath);
  console.log(`Validated combined summary: ${outputPath}`);
  console.log(`Sessions: ${summary.sessionSummaries.length}; paired seed comparisons: ${summary.pairedComparisons.length}; source hash: ${summary.sourceProvenance.matcherEngineSourceSetSha256}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
