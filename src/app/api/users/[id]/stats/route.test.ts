import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  buildPlayerProfileDerivedData: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    match: {
      findMany: mocks.matchFindMany,
    },
    communityMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/profileStats", () => ({
  buildPlayerProfileDerivedData: mocks.buildPlayerProfileDerivedData,
}));

vi.mock("@/lib/profileCommunityRank", () => ({
  buildProfileCommunityRankWindow: vi.fn(() => ({
    leaderboardSize: 0,
    currentRank: null,
    previousRank: null,
    rankDelta: null,
  })),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

describe("user stats route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.auth.mockResolvedValue({
      user: { id: "viewer-1", isAdmin: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Alex Lee",
      avatarKey: "https://blob.vercel-storage.com/avatars/user-1/profile.webp",
      elo: 1333,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
    });
    mocks.matchFindMany.mockResolvedValue([]);
    mocks.buildPlayerProfileDerivedData.mockReturnValue({
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pointsScored: 0,
        pointsConceded: 0,
        pointDifferential: 0,
        sessionsPlayed: 0,
        averageMatchesPerSession: 0,
        lastPlayedAt: null,
      },
      recentForm: {
        matches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pointDifferential: 0,
        ratingChange: 0,
        currentStreak: { result: null, count: 0 },
      },
      recentSessions: [],
      trend: {
        sessions: 0,
        matches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pointDifferential: 0,
        ratingChange: 0,
        direction: "FLAT",
        bestSession: null,
        worstSession: null,
      },
      partners: { best: [] },
      opponents: { toughest: [] },
      sessions: { latest: null, best: null },
      achievements: [],
      matchHistory: [],
    });
  });

  it("includes avatarUrl in the profile response", async () => {
    const response = await GET(
      new Request("http://localhost/api/users/user-1/stats"),
      {
        params: Promise.resolve({ id: "user-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/user-1/profile.webp"
    );
  });

  it("passes session guest flags through to profile stats", async () => {
    mocks.matchFindMany.mockResolvedValueOnce([
      {
        id: "match-1",
        completedAt: new Date("2026-05-18T01:00:00.000Z"),
        team1User1Id: "user-1",
        team1User2Id: "guest-1",
        team2User1Id: "player-2",
        team2User2Id: "player-3",
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 5,
        team2EloChange: -5,
        team1User1: { id: "user-1", name: "Alex Lee", avatarKey: null },
        team1User2: { id: "guest-1", name: "Guest One", avatarKey: null },
        team2User1: { id: "player-2", name: "Player Two", avatarKey: null },
        team2User2: { id: "player-3", name: "Player Three", avatarKey: null },
        session: {
          id: "session-1",
          code: "ABC123",
          name: "Morning",
          players: [
            {
              userId: "user-1",
              isGuest: false,
              sessionPoints: 3,
              user: { id: "user-1", name: "Alex Lee", avatarKey: null },
            },
            {
              userId: "guest-1",
              isGuest: true,
              sessionPoints: 3,
              user: { id: "guest-1", name: "Guest One", avatarKey: null },
            },
          ],
          matches: [],
        },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/users/user-1/stats"),
      {
        params: Promise.resolve({ id: "user-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.matchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          session: expect.objectContaining({
            select: expect.objectContaining({
              players: {
                select: expect.objectContaining({
                  isGuest: true,
                }),
              },
            }),
          }),
        }),
      })
    );
    expect(mocks.buildPlayerProfileDerivedData).toHaveBeenCalledWith(
      "user-1",
      [
        expect.objectContaining({
          session: expect.objectContaining({
            players: expect.arrayContaining([
              expect.objectContaining({
                userId: "guest-1",
                isGuest: true,
              }),
            ]),
          }),
        }),
      ]
    );
  });
});
