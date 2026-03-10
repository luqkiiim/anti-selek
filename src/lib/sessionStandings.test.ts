import { describe, expect, it } from "vitest";
import {
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
});
