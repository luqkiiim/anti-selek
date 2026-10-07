import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { assertSocialCourtmateBeneficialRescueCheckpoint } from "./social-courtmate-beneficial-rescue-validation.mjs";

const directory = path.resolve(process.argv[2] ?? "benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const manifest = read(path.join(directory, "social-courtmate-beneficial-rescue-100-run-manifest.json"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => sum(values) / values.length;
const longestRun = (types) => {
  let best = 0, length = 0, previous = null;
  for (const type of types) { length = type === previous ? length + 1 : 1; previous = type; best = Math.max(best, length); }
  return best;
};
const coverageProfile = (history, courts) => {
  const peers = new Map(Array.from({ length: 14 }, (_, index) => [`P${index + 1}`, new Set()]));
  for (const match of [...history, ...courts]) {
    const ids = match.ids ?? [...match.team1, ...match.team2];
    for (const id of ids) for (const peer of ids) if (id !== peer) peers.get(id).add(peer);
  }
  return [...peers].map(([userId, covered]) => ({ userId, covered: covered.size, possible: 13 }))
    .sort((a, b) => a.covered - b.covered || a.userId.localeCompare(b.userId));
};
assert(manifest.targetMatches === 100 && manifest.policyRuns.length === 4, "Expected a complete four-arm 100-match manifest.");
const summary = { manifest, definitions: {
  means: "Unweighted means across the five equal-sized sessions unless labeled total or maximum.",
  restMean: "Assignment-rest mean weighted by eligible completed appearances; first assignments excluded.",
  restP95: "Mean of the five session p95 values, not a pooled percentile; individual values are retained.",
  conditionalT: "Sum of chosen signed aggregate T change minus the best achievable at exactly Gmax in each same-state class.",
  fullGainBenefit: "Chosen signed T minus the same-state strict courtmate-first profile-before-T winner, with both choices at Gmax; positive signed T also includes first-type acquisition.",
  cost: "Completed decisions only; a two-court opening is counted once. Started costs are reported separately.",
}, policies: {} };
const rows = [], fullGainRows = [];
for (const run of manifest.policyRuns) {
  const report = read(path.join(directory, run.jsonPath));
  assert(report.validationStatus === "passed", `${run.policy}: report is not validated.`);
  assert(report.sourceProvenance.engineSourceSha256 === manifest.engineSourceSha256 &&
    report.sourceProvenance.measurementHarnessSha256 === manifest.measurementHarnessSha256,
  `${run.policy}: source hashes differ.`);
  const sessions = report.courtmateBeneficialRescueAnalysis.sessions;
  assert(sessions.length === 5 && JSON.stringify(report.seeds) === JSON.stringify(manifest.seeds), "Unexpected seed cohort.");
  const arm = { checkpoints: {}, meanTOverEvents76To100: mean(sessions.map((session) => session.meanTOverEvents76To100)) };
  for (const horizon of [21, 100]) {
    const checks = sessions.map((session) => session.checkpoints[String(horizon)]);
    report.sessions.forEach((session) => assertSocialCourtmateBeneficialRescueCheckpoint(session.checkpoints[String(horizon)], run.policy));
    const ind = checks.map((check) => check.independent);
    const raw = checks.map((check) => check.rawCheckpoint);
    const avg = (group, field) => mean(ind.map((check) => check[group][field]));
    const restCount = sum(raw.map((check) => check.assignmentRestGap.count));
    const b2bCount = sum(raw.map((check) => check.backToBack.count));
    const b2bEligible = sum(raw.map((check) => check.backToBack.eligibleAssignments));
    arm.checkpoints[horizon] = {
      avgCourtmates: avg("courtmateBreadth", "averageDistinctCourtmatesPerPlayer"),
      meanMinimumCourtmates: avg("courtmateBreadth", "minimumDistinctCourtmatesPerPlayer"),
      observedMinimumCourtmates: Math.min(...ind.map((check) => check.courtmateBreadth.minimumDistinctCourtmatesPerPlayer)),
      courtmateCoverage: avg("courtmateBreadth", "averageCoverageFraction"),
      meanWorstPlayerCoverage: avg("courtmateBreadth", "worstPlayerCoverageFraction"),
      meanUniqueCourtmatePairs: avg("courtmateBreadth", "distinctUnorderedCourtPairCount"),
      fullyCoveredPlayers: sum(ind.map((check) => check.courtmateBreadth.fullyCoveredPlayers)),
      bothTypesPlayers: sum(ind.map((check) => check.matchTypeCoverage.playersWithBothRecentTypes)),
      meanT: avg("matchTypeCoverage", "latestSixMeanT"),
      mixedMatches: sum(ind.map((check) => check.globalMatchTypeCounts.MIXED)),
      ownSideMatches: sum(ind.map((check) => check.globalMatchTypeCounts.OWN_SIDE)),
      longestRecentSingleTypeRun: Math.max(...ind.flatMap((check) => check.players.map((player) => longestRun(player.latestSixMatchTypes)))),
      longestPersonalSingleTypeRun: Math.max(...report.sessions.flatMap((session) =>
        Array.from({ length: 14 }, (_, index) => longestRun(session.completedHistory.slice(0, horizon)
          .filter((match) => [...match.team1, ...match.team2].includes(`P${index + 1}`))
          .map((match) => match.matchType))))),
      backToBackCount: b2bCount, backToBackEligible: b2bEligible, backToBackRate: b2bCount / b2bEligible,
      meanRest: sum(raw.map((check) => check.assignmentRestGap.mean * check.assignmentRestGap.count)) / restCount,
      meanSessionP95Rest: mean(raw.map((check) => check.assignmentRestGap.p95)),
      maximumRest: Math.max(...raw.map((check) => check.assignmentRestGap.max)),
      longestOtherCompletionGap: Math.max(...raw.map((check) => check.betweenOwnCompletionEventGap.max)),
      starvationInterventions: sum(raw.map((check) => check.starvation.materiallyChangedPlayerSet)),
      fairnessCertificateFailures: sum(raw.map((check) => check.optimizer.fairnessCertificateFailures)),
      avgPartners: avg("relationshipVariety", "averageDistinctPartnersPerPlayer"),
      avgOpponents: avg("relationshipVariety", "averageDistinctOpponentsPerPlayer"),
      partnerEntropy: avg("relationshipVariety", "averageStructuralNormalizedPartnerEntropy"),
      opponentEntropy: avg("relationshipVariety", "averageStructuralNormalizedOpponentEntropy"),
      seeds: sessions.map((session, index) => ({ seed: session.seed, ...ind[index].fairness,
        courtmateBreadth: ind[index].courtmateBreadth, matchTypeCoverage: ind[index].matchTypeCoverage,
        assignmentRestGap: raw[index].assignmentRestGap, backToBack: raw[index].backToBack,
        starvationInterventions: raw[index].starvation.materiallyChangedPlayerSet })),
    };
    if (run.policy === "rescue" || run.policy === "beneficial") {
      const audits = raw.map((check) => run.policy === "rescue" ? check.socialCourtmateRescue : check.socialCourtmateBeneficialRescue);
      const started = audits.flatMap((audit) => audit.witnesses);
      const completed = started.filter((witness) => witness.completed);
      const sacrifices = completed.filter((witness) => witness.chosenCourtmateGainDeficit === 1);
      const startedSacrifices = started.filter((witness) => witness.chosenCourtmateGainDeficit === 1);
      const telescope = sum(completed.map((witness) => witness.chosenRollingMatchTypeGain));
      assert(Math.abs(telescope - sum(ind.map((check) => 14 * check.matchTypeCoverage.latestSixMeanT))) < 1e-9,
        `Completed signed T does not telescope to endpoint coverage at ${horizon}.`);
      arm.checkpoints[horizon].cost = {
        startedDecisions: started.length, completedDecisions: completed.length,
        startedPairSacrifices: startedSacrifices.length, completedPairSacrifices: sacrifices.length,
        totalPairsDeliberatelyConceded: sum(sacrifices.map((witness) => witness.chosenCourtmateGainDeficit)),
        positiveBenefitSacrifices: sacrifices.filter((witness) => witness.incrementalTGainVsBestFullGainCandidate > 0).length,
        zeroBenefitSacrifices: sacrifices.filter((witness) => witness.incrementalTGainVsBestFullGainCandidate === 0).length,
        negativeBenefitSacrifices: sacrifices.filter((witness) => witness.incrementalTGainVsBestFullGainCandidate < 0).length,
        incrementalT: sum(sacrifices.map((witness) => witness.incrementalTGainVsBestFullGainCandidate)),
        fullTypePlayerWindowBenefit: sum(sacrifices.map((witness) => witness.fullTypePlayerCountDeltaVsGmax)),
        completedSignedT: telescope,
      };
      if (run.policy === "beneficial") {
        assert(sacrifices.every((witness) => witness.chosenRollingMatchTypeGain > witness.bestRollingMatchTypeGainAtGmax), "A concession did not strictly improve T.");
        const full = completed.filter((witness) => witness.chosenCourtmateGainDeficit === 0);
        arm.checkpoints[horizon].fullGainType = {
          completedAtGmaxDecisions: full.length,
          withPositiveSignedTGain: full.filter((witness) => witness.chosenRollingMatchTypeGain > 0).length,
          withBenefitVsStrictWinner: full.filter((witness) => witness.fullGmaxTBenefitVsStrict > 0).length,
          incrementalTVsStrictWinner: sum(full.map((witness) => witness.fullGmaxTBenefitVsStrict)),
          extraBothTypeWindowsVsStrictWinner: sum(full.map((witness) => witness.chosenFullTypePlayerCount - witness.strictWinnerAtGmaxFullTypePlayerCount)),
        };
      }
    }
  }
  if (run.policy === "rescue" || run.policy === "beneficial") for (const session of sessions) {
    const history = report.sessions.find((item) => item.seed === session.seed).completedHistory;
    const audit = run.policy === "rescue" ? session.checkpoints["100"].rawCheckpoint.socialCourtmateRescue : session.checkpoints["100"].rawCheckpoint.socialCourtmateBeneficialRescue;
    for (const witness of audit.witnesses) {
      if (run.policy === "beneficial" && witness.chosenCourtmateGainDeficit === 0 && witness.fullGmaxTBenefitVsStrict > 0) {
        fullGainRows.push({ seed: session.seed, afterCompletedMatches: witness.afterCompletedMatches,
          completedAfterMatchNumber: witness.completedAfterMatchNumber, completedBy21: witness.completedAfterMatchNumber !== null && witness.completedAfterMatchNumber <= 21,
          completedBy100: witness.completed, gain: witness.chosenCourtmateGain,
          chosenSignedT: witness.chosenRollingMatchTypeGain, strictWinnerSignedT: witness.strictWinnerRollingMatchTypeGainAtGmax,
          extraT: witness.fullGmaxTBenefitVsStrict, extraBothTypeWindows: witness.chosenFullTypePlayerCount - witness.strictWinnerAtGmaxFullTypePlayerCount,
          selectedCourts: witness.selectedCourts, strictWinnerCourts: witness.strictWinnerAtGmaxCourts });
      }
      if (witness.chosenCourtmateGainDeficit !== 1) continue;
      const prior = history.slice(0, witness.afterCompletedMatches);
      const chosenProfile = coverageProfile(prior, witness.selectedCourts);
      const fullGainProfile = coverageProfile(prior, witness.bestGmaxCourts);
      assert(JSON.stringify(chosenProfile) === JSON.stringify(witness.selectedCourtmateCoverageProfile), "Cost witness coverage differs from completed history.");
      const firstDifferent = chosenProfile.findIndex((entry, index) => entry.covered !== fullGainProfile[index].covered);
      if (witness.zeroTBenefitSacrifice) assert(firstDifferent >= 0 && chosenProfile[firstDifferent].covered > fullGainProfile[firstDifferent].covered,
        "Zero-T sacrifice was not justified by better courtmate equity.");
      rows.push({ policy: run.policy, seed: session.seed, afterCompletedMatches: witness.afterCompletedMatches,
        completedAfterMatchNumber: witness.completedAfterMatchNumber, completedBy21: witness.completedAfterMatchNumber !== null && witness.completedAfterMatchNumber <= 21,
        completedBy100: witness.completed, Gmax: witness.courtMateGainMaximum, chosenGain: witness.chosenCourtmateGain,
        chosenSignedT: witness.chosenRollingMatchTypeGain, bestGmaxSignedT: witness.bestRollingMatchTypeGainAtGmax,
        incrementalT: witness.incrementalTGainVsBestFullGainCandidate, extraBothTypeWindows: witness.fullTypePlayerCountDeltaVsGmax,
        strictPositiveTBenefit: witness.chosenRollingMatchTypeGain > witness.bestRollingMatchTypeGainAtGmax,
        classification: witness.zeroTBenefitSacrifice ? "equity at T tie" : witness.chosenRollingMatchTypeGain > 0
          ? "net coverage increase" : witness.chosenRollingMatchTypeGain === 0 ? "avoids net loss" : "reduces net loss",
        zeroTBenefit: witness.zeroTBenefitSacrifice, selectedCourts: witness.selectedCourts, bestGmaxCourts: witness.bestGmaxCourts,
        selectedCoverageProfile: chosenProfile, bestGmaxCoverageProfile: fullGainProfile,
        playerTypeWindows: witness.perPlayerTypeWindows });
    }
  }
  summary.policies[run.policy] = arm;
}
const jsonPath = path.join(directory, "summary.json");
const csvPath = path.join(directory, "one-pair-sacrifices.csv");
const fullCsvPath = path.join(directory, "full-gain-type-benefits.csv");
assert(!existsSync(jsonPath) && !existsSync(csvPath) && !existsSync(fullCsvPath), "Refusing to overwrite an existing summary.");
const columns = Object.keys(rows[0] ?? { seed: 0, incrementalT: 0 });
const cell = (value) => `"${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
writeFileSync(csvPath, [columns.join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\n") + "\n", { flag: "wx" });
const fullColumns = Object.keys(fullGainRows[0] ?? { seed: 0, extraT: 0 });
writeFileSync(fullCsvPath, [fullColumns.join(","), ...fullGainRows.map((row) => fullColumns.map((column) => cell(row[column])).join(","))].join("\n") + "\n", { flag: "wx" });
writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(jsonPath);
console.log(csvPath);
console.log(fullCsvPath);
