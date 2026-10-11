// Dedicated 59 -> 60 cutover. Never imported by builds or the Dev migration command.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { hash, stable, quote, splitSql } from './production-release59.mjs';

export { hash, stable, quote };
export const ENDPOINT = 'af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d';
export const PREDECESSOR = '67d25f9cb7f42e4410aae7f2c336ae182a477462';
export const MIGRATION = '20261011120000_audited_player_ownership_release';
export const SQL_HASH = 'cfebd9e1866e7df092999d29e926ccdae9c8225f5453570f1e46d176b788eec9';
export const BASELINE_SCHEMA = '441ddb81e69ca34bec5d04613faa2873fabceb93f5d8b6073f7b8954515db6b5';
export const CONTROL = '_production_release60_freeze';
export const RECEIPT = '_production_release60_receipt';
const LEDGER = '_turso_sql_migrations';
const NEW_TABLES = ['PlayerOwnershipRelease', 'PlayerOwnershipReleaseClaim'];
export const demand = (ok, code) => { if (!ok) throw new Error(`PRODUCTION_RELEASE60_${code}`); };
const same = (a,b) => stable(a) === stable(b);
const git = (root,args) => execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
const rows = async (db,sql,args=[]) => (await db.execute({sql,args})).rows.map(row=>Object.fromEntries(Object.keys(row).map(key=>[key,row[key]])));
const batchedRows = async (db,sql) => (await db.batch(sql)).map(result=>result.rows.map(row=>Object.fromEntries(Object.keys(row).map(key=>[key,row[key]]))));
const schemaWithoutControl = schema => schema.filter(row=>![CONTROL,RECEIPT].includes(row.name) && !row.name.startsWith('_release60_block_'));
const metadataDDL = name => `CREATE TABLE ${quote(name)} (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`;

export function loadPlan(root,commit) {
  demand(/^[a-f0-9]{40}$/.test(commit??'') && git(root,['rev-parse','HEAD']).trim()===commit,'SOURCE_INVALID');
  git(root,['merge-base','--is-ancestor',PREDECESSOR,commit]);
  git(root,['diff','--quiet']); git(root,['diff','--cached','--quiet']);
  const names=git(root,['ls-tree','--name-only',`${commit}:prisma/migrations`]).trim().split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
  const oldNames=git(root,['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).trim().split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
  demand(oldNames.length===59 && same(names,[...oldNames,MIGRATION]),'CHAIN_INVALID');
  const migrations=names.map(name=>{
    const sql=git(root,['show',`${commit}:prisma/migrations/${name}/migration.sql`]);
    demand(fs.readFileSync(path.join(root,'prisma/migrations',name,'migration.sql'),'utf8').replaceAll('\r\n','\n')===sql,'WORKTREE_CHANGED');
    demand(name===MIGRATION ? hash(sql)===SQL_HASH : sql===git(root,['show',`${PREDECESSOR}:prisma/migrations/${name}/migration.sql`]),'MIGRATION_CHANGED');
    return {name,sqlSha256:hash(sql)};
  });
  for(const name of ['production-release60.mjs','production-release60-security.mjs','production-release60-evidence.mjs','run-production-release60.mjs','production-release59.mjs','account-player-preservation.mjs','preview-turso-migration-core.mjs','production-rehearsal-credentials.mjs','turso-local-target-guard.mjs']) {
    demand(fs.readFileSync(path.join(root,'scripts',name),'utf8').replaceAll('\r\n','\n')===git(root,['show',`${commit}:scripts/${name}`]),'WRITER_NOT_COMMITTED');
  }
  const sql=git(root,['show',`${commit}:prisma/migrations/${MIGRATION}/migration.sql`]);
  const statements=splitSql(sql);
  demand(statements.every(s=>/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER|VIEW)|DROP TRIGGER)\b/i.test(s.replace(/--[^\n]*(?:\n|$)/g,'').trim())),'NON_DDL_MIGRATION');
  return {commit,migrations,statements,planSha256:hash(stable({commit,endpoint:ENDPOINT,migrations}))};
}

