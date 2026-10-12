import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { splitSql } from './production-release59.mjs';
import { ENDPOINT, PREDECESSOR, MIGRATION, SQL_HASH, BASELINE_SCHEMA, CONTROL, RECEIPT, hash, stable,
  snapshot, checkBefore, checkLedger, freezeStatements, freeze, apply, inspect, rehearse, thaw } from './production-release61.mjs';
import { argumentsFor } from './run-production-release61.mjs';
import { PROJECT, TEAM, ALIASES, PREVIOUS_DEPLOYMENT, PREVIOUS_HOST, LEGACY_HASH, canonicalRules, sameConditions, validateMaintenance, validateDeployment } from './production-release61-evidence.mjs';

const root=path.resolve(import.meta.dirname,'..');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const names=git(['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).trim().split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
const predecessors=names.map(name=>({name,sql:git(['show',`${PREDECESSOR}:prisma/migrations/${name}/migration.sql`])}));
const sql=fs.readFileSync(path.join(root,'prisma/migrations',MIGRATION,'migration.sql'),'utf8').replaceAll('\r\n','\n');
const migrations=[...predecessors,{name:MIGRATION,sql}].map(({name,sql})=>({name,sqlSha256:hash(sql)}));
const commit=git(['rev-parse','HEAD']).trim();
const plan={commit,migrations,statements:splitSql(sql),planSha256:hash(stable({commit,endpoint:ENDPOINT,migrations}))};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'production-release61-test-'));
let counter=0;
test.after(()=>{assert.equal(fs.realpathSync(directory),path.resolve(directory));assert.equal(path.dirname(directory),os.tmpdir());fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});});

function fixture({ pending = false } = {}) {
  const file=path.join(directory,`${++counter}.db`),db=new DatabaseSync(file,{enableDoubleQuotedStringLiterals:true});
  for(const migration of predecessors) {
    if(migration.name==='20260403075615_add_test_sessions') {
      const existing=new Set(db.prepare('PRAGMA table_info(Session)').all().map(row=>row.name));
      for(const [name,definition] of [['poolsEnabled','BOOLEAN NOT NULL DEFAULT false'],['poolAName','TEXT'],['poolBName','TEXT'],['poolACourtAssignments','INTEGER NOT NULL DEFAULT 0'],['poolAMissedTurns','INTEGER NOT NULL DEFAULT 0'],['poolBCourtAssignments','INTEGER NOT NULL DEFAULT 0'],['poolBMissedTurns','INTEGER NOT NULL DEFAULT 0'],['crossoverMissThreshold','INTEGER NOT NULL DEFAULT 1']])
        if(!existing.has(name))db.exec(`ALTER TABLE Session ADD COLUMN "${name}" ${definition}`);
    }
    db.exec(migration.sql);
  }
  db.exec('CREATE TABLE "_turso_sql_migrations" (\n      name TEXT PRIMARY KEY,\n      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n    )');
  for(const migration of predecessors)db.prepare('INSERT INTO _turso_sql_migrations VALUES(?,?)').run(migration.name,`synthetic-${migration.name}`);
  // These completed cutover metadata tables exist in the predecessor schema.
  for(const name of ['_production_release59_freeze','_production_release59_receipt','_production_release60_freeze','_production_release60_receipt'])db.exec(`CREATE TABLE "${name}" (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`);
  db.exec(`INSERT INTO Account(id,email,name,passwordHash,isActive,createdAt,updatedAt) VALUES('review-account','review@example.invalid','Review fixture','synthetic',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('review-club','Review Club','review-account',CURRENT_TIMESTAMP);
    INSERT INTO User(id,name,updatedAt) VALUES('review-player','Historical fixture',CURRENT_TIMESTAMP);
    INSERT INTO CommunityMember(id,communityId,userId,elo) VALUES('review-member','review-club','review-player',1234);`);
  if (pending) db.exec(fs.readFileSync(path.join(root,'scripts/fixtures/release61-preservation.sql'),'utf8'));
  db.close();return file;
}
function native(file,{failWrite=-1,lostCommit=false,failedCommit=false}={}) {
  const db=new DatabaseSync(file,{enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:true});let writes=0;
  const execute=async input=>{
    const {sql,args=[]}=typeof input==='string'?{sql:input}:input;
    if(!/^(?:SELECT|PRAGMA)/i.test(sql)) {writes++;if(writes===failWrite)throw new Error('synthetic write failure');}
    return {rows:db.prepare(sql).all(...args)};
  };
  return {db,execute,get writes(){return writes;},close:()=>db.close(),transaction:async mode=>{
    db.exec(mode==='write'?'BEGIN IMMEDIATE':'BEGIN');
    return {execute,batch:async inputs=>{const results=[];for(const input of inputs)results.push(await execute(input));return results;},
      commit:async()=>{if(mode==='write'&&failedCommit)throw new Error('synthetic aborted commit');db.exec('COMMIT');if(mode==='write'&&lostCommit)throw new Error('synthetic lost acknowledgement');},
      rollback:async()=>{if(db.isTransaction)db.exec('ROLLBACK');},close(){}};
  }};
}
async function prepare() {
  const file=fixture(),report=await rehearse(file,path.join(directory,`restore-${counter}.db`),plan);
  return {file,report};
}

