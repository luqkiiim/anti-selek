import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("@/lib/avatar", () => ({
  resolveAvatarUrl: (avatarKey: string | null | undefined) => avatarKey ?? null,
}));

import { PATCH } from "./route";

function patchAdminPlayer(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/admin/players/user-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "user-1" }) }
  );
}

describe("admin update player route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin-1", isAdmin: true },
    });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
  });

  it("rejects renaming claimed users", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Claimed Player",
      email: "claimed@example.com",
      isClaimed: true,
    });

    const response = await patchAdminPlayer({ name: "Renamed Claimed Player" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Claimed members manage their own account name");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("still allows renaming unclaimed placeholders", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Placeholder",
      email: null,
      isClaimed: false,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Renamed Placeholder",
      email: null,
      avatarKey: null,
      elo: 1000,
      isActive: true,
      isClaimed: false,
      createdAt: new Date("2026-05-19T00:00:00.000Z"),
    });

    const response = await patchAdminPlayer({ name: "Renamed Placeholder" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("Renamed Placeholder");
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "Renamed Placeholder",
        email: undefined,
        elo: undefined,
        isActive: undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarKey: true,
        elo: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });
  });
});
