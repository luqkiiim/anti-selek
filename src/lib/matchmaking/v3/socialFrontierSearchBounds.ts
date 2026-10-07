import type { SocialCourtmateCoverageEntry } from "./types";

function compareFractions(
  leftCovered: number,
  leftPossible: number,
  rightCovered: number,
  rightPossible: number
): number {
  const leftCross = BigInt(leftCovered) * BigInt(rightPossible);
  const rightCross = BigInt(rightCovered) * BigInt(leftPossible);
  return leftCross === rightCross ? 0 : leftCross < rightCross ? -1 : 1;
}

/**
 * Exact relaxed leximin upper bound for a partially chosen court batch.
 * Each still-selectable player is relaxed to their maximum possible gain on
 * one future court, and at most `additionalPlayerSlots` players can improve.
 *
 * The greedy exchange rule is exact for this relaxation: improve the lowest
 * current fractions first; among equal current fractions, choose the greatest
 * attainable endpoint. A lower current fraction otherwise remains an earlier
 * order statistic and makes the sorted profile worse. A higher endpoint wins
 * an exchange between equal starting fractions.
 */
export function buildOptimisticCourtmateCoverageProfile(
  profile: readonly SocialCourtmateCoverageEntry[],
  maxAdditionalGainByUserId: ReadonlyMap<string, number>,
  fixedUserIds: ReadonlySet<string>,
  additionalPlayerSlots: number
): SocialCourtmateCoverageEntry[] {
  const upgrades = profile.flatMap((entry) => {
    const maximumGain = maxAdditionalGainByUserId.get(entry.userId) ?? 0;
    if (entry.possible <= 0 || fixedUserIds.has(entry.userId) ||
      entry.covered >= entry.possible || maximumGain <= 0) return [];
    return [{
      entry,
      upgradedCovered: Math.min(entry.possible, entry.covered + maximumGain),
    }];
  }).sort((left, right) =>
    compareFractions(
      left.entry.covered,
      left.entry.possible,
      right.entry.covered,
      right.entry.possible
    ) ||
    compareFractions(
      right.upgradedCovered,
      right.entry.possible,
      left.upgradedCovered,
      left.entry.possible
    ) ||
    left.entry.userId.localeCompare(right.entry.userId)
  );
  const upgradedIds = new Set(
    upgrades.slice(0, Math.max(0, Math.floor(additionalPlayerSlots))).map(({ entry }) => entry.userId)
  );
  const upgradedById = new Map(upgrades.map(({ entry, upgradedCovered }) => [entry.userId, upgradedCovered]));
  return profile
    .filter((entry) => entry.possible > 0)
    .map((entry) => ({
      ...entry,
      covered: upgradedIds.has(entry.userId)
        ? upgradedById.get(entry.userId) ?? entry.covered
        : entry.covered,
    }))
    .sort((left, right) =>
      compareFractions(left.covered, left.possible, right.covered, right.possible) ||
      left.userId.localeCompare(right.userId)
    );
}

export interface SocialCourtPartitionDominanceMetrics {
  readonly newCourtmatePairs: number;
  readonly rollingMatchTypeGainUnits: bigint;
  readonly courtmateCoverage: readonly SocialCourtmateCoverageEntry[];
  readonly newPartnerPairs: number;
  readonly newOpponentPairs: number;
  readonly relationshipFacetGains: readonly [number, number, number];
  readonly penalties: readonly [number, number, number, number, number];
  readonly balanceGap: number;
  readonly pointDiffGap: number;
}

function compareCoverageForSamePlayers(
  left: readonly SocialCourtmateCoverageEntry[],
  right: readonly SocialCourtmateCoverageEntry[]
): number | null {
  if (left.length !== right.length) return null;
  const rightById = new Map(right.map((entry) => [entry.userId, entry]));
  let strict = false;
  for (const entry of left) {
    const other = rightById.get(entry.userId);
    if (!other || entry.possible !== other.possible) return null;
    if (entry.covered < other.covered) return -1;
    if (entry.covered > other.covered) strict = true;
  }
  return strict ? 1 : 0;
}

