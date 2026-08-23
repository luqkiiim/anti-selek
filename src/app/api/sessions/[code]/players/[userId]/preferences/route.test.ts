import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionPlayerFindUnique: vi.fn(),
  sessionPlayerUpdate: vi.fn(),
  queuedMatchDeleteMany: vi.fn(),
  prismaTransaction: vi.fn(),
  tryRebuildAutomaticQueuedMatchForSessionId: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
    },
    sessionPlayer: {
      findUnique: mocks.sessionPlayerFindUnique,
      update: mocks.sessionPlayerUpdate,
    },
    queuedMatch: {
      deleteMany: mocks.queuedMatchDeleteMany,
    },
    $transaction: mocks.prismaTransaction,
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("../../../queue-match/shared", () => ({
  tryRebuildAutomaticQueuedMatchForSessionId:
    mocks.tryRebuildAutomaticQueuedMatchForSessionId,
}));

import { PATCH } from "./route";

function patchPreferences(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/sessions/ABC/players/player-1/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: "ABC", userId: "player-1" }) }
  );
}

describe("session player preference route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: false,
      queuedMatch: null,
      courts: [],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      pool: SessionPool.A,
      pendingPool: null,
      representingClubId: null,
      isGuest: false,
    });
    mocks.sessionPlayerUpdate.mockImplementation(async (args) => ({
      userId: "player-1",
      ...args.data,
      user: { id: "player-1", name: "Player One" },
    }));
    mocks.queuedMatchDeleteMany.mockResolvedValue({ count: 1 });
    mocks.prismaTransaction.mockImplementation(async (callback) =>
      callback({
        session: { findUnique: mocks.sessionFindUnique },
        sessionPlayer: {
          findUnique: mocks.sessionPlayerFindUnique,
          update: mocks.sessionPlayerUpdate,
        },
        queuedMatch: { deleteMany: mocks.queuedMatchDeleteMany },
      })
    );
    mocks.tryRebuildAutomaticQueuedMatchForSessionId.mockResolvedValue(null);
  });

  it("rejects a group change while the player is in a live match", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: true,
      queuedMatch: null,
      courts: [
        {
          currentMatch: {
            team1User1Id: "player-1",
            team1User2Id: "player-2",
            team2User1Id: "player-3",
            team2User2Id: "player-4",
          },
        },
      ],
    });

    const response = await patchPreferences({ pool: SessionPool.B });

    expect(response.status).toBe(409);
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
  });

  it("does not cancel a pending group switch during a live match", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: true,
      queuedMatch: null,
      courts: [
        {
          currentMatch: {
            team1User1Id: "player-1",
            team1User2Id: "player-2",
            team2User1Id: "player-3",
            team2User2Id: "player-4",
          },
        },
      ],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      pool: SessionPool.A,
      pendingPool: SessionPool.B,
      representingClubId: null,
      isGuest: false,
    });

    const response = await patchPreferences({ pool: SessionPool.A });

    expect(response.status).toBe(409);
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
  });

  it("rejects a group change while the player is manually queued", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: true,
      queuedMatch: {
        id: "queue-1",
        createdAt: new Date("2026-08-23T00:00:00.000Z"),
        isAutomatic: false,
        team1User1Id: "player-1",
        team1User2Id: "player-2",
        team2User1Id: "player-3",
        team2User2Id: "player-4",
      },
      courts: [],
    });

    const response = await patchPreferences({ pool: SessionPool.B });

    expect(response.status).toBe(409);
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
  });

  it("rechecks blockers inside the write transaction", async () => {
    const initialSession = {
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: true,
      queuedMatch: null,
      courts: [],
    };
    const concurrentManualQueue = {
      id: "queue-1",
      isAutomatic: false,
      team1User1Id: "player-1",
      team1User2Id: "player-2",
      team2User1Id: "player-3",
      team2User2Id: "player-4",
    };
    mocks.sessionFindUnique
      .mockResolvedValueOnce(initialSession)
      .mockResolvedValueOnce({
        status: SessionStatus.ACTIVE,
        poolsEnabled: true,
        queuedMatch: concurrentManualQueue,
        courts: [],
      });

    const response = await patchPreferences({ pool: SessionPool.B });

    expect(response.status).toBe(409);
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
    expect(mocks.queuedMatchDeleteMany).not.toHaveBeenCalled();
  });

  it("replans an automatic queue after an idle group change", async () => {
    const queuedMatch = {
      id: "queue-1",
      createdAt: new Date("2026-08-23T00:00:00.000Z"),
      isAutomatic: true,
      team1User1Id: "player-2",
      team1User2Id: "player-3",
      team2User1Id: "player-4",
      team2User2Id: "player-5",
    };
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.ACTIVE,
      poolsEnabled: true,
      queuedMatch,
      courts: [],
    });
    mocks.tryRebuildAutomaticQueuedMatchForSessionId.mockResolvedValue({
      id: "queue-2",
    });

    const response = await patchPreferences({ pool: SessionPool.B });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.sessionPlayerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pool: SessionPool.B,
          pendingPool: null,
        }),
      })
    );
    expect(mocks.queuedMatchDeleteMany).toHaveBeenCalledWith({
      where: {
        id: "queue-1",
        sessionId: "session-1",
        isAutomatic: true,
      },
    });
    expect(mocks.prismaTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queuedMatchDeleteMany.mock.invocationCallOrder[0]
    );
    expect(mocks.queuedMatchDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tryRebuildAutomaticQueuedMatchForSessionId.mock
        .invocationCallOrder[0]
    );
    expect(body.queuedMatch).toEqual({ id: "queue-2" });
  });

  it("overrides more rest for the current session only", async () => {
    const response = await patchPreferences({ needsMoreRest: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.sessionPlayerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          needsMoreRest: true,
        }),
      })
    );
    expect(body.needsMoreRest).toBe(true);
  });

  it("rejects more-rest changes after the session is completed", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      mode: SessionMode.MEXICANO,
      status: SessionStatus.COMPLETED,
      poolsEnabled: false,
    });

    const response = await patchPreferences({ needsMoreRest: true });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Tournament already completed");
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
  });
});
