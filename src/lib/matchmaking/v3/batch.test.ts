import { describe, expect, it } from "vitest";

import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { findBestBatchSelectionV3 } from "./batch";
import type { MatchmakerV3Player, V3BatchSelection } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerV3Player> = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

function createLowerPlayer(
  userId: string,
  overrides: Partial<MatchmakerV3Player> = {}
) {
  return createPlayer(userId, {
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.FEMALE_FLEX,
    ...overrides,
  });
}

function createSequenceRandom(values: number[]) {
  let index = 0;

  return () => values[index++] ?? 0;
}

function getBatchSelectedIds(selection: V3BatchSelection | null | undefined) {
  return new Set(
    selection?.selections.flatMap((courtSelection) => courtSelection.ids) ?? []
  );
}

function isOneOfTwoForcedQuartets(players: Array<{ userId: string }>) {
  const key = players.map((player) => player.userId).sort().join("|");
  return key === "A|B|C|D" || key === "E|F|G|H";
}

function createPlayers(count: number, prefix = "P") {
  return Array.from({ length: count }, (_, index) =>
    createPlayer(`${prefix}${index + 1}`)
  );
}

function expectLegalMixedBatch(
  selection: V3BatchSelection | null | undefined,
  expectedCourtCount: number
) {
  expect(selection?.selections).toHaveLength(expectedCourtCount);

  const selectedIds =
    selection?.selections.flatMap((courtSelection) => courtSelection.ids) ?? [];
  expect(new Set(selectedIds).size).toBe(expectedCourtCount * 4);

  for (const courtSelection of selection?.selections ?? []) {
    const playersById = new Map(
      courtSelection.players.map((player) => [player.userId, player])
    );
    const lowerCounts = [
      courtSelection.partition.team1,
      courtSelection.partition.team2,
    ].map(
      (team) =>
        team.filter(
          (userId) =>
            getEffectiveMixedSide(playersById.get(userId) ?? {}) ===
            MixedSide.LOWER
        ).length
    );

    expect([
      [0, 0],
      [1, 1],
      [2, 2],
    ]).toContainEqual(lowerCounts);
  }
}

