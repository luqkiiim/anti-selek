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

import { isCloseMatchResult, parseGameScores, resolveMatchResult, resolveMatchScoreInput } from "./matchRules";
const series = (games: [number, number][]) => ({ scoringFormat: "BEST_OF_THREE", gameScores: games.map(([team1Score, team2Score]) => ({ team1Score, team2Score })) });
describe("best of three results", () => {
  it("resolves game wins even when the winner has fewer rally points", () => {
    expect(resolveMatchScoreInput(series([[21,19],[1,21],[21,19]]))).toMatchObject({ winnerTeam: 1, team1Score: 43, team2Score: 59, team1GameWins: 2, team2GameWins: 1 });
    expect(resolveMatchScoreInput(series([[21,19],[0,21],[21,2]]))).toMatchObject({ winnerTeam: 1, team1Score: 42, team2Score: 42, team1GameWins: 2, team2GameWins: 1 });
    expect(resolveMatchScoreInput(series([[11,9],[21,20]]))).toMatchObject({ winnerTeam: 1, complete: true });
  });
  it("allows unfinished prefixes only for explicit progress saving", () => {
    expect(resolveMatchScoreInput(series([[15,14]]))).toBeNull();
    expect(resolveMatchScoreInput(series([[15,14]]), { allowIncomplete: true })).toMatchObject({ winnerTeam: null, complete: false });
    expect(resolveMatchScoreInput(series([]), { allowIncomplete: true })).toMatchObject({ winnerTeam: null, gameScores: [] });
  });
  const invalidSeries: Array<[number, number][]> = [[[21,19],[21,19],[19,21]], [[21,21]], [[-1,5]], [[1.5,1]], [[21,19],[19,21]]];
  it.each(invalidSeries.map(games => ({ games })))("rejects invalid or incomplete final series $games", ({ games }) => {
    expect(resolveMatchScoreInput(series(games))).toBeNull();
  });
  it("requires a third game won by one or two points for close series", () => {
    expect(isCloseMatchResult(series([[21,20],[21,20]]))).toBe(false);
    expect(isCloseMatchResult(series([[21,1],[1,21],[21,19]]))).toBe(true);
    expect(isCloseMatchResult(series([[21,20],[20,21],[21,17]]))).toBe(false);
  });
  it("does not silently recover corrupt stored series using rally totals", () => {
    expect(parseGameScores("invalid json")).toBeNull();
    expect(resolveMatchResult({ scoringFormat: "BEST_OF_THREE", team1Score: 21, team2Score: 19, gameScoresJson: "invalid json", winnerTeam: 1 })).toBeNull();
  });
});
