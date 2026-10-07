import { reconstructSocialGeneralizationPrefix } from "./social-generalization-validation.mjs";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => values.length ? sum(values) / values.length : null;
const quantile95 = (values) => values.length
  ? [...values].sort((left, right) => left - right)[Math.max(0, Math.ceil(values.length * 0.95) - 1)]
  : null;
const close = (actual, expected, where, tolerance = 1e-8) => {
  if (actual === null || expected === null) {
    assert(actual === expected, `${where}: ${actual} differs from ${expected}`);
    return;
  }
  assert(typeof actual === "number" && Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) <= tolerance, `${where}: ${actual} differs from ${expected}`);
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
const keyPair = (left, right) => JSON.stringify([left, right].sort());
const sorted = (values) => [...values].sort((left, right) => left - right);
const layoutKey = (assignment) => {
  const teams = assignment.partition
    ? [assignment.partition.team1, assignment.partition.team2]
    : [assignment.team1, assignment.team2];
  return JSON.stringify(teams.map((team) => [...team].sort())
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
};
const snapshotType = (match) => {
  const type = match.socialVariety?.courtType;
  return type === "MIXED" ? "MIXED"
    : type === "UPPER" || type === "LOWER" ? "OWN_SIDE" : null;
};

const EXPECTED_SCENARIOS = {
  "edge-8-8-0-2c": { upper: 8, lower: 0, courtCount: 2, engineVersions: ["production", "courtmate-beneficial-rescue"] },
  "balanced-10-5-5-2c": { upper: 5, lower: 5, courtCount: 2, engineVersions: ["production", "courtmate-beneficial-rescue"] },
  "balanced-12-6-6-2c": { upper: 6, lower: 6, courtCount: 2, engineVersions: ["courtmate-beneficial-rescue"] },
  "balanced-12-6-6-3c": { upper: 6, lower: 6, courtCount: 3, engineVersions: ["courtmate-beneficial-rescue"] },
};
const SCHEDULERS = ["immediate", "conditional-wait"];
const PARK_MILLER_MODULUS = 2_147_483_647;

function rosterFor(scenario) {
  return [
    ...Array.from({ length: scenario.upper }, (_value, index) => ({ userId: `P${index + 1}`, side: "UPPER", isPaused: false })),
    ...Array.from({ length: scenario.lower }, (_value, index) => ({ userId: `P${scenario.upper + index + 1}`, side: "LOWER", isPaused: false })),
  ];
}

function feasibleTypes(roster) {
  const counts = {
    UPPER: roster.filter((player) => player.side === "UPPER").length,
    LOWER: roster.filter((player) => player.side === "LOWER").length,
  };
  return new Map(roster.map((player) => [player.userId, [
    ...(counts.UPPER >= 2 && counts.LOWER >= 2 ? ["MIXED"] : []),
    ...(counts[player.side] >= 4 ? ["OWN_SIDE"] : []),
  ]]));
}

function independentBatchGains(roster, history, assignments) {
  const seenPairs = new Set();
  for (const match of history) {
    const ids = [...match.team1, ...match.team2];
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) seenPairs.add(keyPair(ids[left], ids[right]));
    }
  }
  let newCourtmatePairCount = 0;
  let rollingMatchTypeGain = 0;
  const typesByPlayer = feasibleTypes(roster);
  for (const assignment of assignments) {
    const ids = [...assignment.ids];
    const type = snapshotType(assignment);
    assert(type, "selected preview is missing an assignment-time Social type");
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        if (!seenPairs.has(keyPair(ids[left], ids[right]))) newCourtmatePairCount += 1;
      }
    }
    for (const userId of ids) {
      const vocabulary = typesByPlayer.get(userId) ?? [];
      if (vocabulary.length === 0) continue;
      const prior = history.filter((match) => [...match.team1, ...match.team2].includes(userId))
        .map(snapshotType).slice(-6);
      const before = vocabulary.filter((candidate) => prior.includes(candidate)).length / vocabulary.length;
      const afterWindow = [...prior, type].slice(-6);
      const after = vocabulary.filter((candidate) => afterWindow.includes(candidate)).length / vocabulary.length;
      rollingMatchTypeGain += after - before;
    }
  }
  return { newCourtmatePairCount, rollingMatchTypeGain };
}

function validatePreview(preview, engineVersion, expectedCourtCount, where) {
  assert(preview && ["certified", "uncertified", "no-selection"].includes(preview.status), `${where}: missing preview status`);
  assert(typeof preview.certified === "boolean" && typeof preview.waitCertified === "boolean", `${where}: missing preview certification flags`);
  assert(preview.matcherCertificates && typeof preview.matcherCertificates === "object", `${where}: missing matcher certificate detail`);
  const certificates = preview.matcherCertificates;
  for (const name of ["selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified", "replayCertified", "coverageGateCertified", "matcherVarietyOptimal", "reportedVarietyOptimal", "searchLimitReached"]) {
    assert(typeof certificates[name] === "boolean", `${where}: missing ${name}`);
  }
  same(certificates.reportedVarietyOptimal, certificates.matcherVarietyOptimal, `${where}.reportedVarietyOptimal`);
  const productionProof = certificates.selectionReturned && certificates.courtCountCertified && certificates.fairnessCertified &&
    certificates.starvationCertified && certificates.replayCertified && certificates.coverageGateCertified;
  const candidateProof = certificates.selectionReturned && certificates.courtCountCertified && certificates.fairnessCertified &&
    certificates.starvationCertified && certificates.gMaxCertified && certificates.priorityCertified &&
    certificates.matcherVarietyOptimal && !certificates.searchLimitReached;
  if (engineVersion === "courtmate-beneficial-rescue") {
    assert(typeof certificates.gMaxCertified === "boolean" && typeof certificates.priorityCertified === "boolean",
      `${where}: candidate priority proofs missing`);
    same(certificates.socialPriorityPolicy, "courtmate-beneficial-rescue", `${where}.socialPriorityPolicy`);
  } else same(certificates.socialPriorityPolicy, null, `${where}.socialPriorityPolicy`);
  same(preview.certified, engineVersion === "production" ? Boolean(productionProof) : Boolean(candidateProof), `${where}.certified`);
  same(preview.waitCertified, Boolean(preview.certified && certificates.matcherVarietyOptimal && !certificates.searchLimitReached), `${where}.waitCertified`);
  same(preview.status, !certificates.selectionReturned ? "no-selection" : preview.certified ? "certified" : "uncertified", `${where}.status`);
  assert(Array.isArray(preview.chosenAssignments), `${where}: missing chosen assignment list`);
  if (!certificates.selectionReturned) same(preview.chosenAssignments.length, 0, `${where}.emptySelection`);
  same(certificates.courtCountCertified,
    Boolean(certificates.selectionReturned && preview.chosenAssignments.length === expectedCourtCount), `${where}.courtCountCertified`);
  if (preview.certified) {
    assert(preview.chosenAssignments.length > 0, `${where}: certified preview has no batch`);
    const expectedRequired = engineVersion === "production"
      ? ["selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified", "replayCertified", "coverageGateCertified"]
      : ["selectionReturned", "courtCountCertified", "fairnessCertified", "starvationCertified", "priorityCertified", "gMaxCertified", "varietyOptimal"];
    same(preview.requiredCertificates, expectedRequired, `${where}.requiredCertificates`);
  }
  if (!certificates.selectionReturned) return;
  const used = new Set();
  for (const [index, assignment] of preview.chosenAssignments.entries()) {
    assert(assignment.ids.length === 4 && new Set(assignment.ids).size === 4, `${where}/assignment${index}: malformed quartet`);
    for (const userId of assignment.ids) {
      assert(!used.has(userId), `${where}: player ${userId} is selected on multiple courts`);
      assert(preview.availablePlayerIds.includes(userId), `${where}: selected busy or unavailable player ${userId}`);
      used.add(userId);
    }
    assert(assignment.partition.team1.length === 2 && assignment.partition.team2.length === 2, `${where}: malformed doubles sides`);
    same([...assignment.ids].sort(), [...assignment.partition.team1, ...assignment.partition.team2].sort(), `${where}.assignmentRoster`);
    assert(assignment.socialVariety && ["MIXED", "UPPER", "LOWER"].includes(assignment.socialVariety.courtType), `${where}: missing stable type snapshot`);
  }
}

