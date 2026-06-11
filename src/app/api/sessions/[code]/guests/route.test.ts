import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invalidTargetResponse: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionPlayerFindMany: vi.fn(),
  sessionPlayerFindUnique: vi.fn(),
  transaction: vi.fn(),
  userCreate: vi.fn(),
  sessionPlayerCreate: vi.fn(),
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
      findMany: mocks.sessionPlayerFindMany,
      findUnique: mocks.sessionPlayerFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

vi.mock("../queue-match/shared", () => ({
  tryRebuildAutomaticQueuedMatchForSessionId:
    mocks.tryRebuildAutomaticQueuedMatchForSessionId,
}));

import { POST } from "./route";

function postGuest(body: unknown = { name: "Late Guest" }) {
  return POST(
    new Request("http://localhost/api/sessions/ABC/guests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: "ABC" }) }
  );
}

function mockGuestTransaction() {
  mocks.userCreate.mockResolvedValue({
    id: "guest-1",
    name: "Late Guest",
    elo: 1000,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
  });
  mocks.sessionPlayerCreate.mockResolvedValue({});
  mocks.transaction.mockImplementation((callback) =>
    callback({
      user: { create: mocks.userCreate },
      sessionPlayer: { create: mocks.sessionPlayerCreate },
    })
  );
}

describe("guest route", () => {
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
    mocks.tryRebuildAutomaticQueuedMatchForSessionId.mockResolvedValue(null);
    mockGuestTransaction();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets no-catch-up credit and arrival priority for active-session guests", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      communityId: null,
      status: SessionStatus.ACTIVE,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
    });
    mocks.sessionPlayerFindMany.mockResolvedValue([
      { matchesPlayed: 4, matchmakingMatchesCredit: 0 },
      { matchesPlayed: 5, matchmakingMatchesCredit: 0 },
    ]);

    const response = await postGuest();

    expect(response.status).toBe(200);
    expect(mocks.sessionPlayerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchmakingMatchesCredit: 4,
        joinedAt: now,
        ladderEntryAt: now,
        availableSince: now,
        arrivalPriorityAt: now,
      }),
    });
    expect(mocks.tryRebuildAutomaticQueuedMatchForSessionId).toHaveBeenCalledWith(
      "session-1"
    );
  });

  it("does not set arrival priority for waiting-session guests", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      communityId: null,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
    });

    const response = await postGuest();

    expect(response.status).toBe(200);
    expect(mocks.sessionPlayerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        matchmakingMatchesCredit: 0,
        arrivalPriorityAt: null,
      }),
    });
    expect(mocks.sessionPlayerFindMany).not.toHaveBeenCalled();
    expect(
      mocks.tryRebuildAutomaticQueuedMatchForSessionId
    ).not.toHaveBeenCalled();
  });
});
