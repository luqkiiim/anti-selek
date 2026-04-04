import { describe, expect, it } from "vitest";

import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
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

describe("matchmaking v3 single-court selection", () => {
  it("prefers a close non-rematch over an exact rematch", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1550 }),
        createPlayer("B", { strength: 1450 }),
        createPlayer("C", { strength: 1525 }),
        createPlayer("D", { strength: 1475 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).toEqual({
      team1: ["A", "D"],
      team2: ["B", "C"],
    });
  });

  it("keeps the better-balanced rematch when alternatives are too far away", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1600 }),
        createPlayer("B", { strength: 1400 }),
        createPlayer("C", { strength: 1550 }),
        createPlayer("D", { strength: 1450 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
  });

  it("returns no selection when fewer than four active players are available", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A"),
        createPlayer("B"),
        createPlayer("C"),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.quartetCount).toBe(0);
  });

  it("widens for mixed feasibility when the initial fair pool cannot form a legal mixed quartet", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("LowM1", {
          matchesPlayed: 2,
          strength: 1000,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM2", {
          matchesPlayed: 2,
          strength: 1001,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM3", {
          matchesPlayed: 2,
          strength: 1002,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowF1", {
          matchesPlayed: 2,
          strength: 999,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighF2", {
          matchesPlayed: 3,
          strength: 998,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighM4", {
          matchesPlayed: 3,
          strength: 1200,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighM5", {
          matchesPlayed: 3,
          strength: 1190,
          gender: PlayerGender.MALE,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.includedBandValues).toEqual([2, 3]);
    expect(
      result.selection?.players.filter((player) => player.matchesPlayed === 2).length
    ).toBe(3);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.FEMALE
      ).length
    ).toBe(2);
  });
});
