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

const BALANCED_SESSION_TYPES = [SessionType.POINTS, SessionType.ELO] as const;

function createActivePlayer(
  userId: string,
  restTurns: number,
  randomScore: number,
  matchesPlayed = 0,
  arrivalPriorityAt: Date | null = null
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed,
    matchmakingBaseline: matchesPlayed,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount: matchesPlayed,
    restTurns,
    randomScore,
    rank: 0,
    arrivalPriorityAt,
  };
}

function createSelection(
  {
    restTurns = [1, 1, 1, 1],
    matchesPlayed = [0, 0, 0, 0],
    arrivalPriorityAt = [null, null, null, null],
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
    mixedVarietyPenalty,
    mixedGlobalVarietyPenalty,
    socialVarietyGain,
    randomScore = 0,
    pairingRandomScore = 0,
  }: {
    restTurns?: number[];
    matchesPlayed?: number[];
    arrivalPriorityAt?: Array<Date | null>;
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
    mixedVarietyPenalty?: number;
    mixedGlobalVarietyPenalty?: number;
    socialVarietyGain?: number;
    randomScore?: number;
    pairingRandomScore?: number;
  }
): V3SingleCourtSelection {
  const players = restTurns.map((value, index) =>
    createActivePlayer(
      `P${index + 1}`,
      value,
      randomScore,
      matchesPlayed[index] ?? 0,
      arrivalPriorityAt[index] ?? null
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
    socialVarietyGain,
    ...(mixedVarietyPenalty !== undefined ? { mixedVarietyPenalty } : {}),
    ...(mixedGlobalVarietyPenalty !== undefined
      ? { mixedGlobalVarietyPenalty }
      : {}),
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
  totalMixedVarietyPenalty,
  totalMixedGlobalVarietyPenalty,
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
  totalMixedVarietyPenalty?: number;
  totalMixedGlobalVarietyPenalty?: number;
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
    ...(totalMixedVarietyPenalty !== undefined
      ? { mixedVarietyPenalty: totalMixedVarietyPenalty }
      : {}),
    ...(totalMixedGlobalVarietyPenalty !== undefined
      ? { mixedGlobalVarietyPenalty: totalMixedGlobalVarietyPenalty }
      : {}),
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
    ...(totalMixedVarietyPenalty !== undefined
      ? { totalMixedVarietyPenalty }
      : {}),
    ...(totalMixedGlobalVarietyPenalty !== undefined
      ? { totalMixedGlobalVarietyPenalty }
      : {}),
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
      balanceGap: 51,
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

  it("keeps the Points repeat exception but lets Social variety beat rest", () => {
    const fullRepeat = createSelection({
      restTurns: [3, 3, 3, 3],
      balanceGap: 0,
      sharedCourtRepeatPenalty: 6,
      exactRematchPenalty: 0,
      socialVarietyGain: 0,
    });
    const nearRestAlternative = createSelection({
      restTurns: [3, 3, 2, 2],
      balanceGap: 1.5,
      sharedCourtRepeatPenalty: 2,
      exactRematchPenalty: 0,
      socialVarietyGain: 1,
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

  it("uses ordinary rest only after Social variety ties, and skips it when disabled", () => {
    const moreRest = createSelection({
      restTurns: [4, 4, 4, 4], balanceGap: 0, exactRematchPenalty: 0,
      socialVarietyGain: 2,
    });
    const lessRest = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, exactRematchPenalty: 0,
      socialVarietyGain: 2,
    });

    expect(compareSingleCourtSelections(moreRest, lessRest, SessionType.SOCIAL_MIX)).toBeLessThan(0);
    expect(compareSingleCourtSelections(moreRest, lessRest, SessionType.SOCIAL_MIX, { respectPlayerRest: false })).toBe(0);
  });

  it("keeps court-time and arrival priority ahead of Social variety", () => {
    const higherCount = createSelection({
      matchesPlayed: [0, 0, 0, 2], balanceGap: 0, exactRematchPenalty: 0,
      socialVarietyGain: 100,
    });
    const lowerCount = createSelection({
      matchesPlayed: [0, 0, 0, 0], balanceGap: 0, exactRematchPenalty: 0,
      socialVarietyGain: 0,
    });
    const laterArrival = createSelection({
      arrivalPriorityAt: [null, null, null, null], balanceGap: 0, exactRematchPenalty: 0,
      socialVarietyGain: 100,
    });
    const earlierArrival = createSelection({
      arrivalPriorityAt: [new Date("2026-03-17T00:00:00Z"), null, null, null],
      balanceGap: 0, exactRematchPenalty: 0, socialVarietyGain: 0,
    });

    expect(compareSingleCourtSelections(lowerCount, higherCount, SessionType.SOCIAL_MIX)).toBeLessThan(0);
    expect(compareSingleCourtSelections(earlierArrival, laterArrival, SessionType.SOCIAL_MIX)).toBeLessThan(0);
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

  it("prefers a new partner inside the Elo balance window", () => {
    const repeatedPartner = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 1,
      exactRematchPenalty: 0,
    });
    const freshPartner = createSelection({
      balanceGap: 50,
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
      balanceGap: 51,
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
      balanceGap: 50,
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
      balanceGap: 50,
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

  it("prefers greater persistent Social variety gain over balance", () => {
    const repeatedCourt = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 2,
      exactRematchPenalty: 0,
    });
    const freshCourt = createSelection({
      balanceGap: 2,
      socialVarietyGain: 1,
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

  it("compares partner and opponent variety through their common gain", () => {
    const repeatedPartners = createSelection({
      balanceGap: 0,
      sharedCourtRepeatPenalty: 0,
      partnerCoveragePenalty: 1,
      opponentCoveragePenalty: 0,
      exactRematchPenalty: 0,
    });
    const freshPartners = createSelection({
      balanceGap: 0,
      socialVarietyGain: 1,
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

  it("uses actual rest turns instead of serial match-completion burden in Social", () => {
    const lowerBurden = createSelection({
      balanceGap: 10,
      restTurns: [2, 2, 2, 2],
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

  it("prioritizes back-to-back fairness in Balanced Elo within its safe window", () => {
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
        lowerBurden,
        betterBalancedRepeatedStayer,
        SessionType.ELO
      )
    ).toBeLessThan(0);
  });

  it("prioritizes consecutive-play protection before partner novelty for both Balanced metrics", () => {
    const fewerBackToBacks = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 3,
      exactRematchPenalty: 0,
      consecutivePlayCount: 0,
    });
    const fresherPartners = createSelection({
      balanceGap: 0,
      partnerRepeatPenalty: 0,
      exactRematchPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 1,
      consecutivePlayTotalBurden: 1,
    });

    for (const sessionType of BALANCED_SESSION_TYPES) {
      expect(
        compareSingleCourtSelections(
          fewerBackToBacks,
          fresherPartners,
          sessionType
        )
      ).toBeLessThan(0);
    }
  });

  it("keeps ordinary rest ahead of composition for both Balanced metrics", () => {
    const moreOrdinaryRest = createSelection({
      restTurns: [5, 5, 5, 5],
      balanceGap: 0,
      exactRematchPenalty: 0,
      mixedVarietyPenalty: 3,
    });
    const lessOrdinaryRest = createSelection({
      restTurns: [1, 1, 1, 1],
      balanceGap: 0,
      exactRematchPenalty: 0,
      mixedVarietyPenalty: -3,
    });

    for (const sessionType of BALANCED_SESSION_TYPES) {
      expect(
        compareSingleCourtSelections(
          moreOrdinaryRest,
          lessOrdinaryRest,
          sessionType
        )
      ).toBeLessThan(0);
    }
  });

  it("preserves flag-off behavior for consecutive play and rest across Balanced metrics", () => {
    const restPreferredButLessNovel = createSelection({
      restTurns: [5, 5, 5, 5],
      balanceGap: 0,
      exactRematchPenalty: 0,
      partnerRepeatPenalty: 2,
      consecutivePlayCount: 0,
      mixedVarietyPenalty: 3,
    });
    const lessRestButMoreNovel = createSelection({
      restTurns: [1, 1, 1, 1],
      balanceGap: 0,
      exactRematchPenalty: 0,
      partnerRepeatPenalty: 0,
      consecutivePlayCount: 1,
      consecutivePlayMaxBurden: 1,
      consecutivePlayTotalBurden: 1,
      mixedVarietyPenalty: -3,
    });

    for (const sessionType of BALANCED_SESSION_TYPES) {
      expect(
        compareSingleCourtSelections(
          lessRestButMoreNovel,
          restPreferredButLessNovel,
          sessionType,
          { respectPlayerRest: false }
        )
      ).toBeLessThan(0);
    }
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

  it("prefers greater total Social variety gain before balance in batches", () => {
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
    freshCourtBatch.totalSocialVarietyGain = 1;

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

  it("keeps batch ordinary rest before composition for POINTS and ELO", () => {
    const moreOrdinaryRest = createBatchSelection({
      restTurns: [5, 5, 5, 5],
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalMixedVarietyPenalty: 3,
    });
    const moreCompositionVariety = createBatchSelection({
      restTurns: [1, 1, 1, 1],
      maxBalanceGap: 0,
      totalBalanceGap: 0,
      totalMixedVarietyPenalty: -3,
    });

    for (const sessionType of BALANCED_SESSION_TYPES) {
      expect(
        compareBatchSelections(moreOrdinaryRest, moreCompositionVariety, sessionType)
      ).toBeLessThan(0);
    }
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
      maxBalanceGap: 50,
      totalBalanceGap: 50,
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
      maxBalanceGap: 51,
      totalBalanceGap: 51,
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
      maxBalanceGap: 50,
      totalBalanceGap: 50,
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
