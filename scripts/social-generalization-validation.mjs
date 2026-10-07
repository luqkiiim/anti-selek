const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => values.length ? sum(values) / values.length : null;
const key = (a, b) => JSON.stringify([a, b].sort());
const same = (actual, expected, where) => {
  if (typeof expected === "number") {
    assert(typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, `${where}: ${actual} != ${expected}`);
  } else if (Array.isArray(expected)) {
    assert(Array.isArray(actual) && actual.length === expected.length, `${where}: array length differs`);
    expected.forEach((value, index) => same(actual[index], value, `${where}[${index}]`));
  } else if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", `${where}: missing object`);
    for (const [name, value] of Object.entries(expected)) same(actual[name], value, `${where}.${name}`);
  } else assert(actual === expected, `${where}: ${actual} != ${expected}`);
};
const side = (player) => player.side ?? player.mixedSideOverride ?? (player.gender === "MALE" ? "UPPER" : player.gender === "FEMALE" ? "LOWER" : null);
const type = (match) => match.socialVariety?.courtType === "MIXED" ? "MIXED"
  : ["UPPER", "LOWER"].includes(match.socialVariety?.courtType) ? "OWN_SIDE" : null;

/** Independent endpoint reconstruction from raw assignments; never imports matcher or audit code. */
export function reconstructSocialGeneralizationPrefix(roster, history) {
  const counts = { UPPER: roster.filter((p) => side(p) === "UPPER").length, LOWER: roster.filter((p) => side(p) === "LOWER").length };
  const mixed = counts.UPPER >= 2 && counts.LOWER >= 2;
  const facets = ["courtmates", "partners", "opponents"];
  const data = roster.map((p) => {
    const own = counts[side(p)] >= 4;
    const types = [...(mixed ? ["MIXED"] : []), ...(own ? ["OWN_SIDE"] : [])];
    const opportunities = Object.fromEntries(facets.map((facet) => [facet, new Set(roster.filter((peer) => {
      if (peer.userId === p.userId || !types.length) return false;
      return facet === "partners" ? (side(peer) !== side(p) ? mixed : own) : side(peer) === side(p) || mixed;
    }).map((peer) => peer.userId))]));
    const exposures = Object.fromEntries(facets.map((facet) => [facet, new Map()]));
    const appearances = history.filter((m) => [...m.team1, ...m.team2].includes(p.userId)).map(type);
    const recent = appearances.slice(-6);
    let run = 0, maximum = 0, previous = null;
    for (const value of appearances) { run = value && value === previous ? run + 1 : value ? 1 : 0; previous = value; maximum = Math.max(maximum, run); }
    for (const m of history) {
      const ids = [...m.team1, ...m.team2];
      if (!ids.includes(p.userId)) continue;
      const team = m.team1.includes(p.userId) ? m.team1 : m.team2;
      const peers = { courtmates: ids, partners: team, opponents: m.team1.includes(p.userId) ? m.team2 : m.team1 };
      for (const facet of facets) for (const peer of peers[facet]) if (opportunities[facet].has(peer)) exposures[facet].set(peer, (exposures[facet].get(peer) ?? 0) + 1);
    }
    const row = { userId: p.userId };
    for (const [facet, capital] of [["courtmates", "Courtmates"], ["partners", "Partners"], ["opponents", "Opponents"]]) {
      row[`feasible${capital}`] = opportunities[facet].size;
      row[`distinct${capital}`] = exposures[facet].size;
      row[`${facet.slice(0, -1)}Coverage`] = opportunities[facet].size ? exposures[facet].size / opportunities[facet].size : null;
    }
    Object.assign(row, { feasibleMatchTypes: types, recentMatchTypes: recent, T: types.length ? types.filter((t) => recent.includes(t)).length / types.length : null });
    return { row, opportunities, exposures, maximum };
  });
  const summarize = (facet) => {
    const eligible = data.filter((d) => d.opportunities[facet].size > 0);
    const feasible = new Set(), covered = new Set();
    for (const d of data) {
      for (const peer of d.opportunities[facet]) feasible.add(key(d.row.userId, peer));
      for (const peer of d.exposures[facet].keys()) covered.add(key(d.row.userId, peer));
    }
    const entropy = eligible.filter((d) => d.opportunities[facet].size >= 2).map((d) => {
      const values = [...d.exposures[facet].values()], total = sum(values);
      return total ? -sum(values.map((n) => n / total * Math.log(n / total))) / Math.log(d.opportunities[facet].size) : 0;
    });
    return { averageDistinctPeers: mean(eligible.map((d) => d.exposures[facet].size)), minimumDistinctPeers: eligible.length ? Math.min(...eligible.map((d) => d.exposures[facet].size)) : null,
      meanCoverage: mean(eligible.map((d) => d.exposures[facet].size / d.opportunities[facet].size)), worstPlayerCoverage: eligible.length ? Math.min(...eligible.map((d) => d.exposures[facet].size / d.opportunities[facet].size)) : null,
      fullyCoveredPlayerCount: eligible.filter((d) => d.exposures[facet].size === d.opportunities[facet].size).length, feasiblePairCount: feasible.size, coveredPairCount: covered.size, meanNormalizedEntropy: mean(entropy) };
  };
  const rows = data.map((d) => d.row), types = rows.filter((r) => r.T !== null);
  return { playerCount: roster.length, courtmates: summarize("courtmates"), partners: summarize("partners"), opponents: summarize("opponents"), meanT: mean(types.map((r) => r.T)),
    fullTypeCoverageFraction: types.length ? types.filter((r) => r.T === 1).length / types.length : null, halfTypeCoverageFraction: types.length ? types.filter((r) => r.T === 0.5).length / types.length : null,
    typeEligiblePlayerCount: types.length, oneTypePlayerCount: types.filter((r) => r.feasibleMatchTypes.length === 1).length,
    feasibleTypePlayerCounts: { MIXED: rows.filter((r) => r.feasibleMatchTypes.includes("MIXED")).length, OWN_SIDE: rows.filter((r) => r.feasibleMatchTypes.includes("OWN_SIDE")).length },
    completedMatchTypeCounts: { MIXED: history.filter((m) => type(m) === "MIXED").length, OWN_SIDE: history.filter((m) => type(m) === "OWN_SIDE").length },
    longestSingleTypeAppearanceRun: Math.max(0, ...data.map((d) => d.maximum)), players: rows };
}

