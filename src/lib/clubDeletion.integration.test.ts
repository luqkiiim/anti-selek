import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient, type Client } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrateFixture } from "./clubOwnership.integration.fixture";
import { deleteUnusedClub } from "./clubDeletion";
import { admissionTransaction, submitClubAdmission } from "./clubAdmissions";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
let db: PrismaClient;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: async () => null,
  checkInvalidTargetRateLimit: async () => null,
  invalidTargetResponse: () => Response.json({ error: "Invalid target" }, { status: 404 }),
}));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
import { GET as listClubs, POST } from "@/features/club-api/route";
import { DELETE } from "@/features/club-api/[id]/route";

const migration = "20261021120000_delete_unused_clubs";
const dir = mkdtempSync(path.join(tmpdir(), "unused-club-deletion-"));
const baseline = path.join(dir, "baseline.db");
let sequence = 0;
const ownerSession = { user: { id: "owner", email: "owner@test.invalid", isAdmin: false } };

beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  try { migrateFixture(sqlite, migration); } finally { sqlite.close(); }
});
afterAll(() => {
  // libSQL's native handles can outlive close() on Windows; this test uses only
  // OS temporary storage and never touches the application's database.
  if (process.platform !== "win32") rmSync(dir, { recursive: true, force: true });
});

async function createClub(name = "Disposable Club") {
  const response = await POST(new Request("http://localhost/api/clubs", {
    method: "POST", body: JSON.stringify({ clubName: name, allowJoinRequests: true }),
  }));
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body as { id: string; name: string };
}
function requestDelete(id: string, confirmation = "DELETE") {
  return DELETE(new Request(`http://localhost/api/clubs/${id}`, {
    method: "DELETE", body: JSON.stringify({ confirmation }),
  }), { params: Promise.resolve({ id }) });
}
async function snapshot() {
  return {
    accounts: await db.user.findMany({ orderBy: { id: "asc" } }),
    clubs: await db.club.findMany({ orderBy: { id: "asc" } }),
    members: await db.clubMember.findMany({ orderBy: { id: "asc" } }),
    players: await db.player.findMany({ orderBy: { id: "asc" } }),
    access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }),
    events: await db.clubPlayerOwnershipEvent.findMany({ orderBy: { id: "asc" } }),
    receipts: await db.clubDeletionReceipt.findMany({ orderBy: { clubId: "asc" } }),
  };
}

