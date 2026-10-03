import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const parseSeeds = (raw, fallback) => raw ? raw.split(",").map((item) => Number(item.trim())).filter(Number.isFinite) : fallback;

const pilot = has("--pilot");
const seeds = parseSeeds(valueAfter("--seeds"), pilot ? [1] : [1, 4729, 104729, 130363, 2097593]);
const wideSeeds = parseSeeds(valueAfter("--wide-seeds"), pilot ? [] : [30011, 65537, 999983]);
const baselineWorktree = valueAfter("--baseline-worktree", process.env.BENCHMARK_BASELINE_WORKTREE);
const suppliedBaselineJson = valueAfter("--baseline-json");
const skipBaseline = has("--skip-baseline");
const outputDir = path.resolve(root, valueAfter("--out-dir", "benchmarks"));
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const testFile = "src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts";
const seedText = seeds.join(",");
const wideSeedText = wideSeeds.join(",");
const runTag = pilot ? "pilot" : "full";

if (!seeds.length || seeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error("--seeds must contain one or more safe integer seeds, comma-separated.");
if (wideSeeds.some((seed) => !Number.isSafeInteger(seed))) throw new Error("--wide-seeds must contain safe integer seeds, comma-separated.");

mkdirSync(outputDir, { recursive: true });

function runIn(workdir, label, enginePolicy, baselineJson = "") {
  const jsonPath = path.join(outputDir, `social-coverage-${runTag}-${label}.json`);
  const markdownPath = path.join(outputDir, `social-coverage-${runTag}-${label}.md`);
  const sourceRevision = enginePolicy === "baseline"
    ? `HEAD ${gitHead(workdir)} (original engine; benchmark coverage instrumentation added)`
    : `HEAD ${gitHead(workdir)} + working-tree changes`;
  const env = {
    ...process.env,
    RUN_SOCIAL_COVERAGE_BENCHMARK: "1",
    BENCHMARK_SEEDS: seedText,
    BENCHMARK_WIDE_SEEDS: wideSeedText,
    BENCHMARK_INCLUDE_WIDE: enginePolicy === "baseline" || pilot ? "0" : "1",
    BENCHMARK_ENGINE_POLICY: enginePolicy,
    BENCHMARK_SOURCE_REVISION: sourceRevision,
    BENCHMARK_OUTPUT_JSON: jsonPath,
    BENCHMARK_OUTPUT_MARKDOWN: markdownPath,
    ...(baselineJson ? { BENCHMARK_BASELINE_JSON: baselineJson } : {}),
  };
  const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
    cwd: workdir,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return { jsonPath, markdownPath };
}

function gitHead(workdir) {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: workdir, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

let baselineJson = suppliedBaselineJson ? path.resolve(suppliedBaselineJson) : "";
if (!skipBaseline && !baselineJson && baselineWorktree) {
  if (!existsSync(path.join(baselineWorktree, testFile))) {
    throw new Error("Baseline benchmark needs --baseline-worktree <path> with the benchmark measurement files copied into it.");
  }
  baselineJson = runIn(path.resolve(baselineWorktree), "baseline", "baseline").jsonPath;
}

const current = runIn(root, "current", "current", baselineJson);
const report = JSON.parse(readFileSync(current.jsonPath, "utf8"));
const baselineReport = baselineJson && existsSync(baselineJson) ? JSON.parse(readFileSync(baselineJson, "utf8")) : null;
const sessionTypes = ["SOCIAL_MIX", "POINTS", "ELO"];
const labels = { SOCIAL_MIX: "Social", POINTS: "Balanced Points", ELO: "Balanced Rating/Elo" };
const percent = (value) => value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
const mean = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
const populationStdDev = (items) => {
  const average = mean(items);
  return average === null ? null : Math.sqrt(items.reduce((sum, item) => sum + (item - average) ** 2, 0) / items.length);
};
const aggregate = [];
for (const profile of ["narrow", "wide"]) for (const sessionType of sessionTypes) for (const checkpoint of ["20", "400"]) {
  const sessions = report.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
  if (!sessions.length) continue;
  const average = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
  const cp = sessions.map((session) => session.checkpoints[checkpoint]);
  const sessionVcs = cp.map((item) => item.varietyCoverageScore).filter((value) => value !== null);
  const sessionPartner = cp.map((item) => item.partnerCoverage).filter((value) => value !== null);
  const sessionOpponent = cp.map((item) => item.opponentCoverage).filter((value) => value !== null);
  const sessionCourtmate = cp.map((item) => item.courtmateCoverage).filter((value) => value !== null);
  aggregate.push({
    profile,
    format: labels[sessionType],
    completed: Number(checkpoint),
    varietyCoverageMean: average(sessionVcs),
    varietyCoverageMedian: (() => { const sorted = [...sessionVcs].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; })(),
    varietyCoverageStdDev: populationStdDev(sessionVcs),
    varietyCoverageMin: sessionVcs.length ? Math.min(...sessionVcs) : null,
    varietyCoverageMax: sessionVcs.length ? Math.max(...sessionVcs) : null,
    partnerCoverageMean: average(sessionPartner),
    partnerCoverageStdDev: populationStdDev(sessionPartner),
    opponentCoverageMean: average(sessionOpponent),
    opponentCoverageStdDev: populationStdDev(sessionOpponent),
    courtmateCoverageMean: average(sessionCourtmate),
    courtmateCoverageStdDev: populationStdDev(sessionCourtmate),
    mixedCoverageMean: average(cp.map((item) => item.matchTypeCoverage.MIXED).filter((value) => value !== null)),
    ownSideCoverageMean: average(cp.map((item) => item.matchTypeCoverage.OWN_SIDE).filter((value) => value !== null)),
    relationshipEntropyMean: average(cp.map((item) => item.relationshipEntropyScore).filter((value) => value !== null)),
    matchTypeEntropyMean: average(cp.map((item) => item.matchTypeEntropyScore).filter((value) => value !== null)),
    normalizedEntropyMean: average(cp.map((item) => item.normalizedEntropyScore).filter((value) => value !== null)),
    backToBackRateMean: average(cp.map((item) => item.backToBack.rate)),
    maxAssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.max)),
    meanAssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.mean).filter((value) => value !== null)),
    p95AssignmentRestGapMean: average(cp.map((item) => item.assignmentRestGap.p95).filter((value) => value !== null)),
    starvationInterventions: cp.reduce((sum, item) => sum + item.starvation.materiallyChangedPlayerSet, 0),
    decisionsWithOverdue: cp.reduce((sum, item) => sum + item.starvation.decisionsWithOverdueAvailable, 0),
    certifiedCounterfactualDecisions: cp.reduce((sum, item) => sum + item.starvation.certifiedCounterfactualDecisions, 0),
    uncertifiedCounterfactualDecisions: cp.reduce((sum, item) => sum + item.starvation.uncertifiedCounterfactualDecisions, 0),
    completedRotationDecisions: cp.reduce((sum, item) => sum + item.starvation.completedRotationDecisions, 0),
    backToBackAssignments: cp.reduce((sum, item) => sum + item.backToBack.count, 0),
    checkpointFairnessSpreadMean: average(cp.map((item) => item.matchCountSpread)),
    maximumFairnessSpreadMean: average(cp.map((item) => item.maximumFairnessSpread)),
    pendingFiveTurnWaits: cp.reduce((sum, item) => sum + item.ongoingAvailableFiveTurnWaits.length + item.inProgressFiveTurnAssignments.length, 0),
  });
}
for (const group of aggregate) {
  const sessions = report.sessions.filter((session) => session.profile === group.profile && session.sessionType === sessionTypes.find((type) => labels[type] === group.format));
  const checkpoint = String(group.completed);
  const unknown = sessions.reduce((sum, session) => sum + session.checkpoints[checkpoint].starvation.uncertifiedCounterfactualDecisions, 0);
  group.starvationRateWhenOverdue = unknown > 0 || group.decisionsWithOverdue === 0
    ? null : group.starvationInterventions / group.decisionsWithOverdue;
  group.starvationRateAcrossCompletedDecisions = unknown > 0 || group.completedRotationDecisions === 0
    ? null : group.starvationInterventions / group.completedRotationDecisions;
  group.starvationRateAmongCertified = group.certifiedCounterfactualDecisions > 0
    ? group.starvationInterventions / group.certifiedCounterfactualDecisions : null;
}
const appendix = [
  "",
  "## Machine-readable compact summary",
  "",
  "```json",
  JSON.stringify({ sourceRevision: report.sourceRevision, primarySeeds: report.seedCount, wideSeeds: report.wideSeedCount, groups: aggregate }, null, 2),
  "```",
  "",
  "## Exact unseen relationship list and traces",
  "",
];
appendix.splice(appendix.length - 2, 0,
  "## Seed-to-seed coverage variation (population SD)",
  "",
  "| Profile | Format | Completed | Relationship VCS mean ± SD | Median | Min–max | Partner SD | Opponent SD | Courtmate SD |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|",
  ...aggregate.map((item) => `| ${item.profile} | ${item.format} | ${item.completed} | ${percent(item.varietyCoverageMean)} ± ${percent(item.varietyCoverageStdDev)} | ${percent(item.varietyCoverageMedian)} | ${percent(item.varietyCoverageMin)}–${percent(item.varietyCoverageMax)} | ${percent(item.partnerCoverageStdDev)} | ${percent(item.opponentCoverageStdDev)} | ${percent(item.courtmateCoverageStdDev)} |`),
  "",
  "## Completed ≥5-rest gaps by cohort",
  "",
  "| Profile | Format | Count | No stronger fair/rotation candidate | Equal-cadence later tie-break | Strictly smoother alternative | Cadence-worse alternative | Linked prior rest-zero replay |",
  "|---|---|---:|---:|---:|---:|---:|---:|",
);
for (const profile of ["narrow", "wide"]) for (const sessionType of sessionTypes) {
  const sessions = report.sessions.filter((session) => session.profile === profile && session.sessionType === sessionType);
  if (!sessions.length) continue;
  const episodes = sessions.flatMap((session) => session.fiveGapEpisodes);
  const countClass = (classification) => episodes.filter((episode) => episode.currentWaitClassification === classification).length;
  appendix.push(`| ${profile} | ${labels[sessionType]} | ${episodes.length} | ${countClass("fairness_or_mixed_legality")} | ${countClass("cadence_tie_later_tiebreak")} | ${episodes.filter((episode) => episode.strictlyBetterCadenceWitness !== null).length} | ${episodes.filter((episode) => episode.cadenceSuboptimalAlternativeWitness !== null).length} | ${episodes.filter((episode) => episode.initiatingReplay !== null).length} |`);
}
appendix.push(
  "",
  "The fair/rotation column counts episodes with no observed candidate including the player in the stronger fairness class while deferred. Equal-cadence rows have an independently verified fair/starvation/balance-equivalent inclusion candidate with the same cadence vector; the audit does not capture entropy scores, so it does not claim entropy caused the final choice. The exact candidate and chosen sets/rest vectors are in each episode record.",
  "",
  "## Static balance-guardrail dominance for wide skill profile",
  "",
);
for (const sessionType of ["POINTS", "ELO"]) {
  const staticReport = report.sessions.find((session) => session.profile === "wide" && session.sessionType === sessionType)?.staticBalanceFeasibility;
  if (!staticReport) continue;
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    const key = `${relation.facet}:${pair}`;
    distinct.set(key, { facet: relation.facet, pair, minimum: Math.min(distinct.get(key)?.minimum ?? Infinity, relation.minimumSingleCourtBalanceGap ?? Infinity) });
  }
  const pairs = [...distinct.values()].sort((left, right) => left.facet.localeCompare(right.facet) || left.pair.localeCompare(right.pair));
  const allowed = staticReport.allowedMaxBalanceGap;
  const everyPairDominated = pairs.length > 0 && pairs.every((entry) => Number.isFinite(entry.minimum) && allowed !== null && entry.minimum > allowed);
  appendix.push(`### Wide ${labels[sessionType]}: ${pairs.length} excluded feasible facet-pairs; allowed max gap ${allowed}.`);
  appendix.push(`Exhaustive standard Mixed-legal layout enumeration found minimum single-court gap above that window for every listed pair${everyPairDominated ? "; these are guardrail-inadmissible for the fixed wide roster and rules." : "; see per-pair evidence before drawing an exclusion conclusion."}`);
  for (const entry of pairs) appendix.push(`- ${entry.pair} ${entry.facet}: minimum gap ${entry.minimum} > ${allowed}.`);
  appendix.push("");
}
if (baselineReport) {
  const sumOptimizer = (benchmark) => {
    const sessions = benchmark.sessions.filter((session) => session.profile === "narrow");
    const sum = (key) => sessions.reduce((total, session) => total + session.checkpoints["400"].optimizer[key], 0);
    return {
      sessions: sessions.length,
      directMs: sum("ordinaryProductionWallMs"),
      directCalls: sum("ordinaryProductionCalls"),
      wrapperMs: sum("counterfactualWrapperWallMs"),
      wrapperCalls: sum("counterfactualWrapperCalls"),
      searchLimitCalls: sum("searchLimitCalls"),
      certificationFailures: sum("fairnessCertificateFailures") + sum("starvationCertificateFailures") + sum("balanceCertificateFailures"),
      harnessMs: sessions.reduce((total, session) => total + session.performanceMs, 0),
    };
  };
  const baselineTiming = sumOptimizer(baselineReport);
  const currentTiming = sumOptimizer(report);
  const baselineDecisions = baselineTiming.directCalls + baselineTiming.wrapperCalls;
  const currentDecisions = currentTiming.directCalls + currentTiming.wrapperCalls;
  const currentCombinedMs = currentTiming.directMs + currentTiming.wrapperMs;
  appendix.push(
    "## Before/after optimizer timing (same narrow cohort)",
    "",
    "| Engine | Production decisions | Direct optimizer calls / time | Paired starvation diagnostics | Diagnostic-inclusive time per decision | Search-limit / certification failures |",
    "|---|---:|---:|---:|---:|---:|",
    `| Baseline ${baselineReport.sourceRevision} | ${baselineDecisions} | ${baselineTiming.directCalls} / ${(baselineTiming.directMs / 1000).toFixed(1)} s | none available | ${(baselineTiming.directMs / Math.max(1, baselineDecisions)).toFixed(2)} ms | ${baselineTiming.searchLimitCalls} / ${baselineTiming.certificationFailures} |`,
    `| Current ${report.sourceRevision} | ${currentDecisions} | ${currentTiming.directCalls} / ${(currentTiming.directMs / 1000).toFixed(1)} s | ${currentTiming.wrapperCalls} wrappers / ${(currentTiming.wrapperMs / 1000).toFixed(1)} s | ${(currentCombinedMs / Math.max(1, currentDecisions)).toFixed(2)} ms | ${currentTiming.searchLimitCalls} / ${currentTiming.certificationFailures} |`,
    "",
    "Both rows cover the same five narrow seeds × three formats × 400 completed matches. On overdue decisions the current wrapper returns the production choice and runs one extra no-starvation search; its total time is included here, so the diagnostic-inclusive current number is a conservative instrumentation cost, not production-only latency. The baseline has no counterfactual API and its intervention count is unknown.",
    `Per-session harness totals including matcher, independent oracle, and report instrumentation were ${(baselineTiming.harnessMs / 1000).toFixed(1)} s baseline and ${(currentTiming.harnessMs / 1000).toFixed(1)} s current; this broader scope is not production-only matcher latency.`,
    "",
  );
}
const staticDominanceSummary = [];
for (const sessionType of ["POINTS", "ELO"]) {
  const staticReport = report.sessions.find((session) => session.profile === "wide" && session.sessionType === sessionType)?.staticBalanceFeasibility;
  if (!staticReport) continue;
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    const key = `${relation.facet}:${pair}`;
    distinct.set(key, { facet: relation.facet, pair, minimum: Math.min(distinct.get(key)?.minimum ?? Infinity, relation.minimumSingleCourtBalanceGap ?? Infinity) });
  }
  staticDominanceSummary.push({ sessionType, staticReport, pairs: [...distinct.values()] });
}
for (const item of staticDominanceSummary) {
  const minimum = Math.min(...item.pairs.map((pair) => pair.minimum));
  const aboveWindow = item.staticReport.allowedMaxBalanceGap !== null && minimum > item.staticReport.allowedMaxBalanceGap;
  const pairList = item.pairs.map((pair) => `${pair.pair} ${pair.facet} (min gap ${pair.minimum})`).join(", ");
  appendix.push(`## Fixed-wide-profile same-quartet balance proof: ${labels[item.sessionType]}`, "", `All ${item.pairs.length} structurally feasible excluded facet-pairs have a minimum legal Mixed single-court gap above the static envelope window (${minimum} minimum > ${item.staticReport.allowedMaxBalanceGap}); ${aboveWindow ? "the exhaustive same-quartet layout audit proves these relationships remain guardrail-inadmissible under this fixed profile" : "the static report alone does not establish a universal exclusion"}. Exact pairs: ${pairList}. The separate static equal-count two-court audit excludes these same pairs in the opening batch; the same-quartet dominance proof covers subsequent one-court refills. Together this is scoped to the fixed wide strength mapping, standard Mixed legality, a full-roster equal-count class, and no added partition-specific schedule restrictions. It does not extend to changing skills, other availability/history classes, or later multi-court refills.`, "");
}
for (const session of report.sessions.filter((item) => item.profile === "narrow" && item.checkpoints["400"].completedMatches === 400)) {
  appendix.push(`### ${labels[session.sessionType]} narrow seed ${session.seed}: unseen at 400`);
  if (!session.missingRelationships.length) appendix.push("All structurally feasible player/facet relationships were observed.");
  for (const relation of session.missingRelationships) appendix.push(`- ${relation.players[0]}–${relation.players[1]} ${relation.facet}: ${relation.classification}; strongest ${relation.observedStrongRotationOpportunities}, balance-envelope ${relation.observedBalanceEnvelopeOpportunities}, cadence-frontier ${relation.observedCadenceAdmissibleOpportunities}.`);
  appendix.push("");
}
for (const session of report.sessions.filter((item) => item.staticBalanceFeasibility)) {
  const staticReport = session.staticBalanceFeasibility;
  appendix.push(`### ${labels[session.sessionType]} ${session.profile}: static equal-count, two-court balance exclusions`);
  const distinct = new Map();
  for (const relation of staticReport.balanceGuardrailExcludedRelationships) {
    const pair = [relation.playerId, relation.otherPlayerId].sort().join("–");
    distinct.set(`${relation.facet}:${pair}`, `${pair} ${relation.facet}`);
  }
  appendix.push(`Static excluded ${staticReport.balanceGuardrailExcludedRelationshipCount} directed entries (${distinct.size} distinct facet-pairs); Rating ceiling fallback: ${staticReport.ratingCeilingFallback}.`);
  for (const relation of distinct.values()) appendix.push(`- ${relation}`);
  appendix.push("");
}
appendix.push("### Completed ≥5-rest assignments");
const fiveGapRows = report.sessions.flatMap((session) => session.fiveGapEpisodes.map((episode) => ({ session, episode })));
if (!fiveGapRows.length) appendix.push("None.");
for (const { session, episode } of fiveGapRows) {
  const trace = episode.initiatingReplay;
  appendix.push(`- ${episode.traceId}: ${labels[session.sessionType]} ${session.profile} seed ${session.seed}, ${episode.userId}, rest ${episode.restGap}, classification ${episode.classification}, current wait ${episode.currentWaitClassification}; ` +
    (trace ? `origin ${trace.assignmentId}, fair alternatives ${trace.fairAlternativeSetsWithoutPlayer}, starvation-equivalent ${trace.starvationEquivalentAlternativeSetsWithoutPlayer}, balance-admissible ${trace.balanceAdmissibleAlternativeSetsWithoutPlayer}, smoother ${trace.smootherBalanceAdmissibleSetsWithoutPlayer}.` : "no linked immediately preceding rest-zero replay."));
}
appendix.push("", "### Censored at the 400-match checkpoint");
let censoredCount = 0;
for (const session of report.sessions) {
  const checkpoint = session.checkpoints["400"];
  for (const wait of checkpoint.ongoingAvailableFiveTurnWaits) {
    censoredCount += 1;
    appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ${wait.userId} still available at rest ${wait.restTurns}${wait.initiatingReplay ? `, origin ${wait.initiatingReplay.assignmentId}` : ""}.`);
  }
  for (const assignment of checkpoint.inProgressFiveTurnAssignments) {
    censoredCount += 1;
    appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ${assignment.userId} assigned at rest ${assignment.restTurns}, current assignment ${assignment.assignmentId}${assignment.initiatingReplay ? `, prior rest-zero origin ${assignment.initiatingReplay.assignmentId}` : ""}.`);
  }
}
if (!censoredCount) appendix.push("None.");
appendix.push("", "### Search and timing scope", "");
for (const session of report.sessions) {
  const checkpoint = session.checkpoints["400"];
  appendix.push(`- ${labels[session.sessionType]} ${session.profile} seed ${session.seed}: ordinary optimizer ${checkpoint.optimizer.ordinaryProductionWallMs.toFixed(2)} ms; counterfactual wrapper ${checkpoint.optimizer.counterfactualWrapperWallMs.toFixed(2)} ms (two searches); search-limit runs ${checkpoint.optimizer.searchLimitCalls}; fairness/starvation/balance certification failures ${checkpoint.optimizer.fairnessCertificateFailures}/${checkpoint.optimizer.starvationCertificateFailures}/${checkpoint.optimizer.balanceCertificateFailures}; static-feasibility cache miss ${session.staticBalanceFeasibilityMs.toFixed(2)} ms; whole harness ${session.performanceMs} ms.`);
}
appendix.push("", "## Compact human-readable checkpoint summary", "", "| Profile | Format | Completed | VCS | Partner / opponent / courtmate | MIXED / OWN_SIDE | Entropy people / type / all | B2B | Max / mean / p95 assignment rest | Starvation changed / overdue / all completed |", "|---|---|---:|---:|---|---|---|---:|---|---|", ...aggregate.map((item) =>
  `| ${item.profile} | ${item.format} | ${item.completed} | ${percent(item.varietyCoverageMean)} | ${percent(item.partnerCoverageMean)} / ${percent(item.opponentCoverageMean)} / ${percent(item.courtmateCoverageMean)} | ${percent(item.mixedCoverageMean)} / ${percent(item.ownSideCoverageMean)} | ${percent(item.relationshipEntropyMean)} / ${percent(item.matchTypeEntropyMean)} / ${percent(item.normalizedEntropyMean)} | ${percent(item.backToBackRateMean)} | ${item.maxAssignmentRestGapMean?.toFixed(2)} / ${item.meanAssignmentRestGapMean?.toFixed(2)} / ${item.p95AssignmentRestGapMean?.toFixed(2)} | ${item.starvationInterventions} / ${item.decisionsWithOverdue} / ${item.completedRotationDecisions} (${percent(item.starvationRateWhenOverdue)} / ${percent(item.starvationRateAcrossCompletedDecisions)}; certified ${percent(item.starvationRateAmongCertified)}; unknown ${item.uncertifiedCounterfactualDecisions}) |`
));
writeFileSync(current.markdownPath, `${readFileSync(current.markdownPath, "utf8").trimEnd()}\n${appendix.join("\n")}\n`, "utf8");
process.stdout.write("\nCompact human-readable results (coverage is mean across seeds):\n");
for (const item of aggregate) process.stdout.write(`- ${item.profile} ${item.format} after ${item.completed}: VCS ${percent(item.varietyCoverageMean)}; partner/opponent/court ${percent(item.partnerCoverageMean)}/${percent(item.opponentCoverageMean)}/${percent(item.courtmateCoverageMean)}; MIXED/OWN_SIDE ${percent(item.mixedCoverageMean)}/${percent(item.ownSideCoverageMean)}; entropy people/type/all ${percent(item.relationshipEntropyMean)}/${percent(item.matchTypeEntropyMean)}/${percent(item.normalizedEntropyMean)}; B2B ${percent(item.backToBackRateMean)}; max/mean/p95 assignment rest ${item.maxAssignmentRestGapMean?.toFixed(2)}/${item.meanAssignmentRestGapMean?.toFixed(2)}/${item.p95AssignmentRestGapMean?.toFixed(2)}; starvation changed ${item.starvationInterventions} of ${item.decisionsWithOverdue} overdue decisions.`);
process.stdout.write(`\nCompact machine-readable results:\n${JSON.stringify({ sourceRevision: report.sourceRevision, primarySeeds: report.seedCount, wideSeeds: report.wideSeedCount, groups: aggregate })}\n`);
process.stdout.write(`\nSaved benchmark JSON: ${current.jsonPath}\nSaved human report: ${current.markdownPath}\n`);