function verifyPreviewGains(preview, roster, history, where) {
  if (!preview.matcherCertificates.selectionReturned) {
    same(preview.gains.newCourtmatePairCount, null, `${where}.emptyC`);
    same(preview.gains.rollingMatchTypeGain, null, `${where}.emptyT`);
    return;
  }
  const gains = independentBatchGains(roster, history, preview.chosenAssignments);
  same(preview.gains.newCourtmatePairCount, gains.newCourtmatePairCount, `${where}.newC`);
  close(preview.gains.rollingMatchTypeGain, gains.rollingMatchTypeGain, `${where}.rollingT`);
  close(preview.gains.perCourtNewCourtmatePairs, gains.newCourtmatePairCount / preview.chosenAssignments.length, `${where}.perCourtC`);
  close(preview.gains.perCourtRollingMatchTypeGain, gains.rollingMatchTypeGain / preview.chosenAssignments.length, `${where}.perCourtT`);
  const certificates = preview.matcherCertificates;
  if (certificates.socialPriorityPolicy === "courtmate-beneficial-rescue") {
    if (certificates.chosenCourtmateGain !== null) same(certificates.chosenCourtmateGain, gains.newCourtmatePairCount, `${where}.chosenCourtmateGain`);
    if (certificates.chosenRollingMatchTypeGain !== null) close(certificates.chosenRollingMatchTypeGain, gains.rollingMatchTypeGain, `${where}.chosenRollingMatchTypeGain`);
    if (certificates.gMaxCertified) {
      assert(Number.isSafeInteger(certificates.courtmateGainMaximum) && certificates.courtmateGainMaximum >= gains.newCourtmatePairCount,
        `${where}: malformed or impossible Gmax`);
      same(certificates.chosenCourtmateGainDeficit, certificates.courtmateGainMaximum - gains.newCourtmatePairCount, `${where}.chosenCourtmateGainDeficit`);
      if (certificates.chosenCourtmateGainDeficit === 1) {
        assert(typeof certificates.bestRollingMatchTypeGainAtGmax === "number" &&
          gains.rollingMatchTypeGain > certificates.bestRollingMatchTypeGainAtGmax,
        `${where}: selected one-pair sacrifice does not strictly beat the Gmax signed-T frontier`);
      } else same(certificates.chosenCourtmateGainDeficit, 0, `${where}.admissibleDeficit`);
    } else {
      assert(!certificates.priorityCertified, `${where}: priority is claimed without a certified Gmax frontier`);
      same(certificates.courtmateGainMaximum, null, `${where}.uncertifiedGmax`);
    }
  }
}

function parkMillerDuration(seed, courtIndex, assignmentOrdinal) {
  const courtSalt = (0x51ed270b + Math.imul(courtIndex + 1, 0x9e3779b1)) >>> 0;
  let state = ((Math.abs(Math.floor(seed)) ^ courtSalt) >>> 0) % PARK_MILLER_MODULUS;
  if (state === 0) state = 1;
  let draw = 0;
  for (let index = 0; index < assignmentOrdinal; index += 1) {
    state = (state * 48_271) % PARK_MILLER_MODULUS;
    draw = state / PARK_MILLER_MODULUS;
  }
  return 20 * (0.8 + 0.4 * draw);
}

function parkMillerStateAfter(state, drawCount) {
  let next = state;
  for (let index = 0; index < drawCount; index += 1) next = (next * 48_271) % PARK_MILLER_MODULUS;
  return next;
}

function initialMatchRandomState(seed) {
  let state = Math.abs(Math.floor(seed)) % PARK_MILLER_MODULUS;
  if (state === 0) state = 1;
  return state;
}

function verifyRandomIsolation(session, where) {
  let state = initialMatchRandomState(session.seed);
  let drawCount = 0;
  for (const decision of session.decisions) {
    const previews = [decision.immediatePreview, decision.futurePreview?.preview].filter(Boolean);
    for (const preview of previews) {
      same(preview.randomStateBefore, state, `${where}/decision${decision.decisionId}.previewRandomBefore`);
      same(preview.randomStateAfter, parkMillerStateAfter(state, preview.randomDraws), `${where}/decision${decision.decisionId}.previewRandomAfter`);
    }
    if (decision.execution) {
      same(decision.actualRandomDrawsBefore, drawCount, `${where}/decision${decision.decisionId}.actualDrawsBefore`);
      same(decision.actualRandomStateBefore, state, `${where}/decision${decision.decisionId}.actualStateBefore`);
      same(decision.execution.randomStateBefore, state, `${where}/decision${decision.decisionId}.executionRandomBefore`);
      const after = parkMillerStateAfter(state, decision.execution.randomDraws);
      same(decision.execution.randomStateAfter, after, `${where}/decision${decision.decisionId}.executionRandomAfter`);
      drawCount += decision.execution.randomDraws;
      state = after;
      same(decision.actualRandomDrawsAfter, drawCount, `${where}/decision${decision.decisionId}.actualDrawsAfter`);
      same(decision.actualRandomStateAfter, state, `${where}/decision${decision.decisionId}.actualStateAfter`);
    } else {
      same(decision.actualRandomDrawsBefore, null, `${where}/decision${decision.decisionId}.noActualDrawBefore`);
      same(decision.actualRandomDrawsAfter, null, `${where}/decision${decision.decisionId}.noActualDrawAfter`);
      same(decision.actualRandomStateBefore, null, `${where}/decision${decision.decisionId}.noActualStateBefore`);
      same(decision.actualRandomStateAfter, null, `${where}/decision${decision.decisionId}.noActualStateAfter`);
    }
  }
}

function reconstructActualPlayerState(session, atMinutes, excludedDecisionId) {
  const precedesDecision = (assignment) => excludedDecisionId === undefined || assignment.decisionId < excludedDecisionId;
  const states = new Map(rosterFor(session.scenario).map((player) => [player.userId, {
    userId: player.userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    restTurns: 0,
    isBusy: false,
    isPaused: false,
    arrivalPriorityAt: null,
    lastCompletedAtMinutes: null,
  }]));
  const assignments = session.assignments;
  for (const group of session.completionGroups.filter((entry) => entry.completedAtMinutes <= atMinutes)) {
    const finishing = group.countedCourtIndices.map((courtIndex) => assignments.find((assignment) =>
      assignment.courtIndex === courtIndex && assignment.completedAtMinutes === group.completedAtMinutes &&
      assignment.completedMatchNumber !== null));
    const processed = new Set();
    for (const assignment of finishing.sort((left, right) => left.courtIndex - right.courtIndex)) {
      assert(assignment, `Cannot reconstruct completed assignment on court at ${group.completedAtMinutes}.`);
      const busy = new Set(assignments.filter((candidate) => precedesDecision(candidate) &&
        candidate.startedAtMinutes < group.completedAtMinutes &&
        candidate.plannedFinishAtMinutes >= group.completedAtMinutes &&
        !processed.has(candidate.assignmentId)).flatMap((candidate) => candidate.ids));
      for (const player of states.values()) if (!player.isPaused && !busy.has(player.userId)) player.restTurns += 1;
      for (const userId of assignment.ids) {
        const player = states.get(userId);
        player.matchesPlayed += 1;
        player.matchmakingBaseline = player.matchesPlayed;
        player.restTurns = 0;
        player.lastCompletedAtMinutes = group.completedAtMinutes;
      }
      processed.add(assignment.assignmentId);
    }
  }
  for (const player of states.values()) {
    player.isBusy = assignments.some((assignment) => precedesDecision(assignment) &&
      assignment.startedAtMinutes <= atMinutes && assignment.plannedFinishAtMinutes > atMinutes &&
      assignment.ids.includes(player.userId));
  }
  return [...states.values()];
}