const canonicalRoster = (roster) => roster.map((p) => ({ userId: p.userId, side: side(p), isPaused: Boolean(p.isPaused) })).sort((a, b) => a.userId.localeCompare(b.userId));
const canonicalScore = (score) => ({ ...score, players: score.players.slice().sort((a, b) => a.userId.localeCompare(b.userId)) });
function materializeRoster(scenario, applications, count, scheduled = false) {
  const roster = Array.from({ length: scenario.initialUpper + scenario.initialLower }, (_, i) => ({ userId: `P${i + 1}`, side: i < scenario.initialUpper ? "UPPER" : "LOWER", isPaused: false }));
  const events = scheduled ? scenario.events.map((event, eventIndex) => ({ eventIndex, appliedAfterCompletedMatches: event.afterCompletedMatches, status: "applied" })) : applications;
  for (const application of events.filter((e) => e.status === "applied" && e.appliedAfterCompletedMatches <= count).sort((a, b) => a.appliedAfterCompletedMatches - b.appliedAfterCompletedMatches || a.eventIndex - b.eventIndex)) {
    const event = scenario.events[application.eventIndex];
    if (event.type === "join") roster.push(...event.players.map((p) => ({ ...p, isPaused: false })));
    else roster.find((p) => p.userId === event.userId).isPaused = event.type === "pause";
  }
  return canonicalRoster(roster);
}
function validateWindows(windows, prefix, denominator, where, courts, roster) {
  const assignments = new Map();
  for (const court of courts) {
    assert(court.partition.team1.length === 2 && court.partition.team2.length === 2, `${where}: malformed witness teams`);
    same([...court.ids].sort(), [...court.partition.team1, ...court.partition.team2].sort(), `${where}.courtIds`);
    const sides = court.ids.map((id) => side(roster.find((p) => p.userId === id)));
    const upper = sides.filter((s) => s === "UPPER").length;
    assert(upper === 0 || upper === 2 || upper === 4, `${where}: illegal court type`);
    if (upper === 2) for (const team of [court.partition.team1, court.partition.team2]) assert(team.filter((id) => side(roster.find((p) => p.userId === id)) === "UPPER").length === 1, `${where}: invalid mixed partnership`);
    for (const id of court.ids) { assert(!assignments.has(id), `${where}: duplicate witness assignment`); assignments.set(id, upper === 2 ? "MIXED" : "OWN_SIDE"); }
  }
  same(windows.map((w) => w.userId).sort(), [...assignments.keys()].sort(), `${where}.windowUsers`);
  let units = 0n;
  for (const w of windows) {
    const before = prefix.players.find((p) => p.userId === w.userId);
    assert(before, `${where}: unknown window player`);
    same(w.feasibleTypes, before.feasibleMatchTypes, `${where}.${w.userId}.vocabulary`);
    same(w.recentTypesBefore, before.recentMatchTypes, `${where}.${w.userId}.before`);
    same(w.TBefore, before.T, `${where}.${w.userId}.TBefore`);
    same(w.recentTypesAfter, [...before.recentMatchTypes, assignments.get(w.userId)].slice(-6), `${where}.${w.userId}.after`);
    assert(w.recentTypesAfter.length <= 6, `${where}: window exceeds six appearances`);
    const after = w.feasibleTypes.length ? w.feasibleTypes.filter((t) => w.recentTypesAfter.includes(t)).length / w.feasibleTypes.length : null;
    same(w.TAfter, after, `${where}.${w.userId}.TAfter`);
    const delta = (after ?? 0) - (w.TBefore ?? 0);
    assert(Number.isInteger(delta * Number(denominator)), `${where}: invalid rational gain`);
    units += BigInt(delta * Number(denominator));
  }
  return units;
}
function rawCourtmateGain(courts, history) {
  const seen = new Set();
  for (const match of history) { const ids = [...match.team1, ...match.team2]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) seen.add(key(ids[i], ids[j])); }
  let gain = 0;
  for (const court of courts) for (let i = 0; i < court.ids.length; i++) for (let j = i + 1; j < court.ids.length; j++) if (!seen.has(key(court.ids[i], court.ids[j]))) gain++;
  return gain;
}

