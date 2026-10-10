// Dedicated populated Preview 58 -> 59 procedure. The bootstrap writer stays frozen.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import manifest from '../config/preview-turso-migration-manifest.json' with { type: 'json' };
import target from '../config/preview-turso-migration-target.json' with { type: 'json' };
import { previewManifestSha256 } from './preview-turso-target-guard.mjs';

export const FORWARD_NAME = '20261011000000_balance_identity_guard_expressions';
export const FORWARD_SQL_SHA256 = '7f849180c01ffee7817bd99f5897b4d3ef883c97ebfd540159769c3e33028a29';
const ENDPOINT = '8ea73c70eb4fc6d096af8cf566adbbf98b303c26b3d6a5dc61eb89b0bb8ba497';
const LEDGER = '_turso_sql_migrations';
const CONTROL = '_preview_turso_migration_control';
const STATE = '_preview_turso_migration_state';
const CHECKPOINT = '_preview_turso_schema_checkpoint';
const GATE = '_preview_turso_migration_gate';
const RECEIPT = '_preview_turso_forward_59_receipt';
const INTERNAL = [LEDGER, CONTROL, STATE, CHECKPOINT, GATE, RECEIPT];
const RECEIPT_DDL = `CREATE TABLE "${RECEIPT}" (singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL)`;
const triggerNames = ['Authorized_execution_event_guard', 'ClubMember_retirement_guard'];
const hash = value => createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, (_, item) => typeof item === 'bigint'
  ? { bigint: String(item) } : item instanceof ArrayBuffer || ArrayBuffer.isView(item)
    ? { bytes: Buffer.from(item instanceof ArrayBuffer ? item : item.buffer, item.byteOffset ?? 0, item.byteLength).toString('hex') } : item);
const same = (a, b) => stable(a) === stable(b);
const quote = name => `"${name.replaceAll('"', '""')}"`;
function stop(code) { const error = new Error(code); error.code = code; throw error; }
function demand(condition, code = 'PREVIEW_FORWARD_STATE_INVALID') { if (!condition) stop(code); }
const rows = async (db, sql, args = []) => (await db.execute({ sql, args })).rows.map(row => Object.fromEntries(Object.keys(row).map(key => [key, row[key]])));
const schemaQuery = `SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT IN (${INTERNAL.map(name => `'${name}'`).join(',')}) ORDER BY type,name`;

export const FORWARD_MANIFEST_SHA256 = hash(stable({ version: 1, target: target.databaseName, endpointSha256: ENDPOINT,
  predecessorManifestSha256: manifest.manifestSha256, migration: { name: FORWARD_NAME, sqlSha256: FORWARD_SQL_SHA256 } }));

