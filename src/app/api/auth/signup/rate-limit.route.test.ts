import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  rateLimit: vi.fn(async () =>
    Response.json(
      { success: false, error: "Rate limit exceeded" },
      { status: 429 }
    )
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("signup route rate limiting", () => {
  it("returns 429 before signup business logic runs", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          email: "user@example.com",
          name: "User",
          password: "password123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Rate limit exceeded",
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
