import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../types/enums";

import {
  buildRotationHistory,
  evaluateBestPartition,
  findAlternativeQuartetForReshuffle,
  findBestQuartetInFairnessWindow,
  findBestFallbackQuartet,
  getPartitionKey,
  getQuartetKey,
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
        pointDiff: 0,
        lastPartnerId: null,
        gender: "MALE",
        partnerPreference: "OPEN",
      },
    ])
  );
}

describe("partitioning", () => {
  it("avoids repeating the exact same team-vs-team partition when an equal-balance alternative exists", () => {
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
      SessionType.ELO,
      rotationHistory
    );

    expect(evaluation?.partition).toEqual({
      team1: ["A", "C"],
      team2: ["B", "D"],
    });
  });

  it("keeps the better-balanced partition even when it was seen recently", () => {
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 1500, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 1300, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1490, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1310, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
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
      SessionType.ELO,
      rotationHistory
    );
    const freshButImbalanced = scorePartitionDetailed(
      {
        team1: ["A", "C"],
        team2: ["B", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );

    expect(balancedRepeat).not.toBeNull();
    expect(freshButImbalanced).not.toBeNull();
    expect(balancedRepeat!.teamBalanceGap).toBe(0);
    expect(freshButImbalanced!.teamBalanceGap).toBe(190);
    expect(balancedRepeat!.exactPartitionPenalty).toBeGreaterThan(0);
    expect(freshButImbalanced!.exactPartitionPenalty).toBe(0);
    expect(balancedRepeat!.totalScore).toBeLessThan(
      freshButImbalanced!.totalScore
    );
  });

  it("prefers a non-repeated partition when the Elo gap difference is within tolerance", () => {
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 1410, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 1390, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1400, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1400, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);
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
      SessionType.ELO,
      rotationHistory
    );

    expect(evaluation?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(evaluation?.score).toBe(10);
    expect(evaluation?.exactPartitionPenalty).toBe(0);
  });

  it("does not penalize repeat partners when the opposing team changes", () => {
    const playersById = createPlayers(["A", "B", "C", "D", "E", "F"]);
    const rotationHistory = buildRotationHistory([
      {
        team1User1Id: "A",
        team1User2Id: "B",
        team2User1Id: "E",
        team2User2Id: "F",
      },
    ]);

    const samePartnersDifferentOpponentsScore = scorePartition(
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );
    const freshPartnershipScore = scorePartition(
      {
        team1: ["A", "C"],
        team2: ["B", "D"],
      },
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );

    expect(rotationHistory.podCounts.get("A|B|E|F")).toBe(1);
    expect(samePartnersDifferentOpponentsScore).not.toBeNull();
    expect(freshPartnershipScore).not.toBeNull();
    expect(samePartnersDifferentOpponentsScore!).toBe(
      freshPartnershipScore!
    );
  });

  it("only looks back 8 completed matches for exact partition penalties", () => {
    const staleExactMatch = {
      team1User1Id: "A",
      team1User2Id: "B",
      team2User1Id: "C",
      team2User2Id: "D",
      completedAt: new Date("2026-03-01T00:00:00Z"),
    };
    const recentMatches = Array.from({ length: 8 }, (_, index) => ({
      team1User1Id: `R${index}_1`,
      team1User2Id: `R${index}_2`,
      team2User1Id: `R${index}_3`,
      team2User2Id: `R${index}_4`,
      completedAt: new Date(`2026-03-0${2 + index}T00:00:00Z`),
    }));

    const rotationHistory = buildRotationHistory([staleExactMatch, ...recentMatches]);
    const score = scorePartitionDetailed(
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
      },
      createPlayers(["A", "B", "C", "D"]),
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );

    expect(rotationHistory.exactPartitionCounts.has("A|B||C|D")).toBe(false);
    expect(score?.exactPartitionPenalty).toBe(0);
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
      ["A", { userId: "A", elo: 1500, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 1490, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1480, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1000, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["E", { userId: "E", elo: 1010, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["F", { userId: "F", elo: 990, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["G", { userId: "G", elo: 980, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["H", { userId: "H", elo: 970, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);

    const selection = findBestQuartetInFairnessWindow(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
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
      ["L1", { userId: "L1", elo: 1000, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L2", { userId: "L2", elo: 1000, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L3", { userId: "L3", elo: 1000, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["L4", { userId: "L4", elo: 1000, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O1", { userId: "O1", elo: 1500, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O2", { userId: "O2", elo: 1490, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O3", { userId: "O3", elo: 1480, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["O4", { userId: "O4", elo: 1470, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);

    const selection = findBestQuartetInFairnessWindow(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
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
      SessionType.ELO,
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
      SessionType.ELO,
      buildRotationHistory([]),
      6,
      "A|B|C|D"
    );

    expect(selection).not.toBeNull();
    expect(selection!.ids.sort()).not.toEqual(["A", "B", "C", "D"]);
  });

  it("prefers a different quartet on reshuffle even when most of the same players remain", () => {
    const rankedCandidates = [
      { userId: "A" },
      { userId: "B" },
      { userId: "C" },
      { userId: "D" },
      { userId: "E" },
    ];
    const playersById = createPlayers(["A", "B", "C", "D", "E"]);

    const selection = findAlternativeQuartetForReshuffle(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      buildRotationHistory([]),
      {
        baselineIds: ["A", "B", "C", "D"],
        fairnessSlack: 4,
        maxCandidates: 5,
        excludedQuartetKey: "A|B|C|D",
      }
    );

    expect(selection).not.toBeNull();
    expect(getQuartetKey(selection!.ids)).toBe("A|B|C|E");
  });

  it("uses point difference as a tie-breaker in points sessions", () => {
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 6, pointDiff: 12, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["B", { userId: "B", elo: 6, pointDiff: 10, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 6, pointDiff: -11, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 6, pointDiff: -9, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
    ]);

    const evaluation = evaluateBestPartition(
      ["A", "B", "C", "D"],
      playersById,
      SessionMode.MEXICANO,
      SessionType.POINTS,
      buildRotationHistory([])
    );

    expect(evaluation?.partition).toEqual({
      team1: ["A", "C"],
      team2: ["B", "D"],
    });
    expect(evaluation?.score).toBe(0);
    expect(evaluation?.pointDiffGap).toBe(0);
  });
});
