import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchStatus,
  SessionCommunityRole,
  SessionCommunityStatus,
  SessionStatus,
  SessionType,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  finalizeMatchResult,
  undoCompletedMatchResult,
  UndoCompletedMatchError,
  type FinalizableMatch,
} from "./matchCompletion";

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
    offlineIdentityMember: {
      findMany: vi.fn().mockResolvedValue([]),
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

function createUndoTransactionMock({
  match = {
    id: "match-1",
    sessionId: "session-1",
    courtId: "court-1",
    status: MatchStatus.COMPLETED,
    team1User1Id: "a1",
    team1User2Id: "a2",
    team2User1Id: "b1",
    team2User2Id: "b2",
    team1Score: 21,
    team2Score: 18,
    winnerTeam: 1,
    team1EloChange: 10,
    team2EloChange: -10,
    completedAt: new Date("2026-05-02T10:30:00.000Z"),
    createdAt: new Date("2026-05-02T10:00:00.000Z"),
    session: {
      communityId: "community-1",
      isTest: false,
      status: SessionStatus.ACTIVE,
      type: SessionType.POINTS,
    },
  },
  latestCompletedMatch = { id: "match-1" },
  previousCompletedMatch = {
    completedAt: new Date("2026-05-02T09:30:00.000Z"),
    createdAt: new Date("2026-05-02T09:00:00.000Z"),
    team1User1Id: "a1",
    team1User2Id: "b1",
    team2User1Id: "a2",
    team2User2Id: "b2",
  },
} = {}) {
  return {
    match: {
      findUnique: vi.fn().mockResolvedValue(match),
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(latestCompletedMatch)
        .mockResolvedValue(previousCompletedMatch),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sessionPlayer: {
      findMany: vi.fn().mockResolvedValue([
        { userId: "a1", isGuest: false },
        { userId: "a2", isGuest: true },
        { userId: "b1", isGuest: false },
        { userId: "b2", isGuest: false },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    communityMember: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type UndoTransactionMock = ReturnType<typeof createUndoTransactionMock>;

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

  it("writes a per-community Elo ledger for accepted collab sessions", async () => {
    const storedMatch = {
      id: "match-1",
      team1Score: 21,
      team2Score: 15,
      winnerTeam: 1,
      status: MatchStatus.COMPLETED,
    };
    const baseTx = createTransactionMock(storedMatch);
    const communityMemberUpdate = vi.fn().mockResolvedValue({});
    const matchEloAdjustmentCreateMany = vi
      .fn()
      .mockResolvedValue({ count: 5 });
    const tx = {
      ...baseTx,
      sessionCommunity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "link-host",
            sessionId: "session-1",
            communityId: "community-a",
            role: SessionCommunityRole.HOST,
            status: SessionCommunityStatus.ACCEPTED,
            createdAt: new Date("2026-05-14T09:00:00.000Z"),
            community: { id: "community-a", name: "Host Club" },
          },
          {
            id: "link-partner",
            sessionId: "session-1",
            communityId: "community-b",
            role: SessionCommunityRole.PARTNER,
            status: SessionCommunityStatus.ACCEPTED,
            createdAt: new Date("2026-05-14T09:01:00.000Z"),
            community: { id: "community-b", name: "Partner Club" },
          },
        ]),
      },
      communityMember: {
        ...baseTx.communityMember,
        findMany: vi.fn().mockResolvedValue([
          { communityId: "community-a", userId: "a1", elo: 1000 },
          { communityId: "community-a", userId: "a2", elo: 1000 },
          { communityId: "community-b", userId: "a1", elo: 1100 },
          { communityId: "community-b", userId: "b1", elo: 1200 },
          { communityId: "community-b", userId: "b2", elo: 1200 },
        ]),
        update: communityMemberUpdate,
      },
      matchEloAdjustment: {
        createMany: matchEloAdjustmentCreateMany,
      },
    };
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(tx)
    );

    const result = await finalizeMatchResult({
      match: {
        ...finalizableMatch,
        session: {
          communityId: "community-a",
          type: SessionType.ELO,
          isTest: false,
        },
        team1User1: { id: "a1", name: "A1", elo: 1000 },
        team1User2: { id: "a2", name: "A2", elo: 1000 },
        team2User1: { id: "b1", name: "B1", elo: 1200 },
        team2User2: { id: "b2", name: "B2", elo: 1200 },
      },
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 21,
      finalTeam2Score: 15,
    });

    expect(communityMemberUpdate).toHaveBeenCalledTimes(5);
    expect(matchEloAdjustmentCreateMany).toHaveBeenCalledTimes(1);
    const ledgerRows = matchEloAdjustmentCreateMany.mock.calls[0][0].data;
    expect(
      ledgerRows.map((row: { communityId: string; userId: string }) => [
        row.communityId,
        row.userId,
      ])
    ).toEqual([
      ["community-a", "a1"],
      ["community-a", "a2"],
      ["community-b", "a1"],
      ["community-b", "b1"],
      ["community-b", "b2"],
    ]);
    expect(
      ledgerRows.find(
        (row: { communityId: string; userId: string }) =>
          row.communityId === "community-a" && row.userId === "a1"
      )?.delta
    ).toBeGreaterThan(0);
    expect(
      ledgerRows.find(
        (row: { communityId: string; userId: string }) =>
          row.communityId === "community-b" && row.userId === "b1"
      )?.delta
    ).toBeLessThan(0);
    expect(result).toMatchObject({
      playerEloChanges: expect.arrayContaining([
        expect.objectContaining({ userId: "a1", communityId: "community-a" }),
        expect.objectContaining({ userId: "a2", communityId: "community-a" }),
        expect.objectContaining({ userId: "b1", communityId: "community-b" }),
        expect.objectContaining({ userId: "b2", communityId: "community-b" }),
      ]),
    });
  });

  it("awards session points and persistent ratings for social mix sessions", async () => {
    const storedMatch = {
      id: "match-1",
      team1Score: 21,
      team2Score: 18,
      winnerTeam: 1,
      status: MatchStatus.COMPLETED,
    };
    const tx: TransactionMock = createTransactionMock(storedMatch);
    mocks.transaction.mockImplementation(
      (callback: (tx: TransactionMock) => unknown) => callback(tx)
    );

    await finalizeMatchResult({
      match: {
        ...finalizableMatch,
        session: {
          communityId: null,
          type: SessionType.SOCIAL_MIX,
          isTest: false,
        },
      },
      expectedStatus: MatchStatus.IN_PROGRESS,
      finalTeam1Score: 21,
      finalTeam2Score: 18,
    });

    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          sessionPoints: { increment: 3 },
        }),
      })
    );
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          sessionPoints: { increment: 0 },
        }),
      })
    );
    expect(tx.user.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ["a1", "a2"] } },
      data: { elo: { increment: expect.any(Number) } },
    });
    expect(tx.user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["b1", "b2"] } },
      data: { elo: { increment: expect.any(Number) } },
    });
  });
});

