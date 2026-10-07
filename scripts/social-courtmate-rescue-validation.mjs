const zeroOptimizerFields = [
  "searchLimitCalls",
  "incompleteCounterfactualCalls",
  "fairnessCertificateFailures",
  "starvationCertificateFailures",
  "balanceCertificateFailures",
];

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function zero(value, label, errors) {
  if (value !== 0) errors.push(`${label}=${value ?? "missing"}`);
}

function equal(actual, expected, label, errors) {
  if (typeof expected !== "number" || actual !== expected) {
    errors.push(`${label}=${actual ?? "missing"}; expected ${expected ?? "missing"}`);
  }
}

function checkCommonSafety(checkpoint, label, errors) {
  const optimizer = checkpoint?.optimizer;
  for (const field of zeroOptimizerFields) zero(optimizer?.[field], `${label}.optimizer.${field}`, errors);
  zero(checkpoint?.starvation?.uncertifiedCounterfactualDecisions, `${label}.starvation.uncertifiedCounterfactualDecisions`, errors);
}

function checkBaseline(checkpoint, label, errors) {
  const coverage = checkpoint?.coverageGate;
  const replay = checkpoint?.replayEnvelope;
  const expectedRefills = checkpoint?.completedMatches - 1;
  if (coverage?.policyApplied !== true) errors.push(`${label}.coverageGate.policyApplied is not true`);
  if (replay?.policyApplied !== true) errors.push(`${label}.replayEnvelope.policyApplied is not true`);
  for (const [field, count] of [
    ["coverageGate.refillDecisions", coverage?.refillDecisions],
    ["coverageGate.noStarvationRefillDecisions", coverage?.noStarvationRefillDecisions],
    ["replayEnvelope.productionRefillDecisions", replay?.productionRefillDecisions],
    ["replayEnvelope.noStarvationRefillDecisions", replay?.noStarvationRefillDecisions],
  ]) equal(count, expectedRefills, `${label}.${field}`, errors);
  for (const [field, actual, expected] of [
    ["coverageGate.certifiedDecisions", coverage?.certifiedDecisions, coverage?.refillDecisions],
    ["coverageGate.noStarvationCertifiedDecisions", coverage?.noStarvationCertifiedDecisions, coverage?.noStarvationRefillDecisions],
    ["replayEnvelope.productionReplayEnvelopeCertifiedDecisions", replay?.productionReplayEnvelopeCertifiedDecisions, replay?.productionRefillDecisions],
    ["replayEnvelope.productionCertifiedDecisions", replay?.productionCertifiedDecisions, replay?.productionRefillDecisions],
    ["replayEnvelope.noStarvationReplayEnvelopeCertifiedDecisions", replay?.noStarvationReplayEnvelopeCertifiedDecisions, replay?.noStarvationRefillDecisions],
    ["replayEnvelope.noStarvationCertifiedDecisions", replay?.noStarvationCertifiedDecisions, replay?.noStarvationRefillDecisions],
    ["starvation.certifiedCounterfactualDecisions", checkpoint?.starvation?.certifiedCounterfactualDecisions, checkpoint?.starvation?.decisionsWithOverdueAvailable],
  ]) equal(actual, expected, `${label}.${field}`, errors);
  for (const [field, value] of [
    ["coverageGate.uncertifiedDecisions", coverage?.uncertifiedDecisions],
    ["coverageGate.noStarvationUncertifiedDecisions", coverage?.noStarvationUncertifiedDecisions],
    ["replayEnvelope.productionUncertifiedDecisions", replay?.productionUncertifiedDecisions],
    ["replayEnvelope.noStarvationUncertifiedDecisions", replay?.noStarvationUncertifiedDecisions],
  ]) zero(value, `${label}.${field}`, errors);
}

