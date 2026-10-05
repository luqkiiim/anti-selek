import { describe, expect, it } from "vitest";
import {
  doClaimNamesMatch,
  getClaimRequesterEligibility,
  normalizeClaimName,
} from "./clubClaimRules";

describe("club claim rules", () => {
  it("normalizes names for exact comparison", () => {
    expect(normalizeClaimName("  Jane   Doe ")).toBe("jane doe");
    expect(doClaimNamesMatch("Jane Doe", "  jane   doe ")).toBe(true);
    expect(doClaimNamesMatch("Jane Doe", "Janet Doe")).toBe(false);
  });

  it("blocks unclaimed requesters", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: false,
        clubElo: 1000,
        hasClubSessionHistory: false,
      })
    ).toEqual({
      canRequest: false,
      reason: "Sign in with an account to request a Player connection.",
    });
  });

  it("does not use Elo as identity proof", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        clubElo: 1016,
        hasClubSessionHistory: false,
      })
    ).toEqual({
      canRequest: true,
      reason: null,
    });
  });

  it("allows requesting a connection after participation", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        clubElo: 1000,
        hasClubSessionHistory: true,
      })
    ).toEqual({
      canRequest: true,
      reason: null,
    });
  });

  it("allows clean claimed accounts", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        clubElo: 1000,
        hasClubSessionHistory: false,
      })
    ).toEqual({
      canRequest: true,
      reason: null,
    });
  });
});
