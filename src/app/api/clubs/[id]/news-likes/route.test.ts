import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  clubNewsLikeUpsert: vi.fn(),
  clubNewsLikeDeleteMany: vi.fn(),
  clubNewsLikeCount: vi.fn(),
  listSessionsForClub: vi.fn(),
  buildClubPulse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
    },
    club: {
      findUnique: mocks.clubFindUnique,
    },
    match: {
      findMany: mocks.matchFindMany,
    },
    clubNewsLike: {
      upsert: mocks.clubNewsLikeUpsert,
      deleteMany: mocks.clubNewsLikeDeleteMany,
      count: mocks.clubNewsLikeCount,
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
  id: "session-1:rating_jump:player-1",
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
  players: [{ id: "player-1", name: "Player One", avatarUrl: null }],
  likeCount: 0,
  likedByMe: false,
};

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

    mocks.auth.mockResolvedValue({
      user: { id: "viewer-1", isAdmin: false },
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      role: "MEMBER",
    });
    mocks.clubFindUnique.mockResolvedValue({
      id: "club-1",
      createdById: "owner-1",
      isTutorial: false,
      tutorialOwnerId: null,
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        elo: 1000,
        user: {
          id: "player-1",
          name: "Player One",
          avatarKey: null,
        },
      },
    ]);
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
          userId: "viewer-1",
        },
      },
      update: {},
      create: {
        clubId: "club-1",
        sessionId: "session-1",
        newsItemId: newsItem.id,
        userId: "viewer-1",
      },
    });
    expect(body).toEqual({
      newsItemId: newsItem.id,
      likedByMe: true,
      likeCount: 3,
    });
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
        userId: "viewer-1",
      },
    });
    expect(body).toEqual({
      newsItemId: newsItem.id,
      likedByMe: false,
      likeCount: 2,
    });
  });

  it("rejects stale or unknown news item ids", async () => {
    const response = await POST(
      createRequest({ newsItemId: "session-1:old:player-1", liked: true }),
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
    mocks.clubMemberFindUnique.mockResolvedValueOnce(null);

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
