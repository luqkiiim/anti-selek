import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("adds collaboration defaults without changing historical data, ratings, indexes, or identity triggers", () => {
  const db = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  const migrationName = "20261015123000_upgrade_club_collaboration";
  try {
    for (const migration of readdirSync("prisma/migrations").sort()) {
      if (migration >= migrationName || migration === "migration_lock.toml") continue;
      db.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
    db.exec(`
      INSERT INTO Account(id,email,passwordHash,name,createdAt,updatedAt) VALUES ('admin','admin@example.test','retained-hash','Admin',11,12);
      INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('home','Home','admin',21,22),('away','Away','admin',23,24);
      INSERT INTO User(id,name,elo,createdAt,updatedAt) VALUES ('p1','One',1130,31,32),('p2','Two',1020,33,34),('p3','Three',1300,35,36),('p4','Four',970,37,38);
      INSERT INTO CommunityMember(id,communityId,userId,elo,createdAt) VALUES ('member','home','p1',1130,41);
      INSERT INTO Session(id,code,name,communityId,status,collabFormat,createdAt) VALUES ('session','LEGACY','Historical friendly','home','COMPLETED','INTERCLUB',51);
      INSERT INTO SessionCommunity(id,sessionId,communityId,role,status,createdAt,updatedAt) VALUES ('host','session','home','HOST','ACCEPTED',52,53),('partner','session','away','PARTNER','ACCEPTED',54,55);
      INSERT INTO Court(id,sessionId,courtNumber) VALUES ('court','session',1);
      INSERT INTO SessionPlayer(id,sessionId,userId,sessionPoints,matchesPlayed,availableSince,joinedAt,ladderEntryAt) VALUES ('seat','session','p1',3,1,61,62,63);
      INSERT INTO Match(id,sessionId,courtId,status,team1User1Id,team1User2Id,team2User1Id,team2User2Id,team1Score,team2Score,winnerTeam,createdAt,completedAt) VALUES ('match','session','court','COMPLETED','p1','p2','p3','p4',21,19,1,71,72);
      INSERT INTO MatchEloAdjustment(id,matchId,communityId,userId,delta,beforeElo,afterElo,createdAt) VALUES ('ledger','match','home','p1',15,1115,1130,81);
    `);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    const before = tables.map(table => ({ name: String(table.name), columns: db.prepare(`PRAGMA table_info("${table.name}")`).all().map(column => String(column.name)), rows: db.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`).all() }));
    const guards = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type IN ('trigger','index') ORDER BY name").all();
    db.exec("BEGIN IMMEDIATE");
    db.exec(readFileSync(path.join("prisma/migrations", migrationName, "migration.sql"), "utf8"));
    db.exec("COMMIT");
    for (const table of before) {
      expect(db.prepare(`SELECT ${table.columns.map(column => `"${column}"`).join(",")} FROM "${table.name}" ORDER BY rowid`).all(), table.name).toEqual(table.rows);
    }
    const afterGuards = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type IN ('trigger','index') ORDER BY name").all();
    expect(afterGuards).toEqual(expect.arrayContaining(guards));
    expect(db.prepare("SELECT collaborationVersion,schedulingMode,scoringFormat,ratingMode FROM Session").get()).toEqual({ collaborationVersion: 1, schedulingMode: "FREE_PLAY", scoringFormat: "SINGLE_GAME", ratingMode: "RATED" });
    expect(db.prepare("SELECT scoringFormat,gameScoresJson,scoreRevision FROM Match").get()).toEqual({ scoringFormat: "SINGLE_GAME", gameScoresJson: null, scoreRevision: 0 });
    expect(db.prepare("SELECT rulesConfirmedRevision,resetConfirmedRevision FROM SessionCommunity").all()).toEqual([{ rulesConfirmedRevision: null, resetConfirmedRevision: null }, { rulesConfirmedRevision: null, resetConfirmedRevision: null }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
  } finally { db.close(); }
});
