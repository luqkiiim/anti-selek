import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityFindUnique: vi.fn(),
  communityMemberFindMany: vi.fn(),
  matchFindMany: vi.fn(),
  claimRequestFindMany: vi.fn(),
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
    },
    match: {
      findMany: mocks.matchFindMany,
    },
    claimRequest: {
      findMany: mocks.claimRequestFindMany,
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

import { GET } from "./route";

describe("community snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AVATAR_PUBLIC_BASE_URL = "https://cdn.test";

    mocks.auth.mockResolvedValue({
      user: { id: "viewer-1", isAdmin: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "viewer-1",
      name: "Viewer",
      email: "viewer@example.com",
      avatarKey: "avatars/viewer-1/avatar.jpg",
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
      name: "Community One",
      isPasswordProtected: false,
      _count: { members: 2, sessions: 1 },
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
          avatarKey: "avatars/viewer-1/avatar.jpg",
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
              avatarUrl: "https://cdn.test/avatars/viewer-1/avatar.jpg",
            },
          },
        ],
      },
    ]);
    mocks.claimRequestFindMany.mockResolvedValue([]);
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
      "https://cdn.test/avatars/viewer-1/avatar.jpg"
    );
    expect(body.communityMembers[0].avatarUrl).toBe(
      "https://cdn.test/avatars/viewer-1/avatar.jpg"
    );
    expect(body.sessions[0].players[0].user.avatarUrl).toBe(
      "https://cdn.test/avatars/viewer-1/avatar.jpg"
    );
  });
});
