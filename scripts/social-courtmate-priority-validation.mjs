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
  if (typeof expected !== "number" || actual !== expected) errors.push(`${label}=${actual ?? "missing"}; expected ${expected ?? "missing"}`);
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
  const cohorts = [
    ["coverageGate.refillDecisions", coverage?.refillDecisions],
    ["coverageGate.noStarvationRefillDecisions", coverage?.noStarvationRefillDecisions],
    ["replayEnvelope.productionRefillDecisions", replay?.productionRefillDecisions],
    ["replayEnvelope.noStarvationRefillDecisions", replay?.noStarvationRefillDecisions],
  ];
  for (const [field, count] of cohorts) equal(count, expectedRefills, `${label}.${field}`, errors);
  const certified = [
    ["coverageGate.certifiedDecisions", coverage?.certifiedDecisions, coverage?.refillDecisions],
    ["coverageGate.noStarvationCertifiedDecisions", coverage?.noStarvationCertifiedDecisions, coverage?.noStarvationRefillDecisions],
    ["replayEnvelope.productionReplayEnvelopeCertifiedDecisions", replay?.productionReplayEnvelopeCertifiedDecisions, replay?.productionRefillDecisions],
    ["replayEnvelope.productionCertifiedDecisions", replay?.productionCertifiedDecisions, replay?.productionRefillDecisions],
    ["replayEnvelope.noStarvationReplayEnvelopeCertifiedDecisions", replay?.noStarvationReplayEnvelopeCertifiedDecisions, replay?.noStarvationRefillDecisions],
    ["replayEnvelope.noStarvationCertifiedDecisions", replay?.noStarvationCertifiedDecisions, replay?.noStarvationRefillDecisions],
    ["starvation.certifiedCounterfactualDecisions", checkpoint?.starvation?.certifiedCounterfactualDecisions, checkpoint?.starvation?.decisionsWithOverdueAvailable],
  ];
  for (const [field, actual, expected] of certified) equal(actual, expected, `${label}.${field}`, errors);
  for (const [field, value] of [
    ["coverageGate.uncertifiedDecisions", coverage?.uncertifiedDecisions],
    ["coverageGate.noStarvationUncertifiedDecisions", coverage?.noStarvationUncertifiedDecisions],
    ["replayEnvelope.productionUncertifiedDecisions", replay?.productionUncertifiedDecisions],
    ["replayEnvelope.noStarvationUncertifiedDecisions", replay?.noStarvationUncertifiedDecisions],
  ]) zero(value, `${label}.${field}`, errors);
}

function checkCandidate(checkpoint, label, errors) {
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
  equal(checkpoint?.starvation?.certifiedCounterfactualDecisions,
    checkpoint?.starvation?.decisionsWithOverdueAvailable,
    `${label}.starvation.certifiedCounterfactualDecisions`, errors);
  equal(priority.counterfactualAuditDecisions,
    checkpoint?.optimizer?.counterfactualWrapperCalls,
    `${label}.socialPriority.counterfactualAuditDecisions vs optimizer.counterfactualWrapperCalls`, errors);
  equal(priority.counterfactualCertifiedDecisions,
    priority.counterfactualAuditDecisions,
    `${label}.socialPriority.counterfactualCertifiedDecisions`, errors);
  for (const field of [
    "counterfactualUncertifiedDecisions", "counterfactualRankingDiscrepancies",
    "counterfactualFairnessCertificateFailures", "counterfactualSearchLimitDecisions",
    "counterfactualIncompleteDecisions",
  ]) zero(priority[field], `${label}.socialPriority.${field}`, errors);

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
}

/** Reject missing, incomplete, or policy-mismatched saved certificates. */
export function assertSocialCourtmatePriorityCheckpoint(checkpoint, policy, label = "checkpoint") {
  const errors = [];
  if (checkpoint?.completedMatches !== 21 && checkpoint?.completedMatches !== 100) {
    errors.push(`${label}.completedMatches=${checkpoint?.completedMatches ?? "missing"}`);
  }
  checkCommonSafety(checkpoint, label, errors);
  if (policy === "baseline") checkBaseline(checkpoint, label, errors);
  else if (policy === "candidate") checkCandidate(checkpoint, label, errors);
  else errors.push(`unknown policy ${policy}`);
  assert(errors.length === 0, `${label} is not strictly certified: ${errors.join("; ")}`);
  return true;
}