function expectedActiveReservations(session, atMinutes, excludedDecisionId) {
  return session.assignments.filter((assignment) => assignment.decisionId < excludedDecisionId &&
    assignment.startedAtMinutes <= atMinutes && assignment.plannedFinishAtMinutes > atMinutes)
    .sort((left, right) => left.courtIndex - right.courtIndex)
    .map((assignment) => ({
      assignmentId: assignment.assignmentId,
      courtIndex: assignment.courtIndex,
      ids: assignment.ids,
      partition: assignment.partition,
      socialVariety: assignment.socialVariety,
      plannedFinishAtMinutes: assignment.plannedFinishAtMinutes,
    }));
}

function publicStateRows(states) {
  return states.map((row) => ({
    userId: row.userId,
    matchesPlayed: row.matchesPlayed,
    matchmakingBaseline: row.matchmakingBaseline,
    restTurns: row.restTurns,
    isBusy: row.isBusy,
    isPaused: row.isPaused,
    arrivalPriorityAt: row.arrivalPriorityAt,
  }));
}

function expectedFuturePlayerSnapshot(immediatePreview, futurePreview) {
  const rows = new Map(immediatePreview.playerStateSnapshot.map((row) => [row.userId, { ...row }]));
  const active = new Map(immediatePreview.activeReservationSnapshots.map((row) => [row.courtIndex, row]));
  const updates = [];
  for (const courtIndex of futurePreview.finishingCourtIndices) {
    const assignment = active.get(courtIndex);
    assert(assignment, `Future preview court ${courtIndex} is not in the active reservation snapshot.`);
    const busyPlayers = new Set([...active.values()].flatMap((row) => row.ids));
    for (const player of rows.values()) {
      if (!busyPlayers.has(player.userId) && !player.isPaused) {
        const before = player.restTurns;
        player.restTurns += 1;
        updates.push({ userId: player.userId, before, after: player.restTurns });
      }
    }
    for (const userId of assignment.ids) {
      const player = rows.get(userId);
      player.matchesPlayed += 1;
      player.matchmakingBaseline = player.matchesPlayed;
      player.restTurns = 0;
      player.isBusy = false;
    }
    active.delete(courtIndex);
  }
  for (const row of rows.values()) row.isBusy = [...active.values()].some((assignment) => assignment.ids.includes(row.userId));
  return {
    rows: [...rows.values()],
    updates,
    reservations: [...active.values()].sort((left, right) => left.courtIndex - right.courtIndex),
  };
}

function validatePreviewState(preview, expectedHistoryIds, expectedPlayerRows, expectedReservations, where) {
  same(preview.completedHistoryMatchIds, expectedHistoryIds, `${where}.completedHistoryIds`);
  same(preview.playerStateSnapshot, expectedPlayerRows, `${where}.playerStateSnapshot`);
  same(preview.activeReservationSnapshots, expectedReservations, `${where}.activeReservations`);
  const available = expectedPlayerRows.filter((player) => !player.isBusy && !player.isPaused).map((player) => player.userId).sort();
  same([...preview.availablePlayerIds].sort(), available, `${where}.availablePlayers`);
}

