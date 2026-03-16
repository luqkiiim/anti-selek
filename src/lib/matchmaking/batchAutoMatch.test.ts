import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../types/enums";
import { findBestAutoMatchSelection } from "./autoMatch";
import { findBestBatchAutoMatchSelection } from "./batchAutoMatch";
import { buildRotationHistory, type PartitionCandidate } from "./partitioning";

function createPlayers(
  entries: Array<{ id: string; rating: number; pointDiff?: number }>
) {
  return new Map<string, PartitionCandidate>(
    entries.map(({ id, rating, pointDiff = 0 }) => [
      id,
      {
        userId: id,
        elo: rating,
        pointDiff,
        lastPartnerId: null,
        gender: "MALE",
        partnerPreference: "OPEN",
      },
    ])
  );
}

function createRankedCandidates(
  entries: Array<{ id: string; matchesPlayed: number }>
) {
  const now = new Date("2026-03-15T00:00:00Z").getTime();

  return entries.map(({ id, matchesPlayed }, index) => ({
    userId: id,
    matchesPlayed,
    availableSince: new Date(now - index * 1000),
    joinedAt: new Date(now - 60 * 60 * 1000),
    inactiveSeconds: 0,
    _rate: index,
    _availableSinceTs: now - index * 1000,
    _random: 0,
  }));
}

describe("findBestBatchAutoMatchSelection", () => {
  it("improves overall court quality for a 14-player, 2-court batch", () => {
    const rankedCandidates = createRankedCandidates([
      { id: "A", matchesPlayed: 0 },
      { id: "B", matchesPlayed: 0 },
      { id: "C", matchesPlayed: 0 },
      { id: "D", matchesPlayed: 0 },
      { id: "E", matchesPlayed: 0 },
      { id: "F", matchesPlayed: 0 },
      { id: "G", matchesPlayed: 0 },
      { id: "H", matchesPlayed: 0 },
      { id: "I", matchesPlayed: 2 },
      { id: "J", matchesPlayed: 2 },
      { id: "K", matchesPlayed: 2 },
      { id: "L", matchesPlayed: 2 },
      { id: "M", matchesPlayed: 2 },
      { id: "N", matchesPlayed: 2 },
    ]);
    const playersById = createPlayers([
      { id: "A", rating: 2000 },
      { id: "B", rating: 1500 },
      { id: "C", rating: 1490 },
      { id: "D", rating: 1480 },
      { id: "E", rating: 1470 },
      { id: "F", rating: 1460 },
      { id: "G", rating: 1450 },
      { id: "H", rating: 1000 },
      { id: "I", rating: 1440 },
      { id: "J", rating: 1430 },
      { id: "K", rating: 1420 },
      { id: "L", rating: 1410 },
      { id: "M", rating: 1400 },
      { id: "N", rating: 1390 },
    ]);
    const rotationHistory = buildRotationHistory([]);

    const batchSelection = findBestBatchAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory,
      2
    );

    expect(batchSelection).not.toBeNull();
    expect(batchSelection?.selections).toHaveLength(2);

    const greedyFirst = findBestAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );

    expect(greedyFirst).not.toBeNull();

    const greedySecond = findBestAutoMatchSelection(
      rankedCandidates.filter(
        (candidate) => !greedyFirst!.ids.includes(candidate.userId)
      ),
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory
    );

    expect(greedySecond).not.toBeNull();

    const greedyWorstGap = Math.max(greedyFirst!.score, greedySecond!.score);
    const batchWorstGap = Math.max(
      ...batchSelection!.selections.map((selection) => selection.score)
    );

    expect(batchWorstGap).toBeLessThan(greedyWorstGap);
  });

  it("returns 3 disjoint matches for a 21-player, 3-court batch", () => {
    const rankedCandidates = createRankedCandidates([
      { id: "P1", matchesPlayed: 0 },
      { id: "P2", matchesPlayed: 0 },
      { id: "P3", matchesPlayed: 0 },
      { id: "P4", matchesPlayed: 0 },
      { id: "P5", matchesPlayed: 0 },
      { id: "P6", matchesPlayed: 0 },
      { id: "P7", matchesPlayed: 0 },
      { id: "P8", matchesPlayed: 0 },
      { id: "P9", matchesPlayed: 0 },
      { id: "P10", matchesPlayed: 0 },
      { id: "P11", matchesPlayed: 0 },
      { id: "P12", matchesPlayed: 0 },
      { id: "P13", matchesPlayed: 2 },
      { id: "P14", matchesPlayed: 2 },
      { id: "P15", matchesPlayed: 2 },
      { id: "P16", matchesPlayed: 2 },
      { id: "P17", matchesPlayed: 2 },
      { id: "P18", matchesPlayed: 2 },
      { id: "P19", matchesPlayed: 2 },
      { id: "P20", matchesPlayed: 2 },
      { id: "P21", matchesPlayed: 2 },
    ]);
    const playersById = createPlayers(
      Array.from({ length: 21 }, (_, index) => ({
        id: `P${index + 1}`,
        rating: 1600 - index * 25,
      }))
    );

    const batchSelection = findBestBatchAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      buildRotationHistory([]),
      3
    );

    expect(batchSelection).not.toBeNull();
    expect(batchSelection?.selections).toHaveLength(3);

    const selectedIds = batchSelection!.selections.flatMap((selection) => selection.ids);

    expect(new Set(selectedIds).size).toBe(12);
    expect(
      selectedIds.every((id) => rankedCandidates.slice(0, 12).some((candidate) => candidate.userId === id))
    ).toBe(true);
  });

  it("splits a repeated same-court pair across courts when an equal-quality alternative exists", () => {
    const rankedCandidates = createRankedCandidates(
      Array.from({ length: 12 }, (_, index) => ({
        id: `P${index + 1}`,
        matchesPlayed: 5,
      }))
    );
    const playersById = createPlayers(
      Array.from({ length: 12 }, (_, index) => ({
        id: `P${index + 1}`,
        rating: 1000,
      }))
    );
    const rotationHistory = buildRotationHistory([
      {
        team1User1Id: "P1",
        team1User2Id: "P2",
        team2User1Id: "P3",
        team2User2Id: "P4",
      },
    ]);

    const batchSelection = findBestBatchAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      rotationHistory,
      3
    );

    expect(batchSelection).not.toBeNull();

    const sharedCourt = batchSelection!.selections.find(
      (selection) =>
        selection.ids.includes("P1") && selection.ids.includes("P2")
    );

    expect(sharedCourt).toBeUndefined();
  });
});
