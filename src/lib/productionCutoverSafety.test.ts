import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { legacyManifest } from "../../scripts/account-player-preservation.mjs";
import { APPROVED_FEATURE_COMMIT, CUTOVER_MIGRATIONS, atomicMigrationSql, committedMigrationBundle, loadCutoverAuthorization, manifestDigest, migrationState, protectedPath, rehearseSnapshot, sha256, validateCutoverCredentials, verifyCompleteCutover } from "../../scripts/phase1-cutover.mjs";
import { tursoEndpointFingerprint } from "../../scripts/turso-local-target-guard.mjs";

const root = process.cwd();
const bundle = committedMigrationBundle(root, APPROVED_FEATURE_COMMIT);
const directories: string[] = [];
function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anti-selek-cutover-"));
  fs.chmodSync(directory, 0o700);
  directories.push(directory);
  return directory;
}
function fixture(filename = ":memory:") {
  const db = new DatabaseSync(filename);
  db.exec(fs.readFileSync(path.join(root, "src/lib/test-fixtures/account-player-legacy.sql"), "utf8"));
  db.exec(`
    CREATE TABLE "_turso_sql_migrations" (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO "User" ("id","name","isClaimed","email","passwordHash","createdAt","updatedAt") VALUES ('account','Account',1,'fixture@example.invalid','fixture-hash',1700000000000,1700000001000);
    INSERT INTO "User" ("id","name","createdAt","updatedAt") VALUES ('offline','Offline',1700000002000,1700000003000);
    INSERT INTO "Community" ("id","name","createdById","createdAt","updatedAt") VALUES ('club','Club','account',1700000004000,1700000005000);
    INSERT INTO "CommunityMember" ("id","communityId","userId","role","elo","createdAt") VALUES ('member','club','account','STAFF',1400,1700000006000),('offline-member','club','offline','ADMIN',1234,1700000007000);
    INSERT INTO "Session" ("id","code","name","communityId","createdAt") VALUES ('session','CUTOVER','History','club',1700000008000);
    INSERT INTO "SessionPlayer" ("id","sessionId","userId","lastPartnerId","joinedAt","availableSince","matchesPlayed","sessionPoints") VALUES ('seat','session','offline','historically-deleted-player',1700000009000,1700000010000,9,42);
    INSERT INTO "ClubRatingAdjustment" ("id","memberId","actorId","actorName","beforeElo","afterElo","reason","createdAt") VALUES ('adjustment','offline-member','account','Account',1200,1234,'Historical correction',1700000011000);
  `);
  const ledger = db.prepare('INSERT INTO "_turso_sql_migrations" (name) VALUES (?)');
  for (const name of bundle.baseline) ledger.run(name);
  return db;
}
function jwt(claims: Record<string, unknown>) {
  return [Buffer.from('{"alg":"test","typ":"JWT"}').toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url"), "test-signature"].join(".");
}
const now = 1_000_000;
const testPolicy = {
  version: 1,
  productionEndpointSha256: tursoEndpointFingerprint("libsql://production.example.invalid"),
  nonProductionEndpointSha256: tursoEndpointFingerprint("libsql://development.example.invalid"),
  nonProductionTokenSha256: sha256("development-fixture-token"),
  productionRehearsalEnabled: false,
};
function credentials(writer = jwt({ a: "rw", exp: now / 1000 + 3600 }), reader = jwt({ a: "ro", exp: now / 1000 + 3600 })) {
  const entries = { PRODUCTION_CUTOVER_TURSO_URL: "libsql://production.example.invalid", PRODUCTION_CUTOVER_WRITER_TOKEN: writer, PRODUCTION_CUTOVER_READER_TOKEN: reader };
  const approval = { productionEndpointSha256: testPolicy.productionEndpointSha256, writerTokenSha256: sha256(writer), readerTokenSha256: sha256(reader) };
  return { entries, approval };
}
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe("committed Phase 1 production cutover preparation", () => {
  it("applies all four reviewed migrations atomically and preserves the original database values", () => {
    const db = fixture();
    try {
      const before = legacyManifest(db);
      expect(migrationState(db, bundle)).toBe("legacy");
      db.exec(atomicMigrationSql(bundle));
      expect(verifyCompleteCutover(before, db, bundle)).toMatchObject({ players: 2, accounts: 1, clubMembers: 2, foreignKeyErrors: 0, integrity: "ok", offlinePermissionErrors: 0 });
      expect(migrationState(db, bundle)).toBe("applied");
      expect(db.prepare('SELECT name FROM "_turso_sql_migrations" WHERE name>=? ORDER BY name').all(CUTOVER_MIGRATIONS[0]).map(row => row.name)).toEqual(CUTOVER_MIGRATIONS);
      expect(db.prepare('SELECT "ownerUserId" FROM "User" WHERE id=\'offline\'').get()).toMatchObject({ ownerUserId: null });
      expect(db.prepare('SELECT COUNT(*) AS count FROM "ClubAccess" WHERE "userId"=\'offline\'').get()).toMatchObject({ count: 0 });
      db.exec(`INSERT INTO "PlayerInvitation" (id,"clubId","playerId","clubMemberId","createdByUserId","tokenHash","expiresAt","updatedAt") VALUES ('invite','club','offline','offline-member','account','fixture-invite-hash',1999999999999,1700000012000);
        INSERT INTO "PlayerInvitationContinuation" (id,"invitationId","handleHash","expiresAt") VALUES ('continuation','invite','fixture-handle-hash',1999999999999);
        UPDATE "User" SET "isActive"=0 WHERE id='offline';`);
      expect(db.prepare('SELECT COUNT(*) AS count FROM "PlayerInvitationContinuation"').get()).toMatchObject({ count: 0 });
      expect(db.prepare('SELECT action FROM "PlayerInvitationEvent" ORDER BY action').all().map(row => row.action)).toEqual(["CREATED", "REVOKED"]);
    } finally { db.close(); }
  });

  it.each([1, 2, 3])("rolls back separation and every ledger entry if follow-up migration %i fails", index => {
    const db = fixture();
    try {
      const before = legacyManifest(db);
      const migrations = bundle.migrations.map((migration, i) => {
        const sql = migration.sql + (i === index ? '\nINSERT INTO "deliberately_missing_table" VALUES (1);' : "");
        return { ...migration, sql, sha256: sha256(sql) };
      });
      expect(() => db.exec(atomicMigrationSql({ ...bundle, migrations }))).toThrow();
      db.exec("ROLLBACK; PRAGMA foreign_keys=ON;");
      expect(migrationState(db, bundle)).toBe("legacy");
      expect(manifestDigest(legacyManifest(db))).toBe(manifestDigest(before));
      expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='Account'").get()).toBeUndefined();
    } finally { db.close(); }
  });

  it("uses the same atomic batch through the libSQL client and can roll back a failed batch", async () => {
    const filename = path.join(temporaryDirectory(), "libsql.db");
    fixture(filename).close();
    const client = createClient({ url: `file:${filename}` });
    try {
      const migrations = bundle.migrations.map((migration, index) => {
        const sql = migration.sql + (index === 3 ? '\nINSERT INTO "missing_for_libsql_test" VALUES (1);' : "");
        return { ...migration, sql, sha256: sha256(sql) };
      });
      await expect(client.executeMultiple(atomicMigrationSql({ ...bundle, migrations }))).rejects.toThrow();
      await client.executeMultiple("ROLLBACK;").catch(() => { /* The local libSQL client may already have rolled back. */ });
      await client.executeMultiple("PRAGMA foreign_keys=ON;");
      const original = new DatabaseSync(filename, { readOnly: true });
      let before;
      try { expect(migrationState(original, bundle)).toBe("legacy"); before = legacyManifest(original); } finally { original.close(); }
      await client.executeMultiple(atomicMigrationSql(bundle));
      const migrated = new DatabaseSync(filename, { readOnly: true });
      try { expect(verifyCompleteCutover(before, migrated, bundle).integrity).toBe("ok"); } finally { migrated.close(); }
    } finally { client.close(); }
  });

  it("rejects partial and unknown migration ledgers", () => {
    const db = fixture();
    try {
      db.prepare('INSERT INTO "_turso_sql_migrations" (name) VALUES (?)').run(CUTOVER_MIGRATIONS[0]);
      expect(() => migrationState(db, bundle)).toThrow("PARTIAL_CUTOVER_REFUSED");
      db.prepare('INSERT INTO "_turso_sql_migrations" (name) VALUES (?)').run("unreviewed-migration");
      expect(() => migrationState(db, bundle)).toThrow("LEGACY_BASELINE_MISMATCH");
    } finally { db.close(); }
  });

  it("rehearses only a copy, keeps the source unchanged and saves aggregate provenance", async () => {
    const directory = temporaryDirectory();
    const source = path.join(directory, "source.db");
    fixture(source).close();
    const originalHash = sha256(fs.readFileSync(source));
    const output = path.join(directory, "copy");
    const report = await rehearseSnapshot(source, output, bundle);
    expect(sha256(fs.readFileSync(source))).toBe(originalHash);
    expect(report.sourceSnapshotSha256).toBe(originalHash);
    expect(report.migrations.map((migration: { name: string }) => migration.name)).toEqual(CUTOVER_MIGRATIONS);
    expect(report.preservation.followUpMigrations).toEqual(CUTOVER_MIGRATIONS.slice(1));
    expect(JSON.stringify(report)).not.toContain("fixture@example.invalid");
    expect(JSON.stringify(report)).not.toContain("fixture-hash");
    expect(report.preservation.rawValuesIncluded).toBe(false);
    expect(fs.statSync(path.join(output, "before-manifest.json")).mode & 0o077).toBe(0);
    await expect(rehearseSnapshot(source, output, bundle)).rejects.toThrow("OUTPUT_ALREADY_EXISTS");
  });

  it("refuses uncommitted references and altered migration hashes", () => {
    expect(() => committedMigrationBundle(root, "HEAD")).toThrow("EXACT_COMMIT_REQUIRED");
    const migrations = bundle.migrations.map((migration, i) => ({ ...migration, sql: migration.sql + (i === 3 ? "\n-- changed" : "") }));
    expect(() => atomicMigrationSql({ ...bundle, migrations })).toThrow("MIGRATION_PROVENANCE_MISMATCH");
  });
});

describe("production cutover authorization boundaries", () => {
  it("requires separate approved short-lived reader/writer credentials without modifying application environment", () => {
    const before = { ...process.env };
    const { entries, approval } = credentials();
    expect(validateCutoverCredentials(entries, approval, now, testPolicy)).toEqual({ url: entries.PRODUCTION_CUTOVER_TURSO_URL, writerToken: entries.PRODUCTION_CUTOVER_WRITER_TOKEN, readerToken: entries.PRODUCTION_CUTOVER_READER_TOKEN });
    expect(process.env).toEqual(before);
  });
  it.each([{ a: "ro", exp: 4600 }, { a: "rw" }, { a: "rw", exp: 999 }, { a: "rw", exp: 100000 }, { a: "rw", exp: 4600, nbf: 1001 }, { a: "rw", exp: 4600, p: { rw: { ns: ["main"] } } }])("rejects an unsuitable writer claim %#", claims => {
    const { entries, approval } = credentials(jwt(claims));
    expect(() => validateCutoverCredentials(entries, approval, now, testPolicy)).toThrow();
  });
  it("rejects writer permissions on the snapshot credential", () => {
    const { entries, approval } = credentials(jwt({ a: "rw", exp: 4600 }), jwt({ a: "ro", exp: 4600, p: { ro: { ns: ["main"] }, rw: { ns: ["main"] } } }));
    expect(() => validateCutoverCredentials(entries, approval, now, testPolicy)).toThrow("write, create, or DDL permission");
  });
  it("rejects development endpoints, development credentials and unapproved credential replacements", () => {
    const { entries, approval } = credentials();
    expect(() => validateCutoverCredentials({ ...entries, PRODUCTION_CUTOVER_TURSO_URL: "libsql://development.example.invalid" }, approval, now, testPolicy)).toThrow("PRODUCTION_ENDPOINT_MISMATCH");
    expect(() => validateCutoverCredentials({ ...entries, PRODUCTION_CUTOVER_WRITER_TOKEN: "development-fixture-token" }, approval, now, testPolicy)).toThrow("DEVELOPMENT_CREDENTIAL_REFUSED");
    expect(() => validateCutoverCredentials(entries, { ...approval, writerTokenSha256: "unapproved" }, now, testPolicy)).toThrow("UNAPPROVED_CUTOVER_CREDENTIAL");
    expect(() => validateCutoverCredentials({ ...entries, TURSO_AUTH_TOKEN: "fixture" }, approval, now, testPolicy)).toThrow("CUTOVER_CREDENTIALS_INCOMPLETE");
  });
  it.each([{ args: [], env: { NODE_ENV: "development" as const } }, { args: ["--production-cutover"], env: { VERCEL: "1", NODE_ENV: "production" as const } }, { args: ["--production-cutover"], env: { NODE_ENV: "test" as const } }])("refuses accidental execution before credentials are read %#", ({ args, env }) => {
    expect(() => loadCutoverAuthorization("/nonexistent-cutover-fixture", args, env)).toThrow("EXPLICIT_LOCAL_PRODUCTION_CUTOVER_REQUIRED");
  });
  it("refuses incomplete rotation/freeze approval before git inspection or any database connection", () => {
    const directory = temporaryDirectory();
    fs.mkdirSync(path.join(directory, "private"), { mode: 0o700 });
    fs.writeFileSync(path.join(directory, "private/production-cutover-approval.json"), JSON.stringify({ version: 1, rotationVerified: false }), { mode: 0o600 });
    expect(() => loadCutoverAuthorization(directory, ["--production-cutover"], { NODE_ENV: "development" })).toThrow("CUTOVER_PREREQUISITES_UNVERIFIED");
  });
  it("refuses unprotected files and symlinks outside the ignored private directory", () => {
    const directory = temporaryDirectory();
    const privateDirectory = path.join(directory, "private");
    fs.mkdirSync(privateDirectory, { mode: 0o700 });
    const filename = path.join(privateDirectory, "credential.env");
    fs.writeFileSync(filename, "fixture", { mode: 0o600 });
    expect(protectedPath(directory, filename)).toBe(filename);
    fs.chmodSync(filename, 0o644);
    expect(() => protectedPath(directory, filename)).toThrow("PRIVATE_FILE_REQUIRED");
    const linked = path.join(privateDirectory, "linked.env");
    fs.symlinkSync(filename, linked);
    expect(() => protectedPath(directory, linked)).toThrow("PRIVATE_FILE_REQUIRED");
    expect(() => protectedPath(directory, path.join(directory, "tracked.env"), false)).toThrow("PRIVATE_PATH_REQUIRED");
  });
  it.each([{ args: ["--snapshot"] }, { args: ["--apply", "--run", "private/fake-run"] }, { args: ["--production-cutover", "--snapshot", "--snapshot"] }, { args: ["--rehearse-snapshot", "--snapshot"] }, { args: ["--unknown"] }])("CLI fails closed with sanitized errors for %j", ({ args }) => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/production-identity-cutover.mjs"), ...args], { cwd: root, encoding: "utf8", env: { ...process.env, TURSO_AUTH_TOKEN: "sensitive-fixture-sentinel" } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production identity cutover refused or failed:");
    expect(result.stdout + result.stderr).not.toContain("sensitive-fixture-sentinel");
  });
});
