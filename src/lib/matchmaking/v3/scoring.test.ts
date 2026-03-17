import { describe, expect, it } from "vitest";

import { SessionType } from "../../../types/enums";
import {
  buildWaitSummary,
  compareSingleCourtSelections,
} from "./scoring";
import type { ActiveMatchmakerV3Player, V3SingleCourtSelection } from "./types";

function createActivePlayer(
  userId: string,
  waitMs: number,
  randomScore: number
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount: 0,
    waitMs,
    randomScore,
    rank: 0,
  };
}

function createSelection(
  {
    waitMs = [10, 10, 10, 10],
    balanceGap,
    exactRematchPenalty,
    randomScore = 0,
  }: {
    waitMs?: number[];
    balanceGap: number;
    exactRematchPenalty: number;
    randomScore?: number;
  }
): V3SingleCourtSelection {
  const players = waitMs.map((value, index) =>
    createActivePlayer(`P${index + 1}`, value, randomScore)
  ) as [
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
  ];

  return {
    ids: ["P1", "P2", "P3", "P4"],
    players,
    partition: {
      team1: ["P1", "P2"],
      team2: ["P3", "P4"],
    },
    waitSummary: buildWaitSummary(players),
    balanceGap,
    exactRematchPenalty,
    randomScore,
  };
}

describe("matchmaking v3 scoring", () => {
  it("prefers the longer-waiting quartet before balance", () => {
    const longerWaiting = createSelection({
      waitMs: [20, 20, 20, 20],
      balanceGap: 20,
      exactRematchPenalty: 2,
    });
    const shorterWaiting = createSelection({
      waitMs: [15, 15, 15, 15],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        longerWaiting,
        shorterWaiting,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("lets a non-rematch beat a close rematch in Elo sessions", () => {
    const rematch = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 1,
    });
    const closeAlternative = createSelection({
      balanceGap: 25,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        closeAlternative,
        rematch,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("keeps the much better-balanced rematch when the alternative is too far off", () => {
    const rematch = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 1,
    });
    const farWorseAlternative = createSelection({
      balanceGap: 50,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        rematch,
        farWorseAlternative,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });
});
