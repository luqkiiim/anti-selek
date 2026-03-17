import { describe, expect, it } from "vitest";

import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import { findBestBalancedPartition } from "./balance";
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
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("ladder balance", () => {
  it("balances ladder teams by point difference first", () => {
    const playersById = new Map(
      [
        createPlayer("A", { pointDiff: 16 }),
        createPlayer("B", { pointDiff: 16 }),
        createPlayer("C", { pointDiff: 13 }),
        createPlayer("D", { pointDiff: 13 }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(["A", "B", "C", "D"], playersById, SessionMode.MEXICANO)
    ).toEqual({
      partition: {
        team1: ["A", "C"],
        team2: ["B", "D"],
      },
      balanceGap: 0,
    });
  });

  it("uses rating as a tiebreaker when point-diff balance is tied", () => {
    const playersById = new Map(
      [
        createPlayer("A", { pointDiff: 16, strength: 1200 }),
        createPlayer("B", { pointDiff: 16, strength: 1180 }),
        createPlayer("C", { pointDiff: 13, strength: 1030 }),
        createPlayer("D", { pointDiff: 13, strength: 1010 }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(["A", "B", "C", "D"], playersById, SessionMode.MEXICANO)
    ).toEqual({
      partition: {
        team1: ["A", "D"],
        team2: ["B", "C"],
      },
      balanceGap: 0,
    });
  });

  it("rejects invalid Mixed quartets when no valid partition exists", () => {
    const playersById = new Map(
      [
        createPlayer("M1", { gender: PlayerGender.MALE }),
        createPlayer("M2", { gender: PlayerGender.MALE }),
        createPlayer("M3", { gender: PlayerGender.MALE }),
        createPlayer("F1", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(
        ["F1", "M1", "M2", "M3"],
        playersById,
        SessionMode.MIXICANO
      )
    ).toBeNull();
  });
});
