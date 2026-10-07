import { assertSocialCourtmateRescueCheckpoint as assertExistingArmCheckpoint } from "./social-courtmate-rescue-validation.mjs";

export { assertExistingArmCheckpoint as assertSocialCourtmateRescueCheckpoint };

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function closeEnough(actual, expected) {
  return Math.abs(actual - expected) <= 1e-10;
}

function assertBeneficialWitness(witness, label, errors) {
  for (const field of ["strictWinnerRollingMatchTypeGainAtGmax", "fullGmaxTBenefitVsStrict"]) {
    if (!finiteNumber(witness?.[field])) errors.push(`${label}.${field} is missing or non-finite`);
  }
  const strictCourts = witness?.strictWinnerAtGmaxCourts;
  if (!Array.isArray(strictCourts) || strictCourts.length !== witness?.courtCount ||
      strictCourts.some((court) => {
        const teams = [court?.partition?.team1, court?.partition?.team2];
        const ids = Array.isArray(court?.ids) ? court.ids : [];
        return ids.length !== 4 || new Set(ids).size !== 4 || ids.some((id) => !/^P(?:[1-9]|1[0-4])$/.test(id)) ||
          teams.some((team) => !Array.isArray(team) || team.length !== 2) ||
          JSON.stringify([...teams.flat()].sort()) !== JSON.stringify([...ids].sort());
      })) {
    errors.push(`${label}.strictWinnerAtGmaxCourts is missing or malformed`);
  }
  const strictFullTypeCount = witness?.strictWinnerAtGmaxFullTypePlayerCount;
  if (!Number.isInteger(strictFullTypeCount) || strictFullTypeCount < 0 || strictFullTypeCount > 14) {
    errors.push(`${label}.strictWinnerAtGmaxFullTypePlayerCount is missing or invalid`);
  }
  if (finiteNumber(witness?.strictWinnerRollingMatchTypeGainAtGmax) &&
      finiteNumber(witness?.chosenRollingMatchTypeGain) && finiteNumber(witness?.fullGmaxTBenefitVsStrict)) {
    const expected = witness.chosenCourtmateGainDeficit === 0
      ? witness.chosenRollingMatchTypeGain - witness.strictWinnerRollingMatchTypeGainAtGmax
      : 0;
    if (!closeEnough(witness.fullGmaxTBenefitVsStrict, expected)) {
      errors.push(`${label}.fullGmaxTBenefitVsStrict does not match the same-state strict profile-first comparison`);
    }
    if (witness.chosenCourtmateGainDeficit === 0 && witness.fullGmaxTBenefitVsStrict < -1e-10) {
      errors.push(`${label} is worse than strict at full Gmax despite maximizing T first`);
    }
  }
  if (witness?.chosenCourtmateGainDeficit === 1 &&
      (!finiteNumber(witness?.incrementalTGainVsBestFullGainCandidate) || witness.incrementalTGainVsBestFullGainCandidate <= 0)) {
    errors.push(`${label} gives up one courtmate pair without strictly positive conditional T benefit`);
  }
  if (witness?.chosenCourtmateGainDeficit === 1 && witness?.zeroTBenefitSacrifice !== false) {
    errors.push(`${label} has a zero-benefit one-pair concession`);
  }
}

function assertBeneficialSummary(rescue, completedWitnesses, label, errors) {
  const count = (field, predicate) => {
    const actual = rescue?.[field];
    const expected = completedWitnesses.filter(predicate).length;
    if (actual !== expected) errors.push(`${label}.${field}=${actual ?? "missing"}; expected ${expected}`);
  };
  const total = (field, selector) => {
    const actual = rescue?.[field];
    const expected = completedWitnesses.reduce((sum, witness) => sum + selector(witness), 0);
    if (!finiteNumber(actual) || !closeEnough(actual, expected)) {
      errors.push(`${label}.${field}=${actual ?? "missing"}; expected ${expected}`);
    }
  };
  const atGmax = (witness) => witness.chosenCourtmateGainDeficit === 0;
  count("completedAtGmaxDecisions", atGmax);
  count("completedAtGmaxWithPositiveSignedTGain", (witness) => atGmax(witness) && witness.chosenRollingMatchTypeGain > 0);
  count("completedAtGmaxWithStrictOrderingBenefit", (witness) => atGmax(witness) && witness.fullGmaxTBenefitVsStrict > 0);
  total("completedAtGmaxIncrementalTVsStrictWinner", (witness) => witness.fullGmaxTBenefitVsStrict);
  total("completedAtGmaxExtraBothTypePlayerWindowsVsStrictWinner", (witness) => atGmax(witness)
    ? witness.chosenFullTypePlayerCount - witness.strictWinnerAtGmaxFullTypePlayerCount
    : 0);
}

/** Validate baseline/strict/near-best with the frozen validator, and the new arm with extra strict-benefit proofs. */
export function assertSocialCourtmateBeneficialRescueCheckpoint(checkpoint, arm, label = "checkpoint") {
  if (arm !== "beneficial") return assertExistingArmCheckpoint(checkpoint, arm, label);
  const rescue = checkpoint?.socialCourtmateBeneficialRescue;
  if (!rescue) throw new Error(`${label}.socialCourtmateBeneficialRescue is missing`);
  if (checkpoint?.socialCourtmateRescue !== undefined || checkpoint?.socialPriority !== undefined) {
    throw new Error(`${label} contains an unexpected control-arm priority summary`);
  }

  // Reuse the existing independently audited Gmax/envelope/safety certificate.
  assertExistingArmCheckpoint({ ...checkpoint, socialCourtmateRescue: rescue }, "rescue", label);

  const errors = [];
  const realWitnesses = Array.isArray(rescue.witnesses) ? rescue.witnesses : [];
  const counterfactualWitnesses = Array.isArray(rescue.counterfactualWitnesses) ? rescue.counterfactualWitnesses : [];
  for (const [index, witness] of realWitnesses.entries()) {
    assertBeneficialWitness(witness, `${label}.socialCourtmateBeneficialRescue.witnesses[${index}]`, errors);
  }
  for (const [index, witness] of counterfactualWitnesses.entries()) {
    assertBeneficialWitness(witness, `${label}.socialCourtmateBeneficialRescue.counterfactualWitnesses[${index}]`, errors);
  }
  if (rescue.completedOnePairSacrificesWithZeroTBenefit !== 0) {
    errors.push(`${label}.completedOnePairSacrificesWithZeroTBenefit must be zero`);
  }
  if (rescue.completedOnePairSacrificesWithNegativeTBenefit !== 0) {
    errors.push(`${label}.completedOnePairSacrificesWithNegativeTBenefit must be zero`);
  }
  const completedWitnesses = realWitnesses.filter((witness) => witness?.completed === true);
  assertBeneficialSummary(rescue, completedWitnesses, `${label}.socialCourtmateBeneficialRescue`, errors);
  if (errors.length) throw new Error(`${label} is not strictly beneficially certified: ${errors.join("; ")}`);
  return true;
}
