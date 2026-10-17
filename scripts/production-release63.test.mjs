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
  snapshot, checkBefore, checkLedger, freezeStatements, freeze, apply, inspect, rehearse, thaw } from './production-release63.mjs';
import { argumentsFor } from './run-production-release63.mjs';
import { verifyHistoricColumns } from './production-release63-preservation.mjs';
import { protectedFile, validateWriterToken } from './production-release63-security.mjs';
import { validateReviewReceipt } from './production-release63.mjs';

const root=path.resolve(import.meta.dirname,'..');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const names=git(['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).trim().split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
const predecessors=names.map(name=>({name,sql:git(['show',`${PREDECESSOR}:prisma/migrations/${name}/migration.sql`])}));
const sql=fs.readFileSync(path.join(root,'prisma/migrations',MIGRATION,'migration.sql'),'utf8').replaceAll('\r\n','\n');
const migrations=[...predecessors,{name:MIGRATION,sql}].map(({name,sql})=>({name,sqlSha256:hash(sql)}));
const commit=git(['rev-parse','HEAD']).trim();
const plan={commit,migrations,statements:splitSql(sql),planSha256:hash(stable({commit,endpoint:ENDPOINT,migrations}))};
const temporaryRoot=fs.realpathSync(os.tmpdir());
const directory=fs.mkdtempSync(path.join(temporaryRoot,'production-release63-test-'));
let counter=0;
test.after(()=>{assert.equal(fs.realpathSync(directory),path.resolve(directory));assert.equal(path.dirname(directory),temporaryRoot);fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});});

function fixture() {
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
  for(const name of ['_production_release59_freeze','_production_release59_receipt','_production_release60_freeze','_production_release60_receipt','_production_release61_freeze','_production_release61_receipt','_production_release62_freeze','_production_release62_receipt'])db.exec(`CREATE TABLE "${name}" (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`);
  db.exec(`INSERT INTO Account(id,email,name,passwordHash,isActive,createdAt,updatedAt) VALUES('review-account','review@example.invalid','Review fixture','synthetic',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('review-club','Review Club','review-account',CURRENT_TIMESTAMP);
    INSERT INTO User(id,name,updatedAt) VALUES('review-player','Historical fixture',CURRENT_TIMESTAMP);
    INSERT INTO CommunityMember(id,communityId,userId,elo) VALUES('review-member','review-club','review-player',1234);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('partner-club','Partner Club','review-account',CURRENT_TIMESTAMP);
    INSERT INTO User(id,name,elo,createdAt,updatedAt) VALUES ('p2','Two',1020,33,34),('p3','Three',1300,35,36),('p4','Four',970,37,38);
    INSERT INTO Session(id,code,name,communityId,status,collabFormat,createdAt) VALUES ('session','LEGACY','Historical friendly','review-club','COMPLETED','INTERCLUB',51);
    INSERT INTO SessionCommunity(id,sessionId,communityId,role,status,createdAt,updatedAt) VALUES ('host','session','review-club','HOST','ACCEPTED',52,53),('partner','session','partner-club','PARTNER','ACCEPTED',54,55);
    INSERT INTO Court(id,sessionId,courtNumber) VALUES ('court','session',1);
    INSERT INTO SessionPlayer(id,sessionId,userId,sessionPoints,matchesPlayed,availableSince,joinedAt,ladderEntryAt) VALUES ('seat','session','review-player',3,1,61,62,63);
    INSERT INTO Match(id,sessionId,courtId,status,team1User1Id,team1User2Id,team2User1Id,team2User2Id,team1Score,team2Score,winnerTeam,createdAt,completedAt) VALUES ('match','session','court','COMPLETED','review-player','p2','p3','p4',21,19,1,71,72);
    INSERT INTO MatchEloAdjustment(id,matchId,communityId,userId,delta,beforeElo,afterElo,createdAt) VALUES ('history','match','review-club','review-player',15,1219,1234,81);`);
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
  const file=fixture(),restored=path.join(directory,`restore-${counter}.db`),report=await rehearse(file,restored,plan);
  return {file,restored,report};
}

