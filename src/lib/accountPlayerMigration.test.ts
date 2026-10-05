import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ACCOUNT_PLAYER_MIGRATION, LEGACY_CREATOR_ACCESS_MIGRATION, legacyManifest, managedMigrationSql, safePreservationReport, verifyLegacyPreservation } from "../../scripts/account-player-preservation.mjs";

const migrationRoot = path.resolve("prisma/migrations");
const creatorSql = fs.readFileSync(path.join(migrationRoot, LEGACY_CREATOR_ACCESS_MIGRATION, "migration.sql"), "utf8");
const newSql = fs.readFileSync(path.join(migrationRoot, ACCOUNT_PLAYER_MIGRATION, "migration.sql"), "utf8") + "\n" + creatorSql;

function fixture(filename = ":memory:") {
  const db = new DatabaseSync(filename);
  db.exec(fs.readFileSync(path.resolve("src/lib/test-fixtures/account-player-legacy.sql"), "utf8"));
  const account = db.prepare('INSERT INTO "User" ("id","name","email","passwordHash","isClaimed","createdAt","updatedAt") VALUES (?,?,?,?,1,1700000011111,1700000022222)');
  account.run("account-a", "Account A", "a@example.invalid", "fixture-hash-a");
  account.run("account-b", "Account B", "b@example.invalid", "fixture-hash-b");
  const player = db.prepare('INSERT INTO "User" ("id","name","createdAt","updatedAt") VALUES (?,?,1700000033333,1700000044444)');
  for (const id of ["offline-a", "offline-b", "offline-c"]) player.run(id, id);
  db.exec(`
    INSERT INTO "Community" ("id","name","createdById","createdAt","updatedAt") VALUES ('club-a','Club A','account-a',1700000055555,1700000066666),('club-b','Club B','account-b',1700000077777,1700000088888);
    INSERT INTO "CommunityMember" ("id","communityId","userId","role","elo","createdAt") VALUES ('member-a','club-a','account-a','STAFF',1400,1700000099999),('member-offline-a','club-a','offline-a','ADMIN',1234,1700000101111),('member-offline-b','club-a','offline-b','MEMBER',1111,1700000102222),('member-offline-a-other','club-b','offline-a','MEMBER',1345,1700000103333);
    INSERT INTO "Session" ("id","code","name","communityId","status","createdAt") VALUES ('session-a','MIGRATE','History','club-a','ACTIVE',1700000111111);
    INSERT INTO "Court" ("id","sessionId","courtNumber") VALUES ('court-a','session-a',1);
    INSERT INTO "SessionPlayer" ("id","sessionId","userId","lastPartnerId","availableSince","joinedAt","ladderEntryAt","matchesPlayed","sessionPoints") VALUES ('seat-a','session-a','account-a','deleted-legacy-partner',1700000121111,1700000122222,1700000123333,9,42),('seat-offline','session-a','offline-a','account-a',1700000131111,1700000132222,1700000133333,8,39);
    INSERT INTO "Match" ("id","sessionId","courtId","status","team1User1Id","team1User2Id","team2User1Id","team2User2Id","scoreSubmittedByUserId","team1Score","team2Score","winnerTeam","createdAt","completedAt","matchmakingReasonJson") VALUES ('match-admin','session-a','court-a','COMPLETED','account-a','offline-a','offline-b','offline-c','account-b',21,19,1,1700000141111,1700000142222,'{"partnerIds":["account-a","offline-a"]}'),('match-player','session-a','court-a','COMPLETED','account-a','offline-a','offline-b','offline-c','account-a',19,21,2,1700000151111,1700000152222,'{}');
    INSERT INTO "MatchEloAdjustment" ("id","matchId","communityId","userId","delta","beforeElo","afterElo","createdAt") VALUES ('elo-a','match-admin','club-a','offline-a',15,1219,1234,1700000161111);
    INSERT INTO "ClubRatingAdjustment" ("id","memberId","actorId","actorName","beforeElo","afterElo","reason","createdAt") VALUES ('manual-a','member-offline-a','account-a','Account A',1200,1219,'Historical correction',1700000162222);
    INSERT INTO "QueuedMatch" ("id","sessionId","team1User1Id","team1User2Id","team2User1Id","team2User2Id","createdAt","matchmakingReasonJson") VALUES ('queue-a','session-a','account-a','offline-a','offline-b','offline-c',1700000171111,'{"playerId":"offline-a"}');
    INSERT INTO "SessionCommunity" ("id","sessionId","communityId","role","status","requestedById","createdAt","updatedAt") VALUES ('host-a','session-a','club-a','HOST','ACCEPTED','account-a',1700000181111,1700000182222);
    INSERT INTO "ClubNotification" ("id","communityId","sessionId","recipientUserId","actorUserId","type","newsItemId","newsType","title","detail","value","createdAt") VALUES ('notice-a','club-a','session-a','offline-a','account-b','LIKE','item-a','MATCH','Title','Detail','Value',1700000191111);
    INSERT INTO "ClubJoinRequest" ("id","clubId","userId","status","createdAt","reviewedAt","reviewedById") VALUES ('join-a','club-a','account-a','APPROVED',1700000201111,1700000202222,'account-b');
    INSERT INTO "ClaimRequest" ("id","communityId","requesterUserId","targetUserId","status","note","createdAt","updatedAt") VALUES ('claim-a','club-a','account-b','offline-b','PENDING','Please verify',1700000211111,1700000212222);
  `);
  return db;
}