describe("matchmaking v3 batch selection", () => {
  it("considers all 9 available points players for a single court", () => {
    const result = findBestBatchSelectionV3(createPlayers(9), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(9);
    expect(result.debug.consideredCandidateCount).toBe(9);
    expect(result.debug.candidatePlayerIds).toHaveLength(9);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("considers all 20 available points players for a single court", () => {
    const result = findBestBatchSelectionV3(createPlayers(20), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(20);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("retains all 25 fairness-admissible single-court points candidates", () => {
    const result = findBestBatchSelectionV3(createPlayers(25), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(25);
    expect(result.debug.consideredCandidateCount).toBe(25);
    expect(result.debug.candidatePlayerIds).toHaveLength(25);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("considers all 20 available players for two courts", () => {
    const result = findBestBatchSelectionV3(createPlayers(20), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(20);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("retains all 21 fairness-admissible two-court points candidates", () => {
    const result = findBestBatchSelectionV3(createPlayers(21), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(21);
    expect(result.debug.consideredCandidateCount).toBe(21);
    expect(result.debug.candidatePlayerIds).toHaveLength(21);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("considers all 20 available players for three courts", () => {
    const result = findBestBatchSelectionV3(createPlayers(20), {
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(20);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBeNull();
  });

  it(
    "retains all 30 four-court points candidates while bounding global search",
    () => {
      const result = findBestBatchSelectionV3(createPlayers(30), {
        courtCount: 4,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });

      expect(result.debug.availableCandidateCount).toBe(30);
      expect(result.debug.consideredCandidateCount).toBe(30);
      expect(result.debug.candidatePlayerIds).toHaveLength(30);
      expect(result.debug.candidateCap).toBeNull();
    },
    15_000
  );

  it("keeps all fairness-admissible Social candidates without a roster cap", () => {
    const result = findBestBatchSelectionV3(createPlayers(20), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(20);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("rejects an incumbent when the search limit leaves its balance baseline uncertified", () => {
    // Distinct powers of two cannot form a zero-gap court, so an early
    // incumbent cannot certify the universal zero lower bound.
    const roster = createPlayers(12).map((player, index) => ({ ...player, strength: 2 ** index }));
    const result = findBestBatchSelectionV3(roster, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
      searchLimits: {
        maxBranches: 2,
      },
    });

    expect(result.selection).toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.debug.balanceCertified).toBe(false);
    expect(result.debug.failureReason).toBe("SEARCH_LIMIT_REACHED");
  });

  it("does not treat an under-ceiling batch as safe before its near-best baseline is certified", () => {
    const allowedQuartets = new Set([
      "A|B|C|D",
      "E|F|G|H",
      "A|B|E|F",
      "C|D|G|H",
    ]);
    const result = findBestBatchSelectionV3(
      [
        ...["A", "B", "C", "D"].map((id) => createPlayer(id)),
        createPlayer("E", { strength: 1450 }),
        createPlayer("F", { strength: 450 }),
        createPlayer("G", { strength: 1350 }),
        createPlayer("H", { strength: 750 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        selectionConstraints: {
          isQuartetAllowed: (players) =>
            allowedQuartets.has(
              players.map((player) => player.userId).sort().join("|")
            ),
        },
        searchLimits: { maxBranches: 1 },
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.balanceCertified).toBe(false);
    expect(result.debug.failureReason).toBe("SEARCH_LIMIT_REACHED");
  });

  it("keeps the full candidate vocabulary when respectPlayerRest is false", () => {
    const result = findBestBatchSelectionV3(createPlayers(9), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
      respectPlayerRest: false,
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.consideredCandidateCount).toBe(9);
    expect(result.debug.candidateCap).toBeNull();
  });

  it("includes an arrival-priority late player in a legal batch", () => {
    const players = ["A", "B", "C", "D", "E", "F", "G", "H"].map((userId) =>
      createPlayer(userId, {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      })
    );
    players.push(
      createPlayer("Late", {
        matchesPlayed: 0,
        matchmakingBaseline: 4,
        availableSince: new Date("2026-03-18T00:59:00Z"),
        arrivalPriorityAt: new Date("2026-03-18T00:58:00Z"),
      })
    );

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(getBatchSelectedIds(result.selection)).toContain("Late");
  });

  it("uses random tie-breaks instead of insertion order for tied points batches", () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      createPlayer(String.fromCharCode(65 + index), { strength: 0 })
    );

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0,
      ]),
    });

    expect(getBatchSelectedIds(result.selection)).toEqual(
      new Set(["C", "D", "E", "F", "G", "H", "I", "J"])
    );
  });

  it("can produce a different equally fair tied points batch with a different random sequence", () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      createPlayer(String.fromCharCode(65 + index), { strength: 0 })
    );

    const firstResult = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0,
      ]),
    });
    const secondResult = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: createSequenceRandom([
        0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9, 0.8,
      ]),
    });

    expect(getBatchSelectedIds(firstResult.selection)).not.toEqual(
      getBatchSelectedIds(secondResult.selection)
    );
    expect(getBatchSelectedIds(secondResult.selection)).toEqual(
      new Set(["A", "B", "C", "D", "E", "F", "G", "H"])
    );
  });

  it("keeps lower-match-count players ahead of random tied-batch variation", () => {
    const players = [
      ...Array.from({ length: 8 }, (_, index) =>
        createPlayer(String.fromCharCode(65 + index), {
          strength: 0,
          matchesPlayed: 0,
        })
      ),
      createPlayer("I", { strength: 0, matchesPlayed: 1 }),
      createPlayer("J", { strength: 0, matchesPlayed: 1 }),
    ];

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0, 0.1,
      ]),
    });

    expect(getBatchSelectedIds(result.selection)).toEqual(
      new Set(["A", "B", "C", "D", "E", "F", "G", "H"])
    );
  });

  it("builds a full global batch containing all lower-band players without implicit anchors", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", { matchesPlayed: 4 }),
        createPlayer("D", { matchesPlayed: 4 }),
        createPlayer("E", { matchesPlayed: 4 }),
        createPlayer("F", { matchesPlayed: 4 }),
        createPlayer("G", {
          matchesPlayed: 5,
          restTurns: 3,
        }),
        createPlayer("H", {
          matchesPlayed: 5,
          restTurns: 2,
        }),
        createPlayer("I", {
          matchesPlayed: 5,
          restTurns: 1,
        }),
        createPlayer("J", {
          matchesPlayed: 5,
          restTurns: 1,
        }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.debug.lockedPlayerIds).toEqual([]);
    expect(
      new Set(result.selection?.selections.flatMap((selection) => selection.ids))
    ).toEqual(new Set(["A", "B", "C", "D", "E", "F", "G", "H"]));
  });

  it("prefers fresh partners across the batch when Elo balance stays close", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 1600 }),
        createPlayer("B", { strength: 1400 }),
        createPlayer("C", { strength: 1580 }),
        createPlayer("D", { strength: 1420 }),
        createPlayer("E", { strength: 1300 }),
        createPlayer("F", { strength: 1100 }),
        createPlayer("G", { strength: 1280 }),
        createPlayer("H", { strength: 1120 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["X", "Y"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["U", "V"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    const teamKeys = new Set(
      result.selection?.selections.flatMap((selection) => [
        [...selection.partition.team1].sort().join("|"),
        [...selection.partition.team2].sort().join("|"),
      ])
    );

    expect(teamKeys).not.toContain("A|B");
    expect(teamKeys).not.toContain("E|F");
  });

  it("avoids repeating whole court groups when social mix can create fresher batches", () => {
    const result = findBestBatchSelectionV3(
      Array.from({ length: 8 }, (_, index) =>
        createPlayer(String.fromCharCode(65 + index), { strength: 1000 })
      ),
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["G", "H"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    const quartetKeys = new Set(
      result.selection?.selections.map((selection) =>
        [...selection.ids].sort().join("|")
      )
    );

    expect(quartetKeys).not.toContain("A|B|C|D");
    expect(quartetKeys).not.toContain("E|F|G|H");
  });

  it("varies whole court groups in Points batches inside their balance envelope", () => {
    const result = findBestBatchSelectionV3(
      Array.from({ length: 10 }, (_, index) =>
        createPlayer(String.fromCharCode(65 + index), { strength: 1000 })
      ),
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["G", "H"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect([...getBatchSelectedIds(result.selection)]).toEqual(
      expect.arrayContaining(["I", "J"])
    );
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBeLessThan(12);
  });

  it("chooses fresher Elo batch variety inside the rating balance window", () => {
    const result = findBestBatchSelectionV3(
      [
        ...Array.from({ length: 8 }, (_, index) =>
          createPlayer(String.fromCharCode(65 + index), { strength: 1000 })
        ),
        createPlayer("I", { strength: 1060 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["G", "H"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(getBatchSelectedIds(result.selection)).toContain("I");
    expect(result.selection?.maxBalanceGap).toBeLessThanOrEqual(50);
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBeLessThan(12);
  });

  it("rejects fresher Elo batch variety outside the rating balance window", () => {
    const result = findBestBatchSelectionV3(
      [
        ...Array.from({ length: 8 }, (_, index) =>
          createPlayer(String.fromCharCode(65 + index), { strength: 1000 })
        ),
        createPlayer("I", { strength: 1102 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["E", "F"],
            team2: ["G", "H"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(getBatchSelectedIds(result.selection)).not.toContain("I");
    expect(result.selection?.maxBalanceGap).toBe(0);
  });

  it("retains a middle split for entropy within the rating ceiling and near-best window", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 1113 }),
        createPlayer("B", { strength: 1052 }),
        createPlayer("C", { strength: 1029 }),
        createPlayer("D", { strength: 1000 }),
        ...["E", "F", "G", "H"].map((id) => createPlayer(id)),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        selectionConstraints: { isQuartetAllowed: isOneOfTwoForcedQuartets },
        completedMatches: [
          {
            team1: ["A", "D"],
            team2: ["X1", "X2"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
          {
            team1: ["A", "D"],
            team2: ["X3", "X4"],
            completedAt: new Date("2026-03-18T00:10:00Z"),
          },
          {
            team1: ["A", "C"],
            team2: ["X5", "X6"],
            completedAt: new Date("2026-03-18T00:20:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    const ratedCourt = result.selection?.selections.find((court) =>
      court.ids.includes("A")
    );
    expect(result.selection?.selections).toHaveLength(2);
    expect(ratedCourt?.partition).toEqual({
      team1: ["A", "C"],
      team2: ["B", "D"],
    });
    expect(ratedCourt?.balanceGap).toBe(45);
    expect(result.selection?.maxBalanceGap).toBe(45);
  });

  it("falls back to the smallest achievable maximum rating gap for a full batch", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 1340 }),
        createPlayer("B", { strength: 1100 }),
        createPlayer("C", { strength: 1040 }),
        createPlayer("D", { strength: 1000 }),
        ...["E", "F", "G", "H"].map((id) => createPlayer(id)),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        selectionConstraints: { isQuartetAllowed: isOneOfTwoForcedQuartets },
        completedMatches: [
          {
            team1: ["A", "D"],
            team2: ["B", "C"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    const ratedCourt = result.selection?.selections.find((court) =>
      court.ids.includes("A")
    );
    expect(result.selection?.selections).toHaveLength(2);
    expect(ratedCourt?.partition).toEqual({
      team1: ["A", "D"],
      team2: ["B", "C"],
    });
    expect(ratedCourt?.balanceGap).toBe(100);
    expect(result.selection?.maxBalanceGap).toBe(100);
  });

  it("avoids a full-repeat court in points batches when alternatives are near-rested", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { restTurns: 5 }),
        createPlayer("B", { restTurns: 5 }),
        createPlayer("C", { restTurns: 5 }),
        createPlayer("D", { restTurns: 5 }),
        createPlayer("E", { restTurns: 4 }),
        createPlayer("F", { restTurns: 4 }),
        createPlayer("G", { restTurns: 4 }),
        createPlayer("H", { restTurns: 4 }),
        createPlayer("I", { restTurns: 4 }),
        createPlayer("J", { restTurns: 4 }),
        createPlayer("K", { restTurns: 4 }),
        createPlayer("L", { restTurns: 4 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    const quartetKeys = new Set(
      result.selection?.selections.map((selection) =>
        [...selection.ids].sort().join("|")
      )
    );

    expect(quartetKeys).not.toContain("A|B|C|D");
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("uses point difference after points batch balance ties", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 10, pointDiff: 4 }),
        createPlayer("B", { strength: 10, pointDiff: 4 }),
        createPlayer("C", { strength: 10, pointDiff: -4 }),
        createPlayer("D", { strength: 10, pointDiff: -4 }),
      ],
      {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection?.maxBalanceGap).toBe(0);
    expect(result.selection?.maxPointDiffGap).toBe(0);
    expect(result.selection?.selections[0]?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
  });

  it("uses point difference after social mix batch balance ties", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A", { strength: 10, pointDiff: 4 }),
        createPlayer("B", { strength: 10, pointDiff: 4 }),
        createPlayer("C", { strength: 10, pointDiff: -4 }),
        createPlayer("D", { strength: 10, pointDiff: -4 }),
      ],
      {
        courtCount: 1,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        randomFn: () => 0,
      }
    );

    expect(result.selection?.maxBalanceGap).toBe(0);
    expect(result.selection?.maxPointDiffGap).toBe(0);
    expect(result.selection?.selections[0]?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
  });

  it("considers all Mixed candidates through baseline and entropy passes", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("M1", { matchesPlayed: 0 }),
        createPlayer("M2", { matchesPlayed: 0 }),
        createPlayer("M3", { matchesPlayed: 0 }),
        createLowerPlayer("F1", { matchesPlayed: 0 }),
        createLowerPlayer("F2", { matchesPlayed: 0 }),
        createLowerPlayer("F3", { matchesPlayed: 1 }),
        createLowerPlayer("F4", { matchesPlayed: 1 }),
        createLowerPlayer("F5", { matchesPlayed: 1 }),
        createLowerPlayer("F6", { matchesPlayed: 1 }),
        createLowerPlayer("F7", { matchesPlayed: 1 }),
        createLowerPlayer("F8", { matchesPlayed: 1 }),
        createPlayer("M4", { matchesPlayed: 1 }),
        createPlayer("M5", { matchesPlayed: 1 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.searchAttemptCount).toBe(2);
    expect(result.debug.candidatePlayerIds).toHaveLength(13);
    expect(result.debug.candidateCap).toBeNull();
    expectLegalMixedBatch(result.selection, 2);
  });

  it("finds the fairest legal Mixed batch when one lower-band player must wait", () => {
    const result = findBestBatchSelectionV3(
      [
        createLowerPlayer("F1", { matchesPlayed: 0 }),
        createLowerPlayer("F2", { matchesPlayed: 0 }),
        createLowerPlayer("F3", { matchesPlayed: 0 }),
        createLowerPlayer("F4", { matchesPlayed: 0 }),
        createLowerPlayer("F5", { matchesPlayed: 0 }),
        createPlayer("M1", { matchesPlayed: 1 }),
        createPlayer("M2", { matchesPlayed: 1 }),
        createPlayer("M3", { matchesPlayed: 1 }),
        createPlayer("M4", { matchesPlayed: 1 }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.searchAttemptCount).toBeGreaterThan(1);
    expectLegalMixedBatch(result.selection, 2);
  });

  it("reports when mixed rules cannot form any legal court", () => {
    const result = findBestBatchSelectionV3(
      Array.from({ length: 8 }, (_, index) =>
        createPlayer(`P${index + 1}`, {
          gender: PlayerGender.UNSPECIFIED,
        })
      ),
      {
        courtCount: 2,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.failureReason).toBe("NO_VALID_MIXED_QUARTETS");
  });

  it("returns no batch when not enough active players are available", () => {
    const result = findBestBatchSelectionV3(
      [
        createPlayer("A"),
        createPlayer("B"),
        createPlayer("C"),
        createPlayer("D"),
        createPlayer("E"),
        createPlayer("F"),
        createPlayer("G"),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.quartetCount).toBe(0);
  });
});
