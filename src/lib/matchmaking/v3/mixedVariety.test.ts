import { describe, expect, it } from "vitest";

import { getEffectiveMixedSide } from "@/lib/mixedSide";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { findBestBatchSelectionV3 } from "./batch";
import {
  buildMixedVarietyContext,
  isMixedPartitionForSides,
} from "./mixedVariety";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";

import type { MatchmakerV3Player } from "./types";
import type { V3MixedHistoryMatch } from "./mixedVariety";

function createPlayer(
  userId: string,
  gender: PlayerGender,
  overrides: Partial<MatchmakerV3Player> = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-09-30T00:00:00Z"),
    strength: 1000,
    isBusy: false,
    isPaused: false,
    gender,
    partnerPreference:
      gender === PlayerGender.FEMALE
        ? PartnerPreference.FEMALE_FLEX
        : PartnerPreference.OPEN,
    ...overrides,
  };
}

function createRoster(upperCount: number, lowerCount: number) {
  return [
    ...Array.from({ length: upperCount }, (_, index) =>
      createPlayer(`U${index + 1}`, PlayerGender.MALE)
    ),
    ...Array.from({ length: lowerCount }, (_, index) =>
      createPlayer(`L${index + 1}`, PlayerGender.FEMALE)
    ),
  ];
}

function getSideMap(players: MatchmakerV3Player[]) {
  return new Map(
    players.map((player) => [
      player.userId,
      getEffectiveMixedSide({
        gender: player.gender,
        partnerPreference: player.partnerPreference,
        mixedSideOverride: player.mixedSideOverride,
      }),
    ])
  );
}

function updateHistory(
  players: MatchmakerV3Player[],
  matches: V3MixedHistoryMatch[],
  newMatches: V3MixedHistoryMatch[]
) {
  const selectedIds = new Set(newMatches.flatMap((match) => [...match.team1, ...match.team2]));

  for (const player of players) {
    if (selectedIds.has(player.userId)) {
      player.matchesPlayed += 1;
      player.matchmakingBaseline += 1;
      player.restTurns = 0;
    } else {
      player.restTurns = (player.restTurns ?? 0) + 1;
    }
  }

  matches.push(...newMatches);
}

function simulateSingleCourt(
  upperCount: number,
  lowerCount: number,
  gameCount: number,
  sessionType: SessionType = SessionType.POINTS
) {
  const players = createRoster(upperCount, lowerCount);
  const history: V3MixedHistoryMatch[] = [];
  let mixedGameCount = 0;
  const sideByUserId = getSideMap(players);

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      completedMatches: history,
      mixedHistoryMatches: history,
      respectPlayerRest: true,
      randomFn: () => 0.5,
    });
    const selection = result.selection;
    expect(selection).not.toBeNull();
    if (!selection) throw new Error("Expected a legal selection");

    const match = {
      team1: selection.partition.team1,
      team2: selection.partition.team2,
    };
    if (isMixedPartitionForSides(match, sideByUserId)) mixedGameCount += 1;
    updateHistory(players, history, [match]);
  }

  return { players, history, mixedGameCount, sideByUserId };
}

function classifyMatch(
  match: V3MixedHistoryMatch,
  sideByUserId: Map<string, string | null>
) {
  if (isMixedPartitionForSides(match, sideByUserId)) return "MIXED";

  const ids = [...match.team1, ...match.team2];
  const sides = ids.map((userId) => sideByUserId.get(userId));
  if (new Set(ids).size !== 4 || sides.some((side) => !side)) return "OTHER";
  if (sides.every((side) => side === "UPPER")) return "UPPER";
  if (sides.every((side) => side === "LOWER")) return "LOWER";
  return "OTHER";
}

