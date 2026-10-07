import { assertSocialJointRefillSession } from "./social-joint-refill-validation.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const DEFAULT_ARMS = ["production-immediate", "beneficial-immediate", "beneficial-conditional-wait"];

function same(actual, expected, where) {
  if (typeof expected === "number") {
    assert(typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9,
      `${where}: ${actual} differs from ${expected}`);
  } else if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, `${where}: array length differs`);
    expected.forEach((value, index) => same(actual[index], value, `${where}[${index}]`));
  } else if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", `${where}: missing object`);
    for (const [key, value] of Object.entries(expected)) same(actual[key], value, `${where}.${key}`);
  } else assert(actual === expected, `${where}: ${actual} differs from ${expected}`);
}

function layoutKey(assignment) {
  const teams = [assignment.partition.team1, assignment.partition.team2]
    .map((team) => [...team].sort())
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({ courtIndex: assignment.courtIndex, teams });
}

function previewRows(session) {
  const rows = [];
  for (const decision of session.decisions) {
    rows.push({ decisionId: decision.decisionId, previewKind: "immediate", preview: decision.immediatePreview,
      courtCount: decision.currentlyFreeCourtIndices.length });
    if (decision.futurePreview) rows.push({ decisionId: decision.decisionId, previewKind: "future", preview: decision.futurePreview.preview,
      courtCount: decision.futurePreview.fillCourtIndices.length });
    if (decision.execution) rows.push({ decisionId: decision.decisionId, previewKind: "execution", preview: decision.execution,
      courtCount: decision.executedCourtIndices.length });
  }
  return rows;
}

function verifyTelemetry(session, where) {
  const expected = previewRows(session);
  assert(session.searchTelemetry.length >= expected.length, `${where}: matcher telemetry omits a saved preview/execution`);
  if (session.status !== "error") same(session.searchTelemetry.length, expected.length, `${where}.searchTelemetryCount`);
  const proofKeys = {
    selectionReturned: "selectionReturned",
    exploredBranches: "exploredBranches",
    prunedBranches: "prunedBranches",
    searchLimitReached: "searchLimitReached",
    fairnessCertified: "fairnessCertified",
    starvationCertified: "starvationCertified",
    varietyOptimal: "matcherVarietyOptimal",
    replayCertified: "replayCertified",
    coverageGateCertified: "coverageGateCertified",
    priorityCertified: "priorityCertified",
    courtmateGainMaximumCertified: "gMaxCertified",
    courtmateGainMaximum: "courtmateGainMaximum",
    chosenCourtmateGain: "chosenCourtmateGain",
    chosenCourtmateGainDeficit: "chosenCourtmateGainDeficit",
    chosenRollingMatchTypeGain: "chosenRollingMatchTypeGain",
    bestRollingMatchTypeGainAtGmax: "bestRollingMatchTypeGainAtGmax",
  };
  for (const [index, row] of expected.entries()) {
    const telemetry = session.searchTelemetry[index];
    const label = `${where}/call${index + 1}`;
    same(telemetry.callIndex, index + 1, `${label}.index`);
    same(telemetry.scenarioId, session.scenario.id, `${label}.scenario`);
    same(telemetry.seed, session.seed, `${label}.seed`);
    same(telemetry.arm, session.arm, `${label}.arm`);
    same(telemetry.decisionId, row.decisionId, `${label}.decisionId`);
    same(telemetry.previewKind, row.previewKind, `${label}.previewKind`);
    assert(typeof telemetry.elapsedMs === "number" && Number.isFinite(telemetry.elapsedMs) && telemetry.elapsedMs >= 0,
      `${label}: invalid matcher runtime`);
    const preview = row.preview;
    const input = telemetry.input;
    same(input.courtCount, row.courtCount, `${label}.courtCount`);
    same(input.sessionMode, "MIXICANO", `${label}.sessionMode`);
    same(input.sessionType, "SOCIAL_MIX", `${label}.sessionType`);
    same(input.respectPlayerRest, true, `${label}.respectPlayerRest`);
    same(input.rotationPlayerCount, session.scenario.upper + session.scenario.lower, `${label}.rotationPlayerCount`);
    same(input.socialPriorityPolicy, session.engineVersion === "production" ? null : "courtmate-beneficial-rescue",
      `${label}.socialPriorityPolicy`);
    same(input.searchLimits, null, `${label}.searchLimits`);
    same([...input.availablePlayerIds].sort(), [...preview.availablePlayerIds].sort(), `${label}.availablePlayers`);
    same(input.completedHistoryIds, preview.completedHistoryMatchIds, `${label}.completedHistoryIds`);
    const expectedHistoryIds = [
      ...preview.completedHistoryMatchIds,
      ...preview.activeReservationSnapshots.map((reservation) => `active-${reservation.assignmentId}`),
    ].sort();
    same([...input.socialHistoryIds].sort(), expectedHistoryIds, `${label}.socialHistoryIds`);
    same(input.playerState.map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingBaseline: player.matchmakingBaseline,
      restTurns: player.restTurns,
      isBusy: player.isBusy,
      isPaused: player.isPaused,
    })), preview.playerStateSnapshot.map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingBaseline: player.matchmakingBaseline,
      restTurns: player.restTurns,
      isBusy: player.isBusy,
      isPaused: player.isPaused,
    })), `${label}.playerState`);
    for (const [telemetryKey, previewKey] of Object.entries(proofKeys)) {
      if (input.socialPriorityPolicy === null &&
          (telemetryKey === "chosenCourtmateGain" || telemetryKey === "chosenRollingMatchTypeGain")) {
        same(telemetry.proof[telemetryKey], null, `${label}.productionRaw.${telemetryKey}`);
        continue;
      }
      same(telemetry.proof[telemetryKey], preview.matcherCertificates[previewKey], `${label}.${telemetryKey}`);
    }
    const layouts = (assignments) => assignments.map((assignment) => ({ ids: assignment.ids, partition: assignment.partition }));
    same(layouts(telemetry.selectedAssignments), layouts(preview.chosenAssignments), `${label}.selectedAssignments`);
    if (telemetry.thrownError) throw new Error(`${label}: matcher call threw ${telemetry.thrownError}`);
  }
  for (const [offset, telemetry] of session.searchTelemetry.slice(expected.length).entries()) {
    const label = `${where}/orphanedCall${expected.length + offset + 1}`;
    same(session.status, "error", `${label}.sessionStatus`);
    same(telemetry.callIndex, expected.length + offset + 1, `${label}.index`);
    same(telemetry.decisionId, null, `${label}.decisionId`);
    same(telemetry.previewKind, "orphaned-error", `${label}.kind`);
    assert(typeof telemetry.thrownError === "string" && telemetry.thrownError.length > 0,
      `${label}: unassociated call does not preserve a thrown matcher error`);
    assert(Number.isFinite(telemetry.elapsedMs) && telemetry.elapsedMs >= 0, `${label}: invalid matcher runtime`);
  }
  return { matcherCalls: session.searchTelemetry.length, meanMs: session.searchTelemetry.length
    ? session.searchTelemetry.reduce((sum, row) => sum + row.elapsedMs, 0) / session.searchTelemetry.length : null,
  maximumMs: session.searchTelemetry.length ? Math.max(...session.searchTelemetry.map((row) => row.elapsedMs)) : null };
}

