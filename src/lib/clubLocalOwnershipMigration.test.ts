import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const name = "20261012120000_club_local_player_ownership";
const localSql = readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8");
function fixture() {
  const db = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  for (const migration of readdirSync("prisma/migrations").sort()) {
    if (migration >= name || migration === "migration_lock.toml") continue;
    db.exec(readFileSync(path.join("prisma/migrations", migration, "migration.sql"), "utf8"));
  }
  db.exec(`
   INSERT INTO Account(id,email,passwordHash,name,gender,createdAt,updatedAt) VALUES
    ('admin','admin@test.invalid','hash-admin','Admin','MALE',11,12),('a','a@test.invalid','hash-a','Account A','FEMALE',13,14),
    ('b','b@test.invalid','hash-b','Account B','FEMALE',15,16),('released','released@test.invalid','hash-released','Released','MALE',17,18);
   INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES ('A','A','admin',21,22),('B','B','admin',23,24),('C','C','admin',25,26);
   INSERT INTO ClubAccess(id,clubId,userId,role,status,createdAt,updatedAt) VALUES
    ('admin-a','A','admin','OWNER','ACTIVE',31,32),('admin-b','B','admin','OWNER','ACTIVE',33,34),('admin-c','C','admin','OWNER','ACTIVE',35,36),
    ('a-a','A','a','MEMBER','REVOKED',37,38),('a-b','B','a','MEMBER','ACTIVE',39,40),('a-c','C','a','MEMBER','ACTIVE',41,42),
    ('b-b','B','b','MEMBER','ACTIVE',43,44),('released-a','A','released','MEMBER','REVOKED',45,46);
   INSERT INTO User(id,ownerUserId,name,avatarKey,gender,partnerPreference,elo,createdAt,updatedAt) VALUES
    ('shared','a','Historical Shared','historic-avatar','FEMALE','OPEN',1345,51,52),('disagree','a','Second legacy profile',NULL,'MALE','OPEN',1222,53,54),
    ('agreed','b','Agreed',NULL,'FEMALE','OPEN',1288,55,56),('placeholder',NULL,'Placeholder','old-avatar','MALE','OPEN',998,57,58),
    ('source','released','Released source',NULL,'MALE','OPEN',1122,59,60),('claim-target',NULL,'Old invite target',NULL,'MALE','OPEN',1333,61,62),
    ('p2',NULL,'P2',NULL,'MALE','OPEN',999,63,64),('p3',NULL,'P3',NULL,'MALE','OPEN',1001,65,66);
   INSERT INTO CommunityMember(id,communityId,userId,role,elo,createdAt,archivedAt) VALUES
    ('shared-a','A','shared','STAFF',1345,71,81),('shared-b','B','shared','MEMBER',1111,72,NULL),('disagree-c','C','disagree','MEMBER',1222,73,NULL),
    ('agreed-b','B','agreed','MEMBER',1288,74,NULL),('placeholder-a','A','placeholder','ADMIN',998,75,NULL),
    ('source-a','A','source','MEMBER',1122,76,82),('target-a','A','claim-target','MEMBER',1333,77,NULL);
   INSERT INTO Session(id,code,name,communityId,status,createdAt) VALUES ('history','HISTORY','History','A','COMPLETED',91),('ongoing','ONGOING','Ongoing','B','ACTIVE',92);
   INSERT INTO Court(id,sessionId,courtNumber) VALUES ('court','history',1);
   INSERT INTO SessionPlayer(id,sessionId,userId,matchesPlayed,sessionPoints,lastPartnerId,availableSince,joinedAt,ladderEntryAt) VALUES
    ('historical-seat','history','shared',47,42,'legacy-dangling',101,102,103),('ongoing-seat','ongoing','shared',3,12,'placeholder',104,105,106);
   INSERT INTO Match(id,sessionId,courtId,status,team1User1Id,team1User2Id,team2User1Id,team2User2Id,team1Score,team2Score,winnerTeam,createdAt,completedAt) VALUES
    ('historical-match','history','court','COMPLETED','shared','placeholder','p2','p3',21,17,1,111,112);
   INSERT INTO MatchEloAdjustment(id,matchId,communityId,userId,delta,beforeElo,afterElo,createdAt) VALUES ('rating','historical-match','A','shared',15,1330,1345,121);
   INSERT INTO ClubRatingAdjustment(id,memberId,actorId,actorName,beforeElo,afterElo,reason,createdAt) VALUES ('manual','shared-a','admin','Admin',1300,1330,'Historical reason',122);
   INSERT INTO ClubJoinRequest(id,clubId,userId,kind,status,requestedPlayerId,revision,createdAt,updatedAt) VALUES
    ('incompatible','C','b','OWNED_PLAYER','PENDING','agreed',0,131,132),('normal','A','b','EXISTING_PLAYER','PENDING','placeholder',0,133,134),
    ('terminal','B','a','OWNED_PLAYER','APPROVED','shared',1,135,136);
   INSERT INTO ClubAdmissionEvent(id,admissionRequestId,actorUserId,action,revision,detailsJson,createdAt) VALUES ('terminal-audit','terminal','admin','APPROVE',1,'{"reason":"old immutable history"}',137);
   INSERT INTO PlayerOwnershipRelease(id,clubId,playerId,previousOwnerUserId,actorUserId,accessId,accessRevision,membershipsJson,reason,createdAt) VALUES
    ('old-release','A','source','released','admin','released-a',0,'[{"memberId":"source-a","clubId":"A","archivedAt":82}]','Old approved release',141);
   INSERT INTO PlayerInvitation(id,clubId,playerId,clubMemberId,createdByUserId,tokenHash,expiresAt,createdAt,updatedAt) VALUES
    ('old-invite','A','claim-target','target-a','admin','old-hash',9999999999999,142,143);
   UPDATE PlayerInvitation SET status='REDEEMED',redeemedByUserId='released',redeemedAt=144 WHERE id='old-invite';
   UPDATE User SET ownerUserId='released' WHERE id='claim-target';
   UPDATE ClubAccess SET status='ACTIVE' WHERE id='released-a';
   INSERT INTO PlayerOwnershipReleaseClaim(releaseId,invitationId,actorUserId,createdAt) VALUES ('old-release','old-invite','released',145);
   INSERT INTO PlayerInvitation(id,clubId,playerId,clubMemberId,createdByUserId,purpose,targetAccountUserId,authorizedAccessAction,authorizationReason,authorizerAccessId,authorizerAccessRevision,recipientAccessId,recipientAccessStatus,recipientAccessRole,recipientAccessRevision,tokenHash,expiresAt,createdAt,updatedAt) VALUES
    ('special','A','claim-target','target-a','admin','ACCESS_RESTORE','released','PRESERVE_ACTIVE','Old flow','admin-a',0,'released-a','ACTIVE','MEMBER',1,'special-hash',9999999999999,146,147);
  `);
  return db;
}
function snapshot(db: DatabaseSync) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(table => [String(table.name), {
    columns: db.prepare(`PRAGMA table_info("${table.name}")`).all().map(c => String(c.name)),
    rows: db.prepare(`SELECT * FROM "${table.name}" ORDER BY rowid`).all(),
  }]));
}
describe("club local ownership migration preservation", () => {
  it("preserves every old row/column/password/sport value/audit, except the reviewed pending invalidations", () => {
    const db = fixture();
    try {
      const before = snapshot(db); db.exec(localSql); const after = snapshot(db);
      for (const [table, original] of Object.entries(before)) {
        expect(after[table].columns).toEqual(expect.arrayContaining(original.columns));
        const preserved = after[table].rows.slice(0, original.rows.length).map(row => Object.fromEntries(original.columns.map(column => [column, row[column]])));
        const expected = original.rows.map(row => ({ ...row }));
        if (table === "ClubJoinRequest") {
          const row = expected.find(row => row.id === "incompatible")!;
          const actual = preserved.find(row => row.id === "incompatible")!;
          expect(actual).toMatchObject({ status: "CANCELLED", decision: "CLUB_LOCAL_OWNERSHIP", revision: 1 });
          for (const key of ["status", "decision", "revision", "reviewedAt", "updatedAt"]) row[key] = actual[key];
        }
        if (table === "PlayerInvitation") {
          const row = expected.find(row => row.id === "special")!;
          const actual = preserved.find(row => row.id === "special")!;
          expect(actual).toMatchObject({ status: "REVOKED", revocationReason: "CLUB_LOCAL_OWNERSHIP" });
          for (const key of ["status", "revocationReason", "revokedAt", "updatedAt"]) row[key] = actual[key];
        }
        expect(preserved, table).toEqual(expected);
      }
      expect(db.prepare('SELECT * FROM pragma_foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT id,ratingPolicyVersion FROM Session ORDER BY id').all()).toEqual([{ id: "history", ratingPolicyVersion: 1 }, { id: "ongoing", ratingPolicyVersion: 1 }]);
      expect(db.prepare('SELECT participantAccountId,profileClubId FROM SessionPlayer ORDER BY id').all()).toEqual([{ participantAccountId: null, profileClubId: null }, { participantAccountId: "a", profileClubId: "B" }]);
      expect(db.prepare("SELECT action,detailsJson FROM ClubAdmissionEvent WHERE id='local-ownership-cutover:incompatible'").get()).toMatchObject({ action: "LOCAL_OWNERSHIP_MIGRATION_CANCEL", detailsJson: expect.stringContaining('"kind":"OWNED_PLAYER"') });
      expect(db.prepare("SELECT action,reason FROM PlayerInvitationEvent WHERE invitationId='special' AND action='REVOKED'").get()).toEqual({ action: "REVOKED", reason: "CLUB_LOCAL_OWNERSHIP" });
      expect(db.prepare('SELECT count(*) AS n FROM ClubPlayerOwnershipEvent').get()).toEqual({ n: 0 });
    } finally { db.close(); }
  });
  it("backfills only agreed normalized account preferences, retains archived ownership and freezes old global provenance", () => {
    const db = fixture();
    try {
      db.exec(localSql);
      expect(db.prepare('SELECT id,mixedSideOverride FROM Account WHERE id IN (\'a\',\'b\') ORDER BY id').all()).toEqual([{ id: "a", mixedSideOverride: null }, { id: "b", mixedSideOverride: "UPPER" }]);
      expect(db.prepare("SELECT ownerUserId,ownershipRevision,archivedAt FROM CommunityMember WHERE id='shared-a'").get()).toEqual({ ownerUserId: "a", ownershipRevision: 0, archivedAt: 81 });
      expect(() => db.exec("UPDATE User SET ownerUserId=NULL WHERE id='shared'")).toThrow(/PROVENANCE/);
      expect(() => db.exec("UPDATE CommunityMember SET ownerUserId=NULL WHERE id='shared-a'")).toThrow(/EVENT_REQUIRED/);
      expect(() => db.exec("INSERT OR REPLACE INTO CommunityMember SELECT * FROM CommunityMember WHERE id='shared-a'")).toThrow();
      expect(() => db.exec("UPDATE PlayerOwnershipRelease SET reason='rewrite' WHERE id='old-release'")).toThrow(/CLOSED|IMMUTABLE/);
      expect(() => db.exec("DELETE FROM PlayerOwnershipReleaseClaim WHERE releaseId='old-release'")).toThrow(/IMMUTABLE/);
      expect(db.prepare('SELECT * FROM ClaimReleaseAuthorization').all()).toEqual([]);
    } finally { db.close(); }
  });
  it("leaves duplicate-account and ambiguous legacy seats unbound while binding an exact representing club", () => {
    const db = fixture();
    try {
      db.exec(`
       INSERT INTO Session(id,code,name,communityId,status,createdAt) VALUES ('duplicate','DUPLICATE','Duplicate','B','ACTIVE',201),('ambiguous','AMBIGUOUS','Ambiguous','A','ACTIVE',202),('represented','REPRESENTED','Represented','A','WAITING',203);
       INSERT INTO SessionCommunity(id,sessionId,communityId,role,status,createdAt,updatedAt) VALUES ('duplicate-c','duplicate','C','PARTNER','ACCEPTED',204,205),('ambiguous-b','ambiguous','B','PARTNER','ACCEPTED',206,207),('represented-b','represented','B','PARTNER','ACCEPTED',208,209);
       INSERT INTO SessionPlayer(id,sessionId,userId,representingClubId) VALUES ('duplicate-one','duplicate','shared','B'),('duplicate-two','duplicate','disagree','C'),('ambiguous-one','ambiguous','shared',NULL),('represented-one','represented','shared','B');
      `);
      const before = db.prepare("SELECT * FROM SessionPlayer WHERE sessionId IN ('duplicate','ambiguous','represented') ORDER BY id").all();
      db.exec(localSql);
      const rows = db.prepare("SELECT id,profileClubId,participantAccountId FROM SessionPlayer WHERE sessionId IN ('duplicate','ambiguous','represented') ORDER BY id").all();
      expect(rows).toEqual([
        { id: "ambiguous-one", profileClubId: null, participantAccountId: null },
        { id: "duplicate-one", profileClubId: null, participantAccountId: null },
        { id: "duplicate-two", profileClubId: null, participantAccountId: null },
        { id: "represented-one", profileClubId: "B", participantAccountId: "a" },
      ]);
      const after = db.prepare("SELECT * FROM SessionPlayer WHERE sessionId IN ('duplicate','ambiguous','represented') ORDER BY id").all().map(({ profileClubId: _club, participantAccountId: _account, ...original }) => original);
      expect(after).toEqual(before);
      expect(db.prepare('SELECT * FROM pragma_foreign_key_check').all()).toEqual([]);
    } finally { db.close(); }
  });
});
