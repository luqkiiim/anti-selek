import { describe, expect, it } from "vitest";
import controlFixture from "./socialFrontierScalability.control.json";
import { SessionMode, SessionType } from "../../../types/enums";
import {
  findBestRotationBatchSelection as findCurrentSelection,
  type RotationBatchOptions,
} from "./socialBatch";
import { buildOptimisticCourtmateCoverageProfile } from "./socialFrontierSearchBounds";
import type { MatchmakerV3Player, SocialHistoryMatch } from "./types";

type Fraction = { readonly numerator: number; readonly denominator: number };
type CoveragePlayer = {
  readonly userId: string;
  readonly covered: number;
  readonly possible: number;
  readonly maximumSingleCourtGain: number;
  readonly canStillBeSelected: boolean;
};
type HistoryFixture = readonly [readonly number[], "MIXED" | "OWN_SIDE"];

function compareFractions(left: Fraction, right: Fraction): number {
  const leftCross = BigInt(left.numerator) * BigInt(right.denominator);
  const rightCross = BigInt(right.numerator) * BigInt(left.denominator);
  return leftCross === rightCross ? 0 : leftCross < rightCross ? -1 : 1;
}

function compareProfiles(left: readonly Fraction[], right: readonly Fraction[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (!leftEntry || !rightEntry) return leftEntry ? 1 : rightEntry ? -1 : 0;
    const difference = compareFractions(leftEntry, rightEntry);
    if (difference !== 0) return difference;
  }
  return 0;
}

function postProfile(players: readonly CoveragePlayer[], upgraded: ReadonlySet<string>): Fraction[] {
  return players.flatMap((player) => {
    if (player.possible <= 0) return [];
    const gain = upgraded.has(player.userId) ? player.maximumSingleCourtGain : 0;
    return [{
      numerator: Math.min(player.possible, player.covered + gain),
      denominator: player.possible,
    }];
  }).sort(compareFractions);
}

/** Implements the relaxed leximin exchange rule, independently of the matcher. */
function exchangeUpperBound(players: readonly CoveragePlayer[], remainingSlots: number): Fraction[] {
  const upgradeOrder = [...players]
    .filter((player) => player.canStillBeSelected && player.possible > player.covered &&
      player.maximumSingleCourtGain > 0)
    .sort((left, right) => compareFractions(
      { numerator: left.covered, denominator: left.possible },
      { numerator: right.covered, denominator: right.possible },
    ) || compareFractions(
      { numerator: Math.min(right.possible, right.covered + right.maximumSingleCourtGain), denominator: right.possible },
      { numerator: Math.min(left.possible, left.covered + left.maximumSingleCourtGain), denominator: left.possible },
    ) || left.userId.localeCompare(right.userId));
  const upgraded = new Set(upgradeOrder.slice(0, Math.max(0, remainingSlots)).map((player) => player.userId));
  return postProfile(players, upgraded);
}

function exhaustiveRelaxedUpperBound(players: readonly CoveragePlayer[], remainingSlots: number): Fraction[] {
  const improvable = players.filter((player) => player.canStillBeSelected && player.possible > player.covered &&
    player.maximumSingleCourtGain > 0);
  let best: Fraction[] | null = null;
  for (let mask = 0; mask < 2 ** improvable.length; mask += 1) {
    let usedSlots = 0;
    const upgraded = new Set<string>();
    for (let index = 0; index < improvable.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      usedSlots += 1;
      upgraded.add(improvable[index].userId);
    }
    if (usedSlots > remainingSlots) continue;
    const profile = postProfile(players, upgraded);
    if (best === null || compareProfiles(profile, best) > 0) best = profile;
  }
  return best ?? postProfile(players, new Set());
}

function deterministicGenerator(initialSeed: number) {
  let state = initialSeed >>> 0;
  return (maximum: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % maximum;
  };
}