// This reference schema is independently replayed locally from verified original bytes.
// It never uses a hosted client or any credential, and never modifies a repository DB.
export function loadForwardPlan(migrationsRoot) {
  demand(target.databaseName === 'anti-selek-preview-20261009-fresh'
    && manifest.manifestSha256 === 'e6ea35d804e4816b9d81f6e0b84cfe753a6d1655e7a5b44f060945ed02b523c8'
    && target.endpointSha256 === ENDPOINT && target.migrationCount === 58 && manifest.migrations.length === 58
    && manifest.manifestSha256 === previewManifestSha256(manifest)
    && manifest.target.databaseName === target.databaseName && manifest.target.endpointSha256 === ENDPOINT,
  'PREVIEW_FORWARD_POLICY_INVALID');
  const names = fs.readdirSync(migrationsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const expectedNames = [...manifest.migrations.map(entry => entry.name), FORWARD_NAME];
  demand(same(names, expectedNames), 'PREVIEW_FORWARD_CHAIN_INVALID');
  const migrations = [...manifest.migrations, { name: FORWARD_NAME, sqlSha256: FORWARD_SQL_SHA256 }].map(entry => {
    const bytes = fs.readFileSync(path.join(migrationsRoot, entry.name, 'migration.sql'));
    demand(hash(bytes) === entry.sqlSha256, 'PREVIEW_FORWARD_SOURCE_HASH_INVALID');
    return { ...entry, sql: bytes.toString('utf8') };
  });
  const sql = migrations.at(-1).sql;
  const stripped = sql.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').trim();
  const statements = stripped.match(/DROP TRIGGER "[^"]+";|CREATE TRIGGER "[\s\S]*?BEGIN SELECT RAISE\(ABORT,'[^']+'\); END;/g) ?? [];
  demand(statements.length === 4 && statements.join('\n').replace(/\s/g, '') === stripped.replace(/\s/g, '')
    && statements.every((statement, index) => statement.startsWith(`${index % 2 ? 'CREATE' : 'DROP'} TRIGGER "${triggerNames[Math.floor(index / 2)]}"`)),
  'PREVIEW_FORWARD_SQL_SHAPE_INVALID');
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of migrations.slice(0, 58)) {
      if (migration.name === '20260403075615_add_test_sessions') {
        const existing = new Set(db.prepare('PRAGMA table_info("Session")').all().map(row => row.name));
        for (const [name, definition] of [['poolsEnabled','BOOLEAN NOT NULL DEFAULT false'],['poolAName','TEXT'],['poolBName','TEXT'],
          ['poolACourtAssignments','INTEGER NOT NULL DEFAULT 0'],['poolBCourtAssignments','INTEGER NOT NULL DEFAULT 0'],
          ['poolAMissedTurns','INTEGER NOT NULL DEFAULT 0'],['poolBMissedTurns','INTEGER NOT NULL DEFAULT 0'],['crossoverMissThreshold','INTEGER NOT NULL DEFAULT 1']]) {
          if (!existing.has(name)) db.exec(`ALTER TABLE "Session" ADD COLUMN ${quote(name)} ${definition}`);
        }
      }
      db.exec(migration.sql);
    }
    const beforeSchema = db.prepare(schemaQuery).all().map(row => ({ ...row }));
    for (const statement of statements) db.exec(statement);
    const afterSchema = db.prepare(schemaQuery).all().map(row => ({ ...row }));
    const unchanged = schema => schema.filter(row => !(row.type === 'trigger' && triggerNames.includes(row.name)));
    demand(same(unchanged(beforeSchema), unchanged(afterSchema)), 'PREVIEW_FORWARD_SCHEMA_INVALID');
    demand(afterSchema.filter(row => row.type === 'trigger').length === 83, 'PREVIEW_FORWARD_GUARD_COUNT_INVALID');
    return { statements, beforeSchema, afterSchema };
  } finally { db.close(); }
}

async function snapshot(db, plan) {
  const tables = plan.beforeSchema.filter(row => row.type === 'table').map(row => row.name);
  const queries = [schemaQuery, `SELECT * FROM "${LEDGER}" ORDER BY name`, `SELECT * FROM "${CONTROL}" ORDER BY singleton`,
    `SELECT * FROM "${STATE}" ORDER BY ordinal`, `SELECT * FROM "${CHECKPOINT}" ORDER BY singleton`,
    `SELECT * FROM "${GATE}" ORDER BY rowid`, 'PRAGMA foreign_key_check', 'PRAGMA integrity_check',
    `SELECT sql FROM sqlite_schema WHERE name='${RECEIPT}'`, ...tables.map(table => `SELECT * FROM ${quote(table)}`)];
  const results = await db.batch(queries.map(sql => ({ sql, args: [] })));
  const values = results.map(result => result.rows.map(row => Object.fromEntries(Object.keys(row).map(key => [key, row[key]]))));
  const [schema, ledger, control, state, checkpoint, gate, foreignKeys, integrity, receiptSchema] = values;
  const counts = [];
  const data = [];
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const records = values[index + 9];
    const canonical = records.map(row => stable(Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]])))).sort();
    counts.push([table, records.length]);
    data.push([table, hash(stable(canonical))]);
  }
  demand(foreignKeys.length === 0, 'PREVIEW_FORWARD_FOREIGN_KEYS_INVALID');
  demand(integrity.length === 1 && integrity[0].integrity_check === 'ok', 'PREVIEW_FORWARD_INTEGRITY_INVALID');
  return { receiptSchema, current: { schema, counts, dataSha256: hash(stable(data)), ledger, control, state, checkpoint, gate } };
}

