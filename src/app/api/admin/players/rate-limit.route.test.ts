import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () =>
    Response.json(
      { success: false, error: "Rate limit exceeded" },
      { status: 429 }
    )
  ),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { rateLimit } from "@/lib/rateLimit";
import { GET, POST } from "./route";

describe("admin players route rate limiting", () => {
  it("uses stricter write limits than admin read limits", async () => {
    await POST(
      new Request("http://localhost/api/admin/players", {
        body: "{}",
        method: "POST",
      })
    );
    await GET(new Request("http://localhost/api/admin/players"));

    expect(rateLimit).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      "api:admin:players:post",
      { limit: 15, windowMs: 60_000 }
    );
    expect(rateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      "api:admin:players:get",
      { limit: 20, windowMs: 60_000 }
    );
  });
});
