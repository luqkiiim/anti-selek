import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE } from "@/lib/communityAdminDisabledFeatures";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
}));

import { POST } from "./route";

describe("duplicate player merge route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", isAdmin: false },
    });
  });

  it("disables cross-community merge and points admins to the claim flow", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/communities/community-1/members/source-user/merge",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId: "target-user" }),
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE,
    });
  });
});
