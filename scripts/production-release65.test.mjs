import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { ENDPOINT,MIGRATION,SQL_HASH,hash,stable,snapshot,rehearse,apply,inspect,verify,checkBefore,validateReview,REVIEW_FILES } from './production-release65.mjs';
import { splitSql } from './production-release59.mjs';
import { argumentsFor } from './run-production-release65.mjs';
const temp=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(temp,'release65-test-'));
const names=fs.readdirSync('prisma/migrations').filter(n=>/^\d{14}_/.test(n)).sort();
const migrations=names.map(name=>({name,sqlSha256:hash(fs.readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8').replaceAll('\r\n','\n'))}));
const sql=fs.readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`,'utf8').replaceAll('\r\n','\n');
const plan={commit:'a'.repeat(40),planSha256:'b'.repeat(64),migrations,statements:splitSql(sql),fileHashes:Object.fromEntries(REVIEW_FILES.map(f=>[f,hash(fs.readFileSync(f,'utf8').replaceAll('\r\n','\n'))]))};
let number=0;
test.after(()=>{assert.equal(path.dirname(fs.realpathSync(dir)),temp);if(process.platform!=='win32')fs.rmSync(dir,{recursive:true,force:true});});
async function fixture(){
 const source=path.join(dir,`${number++}-source.db`),restored=path.join(dir,`${number++}-restored.db`),sqlite=new DatabaseSync(source,{enableDoubleQuotedStringLiterals:true});
 for(const name of names.filter(n=>n<MIGRATION))sqlite.exec(fs.readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
 sqlite.exec('CREATE TABLE _turso_sql_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 for(const item of migrations.slice(0,64))sqlite.prepare('INSERT INTO _turso_sql_migrations VALUES(?,?)').run(item.name,'preserved-timestamp');
 sqlite.exec(`INSERT INTO Account(id,email,passwordHash,name,createdAt,updatedAt) VALUES('a','fixture@example.invalid','preserved-password','Original',1,2);
 INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES('c','Original club','a',3,4);
 INSERT INTO User(id,name,elo,createdAt,updatedAt) VALUES('p','Original player',1450,5,6);
 INSERT INTO CommunityMember(id,communityId,userId,elo,createdAt) VALUES('m','c','p',1400,7);
 CREATE TABLE _production_release63_freeze(singleton INTEGER PRIMARY KEY,payload TEXT);
 CREATE TABLE _production_release63_receipt(singleton INTEGER PRIMARY KEY,payload TEXT);
 INSERT INTO _production_release63_freeze VALUES(1,'original freeze metadata');
 INSERT INTO _production_release63_receipt VALUES(1,'original immutable release evidence');
 CREATE TABLE _production_release64_receipt(singleton INTEGER PRIMARY KEY,payload TEXT);
 INSERT INTO _production_release64_receipt VALUES(1,'release64 evidence');
 INSERT INTO Community(id,name,createdById,createdAt,updatedAt) VALUES('old-deleted-club','Old deleted club','a',1,1);
 INSERT INTO ClubDeletionReceipt(clubId,clubName,creatorUserId,actorUserId) VALUES('old-deleted-club','Old deleted club','a','a');`);
 const schema=sqlite.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 plan.baselineSchemaSha256=hash(stable(schema));sqlite.close();
 const report=await rehearse(source,restored,plan),db=createClient({url:`file:${source.replaceAll('\\','/')}`});
 return {source,db,report};
}
test('pinned migration and approval/target arguments are mandatory',()=>{
 assert.equal(hash(sql),SQL_HASH);
 const args=['--mode','apply','--release-commit',plan.commit,'--attempt','final1','--confirm-endpoint-sha256',ENDPOINT];
 assert.throws(()=>argumentsFor(args),/APPROVAL_REQUIRED/);
 assert.throws(()=>argumentsFor([...args,'--approved-production-release','--mode','verify']),/ARGUMENTS_INVALID/);
 assert.equal(argumentsFor([...args,'--approved-production-release']).mode,'apply');
 assert.throws(()=>argumentsFor(args.map(x=>x===ENDPOINT?'0'.repeat(64):x)),/PIN_REQUIRED/);
});
test('review evidence must bind real non-author scopes and exact file hashes',()=>{
 const review={passed:true,commit:plan.commit,fileHashes:plan.fileHashes,reviewers:['/root/deletion_review','/root/writer_review'],scopes:['application-migration','production-writer']};
 validateReview(review,plan);
 assert.throws(()=>validateReview({...review,reviewers:['/root','/root/writer_review']},plan),/INDEPENDENT_REVIEW/);
 assert.throws(()=>validateReview({...review,fileHashes:{}},plan),/REVIEW_BINDING/);
});
test('rehearsal and real libSQL apply preserve existing data and reconcile retries',async()=>{
 const {db,report}=await fixture();
 try{
  const before=await snapshot(db);checkBefore(before,plan);
  assert.equal(before.tables.filter(t=>['_production_release63_freeze','_production_release63_receipt'].includes(t.name)).length,2);
  assert.equal((await apply(db,plan,report)).outcome,'committed');
  const after=await inspect(db,plan,report);assert.equal(after.phase,65);
  assert.equal(after.receipt.backupSha256,report.backupSha256);
  assert.equal((await db.execute("SELECT cleanupJson FROM ClubDeletionReceipt WHERE clubId='old-deleted-club'")).rows[0].cleanupJson,null);
  assert.deepEqual(after.current.tables.filter(t=>t.name!=='_production_release65_receipt'),before.tables);
  assert.equal((await apply(db,plan,report)).outcome,'verified-without-writes');
 }finally{db.close();}
});
test('changed user data stops before DDL and leaves every new write intact',async()=>{
 const {db,report}=await fixture();
 try{
  await db.execute("UPDATE Account SET name='New legitimate name' WHERE id='a'");
  await assert.rejects(apply(db,plan,report),/BACKUP_STALE/);
  assert.equal((await inspect(db,plan)).phase,64);
  assert.equal((await db.execute("SELECT name FROM Account WHERE id='a'")).rows[0].name,'New legitimate name');
 }finally{db.close();}
});
test('post-migration verification fails on phase64 and schema drift blocks apply',async()=>{
 const {db,report}=await fixture();
 try{
  await assert.rejects(verify(db,plan,report),/MIGRATION_NOT_APPLIED/);
  await db.execute('CREATE INDEX fixture_drift ON Account(name)');
  await assert.rejects(apply(db,plan,report),/BASELINE_SCHEMA_CHANGED/);
 }finally{db.close();}
});
test('DDL failure rolls back schema, data and ledger together',async()=>{
 const {db,report}=await fixture();
 try{
  const before=await snapshot(db);
  await assert.rejects(apply(db,{...plan,statements:[...plan.statements,'CREATE TABLE Account(id TEXT)']},report));
  assert.equal(stable(await snapshot(db)),stable(before));
 }finally{db.close();}
});
test('lost commit acknowledgement is reconciled from the exact receipt and schema',async()=>{
 const {db,report}=await fixture();
 const wrapped={transaction:async mode=>{
  const tx=await db.transaction(mode);
  if(mode==='write'){const commit=tx.commit.bind(tx);tx.commit=async()=>{await commit();throw new Error('lost acknowledgement');};}
  return tx;
 }};
 try{assert.equal((await apply(wrapped,plan,report)).outcome,'commit-reconciled');}
 finally{db.close();}
});