test('migration SQL is pinned and contains only reviewed DDL and audited backfill statements',()=>{
  assert.equal(hash(sql),SQL_HASH);assert.equal(migrations.length,61);
  assert.ok(plan.statements.every(s=>/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER|VIEW)|DROP (?:TRIGGER|VIEW)|ALTER TABLE|WITH|UPDATE|INSERT INTO)\b/i.test(s.replace(/--[^\n]*(?:\n|$)/g,'').trim())));
});
test('CLI rejects writes without explicit approval and exact source/endpoint pins',()=>{
  const pinned=['--release-commit',commit,'--confirm-endpoint-sha256',ENDPOINT];
  for(const mode of ['--freeze','--apply','--thaw'])assert.throws(()=>argumentsFor([mode,...pinned]),/APPROVAL_REQUIRED/);
  assert.throws(()=>argumentsFor(['--apply','--approved-production-release']),/PIN_REQUIRED/);
  assert.throws(()=>argumentsFor(['--backup','--backup',...pinned]),/ARGUMENTS_INVALID/);
  assert.throws(()=>argumentsFor(['--backup','--apply',...pinned]),/ARGUMENTS_INVALID/);
  assert.throws(()=>argumentsFor(['--backup',...pinned,'--database-url','file:fixture']),/ARGUMENTS_INVALID/);
  assert.equal(argumentsFor(['--apply','--approved-production-release',...pinned]).mode,'--apply');
});
test('ledger prefix rejects missing, reordered, extra, and malformed history',()=>{
  const ledger=migrations.slice(0,60).map(m=>({name:m.name,applied_at:'synthetic'}));
  checkLedger(ledger,plan,60);
  for(const changed of [ledger.slice(1),[...ledger].reverse(),[...ledger,{name:MIGRATION,applied_at:'x'}],ledger.map((r,i)=>i? r:{...r,applied_at:0})])
    assert.throws(()=>checkLedger(changed,plan,60),/LEDGER_INVALID/);
});
test('synthetic predecessor reproduces the exact production schema without personal data',async()=>{
  const file=fixture(),client=native(file);
  try {const tx=await client.transaction('read');const before=await snapshot(tx);await tx.rollback();checkBefore(before,plan);assert.equal(hash(stable(before.schema)),BASELINE_SCHEMA);}
  finally {client.close();}
});
test('offline rehearsal preserves every predecessor row and starts both audit tables empty',async()=>{
  const {report}=await prepare();assert.equal(report.foreignKeyViolations,0);assert.equal(report.integrity,'ok');
  assert.equal(report.before.tables.find(t=>t.name==='CommunityMember').count,1);
  assert.equal(report.afterSchema.filter(s=>s.type==='trigger').length>=111,true);
  assert.equal(report.afterSchema.filter(s=>s.type==='view').length,6);
});
test('freeze blocks all old and newly created application writes and preserves exact history through apply',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {
    assert.equal(client.writes,0);await inspect(client,plan);assert.equal(client.writes,0);
    await freeze(client,plan,report);
    assert.throws(()=>client.db.exec('UPDATE CommunityMember SET elo=900'),/WRITES_FROZEN/);
    assert.throws(()=>client.db.exec('DELETE FROM CommunityMember'),/WRITES_FROZEN/);
    assert.equal((await inspect(client,plan,report)).phase,60);
    assert.equal((await apply(client,plan,report)).outcome,'committed');
    assert.equal((await inspect(client,plan,report)).phase,61);
    const writes=client.writes;assert.equal((await apply(client,plan,report)).outcome,'verified-without-writes');assert.equal(client.writes,writes);
    assert.equal(client.db.prepare(`SELECT count(*) AS n FROM ${RECEIPT}`).get().n,1);
    assert.throws(()=>client.db.exec("INSERT INTO ClubPlayerOwnershipEvent(id) VALUES('frozen')"),/WRITES_FROZEN/);
    await thaw(client,plan,report);
    assert.equal(client.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '_release61_block_%'").get().n,0);
    assert.equal(client.db.prepare('SELECT elo FROM CommunityMember').get().elo,1234);
  }finally {client.close();}
});
test('mid-DDL failure rolls back all new objects and ledger while the full freeze remains',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failWrite:5});
  try {await assert.rejects(()=>apply(client,plan,report),/synthetic write failure/);assert.equal((await inspect(client,plan,report)).phase,60);assert.equal(client.db.prepare('SELECT count(*) AS n FROM sqlite_schema WHERE name=?').get('ClubPlayerOwnershipEvent').n,0);}
  finally {client.close();}
});
test('lost migration commit acknowledgement reconciles exact receipt and does not resend DDL',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{lostCommit:true});
  try {assert.equal((await apply(client,plan,report)).outcome,'commit-reconciled');assert.equal((await inspect(client,plan,report)).phase,61);}
  finally {client.close();}
});
test('an uncommitted migration failure leaves the predecessor and freeze intact',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failedCommit:true});
  try {await assert.rejects(()=>apply(client,plan,report),/UNCERTAIN_COMMIT_KEEP_FROZEN/);assert.equal((await inspect(client,plan,report)).phase,60);}
  finally {client.close();}
});
test('freeze refuses a stale backup before any writes',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {client.db.exec('UPDATE CommunityMember SET elo=1200');await assert.rejects(()=>freeze(client,plan,report),/BACKUP_STALE/);assert.equal(client.writes,0);assert.equal(client.db.prepare('SELECT count(*) AS n FROM sqlite_schema WHERE name=?').get(CONTROL).n,0);}
  finally {client.close();}
});
test('partial or modified freeze inventory is rejected before migration writes',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {await freeze(client,plan,report);client.db.exec(`DROP TRIGGER "${freezeStatements(report.before)[0].name}"`);const writes=client.writes;await assert.rejects(()=>apply(client,plan,report),/FREEZE_TRIGGER_INVENTORY_INVALID/);assert.equal(client.writes,writes);}
  finally {client.close();}
});
test('file-backed libSQL uses the same atomic freeze, apply, read verification, and thaw',async()=>{
  const {file,report}=await prepare(),client=createClient({url:`file:${file}`});
  try {await freeze(client,plan,report);await apply(client,plan,report);assert.equal((await inspect(client,plan,report)).phase,61);await thaw(client,plan,report);}
  finally {client.close();}
});
test('lost freeze commit acknowledgement reconciles a full frozen baseline and replay is read-only',async()=>{
  const {file,report}=await prepare(),client=native(file,{lostCommit:true});
  try {assert.equal((await freeze(client,plan,report)).outcome,'commit-reconciled');assert.equal((await inspect(client,plan,report)).writesFrozen,true);
    const writes=client.writes;assert.equal((await freeze(client,plan,report)).outcome,'verified-without-writes');assert.equal(client.writes,writes);}
  finally {client.close();}
});
test('lost thaw commit acknowledgement reconciles zero blockers and replay is read-only',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);await apply(client,plan,report);client.close();client=native(file,{lostCommit:true});
  try {assert.equal((await thaw(client,plan,report)).outcome,'commit-reconciled');assert.equal((await inspect(client,plan,report)).writesFrozen,false);
    const writes=client.writes;assert.equal((await thaw(client,plan,report)).outcome,'verified-without-writes');assert.equal(client.writes,writes);}
  finally {client.close();}
});
test('an aborted thaw preserves the complete database freeze',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);await apply(client,plan,report);client.close();client=native(file,{failedCommit:true});
  try {await assert.rejects(()=>thaw(client,plan,report),/UNCERTAIN_THAW_KEEP_HTTP_FENCE/);assert.equal((await inspect(client,plan,report)).writesFrozen,true);}
  finally {client.close();}
});
test('extra blocker inventory is rejected instead of falsely reporting a successful thaw',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {await freeze(client,plan,report);await apply(client,plan,report);client.db.exec("CREATE TRIGGER _release61_block_unreviewed BEFORE UPDATE ON CommunityMember BEGIN SELECT RAISE(ABORT,'unreviewed'); END");const writes=client.writes;
    await assert.rejects(()=>thaw(client,plan,report),/FREEZE_TRIGGER_INVENTORY_INVALID/);assert.equal(client.writes,writes);}
  finally {client.close();}
});
test('tampered receipt SQL pin is rejected during read-only post-verification',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {await freeze(client,plan,report);await apply(client,plan,report);const row=client.db.prepare(`SELECT payload FROM ${RECEIPT}`).get();const payload={...JSON.parse(row.payload),sqlSha256:'0'.repeat(64)};
    client.db.prepare(`UPDATE ${RECEIPT} SET payload=?`).run(stable(payload));const writes=client.writes;await assert.rejects(()=>inspect(client,plan,report),/RECEIPT_INVALID/);assert.equal(client.writes,writes);}
  finally {client.close();}
});
test('replacement metadata table definition is rejected despite identical control payload',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {await freeze(client,plan,report);const payload=client.db.prepare(`SELECT payload FROM ${CONTROL}`).get().payload;client.db.exec(`DROP TABLE ${CONTROL}; CREATE TABLE ${CONTROL}(singleton INTEGER PRIMARY KEY,payload TEXT NOT NULL)`);
    client.db.prepare(`INSERT INTO ${CONTROL} VALUES(1,?)`).run(payload);const writes=client.writes;await assert.rejects(()=>inspect(client,plan,report),/FREEZE_SCHEMA_INVALID/);assert.equal(client.writes,writes);}
  finally {client.close();}
});

test('audited pending invalidation compares equal across independent rehearsal and actual apply clocks and IDs',async()=>{
  const file=fixture({pending:true});
  const report=await rehearse(file,path.join(directory,`restore-pending-${counter}.db`),plan);
  assert.equal(report.preservation.cancelledRequests,1);
  assert.equal(report.preservation.revokedInvitations,1);
  const client=native(file);
  try {
    await freeze(client,plan,report);await apply(client,plan,report);
    assert.equal((await inspect(client,plan,report)).phase,61);
    assert.equal(client.db.prepare("SELECT status FROM ClubJoinRequest WHERE id='incompatible'").get().status,'CANCELLED');
    assert.equal(client.db.prepare("SELECT status FROM PlayerInvitation WHERE id='special'").get().status,'REVOKED');
    assert.equal(client.db.prepare("SELECT detailsJson FROM ClubAdmissionEvent WHERE id='terminal-audit'").get().detailsJson,'{"reason":"old immutable history"}');
    assert.equal(client.db.prepare("SELECT passwordHash FROM Account WHERE id='a'").get().passwordHash,'hash-a');
    assert.equal(client.db.prepare("SELECT elo FROM CommunityMember WHERE id='shared-a'").get().elo,1345);
  } finally {client.close();}
});

