import { describe, expect, it } from "vitest";

import {
  canApprovePendingSubmission,
  getTeamNumberForUserId,
  shouldRequireOpponentApproval,
} from "./matchApprovalRules";

const match = {
  team1Player1Id: "player-a1",
  team1Player2Id: "player-a2",
  team2Player1Id: "player-b1",
  team2Player2Id: "player-b2",
};

describe("matchApprovalRules", () => {
  it("maps compatibility user IDs to Player teams", () => {
    expect(getTeamNumberForUserId(match, "player-a1")).toBe(1);
    expect(getTeamNumberForUserId(match, "player-b2")).toBe(2);
    expect(getTeamNumberForUserId(match, "account-a1")).toBeNull();
  });

  it("requires opponent approval when the opposing team has a claimed player", () => {
    const claimedByUserId = new Map([
      ["player-a1", true],
      ["player-a2", false],
      ["player-b1", true],
      ["player-b2", false],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "account-a1",
        submitterPlayerId: "player-a1",
        submitterIsAdmin: false,
        claimedByUserId,
      })
    ).toBe(true);
  });

  it("auto-approves when all opponents are guests or unclaimed", () => {
    const claimedByUserId = new Map([
      ["player-a1", true],
      ["player-a2", false],
      ["player-b1", false],
      ["player-b2", false],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "account-a2",
        submitterPlayerId: "player-a2",
        submitterIsAdmin: false,
        claimedByUserId,
      })
    ).toBe(false);
  });

  it("does not infer the submitting Player from an equal Account ID string", () => {
    const claimedByUserId = new Map([
      ["player-a1", true],
      ["player-a2", true],
      ["player-b1", false],
      ["player-b2", false],
    ]);

    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "player-a1",
        submitterIsAdmin: false,
        claimedByUserId,
      })
    ).toBe(true);
  });

  it("lets a sideline admin submit without extra approval", () => {
    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "admin-account",
        submitterIsAdmin: true,
        claimedByUserId: new Map(),
      })
    ).toBe(false);
  });

  it("lets a playing operator submit without extra approval", () => {
    expect(
      shouldRequireOpponentApproval({
        match,
        submitterUserId: "account-a1",
        submitterPlayerId: "player-a1",
        submitterIsAdmin: true,
        claimedByUserId: new Map(),
      })
    ).toBe(false);
  });

  it("allows a claimed opponent to confirm using separate account and Player IDs", () => {
    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "account-b1",
        approverPlayerId: "player-b1",
        approverIsAdmin: false,
        approverIsClaimed: true,
        scoreSubmittedByUserId: "account-a1",
        scoreSubmittedByPlayerId: "player-a1",
      })
    ).toBe(true);
  });

  it("does not infer either participant from an Account ID", () => {
    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "player-b1",
        approverIsAdmin: false,
        approverIsClaimed: true,
        scoreSubmittedByUserId: "player-a1",
      })
    ).toBe(false);
  });

  it("rejects unclaimed opponents and teammates from confirming", () => {
    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "account-b2",
        approverPlayerId: "player-b2",
        approverIsAdmin: false,
        approverIsClaimed: false,
        scoreSubmittedByUserId: "account-a1",
        scoreSubmittedByPlayerId: "player-a1",
      })
    ).toBe(false);

    expect(
      canApprovePendingSubmission({
        match,
        approverUserId: "account-a2",
        approverPlayerId: "player-a2",
        approverIsAdmin: false,
        approverIsClaimed: true,
        scoreSubmittedByUserId: "account-a1",
        scoreSubmittedByPlayerId: "player-a1",
      })
    ).toBe(false);
  });
});