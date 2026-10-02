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
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
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

function createMixedSidePlayers(
  upperIds: string[],
  lowerIds: string[]
) {
  return [
    ...upperIds.map((id) => createPlayer(id, { gender: PlayerGender.MALE })),
    ...lowerIds.map((id) =>
      createLowerPlayer(id, { partnerPreference: PartnerPreference.FEMALE_FLEX })
    ),
  ];
}

function quartetKey(players: Array<{ userId: string }>) {
  return players.map((player) => player.userId).sort().join("|");
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
  it("chooses the globally better POINTS partition after the other court sets the balance window", () => {
    const strengths: Record<string, number> = {
      U1: 6,
      U2: 3,
      L1: 0,
      L2: 3,
      U3: 9,
      U4: 3,
      L3: 0,
      L4: 0,
    };
    const players = createMixedSidePlayers(
      ["U1", "U2", "U3", "U4"],
      ["L1", "L2", "L3", "L4"]
    ).map((player) => ({ ...player, strength: strengths[player.userId]! }));
    const firstQuartet = new Set(["U1", "U2", "L1", "L2"]);
    const allowedQuartets = new Set([
      [...firstQuartet].sort().join("|"),
      ["U3", "U4", "L3", "L4"].sort().join("|"),
    ]);
    const completedMatches = [
      {
        team1: ["U1", "L1"] as [string, string],
        team2: ["U2", "L2"] as [string, string],
        completedAt: new Date("2026-09-01T00:00:00Z"),
      },
    ];
    const selectionConstraints = {
      isQuartetAllowed: (quartet: Array<{ userId: string }>) =>
        allowedQuartets.has(quartetKey(quartet)),
      normalizePartition: ({
        partition,
        playersById,
      }: {
        partition: { team1: [string, string]; team2: [string, string] };
        playersById: Map<string, { gender?: string }>;
      }) => {
        const isMixedTeam = (team: [string, string]) =>
          playersById.get(team[0])?.gender !==
          playersById.get(team[1])?.gender;
        return isMixedTeam(partition.team1) && isMixedTeam(partition.team2)
          ? partition
          : null;
      },
    };

    const locallyBest = findBestSingleCourtSelectionV3(
      players.filter((player) => firstQuartet.has(player.userId)),
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        completedMatches,
        selectionConstraints,
        respectPlayerRest: false,
        randomFn: () => 0,
      }
    );
    expect(locallyBest.selection?.balanceGap).toBe(0);
    expect(locallyBest.selection?.partnerRepeatPenalty).toBeGreaterThan(0);

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      completedMatches,
      selectionConstraints,
      respectPlayerRest: false,
      randomFn: () => 0,
    });

    const firstCourt = result.selection?.selections.find(
      (court) => quartetKey(court.players) === [...firstQuartet].sort().join("|")
    );
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.selection?.maxBalanceGap).toBe(3);
    expect(firstCourt?.balanceGap).toBe(3);
    expect(firstCourt?.partnerRepeatPenalty).toBe(0);
  });

  it("minimizes total repeated courtmates across both courts instead of extending the best first court greedily", () => {
    const upperIds = ["U1", "U2", "U3", "U4"];
    const lowerIds = ["L1", "L2", "L3", "L4"];
    const players = createMixedSidePlayers(upperIds, lowerIds);
    const quartets = [
      ["U1", "U2", "L1", "L2"],
      ["U3", "U4", "L3", "L4"],
      ["U1", "U3", "L1", "L3"],
      ["U2", "U4", "L2", "L4"],
    ];
    const allowedQuartets = new Set(
      quartets.map((quartet) => quartet.sort().join("|"))
    );
    const completedMatches = [
      {
        team1: ["U3", "L3"] as [string, string],
        team2: ["U4", "L4"] as [string, string],
        completedAt: new Date("2026-09-01T00:00:00Z"),
      },
    ];
    const selectionConstraints = {
      isQuartetAllowed: (quartet: Array<{ userId: string }>) =>
        allowedQuartets.has(quartetKey(quartet)),
    };

    const locallyBest = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      completedMatches,
      selectionConstraints,
      randomFn: () => 0,
    });
    expect(quartetKey(locallyBest.selection?.players ?? [])).toBe("L1|L2|U1|U2");
    expect(locallyBest.selection?.sharedCourtRepeatPenalty).toBe(0);

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      completedMatches,
      selectionConstraints,
      randomFn: () => 0,
    });

    expect(result.selection?.selections).toHaveLength(2);
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBe(2);
    expect(
      result.selection?.selections.map((court) => quartetKey(court.players)).sort()
    ).toEqual(["L1|L3|U1|U3", "L2|L4|U2|U4"]);
  });

  it("skips all three leading upper players to choose a fresh two-lower batch", () => {
    const upperIds = ["U1", "U2", "U3"];
    const lowerIds = Array.from({ length: 8 }, (_, index) => `L${index + 1}`);
    const players = createMixedSidePlayers(upperIds, lowerIds);
    const allowedQuartets = new Set([
      ["U1", "U2", "L1", "L2"].sort().join("|"),
      ["L1", "L2", "L3", "L4"].sort().join("|"),
      ["L5", "L6", "L7", "L8"].sort().join("|"),
    ]);
    const completedMatches = upperIds.flatMap((upperId, upperIndex) =>
      lowerIds.map((lowerId, lowerIndex) => ({
        team1: [upperId, lowerId] as [string, string],
        team2: [
          `F${upperIndex * lowerIds.length + lowerIndex}A`,
          `F${upperIndex * lowerIds.length + lowerIndex}B`,
        ] as [string, string],
        completedAt: new Date(
          Date.UTC(2026, 8, 1, 0, upperIndex * lowerIds.length + lowerIndex)
        ),
      }))
    );

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      completedMatches,
      selectionConstraints: {
        isQuartetAllowed: (quartet) =>
          allowedQuartets.has(quartetKey(quartet)),
      },
      randomFn: () => 0.25,
    });

    expect(result.selection?.selections).toHaveLength(2);
    expect(
      result.selection?.selections.map((court) => quartetKey(court.players)).sort()
    ).toEqual(
      [
        ["L1", "L2", "L3", "L4"].sort().join("|"),
        ["L5", "L6", "L7", "L8"].sort().join("|"),
      ].sort()
    );
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBe(0);
    expect(result.selection?.selections.every((court) => !court.mixedGame)).toBe(
      true
    );
  });

  it("finds the globally fresher two-court batch after the initial search is interrupted", () => {
    const upperIds = ["U1", "U2", "U3"];
    const lowerIds = Array.from({ length: 8 }, (_, index) => `L${index + 1}`);
    const players = createMixedSidePlayers(upperIds, lowerIds);
    const allowedQuartets = new Set([
      ["U1", "U2", "L1", "L2"].sort().join("|"),
      ["L1", "L2", "L3", "L4"].sort().join("|"),
      ["L5", "L6", "L7", "L8"].sort().join("|"),
    ]);
    const completedMatches = upperIds.flatMap((upperId, upperIndex) =>
      lowerIds.map((lowerId, lowerIndex) => ({
        team1: [upperId, lowerId] as [string, string],
        team2: [
          `F${upperIndex * lowerIds.length + lowerIndex}A`,
          `F${upperIndex * lowerIds.length + lowerIndex}B`,
        ] as [string, string],
        completedAt: new Date(
          Date.UTC(2026, 8, 1, 0, upperIndex * lowerIds.length + lowerIndex)
        ),
      }))
    );

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      completedMatches,
      selectionConstraints: {
        isQuartetAllowed: (quartet) =>
          allowedQuartets.has(quartetKey(quartet)),
      },
      searchLimits: { maxBranches: 1 },
      randomFn: () => 0.25,
    });

    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.selection?.selections).toHaveLength(2);
    expect(
      result.selection?.selections.map((court) => quartetKey(court.players)).sort()
    ).toEqual(
      [
        ["L1", "L2", "L3", "L4"].sort().join("|"),
        ["L5", "L6", "L7", "L8"].sort().join("|"),
      ].sort()
    );
    expect(result.selection?.totalSharedCourtRepeatPenalty).toBe(0);
  });

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
    expect(result.debug.candidateCap).toBe(24);
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
    expect(result.debug.candidateCap).toBe(24);
  });

  it("caps a 25-player single-court points pool at 24 candidates", () => {
    const result = findBestBatchSelectionV3(createPlayers(25), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(25);
    expect(result.debug.consideredCandidateCount).toBe(24);
    expect(result.debug.candidatePlayerIds).toHaveLength(24);
    expect(result.debug.candidateCap).toBe(24);
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
    expect(result.debug.candidateCap).toBe(20);
  });

  it("caps a 21-player two-court pool at 20 candidates", () => {
    const result = findBestBatchSelectionV3(createPlayers(21), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(21);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBe(20);
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
    expect(result.debug.candidateCap).toBe(20);
  });

  it(
    "caps a 30-player four-court pool at 24 candidates",
    () => {
      const result = findBestBatchSelectionV3(createPlayers(30), {
        courtCount: 4,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      });

      expect(result.debug.availableCandidateCount).toBe(30);
      expect(result.debug.consideredCandidateCount).toBe(24);
      expect(result.debug.candidatePlayerIds).toHaveLength(24);
      expect(result.debug.candidateCap).toBe(24);
    },
    15_000
  );

  it("uses the same candidate cap policy for social batches", () => {
    const result = findBestBatchSelectionV3(createPlayers(20), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      randomFn: () => 0,
    });

    expect(result.debug.availableCandidateCount).toBe(20);
    expect(result.debug.consideredCandidateCount).toBe(20);
    expect(result.debug.candidatePlayerIds).toHaveLength(20);
    expect(result.debug.candidateCap).toBe(20);
  });

  it("returns the best found batch when the search limit is reached", () => {
    const result = findBestBatchSelectionV3(createPlayers(12), {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
      searchLimits: {
        maxBranches: 2,
      },
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.debug.failureReason).toBeNull();
  });

  it("finds a full batch under the rating ceiling when the normal search limit is reached", () => {
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

    expect(result.selection?.selections).toHaveLength(2);
    expect(result.selection?.maxBalanceGap).toBe(50);
    expect(
      result.selection?.selections
        .map((court) => [...court.ids].sort().join("|"))
        .sort()
    ).toEqual(["A|B|E|F", "C|D|G|H"]);
  });

  it("keeps the dynamic cap policy when respectPlayerRest is false", () => {
    const result = findBestBatchSelectionV3(createPlayers(9), {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
      respectPlayerRest: false,
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.consideredCandidateCount).toBe(9);
    expect(result.debug.candidateCap).toBe(24);
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

  it("builds a full global batch and uses all locked lower-band players", () => {
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
    expect(result.debug.lockedPlayerIds).toEqual(["A", "B", "C", "D", "E", "F"]);
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

  it("avoids repeating whole court groups in points batches before balance", () => {
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
        createPlayer("I", { strength: 1100 }),
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

  it("keeps a middle split inside the absolute rating cap during batch compression", () => {
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

  it("considers the full mixed candidate pool when it fits under the dynamic cap", () => {
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
    expect(result.debug.searchAttemptCount).toBe(1);
    expect(result.debug.candidatePlayerIds).toHaveLength(13);
    expect(result.debug.candidateCap).toBe(20);
    expectLegalMixedBatch(result.selection, 2);
  });

  it("relaxes locked mixed batch players when one fair player must wait for feasibility", () => {
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
