import { describe, expect, it } from "vitest";

import { SessionMode } from "../../types/enums";

import {
  buildRotationHistory,
  evaluateBestPartition,
  findBestQuartetInFairnessWindow,
  findBestFallbackQuartet,
  getPartitionKey,
  scorePartitionDetailed,
  scorePartition,
  type PartitionCandidate,
} from "./partitioning";

function createPlayers(ids: string[]): Map<string, PartitionCandidate> {
  return new Map(
    ids.map((id) => [
      id,
      {
        userId: id,
        elo: 1000,
        lastPartnerId: null,
        gender: "MALE",
        partnerPreference: "OPEN",
      },
    ])
  );
}

describe("partitioning", () => {
  it("avoids repeating the exact same opponent layout when alternatives are equal", () => {
    const playersById = createPlayers(["A", "B", "C", "D"]);
    const rotationHistory = buildRotationHistory([
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "C",
        team2User2Id: "D",
      },
    ]);

    const evaluation = evaluateBestPartition(
      ["A", "B", "C", "D"],
      playersById,
      SessionMode.MEXICANO,
      rotationHistory
    );

    expect(evaluation?.partition).toEqual({
      team1: ["A", "C"],
      team2: ["B", "D"],
    });
  });

  it("weights balance ahead of mild recent-history variety penalties", () => {
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 1500, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 1300, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1490, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1310, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);
    const rotationHistory = buildRotationHistory([
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "C",
        team2User2Id: "D",
      },
    ]);

    const balancedRepeat = scorePartitionDetailed(
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      rotationHistory
    );
    const freshButImbalanced = scorePartitionDetailed(
      {
        team1: ["A", "C"],
        team2: ["B", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      rotationHistory
    );

    expect(balancedRepeat).not.toBeNull();
    expect(freshButImbalanced).not.toBeNull();
    expect(balancedRepeat!.teamEloGap).toBe(0);
    expect(freshButImbalanced!.teamEloGap).toBe(190);
    expect(balancedRepeat!.totalScore).toBeLessThan(freshButImbalanced!.totalScore);
  });

  it("adds extra rotation cost for a previously seen quartet", () => {
    const playersById = createPlayers(["A", "B", "C", "D", "E", "F"]);
    const rotationHistory = buildRotationHistory([
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "E",
        team2User2Id: "F",
      },
    ]);

    const repeatedQuartetScore = scorePartition(
      {
        team1: ["A", "B"],
        team2: ["E", "F"],
      },
      playersById,
      SessionMode.MEXICANO,
      rotationHistory
    );
    const freshQuartetScore = scorePartition(
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      rotationHistory
    );

    expect(rotationHistory.podCounts.get("A|B|E|F")).toBe(1);
    expect(repeatedQuartetScore).not.toBeNull();
    expect(freshQuartetScore).not.toBeNull();
    expect(repeatedQuartetScore!).toBeGreaterThan(freshQuartetScore!);
  });

  it("limits variety penalties to recent history instead of the whole session", () => {
    const staleMatch = {
      team1User1Id: "A",
      team1User2Id: "B",
      team2User1Id: "C",
      team2User2Id: "D",
      completedAt: new Date("2026-03-01T00:00:00Z"),
    };
    const recentMatches = Array.from({ length: 24 }, (_, index) => ({
      team1User1Id: `R${index}_1`,
      team1User2Id: `R${index}_2`,
      team2User1Id: `R${index}_3`,
      team2User2Id: `R${index}_4`,
      completedAt: new Date(`2026-03-0${2 + Math.floor(index / 4)}T0${index % 10}:00:00Z`),
    }));

    const rotationHistory = buildRotationHistory([staleMatch, ...recentMatches]);

    expect(rotationHistory.podCounts.has("A|B|C|D")).toBe(false);
  });

  it("can replace part of the baseline quartet when a nearby fairness window produces a much better balance", () => {
    const rankedCandidates = [
      { userId: "A" },
      { userId: "B" },
      { userId: "C" },
      { userId: "D" },
      { userId: "E" },
      { userId: "F" },
      { userId: "G" },
      { userId: "H" },
    ];
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 1500, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 1490, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1480, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1000, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["E", { userId: "E", elo: 1010, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["F", { userId: "F", elo: 990, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["G", { userId: "G", elo: 980, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["H", { userId: "H", elo: 970, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);

    const selection = findBestQuartetInFairnessWindow(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      buildRotationHistory([]),
      {
        baselineIds: ["A", "B", "C", "D"],
        fairnessSlack: 4,
        maxCandidates: 8,
      }
    );

    expect(selection?.ids).toEqual(["A", "B", "D", "E"]);
    expect(selection?.partition).toEqual({
      team1: ["A", "D"],
      team2: ["B", "E"],
    });
  });

  it("preserves the anti-bubble cap when searching a wider fairness window", () => {
    const rankedCandidates = [
      { userId: "L1" },
      { userId: "L2" },
      { userId: "L3" },
      { userId: "L4" },
      { userId: "O1" },
      { userId: "O2" },
      { userId: "O3" },
      { userId: "O4" },
    ];
    const playersById = new Map<string, PartitionCandidate>([
      ["L1", { userId: "L1", elo: 1000, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L2", { userId: "L2", elo: 1000, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L3", { userId: "L3", elo: 1000, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L4", { userId: "L4", elo: 1000, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O1", { userId: "O1", elo: 1500, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O2", { userId: "O2", elo: 1490, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O3", { userId: "O3", elo: 1480, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O4", { userId: "O4", elo: 1470, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);

    const selection = findBestQuartetInFairnessWindow(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      buildRotationHistory([]),
      {
        baselineIds: ["L1", "O1", "O2", "O3"],
        fairnessSlack: 8,
        lowestCohortUserIds: new Set(["L1", "L2", "L3", "L4"]),
        maxLowestCohortPlayers: 1,
        maxCandidates: 8,
      }
    );

    expect(selection).not.toBeNull();
    expect(selection!.ids.filter((id) => id.startsWith("L")).length).toBeLessThanOrEqual(1);
  });

  it("can exclude the previous pairing when reshuffling the same quartet", () => {
    const playersById = createPlayers(["A", "B", "C", "D"]);
    const rotationHistory = buildRotationHistory([]);

    const originalPartition = {
      team1: ["A", "B"] as [string, string],
      team2: ["C", "D"] as [string, string],
    };

    const evaluation = evaluateBestPartition(
      ["A", "B", "C", "D"],
      playersById,
      SessionMode.MEXICANO,
      rotationHistory,
      {
        excludedPartitionKey: getPartitionKey(originalPartition),
      }
    );

    expect(evaluation).not.toBeNull();
    expect(getPartitionKey(evaluation!.partition)).not.toBe(
      getPartitionKey(originalPartition)
    );
  });

  it("can exclude the previous quartet when searching for a reshuffle fallback", () => {
    const rankedCandidates = [
      { userId: "A" },
      { userId: "B" },
      { userId: "C" },
      { userId: "D" },
      { userId: "E" },
      { userId: "F" },
    ];
    const playersById = createPlayers(["A", "B", "C", "D", "E", "F"]);

    const selection = findBestFallbackQuartet(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      buildRotationHistory([]),
      6,
      "A|B|C|D"
    );

    expect(selection).not.toBeNull();
    expect(selection!.ids.sort()).not.toEqual(["A", "B", "C", "D"]);
  });
});
