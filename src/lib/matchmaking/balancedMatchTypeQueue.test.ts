import { describe, expect, it } from "vitest";
import { buildBalancedMatchTypeContext } from "./v3/balancedMatchTypes";
import { getBalancedQueueDeferralReason } from "./balancedMatchTypeQueue";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
} from "./v3/types";

function fixture(upper = 10, lower = 5) {
  const players: MatchmakerV3Player[] = Array.from(
    { length: upper + lower },
    (_, index) => ({
      userId: `P${index}`,
      gender: index < upper ? "MALE" : "FEMALE",
      mixedSideOverride: index < upper ? "UPPER" : "LOWER",
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      strength: 1000,
      availableSince: new Date(0),
    }),
  );
  const context = buildBalancedMatchTypeContext(players, []);
  const proposed: V3DoublesPartition = {
    team1: ["P0", `P${upper}`],
    team2: ["P1", `P${upper + 1}`],
  };
  const prior: V3DoublesPartition = {
    team1: ["P2", `P${upper + 1}`],
    team2: ["P3", `P${upper + 2}`],
  };
  const history: SocialHistoryMatch[] = [
    { id: "prior", ...prior, balancedMatchType: context.snapshot(prior)! },
  ];
  const waiting = [
    "P0",
    "P1",
    "P4",
    "P5",
    `P${upper}`,
    `P${upper + 1}`,
    `P${upper + 4}`,
  ];
  return {
    players,
    partition: proposed,
    reasonJson: JSON.stringify({
      balancedMatchType: context.snapshot(proposed),
    }),
    history,
    availablePlayerIds: new Set(waiting),
  };
}

describe("optional adaptive queue admission", () => {
  it("keeps a five-player minority's owed own-side game reachable", () => {
    const input = fixture();
    expect(getBalancedQueueDeferralReason(input)).toBeNull(); // Only two expectations: below half-match debt.
    input.history.push({ ...input.history[0], id: "second" });
    expect(getBalancedQueueDeferralReason(input)).toBe(
      "UNDERREPRESENTED_TYPE_BLOCKED",
    );
    input.availablePlayerIds.add("P13");
    expect(getBalancedQueueDeferralReason(input)).toBeNull(); // Four Lower players can now be considered.
  });
  it("does not try to create a structurally impossible minority category", () => {
    const input = fixture(11, 3);
    // Three Lower players can only play Mixed; their own-side target is zero.
    input.history = Array.from({ length: 4 }, (_, index) => ({
      ...input.history[0],
      id: `h${index}`,
    }));
    input.availablePlayerIds = new Set([
      "P0",
      "P1",
      "P4",
      "P5",
      "P11",
      "P12",
      "P13",
    ]);
    expect(getBalancedQueueDeferralReason(input)).toBeNull();
  });
  it("does not synchronize an entire four-player level into an own-side cohort", () => {
    const input = fixture(12, 4);
    input.history = Array.from({ length: 4 }, (_, index) => ({
      ...input.history[0],
      id: `h${index}`,
    }));
    input.availablePlayerIds = new Set(["P0", "P1", "P4", "P5", "P12", "P13"]);
    expect(getBalancedQueueDeferralReason(input)).toBeNull();
  });
});
