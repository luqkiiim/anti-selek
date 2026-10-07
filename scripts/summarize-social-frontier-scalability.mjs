import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const root = process.cwd();
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
};
if (args.includes("--help")) {
  console.log("Usage: node scripts/summarize-social-frontier-scalability.mjs [--dir benchmarks/generated/social-frontier-scalability/<run>] [--out path]");
  console.log("Summarizes only scenario reports and manifests independently marked passed by the benchmark runner.");
  process.exit(0);
}
const inputDir = path.resolve(root, valueAfter("--dir", "benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1"));
const manifestPath = path.join(inputDir, "social-frontier-scalability-run-manifest.json");
if (!existsSync(manifestPath)) throw new Error(`Missing completed run manifest: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== "social-frontier-scalability-run-manifest-v1" || manifest.scenarioRuns.some((run) => run.validationStatus !== "passed")) {
  throw new Error("Refusing to summarize an incomplete or unvalidated run.");
}
const reports = manifest.scenarioRuns.map((run) => {
  const report = JSON.parse(readFileSync(path.join(inputDir, run.jsonPath), "utf8"));
  if (report.validationStatus !== "passed" || report.validation?.status !== "passed") throw new Error(`${run.jsonPath}: report lacks independent validation`);
  return report;
});
const round = (value, digits = 2) => value === null || value === undefined ? "—" : Number(value).toFixed(digits);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
};
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const output = [
  `# Social frontier scalability results`,
  ``,
  `Profile: **${manifest.profile}**; seeds: **${manifest.seeds.join(", ")}**; target: **${manifest.targetMatches} completed matches**; engines: **${manifest.engineVersions.join(" vs ")}**.`,
  ``,
  `Every observed batch executed only with fairness, starvation, Gmax, and full-priority certification. Default matcher search budgets were used. Branch counters are reported as each implementation's own productive expansion and certified-pruning work units; they are useful within an implementation and do not represent a shared raw work unit across the original and optimized searches.`,
  ``,
  `| Scenario | Engine | Sessions complete | Decisions | Certified calls | Search-limit calls | Opening median / p95 / max ms | Refill median / p95 / max ms | Total engine s | Explored / pruned counts |`,
  `|---|---|---:|---:|---:|---:|---:|---:|---:|---:|`,
];

for (const report of reports) {
  for (const engineVersion of report.engineVersions) {
    const sessions = report.sessions.filter((session) => session.engineVersion === engineVersion);
    const decisions = sessions.flatMap((session) => session.decisions);
    const opening = decisions.filter((decision) => decision.kind === "opening").map((decision) => decision.elapsedMs);
    const refill = decisions.filter((decision) => decision.kind === "refill").map((decision) => decision.elapsedMs);
    const complete = sessions.filter((session) => session.status === "completed").length;
    const certified = decisions.filter((decision) => decision.certificationSucceeded).length;
    const limited = decisions.filter((decision) => decision.result.searchLimitReached).length;
    const explored = decisions.reduce((sum, decision) => sum + decision.result.exploredBranches, 0);
    const pruned = decisions.reduce((sum, decision) => sum + decision.result.prunedBranches, 0);
    const engineMs = sessions.reduce((sum, session) => sum + session.diagnostics.totalEngineMs, 0);
    const endpoint = sessions.map((session) => session.checkpoints.find((cp) => cp.completedMatches === 100) ?? session.checkpoints.at(-1)).filter(Boolean);
    const meanT = mean(endpoint.map((cp) => cp.socialVariety3211.meanT));
    const meanCourtCoverage = mean(endpoint.map((cp) => cp.scores.structural.courtmates.meanCoverage));
    const row = {
      scenario: report.scenarios[0].id,
      engineVersion,
      sessions: sessions.length,
      complete,
      completedMatches: sessions.map((session) => session.completedHistory.length),
      decisions: decisions.length,
      certifiedCalls: certified,
      certifiedRate: decisions.length ? certified / decisions.length : null,
      searchLimitCalls: limited,
      openingMedianMs: median(opening),
      openingP95Ms: quantile(opening, 0.95),
      openingMaxMs: opening.length ? Math.max(...opening) : null,
      refillMedianMs: median(refill),
      refillP95Ms: quantile(refill, 0.95),
      refillMaxMs: refill.length ? Math.max(...refill) : null,
      totalEngineSeconds: engineMs / 1000,
      exploredBranches: explored,
      prunedBranches: pruned,
      meanEndpointT: meanT,
      meanEndpointCourtmateCoverage: meanCourtCoverage,
    };
    output.push(`| ${row.scenario} | ${engineVersion} | ${complete}/${sessions.length} (${sessions.map((s) => s.status).join(", ")}) | ${decisions.length} | ${certified}/${decisions.length} (${round(row.certifiedRate * 100, 1)}%) | ${limited} | ${round(row.openingMedianMs)} / ${round(row.openingP95Ms)} / ${round(row.openingMaxMs)} | ${round(row.refillMedianMs)} / ${round(row.refillP95Ms)} / ${round(row.refillMaxMs)} | ${round(row.totalEngineSeconds, 3)} | ${explored} / ${pruned} |`);
  }
}

