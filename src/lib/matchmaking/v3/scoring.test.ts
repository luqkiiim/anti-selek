import { describe, expect, it } from "vitest";

import { SessionType } from "../../../types/enums";
import {
  buildWaitSummary,
  compareBatchSelections,
  compareSingleCourtSelections,
} from "./scoring";
import type {
  ActiveMatchmakerV3Player,
  V3BatchSelection,
  V3SingleCourtSelection,
} from "./types";

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
    partnerRepeatPenalty = 0,
    exactRematchPenalty,
    randomScore = 0,
  }: {
    waitMs?: number[];
    balanceGap: number;
    partnerRepeatPenalty?: number;
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
    partnerRepeatPenalty,
    exactRematchPenalty,
    randomScore,
  };
}

function createBatchSelection({
  maxBalanceGap,
  totalBalanceGap,
  totalPartnerRepeatPenalty = 0,
  totalExactRematchPenalty = 0,
  totalRandomScore = 0,
}: {
  maxBalanceGap: number;
  totalBalanceGap: number;
  totalPartnerRepeatPenalty?: number;
  totalExactRematchPenalty?: number;
  totalRandomScore?: number;
}): V3BatchSelection {
  const selection = createSelection({
    balanceGap: maxBalanceGap,
    partnerRepeatPenalty: totalPartnerRepeatPenalty,
    exactRematchPenalty: totalExactRematchPenalty,
    randomScore: totalRandomScore,
  });

  return {
    selections: [selection],
    waitSummary: selection.waitSummary,
    maxBalanceGap,
    totalBalanceGap,
    totalPartnerRepeatPenalty,
    totalExactRematchPenalty,
    totalRandomScore,
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

  it("prefers a new partner over a slightly better-balanced repeated partner in points sessions", () => {
    const repeatedPartner = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshPartner = createSelection({
      balanceGap: 1,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshPartner,
        repeatedPartner,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("keeps the much better-balanced repeated partner in points sessions when the alternative is too far off", () => {
    const repeatedPartner = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const farWorseFreshPartner = createSelection({
      balanceGap: 3,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        repeatedPartner,
        farWorseFreshPartner,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("ignores exact rematch differences for points when partner repeats are equal", () => {
    const lowerRandom = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 1,
      randomScore: 0,
    });
    const higherRandom = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
    });

    expect(
      compareSingleCourtSelections(
        lowerRandom,
        higherRandom,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers the lower total partner-repeat batch when points balance is close", () => {
    const repeatedPartnerBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalPartnerRepeatPenalty: 1,
    });
    const freshPartnerBatch = createBatchSelection({
      maxBalanceGap: 1,
      totalBalanceGap: 1,
      totalPartnerRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        freshPartnerBatch,
        repeatedPartnerBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });
});
