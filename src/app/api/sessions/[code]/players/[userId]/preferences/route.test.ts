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
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      pool: SessionPool.A,
    });
    mocks.sessionPlayerUpdate.mockImplementation(async (args) => ({
      userId: "player-1",
      ...args.data,
      user: { id: "player-1", name: "Player One" },
    }));
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
    expect(body.error).toBe("Session already completed");
    expect(mocks.sessionPlayerUpdate).not.toHaveBeenCalled();
  });
});
