import { describe, expect, it } from "vitest";

import { SessionType } from "../../../types/enums";
import {
  buildRestSummary,
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
  restTurns: number,
  randomScore: number,
  moreRestDeficit = 0
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount: 0,
    restTurns,
    needsMoreRest: false,
    moreRestTarget: 1,
    moreRestDeficit,
    randomScore,
    rank: 0,
  };
}

function createSelection(
  {
    restTurns = [1, 1, 1, 1],
    moreRestDeficits = [0, 0, 0, 0],
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
    pairingRandomScore = 0,
  }: {
    restTurns?: number[];
    moreRestDeficits?: number[];
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
    pairingRandomScore?: number;
  }
): V3SingleCourtSelection {
  const players = restTurns.map((value, index) =>
    createActivePlayer(
      `P${index + 1}`,
      value,
      randomScore,
      moreRestDeficits[index] ?? 0
    )
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
    restSummary: buildRestSummary(players),
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
    pairingRandomScore,
  };
}

function createBatchSelection({
  restTurns = [1, 1, 1, 1],
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
  totalPairingRandomScore = 0,
  sidePairingLayoutKeys = ["team1", "team2"],
  sidePairingRandomScores = [totalPairingRandomScore, totalPairingRandomScore],
}: {
  restTurns?: number[];
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
  totalPairingRandomScore?: number;
  sidePairingLayoutKeys?: [string, string];
  sidePairingRandomScores?: [number, number];
}): V3BatchSelection {
  const selection = createSelection({
    restTurns,
    balanceGap: maxBalanceGap,
    pointDiffGap: maxPointDiffGap,
    sharedCourtRepeatPenalty: totalSharedCourtRepeatPenalty,
    partnerCoveragePenalty: totalPartnerCoveragePenalty,
    opponentCoveragePenalty: totalOpponentCoveragePenalty,
    partnerRepeatPenalty: totalPartnerRepeatPenalty,
    opponentRepeatPenalty: totalOpponentRepeatPenalty,
    exactRematchPenalty: totalExactRematchPenalty,
    randomScore: totalRandomScore,
    pairingRandomScore: totalPairingRandomScore,
  });

  return {
    selections: [selection],
    restSummary: selection.restSummary,
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
    totalPairingRandomScore,
    sidePairingLayoutKeys,
    sidePairingRandomScores,
  };
}

function createBatchFromSelections(
  selections: V3SingleCourtSelection[]
): V3BatchSelection {
  const players = selections.flatMap((selection) => selection.players);

  return {
    selections,
    restSummary: buildRestSummary(players),
    maxBalanceGap: Math.max(
      ...selections.map((selection) => selection.balanceGap)
    ),
    totalBalanceGap: selections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    ),
    maxPointDiffGap: Math.max(
      ...selections.map((selection) => selection.pointDiffGap)
    ),
    totalPointDiffGap: selections.reduce(
      (sum, selection) => sum + selection.pointDiffGap,
      0
    ),
    totalSharedCourtRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.sharedCourtRepeatPenalty,
      0
    ),
    totalPartnerCoveragePenalty: selections.reduce(
      (sum, selection) => sum + selection.partnerCoveragePenalty,
      0
    ),
    totalOpponentCoveragePenalty: selections.reduce(
      (sum, selection) => sum + selection.opponentCoveragePenalty,
      0
    ),
    totalPartnerRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.partnerRepeatPenalty,
      0
    ),
    totalOpponentRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.opponentRepeatPenalty,
      0
    ),
    totalExactRematchPenalty: selections.reduce(
      (sum, selection) => sum + selection.exactRematchPenalty,
      0
    ),
    totalRandomScore: selections.reduce(
      (sum, selection) => sum + selection.randomScore,
      0
    ),
    totalPairingRandomScore: selections.reduce(
      (sum, selection) => sum + selection.pairingRandomScore,
      0
    ),
    sidePairingLayoutKeys: ["team1", "team2"],
    sidePairingRandomScores: [0, 0],
  };
}

