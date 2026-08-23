import { describe, expect, it, vi } from "vitest";
import { SessionPool } from "@/types/enums";
import {
  applyPendingPlayerGroupChangesInTransaction,
  propagatePreferredPoolToClubSessions,
} from "./playerGroupPreferences";

function queuedMatch({
  id,
  isAutomatic,
  includesUser = true,
}: {
  id: string;
  isAutomatic: boolean;
  includesUser?: boolean;
}) {
  return {
    id,
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
    isAutomatic,
    team1User1Id: includesUser ? "player-1" : "other-1",
    team1User2Id: "other-2",
    team2User1Id: "other-3",
    team2User2Id: "other-4",
  };
}

describe("player group preference propagation", () => {
  it("updates idle sessions, defers busy sessions, and invalidates automatic queues", async () => {
    const sessionPlayerUpdate = vi.fn().mockResolvedValue({});
    const queuedMatchDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([
          {
            sessionId: "idle-auto",
            pool: SessionPool.B,
            pendingPool: null,
            session: {
              queuedMatch: queuedMatch({ id: "queue-auto", isAutomatic: true }),
              courts: [],
            },
          },
          {
            sessionId: "live",
            pool: SessionPool.B,
            pendingPool: null,
            session: {
              queuedMatch: null,
              courts: [
                {
                  currentMatch: {
                    team1User1Id: "player-1",
                    team1User2Id: "live-2",
                    team2User1Id: "live-3",
                    team2User2Id: "live-4",
                  },
                },
              ],
            },
          },
          {
            sessionId: "manual-queue",
            pool: SessionPool.B,
            pendingPool: null,
            session: {
              queuedMatch: queuedMatch({
                id: "queue-manual",
                isAutomatic: false,
              }),
              courts: [],
            },
          },
          {
            sessionId: "cancel-old-pending",
            pool: SessionPool.A,
            pendingPool: SessionPool.B,
            session: { queuedMatch: null, courts: [] },
          },
        ]),
        update: sessionPlayerUpdate,
      },
      queuedMatch: { deleteMany: queuedMatchDeleteMany },
    };
    const db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await propagatePreferredPoolToClubSessions(db as never, {
      clubId: "club-1",
      userId: "player-1",
      preferredPool: SessionPool.A,
    });

    expect(result).toEqual({
      immediateSessionCount: 2,
      deferredSessionCount: 2,
      automaticQueueSessionIds: ["idle-auto"],
    });
    expect(tx.sessionPlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          session: expect.objectContaining({
            OR: [
              { clubId: "club-1" },
              {
                sessionClubs: { some: { clubId: "club-1" } },
                club: { members: { none: { userId: "player-1" } } },
              },
            ],
          }),
        }),
      })
    );
    expect(sessionPlayerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_userId: {
            sessionId: "idle-auto",
            userId: "player-1",
          },
        },
        data: { pool: SessionPool.A, pendingPool: null },
      })
    );
    expect(sessionPlayerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_userId: {
            sessionId: "live",
            userId: "player-1",
          },
        },
        data: { pendingPool: SessionPool.A },
      })
    );
    expect(queuedMatchDeleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: { in: ["idle-auto"] },
        isAutomatic: true,
      },
    });
  });

  it("retries a missing automatic queue after an earlier rebuild failure", async () => {
    const queuedMatchDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([
          {
            sessionId: "auto-with-missing-queue",
            pool: SessionPool.A,
            pendingPool: null,
            session: {
              autoQueueEnabled: true,
              queuedMatch: null,
              courts: [],
            },
          },
        ]),
        update: vi.fn(),
      },
      queuedMatch: { deleteMany: queuedMatchDeleteMany },
    };
    const db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await propagatePreferredPoolToClubSessions(db as never, {
      clubId: "club-1",
      userId: "player-1",
      preferredPool: SessionPool.A,
    });

    expect(result).toEqual({
      immediateSessionCount: 0,
      deferredSessionCount: 0,
      automaticQueueSessionIds: ["auto-with-missing-queue"],
    });
    expect(queuedMatchDeleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: { in: ["auto-with-missing-queue"] },
        isAutomatic: true,
      },
    });
  });

  it("applies pending values after a match but keeps manually queued players deferred", async () => {
    const sessionPlayerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "player-1", pendingPool: SessionPool.A },
          { userId: "player-2", pendingPool: SessionPool.B },
        ]),
        updateMany: sessionPlayerUpdateMany,
      },
      queuedMatch: {
        findUnique: vi.fn().mockResolvedValue({
          isAutomatic: false,
          team1User1Id: "player-2",
          team1User2Id: "other-2",
          team2User1Id: "other-3",
          team2User2Id: "other-4",
        }),
      },
    };

    const result = await applyPendingPlayerGroupChangesInTransaction(
      tx as never,
      { sessionId: "session-1", userIds: ["player-1", "player-2"] }
    );

    expect(result).toEqual({
      appliedCount: 1,
      appliedUserIds: ["player-1"],
      automaticQueueInvalidated: false,
    });
    expect(sessionPlayerUpdateMany).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: { in: ["player-1"] },
      },
      data: { pool: SessionPool.A, pendingPool: null },
    });
  });

  it("invalidates an automatic queue when a deferred group becomes current", async () => {
    const queuedMatchDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "player-1", pendingPool: SessionPool.A },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      queuedMatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: "queue-1",
          isAutomatic: true,
          team1User1Id: "other-1",
          team1User2Id: "other-2",
          team2User1Id: "other-3",
          team2User2Id: "other-4",
        }),
        deleteMany: queuedMatchDeleteMany,
      },
    };

    const result = await applyPendingPlayerGroupChangesInTransaction(
      tx as never,
      { sessionId: "session-1", userIds: ["player-1"] }
    );

    expect(result.automaticQueueInvalidated).toBe(true);
    expect(queuedMatchDeleteMany).toHaveBeenCalledWith({
      where: {
        id: "queue-1",
        sessionId: "session-1",
        isAutomatic: true,
      },
    });
  });
});
