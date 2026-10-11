import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { loadPlan,splitSql,checkLedger,freezeRelease,applyRelease,inspectRelease,rehearseBackup,thawRelease,CONTROL,RECEIPT,validateRestoreEvidence,validateDeploymentEvidence } from './production-release59.mjs';
import { parseCredentials } from './production-release59-security.mjs';
import { parseArguments } from './run-production-release59.mjs';
import { loadRecoverySource,restoreRecoveryTarget,validateRecoveryTarget,parseRecoveryCredentials,RECOVERY_TARGET } from './production-release59-recovery.mjs';
import { parseRecoveryArguments } from './run-production-release59-recovery.mjs';

const plan=loadPlan(process.cwd(),{clean:false,releaseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()});
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'production-release59-test-'));
let counter=0;
function fixture() {
  const file=path.join(directory,`${++counter}.db`),db=new DatabaseSync(file);
  for(const migration of plan.migrations.slice(0,54)) {
    if(migration.name==='20260403075615_add_test_sessions') {
      const existing=new Set(db.prepare('PRAGMA table_info(Session)').all().map(row=>row.name));
      for(const [name,definition] of [['poolsEnabled','BOOLEAN NOT NULL DEFAULT false'],['poolAName','TEXT'],['poolBName','TEXT'],['poolACourtAssignments','INTEGER NOT NULL DEFAULT 0'],['poolBCourtAssignments','INTEGER NOT NULL DEFAULT 0'],['poolAMissedTurns','INTEGER NOT NULL DEFAULT 0'],['poolBMissedTurns','INTEGER NOT NULL DEFAULT 0'],['crossoverMissThreshold','INTEGER NOT NULL DEFAULT 1']]) if(!existing.has(name)) db.exec(`ALTER TABLE Session ADD COLUMN "${name}" ${definition}`);
    }
    db.exec(migration.sql);
  }
  db.exec('CREATE TABLE _turso_sql_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  for(const migration of plan.migrations.slice(0,54)) db.prepare('INSERT INTO _turso_sql_migrations VALUES(?,?)').run(migration.name,`original-${migration.name}`);
  db.exec(`INSERT INTO Account(id,email,name,passwordHash,isActive,createdAt,updatedAt) VALUES('fixture-account','fixture@example.invalid','Fixture','synthetic',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('fixture-club','Fixture Club','fixture-account',CURRENT_TIMESTAMP);
    INSERT INTO User(id,name,updatedAt) VALUES('fixture-player','Historical player',CURRENT_TIMESTAMP);
    INSERT INTO CommunityMember(id,communityId,userId,elo) VALUES('fixture-member','fixture-club','fixture-player',1234);
    CREATE TABLE "_application_relation_fixture" (id TEXT PRIMARY KEY,payload BLOB);
    INSERT INTO "_application_relation_fixture" VALUES('fixture-relation',x'001122FF');`);
  db.close(); return file;
}
function native(file,{lostCommit=false,failAt=-1}={}) {
  const db=new DatabaseSync(file,{enableForeignKeyConstraints:true});let writes=0;
  const metrics={batches:[],singleExecutions:0};
  return {db,metrics,get writes(){return writes;},close:()=>db.close(),transaction:async mode=>{
    db.exec(mode==='write'?'BEGIN IMMEDIATE':'BEGIN');
    const execute=async statement=>{
      const {sql,args=[]}=typeof statement==='string'?{sql:statement}:statement;
      if(!/^(?:SELECT|PRAGMA)/i.test(sql)) {writes++;if(writes===failAt) throw new Error('synthetic statement failure');}
      return {rows:db.prepare(sql).all(...args)};
    };
    return {execute:async statement=>{metrics.singleExecutions++;return execute(statement);},batch:async items=>{
      metrics.batches.push({mode,statements:items.length});const results=[];for(const item of items)results.push(await execute(item));return results;
    },commit:async()=>{db.exec('COMMIT');if(lostCommit && mode==='write')throw new Error('lost acknowledgement');},rollback:async()=>{if(db.isTransaction)db.exec('ROLLBACK');},close(){}};
  }};
}
async function prepare() {
  const file=fixture();const report=await rehearseBackup(file,path.join(directory,`restore-${counter}.db`),plan);
  return {file,report};
}
test('exact committed source pins five transaction-safe DDL migrations including 59',()=>{
  assert.equal(plan.migrations.length,59);assert.equal(plan.statements.length,110);
  assert.equal(plan.migrations.at(-1).sqlSha256,'1e65771993ed6f0db01d7493621c878fd892f5085750bd495b3cf7e7ce54b7a8');
  assert.equal(splitSql("-- comment;\nCREATE TRIGGER t BEFORE UPDATE ON x WHEN CASE WHEN 1 THEN 1 ELSE 0 END BEGIN SELECT 'BEGIN; END'; END;\nDROP TRIGGER t;").length,2);
});
test('reject partial, reordered or fabricated baseline history',()=>{
  const ledger=plan.migrations.slice(0,54).map(m=>({name:m.name,applied_at:'original'}));
  checkLedger(ledger,plan);
  assert.throws(()=>checkLedger(ledger.slice(0,53),plan),/LEDGER_PREFIX_INVALID/);
  assert.throws(()=>checkLedger([...ledger,{name:plan.migrations[55].name,applied_at:'x'}],plan),/LEDGER_PREFIX_INVALID/);
});
test('separate local restore preserves sporting and underscore relation rows with new columns projected out',async()=>{
  const {report}=await prepare();assert.equal(report.guardCount,83);
  assert.equal(report.before.tables.find(t=>t.name==='CommunityMember').count,1);
  assert.equal(report.before.tables.find(t=>t.name==='_application_relation_fixture').count,1);
});
test('all-client DML freeze, atomic chain, immutable history, receipt, verified replay and explicit thaw',async()=>{
  const {file,report}=await prepare();const client=native(file);
  try {
    await freezeRelease(client,plan,report);
    assert.throws(()=>client.db.exec(`UPDATE CommunityMember SET elo=900`),/WRITES_FROZEN/);
    assert.throws(()=>client.db.exec(`INSERT INTO _application_relation_fixture VALUES('blocked',NULL)`),/WRITES_FROZEN/);
    assert.throws(()=>client.db.exec(`DELETE FROM _application_relation_fixture`),/WRITES_FROZEN/);
    assert.equal((await inspectRelease(client,plan,report)).phase,54);
    assert.equal((await applyRelease(client,plan,report)).outcome,'committed');
    assert.equal((await inspectRelease(client,plan,report)).phase,59);
    assert.equal((await applyRelease(client,plan,report)).outcome,'verified-without-writes');
    assert.equal(client.db.prepare(`SELECT COUNT(*) AS n FROM ${RECEIPT}`).get().n,1);
    await thawRelease(client,plan,report);
    assert.equal(client.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name LIKE '_release59_block_%'").get().n,0);
    assert.equal(client.db.prepare('SELECT elo FROM CommunityMember').get().elo,1234);
  } finally {client.close();}
});
test('failed DDL rolls back all pending migrations and receipt while freeze remains',async()=>{
  const {file,report}=await prepare();let client=native(file);await freezeRelease(client,plan,report);client.close();
  client=native(file,{failAt:35});
  try {await assert.rejects(()=>applyRelease(client,plan,report));assert.equal((await inspectRelease(client,plan,report)).phase,54);
    assert.equal(client.db.prepare('PRAGMA table_info(PlayerInvitation)').all().some(row=>row.name==='purpose'),false);
    assert.ok(client.db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(CONTROL));
  } finally{client.close();}
});
test('lost successful commit acknowledgement reconciles receipt without resending migrations',async()=>{
  const {file,report}=await prepare();let client=native(file);await freezeRelease(client,plan,report);client.close();
  client=native(file,{lostCommit:true});try{assert.equal((await applyRelease(client,plan,report)).outcome,'commit-reconciled');}finally{client.close();}
});
test('file-backed libSQL runs same freeze and atomic forward chain',async()=>{
  const {file,report}=await prepare();const client=createClient({url:`file:${file}`});
  try{await freezeRelease(client,plan,report);await applyRelease(client,plan,report);assert.equal((await inspectRelease(client,plan,report)).phase,59);}finally{client.close();}
});
test('strict CLI and exact credential parser deny missing approvals and environment-style fallback',()=>{
  assert.throws(()=>parseArguments(['--apply']),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>parseCredentials('TURSO_DATABASE_URL=libsql:\/\/other\nTURSO_AUTH_TOKEN=x','writer'),/CREDENTIAL_FILE_INVALID/);
  assert.throws(()=>parseCredentials('PRODUCTION_RELEASE59_URL=libsql:\/\/other\nPRODUCTION_RELEASE59_URL=libsql:\/\/other\nPRODUCTION_RELEASE59_TOKEN=x','writer'),/CREDENTIAL_FILE_INVALID/);
});
test('live writer gates require concrete protected hosted restore and matching READY old-host-denial evidence',()=>{
  assert.throws(()=>validateRestoreEvidence(undefined,plan,{}),/HOSTED_RESTORE_EVIDENCE_REQUIRED/);
  assert.throws(()=>validateRestoreEvidence({version:1,type:'local-copy'},plan,{}),/HOSTED_RESTORE_EVIDENCE_REQUIRED/);
  assert.throws(()=>validateDeploymentEvidence(undefined,plan),/CONCRETE_DEPLOYMENT/);
  assert.throws(()=>validateDeploymentEvidence({version:1,state:'READY',oldHostDenial:{active:true}},plan),/CONCRETE_DEPLOYMENT/);
});
test('metadata and application reads are batched with no inspection writes; DDL and freeze use bounded round trips',async()=>{
  const {file,report}=await prepare();const client=native(file);
  try {
    await inspectRelease(client,plan);
    assert.equal(client.writes,0);assert.equal(client.metrics.singleExecutions,0);
    assert.deepEqual(client.metrics.batches.map(item=>item.statements),[4,28,28]);
    await freezeRelease(client,plan,report);await applyRelease(client,plan,report);
    assert.ok(client.metrics.batches.some(item=>item.mode==='write' && item.statements===86)); // 28 fixture tables * 3 + 2 controls
    assert.ok(client.metrics.batches.some(item=>item.mode==='write' && item.statements===110));
    assert.ok(client.metrics.batches.some(item=>item.mode==='write' && item.statements===7));
  }finally{client.close();}
});
test('recovery and deployment gates accept complete evidence and reject mismatched rows, provenance and denial checks',()=>{
  const report={backupSha256:'fixture-backup',before:{schema:[],ledger:[],tables:[{name:'Sport',dataSha256:'original'}]}};
  const recovery={version:1,type:'hosted-nonproduction-turso-restore-verified',planSha256:plan.planSha256,backupSha256:report.backupSha256,
    sourceEndpointSha256:plan.endpointSha256,nonProductionEndpointSha256:RECOVERY_TARGET.endpointSha256,databaseName:RECOVERY_TARGET.databaseName,integrity:'ok',foreignKeyViolations:0,restoredSnapshot:report.before};
  validateRestoreEvidence(recovery,plan,report);
  for(const change of [{backupSha256:'wrong'},{planSha256:'wrong'},{nonProductionEndpointSha256:plan.endpointSha256},{restoredSnapshot:{...report.before,tables:[]}}]) assert.throws(()=>validateRestoreEvidence({...recovery,...change},plan,report),/HOSTED_RESTORE_EVIDENCE_REQUIRED/);
  const deployment={version:1,type:'verified-production-release-and-old-host-denial',planSha256:plan.planSha256,endpointSha256:plan.endpointSha256,
    source:'authenticated-vercel-api',target:'production',commit:plan.commit,state:'READY',projectId:'project',deploymentId:'deployment',observedAt:new Date().toISOString(),
    oldHostDenial:{active:true,configId:'verified-firewall',inventoryComplete:true,checkedUrls:[{url:'https://fixture.invalid',status:403}]}};
  validateDeploymentEvidence(deployment,plan);
  for(const change of [{commit:'wrong'},{observedAt:new Date(Date.now()-901_000).toISOString()},{oldHostDenial:{...deployment.oldHostDenial,checkedUrls:[{url:'https://fixture.invalid',status:200}]}}]) assert.throws(()=>validateDeploymentEvidence({...deployment,...change},plan),/CONCRETE_DEPLOYMENT/);
});
test('mixed API deployment and authenticated UI firewall evidence requires the actual fresh rule and matching project',()=>{
  const evidence={version:1,type:'verified-production-release-and-old-host-denial',planSha256:plan.planSha256,endpointSha256:plan.endpointSha256,
    source:'authenticated-vercel-api-and-ui',target:'production',commit:plan.commit,state:'READY',projectId:'project',deploymentId:'deployment',observedAt:new Date().toISOString(),
    oldHostDenial:{source:'authenticated-vercel-ui',projectId:'project',ruleId:'observed-active-rule',observedAt:new Date().toISOString(),
      active:true,inventoryComplete:true,checkedUrls:[{url:'https://fixture.invalid',status:403}]}};
  validateDeploymentEvidence(evidence,plan);
  for(const change of [{source:undefined},{source:'unrecognized'},{projectId:undefined},{projectId:'other-project'},
    {ruleId:undefined},{ruleId:''},{ruleId:' '},{ruleId:undefined,configId:'mislabelled-rule'},
    {observedAt:new Date(Date.now()-901_000).toISOString()},{observedAt:new Date(Date.now()+60_000).toISOString()},
    {checkedUrls:[{url:'https://fixture.invalid',status:200}]}, {active:false}, {inventoryComplete:false}]) {
    assert.throws(()=>validateDeploymentEvidence({...evidence,oldHostDenial:{...evidence.oldHostDenial,...change}},plan),/CONCRETE_DEPLOYMENT/);
  }
  for(const change of [{source:'unrecognized'},{commit:'wrong'},{planSha256:'wrong'},{endpointSha256:'wrong'},
    {state:'BUILDING'},{observedAt:new Date(Date.now()-901_000).toISOString()},{observedAt:new Date(Date.now()+60_000).toISOString()}]) {
    assert.throws(()=>validateDeploymentEvidence({...evidence,...change},plan),/CONCRETE_DEPLOYMENT/);
  }
});
const recoveryTarget=RECOVERY_TARGET;
const recoveryConfirmation={databaseName:recoveryTarget.databaseName,endpointSha256:recoveryTarget.endpointSha256};
test('recovery target pins and dedicated parser cannot select Production, Preview, alternate names or generic env credentials',()=>{
  validateRecoveryTarget(recoveryTarget,recoveryConfirmation);
  assert.throws(()=>validateRecoveryTarget({...recoveryTarget,endpointSha256:plan.endpointSha256},{...recoveryConfirmation,endpointSha256:plan.endpointSha256}),/RECOVERY_PIN_INVALID/);
  assert.throws(()=>validateRecoveryTarget(recoveryTarget,{...recoveryConfirmation,databaseName:'development'}),/RECOVERY_PIN_INVALID/);
  assert.throws(()=>parseRecoveryCredentials('TURSO_DATABASE_URL=libsql://other\nTURSO_AUTH_TOKEN=x',recoveryTarget,recoveryConfirmation),/RECOVERY_CREDENTIAL_INVALID/);
  assert.throws(()=>parseRecoveryArguments(['--restore','--release-commit',plan.commit]),/RECOVERY_CONFIRMATIONS_REQUIRED/);
});
test('nonproduction recovery copies every table/ledger/blob and installs immutable guards after rows; verify/replay never writes',async()=>{
  const {file,report}=await prepare();const source=await loadRecoverySource(file,plan,report);
  const targetFile=path.join(directory,`hosted-recovery-fixture-${counter}.db`),client=createClient({url:`file:${targetFile}`});
  try {
    const options={target:recoveryTarget,confirmation:recoveryConfirmation,source,plan,report,mode:'apply'};
    const result=await restoreRecoveryTarget(client,options);
    assert.equal(result.outcome,'restored-and-committed');assert.deepEqual(result.evidence.restoredSnapshot,report.before);
    assert.equal((await restoreRecoveryTarget(client,options)).outcome,'verified-without-writes');
    assert.equal((await restoreRecoveryTarget(client,{...options,mode:'verify-only'})).outcome,'verified-without-writes');
    await assert.rejects(()=>client.execute("UPDATE User SET id='changed' WHERE id='fixture-player'"),/IMMUTABLE/);
  } finally{client.close();}
});
test('recovery refuses a populated target before any schema writes and rolls back mid-import failure',async()=>{
  const {file,report}=await prepare();const source=await loadRecoverySource(file,plan,report);
  const targetFile=path.join(directory,`failed-recovery-fixture-${counter}.db`);let client=native(targetFile,{failAt:35});
  const options={target:recoveryTarget,confirmation:recoveryConfirmation,source,plan,report,mode:'apply'};
  try {await assert.rejects(()=>restoreRecoveryTarget(client,options));assert.equal(client.db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get().n,0);}
  finally{client.close();}
  client=native(targetFile);client.db.exec('CREATE TABLE unrelated(id TEXT)');
  try {await assert.rejects(()=>restoreRecoveryTarget(client,options),/RECOVERY_TARGET_NOT_EMPTY|no such table/);assert.equal(client.writes,0);}
  finally{client.close();}
});
test('recovery lost commit acknowledgement uses fresh comparison and never retries inserts',async()=>{
  const {file,report}=await prepare();const source=await loadRecoverySource(file,plan,report);
  const client=native(path.join(directory,`lost-recovery-fixture-${counter}.db`),{lostCommit:true});
  try {
    const options={target:recoveryTarget,confirmation:recoveryConfirmation,source,plan,report,mode:'apply'};
    const result=await restoreRecoveryTarget(client,options);assert.equal(result.outcome,'restore-commit-reconciled');assert.deepEqual(result.evidence.restoredSnapshot,report.before);
    const beforeWrites=client.writes;
    assert.equal((await restoreRecoveryTarget(client,{...options,mode:'verify-only'})).outcome,'verified-without-writes');assert.equal(client.writes,beforeWrites);
  }
  finally{client.close();}
});
test('actual file-backed libSQL batch errors roll back the entire nonproduction import',async()=>{
  const {file,report}=await prepare();const original=await loadRecoverySource(file,plan,report);
  const source={...original,inserts:[...original.inserts,original.inserts[0]]}; // duplicate historical PK
  const client=createClient({url:`file:${path.join(directory,`batch-error-recovery-fixture-${counter}.db`)}`});
  try {
    await assert.rejects(()=>restoreRecoveryTarget(client,{target:recoveryTarget,confirmation:recoveryConfirmation,source,plan,report,mode:'apply'}));
    assert.equal((await client.execute("SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")).rows[0].n,0);
  }finally{client.close();}
});