describe.each(["sqlite", "libsql"] as const)("unused club deletion (%s)", provider => {
  let client: Client | undefined;
  let otherClub: { id: string; name: string };
  beforeEach(async () => {
    await db?.$disconnect(); client?.close(); client = undefined;
    const file = path.join(dir, `case-${sequence++}.db`);
    copyFileSync(baseline, file);
    const url = `file:${file.replaceAll("\\", "/")}`;
    if (provider === "libsql") {
      client = createClient({ url });
      const adapter = new PrismaLibSQL(client as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
      db = new PrismaClient({ adapter });
    } else db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.createMany({ data: [
      { id: "owner", name: "Owner", email: "owner@test.invalid", passwordHash: "owner-password-hash", gender: "FEMALE" },
      { id: "stranger", name: "Stranger", email: "stranger@test.invalid", passwordHash: "stranger-password-hash", gender: "MALE" },
    ] });
    mocks.auth.mockResolvedValue(ownerSession);
    otherClub = await createClub("Keep This Club");
  });
  afterAll(async () => { await db?.$disconnect(); client?.close(); });

  it("creates and permanently deletes a club, preserves other data, and reuses its name", async () => {
    const before = await snapshot();
    const club = await createClub();
    const member = await db.clubMember.findFirstOrThrow({ where: { clubId: club.id } });
    const [setup] = await db.$queryRaw<Array<{ setupEventJson: string }>>`SELECT "setupEventJson" FROM "UnusedClubDeletionSetup" WHERE "clubId"=${club.id}`;
    const response = await requestDelete(club.id);
    expect(response.status, await response.text()).toBe(200);
    const after = await snapshot();
    expect({ ...after, receipts: [] }).toEqual(before);
    expect(await db.player.findUnique({ where: { id: member.playerId } })).toBeNull();
    expect(after.receipts).toHaveLength(1);
    expect(after.receipts[0]).toMatchObject({ clubId: club.id, clubName: club.name, actorUserId: "owner", playerId: member.playerId, setupEventJson: setup.setupEventJson });
    const listed = await (await listClubs(new Request("http://localhost/api/clubs"))).json();
    expect(listed.map((item: { id: string }) => item.id)).toEqual([otherClub.id]);
    const recreated = await createClub();
    expect(recreated.id).not.toBe(club.id);
    expect(recreated.name).toBe(club.name);
    await expect(db.session.create({ data: { name: "Stale session", code: "STALE", clubId: club.id } })).rejects.toThrow();
    await expect(db.clubAccess.create({ data: { clubId: club.id, userId: "owner" } })).rejects.toThrow();
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  });

  it("handles retries without allowing strangers to inspect or delete the club", async () => {
    const club = await createClub();
    const before = await snapshot();
    mocks.auth.mockResolvedValue({ user: { id: "stranger", isAdmin: false } });
    expect((await requestDelete(club.id)).status).toBe(404);
    expect(await snapshot()).toEqual(before);
    mocks.auth.mockResolvedValue(ownerSession);
    expect((await requestDelete(club.id, "wrong")).status).toBe(400);
    expect((await requestDelete(club.id)).status).toBe(200);
    expect((await requestDelete(club.id)).status).toBe(200);
    expect(await db.clubDeletionReceipt.count()).toBe(1);
    mocks.auth.mockResolvedValue({ user: { id: "stranger", isAdmin: false } });
    expect((await requestDelete(club.id)).status).toBe(404);
    mocks.auth.mockResolvedValue({ user: { id: "owner", isAdmin: false, isQuickAccess: true } });
    expect((await requestDelete(club.id)).status).toBe(403);
    mocks.auth.mockResolvedValue(null);
    expect((await requestDelete(club.id)).status).toBe(401);
  });

  it("preserves the existing global-admin deletion capability", async () => {
    const club = await createClub();
    mocks.auth.mockResolvedValue({ user: { id: "stranger", isAdmin: true } });
    expect((await requestDelete(club.id)).status).toBe(200);
    expect(await db.clubDeletionReceipt.findUnique({ where: { clubId: club.id } })).toMatchObject({ actorUserId: "stranger", creatorUserId: "owner" });
  });

  it.each(["hosted", "test", "shared"])("retains %s sessions and their club", async kind => {
    const club = await createClub();
    const session = await db.session.create({ data: { name: "Existing session", code: "HISTORY", clubId: kind === "shared" ? otherClub.id : club.id, isTest: kind === "test" } });
    if (kind === "shared") await db.sessionClub.create({ data: { sessionId: session.id, clubId: club.id, status: "PENDING" } });
    const before = await snapshot();
    await expect(db.$executeRaw`INSERT INTO "ClubDeletionReceipt" ("clubId","clubName","creatorUserId","actorUserId","clubMemberId","playerId","setupEventId","setupEventJson")
      SELECT "clubId","clubName","creatorUserId",'owner',"clubMemberId","playerId","setupEventId","setupEventJson" FROM "UnusedClubDeletionSetup" WHERE "clubId"=${club.id}`).rejects.toThrow();
    const response = await requestDelete(club.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("sessions") });
    expect(await snapshot()).toEqual(before);
    expect(await db.session.findUnique({ where: { id: session.id } })).not.toBeNull();
  });

  it.each(["other player", "rating adjustment", "shared profile", "access change"])("retains a club with %s", async kind => {
    const club = await createClub();
    const member = await db.clubMember.findFirstOrThrow({ where: { clubId: club.id } });
    if (kind === "other player") {
      const player = await db.player.create({ data: { name: "Guest" } });
      await db.clubMember.create({ data: { clubId: club.id, playerId: player.id } });
    } else if (kind === "rating adjustment") {
      await db.clubRatingAdjustment.create({ data: { memberId: member.id, actorId: "owner", actorName: "Owner", beforeElo: 1000, afterElo: 1200, reason: "Recorded adjustment" } });
    } else if (kind === "shared profile") {
      await db.clubMember.create({ data: { clubId: otherClub.id, playerId: member.playerId } });
    } else {
      await db.clubAccess.update({ where: { clubId_userId: { clubId: club.id, userId: "owner" } }, data: { role: "ADMIN" } });
    }
    const before = await snapshot();
    expect((await requestDelete(club.id)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });

  it("keeps setup history immutable unless the complete deletion is authorized", async () => {
    const club = await createClub();
    const member = await db.clubMember.findFirstOrThrow({ where: { clubId: club.id } });
    const before = await snapshot();
    await expect(db.clubPlayerOwnershipEvent.deleteMany({ where: { clubId: club.id } })).rejects.toThrow();
    await expect(db.clubMember.delete({ where: { id: member.id } })).rejects.toThrow();
    await expect(db.club.delete({ where: { id: club.id } })).rejects.toThrow();
    await expect(db.$executeRaw`INSERT INTO "ClubDeletionReceipt" ("clubId","clubName","creatorUserId","actorUserId") VALUES (${club.id},${club.name},'owner','owner')`).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect((await requestDelete(club.id)).status).toBe(200);
    await expect(db.clubDeletionReceipt.deleteMany()).rejects.toThrow();
    await expect(db.clubDeletionReceipt.update({ where: { clubId: club.id }, data: { clubName: "Changed" } })).rejects.toThrow();
    await expect(db.club.create({ data: { id: club.id, name: club.name, createdById: "owner" } })).rejects.toThrow();
    await expect(db.player.create({ data: { id: member.playerId, name: "Reused" } })).rejects.toThrow();
  });

  it("rolls back every deletion and its receipt if final profile cleanup fails", async () => {
    const club = await createClub();
    const before = await snapshot();
    await db.$executeRawUnsafe(`CREATE TRIGGER fixture_cleanup_failure BEFORE DELETE ON "User" BEGIN SELECT RAISE(ABORT,'FIXTURE_CLEANUP_FAILURE'); END`);
    await expect(deleteUnusedClub(db, { clubId: club.id, actorUserId: "owner", isGlobalAdmin: false })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it.each(["session", "join"])("cannot delete a club and concurrently commit a %s for it", async kind => {
    const club = await createClub();
    const results = await Promise.allSettled([
      deleteUnusedClub(db, { clubId: club.id, actorUserId: "owner", isGlobalAdmin: false }),
      kind === "session"
        ? db.session.create({ data: { name: "Concurrent session", code: "RACE", clubId: club.id } })
        : admissionTransaction(db, tx => submitClubAdmission(tx, { clubId: club.id, requesterUserId: "stranger", kind: "NEW_PLAYER" })),
    ]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    const remains = await db.club.findUnique({ where: { id: club.id } });
    const session = await db.session.findUnique({ where: { code: "RACE" } });
    const admissions = await db.clubAdmissionRequest.count({ where: { clubId: club.id } });
    if (!remains) { expect(session).toBeNull(); expect(admissions).toBe(0); expect(results[0].status).toBe("fulfilled"); }
    else { expect(await db.clubDeletionReceipt.count()).toBe(0); expect(results[1].status).toBe("fulfilled"); }
    expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
  }, 20000);
});

it("installs the migration without changing any existing row or column value", () => {
  const sqlite = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  try {
    const predecessor = readdirSync("prisma/migrations").filter(name => name < migration && /^\d{14}_/.test(name)).sort().at(-1)!;
    migrateFixture(sqlite, predecessor);
    sqlite.exec(`INSERT INTO Account(id,name,email,passwordHash,createdAt,updatedAt) VALUES ('a','Preserved','preserved@test.invalid','preserved-password',1,2);
      INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('c','Preserved Club','a',3,4);
      INSERT INTO User(id,name,elo,createdAt,updatedAt) VALUES ('p','Preserved Player',1432,5,6);
      INSERT INTO CommunityMember(id,communityId,userId,elo,createdAt) VALUES ('m','c','p',1432,7);
      INSERT INTO ClubAccess(id,clubId,userId,role,status,createdAt,updatedAt) VALUES ('x','c','a','OWNER','ACTIVE',7,7);
      INSERT INTO ClubPlayerOwnershipEvent(id,clubId,clubMemberId,playerId,actorUserId,action,previousOwnerUserId,newOwnerUserId,
        previousOwnershipRevision,newOwnershipRevision,accessId,previousAccessRevision,newAccessRevision,previousAccessStatus,newAccessStatus,
        previousAccessRole,newAccessRole,metadataBeforeJson,metadataAfterJson,detailsJson,reason,createdAt)
      VALUES ('e','c','m','p','a','CLAIM',NULL,'a',0,1,'x',0,0,'ACTIVE','ACTIVE','OWNER','OWNER',
        '{"name":"Preserved Player","avatarKey":null}','{"name":"Preserved","avatarKey":null}',
        '{"previousArchivedAt":null,"newArchivedAt":null}','Preserved initial claim',8);`);
    const tables = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name));
    const before = tables.map(table => ({ table, rows: sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() }));
    sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    for (const { table, rows } of before) expect(sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(), table).toEqual(rows);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
  } finally { sqlite.close(); }
});
