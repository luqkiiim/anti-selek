import { describe, expect, it } from "vitest";

import {
  buildExactRematchHistory,
  getExactPartitionKey,
  getExactRematchPenalty,
} from "./rematch";

describe("matchmaking v3 rematch", () => {
  it("normalizes the exact partition key regardless of team ordering", () => {
    expect(
      getExactPartitionKey({
        team1: ["A", "B"],
        team2: ["C", "D"],
      })
    ).toBe(
      getExactPartitionKey({
        team1: ["B", "A"],
        team2: ["D", "C"],
      })
    );
  });

  it("uses only the last six completed matches for exact rematch history", () => {
    const history = buildExactRematchHistory(
      Array.from({ length: 8 }, (_, index) => ({
        team1: ["A", "B"] as [string, string],
        team2: ["C", "D"] as [string, string],
        completedAt: new Date(`2026-03-18T00:0${index}:00Z`),
      }))
    );

    expect(
      getExactRematchPenalty(
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
        },
        history
      )
    ).toBeCloseTo(
      [0, 1, 2, 3, 4, 5].reduce((sum, index) => sum + Math.pow(0.85, index), 0),
      10
    );
  });

  it("ignores matches that are not completed yet", () => {
    const history = buildExactRematchHistory([
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
        completedAt: null,
      },
    ]);

    expect(
      getExactRematchPenalty(
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
        },
        history
      )
    ).toBe(0);
  });
});
