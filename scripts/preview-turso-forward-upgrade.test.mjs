import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client';
import manifest from '../config/preview-turso-migration-manifest.json' with { type: 'json' };
import target from '../config/preview-turso-migration-target.json' with { type: 'json' };
import { loadForwardPlan, runForwardUpgrade, FORWARD_NAME } from './preview-turso-forward-upgrade.mjs';

const migrationsRoot = path.resolve('prisma/migrations');
const plan = loadForwardPlan(migrationsRoot);
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-forward-local-'));
let number = 0;
function fixture() {
  const file = path.join(runDir, `${++number}.db`);
  const db = new DatabaseSync(file);
  for (const type of ['table','index','view','trigger']) for (const row of plan.beforeSchema.filter(row => row.type === type)) db.exec(row.sql);
  db.exec(`CREATE TABLE _turso_sql_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE _preview_turso_migration_control(singleton INTEGER PRIMARY KEY,version INTEGER,target_name TEXT,endpoint_sha256 TEXT,manifest_sha256 TEXT,migration_count INTEGER,applied_count INTEGER,last_migration TEXT,bootstrap_empty INTEGER);
    CREATE TABLE _preview_turso_migration_state(name TEXT PRIMARY KEY,ordinal INTEGER UNIQUE,sql_sha256 TEXT,manifest_sha256 TEXT,endpoint_sha256 TEXT);
    CREATE TABLE _preview_turso_schema_checkpoint(singleton INTEGER PRIMARY KEY,migration_name TEXT,schema_json TEXT);
    CREATE TABLE _preview_turso_migration_gate(ok INTEGER CHECK(ok=1));`);
  db.prepare('INSERT INTO _preview_turso_migration_control VALUES(1,1,?,?,?,58,58,?,1)').run(target.databaseName,target.endpointSha256,manifest.manifestSha256,manifest.migrations.at(-1).name);
  for (let index = 0; index < 58; index++) {
    const entry = manifest.migrations[index];
    db.prepare('INSERT INTO _turso_sql_migrations VALUES(?,?)').run(entry.name, `original-${index}`);
    db.prepare('INSERT INTO _preview_turso_migration_state VALUES(?,?,?,?,?)').run(entry.name,index+1,entry.sqlSha256,manifest.manifestSha256,target.endpointSha256);
  }
  db.prepare('INSERT INTO _preview_turso_schema_checkpoint VALUES(1,?,?)').run(manifest.migrations.at(-1).name,JSON.stringify(plan.beforeSchema.map(row => [row.type,row.name,row.tbl_name,row.sql])));
  const accountColumns = db.prepare('PRAGMA table_info(Account)').all();
  assert.ok(accountColumns.length);
  db.exec(`INSERT INTO Account(id,email,name,passwordHash,isActive,createdAt,updatedAt) VALUES('fixture-account','fixture@example.invalid','Fixture','synthetic',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO Community(id,name,createdById,updatedAt) VALUES('fixture-club','Fixture Club','fixture-account',CURRENT_TIMESTAMP);
    INSERT INTO Session(id,code,communityId,name,status,endedAt) VALUES('fixture-session','FIXTURE','fixture-club','Completed session','ENDED',CURRENT_TIMESTAMP);
    INSERT INTO Court(id,sessionId,courtNumber) VALUES('fixture-court','fixture-session',1);`);
  for (let index=1; index<=4; index++) {
    db.prepare('INSERT INTO User(id,name,updatedAt) VALUES(?,?,CURRENT_TIMESTAMP)').run(`player-${index}`,`Player ${index}`);
    db.prepare('INSERT INTO CommunityMember(id,communityId,userId,elo) VALUES(?,?,?,?)').run(`member-${index}`,'fixture-club',`player-${index}`,1000+index);
    db.prepare('INSERT INTO SessionPlayer(id,sessionId,userId,matchesPlayed,sessionPoints) VALUES(?,?,?,1,?)').run(`seat-${index}`,'fixture-session',`player-${index}`,index<=2?21:18);
  }
  db.exec(`INSERT INTO Match(id,sessionId,courtId,status,team1User1Id,team1User2Id,team2User1Id,team2User2Id,team1Score,team2Score,winnerTeam,completedAt)
    VALUES('fixture-match','fixture-session','fixture-court','COMPLETED','player-1','player-2','player-3','player-4',21,18,1,CURRENT_TIMESTAMP);
    INSERT INTO ClubRatingAdjustment(id,memberId,actorId,actorName,beforeElo,afterElo,reason)
    VALUES('fixture-rating','member-1','fixture-account','Fixture',1000,1001,'Historical correction');`);
  db.close();
  return file;
}
function native(file) {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  const execute = ({ sql, args = [] }) => ({ rows: db.prepare(sql).all(...args) });
  return { transaction: async mode => {
    db.exec(mode === 'write' ? 'BEGIN IMMEDIATE' : 'BEGIN');
    return { execute, batch: async statements => statements.map(execute), commit: async () => db.exec('COMMIT'), rollback: async () => { if (db.isTransaction) db.exec('ROLLBACK'); }, close() {} };
  }, close: () => db.close() };
}
function instrument(client, hooks = {}) {
  let writes = 0;
  let calls = 0;
  return { get writes() { return writes; }, get calls(){return calls;}, close: () => client.close(), transaction: async mode => {
    if (hooks.unreachable) throw new Error('synthetic credentials must never appear');
    const tx = await client.transaction(mode);
    const execute = async statement => {
      calls++;
      if (!/^\s*(SELECT|PRAGMA)/i.test(statement.sql)) {
        writes++;
        if (writes === hooks.failAt) throw new Error('synthetic SQL secret');
      }
      const result = await tx.execute(statement);
      if (writes === hooks.mutateAt && !hooks.mutated) {
        hooks.mutated = true;
        await tx.execute({ sql: "UPDATE Account SET name='Illegal upgrade mutation'", args: [] });
      }
      return result;
    };
    return { execute, batch: async statements => {
      calls++;
      for(const statement of statements) assert.ok(Array.isArray(statement.args));
      if(hooks.failAt || hooks.mutateAt) {
        // Fault injection models a failed statement inside the same transaction.
        const result=[]; for(const statement of statements) result.push(await execute(statement)); return result;
      }
      writes+=statements.filter(statement=>!/^\s*(SELECT|PRAGMA)/i.test(statement.sql)).length;
      return tx.batch(hooks.failBatch && statements.some(statement=>/^DROP TRIGGER/.test(statement.sql))
        ? statements.map((statement,index)=>index===6?{sql:'INSERT INTO nonexistent_failure_table VALUES(1)',args:[]}:statement):statements);
    }, commit: async () => {
      if (hooks.commit === 'rollback') { await tx.rollback(); throw new Error('synthetic transport secret'); }
      await tx.commit();
      if (hooks.commit === 'lost') throw new Error('synthetic lost response');
      if (hooks.commit === 'unreachable') { hooks.unreachable = true; throw new Error('synthetic lost connection'); }
    }, rollback: (...args) => tx.rollback(...args), close: () => tx.close() };
  } };
}
const invoke = (client, mode = 'apply') => runForwardUpgrade(client, { migrationsRoot, mode });

