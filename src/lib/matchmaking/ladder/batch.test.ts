import { describe, expect, it } from "vitest";

import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
} from "../../../types/enums";
import { findBestBatchSelectionLadder } from "./batch";
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

  it("keeps full top and bottom ladder clusters together even when one low player finished recently", () => {
    const now = new Date("2026-03-18T01:00:00Z").getTime();
    const players = [
      createPlayer("P1", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        pointDiff: 12,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("P2", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        pointDiff: 10,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("P3", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        pointDiff: 8,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("P4", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        pointDiff: 6,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      ...Array.from({ length: 10 }, (_, index) =>
        createPlayer(`Z${index + 1}`, {
          matchesPlayed: 5,
          wins: 1,
          losses: 1,
          pointDiff: 4 - index,
          availableSince: new Date("2026-03-18T00:40:00Z"),
        })
      ),
      createPlayer("N1", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -6,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("N2", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -8,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("N3", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -10,
        availableSince: new Date("2026-03-18T00:35:00Z"),
      }),
      createPlayer("N4", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -12,
        availableSince: new Date("2026-03-18T00:58:00Z"),
      }),
    ];

    const result = findBestBatchSelectionLadder(players, {
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      now,
      randomFn: () => 0,
    });

    const quartets =
      result.selection?.selections.map((selection) =>
        [...selection.players]
          .map((player) => player.ladderScore)
          .sort((left, right) => left - right)
      ) ?? [];

    expect(quartets).toContainEqual([-2, -2, -2, -2]);
    expect(quartets).toContainEqual([0, 0, 0, 0]);
    expect(quartets).toContainEqual([2, 2, 2, 2]);
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

  it("widens for Mixicano feasibility when the lowest 8-player band cannot form two legal courts", () => {
    const players = [
      createPlayer("LowM1", { matchesPlayed: 0, ladderScore: 0 }),
      createPlayer("LowM2", { matchesPlayed: 0, ladderScore: 0 }),
      createPlayer("LowM3", { matchesPlayed: 0, ladderScore: 0 }),
      createPlayer("LowM4", { matchesPlayed: 0, ladderScore: 0 }),
      createPlayer("LowM5", { matchesPlayed: 0, ladderScore: 0 }),
      createPlayer("LowF1", {
        matchesPlayed: 0,
        ladderScore: 0,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("LowF2", {
        matchesPlayed: 0,
        ladderScore: 0,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("LowF3", {
        matchesPlayed: 0,
        ladderScore: 0,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("HighM1", { matchesPlayed: 1, ladderScore: 1 }),
      createPlayer("HighM2", { matchesPlayed: 1, ladderScore: 1 }),
      createPlayer("HighF1", {
        matchesPlayed: 1,
        ladderScore: 1,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("HighF2", {
        matchesPlayed: 1,
        ladderScore: 1,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];

    const result = findBestBatchSelectionLadder(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.includedBandValues).toEqual([0, 1]);
    expect(
      result.selection?.selections.flatMap((selection) => selection.players)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ matchesPlayed: 1 }),
      ])
    );
    expect(
      result.selection?.selections
        .flatMap((selection) => selection.ids)
        .filter((userId, index, allIds) => allIds.indexOf(userId) === index)
    ).toHaveLength(8);
  });
});
