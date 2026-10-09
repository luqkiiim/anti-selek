import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  playerFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: { player: { findMany: mocks.playerFindMany } } }));

import { GET } from "./route";

describe("admin Player list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin", isAdmin: true } });
    mocks.rateLimit.mockResolvedValue(null);
    mocks.playerFindMany.mockResolvedValue([]);
  });

  it("keeps retired sporting identities out of the editable management list", async () => {
    const response = await GET(new Request("http://localhost/api/admin/players"));
    expect(response.status).toBe(200);
    expect(mocks.playerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubMemberships: { none: { retiredByAdmissionEventId: { not: null } } } },
    }));
  });
});