function checkDisabledOldGates(checkpoint, label, errors) {
  const coverage = checkpoint?.coverageGate;
  const replay = checkpoint?.replayEnvelope;
  if (coverage?.policyApplied !== false) errors.push(`${label}.coverageGate.policyApplied is not false`);
  if (replay?.policyApplied !== false) errors.push(`${label}.replayEnvelope.policyApplied is not false`);
  for (const [field, value] of [
    ["coverageGate.refillDecisions", coverage?.refillDecisions],
    ["coverageGate.certifiedDecisions", coverage?.certifiedDecisions],
    ["coverageGate.uncertifiedDecisions", coverage?.uncertifiedDecisions],
    ["coverageGate.noStarvationRefillDecisions", coverage?.noStarvationRefillDecisions],
    ["coverageGate.noStarvationCertifiedDecisions", coverage?.noStarvationCertifiedDecisions],
    ["coverageGate.noStarvationUncertifiedDecisions", coverage?.noStarvationUncertifiedDecisions],
    ["replayEnvelope.productionRefillDecisions", replay?.productionRefillDecisions],
    ["replayEnvelope.productionReplayEnvelopeCertifiedDecisions", replay?.productionReplayEnvelopeCertifiedDecisions],
    ["replayEnvelope.productionCertifiedDecisions", replay?.productionCertifiedDecisions],
    ["replayEnvelope.productionUncertifiedDecisions", replay?.productionUncertifiedDecisions],
    ["replayEnvelope.noStarvationRefillDecisions", replay?.noStarvationRefillDecisions],
    ["replayEnvelope.noStarvationReplayEnvelopeCertifiedDecisions", replay?.noStarvationReplayEnvelopeCertifiedDecisions],
    ["replayEnvelope.noStarvationCertifiedDecisions", replay?.noStarvationCertifiedDecisions],
    ["replayEnvelope.noStarvationUncertifiedDecisions", replay?.noStarvationUncertifiedDecisions],
  ]) zero(value, `${label}.${field}`, errors);
  equal(checkpoint?.starvation?.certifiedCounterfactualDecisions,
    checkpoint?.starvation?.decisionsWithOverdueAvailable,
    `${label}.starvation.certifiedCounterfactualDecisions`, errors);
}

function checkPriority(checkpoint, label, errors) {
  const priority = checkpoint?.socialPriority;
  if (!priority) {
    errors.push(`${label}.socialPriority is missing`);
    return;
  }
  if (priority.policyApplied !== true) errors.push(`${label}.socialPriority.policyApplied is not true`);
  if (!Number.isInteger(priority.objectiveDecisions) || priority.objectiveDecisions <= 0) {
    errors.push(`${label}.socialPriority.objectiveDecisions=${priority.objectiveDecisions ?? "missing"}`);
  }
  equal(priority.objectiveCertifiedDecisions, priority.objectiveDecisions, `${label}.socialPriority.objectiveCertifiedDecisions`, errors);
  equal(priority.objectiveDecisions, checkpoint?.optimizer?.callsStarted, `${label}.socialPriority.objectiveDecisions vs optimizer.callsStarted`, errors);
  for (const field of [
    "objectiveUncertifiedDecisions", "rankingDiscrepancies", "fairnessCertificateFailures",
    "starvationSafetyFailures", "searchLimitDecisions", "incompleteCounterfactualDecisions",
  ]) zero(priority[field], `${label}.socialPriority.${field}`, errors);
  if (priority.coverageGateStatus !== "DISABLED") errors.push(`${label}.socialPriority.coverageGateStatus=${priority.coverageGateStatus ?? "missing"}`);
  if (priority.replayEnvelopeStatus !== "DISABLED") errors.push(`${label}.socialPriority.replayEnvelopeStatus=${priority.replayEnvelopeStatus ?? "missing"}`);
  equal(priority.counterfactualAuditDecisions,
    checkpoint?.optimizer?.counterfactualWrapperCalls,
    `${label}.socialPriority.counterfactualAuditDecisions vs optimizer.counterfactualWrapperCalls`, errors);
  equal(priority.counterfactualCertifiedDecisions, priority.counterfactualAuditDecisions,
    `${label}.socialPriority.counterfactualCertifiedDecisions`, errors);
  for (const field of [
    "counterfactualUncertifiedDecisions", "counterfactualRankingDiscrepancies",
    "counterfactualFairnessCertificateFailures", "counterfactualSearchLimitDecisions",
    "counterfactualIncompleteDecisions",
  ]) zero(priority[field], `${label}.socialPriority.${field}`, errors);
}

