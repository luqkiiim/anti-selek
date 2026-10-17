import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient, type Client } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rebuildQueue: vi.fn(), logError: vi.fn(), failResponseRead: false }));
let db: PrismaClient;
let libsql: Client | undefined;
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/app/api/sessions/[code]/queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: mocks.rebuildQueue }));
vi.mock("@/lib/errors", () => ({ logError: mocks.logError, safeErrorResponse: () => Response.json({ error: "Internal server error" }, { status: 500 }) }));
vi.mock("@/lib/clubRoster", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/clubRoster")>();
  return {
    ...actual,
    getClubRosterMember: async (...args: Parameters<typeof actual.getClubRosterMember>) => {
      if (mocks.failResponseRead) throw new Error("Injected response read failure");
      return actual.getClubRosterMember(...args);
    },
  };
});

import { POST } from "./route";
import { PATCH } from "./[userId]/route";
import { getClubRoster } from "@/lib/clubRoster";
import { claimClubPlayer, clubOwnershipTransaction } from "@/lib/clubPlayerOwnership";

// Every case uses a new, fully migrated disposable file. No runtime database
// module or environment credentials are loaded by these route tests.
const dir = mkdtempSync(path.join(tmpdir(), "club-member-transactions-"));
const baseline = path.join(dir, "baseline.db");
let caseIndex = 0;
beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  try {
    for (const migration of readdirSync("prisma/migrations").sort()) {
      if (migration === "migration_lock.toml") continue;
      sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
  } finally { sqlite.close(); }
});
afterAll(async () => { await db?.$disconnect(); libsql?.close(); rmSync(dir, { recursive: true, force: true }); });

function create(body: unknown) {
  return POST(new Request("http://localhost/api/clubs/club-1/members", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "club-1" }) });
}
function edit(body: unknown) {
  return PATCH(new Request("http://localhost/api/clubs/club-1/members/player-1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "club-1", userId: "player-1" }) });
}
async function snapshot() {
  return {
    players: await db.player.findMany({ orderBy: { id: "asc" } }),
    members: await db.clubMember.findMany({ orderBy: { id: "asc" } }),
    seats: await db.sessionPlayer.findMany({ orderBy: { id: "asc" } }),
    queues: await db.queuedMatch.findMany({ orderBy: { id: "asc" } }),
    access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }),
    audits: await db.clubRatingAdjustment.findMany({ orderBy: { id: "asc" } }),
  };
}
async function sessionFixture(id: string, protection: "automatic" | "manual" | "playing" | "completed") {
  await db.session.create({ data: { id, code: id.toUpperCase(), name: id, clubId: "club-1", poolsEnabled: true, autoQueueEnabled: protection === "automatic", status: protection === "completed" ? "COMPLETED" : "ACTIVE", ratingPolicyVersion: 2 } });
  await db.sessionPlayer.create({ data: { id: `${id}-seat`, sessionId: id, playerId: "player-1", profileClubId: "club-1", pool: "B" } });
  const teams = { team1Player1Id: "player-1", team1Player2Id: "player-2", team2Player1Id: "player-3", team2Player2Id: "player-4" };
  if (protection === "automatic" || protection === "manual") {
    await db.queuedMatch.create({ data: { id: `${id}-queue`, sessionId: id, ...teams, isAutomatic: protection === "automatic" } });
  } else if (protection === "playing") {
    await db.court.create({ data: { id: `${id}-court`, sessionId: id, courtNumber: 1 } });
    const match = await db.match.create({ data: { id: `${id}-match`, sessionId: id, courtId: `${id}-court`, ...teams, status: "IN_PROGRESS" } });
    await db.court.update({ where: { id: `${id}-court` }, data: { currentMatchId: match.id } });
  }
}
async function seedSessions() {
  await sessionFixture("idle-auto", "automatic");
  await sessionFixture("live", "playing");
  await sessionFixture("manual", "manual");
  await sessionFixture("finished", "completed");
}

