import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canQuickAccessClub: vi.fn(),
  correctCompletedMatchScore: vi.fn(),
  getSessionAdminMembership: vi.fn(),
  invalidTargetResponse: vi.fn(),
  isQuickAccessSession: vi.fn(),
  logAuditEvent: vi.fn(),
  matchFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/matchCompletion", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matchCompletion")>(
    "@/lib/matchCompletion"
  );

  return {
    ...actual,
    correctCompletedMatchScore: mocks.correctCompletedMatchScore,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findUnique: mocks.matchFindUnique,
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

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionAdminMembership: mocks.getSessionAdminMembership,
}));

import { CorrectCompletedMatchScoreError } from "@/lib/matchCompletion";
import { POST } from "./route";

function createMatch({
  status = MatchStatus.COMPLETED,
  sessionStatus = SessionStatus.COMPLETED,
  isTest = false,
  team1Score = 21,
  team2Score = 18,
}: {
  status?: MatchStatus;
  sessionStatus?: SessionStatus;
  isTest?: boolean;
  team1Score?: number | null;
  team2Score?: number | null;
} = {}) {
  return {
    id: "match-1",
    status,
    team1Score,
    team2Score,
    sessionId: "session-1",
    session: {
      id: "session-1",
      code: "ABC123",
      name: "Friday Night",
      clubId: "community-1",
      isTest,
      status: sessionStatus,
    },
  };
}

function postCorrection(body: unknown = { team1Score: 21, team2Score: 16 }) {
  return POST(
    new Request("http://localhost/api/matches/match-1/correction", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "match-1" }) }
  );
}

describe("completed match score correction route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: {
        email: "admin@example.com",
        id: "admin-1",
        isAdmin: false,
      },
    });
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.invalidTargetResponse.mockImplementation(async () =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.matchFindUnique.mockResolvedValue(createMatch());
    mocks.getSessionAdminMembership.mockResolvedValue({ role: "ADMIN" });
    mocks.correctCompletedMatchScore.mockResolvedValue({
      success: true,
      correctedMatch: { id: "match-1", team1Score: 21, team2Score: 16 },
      replayedMatchIds: ["match-1", "match-2"],
      oldScore: { team1Score: 21, team2Score: 18 },
      newScore: { team1Score: 21, team2Score: 16 },
    });
  });

  it("allows admins to correct a completed score in an ended session", async () => {
    const response = await postCorrection();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      replayedMatchIds: ["match-1", "match-2"],
    });
    expect(mocks.correctCompletedMatchScore).toHaveBeenCalledWith({
      matchId: "match-1",
      finalTeam1Score: 21,
      finalTeam2Score: 16,
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "match.score_correction",
        details: expect.objectContaining({
          newScore: { team1Score: 21, team2Score: 16 },
          oldScore: { team1Score: 21, team2Score: 18 },
        }),
      })
    );
  });

  it("rejects staff and members", async () => {
    mocks.getSessionAdminMembership.mockResolvedValue(null);

    const response = await postCorrection();

    expect(response.status).toBe(403);
    expect(mocks.correctCompletedMatchScore).not.toHaveBeenCalled();
  });

  it("rejects active sessions", async () => {
    mocks.matchFindUnique.mockResolvedValue(
      createMatch({ sessionStatus: SessionStatus.ACTIVE })
    );

    const response = await postCorrection();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only ended sessions can correct completed scores.",
    });
    expect(mocks.correctCompletedMatchScore).not.toHaveBeenCalled();
  });

  it("rejects unchanged scores", async () => {
    const response = await postCorrection({ team1Score: 21, team2Score: 18 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enter a different score to correct this match.",
    });
    expect(mocks.correctCompletedMatchScore).not.toHaveBeenCalled();
  });

  it("returns conflict when exact replay is blocked", async () => {
    mocks.correctCompletedMatchScore.mockRejectedValue(
      new CorrectCompletedMatchScoreError(
        "NEWER_OUTSIDE_MATCHES",
        "Newer completed matches exist outside this session, so exact ELO replay is blocked."
      )
    );

    const response = await postCorrection();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Newer completed matches exist outside this session, so exact ELO replay is blocked.",
    });
  });
});
