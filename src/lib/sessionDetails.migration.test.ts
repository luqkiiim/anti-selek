import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("adds nullable logistics without changing existing sessions, courts, data or database guards", () => {
  const db = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  const migration = "20261102000000_session_details";
  try {
    for (const name of readdirSync("prisma/migrations").sort()) {
      if (name >= migration || name === "migration_lock.toml") continue;
      db.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    db.exec(`INSERT INTO Session(id,code,name,status,createdAt) VALUES ('old','OLD','Historical games','COMPLETED',123);
      INSERT INTO Court(id,sessionId,courtNumber,label,isActive) VALUES ('old-court','old',3,'East',0);`);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(table => ({ name: String(table.name), columns: db.prepare(`PRAGMA table_info("${table.name}")`).all().map(column => String(column.name)), rows: db.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`).all() }));
    const guards = db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('index','trigger') ORDER BY name").all();
    db.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    for (const table of tables) expect(db.prepare(`SELECT ${table.columns.map(column => `"${column}"`).join(",")} FROM "${table.name}" ORDER BY rowid`).all(), table.name).toEqual(table.rows);
    expect(db.prepare("SELECT venue,scheduledStartAt,timeZone FROM Session").get()).toEqual({ venue: null, scheduledStartAt: null, timeZone: null });
    expect(db.prepare("SELECT bookingStartAt,bookingEndAt FROM Court").get()).toEqual({ bookingStartAt: null, bookingEndAt: null });
    expect(db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('index','trigger') ORDER BY name").all()).toEqual(guards);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  } finally { db.close(); }
});
