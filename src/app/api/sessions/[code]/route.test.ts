import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    clubMember: {
      findUnique: vi.fn(),
    },
    queuedMatch: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
}));

vi.mock("./queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { tryRebuildQueuedMatchForSessionId } from "./queue-match/shared";
import { PATCH } from "./route";

describe("session settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyPendingPlayerGroupChangesInTransaction).mockResolvedValue({
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    });
  });

  it("disables auto queue and clears any queued match", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
    } as never);
    const tx = {
      session: { update: vi.fn().mockResolvedValue({}) },
      queuedMatch: {
        findUnique: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      new Request("http://localhost/api/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          autoQueueEnabled: false,
          respectPlayerRest: false,
        }),
      }),
      {
        params: Promise.resolve({ code: "session-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      autoQueueEnabled: false,
      respectPlayerRest: false,
      queuedMatch: null,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("releases pending players when disabling auto queue cancels a manual queue", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
    } as never);
    const manualQueue = {
      id: "queue-1",
      sessionId: "session-1",
      isAutomatic: false,
      matchmakingReasonJson: JSON.stringify({ legacy: "present" }),
      team1User1Id: "p1",
      team1User2Id: "p2",
      team2User1Id: "p3",
      team2User2Id: "p4",
    };
    const tx = {
      session: { update: vi.fn().mockResolvedValue({}) },
      queuedMatch: {
        findUnique: vi.fn().mockResolvedValue(manualQueue),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      new Request("http://localhost/api/sessions/session-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          autoQueueEnabled: false,
          respectPlayerRest: true,
        }),
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(200);
    expect(applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      {
        sessionId: "session-1",
        userIds: ["p1", "p2", "p3", "p4"],
      }
    );
  });

  it("enables auto queue and returns a rebuilt queued match", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
    } as never);
    vi.mocked(prisma.session.update).mockResolvedValue({} as never);
    vi.mocked(tryRebuildQueuedMatchForSessionId).mockResolvedValue({
      id: "queue-1",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
      targetPool: null,
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          autoQueueEnabled: true,
          respectPlayerRest: true,
        }),
      }),
      {
        params: Promise.resolve({ code: "session-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoQueueEnabled: true,
      respectPlayerRest: true,
      queuedMatch: {
        id: "queue-1",
      },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { autoQueueEnabled: true, respectPlayerRest: true },
    });
    expect(tryRebuildQueuedMatchForSessionId).toHaveBeenCalledWith("session-1");
  });
});