function verifyHistoryAndAssignments(session, where) {
  const { scenario, seed, targetCompletedMatches, assignments, completedHistory, completionGroups, decisions } = session;
  assert(completedHistory.length <= targetCompletedMatches && completedHistory.length <= 100, `${where}: completed-match cap exceeded`);
  const roster = rosterFor(scenario);
  const byAssignmentId = new Map();
  const ordinalByCourt = new Map(Array.from({ length: scenario.courtCount }, (_value, index) => [index, 0]));
  for (const [index, assignment] of assignments.entries()) {
    const label = `${where}/assignment${index + 1}`;
    assert(!byAssignmentId.has(assignment.assignmentId), `${label}: duplicate assignment ID`);
    byAssignmentId.set(assignment.assignmentId, assignment);
    assert(Number.isInteger(assignment.courtIndex) && assignment.courtIndex >= 0 && assignment.courtIndex < scenario.courtCount,
      `${label}: invalid physical court index`);
    const nextOrdinal = (ordinalByCourt.get(assignment.courtIndex) ?? 0) + 1;
    ordinalByCourt.set(assignment.courtIndex, nextOrdinal);
    same(assignment.assignmentOrdinal, nextOrdinal, `${label}.courtOrdinal`);
    close(assignment.plannedDurationMinutes, parkMillerDuration(seed, assignment.courtIndex, assignment.assignmentOrdinal), `${label}.duration`);
    close(assignment.plannedFinishAtMinutes, assignment.startedAtMinutes + assignment.plannedDurationMinutes, `${label}.finishTime`);
    assert(assignment.startedAtMinutes >= 0 && assignment.plannedDurationMinutes > 0, `${label}: invalid interval`);
    same(assignment.completedAtMinutes, assignment.completedMatchNumber === null ? null : assignment.plannedFinishAtMinutes, `${label}.completionTime`);
    const reachedTarget = session.status === "completed" && session.completedHistory.length === targetCompletedMatches;
    same(assignment.censoredAtTarget, reachedTarget && assignment.completedMatchNumber === null &&
      assignment.startedAtMinutes <= session.finalTime.elapsedMinutes, `${label}.censoredFlag`);
    const ids = assignment.ids;
    assert(ids.length === 4 && new Set(ids).size === 4 && ids.every((id) => roster.some((player) => player.userId === id)), `${label}: invalid player quartet`);
    same([...ids].sort(), [...assignment.partition.team1, ...assignment.partition.team2].sort(), `${label}.partitionRoster`);
    for (const row of assignment.playerStateAtAssignment) {
      assert(ids.includes(row.userId), `${label}: rest row for an unassigned player`);
      assert(Number.isInteger(row.restTurns) && row.restTurns >= 0 && Number.isInteger(row.priorMatchesPlayed) && row.priorMatchesPlayed >= 0,
        `${label}/${row.userId}: malformed rest/count state`);
    }
    same(assignment.playerStateAtAssignment.map((row) => row.userId).sort(), [...ids].sort(), `${label}.restCohort`);
  }

  for (const [index, assignment] of assignments.entries()) {
    const label = `${where}/assignment${index + 1}`;
    const expectedPlayers = new Map(reconstructActualPlayerState(session, assignment.startedAtMinutes, assignment.decisionId)
      .map((player) => [player.userId, player]));
    for (const row of assignment.playerStateAtAssignment) {
      const expected = expectedPlayers.get(row.userId);
      assert(expected, `${label}/${row.userId}: missing independently reconstructed player state`);
      same(row.priorMatchesPlayed, expected.matchesPlayed, `${label}/${row.userId}.priorMatchesPlayed`);
      same(row.restTurns, expected.restTurns, `${label}/${row.userId}.restTurns`);
      same(row.priorCompletedAtMinutes, expected.lastCompletedAtMinutes, `${label}/${row.userId}.priorCompletionTime`);
      const elapsed = expected.lastCompletedAtMinutes === null
        ? null : Math.max(0, assignment.startedAtMinutes - expected.lastCompletedAtMinutes);
      close(row.elapsedRestMinutes, elapsed, `${label}/${row.userId}.elapsedRestMinutes`);
      same(expected.isBusy, false, `${label}/${row.userId}.wasAlreadyBusy`);
      same(expected.isPaused, false, `${label}/${row.userId}.wasPaused`);
    }
  }

  const chronological = [...assignments].sort((left, right) => left.startedAtMinutes - right.startedAtMinutes || left.courtIndex - right.courtIndex);
  const priorEndByPlayer = new Map();
  for (const assignment of chronological) {
    for (const id of assignment.ids) {
      const priorEnd = priorEndByPlayer.get(id);
      if (priorEnd !== undefined) assert(assignment.startedAtMinutes >= priorEnd - 1e-9, `${where}: ${id} was assigned while their prior match was still active`);
      priorEndByPlayer.set(id, assignment.plannedFinishAtMinutes);
    }
  }
  const byCourt = new Map();
  for (const assignment of assignments) {
    const rows = byCourt.get(assignment.courtIndex) ?? [];
    rows.push(assignment);
    byCourt.set(assignment.courtIndex, rows);
  }
  for (const [courtIndex, rows] of byCourt) {
    rows.sort((left, right) => left.assignmentOrdinal - right.assignmentOrdinal);
    for (let index = 1; index < rows.length; index += 1) {
      assert(rows[index].startedAtMinutes >= rows[index - 1].plannedFinishAtMinutes - 1e-9,
        `${where}: physical court ${courtIndex} has overlapping assignments`);
    }
  }

  const expectedGroups = new Map();
  for (const assignment of assignments) {
    const key = assignment.plannedFinishAtMinutes;
    const group = expectedGroups.get(key) ?? [];
    group.push(assignment);
    expectedGroups.set(key, group);
  }
  const seenCompleted = new Map();
  for (const [groupIndex, group] of completionGroups.entries()) {
    const label = `${where}/completionGroup${groupIndex + 1}`;
    same(group.eventIndex, groupIndex + 1, `${label}.eventIndex`);
    const expected = expectedGroups.get(group.completedAtMinutes);
    assert(expected && expected.length > 0, `${label}: completion time has no matching assignments`);
    same(sorted(group.finishingCourtIndices), sorted(expected.map((assignment) => assignment.courtIndex)), `${label}.finishingCourts`);
    same(sorted([...group.countedCourtIndices, ...group.censoredCourtIndices]), sorted(group.finishingCourtIndices), `${label}.tiePartition`);
    assert(new Set([...group.countedCourtIndices, ...group.censoredCourtIndices]).size === group.finishingCourtIndices.length,
      `${label}: completion group duplicated a court`);
    same(group.completedMatchNumbers.length, group.countedCourtIndices.length, `${label}.countedNumbers`);
    let nextMatchNumber = completedHistory.length - completionGroups.slice(groupIndex + 1).reduce((count, later) => count + later.completedMatchNumbers.length, 0) - group.completedMatchNumbers.length + 1;
    for (const courtIndex of sorted(group.countedCourtIndices)) {
      const assignment = expected.find((candidate) => candidate.courtIndex === courtIndex);
      assert(assignment, `${label}: counted court has no assignment`);
      same(assignment.completedMatchNumber, nextMatchNumber, `${label}.matchNumber`);
      same(assignment.censoredAtTarget, false, `${label}.countedNotCensored`);
      seenCompleted.set(nextMatchNumber, assignment);
      nextMatchNumber += 1;
    }
    for (const courtIndex of group.censoredCourtIndices) {
      const assignment = expected.find((candidate) => candidate.courtIndex === courtIndex);
      assert(assignment, `${label}: censored court has no assignment`);
      same(assignment.completedMatchNumber, null, `${label}.censoredMatchNumber`);
    }
  }
  same(seenCompleted.size, completedHistory.length, `${where}.historyAssignmentCount`);
  for (const [index, match] of completedHistory.entries()) {
    const matchNumber = index + 1;
    const assignment = seenCompleted.get(matchNumber);
    assert(assignment, `${where}/match${matchNumber}: no completed assignment trace`);
    same(layoutKey(match), layoutKey(assignment), `${where}/match${matchNumber}.layout`);
    same(match.socialVariety, assignment.socialVariety, `${where}/match${matchNumber}.snapshot`);
    assert(snapshotType(match), `${where}/match${matchNumber}: missing stable court type`);
    same(match.id, `M${matchNumber}`, `${where}/match${matchNumber}.historyId`);
    const completedAtMinutes = (Date.parse(match.completedAt) - Date.parse("2026-10-03T00:00:00.000Z")) / 60_000;
    close(completedAtMinutes, assignment.completedAtMinutes, `${where}/match${matchNumber}.completionDate`, 1 / 60_000);
  }

  const assignmentsByDecision = new Map();
  for (const assignment of assignments) {
    const list = assignmentsByDecision.get(assignment.decisionId) ?? [];
    list.push(assignment);
    assignmentsByDecision.set(assignment.decisionId, list);
  }
  for (const [index, decision] of decisions.entries()) {
    const label = `${where}/decision${index + 1}`;
    same(decision.decisionId, index + 1, `${label}.id`);
    validatePreview(decision.immediatePreview, session.engineVersion, decision.currentlyFreeCourtIndices.length, `${label}.immediate`);
    const prefixAt = (time) => completedHistory.filter((_match, matchIndex) => {
      const assignment = seenCompleted.get(matchIndex + 1);
      return assignment && assignment.completedAtMinutes <= time;
    });
    const currentPrefix = completedHistory.slice(0, decision.completedMatchesAtDecision);
    same(decision.completedMatchesAtDecision, prefixAt(decision.atMinutes).length, `${label}.completedCountAtDecision`);
    const currentHistoryIds = currentPrefix.map((match) => match.id);
    same(currentHistoryIds, decision.immediatePreview.completedHistoryMatchIds, `${label}.currentHistorySnapshot`);
    const immediatePlayerState = publicStateRows(reconstructActualPlayerState(session, decision.atMinutes, decision.decisionId));
    const immediateReservations = expectedActiveReservations(session, decision.atMinutes, decision.decisionId);
    validatePreviewState(decision.immediatePreview, currentHistoryIds, immediatePlayerState, immediateReservations, `${label}.immediateState`);
    verifyPreviewGains(decision.immediatePreview, roster, currentPrefix, `${label}.immediate`);
    const activeAtDecision = assignments.filter((assignment) => assignment.decisionId < decision.decisionId && assignment.startedAtMinutes <= decision.atMinutes &&
      assignment.plannedFinishAtMinutes > decision.atMinutes);
    const busyCourts = new Set(activeAtDecision.map((assignment) => assignment.courtIndex));
    const expectedFreeCourts = Array.from({ length: scenario.courtCount }, (_value, courtIndex) => courtIndex)
      .filter((courtIndex) => !busyCourts.has(courtIndex));
    same(sorted(decision.currentlyFreeCourtIndices), expectedFreeCourts, `${label}.freeCourts`);
    const busyPlayers = new Set(activeAtDecision.flatMap((assignment) => assignment.ids));
    const expectedAvailablePlayers = roster.map((player) => player.userId).filter((userId) => !busyPlayers.has(userId)).sort();
    same([...decision.availablePlayerIds].sort(), expectedAvailablePlayers, `${label}.availablePlayers`);
    same([...decision.immediatePreview.availablePlayerIds].sort(), expectedAvailablePlayers, `${label}.previewAvailablePlayers`);
    if (decision.futurePreview) {
      validatePreview(decision.futurePreview.preview, session.engineVersion, decision.futurePreview.fillCourtIndices.length, `${label}.future`);
      const nextFinish = Math.min(...activeAtDecision.map((assignment) => assignment.plannedFinishAtMinutes));
      const finishing = activeAtDecision.filter((assignment) => assignment.plannedFinishAtMinutes === nextFinish)
        .sort((left, right) => left.courtIndex - right.courtIndex);
      const predictedIds = finishing.map((_assignment, finishIndex) => `M${currentPrefix.length + finishIndex + 1}`);
      same(decision.futurePreview.simulatedCompletionMatchIds, predictedIds, `${label}.futureSimulatedIds`);
      const immediateActive = new Map(decision.immediatePreview.activeReservationSnapshots.map((row) => [row.courtIndex, row]));
      const futureMatches = finishing.map((assignment, finishIndex) => {
        const reservation = immediateActive.get(assignment.courtIndex);
        assert(reservation, `${label}: predicted finisher missing from immediate reservations`);
        return {
          id: predictedIds[finishIndex],
          team1: [...reservation.partition.team1],
          team2: [...reservation.partition.team2],
          socialVariety: reservation.socialVariety,
        };
      });
      const futurePrefix = [...currentPrefix, ...futureMatches];
      same(futurePrefix.map((match) => match.id), decision.futurePreview.preview.completedHistoryMatchIds, `${label}.futureHistorySnapshot`);
      verifyPreviewGains(decision.futurePreview.preview, roster, futurePrefix, `${label}.future`);
      same(decision.futurePreview.completionAtMinutes, nextFinish, `${label}.futureTime`);
      close(decision.futurePreview.predictedGapMinutes, nextFinish - decision.atMinutes, `${label}.futureGap`);
      same(sorted(decision.futurePreview.finishingCourtIndices), sorted(finishing.map((assignment) => assignment.courtIndex)), `${label}.futureFinishingCourts`);
      same(sorted(decision.futurePreview.fillCourtIndices), sorted([...expectedFreeCourts, ...finishing.map((assignment) => assignment.courtIndex)]), `${label}.futureFillCourts`);
      same(sorted(decision.futurePreview.remainingBusyCourtIndices), sorted(activeAtDecision
        .filter((assignment) => !finishing.includes(assignment)).map((assignment) => assignment.courtIndex)), `${label}.remainingBusyCourts`);
      const futureState = expectedFuturePlayerSnapshot(decision.immediatePreview, decision.futurePreview);
      same(decision.futurePreview.simulatedRestUpdates, futureState.updates, `${label}.futureRestUpdates`);
      validatePreviewState(decision.futurePreview.preview, futurePrefix.map((match) => match.id),
        futureState.rows, futureState.reservations, `${label}.futureState`);
    } else {
      const needsFuture = session.scheduler === "conditional-wait" && decision.decisionId > 1 &&
        decision.immediatePreview.waitCertified && activeAtDecision.length > 0 &&
        currentPrefix.length + activeAtDecision.filter((assignment) => assignment.plannedFinishAtMinutes ===
          Math.min(...activeAtDecision.map((candidate) => candidate.plannedFinishAtMinutes))).length < targetCompletedMatches;
      assert(!needsFuture, `${label}: missing eligible next-completion preview`);
    }
    assert(SCHEDULERS.includes(session.scheduler), `${label}: invalid scheduler`);
    assert(session.scheduler === "conditional-wait" || !decision.waited, `${label}: immediate scheduler waited`);
    if (decision.waited) {
      same(session.scheduler, "conditional-wait", `${label}.waitScheduler`);
      assert(decision.immediatePreview.waitCertified && decision.futurePreview?.preview.waitCertified,
        `${label}: wait was taken without two exact-search proofs`);
      assert(decision.futurePreview.predictedGapMinutes <= 5, `${label}: wait exceeded the five-minute limit`);
      const deltaC = decision.futurePreview.preview.gains.perCourtNewCourtmatePairs - decision.immediatePreview.gains.perCourtNewCourtmatePairs;
      const deltaT = decision.futurePreview.preview.gains.perCourtRollingMatchTypeGain - decision.immediatePreview.gains.perCourtRollingMatchTypeGain;
      assert(deltaC >= 1 || deltaT >= 0.5, `${label}: wait lacked the prespecified C/T benefit`);
      assert(decision.waitReason === "waited-for-next-completion" || decision.waitReason === "waited-but-target-reached",
        `${label}: invalid wait reason ${decision.waitReason}`);
      if (decision.waitReason === "waited-but-target-reached") {
        same(decision.execution, null, `${label}.targetReachedNoExecution`);
        same(decision.executedAtMinutes, null, `${label}.targetReachedNoExecutionTime`);
      }
    } else if (session.scheduler === "immediate") {
      same(decision.waitReason, decision.decisionId === 1 ? "opening-batch-must-start" : "not-conditional-arm", `${label}.immediateWaitReason`);
    }
    if (session.scheduler === "conditional-wait" && decision.decisionId > 1) {
      let expectedReason;
      let expectedWait = false;
      if (!decision.immediatePreview.waitCertified) {
        expectedReason = "current-preview-uncertified";
      } else if (activeAtDecision.length === 0) {
        expectedReason = "no-busy-court";
      } else if (!decision.futurePreview) {
        expectedReason = "target-reached-before-refill";
      } else if (decision.futurePreview.predictedGapMinutes > 5) {
        expectedReason = "wake-gap-too-long";
      } else if (!decision.futurePreview.preview.waitCertified ||
          decision.futurePreview.preview.gains.perCourtNewCourtmatePairs === null ||
          decision.immediatePreview.gains.perCourtNewCourtmatePairs === null ||
          decision.futurePreview.preview.gains.perCourtRollingMatchTypeGain === null ||
          decision.immediatePreview.gains.perCourtRollingMatchTypeGain === null) {
        expectedReason = "future-preview-uncertified";
      } else {
        const deltaC = decision.futurePreview.preview.gains.perCourtNewCourtmatePairs - decision.immediatePreview.gains.perCourtNewCourtmatePairs;
        const deltaT = decision.futurePreview.preview.gains.perCourtRollingMatchTypeGain - decision.immediatePreview.gains.perCourtRollingMatchTypeGain;
        expectedWait = deltaC >= 1 || deltaT >= 0.5;
        expectedReason = expectedWait ? "waited-for-next-completion" : "no-material-gain";
      }
      const reachedTargetAfterWait = expectedWait && decision.waited && decision.execution === null &&
        session.completedHistory.length === targetCompletedMatches && decision.waitReason === "waited-but-target-reached";
      if (!reachedTargetAfterWait) same(decision.waitReason, expectedReason, `${label}.independentWaitReason`);
      same(decision.waited, expectedWait, `${label}.independentWaitDecision`);
    }
    const started = assignmentsByDecision.get(decision.decisionId) ?? [];
    if (decision.execution) {
      const executionCourtCount = decision.waited
        ? decision.futurePreview?.fillCourtIndices.length ?? 0
        : decision.currentlyFreeCourtIndices.length;
      validatePreview(decision.execution, session.engineVersion, executionCourtCount, `${label}.execution`);
      const executionTime = decision.executedAtMinutes ??
        (decision.waited ? decision.futurePreview?.completionAtMinutes : decision.atMinutes);
      assert(typeof executionTime === "number" && Number.isFinite(executionTime), `${label}: execution attempt has no reconstructable time`);
      const executionPrefix = prefixAt(executionTime);
      same(executionPrefix.map((match) => match.id), decision.execution.completedHistoryMatchIds, `${label}.executionHistorySnapshot`);
      const executionPlayerState = publicStateRows(reconstructActualPlayerState(session, executionTime, decision.decisionId));
      const executionReservations = expectedActiveReservations(session, executionTime, decision.decisionId);
      validatePreviewState(decision.execution, executionPrefix.map((match) => match.id), executionPlayerState,
        executionReservations, `${label}.executionState`);
      verifyPreviewGains(decision.execution, roster, executionPrefix, `${label}.execution`);
    }
    if (started.length > 0) {
      assert(decision.execution && decision.executionAccepted === true && decision.execution.certified, `${label}: executed batch lacks ordinary engine certification`);
      if (session.engineVersion === "courtmate-beneficial-rescue") {
        assert(decision.execution.matcherCertificates.priorityCertified && decision.execution.matcherCertificates.gMaxCertified &&
          decision.execution.matcherCertificates.matcherVarietyOptimal, `${label}: candidate executed without full priority proof`);
      }
      same(decision.execution.chosenAssignments.length, started.length, `${label}.executedBatchSize`);
      same(sorted(decision.executedCourtIndices), sorted(started.map((assignment) => assignment.courtIndex)), `${label}.executedCourts`);
      close(decision.executedAtMinutes, started[0].startedAtMinutes, `${label}.executeTime`);
      for (const assignment of started) {
        same(assignment.startedAtMinutes, decision.executedAtMinutes, `${label}.assignmentStart`);
        const choice = decision.execution.chosenAssignments[decision.executedCourtIndices.indexOf(assignment.courtIndex)];
        same(layoutKey(assignment), layoutKey(choice), `${label}.selectedLayout`);
        same(assignment.socialVariety, choice.socialVariety, `${label}.selectedSnapshot`);
      }
    } else if (decision.execution) {
      assert(decision.executionAccepted === false && decision.executedAtMinutes === null && decision.executedCourtIndices.length === 0,
        `${label}: a rejected selection was marked as started`);
    } else {
      same(decision.executionAccepted, null, `${label}.noExecutionAcceptance`);
      same(decision.executedAtMinutes, null, `${label}.noExecutionTime`);
      same(decision.executedCourtIndices, [], `${label}.noExecutionCourts`);
    }
  }
  verifyRandomIsolation(session, where);
  return { roster, assignmentsByDecision, seenCompleted };
}

