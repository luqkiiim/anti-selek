import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClubAdminAccess: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberUpdate: vi.fn(),
  clubMemberUpdateMany: vi.fn(),
  clubMemberFindFirst: vi.fn(),
  playerUpdate: vi.fn(),
  executeRaw: vi.fn(),
  rosterMember: vi.fn(),
  roster: vi.fn(),
  propagate: vi.fn(),
  rebuildQueue: vi.fn(),
  logError: vi.fn(),
  transaction: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.getClubAdminAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: { findUnique: mocks.clubMemberFindUnique, update: mocks.clubMemberUpdate, updateMany: mocks.clubMemberUpdateMany, findFirst: mocks.clubMemberFindFirst },
    clubAccess: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    player: { update: mocks.playerUpdate },
    sessionPlayer: { findFirst: vi.fn() },
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: mocks.roster, getClubRosterMember: mocks.rosterMember }));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: vi.fn(() => false), normalizeNameLookupKey: (value: string) => value.toLowerCase() }));
vi.mock("@/lib/playerGroupPreferences", () => ({ propagatePreferredPoolToClubSessionsInTransaction: mocks.propagate }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: mocks.rebuildQueue }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/errors", () => ({ logError: mocks.logError, safeErrorResponse: vi.fn(() => Response.json({ error: "Internal server error" }, { status: 500 })) }));

import { prisma } from "@/lib/prisma";
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

describe("club member transaction responses", () => {
  const currentMember = { id: "membership-1", playerId: "player-1", ownerUserId: null, archivedAt: null, retiredByAdmissionEventId: null, player: { id: "player-1", name: "Player", gender: "MALE", isActive: true } };
  const params = { params: Promise.resolve({ id: "club-1", userId: "player-1" }) };
  const edit = (body: unknown) => PATCH(new Request("http://localhost/api/clubs/club-1/members/player-1", { method: "PATCH", body: JSON.stringify(body) }), params);
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin-account" } });
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: true, membershipRole: "ADMIN", createdById: "club-owner" });
    mocks.clubMemberFindUnique.mockResolvedValue(currentMember);
    mocks.clubMemberFindFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async callback => callback(prisma));
    mocks.rosterMember.mockResolvedValue({ id: "player-1", preferredPool: "A", name: "Player" });
    mocks.propagate.mockResolvedValue({ immediateSessionCount: 1, deferredSessionCount: 1, automaticQueueSessionIds: ["session-1", "session-2"] });
  });

  it("updates the membership, propagates groups, and reads its response in one transaction", async () => {
    let committed = false;
    mocks.transaction.mockImplementation(async callback => {
      const result = await callback(prisma);
      expect(mocks.propagate).toHaveBeenCalledWith(prisma, { clubId: "club-1", playerId: "player-1", preferredPool: "A" });
      expect(mocks.rosterMember).toHaveBeenCalledWith(prisma, "club-1", "player-1");
      expect(mocks.rebuildQueue).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    mocks.rebuildQueue.mockImplementation(async () => { expect(committed).toBe(true); });
    const response = await edit({ preferredPool: "A", status: "OCCASIONAL" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "player-1", name: "Player", preferredPool: "A", preferencePropagation: { immediateSessionCount: 1, deferredSessionCount: 1, automaticQueueSessionIds: ["session-1", "session-2"] } });
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith({ where: { id: "membership-1" }, data: { preferredPool: "A", status: "OCCASIONAL" } });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.rebuildQueue).toHaveBeenCalledTimes(2);
  });

  it("returns the committed member with a warning when a queue rebuild fails", async () => {
    mocks.rebuildQueue.mockRejectedValueOnce(new Error("secret connection URL"));
    const response = await edit({ preferredPool: "A" });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ id: "player-1", preferredPool: "A", warnings: [{ code: "QUEUE_REBUILD_FAILED", message: "Player saved. The automatic queue could not be refreshed." }] });
    expect(mocks.rebuildQueue).toHaveBeenCalledTimes(2);
    expect(mocks.logError).toHaveBeenCalledWith("Rebuild automatic queue after club Player update", { code: "QUEUE_REBUILD_FAILED", clubId: "club-1", playerId: "player-1", sessionId: "session-1" });
    expect(JSON.stringify(result)).not.toContain("secret connection");
  });

  it("keeps a successful committed response even if warning logging fails", async () => {
    mocks.rebuildQueue.mockRejectedValue(new Error("queue unavailable"));
    mocks.logError.mockImplementation(() => { throw new Error("log unavailable"); });
    const response = await edit({ preferredPool: "A" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ warnings: [{ code: "QUEUE_REBUILD_FAILED" }] });
  });

  it.each(["propagation", "member response"])("does not rebuild queues when %s fails inside the transaction", async stage => {
    if (stage === "propagation") mocks.propagate.mockRejectedValue(new Error("propagation failed"));
    else mocks.rosterMember.mockRejectedValue(new Error("response read failed"));
    expect((await edit({ preferredPool: "A" })).status).toBe(500);
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow(/failed/);
    expect(mocks.rebuildQueue).not.toHaveBeenCalled();
    expect(mocks.roster).not.toHaveBeenCalled();
  });

  it("keeps edits without a preferred pool independent of propagation", async () => {
    expect((await edit({ status: "OCCASIONAL" })).status).toBe(200);
    expect(mocks.propagate).not.toHaveBeenCalled();
    expect(mocks.rebuildQueue).not.toHaveBeenCalled();
  });

  it("retains staff permission for a group-only edit", async () => {
    mocks.getClubAdminAccess.mockResolvedValue({ canAdmin: false, membershipRole: "STAFF", createdById: "club-owner" });
    expect((await edit({ preferredPool: "A" })).status).toBe(200);
    expect((await edit({ preferredPool: "A", status: "CORE" })).status).toBe(403);
  });

  it("rejects personal edits to an account-owned profile by another admin", async () => {
    mocks.clubMemberFindFirst.mockResolvedValue({ id: "connected-membership" });
    expect((await edit({ name: "New Name" })).status).toBe(403);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it("rechecks permission inside the write transaction", async () => {
    mocks.getClubAdminAccess.mockResolvedValueOnce({ canAdmin: true, membershipRole: "ADMIN" }).mockResolvedValue({ canAdmin: false, membershipRole: "MEMBER" });
    expect((await edit({ preferredPool: "A" })).status).toBe(403);
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });
});
