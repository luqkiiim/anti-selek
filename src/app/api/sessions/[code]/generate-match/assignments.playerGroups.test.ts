import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtGroupType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  consumeSkipNextMatches: vi.fn(),
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/sessionSkipNext", () => ({
  consumeSkipNextMatches: mocks.consumeSkipNextMatches,
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction:
    mocks.applyPendingPlayerGroupChangesInTransaction,
}));

import {
  createMatchesForAssignments,
  createQueuedMatchAssignment,
  replaceCurrentCourtMatchAssignment,
} from "./assignments";

function createTransactionMock() {
  const matchCreate = vi.fn(async ({ data }) => ({
    id: "created-match",
    ...data,
    matchmakingReasonJson: data.matchmakingReasonJson ?? null,
  }));

  return {
    match: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: matchCreate,
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    court: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    session: {
      findUnique: vi.fn().mockResolvedValue({ poolsEnabled: true }),
    },
    sessionPlayer: {
      findMany: vi.fn(async ({ where }) =>
        where.userId.in.map((userId: string) => ({
          userId,
          pool:
            userId.startsWith("a") || userId.startsWith("competitive")
              ? "A"
              : "B",
        }))
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    queuedMatch: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const partition = {
  team1: ["competitive-1", "social-1"] as [string, string],
  team2: ["competitive-2", "social-2"] as [string, string],
};

describe("player-group assignment lifecycle", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.consumeSkipNextMatches.mockResolvedValue(undefined);
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    });
  });

  it("revalidates and persists the planner snapshot inside the transaction", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await createMatchesForAssignments("session-1", [
      {
        courtId: "court-1",
        selectedIds: [
          "competitive-1",
          "social-1",
          "competitive-2",
          "social-2",
        ],
        partition,
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
      },
    ]);

    expect(tx.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courtGroupType: CourtGroupType.CROSSOVER,
          poolASeatCount: 2,
          poolBSeatCount: 2,
        }),
      })
    );
    expect(tx.session.findUnique).toHaveBeenCalled();
    expect(tx.sessionPlayer.findMany).toHaveBeenCalled();
  });

  it("carries a queued snapshot into Match and uses isAutomatic as the source", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await createQueuedMatchAssignment({
      sessionId: "session-1",
      queuedMatchId: "queue-1",
      courtId: "court-1",
      partition,
      matchmakingReasonJson: JSON.stringify({ legacy: "reason-present" }),
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: false,
    });

    expect(tx.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courtGroupType: CourtGroupType.CROSSOVER,
          poolASeatCount: 2,
          poolBSeatCount: 2,
        }),
      })
    );
    expect(tx.sessionPlayer.updateMany).not.toHaveBeenCalled();
    expect(tx.queuedMatch.deleteMany).toHaveBeenCalledWith({
      where: { id: "queue-1", sessionId: "session-1" },
    });
  });

  it("clears arrival priority for an automatic queue even without a reason", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await createQueuedMatchAssignment({
      sessionId: "session-1",
      queuedMatchId: "queue-1",
      courtId: "court-1",
      partition,
      matchmakingReasonJson: null,
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: true,
    });

    expect(tx.sessionPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: {
          in: [
            "competitive-1",
            "social-1",
            "competitive-2",
            "social-2",
          ],
        },
      },
      data: { arrivalPriorityAt: null },
    });
  });

  it("aborts when player groups changed after automatic selection", async () => {
    const tx = createTransactionMock();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { userId: "competitive-1", pool: "A" },
      { userId: "social-1", pool: "A" },
      { userId: "competitive-2", pool: "A" },
      { userId: "social-2", pool: "B" },
    ]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      createMatchesForAssignments("session-1", [
        {
          courtId: "court-1",
          selectedIds: [
            "competitive-1",
            "social-1",
            "competitive-2",
            "social-2",
          ],
          partition,
          courtGroupType: CourtGroupType.CROSSOVER,
          poolASeatCount: 2,
          poolBSeatCount: 2,
        },
      ])
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.match.create).not.toHaveBeenCalled();
  });

  it("releases a replaced live player so their pending group can apply", async () => {
    const tx = createTransactionMock();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await replaceCurrentCourtMatchAssignment({
      sessionId: "session-1",
      courtId: "court-1",
      currentMatchId: "old-match",
      selectedIds: [
        "competitive-1",
        "social-1",
        "competitive-2",
        "social-2",
      ],
      partition,
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      releasePendingUserIds: ["replaced-player"],
    });

    expect(mocks.applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["replaced-player"],
      }
    );
  });

  it("persists a stable assignment order for matches created in one batch", async () => {
    const now = new Date("2026-08-23T00:00:00.500Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const tx = createTransactionMock();
    tx.match.findFirst.mockImplementation(async () => {
      const lastCreateCall = tx.match.create.mock.calls.at(-1);
      return lastCreateCall
        ? { createdAt: lastCreateCall[0].data.createdAt }
        : { createdAt: new Date("2026-08-23T00:00:00.000Z") };
    });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await createMatchesForAssignments("session-1", [
      {
        courtId: "court-1",
        selectedIds: ["a1", "a2", "a3", "a4"],
        partition: { team1: ["a1", "a2"], team2: ["a3", "a4"] },
        courtGroupType: CourtGroupType.COMPETITIVE,
        poolASeatCount: 4,
        poolBSeatCount: 0,
      },
      {
        courtId: "court-2",
        selectedIds: ["b1", "b2", "b3", "b4"],
        partition: { team1: ["b1", "b2"], team2: ["b3", "b4"] },
        courtGroupType: CourtGroupType.SOCIAL,
        poolASeatCount: 0,
        poolBSeatCount: 4,
      },
    ]);

    const createdAtValues = tx.match.create.mock.calls.map(
      ([call]) => call.data.createdAt as Date
    );
    expect(createdAtValues).toEqual([
      now,
      new Date(now.getTime() + 1),
    ]);
    vi.useRealTimers();
  });

  it("preserves assignment order when a live match is replaced", async () => {
    const createdAt = new Date("2026-08-23T00:00:00.123Z");
    const tx = createTransactionMock();
    tx.match.findUnique.mockResolvedValue({ createdAt });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await replaceCurrentCourtMatchAssignment({
      sessionId: "session-1",
      courtId: "court-1",
      currentMatchId: "old-match",
      selectedIds: [
        "competitive-1",
        "social-1",
        "competitive-2",
        "social-2",
      ],
      partition,
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });

    expect(tx.match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdAt }),
      })
    );
  });
});