function checkRescue(checkpoint, label, errors) {
  const rescue = checkpoint?.socialCourtmateRescue;
  if (!rescue) {
    errors.push(`${label}.socialCourtmateRescue is missing`);
    return;
  }
  if (rescue.policyApplied !== true) errors.push(`${label}.socialCourtmateRescue.policyApplied is not true`);
  if (!Number.isInteger(rescue.startedDecisions) || rescue.startedDecisions <= 0) {
    errors.push(`${label}.socialCourtmateRescue.startedDecisions=${rescue.startedDecisions ?? "missing"}`);
  }
  if (rescue.coverageGateStatus !== "DISABLED") errors.push(`${label}.socialCourtmateRescue.coverageGateStatus=${rescue.coverageGateStatus ?? "missing"}`);
  if (rescue.replayEnvelopeStatus !== "DISABLED") errors.push(`${label}.socialCourtmateRescue.replayEnvelopeStatus=${rescue.replayEnvelopeStatus ?? "missing"}`);
  equal(rescue.startedDecisions, checkpoint?.optimizer?.callsStarted,
    `${label}.socialCourtmateRescue.startedDecisions vs optimizer.callsStarted`, errors);
  equal(rescue.auditCompletedDecisions, rescue.startedDecisions,
    `${label}.socialCourtmateRescue.auditCompletedDecisions`, errors);
  equal(rescue.completedDecisions, checkpoint?.optimizer?.callsCompleted,
    `${label}.socialCourtmateRescue.completedDecisions vs optimizer.callsCompleted`, errors);
  equal(rescue.completedDecisions, checkpoint?.starvation?.completedRotationDecisions,
    `${label}.socialCourtmateRescue.completedDecisions vs completed rotation decisions`, errors);
  equal(rescue.certifiedDecisions, rescue.startedDecisions,
    `${label}.socialCourtmateRescue.certifiedDecisions`, errors);
  for (const field of [
    "uncertifiedDecisions", "rankingDiscrepancies", "fairnessCertificateFailures",
    "starvationSafetyFailures", "gMaxCertificationFailures", "admissionFailures",
    "searchLimitDecisions", "incompleteAuditDecisions",
  ]) zero(rescue[field], `${label}.socialCourtmateRescue.${field}`, errors);
  equal(rescue.witnesses?.length, rescue.startedDecisions, `${label}.socialCourtmateRescue.witnesses`, errors);
  const realWitnesses = Array.isArray(rescue.witnesses) ? rescue.witnesses : [];
  const completedWitnesses = realWitnesses.filter((witness) => witness?.completed === true);
  equal(completedWitnesses.length, rescue.completedDecisions,
    `${label}.socialCourtmateRescue.completed witnesses`, errors);
  for (const [index, witness] of realWitnesses.entries()) {
    const witnessLabel = `${label}.socialCourtmateRescue.witnesses[${index}]`;
    checkRescueWitness(witness, witnessLabel, errors, true);
  }

  equal(rescue.counterfactualStartedDecisions, checkpoint?.optimizer?.counterfactualWrapperCalls,
    `${label}.socialCourtmateRescue.counterfactualStartedDecisions vs optimizer.counterfactualWrapperCalls`, errors);
  equal(rescue.counterfactualAuditCompletedDecisions, rescue.counterfactualStartedDecisions,
    `${label}.socialCourtmateRescue.counterfactualAuditCompletedDecisions`, errors);
  equal(rescue.counterfactualCertifiedDecisions, rescue.counterfactualStartedDecisions,
    `${label}.socialCourtmateRescue.counterfactualCertifiedDecisions`, errors);
  for (const field of [
    "counterfactualUncertifiedDecisions", "counterfactualRankingDiscrepancies",
    "counterfactualFairnessCertificateFailures", "counterfactualGMaxCertificationFailures", "counterfactualAdmissionFailures",
    "counterfactualSearchLimitDecisions", "counterfactualIncompleteAuditDecisions",
  ]) zero(rescue[field], `${label}.socialCourtmateRescue.${field}`, errors);
  equal(rescue.counterfactualWitnesses?.length, rescue.counterfactualStartedDecisions,
    `${label}.socialCourtmateRescue.counterfactualWitnesses`, errors);
  for (const [index, witness] of (Array.isArray(rescue.counterfactualWitnesses) ? rescue.counterfactualWitnesses : []).entries()) {
    checkRescueWitness(witness, `${label}.socialCourtmateRescue.counterfactualWitnesses[${index}]`, errors, false);
  }
  checkCompletedRescueTotals(rescue, completedWitnesses, label, errors);
  equal(checkpoint?.starvation?.certifiedCounterfactualDecisions,
    checkpoint?.starvation?.decisionsWithOverdueAvailable,
    `${label}.starvation.certifiedCounterfactualDecisions`, errors);
  checkDisabledOldGates(checkpoint, label, errors);
}