test('migration SQL is pinned and contains only reviewed additive DDL',()=>{
  assert.equal(hash(sql),SQL_HASH);assert.equal(migrations.length,63);
  assert.ok(plan.statements.every(s=>/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX)|ALTER TABLE)\b/i.test(s.replace(/--[^\n]*(?:\n|$)/g,'').trim())));
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
  const ledger=migrations.slice(0,62).map(m=>({name:m.name,applied_at:'synthetic'}));
  checkLedger(ledger,plan,62);
  for(const changed of [ledger.slice(1),[...ledger].reverse(),[...ledger,{name:MIGRATION,applied_at:'x'}],ledger.map((r,i)=>i? r:{...r,applied_at:0})])
    assert.throws(()=>checkLedger(changed,plan,62),/LEDGER_INVALID/);
});
test('synthetic predecessor reproduces the exact production schema without personal data',async()=>{
  const file=fixture(),client=native(file);
  try {const tx=await client.transaction('read');const before=await snapshot(tx);await tx.rollback();checkBefore(before,plan);assert.equal(hash(stable(before.schema)),BASELINE_SCHEMA);}
  finally {client.close();}
});
test('offline rehearsal preserves every predecessor row and starts both collaboration tables empty',async()=>{
  const {report}=await prepare();assert.equal(report.foreignKeyViolations,0);assert.equal(report.integrity,'ok');
  assert.equal(report.before.tables.find(t=>t.name==='CommunityMember').count,1);
  assert.equal(report.afterSchema.filter(s=>s.type==='trigger').length>=111,true);
  assert.equal(report.afterTables.find(t=>t.name==='SessionLineupRow').count,0);
  assert.equal(report.afterTables.find(t=>t.name==='SessionCollaborationEvent').count,0);
  assert.equal(report.preservation.legacyCollaborationDefaultsVerified,true);
  assert.equal(report.afterSchema.filter(s=>s.type==='view').length,6);
});
test('freeze blocks all old and newly created application writes and preserves exact history through apply',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {
    assert.equal(client.writes,0);await inspect(client,plan);assert.equal(client.writes,0);
    await freeze(client,plan,report);
    assert.throws(()=>client.db.exec('UPDATE CommunityMember SET elo=900'),/WRITES_FROZEN/);
    assert.throws(()=>client.db.exec('DELETE FROM CommunityMember'),/WRITES_FROZEN/);
    assert.equal((await inspect(client,plan,report)).phase,62);
    assert.equal((await apply(client,plan,report)).outcome,'committed');
    assert.equal((await inspect(client,plan,report)).phase,63);
    const writes=client.writes;assert.equal((await apply(client,plan,report)).outcome,'verified-without-writes');assert.equal(client.writes,writes);
    assert.equal(client.db.prepare(`SELECT count(*) AS n FROM ${RECEIPT}`).get().n,1);
    assert.throws(()=>client.db.exec("INSERT INTO SessionCollaborationEvent(id) VALUES('frozen')"),/WRITES_FROZEN/);
    await thaw(client,plan,report);
    assert.equal(client.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '_release63_block_%'").get().n,0);
    assert.equal(client.db.prepare('SELECT elo FROM CommunityMember').get().elo,1234);
  }finally {client.close();}
});
test('mid-DDL failure rolls back all new objects and ledger while the full freeze remains',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failWrite:5});
  try {await assert.rejects(()=>apply(client,plan,report),/synthetic write failure/);assert.equal((await inspect(client,plan,report)).phase,62);assert.equal(client.db.prepare('SELECT count(*) AS n FROM sqlite_schema WHERE name=?').get('SessionCollaborationEvent').n,0);}
  finally {client.close();}
});
test('lost migration commit acknowledgement reconciles exact receipt and does not resend DDL',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{lostCommit:true});
  try {assert.equal((await apply(client,plan,report)).outcome,'commit-reconciled');assert.equal((await inspect(client,plan,report)).phase,63);}
  finally {client.close();}
});
test('an uncommitted migration failure leaves the predecessor and freeze intact',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failedCommit:true});
  try {await assert.rejects(()=>apply(client,plan,report),/UNCERTAIN_COMMIT_KEEP_FROZEN/);assert.equal((await inspect(client,plan,report)).phase,62);}
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
  try {await freeze(client,plan,report);await apply(client,plan,report);assert.equal((await inspect(client,plan,report)).phase,63);await thaw(client,plan,report);}
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
  try {await freeze(client,plan,report);await apply(client,plan,report);client.db.exec("CREATE TRIGGER _release63_block_unreviewed BEFORE UPDATE ON CommunityMember BEGIN SELECT RAISE(ABORT,'unreviewed'); END");const writes=client.writes;
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


test('every legacy collaboration default is initialized without changing account, match or rating history',async()=>{
  const {file,restored,report}=await prepare();
  const before=new DatabaseSync(file,{readOnly:true}),after=new DatabaseSync(restored,{readOnly:true});
  try {
    assert.equal(verifyHistoricColumns(before,after).credentialsAndSportingHistoryPreserved,true);
    assert.equal(report.preservation.originalRowsPreserved>70,true);
    assert.deepEqual({...after.prepare('SELECT collaborationVersion,schedulingMode,scoringFormat,ratingMode,rulesRevision,resultsRevision FROM Session').get()},
      {collaborationVersion:1,schedulingMode:'FREE_PLAY',scoringFormat:'SINGLE_GAME',ratingMode:'RATED',rulesRevision:0,resultsRevision:0});
    assert.deepEqual({...after.prepare('SELECT scoringFormat,gameScoresJson,scoreRevision,team1Score,team2Score,winnerTeam FROM Match').get()},
      {scoringFormat:'SINGLE_GAME',gameScoresJson:null,scoreRevision:0,team1Score:21,team2Score:19,winnerTeam:1});
    assert.equal(after.prepare('SELECT hasStartedMatch FROM SessionPlayer').get().hasStartedMatch,0);
    assert.deepEqual(after.prepare('SELECT resetConfirmedRevision,rulesConfirmedRevision FROM SessionCommunity').all().map(row=>({...row})),
      [{resetConfirmedRevision:null,rulesConfirmedRevision:null},{resetConfirmedRevision:null,rulesConfirmedRevision:null}]);
    assert.equal(after.prepare('SELECT passwordHash FROM Account').get().passwordHash,'synthetic');
    assert.deepEqual({...after.prepare('SELECT delta,beforeElo,afterElo FROM MatchEloAdjustment').get()},{delta:15,beforeElo:1219,afterElo:1234});
  }finally {before.close();after.close();}
});
for(const [name,sql,code] of [
  ['credential change',"UPDATE Account SET passwordHash='changed'",'ORIGINAL_COLUMN_CHANGED'],
  ['historical score change','UPDATE Match SET team1Score=22','ORIGINAL_COLUMN_CHANGED'],
  ['rating history change','UPDATE MatchEloAdjustment SET delta=16','ORIGINAL_COLUMN_CHANGED'],
  ['legacy defaults changed',"UPDATE Session SET schedulingMode='FIXED_LINEUP'",'COLLABORATION_DEFAULT_INVALID'],
  ['historic participant flag changed','UPDATE SessionPlayer SET hasStartedMatch=1','COLLABORATION_DEFAULT_INVALID'],
  ['unexpected data in a new audit table',"INSERT INTO SessionCollaborationEvent(id,sessionId,actorUserId,action,detailsJson) VALUES('extra','session','review-account','changed','{}')",'COLLABORATION_TABLES_NOT_EMPTY'],
  ['removed historical row',"DELETE FROM MatchEloAdjustment WHERE id='history'",'ORIGINAL_ROW_MISSING'],
  ['extra historical row',"INSERT INTO Account(id,email,name,passwordHash,updatedAt) VALUES('extra','extra@example.invalid','Extra','extra',CURRENT_TIMESTAMP)",'ORIGINAL_TABLE_COUNT_CHANGED'],
  ['removed historical index','DROP INDEX CommunityMember_communityId_userId_key','ORIGINAL_SCHEMA_OBJECT_CHANGED'],
])test(`independent preservation rejects ${name}`,async()=>{
  const {file,restored}=await prepare(),before=new DatabaseSync(file,{readOnly:true}),after=new DatabaseSync(restored);
  try {after.exec(sql);assert.throws(()=>verifyHistoricColumns(before,after),new RegExp(code));}
  finally {before.close();after.close();}
});

test('read-only verification rejects added schema objects before any writer operation',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {
    await freeze(client,plan,report);client.db.exec('CREATE INDEX unreviewed_session_index ON Session(name)');const writes=client.writes;
    await assert.rejects(()=>apply(client,plan,report),/SCHEMA_DRIFT/);assert.equal(client.writes,writes);
  }finally {client.close();}
});
test('all new collaboration tables receive insert, update and delete fences',()=>{
  const statements=freezeStatements({tables:[{name:'Account'},{name:'Session'},{name:'_production_release62_receipt'}]});
  assert.equal(statements.length,18);
  for(const table of ['Account','Session','_production_release62_receipt','_turso_sql_migrations','SessionLineupRow','SessionCollaborationEvent'])
    assert.equal(statements.filter(s=>s.table===table).length,3);
});
test('independent review rejects every implementing author, duplicate identities, stale hashes and missing scopes',()=>{
  const reviewed={...plan,reviewedFileHashes:{writer:'a'.repeat(64)}};
  const valid={passed:true,commit:plan.commit,reviewers:['/root/review-a','/root/review-b'],scopes:['collaboration-migration','production-release'],fileHashes:reviewed.reviewedFileHashes};
  assert.doesNotThrow(()=>validateReviewReceipt(valid,reviewed));
  for(const author of ['/root','/root/release63_writer','/root/scoring_implementation','/root/collaboration_permissions','/root/collaboration_ui','/root/release63_runtime'])
    assert.throws(()=>validateReviewReceipt({...valid,reviewers:[author,'/root/review-b']},reviewed),/SEPARATE_RELEASE_REVIEW_REQUIRED/);
  for(const changed of [{reviewers:['/root/review-a','/root/review-a']},{fileHashes:{}},{scopes:['collaboration-migration']},{commit:'0'.repeat(40)}])
    assert.throws(()=>validateReviewReceipt({...valid,...changed},reviewed),/SEPARATE_RELEASE_REVIEW_REQUIRED/);
});
test('dedicated writer requires a valid unscoped read-write JWT with at most 24 hours remaining',()=>{
  const now=Date.now(),seconds=Math.floor(now/1000);
  const jwt=claims=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  const claims={a:'rw',iat:seconds,exp:seconds+3600};
  assert.doesNotThrow(()=>validateWriterToken(jwt(claims),now));
  for(const changed of [{a:'ro'},{a:'ddl'},{p:{rw:{ns:['production']}}},{exp:seconds},{exp:seconds+86401},{nbf:seconds+1},{nbf:'0'},{iat:seconds-86400}])
    assert.throws(()=>validateWriterToken(jwt({...claims,...changed}),now),/SHORT_LIVED_WRITER_REQUIRED/);
  for(const token of ['',null,'a.b.c','a..c',jwt([])])assert.throws(()=>validateWriterToken(token,now),/TOKEN_INVALID|SHORT_LIVED_WRITER_REQUIRED/);
});
test('protected release paths reject prior releases, local credentials, traversal and symlinks',()=>{
  for(const relative of ['.env.local','private/development-target.json','private/production-release62/writer.env','private/production-release63/../writer.env','private/production-release63/writer.stdout'])
    assert.throws(()=>protectedFile(directory,relative),/PRIVATE_PATH_INVALID/);
  if(process.platform==='win32')return;
  // Use a real /private ancestor on macOS, where /var is itself a system symlink.
  fs.mkdirSync(path.join(directory,'private'),{mode:0o700});
  fs.mkdirSync(path.join(directory,'private/production-release63'),{mode:0o700});
  const target=path.join(directory,'private/production-release63/safe.json');
  fs.writeFileSync(target,'{}',{mode:0o600});
  assert.equal(protectedFile(directory,'private/production-release63/safe.json'),target);
  fs.symlinkSync(target,path.join(directory,'private/production-release63/linked.json'));
  assert.throws(()=>protectedFile(directory,'private/production-release63/linked.json'),/PRIVATE_PATH_UNSAFE/);
  fs.chmodSync(target,0o644);assert.throws(()=>protectedFile(directory,'private/production-release63/safe.json'),/PRIVATE_MODE_INVALID/);
});
