import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClubAdminAccess: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberUpdate: vi.fn(),
  playerFindUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.getClubAdminAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: { findUnique: mocks.clubMemberFindUnique, update: mocks.clubMemberUpdate },
    player: { findUniqueOrThrow: mocks.playerFindUniqueOrThrow },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: vi.fn(() => false) }));
vi.mock("@/lib/errors", () => ({ logError: vi.fn(), safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(() => Response.json({ error: "Invalid target" }, { status: 404 })),
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "club-1", userId: "historical-player" }) };
const request = () => new Request("http://localhost/api/clubs/club-1/members/historical-player/reset-elo", { method: "POST" });

describe("club member reset ELO route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin-account", isAdmin: false } });
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: true });
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "original-membership", retiredByAdmissionEventId: null });
    mocks.clubMemberUpdate.mockReturnValue(Promise.resolve({ elo: 1000 }));
    mocks.playerFindUniqueOrThrow.mockResolvedValue({ id: "historical-player", name: "Original", ownerUserId: "account-owner", isActive: true, createdAt: new Date() });
  });

  it("keeps the active original Player reset available", async () => {
    mocks.transaction.mockResolvedValue([{ elo: 1000 }, { id: "historical-player", name: "Original", ownerUserId: "account-owner", isActive: true, createdAt: new Date() }]);
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.clubMemberFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId_playerId: { clubId: "club-1", playerId: "historical-player" } },
      select: { id: true, retiredByAdmissionEventId: true },
    }));
  });

  it("rejects retired Player rating resets before a transaction", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "retired-membership", retiredByAdmissionEventId: "retirement-event" });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Retired player ratings cannot be changed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
