// Finite 66 -> 67 production release. Never imported by the app/build or Dev writer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { hash, stable, quote, splitSql } from './production-release59.mjs';
import { tableDigest } from './production-release63-preservation.mjs';
export { hash, stable };
export const ENDPOINT='af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d';
export const PREDECESSOR='21ea79cae5544d3d476e937ae77fb0f85f03cdf9';
export const MIGRATION='20261102000000_session_details';
export const SQL_HASH='ec79ab962c00128c2553f65670269b037a89a46e074c6a21272120c1c833206b';
// Authenticated read-only preflight, including historical release metadata.
export const BASELINE_SCHEMA='eba7799ef3dac3dea71d6f4c61537e265d51f974bef07d19438d1f21a9c7b18f';
export const RECEIPT='_production_release67_receipt';
const LEDGER='_turso_sql_migrations';
const NEW_COLUMNS={Session:['venue','venueMapUrl','scheduledStartAt','scheduledEndAt','timeZone','feeText','notes'],Court:['bookingStartAt','bookingEndAt']};
export const demand=(ok,code)=>{if(!ok)throw new Error(`PRODUCTION_RELEASE67_${code}`);};
const same=(a,b)=>stable(a)===stable(b);
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
export const REVIEW_FILES=[
 "prisma/schema.prisma",
 "prisma/migrations/20261102000000_session_details/migration.sql",
 "src/lib/sessionDetails.ts",
 "src/lib/sessionDetails.test.ts",
 "src/lib/sessionDetails.migration.test.ts",
 "src/lib/sessionShareMessage.ts",
 "src/lib/sessionShareMessage.test.ts",
 "src/app/api/sessions/[code]/details/route.ts",
 "src/app/api/sessions/[code]/details/route.integration.test.ts",
 "src/app/api/sessions/[code]/route.ts",
 "src/app/api/sessions/createSessionRequest.ts",
 "src/app/api/sessions/createSessionService.ts",
 "src/app/api/sessions/sessionRouteShared.ts",
 "src/components/prototype/LiveSession.tsx",
 "src/components/prototype/SessionSetup.tsx",
 "src/components/prototype/SessionStandbyView.tsx",
 "src/components/prototype/SessionStandbyView.module.css",
 "src/components/session/sessionTypes.ts",
 "src/components/session/SessionDetailsForm.tsx",
 "src/components/session/SessionDetailsSummary.tsx",
 "src/components/session/SessionShareSheet.tsx",
 "src/components/session/SessionShareSheet.test.tsx",
 "src/components/session/SessionSharing.module.css",
 "scripts/check-court-schema.mjs",
 "scripts/check-court-schema.test.mjs",
 "e2e/session-sharing.spec.ts",
 "docs/session-sharing.md",
 "scripts/production-release67.mjs",
 "scripts/production-release67-security.mjs",
 "scripts/run-production-release67.mjs",
 "scripts/production-release67.test.mjs",
 "docs/production-release67.md",
 "scripts/production-release59.mjs",
 "scripts/production-release63-preservation.mjs",
 "scripts/production-release63-security.mjs",
 "scripts/preview-turso-migration-core.mjs",
 "scripts/production-rehearsal-credentials.mjs",
 "scripts/account-player-preservation.mjs",
 "scripts/turso-local-target-guard.mjs"
];
export function loadPlan(root,commit,{clean=true}={}) {
 demand(/^[a-f0-9]{40}$/.test(commit??'')&&git(root,['rev-parse','HEAD'])===commit,'SOURCE_INVALID');
 git(root,['merge-base','--is-ancestor',PREDECESSOR,commit]);
 if(clean){git(root,['diff','--quiet']);git(root,['diff','--cached','--quiet']);demand(!git(root,['ls-files','--others','--exclude-standard']),'UNTRACKED_SOURCE');}
 const names=fs.readdirSync(path.join(root,'prisma/migrations')).filter(n=>/^\d{14}_/.test(n)).sort();
 const old=git(root,['ls-tree','--name-only',`${PREDECESSOR}:prisma/migrations`]).split('\n').filter(n=>/^\d{14}_/.test(n)).sort();
 demand(old.length===66&&same(names,[...old,MIGRATION]),'CHAIN_INVALID');
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
 // Project only the nine new nullable fields out of data hashes. Court.isActive
 // remains included, preserving courts that are already closed in production.
 const definitions=(await db.batch(objects.map(t=>`PRAGMA table_info(${quote(t.name)})`))).map(plain)
  .map((columns,i)=>columns.filter(c=>!(NEW_COLUMNS[objects[i].name]??[]).includes(c.name)));
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
 checkLedger(state.ledger,plan,66);
 demand(hash(stable(state.schema))===plan.baselineSchemaSha256,'BASELINE_SCHEMA_CHANGED');
 demand(!state.schema.some(r=>r.name===RECEIPT||/^_release\d+_block_/.test(r.name)),'BASELINE_INVALID');
}
function preserved(before,after) {
 demand(same(before.tables,after.tables.filter(t=>t.name!==RECEIPT)),'EXISTING_ROWS_CHANGED');
}
async function changes(db,plan,before,backupSha256) {
 await db.batch(plan.statements);
 for(const [table,columns]of Object.entries(NEW_COLUMNS)){
  demand(Number((await db.execute(`SELECT count(*) AS n FROM ${quote(table)} WHERE ${columns.map(column=>`${quote(column)} IS NOT NULL`).join(' OR ')}`)).rows[0].n)===0,'NEW_COLUMN_DEFAULT_INVALID');
 }
 const installed=await snapshot(db);
 preserved(before,installed);
 const appliedAt=new Date().toISOString();
 await db.execute({sql:`INSERT INTO ${quote(LEDGER)}(name,applied_at) VALUES(?,?)`,args:[MIGRATION,appliedAt]});
 await db.execute(`CREATE TABLE ${quote(RECEIPT)} (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`);
 await db.execute({sql:`INSERT INTO ${quote(RECEIPT)} VALUES(1,?)`,args:[stable({commit:plan.commit,planSha256:plan.planSha256,sqlSha256:SQL_HASH,backupSha256,previousDataSha256:before.dataSha256,appliedAt})]});
 const after=await snapshot(db);checkLedger(after.ledger,plan,67);
 demand(same(after.ledger.slice(0,66),before.ledger),'LEDGER_PREFIX_CHANGED');
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
  if(!has){checkBefore(current,plan);return {phase:66,current};}
  checkLedger(current.ledger,plan,67);
  const rows=(await tx.execute(`SELECT payload FROM ${quote(RECEIPT)} WHERE singleton=1`)).rows;
  demand(rows.length===1,'RECEIPT_MISSING');const receipt=JSON.parse(rows[0].payload);
  demand(receipt.planSha256===plan.planSha256&&receipt.commit===plan.commit&&receipt.sqlSha256===SQL_HASH,'RECEIPT_INVALID');
  demand(current.ledger[66].applied_at===receipt.appliedAt,'RECEIPT_LEDGER_MISMATCH');
  if(report)demand(same(current.schema,report.afterSchema),'INSTALLED_SCHEMA_CHANGED');
  return {phase:67,current,receipt};
 }finally{await tx.rollback().catch(()=>{});tx.close();}
}
export async function apply(db,plan,report) {
 checkReport(report,plan);
 const observed=await inspect(db,plan,report);
 if(observed.phase===67)return {phase:67,outcome:'verified-without-writes'};
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
  committing=true;await tx.commit();return {phase:67,outcome:'committed',existingRowsPreserved:true};
 }catch(error){
  await tx.rollback().catch(()=>{});tx.close();
  if(committing){const state=await inspect(db,plan,report);demand(state.phase===67,'UNCERTAIN_COMMIT_INSPECT_REQUIRED');return {phase:67,outcome:'commit-reconciled'};}
  throw error;
 }finally{tx.close();}
}
export async function verify(db,plan,report){
 const state=await inspect(db,plan,report);demand(state.phase===67,'MIGRATION_NOT_APPLIED');return state;
}
