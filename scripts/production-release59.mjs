// Separate Production 54 -> 59 release. Never used by builds, Dev or Preview.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import predecessor from '../config/preview-turso-migration-manifest.json' with { type: 'json' };
import { previewManifestSha256 } from './preview-turso-target-guard.mjs';

export const ENDPOINT_SHA256 = 'af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d';
export const SOURCE_COMMIT = 'e30f483461fcde37627419debd96d05628912042';
export const RECOVERY_DATABASE_NAME='anti-selek-production-restore-20261011';
export const RECOVERY_ENDPOINT_SHA256='4c1215cc60989ff0670a2a178ec82d19eeb8ce56966558d07a7d947b31a27afb';
export const PRODUCTION_BASELINE_SCHEMA_SHA256='b84534af5e1162c96feb55e091cdf5ad4e2154f4930e8b28c1bb6eba25a5e8f3';
export const PENDING = Object.freeze([...predecessor.migrations.slice(54,57), {
  name:'20261008160000_ordinary_claim_identity_authority',
  sqlSha256:'9443d1370aff7512c7330fa45768ded0baa467d3507e841d166b17d8d193c893',
}, {
  name: '20261011000000_balance_identity_guard_expressions',
  sqlSha256: '1e65771993ed6f0db01d7493621c878fd892f5085750bd495b3cf7e7ce54b7a8',
}]);
export const CONTROL = '_production_release59_freeze';
export const RECEIPT = '_production_release59_receipt';
const LEDGER = '_turso_sql_migrations';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const stable = value => JSON.stringify(value, (_, item) => typeof item === 'bigint'
  ? { bigint: String(item) } : item instanceof ArrayBuffer || ArrayBuffer.isView(item)
    ? { bytes: Buffer.from(item instanceof ArrayBuffer ? item : item.buffer, item.byteOffset ?? 0, item.byteLength).toString('hex') } : item);
export const quote = value => `"${value.replaceAll('"', '""')}"`;
const same = (a,b) => stable(a) === stable(b);
export function demand(condition, code) { if (!condition) { const error = new Error(`PRODUCTION_RELEASE59_${code}`); error.code = error.message; throw error; } }
const git = (root,args) => execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const ddl = name => `CREATE TABLE "${name}" (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`;
const read = async (db,sql,args=[]) => (await db.execute({sql,args})).rows.map(row => Object.fromEntries(Object.keys(row).map(key => [key,row[key]])));
const plainRows = result => result.rows.map(row=>Object.fromEntries(Object.keys(row).map(key=>[key,row[key]])));
const statements = sql => sql.map(value=>typeof value==='string'?{sql:value,args:[]}:value);
export const batch = async (db, sql) => sql.length ? (await db.batch(statements(sql))).map(plainRows) : [];

// SQL lexer preserves trigger bodies and CASE ... END expressions. Every returned
// statement is independently parsed/replayed by SQLite before a live client exists.
export function splitSql(sql) {
  const tokens = sql.match(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\[(?:[^\]])*\]|`(?:``|[^`])*`|[A-Za-z_][A-Za-z_0-9]*|;|[\s\S]/g) ?? [];
  let segment='', depth=0, trigger=false; const output=[];
  for (const token of tokens) {
    segment+=token;
    if (/^(?:--|\/\*|'|"|\[|`)/.test(token)) continue;
    if (/^TRIGGER$/i.test(token)) trigger=true;
    if (trigger && /^(?:BEGIN|CASE)$/i.test(token)) depth++;
    if (trigger && /^END$/i.test(token)) depth--;
    demand(depth>=0,'SQL_SPLIT_INVALID');
    if (token===';' && depth===0) { output.push(segment.trim()); segment=''; trigger=false; }
  }
  demand(depth===0 && !segment.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,'').trim(),'SQL_SPLIT_INVALID');
  return output;
}

