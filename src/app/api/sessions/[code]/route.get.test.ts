import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionFindUnique: vi.fn(),
  getSessionMembership: vi.fn(),
  getSessionAdminMembership: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn(),
  getPlayerClubBadges: vi.fn(),
  withPlayerClubBadges: vi.fn(),
  getQueuedMatchUserIds: vi.fn(),
  parseMatchmakingReasonJson: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
    },
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getPlayerClubBadges: mocks.getPlayerClubBadges,
  getSessionAdminMembership: mocks.getSessionAdminMembership,
  getSessionMembership: mocks.getSessionMembership,
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
  withPlayerClubBadges: mocks.withPlayerClubBadges,
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: mocks.getClubEloByUserId,
  withClubElo: mocks.withClubElo,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: vi.fn(() => true),
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(() => false),
}));

vi.mock("@/lib/sessionQueue", () => ({
  getQueuedMatchUserIds: mocks.getQueuedMatchUserIds,
}));

vi.mock("@/lib/matchmaking/matchReason", () => ({
  parseMatchmakingReasonJson: mocks.parseMatchmakingReasonJson,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

describe("session route GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.auth.mockResolvedValue({
      user: { id: "u1", isAdmin: false },
    });
    mocks.getSessionMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.getSessionAdminMembership.mockResolvedValue(null);
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.getClubEloByUserId.mockResolvedValue(new Map());
    mocks.withClubElo.mockImplementation((players) => players);
    mocks.getPlayerClubBadges.mockResolvedValue(new Map());
    mocks.withPlayerClubBadges.mockImplementation((players) => players);
    mocks.getQueuedMatchUserIds.mockReturnValue(["u1", "u2", "u3", "u4"]);
    mocks.parseMatchmakingReasonJson.mockReturnValue(null);

    const user = (id: string, name: string) => ({
      id,
      name,
      avatarKey: `https://blob.vercel-storage.com/avatars/${id}/photo.jpg`,
      elo: 1000,
      gender: "MALE",
      partnerPreference: "OPEN",
      mixedSideOverride: null,
    });
    const sessionPlayers = [
      { userId: "u1", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", user: user("u1", "Alice") },
      { userId: "u2", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", user: user("u2", "Bianca") },
      { userId: "u3", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", user: user("u3", "Charlie") },
      { userId: "u4", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", user: user("u4", "Dinesh") },
    ];

    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      code: "ABC123",
      clubId: "community-1",
      name: "Morning Session",
      type: "POINTS",
      mode: "MEXICANO",
      status: "ACTIVE",
      isTest: false,
      sourceSessionId: null,
      autoQueueEnabled: true,
      respectPlayerRest: true,
      poolsEnabled: false,
      poolAName: null,
      poolBName: null,
      poolACourtAssignments: 0,
      poolBCourtAssignments: 0,
      poolAMissedTurns: 0,
      poolBMissedTurns: 0,
      crossoverMissThreshold: 1,
      courts: [
        {
          id: "court-1",
          courtNumber: 1,
          label: null,
          currentMatch: {
            id: "match-1",
            status: "IN_PROGRESS",
            team1Score: null,
            team2Score: null,
            completedAt: null,
            scoreSubmittedByUserId: null,
            matchmakingReasonJson: null,
            team1User1: { id: "u1", name: "Alice", avatarKey: "https://blob.vercel-storage.com/avatars/u1/photo.jpg" },
            team1User2: { id: "u2", name: "Bianca", avatarKey: "https://blob.vercel-storage.com/avatars/u2/photo.jpg" },
            team2User1: { id: "u3", name: "Charlie", avatarKey: "https://blob.vercel-storage.com/avatars/u3/photo.jpg" },
            team2User2: { id: "u4", name: "Dinesh", avatarKey: "https://blob.vercel-storage.com/avatars/u4/photo.jpg" },
          },
        },
      ],
      sessionClubs: [],
      players: sessionPlayers,
      matches: [],
      queuedMatch: {
        id: "queue-1",
        createdAt: new Date("2026-05-18T00:00:00.000Z"),
        targetPool: null,
        matchmakingReasonJson: null,
        team1User1Id: "u1",
        team1User2Id: "u2",
        team2User1Id: "u3",
        team2User2Id: "u4",
      },
    });
  });

  it("includes avatarUrl in players, live match participants, and queued match participants", async () => {
    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.players[0].user.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/u1/photo.jpg"
    );
    expect(body.courts[0].currentMatch.team1User1.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/u1/photo.jpg"
    );
    expect(body.queuedMatch.team1User1.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/u1/photo.jpg"
    );
    expectAliasPair(body, "clubId", "communityId");
    expectAliasPair(body, "clubs", "communities");
    expectAliasPair(body, "viewerClubRole", "viewerCommunityRole");
    expect(body.respectPlayerRest).toBe(true);
  });

  it("includes avatarUrl in linked session clubs", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockClear();
    mocks.sessionFindUnique.mockResolvedValueOnce({
      ...sessionData,
      sessionClubs: [
        {
          clubId: "community-1",
          role: "HOST",
          status: "ACCEPTED",
          club: {
            id: "community-1",
            name: "Northside Club",
            avatarKey: "https://cdn.test/northside.png",
            isTutorial: false,
          },
        },
        {
          clubId: "community-2",
          role: "PARTNER",
          status: "ACCEPTED",
          club: {
            id: "community-2",
            name: "Anti-SeleK Club",
            avatarKey: null,
            isTutorial: false,
          },
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clubs).toEqual([
      {
        id: "community-1",
        name: "Northside Club",
        avatarUrl: "https://cdn.test/northside.png",
        role: "HOST",
        status: "ACCEPTED",
      },
      {
        id: "community-2",
        name: "Anti-SeleK Club",
        avatarUrl: null,
        role: "PARTNER",
        status: "ACCEPTED",
      },
    ]);
    expect(body.communities).toEqual(body.clubs);
  });

  it("marks staff as session operators without admin-only controls", async () => {
    mocks.getSessionMembership.mockResolvedValue({ role: "STAFF" });
    mocks.getSessionOperatorMembership.mockResolvedValue({ role: "STAFF" });
    mocks.getSessionAdminMembership.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewerClubRole).toBe("STAFF");
    expect(body.viewerCommunityRole).toBe("STAFF");
    expect(body.viewerCanManage).toBe(true);
    expect(body.viewerCanUseAdminSessionControls).toBe(false);
    expect(mocks.getSessionOperatorMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ acceptedOnly: true })
    );
  });

  it("masks tutorial club names in linked session clubs", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockClear();
    mocks.sessionFindUnique.mockResolvedValueOnce({
      ...sessionData,
      club: {
        id: "community-1",
        isTutorial: true,
        tutorialOwnerId: "u1",
      },
      sessionClubs: [
        {
          clubId: "community-1",
          role: "HOST",
          status: "ACCEPTED",
          club: {
            id: "community-1",
            name: "Tutorial playground u1",
            isTutorial: true,
          },
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectAliasPair(body, "clubs", "communities");
    expect(body.communities[0].name).toBe("Tutorial playground");
  });
});
