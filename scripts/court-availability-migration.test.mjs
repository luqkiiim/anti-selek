import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("court availability migration preserves existing courts, labels, match references and scores", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE Court (id TEXT PRIMARY KEY, courtNumber INTEGER, label TEXT);
      CREATE TABLE Match (id TEXT PRIMARY KEY, courtId TEXT REFERENCES Court(id) ON DELETE CASCADE, team1Score INTEGER, team2Score INTEGER);
      INSERT INTO Court VALUES ('court-3', 3, 'East');
      INSERT INTO Match VALUES ('match-1', 'court-3', 21, 18);`);
    const court = db.prepare("SELECT * FROM Court").get();
    const match = db.prepare("SELECT * FROM Match").get();
    db.exec(readFileSync(new URL("../prisma/migrations/20261028000000_court_availability/migration.sql", import.meta.url), "utf8"));
    assert.deepEqual(db.prepare("SELECT id, courtNumber, label FROM Court").get(), court);
    assert.equal(db.prepare("SELECT isActive FROM Court").get().isActive, 1);
    assert.deepEqual(db.prepare("SELECT * FROM Match").get(), match);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally { db.close(); }
});