function makePlayers(count = 8): MatchmakerV3Player[] {
  const upperCount = Math.floor(count / 2);
  return Array.from({ length: count }, (_unused, index) => {
    const upper = index < upperCount;
    return {
      userId: `P${index}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-01-01T00:00:00.000Z"),
      arrivalPriorityAt: null,
      restTurns: 1,
      strength: 950 + index * 17,
      pointDiff: (index * 7) % 19,
      gender: upper ? "FEMALE" : "MALE",
      partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: upper ? "UPPER" : "LOWER",
    };
  });
}

function makeHistory(fixtures: readonly HistoryFixture[], players: readonly MatchmakerV3Player[]): SocialHistoryMatch[] {
  const upperCount = Math.floor(players.length / 2);
  return fixtures.map(([indexes], index) => {
    const upper = indexes.filter((player) => player < upperCount).map((player) => `P${player}`);
    const lower = indexes.filter((player) => player >= upperCount).map((player) => `P${player}`);
    const teams = upper.length === 2 && lower.length === 2
      ? [[upper[0], lower[0]], [upper[1], lower[1]]]
      : [[...indexes.slice(0, 2).map((player) => `P${player}`)],
        [...indexes.slice(2, 4).map((player) => `P${player}`)]];
    return {
      id: `frontier-history-${index + 1}`,
      team1: teams[0] as [string, string],
      team2: teams[1] as [string, string],
      completedAt: new Date(Date.UTC(2025, 0, index + 1)),
    };
  });
}

function projectResult(result: ReturnType<typeof findCurrentSelection>) {
  const batch = result.selection;
  return {
    scheduleIndex: result.scheduleIndex,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    replayCertified: result.replayCertified,
    coverageGateCertified: result.coverageGateCertified,
    balanceCertified: result.balanceCertified,
    varietyOptimal: result.varietyOptimal,
    priorityCertified: result.priorityCertified,
    searchLimitReached: result.debug.searchLimitReached,
    failureReason: result.debug.failureReason,
    courtmateGainMaximumCertified: result.courtmateGainMaximumCertified,
    courtmateGainMaximum: result.courtmateGainMaximum,
    chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit,
    bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax,
    chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain,
    chosenPostBatchCourtmateCoverage: result.chosenPostBatchCourtmateCoverage,
    selection: batch && {
      courts: batch.selections.map((selection) => ({
        ids: [...selection.ids].sort(),
        team1: [...selection.partition.team1].sort(),
        team2: [...selection.partition.team2].sort(),
        balanceGap: selection.balanceGap,
        pointDiffGap: selection.pointDiffGap,
        randomScore: selection.randomScore,
        pairingRandomScore: selection.pairingRandomScore,
        socialVariety: selection.socialVariety,
        socialVarietyGains: selection.socialVarietyGains,
        socialStarvation: selection.socialStarvation,
        sharedCourtRepeatPenalty: selection.sharedCourtRepeatPenalty,
        sharedCourtEncounterFrequencyPenalty: selection.sharedCourtEncounterFrequencyPenalty,
        partnerRepeatPenalty: selection.partnerRepeatPenalty,
        opponentRepeatPenalty: selection.opponentRepeatPenalty,
        exactRematchPenalty: selection.exactRematchPenalty,
      })).sort((left, right) => left.ids.join("|").localeCompare(right.ids.join("|"))),
      restSummary: batch.restSummary,
      maxBalanceGap: batch.maxBalanceGap,
      totalBalanceGap: batch.totalBalanceGap,
      maxPointDiffGap: batch.maxPointDiffGap,
      totalPointDiffGap: batch.totalPointDiffGap,
      totalSharedCourtRepeatPenalty: batch.totalSharedCourtRepeatPenalty,
      totalSharedCourtEncounterFrequencyPenalty: batch.totalSharedCourtEncounterFrequencyPenalty,
      totalPartnerRepeatPenalty: batch.totalPartnerRepeatPenalty,
      totalOpponentRepeatPenalty: batch.totalOpponentRepeatPenalty,
      totalExactRematchPenalty: batch.totalExactRematchPenalty,
      totalSocialVarietyGains: batch.totalSocialVarietyGains,
      totalRelationshipEntropyGain: batch.totalRelationshipEntropyGain,
      totalPairingRandomScore: batch.totalPairingRandomScore,
      sidePairingLayoutKeys: batch.sidePairingLayoutKeys,
      sidePairingRandomScores: batch.sidePairingRandomScores,
    },
  };
}

const frozenControlRecords: Record<string, unknown> = controlFixture.records;

function runAgainstFrozenControl(
  players: MatchmakerV3Player[],
  history: SocialHistoryMatch[],
  fixtureName: string,
  extras: Partial<Pick<RotationBatchOptions<MatchmakerV3Player>,
    "lockedPlayerIds" | "rotationPlayerCount" | "pairingRandomMode" | "schedules" | "randomFn">> = {},
  config: {
    sessionType?: SessionType.SOCIAL_MIX | SessionType.POINTS | SessionType.ELO;
    socialPriorityPolicy?: "courtmate-beneficial-rescue" | null;
    courtCount?: number;
  } = {},
) {
  const sessionType = config.sessionType ?? SessionType.SOCIAL_MIX;
  const common: Omit<RotationBatchOptions<MatchmakerV3Player>, "sessionMode" | "sessionType"> = {
    courtCount: config.courtCount ?? 2,
    respectPlayerRest: true,
    rotationPlayerCount: extras.rotationPlayerCount ?? players.length,
    completedMatches: history,
    socialHistoryMatches: history,
    randomFn: extras.randomFn ?? (() => 0.371),
    ...extras,
  };
  if (config.socialPriorityPolicy !== null) {
    common.socialPriorityPolicy = config.socialPriorityPolicy ?? "courtmate-beneficial-rescue";
  }
  const current = findCurrentSelection(players, {
    ...common,
    sessionMode: SessionMode.MIXICANO,
    sessionType,
  });
  expect(projectResult(current)).toEqual(frozenControlRecords[fixtureName]);
  return current;
}

function quartetConstraint<T extends { userId: string }>(expectedIds: readonly string[]) {
  const expected = [...expectedIds].sort().join("|");
  return {
    isQuartetAllowed: (players: [T, T, T, T]) => players.map((player) => player.userId).sort().join("|") === expected,
  };
}

function allowedQuartetsConstraint<T extends { userId: string }>(quartets: readonly (readonly string[])[]) {
  const allowed = new Set(quartets.map((ids) => [...ids].sort().join("|")));
  return {
    isQuartetAllowed: (players: [T, T, T, T]) => allowed.has(players.map((player) => player.userId).sort().join("|")),
  };
}

describe("beneficial-rescue frontier exactness and scale bounds", () => {
  it("uses the exact relaxed leximin profile upper bound with unequal denominators and paused players", () => {
    const random = deterministicGenerator(0x51ea1);
    for (let scenario = 0; scenario < 180; scenario += 1) {
      const playerCount = 3 + random(8);
      const players = Array.from({ length: playerCount }, (_unused, index): CoveragePlayer => {
        const possible = random(15);
        const covered = possible === 0 ? 0 : random(possible + 1);
        return {
          userId: `p${index}`,
          covered,
          possible,
          maximumSingleCourtGain: Math.min(3, possible - covered, random(4)),
          canStillBeSelected: random(4) !== 0,
        };
      });
      const slots = random(playerCount + 1);
      const profile = players.map(({ userId, covered, possible }) => ({ userId, covered, possible }));
      const fixedUserIds = new Set(players.filter((player) => !player.canStillBeSelected).map((player) => player.userId));
      const maxGainByUserId = new Map(players
        .filter((player) => player.canStillBeSelected)
        .map((player) => [player.userId, player.maximumSingleCourtGain]));
      const actual = buildOptimisticCourtmateCoverageProfile(profile, maxGainByUserId, fixedUserIds, slots);
      const actualFractions = actual.map(({ covered, possible }) => ({ numerator: covered, denominator: possible }));
      const exhaustive = exhaustiveRelaxedUpperBound(players, slots);

      expect(compareProfiles(exchangeUpperBound(players, slots), exhaustive)).toBe(0);
      expect(compareProfiles(actualFractions, exhaustive)).toBe(0);
    }
  });

  it.each([
    ["strictly positive T concession", [
      [[0, 1, 2, 3], "OWN_SIDE"], [[2, 3, 5, 7], "MIXED"], [[1, 2, 5, 6], "MIXED"],
      [[1, 3, 5, 6], "MIXED"], [[1, 3, 4, 5], "MIXED"], [[0, 1, 4, 5], "MIXED"],
      [[0, 2, 5, 7], "MIXED"], [[2, 3, 4, 7], "MIXED"],
    ] as const],
    ["T tied at Gmax", [
      [[2, 3, 4, 7], "MIXED"], [[0, 1, 2, 3], "OWN_SIDE"], [[1, 2, 4, 5], "MIXED"],
      [[0, 3, 5, 6], "MIXED"],
    ] as const],
    ["negative full-Gmax T", [
      [[0, 2, 5, 7], "MIXED"], [[0, 2, 6, 7], "MIXED"], [[4, 5, 6, 7], "OWN_SIDE"],
      [[0, 1, 2, 3], "OWN_SIDE"], [[0, 3, 4, 5], "MIXED"], [[0, 1, 4, 6], "MIXED"],
      [[2, 3, 5, 6], "MIXED"], [[0, 3, 4, 6], "MIXED"], [[1, 2, 5, 7], "MIXED"],
      [[0, 3, 6, 7], "MIXED"], [[0, 3, 4, 6], "MIXED"],
    ] as const],
  ])("preserves every final objective layer against the frozen full-engine control: %s", (name, fixtures) => {
    const players = makePlayers();
    const history = makeHistory(fixtures, players);
    const controlName = name === "strictly positive T concession"
      ? "rescue_positive"
      : name === "T tied at Gmax" ? "rescue_tied" : "rescue_negative";
    const current = runAgainstFrozenControl(players, history, controlName);

    expect(current.selection).not.toBeNull();
    expect(current.fairnessCertified).toBe(true);
    expect(current.starvationCertified).toBe(true);
    expect(current.priorityCertified).toBe(true);
    expect(current.courtmateGainMaximumCertified).toBe(true);
  });

  it("keeps locked players, count/arrival order, and overdue protection ahead of rescue objectives", () => {
    const arrivalPlayers = makePlayers(10);
    for (let index = 0; index < arrivalPlayers.length; index += 1) {
      arrivalPlayers[index].arrivalPriorityAt = new Date(Date.UTC(2010, 0, index));
    }
    arrivalPlayers[4].arrivalPriorityAt = new Date("2030-01-01T00:00:00.000Z");
    arrivalPlayers[8].arrivalPriorityAt = new Date("2040-01-01T00:00:00.000Z");
    arrivalPlayers[9].matchesPlayed = 1;
    const arrival = runAgainstFrozenControl(
      arrivalPlayers, [], "rescue_locks_arrival", { lockedPlayerIds: new Set(["P9"]) },
    );
    const arrivalIds = arrival.selection!.selections.flatMap((court) => court.ids).sort();
    expect(arrivalIds).toEqual(["P0", "P1", "P2", "P3", "P5", "P6", "P7", "P9"]);

    const overduePlayers = makePlayers(10);
    overduePlayers[8].restTurns = 5;
    overduePlayers[9].restTurns = 6;
    const overdue = runAgainstFrozenControl(overduePlayers, [], "rescue_overdue", { rotationPlayerCount: 10 });
    const overdueIds = new Set(overdue.selection!.selections.flatMap((court) => court.ids));
    expect(overdueIds.has("P8")).toBe(true);
    expect(overdueIds.has("P9")).toBe(true);
    expect(overdue.selection!.selections[0].socialStarvation?.leftOutOverdueCount).toBe(0);
  });

  it("keeps the best schedule profile ahead of a higher-coverage later profile", () => {
    const players = makePlayers();
    const history = makeHistory([
      [[0, 1, 4, 5], "MIXED"],
      [[2, 3, 6, 7], "MIXED"],
    ], players);
    const schedule = <T extends { userId: string }>() => [
      {
        rank: 1,
        courts: [quartetConstraint<T>(["P0", "P2", "P4", "P6"]), quartetConstraint<T>(["P1", "P3", "P5", "P7"])],
      },
      {
        rank: 0,
        courts: [quartetConstraint<T>(["P0", "P1", "P4", "P5"]), quartetConstraint<T>(["P2", "P3", "P6", "P7"])],
      },
    ];
    const schedules = schedule();
    const current = runAgainstFrozenControl(players, history, "rescue_distinct_schedule", { schedules });

    expect(current.scheduleIndex).toBe(1);
    expect(current.courtmateGainMaximum).toBe(0);
  });

  const sideBalancedSaltFixtures: Array<[string, () => number]> = [
    ["zero", () => 0],
    ["nonzero", () => 0.371],
  ];
  it.each(sideBalancedSaltFixtures)("preserves side-balanced %s-salt tie resolution", (salt, randomFn) => {
    const current = runAgainstFrozenControl(
      makePlayers(), [], `rescue_side_balanced_${salt}_salt`,
      { pairingRandomMode: "side-balanced", randomFn },
    );
    expect(current.selection).not.toBeNull();
    expect(current.priorityCertified).toBe(true);
    expect(current.selection!.sidePairingRandomScores).toHaveLength(2);
    expect(current.selection!.sidePairingLayoutKeys).toHaveLength(2);
  });

  it.each(sideBalancedSaltFixtures)("preserves three-court side-balanced %s-salt ties across court permutations", (salt, randomFn) => {
    const players = makePlayers(12);
    for (const player of players) {
      player.strength = 1000;
      player.pointDiff = 0;
    }
    const upper = players.slice(0, 6).map((player) => player.userId);
    const lower = players.slice(6).map((player) => player.userId);
    const allowed = [
      [upper[0], upper[1], lower[0], lower[1]],
      [upper[2], upper[3], lower[2], lower[3]],
      [upper[4], upper[5], lower[4], lower[5]],
      [upper[0], upper[1], lower[2], lower[3]],
      [upper[2], upper[3], lower[4], lower[5]],
      [upper[4], upper[5], lower[0], lower[1]],
    ];
    const constraint = allowedQuartetsConstraint<MatchmakerV3Player>(allowed);
    const current = runAgainstFrozenControl(
      players,
      [],
      `rescue_three_court_${salt}_salt`,
      {
        pairingRandomMode: "side-balanced",
        randomFn,
        schedules: [{ rank: 0, courts: [constraint, constraint, constraint] }],
      },
      { courtCount: 3 },
    );
    expect(current.selection).not.toBeNull();
    expect(current.courtmateGainMaximumCertified).toBe(true);
    expect(current.selection!.sidePairingLayoutKeys).toHaveLength(2);
  });

  it.each([
    ["production SOCIAL_MIX default", "social_default", SessionType.SOCIAL_MIX],
    ["POINTS default", "points_default", SessionType.POINTS],
    ["ELO default", "elo_default", SessionType.ELO],
  ] as const)("leaves %s byte-for-byte at the frozen production behavior when rescue is omitted", (_name, key, sessionType) => {
    const players = makePlayers();
    const history = makeHistory([[[0, 1, 4, 5], "MIXED"], [[2, 3, 6, 7], "MIXED"]], players);
    const current = runAgainstFrozenControl(players, history, key, {}, {
      sessionType,
      socialPriorityPolicy: null,
    });
    expect(current.selection).not.toBeNull();
    expect(current.fairnessCertified).toBe(true);
    expect(current.starvationCertified).toBe(true);
    if (sessionType !== SessionType.ELO) {
      expect(current.replayCertified).toBe(true);
      expect(current.coverageGateCertified).toBe(true);
    }
    if (sessionType !== SessionType.SOCIAL_MIX) expect(current.balanceCertified).toBe(true);
  });
});
