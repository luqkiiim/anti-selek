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
  it("uses random tie-breaks instead of insertion order for tied points batches", () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      createPlayer(String.fromCharCode(65 + index), { strength: 0 })
    );

    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      now: new Date("2026-03-18T01:00:00Z").getTime(),
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
      now: new Date("2026-03-18T01:00:00Z").getTime(),
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0,
      ]),
    });
    const secondResult = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      now: new Date("2026-03-18T01:00:00Z").getTime(),
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
      now: new Date("2026-03-18T01:00:00Z").getTime(),
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
          availableSince: new Date("2026-03-18T00:00:00Z"),
        }),
        createPlayer("H", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:05:00Z"),
        }),
        createPlayer("I", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:10:00Z"),
        }),
        createPlayer("J", {
          matchesPlayed: 5,
          availableSince: new Date("2026-03-18T00:12:00Z"),
        }),
      ],
      {
        courtCount: 2,
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        now: new Date("2026-03-18T01:00:00Z").getTime(),
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
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

  it("widens mixed batch candidates when the capped fair pool cannot fill two legal courts", () => {
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.searchAttemptCount).toBeGreaterThan(1);
    expect(result.debug.candidatePlayerIds).toHaveLength(13);
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
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
        now: new Date("2026-03-18T01:00:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.quartetCount).toBe(0);
  });
});
