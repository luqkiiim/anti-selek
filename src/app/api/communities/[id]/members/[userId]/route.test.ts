import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  roster: vi.fn(),
  rosterMember: vi.fn(),
  rateLimit: vi.fn(),
  memberFind: vi.fn(),
  memberFindFirst: vi.fn(),
  memberFindOrThrow: vi.fn(),
  memberUpdate: vi.fn(),
  memberUpdateMany: vi.fn(),
  playerFindMany: vi.fn(),
  playerUpdate: vi.fn(),
  playerUpdateMany: vi.fn(),
  userFind: vi.fn(),
  userUpdate: vi.fn(),
  grantFind: vi.fn(),
  grantFindOrThrow: vi.fn(),
  grantUpdate: vi.fn(),
  grantUpdateMany: vi.fn(),
  grantCount: vi.fn(),
  anotherAdmin: vi.fn(),
  admissionFindMany: vi.fn(),
  admissionUpdateMany: vi.fn(),
  claimFindMany: vi.fn(),
  claimUpdateMany: vi.fn(),
  invitationFindMany: vi.fn(),
  invitationUpdateMany: vi.fn(),
  offlineLinkFindMany: vi.fn(),
  offlineLinkUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  propagate: vi.fn(),
  rebuild: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: mocks.roster, getClubRosterMember: mocks.rosterMember }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/playerGroupPreferences", () => ({ propagatePreferredPoolToClubSessionsInTransaction: mocks.propagate }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: mocks.rebuild }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  club: { findUnique: vi.fn(async () => ({ id: "club", createdById: "account-owner", isTutorial: false })) },
  clubMember: {
    findUnique: mocks.memberFind,
    findFirst: mocks.memberFindFirst,
    findUniqueOrThrow: mocks.memberFindOrThrow,
    update: mocks.memberUpdate,
    updateMany: mocks.memberUpdateMany,
  },
  player: { findMany: mocks.playerFindMany, update: mocks.playerUpdate, updateMany: mocks.playerUpdateMany },
  user: { findUnique: mocks.userFind, update: mocks.userUpdate },
  clubAccess: {
    findUnique: mocks.grantFind,
    findUniqueOrThrow: mocks.grantFindOrThrow,
    update: mocks.grantUpdate,
    updateMany: mocks.grantUpdateMany,
    count: mocks.grantCount,
    findFirst: mocks.anotherAdmin,
  },
  clubAdmissionRequest: { findMany: mocks.admissionFindMany, updateMany: mocks.admissionUpdateMany },
  claimRequest: { findMany: mocks.claimFindMany, updateMany: mocks.claimUpdateMany },
  playerInvitation: { findMany: mocks.invitationFindMany, updateMany: mocks.invitationUpdateMany },
  offlineIdentityLinkRequest: { findMany: mocks.offlineLinkFindMany, updateMany: mocks.offlineLinkUpdateMany },
  $queryRaw: mocks.queryRaw,
  $executeRaw: mocks.executeRaw,
  $transaction: mocks.transaction,
} }));
import { prisma } from "@/lib/prisma";
import { PATCH, DELETE } from "./route";

const actor = "account-admin";
const playerId = "historical-player";
let member: ReturnType<typeof makeMember>;
let adminGrant: { id: string; role: string; status: string; revision: number };
let targetGrant: { id: string; role: string; status: string; revision: number };
let otherAdminCount: number;
let ownershipInsertError: string | null;

function makeMember(ownerUserId: string | null = null, provenanceOwnerUserId: string | null = "legacy-owner") {
  return {
    id: "preserved-membership",
    playerId,
    clubId: "club",
    ownerUserId,
    ownershipRevision: 0,
    archivedAt: null as Date | null,
    retiredByAdmissionEventId: null,
    elo: 1437,
    status: "CORE",
    preferredPool: "OPEN",
    needsMoreRest: true,
    club: { id: "club", createdById: "account-owner", isTutorial: false },
    player: {
      id: playerId,
      ownerUserId: provenanceOwnerUserId,
      name: "Historical Player",
      avatarKey: "historical-avatar",
      gender: "MALE",
      partnerPreference: "OPEN",
      mixedSideOverride: null,
      isActive: true,
    },
  };
}