output.push("", "### Matched engine outcomes", "", "| Scenario | Seed | Control status / completed | Current status / completed | Common history prefix matches | Full completed histories match |", "|---|---:|---|---|---|---|");
for (const report of reports) for (const comparison of report.validation.engineComparisons ?? []) {
  output.push(`| ${comparison.scenarioId} | ${comparison.seed} | ${comparison.controlStatus} / ${comparison.controlCompletedMatches} | ${comparison.currentStatus} / ${comparison.currentCompletedMatches} | ${comparison.commonPrefixMatches} | ${comparison.completedHistoryMatches} |`);
}

output.push("", "### Checkpoint endpoints", "", "| Scenario | Engine | Seed | Matches | Mean T | Full type coverage | Courtmate mean coverage | Fairness spread | Mean / p95 / max rest turns | Back-to-back |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const report of reports) for (const session of report.sessions) for (const checkpoint of session.checkpoints) {
  output.push(`| ${session.scenario.id} | ${session.engineVersion} | ${session.seed} | ${checkpoint.completedMatches} | ${round(checkpoint.socialVariety3211.meanT, 4)} | ${round(checkpoint.socialVariety3211.fullTypeCoverageFraction, 4)} | ${round(checkpoint.scores.structural.courtmates.meanCoverage, 4)} | ${checkpoint.fairness.countSpread} | ${round(checkpoint.rest.meanRestTurns, 2)} / ${round(checkpoint.rest.p95RestTurns, 2)} / ${checkpoint.rest.maximumRestTurns} | ${checkpoint.rest.backToBackAssignments} |`);
}

output.push("", "### Mid-session 18-player, three-court probes", "", "| Engine | Seed | Requested prefix | Observed prefix | Drained in-flight courts | Status | Search ms | Explored / pruned | Certified |", "|---|---:|---:|---:|---|---|---:|---:|---|");
for (const report of reports) for (const session of report.sessions) for (const probe of session.jointFrontierProbes) {
  output.push(`| ${session.engineVersion} | ${session.seed} | ${probe.requestedPrefix} | ${probe.observedCompletedMatches} | ${probe.drainedCourtIndexes.join(",") || "none"} (${probe.drainedCompletedMatches} drain completions) | ${probe.status} | ${round(probe.elapsedMs)} | ${probe.result.exploredBranches} / ${probe.result.prunedBranches} | ${probe.result.priorityCertified === true && probe.result.courtmateGainMaximumCertified === true} |`);
}

output.push("", `Provenance: current engine source-set SHA-256 \`${manifest.sourceProvenance.currentEngineSourcesSha256}\`; original control engine SHA-256 \`${manifest.sourceProvenance.originalControlEngineSha256}\`; harness/source-set SHA-256 \`${manifest.sourceProvenance.measurementHarnessSha256}\`. Full decision traces and raw histories are retained in the validated scenario JSON files beside this summary.`, "");
const markdown = output.join("\n");
const outputPath = valueAfter("--out", path.join(inputDir, "social-frontier-scalability-summary.md"));
writeFileSync(path.resolve(root, outputPath), markdown, "utf8");
console.log(markdown);
console.log(`\nSaved ${path.resolve(root, outputPath)}`);
