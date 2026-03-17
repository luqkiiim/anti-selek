import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
import { findBestBatchSelectionV3 } from "./batch";
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
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

describe("matchmaking v3 batch selection", () => {
  it("builds a full global batch and uses all locked lower-band players", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", { matchesPlayed: 4 }),
        createPlayer("D", { matchesPlayed: 4 }),
        createPlayer("E", { matchesPlayed: 4 }),
        createPlayer("F", { matchesPlayed: 4 }),
        createPlayer("G", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:00:00Z"),
        }),
        createPlayer("H", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:05:00Z"),
        }),
        createPlayer("I", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:10:00Z"),
        }),
        createPlayer("J", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:12:00Z"),
        }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.debug.lockedPlayerIds).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(
      new Set(result.selection?.selections.flatMap((selection) => selection.ids))
    ).toEqual(new Set(["A", "B", "C", "D", "E", "F", "G", "H"]));
  });

  it("prefers a close non-rematch batch over repeating exact rematches", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 1600 }),
        createPlayer("B", { strength: 1400 }),
        createPlayer("C", { strength: 1580 }),
        createPlayer("D", { strength: 1420 }),
        createPlayer("E", { strength: 1300 }),
        createPlayer("F", { strength: 1100 }),
        createPlayer("G", { strength: 1280 }),
        createPlayer("H", { strength: 1120 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["G", "H"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    const partitionKeys = result.selection?.selections.map((selection) => [
      [...selection.partition.team1].sort().join("|"),
      [...selection.partition.team2].sort().join("|"),
    ].sort().join("||"));

    expect(partitionKeys).not.toContain("A|B||C|D");
    expect(partitionKeys).not.toContain("E|F||G|H");
  });

  it("returns no batch when not enough active players are available", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A"),
        createPlayer("B"),
        createPlayer("C"),
        createPlayer("D"),
        createPlayer("E"),
        createPlayer("F"),
        createPlayer("G"),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.quartetCount).toBe(0);
  });
});
