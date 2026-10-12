import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { normalizeMixedSideOverrideForGender } from "./mixedSide";
import { PlayerGender } from "@/types/enums";

it("backfills every legacy membership exactly like the existing normalizer without changing source records or snapshots", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE User (id TEXT PRIMARY KEY, gender TEXT, mixedSideOverride TEXT, partnerPreference TEXT, credentials TEXT);
      CREATE TABLE CommunityMember (id TEXT PRIMARY KEY, communityId TEXT, userId TEXT, archivedAt TEXT, retiredByAdmissionEventId TEXT, elo INTEGER);
      CREATE TABLE Account (id TEXT PRIMARY KEY, mixedSideOverride TEXT, passwordHash TEXT);
      CREATE TABLE SessionPlayer (id TEXT PRIMARY KEY, mixedSideOverride TEXT, partnerPreference TEXT, history TEXT);
      INSERT INTO Account VALUES ('a','UPPER','retained-password-hash');
      INSERT INTO SessionPlayer VALUES ('s','LOWER','OPEN','retained-history');`);
    const retirementTrigger = readFileSync("prisma/migrations/20261008120000_placeholder_claim_recovery/migration.sql", "utf8").match(/CREATE TRIGGER "ClubMember_retirement_preserve"[\s\S]*?END;/)![0];
    db.exec(retirementTrigger);
    const originalTrigger = db.prepare("SELECT sql FROM sqlite_schema WHERE name='ClubMember_retirement_preserve'").get();
    let index = 0;
    for (const gender of Object.values(PlayerGender)) for (const override of [null, "UPPER", "LOWER", "INVALID"]) for (const preference of [null, "OPEN", "FEMALE_FLEX", "INVALID"]) {
      const id = `p${index++}`;
      db.prepare("INSERT INTO User VALUES (?,?,?,?,?)").run(id, gender, override, preference, `retained-${id}`);
      for (const clubId of ["a", "b"]) db.prepare("INSERT INTO CommunityMember VALUES (?,?,?,?,?,?)").run(`${id}-${clubId}`, clubId, id, clubId === "a" ? "archive" : null, clubId === "a" ? "retirement" : null, 1234 + index);
    }
    const originalPlayers = db.prepare("SELECT * FROM User ORDER BY id").all();
    const originalMembers = db.prepare("SELECT * FROM CommunityMember ORDER BY id").all();
    const originalAccounts = db.prepare("SELECT * FROM Account").all();
    const originalSeats = db.prepare("SELECT * FROM SessionPlayer").all();
    db.exec("BEGIN IMMEDIATE;");
    db.exec(readFileSync("prisma/migrations/20261012200000_club_pairing_preferences/migration.sql", "utf8"));
    db.exec("COMMIT;");
    const rows = db.prepare("SELECT m.*, p.gender, p.mixedSideOverride AS originalOverride, p.partnerPreference FROM CommunityMember m JOIN User p ON p.id=m.userId ORDER BY m.id").all();
    for (const row of rows) expect(row.mixedSideOverride).toBe(normalizeMixedSideOverrideForGender(row.gender as PlayerGender, row.originalOverride as string | null, row.partnerPreference as string | null));
    expect(db.prepare("SELECT * FROM User ORDER BY id").all()).toEqual(originalPlayers);
    expect(db.prepare("SELECT id,communityId,userId,archivedAt,retiredByAdmissionEventId,elo FROM CommunityMember ORDER BY id").all()).toEqual(originalMembers);
    expect(db.prepare("SELECT * FROM Account").all()).toEqual(originalAccounts);
    expect(db.prepare("SELECT * FROM SessionPlayer").all()).toEqual(originalSeats);
    expect(db.prepare("SELECT sql FROM sqlite_schema WHERE name='ClubMember_retirement_preserve'").get()).toEqual(originalTrigger);
    expect(() => db.prepare("UPDATE CommunityMember SET elo=elo+1 WHERE retiredByAdmissionEventId IS NOT NULL").run()).toThrow("PLAYER_RETIRED");
    expect(() => db.prepare("UPDATE CommunityMember SET mixedSideOverride=NULL WHERE retiredByAdmissionEventId IS NOT NULL").run()).toThrow("PLAYER_RETIRED");
    expect(() => db.prepare("UPDATE CommunityMember SET mixedSideOverride='INVALID' WHERE retiredByAdmissionEventId IS NULL").run()).toThrow();
  } finally { db.close(); }
});
