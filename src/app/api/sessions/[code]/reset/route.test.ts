import { describe, expect, it, vi } from "vitest";
import {
  SessionMatchmakingStyle,
  SessionPool,
  SessionStatus,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    clubMember: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction: vi.fn().mockResolvedValue({
    appliedCount: 0,
    appliedUserIds: [],
    automaticQueueInvalidated: false,
  }),
}));
vi.mock("@/lib/sessionLifecycle", () => ({
  reverseSessionEloChanges: vi.fn(),
}));
vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn((players) => players),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("reset session route", () => {
  it("clears gameplay state while preserving settings and player groups", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: null,
      isTest: true,
      status: SessionStatus.ACTIVE,
    } as never);

    const sessionPlayerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const sessionUpdate = vi.fn().mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      poolsEnabled: true,
      courts: [],
      players: [
        {
          userId: "player-1",
          pool: SessionPool.B,
          user: {
            id: "player-1",
            name: "Player One",
            avatarKey: null,
            elo: 1000,
          },
        },
      ],
      matches: [],
      queuedMatch: null,
    });
    const tx = {
      queuedMatch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      court: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      match: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: sessionPlayerUpdateMany,
      },
      session: { update: sessionUpdate },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await POST(
      new Request("http://localhost/api/sessions/session-1/reset", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: SessionStatus.WAITING,
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      poolsEnabled: true,
      players: [{ userId: "player-1", pool: SessionPool.B }],
      matches: [],
      queuedMatch: null,
    });
    expect(sessionUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "matchmakingStyle"
    );
    expect(sessionUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "poolsEnabled"
    );
    expect(sessionPlayerUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "pool"
    );
  });
});