function expectedControl(count) {
  return { singleton: 1, version: 1, target_name: target.databaseName, endpoint_sha256: ENDPOINT,
    manifest_sha256: count === 58 ? manifest.manifestSha256 : FORWARD_MANIFEST_SHA256,
    migration_count: count, applied_count: count, last_migration: count === 58 ? manifest.migrations.at(-1).name : FORWARD_NAME, bootstrap_empty: 1 };
}
function schemaJson(schema) { return JSON.stringify(schema.map(row => [row.type, row.name, row.tbl_name, row.sql])); }
function checkHistory58(saved, plan) {
  demand(same(saved.schema, plan.beforeSchema), 'PREVIEW_FORWARD_SCHEMA_DRIFT');
  demand(saved.ledger.length === 58 && saved.state.length === 58 && same(saved.control, [expectedControl(58)]));
  for (let index = 0; index < 58; index++) {
    const entry = manifest.migrations[index];
    demand(saved.ledger[index].name === entry.name && typeof saved.ledger[index].applied_at === 'string'
      && same(saved.state[index], { name: entry.name, ordinal: index + 1, sql_sha256: entry.sqlSha256,
        manifest_sha256: manifest.manifestSha256, endpoint_sha256: ENDPOINT }));
  }
  demand(same(saved.checkpoint, [{ singleton: 1, migration_name: manifest.migrations.at(-1).name, schema_json: schemaJson(plan.beforeSchema) }]));
  demand(Array.isArray(saved.gate) && saved.gate.every(row => same(row, { ok: 1 })));
}

async function inspect(db, plan, preservation) {
  const { receiptSchema, current } = await snapshot(db, plan);
  if (!receiptSchema.length) {
    checkHistory58(current, plan);
    if (preservation) demand(same(current, preservation), 'PREVIEW_FORWARD_RECONCILIATION_UNKNOWN');
    return { phase: 58, current };
  }
  demand(receiptSchema.length === 1 && receiptSchema[0].sql === RECEIPT_DDL);
  const records = await rows(db, `SELECT * FROM "${RECEIPT}" ORDER BY singleton`);
  demand(records.length === 1 && records[0].singleton === 1);
  let receipt;
  try { receipt = JSON.parse(records[0].payload); } catch { stop('PREVIEW_FORWARD_RECEIPT_INVALID'); }
  demand(receipt.version === 1 && receipt.forwardManifestSha256 === FORWARD_MANIFEST_SHA256
    && receipt.sqlSha256 === FORWARD_SQL_SHA256 && typeof receipt.appliedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.appliedAt)
    && receipt.beforeDataSha256 === receipt.afterDataSha256
    && same(receipt.beforeCounts, receipt.afterCounts) && receipt.beforeDataSha256 === receipt.predecessor.dataSha256
    && same(receipt.beforeCounts, receipt.predecessor.counts), 'PREVIEW_FORWARD_RECEIPT_INVALID');
  checkHistory58(receipt.predecessor, plan);
  demand(same(current.schema, plan.afterSchema), 'PREVIEW_FORWARD_SCHEMA_DRIFT');
  demand(same(current.ledger.slice(0, 58), receipt.predecessor.ledger)
    && current.ledger.length === 59 && current.ledger[58].name === FORWARD_NAME && current.ledger[58].applied_at === receipt.appliedAt
    && same(current.state.slice(0, 58), receipt.predecessor.state) && current.state.length === 59
    && same(current.state[58], { name: FORWARD_NAME, ordinal: 59, sql_sha256: FORWARD_SQL_SHA256,
      manifest_sha256: FORWARD_MANIFEST_SHA256, endpoint_sha256: ENDPOINT })
    && same(current.control, [expectedControl(59)]) && same(current.gate, receipt.predecessor.gate)
    && same(current.checkpoint, [{ singleton: 1, migration_name: FORWARD_NAME, schema_json: schemaJson(plan.afterSchema) }]));
  if (preservation) demand(same(receipt.predecessor, preservation) && current.dataSha256 === preservation.dataSha256
    && same(current.counts, preservation.counts), 'PREVIEW_FORWARD_RECONCILIATION_UNKNOWN');
  return { phase: 59, current };
}

