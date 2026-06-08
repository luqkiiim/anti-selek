import { describe, expect, it } from "vitest";
import {
  PROFILE_RECENT_SESSION_COUNT,
  buildPlayerProfileDerivedData,
  type ProfileMatchSource,
} from "./profileStats";

function createMatch(
  id: string,
  {
    sessionId,
    sessionCode,
    sessionName,
    completedAt,
    team1,
    team2,
    team1Score,
    team2Score,
    winnerTeam,
    team1EloChange = null,
    team2EloChange = null,
    sessionPlayers,
    sessionMatches,
  }: {
    sessionId: string;
    sessionCode: string;
    sessionName: string;
    completedAt: string;
    team1: [{ id: string; name: string }, { id: string; name: string }];
    team2: [{ id: string; name: string }, { id: string; name: string }];
    team1Score: number;
    team2Score: number;
    winnerTeam: number;
    team1EloChange?: number | null;
    team2EloChange?: number | null;
    sessionPlayers?: Array<{
      userId: string;
      sessionPoints: number;
      user: { id: string; name: string };
    }>;
    sessionMatches?: Array<{
      id: string;
      team1User1Id: string;
      team1User2Id: string;
      team2User1Id: string;
      team2User2Id: string;
      team1Score: number | null;
      team2Score: number | null;
      winnerTeam: number | null;
    }>;
  }
): ProfileMatchSource {
  return {
    id,
    completedAt: new Date(completedAt),
    session: {
      id: sessionId,
      code: sessionCode,
      name: sessionName,
      players: sessionPlayers,
      matches: sessionMatches,
    },
    team1User1Id: team1[0].id,
    team1User2Id: team1[1].id,
    team2User1Id: team2[0].id,
    team2User2Id: team2[1].id,
    team1User1: team1[0],
    team1User2: team1[1],
    team2User1: team2[0],
    team2User2: team2[1],
    team1Score,
    team2Score,
    winnerTeam,
    team1EloChange,
    team2EloChange,
  };
}

function getAchievement(
  result: ReturnType<typeof buildPlayerProfileDerivedData>,
  id: NonNullable<
    ReturnType<typeof buildPlayerProfileDerivedData>["achievements"][number]
  >["id"]
) {
  const achievement = result.achievements.find((entry) => entry.id === id);
  expect(achievement).toBeDefined();
  return achievement!;
}

