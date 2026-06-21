import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE } from "@/lib/clubAdminDisabledFeatures";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

describe("duplicate player merge candidates route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", isAdmin: false },
    });
  });

  it("disables merge candidate lookup and points admins to the claim flow", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/clubs/community-1/members/source-user/merge-candidates?search=Alex"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE,
    });
  });
});
