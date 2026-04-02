import { describe, expect, it } from "vitest";

import { MixedSide, SessionMode } from "../../../types/enums";
import {
  evaluateBalancedPartitions,
  findBestBalancedPartition,
} from "./balance";
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
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

describe("matchmaking v3 balance", () => {
  it("finds the best team-vs-team balanced partition", () => {
    const playersById = new Map<string, MatchmakerV3Player>([
      ["A", createPlayer("A", { strength: 1600 })],
      ["B", createPlayer("B", { strength: 1400 })],
      ["C", createPlayer("C", { strength: 1500 })],
      ["D", createPlayer("D", { strength: 1500 })],
    ]);

    const result = findBestBalancedPartition(
      ["A", "B", "C", "D"],
      playersById,
      SessionMode.MEXICANO
    );

    expect(result).toEqual({
      partition: {
        team1: ["A", "B"],
        team2: ["C", "D"],
      },
      balanceGap: 0,
      mixedSideGap: 0,
    });
  });

  it("allows female upper-side overrides to participate in side-balanced Mixicano quartets", () => {
    const playersById = new Map<string, MatchmakerV3Player>([
      [
        "A",
        createPlayer("A", {
          gender: "FEMALE",
          partnerPreference: "OPEN",
          mixedSideOverride: MixedSide.UPPER,
        }),
      ],
      ["B", createPlayer("B", { gender: "MALE" })],
      [
        "C",
        createPlayer("C", {
          gender: "MALE",
          mixedSideOverride: MixedSide.LOWER,
        }),
      ],
      [
        "D",
        createPlayer("D", {
          gender: "FEMALE",
          partnerPreference: "FEMALE_FLEX",
        }),
      ],
    ]);

    expect(
      evaluateBalancedPartitions(
        ["A", "B", "C", "D"],
        playersById,
        SessionMode.MIXICANO
      ).length
    ).toBeGreaterThan(0);
  });

  it("rejects hybrid quartets with one default female and three default males", () => {
    const playersById = new Map<string, MatchmakerV3Player>([
      [
        "F1",
        createPlayer("F1", {
          gender: "FEMALE",
          partnerPreference: "FEMALE_FLEX",
        }),
      ],
      ["M1", createPlayer("M1", { gender: "MALE" })],
      ["M2", createPlayer("M2", { gender: "MALE" })],
      ["M3", createPlayer("M3", { gender: "MALE" })],
    ]);

    expect(
      evaluateBalancedPartitions(
        ["F1", "M1", "M2", "M3"],
        playersById,
        SessionMode.MIXICANO
      )
    ).toEqual([]);
  });
});
