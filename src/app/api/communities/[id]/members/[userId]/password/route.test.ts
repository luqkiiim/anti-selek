import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  communityMemberFindUnique: vi.fn(),
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
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
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
    new Request("http://localhost/api/communities/community-1/members/user-1/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1", userId: "user-1" }) }
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
    mocks.communityMemberFindUnique.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Player One",
        email: "player@example.com",
        isClaimed: true,
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
      userId: "user-1",
      name: "Player One",
      email: "player@example.com",
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "emergency-password-hash" },
    });
  });
});
