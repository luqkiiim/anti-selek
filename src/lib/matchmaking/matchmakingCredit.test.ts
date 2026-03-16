import { describe, expect, it } from "vitest";
import {
  calculateNoCatchUpMatchmakingCredit,
  getEffectiveMatchesPlayed,
} from "./matchmakingCredit";

describe("matchmaking credit", () => {
  it("adds matchmaking credit to effective matches played", () => {
    expect(
      getEffectiveMatchesPlayed({
        matchesPlayed: 3,
        matchmakingMatchesCredit: 5,
      })
    ).toBe(8);
  });

  it("keeps the current credit when there is no active pool to compare against", () => {
    expect(
      calculateNoCatchUpMatchmakingCredit({
        player: {
          matchesPlayed: 2,
          matchmakingMatchesCredit: 4,
        },
        activePlayers: [],
      })
    ).toBe(4);
  });

  it("aligns a resumed player to the active pool average without touching real match counts", () => {
    expect(
      calculateNoCatchUpMatchmakingCredit({
        player: {
          matchesPlayed: 0,
          matchmakingMatchesCredit: 0,
        },
        activePlayers: [
          { matchesPlayed: 5, matchmakingMatchesCredit: 0 },
          { matchesPlayed: 5, matchmakingMatchesCredit: 0 },
          { matchesPlayed: 6, matchmakingMatchesCredit: 0 },
          { matchesPlayed: 6, matchmakingMatchesCredit: 0 },
        ],
      })
    ).toBe(6);
  });

  it("never reduces an existing no-catch-up credit on later resumes", () => {
    expect(
      calculateNoCatchUpMatchmakingCredit({
        player: {
          matchesPlayed: 8,
          matchmakingMatchesCredit: 5,
        },
        activePlayers: [
          { matchesPlayed: 11, matchmakingMatchesCredit: 1 },
          { matchesPlayed: 12, matchmakingMatchesCredit: 0 },
          { matchesPlayed: 12, matchmakingMatchesCredit: 0 },
          { matchesPlayed: 11, matchmakingMatchesCredit: 0 },
        ],
      })
    ).toBe(5);
  });
});