export function loadPlan(root, { clean = true, releaseCommit = SOURCE_COMMIT } = {}) {
  demand(/^[a-f0-9]{40}$/.test(releaseCommit) && git(root,['rev-parse','HEAD']).trim()===releaseCommit,'SOURCE_COMMIT_INVALID');
  git(root,['merge-base','--is-ancestor',SOURCE_COMMIT,releaseCommit]);
  if (clean) { git(root,['diff','--quiet']); git(root,['diff','--cached','--quiet']); }
  if (clean) for(const name of ['production-release59.mjs','production-release59-security.mjs','run-production-release59.mjs']) {
    const committed=git(root,['show',`${releaseCommit}:scripts/${name}`]).replaceAll('\r\n','\n');
    demand(fs.readFileSync(path.join(root,'scripts',name),'utf8').replaceAll('\r\n','\n')===committed,'WRITER_NOT_COMMITTED');
  }
  demand(predecessor.manifestSha256==='e6ea35d804e4816b9d81f6e0b84cfe753a6d1655e7a5b44f060945ed02b523c8' && previewManifestSha256(predecessor)===predecessor.manifestSha256,'PREDECESSOR_MANIFEST_INVALID');
  const expected=[...predecessor.migrations.slice(0,54),...PENDING];
  const names=git(root,['ls-tree','--name-only',`${releaseCommit}:prisma/migrations`]).trim().split('\n').filter(name=>/^\d{14}_/.test(name)).sort();
  demand(expected.length===59 && PENDING.length===5 && same(names,expected.map(m=>m.name)),'CHAIN_INVALID');
  const migrations=expected.map(m=>{
    const bytes=execFileSync('git',['show',`${releaseCommit}:prisma/migrations/${m.name}/migration.sql`],{cwd:root,stdio:['ignore','pipe','pipe']});
    const approvedBytes=execFileSync('git',['show',`${SOURCE_COMMIT}:prisma/migrations/${m.name}/migration.sql`],{cwd:root,stdio:['ignore','pipe','pipe']});
    demand(hash(bytes)===hash(approvedBytes),'SOURCE_HASH_INVALID');
    if(PENDING.some(entry=>entry.name===m.name)) demand(hash(bytes)===m.sqlSha256,'SOURCE_HASH_INVALID');
    demand(fs.readFileSync(path.join(root,'prisma/migrations',m.name,'migration.sql'),'utf8').replaceAll('\r\n','\n')===bytes.toString('utf8').replaceAll('\r\n','\n'),'WORKTREE_HASH_INVALID');
    return {...m,sqlSha256:hash(bytes),sql:bytes.toString('utf8')};
  });
  const statements=migrations.slice(54).flatMap(m=>splitSql(m.sql));
  for (const statement of statements) demand(/^(?:ALTER TABLE|CREATE (?:UNIQUE )?(?:INDEX|TRIGGER|VIEW)|DROP (?:INDEX|TRIGGER|VIEW))\b/i.test(statement.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,'').trim()),'NON_DDL_PENDING_SQL');
  return {commit:releaseCommit, endpointSha256:ENDPOINT_SHA256, migrations,statements,
    planSha256:hash(stable({commit:releaseCommit,endpointSha256:ENDPOINT_SHA256,migrations:migrations.map(({name,sqlSha256})=>({name,sqlSha256}))}))};
}

