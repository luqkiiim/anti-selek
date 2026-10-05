import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createClient } from "@libsql/client";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationRoot = path.join(projectRoot, "prisma", "migrations");
const migrationRunner = path.join(projectRoot, "scripts", "apply-turso-migrations.mjs");
const failingMigration = "20260403075615_add_test_sessions";
const migrationNames = readdirSync(migrationRoot)
  .filter((name) => statSync(path.join(migrationRoot, name)).isDirectory())
  .sort((left, right) => left.localeCompare(right));

function scratchDirectory() {
  const cacheRoot = path.join(projectRoot, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  return mkdtempSync(path.join(cacheRoot, "session-rebuild-prerequisite-"));
}

function runLocalMigrationRunner(directory, filename) {
  return spawnSync(process.execPath, [migrationRunner, "--force"], {
    cwd: directory,
    encoding: "utf8",
    env: {
      TURSO_DATABASE_URL: `file:${filename.replaceAll("\\", "/")}`,
      TURSO_AUTH_TOKEN: "local-migration-test-token",
    },
  });
}

function assertIntegrity(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM "_turso_sql_migrations"').get().count,
      migrationNames.length,
    );
  } finally {
    db.close();
  }
}

async function seedThroughPredecessor(filename) {
  const client = createClient({ url: `file:${filename.replaceAll("\\", "/")}` });
  try {
    await client.execute(
      'CREATE TABLE "_turso_sql_migrations" (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    for (const name of migrationNames) {
      if (name >= failingMigration) break;
      const sql = readFileSync(path.join(migrationRoot, name, "migration.sql"), "utf8").trim();
      assert.ok(!sql.includes("ACCOUNT_PLAYER_MANAGED_TRANSACTION"));
      await client.executeMultiple(`
BEGIN;
${sql}
INSERT INTO "_turso_sql_migrations" (name, applied_at) VALUES ('${name}', CURRENT_TIMESTAMP);
COMMIT;
`);
    }

    // Model an old database with one pre-existing customized field and a real row.
    await client.execute(
      'ALTER TABLE "Session" ADD COLUMN "crossoverMissThreshold" INTEGER NOT NULL DEFAULT 1',
    );
    await client.execute({
      sql: 'INSERT INTO "Session" ("id", "code", "name", "type", "status", "createdAt", "crossoverMissThreshold") VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
      args: ["session-preserve", "CHAIN-TEST", "Persisted Session", "POINTS", "WAITING", 3],
    });
  } finally {
    await client.close();
  }
}

test("builds all SQL migrations from an empty local SQLite file", (t) => {
  const directory = scratchDirectory();
  const filename = path.join(directory, "empty.db");
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const runner = runLocalMigrationRunner(directory, filename);
  assert.equal(runner.status, 0, `${runner.stdout}\n${runner.stderr}`);
  assert.match(runner.stdout, /Prepared legacy Session rebuild inputs/);
  assertIntegrity(filename);
});

test("continues the full chain from a populated predecessor schema without losing existing Session values", async (t) => {
  const directory = scratchDirectory();
  const filename = path.join(directory, "populated.db");
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  await seedThroughPredecessor(filename);
  const runner = runLocalMigrationRunner(directory, filename);
  assert.equal(runner.status, 0, `${runner.stdout}\n${runner.stderr}`);
  assert.match(runner.stdout, /Prepared legacy Session rebuild inputs/);
  assertIntegrity(filename);

  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const session = db.prepare('SELECT * FROM "Session" WHERE "id" = ?').get("session-preserve");
    assert.ok(session);
    assert.equal(session.crossoverMissThreshold, 3);
    assert.equal(session.poolsEnabled, 0);
    assert.equal(session.poolAName, null);
    assert.equal(session.poolBName, null);
    assert.equal(session.poolACourtAssignments, 0);
    assert.equal(session.poolBCourtAssignments, 0);
    assert.equal(session.poolAMissedTurns, 0);
    assert.equal(session.poolBMissedTurns, 0);
  } finally {
    db.close();
  }
});
