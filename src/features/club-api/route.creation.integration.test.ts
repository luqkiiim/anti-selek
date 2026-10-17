import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient, type Client } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getClubRoster } from "@/lib/clubRoster";
import { claimClubPlayer, clubOwnershipTransaction, removeClubPlayerOwnership } from "@/lib/clubPlayerOwnership";
import { repairSbcCreator } from "../../../scripts/repair-sbc-creator";

let db: PrismaClient;
let libsql: Client | undefined;
const directory = mkdtempSync(path.join(tmpdir(), "club-creation-"));
const baseline = path.join(directory, "baseline.db");
let fixtureIndex = 0;
const sbcId = "cmvbwqrqw000gr3krwbaad7pl";

async function seedSbc() {
  await db.user.update({ where: { id: "creator" }, data: { name: "Luqman" } });
  await db.club.create({ data: {
    id: sbcId, name: "SBC", createdById: "creator",
    accountAccess: { create: { userId: "creator", role: "OWNER" } },
  } });
  for (let index = 0; index < 11; index++) {
    const player = await db.player.create({ data: { name: `Existing ${index}`, gender: "MALE" } });
    await db.clubMember.create({ data: { clubId: sbcId, playerId: player.id, elo: 1100 + index, preferredPool: "A", needsMoreRest: true } });
  }
}

async function repairState() {
  return {
    accounts: await db.user.findMany({ orderBy: { id: "asc" } }),
    clubs: await db.club.findMany({ orderBy: { id: "asc" } }),
    players: await db.player.findMany({ orderBy: { id: "asc" } }),
    members: await db.clubMember.findMany({ orderBy: { id: "asc" } }),
    access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }),
    claims: await db.clubPlayerOwnershipEvent.findMany({ orderBy: { id: "asc" } }),
  };
}

vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({
  // Session metadata can be stale; the new profile must use the Account row.
  auth: async () => ({ user: { id: "creator", name: "Old Name", gender: "MALE" } }),
}));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
import { GET, POST } from "./route";

function createClub(name = "New Club") {
  return POST(new Request("http://localhost/api/clubs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clubName: name }),
  }));
}

beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  try {
    for (const migration of readdirSync("prisma/migrations").filter(name => !name.includes(".")).sort()) {
      sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
  } finally { sqlite.close(); }
});
afterAll(async () => {
  await db?.$disconnect();
  libsql?.close();
  rmSync(directory, { recursive: true, force: true });
});