export function checkLedger(ledger,plan,count=54) {
  demand(ledger.length===count && ledger.every((row,index)=>row.name===plan.migrations[index].name && typeof row.applied_at==='string'),'LEDGER_PREFIX_INVALID');
}
export async function snapshot(db, projection) {
  const [schema,ledger,foreignKeys,integrity]=await batch(db,[
    "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
    `SELECT * FROM ${quote(LEDGER)} ORDER BY name`,'PRAGMA foreign_key_check','PRAGMA integrity_check']);
  demand(foreignKeys.length===0,'FOREIGN_KEYS_INVALID');
  demand(integrity.length===1 && integrity[0].integrity_check==='ok','INTEGRITY_INVALID');
  const objects=schema.filter(row=>row.type==='table' && ![LEDGER,CONTROL,RECEIPT].includes(row.name));
  const columnInfo=projection?undefined:await batch(db,objects.map(object=>`PRAGMA table_info(${quote(object.name)})`));
  const columnsByTable=objects.map((object,index)=>{
    const columns=projection?.tables.find(table=>table.name===object.name)?.columns ?? columnInfo?.[index].map(row=>row.name);
    demand(Array.isArray(columns) && columns.length>0,'PROJECTION_TABLE_CHANGED');return columns;
  });
  const values=await batch(db,objects.map((object,index)=>`SELECT ${columnsByTable[index].map(quote).join(',')} FROM ${quote(object.name)}`));
  const tables=[];
  for(let index=0;index<objects.length;index++) {
    const object=objects[index],columns=columnsByTable[index],records=values[index];
    const canonical=records.map(row=>stable(columns.map(column=>row[column]))).sort();
    tables.push({name:object.name,columns,count:records.length,dataSha256:hash(stable(canonical))});
  }
  return {schema,ledger,tables,dataSha256:hash(stable(tables))};
}
export function freezeStatements(before) {
  return before.tables.flatMap(table=>['INSERT','UPDATE','DELETE'].map(operation=>{
    const name=`_release59_block_${hash(table.name).slice(0,20)}_${operation.toLowerCase()}`;
    return {name,sql:`CREATE TRIGGER ${quote(name)} BEFORE ${operation} ON ${quote(table.name)} BEGIN SELECT RAISE(ABORT,'PRODUCTION_RELEASE59_WRITES_FROZEN'); END;`};
  }));
}
const stripControl = schema => schema.filter(row=>![CONTROL,RECEIPT].includes(row.name) && !row.name.startsWith('_release59_block_'));
export function productionSchemaFingerprint(before) {
  const objects=before.schema.map(row=>({type:row.type,name:row.name,table:row.tbl_name,schemaSha256:hash(row.sql)}));
  return hash(stable(objects));
}
export function assertProductionBaseline(before) {
  demand(productionSchemaFingerprint(before)===PRODUCTION_BASELINE_SCHEMA_SHA256,'KNOWN_PRODUCTION_SCHEMA_CHANGED');
}
export function validateRestoreEvidence(evidence,plan,report) {
  demand(evidence?.version===1 && evidence.type==='hosted-nonproduction-turso-restore-verified'
    && evidence.planSha256===plan.planSha256 && evidence.backupSha256===report.backupSha256
    && evidence.sourceEndpointSha256===ENDPOINT_SHA256
    && evidence.nonProductionEndpointSha256===RECOVERY_ENDPOINT_SHA256
    && ![ENDPOINT_SHA256,'8ea73c70eb4fc6d096af8cf566adbbf98b303c26b3d6a5dc61eb89b0bb8ba497'].includes(evidence.nonProductionEndpointSha256)
    && evidence.databaseName===RECOVERY_DATABASE_NAME
    && evidence.integrity==='ok' && evidence.foreignKeyViolations===0
    && same(evidence.restoredSnapshot,report.before),'HOSTED_RESTORE_EVIDENCE_REQUIRED');
}
export function validateDeploymentEvidence(evidence,plan) {
  const age=Date.now()-Date.parse(evidence?.observedAt);
  const denial=evidence?.oldHostDenial;
  const uiAge=Date.now()-Date.parse(denial?.observedAt);
  const controlVerified=evidence?.source==='authenticated-vercel-api'
    ? typeof denial?.configId==='string' && denial.configId.length>0
    : evidence?.source==='authenticated-vercel-api-and-ui'
      && denial?.source==='authenticated-vercel-ui' && denial.projectId===evidence.projectId
      && typeof denial.ruleId==='string' && denial.ruleId.trim().length>0
      && uiAge>=0 && uiAge<900_000;
  demand(evidence?.version===1 && evidence.type==='verified-production-release-and-old-host-denial'
    && evidence.planSha256===plan.planSha256 && evidence.endpointSha256===ENDPOINT_SHA256
    && controlVerified && evidence.target==='production'
    && evidence.commit===plan.commit && evidence.state==='READY'
    && typeof evidence.projectId==='string' && evidence.projectId.length>0
    && typeof evidence.deploymentId==='string' && evidence.deploymentId.length>0
    && age>=0 && age<900_000
    && evidence.oldHostDenial?.active===true && evidence.oldHostDenial.inventoryComplete===true
    && Array.isArray(evidence.oldHostDenial.checkedUrls) && evidence.oldHostDenial.checkedUrls.length>0
    && evidence.oldHostDenial.checkedUrls.every(row=>typeof row.url==='string' && row.url.startsWith('https://') && [403,503].includes(row.status)),
  'CONCRETE_DEPLOYMENT_AND_OLD_HOST_DENIAL_EVIDENCE_REQUIRED');
}
async function control(db,plan) {
  const schema=await read(db,'SELECT sql FROM sqlite_schema WHERE name=?',[CONTROL]);
  demand(schema.length===1 && schema[0].sql===ddl(CONTROL),'FREEZE_CONTROL_INVALID');
  const records=await read(db,`SELECT * FROM ${quote(CONTROL)}`);
  demand(records.length===1 && records[0].singleton===1,'FREEZE_CONTROL_INVALID');
  let payload; try { payload=JSON.parse(records[0].payload); } catch { demand(false,'FREEZE_CONTROL_INVALID'); }
  demand(payload.planSha256===plan.planSha256 && payload.endpointSha256===ENDPOINT_SHA256,'FREEZE_TARGET_INVALID');
  checkLedger(payload.before.ledger,plan);
  return payload;
}
async function assertFrozen(db,plan,report) {
  const saved=await control(db,plan);
  demand(same(saved.before,report.before),'FREEZE_BASELINE_CHANGED');
  const current=await snapshot(db,report.before);
  for (const trigger of freezeStatements(report.before)) demand(current.schema.some(row=>row.type==='trigger' && row.name===trigger.name && row.sql===trigger.sql.slice(0,-1)),'FREEZE_TRIGGER_MISSING');
  demand(same(current.tables,report.before.tables),'APPLICATION_DATA_CHANGED');
  return current;
}
function assertReport(report,plan) {
  demand(report.version===1 && report.planSha256===plan.planSha256 && report.commit===plan.commit && report.endpointSha256===ENDPOINT_SHA256,'REHEARSAL_REPORT_INVALID');
  checkLedger(report.before.ledger,plan);
  demand(report.backupSha256 && report.afterSchema && report.guardCount===83,'REHEARSAL_REPORT_INVALID');
}
export async function inspectRelease(client,plan,report) {
  const tx=await client.transaction('read');
  try {
    if (!report) { const current=await snapshot(tx); checkLedger(current.ledger,plan); return current; }
    assertReport(report,plan);
    const current=await assertFrozen(tx,plan,report);
    const receipts=await read(tx,'SELECT sql FROM sqlite_schema WHERE name=?',[RECEIPT]);
    if (!receipts.length) {
      checkLedger(current.ledger,plan);
      demand(same(stripControl(current.schema),report.before.schema),'SCHEMA_DRIFT');
      return {phase:54,current};
    }
    demand(receipts[0].sql===ddl(RECEIPT),'RECEIPT_INVALID');
    const rows=await read(tx,`SELECT * FROM ${quote(RECEIPT)}`);
    demand(rows.length===1 && rows[0].singleton===1,'RECEIPT_INVALID');
    const receipt=JSON.parse(rows[0].payload);
    demand(receipt.planSha256===plan.planSha256 && receipt.backupSha256===report.backupSha256 && receipt.beforeDataSha256===report.before.dataSha256 && receipt.afterDataSha256===current.dataSha256,'RECEIPT_INVALID');
    checkLedger(current.ledger,plan,59);
    demand(same(current.ledger.slice(0,54),report.before.ledger) && current.ledger.slice(54).every(row=>row.applied_at===receipt.appliedAt),'LEDGER_HISTORY_CHANGED');
    demand(same(stripControl(current.schema),report.afterSchema),'SCHEMA_DRIFT');
    return {phase:59,current};
  } finally { await tx.rollback().catch(()=>{}); tx.close(); }
}

