import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  loadSessionRecord: vi.fn(),
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction:
    mocks.applyPendingPlayerGroupChangesInTransaction,
}));

vi.mock("../generate-match/shared", async () => {
  const actual = await vi.importActual<
    typeof import("../generate-match/shared")
  >("../generate-match/shared");
  return { ...actual, loadSessionRecord: mocks.loadSessionRecord };
});

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

import { DELETE } from "./route";

describe("manual queue cancellation", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 1,
      appliedUserIds: ["player-1"],
      automaticQueueInvalidated: false,
    });
  });

  it("releases pending players based on isAutomatic, not reason presence", async () => {
    const queuedMatchDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { queuedMatch: { deleteMany: queuedMatchDeleteMany } };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.loadSessionRecord.mockResolvedValue({
      id: "session-1",
      clubId: "club-1",
      queuedMatch: {
        id: "queue-1",
        isAutomatic: false,
        matchmakingReasonJson: JSON.stringify({ legacy: "present" }),
        team1User1Id: "player-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
      },
    });

    const response = await DELETE(
      new Request("http://localhost/api/sessions/ABC/queue-match", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ code: "ABC" }) }
    );

    expect(response.status).toBe(200);
    expect(queuedMatchDeleteMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
    });
    expect(mocks.applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["player-1", "player-2", "player-3", "player-4"],
      }
    );
  });

  it("does not treat an automatic queue as a manual blocker when reason is absent", async () => {
    const tx = {
      queuedMatch: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.loadSessionRecord.mockResolvedValue({
      id: "session-1",
      clubId: "club-1",
      queuedMatch: {
        id: "queue-1",
        isAutomatic: true,
        matchmakingReasonJson: null,
        team1User1Id: "player-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
      },
    });

    const response = await DELETE(
      new Request("http://localhost/api/sessions/ABC/queue-match", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ code: "ABC" }) }
    );

    expect(response.status).toBe(200);
    expect(
      mocks.applyPendingPlayerGroupChangesInTransaction
    ).not.toHaveBeenCalled();
  });
});