function request(method: "PATCH" | "DELETE", body?: unknown) {
  return new Request(`http://localhost/api/clubs/club/members/${playerId}`, {
    method,
    ...(body !== undefined
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}
const context = { params: Promise.resolve({ id: "club", userId: playerId }) };
const patch = (body: unknown) => PATCH(request("PATCH", body), context);
const remove = () => DELETE(request("DELETE"), context);

function access(role = "ADMIN", isOwner = false) {
  mocks.access.mockResolvedValue({
    createdById: "account-owner",
    membershipRole: role,
    canAdmin: ["ADMIN", "OWNER"].includes(role),
    isOwner,
    isGlobalAdmin: false,
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  member = makeMember();
  adminGrant = { id: "access-admin", role: "ADMIN", status: "ACTIVE", revision: 0 };
  targetGrant = { id: "access-target", role: "MEMBER", status: "ACTIVE", revision: 0 };
  otherAdminCount = 1;
  ownershipInsertError = null;

  mocks.auth.mockResolvedValue({ user: { id: actor, isAdmin: false } });
  access();
  mocks.memberFind.mockImplementation(async () => member);
  mocks.memberFindFirst.mockImplementation(async () =>
    member.ownerUserId ? { id: member.id } : null
  );
  mocks.memberFindOrThrow.mockImplementation(async () => member);
  mocks.memberUpdate.mockImplementation(async ({ data }) => {
    Object.assign(member, data);
    return member;
  });
  mocks.playerFindMany.mockImplementation(async () =>
    member.ownerUserId === actor
      ? [{
          id: playerId,
          avatarKey: member.player.avatarKey,
          clubMemberships: [{ ownerUserId: actor, retiredByAdmissionEventId: null }],
        }]
      : []
  );
  mocks.userFind.mockResolvedValue({
    id: actor,
    name: "Account Admin",
    avatarKey: null,
    gender: "MALE",
    mixedSideOverride: null,
    partnerPreference: "OPEN",
    isActive: true,
    selfNameChangedAt: null,
    selfGenderChangedAt: null,
  });
  mocks.grantFind.mockImplementation(async ({ where }) => {
    const userId = where.clubId_userId.userId;
    if (userId === actor) return adminGrant;
    if (userId === "account-other") return targetGrant;
    if (userId === "account-owner") return { id: "access-owner", role: "MEMBER", status: "ACTIVE", revision: 0 };
    return null;
  });
  mocks.grantFindOrThrow.mockImplementation(async ({ where }) =>
    where.id === adminGrant.id ? adminGrant : targetGrant
  );
  mocks.grantUpdate.mockImplementation(async ({ where, data }) => {
    const grant = where.id === adminGrant.id ? adminGrant : targetGrant;
    Object.assign(grant, data);
    return grant;
  });
  mocks.grantCount.mockImplementation(async () => otherAdminCount);
  mocks.anotherAdmin.mockResolvedValue({ id: "access-other-admin" });
  mocks.admissionFindMany.mockResolvedValue([]);
  mocks.admissionUpdateMany.mockResolvedValue({ count: 0 });
  mocks.claimFindMany.mockResolvedValue([]);
  mocks.claimUpdateMany.mockResolvedValue({ count: 0 });
  mocks.invitationFindMany.mockResolvedValue([]);
  mocks.invitationUpdateMany.mockResolvedValue({ count: 0 });
  mocks.offlineLinkFindMany.mockResolvedValue([]);
  mocks.offlineLinkUpdateMany.mockResolvedValue({ count: 0 });
  mocks.queryRaw.mockImplementation(async () => [{
    metadata: JSON.stringify({ name: member.player.name, avatarKey: member.player.avatarKey }),
    archivedAtJson: JSON.stringify(member.archivedAt),
  }]);
  mocks.executeRaw.mockImplementation(async (strings: TemplateStringsArray | string[]) => {
    const sql = Array.from(strings).join("");
    if (!sql.includes('INSERT INTO "ClubPlayerOwnershipEvent"')) return 1;
    if (ownershipInsertError) throw new Error(ownershipInsertError);
    if (member.ownerUserId) {
      const grant = member.ownerUserId === actor ? adminGrant : targetGrant;
      if (grant.status !== "REVOKED") {
        grant.status = "REVOKED";
        grant.revision += 1;
      }
    }
    member = {
      ...member,
      ownerUserId: null,
      ownershipRevision: member.ownershipRevision + 1,
      archivedAt: member.archivedAt ?? new Date("2026-10-12T00:00:00.000Z"),
    };
    return 1;
  });
  mocks.transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) => operation(prisma));
  mocks.roster.mockResolvedValue([{ id: playerId, name: "Historical Player", role: "MEMBER" }]);
  mocks.rosterMember.mockResolvedValue({ id: playerId, name: "Historical Player", role: "MEMBER" });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.propagate.mockResolvedValue({ immediateSessionCount: 1, deferredSessionCount: 0, automaticQueueSessionIds: ["session"] });
});

describe("club Player updates use local Account ownership", () => {
  it("renames an offline Player through its durable ID without touching an account", async () => {
    member = makeMember(null, null);
    expect((await patch({ name: "Renamed Player" })).status).toBe(200);
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: playerId }, data: { name: "Renamed Player" } });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });

  it("blocks an admin from editing another account's canonical name", async () => {
    member = makeMember("account-other");
    expect((await patch({ name: "Replacement" })).status).toBe(403);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.playerUpdateMany).not.toHaveBeenCalled();
  });

  it("recognizes local self ownership despite different Account, Player, and legacy provenance IDs", async () => {
    member = makeMember(actor, "legacy-provenance-owner");
    access("MEMBER");
    expect((await patch({ name: "My Player Name" })).status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: actor },
      data: { name: "My Player Name", selfNameChangedAt: expect.any(Date) },
    });
    expect(mocks.playerUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [playerId] } },
      data: { name: "My Player Name" },
    });
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it("does not grant club writes or roster archiving from local Player ownership alone", async () => {
    member = makeMember(actor);
    mocks.access.mockResolvedValue({ createdById: "account-owner", membershipRole: null, canAdmin: false, isOwner: false, isGlobalAdmin: false });
    expect((await patch({ name: "My Player Name" })).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
  });

  it.each(["email", "password", "ownerUserId", "elo"])("rejects %s outside its dedicated flow", async (field) => {
    expect((await patch({ [field]: "bad" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not globally deactivate an owned Player when changing one club profile", async () => {
    member = makeMember("account-other");
    expect((await patch({ isActive: false })).status).toBe(403);
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it("allows STAFF to update only the game group and propagates the Player ID", async () => {
    access("STAFF");
    expect((await patch({ preferredPool: "A" })).status).toBe(200);
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: "preserved-membership" }, data: { preferredPool: "A" } });
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
    member = makeMember(null, null);
    expect((await patch({ role: "ADMIN" })).status).toBe(400);
    expect(mocks.grantUpdate).not.toHaveBeenCalled();
  });

  it("assigns STAFF on ClubAccess while leaving ClubMember sporting settings unchanged", async () => {
    member = makeMember("account-other");
    expect((await patch({ role: "STAFF" })).status).toBe(200);
    expect(mocks.grantFind).toHaveBeenCalledWith({ where: { clubId_userId: { clubId: "club", userId: "account-other" } } });
    expect(mocks.grantUpdate).toHaveBeenCalledWith({ where: { id: "access-target" }, data: { role: "STAFF" } });
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
    expect(member.elo).toBe(1437);
  });

  it("blocks a regular admin from demoting another admin", async () => {
    member = makeMember("account-other");
    targetGrant.role = "ADMIN";
    expect((await patch({ role: "STAFF" })).status).toBe(403);
    expect(mocks.grantUpdate).not.toHaveBeenCalled();
  });

  it("lets the club owner demote another account's admin grant", async () => {
    member = makeMember("account-other");
    targetGrant.role = "ADMIN";
    access("OWNER", true);
    expect((await patch({ role: "STAFF" })).status).toBe(200);
    expect(targetGrant.role).toBe("STAFF");
  });

  it.each([actor, "account-owner"])("protects own and creator roles", async (owner) => {
    member = makeMember(owner);
    expect((await patch({ role: "MEMBER" })).status).toBe(400);
  });
});

describe("club profile removal preserves sporting history", () => {
  it("archives the existing ClubMember and revokes only its locally owned Account access", async () => {
    member = makeMember("account-other");
    const sportingFields = { elo: member.elo, status: member.status, preferredPool: member.preferredPool };
    expect((await remove()).status).toBe(200);
    expect(member).toMatchObject({ ownerUserId: null, ownershipRevision: 1, archivedAt: expect.any(Date), ...sportingFields });
    expect(targetGrant).toMatchObject({ status: "REVOKED", role: "MEMBER", revision: 1 });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.memberUpdateMany).not.toHaveBeenCalled();
    expect(mocks.grantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it("returns a conflict when the ownership guard rejects a profile in an unfinished session", async () => {
    member = makeMember("account-other");
    ownershipInsertError = "LOCAL_SESSION_PARTICIPATION_CONFLICT";
    expect((await remove()).status).toBe(409);
    expect(member).toMatchObject({ ownerUserId: "account-other", archivedAt: null, ownershipRevision: 0 });
    expect(targetGrant).toMatchObject({ status: "ACTIVE", revision: 0 });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
  });

  it("protects another admin and the club creator", async () => {
    member = makeMember("account-other");
    targetGrant.role = "ADMIN";
    otherAdminCount = 0;
    expect((await remove()).status).toBe(403);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    member = makeMember("account-owner");
    expect((await remove()).status).toBe(403);
  });

  it("allows removing an admin-owned profile when another active admin remains", async () => {
    member = makeMember(actor);
    otherAdminCount = 1;
    expect((await remove()).status).toBe(200);
    expect(mocks.grantCount).toHaveBeenCalledWith({
      where: {
        clubId: "club",
        userId: { not: actor },
        status: "ACTIVE",
        role: { in: ["ADMIN", "OWNER"] },
        user: { isActive: true },
      },
    });
  });

  it("blocks removal of the last admin-owned profile", async () => {
    member = makeMember(actor);
    otherAdminCount = 0;
    expect((await remove()).status).toBe(403);
    expect(member).toMatchObject({ ownerUserId: actor, archivedAt: null });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });
});
