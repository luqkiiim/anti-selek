import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchStatus,
  SessionClubStatus,
  SessionStatus,
  SessionType,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessClub: vi.fn(),
  getSessionAdminMembership: vi.fn(),
  getSessionMembership: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  invalidTargetResponse: vi.fn(),
  isQuickAccessSession: vi.fn(),
  matchFindFirst: vi.fn(),
  sessionFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findFirst: mocks.matchFindFirst,
    },
    session: {
      findUnique: mocks.sessionFindUnique,
    },
  },
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionAdminMembership: mocks.getSessionAdminMembership,
  getSessionMembership: mocks.getSessionMembership,
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
}));

import { GET } from "./route";

function createHistorySession() {
  return {
    id: "session-1",
    code: "ABC123",
    communityId: "community-1",
    name: "Friday Night",
    status: SessionStatus.COMPLETED,
    isTest: false,
    type: SessionType.POINTS,
    mode: "MEXICANO",
    createdAt: new Date("2026-05-02T09:00:00.000Z"),
    endedAt: new Date("2026-05-02T11:00:00.000Z"),
    sessionCommunities: [
      {
        communityId: "community-1",
        status: SessionClubStatus.ACCEPTED,
      },
    ],
    players: [{ userId: "admin-1" }, { userId: "a1" }],
    matches: [
      {
        id: "match-1",
        status: MatchStatus.COMPLETED,
        createdAt: new Date("2026-05-02T09:25:00.000Z"),
        completedAt: new Date("2026-05-02T09:45:00.000Z"),
        team1User1Id: "a1",
        team1User2Id: "a2",
        team2User1Id: "b1",
        team2User2Id: "b2",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        team1EloChange: 10,
        team2EloChange: -10,
        court: { courtNumber: 1, label: null },
        team1User1: { id: "a1", name: "A1" },
        team1User2: { id: "a2", name: "A2" },
        team2User1: { id: "b1", name: "B1" },
        team2User2: { id: "b2", name: "B2" },
      },
    ],
  };
}

function getHistory() {
  return GET(new Request("http://localhost/api/sessions/ABC123/history"), {
    params: Promise.resolve({ code: "ABC123" }),
  });
}

describe("session history route correction availability", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.invalidTargetResponse.mockImplementation(async () =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.sessionFindUnique.mockResolvedValue(createHistorySession());
    mocks.getSessionMembership.mockResolvedValue({ role: "ADMIN" });
    mocks.getSessionOperatorMembership.mockResolvedValue({ role: "ADMIN" });
    mocks.getSessionAdminMembership.mockResolvedValue({ role: "ADMIN" });
    mocks.matchFindFirst.mockResolvedValue(null);
  });

  it("marks completed sessions correctable for admins when replay is exact", async () => {
    const response = await getHistory();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canCorrectCompletedScores).toBe(true);
    expect(body.correctionBlockedReason).toBeNull();
  });

  it("returns a blocked reason when newer outside matches exist", async () => {
    mocks.matchFindFirst.mockResolvedValue({ id: "outside-match" });

    const response = await getHistory();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canCorrectCompletedScores).toBe(false);
    expect(body.correctionBlockedReason).toBe(
      "Newer completed matches exist outside this session, so exact ELO replay is blocked."
    );
  });

  it("does not expose completed score correction to staff", async () => {
    mocks.getSessionMembership.mockResolvedValue({ role: "STAFF" });
    mocks.getSessionOperatorMembership.mockResolvedValue({ role: "STAFF" });
    mocks.getSessionAdminMembership.mockResolvedValue(null);

    const response = await getHistory();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewerCanManage).toBe(true);
    expect(body.canCorrectCompletedScores).toBe(false);
    expect(body.correctionBlockedReason).toBeNull();
    expect(mocks.matchFindFirst).not.toHaveBeenCalled();
  });
});
