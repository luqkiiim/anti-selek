import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtGroupType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  queuedMatchDeleteMany: vi.fn(),
  transaction: vi.fn(),
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
  createMatchesForAssignments: vi.fn(),
  createQueuedMatchAssignment: vi.fn(),
  selectAutomaticMatchForSession: vi.fn(),
  buildMatchmakingState: vi.fn(),
  validateManualMatchRequest: vi.fn(),
  getInterclubTeamClubIdsForPartition: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: mocks.sessionFindUnique },
    queuedMatch: { deleteMany: mocks.queuedMatchDeleteMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction:
    mocks.applyPendingPlayerGroupChangesInTransaction,
}));

vi.mock("@/app/api/sessions/[code]/generate-match/assignments", () => ({
  createMatchesForAssignments: mocks.createMatchesForAssignments,
  createQueuedMatchAssignment: mocks.createQueuedMatchAssignment,
}));

vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({
  selectAutomaticMatchForSession: mocks.selectAutomaticMatchForSession,
}));

vi.mock("@/app/api/sessions/[code]/generate-match/selection", () => ({
  buildMatchmakingState: mocks.buildMatchmakingState,
}));

vi.mock("@/app/api/sessions/[code]/generate-match/manual", () => ({
  validateManualMatchRequest: mocks.validateManualMatchRequest,
}));

vi.mock("@/app/api/sessions/[code]/generate-match/interclub", () => ({
  getInterclubTeamClubIdsForPartition:
    mocks.getInterclubTeamClubIdsForPartition,
}));

import { autoAssignQueuedMatch } from "./autoAssignQueuedMatch";
import { GenerateMatchError } from "@/app/api/sessions/[code]/generate-match/shared";

function sessionRecord(queuedMatch: Record<string, unknown> | null) {
  return {
    id: "session-1",
    autoQueueEnabled: true,
    queuedMatch,
    players: [],
    matches: [],
    sessionClubs: [],
    courts: [
      {
        id: "court-1",
        courtNumber: 1,
        currentMatchId: null,
        currentMatch: null,
      },
    ],
  };
}

const partition = {
  team1: ["a1", "b1"] as [string, string],
  team2: ["a2", "b2"] as [string, string],
};

describe("automatic assignment after player-group queue changes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.buildMatchmakingState.mockResolvedValue({
      busyPlayerIds: new Set<string>(),
    });
    mocks.getInterclubTeamClubIdsForPartition.mockReturnValue({});
    mocks.applyPendingPlayerGroupChangesInTransaction.mockResolvedValue({
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    });
  });

  it("reselects and assigns immediately when an invalidated queue is missing", async () => {
    mocks.sessionFindUnique.mockResolvedValue(sessionRecord(null));
    mocks.selectAutomaticMatchForSession.mockResolvedValue({
      selectedIds: ["a1", "b1", "a2", "b2"],
      partition,
      team1ClubId: null,
      team2ClubId: null,
      matchmakingReasonJson: "fresh-reason",
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      consumedSkipUserIds: [],
    });
    mocks.createMatchesForAssignments.mockResolvedValue([
      { id: "fresh-match" },
    ]);

    const result = await autoAssignQueuedMatch("session-1", {
      generateIfMissing: true,
    });

    expect(mocks.createMatchesForAssignments).toHaveBeenCalledWith(
      "session-1",
      [
        expect.objectContaining({
          courtId: "court-1",
          courtGroupType: CourtGroupType.CROSSOVER,
          poolASeatCount: 2,
          poolBSeatCount: 2,
          clearArrivalPriority: true,
        }),
      ]
    );
    expect(result).toEqual({
      autoAssignedMatch: { id: "fresh-match" },
      queuedMatchCleared: true,
    });
  });

  it("assigns the queued immutable snapshot and explicit manual source", async () => {
    const queuedMatch = {
      id: "queue-1",
      team1User1Id: "a1",
      team1User2Id: "b1",
      team2User1Id: "a2",
      team2User2Id: "b2",
      team1ClubId: null,
      team2ClubId: null,
      matchmakingReasonJson: "legacy-reason-present",
      courtGroupType: CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: 3,
      poolBSeatCount: 1,
      isAutomatic: false,
    };
    mocks.sessionFindUnique.mockResolvedValue(sessionRecord(queuedMatch));
    mocks.createQueuedMatchAssignment.mockResolvedValue({ id: "assigned" });

    const result = await autoAssignQueuedMatch("session-1");

    expect(mocks.createQueuedMatchAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedMatchId: "queue-1",
        courtId: "court-1",
        courtGroupType: CourtGroupType.OPEN_OVERFLOW,
        poolASeatCount: 3,
        poolBSeatCount: 1,
        isAutomatic: false,
      })
    );
    expect(result.autoAssignedMatch).toEqual({ id: "assigned" });
  });

  it("releases pending players when an invalid manual queue is discarded", async () => {
    const manualQueue = {
      id: "queue-1",
      team1User1Id: "a1",
      team1User2Id: "b1",
      team2User1Id: "a2",
      team2User2Id: "b2",
      team1ClubId: null,
      team2ClubId: null,
      matchmakingReasonJson: "legacy-reason-present",
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
      isAutomatic: false,
    };
    const tx = {
      queuedMatch: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.sessionFindUnique.mockResolvedValue(sessionRecord(manualQueue));
    mocks.validateManualMatchRequest.mockImplementation(() => {
      throw new GenerateMatchError(409, "Queued lineup is stale");
    });

    const result = await autoAssignQueuedMatch("session-1");

    expect(mocks.applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["a1", "b1", "a2", "b2"],
      }
    );
    expect(result).toEqual({
      autoAssignedMatch: null,
      queuedMatchCleared: true,
    });
  });
});
