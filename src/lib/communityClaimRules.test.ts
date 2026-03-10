import { describe, expect, it } from "vitest";
import {
  doClaimNamesMatch,
  getClaimRequesterEligibility,
  normalizeClaimName,
} from "./communityClaimRules";

describe("community claim rules", () => {
  it("normalizes names for exact comparison", () => {
    expect(normalizeClaimName("  Jane   Doe ")).toBe("jane doe");
    expect(doClaimNamesMatch("Jane Doe", "  jane   doe ")).toBe(true);
    expect(doClaimNamesMatch("Jane Doe", "Janet Doe")).toBe(false);
  });

  it("blocks unclaimed requesters", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: false,
        communityElo: 1000,
        hasCommunitySessionHistory: false,
      })
    ).toEqual({
      canRequest: false,
      reason: "Only claimed accounts can request a profile merge.",
    });
  });

  it("blocks accounts with community rating history", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        communityElo: 1016,
        hasCommunitySessionHistory: false,
      })
    ).toEqual({
      canRequest: false,
      reason: "This account already has community rating history. Manual merge required.",
    });
  });

  it("blocks accounts with tournament history", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        communityElo: 1000,
        hasCommunitySessionHistory: true,
      })
    ).toEqual({
      canRequest: false,
      reason: "This account already has tournament history in this community. Manual merge required.",
    });
  });

  it("allows clean claimed accounts", () => {
    expect(
      getClaimRequesterEligibility({
        isClaimed: true,
        communityElo: 1000,
        hasCommunitySessionHistory: false,
      })
    ).toEqual({
      canRequest: true,
      reason: null,
    });
  });
});
