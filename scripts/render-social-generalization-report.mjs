import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const defaultInput = "benchmarks/generated/social-generalization/full-2026-10-06-v1/summary.json";
const defaultOutput = "docs/social-beneficial-rescue-generalization.md";
if (args.includes("--help")) {
  console.log(`Usage: node scripts/render-social-generalization-report.mjs [summary.json] [output.md]\n\nReads the validated aggregate from scripts/summarize-social-generalization.mjs and writes the Markdown report plus an adjacent checkpoint-metrics.csv. Defaults:\n  input:  ${defaultInput}\n  output: ${defaultOutput}`);
  process.exit(0);
}

const inputPath = path.resolve(args[0] ?? defaultInput);
const outputPath = path.resolve(args[1] ?? defaultOutput);
const summary = JSON.parse(readFileSync(inputPath, "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(summary.schemaVersion === "social-generalization-summary-v1", "Unsupported Social generalization summary schema.");
assert(Array.isArray(summary.scenarios) && Array.isArray(summary.aggregates) && Array.isArray(summary.sessionMetrics), "Summary is missing scenario metrics.");
assert(Array.isArray(summary.failures) && Array.isArray(summary.events) && Array.isArray(summary.allCosts), "Summary is missing audit rows.");

const labelArm = (arm) => arm === "production" ? "Production" : "Beneficial rescue";
const fmt = (value, digits = 3) => value === null || value === undefined || !Number.isFinite(value) ? "—" : Number(value).toFixed(digits);
const pct = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(100 * value).toFixed(digits)}%`;
const ratio = (part, whole) => whole ? `${part}/${whole}` : "not structurally feasible";
const localLink = (label, file) => `[${label}](${path.resolve(file)})`;
const aggregate = (scenarioId, horizon, arm) => summary.aggregates.find((row) => row.scenarioId === scenarioId && row.horizon === horizon && row.arm === arm);
const hasData = (agg) => Boolean(agg && agg.samples > 0);
const scenarioName = (scenario) => `${scenario.id} (${scenario.initialUpper}/${scenario.initialLower}, ${scenario.courtCount} court${scenario.courtCount === 1 ? "" : "s"})`;
const table = (headers, rows) => [
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ") } |`,
  ...rows.map((row) => `| ${row.map((value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ")} |`),
].join("\n");
const bothType = (agg) => hasData(agg) ? ratio(agg.totals.bothTypeCovered, agg.totals.bothTypeEligible) : "not achieved";
const matchTypes = (agg) => hasData(agg) ? `${agg.totals.mixedMatches}/${agg.totals.ownSideMatches}` : "not achieved";
const horizonPairs = (scenario) => [scenario.shortHorizonMatches, ...(scenario.longDiagnostic ? [100] : [])];

function exactCompletedBenefit(costs) {
  const gcd = (left, right) => { let a = left < 0n ? -left : left, b = right; while (b) [a, b] = [b, a % b]; return a || 1n; };
  let numerator = 0n, denominator = 1n;
  for (const cost of costs.filter((entry) => entry.completed)) {
    if (cost.conditionalTUnits === null || cost.conditionalTUnits === undefined || !cost.rollingTypeDenominator) continue;
    const nextNumerator = BigInt(cost.conditionalTUnits), nextDenominator = BigInt(cost.rollingTypeDenominator);
    const common = gcd(denominator, nextDenominator);
    numerator = numerator * (nextDenominator / common) + nextNumerator * (denominator / common);
    denominator *= nextDenominator / common;
    const reduce = gcd(numerator, denominator);
    numerator /= reduce;
    denominator /= reduce;
  }
  return `${numerator}/${denominator}`;
}

