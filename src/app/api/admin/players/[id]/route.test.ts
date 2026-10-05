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
    player: {
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

import { PATCH, DELETE } from "./route";

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
      ownerUserId: "account-other",
    });

    const response = await patchAdminPlayer({ name: "Renamed Claimed Player" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Player owners manage their own player name");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("still allows renaming unclaimed placeholders", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Placeholder",
      email: null,
      ownerUserId: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Renamed Placeholder",
      email: null,
      avatarKey: null,
      elo: 1000,
      isActive: true,
      ownerUserId: null,
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
        elo: undefined,
        isActive: undefined,
      },
      select: {
        id: true,
        name: true,
        avatarKey: true,
        elo: true,
        isActive: true,
        ownerUserId: true,
        createdAt: true,
      },
    });
  });

it("archives a durable Player instead of cascading historical deletion", async () => {
  mocks.userFindUnique.mockResolvedValue({ id: "historical-player", name: "Historical Player", ownerUserId: "different-account", avatarKey: null });
  const response = await DELETE(new Request("http://localhost/api/admin/players/historical-player", { method: "DELETE" }), { params: Promise.resolve({ id: "historical-player" }) });
  expect(response.status).toBe(200);
  expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: "historical-player" }, data: { isActive: false } });
});
it("recognizes the actor's own Player using ownership when IDs differ", async () => {
  mocks.userFindUnique.mockResolvedValue({ ownerUserId: "global-admin-1" });
  const response = await DELETE(new Request("http://localhost/api/admin/players/historical-player", { method: "DELETE" }), { params: Promise.resolve({ id: "historical-player" }) });
  expect(response.status).toBe(400);
  expect(mocks.userUpdate).not.toHaveBeenCalled();
});

});
