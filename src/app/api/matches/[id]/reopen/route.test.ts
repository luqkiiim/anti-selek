import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionClubRole, SessionClubStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  matchFindUnique: vi.fn(),
  matchUpdateMany: vi.fn(),
  sessionClubFindMany: vi.fn(),
  clubAccessFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    match: {
      findUnique: mocks.matchFindUnique,
      updateMany: mocks.matchUpdateMany,
    },
    sessionClub: { findMany: mocks.sessionClubFindMany },
    clubAccess: { findFirst: mocks.clubAccessFindFirst },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { POST } from "./route";

function postReopen() {
  return POST(new Request("http://localhost/api/matches/match-1/reopen"), {
    params: Promise.resolve({ id: "match-1" }),
  });
}

describe("reopen pending match route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "account-operator", isAdmin: false },
    });
    mocks.matchFindUnique
      .mockResolvedValueOnce({
        id: "match-1",
        sessionId: "session-1",
        status: MatchStatus.PENDING_APPROVAL,
        session: { clubId: "club-1" },
      })
      .mockResolvedValueOnce({
        id: "match-1",
        status: MatchStatus.IN_PROGRESS,
        scoreSubmittedByUserId: null,
        scoreSubmittedByPlayerId: null,
        team1Player1: { id: "player-a1", name: "A1" },
        team1Player2: { id: "player-a2", name: "A2" },
        team2Player1: { id: "player-b1", name: "B1" },
        team2Player2: { id: "player-b2", name: "B2" },
      });
    mocks.sessionClubFindMany.mockResolvedValue([
      {
        id: "session-club-1",
        sessionId: "session-1",
        clubId: "club-1",
        role: SessionClubRole.HOST,
        status: SessionClubStatus.ACCEPTED,
        club: { id: "club-1", name: "Club One" },
      },
    ]);
    mocks.clubAccessFindFirst.mockResolvedValue({
      clubId: "club-1",
      role: "STAFF",
    });
    mocks.matchUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("uses active Account access and clears both submitter identities without changing players or reversing ratings", async () => {
    const response = await postReopen();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: MatchStatus.IN_PROGRESS,
      scoreSubmittedByUserId: null,
      scoreSubmittedByPlayerId: null,
      team1Player1: { id: "player-a1" },
      team1Player2: { id: "player-a2" },
      team2Player1: { id: "player-b1" },
      team2Player2: { id: "player-b2" },
    });

    expect(mocks.clubAccessFindFirst).toHaveBeenCalledWith({
      where: {
        clubId: { in: ["club-1"] },
        userId: "account-operator",
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN", "STAFF"] },
      },
      select: { clubId: true, role: true },
    });
    expect(mocks.matchUpdateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: MatchStatus.PENDING_APPROVAL },
      data: {
        status: MatchStatus.IN_PROGRESS,
        team1Score: null,
        team2Score: null,
        winnerTeam: null,
        team1EloChange: null,
        team2EloChange: null,
        completedAt: null,
        scoreSubmittedByUserId: null,
        scoreSubmittedByPlayerId: null,
      },
    });
    const updateData = mocks.matchUpdateMany.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("team1Player1Id");
    expect(updateData).not.toHaveProperty("team1Player2Id");
    expect(updateData).not.toHaveProperty("team2Player1Id");
    expect(updateData).not.toHaveProperty("team2Player2Id");
    expect(mocks.matchUpdateMany).toHaveBeenCalledTimes(1);
  });
});
