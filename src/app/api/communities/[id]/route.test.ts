import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityFindUnique: vi.fn(),
  communityFindMany: vi.fn(),
  communityUpdate: vi.fn(),
  communityMemberFindMany: vi.fn(),
  matchFindMany: vi.fn(),
  claimRequestFindMany: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
  listSessionsForCommunity: vi.fn(),
  buildCommunityPulse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
      findMany: mocks.communityMemberFindMany,
    },
    community: {
      findUnique: mocks.communityFindUnique,
      findMany: mocks.communityFindMany,
      update: mocks.communityUpdate,
    },
    match: {
      findMany: mocks.matchFindMany,
    },
    claimRequest: {
      findMany: mocks.claimRequestFindMany,
    },
    offlineIdentityMember: {
      findMany: mocks.offlineIdentityMemberFindMany,
    },
  },
}));

vi.mock("@/app/api/sessions/listSessionsService", () => ({
  listSessionsForCommunity: mocks.listSessionsForCommunity,
}));

vi.mock("@/lib/communityPulse", () => ({
  buildCommunityPulse: mocks.buildCommunityPulse,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessCommunity: vi.fn(() => true),
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(() => false),
  normalizeNameLookupKey: vi.fn((value: string) => value.toLowerCase()),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { GET, PATCH } from "./route";

describe("club snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.auth.mockResolvedValue({
      user: { id: "viewer-1", isAdmin: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "viewer-1",
      name: "Viewer",
      email: "viewer@example.com",
      avatarKey: "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg",
      elo: 1100,
      gender: "MALE",
      partnerPreference: "OPEN",
      mixedSideOverride: null,
    });
    mocks.communityMemberFindUnique.mockResolvedValue({
      role: "ADMIN",
      elo: 1120,
    });
    mocks.communityFindUnique.mockResolvedValue({
      id: "community-1",
      name: "Club One",
      createdById: "viewer-1",
      isTutorial: false,
      tutorialOwnerId: null,
      isPasswordProtected: false,
      _count: { members: 2, sessions: 1 },
    });
    mocks.communityFindMany.mockResolvedValue([]);
    mocks.communityUpdate.mockResolvedValue({
      id: "community-1",
      name: "Club One",
      isPasswordProtected: false,
      updatedAt: new Date("2026-05-19T00:00:00.000Z"),
    });
    mocks.communityMemberFindMany.mockResolvedValue([
      {
        role: "ADMIN",
        status: "CORE",
        elo: 1120,
        user: {
          id: "viewer-1",
          name: "Viewer",
          email: "viewer@example.com",
          avatarKey: "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg",
          gender: "MALE",
          partnerPreference: "OPEN",
          mixedSideOverride: null,
          isActive: true,
          isClaimed: true,
          createdAt: new Date("2026-05-18T00:00:00.000Z"),
        },
      },
      {
        role: "MEMBER",
        status: "CORE",
        elo: 1010,
        user: {
          id: "player-2",
          name: "Player Two",
          email: null,
          avatarKey: null,
          gender: "FEMALE",
          partnerPreference: "OPEN",
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt: new Date("2026-05-17T00:00:00.000Z"),
        },
      },
    ]);
    mocks.matchFindMany.mockResolvedValue([]);
    mocks.listSessionsForCommunity.mockResolvedValue([
      {
        id: "session-1",
        code: "ABC123",
        name: "Morning",
        type: "POINTS",
        status: "ACTIVE",
        isTest: false,
        createdAt: new Date("2026-05-18T00:00:00.000Z"),
        players: [
          {
            user: {
              id: "viewer-1",
              name: "Viewer",
              avatarUrl: "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg",
            },
          },
        ],
      },
    ]);
    mocks.claimRequestFindMany.mockResolvedValue([]);
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
    mocks.buildCommunityPulse.mockReturnValue({
      metrics: {
        members: 2,
        activeTournaments: 1,
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

  it("includes avatarUrl in viewer, roster, and session payloads", async () => {
    const response = await GET(
      new Request("http://localhost/api/communities/community-1"),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewer.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg"
    );
    expect(body.communityMembers[0].avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg"
    );
    expect(body.sessions[0].players[0].user.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/viewer-1/avatar.jpg"
    );
  });

  it("includes owner flags in the club and roster snapshot", async () => {
    const response = await GET(
      new Request("http://localhost/api/communities/community-1"),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.viewerIsOwner).toBe(true);
    expect(body.communityMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "viewer-1", isOwner: true }),
        expect.objectContaining({ id: "player-2", isOwner: false }),
      ])
    );
  });

  it("includes rank movement from the latest completed tournament", async () => {
    mocks.communityMemberFindMany.mockResolvedValueOnce([
      {
        role: "ADMIN",
        status: "CORE",
        elo: 1030,
        user: {
          id: "viewer-1",
          name: "Alice",
          email: "viewer@example.com",
          avatarKey: null,
          gender: "MALE",
          partnerPreference: "OPEN",
          mixedSideOverride: null,
          isActive: true,
          isClaimed: true,
          createdAt: new Date("2026-05-18T00:00:00.000Z"),
        },
      },
      {
        role: "MEMBER",
        status: "CORE",
        elo: 1020,
        user: {
          id: "player-2",
          name: "Ben",
          email: null,
          avatarKey: null,
          gender: "FEMALE",
          partnerPreference: "OPEN",
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt: new Date("2026-05-17T00:00:00.000Z"),
        },
      },
      {
        role: "MEMBER",
        status: "CORE",
        elo: 1000,
        user: {
          id: "player-3",
          name: "Cara",
          email: null,
          avatarKey: null,
          gender: "FEMALE",
          partnerPreference: "OPEN",
          mixedSideOverride: null,
          isActive: true,
          isClaimed: false,
          createdAt: new Date("2026-05-16T00:00:00.000Z"),
        },
      },
    ]);
    mocks.listSessionsForCommunity.mockResolvedValueOnce([
      {
        id: "session-1",
        code: "ABC123",
        name: "Morning",
        type: "POINTS",
        status: "COMPLETED",
        isTest: false,
        createdAt: new Date("2026-05-18T00:00:00.000Z"),
        endedAt: new Date("2026-05-18T02:00:00.000Z"),
        players: [],
      },
    ]);
    mocks.matchFindMany.mockResolvedValueOnce([
      {
        id: "match-1",
        completedAt: new Date("2026-05-18T01:00:00.000Z"),
        winnerTeam: 1,
        team1User1Id: "viewer-1",
        team1User2Id: "guest-1",
        team2User1Id: "player-2",
        team2User2Id: "guest-2",
        team1Score: 21,
        team2Score: 18,
        team1EloChange: 20,
        team2EloChange: -20,
        team1User1: { id: "viewer-1", name: "Alice", avatarKey: null },
        team1User2: { id: "guest-1", name: "Guest One", avatarKey: null },
        team2User1: { id: "player-2", name: "Ben", avatarKey: null },
        team2User2: { id: "guest-2", name: "Guest Two", avatarKey: null },
        session: {
          id: "session-1",
          code: "ABC123",
          name: "Morning",
          type: "POINTS",
          createdAt: new Date("2026-05-18T00:00:00.000Z"),
          endedAt: new Date("2026-05-18T02:00:00.000Z"),
        },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/communities/community-1"),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.communityMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "viewer-1",
          previousRank: 2,
          rankDelta: 1,
        }),
        expect.objectContaining({
          id: "player-2",
          previousRank: 1,
          rankDelta: -1,
        }),
        expect.objectContaining({
          id: "player-3",
          previousRank: 3,
          rankDelta: 0,
        }),
      ])
    );
  });

  it("masks tutorial club backend names in the snapshot", async () => {
    mocks.communityFindUnique.mockResolvedValueOnce({
      id: "community-1",
      name: "Tutorial playground viewer-1",
      createdById: "viewer-1",
      isTutorial: true,
      tutorialOwnerId: "viewer-1",
      isPasswordProtected: false,
      _count: { members: 2, sessions: 1 },
    });

    const response = await GET(
      new Request("http://localhost/api/communities/community-1"),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.name).toBe("Tutorial playground");
  });

  it("allows admins to remove a club password and make it public", async () => {
    mocks.communityMemberFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
    });
    mocks.communityFindUnique.mockResolvedValueOnce({
      id: "community-1",
      isPasswordProtected: true,
      isTutorial: false,
      tutorialOwnerId: null,
    });
    mocks.communityUpdate.mockResolvedValueOnce({
      id: "community-1",
      name: "Club One",
      isPasswordProtected: false,
      updatedAt: new Date("2026-05-19T00:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://localhost/api/communities/community-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPasswordProtected: false }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityUpdate).toHaveBeenCalledWith({
      where: { id: "community-1" },
      data: {
        isPasswordProtected: false,
        passwordHash: null,
      },
      select: {
        id: true,
        name: true,
        isPasswordProtected: true,
        updatedAt: true,
      },
    });
    expect(body.isPasswordProtected).toBe(false);
  });

  it("requires a password when enabling protection for an open club", async () => {
    mocks.communityMemberFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
    });
    mocks.communityFindUnique.mockResolvedValueOnce({
      id: "community-1",
      isPasswordProtected: false,
      isTutorial: false,
      tutorialOwnerId: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/communities/community-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPasswordProtected: true }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Password is required to protect the club");
  });

  it("rejects direct settings updates for tutorial playgrounds", async () => {
    mocks.communityMemberFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
    });
    mocks.communityFindUnique.mockResolvedValueOnce({
      id: "community-1",
      isPasswordProtected: false,
      isTutorial: true,
      tutorialOwnerId: "viewer-1",
    });

    const response = await PATCH(
      new Request("http://localhost/api/communities/community-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Tutorial Name" }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Tutorial playground settings are managed by reset.");
    expect(mocks.communityUpdate).not.toHaveBeenCalled();
  });
});
