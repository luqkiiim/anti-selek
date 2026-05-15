import { describe, expect, it } from "vitest";

import { SessionType } from "../../../types/enums";
import {
  POINTS_WAIT_TOLERANCE_MS,
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
    opponentRepeatPenalty = 0,
    exactRematchPenalty,
    randomScore = 0,
  }: {
    waitMs?: number[];
    balanceGap: number;
    partnerRepeatPenalty?: number;
    opponentRepeatPenalty?: number;
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
    opponentRepeatPenalty,
    exactRematchPenalty,
    randomScore,
  };
}

function createBatchSelection({
  waitMs = [10, 10, 10, 10],
  maxBalanceGap,
  totalBalanceGap,
  totalPartnerRepeatPenalty = 0,
  totalOpponentRepeatPenalty = 0,
  totalExactRematchPenalty = 0,
  totalRandomScore = 0,
}: {
  waitMs?: number[];
  maxBalanceGap: number;
  totalBalanceGap: number;
  totalPartnerRepeatPenalty?: number;
  totalOpponentRepeatPenalty?: number;
  totalExactRematchPenalty?: number;
  totalRandomScore?: number;
}): V3BatchSelection {
  const selection = createSelection({
    waitMs,
    balanceGap: maxBalanceGap,
    partnerRepeatPenalty: totalPartnerRepeatPenalty,
    opponentRepeatPenalty: totalOpponentRepeatPenalty,
    exactRematchPenalty: totalExactRematchPenalty,
    randomScore: totalRandomScore,
  });

  return {
    selections: [selection],
    waitSummary: selection.waitSummary,
    maxBalanceGap,
    totalBalanceGap,
    totalPartnerRepeatPenalty,
    totalOpponentRepeatPenalty,
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

  it("treats small wait differences as tied in points sessions", () => {
    const slightlyLongerWaiting = createSelection({
      waitMs: Array(4).fill(POINTS_WAIT_TOLERANCE_MS - 1),
      balanceGap: 5,
      exactRematchPenalty: 0,
    });
    const betterBalanced = createSelection({
      waitMs: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        betterBalanced,
        slightlyLongerWaiting,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("keeps meaningful wait differences ahead of points balance", () => {
    const longerWaiting = createSelection({
      waitMs: Array(4).fill(POINTS_WAIT_TOLERANCE_MS + 1),
      balanceGap: 5,
      exactRematchPenalty: 0,
    });
    const betterBalanced = createSelection({
      waitMs: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        longerWaiting,
        betterBalanced,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers a new partner over a slightly better-balanced repeated partner in Elo sessions", () => {
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
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("keeps the much better-balanced repeated partner in Elo sessions when the alternative is too far off", () => {
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
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("ignores exact rematch differences for Elo when partner repeats are equal", () => {
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
      balanceGap: 1.5,
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

  it("keeps the repeated partner in points sessions when the fresh option is a full win step worse", () => {
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

  it("prefers fresher opponents in points sessions when partner repeats and balance are close", () => {
    const repeatedOpponent = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshOpponent = createSelection({
      balanceGap: 1.5,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshOpponent,
        repeatedOpponent,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("does not let opponent variety override a full win-step balance difference", () => {
    const repeatedOpponent = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshOpponent = createSelection({
      balanceGap: 3,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        repeatedOpponent,
        freshOpponent,
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
      maxBalanceGap: 1.5,
      totalBalanceGap: 1.5,
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

  it("treats small batch wait differences as tied in points sessions", () => {
    const slightlyLongerWaitingBatch = createBatchSelection({
      waitMs: Array(4).fill(POINTS_WAIT_TOLERANCE_MS - 1),
      maxBalanceGap: 5,
      totalBalanceGap: 5,
    });
    const betterBalancedBatch = createBatchSelection({
      waitMs: [0, 0, 0, 0],
      maxBalanceGap: 0,
      totalBalanceGap: 0,
    });

    expect(
      compareBatchSelections(
        betterBalancedBatch,
        slightlyLongerWaitingBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers the lower total opponent-repeat batch when points partners and balance are close", () => {
    const repeatedOpponentBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalPartnerRepeatPenalty: 0,
      totalOpponentRepeatPenalty: 1,
    });
    const freshOpponentBatch = createBatchSelection({
      maxBalanceGap: 1.5,
      totalBalanceGap: 1.5,
      totalPartnerRepeatPenalty: 0,
      totalOpponentRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        freshOpponentBatch,
        repeatedOpponentBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers the lower total partner-repeat batch when Elo balance is close", () => {
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
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });
});
