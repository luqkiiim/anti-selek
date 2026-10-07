import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_LEGACY_DIR = "benchmarks/generated/social-readiness/full-2026-10-07-v1";
const DEFAULT_CLOCK_DIR = "benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid";
const EXPECTED_SEEDS = [1, 4729, 104729];
const EXPECTED_ARMS = ["production-immediate", "beneficial-immediate", "beneficial-conditional-wait"];
const ROOT = process.cwd();

export function assertSocialRescueDecision(decision, label = "decision") {
  const deficit = decision?.chosenCourtmateGainDeficit;
  const chosenGain = decision?.chosenCourtmateGain;
  const maximumGain = decision?.courtmateGainMaximum;
  const chosenT = decision?.chosenRollingMatchTypeGain;
  const bestTAtMaximum = decision?.bestRollingMatchTypeGainAtGmax;
  if (![deficit, chosenGain, maximumGain, chosenT, bestTAtMaximum].every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error(`${label}: missing finite courtmate/T rescue audit fields`);
  }
  if (!Number.isInteger(deficit) || deficit < 0 || deficit > 1) throw new Error(`${label}: courtmate deficit must be 0 or 1`);
  if (chosenGain < 0 || maximumGain < chosenGain || maximumGain - chosenGain !== deficit) {
    throw new Error(`${label}: courtmate gain/deficit fields disagree`);
  }
  if (deficit === 1 && !(chosenT > bestTAtMaximum)) {
    throw new Error(`${label}: a one-pair concession must have strictly positive conditional signed-T benefit`);
  }
  return { deficit, chosenGain, maximumGain, chosenT, bestTAtMaximum, conditionalTBenefit: chosenT - bestTAtMaximum };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function isNum(value) { return typeof value === "number" && Number.isFinite(value); }
function sha256(data) { return createHash("sha256").update(data).digest("hex"); }
function mean(values) { const ns = values.filter(isNum); return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null; }
function sum(values) { return values.filter(isNum).reduce((a, b) => a + b, 0); }
function max(values) { const ns = values.filter(isNum); return ns.length ? Math.max(...ns) : null; }
function quantile(values, p) {
  const ns = values.filter(isNum).sort((a, b) => a - b);
  return ns.length ? ns[Math.max(0, Math.ceil(p * ns.length) - 1)] : null;
}
function spread(values) { const ns = values.filter(isNum); return ns.length ? { minimum: Math.min(...ns), maximum: Math.max(...ns) } : { minimum: null, maximum: null }; }
function json(file) { return JSON.parse(readFileSync(file, "utf8")); }

function reportStatus(report, file) {
  assert(report && report.validationStatus === "passed", `${file}: report is not independently validated`);
  assert(!report.validation || report.validation.status === "passed", `${file}: validation block is not passed`);
}

function assertSourceHashesAgree(records, { requireHarnessMatch = true } = {}) {
  const first = records[0]?.provenance;
  assert(first, "Missing source provenance on readiness reports");
  const firstSource = first.currentEngineSourcesSha256 ?? first.matcherEngineSourceSetSha256 ?? first.matcherSourcesSha256 ?? first.engineSourcesSha256;
  const firstHarness = first.measurementHarnessSha256 ?? first.harnessSourcesSha256 ?? first.measurementSourcesSha256 ?? first.clockMeasurementHarnessSha256;
  assert(typeof firstSource === "string" && typeof firstHarness === "string", "Readiness reports lack engine/harness source hashes");
  for (const record of records.slice(1)) {
    const p = record.provenance ?? {};
    const source = p.currentEngineSourcesSha256 ?? p.matcherEngineSourceSetSha256 ?? p.matcherSourcesSha256 ?? p.engineSourcesSha256;
    const harness = p.measurementHarnessSha256 ?? p.harnessSourcesSha256 ?? p.measurementSourcesSha256 ?? p.clockMeasurementHarnessSha256;
    assert(source === firstSource, `${record.name}: matcher source hash differs from the other run stages`);
    if (requireHarnessMatch) assert(harness === firstHarness, `${record.name}: measurement harness hash differs from the other run stages`);
  }
  return { matcherSourcesSha256: firstSource, measurementHarnessSha256: firstHarness };
}

function loadClockManifest(directory, manifestPathOverride) {
  const requested = path.resolve(ROOT, manifestPathOverride ?? path.join(directory, "social-readiness-clock-run-manifest.json"));
  const isPendingFile = !existsSync(requested) && existsSync(`${requested}.pending`);
  const manifestFile = isPendingFile ? `${requested}.pending` : requested;
  assert(existsSync(manifestFile), `Missing clock run manifest: ${manifestFile}`);
  const manifest = json(manifestFile);
  assert(typeof manifest.schemaVersion === "string", `${manifestFile}: missing manifest schema`);
  if (isPendingFile) assert(manifest.validationStatus === "pending", `${manifestFile}: unexpected pending status`);
  else assert(manifest.validationStatus === "passed", `${manifestFile}: clock manifest is not validated`);
  assert(Array.isArray(manifest.scenarioRuns) && manifest.scenarioRuns.length > 0, `${manifestFile}: no scenario-run inventory`);
  const skippedPendingReports = [];
  const reports = manifest.scenarioRuns.flatMap((item) => {
    const relative = item.file ?? item.path ?? item.jsonPath ?? item.reportPath;
    assert(typeof relative === "string" && relative.endsWith(".json"), `${manifestFile}: malformed report inventory row`);
    const relativeToManifest = path.resolve(path.dirname(manifestFile), relative);
    const relativeToRepo = path.resolve(ROOT, relative);
    const file = existsSync(relativeToRepo) ? relativeToRepo : relativeToManifest;
    if (isPendingFile && item.validationStatus !== "passed") { skippedPendingReports.push(relative); return []; }
    if (!existsSync(file)) {
      if (isPendingFile) { skippedPendingReports.push(relative); return []; }
      throw new Error(`${manifestFile}: missing report ${relative}`);
    }
    const digest = sha256(readFileSync(file));
    if (typeof item.sha256 !== "string" || digest !== item.sha256) {
      if (isPendingFile) { skippedPendingReports.push(relative); return []; }
      throw new Error(`${relative}: report hash does not match the validated manifest`);
    }
    const report = json(file);
    if (report.validationStatus !== "passed") {
      if (isPendingFile) { skippedPendingReports.push(relative); return []; }
      throw new Error(`${relative}: report is not validated`);
    }
    return [{ file, name: relative, report, sha256: digest }];
  });
  return { file: manifestFile, manifest, reports, skippedPendingReports, isPending: isPendingFile };
}

function normalizeLegacySession(session, label) {
  assert(session.engineVersion === "current", `${label}: expected optimized current matcher`);
  assert(Array.isArray(session.decisions) && session.decisions.length > 0, `${label}: missing matcher decision log`);
  const calls = session.decisions.map((d, index) => {
    const p = d.result;
    assert(d.attempted === true && isNum(d.elapsedMs) && d.elapsedMs >= 0, `${label}/call${index + 1}: missing attempted-call timing`);
    assert(p && Number.isSafeInteger(p.exploredBranches) && p.exploredBranches >= 0 && Number.isSafeInteger(p.prunedBranches) && p.prunedBranches >= 0,
      `${label}/call${index + 1}: missing branch counters`);
    const passed = Boolean(d.certificationSucceeded && p.selectionReturned && p.fairnessCertified && p.starvationCertified &&
      p.courtmateGainMaximumCertified && p.priorityCertified && p.varietyOptimal);
    assert(d.executed !== true || passed, `${label}/call${index + 1}: executed uncertified candidate selection`);
    if (d.executed && p.chosenCourtmateGainDeficit !== null && p.chosenCourtmateGainDeficit !== undefined) {
      assertSocialRescueDecision(p, `${label}/call${index + 1}`);
    }
    return {
      callIndex: index + 1,
      kind: d.kind,
      afterCompletedMatches: d.afterCompletedMatches,
      elapsedMs: d.elapsedMs,
      exploredBranches: p.exploredBranches,
      prunedBranches: p.prunedBranches,
      searchLimitReached: p.searchLimitReached === true,
      selectionReturned: p.selectionReturned === true,
      fairnessCertified: p.fairnessCertified === true,
      starvationCertified: p.starvationCertified === true,
      gMaxCertified: p.courtmateGainMaximumCertified === true,
      priorityCertified: p.priorityCertified === true,
      varietyOptimal: p.varietyOptimal === true,
      executed: d.executed === true,
      gainDeficit: p.chosenCourtmateGainDeficit ?? null,
      signedTGain: p.chosenRollingMatchTypeGain ?? null,
      bestSignedTAtGmax: p.bestRollingMatchTypeGainAtGmax ?? null,
      conditionalTBenefit: p.chosenCourtmateGainDeficit === 1 ? p.chosenRollingMatchTypeGain - p.bestRollingMatchTypeGainAtGmax : null,
    };
  });
  return {
    scenarioId: session.scenario.id,
    upperCount: session.scenario.upperCount,
    lowerCount: session.scenario.lowerCount,
    courtCount: session.scenario.courtCount,
    seed: session.seed,
    targetMatches: session.targetMatches,
    status: session.status,
    completedMatches: session.completedHistory.length,
    stopReason: session.stopReason ?? null,
    diagnostics: session.diagnostics,
    calls,
    jointFrontierProbes: (session.jointFrontierProbes ?? []).map((probe) => ({
      requestedPrefix: probe.requestedPrefix,
      observedCompletedMatches: probe.observedCompletedMatches,
      status: probe.status,
      elapsedMs: probe.elapsedMs,
      exploredBranches: probe.result?.exploredBranches ?? null,
      prunedBranches: probe.result?.prunedBranches ?? null,
      searchLimitReached: probe.result?.searchLimitReached ?? null,
      certified: Boolean(probe.result?.selectionReturned && probe.result?.fairnessCertified && probe.result?.starvationCertified &&
        probe.result?.courtmateGainMaximumCertified && probe.result?.priorityCertified && probe.result?.varietyOptimal),
    })),
  };
}

function checkpointMetrics(session, checkpoint, label) {
  const score = checkpoint?.scores?.structural;
  const fairness = checkpoint?.matchCountFairness ?? checkpoint?.fairness;
  assert(score && fairness && checkpoint.rest, `${label}: incomplete checkpoint`);
  const players = score.players ?? [];
  const bothEligible = players.filter((p) => p.feasibleMatchTypes?.length === 2);
  const bothCovered = bothEligible.filter((p) => p.T === 1).length;
  const rest = checkpoint.rest;
  const history = (session.completedHistory ?? []).slice(0, checkpoint.completedMatches);
  const assignments = (session.assignments ?? []).filter((assignment) => isNum(assignment.startedAtMinutes) && assignment.startedAtMinutes < checkpoint.atMinutes);
  const lastEventByPlayer = new Map();
  let longestOtherCompletionGap = null;
  history.forEach((match, index) => {
    const ids = match.ids ?? match.players ?? [...(match.team1 ?? []), ...(match.team2 ?? [])];
    for (const id of ids) {
      const previous = lastEventByPlayer.get(id);
      if (previous !== undefined) longestOtherCompletionGap = Math.max(longestOtherCompletionGap ?? 0, index - previous - 1);
      lastEventByPlayer.set(id, index);
    }
  });
  const completedAssignments = (session.assignments ?? []).filter((assignment) => isNum(assignment.completedMatchNumber) && isNum(assignment.completedAtMinutes)).sort((a, b) => a.completedMatchNumber - b.completedMatchNumber);
  let maximumCompletionToNextAssignmentGap = null;
  for (const assignment of assignments) {
    const completedBeforeStart = completedAssignments.filter((prior) => prior.completedAtMinutes <= assignment.startedAtMinutes);
    if (!completedBeforeStart.length) continue;
    const completedThrough = Math.max(...completedBeforeStart.map((prior) => prior.completedMatchNumber));
    for (const userId of assignment.ids ?? []) {
      const previous = completedBeforeStart.filter((prior) => prior.ids?.includes(userId)).at(-1);
      if (previous) {
        const gap = completedThrough - previous.completedMatchNumber;
        maximumCompletionToNextAssignmentGap = Math.max(maximumCompletionToNextAssignmentGap ?? 0, gap);
      }
    }
  }
  const countDistribution = Object.fromEntries([...new Set((fairness.playerMatchCounts ?? []).map((p) => p.matchesPlayed))].sort((a, b) => a - b).map((count) => [count, fairness.playerMatchCounts.filter((p) => p.matchesPlayed === count).length]));
  const playerMatchCounts = (fairness.playerMatchCounts ?? []).map((p) => ({ userId: p.userId, matchesPlayed: p.matchesPlayed }));
  const metrics = {
    scenarioId: session.scenario?.id ?? session.scenarioId,
    seed: session.seed,
    arm: session.arm ?? `${session.engineVersion}-${session.scheduler}`,
    engineVersion: session.engineVersion ?? null,
    scheduler: session.scheduler ?? null,
    completedMatches: checkpoint.completedMatches,
    completedStatus: session.status,
    upperCount: session.scenario?.upperCount ?? session.scenario?.upper ?? null,
    lowerCount: session.scenario?.lowerCount ?? session.scenario?.lower ?? null,
    courtCount: session.scenario?.courtCount ?? null,
    playerCount: score.playerCount,
    meanCourtmates: score.courtmates?.averageDistinctPeers ?? null,
    minimumCourtmates: score.courtmates?.minimumDistinctPeers ?? null,
    courtmateCoverage: score.courtmates?.meanCoverage ?? null,
    worstCourtmateCoverage: score.courtmates?.worstPlayerCoverage ?? null,
    coveredCourtmatePairs: score.courtmates?.coveredPairCount ?? null,
    feasibleCourtmatePairs: score.courtmates?.feasiblePairCount ?? null,
    fullyCoveredCourtmatePlayers: score.courtmates?.fullyCoveredPlayerCount ?? null,
    meanT: score.meanT ?? null,
    fullTypeCoverageFraction: score.fullTypeCoverageFraction ?? null,
    halfTypeCoverageFraction: score.halfTypeCoverageFraction ?? null,
    bothTypeEligiblePlayers: bothEligible.length,
    bothTypeCoveredPlayers: bothCovered,
    bothTypeCoverageFraction: bothEligible.length ? bothCovered / bothEligible.length : null,
    mixedMatches: score.completedMatchTypeCounts?.MIXED ?? checkpoint.completedMatchTypeCounts?.MIXED ?? null,
    ownSideMatches: score.completedMatchTypeCounts?.OWN_SIDE ?? checkpoint.completedMatchTypeCounts?.OWN_SIDE ?? null,
    longestSingleTypeRun: score.longestSingleTypeAppearanceRun ?? null,
    meanPartners: score.partners?.averageDistinctPeers ?? null,
    partnerCoverage: score.partners?.meanCoverage ?? null,
    partnerEntropy: score.partners?.meanNormalizedEntropy ?? null,
    meanOpponents: score.opponents?.averageDistinctPeers ?? null,
    opponentCoverage: score.opponents?.meanCoverage ?? null,
    opponentEntropy: score.opponents?.meanNormalizedEntropy ?? null,
    countSpread: fairness.spread ?? fairness.countSpread ?? null,
    minimumMatchCount: fairness.minimumMatchCount ?? fairness.minimum ?? null,
    maximumMatchCount: fairness.maximumMatchCount ?? fairness.maximum ?? null,
    countDistribution,
    playerMatchCounts,
    meanRestTurns: rest.meanRestTurns ?? rest.meanAssignmentRestTurns ?? null,
    p95RestTurns: rest.p95RestTurns ?? rest.p95AssignmentRestTurns ?? null,
    maximumRestTurns: rest.maximumRestTurns ?? rest.maximumAssignmentRestTurns ?? null,
    longestCompletedMatchToCompletedMatchGap: rest.longestOtherCompletionGap ?? rest.longestOwnCompletionGap ?? longestOtherCompletionGap,
    maximumCompletionToNextAssignmentGap,
    backToBackCount: rest.backToBackCount ?? rest.backToBackAssignments ?? null,
    backToBackRate: rest.backToBackRate ?? null,
    eligiblePostFirstAppearances: rest.eligiblePostFirstAppearances ?? null,
    idleFraction: checkpoint.time?.idleFraction ?? null,
    idleCourtMinutes: checkpoint.time?.idleCourtMinutes ?? null,
    elapsedMinutes: checkpoint.time?.elapsedMinutes ?? checkpoint.atMinutes ?? null,
    meanElapsedRestMinutes: rest.meanElapsedRestMinutes ?? null,
    p95ElapsedRestMinutes: rest.p95ElapsedRestMinutes ?? null,
    maximumElapsedRestMinutes: rest.maximumElapsedRestMinutes ?? null,
  };
  metrics.maximumAvailableRestTurns = max((session.searchTelemetry ?? []).filter((call) => call.previewKind === "execution" && isNum(call.elapsedMs) && Array.isArray(call.input?.completedHistoryIds) && call.input.completedHistoryIds.length < checkpoint.completedMatches).flatMap((call) => {
    const available = new Set(call.input?.availablePlayerIds ?? []);
    return (call.input?.playerState ?? []).filter((player) => available.has(player.userId) && isNum(player.restTurns)).map((player) => player.restTurns);
  }));
  metrics.observedAssignmentCountThroughCheckpoint = assignments.length;
  return metrics;
}

function percentileBlock(values) {
  return { count: values.filter(isNum).length, mean: mean(values), median: quantile(values, 0.5), p95: quantile(values, 0.95), maximum: max(values) };
}

function summarizeLegacy(report, name) {
  reportStatus(report, name);
  assert(report.schemaVersion === "social-frontier-scalability-v1", `${name}: unexpected legacy schema`);
  assert(report.policy === "courtmate-beneficial-rescue" && report.engineVersions?.includes("current"), `${name}: unexpected legacy engine or policy`);
  const sessions = report.sessions.map((s) => normalizeLegacySession(s, `${name}/${s.scenario.id}/seed${s.seed}`));
  const rawSessionMetrics = report.sessions.flatMap((session) => (session.checkpoints ?? []).map((cp) => checkpointMetrics(session, cp, `${name}/${session.scenario.id}/seed${session.seed}/cp${cp.completedMatches}`)));
  const calls = sessions.flatMap((s) => s.calls.map((c) => ({ scenarioId: s.scenarioId, seed: s.seed, targetMatches: s.targetMatches, ...c })));
  return {
    name,
    schemaVersion: report.schemaVersion,
    targetMatches: report.targetMatches,
    scenarios: report.scenarios,
    sourceProvenance: report.sourceProvenance,
    sessions,
    checkpointMetrics: rawSessionMetrics,
    search: {
      calls: calls.length,
      certifiedCalls: calls.filter((c) => c.selectionReturned && c.fairnessCertified && c.starvationCertified && c.gMaxCertified && c.priorityCertified && c.varietyOptimal).length,
      searchLimitCalls: calls.filter((c) => c.searchLimitReached).length,
      openingMs: percentileBlock(calls.filter((c) => c.kind === "opening").map((c) => c.elapsedMs)),
      refillMs: percentileBlock(calls.filter((c) => c.kind === "refill").map((c) => c.elapsedMs)),
      allCallsMs: percentileBlock(calls.map((c) => c.elapsedMs)),
      exploredBranches: sum(calls.map((c) => c.exploredBranches)),
      prunedBranches: sum(calls.map((c) => c.prunedBranches)),
      pruningFraction: calls.length ? sum(calls.map((c) => c.prunedBranches)) / Math.max(1, sum(calls.map((c) => c.prunedBranches + c.exploredBranches))) : null,
      onePairConcessions: calls.filter((c) => c.executed && c.gainDeficit === 1).length,
      onePairConditionalTBenefits: calls.filter((c) => c.executed && c.gainDeficit === 1).map((c) => c.conditionalTBenefit),
      jointFrontierProbes: sessions.flatMap((s) => s.jointFrontierProbes.map((p) => ({ scenarioId: s.scenarioId, seed: s.seed, ...p }))),
    },
  };
}

function normalizeGridArm(session) {
  if (EXPECTED_ARMS.includes(session.arm)) return session.arm;
  if (session.engineVersion === "production" && session.scheduler === "immediate") return "production-immediate";
  if (session.engineVersion === "courtmate-beneficial-rescue" && session.scheduler === "immediate") return "beneficial-immediate";
  if (session.engineVersion === "courtmate-beneficial-rescue" && session.scheduler === "conditional-wait") return "beneficial-conditional-wait";
  return null;
}

function normalizeSearchTelemetry(report, session, label) {
  const raw = session.searchTelemetry ?? report.searchTelemetry?.filter((x) => x.scenarioId === session.scenarioId && x.seed === session.seed && x.arm === session.arm) ?? [];
  assert(Array.isArray(raw), `${label}: searchTelemetry is not an array`);
  const decisionById = new Map((session.decisions ?? []).map((decision) => [String(decision.decisionId), decision]));
  return raw.map((call, i) => {
    assert(call.input && Object.prototype.hasOwnProperty.call(call.input, "searchLimits"), `${label}/telemetry${i}: missing searchLimits snapshot`);
    assert(call.input.searchLimits === null, `${label}/telemetry${i}: run is not under normal matcher budgets`);
    const linkedDecision = decisionById.get(String(call.decisionId));
    const acceptedExecution = call.previewKind === "execution" && linkedDecision?.executionAccepted === true &&
      Array.isArray(linkedDecision.executedCourtIndices) && linkedDecision.executedCourtIndices.length > 0;
    if (call.previewKind === "orphaned-error") {
      return {
        scenarioId: call.scenarioId ?? session.scenarioId,
        seed: call.seed ?? session.seed,
        arm: call.arm ?? session.arm,
        decisionId: call.decisionId,
        previewKind: call.previewKind,
        phase: linkedDecision?.completedMatchesAtDecision === 0 ? "opening" : "refill",
        completedMatchesAtDecision: linkedDecision?.completedMatchesAtDecision ?? null,
        elapsedMs: isNum(call.elapsedMs) && call.elapsedMs >= 0 ? call.elapsedMs : null,
        exploredBranches: call.proof?.exploredBranches ?? null,
        prunedBranches: call.proof?.prunedBranches ?? null,
        searchLimitReached: call.proof?.searchLimitReached ?? null,
        selectionReturned: false,
        fairnessCertified: null,
        starvationCertified: null,
        gMaxCertified: null,
        priorityCertified: null,
        varietyOptimal: null,
        courtCountCertified: null,
        proposalReturned: false,
        executed: false,
        acceptedExecution: false,
        availablePlayerCount: Array.isArray(call.input.availablePlayerIds) ? call.input.availablePlayerIds.length : null,
        maximumAvailableRestTurns: null,
        error: call.error ?? call.message ?? "matcher threw before returning a proof",
      };
    }
    assert(isNum(call.elapsedMs) && call.elapsedMs >= 0, `${label}/telemetry${i}: invalid runtime`);
    const linkedPreview = call.previewKind === "execution" ? linkedDecision?.execution
      : call.previewKind === "future" ? linkedDecision?.futurePreview?.preview
        : linkedDecision?.immediatePreview;
    const proof = { ...(linkedPreview?.matcherCertificates ?? {}), ...(call.proof ?? {}), ...(call.proof?.matcherCertificates ?? {}) };
    assert(proof && typeof proof.searchLimitReached === "boolean", `${label}/telemetry${i}: missing search-limit proof`);
    const selected = proof.selectionReturned === true;
    const candidate = session.engineVersion === "courtmate-beneficial-rescue";
    if (acceptedExecution && selected) {
      assert(proof.fairnessCertified === true && proof.starvationCertified === true,
        `${label}/telemetry${i}: executed selection lacks fairness/starvation proof`);
      if (candidate) assert(proof.courtmateGainMaximumCertified === true && proof.priorityCertified === true && proof.varietyOptimal === true,
        `${label}/telemetry${i}: executed candidate selection lacks Gmax/full-priority proof`);
    }
    if (candidate && selected && proof.chosenCourtmateGainDeficit !== null && proof.chosenCourtmateGainDeficit !== undefined) {
      assertSocialRescueDecision(proof, `${label}/telemetry${i}`);
    }
    const availableIds = new Set(Array.isArray(call.input.availablePlayerIds) ? call.input.availablePlayerIds : []);
    const availableRestTurns = (call.input.playerState ?? []).filter((player) => availableIds.has(player.userId) && isNum(player.restTurns)).map((player) => player.restTurns);
    const courtCountCertified = selected
      ? (proof.courtCountCertified === false ? false : proof.courtCountCertified === true || (Array.isArray(call.selectedAssignments) && call.selectedAssignments.length === call.input.courtCount))
      : null;
    return {
      scenarioId: call.scenarioId ?? session.scenarioId,
      seed: call.seed ?? session.seed,
      arm: call.arm ?? session.arm,
      decisionId: call.decisionId,
      previewKind: call.previewKind,
      phase: linkedDecision?.completedMatchesAtDecision === 0 ? "opening" : "refill",
      completedMatchesAtDecision: linkedDecision?.completedMatchesAtDecision ?? null,
      elapsedMs: call.elapsedMs,
      exploredBranches: proof.exploredBranches ?? null,
      prunedBranches: proof.prunedBranches ?? null,
      searchLimitReached: proof.searchLimitReached,
      selectionReturned: proof.selectionReturned === true,
      fairnessCertified: typeof proof.fairnessCertified === "boolean" ? proof.fairnessCertified : null,
      starvationCertified: typeof proof.starvationCertified === "boolean" ? proof.starvationCertified : null,
      gMaxCertified: typeof (proof.courtmateGainMaximumCertified ?? proof.gMaxCertified) === "boolean" ? (proof.courtmateGainMaximumCertified ?? proof.gMaxCertified) : null,
      priorityCertified: typeof proof.priorityCertified === "boolean" ? proof.priorityCertified : null,
      varietyOptimal: typeof (proof.varietyOptimal ?? proof.matcherVarietyOptimal) === "boolean" ? (proof.varietyOptimal ?? proof.matcherVarietyOptimal) : null,
      courtCountCertified,
      reportedVarietyOptimal: call.proof?.varietyOptimal ?? null,
      proposalReturned: selected,
      executed: acceptedExecution,
      acceptedExecution,
      chosenCourtmateGainDeficit: proof.chosenCourtmateGainDeficit ?? null,
      chosenRollingMatchTypeGain: proof.chosenRollingMatchTypeGain ?? null,
      bestRollingMatchTypeGainAtGmax: proof.bestRollingMatchTypeGainAtGmax ?? null,
      conditionalTBenefit: proof.chosenCourtmateGainDeficit === 1 ? proof.chosenRollingMatchTypeGain - proof.bestRollingMatchTypeGainAtGmax : null,
      availablePlayerCount: Array.isArray(call.input.availablePlayerIds) ? call.input.availablePlayerIds.length : null,
      maximumAvailableRestTurns: max(availableRestTurns),
    };
  });
}

function summarizeGridReport(report, name) {
  reportStatus(report, name);
  assert(report.schemaVersion === "social-realistic-readiness-clock-v1", `${name}: unexpected clock-grid schema`);
  assert(Array.isArray(report.sessions), `${name}: missing clock sessions`);
  const sessions = [];
  const telemetry = [];
  for (const session of report.sessions) {
    const arm = normalizeGridArm(session);
    assert(arm && EXPECTED_ARMS.includes(arm), `${name}: unexpected engine/scheduler ${session.engineVersion}/${session.scheduler}`);
    const label = `${session.scenarioId}/seed${session.seed}/${arm}`;
    assert(session.targetCompletedMatches === 100, `${label}: clock target must be 100`);
    const calls = normalizeSearchTelemetry(report, session, label);
    telemetry.push(...calls);
    const checkpoints = (session.checkpoints ?? []).map((cp) => checkpointMetrics(session, cp, `${label}/cp${cp.completedMatches}`));
    const concessions = (session.decisions ?? []).filter((d) => d.executionAccepted && d.execution && d.execution.chosenCourtmateGainDeficit === 1).map((d) => {
      const audit = assertSocialRescueDecision(d.execution, `${label}/decision${d.decisionId}`);
      const state = d.execution.playerStateSnapshot ?? [];
      const firstAppearanceClassFixed = state.length > 0 && state.every((player) => isNum(player.matchesPlayed) && player.matchesPlayed > 0);
      assert(state.length > 0 && state.every((player) => player.matchmakingBaseline === player.matchesPlayed), `${label}/decision${d.decisionId}: first-appearance cancellation requires count/baseline equality`);
      assert(checkpoints.every((checkpoint) => checkpoint.bothTypeEligiblePlayers === checkpoint.playerCount), `${label}: type-window conversion requires both types feasible for every player`);
      const assignedCourts = (session.assignments ?? []).filter((assignment) => assignment.decisionId === d.decisionId);
      return {
        decisionId: d.decisionId,
        afterCompletedMatches: d.completedMatchesAtDecision,
        executionAccepted: true,
        completedCourtCount: assignedCourts.filter((assignment) => isNum(assignment.completedMatchNumber)).length,
        censoredCourtCount: assignedCourts.filter((assignment) => assignment.censoredAtTarget).length,
        firstAppearanceClassFixed,
        firstAppearanceCountFixedByFairnessClass: true,
        absoluteChosenSignedTDelta: audit.chosenT,
        comparativeNetTypeWindowUnits: 2 * audit.conditionalTBenefit,
        ...audit,
      };
    });
    const decisions = session.decisions ?? [];
    const waited = decisions.filter((d) => d.waited === true);
    const opportunities = session.waiting?.conditionalWaitDecisions ?? (session.scheduler === "conditional-wait" ? decisions.filter((d) => d.completedMatchesAtDecision > 0).length : 0);
    const durations = waited.map((d) => d.executedAtMinutes - d.atMinutes).filter((n) => isNum(n) && n >= 0);
    const endpoint = checkpoints.find((cp) => cp.completedMatches === 100) ?? null;
    const actualCalls = calls.filter((call) => call.previewKind === "execution");
    const acceptedCalls = actualCalls.filter((call) => call.acceptedExecution);
    const actualCallFailures = {
      searchLimit: actualCalls.filter((call) => call.searchLimitReached).length,
      fairness: actualCalls.filter((call) => !call.fairnessCertified).length,
      starvation: actualCalls.filter((call) => !call.starvationCertified).length,
      candidateGmax: session.engineVersion === "courtmate-beneficial-rescue" ? actualCalls.filter((call) => !call.gMaxCertified).length : null,
      candidatePriority: session.engineVersion === "courtmate-beneficial-rescue" ? actualCalls.filter((call) => !call.priorityCertified).length : null,
      candidateVariety: session.engineVersion === "courtmate-beneficial-rescue" ? actualCalls.filter((call) => !call.varietyOptimal).length : null,
    };
    const actualMaximumAvailableRestTurns = max(actualCalls.map((call) => call.maximumAvailableRestTurns));
    const searchByKind = Object.fromEntries(["execution", "immediate", "future", "orphaned-error"].map((kind) => {
      const rows = calls.filter((call) => call.previewKind === kind);
      return [kind, {
        calls: rows.length,
        returnedSelection: rows.filter((call) => call.proposalReturned).length,
        acceptedExecution: rows.filter((call) => call.acceptedExecution).length,
        searchLimitCalls: rows.filter((call) => call.searchLimitReached === true).length,
        fairnessFailures: rows.filter((call) => call.fairnessCertified !== true).length,
        starvationFailures: rows.filter((call) => call.starvationCertified !== true).length,
        candidateGmaxFailures: session.engineVersion === "courtmate-beneficial-rescue" ? rows.filter((call) => call.gMaxCertified !== true).length : null,
        candidatePriorityFailures: session.engineVersion === "courtmate-beneficial-rescue" ? rows.filter((call) => call.priorityCertified !== true).length : null,
        candidateVarietyFailures: session.engineVersion === "courtmate-beneficial-rescue" ? rows.filter((call) => call.varietyOptimal !== true).length : null,
        runtimeMs: percentileBlock(rows.map((call) => call.elapsedMs)),
        exploredBranches: sum(rows.map((call) => call.exploredBranches)),
        prunedBranches: sum(rows.map((call) => call.prunedBranches)),
      }];
    }));
    sessions.push({
      scenarioId: session.scenarioId,
      scenario: session.scenario,
      seed: session.seed,
      arm,
      engineVersion: session.engineVersion,
      scheduler: session.scheduler,
      status: session.status,
      completedMatches: session.completedHistory?.length ?? 0,
      stopReason: session.stopReason ?? null,
      checkpointMetrics: checkpoints,
      endpoint100: endpoint,
      searchCalls: calls.length,
      searchByKind,
      matcherCalls: calls.length,
      actualMatcherAttempts: actualCalls.length,
      acceptedExecutions: acceptedCalls.length,
      actualCallFailures,
      actualMaximumAvailableRestTurns,
      concessions,
      waiting: {
        opportunities,
        waits: waited.length,
        waitRate: opportunities ? waited.length / opportunities : null,
        waitDurationMinutes: percentileBlock(durations),
        waitDurationsMinutes: durations,
        declinedReasons: session.waiting?.waitsDeclinedByReason ?? {},
      },
      rawTime: session.finalTime ?? null,
    });
  }
  return { name, sourceProvenance: report.sourceProvenance, scenario: report.scenario, seeds: report.seeds, targetCompletedMatches: report.targetCompletedMatches, sessions, telemetry };
}

function summarizeSearchCalls(calls) {
  const group = (rows) => {
    const candidateRows = rows.filter((row) => row.arm !== "production-immediate");
    const hasCandidate = candidateRows.length > 0;
    return {
      calls: rows.length,
      runtimeMs: percentileBlock(rows.map((row) => row.elapsedMs)),
      totalRuntimeMs: sum(rows.map((row) => row.elapsedMs)),
      exploredBranches: sum(rows.map((row) => row.exploredBranches)),
      prunedBranches: sum(rows.map((row) => row.prunedBranches)),
      searchLimitCalls: rows.filter((row) => row.searchLimitReached === true).length,
      noSelectionCalls: rows.filter((row) => row.proposalReturned === false).length,
      returnedSelection: rows.filter((row) => row.proposalReturned === true).length,
      acceptedExecutions: rows.filter((row) => row.acceptedExecution === true).length,
      fairnessCertificationFailures: rows.filter((row) => row.fairnessCertified === false).length,
      starvationCertificationFailures: rows.filter((row) => row.starvationCertified === false).length,
      courtCountCertificationFailures: rows.filter((row) => row.courtCountCertified === false).length,
      gMaxCertificationFailures: hasCandidate ? candidateRows.filter((row) => row.gMaxCertified === false).length : null,
      priorityCertificationFailures: hasCandidate ? candidateRows.filter((row) => row.priorityCertified === false).length : null,
      candidateVarietyCertificationFailures: hasCandidate ? candidateRows.filter((row) => row.varietyOptimal === false).length : null,
      reportedVarietyOptimalFalse: rows.filter((row) => row.varietyOptimal === false).length,
    };
  };
  const arms = [...new Set(calls.map((call) => call.arm))];
  const kinds = ["execution", "immediate", "future", "orphaned-error"];
  const phases = ["opening", "refill"];
  const byArm = Object.fromEntries(arms.map((arm) => [arm, group(calls.filter((call) => call.arm === arm))]));
  const byArmKindAndPhase = {};
  for (const arm of arms) {
    byArmKindAndPhase[arm] = {};
    for (const kind of kinds) {
      byArmKindAndPhase[arm][kind] = {};
      for (const phase of phases) byArmKindAndPhase[arm][kind][phase] = group(calls.filter((call) => call.arm === arm && call.previewKind === kind && call.phase === phase));
    }
  }
  return { overall: group(calls), byArm, byArmKindAndPhase };
}

function buildGridPairs(gridSessions) {
  const groups = new Map();
  for (const session of gridSessions) {
    const key = `${session.scenarioId}/seed${session.seed}`;
    if (!groups.has(key)) groups.set(key, { scenarioId: session.scenarioId, seed: session.seed, arms: {} });
    const group = groups.get(key);
    assert(!group.arms[session.arm], `${key}: duplicate ${session.arm} session`);
    group.arms[session.arm] = session;
  }
  const out = [];
  for (const group of groups.values()) {
    const missing = EXPECTED_ARMS.filter((arm) => !group.arms[arm]);
    assert(missing.length === 0, `${group.scenarioId}/seed${group.seed}: missing arms ${missing.join(", ")}`);
    const checkpoints = new Set(EXPECTED_ARMS.flatMap((arm) => group.arms[arm].checkpointMetrics.map((x) => x.completedMatches)));
    for (const horizon of checkpoints) {
      const rows = Object.fromEntries(EXPECTED_ARMS.map((arm) => [arm, group.arms[arm].checkpointMetrics.find((x) => x.completedMatches === horizon) ?? null]));
      for (const [arm, row] of Object.entries(rows)) if (row === null) rows[arm] = null;
      const prod = rows["production-immediate"];
      const beneficial = rows["beneficial-immediate"];
      const conditional = rows["beneficial-conditional-wait"];
      const deltas = (left, right) => left && right ? Object.fromEntries([
        ["courtmateCoverage", "courtmateCoverage"], ["meanCourtmates", "meanCourtmates"], ["minimumCourtmates", "minimumCourtmates"], ["worstCourtmateCoverage", "worstCourtmateCoverage"], ["coveredCourtmatePairs", "coveredCourtmatePairs"], ["fullyCoveredCourtmatePlayers", "fullyCoveredCourtmatePlayers"],
        ["meanT", "meanT"], ["fullTypeCoverageFraction", "fullTypeCoverageFraction"], ["bothTypeCoverageFraction", "bothTypeCoverageFraction"],
        ["partnerCoverage", "partnerCoverage"], ["opponentCoverage", "opponentCoverage"], ["partnerEntropy", "partnerEntropy"],
        ["meanPartners", "meanPartners"], ["meanOpponents", "meanOpponents"], ["opponentEntropy", "opponentEntropy"], ["longestSingleTypeRun", "longestSingleTypeRun"], ["mixedMatches", "mixedMatches"], ["ownSideMatches", "ownSideMatches"],
        ["idleFraction", "idleFraction"],
        ["idleCourtMinutes", "idleCourtMinutes"], ["elapsedMinutes", "elapsedMinutes"], ["backToBackRate", "backToBackRate"],
        ["backToBackCount", "backToBackCount"], ["countSpread", "countSpread"], ["meanRestTurns", "meanRestTurns"], ["p95RestTurns", "p95RestTurns"], ["maximumRestTurns", "maximumRestTurns"], ["maximumAvailableRestTurns", "maximumAvailableRestTurns"], ["maximumCompletionToNextAssignmentGap", "maximumCompletionToNextAssignmentGap"],
        ["meanElapsedRestMinutes", "meanElapsedRestMinutes"], ["p95ElapsedRestMinutes", "p95ElapsedRestMinutes"], ["maximumElapsedRestMinutes", "maximumElapsedRestMinutes"],
      ].map(([name, field]) => [name, isNum(right[field]) && isNum(left[field]) ? right[field] - left[field] : null])) : null;
      const idle = deltas(beneficial, conditional);
      const varietyPerIdle = idle && idle.idleFraction > 0 ? {
        meanCourtmatesPerIdleCourtMinute: idle.idleCourtMinutes > 0 && idle.meanCourtmates !== null ? idle.meanCourtmates / idle.idleCourtMinutes : null,
        courtmateCoveragePerIdlePercentagePoint: idle.idleFraction > 0 && idle.courtmateCoverage !== null ? idle.courtmateCoverage / (100 * idle.idleFraction) : null,
        meanTPerIdlePercentagePoint: idle.idleFraction > 0 && idle.meanT !== null ? idle.meanT / (100 * idle.idleFraction) : null,
        bothTypeCoveragePerIdlePercentagePoint: idle.idleFraction > 0 && idle.bothTypeCoverageFraction !== null ? idle.bothTypeCoverageFraction / (100 * idle.idleFraction) : null,
      } : null;
      out.push({ scenarioId: group.scenarioId, seed: group.seed, completedMatches: horizon, arms: rows,
        candidateVsProduction: deltas(prod, beneficial), conditionalVsCandidate: idle, varietyPerIdle });
    }
  }
  return out;
}

function metricAggregate(rows, fields) {
  const observedRows = rows.filter(Boolean);
  const result = { sessions: observedRows.length };
  for (const field of fields) {
    const values = observedRows.map((r) => r[field]).filter(isNum);
    result[field] = { n: values.length, mean: mean(values), minimum: spread(values).minimum, maximum: spread(values).maximum };
  }
  return result;
}

function aggregatePairs(pairs) {
  const keys = [...new Set(pairs.map((p) => `${p.scenarioId}/${p.completedMatches}`))];
  const out = [];
  for (const key of keys) {
    const [scenarioId, horizonRaw] = key.split("/");
    const horizon = Number(horizonRaw);
    const rows = pairs.filter((p) => p.scenarioId === scenarioId && p.completedMatches === horizon);
    const arms = {};
    for (const arm of EXPECTED_ARMS) {
      const metrics = rows.map((r) => r.arms[arm]);
      arms[arm] = metricAggregate(metrics, ["meanCourtmates", "minimumCourtmates", "courtmateCoverage", "worstCourtmateCoverage", "coveredCourtmatePairs", "feasibleCourtmatePairs", "fullyCoveredCourtmatePlayers", "meanT", "fullTypeCoverageFraction", "bothTypeCoverageFraction", "longestSingleTypeRun", "mixedMatches", "ownSideMatches", "meanPartners", "partnerCoverage", "partnerEntropy", "meanOpponents", "opponentCoverage", "opponentEntropy", "idleFraction", "idleCourtMinutes", "elapsedMinutes", "backToBackCount", "backToBackRate", "eligiblePostFirstAppearances", "meanRestTurns", "p95RestTurns", "maximumRestTurns", "maximumCompletionToNextAssignmentGap", "longestCompletedMatchToCompletedMatchGap", "meanElapsedRestMinutes", "p95ElapsedRestMinutes", "maximumElapsedRestMinutes", "countSpread"]);
    }
    const paired = (name) => {
      const diffs = rows.map((r) => r[name]).filter(Boolean);
      const fields = Object.keys(diffs[0] ?? {});
      return Object.fromEntries(fields.map((f) => [f, { mean: mean(diffs.map((d) => d[f])), min: spread(diffs.map((d) => d[f])).minimum, max: spread(diffs.map((d) => d[f])).maximum }]));
    };
    const pairedSessionCount = rows.filter((r) => EXPECTED_ARMS.every((arm) => r.arms[arm] !== null)).length;
    out.push({ scenarioId, completedMatches: horizon, pairedSessionCount, arms, candidateVsProduction: paired("candidateVsProduction"), conditionalVsCandidate: paired("conditionalVsCandidate"), varietyPerIdle: paired("varietyPerIdle") });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i < 0 ? fallback : args[i + 1];
  };
  if (args.includes("--help")) {
    console.log("Usage: node scripts/summarize-social-readiness.mjs [--legacy-dir benchmarks/generated/social-readiness/full-2026-10-07-v1] [--clock-dir benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid] [--preview]");
    process.exit(0);
  }
  const legacyDir = path.resolve(ROOT, valueAfter("--legacy-dir", DEFAULT_LEGACY_DIR));
  const clockDir = path.resolve(ROOT, valueAfter("--clock-dir", DEFAULT_CLOCK_DIR));
  const specs = [
    ["legacy-short-16-8-8-2c", "legacy-short-16-8-8-2c/frontier-16-8-8-2c.json"],
    ["legacy-short-18-9-9-3c", "legacy-short-18-9-9-3c/frontier-18-9-9-3c.json"],
    ["legacy-100-16-8-8-2c", "legacy-100-16-8-8-2c/frontier-16-8-8-2c.json"],
    ["legacy-100-18-9-9-3c", "legacy-100-18-9-9-3c/frontier-18-9-9-3c.json"],
  ];
  const legacy = specs.map(([name, relative]) => {
    const file = path.join(legacyDir, relative);
    assert(existsSync(file), `Missing required legacy report: ${file}`);
    return { file, name, report: json(file) };
  });
  const hashes = assertSourceHashesAgree(legacy.map((x) => ({ name: x.name, provenance: x.report.sourceProvenance })));
  const legacySummary = legacy.map(({ name, report }) => summarizeLegacy(report, name));
  const preview = args.includes("--preview");
  const independentEndpointFile = path.join(path.dirname(clockDir), "legacy-short-endpoints-independent.json");
  assert(existsSync(independentEndpointFile), `Missing independent 24/27 short-session endpoint analysis: ${independentEndpointFile}`);
  const independentEndpoints = json(independentEndpointFile);
  assert(independentEndpoints.schemaVersion === "independent-legacy-short-endpoints-v1" && independentEndpoints.sessions?.length === 6, "Unexpected independent legacy endpoint analysis schema/session count");
  for (const row of independentEndpoints.sessions) {
    const source = path.resolve(ROOT, row.sourceFile);
    assert(existsSync(source) && sha256(readFileSync(source)) === row.sourceSha256, `Independent endpoint row does not pin its source report: ${row.sourceFile}`);
  }
  const clockRun = loadClockManifest(clockDir, valueAfter("--manifest", undefined));
  const gridReports = clockRun.reports.filter((record) => record.report.schemaVersion === "social-realistic-readiness-clock-v1");
  assert(gridReports.length > 0, `${clockRun.file}: no social-realistic-readiness-clock-v1 reports listed`);
  for (const record of gridReports) reportStatus(record.report, record.name);
  const grid = gridReports.map(({ name, report }) => summarizeGridReport(report, name));
  const allGridSessions = grid.flatMap((x) => x.sessions);
  if (!preview) {
    assert(!clockRun.isPending, "Cannot publish final aggregate while clock manifest is pending; use --preview for an incremental smoke summary.");
    assert(clockRun.manifest.gridComplete === true, "Clock manifest does not certify a complete profile grid");
    assert(clockRun.manifest.scenarioRuns.length === 10, `Expected 10 clock report pins, found ${clockRun.manifest.scenarioRuns.length}`);
    assert(allGridSessions.length === 90, `Expected the frozen 90-session realistic grid, found ${allGridSessions.length}`);
    const seeds = [...new Set(allGridSessions.map((s) => s.seed))].sort((a, b) => a - b);
    assert(JSON.stringify(seeds) === JSON.stringify(EXPECTED_SEEDS), `Clock grid seeds differ: ${seeds.join(",")}`);
    const profileCount = new Set(allGridSessions.map((s) => s.scenarioId)).size;
    assert(profileCount === 10, `Expected 10 realistic roster/court profiles, found ${profileCount}`);
    assert(allGridSessions.every((session) => session.status === "completed" && session.completedMatches === 100), "A realistic-grid session did not reach the 100-match endpoint");
    assert(EXPECTED_ARMS.every((arm) => allGridSessions.filter((session) => session.arm === arm).length === 30), "Clock grid does not contain 30 sessions per frozen arm");
    const pairs = buildGridPairs(allGridSessions);
    const aggregateRows = aggregatePairs(pairs);
    const clockHashes = grid.map((r) => ({ name: r.name, provenance: r.sourceProvenance }));
    const clockSources = assertSourceHashesAgree(clockHashes);
    assert(clockSources.matcherSourcesSha256 === hashes.matcherSourcesSha256, "Clock-grid matcher source hash differs from legacy search sessions");
    const manifestLegacyHashes = new Map((clockRun.manifest.legacyPhaseReports ?? []).map((item) => [item.file, item.sha256]));
    const provenanceLegacyHashes = clockRun.manifest.sourceProvenance?.legacyReportHashes ?? {};
    for (const item of legacy) {
      const relative = path.relative(ROOT, item.file).split(path.sep).join("/");
      const digest = sha256(readFileSync(item.file));
      assert(manifestLegacyHashes.get(relative) === digest, `Clock manifest does not pin the exact legacy input ${relative}`);
      assert(provenanceLegacyHashes[relative] === digest, `Clock source provenance does not pin the exact legacy input ${relative}`);
    }
    const concessions = allGridSessions.flatMap((s) => s.concessions.map((c) => ({ scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, ...c })));
    assert(concessions.every((c) => c.deficit === 1 && c.conditionalTBenefit > 0), "A clock-grid executed one-pair concession is not strictly beneficial");
    const candidateActual = allGridSessions.filter((s) => s.arm !== "production-immediate").reduce((total, s) => total + s.acceptedExecutions, 0);
    assert(allGridSessions.filter((s) => s.arm !== "production-immediate").every((s) => s.actualCallFailures.fairness === 0 && s.actualCallFailures.starvation === 0 && s.actualCallFailures.candidateGmax === 0 && s.actualCallFailures.candidatePriority === 0 && s.actualCallFailures.candidateVariety === 0), "A candidate actual-call cohort has incomplete certification");
    const allTelemetry = grid.flatMap((r) => r.telemetry);
    const searchSummary = summarizeSearchCalls(allTelemetry);
    const rescue = {
      executedOnePairConcessions: concessions.length,
      acceptedCandidateBatchDecisions: candidateActual,
      concessionRate: candidateActual ? concessions.length / candidateActual : null,
      positiveConditionalBenefits: concessions.filter((c) => c.conditionalTBenefit > 0).length,
      zeroConditionalBenefits: concessions.filter((c) => c.conditionalTBenefit === 0).length,
      negativeConditionalBenefits: concessions.filter((c) => c.conditionalTBenefit < 0).length,
      maximumDeficit: max(concessions.map((c) => c.deficit)),
      signedConditionalTBenefit: sum(concessions.map((c) => c.conditionalTBenefit)),
      comparativeNetTypeWindowUnits: sum(concessions.map((c) => c.comparativeNetTypeWindowUnits)),
      concessionsWithPriorFirstAppearanceComplete: concessions.filter((c) => c.firstAppearanceClassFixed).length,
      concessionsWithPriorFirstAppearanceIncomplete: concessions.filter((c) => !c.firstAppearanceClassFixed).length,
      concessions,
    };
    const summary = {
      schemaVersion: "social-readiness-summary-v1",
      generatedAt: new Date().toISOString(),
      analysisScriptSha256: sha256(readFileSync(new URL(import.meta.url), "utf8")),
      sourceHashes: {
        legacy: hashes,
        realisticClock: { ...clockSources, measurementSourceSha256: clockRun.manifest.sourceProvenance?.measurementSourcesSha256 ?? null },
      },
      legacyRuns: legacySummary,
      independentLegacyShortEndpoints: {
        path: path.relative(ROOT, independentEndpointFile),
        sha256: sha256(readFileSync(independentEndpointFile)),
        crossCheckedSavedCheckpointFields: independentEndpoints.crossCheckedSavedCheckpointFields,
        method: independentEndpoints.method,
        sessions: independentEndpoints.sessions,
      },
      realisticGrid: {
        reportNames: grid.map((x) => x.name),
        manifestPath: path.relative(ROOT, clockRun.file),
        sourceProvenance: clockRun.manifest.sourceProvenance,
        sessionCount: allGridSessions.length,
        sessions: allGridSessions,
        pairedRows: pairs,
        aggregates: aggregateRows,
        search: searchSummary,
        rescue,
        waits: {
          totalConditionalRefillOpportunities: sum(allGridSessions.filter((s) => s.scheduler === "conditional-wait").map((s) => s.waiting.opportunities)),
          waitsTaken: sum(allGridSessions.map((s) => s.waiting.waits)),
          allRefillWaitRate: sum(allGridSessions.map((s) => s.waiting.waits)) / sum(allGridSessions.filter((s) => s.scheduler === "conditional-wait").map((s) => s.waiting.opportunities)),
          sessionWaitRateMean: mean(allGridSessions.filter((s) => s.scheduler === "conditional-wait").map((s) => s.waiting.waitRate)),
          waitDurationMinutes: percentileBlock(allGridSessions.flatMap((s) => s.waiting.waitDurationsMinutes)),
          waitsPerFuturePreviewRate: (() => {
            const futurePreviews = allGridSessions.filter((s) => s.scheduler === "conditional-wait").reduce((total, s) => total + (s.searchByKind.future?.calls ?? 0), 0);
            return futurePreviews ? sum(allGridSessions.map((s) => s.waiting.waits)) / futurePreviews : null;
          })(),
          declinedReasons: allGridSessions.reduce((totals, session) => {
            for (const [reason, count] of Object.entries(session.waiting.declinedReasons)) totals[reason] = (totals[reason] ?? 0) + count;
            return totals;
          }, {}),
        },
        availableRest: {
          maximumActualAvailableRestTurns: max(allGridSessions.map((s) => s.actualMaximumAvailableRestTurns)),
          sessionsAtMaximumOrAboveFive: allGridSessions.filter((s) => s.actualMaximumAvailableRestTurns >= 5).map((s) => ({ scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, maximumActualAvailableRestTurns: s.actualMaximumAvailableRestTurns })),
        },
        certification: {
          candidateActualMatcherCalls: candidateActual,
          candidateActualCallFailures: allGridSessions.filter((s) => s.arm !== "production-immediate").reduce((totals, s) => {
            for (const [key, count] of Object.entries(s.actualCallFailures)) if (isNum(count)) totals[key] = (totals[key] ?? 0) + count;
            return totals;
          }, {}),
          actualCallSearchLimitsByArm: Object.fromEntries(EXPECTED_ARMS.map((arm) => [arm, sum(allGridSessions.filter((s) => s.arm === arm).map((s) => s.actualCallFailures.searchLimit))])),
        },
      },
      notes: {
        sessionsWithMissing100Endpoint: allGridSessions.filter((s) => s.endpoint100 === null).map((s) => ({ scenarioId: s.scenarioId, seed: s.seed, arm: s.arm, status: s.status, completedMatches: s.completedMatches })),
        allSessionsPreserved: true,
        checkpointAggregation: "Each cell reports reached sessions only and carries its observed session count; missing endpoints are not imputed.",
      },
    };
    const outputPath = path.join(clockDir, "social-readiness-summary-v1.json");
    const sessionCsv = path.join(clockDir, "social-readiness-session-checkpoints-v1.csv");
    const searchCsv = path.join(clockDir, "social-readiness-search-calls-v1.csv");
    const rescueCsv = path.join(clockDir, "social-readiness-rescue-costs-v1.csv");
    const pairedCsv = path.join(clockDir, "social-readiness-paired-deltas-v1.csv");
    const shortEndpointCsv = path.join(clockDir, "social-readiness-short-endpoints-v1.csv");
    writeArtifact(outputPath, `${JSON.stringify(summary, null, 2)}\n`, args.includes("--force"));
    const checkpointRows = allGridSessions.flatMap((s) => s.checkpointMetrics.map((r) => ({
      ...r,
      sessionStatus: s.status,
      sessionCompletedMatches: s.completedMatches,
      waits: s.waiting.waits,
      waitOpportunities: s.waiting.opportunities,
      waitRate: s.waiting.waitRate,
      countDistribution: JSON.stringify(r.countDistribution),
      playerMatchCounts: JSON.stringify(r.playerMatchCounts),
    })));
    writeArtifact(sessionCsv, toCsv(checkpointRows), args.includes("--force"));
    writeArtifact(searchCsv, toCsv(allTelemetry), args.includes("--force"));
    writeArtifact(rescueCsv, toCsv(concessions), args.includes("--force"));
    writeArtifact(pairedCsv, toCsv(pairs.map((row) => ({ scenarioId: row.scenarioId, seed: row.seed, completedMatches: row.completedMatches,
      candidateVsProduction: JSON.stringify(row.candidateVsProduction), conditionalVsCandidate: JSON.stringify(row.conditionalVsCandidate), varietyPerIdle: JSON.stringify(row.varietyPerIdle) }))), args.includes("--force"));
    writeArtifact(shortEndpointCsv, toCsv(independentEndpoints.sessions), args.includes("--force"));
    console.log(JSON.stringify({ outputPath, sessionCsv, searchCsv, rescueCsv, pairedCsv, shortEndpointCsv, gridSessions: allGridSessions.length, aggregateRows: aggregateRows.length, rescue: summary.realisticGrid.rescue, search: summary.realisticGrid.search.overall }, null, 2));
    return;
  }
  assert(clockRun.isPending || clockRun.manifest.validationStatus === "passed", "Preview requires a pending or passed manifest");
  const pairs = buildGridPairs(allGridSessions);
  const aggregates = aggregatePairs(pairs);
  console.log(JSON.stringify({
    status: "INCREMENTAL PREVIEW — NOT A FINAL VALIDATED AGGREGATE",
    manifest: path.relative(ROOT, clockRun.file),
    validatedClockReports: gridReports.length,
    pendingReports: clockRun.skippedPendingReports,
    observedSessions: allGridSessions.length,
    observedProfiles: new Set(allGridSessions.map((s) => s.scenarioId)).size,
    observedSeeds: [...new Set(allGridSessions.map((s) => s.seed))].sort((a, b) => a - b),
    profileCheckpoints: aggregates.map((row) => ({ scenarioId: row.scenarioId, completedMatches: row.completedMatches, armMeans: row.arms })),
  }, null, 2));
}

function writeArtifact(file, content, force) {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file) && !force) throw new Error(`Refusing to overwrite summary artifact ${file}; pass --force to replace generated summaries only.`);
  const temporary = `${file}.writing-${process.pid}`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, file);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    const rendered = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    return `"${rendered.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(","), ...rows.map((row) => columns.map((key) => cell(row[key])).join(","))].join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) main();
