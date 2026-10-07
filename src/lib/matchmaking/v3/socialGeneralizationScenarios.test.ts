import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import { createSocialCourtmatePriorityScorer } from "./socialCourtmatePriority";
import { buildSocialVarietyContext, buildSocialVarietySnapshot } from "./socialVariety";
import {
  getSocialGeneralizationScenario,
  getSocialGeneralizationStructuralRoster,
  SOCIAL_GENERALIZATION_SCENARIOS,
} from "./socialGeneralizationScenarios";
import type {
  SocialGeneralizationScenario,
  SocialGeneralizationSide,
  SocialGeneralizationStructuralPlayer,
} from "./socialGeneralizationScenarios";
import type { MatchmakerV3Player } from "./types";
import type { SocialHistoryMatch } from "./types";

const scenarioById = new Map(
  SOCIAL_GENERALIZATION_SCENARIOS.map((scenario) => [scenario.id, scenario]),
);

function playersForRoster(roster: readonly SocialGeneralizationStructuralPlayer[]) {
  return roster.map((player, index): MatchmakerV3Player => ({
    userId: player.userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00.000Z"),
    strength: 1000 + index,
    gender: player.side === "UPPER" ? "MALE" : "FEMALE",
    isPaused: player.isPaused,
  }));
}

function feasibleTypesFor(
  scenario: SocialGeneralizationScenario,
  completedMatches: number,
) {
  const roster = getSocialGeneralizationStructuralRoster(scenario, completedMatches);
  const context = buildSocialVarietyContext(playersForRoster(roster), [], {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });

  return new Map(
    roster.map(({ userId }) => [
      userId,
      [...(context.playersByUserId.get(userId)?.matchType.opportunities ?? [])].sort(),
    ]),
  );
}

function expectedTypes(upper: number, lower: number, side: SocialGeneralizationSide) {
  const mixedPossible = upper >= 2 && lower >= 2;
  const ownPossible = (side === "UPPER" ? upper : lower) >= 4;
  return [
    ...(mixedPossible ? ["MIXED"] : []),
    ...(ownPossible ? ["OWN_SIDE"] : []),
  ].sort();
}

function makeSkewedPlayers(mirrorSides: boolean): MatchmakerV3Player[] {
  return Array.from({ length: 8 }, (_value, index) => {
    const originalSide = index < 6 ? "UPPER" : "LOWER";
    const side = mirrorSides
      ? originalSide === "UPPER" ? "LOWER" : "UPPER"
      : originalSide;
    return {
      userId: `P${index + 1}`,
      matchesPlayed: index % 3,
      matchmakingBaseline: index % 3,
      availableSince: new Date("2026-02-01T00:00:00.000Z"),
      arrivalPriorityAt: index === 5 ? new Date("2026-02-02T00:00:00.000Z") : null,
      strength: 980 + index * 17,
      pointDiff: index * 3 - 9,
      restTurns: (index * 2) % 5,
      gender: side === "UPPER" ? "MALE" : "FEMALE",
      partnerPreference: side === "UPPER" ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: side,
      isBusy: false,
      isPaused: false,
    };
  });
}

