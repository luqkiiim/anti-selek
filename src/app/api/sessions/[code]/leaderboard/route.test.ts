import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionClubStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessSessionRead: vi.fn(),
  getClubEloByUserId: vi.fn(),
  getSessionMembership: vi.fn(),
  invalidTargetResponse: vi.fn(),
  isQuickAccessSession: vi.fn(),
  sessionFindUnique: vi.fn(),
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

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: mocks.getClubEloByUserId,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessSessionRead: mocks.canQuickAccessSessionRead,
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionMembership: mocks.getSessionMembership,
}));

import { GET } from "./route";

function createLeaderboardSession() {
  return {
    id: "session-1",
    clubId: "club-a",
    type: SessionType.POINTS,
    sessionClubs: [
      { clubId: "club-a", status: SessionClubStatus.ACCEPTED },
      { clubId: "club-b", status: SessionClubStatus.ACCEPTED },
    ],
    players: [
      {
        userId: "quick-1",
        isGuest: false,
        sessionPoints: 12,
        ladderEntryAt: null,
        user: {
          id: "quick-1",
          name: "Quick Player",
          elo: 1000,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
      },
      {
        userId: "player-2",
        isGuest: false,
        sessionPoints: 8,
        ladderEntryAt: null,
        user: {
          id: "player-2",
          name: "Player Two",
          elo: 990,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
      },
    ],
    matches: [
      {
        team1User1Id: "quick-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
        team1Score: 21,
        team2Score: 18,
        status: MatchStatus.COMPLETED,
        completedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ],
  };
}

function getLeaderboard() {
  return GET(
    new Request("http://localhost/api/sessions/ABC123/leaderboard"),
    {
      params: Promise.resolve({ code: "ABC123" }),
    }
  );
}

describe("session leaderboard route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "quick-1", isAdmin: false },
    });
    mocks.canQuickAccessSessionRead.mockReturnValue(true);
    mocks.getClubEloByUserId.mockResolvedValue(new Map());
    mocks.getSessionMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.invalidTargetResponse.mockImplementation(async () =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.isQuickAccessSession.mockImplementation(
      (session: { user?: { isQuickAccess?: boolean } } | null | undefined) =>
        session?.user?.isQuickAccess === true
    );
    mocks.sessionFindUnique.mockResolvedValue(createLeaderboardSession());
  });

  it("allows quick-access accepted linked-club spectators to read standings", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "quick-1",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "club-b",
      },
    });

    const response = await getLeaderboard();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentLeaderboard[0]).toMatchObject({
      userId: "quick-1",
      name: "Quick Player",
    });
    expect(mocks.getSessionMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "quick-1",
        acceptedOnly: true,
      })
    );
  });

  it("rejects quick-access spectators outside accepted session clubs", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "quick-1",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "club-c",
      },
    });
    mocks.canQuickAccessSessionRead.mockReturnValue(false);

    const response = await getLeaderboard();

    expect(response.status).toBe(403);
  });
});
