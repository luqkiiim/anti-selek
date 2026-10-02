import { describe, expect, it } from "vitest";

import {
  buildExactRematchHistory,
  buildOpponentRepeatHistory,
  buildPartnerRepeatHistory,
  getExactPartitionKey,
  getExactRematchPenalty,
  getOpponentRepeatPenalty,
  getPartnerRepeatPenalty,
  buildSocialMixHistory,
  getSharedCourtEncounterFrequencyPenalty,
  getSharedCourtRepeatPenalty,
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

  it("tracks repeated partners independently from pods or opponents", () => {
    const history = buildPartnerRepeatHistory([
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
        completedAt: new Date("2026-03-18T00:00:00Z"),
      },
      {
        team1: ["A", "C"],
        team2: ["B", "D"],
        completedAt: new Date("2026-03-18T00:10:00Z"),
      },
    ]);

    expect(
      getPartnerRepeatPenalty(
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
        },
        history
      )
    ).toBeCloseTo(0.85 + 0.85, 10);
    expect(
      getPartnerRepeatPenalty(
        {
          team1: ["A", "D"],
          team2: ["B", "C"],
        },
        history
      )
    ).toBe(0);
  });

  it("tracks cross-team opponent pairs independently from partner pairs", () => {
    const history = buildOpponentRepeatHistory([
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
        completedAt: new Date("2026-03-18T00:00:00Z"),
      },
      {
        team1: ["A", "C"],
        team2: ["B", "D"],
        completedAt: new Date("2026-03-18T00:10:00Z"),
      },
    ]);

    expect(
      getOpponentRepeatPenalty(
        {
          team1: ["A", "D"],
          team2: ["B", "C"],
        },
        history
      )
    ).toBeCloseTo(1 + 1 + 0.85 ** 2 + 0.85 ** 2, 10);
    expect(
      getOpponentRepeatPenalty(
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
        },
        history
      )
    ).toBeCloseTo(1.85 ** 2 * 2 + 0.85 ** 2 * 2, 10);
  });

  it("counts every historical shared-court encounter across all six player pairs", () => {
    const match = {
      team1: ["A", "B"] as [string, string],
      team2: ["C", "D"] as [string, string],
      completedAt: new Date("2026-03-18T00:00:00Z"),
    };
    const unrelatedRecentMatches = Array.from({ length: 10 }, (_, index) => ({
      team1: [`X${index}A`, `X${index}B`] as [string, string],
      team2: [`X${index}C`, `X${index}D`] as [string, string],
      completedAt: new Date(`2026-03-18T00:${String(index + 2).padStart(2, "0")}:00Z`),
    }));
    const history = buildSocialMixHistory([
      match,
      { ...match, completedAt: new Date("2026-03-18T00:01:00Z") },
      ...unrelatedRecentMatches,
    ]);

    expect(
      getSharedCourtRepeatPenalty(
        { team1: ["A", "B"], team2: ["C", "D"] },
        history
      )
    ).toBe(6);
    expect(
      getSharedCourtEncounterFrequencyPenalty(
        { team1: ["A", "B"], team2: ["C", "D"] },
        history
      )
    ).toBe(12);
  });

  it("decays older opponent repeats across the recent history window", () => {
    const history = buildOpponentRepeatHistory([
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
        completedAt: new Date("2026-03-18T00:00:00Z"),
      },
      {
        team1: ["A", "B"],
        team2: ["C", "D"],
        completedAt: new Date("2026-03-18T00:10:00Z"),
      },
    ]);

    expect(
      getOpponentRepeatPenalty(
        {
          team1: ["A", "B"],
          team2: ["C", "D"],
        },
        history
      )
    ).toBeCloseTo(1.85 ** 2 * 4, 10);
  });
});