function reconstructTimeMetrics(session, atMinutes) {
  let busyCourtMinutes = 0;
  for (const assignment of session.assignments) {
    if (assignment.startedAtMinutes >= atMinutes) continue;
    busyCourtMinutes += Math.max(0, Math.min(assignment.plannedFinishAtMinutes, atMinutes) - assignment.startedAtMinutes);
  }
  const idleCourtMinutes = Math.max(0, session.scenario.courtCount * atMinutes - busyCourtMinutes);
  const refillDelays = [];
  let terminalOpenRefillIntervalCount = 0;
  for (let courtIndex = 0; courtIndex < session.scenario.courtCount; courtIndex += 1) {
    const rows = session.assignments.filter((assignment) => assignment.courtIndex === courtIndex && assignment.startedAtMinutes < atMinutes)
      .sort((left, right) => left.assignmentOrdinal - right.assignmentOrdinal);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1], next = rows[index];
      if (previous.plannedFinishAtMinutes < atMinutes && next.startedAtMinutes < atMinutes) {
        refillDelays.push(next.startedAtMinutes - previous.plannedFinishAtMinutes);
      }
    }
    const last = rows.at(-1);
    if (last && last.plannedFinishAtMinutes <= atMinutes) terminalOpenRefillIntervalCount += 1;
  }
  return {
    elapsedMinutes: atMinutes,
    busyCourtMinutes,
    idleCourtMinutes,
    idleFraction: atMinutes > 0 ? idleCourtMinutes / (atMinutes * session.scenario.courtCount) : null,
    closedRefillDelayCount: refillDelays.length,
    meanRefillDelayMinutes: mean(refillDelays),
    p95RefillDelayMinutes: quantile95(refillDelays),
    maximumRefillDelayMinutes: refillDelays.length ? Math.max(...refillDelays) : null,
    terminalOpenRefillIntervalCount,
  };
}