function migrationTempDirectory(prefix: string) {
  const tempRoot = path.join(process.cwd(), "node_modules", ".cache");
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

function rehearseWithLocalLibsql(filename: string) {
  const db = new DatabaseSync(filename);
  try {
    db.exec('CREATE TABLE "_turso_sql_migrations" (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const insert = db.prepare('INSERT INTO "_turso_sql_migrations" (name) VALUES (?)');
    for (const name of fs.readdirSync(migrationRoot)) {
      if (name < ACCOUNT_PLAYER_MIGRATION && fs.statSync(path.join(migrationRoot, name)).isDirectory()) insert.run(name);
    }
  } finally { db.close(); }
  return spawnSync(process.execPath, [path.resolve("scripts/apply-turso-migrations.mjs"), "--force"], {
    cwd: process.cwd(), encoding: "utf8",
    env: { ...process.env, TURSO_DATABASE_URL: `file:${filename.replaceAll("\\", "/")}`, TURSO_AUTH_TOKEN: "local-test-token" },
  });
}

function runMigrationWithRemoteTarget() {
  return spawnSync(process.execPath, [path.resolve("scripts/apply-turso-migrations.mjs"), "--force"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      TURSO_DATABASE_URL: "libsql://unregistered-production.invalid",
      TURSO_AUTH_TOKEN: "test-token",
      PRODUCTION_REHEARSAL_TURSO_URL: "libsql://separate-production.invalid",
      PRODUCTION_REHEARSAL_TURSO_TOKEN: "read-only-test-token",
      VERCEL: "",
      VERCEL_ENV: "",
    },
  });
}

function expectRehearsalPreflightFailure(sourcePath: string, outputPath: string, expectedMessage: string, expectedTables: string[]) {
  const rehearsal = spawnSync(process.execPath, [
    path.resolve("scripts/rehearse-account-player-migration.mjs"),
    "--source", "sqlite", "--database", sourcePath, "--output", outputPath,
  ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "", USE_TURSO: "false" } });
  expect(rehearsal.status).not.toBe(0);
  expect(rehearsal.stderr).toContain(expectedMessage);
  expect(fs.existsSync(path.join(outputPath, "before-manifest.json"))).toBe(false);
  expect(fs.existsSync(path.join(outputPath, "rehearsal.db"))).toBe(false);

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    const tables = source.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    expect(tables).toEqual(expectedTables);
  } finally { source.close(); }
}