function result(state, outcome) {
  return { status: state.phase === 59 ? 'COMPLETE_59' : 'READY_58', outcome,
    applied: state.phase, schemaSha256: hash(schemaJson(state.current.schema)),
    currentCounts: state.current.counts, applicationDataSha256: state.current.dataSha256,
    forwardManifestSha256: FORWARD_MANIFEST_SHA256, foreignKeyViolations: 0, identityGuards: 83 };
}

// Caller owns the client. All inspections, including verify-only/replay, use read transactions.
export async function runForwardUpgrade(client, { migrationsRoot, mode }) {
  demand(mode === 'verify-only' || mode === 'apply', 'PREVIEW_FORWARD_ARGUMENTS_INVALID');
  let plan;
  try { plan = loadForwardPlan(migrationsRoot); } catch (error) {
    if (error?.code?.startsWith('PREVIEW_FORWARD_')) throw error;
    stop('PREVIEW_FORWARD_SOURCE_UNAVAILABLE');
  }
  let tx;
  let before;
  let commitAttempted = false;
  try {
    tx = await client.transaction(mode === 'apply' ? 'write' : 'read');
    const state = await inspect(tx, plan);
    if (mode === 'verify-only' || state.phase === 59) {
      await tx.rollback();
      return result(state, state.phase === 59 ? 'verified-without-writes' : 'read-only-ready');
    }
    before = state.current;
    const receipt = { version: 1, appliedAt: new Date().toISOString(), forwardManifestSha256: FORWARD_MANIFEST_SHA256, sqlSha256: FORWARD_SQL_SHA256,
      predecessor: before, beforeCounts: before.counts, afterCounts: before.counts,
      beforeDataSha256: before.dataSha256, afterDataSha256: before.dataSha256 };
    await tx.batch([...plan.statements.map(sql => ({ sql, args: [] })), { sql: RECEIPT_DDL, args: [] },
      { sql: `INSERT INTO "${RECEIPT}" VALUES (1,?)`, args: [stable(receipt)] },
      { sql: `INSERT INTO "${LEDGER}" (name,applied_at) VALUES (?,?)`, args: [FORWARD_NAME, receipt.appliedAt] },
      { sql: `INSERT INTO "${STATE}" (name,ordinal,sql_sha256,manifest_sha256,endpoint_sha256) VALUES (?,59,?,?,?)`,
        args: [FORWARD_NAME, FORWARD_SQL_SHA256, FORWARD_MANIFEST_SHA256, ENDPOINT] },
      { sql: `UPDATE "${CONTROL}" SET manifest_sha256=?,migration_count=59,applied_count=59,last_migration=? WHERE singleton=1`,
        args: [FORWARD_MANIFEST_SHA256, FORWARD_NAME] },
      { sql: `UPDATE "${CHECKPOINT}" SET migration_name=?,schema_json=? WHERE singleton=1`, args: [FORWARD_NAME, schemaJson(plan.afterSchema)] }]);
    const after = await inspect(tx, plan, before);
    commitAttempted = true;
    await tx.commit();
    return result(after, 'committed');
  } catch (error) {
    try { await tx?.rollback(); } catch { /* Never emit provider errors or SQL. */ }
    try { tx?.close(); } catch { /* May already be closed. */ }
    tx = undefined;
    if (commitAttempted) {
      // Never resend writes after an uncertain commit. Reconcile using a fresh read transaction.
      let read;
      try {
        read = await client.transaction('read');
        const recovered = await inspect(read, plan, before);
        await read.rollback();
        if (recovered.phase === 59) return result(recovered, 'commit-reconciled');
        stop('PREVIEW_FORWARD_COMMIT_ROLLED_BACK');
      } catch (reconciliation) {
        if (reconciliation?.code === 'PREVIEW_FORWARD_COMMIT_ROLLED_BACK') throw reconciliation;
        stop('PREVIEW_FORWARD_RECONCILIATION_UNKNOWN');
      } finally {
        try { await read?.rollback(); } catch { /* No SQL details. */ }
        try { read?.close(); } catch { /* No SQL details. */ }
      }
    }
    if (error?.code?.startsWith('PREVIEW_FORWARD_')) throw error;
    stop('PREVIEW_FORWARD_TRANSACTION_FAILED');
  } finally { try { tx?.close(); } catch { /* No provider details. */ } }
}
