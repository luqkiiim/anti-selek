import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  bcryptHash: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.bcryptHash,
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/quickAccess", () => ({
  getQuickAccessDeniedMessage: () => "Quick access not allowed",
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
    user: {
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

import { POST } from "./route";

function postPasswordReset(body: unknown) {
  return POST(
    new Request("http://localhost/api/clubs/community-1/members/player-target/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1", userId: "player-target" }) }
  );
}

describe("club emergency password reset route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.bcryptHash.mockResolvedValue("emergency-password-hash");
    mocks.userUpdate.mockResolvedValue({});
    mocks.clubMemberFindUnique.mockResolvedValue({
      player: {
        id: "player-target",
        name: "Player One",
        ownerUser: {
          id: "account-target",
          name: "Account One",
          email: "player@example.com",
        },
      },
    });
  });

  it("denies ordinary club admins", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "community-admin-1", isAdmin: false },
    });

    const response = await postPasswordReset({ password: "password123" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Unauthorized");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("allows global admins to perform emergency resets", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin-1", isAdmin: true, email: "admin@example.com" },
    });

    const response = await postPasswordReset({ password: "password123" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      userId: "account-target",
      playerId: "player-target",
      name: "Player One",
      email: "player@example.com",
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "account-target" },
      data: {
        passwordHash: "emergency-password-hash",
        sessionVersion: { increment: 1 },
      },
    });
  });

  it("refuses password resets for an unclaimed player profile", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin-1", isAdmin: true, email: "admin@example.com" },
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      player: { id: "player-target", name: "Player One", ownerUser: null },
    });

    const response = await postPasswordReset({ password: "password123" });

    expect(response.status).toBe(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