describe.each(["sqlite", "file-libsql"] as const)("club member atomic writes on %s", mode => {
  beforeEach(async () => {
    await db?.$disconnect(); libsql?.close(); libsql = undefined;
    const file = path.join(dir, `${caseIndex++}.db`); copyFileSync(baseline, file);
    const url = `file:${file}`;
    if (mode === "file-libsql") {
      libsql = createClient({ url });
      await libsql.execute("PRAGMA foreign_keys=ON");
      const adapter = new PrismaLibSQL(libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]);
      db = new PrismaClient({ adapter });
    } else db = new PrismaClient({ datasources: { db: { url } } });
    vi.resetAllMocks(); mocks.failResponseRead = false;
    mocks.auth.mockResolvedValue({ user: { id: "admin", name: "Club Owner" } });
    await db.user.createMany({ data: [
      { id: "admin", name: "Club Owner", email: "admin@fixture.invalid", passwordHash: "unused" },
      { id: "account", name: "Account Owner", email: "owner@fixture.invalid", passwordHash: "unused" },
    ] });
    await db.club.create({ data: { id: "club-1", name: "Club", createdById: "admin" } });
    await db.clubAccess.create({ data: { clubId: "club-1", userId: "admin", role: "OWNER" } });
    await db.player.createMany({ data: ["player-1", "player-2", "player-3", "player-4"].map(id => ({ id, name: id, gender: "MALE" })) });
    await db.clubMember.create({ data: { id: "member-1", clubId: "club-1", playerId: "player-1", elo: 1432, preferredPool: "B" } });
  });

  it("creates the member and initial-rating audit together with the full roster response", async () => {
    const response = await create({ name: "New Player", gender: "FEMALE", mixedSideOverride: "UPPER", initialRating: 0, status: "OCCASIONAL", preferredPool: "A" });
    expect(response.status).toBe(201);
    const member = await response.json();
    expect(member).toMatchObject({ name: "New Player", gender: "FEMALE", elo: 0, status: "OCCASIONAL", preferredPool: "A", mixedSideOverride: "UPPER", role: "MEMBER", isClaimed: false, ownerUserId: null });
    const listed = (await getClubRoster(db, "club-1")).find(player => player.id === member.id);
    expect(member).toEqual(JSON.parse(JSON.stringify(listed)));
    expect(await db.clubRatingAdjustment.findMany()).toEqual([expect.objectContaining({ memberId: member.clubMemberId, actorId: "admin", actorName: "Club Owner", beforeElo: 1000, afterElo: 0, reason: "Initial rating" })]);
    expect(await db.player.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ elo: 1000, ownerUserId: null });
    expect(await db.user.count()).toBe(2);
    expect(await db.clubAccess.count()).toBe(1);
  });

  it("defaults the rating to 1000 without creating a rating audit", async () => {
    const response = await create({ name: "New Player", gender: "MALE" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ elo: 1000 });
    expect(await db.clubRatingAdjustment.count()).toBe(0);
  });

  it.each(["membership", "rating audit", "member response"])("rolls back all creation rows if %s fails", async stage => {
    const before = await snapshot();
    if (stage === "membership") await db.$executeRawUnsafe('CREATE TRIGGER "test_fail_member" BEFORE INSERT ON "CommunityMember" BEGIN SELECT RAISE(ABORT,\'TEST_MEMBER_FAILURE\'); END');
    if (stage === "rating audit") await db.$executeRawUnsafe('CREATE TRIGGER "test_fail_rating" BEFORE INSERT ON "ClubRatingAdjustment" BEGIN SELECT RAISE(ABORT,\'TEST_RATING_FAILURE\'); END');
    if (stage === "member response") mocks.failResponseRead = true;
    const response = await create({ name: "Must Roll Back", gender: "MALE", initialRating: 5000 });
    expect(response.status).toBe(500);
    expect(await snapshot()).toEqual(before);
  });

  it("commits the roster group and seats while retaining manual queues and live-match groups", async () => {
    await seedSessions();
    const before = await snapshot();
    const response = await edit({ preferredPool: "A" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "player-1", elo: 1432, preferredPool: "A", preferencePropagation: { immediateSessionCount: 1, deferredSessionCount: 2, automaticQueueSessionIds: ["idle-auto"] } });
    expect(await db.sessionPlayer.findUniqueOrThrow({ where: { id: "idle-auto-seat" } })).toMatchObject({ pool: "A", pendingPool: null });
    for (const id of ["live-seat", "manual-seat"]) expect(await db.sessionPlayer.findUniqueOrThrow({ where: { id } })).toMatchObject({ pool: "B", pendingPool: "A" });
    expect(await db.sessionPlayer.findUniqueOrThrow({ where: { id: "finished-seat" } })).toMatchObject({ pool: "B", pendingPool: null });
    expect(await db.queuedMatch.findUnique({ where: { id: "idle-auto-queue" } })).toBeNull();
    expect(await db.queuedMatch.findUniqueOrThrow({ where: { id: "manual-queue" } })).toEqual(before.queues.find(queue => queue.id === "manual-queue"));
    expect(mocks.rebuildQueue).toHaveBeenCalledWith("idle-auto");
    expect((await snapshot()).players).toEqual(before.players);
    expect((await snapshot()).access).toEqual(before.access);
  });

  it.each(["seat update", "queue invalidation", "member response"])("rolls back member, profile, seats, and queues when %s fails", async stage => {
    await seedSessions();
    const before = await snapshot();
    if (stage === "seat update") await db.$executeRawUnsafe('CREATE TRIGGER "test_fail_seat" BEFORE UPDATE OF "pool", "pendingPool" ON "SessionPlayer" WHEN OLD."id"=\'live-seat\' BEGIN SELECT RAISE(ABORT,\'TEST_SEAT_FAILURE\'); END');
    if (stage === "queue invalidation") await db.$executeRawUnsafe('CREATE TRIGGER "test_fail_queue_delete" BEFORE DELETE ON "QueuedMatch" BEGIN SELECT RAISE(ABORT,\'TEST_QUEUE_FAILURE\'); END');
    if (stage === "member response") mocks.failResponseRead = true;
    expect((await edit({ name: "Must Roll Back", status: "OCCASIONAL", preferredPool: "A" })).status).toBe(500);
    expect(await snapshot()).toEqual(before);
    expect(mocks.rebuildQueue).not.toHaveBeenCalled();
  });

  it("returns success and a safe warning after a committed edit if queue rebuilding fails", async () => {
    await seedSessions();
    mocks.rebuildQueue.mockImplementation(async () => {
      expect(await db.clubMember.findUniqueOrThrow({ where: { id: "member-1" } })).toMatchObject({ preferredPool: "A" });
      throw new Error("Injected adapter secret connection error");
    });
    const response = await edit({ preferredPool: "A" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preferredPool: "A", warnings: [{ code: "QUEUE_REBUILD_FAILED", message: "Player saved. The automatic queue could not be refreshed." }] });
    expect(await db.sessionPlayer.findUniqueOrThrow({ where: { id: "idle-auto-seat" } })).toMatchObject({ pool: "A" });
    expect(mocks.logError).toHaveBeenCalledWith("Rebuild automatic queue after club Player update", { code: "QUEUE_REBUILD_FAILED", clubId: "club-1", playerId: "player-1", sessionId: "idle-auto" });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("adapter secret");
  });

  it("serializes the new registered permission from the same role-update transaction", async () => {
    await clubOwnershipTransaction(db, tx => claimClubPlayer(tx, { clubId: "club-1", playerId: "player-1", userId: "account", actorUserId: "admin" }));
    const response = await edit({ role: "STAFF" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: "STAFF", isClaimed: true, ownerUserId: "account", isOwner: false });
    expect(await db.clubAccess.findUniqueOrThrow({ where: { clubId_userId: { clubId: "club-1", userId: "account" } } })).toMatchObject({ role: "STAFF" });
  });
});
