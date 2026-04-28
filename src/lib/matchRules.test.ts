import { describe, expect, it } from "vitest";

import { isValidMatchScore } from "./matchRules";

describe("isValidMatchScore", () => {
  it.each([
    [11, 9],
    [1, 0],
    [15, 14],
    [21, 20],
    [30, 29],
    [99, 98],
    [0, 1],
  ])("accepts %i-%i", (team1Score, team2Score) => {
    expect(isValidMatchScore(team1Score, team2Score)).toBe(true);
  });

  it.each([
    [0, 0],
    [10, 10],
    [21, 21],
  ])("rejects tied score %i-%i", (team1Score, team2Score) => {
    expect(isValidMatchScore(team1Score, team2Score)).toBe(false);
  });

  it.each([
    [-1, 0],
    [1, -1],
    [-1, -2],
  ])("rejects negative score %i-%i", (team1Score, team2Score) => {
    expect(isValidMatchScore(team1Score, team2Score)).toBe(false);
  });

  it.each([
    [1.5, 0],
    [1, 0.5],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 0],
  ])("rejects non-integer score %s-%s", (team1Score, team2Score) => {
    expect(isValidMatchScore(team1Score, team2Score)).toBe(false);
  });
});
