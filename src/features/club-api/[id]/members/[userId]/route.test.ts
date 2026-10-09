import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClubAdminAccess: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberUpdate: vi.fn(),
  clubMemberUpdateMany: vi.fn(),
  transaction: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.getClubAdminAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: { findUnique: mocks.clubMemberFindUnique, update: mocks.clubMemberUpdate, updateMany: mocks.clubMemberUpdateMany },
    clubAccess: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    sessionPlayer: { findFirst: vi.fn() },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: vi.fn() }));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: vi.fn(() => false), normalizeNameLookupKey: (value: string) => value.toLowerCase() }));
vi.mock("@/lib/mixedSide", () => ({ isValidPlayerGender: vi.fn(() => true), isValidPartnerPreference: vi.fn(() => true), resolveMixedSideState: vi.fn(() => ({})), isValidMixedSide: vi.fn(() => true) }));
vi.mock("@/lib/sessionPools", () => ({ isValidSessionPool: vi.fn(() => false) }));
vi.mock("@/lib/playerGroupPreferences", () => ({ propagatePreferredPoolToClubSessions: vi.fn() }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: vi.fn() }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/errors", () => ({ logError: vi.fn(), safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ id: "club-1", userId: "retired-player" }) };
const retiredMembership = {
  id: "retired-membership",
  archivedAt: null,
  retiredByAdmissionEventId: "retirement-event",
  player: { id: "retired-player", ownerUserId: "account-1", isActive: false, name: "Retired Player" },
};

describe("club member management for retired Players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin-account", isAdmin: false } });
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: true, isGlobalAdmin: false, membershipRole: "ADMIN", createdById: "club-owner" });
    mocks.clubMemberFindUnique.mockResolvedValue(retiredMembership);
    mocks.rateLimit.mockResolvedValue(null);
  });

  it("rejects profile edits before reaching transactional writes", async () => {
    const response = await PATCH(new Request("http://localhost/api/clubs/club-1/members/retired-player", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Changed name" }),
    }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Retired player profiles cannot be changed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects membership archival before reaching transactional writes", async () => {
    const response = await DELETE(new Request("http://localhost/api/clubs/club-1/members/retired-player", { method: "DELETE" }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Retired player profiles cannot be changed" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.clubMemberUpdateMany).not.toHaveBeenCalled();
  });
});
