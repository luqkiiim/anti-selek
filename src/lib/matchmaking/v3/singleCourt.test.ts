import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
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
});
