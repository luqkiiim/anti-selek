import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json(
      { success: false, error: "Unauthorized" },
      { status: 403 }
    )
  ),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", isAdmin: false },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: vi.fn(),
    },
    queuedMatch: {
      deleteMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("./queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
} from "@/lib/rateLimit";
import { GET } from "./route";

describe("session route dynamic target protection", () => {
  it("blocks repeated invalid dynamic targets before DB lookup", async () => {
    vi.mocked(checkInvalidTargetRateLimit).mockResolvedValueOnce(
      Response.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      ) as never
    );

    const response = await GET(
      new Request("http://localhost/api/sessions/missing"),
      { params: Promise.resolve({ code: "missing" }) }
    );

    expect(response.status).toBe(429);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("does not reveal whether an unauthorized dynamic target exists", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null as never);

    const response = await GET(
      new Request("http://localhost/api/sessions/missing"),
      { params: Promise.resolve({ code: "missing" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(invalidTargetResponse).toHaveBeenCalledWith(
      expect.any(Request),
      "api:sessions:code"
    );
  });
});