export function assertSocialReadinessClockReport(report, { scenario, seeds, targetCompletedMatches = 100 } = {}) {
  assert(report.schemaVersion === "social-realistic-readiness-clock-v1", "Wrong Social readiness clock schema");
  assert(report.validationStatus === "pending", "Only pending clock reports can be independently validated and promoted");
  same(report.scenario, scenario, "scenario");
  same(report.seeds, seeds, "seeds");
  same(report.targetCompletedMatches, targetCompletedMatches, "targetCompletedMatches");
  same(report.arms, DEFAULT_ARMS, "arms");
  same(report.timing, {
    baseDurationMinutes: 20,
    durationJitterFraction: 0.2,
    wakeThresholdMinutes: 5,
    minimumNewCourtmateGainPerCourt: 1,
    minimumRollingTypeGainPerCourt: 0.5,
    durationMinutesOverrides: {},
  }, "timing");
  same(report.sessions.length, seeds.length * DEFAULT_ARMS.length, "sessionCount");
  const seen = new Set();
  const sessions = [];
  for (const session of report.sessions) {
    assert(session.scenario.id === scenario.id, "Session is outside the selected scenario");
    assert(seeds.includes(session.seed), `${scenario.id}: session has an unrequested seed`);
    assert(DEFAULT_ARMS.includes(session.arm), `${scenario.id}: session has an unknown arm`);
    const key = `${session.seed}/${session.arm}`;
    assert(!seen.has(key), `${scenario.id}: duplicate session ${key}`);
    seen.add(key);
    const expectedEngine = session.arm === "production-immediate" ? "production" : "courtmate-beneficial-rescue";
    const expectedScheduler = session.arm === "beneficial-conditional-wait" ? "conditional-wait" : "immediate";
    same(session.engineVersion, expectedEngine, `${key}.engineVersion`);
    same(session.scheduler, expectedScheduler, `${key}.scheduler`);
    same(session.scenarioId, scenario.id, `${key}.scenarioId`);
    assert(["completed", "search-limited", "stalled", "error"].includes(session.status),
      `${key}: unknown session status ${session.status}`);
    assert(session.completedHistory.length <= targetCompletedMatches, `${key}: session exceeded the completed-match cap`);
    const baseValidation = assertSocialJointRefillSession(session, {
      scenarioId: scenario.id,
      seeds,
      targetCompletedMatches,
    });
    const telemetry = verifyTelemetry(session, `${scenario.id}/${key}`);
    sessions.push({ key, ...baseValidation, ...telemetry, waits: session.waiting.waitsTaken,
      completedMatches: session.completedHistory.length });
  }
  const pairedOpeningChecks = [];
  for (const seed of seeds) {
    const immediate = report.sessions.find((session) => session.seed === seed && session.arm === "beneficial-immediate");
    const conditional = report.sessions.find((session) => session.seed === seed && session.arm === "beneficial-conditional-wait");
    assert(immediate && conditional, `${scenario.id}/seed${seed}: missing candidate scheduler pair`);
    const opening = (session) => {
      const decision = session.decisions.find((entry) => entry.execution?.chosenAssignments?.length);
      if (!decision) return { key: null, certified: false };
      const certified = decision.executionAccepted === true && decision.execution.certified === true &&
        decision.execution.matcherCertificates.fairnessCertified === true &&
        decision.execution.matcherCertificates.starvationCertified === true &&
        (session.engineVersion === "production" ||
          (decision.execution.matcherCertificates.gMaxCertified === true &&
            decision.execution.matcherCertificates.priorityCertified === true &&
            decision.execution.matcherCertificates.matcherVarietyOptimal === true));
      return { key: JSON.stringify(decision.execution.chosenAssignments.map((assignment, index) => layoutKey({
        ...assignment,
        courtIndex: decision.executedCourtIndices[index],
      })).sort()), certified };
    };
    const immediateOpening = opening(immediate);
    const conditionalOpening = opening(conditional);
    const matches = immediateOpening.certified && conditionalOpening.certified
      ? immediateOpening.key === conditionalOpening.key : null;
    if (matches === false) throw new Error(`${scenario.id}/seed${seed}: certified beneficial openings differ between scheduler arms.`);
    pairedOpeningChecks.push({ seed, immediate: immediateOpening.key, conditional: conditionalOpening.key,
      bothOpeningCertified: immediateOpening.certified && conditionalOpening.certified, matches });
  }
  const successfulSessions = report.sessions.filter((session) => session.status === "completed" &&
    session.completedHistory.length === targetCompletedMatches).length;
  return {
    sessionCount: report.sessions.length,
    matcherCallCount: sessions.reduce((total, row) => total + row.matcherCalls, 0),
    completedMatches: sessions.reduce((total, row) => total + row.completedMatches, 0),
    waitsTaken: report.sessions.reduce((total, session) => total + session.waiting.waitsTaken, 0),
    successfulSessions,
    failedOrIncompleteSessions: report.sessions.length - successfulSessions,
    pairedOpeningChecks,
    sessions,
  };
}

