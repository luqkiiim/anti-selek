import { describe, expect, it } from "vitest";
import {
  isStrictlyDominantSocialCourtPartition,
  type SocialCourtPartitionDominanceMetrics,
} from "./socialFrontierSearchBounds";

function metrics(overrides: Partial<SocialCourtPartitionDominanceMetrics> = {}): SocialCourtPartitionDominanceMetrics {
  return {
    newCourtmatePairs: 6,
    rollingMatchTypeGainUnits: BigInt(0),
    courtmateCoverage: [
      { userId: "P1", covered: 1, possible: 4 },
      { userId: "P2", covered: 1, possible: 4 },
      { userId: "P3", covered: 1, possible: 4 },
      { userId: "P4", covered: 1, possible: 4 },
    ],
    newPartnerPairs: 2,
    newOpponentPairs: 4,
    relationshipFacetGains: [0.25, 0.5, 0.75],
    penalties: [0, 0, 0, 0, 0],
    balanceGap: 1,
    pointDiffGap: 0,
    ...overrides,
  };
}

describe("beneficial-rescue same-quartet partition dominance", () => {
  it("prunes only a strict earlier integer improvement when all preceding fields are tied", () => {
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ newPartnerPairs: 3 }), metrics(), 2, 2, 0,
    )).toBe(true);

    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ newOpponentPairs: 3 }), metrics(), 2, 2, 0,
    )).toBe(false);
  });

  it("uses exact per-player coverage comparisons and retains incompatible or tied profiles", () => {
    const right = metrics();
    const betterProfile = metrics({
      courtmateCoverage: right.courtmateCoverage.map((entry) =>
        entry.userId === "P2" ? { ...entry, covered: entry.covered + 1 } : entry
      ),
    });
    expect(isStrictlyDominantSocialCourtPartition(betterProfile, right, 2, 2, 0)).toBe(true);

    const incompatible = metrics({
      courtmateCoverage: right.courtmateCoverage.map((entry) =>
        entry.userId === "P2" ? { ...entry, possible: entry.possible + 1 } : entry
      ),
    });
    expect(isStrictlyDominantSocialCourtPartition(incompatible, right, 2, 2, 0)).toBe(false);
    expect(isStrictlyDominantSocialCourtPartition(right, metrics(), 2, 2, 0)).toBe(false);
  });

  it("keeps signed-T alternatives and entropy-only improvements for the full comparator", () => {
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ rollingMatchTypeGainUnits: BigInt(1) }), metrics(), 2, 2, 0,
    )).toBe(false);
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ relationshipFacetGains: [0.25, 0.75, 0.75] }), metrics(), 2, 2, 0,
    )).toBe(false);
  });

  it("requires a roundoff-safe strict batch gap improvement and retains near-equal floats", () => {
    const right = metrics({ balanceGap: 10 });
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 10 - 4 * Number.EPSILON }), right, 3, 30, 0,
    )).toBe(false);
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 9 }), right, 3, 30, 0,
    )).toBe(true);

    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 0.9999999999999999 }), metrics(), 1, 1, 0,
    )).toBe(true);
  });

  it("handles subnormal, huge, and non-finite gap bounds conservatively", () => {
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 0 }), metrics({ balanceGap: Number.MIN_VALUE }), 1, Number.MIN_VALUE, 0,
    )).toBe(true);
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 1e308 - 2e292 }), metrics({ balanceGap: 1e308 }), 2, Number.MAX_VALUE, 0,
    )).toBe(false);
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 0 }), metrics({ balanceGap: 1 }), 2, Number.POSITIVE_INFINITY, 0,
    )).toBe(false);
  });

  it("uses the exact point-difference tie layer only after balance remains non-worse", () => {
    const right = metrics({ pointDiffGap: 4 });
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ pointDiffGap: 3 }), right, 2, 2, 8,
    )).toBe(true);
    expect(isStrictlyDominantSocialCourtPartition(
      metrics({ balanceGap: 2, pointDiffGap: 3 }), right, 2, 2, 8,
    )).toBe(false);
  });
});