export async function freezeRelease(client,plan,report) {
  assertReport(report,plan); const tx=await client.transaction('write');
  try {
    const before=await snapshot(tx); checkLedger(before.ledger,plan);
    demand(same(before,report.before),'PRE_FREEZE_SNAPSHOT_CHANGED');
    await batch(tx,[ddl(CONTROL),{sql:`INSERT INTO ${quote(CONTROL)} VALUES(1,?)`,args:[stable({planSha256:plan.planSha256,endpointSha256:ENDPOINT_SHA256,before})]},...freezeStatements(before).map(trigger=>trigger.sql)]);
    await assertFrozen(tx,plan,report);
    await tx.commit();
  } catch(error) { await tx.rollback().catch(()=>{}); throw error; } finally { tx.close(); }
}

export async function applyRelease(client,plan,report) {
  assertReport(report,plan);
  const observed=await inspectRelease(client,plan,report);
  if(observed.phase===59) return {phase:59,outcome:'verified-without-writes'};
  let tx,commitAttempted=false;
  try {
    tx=await client.transaction('write');
    const before=await assertFrozen(tx,plan,report); checkLedger(before.ledger,plan);
    demand(same(stripControl(before.schema),report.before.schema),'SCHEMA_DRIFT');
    await batch(tx,plan.statements);
    const after=await snapshot(tx,report.before);
    demand(same(after.tables,report.before.tables) && same(stripControl(after.schema),report.afterSchema),'POST_MIGRATION_PRESERVATION_FAILED');
    const appliedAt=new Date().toISOString();
    await batch(tx,[...plan.migrations.slice(54).map(migration=>({sql:`INSERT INTO ${quote(LEDGER)}(name,applied_at) VALUES(?,?)`,args:[migration.name,appliedAt]})),ddl(RECEIPT),
      {sql:`INSERT INTO ${quote(RECEIPT)} VALUES(1,?)`,args:[stable({planSha256:plan.planSha256,backupSha256:report.backupSha256,appliedAt,beforeDataSha256:report.before.dataSha256,afterDataSha256:after.dataSha256})]}]);
    checkLedger(await read(tx,`SELECT * FROM ${quote(LEDGER)} ORDER BY name`),plan,59);
    commitAttempted=true; await tx.commit();
    return {phase:59,outcome:'committed',writesRemainFrozen:true};
  } catch(error) {
    await tx?.rollback().catch(()=>{}); tx?.close(); tx=undefined;
    if(commitAttempted) {
      // Lost acknowledgement: fresh read reconciliation only, never replay writes.
      const recovered=await inspectRelease(client,plan,report);
      demand(recovered.phase===59,'COMMIT_NOT_CONFIRMED_KEEP_FROZEN');
      return {phase:59,outcome:'commit-reconciled',writesRemainFrozen:true};
    }
    throw error;
  } finally { tx?.close(); }
}

