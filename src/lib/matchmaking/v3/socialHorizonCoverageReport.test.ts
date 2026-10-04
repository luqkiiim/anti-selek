import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import type { BenchmarkSessionResult } from "./socialCoverageBenchmark";
import { rescoreSocialHorizonHistory } from "./socialHorizonCoverageReport";

const playerIds = Array.from({ length: 14 }, (_value, index) => `P${index + 1}`);

function structuralPairs() {
  const pairs: Record<string, number> = {};
  for (let left = 0; left < playerIds.length; left += 1) {
    for (let right = left + 1; right < playerIds.length; right += 1) {
      pairs[`${playerIds[left]}|${playerIds[right]}`] = 1;
    }
  }
  return { courtmates: pairs, opponents: pairs, partners: pairs };
}

function syntheticSession(): BenchmarkSessionResult {
  const completedHistory = Array.from({ length: 21 }, (_value, index) => ({
    completedMatchNumber: index + 1,
    team1: ["P1", "P2"] as [string, string],
    team2: ["P3", "P4"] as [string, string],
    matchType: index % 2 === 0 ? "MIXED" as const : "OWN_SIDE" as const,
  }));
  const playerMatchCounts = playerIds.map((userId) => ({
    userId,
    matchesPlayed: ["P1", "P2", "P3", "P4"].includes(userId) ? 21 : 0,
  }));
  return {
    profile: "narrow",
    sessionType: SessionType.SOCIAL_MIX,
    seed: 1,
    relationshipOpportunityCounts: structuralPairs(),
    completedHistory,
    checkpoints: {
      "21": {
        completedMatches: 21,
        playerMatchCounts,
        completedMatchTypeCounts: { MIXED: 11, OWN_SIDE: 10 },
      },
    },
  } as unknown as BenchmarkSessionResult;
}

describe("independent social horizon rescore", () => {
  it("uses the full structural denominator and distinct completed court/team relationships", () => {
    const result = rescoreSocialHorizonHistory(syntheticSession(), 21);
    const p1 = result.players.find((player) => player.userId === "P1")!;
    expect(p1.facets.courtmates).toMatchObject({ feasibleCount: 13, denominator: 13, uniqueCount: 3, ratio: 3 / 13 });
    expect(p1.facets.opponents).toMatchObject({ feasibleCount: 13, denominator: 12, uniqueCount: 2, ratio: 2 / 12 });
    expect(p1.facets.partners).toMatchObject({ feasibleCount: 13, denominator: 6, uniqueCount: 1, ratio: 1 / 6 });
    expect(p1.score).toBeCloseTo((3 * (3 / 13) + 2 * (2 / 12) + 1 / 6) / 6, 12);
    expect(result.score).toBeCloseTo(p1.score! * 4 / 14, 12);
    expect(result.averageDistinctCount).toEqual({ courtmates: 12 / 14, opponents: 8 / 14, partners: 4 / 14 });
  });

  it("rejects a tuple stream that is not an exact completed-event prefix", () => {
    const session = syntheticSession();
    session.completedHistory![8].completedMatchNumber = 10;
    expect(() => rescoreSocialHorizonHistory(session, 21)).toThrow(/exact event order/);
  });
});
