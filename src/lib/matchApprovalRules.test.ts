import { describe, expect, it } from "vitest";

import {
  canApprovePendingSubmission,
  getTeamNumberForUserId,
  shouldRequireOpponentApproval,
} from "./matchApprovalRules";

const match = {
  team1User1Id: "a1",
  team1User2Id: "a2",
  team2User1Id: "b1",
  team2User2Id: "b2",
};

describe("matchApprovalRules", () => {
  it("maps users to their match team", () => {
    expect(getTeamNumberForUserId(match, "a1")).toBe(1);
    expect(getTeamNumberForUserId(match, "b2")).toBe(2);
    expect(getTeamNumberForUserId(match, "x")).toBeNull();
  });

  it("requires opponent approval when the opposing team has a claimed player", () => {
    const claimedByUserId = new Map([
      ["a1", true],
      ["a2", false],
      ["b1", true],
      ["b2", false],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "a1",
        submitterIsAdmin: false,
        claimedByUserId,
      })
    ).toBe(true);
  });

  it("auto-approves when all opponents are guests or unclaimed", () => {
    const claimedByUserId = new Map([
      ["a1", true],
      ["a2", false],
      ["b1", false],
      ["b2", false],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "a2",
        submitterIsAdmin: false,
        claimedByUserId,
      })
    ).toBe(false);
  });

  it("lets a sideline admin submit without extra approval", () => {
    const claimedByUserId = new Map([
      ["a1", true],
      ["a2", true],
      ["b1", true],
      ["b2", true],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "admin",
        submitterIsAdmin: true,
        claimedByUserId,
      })
    ).toBe(false);
  });

  it("allows a claimed opponent or admin to confirm pending results", () => {
    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "b1",
        approverIsAdmin: false,
        approverIsClaimed: true,
        scoreSubmittedByUserId: "a1",
      })
    ).toBe(true);

    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "admin",
        approverIsAdmin: true,
        approverIsClaimed: false,
        scoreSubmittedByUserId: "a1",
      })
    ).toBe(true);
  });

  it("rejects unclaimed opponents and teammates from confirming", () => {
    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "b2",
        approverIsAdmin: false,
        approverIsClaimed: false,
        scoreSubmittedByUserId: "a1",
      })
    ).toBe(false);

    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "a2",
        approverIsAdmin: false,
        approverIsClaimed: true,
        scoreSubmittedByUserId: "a1",
      })
    ).toBe(false);
  });
});
