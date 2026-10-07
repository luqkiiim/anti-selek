import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import {
  compareCourtmateBeneficialRescuePrimary,
  findBestRotationBatchSelection,
  isCourtmateBeneficialRescueAdmissible,
} from "./socialBatch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import type { MatchmakerV3Player, SocialHistoryMatch } from "./types";

type MatchType = "MIXED" | "OWN_SIDE";
type HistoryFixture = readonly [readonly number[], MatchType];

const makePlayers = (): MatchmakerV3Player[] => Array.from({ length: 8 }, (_, index) => {
  const upper = index < 4;
  return {
    userId: `P${index}`,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00.000Z"),
    strength: 1000,
    gender: upper ? "FEMALE" : "MALE",
    partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
    mixedSideOverride: upper ? "UPPER" : "LOWER",
    restTurns: 1,
  };
});

function completedHistory(fixtures: readonly HistoryFixture[]): SocialHistoryMatch[] {
  return fixtures.map(([indexes, type], index) => {
    const upper = indexes.filter((player) => player < 4).map((player) => `P${player}`);
    const lower = indexes.filter((player) => player >= 4).map((player) => `P${player}`);
    const teams = type === "MIXED"
      ? [[upper[0], lower[0]], [upper[1], lower[1]]]
      : [[...indexes.slice(0, 2).map((player) => `P${player}`)],
        [...indexes.slice(2, 4).map((player) => `P${player}`)]];
    return {
      id: `completed-${index + 1}`,
      team1: teams[0] as [string, string],
      team2: teams[1] as [string, string],
    };
  });
}

const policyOptions = {
  courtCount: 2,
  sessionMode: SessionMode.MIXICANO,
  sessionType: SessionType.SOCIAL_MIX,
  socialPriorityPolicy: "courtmate-beneficial-rescue" as const,
  randomFn: () => 0,
};

