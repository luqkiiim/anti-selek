import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubFindUnique: vi.fn(),
  clubNotificationCount: vi.fn(),
  clubNotificationFindMany: vi.fn(),
  clubNotificationUpdateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
    club: {
      findUnique: mocks.clubFindUnique,
    },
    clubNotification: {
      count: mocks.clubNotificationCount,
      findMany: mocks.clubNotificationFindMany,
      updateMany: mocks.clubNotificationUpdateMany,
    },
  },
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

import { GET } from "./route";
import { POST as MARK_READ } from "./read/route";

describe("club notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.auth.mockResolvedValue({
      user: { id: "viewer-1", isAdmin: false },
    });
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "MEMBER" });
    mocks.clubFindUnique.mockResolvedValue({
      id: "club-1",
      createdById: "owner-1",
      isTutorial: false,
      tutorialOwnerId: null,
    });
    mocks.clubNotificationCount.mockResolvedValue(2);
    mocks.clubNotificationFindMany.mockResolvedValue([
      {
        id: "notification-1",
        type: "NEWS_LIKE",
        newsItemId: "session-1:rating_jump:player-1",
        newsType: "RATING_JUMP",
        title: "Player One",
        detail: "Biggest rating jump",
        value: "+24 rating",
        readAt: null,
        createdAt: new Date("2026-06-30T08:00:00.000Z"),
        actor: {
          id: "actor-1",
          name: "Actor One",
          avatarKey: "https://example.com/avatar.jpg",
        },
        session: {
          id: "session-1",
          code: "ABCD",
          name: "Friday Mexicano",
          createdAt: new Date("2026-06-30T07:00:00.000Z"),
          endedAt: new Date("2026-06-30T09:00:00.000Z"),
        },
      },
    ]);
    mocks.clubNotificationUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("returns current user notifications and unread count", async () => {
    const response = await GET(
      new Request("http://localhost/api/clubs/club-1/notifications"),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId: "club-1",
          recipientUserId: "viewer-1",
        },
      })
    );
    expect(body.unreadCount).toBe(2);
    expect(body.notifications[0]).toMatchObject({
      id: "notification-1",
      actor: {
        id: "actor-1",
        name: "Actor One",
        avatarUrl: "https://example.com/avatar.jpg",
      },
      session: {
        id: "session-1",
        code: "ABCD",
        name: "Friday Mexicano",
        date: "2026-06-30T09:00:00.000Z",
      },
    });
  });

  it("supports unread count polling without loading rows", async () => {
    const response = await GET(
      new Request("http://localhost/api/clubs/club-1/notifications?countOnly=1"),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ unreadCount: 2 });
    expect(mocks.clubNotificationFindMany).not.toHaveBeenCalled();
  });

  it("marks current user club notifications as read", async () => {
    const response = await MARK_READ(
      new Request("http://localhost/api/clubs/club-1/notifications/read", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubNotificationUpdateMany).toHaveBeenCalledWith({
      where: {
        clubId: "club-1",
        recipientUserId: "viewer-1",
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
    expect(body).toEqual({ unreadCount: 0 });
  });

  it("rejects users outside the club", async () => {
    mocks.clubMemberFindUnique.mockResolvedValueOnce(null);
    mocks.clubFindUnique.mockResolvedValueOnce({
      id: "club-1",
      createdById: "owner-1",
      isTutorial: false,
      tutorialOwnerId: null,
    });

    const response = await GET(
      new Request("http://localhost/api/clubs/club-1/notifications"),
      {
        params: Promise.resolve({ id: "club-1" }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.clubNotificationFindMany).not.toHaveBeenCalled();
  });
});
