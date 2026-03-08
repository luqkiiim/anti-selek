import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../types/enums";
import { findBestAutoMatchSelection } from "./autoMatch";
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
  const now = new Date("2026-03-09T00:00:00Z").getTime();

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

describe("findBestAutoMatchSelection", () => {
  it("keeps the <=1 band when widening only gives a small Elo-balance improvement", () => {
    const rankedCandidates = createRankedCandidates([
      { id: "A", matchesPlayed: 0 },
      { id: "B", matchesPlayed: 0 },
      { id: "C", matchesPlayed: 1 },
      { id: "D", matchesPlayed: 1 },
      { id: "E", matchesPlayed: 2 },
    ]);
    const playersById = createPlayers([
      { id: "A", rating: 1600 },
      { id: "B", rating: 1530 },
      { id: "C", rating: 1450 },
      { id: "D", rating: 1300 },
      { id: "E", rating: 1370 },
    ]);

    const selection = findBestAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      buildRotationHistory([])
    );

    expect(selection).not.toBeNull();
    expect(selection?.band).toBe("gap1");
    expect(selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(selection?.score).toBe(40);
  });

  it("widens to the <=2 band when it meaningfully improves Elo balance", () => {
    const rankedCandidates = createRankedCandidates([
      { id: "A", matchesPlayed: 0 },
      { id: "B", matchesPlayed: 0 },
      { id: "C", matchesPlayed: 1 },
      { id: "D", matchesPlayed: 1 },
      { id: "E", matchesPlayed: 2 },
      { id: "F", matchesPlayed: 2 },
    ]);
    const playersById = createPlayers([
      { id: "A", rating: 1600 },
      { id: "B", rating: 1540 },
      { id: "C", rating: 1450 },
      { id: "D", rating: 1290 },
      { id: "E", rating: 1500 },
      { id: "F", rating: 1390 },
    ]);

    const selection = findBestAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.ELO,
      buildRotationHistory([])
    );

    expect(selection).not.toBeNull();
    expect(selection?.band).toBe("gap2");
    expect(selection?.ids).not.toEqual(["A", "B", "C", "D"]);
    expect(selection?.score).toBe(0);
  });

  it("uses a smaller widening threshold in points sessions", () => {
    const rankedCandidates = createRankedCandidates([
      { id: "A", matchesPlayed: 0 },
      { id: "B", matchesPlayed: 0 },
      { id: "C", matchesPlayed: 1 },
      { id: "D", matchesPlayed: 1 },
      { id: "E", matchesPlayed: 2 },
    ]);
    const playersById = createPlayers([
      { id: "A", rating: 10, pointDiff: 6 },
      { id: "B", rating: 10, pointDiff: 5 },
      { id: "C", rating: 5, pointDiff: -6 },
      { id: "D", rating: 1, pointDiff: -5 },
      { id: "E", rating: 6, pointDiff: 0 },
    ]);

    const selection = findBestAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MEXICANO,
      SessionType.POINTS,
      buildRotationHistory([])
    );

    expect(selection).not.toBeNull();
    expect(selection?.band).toBe("gap2");
    expect(selection?.ids).not.toEqual(["A", "B", "C", "D"]);
    expect(selection?.score).toBe(0);
  });
});