export function assertSocialGeneralizationReport(report, { scenarioId, seeds, mode }) {
  assert(report.schemaVersion === "social-generalization-v1", "Wrong report schema");
  same(report.seeds, seeds, "seeds");
  same(report.arms, ["production", "courtmate-beneficial-rescue"], "arms");
  assert(report.scenarios.length === 1 && report.scenarios[0].id === scenarioId, "Wrong scenario cohort");
  const scenario = report.scenarios[0];
  const horizon = mode === "selected-long" && scenario.longDiagnostic ? 100 : scenario.shortHorizonMatches;
  const requested = horizon === 100 ? [scenario.shortHorizonMatches, 100] : [scenario.shortHorizonMatches];
  assert(report.sessions.length === seeds.length * 2, "Wrong session count");
  const sessionKeys = new Set();
  for (const s of report.sessions) {
    const label = `${scenarioId}/${s.seed}/${s.arm}`;
    assert(s.scenarioId === scenarioId && seeds.includes(s.seed) && report.arms.includes(s.arm), `${label}: wrong cohort`);
    const sessionKey = `${s.seed}/${s.arm}`;
    assert(!sessionKeys.has(sessionKey), `${label}: duplicate session`); sessionKeys.add(sessionKey);
    assert(["completed", "search-limited", "stalled"].includes(s.status), `${label}: unexpected execution error: ${s.error ?? s.status}`);
    same(s.requestedCheckpoints, requested, `${label}.horizons`);
    assert(s.completedHistory.length <= horizon && horizon <= 100, `${label}: horizon exceeded`);
    const historyIds = new Set();
    for (const m of s.completedHistory) {
      assert(!historyIds.has(m.id), `${label}: duplicate history ID`); historyIds.add(m.id);
      assert(m.team1.length === 2 && m.team2.length === 2 && new Set([...m.team1, ...m.team2]).size === 4 && type(m), `${label}: invalid completed assignment`);
    }
    if (s.status === "completed") assert(s.completedHistory.length === horizon && s.checkpoints.length === requested.length, `${label}: missing completed horizon`);
    else assert(s.stopReason && s.completedHistory.length < horizon, `${label}: missing explicit failed-session reason`);
    same(s.checkpoints.map((cp) => cp.targetCompletedMatches), requested.filter((n) => n <= s.completedHistory.length), `${label}.checkpointTargets`);
    const executedAssignments = s.decisions.flatMap((d) => d.assignmentsStarted ? d.selectedAssignments.map((assignment) => ({ decision: d, assignment, completion: null })) : []);
    const layoutKey = (partition) => JSON.stringify([partition.team1.slice().sort(), partition.team2.slice().sort()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    for (const [i, match] of s.completedHistory.entries()) {
      const record = executedAssignments.find((r) => r.completion === null && r.decision.afterCompletedMatches < i + 1 && layoutKey(r.assignment.partition) === layoutKey(match) && JSON.stringify(r.assignment.socialVariety) === JSON.stringify(match.socialVariety));
      assert(record, `${label}: completed match ${i + 1} has no executed assignment`); record.completion = i + 1;
    }
    for (const [i, d] of s.decisions.entries()) {
      const where = `${label}/decision${d.decisionId}`;
      assert(d.decisionId === i + 1 && d.afterCompletedMatches <= s.completedHistory.length && d.auditPrefixHistoryLength === d.afterCompletedMatches, `${where}: malformed decision sequence`);
      assert(Number.isInteger(d.assignmentsStarted) && d.assignmentsStarted >= 0 && d.assignmentsStarted <= d.courtCount, `${where}: malformed execution count`);
      assert(d.completed === (d.completedAfterMatchNumber !== null), `${where}: completion flags differ`);
      same(canonicalRoster(d.structuralRosterSnapshot), materializeRoster(scenario, s.eventApplications, d.afterCompletedMatches), `${where}.actualRoster`);
      const assignedRecords = executedAssignments.filter((r) => r.decision === d);
      const allCompleted = assignedRecords.length > 0 && assignedRecords.every((r) => r.completion !== null);
      same(d.completed, allCompleted, `${where}.assignmentCompletion`);
      if (allCompleted) same(d.completedAfterMatchNumber, Math.max(...assignedRecords.map((r) => r.completion)), `${where}.completionNumber`);
      if (d.completed) assert(d.assignmentsStarted === d.courtCount && d.completedAfterMatchNumber <= s.completedHistory.length, `${where}: invalid completion`);
      const selectedIds = d.selectedAssignments.flatMap((a) => a.ids);
      assert(new Set(selectedIds).size === selectedIds.length && selectedIds.every((id) => d.eligiblePlayerIds.includes(id)), `${where}: busy, paused, duplicate or unavailable selected player`);
      if (!d.assignmentsStarted) continue;
      same(d.assignmentRestTurns, d.proposedAssignmentRestTurns, `${where}.executedRestRows`);
      same(d.assignmentRestTurns.map((r) => r.userId).sort(), selectedIds.slice().sort(), `${where}.restRowPlayers`);
      for (const r of d.assignmentRestTurns) {
        const p = d.structuralRosterSnapshot.find((p) => p.userId === r.userId);
        same(r.restTurns, p.restTurns, `${where}.${r.userId}.rest`);
        same(r.priorCompletedMatches, s.completedHistory.slice(0, d.afterCompletedMatches).filter((m) => [...m.team1, ...m.team2].includes(r.userId)).length, `${where}.${r.userId}.priorCount`);
      }
      assert(d.engine.selectionReturned && d.engine.fairnessCertified && d.engine.starvationCertified && d.engine.coverageGateCertified && d.engine.replayCertified, `${where}: executed uncertified engine selection`);
      assert(d.audit?.selectedValid && d.audit.selectedFairnessCertified && d.audit.selectedStarvationCertified, `${where}: independent safety proof missing`);
      if (d.starvationCounterfactual?.status === "certified") {
        assert(d.starvationCounterfactual.measurementComplete && d.starvationCounterfactual.withoutStarvationFairnessCertified, `${where}: uncertified starvation counterfactual`);
        const changed = JSON.stringify(d.starvationCounterfactual.productionSelectedPlayerIds) !== JSON.stringify(d.starvationCounterfactual.withoutStarvationSelectedPlayerIds);
        same(d.starvationCounterfactual.selectedSetChanged, changed, `${where}.starvationSetChange`);
      }
      const prefix = reconstructSocialGeneralizationPrefix(d.structuralRosterSnapshot, s.completedHistory.slice(0, d.afterCompletedMatches));
      if (s.arm !== "courtmate-beneficial-rescue") continue;
      assert(d.engine.priorityCertified && d.engine.courtmateGainMaximumCertified && d.audit.complete && d.audit.beneficialRescueAdmitted && d.rescue, `${where}: candidate frontier not independently certified`);
      const r = d.rescue, a = d.audit, denominator = BigInt(a.rollingTypeDenominator);
      same(d.engine.chosenCourtmateGain, a.selectedCourtmateGain, `${where}.engineG`);
      same(d.engine.courtmateGainMaximum, a.courtmateGainMaximum, `${where}.engineGmax`);
      same(d.engine.chosenCourtmateGainDeficit, r.chosenCourtmateGainDeficit, `${where}.engineDeficit`);
      same(d.engine.chosenRollingMatchTypeGain, a.selectedSignedRollingTypeGain, `${where}.engineT`);
      same(d.engine.bestRollingMatchTypeGainAtGmax, a.bestSignedRollingTypeGainAtGmax, `${where}.engineTmax`);
      const chosenUnits = BigInt(r.chosenSignedRollingTypeGainUnits), bestUnits = BigInt(r.bestSignedRollingTypeGainAtGmaxUnits);
      same(Number(chosenUnits) / Number(denominator), r.chosenSignedRollingTypeGain, `${where}.normalizedChosenT`);
      same(Number(bestUnits) / Number(denominator), r.bestSignedRollingTypeGainAtGmax, `${where}.normalizedBestT`);
      same(r.selectedWindows, a.selectedTypeWindows, `${where}.auditSelectedWindows`);
      same(r.bestGmaxAtFrontier, a.bestGmaxWitness, `${where}.auditBestWitness`);
      assert(validateWindows(r.selectedWindows, prefix, denominator, where, d.selectedAssignments, d.structuralRosterSnapshot) === chosenUnits, `${where}: selected T window sum differs`);
      assert(validateWindows(r.bestGmaxAtFrontier.players, prefix, denominator, where, r.bestGmaxAtFrontier.courts, d.structuralRosterSnapshot) === bestUnits, `${where}: full-Gmax T window sum differs`);
      same(rawCourtmateGain(d.selectedAssignments, s.completedHistory.slice(0, d.afterCompletedMatches)), r.chosenCourtmateGain, `${where}.reconstructedG`);
      same(rawCourtmateGain(r.bestGmaxAtFrontier.courts, s.completedHistory.slice(0, d.afterCompletedMatches)), r.courtmateGainMaximum, `${where}.witnessGmax`);
      assert(r.chosenCourtmateGainDeficit === r.courtmateGainMaximum - r.chosenCourtmateGain && [0, 1].includes(r.chosenCourtmateGainDeficit), `${where}: concession exceeds one pair`);
      const windowCount = (windows, bothOnly) => {
        const after = new Map(windows.map((w) => [w.userId, w.TAfter]));
        return prefix.players.filter((p) => (!bothOnly || p.feasibleMatchTypes.length === 2) && (after.has(p.userId) ? after.get(p.userId) : p.T) === 1).length;
      };
      same(r.fullTypeWindowCountDeltaVsBestGmax, windowCount(r.selectedWindows, false) - windowCount(r.bestGmaxAtFrontier.players, false), `${where}.fullWindowDelta`);
      same(r.bothTypeWindowCountDeltaVsBestGmax, windowCount(r.selectedWindows, true) - windowCount(r.bestGmaxAtFrontier.players, true), `${where}.bothWindowDelta`);
      if (r.chosenCourtmateGainDeficit === 0) assert(chosenUnits === bestUnits, `${where}: full-Gmax choice misses its best T`);
      if (r.chosenCourtmateGainDeficit === 1) {
        assert(chosenUnits > bestUnits && r.strictBenefit && !r.zeroBenefit && !r.negativeBenefit, `${where}: rescue is not strictly beneficial`);
        assert(BigInt(r.conditionalTypeBenefitUnits) === chosenUnits - bestUnits, `${where}: exact conditional benefit differs`);
        same(r.conditionalTypeBenefit, Number(chosenUnits - bestUnits) / Number(denominator), `${where}.benefit`);
        assert(prefix.oneTypePlayerCount !== prefix.typeEligiblePlayerCount, `${where}: rescue active in one-type roster`);
      }
    }
    for (const cp of s.checkpoints) {
      const where = `${label}/checkpoint${cp.completedMatches}`;
      assert(requested.includes(cp.targetCompletedMatches) && cp.completedMatches === cp.targetCompletedMatches && cp.completedMatches <= s.completedHistory.length, `${where}: invented endpoint`);
      const history = s.completedHistory.slice(0, cp.completedMatches);
      const actualRoster = materializeRoster(scenario, s.eventApplications, cp.completedMatches), scheduledRoster = materializeRoster(scenario, s.eventApplications, cp.completedMatches, true);
      same(canonicalRoster(cp.structuralRoster), actualRoster, `${where}.actualRoster`);
      same(canonicalRoster(cp.scheduledStructuralRoster), scheduledRoster, `${where}.scheduledRoster`);
      same(cp.structuralRosterMatchesCatalog, JSON.stringify(actualRoster) === JSON.stringify(scheduledRoster), `${where}.catalogEqualityFlag`);
      // Checkpoints occur after completion/events and before that event's refill.
      const cohort = s.decisions.filter((d) => d.afterCompletedMatches < cp.completedMatches);
      const completed = cohort.filter((d) => d.completedAfterMatchNumber !== null && d.completedAfterMatchNumber <= cp.completedMatches);
      same(cp.decisionCohort.started, cohort.length, `${where}.started`);
      same(cp.decisionCohort.completed, completed.length, `${where}.completed`);
      same(cp.decisionCohort.pending, cohort.length - completed.length, `${where}.pending`);
      same(canonicalScore(cp.scores.structural), canonicalScore(reconstructSocialGeneralizationPrefix(cp.structuralRoster, history)), `${where}.structuralScores`);
      const opportunity = s.arm === "production" ? cp.structuralRoster.filter((p) => !p.isPaused) : cp.structuralRoster;
      same(cp.currentOpportunityPlayerCount, opportunity.length, `${where}.opportunitySize`);
      same(canonicalScore(cp.scores.opportunity), canonicalScore(reconstructSocialGeneralizationPrefix(opportunity, history)), `${where}.opportunityScores`);
      const counts = cp.fairness.playerMatchCounts.map((p) => {
        const actual = history.filter((m) => [...m.team1, ...m.team2].includes(p.userId)).length;
        same(p.matchesPlayed, actual, `${where}.${p.userId}.count`);
        same(p.effectiveMatchCount, actual + p.matchmakingMatchesCredit, `${where}.${p.userId}.effectiveCount`);
        assert(p.matchmakingMatchesCredit >= 0, `${where}: negative credit`);
        return actual;
      });
      same(sum(counts), 4 * cp.completedMatches, `${where}.totalAppearances`);
      same(cp.fairness.countSpread, Math.max(...counts) - Math.min(...counts), `${where}.spread`);
      const executed = cohort.filter((d) => d.assignmentsStarted > 0);
      const audited = cohort.filter((d) => d.audit);
      const cost = executed.filter((d) => d.rescue?.chosenCourtmateGainDeficit === 1);
      const completedCost = cost.filter((d) => completed.includes(d));
      same(cp.rescue.auditDecisionCount, audited.length, `${where}.audits`);
      same(cp.rescue.completedAuditedDecisionCount, completed.filter((d) => d.audit).length, `${where}.completedAudits`);
      same(cp.rescue.onePairConcessions, cost.length, `${where}.executedCost`);
      same(cp.rescue.completedOnePairConcessions, completedCost.length, `${where}.completedCost`);
      same(cp.rescue.totalCourtMatePairsConceded, cost.length, `${where}.pairsCost`);
      same(cp.rescue.completedConditionalTypeBenefitTotal, sum(completedCost.map((d) => d.rescue.conditionalTypeBenefit)), `${where}.completedBenefit`);
      same(cp.rescue.completedBothTypeWindowDeltaVsBestGmax, sum(completedCost.map((d) => d.rescue.bothTypeWindowCountDeltaVsBestGmax)), `${where}.completedBothWindows`);
      if (s.arm === "courtmate-beneficial-rescue") assert(cp.rescue.completedZeroBenefitConcessions === 0 && cp.rescue.completedNegativeBenefitConcessions === 0, `${where}: invalid completed concessions`);
      const rests = executed.flatMap((d) => d.assignmentRestTurns), values = rests.map((r) => r.restTurns).sort((a, b) => a - b), returning = rests.filter((r) => r.priorCompletedMatches > 0);
      same(cp.rest.assignmentCount, rests.length, `${where}.restSamples`);
      same(cp.rest.meanRestTurns, mean(values), `${where}.meanRest`);
      same(cp.rest.p95RestTurns, values.length ? values[Math.ceil(0.95 * values.length) - 1] : null, `${where}.p95Rest`);
      same(cp.rest.maximumAssignmentRestTurns, Math.max(0, ...values), `${where}.maxRest`);
      same(cp.rest.backToBackAssignments, returning.filter((r) => r.restTurns === 0).length, `${where}.backToBackCount`);
      same(cp.rest.backToBackRate, returning.length ? returning.filter((r) => r.restTurns === 0).length / returning.length : null, `${where}.backToBackRate`);
      same(cp.rest.starvationInterventions, executed.filter((d) => d.starvationCounterfactual?.status === "certified" && d.starvationCounterfactual.selectedSetChanged).length, `${where}.starvationInterventions`);
      same(cp.rest.starvationCounterfactualsApplicable, cohort.filter((d) => d.starvationCounterfactual.applicable).length, `${where}.applicableCounterfactuals`);
      same(cp.rest.starvationCounterfactualsCertified, cohort.filter((d) => d.starvationCounterfactual.status === "certified").length, `${where}.certifiedCounterfactuals`);
      same(cp.rest.starvationCounterfactualsUnknown, cohort.filter((d) => d.starvationCounterfactual.status === "unknown").length, `${where}.unknownCounterfactuals`);
      const eventsByPlayer = new Map(); let maximumDistance = 0;
      for (const [i, m] of history.entries()) for (const id of [...m.team1, ...m.team2]) { const prior = eventsByPlayer.get(id); if (prior !== undefined) maximumDistance = Math.max(maximumDistance, i + 1 - prior); eventsByPlayer.set(id, i + 1); }
      same(cp.rest.maximumOwnCompletionEventDistance, maximumDistance, `${where}.completionDistance`);
      same(cp.rest.longestOtherCompletionGap, Math.max(0, maximumDistance - 1), `${where}.otherCompletionGap`);
    }
    assert(new Set(s.eventApplications.map((e) => e.eventIndex)).size === s.eventApplications.length && s.eventApplications.length === scenario.events.length, `${label}: duplicated or missing event applications`);
    for (const e of s.eventApplications) {
      assert(scenario.events[e.eventIndex]?.type === e.type, `${label}: unknown event`);
      assert(["applied", "deferred-player-busy", "unapplied-at-stop"].includes(e.status), `${label}: invalid event status`);
      same(e.userIds, e.type === "join" ? scenario.events[e.eventIndex].players.map((p) => p.userId) : [scenario.events[e.eventIndex].userId], `${label}/event${e.eventIndex}.userIds`);
      if (e.status === "applied") {
        assert(e.appliedAfterCompletedMatches >= e.scheduledAfterCompletedMatches && e.appliedAfterCompletedMatches <= s.completedHistory.length, `${label}: invalid event boundary`);
        if (e.type !== "join") same(e.structuralAfter.map((p) => p.feasibleMatchTypes), e.structuralBefore.map((p) => p.feasibleMatchTypes), `${label}: pause changed structural vocabulary`);
      }
    }
    // Rebuild no-catch-up credits against the actual nonpaused population, including busy players.
    const state = new Map(Array.from({ length: scenario.initialUpper + scenario.initialLower }, (_, i) => [`P${i + 1}`, { credit: 0, paused: false, pauseAt: null }]));
    const applied = s.eventApplications.filter((e) => e.status === "applied").sort((a, b) => a.appliedAfterCompletedMatches - b.appliedAfterCompletedMatches || a.eventIndex - b.eventIndex);
    for (const e of applied) {
      const n = e.appliedAfterCompletedMatches, history = s.completedHistory.slice(0, n);
      const count = (id) => history.filter((m) => [...m.team1, ...m.team2].includes(id)).length;
      const expectedChanges = [];
      for (const id of e.userIds) {
        if (e.type === "pause") { state.get(id).paused = true; state.get(id).pauseAt = n; continue; }
        const prior = state.get(id) ?? { credit: 0, paused: false, pauseAt: null };
        if (e.type === "join" || prior.pauseAt !== null && n > prior.pauseAt) {
          const population = [...state.entries()].filter(([otherId, value]) => otherId !== id && !value.paused).map(([otherId, value]) => count(otherId) + value.credit);
          const next = Math.max(prior.credit, (population.length ? Math.min(...population) : count(id)) - count(id));
          expectedChanges.push({ userId: id, priorCredit: prior.credit, nextCredit: next });
          prior.credit = next;
        }
        prior.paused = false; prior.pauseAt = null; state.set(id, prior);
      }
      same(e.matchmakingCreditChanges ?? [], expectedChanges, `${label}/event${e.eventIndex}.credits`);
    }
  }
  return { sessions: report.sessions.length, completedSessions: report.sessions.filter((s) => s.status === "completed").length, failedSessions: report.sessions.filter((s) => s.status !== "completed").length };
}
