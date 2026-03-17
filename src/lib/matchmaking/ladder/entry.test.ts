import { describe, expect, it } from "vitest";

import {
  applyNeutralLadderEntry,
  getNeutralMatchmakingBaseline,
} from "./entry";
import type { MatchmakerLadderPlayer } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerLadderPlayer> = {}
): MatchmakerLadderPlayer {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("ladder entry", () => {
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

  it("applies the neutral baseline, resets availability, and zeroes ladder standing", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const updated = applyNeutralLadderEntry(
      createPlayer("Late", {
        matchesPlayed: 1,
        matchmakingBaseline: 0,
        availableSince: new Date("2026-03-18T00:00:00Z"),
        wins: 3,
        losses: 1,
        pointDiff: 18,
        ladderScore: 2,
      }),
      [
        createPlayer("A", { matchesPlayed: 5 }),
        createPlayer("B", { matchesPlayed: 5 }),
      ],
      { now }
    );

    expect(updated.matchmakingBaseline).toBe(5);
    expect(updated.availableSince).toEqual(new Date(now));
    expect(updated.wins).toBe(0);
    expect(updated.losses).toBe(0);
    expect(updated.pointDiff).toBe(0);
    expect(updated.ladderScore).toBe(0);
  });
});
