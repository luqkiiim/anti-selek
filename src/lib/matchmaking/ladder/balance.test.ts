import { describe, expect, it } from "vitest";

import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
} from "../../../types/enums";
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
  it("balances ladder teams by ladder score first", () => {
    const playersById = new Map(
      [
        createPlayer("A", { ladderScore: 1, pointDiff: 20 }),
        createPlayer("B", { ladderScore: 1, pointDiff: 10 }),
        createPlayer("C", { ladderScore: 0, pointDiff: 8 }),
        createPlayer("D", { ladderScore: 0, pointDiff: 2 }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(["A", "B", "C", "D"], playersById, SessionMode.MEXICANO)
    ).toMatchObject({
      partition: {
        team1: ["A", "D"],
        team2: ["B", "C"],
      },
      balanceGap: 0,
    });
  });

  it("uses point diff as a tiebreaker when ladder balance is tied", () => {
    const playersById = new Map(
      [
        createPlayer("A", { ladderScore: 1, pointDiff: 16, strength: 1200 }),
        createPlayer("B", { ladderScore: 1, pointDiff: 16, strength: 1180 }),
        createPlayer("C", { ladderScore: 0, pointDiff: 13, strength: 1030 }),
        createPlayer("D", { ladderScore: 0, pointDiff: 13, strength: 1010 }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(["A", "B", "C", "D"], playersById, SessionMode.MEXICANO)
    ).toMatchObject({
      partition: {
        team1: ["A", "D"],
        team2: ["B", "C"],
      },
      balanceGap: 0,
    });
  });

  it("uses rating as a tiebreaker when ladder and point-diff balance are tied", () => {
    const playersById = new Map(
      [
        createPlayer("A", { ladderScore: 1, pointDiff: 10, strength: 1200 }),
        createPlayer("B", { ladderScore: 1, pointDiff: 10, strength: 1180 }),
        createPlayer("C", { ladderScore: 0, pointDiff: 4, strength: 1030 }),
        createPlayer("D", { ladderScore: 0, pointDiff: 4, strength: 1010 }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(["A", "B", "C", "D"], playersById, SessionMode.MEXICANO)
    ).toMatchObject({
      partition: {
        team1: ["A", "D"],
        team2: ["B", "C"],
      },
      balanceGap: 0,
    });
  });

  it("allows mixed-side overrides to create valid Mixicano partitions", () => {
    const playersById = new Map(
      [
        createPlayer("M1", { gender: PlayerGender.MALE }),
        createPlayer("M2", {
          gender: PlayerGender.MALE,
          mixedSideOverride: MixedSide.LOWER,
        }),
        createPlayer("F1", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: MixedSide.UPPER,
        }),
        createPlayer("F2", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
      ].map((player) => [player.userId, player])
    );

    expect(
      findBestBalancedPartition(
        ["F1", "M1", "M2", "F2"],
        playersById,
        SessionMode.MIXICANO
      )
    ).not.toBeNull();
  });
});