describe.each(["sqlite", "libsql"] as const)("club creator profile (%s)", provider => {
  beforeEach(async () => {
    await db?.$disconnect();
    libsql?.close();
    libsql = undefined;
    const file = path.join(directory, `${fixtureIndex++}.db`);
    copyFileSync(baseline, file);
    const url = `file:${file}`;
    if (provider === "libsql") {
      libsql = createClient({ url });
      db = new PrismaClient({ adapter: new PrismaLibSQL(libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) });
    } else {
      db = new PrismaClient({ datasources: { db: { url } } });
    }
    await db.user.create({ data: {
      id: "creator", email: "creator@fixture.invalid", passwordHash: "unused",
      name: "Current Account", avatarKey: "current-photo", gender: "FEMALE",
    } });
  });

  it("creates an owned player visible in the roster and preserves OWNER access", async () => {
    const response = await createClub();
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ role: "ADMIN", viewerIsOwner: true, clubId: body.id, communityId: body.id });
    const roster = await getClubRoster(db, body.id);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({
      name: "Current Account", gender: "FEMALE", ownerUserId: "creator",
      isClaimed: true, isOwner: true, status: "CORE", elo: 1000, preferredPool: "B",
    });
    const member = await db.clubMember.findFirstOrThrow({ where: { clubId: body.id }, include: { player: true } });
    expect(member).toMatchObject({ ownerUserId: "creator", ownershipRevision: 1, archivedAt: null });
    expect(member.player).toMatchObject({ avatarKey: "current-photo", ownerUserId: null });
    expect(await db.clubAccess.findFirstOrThrow()).toMatchObject({ userId: "creator", role: "OWNER", status: "ACTIVE", revision: 0 });
    expect(await db.clubPlayerOwnershipEvent.findFirstOrThrow()).toMatchObject({
      action: "CLAIM", clubId: body.id, playerId: member.playerId,
      previousOwnerUserId: null, newOwnerUserId: "creator", actorUserId: "creator",
      previousAccessRole: "OWNER", newAccessRole: "OWNER",
    });
    const listing = await GET(new Request("http://localhost/api/clubs"));
    expect(await listing.json()).toEqual([expect.objectContaining({ id: body.id, membersCount: 1 })]);
  });

  it("starts another club with an independent local profile and preserves existing ratings and preferences", async () => {
    const firstResponse = await createClub("First Club");
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json();
    const member = await db.clubMember.findFirstOrThrow({ where: { clubId: first.id } });
    await db.clubMember.update({ where: { id: member.id }, data: { elo: 1475, preferredPool: "A", mixedSideOverride: "UPPER", needsMoreRest: true } });
    const before = await db.clubMember.findUniqueOrThrow({ where: { id: member.id }, include: { player: true } });
    const secondResponse = await createClub("Second Club");
    expect(secondResponse.status).toBe(201);
    const second = await secondResponse.json();
    const secondMember = await db.clubMember.findFirstOrThrow({ where: { clubId: second.id }, include: { player: true } });
    expect(secondMember).toMatchObject({ ownerUserId: "creator", elo: 1000, preferredPool: "B", mixedSideOverride: null, needsMoreRest: false });
    expect(secondMember.playerId).not.toBe(member.playerId);
    expect(secondMember.player).toMatchObject({ name: "Current Account", gender: "FEMALE", avatarKey: "current-photo", ownerUserId: null });
    expect(await db.clubMember.findUniqueOrThrow({ where: { id: member.id }, include: { player: true } })).toEqual(before);
  });

  it("rolls back the club, access and player together when the ownership audit fails", async () => {
    await db.$executeRawUnsafe(`CREATE TRIGGER fixture_reject_creator_claim BEFORE INSERT ON "ClubPlayerOwnershipEvent" BEGIN SELECT RAISE(ABORT, 'FIXTURE_CLAIM_FAILURE'); END`);
    const account = await db.user.findUniqueOrThrow({ where: { id: "creator" } });
    const response = await createClub();
    expect(response.status).toBe(500);
    expect(await db.club.count()).toBe(0);
    expect(await db.clubAccess.count()).toBe(0);
    expect(await db.player.count()).toBe(0);
    expect(await db.clubMember.count()).toBe(0);
    expect(await db.clubPlayerOwnershipEvent.count()).toBe(0);
    expect(await db.user.findUniqueOrThrow({ where: { id: "creator" } })).toEqual(account);
  });

  it("repairs only SBC's missing creator, preserves its 11 players and access, and safely rejects repetition", async () => {
    await seedSbc();
    const before = await repairState();
    const receipt = await repairSbcCreator(db);
    const after = await repairState();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.clubs).toEqual(before.clubs);
    expect(after.access).toEqual(before.access);
    expect(after.players.filter(player => player.id !== receipt.playerId)).toEqual(before.players);
    expect(after.members.filter(member => member.id !== receipt.clubMemberId)).toEqual(before.members);
    expect(after.claims).toHaveLength(1);
    expect(after.claims[0]).toMatchObject({ id: receipt.eventId, action: "CLAIM", clubId: sbcId, newOwnerUserId: "creator", actorUserId: "creator" });
    expect(after.players.find(player => player.id === receipt.playerId)).toMatchObject({ name: "Luqman", gender: "FEMALE", avatarKey: "current-photo", ownerUserId: null });
    expect(await getClubRoster(db, sbcId)).toEqual([
      ...before.members.map(member => expect.objectContaining({ id: member.playerId, ownerUserId: null, elo: member.elo })),
      expect.objectContaining({ id: receipt.playerId, ownerUserId: "creator", name: "Luqman", isOwner: true, isClaimed: true, elo: 1000 }),
    ]);
    await expect(repairSbcCreator(db)).rejects.toThrow("already owns");
    expect(await repairState()).toEqual(after);
  });

  it.each(["wrong-club-name", "inactive-creator", "wrong-creator-name", "member-access", "revoked-access", "matching-archived-profile", "pending-admission", "prior-claim"])("rejects SBC repair for %s without modifying data", async condition => {
    await seedSbc();
    if (condition === "wrong-club-name") await db.club.update({ where: { id: sbcId }, data: { name: "Other Club" } });
    if (condition === "inactive-creator") await db.user.update({ where: { id: "creator" }, data: { isActive: false } });
    if (condition === "wrong-creator-name") await db.user.update({ where: { id: "creator" }, data: { name: "Another Person" } });
    if (condition === "member-access" || condition === "revoked-access") {
      await db.clubAccess.update({ where: { clubId_userId: { clubId: sbcId, userId: "creator" } }, data: condition === "member-access" ? { role: "MEMBER" } : { status: "REVOKED" } });
    }
    if (condition === "matching-archived-profile") {
      const member = await db.clubMember.findFirstOrThrow({ where: { clubId: sbcId } });
      await db.player.update({ where: { id: member.playerId }, data: { name: "  Lúq-man  " } });
      await clubOwnershipTransaction(db, tx => removeClubPlayerOwnership(tx, { clubId: sbcId, playerId: member.playerId, actorUserId: "creator" }));
    }
    if (condition === "pending-admission") await db.clubAdmissionRequest.create({ data: { clubId: sbcId, requesterUserId: "creator", kind: "NEW_PLAYER" } });
    if (condition === "prior-claim") {
      await db.user.create({ data: { id: "other", name: "Other", email: "other@fixture.invalid", passwordHash: "unused" } });
      const member = await db.clubMember.findFirstOrThrow({ where: { clubId: sbcId } });
      await clubOwnershipTransaction(db, tx => claimClubPlayer(tx, { clubId: sbcId, playerId: member.playerId, userId: "other", actorUserId: "creator" }));
    }
    const before = await repairState();
    await expect(repairSbcCreator(db)).rejects.toThrow("SBC repair stopped");
    expect(await repairState()).toEqual(before);
  });

  it("rolls back SBC's new player and membership if its audited claim fails", async () => {
    await seedSbc();
    await db.$executeRawUnsafe(`CREATE TRIGGER fixture_reject_sbc_claim BEFORE INSERT ON "ClubPlayerOwnershipEvent" BEGIN SELECT RAISE(ABORT, 'FIXTURE_CLAIM_FAILURE'); END`);
    const before = await repairState();
    await expect(repairSbcCreator(db)).rejects.toThrow();
    expect(await repairState()).toEqual(before);
  });

  it("rejects an inactive account without creating a club or profile", async () => {
    await db.user.update({ where: { id: "creator" }, data: { isActive: false } });
    const response = await createClub();
    expect(response.status).toBe(403);
    expect(await db.club.count()).toBe(0);
    expect(await db.player.count()).toBe(0);
  });
});