describe("profileStats", () => {
  it("builds profile summaries across recent form, partners, opponents, and sessions", () => {
    const user = { id: "u1", name: "Alice" };
    const partner1 = { id: "u2", name: "Ben" };
    const partner2 = { id: "u3", name: "Cara" };
    const opponent1 = { id: "u4", name: "Dan" };
    const opponent2 = { id: "u5", name: "Eli" };
    const opponent3 = { id: "u6", name: "Farah" };
    const opponent4 = { id: "u7", name: "Gwen" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "evening-ladder",
        sessionName: "Evening Ladder",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner1],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 8,
      }),
      createMatch("m2", {
        sessionId: "s1",
        sessionCode: "evening-ladder",
        sessionName: "Evening Ladder",
        completedAt: "2026-04-08T12:00:00.000Z",
        team1: [user, partner1],
        team2: [opponent1, opponent3],
        team1Score: 19,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -5,
      }),
      createMatch("m3", {
        sessionId: "s2",
        sessionCode: "friday-race",
        sessionName: "Friday Race",
        completedAt: "2026-04-05T12:00:00.000Z",
        team1: [opponent4, opponent3],
        team2: [user, partner2],
        team1Score: 16,
        team2Score: 21,
        winnerTeam: 2,
        team2EloChange: 6,
      }),
      createMatch("m4", {
        sessionId: "s2",
        sessionCode: "friday-race",
        sessionName: "Friday Race",
        completedAt: "2026-04-02T12:00:00.000Z",
        team1: [user, partner1],
        team2: [opponent1, opponent2],
        team1Score: 17,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -4,
      }),
    ]);

    expect(result.stats).toEqual({
      totalMatches: 4,
      wins: 2,
      losses: 2,
      winRate: 50,
      pointsScored: 78,
      pointsConceded: 76,
      pointDifferential: 2,
      sessionsPlayed: 2,
      averageMatchesPerSession: 2,
      lastPlayedAt: "2026-04-10T12:00:00.000Z",
    });
    expect(result.recentForm).toEqual({
      matches: 4,
      wins: 2,
      losses: 2,
      winRate: 50,
      pointDifferential: 2,
      ratingChange: 5,
      currentStreak: {
        result: "WIN",
        count: 1,
      },
    });
    expect(result.recentSessions.map((session) => session.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(result.trend).toEqual({
      sessions: 2,
      matches: 4,
      wins: 2,
      losses: 2,
      winRate: 50,
      pointDifferential: 2,
      ratingChange: 5,
      direction: "RISING",
      bestSession: expect.objectContaining({
        id: "s1",
      }),
      worstSession: expect.objectContaining({
        id: "s2",
      }),
    });
    expect(result.partners.best).toHaveLength(2);
    expect(result.partners.best[0]).toMatchObject({
      user: partner1,
      matches: 3,
      wins: 1,
      losses: 2,
      winRate: 33,
      pointDifferential: -3,
      ratingChange: -1,
    });
    expect(result.partners.best[1]).toMatchObject({
      user: partner2,
      matches: 1,
    });
    expect(result.opponents.toughest).toHaveLength(3);
    expect(result.opponents.toughest.map((summary) => summary.user)).toEqual([
      opponent1,
      opponent2,
      opponent3,
    ]);
    expect(result.opponents.toughest[0]).toMatchObject({
      user: opponent1,
      matches: 3,
      winRate: 33,
    });
    expect(result.sessions.latest).toMatchObject({
      id: "s1",
      code: "evening-ladder",
      name: "Evening Ladder",
      matches: 2,
      wins: 1,
      losses: 1,
    });
    expect(result.sessions.best).toMatchObject({
      id: "s1",
    });
    expect(result.matchHistory[0]).toMatchObject({
      id: "m1",
      sessionCode: "evening-ladder",
      result: "WIN",
      pointDifferential: 3,
    });
  });

  it("falls back to all connections when nobody meets the preferred match threshold", () => {
    const user = { id: "u1", name: "Alice" };
    const partnerWin = { id: "u2", name: "Ben" };
    const partnerLoss = { id: "u3", name: "Cara" };
    const opponent1 = { id: "u4", name: "Dan" };
    const opponent2 = { id: "u5", name: "Eli" };
    const opponent3 = { id: "u6", name: "Farah" };
    const opponent4 = { id: "u7", name: "Gwen" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partnerWin],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 15,
        winnerTeam: 1,
        team1EloChange: 7,
      }),
      createMatch("m2", {
        sessionId: "s2",
        sessionCode: "week-2",
        sessionName: "Week 2",
        completedAt: "2026-04-09T12:00:00.000Z",
        team1: [user, partnerLoss],
        team2: [opponent3, opponent4],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -6,
      }),
    ]);

    expect(result.partners.best).toHaveLength(2);
    expect(result.partners.best[0]).toMatchObject({
      user: partnerWin,
      matches: 1,
      winRate: 100,
    });
    expect(result.partners.best[1]).toMatchObject({
      user: partnerLoss,
      matches: 1,
      winRate: 0,
    });
    expect(result.trend.direction).toBe("RISING");
    expect(result.opponents.toughest.map((summary) => summary.user)).toEqual([
      opponent3,
      opponent4,
      opponent1,
    ]);
    expect(result.recentForm.currentStreak).toEqual({
      result: "WIN",
      count: 1,
    });
  });

  it("weights toughest opponents so short raw-loss records do not dominate", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const shortOpponent = { id: "u3", name: "Short Sample" };
    const shortMate = { id: "u4", name: "Short Mate" };
    const provenOpponent = { id: "u5", name: "Proven Opponent" };
    const fillers = Array.from({ length: 8 }, (_, index) => ({
      id: `f${index + 1}`,
      name: `Filler ${index + 1}`,
    }));

    const matches: ProfileMatchSource[] = [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [shortOpponent, shortMate],
        team1Score: 16,
        team2Score: 21,
        winnerTeam: 2,
      }),
      createMatch("m2", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-09T12:00:00.000Z",
        team1: [user, partner],
        team2: [shortOpponent, shortMate],
        team1Score: 17,
        team2Score: 21,
        winnerTeam: 2,
      }),
      ...fillers.map((filler, index) =>
        createMatch(`m${index + 3}`, {
          sessionId: "s2",
          sessionCode: "week-2",
          sessionName: "Week 2",
          completedAt: `2026-04-${String(8 - index).padStart(2, "0")}T12:00:00.000Z`,
          team1: [user, partner],
          team2: [provenOpponent, filler],
          team1Score: index < 5 ? 18 : 21,
          team2Score: index < 5 ? 21 : 19,
          winnerTeam: index < 5 ? 2 : 1,
        })
      ),
    ];

    const result = buildPlayerProfileDerivedData(user.id, matches);

    expect(result.opponents.toughest).toHaveLength(3);
    expect(result.opponents.toughest.map((summary) => summary.user)).toEqual([
      provenOpponent,
      shortMate,
      shortOpponent,
    ]);
    expect(result.opponents.toughest[0]).toMatchObject({
      user: provenOpponent,
      matches: 8,
      wins: 3,
      losses: 5,
      winRate: 38,
    });
  });

  it("weights best partners so short perfect records do not dominate", () => {
    const user = { id: "u1", name: "Alice" };
    const shortPartner = { id: "u2", name: "Short Partner" };
    const provenPartner = { id: "u3", name: "Proven Partner" };
    const solidPartner = { id: "u4", name: "Solid Partner" };
    const weakPartner = { id: "u5", name: "Weak Partner" };
    const opponents = Array.from({ length: 28 }, (_, index) => ({
      id: `o${index + 1}`,
      name: `Opponent ${index + 1}`,
    }));

    const matches: ProfileMatchSource[] = [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-12T12:00:00.000Z",
        team1: [user, shortPartner],
        team2: [opponents[0], opponents[1]],
        team1Score: 21,
        team2Score: 17,
        winnerTeam: 1,
      }),
      createMatch("m2", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-11T12:00:00.000Z",
        team1: [user, shortPartner],
        team2: [opponents[2], opponents[3]],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        createMatch(`m${index + 3}`, {
          sessionId: "s2",
          sessionCode: "week-2",
          sessionName: "Week 2",
          completedAt: `2026-04-${String(10 - index).padStart(2, "0")}T12:00:00.000Z`,
          team1: [user, provenPartner],
          team2: [opponents[index * 2 + 4], opponents[index * 2 + 5]],
          team1Score: index < 5 ? 21 : 18,
          team2Score: index < 5 ? 17 : 21,
          winnerTeam: index < 5 ? 1 : 2,
        })
      ),
      createMatch("m11", {
        sessionId: "s3",
        sessionCode: "week-3",
        sessionName: "Week 3",
        completedAt: "2026-04-02T12:00:00.000Z",
        team1: [user, solidPartner],
        team2: [opponents[20], opponents[21]],
        team1Score: 21,
        team2Score: 19,
        winnerTeam: 1,
      }),
      createMatch("m12", {
        sessionId: "s3",
        sessionCode: "week-3",
        sessionName: "Week 3",
        completedAt: "2026-04-01T12:00:00.000Z",
        team1: [user, solidPartner],
        team2: [opponents[22], opponents[23]],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
      }),
      createMatch("m13", {
        sessionId: "s4",
        sessionCode: "week-4",
        sessionName: "Week 4",
        completedAt: "2026-03-31T12:00:00.000Z",
        team1: [user, weakPartner],
        team2: [opponents[24], opponents[25]],
        team1Score: 17,
        team2Score: 21,
        winnerTeam: 2,
      }),
      createMatch("m14", {
        sessionId: "s4",
        sessionCode: "week-4",
        sessionName: "Week 4",
        completedAt: "2026-03-30T12:00:00.000Z",
        team1: [user, weakPartner],
        team2: [opponents[26], opponents[27]],
        team1Score: 16,
        team2Score: 21,
        winnerTeam: 2,
      }),
    ];

    const result = buildPlayerProfileDerivedData(user.id, matches);

    expect(result.partners.best).toHaveLength(3);
    expect(result.partners.best.map((summary) => summary.user)).toEqual([
      provenPartner,
      shortPartner,
      solidPartner,
    ]);
    expect(result.partners.best[0]).toMatchObject({
      user: provenPartner,
      matches: 8,
      wins: 5,
      losses: 3,
      winRate: 63,
    });
  });

  it("groups recent matches into a five-session window", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("m1", {
        sessionId: "s6",
        sessionCode: "week-6",
        sessionName: "Week 6",
        completedAt: "2026-04-12T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 5,
      }),
      createMatch("m2", {
        sessionId: "s6",
        sessionCode: "week-6",
        sessionName: "Week 6",
        completedAt: "2026-04-11T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 19,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -2,
      }),
      createMatch("m3", {
        sessionId: "s5",
        sessionCode: "week-5",
        sessionName: "Week 5",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 17,
        winnerTeam: 1,
        team1EloChange: 4,
      }),
      createMatch("m4", {
        sessionId: "s4",
        sessionCode: "week-4",
        sessionName: "Week 4",
        completedAt: "2026-04-09T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -3,
      }),
      createMatch("m5", {
        sessionId: "s3",
        sessionCode: "week-3",
        sessionName: "Week 3",
        completedAt: "2026-04-08T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 15,
        winnerTeam: 1,
        team1EloChange: 6,
      }),
      createMatch("m6", {
        sessionId: "s2",
        sessionCode: "week-2",
        sessionName: "Week 2",
        completedAt: "2026-04-07T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 17,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -4,
      }),
      createMatch("m7", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-06T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 19,
        winnerTeam: 1,
        team1EloChange: 2,
      }),
    ]);

    expect(result.recentSessions).toHaveLength(PROFILE_RECENT_SESSION_COUNT);
    expect(result.recentSessions.map((session) => session.id)).toEqual([
      "s6",
      "s5",
      "s4",
      "s3",
      "s2",
    ]);
    expect(result.recentSessions[0]).toMatchObject({
      id: "s6",
      matches: 2,
      wins: 1,
      losses: 1,
      pointDifferential: 1,
      ratingChange: 3,
    });
    expect(result.trend).toMatchObject({
      sessions: PROFILE_RECENT_SESSION_COUNT,
      wins: 3,
      losses: 3,
      ratingChange: 6,
      pointDifferential: 4,
    });
  });

  it("marks the trend as slipping when recent sessions lose rating and point differential", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -6,
      }),
      createMatch("m2", {
        sessionId: "s2",
        sessionCode: "week-2",
        sessionName: "Week 2",
        completedAt: "2026-04-08T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 17,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -7,
      }),
    ]);

    expect(result.trend).toMatchObject({
      sessions: 2,
      matches: 2,
      wins: 0,
      losses: 2,
      ratingChange: -13,
      pointDifferential: -7,
      direction: "SLIPPING",
      worstSession: expect.objectContaining({
        id: "s2",
      }),
    });
  });

  it("marks the trend as flat when recent sessions break even", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("m1", {
        sessionId: "s1",
        sessionCode: "week-1",
        sessionName: "Week 1",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 5,
      }),
      createMatch("m2", {
        sessionId: "s2",
        sessionCode: "week-2",
        sessionName: "Week 2",
        completedAt: "2026-04-09T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: -5,
      }),
    ]);

    expect(result.trend).toMatchObject({
      sessions: 2,
      wins: 1,
      losses: 1,
      ratingChange: 0,
      pointDifferential: 0,
      direction: "FLAT",
    });
  });

  it("unlocks permanent session-feat achievements at their minimum thresholds", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };
    const scores = [
      [21, 19],
      [22, 20],
      [21, 18],
      [21, 8],
      [21, 5],
    ] as const;
    const matches = scores.map(([team1Score, team2Score], index) =>
      createMatch(`feat-${index + 1}`, {
        sessionId: "feat-session",
        sessionCode: "feat-session",
        sessionName: "Feat Session",
        completedAt: `2026-04-1${index}T12:00:00.000Z`,
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score,
        team2Score,
        winnerTeam: 1,
      })
    );

    const result = buildPlayerProfileDerivedData(user.id, matches);

    expect(getAchievement(result, "strong-start")).toMatchObject({
      unlocked: true,
      progress: 2,
      target: 2,
    });
    expect(getAchievement(result, "clutch-finish")).toMatchObject({
      unlocked: true,
      progress: 2,
    });
    expect(getAchievement(result, "perfect-session")).toMatchObject({
      unlocked: true,
      progress: 3,
    });
    expect(getAchievement(result, "clean-sweep")).toMatchObject({
      unlocked: true,
      progress: 5,
    });
    expect(getAchievement(result, "close-battle-tested")).toMatchObject({
      unlocked: true,
      progress: 3,
    });
    expect(getAchievement(result, "narrow-survivor")).toMatchObject({
      unlocked: true,
      progress: 2,
    });
    expect(getAchievement(result, "dominant-day")).toMatchObject({
      unlocked: true,
      progress: 5,
    });
    expect(getAchievement(result, "big-differential")).toMatchObject({
      unlocked: true,
      progress: 25,
    });
  });

  it("keeps session-feat achievements locked when one short of the threshold", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };
    const matches = [
      createMatch("short-1", {
        sessionId: "short-session",
        sessionCode: "short-session",
        sessionName: "Short Session",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
      }),
      createMatch("short-2", {
        sessionId: "short-session",
        sessionCode: "short-session",
        sessionName: "Short Session",
        completedAt: "2026-04-11T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 19,
        winnerTeam: 1,
      }),
      createMatch("short-3", {
        sessionId: "short-session",
        sessionCode: "short-session",
        sessionName: "Short Session",
        completedAt: "2026-04-12T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
      }),
      createMatch("short-4", {
        sessionId: "short-session",
        sessionCode: "short-session",
        sessionName: "Short Session",
        completedAt: "2026-04-13T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 20,
        winnerTeam: 1,
      }),
    ];

    const result = buildPlayerProfileDerivedData(user.id, matches);

    expect(getAchievement(result, "strong-start")).toMatchObject({
      unlocked: false,
      progress: 1,
    });
    expect(getAchievement(result, "perfect-session")).toMatchObject({
      unlocked: false,
      progress: 2,
    });
    expect(getAchievement(result, "clean-sweep")).toMatchObject({
      unlocked: false,
      progress: 3,
    });
    expect(getAchievement(result, "dominant-day")).toMatchObject({
      unlocked: false,
      progress: 3,
    });
    expect(getAchievement(result, "big-differential")).toMatchObject({
      unlocked: false,
      progress: 3,
    });
  });

  it("unlocks bounce back after a first-match loss and winning session record", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };

    const result = buildPlayerProfileDerivedData(user.id, [
      createMatch("bounce-1", {
        sessionId: "bounce-session",
        sessionCode: "bounce-session",
        sessionName: "Bounce Session",
        completedAt: "2026-04-10T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
      }),
      createMatch("bounce-2", {
        sessionId: "bounce-session",
        sessionCode: "bounce-session",
        sessionName: "Bounce Session",
        completedAt: "2026-04-11T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 19,
        winnerTeam: 1,
      }),
      createMatch("bounce-3", {
        sessionId: "bounce-session",
        sessionCode: "bounce-session",
        sessionName: "Bounce Session",
        completedAt: "2026-04-12T12:00:00.000Z",
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
      }),
    ]);

    expect(getAchievement(result, "bounce-back")).toMatchObject({
      unlocked: true,
      progress: 1,
    });
  });

  it("counts podium achievement chains at 1, 3, 5, and 10 top-three finishes", () => {
    const user = { id: "u1", name: "Alice" };
    const partner = { id: "u2", name: "Ben" };
    const opponent1 = { id: "u3", name: "Cara" };
    const opponent2 = { id: "u4", name: "Dan" };
    const sessionPlayers = [
      { userId: user.id, sessionPoints: 9, user },
      { userId: partner.id, sessionPoints: 6, user: partner },
      { userId: opponent1.id, sessionPoints: 3, user: opponent1 },
      { userId: opponent2.id, sessionPoints: 0, user: opponent2 },
    ];
    const matches = Array.from({ length: 10 }, (_, index) =>
      createMatch(`podium-${index + 1}`, {
        sessionId: `podium-session-${index + 1}`,
        sessionCode: `podium-session-${index + 1}`,
        sessionName: `Podium Session ${index + 1}`,
        completedAt: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        team1: [user, partner],
        team2: [opponent1, opponent2],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        sessionPlayers,
        sessionMatches: [
          {
            id: `podium-session-match-${index + 1}`,
            team1User1Id: user.id,
            team1User2Id: partner.id,
            team2User1Id: opponent1.id,
            team2User2Id: opponent2.id,
            team1Score: 21,
            team2Score: 18,
            winnerTeam: 1,
          },
        ],
      })
    );

    const result = buildPlayerProfileDerivedData(user.id, matches);

    expect(getAchievement(result, "podium-finish")).toMatchObject({
      unlocked: true,
      progress: 1,
      target: 1,
    });
    expect(getAchievement(result, "podium-regular")).toMatchObject({
      unlocked: true,
      progress: 3,
      target: 3,
    });
    expect(getAchievement(result, "podium-mainstay")).toMatchObject({
      unlocked: true,
      progress: 5,
      target: 5,
    });
    expect(getAchievement(result, "podium-legend")).toMatchObject({
      unlocked: true,
      progress: 10,
      target: 10,
    });
  });
});
