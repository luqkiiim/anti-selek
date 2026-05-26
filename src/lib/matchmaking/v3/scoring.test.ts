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
    pointDiffGap = 0,
    sharedCourtRepeatPenalty = 0,
    partnerCoveragePenalty = 0,
    opponentCoveragePenalty = 0,
    partnerRepeatPenalty = 0,
    opponentRepeatPenalty = 0,
    exactRematchPenalty,
    consecutivePlayCount = 0,
    consecutivePlayMaxBurden = 0,
    consecutivePlayTotalBurden = 0,
    randomScore = 0,
  }: {
    waitMs?: number[];
    balanceGap: number;
    pointDiffGap?: number;
    sharedCourtRepeatPenalty?: number;
    partnerCoveragePenalty?: number;
    opponentCoveragePenalty?: number;
    partnerRepeatPenalty?: number;
    opponentRepeatPenalty?: number;
    exactRematchPenalty: number;
    consecutivePlayCount?: number;
    consecutivePlayMaxBurden?: number;
    consecutivePlayTotalBurden?: number;
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
    pointDiffGap,
    sharedCourtRepeatPenalty,
    partnerCoveragePenalty,
    opponentCoveragePenalty,
    partnerRepeatPenalty,
    opponentRepeatPenalty,
    exactRematchPenalty,
    consecutivePlayCount,
    consecutivePlayMaxBurden,
    consecutivePlayTotalBurden,
    randomScore,
  };
}

function createBatchSelection({
  waitMs = [10, 10, 10, 10],
  maxBalanceGap,
  totalBalanceGap,
  maxPointDiffGap = 0,
  totalPointDiffGap = 0,
  totalSharedCourtRepeatPenalty = 0,
  totalPartnerCoveragePenalty = 0,
  totalOpponentCoveragePenalty = 0,
  totalPartnerRepeatPenalty = 0,
  totalOpponentRepeatPenalty = 0,
  totalExactRematchPenalty = 0,
  totalRandomScore = 0,
}: {
  waitMs?: number[];
  maxBalanceGap: number;
  totalBalanceGap: number;
  maxPointDiffGap?: number;
  totalPointDiffGap?: number;
  totalSharedCourtRepeatPenalty?: number;
  totalPartnerCoveragePenalty?: number;
  totalOpponentCoveragePenalty?: number;
  totalPartnerRepeatPenalty?: number;
  totalOpponentRepeatPenalty?: number;
  totalExactRematchPenalty?: number;
  totalRandomScore?: number;
}): V3BatchSelection {
  const selection = createSelection({
    waitMs,
    balanceGap: maxBalanceGap,
    pointDiffGap: maxPointDiffGap,
    sharedCourtRepeatPenalty: totalSharedCourtRepeatPenalty,
    partnerCoveragePenalty: totalPartnerCoveragePenalty,
    opponentCoveragePenalty: totalOpponentCoveragePenalty,
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
    maxPointDiffGap,
    totalPointDiffGap,
    totalSharedCourtRepeatPenalty,
    totalPartnerCoveragePenalty,
    totalOpponentCoveragePenalty,
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

  it("prefers fewer shared-court repeats before points balance", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 10,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshCourt,
        repeatedCourt,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("uses points balance after shared-court repeats tie", () => {
    const lowerBalanceGap = createSelection({
      balanceGap: 0,
      pointDiffGap: 8,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const higherBalanceGap = createSelection({
      balanceGap: 1,
      pointDiffGap: 0,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerBalanceGap,
        higherBalanceGap,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("uses point-difference balance after points balance ties", () => {
    const lowerPointDiffGap = createSelection({
      balanceGap: 0,
      pointDiffGap: 0,
      exactRematchPenalty: 0,
    });
    const higherPointDiffGap = createSelection({
      balanceGap: 0,
      pointDiffGap: 2,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerPointDiffGap,
        higherPointDiffGap,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("ignores partner, opponent, and exact-rematch penalties in points sessions", () => {
    const repeatPenalizedLowerRandom = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 10,
      opponentRepeatPenalty: 10,
      exactRematchPenalty: 10,
      randomScore: 0,
    });
    const cleanHigherRandom = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
    });

    expect(
      compareSingleCourtSelections(
        repeatPenalizedLowerRandom,
        cleanHigherRandom,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers first-time shared-court contacts over balance in social mix sessions", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 2,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 2,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshCourt,
        repeatedCourt,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("prefers fresh partners before fresher opponents in social mix sessions", () => {
    const repeatedPartners = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      partnerCoveragePenalty: 1,
      opponentCoveragePenalty: 0,
      exactRematchPenalty: 0,
    });
    const freshPartners = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      partnerCoveragePenalty: 0,
      opponentCoveragePenalty: 1,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshPartners,
        repeatedPartners,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("prefers lower back-to-back burden before social mix coverage", () => {
    const lowerBurden = createSelection({
      balanceGap: 10,
      sharedCourtRepeatPenalty: 3,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 0,
      consecutivePlayTotalBurden: 0,
    });
    const repeatedStayer = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 1,
      consecutivePlayTotalBurden: 1,
    });

    expect(
      compareSingleCourtSelections(
        lowerBurden,
        repeatedStayer,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("prefers lower back-to-back burden before points balance", () => {
    const lowerBurden = createSelection({
      balanceGap: 10,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 0,
      consecutivePlayTotalBurden: 0,
    });
    const repeatedStayer = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 1,
      consecutivePlayTotalBurden: 1,
    });

    expect(
      compareSingleCourtSelections(
        lowerBurden,
        repeatedStayer,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("ignores back-to-back burden in Elo sessions", () => {
    const lowerBurden = createSelection({
      balanceGap: 10,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 0,
      consecutivePlayTotalBurden: 0,
    });
    const betterBalancedRepeatedStayer = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 1,
      consecutivePlayTotalBurden: 1,
    });

    expect(
      compareSingleCourtSelections(
        betterBalancedRepeatedStayer,
        lowerBurden,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("prefers lower total shared-court repeats before points batch balance", () => {
    const repeatedCourtBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalSharedCourtRepeatPenalty: 1,
    });
    const freshCourtBatch = createBatchSelection({
      maxBalanceGap: 10,
      totalBalanceGap: 10,
      totalSharedCourtRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        freshCourtBatch,
        repeatedCourtBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers lower total shared-court repeats before balance in social mix batches", () => {
    const repeatedCourtBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalSharedCourtRepeatPenalty: 4,
    });
    const freshCourtBatch = createBatchSelection({
      maxBalanceGap: 2,
      totalBalanceGap: 2,
      totalSharedCourtRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        freshCourtBatch,
        repeatedCourtBatch,
        SessionType.SOCIAL_MIX
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

  it("uses point-difference balance after points batch balance ties", () => {
    const lowerPointDiffBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      maxPointDiffGap: 0,
      totalPointDiffGap: 0,
    });
    const higherPointDiffBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      maxPointDiffGap: 1,
      totalPointDiffGap: 1,
    });

    expect(
      compareBatchSelections(
        lowerPointDiffBatch,
        higherPointDiffBatch,
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
