import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  playerUpdateMany: vi.fn(),
  matchDeleteMany: vi.fn(),
  sessionPlayerDeleteMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    player: { updateMany: mocks.playerUpdateMany },
    match: { deleteMany: mocks.matchDeleteMany },
    sessionPlayer: { deleteMany: mocks.sessionPlayerDeleteMany },
    session: { deleteMany: mocks.sessionDeleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logError: vi.fn(), safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

describe("platform reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "global-admin", isAdmin: true } });
    mocks.playerUpdateMany.mockResolvedValue({ count: 1 });
    mocks.matchDeleteMany.mockResolvedValue({ count: 0 });
    mocks.sessionPlayerDeleteMany.mockResolvedValue({ count: 0 });
    mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("resets Elo without targeting retired Players", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/community/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.playerUpdateMany).toHaveBeenCalledWith({
      where: {
        clubMemberships: {
          none: { retiredByAdmissionEventId: { not: null } },
        },
      },
      data: { elo: 1000 },
    });
  });
});
