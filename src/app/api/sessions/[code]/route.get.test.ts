import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectAliasPair } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessSessionRead: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  sessionFindUnique: vi.fn(),
  sessionFindFirst: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  getSessionMembership: vi.fn(),
  getSessionAdminMembership: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn(),
  getPlayerClubBadges: vi.fn(),
  withPlayerClubBadges: vi.fn(),
  getQueuedMatchUserIds: vi.fn(),
  getQuickAccessPlayerId: vi.fn(),
  isAccountSessionPlayer: vi.fn(),
  clubFindUnique: vi.fn(),
  clubAccessFindUnique: vi.fn(),
  clubMemberFindMany: vi.fn(),
  parseMatchmakingReasonJson: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
      findFirst: mocks.sessionFindFirst,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
    },
    club: {
      findUnique: mocks.clubFindUnique,
    },
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
    },
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getPlayerClubBadges: mocks.getPlayerClubBadges,
  getSessionAdminMembership: mocks.getSessionAdminMembership,
  getSessionMembership: mocks.getSessionMembership,
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
  isAccountSessionPlayer: mocks.isAccountSessionPlayer,
  withPlayerClubBadges: mocks.withPlayerClubBadges,
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: mocks.getClubEloByUserId,
  withClubElo: mocks.withClubElo,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessSessionRead: mocks.canQuickAccessSessionRead,
  getQuickAccessPlayerId: mocks.getQuickAccessPlayerId,
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(
    (session: { user?: { isQuickAccess?: boolean } } | null | undefined) =>
      session?.user?.isQuickAccess === true
  ),
}));

vi.mock("@/lib/sessionQueue", () => ({
  getQueuedMatchUserIds: mocks.getQueuedMatchUserIds,
}));

vi.mock("@/lib/matchmaking/matchReason", () => ({
  parseMatchmakingReasonJson: mocks.parseMatchmakingReasonJson,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: mocks.rateLimit,
}));

import { GET } from "./route";

