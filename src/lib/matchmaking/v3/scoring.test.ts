import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
import {
  buildRestSummary,
  compareBatchSelections,
  compareSingleCourtSelections,
  getImmediateReplayCount,
  getSoftCadenceVector,
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
  totalSocialVarietyGain = 0,
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
  totalSocialVarietyGain?: number;
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
    totalSocialVarietyGain,
    totalRandomScore,
    totalPairingRandomScore,
    sidePairingLayoutKeys,
    sidePairingRandomScores,
  };
}

describe("matchmaking v3 scoring", () => {
  it("separates immediate zero-rest count from the late soft-cadence vector", () => {
    const players = [0, 3, 3, 3].map((restTurns, index) => createActivePlayer(`P${index}`, restTurns, 0));
    expect(getImmediateReplayCount(players)).toBe(1);
    expect(getSoftCadenceVector(players)).toEqual([0, -3, -3, -3]);
  });

  // The solver applies the fixed balance envelope before these comparisons.
  it.each(BALANCED_SESSION_TYPES)("minimizes zero-rest players before entropy and admissible balance (%s)", (sessionType) => {
    const varied = createSelection({ balanceGap: 1, socialVarietyGain: 1, restTurns: [0, 0, 0, 0], exactRematchPenalty: 10 });
    const rested = createSelection({ balanceGap: 0, socialVarietyGain: 0, restTurns: [3, 3, 3, 3], exactRematchPenalty: 0 });
    expect(compareSingleCourtSelections(rested, varied, sessionType)).toBeLessThan(0);
    const variedBatch = createBatchSelection({ maxBalanceGap: 1, totalBalanceGap: 2, totalSocialVarietyGain: 1, restTurns: [0, 0, 0, 0] });
    const restedBatch = createBatchSelection({ maxBalanceGap: 0, totalBalanceGap: 0, totalSocialVarietyGain: 0, restTurns: [3, 3, 3, 3] });
    expect(compareBatchSelections(restedBatch, variedBatch, sessionType)).toBeLessThan(0);
  });

  it.each(BALANCED_SESSION_TYPES)("keeps fairness, arrival and overdue protection ahead of entropy (%s)", (sessionType) => {
    const unfair = createSelection({ balanceGap: 0, socialVarietyGain: 100, matchesPlayed: [0, 0, 0, 1], exactRematchPenalty: 0 });
    const fair = createSelection({ balanceGap: 1, socialVarietyGain: 0, exactRematchPenalty: 0 });
    expect(compareSingleCourtSelections(fair, unfair, sessionType)).toBeLessThan(0);
    const arrival = createSelection({ balanceGap: 1, socialVarietyGain: 0, arrivalPriorityAt: [new Date("2026-01-01"), null, null, null], exactRematchPenalty: 0 });
    const varied = createSelection({ balanceGap: 0, socialVarietyGain: 100, exactRematchPenalty: 0 });
    expect(compareSingleCourtSelections(arrival, varied, sessionType)).toBeLessThan(0);
    const overdue = createSelection({ balanceGap: 1, socialVarietyGain: 0, exactRematchPenalty: 0 });
    overdue.ids[0] = "Overdue";
    overdue.players[0].userId = "Overdue";
    overdue.players[0].restTurns = 4;
    const starvationContext = { activePlayerCount: 8, availablePlayers: [...varied.players, overdue.players[0]] };
    expect(compareSingleCourtSelections(overdue, varied, sessionType, { starvationContext, respectPlayerRest: false })).toBeLessThan(0);
  });

  it.each(BALANCED_SESSION_TYPES)("ignores retired repeat and coverage weights in Balanced (%s)", (sessionType) => {
    const legacyHeavy = createSelection({ balanceGap: 0, exactRematchPenalty: 0, partnerRepeatPenalty: 99, opponentRepeatPenalty: 99, partnerCoveragePenalty: 99, opponentCoveragePenalty: 99, sharedCourtRepeatPenalty: 99, consecutivePlayCount: 4, consecutivePlayMaxBurden: 99 });
    const clean = createSelection({ balanceGap: 0, exactRematchPenalty: 0 });
    expect(compareSingleCourtSelections(legacyHeavy, clean, sessionType)).toBe(0);
    const legacyBatch = createBatchSelection({ maxBalanceGap: 0, totalBalanceGap: 0, totalPartnerRepeatPenalty: 99, totalOpponentRepeatPenalty: 99, totalPartnerCoveragePenalty: 99, totalOpponentCoveragePenalty: 99, totalSharedCourtRepeatPenalty: 99 });
    expect(compareBatchSelections(legacyBatch, createBatchSelection({ maxBalanceGap: 0, totalBalanceGap: 0 }), sessionType)).toBe(0);
  });

  it.each(BALANCED_SESSION_TYPES)("uses entropy before soft cadence, then actual balance and exact rematch (%s)", (sessionType) => {
    const rested = createSelection({ balanceGap: 1, restTurns: [3, 3, 3, 3], socialVarietyGain: 1, exactRematchPenalty: 0 });
    const balanced = createSelection({ balanceGap: 0, restTurns: [1, 1, 1, 1], socialVarietyGain: 1, exactRematchPenalty: 1 });
    expect(compareSingleCourtSelections(rested, balanced, sessionType)).toBeLessThan(0);
    expect(compareSingleCourtSelections(balanced, rested, sessionType, { respectPlayerRest: false })).toBeLessThan(0);
    const exact = createSelection({ balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 1, randomScore: 0 });
    const fresh = createSelection({ balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0, randomScore: 1 });
    expect(compareSingleCourtSelections(fresh, exact, sessionType)).toBeLessThan(0);
  });

  it.each(BALANCED_SESSION_TYPES)("uses batch minimax then total balance only after cadence and entropy tie (%s)", (sessionType) => {
    const safer = createBatchSelection({ maxBalanceGap: 1, totalBalanceGap: 2 });
    const lowerTotal = createBatchSelection({ maxBalanceGap: 1.5, totalBalanceGap: 1.5 });
    expect(compareBatchSelections(safer, lowerTotal, sessionType)).toBeLessThan(0);
    expect(compareBatchSelections(createBatchSelection({ maxBalanceGap: 1, totalBalanceGap: 1 }), safer, sessionType)).toBeLessThan(0);
  });

  it("preserves Points point-difference refinement while Rating uses its own strength units", () => {
    const lower = createSelection({ balanceGap: 0, pointDiffGap: 0, exactRematchPenalty: 0 });
    const higher = createSelection({ balanceGap: 0, pointDiffGap: 2, exactRematchPenalty: 0 });
    expect(compareSingleCourtSelections(lower, higher, SessionType.POINTS)).toBeLessThan(0);
    expect(compareSingleCourtSelections(lower, higher, SessionType.ELO)).toBe(0);
  });

  it.each(BALANCED_SESSION_TYPES)("defines a transitive total comparison including tiny entropy ties (%s)", (sessionType) => {
    const candidates = [
      createSelection({ balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 1 }),
      createSelection({ balanceGap: 0.5, socialVarietyGain: 1 + 1e-14, exactRematchPenalty: 0 }),
      createSelection({ balanceGap: 1, socialVarietyGain: 1 + 1e-10, exactRematchPenalty: 0 }),
    ];
    for (const a of candidates) for (const b of candidates) for (const c of candidates) {
      const ab = compareSingleCourtSelections(a, b, sessionType), bc = compareSingleCourtSelections(b, c, sessionType);
      expect(Math.sign(ab)).toBe(-Math.sign(compareSingleCourtSelections(b, a, sessionType)) || 0);
      if (ab <= 0 && bc <= 0) expect(compareSingleCourtSelections(a, c, sessionType)).toBeLessThanOrEqual(0);
    }
  });
  it("uses the late Social soft-cadence tie after entropy, and skips both cadence layers when disabled", () => {
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

  it("keeps immediate-replay prevention ahead of variety while allowing entropy to beat soft rest", () => {
    const immediateReplay = createSelection({
      restTurns: [0, 1, 1, 1], balanceGap: 0, socialVarietyGain: 100, exactRematchPenalty: 0,
    });
    const noReplay = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(noReplay, immediateReplay, SessionType.SOCIAL_MIX)).toBeLessThan(0);

    const betterEntropy = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0,
    });
    const moreRest = createSelection({
      restTurns: [4, 4, 4, 4], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(betterEntropy, moreRest, SessionType.SOCIAL_MIX)).toBeLessThan(0);
  });

  it.each([SessionType.SOCIAL_MIX, ...BALANCED_SESSION_TYPES])("uses separate Mixed entropy and cadence priority layers for %s", (sessionType) => {
    const higherTypeButReplay = createSelection({
      restTurns: [0, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    higherTypeButReplay.socialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 0.4 };
    const lowerTypeNoReplay = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0.4, exactRematchPenalty: 0,
    });
    lowerTypeNoReplay.socialVarietyGains = { courtmates: 0.1, partners: 0.1, opponents: 0.1, matchType: 0.1 };
    const mixed = { sessionMode: SessionMode.MIXICANO };
    expect(compareSingleCourtSelections(higherTypeButReplay, lowerTypeNoReplay, sessionType, mixed)).toBeLessThan(0);

    const fewerZeroRest = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    fewerZeroRest.socialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 0.1 };
    const moreRelationshipEntropy = createSelection({
      restTurns: [0, 1, 1, 1], balanceGap: 0, socialVarietyGain: 10, exactRematchPenalty: 0,
    });
    moreRelationshipEntropy.socialVarietyGains = { courtmates: 3, partners: 3, opponents: 3, matchType: 0.1 };
    expect(compareSingleCourtSelections(fewerZeroRest, moreRelationshipEntropy, sessionType, mixed)).toBeLessThan(0);

    const moreRelation = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0,
    });
    moreRelation.socialVarietyGains = { courtmates: 0.3, partners: 0.3, opponents: 0.3, matchType: 0.1 };
    const smoother = createSelection({
      restTurns: [3, 3, 3, 3], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    smoother.socialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 0.1 };
    expect(compareSingleCourtSelections(moreRelation, smoother, sessionType, mixed)).toBeLessThan(0);

    const openNoReplay = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    openNoReplay.socialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 0 };
    const openTypeOnly = createSelection({
      restTurns: [0, 1, 1, 1], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    openTypeOnly.socialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 10 };
    expect(compareSingleCourtSelections(openNoReplay, openTypeOnly, sessionType, { sessionMode: SessionMode.MEXICANO })).toBeLessThan(0);
  });

  it("uses exact Social entropy before soft rest and soft rest only on an exact entropy tie", () => {
    const higherExactEntropy = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1 + 1e-14, exactRematchPenalty: 0,
    });
    const betterSoftRest = createSelection({
      restTurns: [3, 3, 3, 3], balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(higherExactEntropy, betterSoftRest, SessionType.SOCIAL_MIX)).toBeLessThan(0);

    const exactEntropyTie = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(betterSoftRest, exactEntropyTie, SessionType.SOCIAL_MIX)).toBeLessThan(0);
  });

  it("uses the existing fixed Balanced entropy bucket before soft rest", () => {
    const betterSoftRest = createSelection({
      restTurns: [3, 3, 3, 3], balanceGap: 0, socialVarietyGain: 1, exactRematchPenalty: 0,
    });
    const bucketTied = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1 + 1e-14, exactRematchPenalty: 0,
    });
    const outsideBucket = createSelection({
      restTurns: [1, 1, 1, 1], balanceGap: 0, socialVarietyGain: 1 + 2e-12, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(betterSoftRest, bucketTied, SessionType.POINTS)).toBeLessThan(0);
    expect(compareSingleCourtSelections(outsideBucket, betterSoftRest, SessionType.POINTS)).toBeLessThan(0);
  });

  it.each([SessionType.SOCIAL_MIX, ...BALANCED_SESSION_TYPES])("uses the ascending cadence vector for %s", (sessionType) => {
    const uneven = createSelection({
      restTurns: [0, 3, 3, 3], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    const smoother = createSelection({
      restTurns: [1, 1, 2, 2], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(smoother, uneven, sessionType)).toBeLessThan(0);

    const compensated = createSelection({
      restTurns: [1, 1, 4, 4], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    const distributed = createSelection({
      restTurns: [1, 2, 2, 2], balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(distributed, compensated, sessionType)).toBeLessThan(0);
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

  it.each([SessionType.SOCIAL_MIX, ...BALANCED_SESSION_TYPES])("never trades a better count-fairness class for rest cadence (%s)", (sessionType) => {
    const fairer = createSelection({
      matchesPlayed: [5, 5, 5, 5], restTurns: [0, 0, 0, 0],
      balanceGap: 0, socialVarietyGain: 100, exactRematchPenalty: 0,
    });
    const lessFair = createSelection({
      matchesPlayed: [5, 5, 5, 6], restTurns: [20, 20, 20, 20],
      balanceGap: 0, socialVarietyGain: 0, exactRematchPenalty: 0,
    });
    expect(compareSingleCourtSelections(fairer, lessFair, sessionType)).toBeLessThan(0);
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

});