function checkRescueWitness(witness, label, errors, realDecision) {
  if (witness?.started !== true) errors.push(`${label}.started is not true`);
  if (witness?.auditCompleted !== true) errors.push(`${label}.auditCompleted is not true`);
  if (witness?.fairnessCertified !== true) errors.push(`${label}.fairnessCertified is not true`);
  if (witness?.gMaxCertified !== true) errors.push(`${label}.gMaxCertified is not true`);
  if (witness?.policyCertified !== true) errors.push(`${label}.policyCertified is not true`);
  if (witness?.rankingMatches !== true) errors.push(`${label}.rankingMatches is not true`);
  if (witness?.courtmateCoverageProfileMatches !== true) errors.push(`${label}.courtmateCoverageProfileMatches is not true`);
  if (witness?.searchLimitReached !== false) errors.push(`${label}.searchLimitReached is not false`);
  if (realDecision && witness?.starvationCertified !== true) errors.push(`${label}.starvationCertified is not true`);
  if (!realDecision && witness?.counterfactual !== true) errors.push(`${label}.counterfactual is not true`);
  if (realDecision && witness?.counterfactual !== false) errors.push(`${label}.counterfactual is not false`);
  if (realDecision && witness?.completed !== true && witness?.completed !== false) errors.push(`${label}.completed is missing`);
  if (!realDecision && witness?.completed !== null) errors.push(`${label}.completed must be null for the counterfactual cohort`);
  if (witness?.completed === true && (!Number.isInteger(witness.completedAfterMatchNumber) || witness.completedAfterMatchNumber < 1)) {
    errors.push(`${label}.completedAfterMatchNumber is missing for a completed assignment`);
  }
  if (witness?.completed === false && witness.completedAfterMatchNumber !== null) {
    errors.push(`${label}.completedAfterMatchNumber must be null for a pending assignment`);
  }
  if (witness?.respectStarvation !== realDecision) errors.push(`${label}.respectStarvation does not match its audit cohort`);
  if (witness?.courtCount !== 1 && witness?.courtCount !== 2) errors.push(`${label}.courtCount=${witness?.courtCount ?? "missing"}`);
  if (!Array.isArray(witness?.selectedCourts) || witness.selectedCourts.length !== witness.courtCount) errors.push(`${label}.selectedCourts does not match courtCount`);
  if (!Array.isArray(witness?.bestGmaxCourts) || witness.bestGmaxCourts.length !== witness.courtCount) errors.push(`${label}.bestGmaxCourts is missing or incomplete`);
  if (!Number.isInteger(witness?.independentCandidateCount) || witness.independentCandidateCount <= 0) errors.push(`${label}.independentCandidateCount is missing or zero`);
  if (!Number.isInteger(witness?.admittedCandidateCount) || witness.admittedCandidateCount <= 0) errors.push(`${label}.admittedCandidateCount is missing or zero`);
  for (const field of ["courtMateGainMaximum", "chosenCourtmateGain", "chosenCourtmateGainDeficit", "bestRollingMatchTypeGainAtGmax", "chosenRollingMatchTypeGain", "incrementalTGainVsBestFullGainCandidate"]) {
    if (typeof witness?.[field] !== "number" || !Number.isFinite(witness[field])) errors.push(`${label}.${field}=${witness?.[field] ?? "missing"}`);
  }
  const courtPairLimit = Number.isInteger(witness?.courtCount) ? witness.courtCount * 6 : 0;
  for (const field of ["courtMateGainMaximum", "chosenCourtmateGain"]) {
    const value = witness?.[field];
    if (typeof value === "number" && (value < 0 || value > courtPairLimit)) {
      errors.push(`${label}.${field}=${value}; expected a nonnegative count no greater than ${courtPairLimit}`);
    }
  }
  if (typeof witness?.chosenCourtmateGainDeficit === "number" &&
      (!Number.isInteger(witness.chosenCourtmateGainDeficit) || witness.chosenCourtmateGainDeficit < 0 || witness.chosenCourtmateGainDeficit > 1)) {
    errors.push(`${label}.chosenCourtmateGainDeficit=${witness.chosenCourtmateGainDeficit}; expected 0 or 1`);
  }
  if (typeof witness?.courtMateGainMaximum === "number" && !Number.isInteger(witness.courtMateGainMaximum)) errors.push(`${label}.courtMateGainMaximum must be an integer pair count`);
  if (typeof witness?.chosenCourtmateGain === "number" && !Number.isInteger(witness.chosenCourtmateGain)) errors.push(`${label}.chosenCourtmateGain must be an integer pair count`);
  if (typeof witness?.courtMateGainMaximum === "number" && typeof witness?.chosenCourtmateGain === "number" &&
      typeof witness?.chosenCourtmateGainDeficit === "number" &&
      witness.courtMateGainMaximum - witness.chosenCourtmateGain !== witness.chosenCourtmateGainDeficit) {
    errors.push(`${label}.chosenCourtmateGainDeficit does not equal Gmax minus chosen gain`);
  }
  if (typeof witness?.chosenRollingMatchTypeGain === "number" &&
      typeof witness?.bestRollingMatchTypeGainAtGmax === "number" &&
      typeof witness?.incrementalTGainVsBestFullGainCandidate === "number" &&
      Math.abs(witness.chosenRollingMatchTypeGain - witness.bestRollingMatchTypeGainAtGmax - witness.incrementalTGainVsBestFullGainCandidate) > 1e-10) {
    errors.push(`${label}.incrementalTGainVsBestFullGainCandidate is inconsistent`);
  }
  if (typeof witness?.incrementalTGainVsBestFullGainCandidate === "number" && witness.incrementalTGainVsBestFullGainCandidate < 0) {
    errors.push(`${label}.incrementalTGainVsBestFullGainCandidate is negative despite a certified rolling-type optimum`);
  }
  if (typeof witness?.rollingTypeGainDenominator !== "string" || !witness.rollingTypeGainDenominator.trim()) {
    errors.push(`${label}.rollingTypeGainDenominator is missing`);
  }
  if (typeof witness?.zeroTBenefitSacrifice !== "boolean") errors.push(`${label}.zeroTBenefitSacrifice is missing`);
  if (typeof witness?.chosenCourtmateGainDeficit === "number") {
    const zeroBenefitSacrifice = witness.chosenCourtmateGainDeficit === 1 && witness.incrementalTGainVsBestFullGainCandidate === 0;
    if (witness.zeroTBenefitSacrifice !== zeroBenefitSacrifice) errors.push(`${label}.zeroTBenefitSacrifice disagrees with incremental rolling-T gain`);
  }
  if (!Array.isArray(witness?.perPlayerTypeWindows)) errors.push(`${label}.perPlayerTypeWindows is missing`);
  if (witness?.chosenCourtmateGainDeficit === 1 &&
      (!Array.isArray(witness.perPlayerTypeWindows) || witness.perPlayerTypeWindows.length !== 14)) {
    errors.push(`${label}.perPlayerTypeWindows must show all 14 players for a one-pair sacrifice`);
  }
  if (Array.isArray(witness?.selectedCourtmateCoverageProfile)) {
    if (witness.selectedCourtmateCoverageProfile.length !== 14) errors.push(`${label}.selectedCourtmateCoverageProfile must contain 14 players`);
    const profile = witness.selectedCourtmateCoverageProfile;
    const profileIds = new Set();
    for (const entry of profile) {
      if (typeof entry.userId !== "string" || !Number.isInteger(entry.covered) || !Number.isInteger(entry.possible) || entry.possible !== 13 || entry.covered < 0 || entry.covered > entry.possible) {
        errors.push(`${label}.selectedCourtmateCoverageProfile has an invalid structural entry`);
        break;
      }
      profileIds.add(entry.userId);
    }
    if (profileIds.size !== 14 || Array.from({ length: 14 }, (_value, index) => `P${index + 1}`).some((userId) => !profileIds.has(userId))) {
      errors.push(`${label}.selectedCourtmateCoverageProfile does not cover the fixed 14-player roster`);
    }
    for (let index = 1; index < profile.length; index += 1) {
      const previous = profile[index - 1];
      const current = profile[index];
      if (previous.covered * current.possible > current.covered * previous.possible) {
        errors.push(`${label}.selectedCourtmateCoverageProfile is not sorted ascending for equity comparison`);
        break;
      }
    }
  } else errors.push(`${label}.selectedCourtmateCoverageProfile is missing`);
  if (Array.isArray(witness?.engineCourtmateCoverageProfile)) {
    if (witness.engineCourtmateCoverageProfile.length !== 14) errors.push(`${label}.engineCourtmateCoverageProfile must contain 14 players`);
    const profileKey = (entry) => `${entry.userId}:${entry.covered}/${entry.possible}`;
    const expected = Array.isArray(witness?.selectedCourtmateCoverageProfile)
      ? witness.selectedCourtmateCoverageProfile.map(profileKey).sort()
      : [];
    const actual = witness.engineCourtmateCoverageProfile.map(profileKey).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label}.engineCourtmateCoverageProfile differs from the independent equity profile`);
  } else errors.push(`${label}.engineCourtmateCoverageProfile is missing`);
  if (!Number.isInteger(witness?.bestGmaxFullTypePlayerCount) || witness.bestGmaxFullTypePlayerCount < 0 || witness.bestGmaxFullTypePlayerCount > 14) {
    errors.push(`${label}.bestGmaxFullTypePlayerCount is missing or invalid`);
  }
  if (!Number.isInteger(witness?.chosenFullTypePlayerCount) || witness.chosenFullTypePlayerCount < 0 || witness.chosenFullTypePlayerCount > 14) {
    errors.push(`${label}.chosenFullTypePlayerCount is missing or invalid`);
  }
  if (!Number.isInteger(witness?.fullTypePlayerCountDeltaVsGmax) ||
      witness.fullTypePlayerCountDeltaVsGmax !== witness.chosenFullTypePlayerCount - witness.bestGmaxFullTypePlayerCount) {
    errors.push(`${label}.fullTypePlayerCountDeltaVsGmax is inconsistent`);
  }
}

function checkCompletedRescueTotals(rescue, completedWitnesses, label, errors) {
  const total = (field, selector) => {
    const actual = rescue[field];
    const expected = completedWitnesses.reduce((sum, witness) => sum + selector(witness), 0);
    if (typeof actual !== "number" || !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9) {
      errors.push(`${label}.socialCourtmateRescue.${field}=${actual ?? "missing"}; expected ${expected}`);
    }
  };
  const count = (field, selector) => {
    const actual = rescue[field];
    const expected = completedWitnesses.filter(selector).length;
    equal(actual, expected, `${label}.socialCourtmateRescue.${field}`, errors);
  };
  total("completedChosenCourtmatePairSacrifice", (witness) => witness.chosenCourtmateGainDeficit);
  count("completedOnePairSacrifices", (witness) => witness.chosenCourtmateGainDeficit === 1);
  count("completedOnePairSacrificesWithPositiveTBenefit", (witness) => witness.chosenCourtmateGainDeficit === 1 && witness.incrementalTGainVsBestFullGainCandidate > 0);
  count("completedOnePairSacrificesWithZeroTBenefit", (witness) => witness.chosenCourtmateGainDeficit === 1 && witness.incrementalTGainVsBestFullGainCandidate === 0);
  count("completedOnePairSacrificesWithNegativeTBenefit", (witness) => witness.chosenCourtmateGainDeficit === 1 && witness.incrementalTGainVsBestFullGainCandidate < 0);
  total("completedSignedRollingTGain", (witness) => witness.chosenRollingMatchTypeGain);
  total("completedBestGmaxSignedRollingTGain", (witness) => witness.bestRollingMatchTypeGainAtGmax);
  total("completedIncrementalTGainVsBestFullGain", (witness) => witness.incrementalTGainVsBestFullGainCandidate);
  if (typeof rescue.completedTGainDenominator !== "string" || !rescue.completedTGainDenominator.trim()) {
    errors.push(`${label}.socialCourtmateRescue.completedTGainDenominator is missing`);
  }
}

/** Reject missing, incomplete, uncertified, or policy-mismatched checkpoint proofs. */
export function assertSocialCourtmateRescueCheckpoint(checkpoint, policy, label = "checkpoint") {
  const errors = [];
  if (checkpoint?.completedMatches !== 21 && checkpoint?.completedMatches !== 100) {
    errors.push(`${label}.completedMatches=${checkpoint?.completedMatches ?? "missing"}`);
  }
  checkCommonSafety(checkpoint, label, errors);
  if (policy === "baseline") checkBaseline(checkpoint, label, errors);
  else if (policy === "strict") {
    checkDisabledOldGates(checkpoint, label, errors);
    checkPriority(checkpoint, label, errors);
    if (checkpoint?.socialCourtmateRescue !== undefined) errors.push(`${label}.unexpected socialCourtmateRescue on strict arm`);
  } else if (policy === "rescue") {
    checkRescue(checkpoint, label, errors);
    if (checkpoint?.socialPriority !== undefined) errors.push(`${label}.unexpected socialPriority on rescue arm`);
  } else errors.push(`unknown policy ${policy}`);
  assert(errors.length === 0, `${label} is not strictly certified: ${errors.join("; ")}`);
  return true;
}