function verifyTimeMetrics(actual, session, atMinutes, where) {
  const expected = reconstructTimeMetrics(session, atMinutes);
  close(actual.elapsedMinutes, expected.elapsedMinutes, `${where}.elapsedMinutes`);
  close(actual.busyCourtMinutes, expected.busyCourtMinutes, `${where}.busyCourtMinutes`, 1e-6);
  close(actual.idleCourtMinutes, expected.idleCourtMinutes, `${where}.idleCourtMinutes`, 1e-6);
  close(actual.idleFraction, expected.idleFraction, `${where}.idleFraction`);
  same(actual.closedRefillDelayCount, expected.closedRefillDelayCount, `${where}.closedRefillDelayCount`);
  close(actual.meanRefillDelayMinutes, expected.meanRefillDelayMinutes, `${where}.meanRefillDelay`);
  close(actual.p95RefillDelayMinutes, expected.p95RefillDelayMinutes, `${where}.p95RefillDelay`);
  close(actual.maximumRefillDelayMinutes, expected.maximumRefillDelayMinutes, `${where}.maximumRefillDelay`);
  same(actual.terminalOpenRefillIntervalCount, expected.terminalOpenRefillIntervalCount, `${where}.terminalOpenRefillIntervals`);
}

function verifyRestAndTime(session, checkpoint, where) {
  const matches = session.completedHistory.slice(0, checkpoint.completedMatches);
  const completedAssignments = session.assignments.filter((assignment) => assignment.completedMatchNumber !== null &&
    assignment.completedMatchNumber <= checkpoint.completedMatches);
  const playerCounts = new Map(rosterFor(session.scenario).map((player) => [player.userId, 0]));
  for (const match of matches) for (const userId of [...match.team1, ...match.team2]) playerCounts.set(userId, (playerCounts.get(userId) ?? 0) + 1);
  const counts = [...playerCounts.entries()].map(([userId, matchesPlayed]) => ({ userId, matchesPlayed }));
  const minimum = Math.min(...counts.map((row) => row.matchesPlayed));
  const maximum = Math.max(...counts.map((row) => row.matchesPlayed));
  same(checkpoint.matchCountFairness.playerMatchCounts, counts, `${where}.playerMatchCounts`);
  same(checkpoint.matchCountFairness.minimum, minimum, `${where}.minimumMatches`);
  same(checkpoint.matchCountFairness.maximum, maximum, `${where}.maximumMatches`);
  same(checkpoint.matchCountFairness.spread, maximum - minimum, `${where}.spread`);

  const assignmentRows = completedAssignments.flatMap((assignment) => assignment.playerStateAtAssignment
    .filter((row) => row.priorMatchesPlayed > 0));
  const restTurns = assignmentRows.map((row) => row.restTurns);
  const elapsed = assignmentRows.map((row) => row.elapsedRestMinutes).filter((value) => value !== null);
  same(checkpoint.rest.eligiblePostFirstAppearances, assignmentRows.length, `${where}.restDenominator`);
  same(checkpoint.rest.backToBackCount, restTurns.filter((turns) => turns === 0).length, `${where}.backToBackCount`);
  close(checkpoint.rest.backToBackRate, restTurns.length ? restTurns.filter((turns) => turns === 0).length / restTurns.length : null, `${where}.backToBackRate`);
  close(checkpoint.rest.meanAssignmentRestTurns, mean(restTurns), `${where}.meanRestTurns`);
  close(checkpoint.rest.p95AssignmentRestTurns, quantile95(restTurns), `${where}.p95RestTurns`);
  same(checkpoint.rest.maximumAssignmentRestTurns, restTurns.length ? Math.max(...restTurns) : 0, `${where}.maximumRestTurns`);
  close(checkpoint.rest.meanElapsedRestMinutes, mean(elapsed), `${where}.meanElapsedRest`);
  close(checkpoint.rest.p95ElapsedRestMinutes, quantile95(elapsed), `${where}.p95ElapsedRest`);
  same(checkpoint.rest.maximumElapsedRestMinutes, elapsed.length ? Math.max(...elapsed) : 0, `${where}.maximumElapsedRest`);

  verifyTimeMetrics(checkpoint.time, session, checkpoint.atMinutes, where);
}

