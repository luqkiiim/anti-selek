import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { freezeStatements, validateReviewReceipt, MIGRATION, SQL_HASH, hash } from './production-release62.mjs';
import { expectedMembershipOverride, verifyHistoricColumns } from './production-release62-preservation.mjs';

const seed = `
  PRAGMA foreign_keys=ON;
  CREATE TABLE Account(id TEXT PRIMARY KEY,passwordHash TEXT,name TEXT);
  CREATE TABLE User(id TEXT PRIMARY KEY,gender TEXT,mixedSideOverride TEXT,partnerPreference TEXT);
  CREATE TABLE CommunityMember(id TEXT PRIMARY KEY,userId TEXT REFERENCES User(id),communityId TEXT,ownerUserId TEXT,retiredByAdmissionEventId TEXT);
  CREATE TABLE Session(id TEXT PRIMARY KEY,status TEXT,createdAt TEXT);
  CREATE TABLE Match(id TEXT PRIMARY KEY,sessionId TEXT REFERENCES Session(id),score TEXT);
  CREATE TABLE ClubPlayerOwnershipEvent(id TEXT PRIMARY KEY,detailsJson TEXT);
  INSERT INTO Account VALUES('account','preserved-hash','Original');
  INSERT INTO User VALUES('shared','FEMALE',NULL,'OPEN'),('explicit','FEMALE','LOWER','OPEN');
  INSERT INTO CommunityMember VALUES('a','shared','club-a','account',NULL),('b','shared','club-b','account','retained-retirement'),('c','explicit','club-c','account',NULL);
  CREATE TRIGGER "ClubMember_retirement_preserve" BEFORE UPDATE ON "CommunityMember"
  WHEN OLD."retiredByAdmissionEventId" IS NOT NULL
  BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
  INSERT INTO Session VALUES('session','COMPLETED','2026-01-01');
  INSERT INTO Match VALUES('match','session','21-19');
  INSERT INTO ClubPlayerOwnershipEvent VALUES('audit','{"historical":true}');
`;
function fixtures() {
  const before = new DatabaseSync(':memory:');
  const after = new DatabaseSync(':memory:');
  before.exec(seed); after.exec(seed);
  after.exec(fs.readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`, 'utf8'));
  return { before, after, close() { before.close(); after.close(); } };
}

test('pinned migration preserves every original value and initializes shared memberships independently', () => {
  const f = fixtures();
  try {
    assert.equal(hash(fs.readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`, 'utf8')), SQL_HASH);
    const report = verifyHistoricColumns(f.before, f.after);
    assert.equal(report.membershipsBackfilled, 3);
    assert.equal(report.credentialsAndSportingHistoryPreserved, true);
    assert.deepEqual(f.after.prepare('SELECT mixedSideOverride FROM CommunityMember ORDER BY id').all().map(r => r.mixedSideOverride), ['UPPER', 'UPPER', null]);
  } finally { f.close(); }
});

for (const [name, sql, code] of [
  ['credential change', "UPDATE Account SET passwordHash='changed'", 'ORIGINAL_COLUMN_CHANGED'],
  ['historical score change', "UPDATE Match SET score='changed'", 'ORIGINAL_COLUMN_CHANGED'],
  ['audit change', "UPDATE ClubPlayerOwnershipEvent SET detailsJson='{}'", 'ORIGINAL_COLUMN_CHANGED'],
  ['removed membership', "DELETE FROM CommunityMember WHERE id='a'", 'ORIGINAL_ROW_MISSING'],
  ['extra membership', "INSERT INTO CommunityMember VALUES('extra','shared','extra','account',NULL,NULL)", 'ORIGINAL_TABLE_COUNT_CHANGED'],
  ['wrong explicit precedence', "UPDATE CommunityMember SET mixedSideOverride='UPPER' WHERE id='c'", 'PAIRING_BACKFILL_INVALID'],
]) test(`preservation rejects ${name}`, () => {
  const f = fixtures();
  try { f.after.exec(sql); assert.throws(() => verifyHistoricColumns(f.before, f.after), new RegExp(code)); }
  finally { f.close(); }
});

test('explicit incompatible override suppresses legacy preference fallback', () => {
  assert.equal(expectedMembershipOverride({ gender: 'FEMALE', mixedSideOverride: 'LOWER', partnerPreference: 'OPEN' }), null);
  assert.equal(expectedMembershipOverride({ gender: 'MALE', mixedSideOverride: null, partnerPreference: 'FEMALE_FLEX' }), 'LOWER');
});

test('freeze covers every original application table and migration ledger', () => {
  const statements = freezeStatements({ tables: [{ name: 'Account' }, { name: 'CommunityMember' }, { name: '_production_release61_receipt' }] });
  assert.equal(statements.length, 12);
  assert.ok(statements.every(s => s.sql.includes('PRODUCTION_RELEASE62_WRITES_FROZEN')));
  assert.ok(statements.some(s => s.table === '_production_release61_receipt'));
});

test('independent receipt rejects authors, stale hashes and missing scopes', () => {
  const plan = { commit: 'a'.repeat(40), reviewedFileHashes: { writer: 'b'.repeat(64) } };
  const valid = { passed: true, commit: plan.commit, reviewers: ['/root/review-a', '/root/review-b'], scopes: ['pairing-migration', 'production-release'], fileHashes: plan.reviewedFileHashes };
  assert.doesNotThrow(() => validateReviewReceipt(valid, plan));
  assert.throws(() => validateReviewReceipt({ ...valid, reviewers: ['/root', '/root/review-b'] }, plan), /SEPARATE_RELEASE_REVIEW_REQUIRED/);
  assert.throws(() => validateReviewReceipt({ ...valid, fileHashes: {} }, plan), /SEPARATE_RELEASE_REVIEW_REQUIRED/);
  assert.throws(() => validateReviewReceipt({ ...valid, scopes: ['pairing-migration'] }, plan), /SEPARATE_RELEASE_REVIEW_REQUIRED/);
});
