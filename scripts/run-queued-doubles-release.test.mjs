import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { splitSql } from "./production-release59.mjs";
import { applyQueuedDoubles } from "./run-queued-doubles-release.mjs";

const migration = "20261124000000_queued_doubles_type";
const prior = "20261105000000_google_sign_in";
const statements = splitSql(readFileSync(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE QueuedMatch (id TEXT PRIMARY KEY NOT NULL, playerId TEXT NOT NULL);
    INSERT INTO QueuedMatch VALUES ('next', 'player-a');
    CREATE TABLE _turso_sql_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
    INSERT INTO _turso_sql_migrations VALUES ('${prior}', '2026-11-05T00:00:00Z');
  `);
  const columnInfo = () => db.prepare('PRAGMA table_info("QueuedMatch")').all().map(({ cid, ...column }) => {
    assert.equal(cid >= 0, true);
    return column;
  });
  const execute = async (input) => {
    const { sql, args = [] } = typeof input === "string" ? { sql: input } : input;
    const statement = db.prepare(sql);
    if (statement.columns().length) return { rows: statement.all(...args) };
    statement.run(...args);
    return { rows: [] };
  };
  return { db, tx: { execute }, columnInfo };
}

test("adds only nullable queue fields and a ledger entry in the writer transaction", async () => {
  const { db, tx, columnInfo } = fixture();
  try {
    const beforeColumns = columnInfo();
    db.exec("BEGIN IMMEDIATE");
    await applyQueuedDoubles(tx, { priorMigrations: [prior], statements }, beforeColumns);
    db.exec("COMMIT");
    assert.deepEqual({ ...db.prepare('SELECT * FROM "QueuedMatch"').get() }, {
      id: "next", playerId: "player-a", requestedMatchType: null, refreshToken: null,
    });
    assert.deepEqual(db.prepare("SELECT name FROM _turso_sql_migrations ORDER BY name").all().map((row) => row.name),
      [prior, migration]);
    assert.deepEqual(columnInfo().slice(0, 2), beforeColumns);
  } finally {
    db.close();
  }
});

test("a failure during DDL leaves no partial schema or ledger after rollback", async () => {
  const { db, tx, columnInfo } = fixture();
  try {
    const beforeColumns = columnInfo();
    db.exec("BEGIN IMMEDIATE");
    await assert.rejects(applyQueuedDoubles(tx, {
      priorMigrations: [prior], statements: [statements[0], statements[0]],
    }, beforeColumns));
    db.exec("ROLLBACK");
    assert.deepEqual(columnInfo(), beforeColumns);
    assert.deepEqual(db.prepare("SELECT name FROM _turso_sql_migrations").all().map((row) => row.name), [prior]);
  } finally {
    db.close();
  }
});
