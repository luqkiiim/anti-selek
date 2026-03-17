import { describe, expect, it } from "vitest";

import { rankPlayersByRotationLoad } from "./fairness";

describe("matchmaking v2 fairness", () => {
  it("orders by rotation load before wait time", () => {
    const ranked = rankPlayersByRotationLoad(
      [
        {
          userId: "later",
          matchesPlayed: 3,
          matchmakingMatchesCredit: 0,
          availableSince: new Date("2026-03-10T10:05:00Z"),
        },
        {
          userId: "credit",
          matchesPlayed: 0,
          matchmakingMatchesCredit: 3,
          availableSince: new Date("2026-03-10T10:00:00Z"),
        },
        {
          userId: "underplayed",
          matchesPlayed: 2,
          matchmakingMatchesCredit: 0,
          availableSince: new Date("2026-03-10T10:20:00Z"),
        },
      ],
      {
        now: new Date("2026-03-10T10:30:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(ranked.map((candidate) => candidate.userId)).toEqual([
      "underplayed",
      "credit",
      "later",
    ]);
    expect(ranked[1].rotationLoad).toBe(3);
    expect(ranked[2].rotationLoad).toBe(3);
  });

  it("breaks equal rotation loads by oldest availability", () => {
    const ranked = rankPlayersByRotationLoad(
      [
        {
          userId: "recent",
          matchesPlayed: 4,
          matchmakingMatchesCredit: 0,
          availableSince: new Date("2026-03-10T10:25:00Z"),
        },
        {
          userId: "older",
          matchesPlayed: 4,
          matchmakingMatchesCredit: 0,
          availableSince: new Date("2026-03-10T10:10:00Z"),
        },
      ],
      {
        now: new Date("2026-03-10T10:30:00Z").getTime(),
        randomFn: () => 0,
      }
    );

    expect(ranked.map((candidate) => candidate.userId)).toEqual([
      "older",
      "recent",
    ]);
  });
});
