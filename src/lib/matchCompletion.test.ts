import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { finalizeMatchResult, type FinalizableMatch } from "./matchCompletion";

const finalizableMatch: FinalizableMatch = {
  id: "match-1",
  sessionId: "session-1",
  courtId: "court-1",
  team1User1Id: "a1",
  team1User2Id: "a2",
  team2User1Id: "b1",
  team2User2Id: "b2",
  session: {
    communityId: null,
    type: SessionType.POINTS,
    isTest: true,
  },
  team1User1: { id: "a1", name: "A1", elo: 1000 },
  team1User2: { id: "a2", name: "A2", elo: 1000 },
  team2User1: { id: "b1", name: "B1", elo: 1000 },
  team2User2: { id: "b2", name: "B2", elo: 1000 },
};

function createTransactionMock(storedMatch: unknown) {
  return {
    match: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(storedMatch),
    },
    sessionPlayer: {
      findMany: vi.fn().mockResolvedValue([
        { userId: "a1", isGuest: false },
        { userId: "a2", isGuest: false },
        { userId: "b1", isGuest: false },
        { userId: "b2", isGuest: false },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      update: vi.fn().mockResolvedValue({}),
    },
    communityMember: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: "a1", elo: 1000 },
        { id: "a2", elo: 1000 },
        { id: "b1", elo: 1000 },
        { id: "b2", elo: 1000 },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    court: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

type TransactionMock = ReturnType<typeof createTransactionMock>;

describe("finalizeMatchResult", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("derives winnerTeam from the higher final score", async () => {
    const storedMatch = {
      id: "match-1",
      team1Score: 14,
      team2Score: 15,
      winnerTeam: 2,
      status: MatchStatus.COMPLETED,
    };
    const tx: TransactionMock = createTransactionMock(storedMatch);
    mocks.transaction.mockImplementation((callback: (tx: TransactionMock) => unknown) =>
      callback(tx)
    );

    const result = await finalizeMatchResult({
      match: finalizableMatch,
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 14,
      finalTeam2Score: 15,
      scoreSubmittedByUserId: "a1",
    });

    expect(tx.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: MatchStatus.IN_PROGRESS },
      data: expect.objectContaining({
        team1Score: 14,
        team2Score: 15,
        winnerTeam: 2,
        status: MatchStatus.COMPLETED,
        scoreSubmittedByUserId: "a1",
      }),
    });
    expect(result).toBe(storedMatch);
  });

  it("uses a supplied completion time for replayed results", async () => {
    const completedAt = new Date("2026-05-02T10:30:00.000Z");
    const storedMatch = {
      id: "match-1",
      team1Score: 11,
      team2Score: 9,
      winnerTeam: 1,
      status: MatchStatus.COMPLETED,
      completedAt,
    };
    const tx: TransactionMock = createTransactionMock(storedMatch);
    mocks.transaction.mockImplementation((callback: (tx: TransactionMock) => unknown) =>
      callback(tx)
    );

    await finalizeMatchResult({
      match: finalizableMatch,
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 11,
      finalTeam2Score: 9,
      completedAt,
    });

    expect(tx.match.updateMany).toHaveBeenCalledWith({
      where: { id: "match-1", status: MatchStatus.IN_PROGRESS },
      data: expect.objectContaining({
        team1Score: 11,
        team2Score: 9,
        winnerTeam: 1,
        completedAt,
      }),
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.any(Object)
    );
    expect(tx.sessionPlayer.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        lastPlayedAt: completedAt,
        availableSince: completedAt,
      })
    );
  });
});