// Offline backup restore plus full forward rehearsal. All source rows are restored
// with node:sqlite backup before the migrations, rather than a schema-only replay.
export async function rehearseBackup(filename,destination,plan) {
  demand(!fs.existsSync(destination),'RESTORE_DESTINATION_EXISTS');
  const {backup}=await import('node:sqlite');
  const source=new DatabaseSync(filename,{readOnly:true});
  try { await backup(source,destination); } finally {source.close();}
  const db=new DatabaseSync(destination,{enableForeignKeyConstraints:true});
  const execute=async({sql,args=[]})=>({rows:db.prepare(sql).all(...args)});
  const adapter={execute,batch:async items=>Promise.all(items.map(execute))};
  try {
    const before=await snapshot(adapter); checkLedger(before.ledger,plan);
    demand(!before.schema.some(row=>row.name===CONTROL || row.name===RECEIPT || row.name.startsWith('_release59_block_')),'BACKUP_MUST_PRECEDE_FREEZE');
    db.exec('BEGIN IMMEDIATE');
    for(const sql of plan.statements) db.exec(sql);
    const after=await snapshot(adapter,before);
    demand(same(before.tables,after.tables),'RESTORE_PRESERVATION_FAILED');
    const guardCount=after.schema.filter(row=>row.type==='trigger').length;
    demand(guardCount===83,'PERMANENT_GUARD_COUNT_INVALID');
    db.exec('COMMIT');
    return {version:1,commit:plan.commit,endpointSha256:ENDPOINT_SHA256,planSha256:plan.planSha256,backupSha256:hash(fs.readFileSync(filename)),before,afterSchema:after.schema,guardCount,foreignKeyViolations:0,integrity:'ok',restored:true};
  } finally { if(db.isTransaction) db.exec('ROLLBACK'); db.close(); }
}

export async function thawRelease(client,plan,report) {
  demand((await inspectRelease(client,plan,report)).phase===59,'POSTVERIFY_REQUIRED');
  const tx=await client.transaction('write');
  try {
    const current=await assertFrozen(tx,plan,report);
    checkLedger(current.ledger,plan,59);
    demand(same(stripControl(current.schema),report.afterSchema),'SCHEMA_DRIFT');
    await batch(tx,freezeStatements(report.before).map(trigger=>`DROP TRIGGER ${quote(trigger.name)}`));
    await tx.commit();
  } catch(error) {await tx.rollback().catch(()=>{});throw error;} finally {tx.close();}
}