function verifySession(session, scenarioId, seeds, targetCompletedMatches) {
  const label = `${scenarioId}/${session.engineVersion}/${session.scheduler}/seed${session.seed}`;
  assert(seeds.includes(session.seed), `${label}: unrequested seed`);
  assert(session.targetCompletedMatches === targetCompletedMatches, `${label}: wrong horizon`);
  assert(["completed", "search-limited", "stalled", "error"].includes(session.status), `${label}: invalid session status`);
  if (session.status === "error") {
    assert(typeof session.error === "string" && session.error.length > 0, `${label}: error status lacks error text`);
    assert(Array.isArray(session.decisions) && Array.isArray(session.assignments) && Array.isArray(session.completedHistory),
      `${label}: error session lacks partial trace arrays`);
    assert(session.completedHistory.length <= targetCompletedMatches, `${label}: error session exceeded the match target`);
    return {
      session: label,
      completedMatches: session.completedHistory.length,
      decisions: session.decisions.length,
      assignments: session.assignments.length,
      waits: session.waiting?.waitsTaken ?? 0,
      status: session.status,
      error: session.error,
      checkpoints: session.checkpoints?.map((checkpoint) => checkpoint.completedMatches) ?? [],
    };
  }
  assert(session.methodology && session.methodology.durationFormula.includes("0.8") &&
    session.methodology.durationFormula.includes("0.4"), `${label}: duration method is not recorded`);
  same(session.timing, {
    baseDurationMinutes: 20,
    durationJitterFraction: 0.2,
    wakeThresholdMinutes: 5,
    minimumNewCourtmateGainPerCourt: 1,
    minimumRollingTypeGainPerCourt: 0.5,
    durationMinutesOverrides: {},
  }, `${label}.timing`);
  const { roster, assignmentsByDecision } = verifyHistoryAndAssignments(session, label);
  const checkpointTargets = [...new Set([Math.round(6 * roster.length / 4), 50, 100])].filter((target) => target <= session.completedHistory.length);
  same(session.checkpoints.map((checkpoint) => checkpoint.targetCompletedMatches), checkpointTargets, `${label}.checkpointTargets`);
  for (const checkpoint of session.checkpoints) {
    const where = `${label}/checkpoint${checkpoint.completedMatches}`;
    same(checkpoint.completedMatches, checkpoint.targetCompletedMatches, `${where}.actualTarget`);
    assert(checkpoint.completedMatches <= session.completedHistory.length, `${where}: checkpoint exceeds history`);
    const prefix = session.completedHistory.slice(0, checkpoint.completedMatches);
    const independent = reconstructSocialGeneralizationPrefix(roster, prefix);
    same(checkpoint.scores.structural, independent, `${where}.structuralScore`);
    same(checkpoint.scores.opportunity, null, `${where}.opportunityScore`);
    const typeCounts = { MIXED: 0, OWN_SIDE: 0 };
    for (const match of prefix) typeCounts[snapshotType(match)] += 1;
    same(checkpoint.completedMatchTypeCounts, typeCounts, `${where}.typeCounts`);
    verifyRestAndTime(session, checkpoint, where);
  }
  verifyTimeMetrics(session.finalTime, session, session.finalTime.elapsedMinutes, `${label}.finalTime`);
  const expectedOngoing = session.assignments.filter((assignment) => assignment.completedMatchNumber === null &&
    assignment.startedAtMinutes <= session.finalTime.elapsedMinutes && assignment.plannedFinishAtMinutes > session.finalTime.elapsedMinutes)
    .sort((left, right) => left.courtIndex - right.courtIndex)
    .map((assignment) => ({
      assignmentId: assignment.assignmentId,
      courtIndex: assignment.courtIndex,
      observedElapsedMinutes: Math.max(0, session.finalTime.elapsedMinutes - assignment.startedAtMinutes),
      plannedFinishAtMinutes: assignment.plannedFinishAtMinutes,
    }));
  same(session.finalTime.ongoingAssignmentsAtStop, expectedOngoing, `${label}.ongoingAssignmentsAtStop`);
  const endpointCheckpoint = session.checkpoints.find((checkpoint) => checkpoint.completedMatches === session.completedHistory.length);
  if (endpointCheckpoint) {
    same(session.finalTime.elapsedMinutes, endpointCheckpoint.atMinutes, `${label}.finalTime.endpointClock`);
    same(session.finalTime.busyCourtMinutes, endpointCheckpoint.time.busyCourtMinutes, `${label}.finalTime.endpointBusy`);
    same(session.finalTime.idleCourtMinutes, endpointCheckpoint.time.idleCourtMinutes, `${label}.finalTime.endpointIdle`);
    same(session.finalTime.idleFraction, endpointCheckpoint.time.idleFraction, `${label}.finalTime.endpointIdleFraction`);
    same(session.finalTime.closedRefillDelayCount, endpointCheckpoint.time.closedRefillDelayCount, `${label}.finalTime.endpointRefills`);
    same(session.finalTime.meanRefillDelayMinutes, endpointCheckpoint.time.meanRefillDelayMinutes, `${label}.finalTime.endpointMeanRefill`);
    same(session.finalTime.p95RefillDelayMinutes, endpointCheckpoint.time.p95RefillDelayMinutes, `${label}.finalTime.endpointP95Refill`);
    same(session.finalTime.maximumRefillDelayMinutes, endpointCheckpoint.time.maximumRefillDelayMinutes, `${label}.finalTime.endpointMaxRefill`);
    same(session.finalTime.terminalOpenRefillIntervalCount, endpointCheckpoint.time.terminalOpenRefillIntervalCount, `${label}.finalTime.endpointOpenRefills`);
  }

  const waits = session.decisions.filter((decision) => decision.waited).length;
  const conditionalDecisions = session.scheduler === "conditional-wait"
    ? session.decisions.filter((decision) => decision.decisionId > 1 && decision.currentlyFreeCourtIndices.length > 0).length : 0;
  same(session.waiting.waitsTaken, waits, `${label}.waitsTaken`);
  same(session.waiting.conditionalWaitDecisions, conditionalDecisions, `${label}.conditionalWaitDecisions`);
  const declinedByReason = Object.fromEntries([
    "opening-batch-must-start", "not-conditional-arm", "current-preview-uncertified", "no-busy-court",
    "wake-gap-too-long", "future-preview-uncertified", "no-material-gain", "waited-for-next-completion",
    "waited-but-target-reached", "target-reached-before-refill",
  ].map((reason) => [reason, 0]));
  for (const decision of session.decisions) if (!decision.waited) {
    assert(Object.hasOwn(declinedByReason, decision.waitReason), `${label}: unknown declined wait reason ${decision.waitReason}`);
    declinedByReason[decision.waitReason] += 1;
  }
  same(session.waiting.waitsDeclinedByReason, declinedByReason, `${label}.declinedWaitReasons`);
  for (const decision of session.decisions) {
    const actual = assignmentsByDecision.get(decision.decisionId) ?? [];
    if (decision.waited) assert(actual.length === 0 || decision.executedAtMinutes >= decision.atMinutes, `${label}/decision${decision.decisionId}: invalid delayed execution`);
    if (session.scheduler === "conditional-wait" && decision.waitReason === "wake-gap-too-long") {
      assert(decision.futurePreview && decision.futurePreview.predictedGapMinutes > 5, `${label}/decision${decision.decisionId}: false lookahead-limit label`);
    }
    if (decision.decisionId === 1) same(decision.waitReason, "opening-batch-must-start", `${label}/decision1.openingReason`);
    else if (session.scheduler === "immediate") same(decision.waitReason, "not-conditional-arm", `${label}/decision${decision.decisionId}.immediateReason`);
    if (decision.waited) {
      assert(session.scheduler === "conditional-wait" && decision.futurePreview, `${label}/decision${decision.decisionId}: waited without a conditional future preview`);
      const future = decision.futurePreview.preview;
      const deltaC = future.gains.perCourtNewCourtmatePairs - decision.immediatePreview.gains.perCourtNewCourtmatePairs;
      const deltaT = future.gains.perCourtRollingMatchTypeGain - decision.immediatePreview.gains.perCourtRollingMatchTypeGain;
      assert(deltaC >= 1 || deltaT >= 0.5, `${label}/decision${decision.decisionId}: wait lacked its declared benefit`);
    }
  }
  if (session.status === "completed") same(session.completedHistory.length, targetCompletedMatches, `${label}.completedHorizon`);
  else assert(session.stopReason || session.error, `${label}: incomplete session lacks a reason`);
  return {
    session: label,
    completedMatches: session.completedHistory.length,
    decisions: session.decisions.length,
    assignments: session.assignments.length,
    waits,
    status: session.status,
    checkpoints: session.checkpoints.map((checkpoint) => checkpoint.completedMatches),
  };
}

