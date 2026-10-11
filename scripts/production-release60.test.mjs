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
  snapshot, checkBefore, checkLedger, freezeStatements, freeze, apply, inspect, rehearse, thaw } from './production-release60.mjs';
import { argumentsFor } from './run-production-release60.mjs';
import { PROJECT, TEAM, ALIASES, PREVIOUS_DEPLOYMENT, PREVIOUS_HOST, LEGACY_HASH, canonicalRules, sameConditions, validateMaintenance, validateDeployment } from './production-release60-evidence.mjs';

const root=path.resolve(import.meta.dirname,'..');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const names=git(['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).trim().split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
const predecessors=names.map(name=>({name,sql:git(['show',`${PREDECESSOR}:prisma/migrations/${name}/migration.sql`])}));
const sql=fs.readFileSync(path.join(root,'prisma/migrations',MIGRATION,'migration.sql'),'utf8').replaceAll('\r\n','\n');
const migrations=[...predecessors,{name:MIGRATION,sql}].map(({name,sql})=>({name,sqlSha256:hash(sql)}));
const commit=git(['rev-parse','HEAD']).trim();
const plan={commit,migrations,statements:splitSql(sql),planSha256:hash(stable({commit,endpoint:ENDPOINT,migrations}))};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'production-release60-test-'));
let counter=0;
test.after(()=>{assert.equal(fs.realpathSync(directory),path.resolve(directory));assert.equal(path.dirname(directory),os.tmpdir());fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:50});});

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
  for(const name of ['_production_release59_freeze','_production_release59_receipt'])db.exec(`CREATE TABLE "${name}" (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`);
  db.exec(`INSERT INTO Account(id,email,name,passwordHash,isActive,createdAt,updatedAt) VALUES('review-account','review@example.invalid','Review fixture','synthetic',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('review-club','Review Club','review-account',CURRENT_TIMESTAMP);
    INSERT INTO User(id,name,updatedAt) VALUES('review-player','Historical fixture',CURRENT_TIMESTAMP);
    INSERT INTO CommunityMember(id,communityId,userId,elo) VALUES('review-member','review-club','review-player',1234);`);
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

