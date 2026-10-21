import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  accountFindUnique: vi.fn(),
  clubFindUnique: vi.fn(),
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
    user: { findUnique: mocks.accountFindUnique },
    club: { findUnique: mocks.clubFindUnique },
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
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "account-viewer", isAdmin: false } });
    mocks.sessionPlayerFindFirst.mockResolvedValue(null);
    mocks.playerFindUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
      id: where.id, name: "Alex Lee",
      avatarKey: `https://blob.vercel-storage.com/avatars/${where.id}/profile.webp`,
      elo: 1333, createdAt: new Date("2026-05-18T00:00:00.000Z"),
      clubMemberships: [],
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

  function enableGlobalViewer() {
    vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", "h.luqman1998@gmail.com");
    mocks.auth.mockResolvedValue({ user: { id: "account-viewer", canBrowseAllClubs: true, isAdmin: false } });
    mocks.accountFindUnique.mockResolvedValue({ email: "h.luqman1998@gmail.com", isActive: true, passwordHash: "hash" });
    mocks.clubFindUnique.mockResolvedValue({ isTutorial: false });
    mocks.clubAccessFindUnique.mockResolvedValue(null);
  }

  it("reads the selected club member history without management privileges", async () => {
    enableGlobalViewer();
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "member-1", elo: 1200, archivedAt: null, retiredByAdmissionEventId: null, status: "ACTIVE" });
    const response = await getStats("player-1", "?clubId=club-1&view=global");
    expect(response.status).toBe(200);
    expect((await response.json()).context).toMatchObject({ clubId: "club-1", viewerCanManageClub: false, canAddGuestToClub: false });
    expect(mocks.matchFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ session: expect.objectContaining({ OR: [{ clubId: "club-1" }, { sessionClubs: { some: { clubId: "club-1", status: "ACCEPTED" } } }] }) }) }));
  });

  it.each([null, { id: "member-other", archivedAt: new Date() }, { id: "member-retired", retiredByAdmissionEventId: "retired" }])("denies absent, archived and retired targets before accessing history", async member => {
    enableGlobalViewer();
    mocks.clubMemberFindUnique.mockResolvedValue(member);
    expect((await getStats("player-other", "?clubId=club-1&view=global")).status).toBe(403);
    expect(mocks.matchFindMany).not.toHaveBeenCalled();
  });

  it("requires a club scope for global member history", async () => {
    enableGlobalViewer();
    expect((await getStats("player-1", "?view=global")).status).toBe(403);
    expect(mocks.matchFindMany).not.toHaveBeenCalled();
  });

  it("loads profile data by Player ID and serializes its avatar", async () => {
    const response = await getStats();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.playerFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "player-1" } }));
    expect(body.player.avatarUrl).toBe("https://blob.vercel-storage.com/avatars/player-1/profile.webp");
    expect(body.player.isRetired).toBe(false);
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
        clubId: null, ratingPolicyVersion: 2, isTest: false, type: "POINTS", createdAt: new Date(), endedAt: new Date(),
        players: [
          { playerId: "player-1", profileClubId: "club-selected", isGuest: false, sessionPoints: 3, player: alex },
          { playerId: "guest-1", isGuest: true, sessionPoints: 3, player: guest },
        ],
        matches: [],
      },
    }]);

    const response = await getStats();
    expect(response.status).toBe(200);
    expect(mocks.matchFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ session: expect.objectContaining({
        select: expect.objectContaining({ ratingPolicyVersion: true, players: { select: expect.objectContaining({ profileClubId: true, isGuest: true }) } }),
      }) }),
    }));
    expect(mocks.buildPlayerProfileDerivedData).toHaveBeenCalledWith("player-1", [
      expect.objectContaining({ session: expect.objectContaining({ ratingPolicyVersion: 2, players: expect.arrayContaining([
        expect.objectContaining({ playerId: "player-1", userId: "player-1", profileClubId: "club-selected" }),
        expect.objectContaining({ playerId: "guest-1", userId: "guest-1", isGuest: true }),
      ]) }) }),
    ]);
    const query = mocks.matchFindMany.mock.calls[0][0];
    expect(query.include.session.select.players.select).not.toHaveProperty("participantAccountId");
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
  it("serves the ledger profile without loading duplicate legacy statistics or ranking matches", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue({id:"member-player-1",elo:1275,status:"CORE"});
    const profile = {history:{items:[],hasMore:false,nextOffset:null},matchHistory:[],timeline:[]};
    mocks.buildMemberProfileData.mockReturnValue(profile);
    const response = await getStats("player-1", "?clubId=club-1&section=profile");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({user:{id:"player-1",elo:1275},profile});
    expect(body).not.toHaveProperty("stats");
    expect(mocks.buildPlayerProfileDerivedData).not.toHaveBeenCalled();
    expect(mocks.buildProfileClubRankWindow).not.toHaveBeenCalled();
    expect(mocks.offlineIdentityMemberFindMany).not.toHaveBeenCalled();
    expect(mocks.matchFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.matchFindMany.mock.calls[0][0].include.session.select).not.toHaveProperty("matches");
    expect(mocks.matchEloAdjustmentFindMany).toHaveBeenCalledWith({where:{clubId:"club-1",playerId:"player-1"}});
  });
  it("serves Home's recent sessions and exact rank context without a member profile or legacy badges", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue({id:"member-player-1",elo:1275,status:"CORE"});
    const response = await getStats("player-1", "?clubId=club-1&section=overview");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({user:{id:"player-1",elo:1275},context:{clubId:"club-1"},recentSessions:[]});
    expect(body).not.toHaveProperty("matchHistory");
    expect(body).not.toHaveProperty("profile");
    expect(body).not.toHaveProperty("achievements");
    expect(mocks.buildPlayerProfileDerivedData).toHaveBeenCalledWith("player-1",[],{includeAchievements:false});
    expect(mocks.buildProfileClubRankWindow).toHaveBeenCalledTimes(1);
    expect(mocks.buildMemberProfileData).not.toHaveBeenCalled();
    expect(mocks.matchEloAdjustmentFindMany).not.toHaveBeenCalled();
    expect(mocks.clubRatingAdjustmentFindMany).not.toHaveBeenCalled();
  });
  it.each(["profile","overview"])("keeps authorization before compact %s reads", async section => {
    mocks.clubAccessFindUnique.mockResolvedValue({role:"ADMIN",status:"REVOKED"});
    mocks.clubMemberFindUnique.mockResolvedValue({id:"member-player-1",elo:1275,status:"CORE"});
    expect((await getStats("player-1", `?clubId=club-1&section=${section}`)).status).toBe(403);
    expect(mocks.matchFindMany).not.toHaveBeenCalled();
    expect(mocks.buildMemberProfileData).not.toHaveBeenCalled();
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
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        clubId: "club-1",
        retiredByAdmissionEventId: null,
        status: { not: "OCCASIONAL" },
      },
    }));
    expect(mocks.buildProfileClubRankWindow).toHaveBeenCalledWith("player-1", [
      expect.objectContaining({ userId: "player-1", isLeaderboardEligible: false }),
      expect.objectContaining({ userId: "player-2", isLeaderboardEligible: true }),
    ], []);
  });

  it("keeps retired profile history readable while marking it non-editable and excluding it from rankings", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-admin", isAdmin: false } });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.playerFindUnique.mockResolvedValue({
      id: "duplicate",
      name: "Duplicate",
      avatarKey: null,
      elo: 1000,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
      clubMemberships: [{ id: "retired-membership" }],
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      id: "retired-membership",
      elo: 1050,
      status: "CORE",
      retiredByAdmissionEventId: "retirement-event",
      player: { id: "duplicate", name: "Duplicate" },
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      { playerId: "duplicate", elo: 1050, player: { name: "Duplicate" } },
      { playerId: "historical-player", elo: 1455, player: { name: "Original" } },
    ]);

    const response = await getStats("duplicate", "?clubId=club-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.player).toMatchObject({ id: "duplicate", isRetired: true });
    expect(body.context.viewerCanManageClub).toBe(true);
    expect(body.profile).toBeDefined();
    expect(mocks.buildMemberProfileData).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "duplicate" })
    );
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        clubId: "club-1",
        retiredByAdmissionEventId: null,
        status: { not: "OCCASIONAL" },
      },
    }));
  });

  it("does not offer guest promotion for a globally retired Player viewed from another club", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-admin", isAdmin: false } });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.playerFindUnique.mockResolvedValue({
      id: "duplicate",
      name: "Duplicate",
      avatarKey: null,
      elo: 1000,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
      clubMemberships: [{ id: "retired-membership" }],
    });
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.sessionPlayerFindFirst.mockResolvedValue({ id: "legacy-appearance" });

    const response = await getStats("duplicate", "?clubId=other-club");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.player.isRetired).toBe(true);
    expect(body.context.canAddGuestToClub).toBe(false);
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