function simulateTwoCourtBatches(
  upperCount: number,
  lowerCount: number,
  batchCount: number,
  sessionType: SessionType = SessionType.POINTS
) {
  const players = createRoster(upperCount, lowerCount);
  const history: V3MixedHistoryMatch[] = [];
  const sideByUserId = getSideMap(players);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      completedMatches: history,
      mixedHistoryMatches: history,
      respectPlayerRest: true,
      randomFn: () => 0.5,
      searchLimits: { maxBranches: 5000, maxMs: 300 },
    });
    expect(result.selection?.selections).toHaveLength(2);
    if (!result.selection) throw new Error("Expected a legal batch");

    const newMatches = result.selection.selections.map((selection) => ({
      team1: selection.partition.team1,
      team2: selection.partition.team2,
    }));
    updateHistory(players, history, newMatches);
  }

  return { players, history, sideByUserId };
}

describe("balanced mixed variety history", () => {
  it("sets feasible per-side targets from effective sides and current roster size", () => {
    const equalContext = buildMixedVarietyContext(createRoster(7, 7), []);
    expect(equalContext.targetMixedRateByUserId.get("U1")).toBe(0.5);
    expect(equalContext.targetMixedRateByUserId.get("L1")).toBe(0.5);

    const unevenContext = buildMixedVarietyContext(createRoster(10, 4), []);
    expect(unevenContext.targetMixedRateByUserId.get("U1")).toBeCloseTo(4 / 14);
    expect(unevenContext.targetMixedRateByUserId.get("L1")).toBeCloseTo(10 / 14);

    const smallSideContext = buildMixedVarietyContext(createRoster(12, 2), []);
    expect(smallSideContext.targetMixedRateByUserId.get("U1")).toBeCloseTo(1 / 6);
    expect(smallSideContext.targetMixedRateByUserId.get("L1")).toBe(1);

    const impossibleContext = buildMixedVarietyContext(createRoster(8, 1), []);
    expect(impossibleContext.targetMixedRateByUserId.get("U1")).toBe(0);
    expect(impossibleContext.targetMixedRateByUserId.get("L1")).toBe(0);
  });

  it("counts mixed and same-side history but ignores hybrid or unclassifiable matches", () => {
    const players = createRoster(4, 4);
    const context = buildMixedVarietyContext(players, [
      { team1: ["U1", "L1"], team2: ["U2", "L2"] },
      { team1: ["U1", "U2"], team2: ["U3", "U4"] },
      { team1: ["U1", "L1"], team2: ["L2", "L3"] },
      { team1: ["U1", "MISSING"], team2: ["U2", "UNKNOWN"] },
    ]);

    expect(context.matchCountByUserId.get("U1")).toBe(2);
    expect(context.mixedMatchCountByUserId.get("U1")).toBe(1);
    expect(context.matchCountByUserId.get("L1")).toBe(1);
    expect(context.mixedMatchCountByUserId.get("L1")).toBe(1);
  });

  it("keeps a 7/7 single-court rotation near half mixed over ten games", () => {
    const result = simulateSingleCourt(7, 7, 10);
    const playedRates = result.players
      .filter((player) => player.matchesPlayed > 0)
      .map((player) => {
        const total = result.history.filter((match) =>
          [...match.team1, ...match.team2].includes(player.userId)
        ).length;
        const mixed = result.history.filter(
          (match) =>
            [...match.team1, ...match.team2].includes(player.userId) &&
            isMixedPartitionForSides(match, result.sideByUserId)
        ).length;
        return mixed / total;
      });
    const averageTargetError =
      playedRates.reduce((total, rate) => total + Math.abs(rate - 0.5), 0) /
      playedRates.length;

    expect(result.mixedGameCount).toBeGreaterThanOrEqual(3);
    expect(
      result.mixedGameCount,
      JSON.stringify({
        history: result.history,
        players: result.players.map((player) => ({
          id: player.userId,
          games: player.matchesPlayed,
          rest: player.restTurns,
        })),
      })
    ).toBeLessThanOrEqual(7);
    expect(averageTargetError).toBeLessThan(0.3);
  });

  it("adapts mixed frequency for uneven sides without making the minority play every court", () => {
    const result = simulateSingleCourt(10, 4, 10);
    const averageRateForPrefix = (prefix: string) => {
      const rates = result.players
        .filter((player) => player.userId.startsWith(prefix) && player.matchesPlayed > 0)
        .map((player) => {
          const appearances = result.history.filter((match) =>
            [...match.team1, ...match.team2].includes(player.userId)
          );
          const mixedAppearances = appearances.filter((match) =>
            isMixedPartitionForSides(match, result.sideByUserId)
          );
          return mixedAppearances.length / appearances.length;
        });
      return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    };

    expect(result.mixedGameCount).toBeGreaterThan(0);
    expect(averageRateForPrefix("L")).toBeGreaterThan(averageRateForPrefix("U"));
    expect(averageRateForPrefix("L")).toBeLessThan(1);
  });

  it("keeps a 12/2 minority to mixed games and rotates game counts first", () => {
    const result = simulateSingleCourt(12, 2, 10);
    const lowerPlayers = result.players.filter((player) =>
      player.userId.startsWith("L")
    );
    const lowerAppearances = result.history.flatMap((match) =>
      [...match.team1, ...match.team2].filter((userId) =>
        userId.startsWith("L")
      )
    );

    expect(result.mixedGameCount).toBeGreaterThan(0);
    expect(lowerAppearances.length).toBeGreaterThan(0);
    expect(result.mixedGameCount).toBeLessThanOrEqual(5);
    expect(
      Math.max(...result.players.map((player) => player.matchesPlayed)) -
        Math.min(...result.players.map((player) => player.matchesPlayed))
    ).toBeLessThanOrEqual(1);
    expect(lowerPlayers.every((player) => player.matchesPlayed > 0)).toBe(true);
  });

  it("uses the same history objective in rating based Balanced Mixed", () => {
    const result = simulateSingleCourt(7, 7, 10, SessionType.ELO);
    expect(result.mixedGameCount).toBeGreaterThanOrEqual(3);
    expect(result.mixedGameCount).toBeLessThanOrEqual(7);
  });

  it("adapts rating based targets to 10/4 and 12/2 side populations", () => {
    const uneven = simulateSingleCourt(10, 4, 10, SessionType.ELO);
    const minorityRates = uneven.players
      .filter((player) => player.userId.startsWith("L"))
      .map((player) => {
        const appearances = uneven.history.filter((match) =>
          [...match.team1, ...match.team2].includes(player.userId)
        );
        return (
          appearances.filter((match) =>
            isMixedPartitionForSides(match, uneven.sideByUserId)
          ).length / appearances.length
        );
      });
    const majorityRates = uneven.players
      .filter((player) => player.userId.startsWith("U"))
      .map((player) => {
        const appearances = uneven.history.filter((match) =>
          [...match.team1, ...match.team2].includes(player.userId)
        );
        return (
          appearances.filter((match) =>
            isMixedPartitionForSides(match, uneven.sideByUserId)
          ).length / appearances.length
        );
      });
    expect(uneven.mixedGameCount).toBeGreaterThan(0);
    expect(
      minorityRates.reduce((sum, rate) => sum + rate, 0) / minorityRates.length
    ).toBeGreaterThan(
      majorityRates.reduce((sum, rate) => sum + rate, 0) / majorityRates.length
    );

    const smallSide = simulateSingleCourt(12, 2, 10, SessionType.ELO);
    const lowerPlayers = smallSide.players.filter((player) =>
      player.userId.startsWith("L")
    );
    expect(smallSide.mixedGameCount).toBeGreaterThan(0);
    expect(smallSide.mixedGameCount).toBeLessThanOrEqual(5);
    expect(
      Math.max(...smallSide.players.map((player) => player.matchesPlayed)) -
        Math.min(...smallSide.players.map((player) => player.matchesPlayed))
    ).toBeLessThanOrEqual(1);
    expect(lowerPlayers.every((player) => player.matchesPlayed > 0)).toBe(true);
  });

  it("uses the same individual history objective for multi-court batches", () => {
    const result = simulateTwoCourtBatches(7, 7, 5);
    const categories = result.history.map((match) =>
      classifyMatch(match, result.sideByUserId)
    );
    const mixedGameCount = categories.filter((category) => category === "MIXED").length;
    const gameCounts = result.players.map((player) => player.matchesPlayed);

    expect(mixedGameCount).toBeGreaterThanOrEqual(3);
    expect(mixedGameCount).toBeLessThanOrEqual(7);
    expect(categories).toContain("UPPER");
    expect(categories).toContain("LOWER");
    expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(1);
  });

  it("mirrors adaptive mixed variety for uneven two-court rosters", () => {
    const maleMajority = simulateTwoCourtBatches(10, 4, 5, SessionType.ELO);
    const femaleMajority = simulateTwoCourtBatches(4, 10, 5, SessionType.ELO);
    const mixedCount = (matches: V3MixedHistoryMatch[], sides: Map<string, string | null>) =>
      matches.filter((match) => isMixedPartitionForSides(match, sides)).length;

    for (const result of [maleMajority, femaleMajority]) {
      const gameCounts = result.players.map((player) => player.matchesPlayed);
      expect(mixedCount(result.history, result.sideByUserId)).toBeGreaterThan(0);
      expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(1);
    }

    const lowerMinorityRates = maleMajority.players
      .filter((player) => player.userId.startsWith("L"))
      .map((player) => {
        const appearances = maleMajority.history.filter((match) =>
          [...match.team1, ...match.team2].includes(player.userId)
        );
        return appearances.filter((match) =>
          isMixedPartitionForSides(match, maleMajority.sideByUserId)
        ).length / appearances.length;
      });
    const upperMajorityRates = maleMajority.players
      .filter((player) => player.userId.startsWith("U"))
      .map((player) => {
        const appearances = maleMajority.history.filter((match) =>
          [...match.team1, ...match.team2].includes(player.userId)
        );
        return appearances.filter((match) =>
          isMixedPartitionForSides(match, maleMajority.sideByUserId)
        ).length / appearances.length;
      });
    expect(
      lowerMinorityRates.reduce((sum, rate) => sum + rate, 0) /
        lowerMinorityRates.length
    ).toBeGreaterThan(
      upperMajorityRates.reduce((sum, rate) => sum + rate, 0) /
        upperMajorityRates.length
    );

  });

  it("does not apply the composition objective to Social or Open matchmaking", () => {
    const players = createRoster(7, 7);
    const mixedHistory: V3MixedHistoryMatch[] = [];

    for (const options of [
      { sessionMode: SessionMode.MIXICANO, sessionType: SessionType.SOCIAL_MIX },
      { sessionMode: SessionMode.MEXICANO, sessionType: SessionType.POINTS },
    ]) {
      const singleResult = findBestSingleCourtSelectionV3(players, {
        ...options,
        completedMatches: [],
        mixedHistoryMatches: mixedHistory,
        respectPlayerRest: true,
        randomFn: () => 0.5,
      });
      expect(singleResult.selection?.mixedVarietyPenalty).toBeUndefined();
      expect(singleResult.selection?.mixedGame).toBeUndefined();

      const batchResult = findBestBatchSelectionV3(players, {
        ...options,
        courtCount: 2,
        completedMatches: [],
        mixedHistoryMatches: mixedHistory,
        respectPlayerRest: true,
        randomFn: () => 0.5,
        searchLimits: { maxBranches: 5000, maxMs: 300 },
      });
      expect(batchResult.selection?.totalMixedVarietyPenalty).toBeUndefined();
    }
  });
});
