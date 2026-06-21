import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  queuedMatchDeleteMany: vi.fn(),
  courtUpdateMany: vi.fn(),
  matchDeleteMany: vi.fn(),
  transaction: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  getAcceptedSessionClubIds: vi.fn(),
  getPlayerClubBadges: vi.fn(),
  withPlayerClubBadges: vi.fn(),
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getAcceptedSessionClubIds: mocks.getAcceptedSessionClubIds,
  getPlayerClubBadges: mocks.getPlayerClubBadges,
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
  withPlayerClubBadges: mocks.withPlayerClubBadges,
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: mocks.getClubEloByUserId,
  withClubElo: mocks.withClubElo,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

import { POST } from "./route";

describe("session end route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.auth.mockResolvedValue({
      user: { id: "staff-1", isAdmin: false },
    });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.getSessionOperatorMembership.mockResolvedValue({ role: "STAFF" });
    mocks.getAcceptedSessionClubIds.mockResolvedValue(["community-1"]);
    mocks.getClubEloByUserId.mockResolvedValue(new Map());
    mocks.withClubElo.mockImplementation((players) => players);
    mocks.getPlayerClubBadges.mockResolvedValue(new Map());
    mocks.withPlayerClubBadges.mockImplementation((players) => players);

    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      endedAt: null,
    });

    const updatedSession = {
      id: "session-1",
      code: "ABC123",
      clubId: "community-1",
      name: "Evening Session",
      status: "COMPLETED",
      type: "POINTS",
      mode: "MEXICANO",
      endedAt: new Date("2026-05-25T12:00:00.000Z"),
      courts: [],
      players: [
        {
          userId: "u1",
          sessionPoints: 18,
          isPaused: false,
          isGuest: false,
          gender: "UNSPECIFIED",
          partnerPreference: "OPEN",
          pool: "A",
          user: {
            id: "u1",
            name: "Alex Lee",
            avatarKey: "https://blob.vercel-storage.com/avatars/u1/photo.jpg",
            elo: 1200,
          },
        },
      ],
    };

    mocks.queuedMatchDeleteMany.mockResolvedValue({ count: 1 });
    mocks.courtUpdateMany.mockResolvedValue({ count: 2 });
    mocks.matchDeleteMany.mockResolvedValue({ count: 3 });
    mocks.sessionUpdate.mockResolvedValue(updatedSession);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        queuedMatch: {
          deleteMany: mocks.queuedMatchDeleteMany,
        },
        court: {
          updateMany: mocks.courtUpdateMany,
        },
        match: {
          deleteMany: mocks.matchDeleteMany,
        },
        session: {
          update: mocks.sessionUpdate,
        },
      })
    );
  });

  it("allows staff to end sessions and returns avatarUrl in the immediate completion payload", async () => {
    const response = await POST(new Request("http://localhost/api/sessions/ABC123/end"), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.players[0].user.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/u1/photo.jpg"
    );
    expect(body.players[0].user.avatarKey).toBeUndefined();
    expect(body.queuedMatch).toBeNull();
  });
});
