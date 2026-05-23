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
  gina: { id: "gina", name: "Gina" },
  hugo: { id: "hugo", name: "Hugo" },
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
      partnerships: [],
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

    expect(result.metrics).toMatchObject({
      recentMatches: 2,
      activePlayers: 4,
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

  it("keeps only the top-ranked unique rivalry per player", () => {
    const session = createSession("unique-rivalries");
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
          team2Score: 18,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.dan, players.farah],
          team1Score: 17,
          team2Score: 21,
          winnerTeam: 2,
        }),
        createMatch("m3", {
          session,
          completedAt: "2026-05-03T10:00:00.000Z",
          team1: [players.alice, players.gina],
          team2: [players.dan, players.hugo],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
        createMatch("m4", {
          session,
          completedAt: "2026-05-04T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.dan, players.farah],
          team1Score: 18,
          team2Score: 21,
          winnerTeam: 2,
        }),
        createMatch("m5", {
          session,
          completedAt: "2026-05-05T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.eli, players.gina],
          team1Score: 21,
          team2Score: 17,
          winnerTeam: 1,
        }),
        createMatch("m6", {
          session,
          completedAt: "2026-05-06T10:00:00.000Z",
          team1: [players.alice, players.hugo],
          team2: [players.eli, players.farah],
          team1Score: 18,
          team2Score: 21,
          winnerTeam: 2,
        }),
        createMatch("m7", {
          session,
          completedAt: "2026-05-01T08:00:00.000Z",
          team1: [players.ben, players.gina],
          team2: [players.farah, players.hugo],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
        createMatch("m8", {
          session,
          completedAt: "2026-05-02T08:00:00.000Z",
          team1: [players.ben, players.cara],
          team2: [players.farah, players.dan],
          team1Score: 18,
          team2Score: 21,
          winnerTeam: 2,
        }),
        createMatch("m9", {
          session,
          completedAt: "2026-05-03T08:00:00.000Z",
          team1: [players.ben, players.eli],
          team2: [players.farah, players.gina],
          team1Score: 21,
          team2Score: 16,
          winnerTeam: 1,
        }),
      ],
    });

    expect(result.rivalries[0]).toMatchObject({
      players: [players.alice, players.dan],
      matches: 4,
      playerOneWins: 2,
      playerTwoWins: 2,
    });
    expect(
      result.rivalries.filter((rivalry) =>
        rivalry.players.some((player) => player.id === players.alice.id)
      )
    ).toHaveLength(1);
    expect(result.rivalries).not.toContainEqual(
      expect.objectContaining({
        players: [players.alice, players.eli],
      })
    );
  });

  it("allows rivalry results to stay short when only repeat players remain", () => {
    const session = createSession("short-rivalries");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("m1", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [players.alice, players.eli],
          team2: [players.cara, players.farah],
          team1Score: 18,
          team2Score: 21,
          winnerTeam: 2,
        }),
      ],
    });

    expect(result.rivalries).toHaveLength(1);
    expect(result.rivalries.map((rivalry) => rivalry.players)).toEqual([
      [players.alice, players.cara],
    ]);
  });

  it("ranks strong partner chemistry above a higher-volume .500 duo", () => {
    const session = createSession("partnerships");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        ...Array.from({ length: 11 }, (_, index) =>
          createMatch(`strong-${index + 1}`, {
            session,
            completedAt: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.alice, players.ben],
            team2: [players.eli, players.farah],
            team1Score: index < 10 ? 21 : 18,
            team2Score: index < 10 ? 16 : 21,
            winnerTeam: index < 10 ? 1 : 2,
          })
        ),
        ...Array.from({ length: 26 }, (_, index) =>
          createMatch(`balanced-${index + 1}`, {
            session,
            completedAt: `2026-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.cara, players.dan],
            team2: [players.gina, players.hugo],
            team1Score: index < 13 ? 21 : 18,
            team2Score: index < 13 ? 18 : 21,
            winnerTeam: index < 13 ? 1 : 2,
          })
        ),
      ],
    });

    expect(result.partnerships[0]).toMatchObject({
      players: [players.alice, players.ben],
      matches: 11,
      wins: 10,
      losses: 1,
      winRate: 91,
    });
    expect(result.partnerships[1]).toMatchObject({
      players: [players.cara, players.dan],
      matches: 26,
      wins: 13,
      losses: 13,
      winRate: 50,
    });
  });

  it("keeps only the top-ranked unique partnership per player", () => {
    const session = createSession("unique-partnerships");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        ...Array.from({ length: 9 }, (_, index) =>
          createMatch(`alice-ben-${index + 1}`, {
            session,
            completedAt: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.alice, players.ben],
            team2: [players.eli, players.farah],
            team1Score: index < 8 ? 21 : 18,
            team2Score: index < 8 ? 15 : 21,
            winnerTeam: index < 8 ? 1 : 2,
          })
        ),
        ...Array.from({ length: 8 }, (_, index) =>
          createMatch(`alice-cara-${index + 1}`, {
            session,
            completedAt: `2026-06-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.alice, players.cara],
            team2: [players.gina, players.hugo],
            team1Score: index < 7 ? 21 : 17,
            team2Score: index < 7 ? 16 : 21,
            winnerTeam: index < 7 ? 1 : 2,
          })
        ),
        ...Array.from({ length: 7 }, (_, index) =>
          createMatch(`dan-eli-${index + 1}`, {
            session,
            completedAt: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.dan, players.eli],
            team2: [players.ben, players.farah],
            team1Score: index < 6 ? 21 : 18,
            team2Score: index < 6 ? 14 : 21,
            winnerTeam: index < 6 ? 1 : 2,
          })
        ),
        ...Array.from({ length: 6 }, (_, index) =>
          createMatch(`farah-gina-${index + 1}`, {
            session,
            completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
            team1: [players.farah, players.gina],
            team2: [players.cara, players.hugo],
            team1Score: index < 5 ? 21 : 19,
            team2Score: index < 5 ? 18 : 21,
            winnerTeam: index < 5 ? 1 : 2,
          })
        ),
      ],
    });

    expect(result.partnerships.map((partnership) => partnership.players)).toEqual([
      [players.alice, players.ben],
      [players.dan, players.eli],
      [players.farah, players.gina],
    ]);
    expect(result.partnerships).not.toContainEqual(
      expect.objectContaining({
        players: [players.alice, players.cara],
      })
    );
  });

  it("allows partnership results to stay short when only repeat players remain", () => {
    const session = createSession("short-partnerships");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("m1", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.eli, players.farah],
          team1Score: 21,
          team2Score: 10,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.gina, players.hugo],
          team1Score: 21,
          team2Score: 11,
          winnerTeam: 1,
        }),
        createMatch("m3", {
          session,
          completedAt: "2026-05-03T10:00:00.000Z",
          team1: [players.cara, players.dan],
          team2: [players.eli, players.gina],
          team1Score: 21,
          team2Score: 15,
          winnerTeam: 1,
        }),
        createMatch("m4", {
          session,
          completedAt: "2026-05-04T10:00:00.000Z",
          team1: [players.cara, players.dan],
          team2: [players.ben, players.hugo],
          team1Score: 21,
          team2Score: 16,
          winnerTeam: 1,
        }),
        createMatch("m5", {
          session,
          completedAt: "2026-05-05T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.ben, players.eli],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
        createMatch("m6", {
          session,
          completedAt: "2026-05-06T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.dan, players.farah],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
      ],
    });

    expect(result.partnerships).toHaveLength(2);
    expect(result.partnerships.map((partnership) => partnership.players)).toEqual([
      [players.alice, players.ben],
      [players.cara, players.dan],
    ]);
  });

  it("requires at least two matches together before a partnership appears", () => {
    const session = createSession("single-pairs");
    const result = buildCommunityPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("m1", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 17,
          winnerTeam: 1,
        }),
        createMatch("m2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [players.alice, players.cara],
          team2: [players.ben, players.dan],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
      ],
    });

    expect(result.partnerships).toEqual([]);
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
