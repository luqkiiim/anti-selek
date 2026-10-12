import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubAccessFindUnique: vi.fn(),
  clubFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  transaction: vi.fn(),
  clubNewsLikeUpsert: vi.fn(),
  clubNewsLikeDeleteMany: vi.fn(),
  clubNewsLikeCount: vi.fn(),
  clubNotificationUpsert: vi.fn(),
  clubNotificationDeleteMany: vi.fn(),
  listSessionsForClub: vi.fn(),
  buildClubPulse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findMany: mocks.clubMemberFindMany,
    },
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
    },
    club: {
      findUnique: mocks.clubFindUnique,
    },
    match: {
      findMany: mocks.matchFindMany,
    },
    $transaction: mocks.transaction,
    clubNewsLike: {
      upsert: mocks.clubNewsLikeUpsert,
      deleteMany: mocks.clubNewsLikeDeleteMany,
      count: mocks.clubNewsLikeCount,
    },
    clubNotification: {
      upsert: mocks.clubNotificationUpsert,
      deleteMany: mocks.clubNotificationDeleteMany,
    },
  },
}));

vi.mock("@/app/api/sessions/listSessionsService", () => ({
  listSessionsForClub: mocks.listSessionsForClub,
}));

vi.mock("@/lib/clubPulse", () => ({
  buildClubPulse: mocks.buildClubPulse,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: vi.fn(() => true),
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(() => false),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { POST } from "./route";

const newsItem = {
  id: "session-1:rating_jump:player-featured",
  type: "RATING_JUMP",
  session: {
    id: "session-1",
    code: "ABCD",
    name: "Friday Mexicano",
    date: "2026-05-18T00:00:00.000Z",
  },
  title: "Player One",
  detail: "Biggest rating jump",
  value: "+24 rating",
  players: [{ id: "player-featured", name: "Player One", avatarUrl: null }],
  featuredPlayers: [{ id: "player-featured", name: "Player One", avatarUrl: null }],
  likeCount: 0,
  likedByMe: false,
};

let clubMembers: Array<{
  id: string;
  clubId: string;
  playerId: string;
  ownerUserId: string | null;
  archivedAt: Date | null;
  retiredByAdmissionEventId: string | null;
  elo: number;
  player: { id: string; name: string; avatarKey: string | null };
}>;

function createRequest(body: unknown) {
  return new Request("http://localhost/api/clubs/club-1/news-likes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("club news likes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.transaction.mockImplementation(async (operations: unknown[]) =>
      Promise.all(operations)
    );
    mocks.auth.mockResolvedValue({
      user: { id: "account-viewer", isAdmin: false },
    });
    mocks.clubAccessFindUnique.mockResolvedValue({
      role: "MEMBER",
      status: "ACTIVE",
    });
    mocks.clubFindUnique.mockResolvedValue({
      id: "club-1",
      createdById: "account-owner",
      isTutorial: false,
      tutorialOwnerId: null,
    });
    clubMembers = [
      {
        id: "membership-featured",
        clubId: "club-1",
        playerId: "player-featured",
        ownerUserId: "account-featured",
        archivedAt: null,
        retiredByAdmissionEventId: null,
        elo: 1000,
        player: {
          id: "player-featured",
          name: "Player One",
          avatarKey: null,
        },
      },
    ];
    mocks.clubMemberFindMany.mockImplementation(async ({ where }) => {
      const memberships = clubMembers.filter(
        (member) => member.clubId === where.clubId && member.archivedAt === null
      );
      return where.ownerUserId === undefined
        ? memberships
        : memberships.filter(
            (member) =>
              member.ownerUserId === where.ownerUserId &&
              member.retiredByAdmissionEventId === null
          );
    });
    mocks.matchFindMany.mockResolvedValue([]);
    mocks.listSessionsForClub.mockResolvedValue([]);
    mocks.buildClubPulse.mockReturnValue({
      metrics: {
        members: 1,
        activeTournaments: 0,
        completedTournaments: 1,
        recentMatches: 1,
        activePlayers: 1,
        totalMatches: 1,
        totalSessions: 1,
        lastPlayedAt: "2026-05-18T00:00:00.000Z",
      },
      hotPlayers: [],
      ratingMovers: [],
      rivalries: [],
      partnerships: [],
      recentMatches: [],
      sessionNews: [newsItem],
      latestStory: null,
    });
  });

  it("persists a like for a current generated news item", async () => {
    mocks.clubNewsLikeCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const response = await POST(
      createRequest({ newsItemId: newsItem.id, liked: true }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubNewsLikeUpsert).toHaveBeenCalledWith({
      where: {
        newsItemId_userId: {
          newsItemId: newsItem.id,
          userId: "account-viewer",
        },
      },
      update: {},
      create: {
        clubId: "club-1",
        sessionId: "session-1",
        newsItemId: newsItem.id,
        userId: "account-viewer",
      },
    });
    expect(mocks.clubNotificationUpsert).toHaveBeenCalledWith({
      where: {
        type_newsItemId_actorUserId_recipientPlayerId: {
          type: "NEWS_LIKE",
          newsItemId: newsItem.id,
          actorUserId: "account-viewer",
          recipientPlayerId: "player-featured",
        },
      },
      update: {
        detail: "Biggest rating jump",
        title: "Player One",
        value: "+24 rating",
      },
      create: {
        actorUserId: "account-viewer",
        clubId: "club-1",
        detail: "Biggest rating jump",
        newsItemId: newsItem.id,
        newsType: "RATING_JUMP",
        recipientPlayerId: "player-featured",
        sessionId: "session-1",
        title: "Player One",
        type: "NEWS_LIKE",
        value: "+24 rating",
      },
    });
    expect(body).toEqual({
      newsItemId: newsItem.id,
      likedByMe: true,
      likeCount: 3,
    });
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith({
      where: {
        clubId: "club-1",
        ownerUserId: "account-viewer",
        archivedAt: null,
        retiredByAdmissionEventId: null,
      },
      select: { playerId: true },
    });
    expect(mocks.clubMemberFindMany).toHaveBeenCalledTimes(2);
  });

  it("removes an existing like", async () => {
    mocks.clubNewsLikeCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    const response = await POST(
      createRequest({ newsItemId: newsItem.id, liked: false }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubNewsLikeDeleteMany).toHaveBeenCalledWith({
      where: {
        newsItemId: newsItem.id,
        userId: "account-viewer",
      },
    });
    expect(mocks.clubNotificationDeleteMany).toHaveBeenCalledWith({
      where: {
        actorUserId: "account-viewer",
        newsItemId: newsItem.id,
        type: "NEWS_LIKE",
      },
    });
    expect(body).toEqual({
      newsItemId: newsItem.id,
      likedByMe: false,
      likeCount: 2,
    });
  });

  it("does not notify the account that owns the featured profile in this club", async () => {
    clubMembers[0].ownerUserId = "account-viewer";
    mocks.clubNewsLikeCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const response = await POST(
      createRequest({ newsItemId: newsItem.id, liked: true }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.clubNewsLikeUpsert).toHaveBeenCalled();
    expect(mocks.clubNotificationUpsert).not.toHaveBeenCalled();
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith({
      where: {
        clubId: "club-1",
        ownerUserId: "account-viewer",
        archivedAt: null,
        retiredByAdmissionEventId: null,
      },
      select: { playerId: true },
    });
  });

  it("rejects stale or unknown news item ids", async () => {
    const response = await POST(
      createRequest({ newsItemId: "session-1:old:player-featured", liked: true }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("News item is no longer available");
    expect(mocks.clubNewsLikeUpsert).not.toHaveBeenCalled();
  });

  it("rejects users who are not club members, owners, or admins", async () => {
    mocks.clubAccessFindUnique.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({ newsItemId: newsItem.id, liked: true }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.clubNewsLikeUpsert).not.toHaveBeenCalled();
  });
});
