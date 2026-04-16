import { describe, expect, it } from "vitest";
import { buildPlayerProfileDerivedData, type ProfileMatchSource } from "./profileStats";

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
  }
): ProfileMatchSource {
  return {
    id,
    completedAt: new Date(completedAt),
    session: {
      id: sessionId,
      code: sessionCode,
      name: sessionName,
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
    expect(result.partners.mostPlayed).toMatchObject({
      user: partner1,
      matches: 3,
      wins: 1,
      losses: 2,
      winRate: 33,
      pointDifferential: -3,
      ratingChange: -1,
    });
    expect(result.partners.bestWinRate).toMatchObject({
      user: partner1,
    });
    expect(result.opponents.mostFaced).toMatchObject({
      user: opponent1,
      matches: 3,
    });
    expect(result.opponents.toughest).toMatchObject({
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

    expect(result.partners.mostPlayed).toMatchObject({
      user: partnerWin,
      matches: 1,
    });
    expect(result.partners.bestWinRate).toMatchObject({
      user: partnerWin,
      winRate: 100,
    });
    expect(result.opponents.toughest).toMatchObject({
      user: opponent3,
      winRate: 0,
    });
    expect(result.recentForm.currentStreak).toEqual({
      result: "WIN",
      count: 1,
    });
  });
});
