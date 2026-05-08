import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    communityMember: { findUnique: vi.fn() },
    sessionPlayer: { findUnique: vi.fn(), findMany: vi.fn() },
    queuedMatch: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../queue-match/shared", () => ({
  tryRebuildQueuedMatchForCode: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

function createRequest(userId: string, isPaused: boolean) {
  return new Request("http://localhost/api/sessions/ABC/pause-player", {
    method: "POST",
    body: JSON.stringify({ userId, isPaused }),
  });
}

function mockTransaction(updateSpy: ReturnType<typeof vi.fn>) {
  vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
    callback({
      sessionPlayer: {
        update: updateSpy,
      },
      queuedMatch: {
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    } as never)
  );
}

describe("pause player route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      communityId: null,
      type: "POINTS",
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("credits a long-paused player to the lowest active effective match count on resume", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:00:00.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
    } as never);
    vi.mocked(prisma.sessionPlayer.findMany).mockResolvedValue([
      { matchesPlayed: 2, matchmakingMatchesCredit: 0 },
      { matchesPlayed: 3, matchmakingMatchesCredit: 1 },
      { matchesPlayed: 4, matchmakingMatchesCredit: 0 },
    ] as never);

    const updateSpy = vi.fn(async ({ data }) => ({ id: "session-player-1", ...data }));
    mockTransaction(updateSpy);

    const response = await POST(createRequest("late-player", false), {
      params: Promise.resolve({ code: "ABC" }),
    });

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPaused: false,
          pausedAt: null,
          availableSince: now,
          ladderEntryAt: now,
          inactiveSeconds: { increment: 600 },
          matchmakingMatchesCredit: 2,
        }),
      })
    );
  });

  it("does not reset queue time or credit for an instant pause/unpause toggle", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:09:30.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 3,
      matchmakingMatchesCredit: 4,
    } as never);

    const updateSpy = vi.fn(async ({ data }) => ({ id: "session-player-1", ...data }));
    mockTransaction(updateSpy);

    const response = await POST(createRequest("active-player", false), {
      params: Promise.resolve({ code: "ABC" }),
    });

    expect(response.status).toBe(200);
    expect(prisma.sessionPlayer.findMany).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isPaused: false,
          pausedAt: null,
          availableSince: undefined,
          ladderEntryAt: undefined,
          inactiveSeconds: { increment: 0 },
          matchmakingMatchesCredit: 4,
        }),
      })
    );
  });
});
