import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MatchStatus,
  SessionClubRole,
  SessionClubStatus,
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
  correctCompletedMatchScore,
  CorrectCompletedMatchScoreError,
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
    clubId: null,
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
    clubMember: {
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
      clubId: "community-1",
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
    clubMember: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

type UndoTransactionMock = ReturnType<typeof createUndoTransactionMock>;

function createReplayMatch({
  id,
  completedAt,
  team1Score = 21,
  team2Score = 18,
  winnerTeam = 1,
}: {
  id: string;
  completedAt: Date;
  team1Score?: number;
  team2Score?: number;
  winnerTeam?: 1 | 2;
}) {
  return {
    id,
    sessionId: "session-1",
    courtId: "court-1",
    status: MatchStatus.COMPLETED,
    team1User1Id: "a1",
    team1User2Id: "a2",
    team2User1Id: "b1",
    team2User2Id: "b2",
    team1Score,
    team2Score,
    winnerTeam,
    team1EloChange: winnerTeam === 1 ? 10 : -10,
    team2EloChange: winnerTeam === 1 ? -10 : 10,
    createdAt: new Date(completedAt.getTime() - 60_000),
    completedAt,
    session: {
      clubId: "community-1",
      isTest: false,
      status: SessionStatus.COMPLETED,
      type: SessionType.POINTS,
    },
    team1User1: { id: "a1", name: "A1", elo: 1000 },
    team1User2: { id: "a2", name: "A2", elo: 1000 },
    team2User1: { id: "b1", name: "B1", elo: 1000 },
    team2User2: { id: "b2", name: "B2", elo: 1000 },
  };
}

function createCorrectionTransactionMock({
  targetMatch = createReplayMatch({
    id: "match-1",
    completedAt: new Date("2026-05-02T10:00:00.000Z"),
  }),
  laterMatch = createReplayMatch({
    id: "match-2",
    completedAt: new Date("2026-05-02T10:30:00.000Z"),
    team1Score: 18,
    team2Score: 21,
    winnerTeam: 2,
  }),
  newerOutsideMatch = null,
}: {
  targetMatch?: ReturnType<typeof createReplayMatch>;
  laterMatch?: ReturnType<typeof createReplayMatch>;
  newerOutsideMatch?: { id: string } | null;
} = {}) {
  return {
    match: {
      findUnique: vi.fn().mockResolvedValue(targetMatch),
      findMany: vi.fn().mockResolvedValue([targetMatch, laterMatch]),
      findFirst: vi.fn().mockResolvedValue(newerOutsideMatch),
      update: vi.fn(async ({ where, data }) => ({
        id: where.id,
        ...data,
      })),
    },
    sessionPlayer: {
      findMany: vi.fn().mockResolvedValue([
        { userId: "a1", isGuest: false },
        { userId: "a2", isGuest: false },
        { userId: "b1", isGuest: false },
        { userId: "b2", isGuest: false },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    clubMember: {
      findMany: vi.fn().mockResolvedValue([
        { clubId: "community-1", userId: "a1", elo: 1000 },
        { clubId: "community-1", userId: "a2", elo: 1000 },
        { clubId: "community-1", userId: "b1", elo: 1000 },
        { clubId: "community-1", userId: "b2", elo: 1000 },
      ]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    matchEloAdjustment: {
      findMany: vi.fn().mockResolvedValue([
        { matchId: "match-1", clubId: "community-1", userId: "a1", delta: 10 },
        { matchId: "match-1", clubId: "community-1", userId: "a2", delta: 10 },
        { matchId: "match-1", clubId: "community-1", userId: "b1", delta: -10 },
        { matchId: "match-1", clubId: "community-1", userId: "b2", delta: -10 },
        { matchId: "match-2", clubId: "community-1", userId: "a1", delta: -10 },
        { matchId: "match-2", clubId: "community-1", userId: "a2", delta: -10 },
        { matchId: "match-2", clubId: "community-1", userId: "b1", delta: 10 },
        { matchId: "match-2", clubId: "community-1", userId: "b2", delta: 10 },
      ]),
      deleteMany: vi.fn().mockResolvedValue({ count: 8 }),
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
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
  };
}

type CorrectionTransactionMock = ReturnType<typeof createCorrectionTransactionMock>;

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
    const clubMemberUpdate = vi.fn().mockResolvedValue({});
    const matchEloAdjustmentCreateMany = vi
      .fn()
      .mockResolvedValue({ count: 5 });
    const tx = {
      ...baseTx,
      sessionClub: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "link-host",
            sessionId: "session-1",
            clubId: "community-a",
            role: SessionClubRole.HOST,
            status: SessionClubStatus.ACCEPTED,
            createdAt: new Date("2026-05-14T09:00:00.000Z"),
            club: { id: "community-a", name: "Host Club" },
          },
          {
            id: "link-partner",
            sessionId: "session-1",
            clubId: "community-b",
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.ACCEPTED,
            createdAt: new Date("2026-05-14T09:01:00.000Z"),
            club: { id: "community-b", name: "Partner Club" },
          },
        ]),
      },
      clubMember: {
        ...baseTx.clubMember,
        findMany: vi.fn().mockResolvedValue([
          { clubId: "community-a", userId: "a1", elo: 1000 },
          { clubId: "community-a", userId: "a2", elo: 1000 },
          { clubId: "community-b", userId: "a1", elo: 1100 },
          { clubId: "community-b", userId: "b1", elo: 1200 },
          { clubId: "community-b", userId: "b2", elo: 1200 },
        ]),
        update: clubMemberUpdate,
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
          clubId: "community-a",
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

    expect(clubMemberUpdate).toHaveBeenCalledTimes(5);
    expect(matchEloAdjustmentCreateMany).toHaveBeenCalledTimes(1);
    const ledgerRows = matchEloAdjustmentCreateMany.mock.calls[0][0].data;
    expect(
      ledgerRows.map((row: { clubId: string; userId: string }) => [
        row.clubId,
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
        (row: { clubId: string; userId: string }) =>
          row.clubId === "community-a" && row.userId === "a1"
      )?.delta
    ).toBeGreaterThan(0);
    expect(
      ledgerRows.find(
        (row: { clubId: string; userId: string }) =>
          row.clubId === "community-b" && row.userId === "b1"
      )?.delta
    ).toBeLessThan(0);
    expect(result).toMatchObject({
      playerEloChanges: expect.arrayContaining([
        expect.objectContaining({ userId: "a1", clubId: "community-a" }),
        expect.objectContaining({ userId: "a2", clubId: "community-a" }),
        expect.objectContaining({ userId: "b1", clubId: "community-b" }),
        expect.objectContaining({ userId: "b2", clubId: "community-b" }),
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
          clubId: null,
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
    expect(tx.clubMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        clubId: "community-1",
        userId: { in: ["a1"] },
      },
      data: { elo: { increment: -10 } },
    });
    expect(tx.clubMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        clubId: "community-1",
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
          clubId: "community-1",
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

    expect(tx.clubMember.updateMany).not.toHaveBeenCalled();
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
      { clubId: "community-a", userId: "a1", delta: 14 },
      { clubId: "community-b", userId: "b1", delta: -16 },
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
        clubId: true,
        userId: true,
        delta: true,
      },
    });
    expect(tx.clubMember.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.clubMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        clubId: "community-a",
        userId: "a1",
      },
      data: { elo: { increment: -14 } },
    });
    expect(tx.clubMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        clubId: "community-b",
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

describe("correctCompletedMatchScore", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("replays the corrected match and later same-session ELO changes", async () => {
    const tx: CorrectionTransactionMock = createCorrectionTransactionMock();
    mocks.transaction.mockImplementation(
      (callback: (tx: CorrectionTransactionMock) => unknown) => callback(tx)
    );

    const result = await correctCompletedMatchScore({
      matchId: "match-1",
      finalTeam1Score: 21,
      finalTeam2Score: 16,
    });

    expect(result).toMatchObject({
      success: true,
      replayedMatchIds: ["match-1", "match-2"],
      oldScore: { team1Score: 21, team2Score: 18 },
      newScore: { team1Score: 21, team2Score: 16 },
    });
    expect(tx.matchEloAdjustment.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ["match-1", "match-2"] } },
    });
    expect(tx.match.update).toHaveBeenNthCalledWith(1, {
      where: { id: "match-1" },
      data: expect.objectContaining({
        team1Score: 21,
        team2Score: 16,
        winnerTeam: 1,
        team1EloChange: expect.any(Number),
        team2EloChange: expect.any(Number),
      }),
    });
    expect(tx.match.update).toHaveBeenNthCalledWith(2, {
      where: { id: "match-2" },
      data: expect.objectContaining({
        team1Score: 18,
        team2Score: 21,
        winnerTeam: 2,
        team1EloChange: expect.any(Number),
        team2EloChange: expect.any(Number),
      }),
    });
    expect(tx.matchEloAdjustment.createMany).toHaveBeenCalledTimes(2);
  });

  it("moves session points when the corrected winner changes", async () => {
    const tx: CorrectionTransactionMock = createCorrectionTransactionMock();
    mocks.transaction.mockImplementation(
      (callback: (tx: CorrectionTransactionMock) => unknown) => callback(tx)
    );

    await correctCompletedMatchScore({
      matchId: "match-1",
      finalTeam1Score: 17,
      finalTeam2Score: 21,
    });

    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: { in: ["a1", "a2"] },
      },
      data: { sessionPoints: { increment: -3 } },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: { in: ["b1", "b2"] },
      },
      data: { sessionPoints: { increment: 3 } },
    });
  });

  it("blocks correction when newer outside matches would require cross-session replay", async () => {
    const tx: CorrectionTransactionMock = createCorrectionTransactionMock({
      newerOutsideMatch: { id: "outside-match" },
    });
    mocks.transaction.mockImplementation(
      (callback: (tx: CorrectionTransactionMock) => unknown) => callback(tx)
    );

    await expect(
      correctCompletedMatchScore({
        matchId: "match-1",
        finalTeam1Score: 21,
        finalTeam2Score: 16,
      })
    ).rejects.toMatchObject({
      code: "NEWER_OUTSIDE_MATCHES",
    } satisfies Partial<CorrectCompletedMatchScoreError>);
    expect(tx.match.update).not.toHaveBeenCalled();
    expect(tx.matchEloAdjustment.deleteMany).not.toHaveBeenCalled();
  });
});
