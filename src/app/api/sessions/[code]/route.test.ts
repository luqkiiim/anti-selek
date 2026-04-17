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
    communityMember: {
      findUnique: vi.fn(),
    },
    queuedMatch: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tryRebuildQueuedMatchForSessionId } from "./queue-match/shared";
import { PATCH } from "./route";

describe("session settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables auto queue and clears any queued match", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      communityId: "community-1",
    } as never);
    vi.mocked(prisma.session.update).mockReturnValue({} as never);
    vi.mocked(prisma.queuedMatch.deleteMany).mockReturnValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const response = await PATCH(
      new Request("http://localhost/api/sessions/session-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          autoQueueEnabled: false,
        }),
      }),
      {
        params: Promise.resolve({ code: "session-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      autoQueueEnabled: false,
      queuedMatch: null,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("enables auto queue and returns a rebuilt queued match", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      communityId: "community-1",
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
        }),
      }),
      {
        params: Promise.resolve({ code: "session-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoQueueEnabled: true,
      queuedMatch: {
        id: "queue-1",
      },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { autoQueueEnabled: true },
    });
    expect(tryRebuildQueuedMatchForSessionId).toHaveBeenCalledWith("session-1");
  });
});
