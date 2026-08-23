import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtGroupType, SessionPool, SessionStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  courtFindMany: vi.fn(),
  courtCount: vi.fn(),
  loadSessionRecord: vi.fn(),
  loadSessionRecordById: vi.fn(),
  buildMatchmakingState: vi.fn(),
  ensureEnoughPlayers: vi.fn(),
  getRankedCandidates: vi.fn(),
  selectReplacementMatchRespectingSkips: vi.fn(),
  selectSingleCourtMatchRespectingSkips: vi.fn(),
  consumeSkipNextMatches: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    court: {
      findMany: mocks.courtFindMany,
      count: mocks.courtCount,
    },
  },
}));

vi.mock("@/lib/sessionSkipNext", () => ({
  consumeSkipNextMatches: mocks.consumeSkipNextMatches,
}));

vi.mock("../generate-match/shared", async () => {
  const actual = await vi.importActual<
    typeof import("../generate-match/shared")
  >("../generate-match/shared");
  return {
    ...actual,
    loadSessionRecord: mocks.loadSessionRecord,
    loadSessionRecordById: mocks.loadSessionRecordById,
  };
});

vi.mock("../generate-match/selection", () => ({
  buildMatchmakingState: mocks.buildMatchmakingState,
  ensureEnoughPlayers: mocks.ensureEnoughPlayers,
  getRankedCandidates: mocks.getRankedCandidates,
  selectReplacementMatchRespectingSkips:
    mocks.selectReplacementMatchRespectingSkips,
  selectSingleCourtMatchRespectingSkips:
    mocks.selectSingleCourtMatchRespectingSkips,
}));

import {
  createManualQueuedMatchForSession,
  createQueuedMatchForSession,
  replaceQueuedMatchPlayerForSession,
  reshuffleQueuedMatchForSession,
  tryRebuildAutomaticQueuedMatchForSessionId,
} from "./shared";

function player(userId: string, pool: SessionPool = SessionPool.B) {
  return {
    userId,
    pool,
    isPaused: false,
    user: { id: userId, name: userId, elo: 1000 },
  };
}

function queueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-1",
    sessionId: "session-1",
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    team1User1Id: "a1",
    team1User2Id: "b1",
    team2User1Id: "a2",
    team2User2Id: "b2",
    team1ClubId: null,
    team2ClubId: null,
    targetPool: null,
    courtGroupType: CourtGroupType.CROSSOVER,
    poolASeatCount: 2,
    poolBSeatCount: 2,
    isAutomatic: true,
    matchmakingReasonJson: null,
    ...overrides,
  };
}

function sessionRecord(overrides: Record<string, unknown> = {}) {
  const players = [
    player("a1", SessionPool.A),
    player("a2", SessionPool.A),
    player("b1", SessionPool.B),
    player("b2", SessionPool.B),
    player("b3", SessionPool.B),
    player("b4", SessionPool.B),
    player("a3", SessionPool.A),
    player("a4", SessionPool.A),
    player("spare", SessionPool.B),
  ];

  return {
    id: "session-1",
    code: "ABC",
    status: SessionStatus.ACTIVE,
    poolsEnabled: true,
    autoQueueEnabled: true,
    players,
    queuedMatch: null,
    courts: [],
    matches: [],
    ...overrides,
  } as never;
}