describe("session route GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);

    mocks.auth.mockResolvedValue({
      user: { id: "account-u1", isAdmin: false },
    });
    mocks.canQuickAccessSessionRead.mockImplementation(
      (
        session: { user?: { isQuickAccess?: boolean; quickAccessClubId?: string | null } },
        data: {
          clubId?: string | null;
          sessionClubs?: Array<{ clubId: string; status: string }>;
        }
      ) => {
        if (session.user?.isQuickAccess !== true) {
          return true;
        }

        const quickAccessClubId = session.user.quickAccessClubId;
        return (
          !!quickAccessClubId &&
          (data.clubId === quickAccessClubId ||
            data.sessionClubs?.some(
              (link) =>
                link.clubId === quickAccessClubId &&
                link.status === "ACCEPTED"
            ) === true)
        );
      }
    );
    mocks.getSessionMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.getSessionAdminMembership.mockResolvedValue(null);
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.clubFindUnique.mockResolvedValue({ id: "community-1", createdById: "account-owner", isTutorial: false, tutorialOwnerId: null });
    mocks.clubAccessFindUnique.mockResolvedValue(null);
    mocks.getQuickAccessPlayerId.mockImplementation((session: { user?: { isQuickAccess?: boolean; guestPlayerId?: string | null } } | null | undefined) => session?.user?.isQuickAccess ? session.user.guestPlayerId ?? null : null);
    mocks.isAccountSessionPlayer.mockImplementation(async (_db: unknown, _sessionId: string, accountId: string) => accountId === "account-u1" || accountId === "account-u2");
    mocks.sessionFindFirst.mockResolvedValue({ id: "session-1" });
    mocks.getClubEloByUserId.mockResolvedValue(new Map());
    mocks.withClubElo.mockImplementation((players) => players);
    mocks.getPlayerClubBadges.mockResolvedValue(new Map());
    mocks.withPlayerClubBadges.mockImplementation((players) => players);
    mocks.getQueuedMatchUserIds.mockReturnValue(["u1", "u2", "u3", "u4"]);
    mocks.parseMatchmakingReasonJson.mockReturnValue(null);

    const player = (id: string, name: string, ownerUserId: string | null = null) => ({
      id,
      name,
      ownerUserId,
      avatarKey: `https://blob.vercel-storage.com/avatars/${id}/photo.jpg`,
      elo: 1000,
      gender: "MALE",
      partnerPreference: "OPEN",
      mixedSideOverride: null,
    });
    const sessionPlayers = [
      { playerId: "u1", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", player: player("u1", "Alice", "account-u1") },
      { playerId: "u2", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", player: player("u2", "Bianca", "account-u2") },
      { playerId: "u3", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", player: player("u3", "Charlie") },
      { playerId: "u4", sessionPoints: 0, isPaused: false, isGuest: false, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, pool: "A", player: player("u4", "Dinesh") },
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
            team1Player1: { id: "u1", name: "Alice", avatarKey: "https://blob.vercel-storage.com/avatars/u1/photo.jpg" },
            team1Player2: { id: "u2", name: "Bianca", avatarKey: "https://blob.vercel-storage.com/avatars/u2/photo.jpg" },
            team2Player1: { id: "u3", name: "Charlie", avatarKey: "https://blob.vercel-storage.com/avatars/u3/photo.jpg" },
            team2Player2: { id: "u4", name: "Dinesh", avatarKey: "https://blob.vercel-storage.com/avatars/u4/photo.jpg" },
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
        team1Player1Id: "u1",
        team1Player2Id: "u2",
        team2Player1Id: "u3",
        team2Player2Id: "u4",
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
    const query = mocks.sessionFindUnique.mock.calls[0][0];
    expect(query.include.courts.include.currentMatch.select.createdAt).toBe(true);
    expect(query.include.matches.select.createdAt).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0"
    );
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
    expect(body.viewerUserId).toBe("account-u1");
    expect(body.viewerPlayerId).toBe("u1");
    expect(body.players[0].player.ownerUserId).toBeUndefined();
    expect(body.players[0].user.ownerUserId).toBeUndefined();
  });

  it("leaves the viewer Player identity unset when the account owns multiple participants", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({
      ...sessionData,
      players: [
        ...sessionData.players,
        {
          ...sessionData.players[0],
          playerId: "u5",
          player: {
            ...sessionData.players[0].player,
            id: "u5",
            name: "Alice’s second profile",
          },
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewerUserId).toBe("account-u1");
    expect(body.viewerPlayerId).toBeNull();
  });

  it("uses a separate authenticated read bucket for viewers behind the same IP", async () => {
    const sharedHeaders = {
      "x-forwarded-for": "203.0.113.10",
      accept: "application/json",
      "accept-language": "en-US",
      "user-agent": "Mozilla/5.0",
    };

    const firstResponse = await GET(
      new Request("http://localhost/api/sessions/ABC123", {
        headers: sharedHeaders,
      }),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    expect(firstResponse.status).toBe(200);

    mocks.auth.mockResolvedValueOnce({ user: { id: "account-u2", isAdmin: false } });
    const secondResponse = await GET(
      new Request("http://localhost/api/sessions/ABC123", {
        headers: sharedHeaders,
      }),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    expect(secondResponse.status).toBe(200);

    expect(mocks.rateLimit).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      "api:sessions:code:get",
      {
        applyHighRiskBucket: false,
        identity: "account-u1",
        limit: 120,
        windowMs: 60_000,
      }
    );
    expect(mocks.rateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      "api:sessions:code:get",
      {
        applyHighRiskBucket: false,
        identity: "account-u2",
        limit: 120,
        windowMs: 60_000,
      }
    );
    expect(mocks.checkInvalidTargetRateLimit).toHaveBeenCalledTimes(2);
  });

  it("allows quick-access host club spectators without management permissions", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "guest:u1",
        isAdmin: false,
        isQuickAccess: true,
        guestPlayerId: "u1",
        quickAccessClubId: "community-1",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      {
        params: Promise.resolve({ code: "ABC123" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewerIsQuickAccess).toBe(true);
    expect(body.viewerCanManage).toBe(false);
    expect(body.viewerCanUseAdminSessionControls).toBe(false);
  });

  it("allows quick-access accepted partner club spectators", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockClear();
    mocks.auth.mockResolvedValue({
      user: {
        id: "partner-player",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "community-2",
      },
    });
    mocks.getSessionMembership.mockResolvedValue({
      clubId: "community-2",
      role: "MEMBER",
    });
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
            avatarKey: null,
            isTutorial: false,
          },
        },
        {
          clubId: "community-2",
          role: "PARTNER",
          status: "ACCEPTED",
          club: {
            id: "community-2",
            name: "Partner Club",
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
    expect(body.viewerClubRole).toBe("MEMBER");
    expect(body.viewerIsQuickAccess).toBe(true);
    expect(body.viewerCanManage).toBe(false);
  });

  it("rejects quick-access pending partner club spectators", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockClear();
    mocks.auth.mockResolvedValue({
      user: {
        id: "partner-player",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "community-2",
      },
    });
    mocks.sessionFindUnique.mockResolvedValueOnce({
      ...sessionData,
      sessionClubs: [
        {
          clubId: "community-2",
          role: "PARTNER",
          status: "PENDING",
          club: {
            id: "community-2",
            name: "Partner Club",
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

    expect(response.status).toBe(403);
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

  it("offers rollback to the host club admin for the latest completed real session", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({ ...sessionData, status: "COMPLETED" });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewerCanRollback).toBe(true);
    expect(mocks.sessionFindFirst).toHaveBeenCalledWith({
      where: {
        clubId: "community-1",
        status: "COMPLETED",
        isTest: false,
      },
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
  });

  it("offers rollback to a global admin without host club membership", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({ ...sessionData, status: "COMPLETED" });
    mocks.auth.mockResolvedValue({ user: { id: "account-u1", isAdmin: true } });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).viewerCanRollback).toBe(true);
  });

  it("does not offer rollback for an older completed session", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({ ...sessionData, status: "COMPLETED" });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.sessionFindFirst.mockResolvedValue({ id: "newer-session" });

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).viewerCanRollback).toBe(false);
  });

  it.each([
    { reason: "staff access", hostRole: "STAFF" },
    { reason: "member access", hostRole: "MEMBER" },
    { reason: "a partner club admin", hostRole: null, partnerAdmin: true },
    { reason: "a test session", hostRole: "ADMIN", isTest: true },
    { reason: "a tutorial session", hostRole: "ADMIN", tutorial: true },
    { reason: "an active session", hostRole: "ADMIN", status: "ACTIVE" },
    { reason: "quick access", hostRole: "ADMIN", quickAccess: true },
  ])("does not offer rollback for $reason", async (caseData) => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({
      ...sessionData,
      status: caseData.status ?? "COMPLETED",
      isTest: caseData.isTest ?? false,
      club: caseData.tutorial
        ? { id: "community-1", isTutorial: true, tutorialOwnerId: "account-u1" }
        : null,
    });
    mocks.clubMemberFindUnique.mockResolvedValue(
      caseData.hostRole ? { role: caseData.hostRole, status: "ACTIVE" } : null
    );
    if (caseData.partnerAdmin) {
      mocks.getSessionAdminMembership.mockResolvedValue({ role: "ADMIN" });
    }
    if (caseData.quickAccess) {
      mocks.auth.mockResolvedValue({
        user: { id: "guest:u1", guestPlayerId: "u1", isAdmin: false, isQuickAccess: true, quickAccessClubId: "community-1" },
      });
    }

    const response = await GET(
      new Request("http://localhost/api/sessions/ABC123"),
      { params: Promise.resolve({ code: "ABC123" }) }
    );

    expect(response.status).toBe(200);
    expect((await response.json()).viewerCanRollback).toBe(false);
    expect(mocks.sessionFindFirst).not.toHaveBeenCalled();
  });

  it("masks tutorial club names in linked session clubs", async () => {
    const sessionData = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockClear();
    mocks.sessionFindUnique.mockResolvedValueOnce({
      ...sessionData,
      club: {
        id: "community-1",
        isTutorial: true,
        tutorialOwnerId: "account-u1",
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

  it.each(["COMPLETED", "ACTIVE"])("normalizes old paused players only when the session is %s", async (status) => {
    const existing = await mocks.sessionFindUnique();
    mocks.sessionFindUnique.mockResolvedValue({ ...existing, status, players: existing.players.map((player: { userId: string }) => ({...player, isPaused: true, pausedAt: new Date('2026-09-08T10:00:00Z')})) });
    const response = await GET(new Request('http://localhost/api/sessions/ABC123'), {params: Promise.resolve({code:'ABC123'})});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.players[0].isPaused).toBe(status === 'ACTIVE');
    if (status === 'COMPLETED') expect(body.players[0].pausedAt).toBeNull();
  });
});