describe("undoCompletedMatchResult", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("reverses the latest completed result without touching live courts", async () => {
    const undoneAt = new Date("2026-05-02T11:00:00.000Z");
    const tx: UndoTransactionMock = createUndoTransactionMock();
    mocks.transaction.mockImplementation(
      (callback: (tx: UndoTransactionMock) => unknown) => callback(tx)
    );

    const result = await undoCompletedMatchResult({
      matchId: "match-1",
      undoneAt,
    });

    expect(result).toEqual({
      ok: true,
      undoneMatchId: "match-1",
      affectedUserIds: ["a1", "a2", "b1", "b2"],
    });
    expect(tx.communityMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        communityId: "community-1",
        userId: { in: ["a1"] },
      },
      data: { elo: { increment: -10 } },
    });
    expect(tx.communityMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        communityId: "community-1",
        userId: { in: ["b1", "b2"] },
      },
      data: { elo: { increment: 10 } },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        sessionId: "session-1",
        userId: { in: ["a1", "a2"] },
      },
      data: {
        sessionPoints: { decrement: 3 },
        matchesPlayed: { decrement: 1 },
      },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        sessionId: "session-1",
        userId: { in: ["b1", "b2"] },
      },
      data: {
        matchesPlayed: { decrement: 1 },
      },
    });
    expect(tx.match.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "match-1",
        status: MatchStatus.COMPLETED,
      },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1", userId: "a1" },
      data: {
        availableSince: undoneAt,
        lastPlayedAt: new Date("2026-05-02T09:30:00.000Z"),
        lastPartnerId: "b1",
      },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1", userId: "a2" },
      data: {
        availableSince: undoneAt,
        lastPlayedAt: new Date("2026-05-02T09:30:00.000Z"),
        lastPartnerId: "b2",
      },
    });
  });

  it("does not reverse Elo or session points for test ladder sessions", async () => {
    const tx: UndoTransactionMock = createUndoTransactionMock({
      match: {
        id: "match-1",
        sessionId: "session-1",
        courtId: "court-1",
        status: MatchStatus.COMPLETED,
        team1User1Id: "a1",
        team1User2Id: "a2",
        team2User1Id: "b1",
        team2User2Id: "b2",
        team1Score: 21,
        team2Score: 18,
        winnerTeam: 1,
        team1EloChange: 10,
        team2EloChange: -10,
        completedAt: new Date("2026-05-02T10:30:00.000Z"),
        createdAt: new Date("2026-05-02T10:00:00.000Z"),
        session: {
          communityId: "community-1",
          isTest: true,
          status: SessionStatus.ACTIVE,
          type: SessionType.LADDER,
        },
      },
    });
    mocks.transaction.mockImplementation(
      (callback: (tx: UndoTransactionMock) => unknown) => callback(tx)
    );

    await undoCompletedMatchResult({ matchId: "match-1" });

    expect(tx.communityMember.updateMany).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        sessionId: "session-1",
        userId: { in: ["a1", "a2"] },
      },
      data: {
        matchesPlayed: { decrement: 1 },
      },
    });
  });

  it("reverses collab Elo from the stored ledger", async () => {
    const baseTx = createUndoTransactionMock();
    const matchEloAdjustmentFindMany = vi.fn().mockResolvedValue([
      { communityId: "community-a", userId: "a1", delta: 14 },
      { communityId: "community-b", userId: "b1", delta: -16 },
    ]);
    const tx = {
      ...baseTx,
      matchEloAdjustment: {
        findMany: matchEloAdjustmentFindMany,
      },
    };
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(tx)
    );

    await undoCompletedMatchResult({ matchId: "match-1" });

    expect(matchEloAdjustmentFindMany).toHaveBeenCalledWith({
      where: { matchId: "match-1" },
      select: {
        communityId: true,
        userId: true,
        delta: true,
      },
    });
    expect(tx.communityMember.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.communityMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        communityId: "community-a",
        userId: "a1",
      },
      data: { elo: { increment: -14 } },
    });
    expect(tx.communityMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        communityId: "community-b",
        userId: "b1",
      },
      data: { elo: { increment: 16 } },
    });
  });

  it("rejects undoing an older completed match", async () => {
    const tx: UndoTransactionMock = createUndoTransactionMock({
      latestCompletedMatch: { id: "newer-match" },
    });
    mocks.transaction.mockImplementation(
      (callback: (tx: UndoTransactionMock) => unknown) => callback(tx)
    );

    await expect(
      undoCompletedMatchResult({ matchId: "match-1" })
    ).rejects.toMatchObject({
      code: "NOT_LATEST_COMPLETED_MATCH",
    } satisfies Partial<UndoCompletedMatchError>);
    expect(tx.match.deleteMany).not.toHaveBeenCalled();
    expect(tx.sessionPlayer.updateMany).not.toHaveBeenCalled();
  });
});