function createTransactionMock() {
  const queuedMatchCreate = vi.fn(async ({ data }) =>
    queueRecord({
      ...data,
      id: "created-queue",
      createdAt: new Date("2026-08-23T01:00:00.000Z"),
    })
  );
  const queuedMatchUpdate = vi.fn(async ({ data }) =>
    queueRecord({
      ...data,
      id: "queue-1",
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
    })
  );

  const sessionPlayerFindMany = vi.fn(
    async ({ where, select }): Promise<
      Array<{
        userId: string;
        pool?: SessionPool;
        pendingPool?: SessionPool | null;
      }>
    > => {
      if (!select?.pool) return [];
      return (where.userId.in as string[]).map((userId) => ({
        userId,
        pool: userId.startsWith("a") ? SessionPool.A : SessionPool.B,
      }));
    }
  );

  return {
    session: {
      findUnique: vi.fn().mockResolvedValue({ poolsEnabled: true }),
    },
    queuedMatch: {
      create: queuedMatchCreate,
      update: queuedMatchUpdate,
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    sessionPlayer: {
      findMany: sessionPlayerFindMany,
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const crossoverSelection = {
  partition: {
    team1: ["a3", "b3"] as [string, string],
    team2: ["a4", "b4"] as [string, string],
  },
  targetPool: null,
  courtGroupType: CourtGroupType.CROSSOVER,
  poolASeatCount: 2,
  poolBSeatCount: 2,
  team1ClubId: null,
  team2ClubId: null,
  matchmakingReasonJson: null,
};

describe("queued player-group lifecycle", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.courtFindMany.mockResolvedValue([
      { id: "court-1", currentMatchId: "live-match" },
    ]);
    mocks.courtCount.mockResolvedValue(1);
    mocks.buildMatchmakingState.mockResolvedValue({
      busyPlayerIds: new Set<string>(),
      playersById: new Map(),
      rotationHistory: {},
    });
    mocks.getRankedCandidates.mockReturnValue({
      availableCandidates: [1, 2, 3, 4],
      rankedCandidates: [1, 2, 3, 4],
    });
    mocks.selectSingleCourtMatchRespectingSkips.mockReturnValue({
      selection: crossoverSelection,
      consumedSkipUserIds: [],
    });
    mocks.consumeSkipNextMatches.mockResolvedValue(undefined);
  });

  it("classifies and snapshots a manual Crossover queue with an explicit manual source", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const session = sessionRecord();

    const result = await createManualQueuedMatchForSession(
      session,
      {
        team1: ["a1", "b1"],
        team2: ["a2", "b2"],
      },
      undefined
    );

    expect(tx.queuedMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        isAutomatic: false,
        matchmakingReasonJson: null,
      }),
    });
    expect(result).toMatchObject({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: false,
    });
  });

  it("stores planner metadata and an automatic source for automatic queues", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await createQueuedMatchForSession(sessionRecord());

    expect(tx.queuedMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        team1User1Id: "a3",
        team1User2Id: "b3",
        team2User1Id: "a4",
        team2User2Id: "b4",
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        isAutomatic: true,
      }),
    });
    expect(result.isAutomatic).toBe(true);
  });

  it("rejects an automatic queue when a selected player's group changes before persistence", async () => {
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { userId: "a3", pool: SessionPool.B },
      { userId: "b3", pool: SessionPool.B },
      { userId: "a4", pool: SessionPool.A },
      { userId: "b4", pool: SessionPool.B },
    ]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(createQueuedMatchForSession(sessionRecord())).rejects.toMatchObject({
      status: 409,
      message:
        "Player groups changed while the next match was being queued. Please retry.",
    });
    expect(tx.queuedMatch.create).not.toHaveBeenCalled();
  });

  it("reclassifies a manual queue from the current transactional player groups", async () => {
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { userId: "a1", pool: SessionPool.B },
      { userId: "b1", pool: SessionPool.B },
      { userId: "a2", pool: SessionPool.A },
      { userId: "b2", pool: SessionPool.B },
    ]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await createManualQueuedMatchForSession(sessionRecord(), {
      team1: ["a1", "b1"],
      team2: ["a2", "b2"],
    });

    expect(tx.queuedMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        courtGroupType: CourtGroupType.OPEN_OVERFLOW,
        poolASeatCount: 1,
        poolBSeatCount: 3,
      }),
    });
  });

  it("reselects and replaces a stale automatic queue with a fresh snapshot", async () => {
    const oldQueue = queueRecord({
      team1User1Id: "a1",
      team1User2Id: "b1",
      team2User1Id: "a2",
      team2User2Id: "b2",
      courtGroupType: CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: 3,
      poolBSeatCount: 1,
      isAutomatic: true,
    });
    const session = sessionRecord({ queuedMatch: oldQueue });
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.loadSessionRecordById.mockResolvedValue(session);

    const result = await tryRebuildAutomaticQueuedMatchForSessionId(
      "session-1"
    );

    expect(tx.queuedMatch.update).toHaveBeenCalledWith({
      where: { id: "queue-1" },
      data: expect.objectContaining({
        team1User1Id: "a3",
        team1User2Id: "b3",
        team2User1Id: "a4",
        team2User2Id: "b4",
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        isAutomatic: true,
      }),
    });
    expect(result).toMatchObject({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: true,
    });
  });

  it("applies a replaced manual-queue player's pending group", async () => {
    const oldQueue = queueRecord({
      team1User1Id: "a1",
      team1User2Id: "b1",
      team2User1Id: "a2",
      team2User2Id: "b2",
      isAutomatic: false,
      matchmakingReasonJson: null,
    });
    const session = sessionRecord({ queuedMatch: oldQueue });
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany
      .mockResolvedValueOnce([
        { userId: "a1", pool: SessionPool.A },
        { userId: "b1", pool: SessionPool.B },
        { userId: "a2", pool: SessionPool.A },
        { userId: "spare", pool: SessionPool.B },
      ])
      .mockResolvedValueOnce([{ userId: "b2", pendingPool: SessionPool.A }]);
    tx.queuedMatch.findUnique.mockResolvedValue(
      queueRecord({
        team1User1Id: "a1",
        team1User2Id: "b1",
        team2User1Id: "a2",
        team2User2Id: "spare",
        isAutomatic: false,
      })
    );
    tx.sessionPlayer.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.selectReplacementMatchRespectingSkips.mockReturnValue({
      selection: {
        partition: {
          team1: ["a1", "b1"],
          team2: ["a2", "spare"],
        },
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        matchmakingReasonJson: null,
      },
      consumedSkipUserIds: [],
    });

    await replaceQueuedMatchPlayerForSession(session, "b2");

    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: { in: ["b2"] },
      },
      data: { pool: SessionPool.A, pendingPool: null },
    });
  });

  it("applies pending groups for players removed by a manual queue reshuffle", async () => {
    const oldQueue = queueRecord({
      team1User1Id: "a1",
      team1User2Id: "b1",
      team2User1Id: "a2",
      team2User2Id: "b2",
      isAutomatic: false,
      matchmakingReasonJson: null,
    });
    const session = sessionRecord({ queuedMatch: oldQueue });
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany
      .mockResolvedValueOnce([
        { userId: "a1", pool: SessionPool.A },
        { userId: "b1", pool: SessionPool.B },
        { userId: "a2", pool: SessionPool.A },
        { userId: "spare", pool: SessionPool.B },
      ])
      .mockResolvedValueOnce([{ userId: "b2", pendingPool: SessionPool.A }]);
    tx.queuedMatch.findUnique.mockResolvedValue(
      queueRecord({
        team1User1Id: "a1",
        team1User2Id: "b1",
        team2User1Id: "a2",
        team2User2Id: "spare",
        isAutomatic: false,
      })
    );
    tx.sessionPlayer.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.selectSingleCourtMatchRespectingSkips.mockReturnValue({
      selection: {
        partition: {
          team1: ["a1", "b1"],
          team2: ["a2", "spare"],
        },
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        matchmakingReasonJson: null,
      },
      consumedSkipUserIds: [],
    });

    await reshuffleQueuedMatchForSession(session, { excludedUserId: "b2" });

    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: { in: ["b2"] },
      },
      data: { pool: SessionPool.A, pendingPool: null },
    });
  });
});
