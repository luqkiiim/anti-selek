import { describe, expect, it } from "vitest";
import {
  buildCommunityPulse,
  type CommunityPulseMatchSource,
  type CommunityPulseMemberSource,
  type CommunityPulseSessionSource,
} from "./communityPulse";

const players = {
  alice: { id: "alice", name: "Alice" },
  ben: { id: "ben", name: "Ben" },
  cara: { id: "cara", name: "Cara" },
  dan: { id: "dan", name: "Dan" },
  eli: { id: "eli", name: "Eli" },
  farah: { id: "farah", name: "Farah" },
};

function createMember(
  user: { id: string; name: string },
  elo = 1000
): CommunityPulseMemberSource {
  return {
    ...user,
    elo,
  };
}

function createSession(
  id: string,
  overrides: Partial<CommunityPulseSessionSource> = {}
): CommunityPulseSessionSource {
  return {
    id,
    code: `${id}-code`,
    name: `Session ${id}`,
    type: "POINTS",
    status: "COMPLETED",
    isTest: false,
    createdAt: "2026-05-01T10:00:00.000Z",
    endedAt: "2026-05-01T12:00:00.000Z",
    players: Object.values(players).map((user) => ({ user })),
    ...overrides,
  };
}

function createMatch(
  id: string,
  {
    session,
    completedAt,
    team1,
    team2,
    team1Score,
    team2Score,
    winnerTeam,
    team1EloChange = null,
    team2EloChange = null,
  }: {
    session: CommunityPulseSessionSource;
    completedAt: string;
    team1: [
      { id: string; name: string },
      { id: string; name: string },
    ];
    team2: [
      { id: string; name: string },
      { id: string; name: string },
    ];
    team1Score: number;
    team2Score: number;
    winnerTeam: number;
    team1EloChange?: number | null;
    team2EloChange?: number | null;
  }
): CommunityPulseMatchSource {
  return {
    id,
    completedAt,
    session: {
      id: session.id,
      code: session.code,
      name: session.name,
      type: session.type,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
    },
    winnerTeam,
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
    team1EloChange,
    team2EloChange,
  };
}

describe("communityPulse", () => {
  it("returns quiet empty-state data when a community has no matches", () => {
    const result = buildCommunityPulse({
      members: [createMember(players.alice), createMember(players.ben)],
      sessions: [],
      completedMatches: [],
    });

    expect(result).toEqual({
      metrics: {
        members: 2,
        activeTournaments: 0,
        completedTournaments: 0,
        recentMatches: 0,
        activePlayers: 0,
      },
      hotPlayers: [],
      rivalries: [],
      latestStory: null,
    });
  });

  it("counts active sessions without requiring completed match history", () => {
    const result = buildCommunityPulse({
      members: [createMember(players.alice)],
      sessions: [
        createSession("waiting", { status: "WAITING", endedAt: null }),
        createSession("active", { status: "ACTIVE", endedAt: null }),
        createSession("done", { status: "COMPLETED" }),
        createSession("test", { status: "ACTIVE", isTest: true }),
      ],
      completedMatches: [],
    });

    expect(result.metrics).toMatchObject({
      activeTournaments: 2,
      completedTournaments: 1,
      recentMatches: 0,
    });
  });

  it("surfaces hot players from recent wins, streaks, and rating movement", () => {
    const session = createSession("latest");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("m1", {
          session,
          completedAt: "2026-05-03T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 16,
          winnerTeam: 1,
          team1EloChange: 5,
          team2EloChange: -5,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-04T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.ben, players.dan],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
          team1EloChange: 4,
          team2EloChange: -4,
        }),
      ],
    });

    expect(result.hotPlayers[0]).toMatchObject({
      user: players.alice,
      matches: 2,
      wins: 2,
      winRate: 100,
      ratingChange: 9,
      pointDifferential: 8,
      currentStreak: {
        result: "WIN",
        count: 2,
      },
    });
  });

  it("finds close repeated opponent pairs as rivalry candidates", () => {
    const session = createSession("rivalry");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("m1", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.dan, players.eli],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [players.dan, players.cara],
          team2: [players.alice, players.farah],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
        createMatch("m3", {
          session,
          completedAt: "2026-05-03T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.dan, players.ben],
          team1Score: 21,
          team2Score: 17,
          winnerTeam: 1,
        }),
      ],
    });

    const aliceDanRivalry = result.rivalries.find((rivalry) =>
      rivalry.players.every((player) =>
        [players.alice.id, players.dan.id].includes(player.id)
      )
    );

    expect(aliceDanRivalry).toMatchObject({
      matches: 3,
      playerOneWins: 2,
      playerTwoWins: 1,
      lastSession: {
        code: "rivalry-code",
        name: "Session rivalry",
      },
    });
  });

  it("summarizes the latest completed tournament story", () => {
    const oldSession = createSession("old", {
      endedAt: "2026-04-20T12:00:00.000Z",
    });
    const latestSession = createSession("latest", {
      name: "Friday Night",
      endedAt: "2026-05-04T12:00:00.000Z",
      players: [
        { user: players.alice },
        { user: players.ben },
        { user: players.cara },
        { user: players.dan },
      ],
    });

    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [oldSession, latestSession],
      completedMatches: [
        createMatch("m1", {
          session: oldSession,
          completedAt: "2026-04-20T11:00:00.000Z",
          team1: [players.cara, players.dan],
          team2: [players.eli, players.farah],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session: latestSession,
          completedAt: "2026-05-04T11:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 15,
          winnerTeam: 1,
          team1EloChange: 6,
          team2EloChange: -6,
        }),
      ],
    });

    expect(result.latestStory).toMatchObject({
      session: {
        id: "latest",
        code: "latest-code",
        name: "Friday Night",
        playerCount: 4,
      },
      matches: 1,
      topPerformer: {
        user: players.alice,
        wins: 1,
        winRate: 100,
        ratingChange: 6,
      },
    });
  });
});