test('migration SQL is pinned and contains only trigger-safe DDL statements',()=>{
  assert.equal(hash(sql),SQL_HASH);assert.equal(migrations.length,60);
  assert.ok(plan.statements.every(s=>/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER|VIEW)|DROP TRIGGER)\b/i.test(s.replace(/--[^\n]*(?:\n|$)/g,'').trim())));
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
  const ledger=migrations.slice(0,59).map(m=>({name:m.name,applied_at:'synthetic'}));
  checkLedger(ledger,plan,59);
  for(const changed of [ledger.slice(1),[...ledger].reverse(),[...ledger,{name:MIGRATION,applied_at:'x'}],ledger.map((r,i)=>i? r:{...r,applied_at:0})])
    assert.throws(()=>checkLedger(changed,plan,59),/LEDGER_INVALID/);
});
test('synthetic predecessor reproduces the exact production schema without personal data',async()=>{
  const file=fixture(),client=native(file);
  try {const tx=await client.transaction('read');const before=await snapshot(tx);await tx.rollback();checkBefore(before,plan);assert.equal(hash(stable(before.schema)),BASELINE_SCHEMA);}
  finally {client.close();}
});
test('offline rehearsal preserves every predecessor row and starts both audit tables empty',async()=>{
  const {report}=await prepare();assert.equal(report.foreignKeyViolations,0);assert.equal(report.integrity,'ok');
  assert.equal(report.before.tables.find(t=>t.name==='CommunityMember').count,1);
  assert.equal(report.afterSchema.filter(s=>s.type==='trigger').length,90);
  assert.equal(report.afterSchema.filter(s=>s.type==='view').length,5);
});
test('freeze blocks all old and newly created application writes and preserves exact history through apply',async()=>{
  const {file,report}=await prepare(),client=native(file);
  try {
    assert.equal(client.writes,0);await inspect(client,plan);assert.equal(client.writes,0);
    await freeze(client,plan,report);
    assert.throws(()=>client.db.exec('UPDATE CommunityMember SET elo=900'),/WRITES_FROZEN/);
    assert.throws(()=>client.db.exec('DELETE FROM CommunityMember'),/WRITES_FROZEN/);
    assert.equal((await inspect(client,plan,report)).phase,59);
    assert.equal((await apply(client,plan,report)).outcome,'committed');
    assert.equal((await inspect(client,plan,report)).phase,60);
    const writes=client.writes;assert.equal((await apply(client,plan,report)).outcome,'verified-without-writes');assert.equal(client.writes,writes);
    assert.equal(client.db.prepare(`SELECT count(*) AS n FROM ${RECEIPT}`).get().n,1);
    assert.throws(()=>client.db.exec("INSERT INTO PlayerOwnershipRelease(id) VALUES('frozen')"),/WRITES_FROZEN/);
    await thaw(client,plan,report);
    assert.equal(client.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '_release60_block_%'").get().n,0);
    assert.equal(client.db.prepare('SELECT elo FROM CommunityMember').get().elo,1234);
  }finally {client.close();}
});
test('mid-DDL failure rolls back all new objects and ledger while the full freeze remains',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failWrite:5});
  try {await assert.rejects(()=>apply(client,plan,report),/synthetic write failure/);assert.equal((await inspect(client,plan,report)).phase,59);assert.equal(client.db.prepare('SELECT count(*) AS n FROM sqlite_schema WHERE name=?').get('PlayerOwnershipRelease').n,0);}
  finally {client.close();}
});
test('lost migration commit acknowledgement reconciles exact receipt and does not resend DDL',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{lostCommit:true});
  try {assert.equal((await apply(client,plan,report)).outcome,'commit-reconciled');assert.equal((await inspect(client,plan,report)).phase,60);}
  finally {client.close();}
});
test('an uncommitted migration failure leaves the predecessor and freeze intact',async()=>{
  const {file,report}=await prepare();let client=native(file);await freeze(client,plan,report);client.close();client=native(file,{failedCommit:true});
  try {await assert.rejects(()=>apply(client,plan,report),/UNCERTAIN_COMMIT_KEEP_FROZEN/);assert.equal((await inspect(client,plan,report)).phase,59);}
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
  try {await freeze(client,plan,report);await apply(client,plan,report);assert.equal((await inspect(client,plan,report)).phase,60);await thaw(client,plan,report);}
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
  try {await freeze(client,plan,report);await apply(client,plan,report);client.db.exec("CREATE TRIGGER _release60_block_unreviewed BEFORE UPDATE ON CommunityMember BEGIN SELECT RAISE(ABORT,'unreviewed'); END");const writes=client.writes;
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

const legacyRules=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/release60-legacy-rules.json'),'utf8'));
function gateEvidence(now=Date.now()) {
  const timestamp=new Date(now).toISOString(),observedAt=new Date(now-360000).toISOString();
  const deployments=Array.from({length:30},(_,i)=>i?{id:`review-old-${i}`,host:`anti-selek-review-old-${i}.vercel.app`,target:'production',state:'READY',commit:PREDECESSOR}:{id:PREVIOUS_DEPLOYMENT,host:PREVIOUS_HOST,target:'production',state:'READY',commit:PREDECESSOR});
  const inventory={source:'authenticated-vercel-api',complete:true,nextCursor:null,deployments};
  const denyRule={id:'review-maintenance-rule',active:true,action:{mitigate:{action:'deny'}},conditionGroup:[{conditions:[{type:'path',op:'pre',value:'/'}]}]};
  const denials=hosts=>hosts.flatMap(host=>['/favicon.ico','/api/auth/session'].map(path=>({host,path,status:403,denyMarker:true,redirectsFollowed:false,protectionBypassSent:true,observedAt:timestamp})));
  const common={version:1,source:'authenticated-vercel-api-and-http',projectId:PROJECT,teamId:TEAM,planSha256:plan.planSha256,activeConfigId:'review-active-config',pendingDraftChanges:[],legacyRules,inventory};
  const maintenance={...common,observedAt,maintenanceRule:denyRule,independentReview:{passed:true,commit:plan.commit,reviewer:'synthetic independent reviewer'},denials:denials([...ALIASES,...deployments.map(d=>d.host)]),drainNotBefore:new Date(now-30000).toISOString()};
  const host='anti-selek-review-new.vercel.app',deploymentId='review-new-deployment';
  const deployment={...common,observedAt:timestamp,commit:plan.commit,target:'production',state:'READY',deploymentId,host,
    aliasChecks:ALIASES.map(host=>({host,deploymentId})),
    previousGenerationRule:{id:'review-previous-generations',active:true,action:{mitigate:{action:'deny'}},conditionGroup:[{conditions:[{type:'host',op:'inc',value:deployments.map(d=>d.host).sort()}]}]},
    oldHostDenials:denials(deployments.map(d=>d.host)),maintenanceRule:{...denyRule,conditionGroup:[{conditions:[{type:'path',op:'pre',value:'/'},{type:'host',op:'neq',value:host}]}]},
    smokeStartedAt:timestamp,runtime:{source:'authenticated-vercel-runtime-logs',errorCount:0,since:timestamp,observedAt:timestamp},
    smokeResults:['/','/api/auth/session'].map(path=>({host,path,status:200,method:'GET',appResponse:true,redirectsFollowed:false,protectionBypassSent:true,observedAt:timestamp}))};
  return {now,maintenance,deployment};
}
test('evidence gate accepts complete drained host denials and the matching production deployment',()=>{
  assert.equal(hash(stable(canonicalRules(legacyRules))),LEGACY_HASH);
  const {now,maintenance,deployment}=gateEvidence();assert.equal(validateMaintenance(maintenance,plan,now).length,34);validateDeployment(deployment,plan,maintenance,now);
});
test('evidence gate accepts reordered JSON object keys while retaining exact conditions and array order',()=>{
  const expected=[{conditions:[{type:'path',op:'pre',value:'/'}]}],actual=[{conditions:[{op:'pre',type:'path',value:'/'}]}];
  assert.equal(sameConditions(expected,actual),true);
  assert.equal(sameConditions(expected,[{conditions:[{op:'eq',type:'path',value:'/'}]}]),false);
  assert.equal(sameConditions(expected,[{conditions:[{op:'pre',type:'path',value:'/',neg:true}]}]),false);
  assert.equal(sameConditions([{conditions:[{type:'host',op:'inc',value:['a','b']}]}],[{conditions:[{op:'inc',type:'host',value:['b','a']}]}]),false);
  const {now,maintenance,deployment}=gateEvidence();maintenance.maintenanceRule.conditionGroup=actual;validateMaintenance(maintenance,plan,now);
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reorder(value[k])])):value;
  deployment.maintenanceRule.conditionGroup=reorder(deployment.maintenanceRule.conditionGroup);deployment.previousGenerationRule.conditionGroup=reorder(deployment.previousGenerationRule.conditionGroup);
  validateDeployment(deployment,plan,maintenance,now);assert.equal(hash(stable(canonicalRules(legacyRules))),LEGACY_HASH);
});
test('evidence gate rejects wrong targets, unreviewed source, unrelated drafts and altered legacy rules',()=>{
  const {now,maintenance}=gateEvidence();
  for(const change of [{projectId:'wrong'},{teamId:'wrong'},{planSha256:'wrong'},{pendingDraftChanges:[{}]},{legacyRules:[]},{independentReview:{passed:true,commit:'wrong',reviewer:'review'}}])
    assert.throws(()=>validateMaintenance({...maintenance,...change},plan,now),/EVIDENCE_TARGET_INVALID|ACTIVE_FIREWALL_REQUIRED|LEGACY_RULES_CHANGED|SEPARATE_REVIEW_REQUIRED/);
});
test('evidence gate rejects incomplete production inventory and wrong predecessor identity',()=>{
  const {now,maintenance}=gateEvidence();
  for(const change of [{complete:false},{nextCursor:'another-page'},{deployments:maintenance.inventory.deployments.slice(1)},
    {deployments:maintenance.inventory.deployments.map((d,i)=>i?d:{...d,commit:'wrong'})}])
    assert.throws(()=>validateMaintenance({...maintenance,inventory:{...maintenance.inventory,...change}},plan,now),/PRODUCTION_INVENTORY_REQUIRED|PREVIOUS_DEPLOYMENT_CHANGED/);
});
test('evidence gate rejects missing host denial, stale probes, redirects, absent bypass and too-short drain',()=>{
  const {now,maintenance}=gateEvidence();
  assert.throws(()=>validateMaintenance({...maintenance,denials:maintenance.denials.slice(1)},plan,now),/HOST_DENIALS_INCOMPLETE/);
  for(const change of [{status:200},{denyMarker:false},{redirectsFollowed:true},{protectionBypassSent:false},{observedAt:new Date(now-901000).toISOString()}])
    assert.throws(()=>validateMaintenance({...maintenance,denials:maintenance.denials.map((r,i)=>i?r:{...r,...change})},plan,now),/CONCRETE_HOST_DENIAL_REQUIRED/);
  assert.throws(()=>validateMaintenance({...maintenance,drainNotBefore:maintenance.observedAt},plan,now),/DRAIN_WINDOW_INVALID/);
  assert.throws(()=>validateMaintenance({...maintenance,drainNotBefore:new Date(now+1000).toISOString()},plan,now),/HTTP_DRAIN_NOT_COMPLETE/);
});
test('deployment evidence gate rejects mismatched source, aliases, old inventory and host fences',()=>{
  const {now,maintenance,deployment}=gateEvidence();
  for(const change of [{commit:'wrong'},{target:'preview'},{state:'BUILDING'},{aliasChecks:deployment.aliasChecks.map((a,i)=>i?a:{...a,deploymentId:'wrong'})},
    {previousGenerationRule:{...deployment.previousGenerationRule,active:false}},
    {maintenanceRule:{...deployment.maintenanceRule,conditionGroup:[{conditions:[{type:'path',op:'pre',value:'/'}]}]}}])
    assert.throws(()=>validateDeployment({...deployment,...change},plan,maintenance,now),/MATCHING_DEPLOYMENT_REQUIRED|CONCRETE_ALIAS_CHECKS_REQUIRED|OLD_GENERATION_RULE_REQUIRED|MAINTENANCE_FENCE_CHANGED/);
  const changed=structuredClone(deployment);changed.inventory.deployments[1].host='anti-selek-replaced.vercel.app';
  assert.throws(()=>validateDeployment(changed,plan,maintenance,now),/OLD_INVENTORY_CHANGED/);
});
test('deployment evidence gate rejects unauthenticated, redirected, stale or mutating smoke checks',()=>{
  const {now,maintenance,deployment}=gateEvidence();
  for(const change of [{method:'POST'},{appResponse:false},{redirectsFollowed:true},{protectionBypassSent:false},{observedAt:new Date(now-901000).toISOString()},{status:500}])
    assert.throws(()=>validateDeployment({...deployment,smokeResults:deployment.smokeResults.map((r,i)=>i?r:{...r,...change})},plan,maintenance,now),/READ_ONLY_SMOKE_REQUIRED/);
});
test('deployment evidence gate rejects fresh errors and missing or unrelated runtime-log window',()=>{
  const {now,maintenance,deployment}=gateEvidence();
  for(const change of [{source:'unknown'},{errorCount:1},{since:'unrelated'},{observedAt:new Date(now-901000).toISOString()}])
    assert.throws(()=>validateDeployment({...deployment,runtime:{...deployment.runtime,...change}},plan,maintenance,now),/FRESH_RUNTIME_LOGS_REQUIRED/);
});
