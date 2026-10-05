import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionPlayerFindFirst: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubAccessFindUnique: vi.fn(),
  playerFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  matchEloAdjustmentFindMany: vi.fn(),
  clubRatingAdjustmentFindMany: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
  buildPlayerProfileDerivedData: vi.fn(),
  buildProfileClubRankWindow: vi.fn(),
  buildMemberProfileData: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sessionPlayer: { findFirst: mocks.sessionPlayerFindFirst },
    player: { findUnique: mocks.playerFindUnique },
    match: { findMany: mocks.matchFindMany },
    matchEloAdjustment: { findMany: mocks.matchEloAdjustmentFindMany },
    clubRatingAdjustment: { findMany: mocks.clubRatingAdjustmentFindMany },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
    },
    clubAccess: { findUnique: mocks.clubAccessFindUnique },
    offlineIdentityMember: { findMany: mocks.offlineIdentityMemberFindMany },
  },
}));
vi.mock("@/lib/profileStats", () => ({ buildPlayerProfileDerivedData: mocks.buildPlayerProfileDerivedData }));
vi.mock("@/lib/profileClubRank", () => ({ buildProfileClubRankWindow: mocks.buildProfileClubRankWindow }));
vi.mock("@/lib/memberProfile", () => ({ buildMemberProfileData: mocks.buildMemberProfileData }));
vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })),
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

const EMPTY_PROFILE = {
  stats: {
    totalMatches: 0, wins: 0, losses: 0, winRate: 0, pointsScored: 0,
    pointsConceded: 0, pointDifferential: 0, sessionsPlayed: 0,
    averageMatchesPerSession: 0, lastPlayedAt: null,
  },
  recentForm: {
    matches: 0, wins: 0, losses: 0, winRate: 0, pointDifferential: 0,
    ratingChange: 0, currentStreak: { result: null, count: 0 },
  },
  recentSessions: [],
  trend: {
    sessions: 0, matches: 0, wins: 0, losses: 0, winRate: 0,
    pointDifferential: 0, ratingChange: 0, direction: "FLAT",
    bestSession: null, worstSession: null,
  },
  partners: { best: [] }, opponents: { toughest: [] },
  sessions: { latest: null, best: null }, achievements: [], matchHistory: [],
};

function getStats(playerId = "player-1", query = "") {
  return GET(
    new Request(`http://localhost/api/users/${playerId}/stats${query}`),
    { params: Promise.resolve({ id: playerId }) }
  );
}

