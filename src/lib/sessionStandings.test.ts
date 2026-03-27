import { describe, expect, it } from "vitest";
import {
  compareCompetitiveStandings,
  compareLadderStandings,
  compareSessionStandings,
  getStandingPointsForTeam,
} from "./sessionStandings";

describe("sessionStandings", () => {
  it("awards three standings points to winners and none to losers", () => {
    expect(getStandingPointsForTeam(1, 1)).toBe(3);
    expect(getStandingPointsForTeam(1, 2)).toBe(0);
    expect(getStandingPointsForTeam(2, 1)).toBe(0);
    expect(getStandingPointsForTeam(2, 2)).toBe(3);
  });

  it("sorts standings by points, then point difference, then name", () => {
    const rows = [
      { name: "Zara", pointDiff: 7, sessionPoints: 6 },
      { name: "Adam", pointDiff: 9, sessionPoints: 6 },
      { name: "Bella", pointDiff: 9, sessionPoints: 6 },
      { name: "Chris", pointDiff: 4, sessionPoints: 9 },
    ];

    const sorted = rows.slice().sort(compareSessionStandings);

    expect(sorted.map((row) => row.name)).toEqual([
      "Chris",
      "Adam",
      "Bella",
      "Zara",
    ]);
  });

  it("sorts ladder standings by record, then point difference, then name", () => {
    const rows = [
      { name: "Zara", wins: 2, losses: 1, pointDiff: 7 },
      { name: "Adam", wins: 2, losses: 1, pointDiff: 9 },
      { name: "Bella", wins: 2, losses: 1, pointDiff: 9 },
      { name: "Chris", wins: 3, losses: 1, pointDiff: 4 },
    ];

    const sorted = rows.slice().sort(compareLadderStandings);

    expect(sorted.map((row) => row.name)).toEqual([
      "Chris",
      "Adam",
      "Bella",
      "Zara",
    ]);
  });

  it("sorts competitive standings by score, then point difference, then name", () => {
    const rows = [
      { name: "Zara", score: 6, pointDiff: 7 },
      { name: "Adam", score: 6, pointDiff: 9 },
      { name: "Bella", score: 6, pointDiff: 9 },
      { name: "Chris", score: 9, pointDiff: 4 },
    ];

    const sorted = rows.slice().sort(compareCompetitiveStandings);

    expect(sorted.map((row) => row.name)).toEqual([
      "Chris",
      "Adam",
      "Bella",
      "Zara",
    ]);
  });
});
