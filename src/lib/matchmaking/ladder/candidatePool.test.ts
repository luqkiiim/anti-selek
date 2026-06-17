import { describe, expect, it } from "vitest";

import { buildCandidatePool } from "./candidatePool";
import type { MatchmakerLadderPlayer } from "./types";

function createPlayer(
  userId: string,
  {
    matchesPlayed = 0,
    matchmakingBaseline = matchesPlayed,
    availableSince = new Date("2026-03-18T00:00:00Z"),
    restTurns = 0,
  }: Partial<
    Pick<
      MatchmakerLadderPlayer,
      "matchesPlayed" | "matchmakingBaseline" | "availableSince" | "restTurns"
    >
  > = {}
): MatchmakerLadderPlayer {
  return {
    userId,
    matchesPlayed,
    matchmakingBaseline,
    availableSince,
    restTurns,
    strength: 1000,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
    isBusy: false,
    isPaused: false,
  };
}

describe("ladder candidate pool", () => {
  it("expands the final selection band by rest-turn tie zone when rest is respected", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", {
          matchesPlayed: 5,
          restTurns: 5,
        }),
        createPlayer("D", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("E", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("F", {
          matchesPlayed: 5,
          restTurns: 3,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
      }
    );

    expect(pool.requiredSelectableCount).toBe(2);
    expect(pool.tieZone?.players.map((player) => player.userId)).toEqual([
      "C",
      "D",
      "E",
    ]);
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("uses the full final selection band when respect player rest is off", () => {
    const pool = buildCandidatePool(
      [
        createPlayer("A", { matchesPlayed: 4 }),
        createPlayer("B", { matchesPlayed: 4 }),
        createPlayer("C", {
          matchesPlayed: 5,
          restTurns: 5,
        }),
        createPlayer("D", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("E", {
          matchesPlayed: 5,
          restTurns: 4,
        }),
        createPlayer("F", {
          matchesPlayed: 5,
          restTurns: 3,
        }),
      ],
      {
        requiredPlayerCount: 4,
        randomFn: () => 0,
        respectPlayerRest: false,
      }
    );

    expect(pool.requiredSelectableCount).toBe(2);
    expect(pool.tieZone).toBeNull();
    expect(pool.candidatePlayers.map((player) => player.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("ignores rest turns for active player ordering when respect player rest is off", () => {
    const randomValues = [0.6, 0.1, 0.4];
    let index = 0;
    const pool = buildCandidatePool(
      [
        createPlayer("HighRest", {
          matchesPlayed: 4,
          restTurns: 10,
        }),
        createPlayer("LowRest", {
          matchesPlayed: 4,
          restTurns: 0,
        }),
        createPlayer("MidRest", {
          matchesPlayed: 4,
          restTurns: 5,
        }),
      ],
      {
        requiredPlayerCount: 2,
        randomFn: () => randomValues[index++] ?? 0,
        respectPlayerRest: false,
      }
    );

    expect(pool.activePlayers.map((player) => player.userId)).toEqual([
      "LowRest",
      "MidRest",
      "HighRest",
    ]);
  });
});