export async function snapshot(db) {
  const [schema,ledger,foreignKeys,integrity]=await batchedRows(db,["SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",`SELECT * FROM ${quote(LEDGER)} ORDER BY name`,'PRAGMA foreign_key_check','PRAGMA integrity_check']);
  demand(foreignKeys.length===0,'FOREIGN_KEYS_INVALID');
  demand(integrity.length===1 && integrity[0].integrity_check==='ok','INTEGRITY_INVALID');
  const tables=[],objects=schema.filter(r=>r.type==='table' && ![LEDGER,CONTROL,RECEIPT].includes(r.name));
  const definitions=await batchedRows(db,objects.map(table=>`PRAGMA table_info(${quote(table.name)})`));
  const allData=await batchedRows(db,objects.map((table,i)=>`SELECT ${definitions[i].map(c=>quote(c.name)).join(',')} FROM ${quote(table.name)}`));
  for(const [i,table] of objects.entries()) {
    const columns=definitions[i].map(r=>r.name),data=allData[i];
    tables.push({name:table.name,columns,count:data.length,dataSha256:hash(stable(data.map(r=>stable(columns.map(c=>r[c]))).sort()))});
  }
  return {schema,ledger,tables,dataSha256:hash(stable(tables))};
}
export function checkLedger(ledger,plan,count) {
  demand(ledger.length===count && ledger.every((r,i)=>r.name===plan.migrations[i].name && typeof r.applied_at==='string'),'LEDGER_INVALID');
}
export function checkBefore(before,plan) {
  checkLedger(before.ledger,plan,59);
  demand(hash(stable(before.schema))===BASELINE_SCHEMA,'BASELINE_SCHEMA_CHANGED');
}
export function checkPreservation(before,after) {
  const original=after.tables.filter(t=>!NEW_TABLES.includes(t.name));
  demand(same(original,before.tables),'EXISTING_ROWS_CHANGED');
  demand(NEW_TABLES.every(name=>after.tables.some(t=>t.name===name && t.count===0)),'AUDIT_TABLES_NOT_EMPTY');
  demand(after.schema.filter(r=>r.type==='trigger' && !r.name.startsWith('_release60_block_')).length===90 && after.schema.filter(r=>r.type==='view').length===5,'GUARD_COUNT_INVALID');
}
export function freezeStatements(before) {
  return [...before.tables.map(t=>t.name),...NEW_TABLES].flatMap(table=>['INSERT','UPDATE','DELETE'].map(op=>({name:`_release60_block_${hash(table).slice(0,20)}_${op.toLowerCase()}`,table,
    sql:`CREATE TRIGGER ${quote(`_release60_block_${hash(table).slice(0,20)}_${op.toLowerCase()}`)} BEFORE ${op} ON ${quote(table)} BEGIN SELECT RAISE(ABORT,'PRODUCTION_RELEASE60_WRITES_FROZEN'); END;`})));
}
function checkReport(report,plan) {
  demand(report?.version===1 && report.planSha256===plan.planSha256 && report.commit===plan.commit && report.endpoint===ENDPOINT && /^[a-f0-9]{64}$/.test(report.backupSha256??''),'REPORT_INVALID');
  checkBefore(report.before,plan);
  demand(report.integrity==='ok' && report.foreignKeyViolations===0,'REHEARSAL_REQUIRED');
}
async function frozen(db,plan,report,phase,{allowThawed=false}={}) {
  checkReport(report,plan);
  const control=await rows(db,`SELECT * FROM ${quote(CONTROL)}`);
  demand(control.length===1 && control[0].singleton===1 && control[0].payload===stable({planSha256:plan.planSha256,backupSha256:report.backupSha256}),'FREEZE_CONTROL_INVALID');
  const current=await snapshot(db);
  demand(current.schema.some(s=>s.type==='table' && s.name===CONTROL && s.sql===metadataDDL(CONTROL)),'FREEZE_SCHEMA_INVALID');
  checkLedger(current.ledger,plan,phase);
  demand(same(current.ledger.slice(0,59),report.before.ledger),'LEDGER_HISTORY_CHANGED');
  const triggers=freezeStatements(report.before).filter(t=>phase===60 || !NEW_TABLES.includes(t.table));
  const present=current.schema.filter(s=>s.type==='trigger' && s.name.startsWith('_release60_block_'));
  const fullyFrozen=present.length===triggers.length && triggers.every(t=>present.some(s=>s.name===t.name && s.sql===t.sql.slice(0,-1)));
  const fullyThawed=present.length===0 && phase===60;
  demand(fullyFrozen || (allowThawed && fullyThawed),'FREEZE_TRIGGER_INVENTORY_INVALID');
  demand(same(schemaWithoutControl(current.schema),phase===59?report.before.schema:report.afterSchema),'SCHEMA_DRIFT');
  if(phase===59) demand(same(current.tables,report.before.tables),'EXISTING_ROWS_CHANGED');
  else checkPreservation(report.before,current);
  return {current,writesFrozen:fullyFrozen};
}
export async function inspect(db,plan,report) {
  const tx=await db.transaction('read');
  try {
    if(!report) {const s=await snapshot(tx);checkBefore(s,plan);return s;}
    const receipts=await rows(tx,'SELECT name FROM sqlite_schema WHERE name=?',[RECEIPT]);
    const phase=receipts.length?60:59;
    const {current,writesFrozen}=await frozen(tx,plan,report,phase,{allowThawed:phase===60});
    if(phase===60) {
      demand(current.schema.some(s=>s.type==='table' && s.name===RECEIPT && s.sql===metadataDDL(RECEIPT)),'RECEIPT_SCHEMA_INVALID');
      const receipt=await rows(tx,`SELECT * FROM ${quote(RECEIPT)}`);
      demand(receipt.length===1 && receipt[0].singleton===1,'RECEIPT_INVALID');
      const saved=JSON.parse(receipt[0].payload);
      demand(saved.planSha256===plan.planSha256 && saved.backupSha256===report.backupSha256 && saved.sqlSha256===SQL_HASH && saved.previousDataSha256===report.before.dataSha256
        && current.ledger[59].applied_at===saved.appliedAt,'RECEIPT_INVALID');
    }
    return {phase,current,writesFrozen};
  } finally {await tx.rollback().catch(()=>{});tx.close();}
}
export async function freeze(db,plan,report) {
  checkReport(report,plan);
  const existing=await db.execute({sql:'SELECT name FROM sqlite_schema WHERE name=?',args:[CONTROL]});
  if(existing.rows.length) {const s=await inspect(db,plan,report);demand(s.phase===59 && s.writesFrozen,'FREEZE_ALREADY_PAST_BASELINE');return {outcome:'verified-without-writes',writesFrozen:true};}
  const tx=await db.transaction('write');let attempted=false;
  try {
    const current=await snapshot(tx);checkBefore(current,plan);
    demand(same(current,report.before),'BACKUP_STALE');
    await tx.execute(metadataDDL(CONTROL));
    await tx.execute({sql:`INSERT INTO ${quote(CONTROL)} VALUES(1,?)`,args:[stable({planSha256:plan.planSha256,backupSha256:report.backupSha256})]});
    await tx.batch(freezeStatements(current).filter(t=>!NEW_TABLES.includes(t.table)).map(t=>t.sql));
    await frozen(tx,plan,report,59);attempted=true;await tx.commit();return {outcome:'committed',writesFrozen:true};
  } catch(e) {await tx.rollback().catch(()=>{});tx.close();if(attempted) {const s=await inspect(db,plan,report);demand(s.phase===59 && s.writesFrozen,'UNCERTAIN_FREEZE_KEEP_HTTP_FENCE');return {outcome:'commit-reconciled',writesFrozen:true};}throw e;} finally {tx.close();}
}
export async function apply(db,plan,report) {
  const observed=await inspect(db,plan,report);
  if(observed.phase===60) return {phase:60,outcome:'verified-without-writes',writesRemainFrozen:observed.writesFrozen};
  const tx=await db.transaction('write');let attempted=false;
  try {
    await frozen(tx,plan,report,59);
    await tx.batch(plan.statements);
    await tx.batch(freezeStatements(report.before).filter(t=>NEW_TABLES.includes(t.table)).map(t=>t.sql));
    const current=await snapshot(tx);checkPreservation(report.before,current);
    demand(same(schemaWithoutControl(current.schema),report.afterSchema),'REHEARSAL_SCHEMA_CHANGED');
    const appliedAt=new Date().toISOString();
    await tx.execute({sql:`INSERT INTO ${quote(LEDGER)}(name,applied_at) VALUES(?,?)`,args:[MIGRATION,appliedAt]});
    await tx.execute(metadataDDL(RECEIPT));
    await tx.execute({sql:`INSERT INTO ${quote(RECEIPT)} VALUES(1,?)`,args:[stable({planSha256:plan.planSha256,backupSha256:report.backupSha256,previousDataSha256:report.before.dataSha256,sqlSha256:SQL_HASH,appliedAt})]});
    await frozen(tx,plan,report,60);attempted=true;await tx.commit();
    return {phase:60,outcome:'committed',writesRemainFrozen:true};
  } catch(e) {
    await tx.rollback().catch(()=>{});
    tx.close();
    if(attempted) {const recovered=await inspect(db,plan,report);demand(recovered.phase===60 && recovered.writesFrozen,'UNCERTAIN_COMMIT_KEEP_FROZEN');return {phase:60,outcome:'commit-reconciled',writesRemainFrozen:true};}
    throw e;
  } finally {tx.close();}
}
export async function rehearse(source,destination,plan) {
  demand(!fs.existsSync(destination),'RESTORE_EXISTS');
  const sourceDb=new DatabaseSync(source,{readOnly:true});try {await backup(sourceDb,destination);} finally {sourceDb.close();}
  const db=new DatabaseSync(destination,{enableDoubleQuotedStringLiterals:true});
  const execute=async input=>{const {sql,args=[]}=typeof input==='string'?{sql:input}:input;return {rows:db.prepare(sql).all(...args)};};
  const adapter={execute,batch:async inputs=>Promise.all(inputs.map(execute))};
  try {
    const before=await snapshot(adapter);checkBefore(before,plan);db.exec('BEGIN IMMEDIATE');
    for(const sql of plan.statements) db.exec(sql);
    const after=await snapshot(adapter);checkPreservation(before,after);db.exec('COMMIT');
    return {version:1,commit:plan.commit,planSha256:plan.planSha256,endpoint:ENDPOINT,backupSha256:hash(fs.readFileSync(source)),before,afterSchema:after.schema,integrity:'ok',foreignKeyViolations:0};
  } finally {if(db.isTransaction)db.exec('ROLLBACK');db.close();}
}
export async function thaw(db,plan,report) {
  const observed=await inspect(db,plan,report);demand(observed.phase===60,'POSTVERIFY_REQUIRED');
  if(!observed.writesFrozen)return {outcome:'verified-without-writes',writesFrozen:false};
  const tx=await db.transaction('write');let attempted=false;
  try {await frozen(tx,plan,report,60);await tx.batch(freezeStatements(report.before).map(t=>`DROP TRIGGER ${quote(t.name)}`));attempted=true;await tx.commit();return {outcome:'committed',writesFrozen:false};}
  catch(e) {await tx.rollback().catch(()=>{});tx.close();if(attempted) {const s=await inspect(db,plan,report);demand(s.phase===60 && !s.writesFrozen,'UNCERTAIN_THAW_KEEP_HTTP_FENCE');return {outcome:'commit-reconciled',writesFrozen:false};}throw e;} finally {tx.close();}
}
