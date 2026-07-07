import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    sessionPlayer: { findUnique: vi.fn() },
    queuedMatch: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getSessionOperatorMembership: vi.fn(),
}));

vi.mock("../../../queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { tryRebuildQueuedMatchForSessionId } from "../../../queue-match/shared";
import { PATCH } from "./route";

function createRequest(skipNextMatch: boolean) {
  return new Request("http://localhost/api/sessions/ABC/players/p1/skip-next", {
    method: "PATCH",
    body: JSON.stringify({ skipNextMatch }),
  });
}

function mockTransactions({
  queuedMatch = null,
}: {
  queuedMatch?: Record<string, unknown> | null;
} = {}) {
  const update = vi.fn(async ({ data }) => data);
  const updateMany = vi.fn();
  const deleteQueued = vi.fn();

  vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
    callback({
      queuedMatch: {
        findUnique: vi.fn().mockResolvedValue(queuedMatch),
        delete: deleteQueued,
      },
      sessionPlayer: {
        update,
        updateMany,
      },
    } as never)
  );

  return { update, updateMany, deleteQueued };
}

describe("skip next match route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { id: "p1", isAdmin: false },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: "club-1",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.sessionPlayer.findUnique)
      .mockResolvedValueOnce({ userId: "p1" } as never)
      .mockResolvedValue({ userId: "p1", skipNextMatchAt: null } as never);
    vi.mocked(getSessionOperatorMembership).mockResolvedValue(null as never);
    vi.mocked(tryRebuildQueuedMatchForSessionId).mockResolvedValue(null);
  });

  it("allows a player to skip themselves", async () => {
    const { update } = mockTransactions();

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          skipNextMatchAt: expect.any(Date),
          skipNextMatchRequestedById: "p1",
        }),
      })
    );
  });

  it("allows an operator to skip another player", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "staff-1", isAdmin: false },
    } as never);
    vi.mocked(getSessionOperatorMembership).mockResolvedValue({ id: "m1" } as never);
    mockTransactions();

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(200);
  });

  it("allows an admin to skip another player", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    mockTransactions();

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(200);
  });

  it("blocks unauthorized users from skipping another player", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "stranger-1", isAdmin: false },
    } as never);

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks quick-access users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "p1", isAdmin: false, isQuickAccess: true },
    } as never);

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(403);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("cancels skip without changing credit", async () => {
    const { update } = mockTransactions();

    const response = await PATCH(createRequest(false), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          skipNextMatchAt: null,
          skipNextMatchRequestedById: null,
        },
      })
    );
    expect(tryRebuildQueuedMatchForSessionId).not.toHaveBeenCalled();
  });

  it("deletes and rebuilds a queued match that contains the skipped player", async () => {
    const { deleteQueued, updateMany } = mockTransactions({
      queuedMatch: {
        id: "queue-1",
        team1User1Id: "p1",
        team1User2Id: "p2",
        team2User1Id: "p3",
        team2User2Id: "p4",
      },
    });

    const response = await PATCH(createRequest(true), {
      params: Promise.resolve({ code: "ABC", userId: "p1" }),
    });

    expect(response.status).toBe(200);
    expect(deleteQueued).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
    });
    expect(tryRebuildQueuedMatchForSessionId).toHaveBeenCalledWith("session-1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          skipNextMatchAt: null,
          matchmakingMatchesCredit: { increment: 1 },
        }),
      })
    );
  });
});
