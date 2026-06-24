import { describe, expect, it } from "vitest";

import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import { findBestSingleCourtSelectionLadder } from "./singleCourt";
import { buildLadderGroupingSummary } from "./ladderGrouping";
import { buildRestSummary, compareSingleCourtSelections } from "./scoring";
import type {
  ActiveMatchmakerLadderPlayer,
  LadderSingleCourtSelection,
  MatchmakerLadderPlayer,
} from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerLadderPlayer> = {}
): MatchmakerLadderPlayer {
  const wins = overrides.wins ?? 0;
  const losses = overrides.losses ?? 0;

  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    wins,
    losses,
    pointDiff: 0,
    ladderScore: overrides.ladderScore ?? wins - losses,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    isBusy: false,
    isPaused: false,
    ...overrides,
  };
}

describe("ladder single-court selection", () => {
  it("includes an arrival-priority late player before normal ladder grouping", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 5,
      }),
      createPlayer("B", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 4,
      }),
      createPlayer("C", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 3,
      }),
      createPlayer("D", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 2,
      }),
      createPlayer("E", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 1,
      }),
      createPlayer("F", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
        ladderScore: 0,
      }),
      createPlayer("Late", {
        matchesPlayed: 0,
        matchmakingBaseline: 4,
        availableSince: new Date("2026-03-18T00:59:00Z"),
        arrivalPriorityAt: new Date("2026-03-18T00:58:00Z"),
        ladderScore: -5,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toContain("Late");
  });

  it("prefers closer ladder-score quartets inside the fair pool", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 5,
        wins: 3,
        losses: 0,
        ladderScore: 3,
        pointDiff: 20,
      }),
      createPlayer("B", {
        matchesPlayed: 5,
        wins: 2,
        losses: 0,
        ladderScore: 2,
        pointDiff: 11,
      }),
      createPlayer("C", {
        matchesPlayed: 5,
        wins: 2,
        losses: 1,
        ladderScore: 1,
        pointDiff: 5,
      }),
      createPlayer("D", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        ladderScore: 0,
        pointDiff: 1,
      }),
      createPlayer("E", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        ladderScore: -2,
        pointDiff: -8,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(result.selection?.groupingSummary.maxLadderGap).toBe(3);
  });

  it("uses point difference as a refinement when ladder scores are equally close", () => {
    const players = [
      createPlayer("A", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 7 }),
      createPlayer("B", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 6 }),
      createPlayer("C", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 5 }),
      createPlayer("D", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 4 }),
      createPlayer("E", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: 20 }),
      createPlayer("F", { matchesPlayed: 4, wins: 1, losses: 1, pointDiff: -9 }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
  });

  it("prefers A+D vs B+C for race-style quartets when point diff breaks the score tie", () => {
    const players = [
      createPlayer("A", { matchesPlayed: 5, ladderScore: 6, pointDiff: 3 }),
      createPlayer("B", { matchesPlayed: 5, ladderScore: 6, pointDiff: 1 }),
      createPlayer("C", { matchesPlayed: 5, ladderScore: 3, pointDiff: -2 }),
      createPlayer("D", { matchesPlayed: 5, ladderScore: 0, pointDiff: -27 }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(result.selection?.partition).toEqual({
      team1: ["A", "D"],
      team2: ["B", "C"],
    });
    expect(result.selection?.balanceGap).toBe(3);
    expect(result.selection?.pointDiffGap).toBe(11.5);
  });

  it("does not let higher rest turns override a cleaner ladder grouping inside one fairness band", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 4,
        restTurns: 0,
      }),
      createPlayer("B", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 3,
        restTurns: 0,
      }),
      createPlayer("C", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 2,
        restTurns: 0,
      }),
      createPlayer("D", {
        matchesPlayed: 5,
        wins: 1,
        losses: 1,
        pointDiff: 1,
        restTurns: 0,
      }),
      createPlayer("E", {
        matchesPlayed: 5,
        wins: 3,
        losses: 1,
        pointDiff: 11,
        restTurns: 3,
      }),
      createPlayer("F", {
        matchesPlayed: 5,
        wins: 0,
        losses: 2,
        pointDiff: -9,
        restTurns: 3,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(result.selection?.groupingSummary.maxLadderGap).toBe(0);
  });

  it("ignores rest-turn preference in ladder when player rest is disabled", () => {
    const createSelection = (
      userIds: [string, string, string, string],
      restTurns: number[],
      randomScore: number
    ): LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer> => {
      const players = userIds.map((userId, index) =>
        ({
          userId,
          matchesPlayed: 5,
          matchmakingBaseline: 5,
          availableSince: new Date("2026-03-18T00:00:00Z"),
          strength: 1000,
          wins: 1,
          losses: 1,
          pointDiff: 0,
          ladderScore: 0,
          gender: PlayerGender.MALE,
          partnerPreference: PartnerPreference.OPEN,
          isBusy: false,
          isPaused: false,
          effectiveMatchCount: 5,
          restTurns: restTurns[index],
          needsMoreRest: false,
          moreRestTarget: 1,
          moreRestDeficit: 0,
          randomScore,
          rank: index,
        }) satisfies ActiveMatchmakerLadderPlayer
      ) as [
        ActiveMatchmakerLadderPlayer,
        ActiveMatchmakerLadderPlayer,
        ActiveMatchmakerLadderPlayer,
        ActiveMatchmakerLadderPlayer,
      ];

      return {
        ids: userIds,
        players,
        partition: {
          team1: [userIds[0], userIds[3]],
          team2: [userIds[1], userIds[2]],
        },
        restSummary: buildRestSummary(players),
        groupingSummary: buildLadderGroupingSummary(players),
        balanceGap: 0,
        pointDiffGap: 0,
        strengthGap: 0,
        randomScore,
      };
    };

    const lowerRest = createSelection(
      ["A", "B", "C", "D"],
      [0, 0, 0, 0],
      0
    );
    const higherRest = createSelection(
      ["E", "F", "G", "H"],
      [3, 3, 3, 3],
      1
    );

    expect(
      compareSingleCourtSelections(
        higherRest,
        lowerRest,
        SessionMode.MEXICANO
      )
    ).toBeLessThan(0);

    expect(
      compareSingleCourtSelections(
        lowerRest,
        higherRest,
        SessionMode.MEXICANO,
        { respectPlayerRest: false }
      )
    ).toBeLessThan(0);
  });

  it("returns no selection when fewer than four active players are available", () => {
    const players = [
      createPlayer("A"),
      createPlayer("B"),
      createPlayer("C", { isPaused: true }),
      createPlayer("D", { isBusy: true }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).toBeNull();
  });

  it("respects Mixed validity when selecting a ladder match", () => {
    const players = [
      createPlayer("M1", {
        matchesPlayed: 4,
        wins: 2,
        losses: 1,
        pointDiff: 9,
        gender: PlayerGender.MALE,
      }),
      createPlayer("M2", {
        matchesPlayed: 4,
        wins: 2,
        losses: 1,
        pointDiff: 7,
        gender: PlayerGender.MALE,
      }),
      createPlayer("F1", {
        matchesPlayed: 4,
        wins: 1,
        losses: 1,
        pointDiff: 4,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("F2", {
        matchesPlayed: 4,
        wins: 1,
        losses: 1,
        pointDiff: 3,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.partition).toEqual({
      team1: ["M1", "F2"],
      team2: ["M2", "F1"],
    });
  });

  it("widens for mixed feasibility when the lowest band has four players but no legal quartet", () => {
    const players = [
      createPlayer("LowM1", {
        matchesPlayed: 2,
        wins: 1,
        losses: 0,
        pointDiff: 3,
        ladderScore: 1,
        gender: PlayerGender.MALE,
      }),
      createPlayer("LowM2", {
        matchesPlayed: 2,
        wins: 1,
        losses: 0,
        pointDiff: 2,
        ladderScore: 1,
        gender: PlayerGender.MALE,
      }),
      createPlayer("LowM3", {
        matchesPlayed: 2,
        wins: 1,
        losses: 0,
        pointDiff: 1,
        ladderScore: 1,
        gender: PlayerGender.MALE,
      }),
      createPlayer("LowF1", {
        matchesPlayed: 2,
        wins: 1,
        losses: 0,
        pointDiff: 0,
        ladderScore: 1,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("HighF2", {
        matchesPlayed: 3,
        wins: 1,
        losses: 1,
        pointDiff: 0,
        ladderScore: 0,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("HighM4", {
        matchesPlayed: 3,
        wins: 4,
        losses: 0,
        pointDiff: 12,
        ladderScore: 4,
        gender: PlayerGender.MALE,
      }),
      createPlayer("HighM5", {
        matchesPlayed: 3,
        wins: 4,
        losses: 0,
        pointDiff: 11,
        ladderScore: 4,
        gender: PlayerGender.MALE,
      }),
      createPlayer("HighM6", {
        matchesPlayed: 3,
        wins: 4,
        losses: 0,
        pointDiff: 10,
        ladderScore: 4,
        gender: PlayerGender.MALE,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.includedBandValues).toEqual([2, 3]);
    expect(
      result.selection?.players.filter((player) => player.matchesPlayed === 2).length
    ).toBe(3);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.FEMALE
      ).length
    ).toBe(2);
  });

  it("prefers a same-gender court over a mixed court when ladder grouping is otherwise tied", () => {
    const players = [
      createPlayer("M1"),
      createPlayer("F1", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("M2"),
      createPlayer("F2", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("M3"),
      createPlayer("F3", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createPlayer("M4"),
      createPlayer("F4", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];

    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
    });

    expect(result.selection).not.toBeNull();
    expect(
      new Set(result.selection?.players.map((player) => player.gender))
    ).toHaveLength(1);
  });
});