export function assertSocialReadinessClockTamperResistance(report, options) {
  const clone = () => JSON.parse(JSON.stringify(report));
  const mustReject = (label, mutate) => {
    const altered = clone();
    mutate(altered);
    let rejected = false;
    try { assertSocialReadinessClockReport(altered, options); } catch { rejected = true; }
    assert(rejected, `Readiness validator accepted tampered ${label}.`);
  };
  const correlated = report.sessions.flatMap((session) => session.searchTelemetry)
    .find((row) => row.previewKind !== "orphaned-error");
  if (correlated) {
    mustReject("matcher branch count", (altered) => {
      const target = altered.sessions.flatMap((session) => session.searchTelemetry)
        .find((row) => row.previewKind !== "orphaned-error");
      target.proof.exploredBranches += 1;
    });
  } else {
    mustReject("orphaned matcher error", (altered) => {
      delete altered.sessions[0].searchTelemetry[0].thrownError;
    });
  }
  const candidate = report.sessions.find((session) => session.arm === "beneficial-conditional-wait" && session.decisions.length > 0);
  if (candidate) {
    mustReject("wait reason", (altered) => {
      const target = altered.sessions.find((session) => session.arm === "beneficial-conditional-wait" && session.decisions.length > 0);
      const decision = target.decisions.find((row) => row.decisionId > 1) ?? target.decisions[0];
      decision.waitReason = decision.decisionId === 1 ? "not-conditional-arm"
        : decision.waitReason === "no-material-gain" ? "wake-gap-too-long" : "no-material-gain";
    });
  }
  return { matcherEvidence: "rejected", waitReason: candidate ? "rejected" : "not-applicable" };
}
