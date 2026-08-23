import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionPlayerFindUnique: vi.fn(),
  matchFindFirst: vi.fn(),
  transaction: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
  tryRebuildQueuedMatchForSessionId: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: mocks.sessionFindUnique },
    sessionPlayer: { findUnique: mocks.sessionPlayerFindUnique },
    match: { findFirst: mocks.matchFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction:
    mocks.applyPendingPlayerGroupChangesInTransaction,
}));

vi.mock("../../queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId:
    mocks.tryRebuildQueuedMatchForSessionId,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

import { DELETE } from "./route";

function queuedMatch(isAutomatic: boolean) {
  return {
    id: "queue-1",
    sessionId: "session-1",
    isAutomatic,
    matchmakingReasonJson: isAutomatic ? null : JSON.stringify({ legacy: true }),
    team1User1Id: "p1",
    team1User2Id: "p2",
    team2User1Id: "p3",
    team2User2Id: "p4",
  };
}

function setupTransaction(queue: ReturnType<typeof queuedMatch>) {
  const tx = {
    queuedMatch: {
      findUnique: vi.fn().mockResolvedValue(queue),
      delete: vi.fn().mockResolvedValue({}),
    },
    sessionPlayer: { delete: vi.fn().mockResolvedValue({}) },
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return tx;
}

async function removePlayer() {
  return DELETE(
    new Request("http://localhost/api/sessions/ABC/players/p1", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ code: "ABC", userId: "p1" }) }
  );
}

describe("remove player queue cancellation", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", isAdmin: true } });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "club-1",
      status: "ACTIVE",
    });
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.sessionPlayerFindUnique.mockResolvedValue({
      userId: "p1",
      isGuest: false,
      user: { name: "Player One" },
    });
    mocks.matchFindFirst.mockResolvedValue(null);
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 3,
      appliedUserIds: ["p2", "p3", "p4"],
      automaticQueueInvalidated: false,
    });
    mocks.tryRebuildQueuedMatchForSessionId.mockResolvedValue({
      id: "rebuilt-queue",
    });
  });

  it("releases remaining pending players and rebuilds after cancelling a manual queue", async () => {
    const tx = setupTransaction(queuedMatch(false));

    const response = await removePlayer();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["p1", "p2", "p3", "p4"],
      }
    );
    expect(mocks.tryRebuildQueuedMatchForSessionId).toHaveBeenCalledWith(
      "session-1"
    );
    expect(body).toMatchObject({
      ok: true,
      queuedMatchAffected: true,
      queuedMatch: { id: "rebuilt-queue" },
    });
  });

  it("preserves automatic semantics while still rebuilding the cancelled queue", async () => {
    setupTransaction(queuedMatch(true));

    const response = await removePlayer();

    expect(response.status).toBe(200);
    expect(
      mocks.applyPendingPlayerGroupChangesInTransaction
    ).not.toHaveBeenCalled();
    expect(mocks.tryRebuildQueuedMatchForSessionId).toHaveBeenCalledWith(
      "session-1"
    );
  });
});