describe("account/Player migration preservation", () => {
  it("refuses an unregistered standard Turso target before connecting even when rehearsal credentials exist", () => {
    const runner = runMigrationWithRemoteTarget();
    expect(runner.status).not.toBe(0);
    expect(runner.stderr).toContain("Refusing remote Turso access");
    expect(runner.stderr).not.toContain("separate-production.invalid");
  });

  it.each(["production", "preview", "development"])("rejects Vercel %s migration even when forced", (environment) => {
    const runner = spawnSync(process.execPath, [path.resolve("scripts/apply-turso-migrations.mjs"), "--force"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL: "1",
        VERCEL_ENV: environment,
        RUN_DB_MIGRATIONS: "1",
        TURSO_DATABASE_URL: "libsql://unregistered-production.invalid",
        TURSO_AUTH_TOKEN: "test-token",
      },
    });
    expect(runner.status).not.toBe(0);
    expect(runner.stderr).toContain("Refusing database migrations from any Vercel build");
  });

  it("keeps production rehearsals disabled before loading credentials or connecting", () => {
    const runner = spawnSync(process.execPath, [path.resolve("scripts/rehearse-account-player-migration.mjs"), "--source", "production"], {
      encoding: "utf8", env: { ...process.env, PRODUCTION_REHEARSAL_CREDENTIALS_FILE: "/nonexistent/credentials.env" },
    });
    expect(runner.status).not.toBe(0);
    expect(runner.stderr).toContain("disabled pending credential-incident resolution");
  });

  it("rejects unapproved remote rehearsal credentials before connecting", () => {
    const runner = spawnSync(process.execPath, [path.resolve("scripts/rehearse-account-player-migration.mjs"), "--source", "turso"], {
      encoding: "utf8", env: { ...process.env, TURSO_DATABASE_URL: "libsql://unapproved-rehearsal.invalid", TURSO_AUTH_TOKEN: "fake-token" },
    });
    expect(runner.status).not.toBe(0);
    expect(runner.stderr).toContain("endpoint is not the approved non-production database");
    expect(runner.stderr).not.toContain("unapproved-rehearsal.invalid");
  });

  it("keeps production SQL out of the default build and exposes a read-only rehearsal command", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    expect(packageJson.scripts.build).not.toContain("apply-turso-migrations");
    expect(packageJson.scripts["db:rehearse:production"]).toContain("--source production");
  });

  it("rejects an empty source before writing a manifest or rehearsal copy", () => {
    const directory = migrationTempDirectory("anti-selek-empty-rehearsal-source-");
    const sourcePath = path.join(directory, "empty.db");
    const outputPath = path.join(directory, "output");
    const source = new DatabaseSync(sourcePath);
    source.close();
    try {
      expectRehearsalPreflightFailure(sourcePath, outputPath, "no application tables; expected the unmigrated legacy schema", []);
    } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });

  it("rejects an unrelated schema with a clear missing-legacy-tables diagnostic", () => {
    const directory = migrationTempDirectory("anti-selek-nonlegacy-rehearsal-source-");
    const sourcePath = path.join(directory, "unrelated.db");
    const outputPath = path.join(directory, "output");
    const source = new DatabaseSync(sourcePath);
    source.exec('CREATE TABLE "notes" ("id" INTEGER PRIMARY KEY, "body" TEXT NOT NULL);');
    source.close();
    try {
      expectRehearsalPreflightFailure(sourcePath, outputPath, "not a supported unmigrated legacy schema (missing required legacy tables", ["notes"]);
    } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });

  it("keeps every old ID/value including timing, ratings, queues, partner IDs, notifications and score actors", () => {
    const db = fixture();
    try {
      const before = legacyManifest(db);
      db.exec(managedMigrationSql(newSql));
      expect(verifyLegacyPreservation(before, db)).toMatchObject({ players: 5, accounts: 2, clubMembers: 4, foreignKeyErrors: 0 });
      const safeReport = safePreservationReport(before, db, "fixture");
      const serializedReport = JSON.stringify(safeReport);
      expect(safeReport.legacyTables.User).toMatchObject({ originalRowCount: 5, originalColumns: expect.arrayContaining(["id", "email", "passwordHash"]) });
      expect(safeReport.accountDeletionRelations).toEqual(expect.arrayContaining([
        { table: "Community", column: "createdById", references: "Account", onDelete: "RESTRICT" },
        { table: "ClubRatingAdjustment", column: "actorId", references: "Account", onDelete: "RESTRICT" },
      ]));
      expect(serializedReport).not.toContain("account-a");
      expect(serializedReport).not.toContain("a@example.invalid");
      expect(serializedReport).not.toContain("fixture-hash-a");
      expect(safeReport.rawOrphanLastPartnerDigest.count).toBe(1);
      expect(serializedReport).not.toContain("deleted-legacy-partner");
      expect(db.prepare('SELECT "scoreSubmittedByUserId","scoreSubmittedByPlayerId" FROM "Match" WHERE "id"=?').get("match-admin")).toMatchObject({ scoreSubmittedByUserId: "account-b", scoreSubmittedByPlayerId: null });
      expect(db.prepare('SELECT "scoreSubmittedByPlayerId" FROM "Match" WHERE "id"=?').get("match-player")).toMatchObject({ scoreSubmittedByPlayerId: "account-a" });
      expect(db.prepare('SELECT "creditedHostPlayerId" FROM "SessionCommunity"').get()).toMatchObject({ creditedHostPlayerId: "account-a" });
      expect(db.prepare('SELECT "kind","requestedPlayerId","status" FROM "ClubJoinRequest" WHERE "legacyClaimRequestId"=?').get("claim-a")).toMatchObject({ kind: "EXISTING_PLAYER", requestedPlayerId: "offline-b", status: "PENDING" });
      expect(db.prepare('SELECT "role" FROM "ClubAccess" WHERE "clubId"=? AND "userId"=?').get("club-a", "account-a")).toMatchObject({ role: "OWNER" });
      expect(db.prepare('SELECT "role" FROM "CommunityMember" WHERE "id"=?').get("member-a")).toMatchObject({ role: "STAFF" });
      expect(db.prepare('PRAGMA foreign_key_list("ClubRatingAdjustment")').all()).toContainEqual(expect.objectContaining({ table: "Account", from: "actorId", on_delete: "RESTRICT" }));
      expect(db.prepare('PRAGMA foreign_key_list("Community")').all()).toContainEqual(expect.objectContaining({ table: "Account", from: "createdById", on_delete: "RESTRICT" }));
    } finally { db.close(); }
  });

  it("links ownership without rewriting history or inheriting placeholder administrator roles", () => {
    const db = fixture();
    try {
      const before = legacyManifest(db);
      db.exec(managedMigrationSql(newSql));
      db.exec('UPDATE "User" SET "ownerUserId"=\'account-b\' WHERE "id"=\'offline-a\' AND "ownerUserId" IS NULL;');
      expect(verifyLegacyPreservation(before, db).foreignKeyErrors).toBe(0);
      expect(db.prepare('SELECT "role" FROM "ClubAccess" WHERE "clubId"=? AND "userId"=?').get("club-a", "account-b")).toBeUndefined();
      expect(db.prepare('SELECT "ownerUserId" FROM "CommunityMember" WHERE "userId"=?').all("offline-a")).toEqual([{ ownerUserId: "account-b" }, { ownerUserId: "account-b" }]);
      expect(() => db.exec('UPDATE "User" SET "ownerUserId"=\'account-a\' WHERE "id"=\'offline-a\';')).toThrow(/PLAYER_OWNER_IMMUTABLE/);
      expect(() => db.exec('UPDATE "User" SET "ownerUserId"=NULL WHERE "id"=\'offline-a\';')).toThrow(/PLAYER_OWNER_IMMUTABLE/);
      expect(() => db.exec('UPDATE "CommunityMember" SET "id"=\'replacement-member-id\' WHERE "id"=\'member-offline-a\';')).toThrow(/ROSTER_ID_IMMUTABLE/);
      expect(db.prepare('UPDATE "User" SET "ownerUserId"=\'account-b\' WHERE "id"=\'offline-a\' AND "ownerUserId" IS NULL').run().changes).toBe(0);
    } finally { db.close(); }
  });

  it("preserves creator authority without promoting other registered roster roles or undoing later revocation", () => {
    const db = fixture();
    try {
      db.exec('INSERT INTO "CommunityMember" ("id","communityId","userId","role","createdAt") VALUES (\'registered-staff\',\'club-a\',\'account-b\',\'STAFF\',1700000221111);');
      const before = legacyManifest(db);
      db.exec(managedMigrationSql(newSql));
      expect(verifyLegacyPreservation(before, db).foreignKeyErrors).toBe(0);
      expect(db.prepare('SELECT "role" FROM "ClubAccess" WHERE "clubId"=? AND "userId"=?').get("club-a", "account-b")).toMatchObject({ role: "STAFF" });
      db.exec(creatorSql);
      expect(verifyLegacyPreservation(before, db).foreignKeyErrors).toBe(0);
      db.exec('UPDATE "ClubAccess" SET "role"=\'MEMBER\',"status"=\'REVOKED\' WHERE "clubId"=\'club-a\' AND "userId"=\'account-a\';');
      db.exec(creatorSql);
      expect(db.prepare('SELECT "role","status" FROM "ClubAccess" WHERE "clubId"=? AND "userId"=?').get("club-a", "account-a")).toMatchObject({ role: "MEMBER", status: "REVOKED" });
      expect(db.prepare('SELECT "role" FROM "CommunityMember" WHERE "id"=?').get("member-a")).toMatchObject({ role: "STAFF" });
    } finally { db.close(); }
  });

  it("rejects a second owned roster identity atomically and derives ownership for new roster rows", () => {
    const db = fixture();
    try {
      db.exec(managedMigrationSql(newSql));
      db.exec('UPDATE "User" SET "ownerUserId"=\'account-b\' WHERE "id"=\'offline-a\';');
      expect(() => db.exec('UPDATE "User" SET "ownerUserId"=\'account-b\' WHERE "id"=\'offline-b\';')).toThrow(/UNIQUE/);
      expect(db.prepare('SELECT "ownerUserId" FROM "User" WHERE "id"=?').get("offline-b")).toMatchObject({ ownerUserId: null });
      db.exec('INSERT INTO "CommunityMember" ("id","communityId","userId") VALUES (\'new-roster\',\'club-b\',\'account-a\');');
      expect(db.prepare('SELECT "ownerUserId" FROM "CommunityMember" WHERE "id"=?').get("new-roster")).toMatchObject({ ownerUserId: "account-a" });
      expect(() => db.exec('UPDATE "CommunityMember" SET "ownerUserId"=NULL WHERE "id"=\'new-roster\';')).toThrow(/ROSTER_OWNER_MISMATCH/);
    } finally { db.close(); }
  });

  it("rolls back malformed account cutovers and preserves immutable request/audit rows", () => {
    const db = fixture();
    try {
      db.exec('UPDATE "User" SET "passwordHash"=NULL WHERE "id"=\'account-a\';');
      expect(() => db.exec(managedMigrationSql(newSql))).toThrow(/CHECK/);
      db.exec("ROLLBACK;");
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='Account'").get()).toBeUndefined();
      db.exec('UPDATE "User" SET "passwordHash"=\'fixture-hash-a\' WHERE "id"=\'account-a\';');
      db.exec(managedMigrationSql(newSql));
      expect(() => db.exec('UPDATE "ClubJoinRequest" SET "status"=\'PENDING\' WHERE "id"=\'join-a\';')).toThrow(/ADMISSION_TERMINAL_IMMUTABLE/);
      expect(() => db.exec('DELETE FROM "ClubAdmissionEvent";')).toThrow(/ADMISSION_EVENT_IMMUTABLE/);
      expect(() => db.exec('INSERT INTO "ClubJoinRequest" ("id","clubId","userId","updatedAt") VALUES (\'duplicate-request\',\'club-a\',\'account-b\',CURRENT_TIMESTAMP);')).toThrow(/UNIQUE/);
    } finally { db.close(); }
  });

  it("runs the managed transaction and atomic migration ledger through local libsql", async () => {
    const directory = migrationTempDirectory("anti-selek-libsql-migration-test-");
    const filename = path.join(directory, "fixture.db");
    try {
      const original = fixture(filename);
      const before = legacyManifest(original);
      original.close();
      const libsqlRun = rehearseWithLocalLibsql(filename);
      expect(libsqlRun.status, libsqlRun.stderr || libsqlRun.error?.message).toBe(0);
      const after = new DatabaseSync(filename);
      try {
        expect(verifyLegacyPreservation(before, after).foreignKeyErrors).toBe(0);
        expect(after.prepare('SELECT "name" FROM "_turso_sql_migrations" WHERE "name">=? ORDER BY "name"').all(ACCOUNT_PLAYER_MIGRATION)).toEqual([{ name: ACCOUNT_PLAYER_MIGRATION }, { name: LEGACY_CREATOR_ACCESS_MIGRATION }]);
        expect(after.prepare('PRAGMA foreign_key_list("ClubRatingAdjustment")').all()).toContainEqual(expect.objectContaining({ table: "Account", from: "actorId", on_delete: "RESTRICT" }));
      } finally { after.close(); }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it("rolls back the managed migration and ledger when the Turso runner rejects malformed accounts", () => {
    const directory = migrationTempDirectory("anti-selek-migration-runner-rollback-");
    const filename = path.join(directory, "fixture.db");
    try {
      const db = fixture(filename);
      db.exec('UPDATE "User" SET "passwordHash"=NULL WHERE "id"=\'account-a\';');
      db.exec('CREATE TABLE "_turso_sql_migrations" (name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
      const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => fs.statSync(path.join(migrationRoot, name)).isDirectory());
      const baseline = db.prepare('INSERT INTO "_turso_sql_migrations" (name) VALUES (?)');
      for (const name of migrationDirs) if (name < ACCOUNT_PLAYER_MIGRATION) baseline.run(name);
      db.close();

      const runner = spawnSync(process.execPath, [path.resolve("scripts/apply-turso-migrations.mjs"), "--force"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, TURSO_DATABASE_URL: `file:${filename.replaceAll("\\", "/")}`, TURSO_AUTH_TOKEN: "local-test-token" },
      });
      expect(runner.status).not.toBe(0);
      const after = new DatabaseSync(filename);
      try {
        expect(after.prepare('SELECT name FROM sqlite_schema WHERE type=\'table\' AND name=\'Account\'').get()).toBeUndefined();
        expect(after.prepare('SELECT name FROM "_turso_sql_migrations" WHERE name=?').get(ACCOUNT_PLAYER_MIGRATION)).toBeUndefined();
        expect(after.prepare('SELECT "passwordHash" FROM "User" WHERE "id"=\'account-a\'').get()).toMatchObject({ passwordHash: null });
      } finally { after.close(); }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
