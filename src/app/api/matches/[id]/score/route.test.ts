import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATCH_SCORE_ERROR_MESSAGE } from "@/lib/matchRules";
import { MatchStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  finalizeMatchResult: vi.fn(),
  matchFindUnique: vi.fn(),
  matchUpdateMany: vi.fn(),
  shouldRequireOpponentApproval: vi.fn(),
  reconcileSessionQueueAfterCourtChange: vi.fn(),
  sessionMembership: vi.fn(),
  sessionOperatorMembership: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/matchCompletion", () => ({ finalizeMatchResult: mocks.finalizeMatchResult }));
vi.mock("@/lib/matchApprovalRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/matchApprovalRules")>();
  return { ...actual, shouldRequireOpponentApproval: mocks.shouldRequireOpponentApproval };
});
vi.mock("@/lib/sessionCollab", () => ({
  getSessionMembership: mocks.sessionMembership,
  getSessionOperatorMembership: mocks.sessionOperatorMembership,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { match: { findUnique: mocks.matchFindUnique, updateMany: mocks.matchUpdateMany } },
}));
vi.mock("../../_lib/reconcileSessionQueue", () => ({
  reconcileSessionQueueAfterCourtChange: mocks.reconcileSessionQueueAfterCourtChange,
}));

import { POST } from "./route";

function createMatch() {
  return {
    id: "match-1",
    sessionId: "session-1",
    courtId: "court-1",
    status: MatchStatus.IN_PROGRESS,
    session: { clubId: "community-1", sessionClubs: [], type: SessionType.POINTS, isTest: true },
    team1Player1Id: "player-a1",
    team1Player2Id: "player-a2",
    team2Player1Id: "player-b1",
    team2Player2Id: "player-b2",
    team1Player1: { id: "player-a1", name: "A1", elo: 1000, ownerUserId: "account-a1" },
    team1Player2: { id: "player-a2", name: "A2", elo: 1000, ownerUserId: "account-a2" },
    team2Player1: { id: "player-b1", name: "B1", elo: 1000, ownerUserId: "account-b1" },
    team2Player2: { id: "player-b2", name: "B2", elo: 1000, ownerUserId: null },
  };
}

function postScore(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/matches/match-1/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "match-1" }) }
  );
}

describe("score match route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "account-a1", isAdmin: false } });
    mocks.matchFindUnique.mockResolvedValue(createMatch());
    mocks.sessionMembership.mockResolvedValue({ clubId: "community-1", role: "MEMBER" });
    mocks.sessionOperatorMembership.mockResolvedValue(null);
    mocks.reconcileSessionQueueAfterCourtChange.mockResolvedValue({
      autoAssignedMatch: null,
      queuedMatchCleared: false,
      queuedMatch: null,
    });
  });

  it("rejects tied score submissions", async () => {
    const response = await postScore({ team1Score: 10, team2Score: 10 });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: MATCH_SCORE_ERROR_MESSAGE });
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("blocks quick-access participants from submitting scores", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-a1", isAdmin: false, isQuickAccess: true } });
    const response = await postScore({ team1Score: 11, team2Score: 9 });
    expect(response.status).toBe(403);
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a below-21 score for immediate completion with separate actor and Player IDs", async () => {
    const completedMatch = { id: "match-1", status: MatchStatus.COMPLETED, team1Score: 11, team2Score: 9, winnerTeam: 1 };
    mocks.shouldRequireOpponentApproval.mockReturnValue(false);
    mocks.finalizeMatchResult.mockResolvedValue(completedMatch);
    const response = await postScore({ team1Score: 11, team2Score: 9 });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(completedMatch);
    expect(mocks.finalizeMatchResult).toHaveBeenCalledWith(expect.objectContaining({
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 11,
      finalTeam2Score: 9,
      scoreSubmittedByUserId: "account-a1",
      scoreSubmittedByPlayerId: "player-a1",
    }));
  });

  it("does not treat an Account ID that matches a Player ID as participation", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "player-a1", isAdmin: false } });
    const response = await postScore({ team1Score: 11, team2Score: 9 });
    expect(response.status).toBe(403);
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("requires accepted-session ClubAccess for an owned participant", async () => {
    mocks.sessionMembership.mockResolvedValue(null);
    const response = await postScore({ team1Score: 11, team2Score: 9 });
    expect(response.status).toBe(403);
    expect(mocks.sessionMembership).toHaveBeenCalledWith(expect.anything(), {
      session: { id: "session-1", clubId: "community-1" },
      userId: "account-a1",
      acceptedOnly: true,
    });
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("lets staff submit scores for matches they are not playing", async () => {
    const completedMatch = { id: "match-1", status: MatchStatus.COMPLETED, team1Score: 11, team2Score: 7, winnerTeam: 1 };
    mocks.auth.mockResolvedValue({ user: { id: "staff-account", isAdmin: false } });
    mocks.matchFindUnique.mockResolvedValue({
      ...createMatch(),
      session: { clubId: "community-1", type: SessionType.POINTS, isTest: false },
    });
    mocks.sessionOperatorMembership.mockResolvedValue({ role: "STAFF" });
    mocks.shouldRequireOpponentApproval.mockReturnValue(false);
    mocks.finalizeMatchResult.mockResolvedValue(completedMatch);
    const response = await postScore({ team1Score: 11, team2Score: 7 });
    expect(response.status).toBe(200);
    expect(mocks.finalizeMatchResult).toHaveBeenCalledWith(expect.objectContaining({
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 11,
      finalTeam2Score: 7,
      scoreSubmittedByUserId: "staff-account",
      scoreSubmittedByPlayerId: null,
    }));
  });

  it("submits a close below-21 score for opponent approval", async () => {
    const pendingMatch = { id: "match-1", status: MatchStatus.PENDING_APPROVAL, team1Score: 15, team2Score: 14, winnerTeam: 1 };
    mocks.matchFindUnique.mockResolvedValueOnce(createMatch()).mockResolvedValueOnce(pendingMatch);
    mocks.shouldRequireOpponentApproval.mockReturnValue(true);
    mocks.matchUpdateMany.mockResolvedValue({ count: 1 });
    const response = await postScore({ team1Score: 15, team2Score: 14 });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(pendingMatch);
    expect(mocks.matchUpdateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: MatchStatus.IN_PROGRESS },
      data: expect.objectContaining({
        team1Score: 15,
        team2Score: 14,
        winnerTeam: 1,
        status: MatchStatus.PENDING_APPROVAL,
        scoreSubmittedByUserId: "account-a1",
        scoreSubmittedByPlayerId: "player-a1",
      }),
    });
  });
});
