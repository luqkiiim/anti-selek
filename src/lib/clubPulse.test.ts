import { describe, expect, it } from "vitest";
import {
  buildClubPulse,
  type ClubPulseMatchSource,
  type ClubPulseMemberSource,
  type ClubPulseSessionSource,
} from "./clubPulse";

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
): ClubPulseMemberSource {
  return {
    ...user,
    elo,
  };
}

function createSession(
  id: string,
  overrides: Partial<ClubPulseSessionSource> = {}
): ClubPulseSessionSource {
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
    eloAdjustments,
  }: {
    session: ClubPulseSessionSource;
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
    eloAdjustments?: ClubPulseMatchSource["eloAdjustments"];
  }
): ClubPulseMatchSource {
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
    eloAdjustments,
  };
}

function createPlayer(id: string, name = id) {
  return { id, name };
}

function createRivalrySeries({
  idPrefix,
  session,
  left,
  right,
  leftWins,
  rightWins,
  startAtMs = Date.UTC(2026, 4, 1, 10, 0, 0),
}: {
  idPrefix: string;
  session: ClubPulseSessionSource;
  left: { id: string; name: string };
  right: { id: string; name: string };
  leftWins: number;
  rightWins: number;
  startAtMs?: number;
}) {
  const matches: ClubPulseMatchSource[] = [];
  const totalMatches = leftWins + rightWins;

  for (let index = 0; index < totalMatches; index += 1) {
    const leftWon = index < leftWins;
    matches.push(
      createMatch(`${idPrefix}-${index + 1}`, {
        session,
        completedAt: new Date(startAtMs + index * 60_000).toISOString(),
        team1: [left, createPlayer(`${idPrefix}-left-partner-${index + 1}`)],
        team2: [right, createPlayer(`${idPrefix}-right-partner-${index + 1}`)],
        team1Score: leftWon ? 21 : 18,
        team2Score: leftWon ? 18 : 21,
        winnerTeam: leftWon ? 1 : 2,
      })
    );
  }

  return matches;
}