describe("user stats route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "account-viewer", isAdmin: false } });
    mocks.sessionPlayerFindFirst.mockResolvedValue(null);
    mocks.playerFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
      id: where.id, name: "Alex Lee",
      avatarKey: `https://blob.vercel-storage.com/avatars/${where.id}/profile.webp`,
      elo: 1333, createdAt: new Date("2026-05-18T00:00:00.000Z"),
    }));
    mocks.matchFindMany.mockResolvedValue([]);
    mocks.matchEloAdjustmentFindMany.mockResolvedValue([]);
    mocks.clubRatingAdjustmentFindMany.mockResolvedValue([]);
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    mocks.buildProfileClubRankWindow.mockReturnValue({
      leaderboardSize: 0, currentRank: null, previousRank: null, rankDelta: null,
    });
    mocks.buildMemberProfileData.mockReturnValue({ history: [] });
    mocks.buildPlayerProfileDerivedData.mockReturnValue(EMPTY_PROFILE);
  });

  it("loads profile data by Player ID and serializes its avatar", async () => {
    const response = await getStats();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.playerFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "player-1" } }));
    expect(body.player.avatarUrl).toBe("https://blob.vercel-storage.com/avatars/player-1/profile.webp");
    expect(mocks.auth).toHaveResolvedWith({ user: { id: "account-viewer", isAdmin: false } });
  });

  it("passes guest appearance flags and Player aliases to profile stats", async () => {
    const alex = { id: "player-1", name: "Alex Lee", avatarKey: null };
    const guest = { id: "guest-1", name: "Guest One", avatarKey: null };
    mocks.matchFindMany.mockResolvedValueOnce([{
      id: "match-1", completedAt: new Date("2026-05-18T01:00:00.000Z"),
      team1Player1Id: "player-1", team1Player2Id: "guest-1",
      team2Player1Id: "player-2", team2Player2Id: "player-3",
      team1Score: 21, team2Score: 18, winnerTeam: 1, team1EloChange: 5, team2EloChange: -5,
      team1Player1: alex, team1Player2: guest,
      team2Player1: { id: "player-2", name: "Player Two", avatarKey: null },
      team2Player2: { id: "player-3", name: "Player Three", avatarKey: null },
      session: {
        id: "session-1", code: "ABC123", name: "Morning", status: "COMPLETED",
        clubId: null, isTest: false, type: "POINTS", createdAt: new Date(), endedAt: new Date(),
        players: [
          { playerId: "player-1", isGuest: false, sessionPoints: 3, player: alex },
          { playerId: "guest-1", isGuest: true, sessionPoints: 3, player: guest },
        ],
        matches: [],
      },
    }]);

    const response = await getStats();
    expect(response.status).toBe(200);
    expect(mocks.matchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ session: expect.objectContaining({
        select: expect.objectContaining({ players: { select: expect.objectContaining({ isGuest: true }) } }),
      }) }),
    }));
    expect(mocks.buildPlayerProfileDerivedData).toHaveBeenCalledWith("player-1", [
      expect.objectContaining({ session: expect.objectContaining({ players: expect.arrayContaining([
        expect.objectContaining({ playerId: "guest-1", userId: "guest-1", isGuest: true }),
      ]) }) }),
    ]);
  });

  it("returns canonical and compatibility club context for an active viewer", async () => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.clubMemberFindUnique.mockResolvedValue({
      id: "member-player-1", playerId: "player-1", elo: 1275, status: "CORE",
      player: { id: "player-1", name: "Alex Lee" },
    });
    mocks.clubMemberFindMany.mockResolvedValue([{
      playerId: "player-1", elo: 1275, player: { name: "Alex Lee" },
    }]);

    const response = await getStats("player-1", "?clubId=club-1");
    const body = await response.json();
    expect(response.status).toBe(200);
    expectAliasPair(body.context, "clubId", "communityId");
    expect(body.context.clubId).toBe("club-1");
    expect(mocks.clubAccessFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId_userId: { clubId: "club-1", userId: "account-viewer" } },
    }));
    expect(mocks.clubMemberFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId_playerId: { clubId: "club-1", playerId: "player-1" } },
    }));
    expect(mocks.buildMemberProfileData).toHaveBeenCalledWith(expect.objectContaining({ userId: "player-1" }));
  });

  it("counts only actual club match participants for leaderboard rank eligibility", async () => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.clubMemberFindUnique.mockResolvedValue({
      id: "member-player-1", playerId: "player-1", elo: 1275, status: "CORE",
      player: { id: "player-1", name: "Alex Lee" },
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      { playerId: "player-1", elo: 1275, player: { name: "Alex Lee" } },
      { playerId: "player-2", elo: 1210, player: { name: "Played Member" } },
    ]);
    mocks.matchFindMany
      .mockResolvedValueOnce([{ team1Player1Id: "player-2", team1Player2Id: "player-3", team2Player1Id: "player-4", team2Player2Id: "player-5" }])
      .mockResolvedValueOnce([]);

    const response = await getStats("player-1", "?clubId=club-1");
    expect(response.status).toBe(200);
    expect(mocks.buildProfileClubRankWindow).toHaveBeenCalledWith("player-1", [
      expect.objectContaining({ userId: "player-1", isLeaderboardEligible: false }),
      expect.objectContaining({ userId: "player-2", isLeaderboardEligible: true }),
    ], []);
  });

  it.each([["ADMIN", true], ["MEMBER", false]])("shows a club guest profile to %s with correct promotion access", async (role, canAdd) => {
    mocks.clubAccessFindUnique.mockResolvedValue({ role, status: "ACTIVE" });
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.sessionPlayerFindFirst.mockResolvedValue({ id: "appearance-one" });
    const response = await getStats("player-guest", "?clubId=club-1");
    expect(response.status).toBe(200);
    expect((await response.json()).context.canAddGuestToClub).toBe(canAdd);
    expect(mocks.sessionPlayerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ playerId: "player-guest", isGuest: true }),
    }));
  });

  it.each([true, false])("applies historical adjustments only to guest appearances (guest=%s)", async (isGuest) => {
    const player = { id: "player-1", name: "Alex", avatarKey: null };
    mocks.matchFindMany.mockResolvedValueOnce([{
      team1Player1Id: "player-1", team1Player2Id: "other", team2Player1Id: "b", team2Player2Id: "c",
      team1EloChange: 18, team2EloChange: -18,
      team1Player1: player, team1Player2: player, team2Player1: player, team2Player2: player,
      session: { players: [{ playerId: "player-1", isGuest, player }] },
    }]);
    const response = await getStats();
    expect(response.status).toBe(200);
    expect((await response.json()).player.elo).toBe(isGuest ? 1351 : 1333);
  });
});