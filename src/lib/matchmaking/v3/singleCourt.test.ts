import { describe, expect, it } from "vitest";

import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import type { MatchmakerV3Player } from "./types";

function createPlayer(
  userId: string,
  overrides: Partial<MatchmakerV3Player> = {}
): MatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

describe("matchmaking v3 single-court selection", () => {
  it("prefers a different partner over a slightly better-balanced repeated partner in Elo sessions", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 11 }),
        createPlayer("B", { strength: 9 }),
        createPlayer("C", { strength: 10.5 }),
        createPlayer("D", { strength: 9.5 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["X", "Y"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(result.selection?.partnerRepeatPenalty).toBe(0);
  });

  it("keeps the repeated partner in Elo sessions when the fresh option is much less balanced", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1150 }),
        createPlayer("B", { strength: 850 }),
        createPlayer("C", { strength: 1050 }),
        createPlayer("D", { strength: 950 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["X", "Y"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(result.selection?.partnerRepeatPenalty).toBeGreaterThan(0);
  });

  it("chooses fresh shared-court variety inside the Elo balance window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1000 }),
        createPlayer("B", { strength: 1000 }),
        createPlayer("C", { strength: 1000 }),
        createPlayer("D", { strength: 1000 }),
        createPlayer("E", { strength: 1150 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.balanceGap).toBe(75);
    expect(result.selection?.sharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("keeps Elo balance ahead of fresh shared-court variety outside the safe window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1000 }),
        createPlayer("B", { strength: 1000 }),
        createPlayer("C", { strength: 1000 }),
        createPlayer("D", { strength: 1000 }),
        createPlayer("E", { strength: 1152 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).not.toContain("E");
    expect(result.selection?.balanceGap).toBe(0);
  });

  it("does not chain Elo variety past the global balance window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1000 }),
        createPlayer("B", { strength: 1000 }),
        createPlayer("C", { strength: 1000 }),
        createPlayer("D", { strength: 1000 }),
        createPlayer("E", { strength: 1150 }),
        createPlayer("F", { strength: 1452 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.ids).not.toContain("F");
    expect(result.selection?.balanceGap).toBe(75);
  });

  it("keeps lower-rest players eligible when they create the best Elo balance", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 1200, restTurns: 5 }),
        createPlayer("B", { strength: 1200, restTurns: 5 }),
        createPlayer("C", { strength: 1200, restTurns: 5 }),
        createPlayer("D", { strength: 800, restTurns: 5 }),
        createPlayer("E", { strength: 800, restTurns: 0 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
        respectPlayerRest: true,
      }
    );

    expect(result.debug.candidatePlayerIds).toContain("E");
    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.balanceGap).toBe(0);
  });

  it("keeps points balance ahead of fresh shared-court variety outside the safe window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10 }),
        createPlayer("B", { strength: 10 }),
        createPlayer("C", { strength: 10 }),
        createPlayer("D", { strength: 10 }),
        createPlayer("E", { strength: 18 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).not.toContain("E");
    expect(result.selection?.balanceGap).toBe(0);
  });

  it("chooses fresh shared-court variety inside the points balance window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10 }),
        createPlayer("B", { strength: 10 }),
        createPlayer("C", { strength: 10 }),
        createPlayer("D", { strength: 10 }),
        createPlayer("E", { strength: 16 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.balanceGap).toBe(3);
    expect(result.selection?.sharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("does not chain points variety past the global balance window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10 }),
        createPlayer("B", { strength: 10 }),
        createPlayer("C", { strength: 10 }),
        createPlayer("D", { strength: 10 }),
        createPlayer("E", { strength: 16 }),
        createPlayer("F", { strength: 28 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.ids).not.toContain("F");
    expect(result.selection?.balanceGap).toBe(3);
  });

  it("keeps lower-rest players eligible when they create the best points balance", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 20, restTurns: 5 }),
        createPlayer("B", { strength: 20, restTurns: 5 }),
        createPlayer("C", { strength: 20, restTurns: 5 }),
        createPlayer("D", { strength: 0, restTurns: 5 }),
        createPlayer("E", { strength: 0, restTurns: 0 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
        respectPlayerRest: true,
      }
    );

    expect(result.debug.candidatePlayerIds).toContain("E");
    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.balanceGap).toBe(0);
  });

  it("ignores rest-shaped candidate narrowing when rest is off in mixed points", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("M1", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 0,
        }),
        createPlayer("M2", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 0,
        }),
        createPlayer("M3", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 0,
        }),
        createPlayer("F1", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F2", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F3", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F4", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F5", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 0,
        }),
        createPlayer("F6", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 0,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["F1", "F2"],
            team2: ["F3", "F4"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
        respectPlayerRest: false,
      }
    );

    expect(result.debug.candidatePlayerIds).toHaveLength(9);
    expect(new Set(result.selection?.ids)).not.toEqual(
      new Set(["F1", "F2", "F3", "F4"])
    );
    expect(result.selection?.sharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("avoids a full repeated mixed points quartet when near-rest alternatives exist", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("M1", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 4,
        }),
        createPlayer("M2", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 4,
        }),
        createPlayer("M3", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
          restTurns: 4,
        }),
        createPlayer("F1", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F2", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F3", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 5,
        }),
        createPlayer("F4", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 4,
        }),
        createPlayer("F5", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 4,
        }),
        createPlayer("F6", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          restTurns: 4,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["F1", "F2"],
            team2: ["F3", "F4"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
        respectPlayerRest: true,
      }
    );

    expect(result.debug.candidatePlayerIds).toHaveLength(9);
    expect(new Set(result.selection?.ids)).not.toEqual(
      new Set(["F1", "F2", "F3", "F4"])
    );
    expect(result.selection?.sharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("avoids a repeated partner inside the points balance window", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 11 }),
        createPlayer("B", { strength: 9 }),
        createPlayer("C", { strength: 10.5 }),
        createPlayer("D", { strength: 9.5 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(result.selection?.balanceGap).toBeLessThanOrEqual(3);
    expect(result.selection?.partnerRepeatPenalty).toBe(0);
  });

  it("includes an arrival-priority late player before normal rest scoring", () => {
    const players = [
      createPlayer("A", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("B", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("C", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("D", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("E", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("F", {
        matchesPlayed: 4,
        matchmakingBaseline: 4,
      }),
      createPlayer("Late", {
        matchesPlayed: 0,
        matchmakingBaseline: 4,
        availableSince: new Date("2026-03-18T00:59:00Z"),
        arrivalPriorityAt: new Date("2026-03-18T00:58:00Z"),
      }),
    ];

    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.POINTS,
      randomFn: () => 0,
    });

    expect(result.selection?.ids).toContain("Late");
  });

  it("uses point difference after points balance ties", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10, pointDiff: 4 }),
        createPlayer("B", { strength: 10, pointDiff: 4 }),
        createPlayer("C", { strength: 10, pointDiff: -4 }),
        createPlayer("D", { strength: 10, pointDiff: -4 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(result.selection?.balanceGap).toBe(0);
    expect(result.selection?.pointDiffGap).toBe(0);
  });

  it("prefers a fresher shared-court quartet in social mix sessions", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10 }),
        createPlayer("B", { strength: 10 }),
        createPlayer("C", { strength: 10 }),
        createPlayer("D", { strength: 10 }),
        createPlayer("E", { strength: 8 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        completedMatches: [
          {
            team1: ["A", "B"],
            team2: ["C", "D"],
            completedAt: new Date("2026-03-18T00:00:00Z"),
          },
        ],
        randomFn: () => 0,
      }
    );

    expect(result.selection?.ids).toContain("E");
    expect(result.selection?.sharedCourtRepeatPenalty).toBeLessThan(6);
  });

  it("uses point difference after social mix points balance ties", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A", { strength: 10, pointDiff: 4 }),
        createPlayer("B", { strength: 10, pointDiff: 4 }),
        createPlayer("C", { strength: 10, pointDiff: -4 }),
        createPlayer("D", { strength: 10, pointDiff: -4 }),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.SOCIAL_MIX,
        randomFn: () => 0,
      }
    );

    expect(result.selection?.partition).not.toEqual({
      team1: ["A", "B"],
      team2: ["C", "D"],
    });
    expect(result.selection?.balanceGap).toBe(0);
    expect(result.selection?.pointDiffGap).toBe(0);
  });

  it("returns no selection when fewer than four active players are available", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("A"),
        createPlayer("B"),
        createPlayer("C"),
      ],
      {
        sessionMode: SessionMode.MEXICANO,
        sessionType: SessionType.ELO,
        randomFn: () => 0,
      }
    );

    expect(result.selection).toBeNull();
    expect(result.debug.quartetCount).toBe(0);
  });

  it("widens for mixed feasibility when the initial fair pool cannot form a legal mixed quartet", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("LowM1", {
          matchesPlayed: 2,
          strength: 1000,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM2", {
          matchesPlayed: 2,
          strength: 1001,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM3", {
          matchesPlayed: 2,
          strength: 1002,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowF1", {
          matchesPlayed: 2,
          strength: 999,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighF2", {
          matchesPlayed: 3,
          strength: 998,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighM4", {
          matchesPlayed: 3,
          strength: 1200,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighM5", {
          matchesPlayed: 3,
          strength: 1190,
          gender: PlayerGender.MALE,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.includedBandValues).toEqual([2, 3]);
    expect(
      result.selection?.players.filter((player) => player.matchesPlayed === 2).length
    ).toBe(3);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.FEMALE
      ).length
    ).toBe(2);
  });

  it("relaxes locked lower-side players when all three have fewer matches", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("LowF1", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("LowF2", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("LowF3", {
          matchesPlayed: 2,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighM1", {
          matchesPlayed: 3,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighM2", {
          matchesPlayed: 3,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighM3", {
          matchesPlayed: 3,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighM4", {
          matchesPlayed: 3,
          gender: PlayerGender.MALE,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.lockedPlayerIds).toEqual(["LowF1", "LowF2", "LowF3"]);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.FEMALE
      ).length
    ).toBe(2);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.MALE
      ).length
    ).toBe(2);
  });

  it("relaxes locked upper-side players when all three have fewer matches", () => {
    const result = findBestSingleCourtSelectionV3(
      [
        createPlayer("LowM1", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM2", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
        }),
        createPlayer("LowM3", {
          matchesPlayed: 2,
          gender: PlayerGender.MALE,
        }),
        createPlayer("HighF1", {
          matchesPlayed: 3,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighF2", {
          matchesPlayed: 3,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighF3", {
          matchesPlayed: 3,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("HighF4", {
          matchesPlayed: 3,
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
      ],
      {
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        randomFn: () => 0,
      }
    );

    expect(result.selection).not.toBeNull();
    expect(result.debug.lockedPlayerIds).toEqual(["LowM1", "LowM2", "LowM3"]);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.FEMALE
      ).length
    ).toBe(2);
    expect(
      result.selection?.players.filter(
        (player) => player.gender === PlayerGender.MALE
      ).length
    ).toBe(2);
  });
});
