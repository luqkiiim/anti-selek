import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

describe("current user route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AVATAR_PUBLIC_BASE_URL = "https://cdn.test";
  });

  it("returns avatarUrl for the current user payload", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "user-1",
        isAdmin: false,
        isQuickAccess: false,
        quickAccessCommunityId: null,
      },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Owner",
      avatarKey: "avatars/user-1/avatar.jpg",
      isClaimed: true,
      gender: "MALE",
      partnerPreference: "OPEN",
      mixedSideOverride: null,
      elo: 1200,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
    });

    const response = await GET(new Request("http://localhost/api/user/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.avatarUrl).toBe(
      "https://cdn.test/avatars/user-1/avatar.jpg"
    );
  });
});