function makeSkewedHistory(players: readonly MatchmakerV3Player[]): SocialHistoryMatch[] {
  const partitions = [
    {
      id: "history-mixed",
      team1: ["P1", "P7"] as [string, string],
      team2: ["P2", "P8"] as [string, string],
    },
    {
      id: "history-own-side",
      team1: ["P3", "P4"] as [string, string],
      team2: ["P5", "P6"] as [string, string],
    },
  ];
  return partitions.map((partition, index) => ({
    ...partition,
    completedAt: new Date(`2026-02-0${index + 1}T12:00:00.000Z`),
    socialVariety: buildSocialVarietySnapshot(partition, players),
  }));
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function canonicalLayout(result: ReturnType<typeof findBestRotationBatchSelection>) {
  const selections = result.selection?.selections ?? [];
  return {
    selectedIds: selections.flatMap((selection) => selection.ids).sort(),
    quartets: selections.map((selection) => [...selection.ids].sort().join(",")).sort(),
    matchups: selections.map((selection) => [
      [...selection.partition.team1].sort().join(","),
      [...selection.partition.team2].sort().join(","),
    ].sort().join("|")).sort(),
  };
}

function getChosenSocialMetrics(
  players: readonly MatchmakerV3Player[],
  history: readonly SocialHistoryMatch[],
  result: ReturnType<typeof findBestRotationBatchSelection>,
) {
  const context = buildSocialVarietyContext(players, history, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  const scorer = createSocialCourtmatePriorityScorer(context, history);
  const metrics = scorer.getBatchMetrics(
    result.selection?.selections.map((selection) => selection.partition) ?? [],
  );
  return {
    courtmatePairs: metrics.newCourtmatePairs,
    rollingTypeGain: scorer.toNormalizedRollingTypeGain(metrics.rollingMatchTypeGainUnits),
    coverage: metrics.courtmateCoverageProfile,
  };
}

describe("Social generalization scenario catalog", () => {
  it("contains unique, court-fillable scenarios with six-appearance checkpoints", () => {
    const ids = SOCIAL_GENERALIZATION_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const scenario of SOCIAL_GENERALIZATION_SCENARIOS) {
      const largestRoster = scenario.initialUpper + scenario.initialLower +
        scenario.events.reduce(
          (count, event) => count + (event.type === "join" ? event.players.length : 0),
          0,
        );
      expect(scenario.shortHorizonMatches).toBe(Math.round((6 * largestRoster) / 4));
      expect(scenario.initialUpper + scenario.initialLower).toBeGreaterThanOrEqual(
        scenario.courtCount * 4,
      );
    }

    expect(scenarioById.get("balanced-10-5-5-1c")?.shortHorizonMatches).toBe(15);
    expect(scenarioById.get("balanced-12-6-6-2c")?.shortHorizonMatches).toBe(18);
    expect(scenarioById.get("fixed-14-7-7-2c")?.shortHorizonMatches).toBe(21);
    expect(scenarioById.get("balanced-16-8-8-2c")?.shortHorizonMatches).toBe(24);
    expect(scenarioById.get("balanced-18-9-9-3c")?.shortHorizonMatches).toBe(27);
  });

  it.each([
    ["fixed-14-7-7-2c", 7, 7],
    ["fixed-14-8-6-2c", 8, 6],
    ["fixed-14-9-5-2c", 9, 5],
    ["fixed-14-10-4-2c", 10, 4],
    ["balanced-10-5-5-1c", 5, 5],
    ["balanced-10-5-5-2c", 5, 5],
    ["balanced-12-6-6-2c", 6, 6],
    ["balanced-16-8-8-2c", 8, 8],
    ["balanced-18-9-9-3c", 9, 9],
  ] as const)("uses both feasible types for %s", (id, upper, lower) => {
    const scenario = getSocialGeneralizationScenario(id);
    const types = feasibleTypesFor(scenario, 0);
    const roster = getSocialGeneralizationStructuralRoster(scenario, 0);
    for (const player of roster) {
      expect(types.get(player.userId)).toEqual(expectedTypes(upper, lower, player.side));
    }
  });

  it("adapts each player's match-type denominator for one-type edge rosters", () => {
    const elevenThree = getSocialGeneralizationScenario("edge-14-11-3-2c");
    const edgeTypes = feasibleTypesFor(elevenThree, 0);
    for (let index = 1; index <= 11; index += 1) {
      expect(edgeTypes.get(`P${index}`)).toEqual(["MIXED", "OWN_SIDE"]);
    }
    for (let index = 12; index <= 14; index += 1) {
      expect(edgeTypes.get(`P${index}`)).toEqual(["MIXED"]);
    }

    const ownOnly = feasibleTypesFor(
      getSocialGeneralizationScenario("edge-8-8-0-2c"),
      0,
    );
    expect([...ownOnly.values()].every((types) => types.length === 1 && types[0] === "OWN_SIDE")).toBe(true);

    const mixedOnly = feasibleTypesFor(
      getSocialGeneralizationScenario("edge-6-3-3-1c"),
      0,
    );
    expect([...mixedOnly.values()].every((types) => types.length === 1 && types[0] === "MIXED")).toBe(true);
  });

  it("changes structural type feasibility when a lower-side player joins 10/3", () => {
    const scenario = getSocialGeneralizationScenario("dynamic-feasibility-10-3-to-10-4-after-8");
    expect(getSocialGeneralizationStructuralRoster(scenario, 7)).toHaveLength(13);
    const before = feasibleTypesFor(scenario, 7);
    for (let index = 11; index <= 13; index += 1) {
      expect(before.get(`P${index}`)).toEqual(["MIXED"]);
    }

    const rosterAfter = getSocialGeneralizationStructuralRoster(scenario, 8);
    expect(rosterAfter).toHaveLength(14);
    expect(rosterAfter.find((player) => player.userId === "P14")).toMatchObject({
      side: "LOWER",
      isPaused: false,
    });
    const after = feasibleTypesFor(scenario, 8);
    for (let index = 11; index <= 14; index += 1) {
      expect(after.get(`P${index}`)).toEqual(["MIXED", "OWN_SIDE"]);
    }
  });

  it("keeps paused participants and their structural opportunities through pause, resume, and played departure", () => {
    const pauseResume = getSocialGeneralizationScenario("dynamic-pause-resume-14-7-7-p1-at-6-12");
    const beforePause = feasibleTypesFor(pauseResume, 5);
    const pausedRoster = getSocialGeneralizationStructuralRoster(pauseResume, 6);
    expect(pausedRoster).toHaveLength(14);
    expect(pausedRoster.find((player) => player.userId === "P1")?.isPaused).toBe(true);
    expect(feasibleTypesFor(pauseResume, 6)).toEqual(beforePause);
    expect(getSocialGeneralizationStructuralRoster(pauseResume, 12).find(
      (player) => player.userId === "P1",
    )?.isPaused).toBe(false);

    const departure = getSocialGeneralizationScenario("dynamic-played-departure-as-pause-14-10-4-p14-after-8");
    const departureBefore = feasibleTypesFor(departure, 7);
    const departureAfterRoster = getSocialGeneralizationStructuralRoster(departure, 8);
    expect(departureAfterRoster).toHaveLength(14);
    expect(departureAfterRoster.find((player) => player.userId === "P14")).toMatchObject({
      side: "LOWER",
      isPaused: true,
    });
    expect(feasibleTypesFor(departure, 8)).toEqual(departureBefore);
    expect(feasibleTypesFor(departure, 8).get("P14")).toEqual(["MIXED", "OWN_SIDE"]);
  });

  it("does not let temporary busy availability alter the structural type vocabulary", () => {
    const scenario = getSocialGeneralizationScenario("fixed-14-10-4-2c");
    const roster = getSocialGeneralizationStructuralRoster(scenario, 0);
    const ordinary = buildSocialVarietyContext(playersForRoster(roster), [], {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const busy = buildSocialVarietyContext(
      playersForRoster(roster).map((player) => ({ ...player, isBusy: player.userId === "P14" })),
      [],
      { sessionMode: SessionMode.MIXICANO, includePausedPlayers: true },
    );

    expect(busy.playersByUserId.get("P14")?.matchType.opportunities)
      .toEqual(ordinary.playersByUserId.get("P14")?.matchType.opportunities);
    expect(busy.playersByUserId.size).toBe(ordinary.playersByUserId.size);
  });

  it("uses side-label symmetric fixed scenarios without duplicating mirrored catalogs", () => {
    const scenario = getSocialGeneralizationScenario("fixed-14-8-6-2c");
    const roster = getSocialGeneralizationStructuralRoster(scenario, 0);
    const mirrored: SocialGeneralizationStructuralPlayer[] = roster.map((player) => ({
      ...player,
      side: player.side === "UPPER" ? "LOWER" : "UPPER",
    }));

    const originalContext = buildSocialVarietyContext(playersForRoster(roster), [], {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const mirroredContext = buildSocialVarietyContext(playersForRoster(mirrored), [], {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    for (const player of roster) {
      expect([...originalContext.playersByUserId.get(player.userId)!.matchType.opportunities].sort())
        .toEqual([...mirroredContext.playersByUserId.get(player.userId)!.matchType.opportunities].sort());
    }
  });

  it("preserves selected layouts and C/T metrics when a seeded 6/2 roster is mirrored", () => {
    const players = makeSkewedPlayers(false);
    const mirroredPlayers = makeSkewedPlayers(true);
    const history = makeSkewedHistory(players);
    const mirroredHistory = makeSkewedHistory(mirroredPlayers);

    for (let index = 0; index < history.length; index += 1) {
      const originalSnapshot = history[index].socialVariety!;
      const mirroredSnapshot = mirroredHistory[index].socialVariety!;
      const flip = (side: "UPPER" | "LOWER" | null) =>
        side === "UPPER" ? "LOWER" : side === "LOWER" ? "UPPER" : null;
      expect(mirroredSnapshot.effectiveSideByUserId).toEqual(
        Object.fromEntries(Object.entries(originalSnapshot.effectiveSideByUserId)
          .map(([userId, side]) => [userId, flip(side)])),
      );
      expect(mirroredSnapshot.courtType).toBe(
        originalSnapshot.courtType === "UPPER" ? "LOWER"
          : originalSnapshot.courtType === "LOWER" ? "UPPER"
            : originalSnapshot.courtType,
      );
    }

    for (const policy of [null, "courtmate-beneficial-rescue"] as const) {
      const run = (roster: MatchmakerV3Player[], completedMatches: SocialHistoryMatch[]) =>
        findBestRotationBatchSelection(roster, {
          courtCount: 2,
          sessionMode: SessionMode.MIXICANO,
          sessionType: SessionType.SOCIAL_MIX,
          completedMatches,
          randomFn: seededRandom(0x51de1234),
          ...(policy ? { socialPriorityPolicy: policy } : {}),
        });
      const originalResult = run(players, history);
      const mirroredResult = run(mirroredPlayers, mirroredHistory);

      expect(originalResult.selection).not.toBeNull();
      expect(mirroredResult.selection).not.toBeNull();
      expect(canonicalLayout(mirroredResult)).toEqual(canonicalLayout(originalResult));

      const originalMetrics = getChosenSocialMetrics(players, history, originalResult);
      const mirroredMetrics = getChosenSocialMetrics(mirroredPlayers, mirroredHistory, mirroredResult);
      expect(mirroredMetrics).toEqual(originalMetrics);

      if (policy) {
        expect(originalResult.chosenNewCourtmatePairCount).toBe(originalMetrics.courtmatePairs);
        expect(mirroredResult.chosenNewCourtmatePairCount).toBe(mirroredMetrics.courtmatePairs);
        expect(originalResult.chosenRollingMatchTypeGain).toBe(originalMetrics.rollingTypeGain);
        expect(mirroredResult.chosenRollingMatchTypeGain).toBe(mirroredMetrics.rollingTypeGain);
      }
    }
  });

  it("rejects invalid checkpoint counts and unknown scenario ids", () => {
    expect(() => getSocialGeneralizationScenario("missing")).toThrow(/Unknown Social generalization scenario/);
    const scenario = getSocialGeneralizationScenario("fixed-14-7-7-2c");
    expect(() => getSocialGeneralizationStructuralRoster(scenario, -1)).toThrow(RangeError);
    expect(() => getSocialGeneralizationStructuralRoster(scenario, 1.5)).toThrow(RangeError);
  });
});
