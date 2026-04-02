import { describe, expect, it } from "vitest";

import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import { findBestSingleCourtSelectionLadder } from "./singleCourt";
import type { MatchmakerLadderPlayer } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerLadderPlayer> = {}
): MatchmakerLadderPlayer {
  const wins = overrides.wins ?? 0;
  const losses = overrides.losses ?? 0;

  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    wins,
    losses,
    pointDiff: 0,
    ladderScore: overrides.ladderScore ?? wins - losses,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("ladder single-court selection", () => {
  it("prefers closer ladder-score quartets inside the fair pool", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 5,
        wins: 3,
        losses: 0,
        ladderScore: 3,
        pointDiff: 20,
      }),
      createPlayer("B", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        ladderScore: 2,
        pointDiff: 11,
      }),
      createPlayer("C", {
        matchesPlayed: 5,
        wins: 2,
        losses: 1,
        ladderScore: 1,
        pointDiff: 5,
      }),
      createPlayer("D", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        ladderScore: 0,
        pointDiff: 1,
      }),
      createPlayer("E", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        ladderScore: -2,
        pointDiff: -8,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(result.selection?.groupingSummary.maxLadderGap).toBe(3);
  });

  it("uses point difference as a refinement when ladder scores are equally close", () => {
    const players = [
      createPlayer("A", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 7 }),
      createPlayer("B", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 6 }),
      createPlayer("C", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 5 }),
      createPlayer("D", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 4 }),
      createPlayer("E", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 20 }),
      createPlayer("F", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: -9 }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
  });

  it("does not let longer wait time override a cleaner ladder grouping inside one fairness band", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 4,
        availableSince: new Date("2026-03-18T00:55:00Z"),
      }),
      createPlayer("B", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 3,
        availableSince: new Date("2026-03-18T00:55:00Z"),
      }),
      createPlayer("C", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 2,
        availableSince: new Date("2026-03-18T00:55:00Z"),
      }),
      createPlayer("D", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 1,
        availableSince: new Date("2026-03-18T00:55:00Z"),
      }),
      createPlayer("E", {
        matchesPlayed: 5,
        wins: 3,
        losses: 1,
        pointDiff: 11,
        availableSince: new Date("2026-03-18T00:00:00Z"),
      }),
      createPlayer("F", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -9,
        availableSince: new Date("2026-03-18T00:00:00Z"),
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      now: new Date("2026-03-18T01:00:00Z").getTime(),
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(result.selection?.groupingSummary.maxLadderGap).toBe(0);
  });

  it("returns no selection when fewer than four active players are available", () => {
    const players = [
      createPlayer("A"),
      createPlayer("B"),
      createPlayer("C", { isPaused: true }),
      createPlayer("D", { isBusy: true }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).toBeNull();
  });

  it("respects Mixed validity when selecting a ladder match", () => {
    const players = [
      createPlayer("M1", {
        matchesPlayed: 4,
        wins: 2,
        losses: 1,
        pointDiff: 9,
        gender: PlayerGender.MALE,
      }),
      createPlayer("M2", {
        matchesPlayed: 4,
        wins: 2,
        losses: 1,
        pointDiff: 7,
        gender: PlayerGender.MALE,
      }),
      createPlayer("F1", {
        matchesPlayed: 4,
        wins: 1,
        losses: 1,
        pointDiff: 4,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("F2", {
        matchesPlayed: 4,
        wins: 1,
        losses: 1,
        pointDiff: 3,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.partition).toEqual({
      team1: ["M1", "F2"],
      team2: ["M2", "F1"],
    });
  });
});
