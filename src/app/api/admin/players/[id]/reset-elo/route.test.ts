import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  playerFindFirst: vi.fn(),
  playerUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { player: { findFirst: mocks.playerFindFirst, update: mocks.playerUpdate } } }));
vi.mock("@/lib/errors", () => ({ logError: vi.fn(), safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(() => Response.json({ error: "Invalid target" }, { status: 404 })),
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "historical-player" }) };
const request = () => new Request("http://localhost/api/admin/players/historical-player/reset-elo", { method: "POST" });

describe("admin Player reset ELO route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "global-admin", isAdmin: true } });
  });

  it("does not update a retired Player", async () => {
    mocks.playerFindFirst.mockResolvedValue(null);
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.playerFindFirst).toHaveBeenCalledWith({
      where: {
        id: "historical-player",
        clubMemberships: {
          none: { retiredByAdmissionEventId: { not: null } },
        },
      },
    });
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });
});
