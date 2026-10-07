import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSocialGeneralizationReport, reconstructSocialGeneralizationPrefix } from "./social-generalization-validation.mjs";

const manifestPath = path.resolve(process.argv[2] ?? "benchmarks/generated/social-generalization/full-2026-10-06-v1/social-generalization-run-manifest.json");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const manifest = read(manifestPath), directory = path.dirname(manifestPath);
const mean = (values) => { const numeric = values.filter((v) => typeof v === "number"); return numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null; };
const sum = (values) => values.reduce((a, b) => a + (b ?? 0), 0);
const scenarios = [], allCosts = [], events = [], failures = [], sessionMetrics = [];
function rosterAt(session, scenario, count) {
  const roster = Array.from({ length: scenario.initialUpper + scenario.initialLower }, (_, i) => ({ userId: `P${i + 1}`, side: i < scenario.initialUpper ? "UPPER" : "LOWER", isPaused: false }));
  for (const application of session.eventApplications) {
    if (application.status !== "applied" || application.appliedAfterCompletedMatches > count) continue;
    const event = scenario.events[application.eventIndex];
    if (event.type === "join") roster.push(...event.players.map((p) => ({ ...p, isPaused: false })));
    else roster.find((p) => p.userId === event.userId).isPaused = event.type === "pause";
  }
  return roster;
}
function checkpointMetrics(s, cp, scenario) {
  const score = cp.scores.structural;
  const decisions = s.decisions.filter((d) => d.afterCompletedMatches < cp.completedMatches);
  const returning = decisions.filter((d) => d.assignmentsStarted > 0).flatMap((d) => d.assignmentRestTurns).filter((r) => r.priorCompletedMatches > 0);
  const both = score.players.filter((p) => p.feasibleMatchTypes.length === 2);
  const activeIds = new Set(cp.structuralRoster.filter((p) => !p.isPaused).map((p) => p.userId));
  const activeBoth = both.filter((p) => activeIds.has(p.userId));
  const activeCounts = cp.fairness.playerMatchCounts.filter((p) => !p.isPaused);
  let firstFullCourtmate = null, lateMeanT = null, lateBothCoverage = null;
  if (cp.completedMatches === 100) {
    const points = [];
    for (let n = 1; n <= cp.completedMatches; n++) {
      const current = reconstructSocialGeneralizationPrefix(rosterAt(s, scenario, n), s.completedHistory.slice(0, n));
      if (firstFullCourtmate === null && current.courtmates.fullyCoveredPlayerCount === current.playerCount) firstFullCourtmate = n;
      if (n >= 76) points.push(current);
    }
    lateMeanT = mean(points.map((p) => p.meanT));
    lateBothCoverage = mean(points.map((p) => { const rows = p.players.filter((r) => r.feasibleMatchTypes.length === 2); return rows.length ? rows.filter((r) => r.T === 1).length / rows.length : null; }));
  }
  return {
    scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, completedMatches: cp.completedMatches,
    playerCount: score.playerCount, countSpread: cp.fairness.countSpread, countDistribution: Object.fromEntries([...new Set(cp.fairness.playerMatchCounts.map((p) => p.matchesPlayed))].sort((a, b) => a - b).map((n) => [n, cp.fairness.playerMatchCounts.filter((p) => p.matchesPlayed === n).length])),
    activeCountSpread: activeCounts.length ? Math.max(...activeCounts.map((p) => p.matchesPlayed)) - Math.min(...activeCounts.map((p) => p.matchesPlayed)) : null,
    effectiveActiveCountSpread: activeCounts.length ? Math.max(...activeCounts.map((p) => p.effectiveMatchCount)) - Math.min(...activeCounts.map((p) => p.effectiveMatchCount)) : null,
    fairnessCertificateFailures: cp.decisionCohort.fairnessCertificateFailures, starvationCertificateFailures: cp.decisionCohort.starvationCertificateFailures,
    averageCourtmates: score.courtmates.averageDistinctPeers, minimumCourtmates: score.courtmates.minimumDistinctPeers, meanCourtmateCoverage: score.courtmates.meanCoverage, worstCourtmateCoverage: score.courtmates.worstPlayerCoverage,
    feasibleCourtmatePairs: score.courtmates.feasiblePairCount, uniqueCourtmatePairs: score.courtmates.coveredPairCount, fullyCoveredCourtmatePlayers: score.courtmates.fullyCoveredPlayerCount,
    meanT: score.meanT, fullTypeCoverageFraction: score.fullTypeCoverageFraction, bothTypeEligible: both.length, bothTypeCovered: both.filter((p) => p.T === 1).length, activeBothTypeEligible: activeBoth.length, activeBothTypeCovered: activeBoth.filter((p) => p.T === 1).length, oneTypePlayers: score.oneTypePlayerCount,
    mixedMatches: score.completedMatchTypeCounts.MIXED, ownSideMatches: score.completedMatchTypeCounts.OWN_SIDE, longestSingleTypeRun: score.longestSingleTypeAppearanceRun,
    backToBackCount: cp.rest.backToBackAssignments, returningAssignments: returning.length, backToBackRate: cp.rest.backToBackRate, meanRest: cp.rest.meanRestTurns, p95Rest: cp.rest.p95RestTurns, maximumRest: cp.rest.maximumAssignmentRestTurns, longestCompletionGap: cp.rest.longestOtherCompletionGap, starvationInterventions: cp.rest.starvationInterventions,
    averagePartners: score.partners.averageDistinctPeers, averageOpponents: score.opponents.averageDistinctPeers, partnerEntropy: score.partners.meanNormalizedEntropy, opponentEntropy: score.opponents.meanNormalizedEntropy,
    attemptedDecisions: cp.decisionCohort.started, completedDecisions: cp.decisionCohort.completed, pendingDecisions: cp.decisionCohort.pending, independentAuditIncomplete: cp.decisionCohort.independentAuditIncomplete, independentAuditInvalid: cp.decisionCohort.independentAuditInvalid, engineSearchLimitDecisions: cp.decisionCohort.engineSearchLimitDecisions,
    onePairConcessions: s.arm === "courtmate-beneficial-rescue" ? cp.rescue.completedOnePairConcessions : 0, conditionalTypeBenefit: s.arm === "courtmate-beneficial-rescue" ? cp.rescue.completedConditionalTypeBenefitTotal : 0, extraBothTypeWindows: s.arm === "courtmate-beneficial-rescue" ? cp.rescue.completedBothTypeWindowDeltaVsBestGmax : 0,
    zeroBenefitConcessions: s.arm === "courtmate-beneficial-rescue" ? cp.rescue.completedZeroBenefitConcessions : 0, negativeBenefitConcessions: s.arm === "courtmate-beneficial-rescue" ? cp.rescue.completedNegativeBenefitConcessions : 0,
    opportunityPlayerCount: cp.currentOpportunityPlayerCount, opportunityMeanT: cp.scores.opportunity.meanT, firstFullCourtmate, lateMeanT, lateBothCoverage,
  };
}
for (const run of manifest.scenarioRuns) {
  const report = read(path.join(directory, run.jsonPath));
  if (report.validationStatus !== "passed") throw new Error(`Pending report ${run.jsonPath}`);
  assertSocialGeneralizationReport(report, { scenarioId: run.scenarioId, seeds: manifest.seeds, mode: manifest.mode });
  const scenario = report.scenarios[0];
  scenarios.push(scenario);
  for (const s of report.sessions) {
    if (s.status !== "completed") failures.push({ scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, status: s.status, stopReason: s.stopReason, completedMatches: s.completedHistory.length, lastEngineProof: s.decisions.at(-1)?.engine, lastAudit: s.decisions.at(-1)?.auditStatus });
    events.push(...s.eventApplications.map((e) => ({ scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, ...e,
      firstAssignmentAfterEvent: e.status === "applied" && (e.type === "join" || e.type === "resume") ? e.userIds.map((userId) => ({ userId, afterCompletedMatches: s.decisions.find((d) => d.afterCompletedMatches >= e.appliedAfterCompletedMatches && d.assignmentsStarted > 0 && d.selectedAssignments.some((a) => a.ids.includes(userId)))?.afterCompletedMatches ?? null })) : null,
    })));
    sessionMetrics.push(...s.checkpoints.map((cp) => checkpointMetrics(s, cp, scenario)));
    if (s.arm === "courtmate-beneficial-rescue") for (const d of s.decisions) if (d.rescue?.chosenCourtmateGainDeficit === 1 && d.assignmentsStarted > 0) {
      allCosts.push({ scenarioId: s.scenarioId, seed: s.seed, decisionId: d.decisionId, afterCompletedMatches: d.afterCompletedMatches, completed: d.completed, completedAfterMatchNumber: d.completedAfterMatchNumber, Gmax: d.rescue.courtmateGainMaximum, chosenG: d.rescue.chosenCourtmateGain, chosenSignedT: d.rescue.chosenSignedRollingTypeGain, bestFullGmaxSignedT: d.rescue.bestSignedRollingTypeGainAtGmax, conditionalT: d.rescue.conditionalTypeBenefit, conditionalTUnits: d.rescue.conditionalTypeBenefitUnits, rollingTypeDenominator: d.audit.rollingTypeDenominator, bothTypeWindowDelta: d.rescue.bothTypeWindowCountDeltaVsBestGmax, selectedWindows: d.rescue.selectedWindows, bestGmaxWindows: d.rescue.bestGmaxAtFrontier.players });
    }
  }
}
const aggregates = [];
for (const scenario of scenarios) for (const horizon of [scenario.shortHorizonMatches, ...(manifest.mode === "selected-long" && scenario.longDiagnostic ? [100] : [])]) for (const arm of ["production", "courtmate-beneficial-rescue"]) {
  const rows = sessionMetrics.filter((r) => r.scenarioId === scenario.id && r.arm === arm && r.completedMatches === horizon);
  const numeric = rows.length ? Object.keys(rows[0]).filter((name) => typeof rows[0][name] === "number" || rows[0][name] === null) : [];
  const averaged = Object.fromEntries(numeric.map((name) => [name, mean(rows.map((r) => r[name]))]));
  const totals = Object.fromEntries(["completedDecisions", "onePairConcessions", "conditionalTypeBenefit", "extraBothTypeWindows", "zeroBenefitConcessions", "negativeBenefitConcessions", "fullyCoveredCourtmatePlayers", "uniqueCourtmatePairs", "bothTypeEligible", "bothTypeCovered", "activeBothTypeEligible", "activeBothTypeCovered", "oneTypePlayers", "mixedMatches", "ownSideMatches", "backToBackCount", "returningAssignments", "fairnessCertificateFailures", "starvationCertificateFailures", "starvationInterventions", "engineSearchLimitDecisions", "independentAuditIncomplete", "independentAuditInvalid"].map((name) => [name, sum(rows.map((r) => r[name]))]));
  const maxima = Object.fromEntries(["countSpread", "activeCountSpread", "effectiveActiveCountSpread", "longestSingleTypeRun", "maximumRest", "longestCompletionGap"].map((name) => [name, rows.length ? Math.max(...rows.map((r) => r[name])) : null]));
  aggregates.push({ scenarioId: scenario.id, horizon, arm, samples: rows.length, expectedSamples: manifest.seeds.length, means: averaged, maxima, totals, firstFullCourtmateReachedSeeds: rows.filter((r) => r.firstFullCourtmate !== null).length, completedConcessionRate: totals.completedDecisions ? totals.onePairConcessions / totals.completedDecisions : null, pooledBackToBackRate: totals.returningAssignments ? totals.backToBackCount / totals.returningAssignments : null, bothTypeCoverage: totals.bothTypeEligible ? totals.bothTypeCovered / totals.bothTypeEligible : null, activeBothTypeCoverage: totals.activeBothTypeEligible ? totals.activeBothTypeCovered / totals.activeBothTypeEligible : null });
}
const completedCosts = allCosts.filter((c) => c.completed);
const summary = { schemaVersion: "social-generalization-summary-v1", sourceManifest: manifestPath, sourceProvenance: manifest.sourceProvenance, canonicalReference: manifest.canonicalReference, seeds: manifest.seeds, scenarios, failures, aggregates, sessionMetrics, events, rescueAudit: { executedCosts: allCosts.length, completedCosts: completedCosts.length, pendingCosts: allCosts.length - completedCosts.length, completedConditionalT: sum(completedCosts.map((c) => c.conditionalT)), completedBothTypeWindows: sum(completedCosts.map((c) => c.bothTypeWindowDelta)), zeroBenefitCosts: completedCosts.filter((c) => BigInt(c.conditionalTUnits) === 0n).length, negativeBenefitCosts: completedCosts.filter((c) => BigInt(c.conditionalTUnits) < 0n).length }, allCosts };
writeFileSync(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
const columns = ["scenarioId", "seed", "decisionId", "afterCompletedMatches", "completed", "completedAfterMatchNumber", "Gmax", "chosenG", "chosenSignedT", "bestFullGmaxSignedT", "conditionalT", "conditionalTUnits", "rollingTypeDenominator", "bothTypeWindowDelta"];
const csv = [columns.join(","), ...allCosts.map((row) => columns.map((c) => JSON.stringify(row[c] ?? "")).join(","))].join("\n") + "\n";
writeFileSync(path.join(directory, "all-one-pair-concessions.csv"), csv);
console.log(JSON.stringify({ summaryPath: path.join(directory, "summary.json"), completedSessions: scenarios.length * manifest.seeds.length * 2 - failures.length, failedSessions: failures.length, rescueAudit: summary.rescueAudit, aggregates: aggregates.map((a) => ({ scenarioId: a.scenarioId, horizon: a.horizon, arm: a.arm, samples: a.samples, C: a.means.averageCourtmates, coverage: a.means.meanCourtmateCoverage, T: a.means.meanT, both: a.bothTypeCoverage, rest: a.means.meanRest, completedCost: a.totals.onePairConcessions })) }, null, 2));
