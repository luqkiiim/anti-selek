// Finite 64 -> 65 production release. Never imported by the app/build or Dev writer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { hash, stable, quote, splitSql } from './production-release59.mjs';
import { tableDigest } from './production-release63-preservation.mjs';
export { hash, stable };
export const ENDPOINT='af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d';
export const PREDECESSOR='4c3dde88e78881df041883f9d157323859682a52';
export const MIGRATION='20261021180000_delete_unused_placeholders';
export const SQL_HASH='9363c4f1e7dd26573eee3abffc31a9dbe5eb8c9874e8cfe3713a2ccf858b3b6e';
// Authenticated read-only preflight, including historical release metadata.
export const BASELINE_SCHEMA='af8b7a40db3c4881d9930ef64fa17d441f3298116409e87b0117e46b8bba3ce4';
export const RECEIPT='_production_release65_receipt';
const LEDGER='_turso_sql_migrations';
export const demand=(ok,code)=>{if(!ok)throw new Error(`PRODUCTION_RELEASE65_${code}`);};
const same=(a,b)=>stable(a)===stable(b);
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
export const REVIEW_FILES=[
 'prisma/schema.prisma',`prisma/migrations/${MIGRATION}/migration.sql`,
 'src/lib/clubDeletion.ts','src/features/club-api/[id]/route.ts','src/lib/clubDeletion.integration.test.ts',
 'src/components/prototype/ClubSettings.tsx','src/components/club-admin/ClubDangerZonePanel.tsx',
 'src/features/club-admin-page/ClubAdminPage.tsx','docs/unused-club-deletion.md',
 'scripts/production-release65.mjs','scripts/production-release65-security.mjs','scripts/run-production-release65.mjs',
 'scripts/production-release65.test.mjs','docs/production-release65.md',
 'scripts/production-release59.mjs','scripts/production-release63.mjs','scripts/production-release63-preservation.mjs','scripts/production-release63-security.mjs',
 'scripts/account-player-preservation.mjs','scripts/production-rehearsal-credentials.mjs',
 'scripts/preview-turso-migration-core.mjs','scripts/turso-local-target-guard.mjs',
];
export function loadPlan(root,commit,{clean=true}={}) {
 demand(/^[a-f0-9]{40}$/.test(commit??'')&&git(root,['rev-parse','HEAD'])===commit,'SOURCE_INVALID');
 git(root,['merge-base','--is-ancestor',PREDECESSOR,commit]);
 if(clean){git(root,['diff','--quiet']);git(root,['diff','--cached','--quiet']);demand(!git(root,['ls-files','--others','--exclude-standard']),'UNTRACKED_SOURCE');}
 const names=fs.readdirSync(path.join(root,'prisma/migrations')).filter(n=>/^\d{14}_/.test(n)).sort();
 const old=git(root,['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
 demand(old.length===64&&same(names,[...old,MIGRATION]),'CHAIN_INVALID');
 const migrations=names.map(name=>{
  const sql=fs.readFileSync(path.join(root,'prisma/migrations',name,'migration.sql'),'utf8').replaceAll('\r\n','\n');
  demand(name===MIGRATION?hash(sql)===SQL_HASH:sql.trim()===git(root,['show',`${PREDECESSOR}:prisma/migrations/${name}/migration.sql`]),'MIGRATION_CHANGED');
  return {name,sqlSha256:hash(sql)};
 });
 const fileHashes=Object.fromEntries(REVIEW_FILES.map(file=>{
  const text=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');
  if(clean)demand(text.trim()===git(root,['show',`${commit}:${file}`]),'SOURCE_CHANGED');
  return [file,hash(text)];
 }));
 const sql=fs.readFileSync(path.join(root,'prisma/migrations',MIGRATION,'migration.sql'),'utf8').replaceAll('\r\n','\n');
 return {commit,migrations,fileHashes,baselineSchemaSha256:BASELINE_SCHEMA,statements:splitSql(sql),planSha256:hash(stable({commit,endpoint:ENDPOINT,baselineSchemaSha256:BASELINE_SCHEMA,migrations,fileHashes}))};
}
export async function snapshot(db){
 const plain=result=>result.rows.map(row=>Object.fromEntries(Object.keys(row).map(key=>[key,row[key]])));
 const [schema,ledger,foreignKeys,integrity]=(await db.batch([
  "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
  `SELECT * FROM ${quote(LEDGER)} ORDER BY name`,'PRAGMA foreign_key_check','PRAGMA integrity_check',
 ])).map(plain);
 demand(foreignKeys.length===0,'FOREIGN_KEYS_INVALID');
 demand(integrity.length===1&&integrity[0].integrity_check==='ok','INTEGRITY_INVALID');
 // Every historical release table is included. Only the separately checked
 // migration ledger is excluded from these table data digests.
 const tables=[],objects=schema.filter(row=>row.type==='table'&&row.name!==LEDGER);
 // Project only the one intentionally added column out of existing-table hashes.
 // Its NULL installation is independently required inside the write transaction.
 const definitions=(await db.batch(objects.map(t=>`PRAGMA table_info(${quote(t.name)})`))).map(plain)
  .map((columns,i)=>objects[i].name==='ClubDeletionReceipt'?columns.filter(c=>c.name!=='cleanupJson'):columns);
 const data=(await db.batch(objects.map((t,i)=>`SELECT ${definitions[i].map(c=>quote(c.name)).join(',')} FROM ${quote(t.name)}`))).map(plain);
 for(const [i,t] of objects.entries()){
  const columns=definitions[i].map(c=>c.name);
  tables.push({name:t.name,columns,count:data[i].length,dataSha256:tableDigest(t.name,columns,data[i])});
 }
 return {schema,ledger,tables,dataSha256:hash(stable(tables))};
}
export function validateReview(review,plan) {
 demand(review?.passed===true&&review.commit===plan.commit&&same(review.fileHashes,plan.fileHashes),'REVIEW_BINDING_INVALID');
 demand(Array.isArray(review.reviewers)&&review.reviewers.length>=2&&new Set(review.reviewers).size===review.reviewers.length
  &&review.reviewers.every(x=>typeof x==='string'&&x.startsWith('/root/')&&x!=='/root'),'INDEPENDENT_REVIEW_REQUIRED');
 demand(['application-migration','production-writer'].every(s=>review.scopes?.includes(s)),'REVIEW_SCOPE_REQUIRED');
}
export function checkLedger(ledger,plan,count) {
 demand(ledger.length===count&&ledger.every((r,i)=>r.name===plan.migrations[i].name&&typeof r.applied_at==='string'),'LEDGER_INVALID');
}
export function checkBefore(state,plan) {
 checkLedger(state.ledger,plan,64);
 demand(hash(stable(state.schema))===plan.baselineSchemaSha256,'BASELINE_SCHEMA_CHANGED');
 demand(!state.schema.some(r=>r.name===RECEIPT||/^_release\d+_block_/.test(r.name)),'BASELINE_INVALID');
}
function preserved(before,after) {
 demand(same(before.tables,after.tables.filter(t=>t.name!==RECEIPT)),'EXISTING_ROWS_CHANGED');
}
async function changes(db,plan,before,backupSha256) {
 await db.batch(plan.statements);
 demand(Number((await db.execute('SELECT count(*) AS n FROM "ClubDeletionReceipt" WHERE "cleanupJson" IS NOT NULL')).rows[0].n)===0,'EXISTING_RECEIPT_CHANGED');
 const installed=await snapshot(db);
 preserved(before,installed);
 const appliedAt=new Date().toISOString();
 await db.execute({sql:`INSERT INTO ${quote(LEDGER)}(name,applied_at) VALUES(?,?)`,args:[MIGRATION,appliedAt]});
 await db.execute(`CREATE TABLE ${quote(RECEIPT)} (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`);
 await db.execute({sql:`INSERT INTO ${quote(RECEIPT)} VALUES(1,?)`,args:[stable({commit:plan.commit,planSha256:plan.planSha256,sqlSha256:SQL_HASH,backupSha256,previousDataSha256:before.dataSha256,appliedAt})]});
 const after=await snapshot(db);checkLedger(after.ledger,plan,65);
 demand(same(after.ledger.slice(0,64),before.ledger),'LEDGER_PREFIX_CHANGED');
 preserved(before,after);
 return after;
}
export async function rehearse(source,destination,plan) {
 demand(!fs.existsSync(destination),'RESTORE_EXISTS');
 const original=new DatabaseSync(source,{readOnly:true});try{await backup(original,destination);}finally{original.close();}
 const sqlite=new DatabaseSync(destination,{enableDoubleQuotedStringLiterals:true});
 const execute=async input=>{const {sql,args=[]}=typeof input==='string'?{sql:input}:input;return {rows:sqlite.prepare(sql).all(...args)};};
 const db={execute,batch:async inputs=>Promise.all(inputs.map(execute))};
 try {
  const before=await snapshot(db);checkBefore(before,plan);sqlite.exec('BEGIN IMMEDIATE');
  const backupSha256=hash(fs.readFileSync(source));
  const after=await changes(db,plan,before,backupSha256);sqlite.exec('COMMIT');
  return {version:1,commit:plan.commit,planSha256:plan.planSha256,backupSha256,before,afterSchema:after.schema,createdAt:new Date().toISOString()};
 }finally{if(sqlite.isTransaction)sqlite.exec('ROLLBACK');sqlite.close();}
}
export function checkReport(report,plan) {
 demand(report?.version===1&&report.commit===plan.commit&&report.planSha256===plan.planSha256,'REHEARSAL_INVALID');
 demand(Date.now()-Date.parse(report.createdAt)>=0&&Date.now()-Date.parse(report.createdAt)<900000,'REHEARSAL_EXPIRED');
 checkBefore(report.before,plan);
}
export async function inspect(db,plan,report) {
 const tx=await db.transaction('read');
 try{
  const current=await snapshot(tx);const has=current.schema.some(r=>r.name===RECEIPT);
  if(!has){checkBefore(current,plan);return {phase:64,current};}
  checkLedger(current.ledger,plan,65);
  const rows=(await tx.execute(`SELECT payload FROM ${quote(RECEIPT)} WHERE singleton=1`)).rows;
  demand(rows.length===1,'RECEIPT_MISSING');const receipt=JSON.parse(rows[0].payload);
  demand(receipt.planSha256===plan.planSha256&&receipt.commit===plan.commit&&receipt.sqlSha256===SQL_HASH,'RECEIPT_INVALID');
  demand(current.ledger[64].applied_at===receipt.appliedAt,'RECEIPT_LEDGER_MISMATCH');
  if(report)demand(same(current.schema,report.afterSchema),'INSTALLED_SCHEMA_CHANGED');
  return {phase:65,current,receipt};
 }finally{await tx.rollback().catch(()=>{});tx.close();}
}
export async function apply(db,plan,report) {
 checkReport(report,plan);
 const observed=await inspect(db,plan,report);
 if(observed.phase===65)return {phase:65,outcome:'verified-without-writes'};
 const tx=await db.transaction('write');let committing=false;
 try {
  const before=await snapshot(tx);checkBefore(before,plan);
  // Rate-limit buckets are transient bookkeeping, not user history. They may
  // advance after backup; every actual table (including buckets) is compared
  // unchanged across the migration under the same reserved write transaction.
  const history=state=>state.tables.filter(t=>t.name!=='RateLimitBucket');
  demand(same(before.schema,report.before.schema)&&same(before.ledger,report.before.ledger)&&same(history(before),history(report.before)),'BACKUP_STALE');
  const after=await changes(tx,plan,before,report.backupSha256);
  demand(same(after.schema,report.afterSchema),'REHEARSAL_SCHEMA_CHANGED');
  committing=true;await tx.commit();return {phase:65,outcome:'committed',existingRowsPreserved:true};
 }catch(error){
  await tx.rollback().catch(()=>{});tx.close();
  if(committing){const state=await inspect(db,plan,report);demand(state.phase===65,'UNCERTAIN_COMMIT_INSPECT_REQUIRED');return {phase:65,outcome:'commit-reconciled'};}
  throw error;
 }finally{tx.close();}
}
export async function verify(db,plan,report){
 const state=await inspect(db,plan,report);demand(state.phase===65,'MIGRATION_NOT_APPLIED');return state;
}
