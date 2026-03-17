import { describe, expect, it } from "vitest";

import { SessionMode } from "../../../types/enums";
import { findBestBatchSelectionLadder } from "./batch";
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
    gender: "MALE",
    partnerPreference: "OPEN",
    lastPartnerId: null,
    ...overrides,
  };
}

describe("ladder batch selection", () => {
  it("builds a full global batch and uses all locked lower-band players", () => {
    const players = [
      createPlayer("A", { matchesPlayed: 4, wins: 3, losses: 0, pointDiff: 18 }),
      createPlayer("B", { matchesPlayed: 4, wins: 2, losses: 0, pointDiff: 12 }),
      createPlayer("C", { matchesPlayed: 4, wins: 2, losses: 1, pointDiff: 6 }),
      createPlayer("D", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 2 }),
      createPlayer("E", { matchesPlayed: 4, wins: 0, losses: 2, pointDiff: -6 }),
      createPlayer("F", { matchesPlayed: 4, wins: 0, losses: 3, pointDiff: -11 }),
      createPlayer("G", { matchesPlayed: 5, wins: 2, losses: 1, pointDiff: 8 }),
      createPlayer("H", { matchesPlayed: 5, wins: 1, losses: 1, pointDiff: 3 }),
    ];

    const result = findBestBatchSelectionLadder(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.selections).toHaveLength(2);
    expect(
      result.selection?.selections.flatMap((selection) => selection.ids).sort()
    ).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("clusters nearby ladder scores across courts", () => {
    const players = [
      createPlayer("A", { matchesPlayed: 5, wins: 4, losses: 0, pointDiff: 20 }),
      createPlayer("B", { matchesPlayed: 5, wins: 3, losses: 0, pointDiff: 15 }),
      createPlayer("C", { matchesPlayed: 5, wins: 2, losses: 1, pointDiff: 8 }),
      createPlayer("D", { matchesPlayed: 5, wins: 1, losses: 1, pointDiff: 3 }),
      createPlayer("E", { matchesPlayed: 5, wins: 0, losses: 1, pointDiff: -2 }),
      createPlayer("F", { matchesPlayed: 5, wins: 0, losses: 2, pointDiff: -7 }),
      createPlayer("G", { matchesPlayed: 5, wins: 0, losses: 3, pointDiff: -12 }),
      createPlayer("H", { matchesPlayed: 5, wins: 0, losses: 4, pointDiff: -18 }),
    ];

    const result = findBestBatchSelectionLadder(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.selections.map((selection) => selection.ids)).toEqual([
      ["A", "B", "C", "D"],
      ["E", "F", "G", "H"],
    ]);
  });

  it("returns no batch when not enough active players are available", () => {
    const players = [
      createPlayer("A"),
      createPlayer("B"),
      createPlayer("C"),
      createPlayer("D"),
      createPlayer("E", { isPaused: true }),
      createPlayer("F", { isBusy: true }),
    ];

    const result = findBestBatchSelectionLadder(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).toBeNull();
  });
});
