import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sum = (values) => values.reduce((total, value) => total + value, 0);
const close = (actual, expected, where) => {
  assert(typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9,
    `${where}: ${actual} differs from ${expected}`);
};
const same = (actual, expected, where) => {
  if (typeof expected === "number") close(actual, expected, where);
  else if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, `${where}: array length differs`);
    expected.forEach((value, index) => same(actual[index], value, `${where}[${index}]`));
  } else if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", `${where}: missing object`);
    for (const [key, value] of Object.entries(expected)) same(actual[key], value, `${where}.${key}`);
  } else assert(actual === expected, `${where}: ${actual} differs from ${expected}`);
};

const typeOf = (match) => {
  const type = match.socialVariety?.courtType;
  if (type === "MIXED" || match.matchType === "MIXED") return "MIXED";
  return type === "UPPER" || type === "LOWER" || match.matchType === "OWN_SIDE" ? "OWN_SIDE" : null;
};
const normalizedPartition = (match) => {
  const teams = [match.team1, match.team2].map((team) => [...team].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { teams, courtType: typeOf(match) };
};
const layoutKey = (match) => JSON.stringify(normalizedPartition(match));
const checkpointAt = (checkpoints, completedMatches) => {
  if (Array.isArray(checkpoints)) return checkpoints.find((checkpoint) => checkpoint.completedMatches === completedMatches);
  return Object.values(checkpoints ?? {}).find((checkpoint) =>
    checkpoint.completedMatches === completedMatches || checkpoint.targetCompletedMatches === completedMatches);
};

function validateAssignments(session, label) {
  const started = [];
  for (const decision of session.decisions) {
    assert(decision.attempted === true, `${label}/decision${decision.decisionIndex}: missing call record`);
    assert(Number.isFinite(decision.elapsedMs) && decision.elapsedMs >= 0, `${label}/decision${decision.decisionIndex}: invalid duration`);
    const result = decision.result;
    for (const name of ["exploredBranches", "prunedBranches"]) {
      assert(Number.isSafeInteger(result[name]) && result[name] >= 0, `${label}/decision${decision.decisionIndex}: invalid ${name}`);
    }
    assert(typeof result.searchLimitReached === "boolean", `${label}/decision${decision.decisionIndex}: missing search-limit status`);
    assert(typeof result.fairnessCertified === "boolean" && typeof result.starvationCertified === "boolean",
      `${label}/decision${decision.decisionIndex}: missing fairness/starvation proof`);
    assert(typeof result.courtmateGainMaximumCertified === "boolean" && typeof result.priorityCertified === "boolean",
      `${label}/decision${decision.decisionIndex}: missing frontier/priority proof`);
    assert(typeof result.varietyOptimal === "boolean", `${label}/decision${decision.decisionIndex}: missing full-search certificate`);
    assert(decision.certificationSucceeded === Boolean(result.selectionReturned && result.fairnessCertified &&
      result.starvationCertified && result.courtmateGainMaximumCertified && result.priorityCertified && result.varietyOptimal),
    `${label}/decision${decision.decisionIndex}: certification summary differs from recorded proof`);
    if (decision.executed) {
      assert(decision.certificationSucceeded && result.varietyOptimal !== false,
        `${label}/decision${decision.decisionIndex}: uncertified selection was executed`);
      assert(result.selectionReturned, `${label}/decision${decision.decisionIndex}: executed without a returned batch`);
      assert(decision.selectedAssignments.length === decision.courtCount,
        `${label}/decision${decision.decisionIndex}: wrong executed court count`);
      const used = new Set();
      for (const assignment of decision.selectedAssignments) {
        assert(assignment.ids.length === 4 && new Set(assignment.ids).size === 4,
          `${label}/decision${decision.decisionIndex}: malformed assignment roster`);
        assert(assignment.partition.team1.length === 2 && assignment.partition.team2.length === 2,
          `${label}/decision${decision.decisionIndex}: malformed doubles partition`);
        same([...assignment.ids].sort(), [...assignment.partition.team1, ...assignment.partition.team2].sort(),
          `${label}/decision${decision.decisionIndex}.assignmentIds`);
        for (const id of assignment.ids) {
          assert(!used.has(id), `${label}/decision${decision.decisionIndex}: player assigned twice in a batch`);
          used.add(id);
        }
        assert(assignment.socialVariety && ["MIXED", "UPPER", "LOWER"].includes(assignment.socialVariety.courtType),
          `${label}/decision${decision.decisionIndex}: missing completed-history type snapshot`);
        started.push({ ...assignment, team1: assignment.partition.team1, team2: assignment.partition.team2,
          decisionIndex: decision.decisionIndex });
      }
    }
  }
  const remaining = new Map();
  for (const assignment of started) {
    const key = layoutKey(assignment);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (const [index, match] of session.completedHistory.entries()) {
    assert(match.team1.length === 2 && match.team2.length === 2 && new Set([...match.team1, ...match.team2]).size === 4,
      `${label}/match${index + 1}: invalid doubles record`);
    assert(typeOf(match), `${label}/match${index + 1}: completed match lacks a stable Social type snapshot`);
    const key = layoutKey(match);
    const count = remaining.get(key) ?? 0;
    assert(count > 0, `${label}/match${index + 1}: no certified executed assignment matches this layout`);
    remaining.set(key, count - 1);
  }
  return { startedAssignments: started.length, completedAssignments: session.completedHistory.length,
    pendingAssignments: started.length - session.completedHistory.length };
}

export function assertSocialFrontierScalabilityReport(report, {
  scenarioId,
  seeds,
  engineVersions = ["original-control", "current"],
  targetMatches = 100,
} = {}) {
  assert(report.schemaVersion === "social-frontier-scalability-v1", "Wrong frontier-scaling report schema");
  assert(report.validationStatus === "pending", "Reports are validated and promoted only by the runner after all checks pass");
  same(report.seeds, seeds, "seeds");
  same(report.engineVersions, engineVersions, "engineVersions");
  assert(report.targetMatches === targetMatches, "Wrong target match count");
  assert(report.policy === "courtmate-beneficial-rescue", "Unexpected priority policy");
  assert(report.scenarios.length === 1 && report.scenarios[0].id === scenarioId, "Wrong scenario cohort");
  assert(report.sessions.length === seeds.length * engineVersions.length, "Wrong session cohort size");
  const scenario = report.scenarios[0];
  const isOpeningOnly = scenario.openingOnly === true;
  const expectedCheckpoints = [21, 100].filter((value) => value <= targetMatches);
  const seen = new Set();
  for (const session of report.sessions) {
    const label = `${scenarioId}/${session.engineVersion}/seed${session.seed}`;
    assert(seeds.includes(session.seed) && engineVersions.includes(session.engineVersion), `${label}: outside requested cohort`);
    const key = `${session.engineVersion}/${session.seed}`;
    assert(!seen.has(key), `${label}: duplicate session`); seen.add(key);
    assert(session.scenario.id === scenarioId && session.targetMatches === targetMatches, `${label}: wrong session setup`);
    assert(session.diagnostics.defaultSearchBudgets === true, `${label}: search-budget overrides are not allowed`);
    assert(["completed", "search-limited", "uncertified-selection", "stalled", "opening-probe"].includes(session.status),
      `${label}: unknown status ${session.status}`);
    assert(session.decisions.length === session.diagnostics.attemptedCalls, `${label}: attempted-call count differs from trace`);
    assert(session.diagnostics.attemptedCalls >= 1, `${label}: no matcher calls were recorded`);
    const successful = session.decisions.filter((decision) => decision.certificationSucceeded).length;
    const withSelection = session.decisions.filter((decision) => decision.result.selectionReturned).length;
    const limited = session.decisions.filter((decision) => decision.result.searchLimitReached).length;
    const fair = session.decisions.filter((decision) => decision.result.fairnessCertified).length;
    const starved = session.decisions.filter((decision) => decision.result.starvationCertified).length;
    const gmax = session.decisions.filter((decision) => decision.result.courtmateGainMaximumCertified).length;
    same(session.diagnostics.certifiedCalls, successful, `${label}.certifiedCalls`);
    same(session.diagnostics.callsWithSelection, withSelection, `${label}.callsWithSelection`);
    same(session.diagnostics.searchLimitCalls, limited, `${label}.searchLimitCalls`);
    same(session.diagnostics.fairnessCertifiedCalls, fair, `${label}.fairnessCertifiedCalls`);
    same(session.diagnostics.starvationCertifiedCalls, starved, `${label}.starvationCertifiedCalls`);
    same(session.diagnostics.gMaximumCertifiedCalls, gmax, `${label}.gMaximumCertifiedCalls`);
    same(session.diagnostics.fullPriorityCertifiedCalls, successful, `${label}.fullPriorityCertifiedCalls`);
    close(session.diagnostics.totalEngineMs, sum(session.decisions.map((decision) => decision.elapsedMs)), `${label}.totalEngineMs`);
    close(session.diagnostics.maximumEngineMs, Math.max(...session.decisions.map((decision) => decision.elapsedMs)), `${label}.maximumEngineMs`);
    const assignmentCounts = validateAssignments(session, label);
    assert(session.completedHistory.length <= targetMatches, `${label}: completed beyond target`);
    if (isOpeningOnly) {
      assert(session.status === "opening-probe" && session.completedHistory.length === 0,
        `${label}: opening-only profile must not execute or extend history`);
    } else if (session.status === "completed") {
      assert(session.completedHistory.length === targetMatches, `${label}: completed status without target horizon`);
    } else {
      assert(session.stopReason && session.completedHistory.length < targetMatches,
        `${label}: incomplete status lacks a concrete stop reason`);
    }
    if (!isOpeningOnly) {
      const reached = expectedCheckpoints.filter((value) => value <= session.completedHistory.length);
      same(session.checkpoints.map((checkpoint) => checkpoint.completedMatches), reached, `${label}.checkpointTargets`);
      for (const checkpoint of session.checkpoints) {
        assert(checkpoint.scores && checkpoint.socialVariety3211 && checkpoint.fairness && checkpoint.rest,
          `${label}/checkpoint${checkpoint.completedMatches}: incomplete endpoint metrics`);
        assert(checkpoint.completedMatches <= session.completedHistory.length, `${label}: checkpoint beyond completed prefix`);
      }
    }
    if (assignmentCounts.pendingAssignments < 0) throw new Error(`${label}: more completions than started assignments`);
  }
  return { sessionCount: report.sessions.length, decisionCount: sum(report.sessions.map((session) => session.decisions.length)),
    completedMatches: sum(report.sessions.map((session) => session.completedHistory.length)) };
}

function assertHistoryEqual(actual, expected, where) {
  assert(actual.length === expected.length, `${where}: history length differs`);
  for (let index = 0; index < expected.length; index += 1) {
    const a = normalizedPartition(actual[index]);
    const e = normalizedPartition(expected[index]);
    same(a, e, `${where}[${index}]`);
  }
}

export function compareSocialFrontierSessionToSavedReference(session, referencePath, { expectedArm, targetMatches = 100 } = {}) {
  const absolutePath = path.resolve(referencePath);
  assert(existsSync(absolutePath), `Missing frozen comparison report: ${referencePath}`);
  const report = JSON.parse(readFileSync(absolutePath, "utf8"));
  assert(report.validationStatus === "passed", `Frozen comparison report is not validated: ${referencePath}`);
  let reference;
  if (report.socialCourtmateRescuePolicy === "beneficial") {
    assert(report.targetMatches === 100 && report.socialPriorityPolicy === "courtmate-beneficial-rescue",
      "Canonical beneficial-rescue report has an unexpected arm/horizon");
    reference = report.sessions.find((candidate) => candidate.seed === session.seed && candidate.profile === "narrow" &&
      candidate.sessionType === "SOCIAL_MIX");
  } else if (report.schemaVersion === "social-generalization-v1") {
    assert(report.scenarios?.length === 1 && report.scenarios[0].id === expectedArm?.scenarioId,
      "Generalization reference scenario differs from the requested profile");
    reference = report.sessions.find((candidate) => candidate.seed === session.seed && candidate.arm === (expectedArm?.arm ?? "courtmate-beneficial-rescue"));
  } else {
    throw new Error(`Unrecognized frozen comparison schema ${report.schemaVersion}`);
  }
  assert(reference, `No frozen reference session for seed ${session.seed}`);
  const label = `${session.scenario.id}/${session.engineVersion}/seed${session.seed}.history`;
  assert(session.completedHistory.length <= reference.completedHistory.length,
    `${label}: candidate exceeds the frozen comparison horizon`);
  assertHistoryEqual(session.completedHistory, reference.completedHistory.slice(0, session.completedHistory.length), label);
  if (targetMatches === 100 && session.status === "completed") {
    assert(session.completedHistory.length === reference.completedHistory.length,
      `${label}: full-horizon run has a different completed-history length`);
  }
  const matchedCheckpoints = [];
  for (const checkpoint of session.checkpoints) {
    const oldCheckpoint = checkpointAt(reference.checkpoints, checkpoint.completedMatches);
    assert(oldCheckpoint, `Frozen reference lacks checkpoint ${checkpoint.completedMatches}`);
    if (oldCheckpoint.socialVariety3211) {
      same(checkpoint.socialVariety3211, oldCheckpoint.socialVariety3211,
        `${session.scenario.id}/${session.engineVersion}/seed${session.seed}/checkpoint${checkpoint.completedMatches}.socialVariety3211`);
    } else if (oldCheckpoint.scores?.structural) {
      same(checkpoint.scores.structural, oldCheckpoint.scores.structural,
        `${session.scenario.id}/${session.engineVersion}/seed${session.seed}/checkpoint${checkpoint.completedMatches}.structural`);
    }
    matchedCheckpoints.push(checkpoint.completedMatches);
  }
  return {
    seed: session.seed,
    engineVersion: session.engineVersion,
    comparedMatches: session.completedHistory.length,
    referencePrefixMatches: true,
    fullHistoryMatches: targetMatches === 100 && session.status === "completed" &&
      session.completedHistory.length === reference.completedHistory.length,
    matchedCheckpoints,
  };
}

export function compareSocialFrontierEngineVersions(control, current) {
  const label = `${control.scenario.id}/seed${control.seed}`;
  assert(control.engineVersion === "original-control" && current.engineVersion === "current", `${label}: wrong engine pair`);
  assert(control.scenario.id === current.scenario.id && control.seed === current.seed, `${label}: pair mismatch`);
  const common = Math.min(control.completedHistory.length, current.completedHistory.length);
  const prefixMatches = control.completedHistory.slice(0, common).every((match, index) =>
    layoutKey(match) === layoutKey(current.completedHistory[index]));
  const completeHistoryMatches = control.completedHistory.length === current.completedHistory.length && prefixMatches;
  return {
    scenarioId: control.scenario.id,
    seed: control.seed,
    statusMatches: control.status === current.status,
    controlStatus: control.status,
    currentStatus: current.status,
    commonPrefixMatches: prefixMatches,
    completedHistoryMatches: completeHistoryMatches,
    controlCompletedMatches: control.completedHistory.length,
    currentCompletedMatches: current.completedHistory.length,
  };
}
