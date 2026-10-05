import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi, type MockedFunction } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ACCOUNT_PLAYER_MIGRATION, LEGACY_CREATOR_ACCESS_MIGRATION, managedMigrationSql } from "../../../../scripts/account-player-preservation.mjs";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(() => Response.json({ error: "Invalid target" }, { status: 404 })),
}));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type DeleteHandler = typeof import("./route")["DELETE"];
const databaseFile = path.resolve(process.cwd(), "prisma", `club-delete-${randomUUID()}.db`);
const databaseUrl = `file:${databaseFile.replace(/\\/g, "/")}`;
const env = process.env as Record<string, string | undefined>;
const previousEnv = {
  DATABASE_URL: env.DATABASE_URL,
  TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
  NODE_ENV: env.NODE_ENV,
};
let prisma: PrismaInstance;
let DELETE: DeleteHandler;
let mockedAuth: MockedFunction<typeof import("@/lib/auth")["auth"]>;

async function removeDatabaseFiles() {
  await Promise.all(["", "-journal", "-shm", "-wal"].map((suffix) => fs.promises.rm(`${databaseFile}${suffix}`, { force: true })));
}

function createMigratedLegacyFixture() {
  const db = new DatabaseSync(databaseFile);
  try {
    db.exec(fs.readFileSync(path.resolve("src/lib/test-fixtures/account-player-legacy.sql"), "utf8"));
    db.exec(`
      INSERT INTO "User" ("id","email","passwordHash","name","isClaimed","createdAt","updatedAt")
      VALUES
        ('account-a','owner@example.invalid','account-hash-a','Club Owner',1,1700000011111,1700000022222),
        ('account-b','requester@example.invalid','account-hash-b','Requester',1,1700000033333,1700000044444),
        ('historical-player-789',NULL,NULL,'Historical Player',0,1700000055555,1700000066666);
      INSERT INTO "Community" ("id","name","createdById","createdAt","updatedAt")
      VALUES
        ('club-with-admission-history','Protected Club','account-a',1700000077777,1700000088888),
        ('club-without-admission-history','Clean Club','account-a',1700000099999,1700000101111);
      INSERT INTO "ClubJoinRequest" ("id","clubId","userId","status","createdAt")
      VALUES ('legacy-join','club-with-admission-history','account-b','PENDING',1700000111111);
      INSERT INTO "ClaimRequest" ("id","communityId","requesterUserId","targetUserId","status","note","createdAt","updatedAt")
      VALUES ('legacy-claim','club-with-admission-history','account-a','historical-player-789','PENDING','Verify identity',1700000121111,1700000131111);
    `);

    const migrationRoot = path.resolve("prisma/migrations");
    const firstMigration = fs.readFileSync(path.join(migrationRoot, ACCOUNT_PLAYER_MIGRATION, "migration.sql"), "utf8");
    const creatorMigration = fs.readFileSync(path.join(migrationRoot, LEGACY_CREATOR_ACCESS_MIGRATION, "migration.sql"), "utf8");
    db.exec(managedMigrationSql(firstMigration));
    db.exec(creatorMigration);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  env.DATABASE_URL = databaseUrl;
  env.TURSO_DATABASE_URL = "";
  env.TURSO_AUTH_TOKEN = "";
  env.NODE_ENV = "test";
  await removeDatabaseFiles();
  createMigratedLegacyFixture();
  vi.resetModules();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  mockedAuth = vi.mocked((await import("@/lib/auth")).auth);
  prisma = (await import("@/lib/prisma")).prisma;
  DELETE = (await import("./route")).DELETE;
});

afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  env.DATABASE_URL = previousEnv.DATABASE_URL;
  env.TURSO_DATABASE_URL = previousEnv.TURSO_DATABASE_URL;
  env.TURSO_AUTH_TOKEN = previousEnv.TURSO_AUTH_TOKEN;
  env.NODE_ENV = previousEnv.NODE_ENV;
  await removeDatabaseFiles();
});

function requestDelete(clubId: string) {
  return DELETE(
    new Request(`http://localhost/api/clubs/${clubId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    }),
    { params: Promise.resolve({ id: clubId }) },
  );
}

describe("club deletion and immutable admission history", () => {
  it("returns 409 and preserves migrated admission requests and audit events", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "account-a", email: "owner@example.invalid", isAdmin: false } } as never);
    const beforeRequests = await prisma.clubAdmissionRequest.findMany({
      where: { clubId: "club-with-admission-history" },
      select: { id: true, legacyClaimRequestId: true },
      orderBy: { id: "asc" },
    });
    const beforeEvents = await prisma.clubAdmissionEvent.findMany({
      where: { admissionRequest: { clubId: "club-with-admission-history" } },
      select: { id: true, admissionRequestId: true, action: true, revision: true },
      orderBy: { id: "asc" },
    });
    expect(beforeRequests).toHaveLength(2);
    expect(beforeEvents).toHaveLength(2);

    const response = await requestDelete("club-with-admission-history");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This club has admission history that must be retained and cannot be deleted.",
    });
    expect(await prisma.club.findUnique({ where: { id: "club-with-admission-history" } })).not.toBeNull();
    expect(await prisma.clubAdmissionRequest.findMany({
      where: { clubId: "club-with-admission-history" },
      select: { id: true, legacyClaimRequestId: true },
      orderBy: { id: "asc" },
    })).toEqual(beforeRequests);
    expect(await prisma.clubAdmissionEvent.findMany({
      where: { admissionRequest: { clubId: "club-with-admission-history" } },
      select: { id: true, admissionRequestId: true, action: true, revision: true },
      orderBy: { id: "asc" },
    })).toEqual(beforeEvents);
  });

  it("still deletes a migrated club with no admission history", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "account-a", email: "owner@example.invalid", isAdmin: false } } as never);

    const response = await requestDelete("club-without-admission-history");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(await prisma.club.findUnique({ where: { id: "club-without-admission-history" } })).toBeNull();
  });
});
