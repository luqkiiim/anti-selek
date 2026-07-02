import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessClub: vi.fn(),
  finalizeMatchResult: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  invalidTargetResponse: vi.fn(),
  isQuickAccessSession: vi.fn(),
  matchFindUnique: vi.fn(),
  reconcileSessionQueueAfterCourtChange: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/matchCompletion", () => ({
  finalizeMatchResult: mocks.finalizeMatchResult,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findUnique: mocks.matchFindUnique,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("../../_lib/reconcileSessionQueue", () => ({
  reconcileSessionQueueAfterCourtChange:
    mocks.reconcileSessionQueueAfterCourtChange,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
}));

import { POST } from "./route";

function createPendingMatch() {
  return {
    id: "match-1",
    sessionId: "session-1",
    status: MatchStatus.PENDING_APPROVAL,
    scoreSubmittedByUserId: null,
    team1Score: 21,
    team2Score: 18,
    team1User1Id: "quick-1",
    team1User2Id: "p2",
    team2User1Id: "p3",
    team2User2Id: "p4",
    session: {
      clubId: "club-a",
      type: SessionType.POINTS,
      isTest: false,
    },
    team1User1: { id: "quick-1", name: "Quick", elo: 1000 },
    team1User2: { id: "p2", name: "P2", elo: 1000 },
    team2User1: { id: "p3", name: "P3", elo: 1000 },
    team2User2: { id: "p4", name: "P4", elo: 1000 },
  };
}

function postApprove() {
  return POST(
    new Request("http://localhost/api/matches/match-1/approve", {
      method: "POST",
      body: JSON.stringify({}),
    }),
    {
      params: Promise.resolve({ id: "match-1" }),
    }
  );
}

describe("approve match route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "quick-1", isAdmin: false },
    });
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.invalidTargetResponse.mockImplementation(async () =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.isQuickAccessSession.mockImplementation(
      (session: { user?: { isQuickAccess?: boolean } } | null | undefined) =>
        session?.user?.isQuickAccess === true
    );
    mocks.matchFindUnique.mockResolvedValue(createPendingMatch());
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.reconcileSessionQueueAfterCourtChange.mockResolvedValue({
      autoAssignedMatch: null,
      queuedMatchCleared: false,
      queuedMatch: null,
    });
  });

  it("blocks quick-access participants from approving pending scores", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "quick-1",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "club-a",
      },
    });

    const response = await postApprove();

    expect(response.status).toBe(403);
    expect(mocks.getSessionOperatorMembership).not.toHaveBeenCalled();
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
  });
});
