import { describe, expect, it } from "vitest";

import {
  applyNeutralEntryBaseline,
  getNeutralMatchmakingBaseline,
} from "./entry";
import type { MatchmakerV3Player } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerV3Player> = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("matchmaking v3 entry", () => {
  it("uses the current lowest active effective band as the neutral baseline", () => {
    const baseline = getNeutralMatchmakingBaseline(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4, isPaused: true }),
        createPlayer("C", { matchesPlayed: 2, matchmakingBaseline: 5 }),
        createPlayer("D", { matchesPlayed: 3, isBusy: true }),
      ],
      { now: new Date("2026-03-18T01:00:00Z").getTime() }
    );

    expect(baseline).toBe(4);
  });

  it("applies the neutral baseline and resets availability to entry time", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const updated = applyNeutralEntryBaseline(
      createPlayer("Late", {
        matchesPlayed: 1,
        matchmakingBaseline: 0,
        availableSince: new Date("2026-03-18T00:00:00Z"),
      }),
      [
        createPlayer("A", { matchesPlayed: 5 }),
        createPlayer("B", { matchesPlayed: 5 }),
      ],
      { now }
    );

    expect(updated.matchmakingBaseline).toBe(5);
    expect(updated.availableSince).toEqual(new Date(now));
  });
});