const csvPath = outputPath.replace(/\.md$/i, "-checkpoint-metrics.csv");
const csvColumns = [
  "scenarioId", "seed", "arm", "completedMatches", "playerCount", "countSpread", "countDistribution",
  "averageCourtmates", "minimumCourtmates", "meanCourtmateCoverage", "worstCourtmateCoverage", "uniqueCourtmatePairs",
  "fullyCoveredCourtmatePlayers", "feasibleCourtmatePairs", "meanT", "fullTypeCoverageFraction", "bothTypeEligible", "bothTypeCovered", "oneTypePlayers", "activeCountSpread", "effectiveActiveCountSpread",
  "mixedMatches", "ownSideMatches", "longestSingleTypeRun", "backToBackCount", "returningAssignments", "backToBackRate",
  "meanRest", "p95Rest", "maximumRest", "longestCompletionGap", "starvationInterventions", "averagePartners",
  "averageOpponents", "partnerEntropy", "opponentEntropy", "attemptedDecisions", "completedDecisions", "pendingDecisions",
  "fairnessCertificateFailures", "starvationCertificateFailures", "engineSearchLimitDecisions", "independentAuditIncomplete",
  "independentAuditInvalid", "onePairConcessions", "conditionalTypeBenefit", "extraBothTypeWindows", "opportunityPlayerCount",
  "opportunityMeanT", "firstFullCourtmate", "lateMeanT", "lateBothCoverage",
];
const csvCell = (value) => {
  if (value === null || value === undefined) return '"N/A"';
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};
writeFileSync(csvPath, [csvColumns.join(","), ...summary.sessionMetrics.map((row) => csvColumns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n");

const allCostRows = summary.allCosts;
const sections = [];
sections.push(`# Social generalization audit: courtmate-beneficial rescue\n\n` +
  `**Decision:** the candidate is not ready to become the production default. Six of 48 candidate sessions failed to return an opening selection under the matcher’s default search budget; production completed all 48. Keep the candidate opt-in while the frontier search limitation is addressed and revalidated.\n\n` +
  `The candidate completed 2,214 matches and 2,178 decisions across reached sessions. It made 55 completed one-pair concessions (2.525% of completed decisions), with aggregate conditional signed benefit of 35 T and 70 additional or preserved both-type windows. No completed concession had zero or negative conditional benefit. All six candidate failures occurred before the first assignment in the 16-player/two-court and 18-player/three-court scenarios (three seeds each). Production completed those sessions. A proposed follow-up is to improve frontier proof/pruning or schedule refill after both courts clear; neither correction is implemented here.\n\n` +
  `Report input: ${localLink(path.relative(process.cwd(), inputPath), inputPath)}. Detailed seed/checkpoint values: ${localLink("checkpoint-metrics.csv", csvPath)}.`);

sections.push(`## Scenario-specific interpretation\n\n` +
  `At all 14 short checkpoints the candidate reached, its average courtmate breadth matched or exceeded production. Gains were modest at 8/6 (10.857→10.952) and larger at 12 players/two courts (5.778→7.222), where recent both-type coverage also rose from 2/36 to 32/36. This comes with more immediate replay in several short sessions: at 8/6, back-to-back assignments rose from 22.07% to 30.63%. Opponent breadth often fell in the 14-player cases. Similar mean rest therefore does not establish improvement in every rest or relationship measure.\n\n` +
  `The ten-player/two-court 5/5 scenario demonstrates that more courtmate coverage does not imply type recurrence. All three candidate seeds played only MIXED for 100 matches, so T stayed at 0.5. Production also averaged T=0.5, but one seed played only OWN_SIDE and reached four distinct courtmates per player; the candidate counterpart played only MIXED and reached nine.\n\n` +
  `After one MIXED court completes while the other remains busy, only 3 upper and 3 lower players are available: neither side can supply four players for OWN_SIDE. A MIXED refill restores the same state. An upper/lower OWN_SIDE opening instead leaves a 5/1 refill pool, forcing OWN_SIDE again. Both types remain structurally feasible in the full 5/5 roster. With one court, all ten players become available after each completion; every tested seed used 11 MIXED and 4 OWN_SIDE matches by the 15-match checkpoint.\n\n` +
  `In the 9/5 fixed-roster scenario, short-horizon both-type window coverage is 92.86% for the candidate versus production's 95.24%. In the 8/6 scenario, both arms have complete both-type coverage at the short checkpoint; at 100 the candidate is 97.62% and production is 100%. The candidate therefore does not improve this measure in every tested cohort.\n\n` +
  `For the played-departure-as-pause scenario, both arms cover all 78 unordered courtmate pairs among the 13 nonpaused players in all three seeds by 100. Full-roster mean C is 12.095 for production and 11.952 for the candidate because the paused player's possible pairs remain in the structural vocabulary; this is not surviving-player breadth failure. Candidate lower-side players can nevertheless remain at T=0.5 because the paused fourth lower-side player is needed to make OWN_SIDE feasible. Seed 4729 selected P13 at decision 92, after 91 matches: P13 was the only eligible lower-side player in decisions 83–91 while P11/P12 were busy and P14 was paused; upper-side OWN_SIDE was the only legal refill, and P13 was selected as soon as the other reservation cleared. This reflects the safety/availability constraints, not a starvation-certificate failure. A separate permanent-departure structural state would require a model change; none is implemented.\n\n` +
  `The all-one-side eight-player/two-court scenario has only OWN_SIDE as a feasible type. Both policies reach T=1, but play settles into fixed four-player cohorts with mean C=3 of 7, zero rest, and a 100% back-to-back rate. The beneficial rescue is inactive because there is no second feasible type. The longest assignment rest observed overall is 13, in seed 4729 under both arms during the indefinite-pause scenario; paused players do not accrue rest turns.`);

sections.push(`## Proposed follow-up, not implemented\n\n` +
  `1. Add generic frontier upper bounds and pruning that can certify the courtmate ceiling without weakening the signed-T guard or fairness/starvation ordering.\n` +
  `2. Evaluate a joint refill option that waits until both courts are clear before rebuilding a multi-court batch. This may restore type choice in opening states, with a possible tradeoff in court idle time and assignment latency.\n` +
  `3. Model permanent departure explicitly if the product needs departed players removed from structural opportunities. A pause is not departure and must continue to retain roster history and structural feasibility.`);

sections.push(`## Method and metric definitions\n\n` +
  `Short horizons use \`round(1.5 × player count)\` completed matches, which is six personal appearances per player on average because each match has four players. Selected long diagnostics end at 100 completed matches. There are three deterministic seeds per scenario, identical under production and candidate, with stable player strengths and asynchronous court completions. Completed-match count—not elapsed wall time—sets the horizon. Both these histories and the canonical reference omit completed timestamps, so time-based rematch penalties were not exercised; encounter-frequency and entropy ties remained active.\n\n` +
  `**C** reports distinct feasible courtmates per player and coverage against that player's structural courtmate set. **T** is the share of each player's feasible match types represented in their latest six completed personal appearances. A 5:1 and 3:3 type window both earn full T; there is no target ratio, quota, debt, or 50/50 requirement. Temporary busy/rest status does not shrink structural feasibility. Paused players remain in the structural roster and retain their history. Production opportunity metrics exclude paused players; candidate structural metrics keep them.\n\n` +
  `The engine preserves count/arrival-priority fairness, schedule and starvation safety before optimizing coverage. Arrival matchmaking credit is neutralized against active roster members; it does not grant aggressive catch-up. Count spread over the full roster, active spread excluding paused players, and effective active spread incorporating neutral credit are reported separately. Count spread and certification failures are distinct. A one-pair cost is exactly \`Gmax − chosen gain = 1\`; only a fully completed batch counts as completed cost. Conditional benefit compares chosen signed ΔT with the best full-Gmax signed ΔT from the same decision state and safety class. The independent scenario and audit suites include side-label symmetry and structural-feasibility checks.`);

sections.push(`## Structural feasibility and denominators\n\n` +
  `MIXED needs at least two players of each side. OWN_SIDE needs at least four players of that player's side. Each player's T denominator is the number of structurally feasible types (one or two), not the number available for the current refill. C coverage divides by that player's feasible peers; pair denominators are built from those opportunities.\n\n` + table(
    ["Structural roster", "UPPER feasible types / T denominator", "LOWER feasible types / T denominator", "C peers per player / feasible pairs"],
    [
      ["10: 5/5", "MIXED + OWN_SIDE / 2", "MIXED + OWN_SIDE / 2", "9 / 45"],
      ["12: 6/6", "MIXED + OWN_SIDE / 2", "MIXED + OWN_SIDE / 2", "11 / 66"],
      ["14: 7/7, 8/6, 9/5, 10/4", "MIXED + OWN_SIDE / 2", "MIXED + OWN_SIDE / 2", "13 / 91"],
      ["16: 8/8", "MIXED + OWN_SIDE / 2", "MIXED + OWN_SIDE / 2", "15 / 120"],
      ["18: 9/9", "MIXED + OWN_SIDE / 2", "MIXED + OWN_SIDE / 2", "17 / 153"],
      ["14: 11/3", "MIXED + OWN_SIDE / 2", "MIXED / 1", "13 / 91"],
      ["8: 8/0", "OWN_SIDE / 1", "No LOWER players", "7 / 28"],
      ["6: 3/3", "MIXED / 1", "MIXED / 1", "5 / 15"],
      ["13: 10/3 before genuine join", "MIXED + OWN_SIDE / 2", "MIXED / 1", "12 / 78"],
    ],
  ) + `\n\nThe 10/3→10/4 join changes existing lower players' T denominator from one to two. The 12→14 arrival changes C denominators from 11 to 13 and pair opportunities from 66 to 91; existing encounter counts remain unchanged. Pauses retain the full structural vocabulary and personal completed history. During indefinite pause, production's separate 13-player opportunity vocabulary treats the three active lower players as MIXED-only; the candidate retains the 14-player vocabulary because the session model has no distinct played-player departure state. See ${localLink("roster semantics and source evidence", "docs/social-roster-semantics.md")}.\n\nGlobal side-label reversal preserves MIXED/OWN_SIDE legality, feasible peer sets, and scores when IDs, strengths, fairness state, and history are mirrored consistently. Seeded mirror tests confirmed equivalent production and candidate selections and G/T profiles. Full mirrored cohorts were therefore omitted; there is no side-specific scoring bonus in this experiment.`);

sections.push(`## Primary short-horizon comparison\n\n` + table(
  ["Scenario (side split / courts)", "Horizon", "Reached seeds, candidate", "Mean C: production → candidate", "Mean T: production → candidate", "Both-type T=1: production → candidate", "MIXED / OWN_SIDE totals: production → candidate"],
  summary.scenarios.map((scenario) => {
    const horizon = scenario.shortHorizonMatches, production = aggregate(scenario.id, horizon, "production"), candidate = aggregate(scenario.id, horizon, "courtmate-beneficial-rescue");
    return [scenarioName(scenario), horizon, `${candidate?.samples ?? 0}/${summary.seeds.length}`,
      `${hasData(production) ? fmt(production.means.averageCourtmates) : "not achieved"} → ${hasData(candidate) ? fmt(candidate.means.averageCourtmates) : "not achieved"}`,
      `${hasData(production) ? fmt(production.means.meanT, 4) : "not achieved"} → ${hasData(candidate) ? fmt(candidate.means.meanT, 4) : "not achieved"}`,
      `${bothType(production)} → ${bothType(candidate)}`, `${matchTypes(production)} → ${matchTypes(candidate)}`];
  }),
));

sections.push(`## Unachieved endpoints\n\n` +
  `Missing candidate endpoints are not zero-valued measurements. All six candidate failures occurred at zero completed matches; the corresponding production sessions completed.\n\n` + table(
    ["Scenario", "Seed", "Arm", "Completed matches", "Stop reason", "Search limit reached", "Audit status"],
    summary.failures.map((failure) => [failure.scenarioId, failure.seed, labelArm(failure.arm), failure.completedMatches,
      failure.stopReason, failure.lastEngineProof?.searchLimitReached, failure.lastAudit]),
  ));

sections.push(`## Breadth and secondary relationship quality\n\n` + table(
  ["Scenario", "Arm", "Horizon", "Mean C coverage", "Mean minimum C", "Worst-player C coverage", "Unique C pairs / feasible", "Players fully covered", "Mean P / O peers", "Mean P / O entropy"],
  summary.aggregates.map((a) => !hasData(a)
    ? [a.scenarioId, labelArm(a.arm), a.horizon, ...Array(7).fill("not achieved")]
    : [a.scenarioId, labelArm(a.arm), a.horizon, fmt(a.means.meanCourtmateCoverage, 4), fmt(a.means.minimumCourtmates),
    fmt(a.means.worstCourtmateCoverage, 4), `${fmt(a.means.uniqueCourtmatePairs, 2)} / ${fmt(a.means.feasibleCourtmatePairs, 2)}`,
    fmt(a.means.fullyCoveredCourtmatePlayers, 2), `${fmt(a.means.averagePartners)} / ${fmt(a.means.averageOpponents)}`,
    `${fmt(a.means.partnerEntropy, 4)} / ${fmt(a.means.opponentEntropy, 4)}`]),
));

sections.push(`## Rest, completed-count fairness, and certification\n\n` +
  `Rest summaries include the mean across assignments, mean per-seed p95, and worst observed assignment rest. Count spread includes the full roster; active spread excludes paused players, and effective active spread incorporates neutral matchmaking credit. All spread measures are outcomes and remain distinct from certificate failures.\n\n` + table(
    ["Scenario", "Arm", "Horizon", "Reached seeds", "Mean rest", "Mean per-seed p95", "Worst assignment rest", "B2B rate", "Full-roster spread mean / max", "Active spread mean / max", "Effective active spread mean / max", "Fairness cert failures", "Starvation cert failures", "Search-limit / incomplete audit"],
    summary.aggregates.map((a) => !hasData(a)
      ? [a.scenarioId, labelArm(a.arm), a.horizon, `0/${a.expectedSamples ?? summary.seeds.length}`, ...Array(10).fill("not achieved")]
      : [a.scenarioId, labelArm(a.arm), a.horizon, `${a.samples}/${a.expectedSamples ?? summary.seeds.length}`,
        fmt(a.means.meanRest), fmt(a.means.p95Rest), fmt(a.maxima?.maximumRest ?? a.means.maximumRest, 0), pct(a.means.backToBackRate, 2),
        `${fmt(a.means.countSpread, 2)} / ${fmt(a.maxima?.countSpread, 0)}`,
        `${fmt(a.means.activeCountSpread, 2)} / ${fmt(a.maxima?.activeCountSpread, 0)}`,
        `${fmt(a.means.effectiveActiveCountSpread, 2)} / ${fmt(a.maxima?.effectiveActiveCountSpread, 0)}`,
        a.totals.fairnessCertificateFailures, a.totals.starvationCertificateFailures,
        `${a.totals.engineSearchLimitDecisions} / ${a.totals.independentAuditIncomplete}`]),
  ));

const longRows = summary.aggregates.filter((a) => a.horizon === 100);
sections.push(`## Selected 100-match recurrence\n\n` + table(
  ["Scenario", "Arm", "Reached seeds", "Mean T", "T events 76–100", "Both-type coverage", "Full C reached seeds / mean first event", "Worst personal single-type run", "MIXED / OWN_SIDE", "Worst rest"],
  longRows.map((a) => !hasData(a)
    ? [a.scenarioId, labelArm(a.arm), `0/${a.expectedSamples ?? summary.seeds.length}`, ...Array(7).fill("not achieved")]
    : [a.scenarioId, labelArm(a.arm), `${a.samples}/${a.expectedSamples ?? summary.seeds.length}`,
      fmt(a.means.meanT, 4), fmt(a.means.lateMeanT, 4), pct(a.bothTypeCoverage),
      `${a.firstFullCourtmateReachedSeeds ?? 0}/${a.samples} / ${fmt(a.means.firstFullCourtmate, 1)}`,
      fmt(a.maxima?.longestSingleTypeRun ?? a.means.longestSingleTypeRun, 0), `${a.totals.mixedMatches}/${a.totals.ownSideMatches}`,
      fmt(a.maxima?.maximumRest ?? a.means.maximumRest, 0)]),
));

sections.push(`## Dynamic roster events\n\n` +
  `This table condenses repeated seed/arm event traces. Pauses preserve structural vocabulary; joins show any vocabulary change for existing or new players. Full per-seed before/after evidence remains in the raw reports.\n\n` + table(
    ["Scenario", "Event / user", "Type", "Application status", "Scheduled / applied after", "First assignment after", "Vocabulary change", "Credit change"],
    (() => {
      const groups = new Map();
      for (const event of summary.events) {
        const groupKey = `${event.scenarioId}/${event.eventIndex}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(event);
      }
      return [...groups.values()].map((events) => {
        const e = events[0];
        const changed = new Set();
        for (const event of events) {
          const before = new Map((event.structuralBefore ?? []).map((p) => [p.userId, (p.feasibleMatchTypes ?? []).join("+")]));
          const after = new Map((event.structuralAfter ?? []).map((p) => [p.userId, (p.feasibleMatchTypes ?? []).join("+")]));
          for (const id of new Set([...before.keys(), ...after.keys()])) if (before.get(id) !== after.get(id)) changed.add(`${id}:${before.get(id) ?? "new"}→${after.get(id) ?? "removed"}`);
        }
        const statuses = [...new Set(events.map((event) => event.status))].join(", ");
        const applied = [...new Set(events.map((event) => event.appliedAfterCompletedMatches).filter((value) => value !== null))].join(", ") || "not applied";
        const firstAssignment = [...new Set(events.flatMap((event) => (event.firstAssignmentAfterEvent ?? []).map((row) => `${row.userId}@${row.afterCompletedMatches}`)))].join(", ") || "not observed";
        const creditChanges = [...new Set(events.flatMap((event) => (event.matchmakingCreditChanges ?? []).map((change) => `${change.userId}:${change.priorCredit}→${change.nextCredit}`)))].join(", ") || "none";
        return [e.scenarioId, `${e.eventIndex}: ${(e.userIds ?? []).join(", ")}`, e.type, statuses,
          `${e.scheduledAfterCompletedMatches} / ${applied}`, firstAssignment, [...changed].join("; ") || "no structural vocabulary change", creditChanges];
      });
    })(),
  ));

const costSummaryRows = [];
for (const scenario of summary.scenarios) for (const horizon of horizonPairs(scenario)) {
  const agg = aggregate(scenario.id, horizon, "courtmate-beneficial-rescue");
  if (!hasData(agg)) {
    costSummaryRows.push([scenario.id, horizon, "not achieved", "not achieved", "not achieved", "not achieved", "not achieved"]);
    continue;
  }
  const completedCosts = allCostRows.filter((cost) => cost.scenarioId === scenario.id && cost.completed && cost.completedAfterMatchNumber <= horizon);
  costSummaryRows.push([scenario.id, horizon, `${completedCosts.length}/${agg.totals.completedDecisions}`,
    `${completedCosts.length} pairs`, fmt(completedCosts.reduce((total, cost) => total + (cost.conditionalT ?? 0), 0), 6),
    completedCosts.reduce((total, cost) => total + (cost.bothTypeWindowDelta ?? 0), 0),
    `${completedCosts.filter((cost) => Number(cost.conditionalTUnits) > 0).length} positive; ${completedCosts.filter((cost) => Number(cost.conditionalTUnits) === 0).length} zero; ${completedCosts.filter((cost) => Number(cost.conditionalTUnits) < 0).length} negative`]);
}
sections.push(`## Completed one-pair cost audit\n\n` +
  `A concession is counted only after the full batch completes by the checkpoint. Totals are per scenario, not pooled across changing structural denominators. The detailed 55-row decision ledger is in the linked raw summary.\n\n` + table(
    ["Scenario", "Horizon", "Completed concessions / decisions", "Pairs conceded", "Σ conditional T", "Extra/preserved both-type windows", "Positive / zero / negative conditional benefits"],
    costSummaryRows,
  ) + `\n\nOverall: ${summary.rescueAudit.completedCosts} completed concessions from ${summary.rescueAudit.executedCosts} started costs; ${summary.rescueAudit.pendingCosts} pending; exact conditional-T sum ${exactCompletedBenefit(allCostRows)} (= ${fmt(summary.rescueAudit.completedConditionalT, 6)}); ${summary.rescueAudit.completedBothTypeWindows} additional/preserved windows; zero-benefit ${summary.rescueAudit.zeroBenefitCosts}, negative-benefit ${summary.rescueAudit.negativeBenefitCosts}.`);

sections.push(`## Preserved canonical four-arm reference at 21 matches\n\n` +
  `Historical 7/7 reference from ${localLink("the beneficial-rescue experiment report", "docs/social-courtmate-beneficial-rescue-experiment.md")}. These values are context only, not pooled with the generalization scenarios.\n\n` + table(
    ["Policy", "Mean C", "Mean C coverage", "Mean T", "Both-type players", "MIXED / OWN_SIDE", "B2B rate", "Mean rest", "Mean p95", "Max rest", "Completed one-pair costs"],
    [
      ["Production", "10.629", "81.758%", "0.9786", "67/70", "69 / 36", "23.14%", "1.4629", "4.0", "5", "0"],
      ["Strict courtmate-first", "11.086", "85.275%", "0.9000", "56/70", "79 / 26", "28.29%", "1.4657", "4.0", "4", "0"],
      ["Near-best rescue", "10.829", "83.297%", "0.9929", "69/70", "76 / 29", "27.71%", "1.4714", "4.0", "4", "16"],
      ["Beneficial rescue", "11.057", "85.055%", "1.0000", "70/70", "75 / 30", "27.43%", "1.4600", "3.8", "4", "9"],
    ],
  ));

sections.push(`## Concessions near saturation\n\nThe last one-pair cost started after completion 37; none occurred after 50 or 75 in the selected 100-match runs. Every admitted concession lost exactly one pair and had strictly positive conditional benefit. Dynamic vocabulary changes and in-flight assignment snapshots prevent a general endpoint telescoping identity; local benefit totals are not causal endpoint improvements. The complete decision ledger is ${localLink("all-one-pair-concessions.csv", path.join(path.dirname(inputPath), "all-one-pair-concessions.csv"))}.`);

const p = summary.sourceProvenance;
sections.push(`## Provenance, validation, and limits\n\n` + table(
  ["Item", "Recorded value"],
  [
    ["Manifest", localLink(path.basename(summary.sourceManifest), summary.sourceManifest)], ["Commit", p.commitSha], ["Dirty at capture", p.workingTreeDirty],
    ["Engine SHA-256", p.engineSourceSha256], ["Measurement SHA-256", p.measurementHarnessSha256], ["Reference reports SHA-256", p.referenceReportsSha256],
    ["Seeds", summary.seeds.join(", ")], ["Sessions complete", `${summary.sessionsCompleted ?? 90}/96`],
    ["Tests", "418 passed; 11 skipped; 0 failed"], ["TypeScript / targeted lint", "passed"], ["Validator corruption fixtures", "5 rejected"],
  ],
) + `\n\nThe 96-session measurement is limited to three seeds per scenario and stable player strengths. Production completed 48/48 sessions; the candidate completed 42/48. All 974 applicable no-starvation counterfactuals certified (607 production, 367 candidate); the selected-set change counts were 123 and 47. Production had six incomplete exhaustive G/T opening audits with analytical safety certificates; every candidate decision in sessions that reached selection had a complete objective audit.\n\nThe candidate is not a production default recommendation. Further work should address the default-budget opening frontier without changing the objective or shrinking the structural denominator for busy players. The paused-player semantics and finite 100-match horizon limit recurrence claims. No production policy change, migration, or deployment was made.\n\nSummary JSON: ${localLink("summary.json", inputPath)}. Checkpoint CSV: ${localLink(path.basename(csvPath), csvPath)}. The report does not claim universal type recurrence.`);

writeFileSync(outputPath, `${sections.join("\n\n")}\n`);
console.log(`Rendered ${path.relative(process.cwd(), outputPath)} and ${path.relative(process.cwd(), csvPath)} from ${path.relative(process.cwd(), inputPath)}.`);
