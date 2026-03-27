import { describe, expect, it } from "vitest";

import {
  createEmptyLadderRecord,
  deriveLadderRecords,
  deriveLadderRecordsByEntryTime,
  deriveRaceRecords,
  deriveRaceRecordsByEntryTime,
  getLadderScore,
  getRaceScore,
} from "./records";

describe("ladder records", () => {
  it("creates an empty ladder record", () => {
    expect(createEmptyLadderRecord()).toEqual({
      wins: 0,
      losses: 0,
      pointDiff: 0,
      ladderScore: 0,
    });
  });

  it("derives wins, losses, point difference, and ladder score from completed matches", () => {
    const records = deriveLadderRecords(
      ["A", "B", "C", "D"],
      [
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
          team1Score: 21,
          team2Score: 16,
          status: "COMPLETED",
        },
        {
          team1: ["A", "D"],
          team2: ["B", "C"],
          team1Score: 19,
          team2Score: 21,
          status: "COMPLETED",
        },
      ]
    );

    expect(records.get("A")).toEqual({
      wins: 1,
      losses: 1,
      pointDiff: 3,
      ladderScore: 0,
    });
    expect(records.get("B")).toEqual({
      wins: 2,
      losses: 0,
      pointDiff: 7,
      ladderScore: 2,
    });
    expect(records.get("C")).toEqual({
      wins: 1,
      losses: 1,
      pointDiff: -3,
      ladderScore: 0,
    });
    expect(records.get("D")).toEqual({
      wins: 0,
      losses: 2,
      pointDiff: -7,
      ladderScore: -2,
    });
  });

  it("ignores matches that are not completed or have missing scores", () => {
    const records = deriveLadderRecords(
      ["A", "B", "C", "D"],
      [
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
          team1Score: 21,
          team2Score: 18,
          status: "PENDING_APPROVAL",
        },
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
          team1Score: null,
          team2Score: null,
          status: "COMPLETED",
        },
      ]
    );

    expect(records.get("A")).toEqual(createEmptyLadderRecord());
    expect(records.get("B")).toEqual(createEmptyLadderRecord());
    expect(records.get("C")).toEqual(createEmptyLadderRecord());
    expect(records.get("D")).toEqual(createEmptyLadderRecord());
  });

  it("includes unknown players encountered in completed matches, including guests", () => {
    const records = deriveLadderRecords(
      ["A", "B"],
      [
        {
          team1: ["A", "Guest-1"],
          team2: ["B", "Guest-2"],
          team1Score: 21,
          team2Score: 15,
          status: "COMPLETED",
        },
      ]
    );

    expect(records.get("Guest-1")).toEqual({
      wins: 1,
      losses: 0,
      pointDiff: 6,
      ladderScore: 1,
    });
    expect(records.get("Guest-2")).toEqual({
      wins: 0,
      losses: 1,
      pointDiff: -6,
      ladderScore: -1,
    });
  });

  it("computes ladder score as wins minus losses", () => {
    expect(getLadderScore({ wins: 4, losses: 1 })).toBe(3);
    expect(getLadderScore({ wins: 2, losses: 3 })).toBe(-1);
  });

  it("computes race score as three points per win", () => {
    expect(getRaceScore({ wins: 4 })).toBe(12);
    expect(getRaceScore({ wins: 0 })).toBe(0);
  });

  it("resets records using per-player ladder entry times", () => {
    const records = deriveLadderRecordsByEntryTime(
      new Map([
        ["A", new Date("2026-03-18T00:20:00Z")],
        ["B", null],
      ]),
      [
        {
          team1: ["A", "C"],
          team2: ["B", "D"],
          team1Score: 21,
          team2Score: 18,
          status: "COMPLETED",
          completedAt: new Date("2026-03-18T00:10:00Z"),
        },
        {
          team1: ["A", "E"],
          team2: ["B", "F"],
          team1Score: 21,
          team2Score: 19,
          status: "COMPLETED",
          completedAt: new Date("2026-03-18T00:30:00Z"),
        },
      ]
    );

    expect(records.get("A")).toEqual({
      wins: 1,
      losses: 0,
      pointDiff: 2,
      ladderScore: 1,
    });
    expect(records.get("B")).toEqual({
      wins: 0,
      losses: 2,
      pointDiff: -5,
      ladderScore: -2,
    });
  });

  it("derives race records with cumulative three-point wins", () => {
    const records = deriveRaceRecords(
      ["A", "B", "C", "D"],
      [
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
          team1Score: 21,
          team2Score: 16,
          status: "COMPLETED",
        },
        {
          team1: ["A", "D"],
          team2: ["B", "C"],
          team1Score: 19,
          team2Score: 21,
          status: "COMPLETED",
        },
      ]
    );

    expect(records.get("A")).toEqual({
      wins: 1,
      losses: 1,
      pointDiff: 3,
      ladderScore: 3,
    });
    expect(records.get("B")).toEqual({
      wins: 2,
      losses: 0,
      pointDiff: 7,
      ladderScore: 6,
    });
    expect(records.get("D")).toEqual({
      wins: 0,
      losses: 2,
      pointDiff: -7,
      ladderScore: 0,
    });
  });

  it("resets race records using per-player entry times", () => {
    const records = deriveRaceRecordsByEntryTime(
      new Map([
        ["A", new Date("2026-03-18T00:20:00Z")],
        ["B", null],
      ]),
      [
        {
          team1: ["A", "C"],
          team2: ["B", "D"],
          team1Score: 21,
          team2Score: 18,
          status: "COMPLETED",
          completedAt: new Date("2026-03-18T00:10:00Z"),
        },
        {
          team1: ["A", "E"],
          team2: ["B", "F"],
          team1Score: 21,
          team2Score: 19,
          status: "COMPLETED",
          completedAt: new Date("2026-03-18T00:30:00Z"),
        },
      ]
    );

    expect(records.get("A")).toEqual({
      wins: 1,
      losses: 0,
      pointDiff: 2,
      ladderScore: 3,
    });
    expect(records.get("B")).toEqual({
      wins: 0,
      losses: 2,
      pointDiff: -5,
      ladderScore: 0,
    });
  });
});