describe("clubPulse", () => {
  it("returns quiet empty-state data when a club has no matches", () => {
    const result = buildClubPulse({
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
        totalMatches: 0,
        totalSessions: 0,
        lastPlayedAt: null,
      },
      hotPlayers: [],
      ratingMovers: [],
      rivalries: [],
      partnerships: [],
      recentMatches: [],
      sessionNews: [],
      latestStory: null,
    });
  });

  it("counts active sessions without requiring completed match history", () => {
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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

  it("ranks a long close rivalry above a short perfect split", () => {
    const session = createSession("rivalry-strength-history");
    const longLeft = createPlayer("long-left", "Long Left");
    const longRight = createPlayer("long-right", "Long Right");
    const shortLeft = createPlayer("short-left", "Short Left");
    const shortRight = createPlayer("short-right", "Short Right");
    const result = buildClubPulse({
      members: [longLeft, longRight, shortLeft, shortRight].map((player) =>
        createMember(player)
      ),
      sessions: [session],
      completedMatches: [
        ...createRivalrySeries({
          idPrefix: "long-close",
          session,
          left: longLeft,
          right: longRight,
          leftWins: 24,
          rightWins: 22,
        }),
        ...createRivalrySeries({
          idPrefix: "short-split",
          session,
          left: shortLeft,
          right: shortRight,
          leftWins: 3,
          rightWins: 3,
          startAtMs: Date.UTC(2026, 5, 1, 10, 0, 0),
        }),
      ],
    });

    expect(result.rivalries[0]).toMatchObject({
      players: [longLeft, longRight],
      matches: 46,
      playerOneWins: 24,
      playerTwoWins: 22,
    });
  });

  it("prefers the longer rivalry when close records have the same win gap", () => {
    const session = createSession("rivalry-strength-same-gap");
    const longLeft = createPlayer("same-gap-long-left", "Same Gap Long Left");
    const longRight = createPlayer("same-gap-long-right", "Same Gap Long Right");
    const shortLeft = createPlayer("same-gap-short-left", "Same Gap Short Left");
    const shortRight = createPlayer(
      "same-gap-short-right",
      "Same Gap Short Right"
    );
    const result = buildClubPulse({
      members: [longLeft, longRight, shortLeft, shortRight].map((player) =>
        createMember(player)
      ),
      sessions: [session],
      completedMatches: [
        ...createRivalrySeries({
          idPrefix: "same-gap-long",
          session,
          left: longLeft,
          right: longRight,
          leftWins: 22,
          rightWins: 24,
        }),
        ...createRivalrySeries({
          idPrefix: "same-gap-short",
          session,
          left: shortLeft,
          right: shortRight,
          leftWins: 12,
          rightWins: 14,
          startAtMs: Date.UTC(2026, 5, 1, 10, 0, 0),
        }),
      ],
    });

    expect(result.rivalries[0]).toMatchObject({
      players: [longLeft, longRight],
      matches: 46,
      playerOneWins: 22,
      playerTwoWins: 24,
    });
  });

  it("does not let one-sided volume beat a genuinely competitive rivalry", () => {
    const session = createSession("rivalry-strength-one-sided");
    const oneSidedLeft = createPlayer("one-sided-left", "One Sided Left");
    const oneSidedRight = createPlayer("one-sided-right", "One Sided Right");
    const splitLeft = createPlayer("split-left", "Split Left");
    const splitRight = createPlayer("split-right", "Split Right");
    const result = buildClubPulse({
      members: [oneSidedLeft, oneSidedRight, splitLeft, splitRight].map(
        (player) => createMember(player)
      ),
      sessions: [session],
      completedMatches: [
        ...createRivalrySeries({
          idPrefix: "one-sided",
          session,
          left: oneSidedLeft,
          right: oneSidedRight,
          leftWins: 10,
          rightWins: 0,
        }),
        ...createRivalrySeries({
          idPrefix: "split",
          session,
          left: splitLeft,
          right: splitRight,
          leftWins: 3,
          rightWins: 3,
          startAtMs: Date.UTC(2026, 5, 1, 10, 0, 0),
        }),
      ],
    });

    expect(result.rivalries[0]).toMatchObject({
      players: [splitLeft, splitRight],
      matches: 6,
      playerOneWins: 3,
      playerTwoWins: 3,
    });
  });

  it("balances volume with closeness in the rivalry strength formula", () => {
    const session = createSession("rivalry-strength-balance");
    const perfectSplitLeft = createPlayer(
      "balance-a-perfect-left",
      "A Perfect Left"
    );
    const perfectSplitRight = createPlayer(
      "balance-a-perfect-right",
      "A Perfect Right"
    );
    const closeVolumeLeft = createPlayer(
      "balance-b-volume-left",
      "B Volume Left"
    );
    const closeVolumeRight = createPlayer(
      "balance-b-volume-right",
      "B Volume Right"
    );
    const lessCloseVolumeLeft = createPlayer(
      "balance-c-less-close-left",
      "C Less Close Left"
    );
    const lessCloseVolumeRight = createPlayer(
      "balance-c-less-close-right",
      "C Less Close Right"
    );
    const result = buildClubPulse({
      members: [
        perfectSplitLeft,
        perfectSplitRight,
        closeVolumeLeft,
        closeVolumeRight,
        lessCloseVolumeLeft,
        lessCloseVolumeRight,
      ].map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        ...createRivalrySeries({
          idPrefix: "balance-perfect",
          session,
          left: perfectSplitLeft,
          right: perfectSplitRight,
          leftWins: 3,
          rightWins: 3,
        }),
        ...createRivalrySeries({
          idPrefix: "balance-volume",
          session,
          left: closeVolumeLeft,
          right: closeVolumeRight,
          leftWins: 9,
          rightWins: 7,
        }),
        ...createRivalrySeries({
          idPrefix: "balance-less-close",
          session,
          left: lessCloseVolumeLeft,
          right: lessCloseVolumeRight,
          leftWins: 8,
          rightWins: 4,
          startAtMs: Date.UTC(2026, 5, 1, 10, 0, 0),
        }),
      ],
    });

    expect(result.rivalries).toEqual([
      expect.objectContaining({
        players: [closeVolumeLeft, closeVolumeRight],
      }),
      expect.objectContaining({
        players: [perfectSplitLeft, perfectSplitRight],
      }),
      expect.objectContaining({
        players: [lessCloseVolumeLeft, lessCloseVolumeRight],
      }),
    ]);
  });

  it("uses recency when rivalry strength, matches, and win gap are tied", () => {
    const session = createSession("rivalry-strength-recency");
    const recentLeft = createPlayer("recency-recent-left", "Recent Left");
    const recentRight = createPlayer("recency-recent-right", "Recent Right");
    const olderLeft = createPlayer("recency-older-left", "Older Left");
    const olderRight = createPlayer("recency-older-right", "Older Right");
    const result = buildClubPulse({
      members: [recentLeft, recentRight, olderLeft, olderRight].map((player) =>
        createMember(player)
      ),
      sessions: [session],
      completedMatches: [
        ...createRivalrySeries({
          idPrefix: "recency-older",
          session,
          left: olderLeft,
          right: olderRight,
          leftWins: 2,
          rightWins: 2,
          startAtMs: Date.UTC(2026, 6, 1, 10, 0, 0),
        }),
        ...createRivalrySeries({
          idPrefix: "recency-recent",
          session,
          left: recentLeft,
          right: recentRight,
          leftWins: 2,
          rightWins: 2,
          startAtMs: Date.UTC(2026, 7, 1, 10, 0, 0),
        }),
      ],
    });

    expect(result.rivalries[0]).toMatchObject({
      players: [recentLeft, recentRight],
      matches: 4,
      playerOneWins: 2,
      playerTwoWins: 2,
    });
  });

  it("keeps only the top-ranked unique rivalry per player", () => {
    const session = createSession("unique-rivalries");
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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
      [players.cara, players.hugo],
    ]);
    expect(result.partnerships).not.toContainEqual(
      expect.objectContaining({
        players: [players.alice, players.cara],
      })
    );
  });

  it("allows partnership results to stay short when only repeat players remain", () => {
    const session = createSession("short-partnerships");
    const result = buildClubPulse({
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
    const result = buildClubPulse({
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

    const result = buildClubPulse({
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

  it("generates stat-backed session news from the latest completed session", () => {
    const oldSession = createSession("old-news", {
      endedAt: "2026-05-01T12:00:00.000Z",
    });
    const latestSession = createSession("latest-news", {
      name: "Friday Mexicano",
      endedAt: "2026-05-08T12:00:00.000Z",
    });
    const members = Object.values(players).map((player) =>
      createMember(player)
    );
    const completedMatches = [
      createMatch("old-loss-1", {
        session: oldSession,
        completedAt: "2026-05-01T10:00:00.000Z",
        team1: [players.cara, players.dan],
        team2: [players.alice, players.ben],
        team1Score: 21,
        team2Score: 17,
        winnerTeam: 1,
        team1EloChange: 10,
        team2EloChange: -10,
        eloAdjustments: [
          { userId: "alice", delta: -10, beforeElo: 1010, afterElo: 1000 },
          { userId: "ben", delta: -10, beforeElo: 1080, afterElo: 1070 },
          { userId: "cara", delta: 10, beforeElo: 1180, afterElo: 1190 },
          { userId: "dan", delta: 10, beforeElo: 1160, afterElo: 1170 },
        ],
      }),
      createMatch("old-loss-2", {
        session: oldSession,
        completedAt: "2026-05-01T11:00:00.000Z",
        team1: [players.eli, players.farah],
        team2: [players.alice, players.gina],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 10,
        team2EloChange: -10,
        eloAdjustments: [
          { userId: "alice", delta: -10, beforeElo: 1000, afterElo: 990 },
          { userId: "gina", delta: -10, beforeElo: 1000, afterElo: 990 },
          { userId: "eli", delta: 10, beforeElo: 1100, afterElo: 1110 },
          { userId: "farah", delta: 10, beforeElo: 1110, afterElo: 1120 },
        ],
      }),
      createMatch("latest-upset", {
        session: latestSession,
        completedAt: "2026-05-08T10:00:00.000Z",
        team1: [players.alice, players.ben],
        team2: [players.cara, players.dan],
        team1Score: 21,
        team2Score: 15,
        winnerTeam: 1,
        team1EloChange: 18,
        team2EloChange: -18,
        eloAdjustments: [
          { userId: "alice", delta: 18, beforeElo: 990, afterElo: 1008 },
          { userId: "ben", delta: 18, beforeElo: 1080, afterElo: 1098 },
          { userId: "cara", delta: -18, beforeElo: 1300, afterElo: 1282 },
          { userId: "dan", delta: -18, beforeElo: 1280, afterElo: 1262 },
        ],
      }),
      createMatch("latest-win-2", {
        session: latestSession,
        completedAt: "2026-05-08T10:30:00.000Z",
        team1: [players.alice, players.eli],
        team2: [players.cara, players.farah],
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 10,
        team2EloChange: -10,
        eloAdjustments: [
          { userId: "alice", delta: 10, beforeElo: 1008, afterElo: 1018 },
          { userId: "eli", delta: 10, beforeElo: 1110, afterElo: 1120 },
          { userId: "cara", delta: -10, beforeElo: 1282, afterElo: 1272 },
          { userId: "farah", delta: -10, beforeElo: 1120, afterElo: 1110 },
        ],
      }),
      createMatch("latest-win-3", {
        session: latestSession,
        completedAt: "2026-05-08T11:00:00.000Z",
        team1: [players.alice, players.gina],
        team2: [players.ben, players.dan],
        team1Score: 21,
        team2Score: 19,
        winnerTeam: 1,
        team1EloChange: 8,
        team2EloChange: -8,
        eloAdjustments: [
          { userId: "alice", delta: 8, beforeElo: 1018, afterElo: 1026 },
          { userId: "gina", delta: 8, beforeElo: 990, afterElo: 998 },
          { userId: "ben", delta: -8, beforeElo: 1098, afterElo: 1090 },
          { userId: "dan", delta: -8, beforeElo: 1262, afterElo: 1254 },
        ],
      }),
    ];

    const result = buildClubPulse({
      members,
      sessions: [oldSession, latestSession],
      completedMatches,
    });

    expect(result.metrics).toMatchObject({
      totalMatches: 5,
      totalSessions: 2,
      lastPlayedAt: "2026-05-08T11:00:00.000Z",
    });
    expect(result.ratingMovers[0]).toMatchObject({
      user: players.alice,
      ratingChange: 36,
      wins: 3,
      losses: 0,
    });
    expect(result.sessionNews.map((item) => item.type)).toEqual([
      "RATING_JUMP",
      "PERFECT_SESSION",
      "UPSET",
      "STREAK_EXTENDED",
      "BOUNCE_BACK",
      "NEW_PEAK",
    ]);
    expect(result.sessionNews[0]).toMatchObject({
      title: "Alice",
      detail: "Biggest rating jump",
      value: "+36 rating",
      featuredPlayers: [players.alice],
      likeCount: 0,
      likedByMe: false,
    });
    expect(result.sessionNews.find((item) => item.type === "UPSET")).toMatchObject({
      detail: "Beat higher-rated Cara / Dan",
      value: "+510 gap",
      players: [players.alice, players.ben, players.cara, players.dan],
      featuredPlayers: [players.alice, players.ben],
    });
  });

  it("omits session news when a completed session has no qualifying highlight", () => {
    const session = createSession("quiet-news");
    const result = buildClubPulse({
      members: Object.values(players).map((player) => createMember(player)),
      sessions: [session],
      completedMatches: [
        createMatch("quiet-match", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
        }),
      ],
    });

    expect(result.sessionNews).toEqual([]);
    expect(result.ratingMovers).toEqual([]);
  });

  it("excludes guests from pulse people while keeping member match results", () => {
    const guestAce = createPlayer("guest-ace", "Guest Ace");
    const guestMate = createPlayer("guest-mate", "Guest Mate");
    const session = createSession("guest-pulse", {
      players: [
        { user: players.alice },
        { user: players.ben },
        { user: players.cara },
        { user: players.dan },
        { user: guestAce, isGuest: true },
        { user: guestMate, isGuest: true },
      ],
    });

    const result = buildClubPulse({
      members: [players.alice, players.ben, players.cara, players.dan].map(
        (player) => createMember(player)
      ),
      sessions: [session],
      completedMatches: [
        createMatch("guest-win-1", {
          session,
          completedAt: "2026-05-01T10:00:00.000Z",
          team1: [guestAce, guestMate],
          team2: [players.alice, players.ben],
          team1Score: 21,
          team2Score: 10,
          winnerTeam: 1,
          team1EloChange: 20,
          team2EloChange: -20,
        }),
        createMatch("guest-win-2", {
          session,
          completedAt: "2026-05-02T10:00:00.000Z",
          team1: [guestAce, guestMate],
          team2: [players.alice, players.ben],
          team1Score: 21,
          team2Score: 12,
          winnerTeam: 1,
          team1EloChange: 20,
          team2EloChange: -20,
        }),
        createMatch("member-win-1", {
          session,
          completedAt: "2026-05-03T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
          team1EloChange: 5,
          team2EloChange: -5,
        }),
        createMatch("member-win-2", {
          session,
          completedAt: "2026-05-04T10:00:00.000Z",
          team1: [players.alice, players.ben],
          team2: [players.cara, players.dan],
          team1Score: 21,
          team2Score: 17,
          winnerTeam: 1,
          team1EloChange: 5,
          team2EloChange: -5,
        }),
      ],
    });

    const guestIds = new Set([guestAce.id, guestMate.id]);

    expect(result.metrics).toMatchObject({
      recentMatches: 4,
      activePlayers: 4,
    });
    const hotPlayerIds = result.hotPlayers.map((player) => player.user.id);
    expect(hotPlayerIds).not.toContain(guestAce.id);
    expect(hotPlayerIds).not.toContain(guestMate.id);
    expect(result.latestStory).toMatchObject({
      matches: 4,
      session: {
        playerCount: 4,
      },
      topPerformer: {
        user: players.alice,
      },
    });
    expect(result.rivalries.length).toBeGreaterThan(0);
    expect(result.partnerships.length).toBeGreaterThan(0);
    const rivalryPlayerIds = result.rivalries.flatMap((rivalry) =>
      rivalry.players.map((player) => player.id)
    );
    const partnershipPlayerIds = result.partnerships.flatMap((partnership) =>
      partnership.players.map((player) => player.id)
    );

    for (const guestId of guestIds) {
      expect(rivalryPlayerIds).not.toContain(guestId);
      expect(partnershipPlayerIds).not.toContain(guestId);
    }
  });
});