/** Validate one complete scheduler session without imposing the fixed report cohort. */
export function assertSocialJointRefillSession(session, {
  scenarioId = session?.scenario?.id,
  seeds = [session?.seed],
  targetCompletedMatches = session?.targetCompletedMatches,
} = {}) {
  assert(session?.scenario?.id === scenarioId, "Session scenario differs from the requested scope");
  assert(Array.isArray(seeds) && seeds.includes(session.seed), "Session seed is outside the requested cohort");
  return verifySession(session, scenarioId, seeds, targetCompletedMatches);
}

function openingKey(session) {
  const decision = session.decisions.find((candidate) => candidate.execution?.chosenAssignments?.length);
  if (!decision) return null;
  return JSON.stringify(decision.execution.chosenAssignments.map((assignment) => ({
    courtIndex: decision.executedCourtIndices[decision.execution.chosenAssignments.indexOf(assignment)],
    layout: layoutKey(assignment),
    courtType: assignment.socialVariety.courtType,
  })).sort((left, right) => left.courtIndex - right.courtIndex));
}

export function assertSocialJointRefillReport(report, { scenarioId, seeds, targetCompletedMatches = 100 } = {}) {
  assert(report.schemaVersion === "social-joint-refill-v1", "Wrong joint-refill report schema");
  assert(report.validationStatus === "pending", "Only pending reports can be independently validated and promoted");
  same(report.seeds, seeds, "seeds");
  same(report.targetCompletedMatches, targetCompletedMatches, "targetCompletedMatches");
  same(report.schedulers, SCHEDULERS, "schedulers");
  assert(report.scenarios.length === 1 && report.scenarios[0].id === scenarioId, "Wrong scenario report scope");
  const expected = EXPECTED_SCENARIOS[scenarioId];
  assert(expected, `Unknown joint-refill scenario ${scenarioId}`);
  same({ upper: report.scenarios[0].upper, lower: report.scenarios[0].lower, courtCount: report.scenarios[0].courtCount },
    { upper: expected.upper, lower: expected.lower, courtCount: expected.courtCount }, `${scenarioId}.config`);
  same(report.engineVersions, expected.engineVersions, `${scenarioId}.engineVersions`);
  const expectedCount = seeds.length * expected.engineVersions.length * SCHEDULERS.length;
  same(report.sessions.length, expectedCount, `${scenarioId}.sessionCount`);
  const seen = new Set();
  const validation = [];
  for (const session of report.sessions) {
    assert(session.scenario.id === scenarioId && expected.engineVersions.includes(session.engineVersion) && SCHEDULERS.includes(session.scheduler),
      `${scenarioId}: session outside requested matrix`);
    const key = `${session.seed}/${session.engineVersion}/${session.scheduler}`;
    assert(!seen.has(key), `${scenarioId}: duplicate session ${key}`);
    seen.add(key);
    validation.push(verifySession(session, scenarioId, seeds, targetCompletedMatches));
  }
  for (const seed of seeds) for (const engineVersion of expected.engineVersions) {
    const immediate = report.sessions.find((session) => session.seed === seed && session.engineVersion === engineVersion && session.scheduler === "immediate");
    const waiting = report.sessions.find((session) => session.seed === seed && session.engineVersion === engineVersion && session.scheduler === "conditional-wait");
    assert(immediate && waiting, `${scenarioId}/${engineVersion}/seed${seed}: missing matched scheduler arm`);
    same(openingKey(immediate), openingKey(waiting), `${scenarioId}/${engineVersion}/seed${seed}.openingLayout`);
  }
  const completedMatches = sum(report.sessions.map((session) => session.completedHistory.length));
  const decisions = sum(report.sessions.map((session) => session.decisions.length));
  const waits = sum(report.sessions.map((session) => session.waiting.waitsTaken));
  return { sessionCount: report.sessions.length, completedMatches, decisionCount: decisions, waits, sessions: validation };
}

export function assertSocialJointRefillTamperResistance(report, options) {
  const clone = () => JSON.parse(JSON.stringify(report));
  const mustReject = (label, mutate) => {
    const altered = clone();
    mutate(altered);
    let rejected = false;
    try {
      assertSocialJointRefillReport(altered, options);
    } catch {
      rejected = true;
    }
    assert(rejected, `Validator accepted tampered ${label} trace.`);
  };
  const session = report.sessions.find((entry) => entry.status !== "error" && entry.decisions.length > 0 && entry.assignments.length > 0);
  assert(session, "Cannot run validator tamper checks without a non-error decision and assignment trace.");
  const sessionIndex = report.sessions.indexOf(session);
  mustReject("RNG state", (altered) => {
    altered.sessions[sessionIndex].decisions[0].immediatePreview.randomStateAfter += 1;
  });
  mustReject("completed-only gain", (altered) => {
    const candidate = altered.sessions[sessionIndex].decisions.find((decision) =>
      decision.immediatePreview.gains.rollingMatchTypeGain !== null);
    assert(candidate, "Cannot tamper a missing independent C/T gain.");
    candidate.immediatePreview.gains.rollingMatchTypeGain += 0.125;
  });
  mustReject("court duration/time", (altered) => {
    altered.sessions[sessionIndex].assignments[0].plannedDurationMinutes += 0.125;
  });
  return { rngState: "rejected", completedOnlyGain: "rejected", durationAndTime: "rejected" };
}