describe("courtmate-beneficial-rescue policy", () => {
  it.each([
    ["A admits a strict positive rescue", 6, 0, 5, 1, true],
    ["B rejects a rescue tied with the full-gain frontier", 6, 1, 5, 1, false],
    ["C rejects a zero-benefit rescue", 6, 0, 5, 0, false],
    ["D admits recovery from a negative full-gain result", 6, -1, 5, 0, true],
  ] as const)("%s", (_label, maximumGain, bestFullGainT, candidateGain, candidateT, expected) => {
    expect(isCourtmateBeneficialRescueAdmissible(
      candidateGain,
      maximumGain,
      BigInt(candidateT),
      BigInt(bestFullGainT)
    )).toBe(expected);
  });

  it("admits full gain, rejects a two-pair deficit, and applies the strict threshold with exact units", () => {
    expect(isCourtmateBeneficialRescueAdmissible(6, 6, BigInt(-100), BigInt(100))).toBe(true);
    expect(isCourtmateBeneficialRescueAdmissible(4, 6, BigInt(1000), BigInt(-1000))).toBe(false);
    expect(isCourtmateBeneficialRescueAdmissible(5, 6, BigInt(1000000000000001), BigInt(1000000000000000))).toBe(true);
    expect(isCourtmateBeneficialRescueAdmissible(5, 6, BigInt(1000000000000000), BigInt(1000000000000000))).toBe(false);
  });

  it("prefers higher T first and raw courtmate gain when T ties", () => {
    expect(compareCourtmateBeneficialRescuePrimary(BigInt(2), 4, BigInt(1), 6)).toBe(-1);
    expect(compareCourtmateBeneficialRescuePrimary(BigInt(1), 6, BigInt(1), 5)).toBe(-1);
    expect(compareCourtmateBeneficialRescuePrimary(BigInt(1), 6, BigInt(1), 6)).toBe(0);
  });

  it("selects a one-pair concession only when its signed rolling T exceeds every Gmax option", () => {
    const players = makePlayers();
    const history = completedHistory([
      [[0, 1, 2, 3], "OWN_SIDE"],
      [[2, 3, 5, 7], "MIXED"],
      [[1, 2, 5, 6], "MIXED"],
      [[1, 3, 5, 6], "MIXED"],
      [[1, 3, 4, 5], "MIXED"],
      [[0, 1, 4, 5], "MIXED"],
      [[0, 2, 5, 7], "MIXED"],
      [[2, 3, 4, 7], "MIXED"],
    ]);
    const result = findBestRotationBatchSelection(players, {
      ...policyOptions,
      completedMatches: history,
    });

    expect(result.priorityCertified).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    expect(result.courtmateGainMaximum).toBe(3);
    expect(result.chosenCourtmateGainDeficit).toBe(1);
    expect(result.chosenRollingMatchTypeGain).toBeGreaterThan(result.bestRollingMatchTypeGainAtGmax!);
  });

  it("rejects a one-pair candidate tied on T so raw courtmate gain is retained", () => {
    const players = makePlayers();
    const history = completedHistory([
      [[2, 3, 4, 7], "MIXED"],
      [[0, 1, 2, 3], "OWN_SIDE"],
      [[1, 2, 4, 5], "MIXED"],
      [[0, 3, 5, 6], "MIXED"],
    ]);
    const result = findBestRotationBatchSelection(players, {
      ...policyOptions,
      completedMatches: history,
    });

    expect(result.priorityCertified).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    expect(result.chosenCourtmateGainDeficit).toBe(0);
    expect(result.chosenRollingMatchTypeGain).toBe(result.bestRollingMatchTypeGainAtGmax);
  });

  it("allows a zero-T batch to recover from a negative full-Gmax frontier", () => {
    const players = makePlayers();
    const history = completedHistory([
      [[0, 2, 5, 7], "MIXED"],
      [[0, 2, 6, 7], "MIXED"],
      [[4, 5, 6, 7], "OWN_SIDE"],
      [[0, 1, 2, 3], "OWN_SIDE"],
      [[0, 3, 4, 5], "MIXED"],
      [[0, 1, 4, 6], "MIXED"],
      [[2, 3, 5, 6], "MIXED"],
      [[0, 3, 4, 6], "MIXED"],
      [[1, 2, 5, 7], "MIXED"],
      [[0, 3, 6, 7], "MIXED"],
      [[0, 3, 4, 6], "MIXED"],
    ]);
    const result = findBestRotationBatchSelection(players, {
      ...policyOptions,
      completedMatches: history,
    });

    expect(result.priorityCertified).toBe(true);
    expect(result.chosenCourtmateGainDeficit).toBe(1);
    expect(result.bestRollingMatchTypeGainAtGmax).toBeLessThan(0);
    expect(result.chosenRollingMatchTypeGain).toBe(0);
  });

  it("does not certify either frontier pass when an explicit search limit stops it", () => {
    const result = findBestRotationBatchSelection(makePlayers(), {
      ...policyOptions,
      searchLimits: { maxBranches: 0 },
    });

    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(false);
    expect(result.priorityCertified).toBe(false);
  });

  it("rejects the opt-in for Balanced sessions", () => {
    expect(() => findBestRotationBatchSelection(makePlayers(), {
      ...policyOptions,
      sessionType: SessionType.POINTS,
    })).toThrow(/only for SOCIAL_MIX/);
  });

  it("forwards schedule and beneficial-priority certificates through the single-court adapter", () => {
    const result = findBestSingleCourtSelectionV3(makePlayers(), {
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      randomFn: () => 0.371,
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.scheduleCertified).toBe(true);
    expect(result.debug.socialPriorityPolicy).toBe("courtmate-beneficial-rescue");
    expect(result.debug.courtmateGainMaximumCertified).toBe(true);
    expect(result.debug.priorityCertified).toBe(true);
    expect(result.debug.chosenNewCourtmatePairCount).not.toBeNull();
    expect(result.debug.chosenRollingMatchTypeGain).not.toBeNull();
  });
});
