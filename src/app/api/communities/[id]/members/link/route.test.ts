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

import { GET, POST } from "./route";

describe("link existing unclaimed club player route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
  });

  it("disables candidate listing and points admins to the claim flow", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/clubs/community-2/members/link?search=alex"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE,
    });
  });

  it("disables cross-community linking and points admins to the claim flow", async () => {
    const response = await POST(
      new Request("http://localhost/api/clubs/community-2/members/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "unclaimed-user-1",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE,
    });
  });
});
