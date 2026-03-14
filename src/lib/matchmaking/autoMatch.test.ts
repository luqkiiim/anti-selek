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

  it("keeps the fairness quartet locked when it already has a valid partition", () => {
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
    expect(selection?.band).toBe("gap1");
    expect(selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(selection?.score).toBe(50);
  });

  it("does not replace the fairness quartet in points sessions just for a cleaner balance", () => {
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
    expect(selection?.band).toBe("gap1");
    expect(selection?.ids).toEqual(["A", "B", "C", "D"]);
    expect(selection?.score).toBe(2);
  });

  it("widens only when the fairness quartet cannot produce a valid mixed partition", () => {
    const now = new Date("2026-03-09T00:00:00Z").getTime();
    const rankedCandidates = [
      {
        userId: "A",
        matchesPlayed: 0,
        availableSince: new Date(now - 1000),
        joinedAt: new Date(now - 60 * 60 * 1000),
        inactiveSeconds: 0,
        _rate: 0,
        _availableSinceTs: now - 1000,
        _random: 0,
      },
      {
        userId: "B",
        matchesPlayed: 0,
        availableSince: new Date(now - 2000),
        joinedAt: new Date(now - 60 * 60 * 1000),
        inactiveSeconds: 0,
        _rate: 0,
        _availableSinceTs: now - 2000,
        _random: 0,
      },
      {
        userId: "C",
        matchesPlayed: 1,
        availableSince: new Date(now - 3000),
        joinedAt: new Date(now - 60 * 60 * 1000),
        inactiveSeconds: 0,
        _rate: 1,
        _availableSinceTs: now - 3000,
        _random: 0,
      },
      {
        userId: "D",
        matchesPlayed: 1,
        availableSince: new Date(now - 4000),
        joinedAt: new Date(now - 60 * 60 * 1000),
        inactiveSeconds: 0,
        _rate: 1,
        _availableSinceTs: now - 4000,
        _random: 0,
      },
      {
        userId: "E",
        matchesPlayed: 1,
        availableSince: new Date(now - 5000),
        joinedAt: new Date(now - 60 * 60 * 1000),
        inactiveSeconds: 0,
        _rate: 1,
        _availableSinceTs: now - 5000,
        _random: 0,
      },
    ];
    const playersById = new Map<string, PartitionCandidate>([
      ["A", { userId: "A", elo: 1200, pointDiff: 0, lastPartnerId: null, gender: "FEMALE", partnerPreference: "FEMALE_FLEX" }],
      ["B", { userId: "B", elo: 1190, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["C", { userId: "C", elo: 1180, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["D", { userId: "D", elo: 1170, pointDiff: 0, lastPartnerId: null, gender: "MALE", partnerPreference: "OPEN" }],
      ["E", { userId: "E", elo: 1160, pointDiff: 0, lastPartnerId: null, gender: "FEMALE", partnerPreference: "FEMALE_FLEX" }],
    ]);

    const selection = findBestAutoMatchSelection(
      rankedCandidates,
      playersById,
      SessionMode.MIXICANO,
      SessionType.ELO,
      buildRotationHistory([])
    );

    expect(selection).not.toBeNull();
    expect(selection?.band).toBe("gap1");
    expect(selection?.ids).toContain("A");
    expect(selection?.ids).toContain("E");
  });
});
