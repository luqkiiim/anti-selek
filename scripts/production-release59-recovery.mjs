// Recovery drill only. Caller supplies a separately reviewed nonproduction pin;
// this module never reads credentials and never operates a Production client.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ENDPOINT_SHA256,RECOVERY_DATABASE_NAME,RECOVERY_ENDPOINT_SHA256,batch,demand,hash,quote,snapshot,stable,checkLedger,validateRestoreEvidence } from './production-release59.mjs';
import { tursoEndpointFingerprint } from './turso-local-target-guard.mjs';
import { validateWriterToken } from './production-release59-security.mjs';

const same=(a,b)=>stable(a)===stable(b);
export const RECOVERY_TARGET=Object.freeze({version:1,databaseName:RECOVERY_DATABASE_NAME,endpointSha256:RECOVERY_ENDPOINT_SHA256});
export function validateRecoveryTarget(target,confirmation) {
  demand(same(target,RECOVERY_TARGET) && target?.version===1 && typeof target.databaseName==='string'
    && /^anti-selek-production-restore-[a-z0-9-]+$/.test(target.databaseName)
    && /^[0-9a-f]{64}$/.test(target.endpointSha256??'')
    && ![ENDPOINT_SHA256,'8ea73c70eb4fc6d096af8cf566adbbf98b303c26b3d6a5dc61eb89b0bb8ba497'].includes(target.endpointSha256)
    && target.databaseName===confirmation?.databaseName && target.endpointSha256===confirmation?.endpointSha256,'RECOVERY_PIN_INVALID');
  return target;
}
export function parseRecoveryCredentials(text,target,confirmation) {
  validateRecoveryTarget(target,confirmation);
  const entries=new Map();
  for(const line of text.split(/\r?\n/)) {
    if(!line.trim() || line.trim().startsWith('#'))continue;
    const match=/^(PRODUCTION_RELEASE59_RECOVERY_URL|PRODUCTION_RELEASE59_RECOVERY_TOKEN)=([^\s'"#]+)$/.exec(line);
    demand(match && !entries.has(match[1]),'RECOVERY_CREDENTIAL_INVALID');entries.set(match[1],match[2]);
  }
  demand(entries.size===2,'RECOVERY_CREDENTIAL_INVALID');
  const url=entries.get('PRODUCTION_RELEASE59_RECOVERY_URL'),authToken=entries.get('PRODUCTION_RELEASE59_RECOVERY_TOKEN');
  demand(tursoEndpointFingerprint(url)===target.endpointSha256,'RECOVERY_ENDPOINT_INVALID');
  const hostname=new URL(url).hostname;
  demand(hostname.endsWith('.turso.io') && hostname.startsWith(`${target.databaseName}-`),'RECOVERY_NAME_ENDPOINT_MISMATCH');
  validateWriterToken(authToken);
  return {url,authToken};
}

export async function loadRecoverySource(filename,plan,report) {
  demand(hash(fs.readFileSync(filename))===report.backupSha256 && report.planSha256===plan.planSha256 && report.commit===plan.commit,'RECOVERY_BACKUP_PROVENANCE_INVALID');
  const source=new DatabaseSync(filename,{readOnly:true});
  const execute=async({sql,args=[]})=>({rows:source.prepare(sql).all(...args)});
  const adapter={execute,batch:async items=>Promise.all(items.map(execute))};
  try {
    const before=await snapshot(adapter);checkLedger(before.ledger,plan);
    demand(same(before,report.before),'RECOVERY_BACKUP_CONTENT_CHANGED');
    demand(!before.schema.some(row=>/\bAUTOINCREMENT\b/i.test(row.sql)),'RECOVERY_AUTOINCREMENT_UNAPPROVED');
    const tables=before.schema.filter(row=>row.type==='table');
    const inserts=[];
    for(const table of tables) {
      const columns=source.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(row=>row.name);
      const records=source.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table.name)}`).all();
      const sql=`INSERT INTO ${quote(table.name)}(${columns.map(quote).join(',')}) VALUES(${columns.map(()=>'?').join(',')})`;
      for(const row of records) inserts.push({sql,args:columns.map(column=>row[column])});
    }
    const postData=before.schema.filter(row=>row.type!=='table');
    const rank={index:0,view:1,trigger:2};postData.sort((a,b)=>rank[a.type]-rank[b.type] || a.name.localeCompare(b.name));
    demand(postData.every(row=>Object.hasOwn(rank,row.type)),'RECOVERY_SCHEMA_TYPE_INVALID');
    return {before,tableSql:tables.map(row=>row.sql),indexSql:postData.filter(row=>row.type==='index').map(row=>row.sql),
      inserts,postDataSql:postData.filter(row=>row.type!=='index').map(row=>row.sql)};
  } finally {source.close();}
}
async function objects(db) {
  return (await batch(db,["SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"]))[0];
}
async function verifyRecovered(client,source) {
  const tx=await client.transaction('read');
  try {const restored=await snapshot(tx);demand(same(restored,source.before),'RECOVERY_FULL_COMPARISON_FAILED');return restored;}
  finally {await tx.rollback().catch(()=>{});tx.close();}
}
export async function restoreRecoveryTarget(client,{target,confirmation,source,plan,report,mode}) {
  validateRecoveryTarget(target,confirmation);
  demand(mode==='apply' || mode==='verify-only','RECOVERY_MODE_INVALID');
  demand(same(source.before,report.before) && report.planSha256===plan.planSha256,'RECOVERY_SOURCE_INVALID');
  let tx,commitAttempted=false,outcome;
  try {
    tx=await client.transaction(mode==='apply'?'write':'read');
    const existing=await objects(tx);
    if(existing.length) {
      demand(same(existing,source.before.schema.map(({type,name})=>({type,name}))),'RECOVERY_TARGET_NOT_EMPTY');
      demand(same(await snapshot(tx),source.before),'RECOVERY_TARGET_NOT_EMPTY');
      await tx.rollback();outcome='verified-without-writes';
    } else {
      demand(mode==='apply','RECOVERY_TARGET_EMPTY');
      // All tables precede inserts; every FK is deferred in this same session.
      // Referenced unique indexes precede data so FK resolution is valid.
      // Immutable/audit triggers are installed only after all rows.
      await batch(tx,['PRAGMA defer_foreign_keys=ON',...source.tableSql]);
      await batch(tx,source.indexSql);
      for(let index=0;index<source.inserts.length;index+=128) await batch(tx,source.inserts.slice(index,index+128));
      await batch(tx,source.postDataSql);
      demand(same(await snapshot(tx),source.before),'RECOVERY_FULL_COMPARISON_FAILED');
      commitAttempted=true;await tx.commit();outcome='restored-and-committed';
    }
  } catch(error) {
    await tx?.rollback().catch(()=>{});tx?.close();tx=undefined;
    if(!commitAttempted)throw error;
    // Reconcile a lost commit response through a fresh read; never retry INSERTs.
    await verifyRecovered(client,source);outcome='restore-commit-reconciled';
  } finally {tx?.close();}
  // Evidence always derives from a fresh read of the actual committed target.
  const restoredSnapshot=await verifyRecovered(client,source);
  const evidence={version:1,type:'hosted-nonproduction-turso-restore-verified',observedAt:new Date().toISOString(),
    planSha256:plan.planSha256,backupSha256:report.backupSha256,sourceEndpointSha256:ENDPOINT_SHA256,
    nonProductionEndpointSha256:target.endpointSha256,databaseName:target.databaseName,
    integrity:'ok',foreignKeyViolations:0,restoredSnapshot};
  validateRestoreEvidence(evidence,plan,report);
  return {outcome,evidence};
}
