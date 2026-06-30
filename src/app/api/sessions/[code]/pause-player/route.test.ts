import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    clubMember: { findUnique: vi.fn() },
    match: { findFirst: vi.fn() },
    sessionPlayer: { findUnique: vi.fn(), findMany: vi.fn() },
    queuedMatch: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../queue-match/shared", () => ({
  tryRebuildAutomaticQueuedMatchForCode: vi.fn(),
  tryRebuildQueuedMatchForCode: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tryRebuildAutomaticQueuedMatchForCode } from "../queue-match/shared";
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
      clubId: null,
      type: "POINTS",
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.match.findFirst).mockResolvedValue(null);
    vi.mocked(tryRebuildAutomaticQueuedMatchForCode).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("credits a resumed player when another match completed while paused", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:00:00.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
    } as never);
    vi.mocked(prisma.match.findFirst).mockResolvedValue({
      id: "completed-match-1",
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
          arrivalPriorityAt: now,
          inactiveSeconds: { increment: 600 },
          matchmakingMatchesCredit: 2,
        }),
      })
    );
    expect(tryRebuildAutomaticQueuedMatchForCode).toHaveBeenCalledWith("ABC");
  });

  it("credits a short resumed player when another match completed while paused", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:09:30.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
    } as never);
    vi.mocked(prisma.match.findFirst).mockResolvedValue({
      id: "completed-match-1",
    } as never);
    vi.mocked(prisma.sessionPlayer.findMany).mockResolvedValue([
      { matchesPlayed: 4, matchmakingMatchesCredit: 0 },
      { matchesPlayed: 5, matchmakingMatchesCredit: 0 },
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
          arrivalPriorityAt: now,
          inactiveSeconds: { increment: 30 },
          matchmakingMatchesCredit: 4,
        }),
      })
    );
    expect(tryRebuildAutomaticQueuedMatchForCode).toHaveBeenCalledWith("ABC");
  });

  it("blocks quick-access users from pausing players", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "active-player", isAdmin: false, isQuickAccess: true },
    } as never);

    const response = await POST(createRequest("active-player", true), {
      params: Promise.resolve({ code: "ABC" }),
    });

    expect(response.status).toBe(403);
    expect(prisma.sessionPlayer.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not reset queue time or credit when no match completed while paused", async () => {
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
          arrivalPriorityAt: undefined,
          inactiveSeconds: { increment: 30 },
          matchmakingMatchesCredit: 4,
        }),
      })
    );
    expect(tryRebuildAutomaticQueuedMatchForCode).not.toHaveBeenCalled();
  });

  it("does not reset queue time or credit after a long pause with no completed match", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:00:00.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
    } as never);

    const updateSpy = vi.fn(async ({ data }) => ({ id: "session-player-1", ...data }));
    mockTransaction(updateSpy);

    const response = await POST(createRequest("late-player", false), {
      params: Promise.resolve({ code: "ABC" }),
    });

    expect(response.status).toBe(200);
    expect(prisma.sessionPlayer.findMany).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availableSince: undefined,
          ladderEntryAt: undefined,
          arrivalPriorityAt: undefined,
          inactiveSeconds: { increment: 600 },
          matchmakingMatchesCredit: 0,
        }),
      })
    );
    expect(tryRebuildAutomaticQueuedMatchForCode).not.toHaveBeenCalled();
  });

  it("does not set arrival priority for a real resume before the session is active", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: null,
      type: "POINTS",
      status: "WAITING",
    } as never);
    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:00:00.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 0,
      matchmakingMatchesCredit: 0,
    } as never);
    vi.mocked(prisma.match.findFirst).mockResolvedValue({
      id: "completed-match-1",
    } as never);
    vi.mocked(prisma.sessionPlayer.findMany).mockResolvedValue([
      { matchesPlayed: 2, matchmakingMatchesCredit: 0 },
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
          availableSince: now,
          ladderEntryAt: now,
          arrivalPriorityAt: undefined,
          inactiveSeconds: { increment: 600 },
          matchmakingMatchesCredit: 2,
        }),
      })
    );
    expect(tryRebuildAutomaticQueuedMatchForCode).not.toHaveBeenCalled();
  });

  it("excludes matches involving the resumed player from the advancement check", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(prisma.sessionPlayer.findUnique).mockResolvedValue({
      pausedAt: new Date("2026-05-08T04:09:00.000Z"),
      inactiveSeconds: 0,
      matchesPlayed: 1,
      matchmakingMatchesCredit: 0,
    } as never);

    const updateSpy = vi.fn(async ({ data }) => ({ id: "session-player-1", ...data }));
    mockTransaction(updateSpy);

    const response = await POST(createRequest("resumed-player", false), {
      params: Promise.resolve({ code: "ABC" }),
    });

    expect(response.status).toBe(200);
    expect(prisma.match.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            OR: expect.arrayContaining([
              { team1User1Id: "resumed-player" },
              { team1User2Id: "resumed-player" },
              { team2User1Id: "resumed-player" },
              { team2User2Id: "resumed-player" },
            ]),
          },
        }),
      })
    );
    expect(prisma.sessionPlayer.findMany).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          availableSince: undefined,
          ladderEntryAt: undefined,
          arrivalPriorityAt: undefined,
          inactiveSeconds: { increment: 60 },
          matchmakingMatchesCredit: 0,
        }),
      })
    );
  });
});
