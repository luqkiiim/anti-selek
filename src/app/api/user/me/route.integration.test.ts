import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient, type Client } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimClubPlayer, clubOwnershipTransaction, removeClubPlayerOwnership } from "@/lib/clubPlayerOwnership";

let db: PrismaClient;
let libsql: Client | undefined;
const mocks = vi.hoisted(() => ({ auth: vi.fn(), audit: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/errors", async original => ({ ...await original<typeof import("@/lib/errors")>(), logError: mocks.logError }));
import { PATCH } from "./route";

const dir = mkdtempSync(path.join(tmpdir(), "account-settings-route-"));
const baseline = path.join(dir, "baseline.db");
let index = 0;
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/user/me", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const transaction = <T>(fn: Parameters<typeof clubOwnershipTransaction<T>>[1]) => clubOwnershipTransaction(db, fn);

beforeAll(() => {
  const sqlite = new DatabaseSync(baseline, { enableDoubleQuotedStringLiterals: true });
  try {
    for (const migration of readdirSync("prisma/migrations").sort()) {
      if (migration !== "migration_lock.toml") sqlite.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
  } finally { sqlite.close(); }
});
afterEach(async () => { await db?.$disconnect(); libsql?.close(); libsql = undefined; });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

async function snapshot() {
  // Include complete rows, timestamps and once-only allowances, rather than only
  // the preference field whose rejected value may already equal its default.
  return {
    accounts: await db.user.findMany({ orderBy: { id: "asc" } }),
    players: await db.player.findMany({ orderBy: { id: "asc" } }),
    members: await db.clubMember.findMany({ orderBy: { id: "asc" } }),
    access: await db.clubAccess.findMany({ orderBy: { id: "asc" } }),
    events: await db.clubPlayerOwnershipEvent.findMany({ orderBy: { id: "asc" } }),
  };
}

describe.each(["sqlite", "libsql"] as const)("account settings with a real %s transaction", backend => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const file = path.join(dir, `${index++}.db`); copyFileSync(baseline, file);
    const url = `file:${file}`;
    if (backend === "libsql") {
      libsql = createClient({ url });
      await libsql.execute("PRAGMA foreign_keys=ON");
      db = new PrismaClient({ adapter: new PrismaLibSQL(libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]) });
    } else db = new PrismaClient({ datasources: { db: { url } } });
    await db.user.createMany({ data: ["admin", "owner", "viewer"].map(id => ({ id, name: id, email: `${id}@fixture.invalid`, passwordHash: "unused", gender: "MALE" })) });
    for (const clubId of ["target-club", "other-club"]) {
      await db.club.create({ data: { id: clubId, name: clubId, createdById: "admin" } });
      await db.clubAccess.create({ data: { clubId, userId: "admin", role: "OWNER" } });
    }
    for (const [id, clubId] of [["unowned-target", "target-club"], ["owned-target", "target-club"], ["viewer-player", "other-club"]]) {
      await db.player.create({ data: { id, name: id, gender: "MALE", elo: 1379 } });
      await db.clubMember.create({ data: { clubId, playerId: id, elo: 1289, preferredPool: "B", mixedSideOverride: "LOWER" } });
    }
    await transaction(tx => claimClubPlayer(tx, { clubId: "target-club", playerId: "owned-target", userId: "owner", actorUserId: "admin" }));
    await transaction(tx => claimClubPlayer(tx, { clubId: "other-club", playerId: "viewer-player", userId: "viewer", actorUserId: "admin" }));
    mocks.auth.mockResolvedValue({ user: { id: "viewer", isAdmin: true } });
  });

  it.each([
    { condition: "unowned existing roster profile", playerId: "unowned-target" },
    { condition: "another account's existing roster profile", playerId: "owned-target" },
    { condition: "revoked local access", playerId: "owned-target" },
    { condition: "archived retained ownership", playerId: "owned-target" },
    { condition: "wrong club for an owned player", playerId: "viewer-player" },
  ])("returns 403 for $condition and preserves every account, player, membership and allowance", async ({ condition, playerId }) => {
    let userId = "viewer";
    if (condition === "revoked local access") {
      userId = "owner";
      await db.clubAccess.update({ where: { clubId_userId: { clubId: "target-club", userId } }, data: { status: "REVOKED" } });
    }
    if (condition === "archived retained ownership") {
      userId = "owner";
      await transaction(tx => removeClubPlayerOwnership(tx, { clubId: "target-club", playerId, actorUserId: "admin" }));
    }
    mocks.auth.mockResolvedValue({ user: { id: userId, isAdmin: true } });
    const before = await snapshot();
    const clubPreferences = { clubId: "target-club", playerId, mixedSideOverride: null };
    for (const body of [{ clubPreferences }, { name: "Must not persist", gender: "FEMALE", clubPreferences }]) {
      const response = await patch(body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Active ownership of this exact club profile is required" });
      expect(await snapshot()).toEqual(before);
      expect(await db.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ selfNameChangedAt: null, selfGenderChangedAt: null });
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.logError).not.toHaveBeenCalled();
    }
  });

  it("commits an authorized preference default and then atomically consumes identity allowances once", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    const before = await snapshot();
    const clubPreferences = { clubId: "target-club", playerId: "owned-target", mixedSideOverride: null };
    const preferenceResponse = await patch({ clubPreferences });
    expect(preferenceResponse.status).toBe(200);
    expect(await preferenceResponse.json()).toMatchObject({ clubPreferences: { ...clubPreferences, partnerPreference: "OPEN" } });
    const afterPreference = await snapshot();
    expect(afterPreference.accounts).toEqual(before.accounts);
    expect(afterPreference.players).toEqual(before.players);
    expect(afterPreference.access).toEqual(before.access);
    expect(afterPreference.events).toEqual(before.events);
    expect(afterPreference.members.filter(member => member.playerId !== "owned-target")).toEqual(before.members.filter(member => member.playerId !== "owned-target"));
    expect(afterPreference.members.find(member => member.playerId === "owned-target")).toMatchObject({ mixedSideOverride: null });

    const combined = await patch({ name: "Canonical owner", gender: "FEMALE", clubPreferences: { ...clubPreferences, mixedSideOverride: "UPPER" } });
    expect(combined.status).toBe(200);
    expect(await combined.json()).toMatchObject({ user: { name: "Canonical owner", gender: "FEMALE", canRenameName: false, canChangeGender: false }, clubPreferences: { mixedSideOverride: "UPPER" } });
    expect(await db.player.findUniqueOrThrow({ where: { id: "owned-target" } })).toMatchObject({ name: "Canonical owner", gender: "FEMALE" });
    const committed = await snapshot();
    expect((await patch({ name: "Again", clubPreferences })).status).toBe(409);
    expect(await snapshot()).toEqual(committed);
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});
