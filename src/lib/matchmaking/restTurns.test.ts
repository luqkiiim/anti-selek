import { describe, expect, it } from "vitest";

import {
  buildRestTurnsByUserId,
  calculateRestTurnsForPlayer,
} from "./restTurns";

const completedMatches = [
  {
    team1: ["A", "B"] as [string, string],
    team2: ["C", "D"] as [string, string],
    completedAt: new Date("2026-03-18T00:10:00Z"),
  },
  {
    team1: ["E", "F"] as [string, string],
    team2: ["G", "H"] as [string, string],
    completedAt: new Date("2026-03-18T00:20:00Z"),
  },
  {
    team1: ["A", "E"] as [string, string],
    team2: ["B", "F"] as [string, string],
    completedAt: new Date("2026-03-18T00:30:00Z"),
  },
  {
    team1: ["C", "G"] as [string, string],
    team2: ["D", "H"] as [string, string],
    completedAt: new Date("2026-03-18T00:40:00Z"),
  },
];

describe("rest turns", () => {
  it("counts completed matches after eligibility where the player did not play", () => {
    expect(
      calculateRestTurnsForPlayer(
        {
          userId: "A",
          availableSince: new Date("2026-03-18T00:15:00Z"),
        },
        completedMatches
      )
    ).toBe(2);
  });

  it("does not count matches before eligibility or matches containing the player", () => {
    expect(
      calculateRestTurnsForPlayer(
        {
          userId: "E",
          availableSince: new Date("2026-03-18T00:05:00Z"),
        },
        completedMatches
      )
    ).toBe(2);
  });

  it("builds a rest-turn map for matchmaker inputs", () => {
    expect(
      buildRestTurnsByUserId(
        [
          {
            userId: "A",
            availableSince: new Date("2026-03-18T00:15:00Z"),
          },
          {
            userId: "Z",
            availableSince: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        completedMatches
      )
    ).toEqual(
      new Map([
        ["A", 2],
        ["Z", 4],
      ])
    );
  });
});