/**
 * Returns true only when one partition can replace another for the same
 * quartet on the same court without changing the selected-player set, and is
 * strictly better before the whole-batch random tie-break.
 *
 * The caller groups equal signed-T gains. For a fixed quartet, courtmate
 * exposures and their per-player profile are partition-independent. The
 * remaining per-court metrics are additive or coordinatewise monotone in the
 * final objective. Equality and numerically ambiguous float improvements are
 * retained so every possible batch-hash/side-balanced winner stays reachable.
 */
export function isStrictlyDominantSocialCourtPartition(
  left: SocialCourtPartitionDominanceMetrics,
  right: SocialCourtPartitionDominanceMetrics,
  courtCount: number,
  maximumAbsoluteBatchBalanceGap: number,
  maximumAbsoluteBatchPointDiffGap: number
): boolean {
  if (left.rollingMatchTypeGainUnits !== right.rollingMatchTypeGainUnits) return false;
  if (!Number.isSafeInteger(left.newCourtmatePairs) || !Number.isSafeInteger(right.newCourtmatePairs)) return false;
  if (left.newCourtmatePairs < right.newCourtmatePairs) return false;
  if (left.newCourtmatePairs > right.newCourtmatePairs) return true;

  const coverageComparison = compareCoverageForSamePlayers(left.courtmateCoverage, right.courtmateCoverage);
  if (coverageComparison === null) return false;
  if (coverageComparison < 0) return false;
  if (coverageComparison > 0) return true;

  if (!Number.isSafeInteger(left.newPartnerPairs) || !Number.isSafeInteger(right.newPartnerPairs) ||
    !Number.isSafeInteger(left.newOpponentPairs) || !Number.isSafeInteger(right.newOpponentPairs)) return false;
  if (left.newPartnerPairs < right.newPartnerPairs) return false;
  if (left.newPartnerPairs > right.newPartnerPairs) return true;
  if (left.newOpponentPairs < right.newOpponentPairs) return false;
  if (left.newOpponentPairs > right.newOpponentPairs) return true;

  if (left.relationshipFacetGains.some((gain, index) =>
    !Number.isFinite(gain) || gain < right.relationshipFacetGains[index])) return false;
  if (right.relationshipFacetGains.some((gain) => !Number.isFinite(gain))) return false;
  if (left.penalties.some((penalty, index) =>
    !Number.isFinite(penalty) || penalty > right.penalties[index])) return false;
  if (right.penalties.some((penalty) => !Number.isFinite(penalty))) return false;

  if (!Number.isFinite(left.balanceGap) || !Number.isFinite(right.balanceGap) || left.balanceGap > right.balanceGap ||
    !Number.isFinite(left.pointDiffGap) || !Number.isFinite(right.pointDiffGap) ||
    left.pointDiffGap > right.pointDiffGap) return false;

  return hasStrictCanonicalSumImprovement(
    left.balanceGap,
    right.balanceGap,
    courtCount,
    maximumAbsoluteBatchBalanceGap
  ) || hasStrictCanonicalSumImprovement(
    left.pointDiffGap,
    right.pointDiffGap,
    courtCount,
    maximumAbsoluteBatchPointDiffGap
  );
}

function hasStrictCanonicalSumImprovement(
  leftAddend: number,
  rightAddend: number,
  termCount: number,
  maximumAbsoluteBatchSum: number
): boolean {
  if (!(leftAddend < rightAddend) || !Number.isSafeInteger(termCount) || termCount < 1 ||
    !Number.isFinite(maximumAbsoluteBatchSum) || maximumAbsoluteBatchSum < 0) return false;
  if (termCount === 1) return true;

  // Standard forward-error bound for any ordering of n finite additions.
  // Number.EPSILON is twice unit roundoff, so this is deliberately loose.
  const scaledEpsilon = termCount * Number.EPSILON;
  if (scaledEpsilon >= 1) return false;
  const gamma = scaledEpsilon / (1 - scaledEpsilon);
  const maximumDifferenceInRoundingError = 2 * gamma * maximumAbsoluteBatchSum;
  return rightAddend - leftAddend > maximumDifferenceInRoundingError;
}
