import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATCH_SCORE_ERROR_MESSAGE } from "@/lib/matchRules";
import { MatchStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  finalizeMatchResult: vi.fn(),
  matchFindUnique: vi.fn(),
  matchUpdateMany: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  shouldRequireOpponentApproval: vi.fn(),
  reconcileSessionQueueAfterCourtChange: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/matchCompletion", () => ({
  finalizeMatchResult: mocks.finalizeMatchResult,
}));

vi.mock("@/lib/matchApprovalRules", () => ({
  shouldRequireOpponentApproval: mocks.shouldRequireOpponentApproval,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findUnique: mocks.matchFindUnique,
      updateMany: mocks.matchUpdateMany,
    },
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
  },
}));

vi.mock("../../_lib/reconcileSessionQueue", () => ({
  reconcileSessionQueueAfterCourtChange:
    mocks.reconcileSessionQueueAfterCourtChange,
}));

import { POST } from "./route";

function createMatch() {
  return {
    id: "match-1",
    sessionId: "session-1",
    courtId: "court-1",
    status: MatchStatus.IN_PROGRESS,
    session: {
      communityId: null,
      type: SessionType.POINTS,
      isTest: true,
    },
    team1User1Id: "a1",
    team1User2Id: "a2",
    team2User1Id: "b1",
    team2User2Id: "b2",
    team1User1: { id: "a1", name: "A1", elo: 1000, isClaimed: true },
    team1User2: { id: "a2", name: "A2", elo: 1000, isClaimed: true },
    team2User1: { id: "b1", name: "B1", elo: 1000, isClaimed: true },
    team2User2: { id: "b2", name: "B2", elo: 1000, isClaimed: true },
  };
}

function postScore(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/matches/match-1/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ id: "match-1" }),
    }
  );
}

describe("score match route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "a1", isAdmin: false },
    });
    mocks.matchFindUnique.mockResolvedValue(createMatch());
    mocks.reconcileSessionQueueAfterCourtChange.mockResolvedValue({
      autoAssignedMatch: null,
      queuedMatchCleared: false,
      queuedMatch: null,
    });
  });

  it("rejects tied score submissions", async () => {
    const response = await postScore({ team1Score: 10, team2Score: 10 });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: MATCH_SCORE_ERROR_MESSAGE,
    });
    expect(mocks.finalizeMatchResult).not.toHaveBeenCalled();
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a below-21 score for immediate completion", async () => {
    const completedMatch = {
      id: "match-1",
      status: MatchStatus.COMPLETED,
      team1Score: 11,
      team2Score: 9,
      winnerTeam: 1,
    };
    mocks.shouldRequireOpponentApproval.mockReturnValue(false);
    mocks.finalizeMatchResult.mockResolvedValue(completedMatch);

    const response = await postScore({ team1Score: 11, team2Score: 9 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject(completedMatch);
    expect(mocks.finalizeMatchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: MatchStatus.IN_PROGRESS,
        finalTeam1Score: 11,
        finalTeam2Score: 9,
        scoreSubmittedByUserId: "a1",
      })
    );
  });

  it("submits a close below-21 score for opponent approval", async () => {
    const pendingMatch = {
      id: "match-1",
      status: MatchStatus.PENDING_APPROVAL,
      team1Score: 15,
      team2Score: 14,
      winnerTeam: 1,
    };
    mocks.matchFindUnique
      .mockResolvedValueOnce(createMatch())
      .mockResolvedValueOnce(pendingMatch);
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
        scoreSubmittedByUserId: "a1",
      }),
    });
  });
});