for (const engine of ['sqlite','libsql']) {
  const connect = file => engine === 'sqlite' ? native(file) : createClient({ url: `file:${file.replaceAll('\\','/')}` });
  test(`${engine}: populated upgrade preserves rows, all 83 guards and provenance; replay and later app data are read-only`, async () => {
    const file = fixture(); const client = instrument(connect(file));
    try {
      const before=await invoke(client,'verify-only'); assert.equal(before.status, 'READY_58'); assert.equal(client.writes, 0);
      const calls=client.calls;
      const result = await invoke(client); assert.equal(result.status, 'COMPLETE_59'); assert.equal(result.identityGuards, 83);
      assert.equal(result.applicationDataSha256,before.applicationDataSha256);
      assert.deepEqual(result.currentCounts,before.currentCounts);
      assert.equal(client.calls-calls,4,'upgrade uses four statement/batch calls under its write lock');
      const ready = result.currentCounts.filter(([,count]) => count>0);
      for(const table of ['Account','Community','CommunityMember','User','Session','SessionPlayer','Court','Match','ClubRatingAdjustment'])assert.ok(ready.some(([name])=>name===table));
      const writes = client.writes;
      assert.equal((await invoke(client)).outcome, 'verified-without-writes'); assert.equal(client.writes, writes);
      const db = new DatabaseSync(file); db.exec("UPDATE Account SET name='Legitimate later activity'"); db.close();
      assert.equal((await invoke(client, 'verify-only')).status, 'COMPLETE_59');
      assert.equal((await invoke(client)).outcome, 'verified-without-writes'); assert.equal(client.writes, writes);
    } finally { client.close(); }
  });
  for (const failAt of [1,2,4,5,7,9,10]) test(`${engine}: atomic rollback at write ${failAt}`, async () => {
    const file = fixture(); const client = instrument(connect(file), { failAt });
    try { await assert.rejects(invoke(client), { code: 'PREVIEW_FORWARD_TRANSACTION_FAILED' }); }
    finally { client.close(); }
    const verify = connect(file);
    try { assert.equal((await invoke(verify, 'verify-only')).status, 'READY_58'); } finally { verify.close(); }
  });
  for (const commit of ['lost','rollback','unreachable']) test(`${engine}: interrupted commit ${commit} reconciles without retry`, async () => {
    const file = fixture(); const client = instrument(connect(file), { commit });
    try {
      if (commit === 'lost') assert.equal((await invoke(client)).outcome, 'commit-reconciled');
      else await assert.rejects(invoke(client), { code: commit==='rollback'?'PREVIEW_FORWARD_COMMIT_ROLLED_BACK':'PREVIEW_FORWARD_RECONCILIATION_UNKNOWN' });
      assert.equal(client.writes, 10);
    } finally { client.close(); }
  });
  test(`${engine}: an application mutation inside the upgrade rolls everything back`, async () => {
    const file=fixture(); const client=instrument(connect(file),{mutateAt:4});
    try { await assert.rejects(invoke(client), {code:'PREVIEW_FORWARD_RECONCILIATION_UNKNOWN'}); } finally {client.close();}
    const verify=connect(file); try {assert.equal((await invoke(verify,'verify-only')).status,'READY_58');} finally {verify.close();}
  });
  test(`${engine}: an actual batch SQL failure rolls all trigger replacements back`,async()=>{
    const file=fixture();const client=instrument(connect(file),{failBatch:true});
    try{await assert.rejects(invoke(client),{code:'PREVIEW_FORWARD_TRANSACTION_FAILED'});}finally{client.close();}
    const verify=connect(file);try{assert.equal((await invoke(verify,'verify-only')).status,'READY_58');}finally{verify.close();}
  });
  test(`${engine}: rejects altered history, unknown schema and partial receipt`, async () => {
    for (const sql of ["UPDATE _preview_turso_migration_state SET sql_sha256='wrong' WHERE ordinal=1", 'CREATE TABLE Surprise(id TEXT)',
      "UPDATE _preview_turso_migration_control SET endpoint_sha256='wrong'", "UPDATE _preview_turso_schema_checkpoint SET schema_json='[]'",
      'CREATE TABLE _preview_turso_forward_59_receipt(singleton INTEGER,payload TEXT)']) {
      const file = fixture(); const db = new DatabaseSync(file); db.exec(sql); db.close();
      const client = instrument(connect(file));
      try { await assert.rejects(invoke(client)); assert.equal(client.writes, 0); } finally { client.close(); }
    }
  });
  test(`${engine}: completed receipt rejects altered old timestamps and receipt data`, async () => {
    for(const sql of ["UPDATE _turso_sql_migrations SET applied_at='altered' WHERE name=(SELECT min(name) FROM _turso_sql_migrations)",
      "UPDATE _preview_turso_forward_59_receipt SET payload=json_set(payload,'$.afterDataSha256','altered')"]){
      const file=fixture(); const client=instrument(connect(file));
      try {await invoke(client); const writes=client.writes; const db=new DatabaseSync(file); db.exec(sql); db.close();
        await assert.rejects(invoke(client,'verify-only')); assert.equal(client.writes,writes);
      } finally {client.close();}
    }
  });
  test(`${engine}: competing attempts cannot duplicate the migration`,async()=>{
    const file=fixture(); const first=instrument(connect(file)); const second=instrument(connect(file));
    try {
      const outcomes=await Promise.allSettled([invoke(first),invoke(second)]);
      assert.ok(outcomes.some(outcome=>outcome.status==='fulfilled'&&outcome.value.status==='COMPLETE_59'));
      assert.equal(first.writes+second.writes,10);
      assert.equal((await invoke(first,'verify-only')).status,'COMPLETE_59');
      assert.equal((await invoke(second)).outcome,'verified-without-writes');
      assert.equal(first.writes+second.writes,10);
    } finally {first.close();second.close();}
  });
}
test('source loader rejects extra migration and changed old bytes', () => {
  const root = path.join(runDir, 'source'); fs.cpSync(migrationsRoot, root, { recursive: true });
  fs.mkdirSync(path.join(root,'20990101000000_unreviewed'));
  assert.throws(() => loadForwardPlan(root), { code: 'PREVIEW_FORWARD_CHAIN_INVALID' });
  fs.rmdirSync(path.join(root,'20990101000000_unreviewed'));
  fs.appendFileSync(path.join(root,manifest.migrations[0].name,'migration.sql'),'\n-- changed');
  assert.throws(() => loadForwardPlan(root), { code: 'PREVIEW_FORWARD_SOURCE_HASH_INVALID' });
});
test('source loader rejects changed SQL59 and CLI rejects target or unknown flags before credentials',()=>{
  const root=path.join(runDir,'source59'); fs.cpSync(migrationsRoot,root,{recursive:true});
  fs.appendFileSync(path.join(root,FORWARD_NAME,'migration.sql'),'\n-- tamper');
  assert.throws(()=>loadForwardPlan(root),{code:'PREVIEW_FORWARD_SOURCE_HASH_INVALID'});
  for(const args of [['--verify-only','--confirm-name','production'],['--verify-only','--credential-file','anything']]){
    const child=spawnSync(process.execPath,['scripts/apply-preview-turso-forward-upgrade.mjs',...args],{encoding:'utf8'});
    assert.equal(child.status,1); assert.match(child.stderr,/PREVIEW_FORWARD_(ARGUMENTS|CONFIRMATION)_INVALID/);
    assert.doesNotMatch(child.stderr,/CREDENTIAL|\.env|synthetic/);
  }
});