describe("matchmaking v3 scoring", () => {
  it("keeps Elo balance ahead of rest outside the safe window", () => {
    const higherRest = createSelection({
      restTurns: [4, 4, 4, 4],
      balanceGap: 76,
      exactRematchPenalty: 2,
    });
    const lowerRest = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerRest,
        higherRest,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("keeps points balance ahead of exact rest-turn differences", () => {
    const higherRest = createSelection({
      restTurns: Array(4).fill(1),
      balanceGap: 5,
      exactRematchPenalty: 0,
    });
    const betterBalanced = createSelection({
      restTurns: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        betterBalanced,
        higherRest,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("avoids a full shared-court repeat when rest is within one turn", () => {
    const fullRepeat = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 0,
      sharedCourtRepeatPenalty: 6,
      exactRematchPenalty: 0,
    });
    const nearRestAlternative = createSelection({
      restTurns: [3, 3, 2, 2],
      balanceGap: 1.5,
      sharedCourtRepeatPenalty: 2,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        nearRestAlternative,
        fullRepeat,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
    expect(
      compareSingleCourtSelections(
        nearRestAlternative,
        fullRepeat,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("keeps a full repeat in social mix when the alternative is more than one rest turn worse", () => {
    const fullRepeat = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 10,
      sharedCourtRepeatPenalty: 6,
      exactRematchPenalty: 0,
    });
    const tooLowRestAlternative = createSelection({
      restTurns: [3, 2, 1, 1],
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        fullRepeat,
        tooLowRestAlternative,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("keeps points balance ahead of heavy non-full repeats", () => {
    const heavyRepeat = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 10,
      sharedCourtRepeatPenalty: 5,
      exactRematchPenalty: 0,
    });
    const nearRestAlternative = createSelection({
      restTurns: [3, 3, 2, 2],
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        nearRestAlternative,
        heavyRepeat,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("prefers the lower total more-rest deficit before raw rest turns", () => {
    const lowerDeficit = createSelection({
      restTurns: [1, 1, 1, 1],
      moreRestDeficits: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });
    const higherDeficitWithMoreRestTurns = createSelection({
      restTurns: [5, 5, 5, 5],
      moreRestDeficits: [1, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerDeficit,
        higherDeficitWithMoreRestTurns,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("ignores more-rest deficit scoring when player rest is disabled", () => {
    const lowerDeficit = createSelection({
      restTurns: [1, 1, 1, 1],
      moreRestDeficits: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 2,
    });
    const higherDeficit = createSelection({
      restTurns: [5, 5, 5, 5],
      moreRestDeficits: [1, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
    });

    expect(
      compareSingleCourtSelections(
        lowerDeficit,
        higherDeficit,
        SessionType.ELO,
        { respectPlayerRest: false }
      )
    ).toBeGreaterThan(0);
  });

  it("prefers a new partner inside the Elo balance window", () => {
    const repeatedPartner = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshPartner = createSelection({
      balanceGap: 75,
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

  it("keeps Elo balance ahead of variety outside the safe window", () => {
    const repeatedPartner = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const farWorseFreshPartner = createSelection({
      balanceGap: 76,
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

  it("avoids exact rematches inside the Elo balance window", () => {
    const exactRematch = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 1,
      randomScore: 0,
    });
    const freshMatchup = createSelection({
      balanceGap: 75,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
    });

    expect(
      compareSingleCourtSelections(
        freshMatchup,
        exactRematch,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("avoids repeated opponents inside the Elo balance window", () => {
    const repeatedOpponents = createSelection({
      balanceGap: 0,
      opponentRepeatPenalty: 2,
      exactRematchPenalty: 0,
    });
    const freshOpponents = createSelection({
      balanceGap: 75,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshOpponents,
        repeatedOpponents,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("keeps points balance ahead of variety outside the safe window", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 2,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        repeatedCourt,
        freshCourt,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("keeps points balance ahead of variety at the old three-point window", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 3,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        repeatedCourt,
        freshCourt,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("allows points variety to win inside the safe balance window", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 1.5,
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

  it("ignores rest-turn preference when player rest is disabled", () => {
    const higherRest = createSelection({
      restTurns: Array(4).fill(1),
      balanceGap: 5,
      exactRematchPenalty: 0,
    });
    const betterBalanced = createSelection({
      restTurns: [0, 0, 0, 0],
      balanceGap: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        betterBalanced,
        higherRest,
        SessionType.POINTS,
        { respectPlayerRest: false }
      )
    ).toBeLessThan(0);
  });

  it("keeps points balance ahead of shared-court repeats when player rest is disabled", () => {
    const fullRepeat = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 0,
      sharedCourtRepeatPenalty: 6,
      exactRematchPenalty: 0,
    });
    const lowRestAlternative = createSelection({
      restTurns: [0, 0, 0, 0],
      balanceGap: 4,
      sharedCourtRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        fullRepeat,
        lowRestAlternative,
        SessionType.POINTS,
        { respectPlayerRest: false }
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

  it("uses selected-player random before pairing-layout random", () => {
    const lowerSelectedPlayerRandom = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
      pairingRandomScore: 10,
    });
    const lowerPairingRandom = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 2,
      pairingRandomScore: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerSelectedPlayerRandom,
        lowerPairingRandom,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("uses pairing-layout random after selected-player random ties", () => {
    const lowerPairingRandom = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
      pairingRandomScore: 0,
    });
    const higherPairingRandom = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 0,
      randomScore: 1,
      pairingRandomScore: 10,
    });

    expect(
      compareSingleCourtSelections(
        lowerPairingRandom,
        higherPairingRandom,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("uses partner, opponent, and exact-rematch penalties for points variety", () => {
    const repeatPenalized = createSelection({
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
        cleanHigherRandom,
        repeatPenalized,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("avoids repeated opponents in points sessions inside the balance window", () => {
    const repeatedOpponents = createSelection({
      balanceGap: 0,
      opponentRepeatPenalty: 2,
      exactRematchPenalty: 0,
    });
    const freshOpponents = createSelection({
      balanceGap: 1.5,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshOpponents,
        repeatedOpponents,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("avoids exact rematches in points sessions inside the balance window", () => {
    const exactRematch = createSelection({
      balanceGap: 0,
      exactRematchPenalty: 1,
    });
    const freshMatchup = createSelection({
      balanceGap: 1.5,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        freshMatchup,
        exactRematch,
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

  it("uses point-difference balance after social mix points balance ties", () => {
    const lowerPointDiffGap = createSelection({
      balanceGap: 0,
      pointDiffGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const lowerRepeatPenalty = createSelection({
      balanceGap: 0,
      pointDiffGap: 2,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
    });

    expect(
      compareSingleCourtSelections(
        lowerPointDiffGap,
        lowerRepeatPenalty,
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

  it("keeps points balance ahead of back-to-back burden", () => {
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
        repeatedStayer,
        lowerBurden,
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

  it("keeps points batch balance ahead of variety outside the safe window", () => {
    const repeatedCourtBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalSharedCourtRepeatPenalty: 1,
    });
    const freshCourtBatch = createBatchSelection({
      maxBalanceGap: 4,
      totalBalanceGap: 4,
      totalSharedCourtRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        repeatedCourtBatch,
        freshCourtBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("allows points batch variety to win inside the safe balance window", () => {
    const repeatedCourtBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalSharedCourtRepeatPenalty: 1,
    });
    const freshCourtBatch = createBatchSelection({
      maxBalanceGap: 1.5,
      totalBalanceGap: 1.5,
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

  it("avoids a full-repeat court in a batch when batch rest is within one turn", () => {
    const fullRepeatBatch = createBatchFromSelections([
      createSelection({
        restTurns: [3, 3, 3, 3],
        balanceGap: 0,
        sharedCourtRepeatPenalty: 6,
        exactRematchPenalty: 0,
      }),
      createSelection({
        restTurns: [3, 3, 3, 3],
        balanceGap: 0,
        sharedCourtRepeatPenalty: 0,
        exactRematchPenalty: 0,
      }),
    ]);
    const nearRestBatch = createBatchFromSelections([
      createSelection({
        restTurns: [3, 3, 2, 2],
        balanceGap: 1.5,
        sharedCourtRepeatPenalty: 2,
        exactRematchPenalty: 0,
      }),
      createSelection({
        restTurns: [3, 3, 3, 3],
        balanceGap: 0,
        sharedCourtRepeatPenalty: 0,
        exactRematchPenalty: 0,
      }),
    ]);

    expect(
      compareBatchSelections(
        nearRestBatch,
        fullRepeatBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("ignores back-to-back burden when player rest is disabled", () => {
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
        SessionType.POINTS,
        { respectPlayerRest: false }
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

  it("uses point-difference balance after social mix batch balance ties", () => {
    const lowerPointDiffBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      maxPointDiffGap: 0,
      totalPointDiffGap: 0,
      totalPartnerRepeatPenalty: 1,
    });
    const lowerRepeatPenaltyBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      maxPointDiffGap: 1,
      totalPointDiffGap: 1,
      totalPartnerRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        lowerPointDiffBatch,
        lowerRepeatPenaltyBatch,
        SessionType.SOCIAL_MIX
      )
    ).toBeLessThan(0);
  });

  it("keeps points batch balance ahead of rest-turn differences", () => {
    const higherRestBatch = createBatchSelection({
      restTurns: Array(4).fill(1),
      maxBalanceGap: 5,
      totalBalanceGap: 5,
    });
    const betterBalancedBatch = createBatchSelection({
      restTurns: [0, 0, 0, 0],
      maxBalanceGap: 0,
      totalBalanceGap: 0,
    });

    expect(
      compareBatchSelections(
        betterBalancedBatch,
        higherRestBatch,
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

  it("uses batch pairing-layout random after selected-player random ties", () => {
    const lowerPairingRandomBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 0,
    });
    const higherPairingRandomBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 10,
    });

    expect(
      compareBatchSelections(
        lowerPairingRandomBatch,
        higherPairingRandomBatch,
        SessionType.POINTS
      )
    ).toBeLessThan(0);
  });

  it("keeps selected-player random ahead of side-balanced layout random", () => {
    const lowerSelectedPlayerRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 10,
      sidePairingRandomScores: [10, 10],
    });
    const lowerSideLayoutRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 2,
      totalPairingRandomScore: 0,
      sidePairingRandomScores: [0, 0],
    });

    expect(
      compareBatchSelections(
        lowerSelectedPlayerRandom,
        lowerSideLayoutRandom,
        SessionType.POINTS,
        { pairingRandomMode: "side-balanced" }
      )
    ).toBeLessThan(0);
  });

  it("uses combined layout random when side-balanced comparison has no candidate-set context", () => {
    const lowerCombinedLayoutRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 0,
      sidePairingRandomScores: [0, 10],
    });
    const higherCombinedLayoutRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 10,
      sidePairingRandomScores: [5, 5],
    });

    expect(
      compareBatchSelections(
        lowerCombinedLayoutRandom,
        higherCombinedLayoutRandom,
        SessionType.POINTS,
        { pairingRandomMode: "side-balanced" }
      )
    ).toBeLessThan(0);
  });

  it("uses combined layout random after side-balanced layout scores tie", () => {
    const lowerCombinedLayoutRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 0,
      sidePairingRandomScores: [5, 5],
    });
    const higherCombinedLayoutRandom = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalRandomScore: 1,
      totalPairingRandomScore: 10,
      sidePairingRandomScores: [5, 5],
    });

    expect(
      compareBatchSelections(
        lowerCombinedLayoutRandom,
        higherCombinedLayoutRandom,
        SessionType.POINTS,
        { pairingRandomMode: "side-balanced" }
      )
    ).toBeLessThan(0);
  });

  it("prefers the lower total partner-repeat batch inside the Elo balance window", () => {
    const repeatedPartnerBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalPartnerRepeatPenalty: 1,
    });
    const freshPartnerBatch = createBatchSelection({
      maxBalanceGap: 75,
      totalBalanceGap: 75,
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

  it("keeps Elo batch balance ahead of variety outside the safe window", () => {
    const repeatedPartnerBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalPartnerRepeatPenalty: 1,
    });
    const freshPartnerBatch = createBatchSelection({
      maxBalanceGap: 76,
      totalBalanceGap: 76,
      totalPartnerRepeatPenalty: 0,
    });

    expect(
      compareBatchSelections(
        repeatedPartnerBatch,
        freshPartnerBatch,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("avoids repeated opponents and exact rematches in Elo batches inside the safe window", () => {
    const repeatedBatch = createBatchSelection({
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalOpponentRepeatPenalty: 1,
      totalExactRematchPenalty: 1,
    });
    const freshBatch = createBatchSelection({
      maxBalanceGap: 75,
      totalBalanceGap: 75,
      totalOpponentRepeatPenalty: 0,
      totalExactRematchPenalty: 0,
    });

    expect(
      compareBatchSelections(
        freshBatch,
        repeatedBatch,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });
});
