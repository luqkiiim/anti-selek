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
      reason: "Only claimed accounts can request a profile merge.",
    });
  });

  it("blocks accounts with club rating history", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        clubElo: 1016,
        hasClubSessionHistory: false,
      })
    ).toEqual({
      canRequest: false,
      reason: "This account already has club rating history. Manual merge required.",
    });
  });

  it("blocks accounts with tournament history", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        clubElo: 1000,
        hasClubSessionHistory: true,
      })
    ).toEqual({
      canRequest: false,
      reason: "This account already has tournament history in this club. Manual merge required.",
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
