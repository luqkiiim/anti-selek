import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), roster: vi.fn(), rateLimit: vi.fn(),
  memberFind: vi.fn(), memberUpdate: vi.fn(), memberUpdateMany: vi.fn(), playerUpdate: vi.fn(),
  grantFind: vi.fn(), grantUpdate: vi.fn(), grantUpdateMany: vi.fn(), anotherAdmin: vi.fn(),
  participation: vi.fn(), transaction: vi.fn(), propagate: vi.fn(), rebuild: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: mocks.roster }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/playerGroupPreferences", () => ({ propagatePreferredPoolToClubSessions: mocks.propagate }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: mocks.rebuild }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  clubMember: { findUnique: mocks.memberFind, update: mocks.memberUpdate, updateMany: mocks.memberUpdateMany },
  player: { update: mocks.playerUpdate },
  clubAccess: { findUnique: mocks.grantFind, update: mocks.grantUpdate, updateMany: mocks.grantUpdateMany, findFirst: mocks.anotherAdmin },
  sessionPlayer: { findFirst: mocks.participation },
  $transaction: mocks.transaction,
} }));
import { prisma } from "@/lib/prisma";
import { PATCH, DELETE } from "./route";
const actor = "account-admin";
const playerId = "historical-player";
let member: ReturnType<typeof makeMember>;
function makeMember(ownerUserId: string | null = null) {
  return { id: "preserved-membership", playerId, clubId: "club", archivedAt: null, elo: 1437, status: "CORE", preferredPool: "OPEN", needsMoreRest: true,
    player: { id: playerId, ownerUserId, name: "Historical Player", gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, isActive: true } };
}
function request(method: "PATCH" | "DELETE", body?: unknown) {
  return new Request(`http://localhost/api/clubs/club/members/${playerId}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
}
const context = { params: Promise.resolve({ id: "club", userId: playerId }) };
const patch = (body: unknown) => PATCH(request("PATCH", body), context);
const remove = () => DELETE(request("DELETE"), context);
function access(role = "ADMIN", isOwner = false) {
  mocks.access.mockResolvedValue({ createdById: "account-owner", membershipRole: role, canAdmin: ["ADMIN", "OWNER"].includes(role), isOwner, isGlobalAdmin: false });
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  member = makeMember();
  mocks.auth.mockResolvedValue({ user: { id: actor, isAdmin: false } });
  access();
  mocks.memberFind.mockImplementation(async () => member);
  mocks.roster.mockResolvedValue([{ id: playerId, name: "Historical Player", role: "MEMBER" }]);
  mocks.rateLimit.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  mocks.grantFind.mockResolvedValue({ id: "access-target", role: "MEMBER", status: "ACTIVE" });
  mocks.anotherAdmin.mockResolvedValue({ id: "access-other-admin" });
  mocks.participation.mockResolvedValue(null);
  mocks.propagate.mockResolvedValue({ immediateSessionCount: 1, deferredSessionCount: 0, automaticQueueSessionIds: ["session"] });
});

describe("club Player updates use Account authorization", () => {
  it("renames an offline Player through its durable ID without touching an account", async () => {
    expect((await patch({ name: "Renamed Player" })).status).toBe(200);
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: playerId }, data: { name: "Renamed Player" } });
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });
  it("blocks editing another account's owned name", async () => {
    member = makeMember("account-other");
    expect((await patch({ name: "Replacement" })).status).toBe(403);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });
  it("recognizes self ownership when Account and Player IDs differ", async () => {
    member = makeMember(actor); access("MEMBER");
    expect((await patch({ name: "My Player Name" })).status).toBe(200);
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: playerId }, data: { name: "My Player Name" } });
  });
  it("does not grant club writes or roster archiving from Player ownership alone", async () => {
    member = makeMember(actor);
    mocks.access.mockResolvedValue({ createdById: "account-owner", membershipRole: null, canAdmin: false, isOwner: false, isGlobalAdmin: false });
    expect((await patch({ name: "My Player Name" })).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });
  it.each(["email", "password", "ownerUserId", "elo"])("rejects %s outside its dedicated flow", async field => {
    expect((await patch({ [field]: "bad" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not globally deactivate an owned Player when removing one club membership", async () => {
    member = makeMember("account-other");
    expect((await patch({ isActive: false })).status).toBe(403);
  });
  it("allows STAFF to update only the game group and propagates the Player ID", async () => {
    access("STAFF");
    expect((await patch({ preferredPool: "A" })).status).toBe(200);
    expect(mocks.propagate).toHaveBeenCalledWith(prisma, { clubId: "club", playerId, preferredPool: "A" });
    expect(mocks.rebuild).toHaveBeenCalledWith("session");
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });
  it("blocks STAFF profile edits", async () => {
    access("STAFF");
    expect((await patch({ preferredPool: "A", name: "Wrong" })).status).toBe(403);
  });
  it("preserves the legacy rest field without applying a toggle", async () => {
    expect((await patch({ needsMoreRest: false })).status).toBe(200);
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });
  it("does not assign account roles to an offline Player", async () => {
    expect((await patch({ role: "ADMIN" })).status).toBe(400);
    expect(mocks.grantUpdate).not.toHaveBeenCalled();
  });
  it("assigns STAFF on ClubAccess while leaving ClubMember sporting settings unchanged", async () => {
    member = makeMember("account-other");
    expect((await patch({ role: "STAFF" })).status).toBe(200);
    expect(mocks.grantFind).toHaveBeenCalledWith({ where: { clubId_userId: { clubId: "club", userId: "account-other" } } });
    expect(mocks.grantUpdate).toHaveBeenCalledWith({ where: { id: "access-target" }, data: { role: "STAFF" } });
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });
  it("blocks a regular admin from demoting another admin", async () => {
    member = makeMember("account-other"); mocks.grantFind.mockResolvedValue({ id: "grant", role: "ADMIN", status: "ACTIVE" });
    expect((await patch({ role: "STAFF" })).status).toBe(403);
    expect(mocks.grantUpdate).not.toHaveBeenCalled();
  });
  it("lets the owner demote an admin", async () => {
    member = makeMember("account-other"); access("OWNER", true); mocks.grantFind.mockResolvedValue({ id: "grant", role: "ADMIN", status: "ACTIVE" });
    expect((await patch({ role: "STAFF" })).status).toBe(200);
  });
  it.each([actor, "account-owner"])("protects own and creator roles", async owner => {
    member = makeMember(owner);
    expect((await patch({ role: "MEMBER" })).status).toBe(400);
  });
});

describe("membership archiving preserves sporting history", () => {
  it("archives the existing ClubMember and revokes only Account access", async () => {
    member = makeMember("account-other");
    expect((await remove()).status).toBe(200);
    expect(mocks.memberUpdateMany).toHaveBeenCalledWith({ where: { id: "preserved-membership", archivedAt: null }, data: { archivedAt: expect.any(Date) } });
    expect(mocks.grantUpdateMany).toHaveBeenCalledWith({ where: { clubId: "club", userId: "account-other" }, data: { status: "REVOKED" } });
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });
  it("blocks removal during unfinished participation without deleting session rows", async () => {
    mocks.participation.mockResolvedValue({ id: "participant" });
    expect((await remove()).status).toBe(409);
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
  });
  it("protects another admin and the creator", async () => {
    member = makeMember("account-other"); mocks.grantFind.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    expect((await remove()).status).toBe(400);
    member = makeMember("account-owner");
    expect((await remove()).status).toBe(400);
  });
  it("allows an admin with different Player ID to leave if another admin remains", async () => {
    member = makeMember(actor); mocks.grantFind.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    expect((await remove()).status).toBe(200);
    expect(mocks.anotherAdmin).toHaveBeenCalledWith({ where: { clubId: "club", status: "ACTIVE", role: { in: ["ADMIN", "OWNER"] }, userId: { not: actor } }, select: { id: true } });
  });
  it("blocks the last admin from leaving", async () => {
    member = makeMember(actor); mocks.grantFind.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" }); mocks.anotherAdmin.mockResolvedValue(null);
    expect((await remove()).status).toBe(400);
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
  });
});
