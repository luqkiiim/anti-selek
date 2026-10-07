import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtGroupType, PlayerGender, SessionMode, SessionPool, SessionStatus, SessionType } from "@/types/enums";

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

function player(playerId: string, pool: SessionPool = SessionPool.B) {
  return {
    playerId,
    pool,
    isPaused: false,
    player: { id: playerId, name: playerId, elo: 1000 },
  };
}

function queueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "queue-1",
    sessionId: "session-1",
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    team1Player1Id: "a1",
    team1Player2Id: "b1",
    team2Player1Id: "a2",
    team2Player2Id: "b2",
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
    type: SessionType.POINTS,
    mode: SessionMode.MEXICANO,
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
        playerId: string;
        pool?: SessionPool;
        pendingPool?: SessionPool | null;
      }>
    > => {
      if (select?.gender) return (where.playerId.in as string[]).map((playerId) => ({ playerId }));
      if (!select?.pool) return [];
      return (where.playerId.in as string[]).map((playerId) => ({
        playerId,
        pool: playerId.startsWith("a") ? SessionPool.A : SessionPool.B,
      }));
    }
  );

  return {
    session: {
      findUnique: vi.fn().mockResolvedValue({ poolsEnabled: true, type: SessionType.POINTS, mode: SessionMode.MEXICANO }),
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

const socialCandidateDecision = {
  version: 1,
  requestedPolicy: "courtmate-beneficial-rescue",
  appliedPolicy: "courtmate-beneficial-rescue",
  outcome: "candidate-exact",
  reasonCodes: [],
};

function socialQueueSelection() {
  return {
    ...crossoverSelection,
    matchmakingReasonJson: JSON.stringify({ socialPolicyDecision: socialCandidateDecision }),
  };
}

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
        matchmakingReasonJson: expect.any(String),
      }),
    });
    expect(result).toMatchObject({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: false,
    });
    const metadata = JSON.parse(tx.queuedMatch.create.mock.calls[0][0].data.matchmakingReasonJson);
    expect(metadata.socialVariety).toMatchObject({ version: 1, basis: "EFFECTIVE_MIXED_SIDE", courtType: null });
    expect(Object.keys(metadata.socialVariety.effectiveSideByUserId).sort()).toEqual(["a1", "a2", "b1", "b2"]);
    expect(metadata.source).toBeUndefined();
    expect(metadata.summary).toBeUndefined();
    expect(result.matchmakingReason).toBeNull();
  });

  it("persists unknown Social manual type history without changing the manual source", async () => {
    const tx = createTransactionMock();
    tx.session.findUnique.mockResolvedValue({
      poolsEnabled: false,
      type: SessionType.SOCIAL_MIX,
      mode: SessionMode.MIXICANO,
    });
    tx.sessionPlayer.findMany.mockImplementation(async ({ where }) =>
      where.playerId.in.map((playerId: string) => ({ playerId, gender: PlayerGender.UNSPECIFIED }))
    );
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const result = await createManualQueuedMatchForSession(
      sessionRecord({ poolsEnabled: false, type: SessionType.SOCIAL_MIX, mode: SessionMode.MIXICANO }),
      { team1: ["a1", "b1"], team2: ["a2", "b2"] }
    );
    const data = tx.queuedMatch.create.mock.calls[0][0].data;
    expect(JSON.parse(data.matchmakingReasonJson).socialVariety.courtType).toBeNull();
    expect(data.isAutomatic).toBe(false);
    expect(result.isAutomatic).toBe(false);
    expect(result.matchmakingReason).toBeNull();
  });

  it("stores planner metadata and an automatic source for automatic queues", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const result = await createQueuedMatchForSession(sessionRecord());

    expect(tx.queuedMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        team1Player1Id: "a3",
        team1Player2Id: "b3",
        team2Player1Id: "a4",
        team2Player2Id: "b4",
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
        isAutomatic: true,
      }),
    });
    expect(result.isAutomatic).toBe(true);
  });

  it("routes automatic Social queue creation through the beneficial-rescue gate and persists its outcome", async () => {
    const tx = createTransactionMock();
    tx.session.findUnique.mockResolvedValue({
      poolsEnabled: false,
      type: SessionType.SOCIAL_MIX,
      mode: SessionMode.MIXICANO,
    });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.selectSingleCourtMatchRespectingSkips.mockReturnValue({
      selection: socialQueueSelection(),
      consumedSkipUserIds: [],
    });
    const socialSession = sessionRecord({
      type: SessionType.SOCIAL_MIX,
      mode: SessionMode.MIXICANO,
      poolsEnabled: false,
    });

    const result = await createQueuedMatchForSession(socialSession);

    const selectorOptions = mocks.selectSingleCourtMatchRespectingSkips.mock.calls[0]?.[0] as {
      sessionData: { type: SessionType };
      socialPriorityPolicy?: string;
    };
    expect(selectorOptions.sessionData.type).toBe(SessionType.SOCIAL_MIX);
    expect(selectorOptions.socialPriorityPolicy).toBe("courtmate-beneficial-rescue");
    const metadata = JSON.parse(tx.queuedMatch.create.mock.calls[0][0].data.matchmakingReasonJson);
    expect(metadata.socialPolicyDecision).toEqual(socialCandidateDecision);
    expect(result.isAutomatic).toBe(true);
  });

  it("uses the same Social acceptance gate when rebuilding an automatic queue", async () => {
    const oldQueue = queueRecord({ isAutomatic: true });
    const socialSession = sessionRecord({
      type: SessionType.SOCIAL_MIX,
      mode: SessionMode.MIXICANO,
      poolsEnabled: false,
      queuedMatch: oldQueue,
    });
    const tx = createTransactionMock();
    tx.session.findUnique.mockResolvedValue({
      poolsEnabled: false,
      type: SessionType.SOCIAL_MIX,
      mode: SessionMode.MIXICANO,
    });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.loadSessionRecordById.mockResolvedValue(socialSession);
    mocks.selectSingleCourtMatchRespectingSkips.mockReturnValue({
      selection: socialQueueSelection(),
      consumedSkipUserIds: [],
    });

    const result = await tryRebuildAutomaticQueuedMatchForSessionId("session-1");

    const selectorOptions = mocks.selectSingleCourtMatchRespectingSkips.mock.calls[0]?.[0] as {
      sessionData: { type: SessionType };
      socialPriorityPolicy?: string;
    };
    expect(selectorOptions.sessionData.type).toBe(SessionType.SOCIAL_MIX);
    expect(selectorOptions.socialPriorityPolicy).toBe("courtmate-beneficial-rescue");
    const metadata = JSON.parse(tx.queuedMatch.update.mock.calls[0][0].data.matchmakingReasonJson);
    expect(metadata.socialPolicyDecision).toEqual(socialCandidateDecision);
    expect(result?.isAutomatic).toBe(true);
  });

  it("rejects an automatic queue when a selected player's group changes before persistence", async () => {
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { playerId: "a3", pool: SessionPool.B },
      { playerId: "b3", pool: SessionPool.B },
      { playerId: "a4", pool: SessionPool.A },
      { playerId: "b4", pool: SessionPool.B },
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
      { playerId: "a1", pool: SessionPool.B },
      { playerId: "b1", pool: SessionPool.B },
      { playerId: "a2", pool: SessionPool.A },
      { playerId: "b2", pool: SessionPool.B },
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
      team1Player1Id: "a1",
      team1Player2Id: "b1",
      team2Player1Id: "a2",
      team2Player2Id: "b2",
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
        team1Player1Id: "a3",
        team1Player2Id: "b3",
        team2Player1Id: "a4",
        team2Player2Id: "b4",
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
      team1Player1Id: "a1",
      team1Player2Id: "b1",
      team2Player1Id: "a2",
      team2Player2Id: "b2",
      isAutomatic: false,
      matchmakingReasonJson: null,
    });
    const session = sessionRecord({ queuedMatch: oldQueue });
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockImplementation(async ({ where, select }) => {
      // Assignment history and pending-group state are separate reads. Answer
      // the requested projection so another snapshot query cannot consume a
      // pending-group result by changing the call order.
      if (select?.pendingPool) return [{ playerId: "b2", pendingPool: SessionPool.A }];
      if (select?.gender) return where.playerId.in.map((playerId: string) => ({ playerId }));
      return where.playerId.in.map((playerId: string) => ({
        playerId, pool: playerId.startsWith("a") ? SessionPool.A : SessionPool.B,
      }));
    });
    tx.queuedMatch.findUnique.mockResolvedValue(
      queueRecord({
        team1Player1Id: "a1",
        team1Player2Id: "b1",
        team2Player1Id: "a2",
        team2Player2Id: "spare",
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
        playerId: { in: ["b2"] },
      },
      data: { pool: SessionPool.A, pendingPool: null },
    });
    expect(tx.sessionPlayer.findMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1", playerId: { in: ["b2"] }, pendingPool: { not: null } },
      select: { playerId: true, pendingPool: true },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(tx.queuedMatch.update.mock.calls[0][0].data.matchmakingReasonJson);
    expect(Object.keys(metadata.socialVariety.effectiveSideByUserId).sort()).toEqual(["a1", "a2", "b1", "spare"]);
    expect(metadata.source).toBeUndefined();
  });

  it("applies pending groups for players removed by a manual queue reshuffle", async () => {
    const oldQueue = queueRecord({
      team1Player1Id: "a1",
      team1Player2Id: "b1",
      team2Player1Id: "a2",
      team2Player2Id: "b2",
      isAutomatic: false,
      matchmakingReasonJson: null,
    });
    const session = sessionRecord({ queuedMatch: oldQueue });
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockImplementation(async ({ where, select }) => {
      // Assignment history and pending-group state are separate reads. Answer
      // the requested projection so another snapshot query cannot consume a
      // pending-group result by changing the call order.
      if (select?.pendingPool) return [{ playerId: "b2", pendingPool: SessionPool.A }];
      if (select?.gender) return where.playerId.in.map((playerId: string) => ({ playerId }));
      return where.playerId.in.map((playerId: string) => ({
        playerId, pool: playerId.startsWith("a") ? SessionPool.A : SessionPool.B,
      }));
    });
    tx.queuedMatch.findUnique.mockResolvedValue(
      queueRecord({
        team1Player1Id: "a1",
        team1Player2Id: "b1",
        team2Player1Id: "a2",
        team2Player2Id: "spare",
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
        playerId: { in: ["b2"] },
      },
      data: { pool: SessionPool.A, pendingPool: null },
    });
    expect(tx.sessionPlayer.findMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1", playerId: { in: ["b2"] }, pendingPool: { not: null } },
      select: { playerId: true, pendingPool: true },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(tx.queuedMatch.update.mock.calls[0][0].data.matchmakingReasonJson);
    expect(Object.keys(metadata.socialVariety.effectiveSideByUserId).sort()).toEqual(["a1", "a2", "b1", "spare"]);
    expect(metadata.source).toBeUndefined();
  });
});
