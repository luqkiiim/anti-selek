import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
  reconcileSessionQueueAfterCourtChange: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction:
    mocks.applyPendingPlayerGroupChangesInTransaction,
}));

vi.mock("@/app/api/matches/_lib/reconcileSessionQueue", () => ({
  reconcileSessionQueueAfterCourtChange:
    mocks.reconcileSessionQueueAfterCourtChange,
}));

import { undoCurrentCourtMatch } from "./context";

describe("undo current court player-group lifecycle", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.reconcileSessionQueueAfterCourtChange.mockResolvedValue({
      autoAssignedMatch: null,
      queuedMatchCleared: false,
      queuedMatch: null,
    });
  });

  it("applies released players' pending groups and regenerates an invalidated auto queue", async () => {
    const tx = {
      match: { delete: vi.fn().mockResolvedValue({}) },
      court: { update: vi.fn().mockResolvedValue({}) },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 1,
      appliedUserIds: ["player-1"],
      automaticQueueInvalidated: true,
    });

    const result = await undoCurrentCourtMatch({
      id: "court-1",
      sessionId: "session-1",
      currentMatchId: "match-1",
      currentMatch: {
        id: "match-1",
        status: MatchStatus.IN_PROGRESS,
        team1User1Id: "player-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
      },
    } as never);

    expect(mocks.applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["player-1", "player-2", "player-3", "player-4"],
      }
    );
    expect(mocks.reconcileSessionQueueAfterCourtChange).toHaveBeenCalledWith(
      "session-1",
      { generateAutomaticIfMissing: true }
    );
    expect(result).toMatchObject({ ok: true, undoneMatchId: "match-1" });
  });

  it("keeps ordinary reconciliation when no automatic queue was invalidated", async () => {
    const tx = {
      match: { delete: vi.fn().mockResolvedValue({}) },
      court: { update: vi.fn().mockResolvedValue({}) },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    });

    await undoCurrentCourtMatch({
      id: "court-1",
      sessionId: "session-1",
      currentMatchId: "match-1",
      currentMatch: {
        id: "match-1",
        status: MatchStatus.PENDING,
        team1User1Id: "player-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
      },
    } as never);

    expect(mocks.reconcileSessionQueueAfterCourtChange).toHaveBeenCalledWith(
      "session-1"
    );
  });
});
