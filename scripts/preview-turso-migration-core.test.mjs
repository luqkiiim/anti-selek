import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";
import manifestSource from "../config/preview-turso-migration-manifest.json" with { type: "json" };
import {
  createPreviewMigrationRunner,
  createPreviewHttpBatchDiagnostics,
  formatPreviewFailure,
  readProtectedPreviewCredentialFile,
  resolvePreviewCredentialLocation,
  validateWindowsHigherAncestorAclJson,
  validateWindowsParentAclJson,
  validateWindowsPrivateAclJson,
} from "./preview-turso-migration-core.mjs";
import {
  endpointFingerprint,
  previewManifestSha256,
} from "./preview-turso-target-guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(projectRoot, "prisma", "migrations");
const fixtureUrl = "https://preview-fixture.invalid";
const fixtureToken = "synthetic-preview-token-for-local-tests";
const fixtureTarget = Object.freeze({
  databaseName: "preview-fixture",
  endpointSha256: endpointFingerprint(fixtureUrl),
  migrationCount: manifestSource.migrations.length,
});
const fixtureManifest = {
  ...manifestSource,
  target: {
    databaseName: fixtureTarget.databaseName,
    endpointSha256: fixtureTarget.endpointSha256,
    migrationCount: fixtureTarget.migrationCount,
  },
  manifestSha256: "",
};
fixtureManifest.manifestSha256 = previewManifestSha256(fixtureManifest);
Object.freeze(fixtureManifest.target);
Object.freeze(fixtureManifest.migrations);
Object.freeze(fixtureManifest);
const fixtureConfirmation = Object.freeze({
  databaseName: fixtureTarget.databaseName,
  endpointSha256: fixtureTarget.endpointSha256,
  manifestSha256: fixtureManifest.manifestSha256,
  expectEmpty: true,
});
const syntheticCredentialText = `PREVIEW_TURSO_DATABASE_URL=${fixtureUrl}\nPREVIEW_TURSO_AUTH_TOKEN=${fixtureToken}\n`;
const syntheticReadFile = async (...args) => {
  assert.equal(args.length, 0, "the internal test reader must not accept a credential path override");
  return syntheticCredentialText;
};
const matchesErrorCode = (error, expected) => error?.code === expected || error?.message === expected;
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-migration-core-tests-"));
let fixtureNumber = 0;

function makeRun({
  target = fixtureTarget,
  manifest = fixtureManifest,
  migrationRoot = migrationsRoot,
} = {}) {
  return createPreviewMigrationRunner({ target, manifest, migrationsRoot: migrationRoot });
}

function nextFixturePath(engine, label) {
  fixtureNumber += 1;
  return path.join(runDir, `${String(fixtureNumber).padStart(3, "0")}-${engine}-${label}.db`);
}

function makeKnownFolders(rootPath, currentSid = "S-1-5-21-100-200-300-1001") {
  const profilePath = path.join(rootPath, "profile");
  return {
    profilePath,
    currentSid,
    knownFolderResolver: () => ({ profilePath, currentSid }),
  };
}

const WINDOWS_ACL_TEST_QUERY = `$ErrorActionPreference = 'Stop';
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;
$itemPath = [Console]::In.ReadToEnd();
$item = Get-Item -LiteralPath $itemPath -Force;
$acl = Get-Acl -LiteralPath $itemPath;
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;
$entries = @($acl.Access | ForEach-Object {
  $sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;
  $inheritOnly = (($_.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0);
  [PSCustomObject]@{
    sid = $sid;
    access = $_.AccessControlType.ToString();
    rightsMask = [int64]$_.FileSystemRights;
    isInherited = [bool]$_.IsInherited;
    isInheritOnly = [bool]$inheritOnly
  }
});
[PSCustomObject]@{
  currentSid = $currentSid;
  ownerSid = $ownerSid;
  daclProtected = [bool]$acl.AreAccessRulesProtected;
  reparsePoint = (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0);
  entries = $entries
} | ConvertTo-Json -Compress -Depth 4`;

function readActualWindowsAclSnapshot(filename) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_ACL_TEST_QUERY], {
    input: filename,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, "Windows ACL metadata query must succeed for the requested fixture path");
  return JSON.parse(result.stdout);
}

function isWithinWindowsPath(parent, candidate) {
  const relative = path.win32.relative(path.win32.resolve(parent), path.win32.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.win32.sep}`) && relative !== ".." && !path.win32.isAbsolute(relative));
}

function windowsComponentsThrough(filename) {
  const parsed = path.win32.parse(filename);
  const components = [parsed.root];
  let current = parsed.root;
  for (const segment of filename.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean)) {
    current = path.win32.join(current, segment);
    components.push(current);
  }
  return components;
}

function safeSyntheticWindowsAcl(currentSid) {
  return {
    currentSid,
    ownerSid: currentSid,
    daclProtected: true,
    reparsePoint: false,
    entries: [currentSid, "S-1-5-18", "S-1-5-32-544"].map((sid) => ({
      sid,
      access: "Allow",
      rightsMask: 0x001f01ff,
      isInherited: false,
      isInheritOnly: false,
    })),
  };
}

function makeNativeSqliteClient(filename) {
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA foreign_keys=ON");
  const execute = (input) => {
    const sql = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? [] : input.args ?? [];
    const rows = db.prepare(sql).all(...args);
    return { rows, rowsAffected: 0 };
  };
  return {
    execute,
    executeMultiple: async (sql) => {
      try {
        db.exec(sql);
      } catch (error) {
        // Match the installed file-backed libSQL client's rollback-on-batch-error behavior.
        try { db.exec("ROLLBACK"); } catch { /* No active explicit transaction. */ }
        throw error;
      }
    },
    transaction: async () => {
      db.exec("BEGIN IMMEDIATE");
      let active = true;
      return {
        execute,
        executeMultiple: async (sql) => db.exec(sql),
        commit: async () => {
          db.exec("COMMIT");
          active = false;
        },
        rollback: async () => {
          if (!active) return;
          db.exec("ROLLBACK");
          active = false;
        },
        close: () => {},
      };
    },
    close: async () => db.close(),
  };
}

async function makeLocalLibsqlClient(filename) {
  if (!fs.existsSync(filename)) fs.writeFileSync(filename, "");
  const url = `file:${filename.replaceAll("\\", "/")}`;
  return createClient({ url, authToken: fixtureToken });
}

function makeClientFactory(engine, filename, hooks = {}) {
  return async ({ url, authToken }) => {
    assert.equal(url, fixtureUrl, "the injected client must receive only the synthetic fixture endpoint");
    assert.equal(authToken, fixtureToken, "the injected client must receive only the synthetic fixture token");
    const client = engine === "sqlite" ? makeNativeSqliteClient(filename) : await makeLocalLibsqlClient(filename);
    return hooks.wrapClient ? hooks.wrapClient(client) : client;
  };
}

function makeArgumentArrayAssertingFactory(engine, filename) {
  const observedOperations = new Set();
  return {
    observedOperations,
    clientFactory: makeClientFactory(engine, filename, {
      wrapClient(client) {
        return {
          execute(input, ...args) {
            if (typeof input !== "string") {
              assert.ok(Array.isArray(input.args), "statement objects must provide an explicit args array");
              if (input.sql.includes("SELECT type, name FROM sqlite_schema")) {
                observedOperations.add("schema-object-list");
              }
              if (input.sql.includes("SELECT name FROM sqlite_schema") && input.sql.includes("AND name NOT IN")) {
                observedOperations.add("application-table-list");
              }
            }
            return client.execute(input, ...args);
          },
          close() {
            return client.close();
          },
        };
      },
    }),
  };
}

async function invoke(run, {
  mode = "initial",
  confirmation = fixtureConfirmation,
  readFile = syntheticReadFile,
  clientFactory,
} = {}) {
  return run({
    mode,
    confirmation: mode === "initial" ? confirmation : { ...confirmation, expectEmpty: false },
    readFile,
    clientFactory,
  });
}

async function inspectSqlite(filename, callback) {
  const db = new DatabaseSync(filename, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA foreign_keys=ON");
  try {
    return await callback({
      execute(input, fallbackArgs = []) {
        const sql = typeof input === "string" ? input : input.sql;
        const args = typeof input === "string" ? fallbackArgs : input.args ?? [];
        return { rows: db.prepare(sql).all(...args) };
      },
      executeMultiple(sql) { db.exec(sql); },
    });
  } finally {
    db.close();
  }
}

async function inspectLibsql(filename, callback) {
  const client = await makeLocalLibsqlClient(filename);
  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

async function countRows(db, table) {
  const result = await db.execute(`SELECT COUNT(*) AS count FROM "${table}"`);
  return Number(result.rows[0].count);
}

async function appliedNames(db) {
  const result = await db.execute('SELECT name FROM "_turso_sql_migrations" ORDER BY name');
  return result.rows.map((row) => String(row.name));
}

async function schemaJson(db) {
  const result = await db.execute(`SELECT json_group_array(json_array("type", "name", "tbl_name", "sql")) AS schema_json
    FROM (
      SELECT "type", "name", "tbl_name", "sql"
      FROM sqlite_schema
      WHERE "sql" IS NOT NULL
        AND "name" NOT LIKE 'sqlite_%'
        AND "name" NOT IN ('_turso_sql_migrations','_preview_turso_migration_control',
          '_preview_turso_migration_state','_preview_turso_schema_checkpoint','_preview_turso_migration_gate')
      ORDER BY "type", "name"
    )`);
  return result.rows[0].schema_json ?? "[]";
}

async function databaseSnapshot(db) {
  const schema = await db.execute(`SELECT type,name,tbl_name,sql FROM sqlite_schema
    WHERE sql IS NOT NULL ORDER BY type,name`);
  const ledger = await db.execute('SELECT name,applied_at FROM "_turso_sql_migrations" ORDER BY name');
  const control = await db.execute('SELECT * FROM "_preview_turso_migration_control" ORDER BY singleton');
  const state = await db.execute('SELECT * FROM "_preview_turso_migration_state" ORDER BY ordinal');
  const checkpoint = await db.execute('SELECT * FROM "_preview_turso_schema_checkpoint" ORDER BY singleton');
  const gate = await db.execute('SELECT * FROM "_preview_turso_migration_gate" ORDER BY rowid');
  const foreignKeys = await db.execute("PRAGMA foreign_key_check");
  const integrity = await db.execute("PRAGMA integrity_check");
  return JSON.parse(JSON.stringify({
    schema: schema.rows,
    ledger: ledger.rows,
    control: control.rows,
    state: state.rows,
    checkpoint: checkpoint.rows,
    gate: gate.rows,
    foreignKeys: foreignKeys.rows,
    integrity: integrity.rows,
  }, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

function makeCheckpointFaultFactory(engine, filename, targetName, mode) {
  const targetSql = fs.readFileSync(path.join(migrationsRoot, targetName, "migration.sql"), "utf8");
  const faultState = { before: null, triggered: false };
  const managed = targetName === "20261004120000_separate_accounts_players";

  const wrapClient = (client) => {
    const originalExecuteMultiple = client.executeMultiple.bind(client);
    const originalTransaction = client.transaction.bind(client);
    return {
      execute: (...args) => client.execute(...args),
      executeMultiple: async (sql) => {
        if (managed && sql.includes("-- ACCOUNT_PLAYER_MANAGED_TRANSACTION")) {
          faultState.before = await databaseSnapshot(client);
          faultState.triggered = true;
          const injected = sql.replace(/(^|\r?\n)COMMIT;(\r?\n|$)/m, "$1SELECT * FROM \"__preview_forced_failure__\";\nCOMMIT;$2");
          assert.notEqual(injected, sql, "managed SQL must have a single commit marker to inject the local failure");
          return originalExecuteMultiple(injected);
        }
        return originalExecuteMultiple(sql);
      },
      transaction: async (...args) => {
        const transaction = await originalTransaction(...args);
        let targeted = false;
        return {
          execute: async (...callArgs) => {
            if (
              targetName === "20260403075615_add_test_sessions" &&
              !faultState.before &&
              typeof callArgs[0] === "string" &&
              callArgs[0].trim().toLowerCase() === 'pragma table_info("session")'
            ) {
              faultState.before = await databaseSnapshot(transaction);
            }
            return transaction.execute(...callArgs);
          },
          executeMultiple: async (sql) => {
            if (!managed && sql.trim() === targetSql.trim()) {
              targeted = true;
              if (!faultState.before) faultState.before = await databaseSnapshot(transaction);
            }
            return transaction.executeMultiple(sql);
          },
          commit: async () => {
            if (targeted && mode === "before-commit") {
              faultState.triggered = true;
              throw new Error("SYNTHETIC_PRECOMMIT_FAILURE");
            }
            if (targeted && mode === "after-commit") {
              await transaction.commit();
              faultState.triggered = true;
              throw new Error("SYNTHETIC_COMMIT_ACK_LOST");
            }
            return transaction.commit();
          },
          rollback: (...callArgs) => transaction.rollback(...callArgs),
          close: (...callArgs) => transaction.close?.(...callArgs),
        };
      },
      close: (...args) => client.close?.(...args),
    };
  };

  return {
    faultState,
    clientFactory: makeClientFactory(engine, filename, { wrapClient }),
  };
}

function makeMigrationRecordingFactory(engine, filename, observedNames) {
  const record = (sql) => {
    if (sql.includes("-- ACCOUNT_PLAYER_MANAGED_TRANSACTION")) {
      observedNames.push("20261004120000_separate_accounts_players");
      return;
    }
    const migration = fixtureManifest.migrations.find((entry) => {
      const expectedSql = fs.readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8");
      return sql.trim() === expectedSql.trim();
    });
    if (migration) observedNames.push(migration.name);
  };

  return makeClientFactory(engine, filename, {
    wrapClient(client) {
      const clientExecute = client.execute.bind(client);
      const clientExecuteMultiple = client.executeMultiple.bind(client);
      const clientTransaction = client.transaction.bind(client);
      return {
        execute: (...args) => clientExecute(...args),
        executeMultiple: async (sql) => {
          record(sql);
          return clientExecuteMultiple(sql);
        },
        transaction: async (...args) => {
          const transaction = await clientTransaction(...args);
          const transactionExecute = transaction.execute.bind(transaction);
          const transactionExecuteMultiple = transaction.executeMultiple.bind(transaction);
          return {
            execute: (...callArgs) => transactionExecute(...callArgs),
            executeMultiple: async (sql) => {
              record(sql);
              return transactionExecuteMultiple(sql);
            },
            commit: (...callArgs) => transaction.commit(...callArgs),
            rollback: (...callArgs) => transaction.rollback(...callArgs),
            close: (...callArgs) => transaction.close?.(...callArgs),
          };
        },
        close: (...args) => client.close?.(...args),
      };
    },
  });
}

async function inspectEngine(engine, filename, callback) {
  return engine === "sqlite"
    ? inspectSqlite(filename, callback)
    : inspectLibsql(filename, callback);
}

async function syncCheckpointSchema(db) {
  await db.execute({
    sql: 'UPDATE "_preview_turso_schema_checkpoint" SET schema_json=? WHERE singleton=1',
    args: [await schemaJson(db)],
  });
}

async function assertHealthyEmptyDatabase(db) {
  const integrity = await db.execute("PRAGMA integrity_check");
  assert.deepEqual(integrity.rows.map((row) => Object.values(row)[0]), ["ok"]);
  const foreignKeys = await db.execute("PRAGMA foreign_key_check");
  assert.equal(foreignKeys.rows.length, 0);
  const appTables = await db.execute(`SELECT name FROM sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
      AND name NOT IN ('_turso_sql_migrations','_preview_turso_migration_control',
        '_preview_turso_migration_state','_preview_turso_schema_checkpoint','_preview_turso_migration_gate')
    ORDER BY name`);
  for (const row of appTables.rows) assert.equal(await countRows(db, String(row.name)), 0, `${row.name} should remain empty`);
}

test("applies and read-only verifies all frozen migrations on native SQLite", async () => {
  const filename = nextFixturePath("sqlite", "full-chain");
  const run = makeRun();
  const result = await invoke(run, { clientFactory: makeClientFactory("sqlite", filename) });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.applied, 58);
  assert.equal(result.total, 58);
  await inspectSqlite(filename, async (db) => {
    assert.deepEqual(await appliedNames(db), fixtureManifest.migrations.map((entry) => entry.name));
    await assertHealthyEmptyDatabase(db);
    const columns = await db.execute('PRAGMA table_info("Session")');
    const names = new Set(columns.rows.map((row) => String(row.name)));
    for (const required of ["poolsEnabled", "poolAName", "poolBName", "poolACourtAssignments", "poolBCourtAssignments", "poolAMissedTurns", "poolBMissedTurns", "crossoverMissThreshold"]) {
      assert.ok(names.has(required), `missing Session compatibility column ${required}`);
    }
    const statementTracking = makeArgumentArrayAssertingFactory("sqlite", filename);
    const reread = await invoke(run, {
      mode: "verify-only",
      clientFactory: statementTracking.clientFactory,
    });
    assert.equal(reread.status, "COMPLETE");
    assert.equal(reread.applied, 58);
    assert.deepEqual(
      [...statementTracking.observedOperations],
      ["application-table-list"],
      "complete verify-only must send its application-table-list statement with explicit empty args",
    );
  });
});

test("applies and read-only verifies all frozen migrations on local file-backed libSQL", async () => {
  const filename = nextFixturePath("libsql", "full-chain");
  const run = makeRun();
  const result = await invoke(run, { clientFactory: makeClientFactory("libsql", filename) });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.applied, 58);
  assert.equal(result.total, 58);
  await inspectLibsql(filename, async (db) => {
    assert.deepEqual(await appliedNames(db), fixtureManifest.migrations.map((entry) => entry.name));
    await assertHealthyEmptyDatabase(db);
    const statementTracking = makeArgumentArrayAssertingFactory("libsql", filename);
    const reread = await invoke(run, {
      mode: "verify-only",
      clientFactory: statementTracking.clientFactory,
    });
    assert.equal(reread.status, "COMPLETE");
    assert.equal(reread.applied, 58);
    assert.deepEqual(
      [...statementTracking.observedOperations],
      ["application-table-list"],
      "complete verify-only must send its application-table-list statement with explicit empty args",
    );
  });
});

test("rolls back protected migration checkpoints, rejects data on resume, and recovers an ack-lost commit", async (t) => {
  const checkpointNames = [
    "20260403075615_add_test_sessions",
    "20261004120000_separate_accounts_players",
    "20261008120000_placeholder_claim_recovery",
    "20261008140000_authorized_identity_transitions",
    "20261008150000_correction_global_identity_guards",
    "20261008160000_ordinary_claim_identity_authority",
  ];

  for (const engine of ["sqlite", "libsql"]) {
    await t.test(engine, async (engineTest) => {
      for (const targetName of checkpointNames) {
        await engineTest.test(targetName, async () => {
          const filename = nextFixturePath(engine, `${targetName}-rollback-resume`);
          const run = makeRun();
          const targetIndex = fixtureManifest.migrations.findIndex((entry) => entry.name === targetName);
          assert.notEqual(targetIndex, -1, `${targetName} must be in the frozen chain`);
          assert.equal(fs.existsSync(filename), false, "each checkpoint fault uses a fresh empty database");

          const fault = makeCheckpointFaultFactory(engine, filename, targetName, "before-commit");
          const expectedCode = targetName === "20261004120000_separate_accounts_players"
            ? "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"
            : "PREVIEW_MIGRATION_TRANSACTION_FAILED";
          await assert.rejects(
            invoke(run, { mode: "initial", clientFactory: fault.clientFactory }),
            (error) => matchesErrorCode(error, expectedCode),
          );
          assert.equal(fault.faultState.triggered, true, "the intended checkpoint fault must be reached");

          await inspectEngine(engine, filename, async (db) => {
            const afterFailure = await databaseSnapshot(db);
            assert.deepEqual(afterFailure, fault.faultState.before, "failure must preserve the complete pre-migration snapshot");
            assert.equal((await appliedNames(db)).length, targetIndex, "failed migration must not appear in the durable ledger");
            await assertHealthyEmptyDatabase(db);
            if (targetName === "20260403075615_add_test_sessions") {
              const columns = await db.execute('PRAGMA table_info("Session")');
              const names = new Set(columns.rows.map((row) => String(row.name)));
              assert.ok(!names.has("poolsEnabled"), "Session compatibility ALTERs must roll back with the migration");
            }
          });

          if (targetName === checkpointNames.at(-1)) {
            const row = {
              key: "synthetic-preview-bootstrap-check",
              scope: "test",
              count: 1,
              resetAt: "2030-01-01T00:00:00.000Z",
              createdAt: "2030-01-01T00:00:00.000Z",
              updatedAt: "2030-01-01T00:00:00.000Z",
            };
            await inspectEngine(engine, filename, async (db) => {
              await db.execute({
                sql: 'INSERT INTO "RateLimitBucket" ("key","scope","count","resetAt","createdAt","updatedAt") VALUES (?,?,?,?,?,?)',
                args: [row.key, row.scope, row.count, row.resetAt, row.createdAt, row.updatedAt],
              });
            });
            await assert.rejects(
              invoke(run, { mode: "resume", clientFactory: makeClientFactory(engine, filename) }),
              (error) => matchesErrorCode(error, "PREVIEW_BOOTSTRAP_DATA_NOT_EMPTY"),
            );
            await inspectEngine(engine, filename, async (db) => {
              assert.equal(await countRows(db, "RateLimitBucket"), 1, "resume rejection must preserve the inserted row");
              assert.equal((await appliedNames(db)).length, targetIndex, "nonempty resume must not advance the migration prefix");
              await db.execute({ sql: 'DELETE FROM "RateLimitBucket" WHERE "key"=?', args: [row.key] });
            });

            const lostAck = makeCheckpointFaultFactory(engine, filename, targetName, "after-commit");
            await assert.rejects(
              invoke(run, { mode: "resume", clientFactory: lostAck.clientFactory }),
              (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_TRANSACTION_FAILED"),
            );
            assert.equal(lostAck.faultState.triggered, true, "commit acknowledgement loss must happen after the durable commit");
            const recovered = await invoke(run, { mode: "resume", clientFactory: makeClientFactory(engine, filename) });
            assert.equal(recovered.status, "COMPLETE");
            assert.equal(recovered.applied, 58);

            await inspectEngine(engine, filename, async (db) => {
              assert.deepEqual(await appliedNames(db), fixtureManifest.migrations.map((entry) => entry.name));
              await assertHealthyEmptyDatabase(db);

              const latestMigration = fixtureManifest.migrations.at(-1);
              const latestSql = fs.readFileSync(path.join(migrationsRoot, latestMigration.name, "migration.sql"), "utf8");
              const latestTrigger = [...latestSql.matchAll(/CREATE\s+TRIGGER\s+"([^"\r\n]+)"/gi)].at(-1)?.[1];
              assert.ok(latestTrigger, "the final migration must declare an identity guard trigger");
              await db.execute(`DROP TRIGGER "${latestTrigger}"`);
              await syncCheckpointSchema(db);
              const beforeMissingGuardVerify = await databaseSnapshot(db);
              await assert.rejects(
                invoke(run, { mode: "verify-only", clientFactory: makeClientFactory(engine, filename) }),
                (error) => matchesErrorCode(error, "PREVIEW_IDENTITY_GUARD_MISSING"),
              );
              assert.deepEqual(await databaseSnapshot(db), beforeMissingGuardVerify, "verify-only must not repair or mutate a missing guard");

              await db.execute("PRAGMA foreign_keys=OFF");
              await db.execute('CREATE TABLE "PreviewWriterFkProbe" ("id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "User"("id"))');
              await db.execute('INSERT INTO "PreviewWriterFkProbe" ("id","accountId") VALUES (\'orphan\',\'missing-account\')');
              await db.execute("PRAGMA foreign_keys=ON");
              await syncCheckpointSchema(db);
              const beforeForeignKeyVerify = await databaseSnapshot(db);
              await assert.rejects(
                invoke(run, { mode: "verify-only", clientFactory: makeClientFactory(engine, filename) }),
                (error) => matchesErrorCode(error, "PREVIEW_FOREIGN_KEY_CHECK_FAILED"),
              );
              assert.deepEqual(await databaseSnapshot(db), beforeForeignKeyVerify, "foreign-key verification must remain read-only");
            });
          }
        });
      }
    });
  }
});

test("guarded resume from verified prefix 50 runs only migrations 51 through 58 on both local engines", async (t) => {
  const targetName = "20261004120000_separate_accounts_players";
  const targetIndex = fixtureManifest.migrations.findIndex((entry) => entry.name === targetName);
  assert.equal(targetIndex, 50);

  for (const engine of ["sqlite", "libsql"]) {
    await t.test(engine, async () => {
      const filename = nextFixturePath(engine, "prefix-50-resume");
      const run = makeRun();
      const fault = makeCheckpointFaultFactory(engine, filename, targetName, "before-commit");
      await assert.rejects(
        invoke(run, { mode: "initial", clientFactory: fault.clientFactory }),
        (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"),
      );
      assert.equal(fault.faultState.triggered, true);

      const prefix = await invoke(run, {
        mode: "verify-only",
        clientFactory: makeClientFactory(engine, filename),
      });
      assert.equal(prefix.status, "RESUMABLE_PREFIX");
      assert.equal(prefix.applied, 50);
      assert.equal(prefix.total, 58);

      const resumedMigrationNames = [];
      const resumed = await invoke(run, {
        mode: "resume",
        clientFactory: makeMigrationRecordingFactory(engine, filename, resumedMigrationNames),
      });
      assert.equal(resumed.status, "COMPLETE");
      assert.equal(resumed.applied, 58);
      assert.deepEqual(
        resumedMigrationNames,
        fixtureManifest.migrations.slice(50).map((entry) => entry.name),
        "guarded resume from prefix 50 must execute only migrations 51 through 58",
      );

      await inspectEngine(engine, filename, async (db) => {
        assert.deepEqual(await appliedNames(db), fixtureManifest.migrations.map((entry) => entry.name));
        await assertHealthyEmptyDatabase(db);
      });
    });
  }
});

test("managed prefix 50 gate reproduces the expression-depth limit without blaming frozen migration SQL", async () => {
  const filename = nextFixturePath("sqlite", "gate-expression-depth");
  const run = makeRun();
  const fault = makeCheckpointFaultFactory("sqlite", filename, "20261004120000_separate_accounts_players", "before-commit");
  await assert.rejects(invoke(run, { mode: "initial", clientFactory: fault.clientFactory }),
    (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"));
  let injected;
  await assert.rejects(invoke(run, { mode: "resume", clientFactory: makeClientFactory("sqlite", filename, {
    wrapClient(client) {
      return { ...client, executeMultiple: async (sql) => { injected = sql; throw new Error("SYNTHETIC_CAPTURE_ONLY"); } };
    },
  }) }), (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"));
  const gateStart = injected.indexOf('INSERT INTO "_preview_turso_migration_gate"');
  const gateEnd = injected.indexOf('DELETE FROM "_preview_turso_migration_gate";') + 'DELETE FROM "_preview_turso_migration_gate";'.length;
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gate = injected.slice(gateStart, gateEnd);
  const frozen = fs.readFileSync(path.join(migrationsRoot, "20261004120000_separate_accounts_players", "migration.sql"), "utf8");
  const python = `import sqlite3, shutil, sys, json
source, script, clone = sys.argv[1:]
shutil.copyfile(source, clone)
db = sqlite3.connect(clone)
db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)
try:
 db.executescript(open(script, encoding='utf-8').read())
 print(json.dumps({'ok': True, 'applied': db.execute('SELECT COUNT(*) FROM _turso_sql_migrations').fetchone()[0], 'foreignKeys': len(db.execute('PRAGMA foreign_key_check').fetchall()), 'integrity': db.execute('PRAGMA integrity_check').fetchone()[0]}))
except sqlite3.Error as error:
 print(json.dumps({'ok': False, 'reason': str(error)}))
finally:
 db.close()
`;
  const executeLimited = (label, sql) => {
    const script = path.join(runDir, `${label}-depth100.sql`);
    const clone = path.join(runDir, `${label}-depth100.db`);
    fs.writeFileSync(script, sql);
    const result = spawnSync("python", ["-c", python, filename, script, clone], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(executeLimited("frozen-migration", frozen), { ok: true, applied: 50, foreignKeys: 0, integrity: "ok" });
  // Recreate only the prior left-associated dynamic boolean composition from
  // the actual generated predicates, preserving their exact text and order.
  const stateExpression = /AND NOT EXISTS \(SELECT 1 FROM "_preview_turso_migration_state" WHERE NOT \(([\s\S]*?)\)\)\n  AND EXISTS/;
  const rows = gate.match(stateExpression)[1].match(/\("name"=[\s\S]*?"endpoint_sha256"='[0-9a-f]+'\)/g);
  assert.equal(rows.length, 50);
  let legacyGate = gate.replace(stateExpression, `AND NOT EXISTS (SELECT 1 FROM "_preview_turso_migration_state" WHERE NOT (${rows.join(" OR ")}))\n  AND EXISTS`);
  const tableStart = legacyGate.lastIndexOf("\n  AND ", legacyGate.indexOf("\n  THEN"));
  const tableEnd = legacyGate.indexOf("\n  THEN");
  const tableChecks = legacyGate.slice(tableStart, tableEnd).match(/NOT EXISTS \(SELECT 1 FROM "[^"]+" LIMIT 1\)/g);
  assert.ok(tableChecks.length > 0);
  legacyGate = legacyGate.slice(0, tableStart) + "\n  AND " + tableChecks.join("\n  AND ") + legacyGate.slice(tableEnd);
  const legacyInjected = injected.replace(gate, legacyGate);
  assert.deepEqual(executeLimited("legacy-gate", legacyGate), { ok: false, reason: "Expression tree is too large (maximum depth 100)" });
  assert.deepEqual(executeLimited("legacy-injected", legacyInjected), { ok: false, reason: "Expression tree is too large (maximum depth 100)" });
  assert.deepEqual(executeLimited("balanced-gate", gate), { ok: true, applied: 50, foreignKeys: 0, integrity: "ok" });
  assert.deepEqual(executeLimited("balanced-injected", injected), { ok: true, applied: 51, foreignKeys: 0, integrity: "ok" });
  const frozenSuffix = fixtureManifest.migrations.slice(51).map((entry) =>
    fs.readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"));
  assert.equal(frozenSuffix.length, 7);
  // Compile and execute every untouched suffix migration on the same depth100
  // connection after injected51. Raw suffix SQL has no writer ledger inserts,
  // so the ledger intentionally remains51 in this compile-depth rehearsal.
  assert.deepEqual(executeLimited("balanced-injected-plus-frozen-suffix", [injected, ...frozenSuffix].join("\n")),
    { ok: true, applied: 51, foreignKeys: 0, integrity: "ok" });
});

test("balanced managed gate rejects protected-state races before migration changes", async (t) => {
  const filename = nextFixturePath("sqlite", "gate-race-prefix");
  const run = makeRun();
  const fault = makeCheckpointFaultFactory("sqlite", filename, "20261004120000_separate_accounts_players", "before-commit");
  await assert.rejects(invoke(run, { mode: "initial", clientFactory: fault.clientFactory }),
    (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"));
  const cases = [
    ["ledger count", 'DELETE FROM "_turso_sql_migrations" WHERE name=(SELECT name FROM "_turso_sql_migrations" ORDER BY name LIMIT 1)'],
    ["ledger membership", 'UPDATE "_turso_sql_migrations" SET name=\'synthetic_untracked\' WHERE name=(SELECT name FROM "_turso_sql_migrations" ORDER BY name LIMIT 1)'],
    ["SQL hash", 'UPDATE "_preview_turso_migration_state" SET sql_sha256=\'invalid\' WHERE ordinal=1'],
    ["ordinal", 'UPDATE "_preview_turso_migration_state" SET ordinal=101 WHERE ordinal=1'],
    ["state endpoint", 'UPDATE "_preview_turso_migration_state" SET endpoint_sha256=\'invalid\' WHERE ordinal=1'],
    ["state manifest", 'UPDATE "_preview_turso_migration_state" SET manifest_sha256=\'invalid\' WHERE ordinal=1'],
    ["control endpoint", 'UPDATE "_preview_turso_migration_control" SET endpoint_sha256=\'invalid\''],
    ["control manifest", 'UPDATE "_preview_turso_migration_control" SET manifest_sha256=\'invalid\''],
    ["control prefix count", 'UPDATE "_preview_turso_migration_control" SET applied_count=49'],
    ["schema checkpoint", 'UPDATE "_preview_turso_schema_checkpoint" SET schema_json=\'[]\''],
    ["actual schema", 'CREATE TABLE "synthetic_gate_schema_drift" (id INTEGER)'],
    ["nonempty application data", 'INSERT INTO "RateLimitBucket" ("key","scope","count","resetAt","createdAt","updatedAt") VALUES (\'gate-race\',\'test\',1,\'2030-01-01\',\'2030-01-01\',\'2030-01-01\')'],
  ];
  for (const [label, mutation] of cases) {
    await t.test(label, async () => {
      const clone = nextFixturePath("sqlite", "gate-race");
      fs.copyFileSync(filename, clone);
      let before;
      let gateFailure;
      let attempts = 0;
      await assert.rejects(invoke(run, { mode: "resume", clientFactory: makeClientFactory("sqlite", clone, {
        wrapClient(client) {
          const executeMultiple = client.executeMultiple.bind(client);
          return { ...client, executeMultiple: async (sql) => {
            attempts += 1;
            // Simulate a concurrent writer after read verification but before
            // BEGIN IMMEDIATE, so only the injected transactional gate rejects it.
            await client.execute(mutation);
            before = await databaseSnapshot(client);
            try { return await executeMultiple(sql); } catch (error) { gateFailure = error; throw error; }
          } };
        },
      }) }), (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"));
      assert.equal(attempts, 1);
      assert.match(Object.getOwnPropertyDescriptor(gateFailure, "message").value, /CHECK constraint failed: ok = 1/);
      await inspectSqlite(clone, async (db) => {
        assert.deepEqual(await databaseSnapshot(db), before, "gate rejection must roll back every migration change");
        assert.equal(await countRows(db, "RateLimitBucket"), label === "nonempty application data" ? 1 : 0);
      });
    });
  }
});

test("identity inventory retains recreated guards and rejects their absence independently of checkpoint drift", async () => {
  const filename = nextFixturePath("sqlite", "recreated-identity-guard");
  const run = makeRun();
  const completed = await invoke(run, { mode: "initial", clientFactory: makeClientFactory("sqlite", filename) });
  assert.equal(completed.status, "COMPLETE");
  assert.equal(completed.applied, 58);
  const valid = await invoke(run, { mode: "verify-only", clientFactory: makeClientFactory("sqlite", filename) });
  assert.equal(valid.status, "COMPLETE");
  const recreated = "PlayerInvitation_target_guard";
  let before;
  await inspectSqlite(filename, async (db) => {
    const actual = await db.execute("SELECT name FROM sqlite_schema WHERE type='trigger'");
    assert.equal(actual.rows.length, 83);
    assert.ok(actual.rows.some((row) => row.name === recreated));
    await db.execute(`DROP TRIGGER "${recreated}"`);
    // Only this synthetic fixture's checkpoint follows the deliberate drop;
    // otherwise schema-drift rejection would mask the independent name guard.
    await syncCheckpointSchema(db);
    before = await databaseSnapshot(db);
  });
  await assert.rejects(invoke(run, { mode: "verify-only", clientFactory: makeClientFactory("sqlite", filename) }),
    (error) => matchesErrorCode(error, "PREVIEW_IDENTITY_GUARD_MISSING"));
  await inspectSqlite(filename, async (db) => {
    assert.deepEqual(await databaseSnapshot(db), before, "verification must not repair a missing recreated guard");
  });
});

test("verify-only reports a fresh empty database without creating schema", async () => {
  for (const engine of ["sqlite", "libsql"]) {
    const filename = nextFixturePath(engine, "verify-empty");
    const run = makeRun();
    const statementTracking = makeArgumentArrayAssertingFactory(engine, filename);
    const result = await invoke(run, {
      mode: "verify-only",
      clientFactory: statementTracking.clientFactory,
    });
    assert.equal(result.status, "EMPTY");
    assert.deepEqual(
      [...statementTracking.observedOperations],
      ["schema-object-list"],
      "empty verify-only must send the schema-object-list statement with explicit empty args",
    );
    if (engine === "sqlite") {
      await inspectSqlite(filename, async (db) => {
        const tables = await db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        assert.equal(tables.rows.length, 0);
      });
    } else {
      await inspectLibsql(filename, async (db) => {
        const tables = await db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        assert.equal(tables.rows.length, 0);
      });
    }
  }
});

test("installed HTTP client rejects omitted statement args but accepts an explicit empty array", async () => {
  let fetchCalls = 0;
  const fakeFetch = async (request) => {
    fetchCalls += 1;
    assert.equal(new URL(request.url).hostname, "preview-http-fixture.invalid");
    assert.equal(request.method, "POST");
    const body = JSON.parse(await request.text());
    assert.deepEqual(body.requests[0].stmt.args, []);
    return new Response(JSON.stringify({ results: [
      { type: "ok", response: { type: "execute", result: { cols: [], rows: [], affected_row_count: 0 } } },
      { type: "ok", response: { type: "close" } },
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = createHttpClient({
    url: "https://preview-http-fixture.invalid",
    authToken: fixtureToken,
    fetch: fakeFetch,
  });
  try {
    await assert.rejects(client.execute({ sql: "SELECT 1 AS value" }));
    assert.equal(fetchCalls, 0, "missing args must fail in local statement normalization before fetch");
    const result = await client.execute({ sql: "SELECT 1 AS value", args: [] });
    assert.equal(result.rows.length, 0);
    assert.equal(fetchCalls, 1, "the fixed statement must reach only the injected fetch");
  } finally {
    await client.close();
  }
});

test("installed HTTP diagnostics retain only fixed Turso protocol and Hrana codes", async (t) => {
  const run = makeRun();
  const protocolCodes = [
    "SQL_INPUT_ERROR",
    "SQL_MANY_STATEMENTS",
    "SQL_PARSE_ERROR",
    "BLOCKED",
    "SQLITE_INTERNAL",
    "SQLITE_PERM",
  ];

  for (const code of protocolCodes) {
    await t.test(code, async () => {
      let fetchCalls = 0;
      let receivedSdkCode;
      let fetchShape;
      const fakeFetch = async (request) => {
        fetchCalls += 1;
        const parsedUrl = new URL(request.url);
        const body = JSON.parse(await request.text());
        fetchShape = {
          hostMatches: parsedUrl.hostname === "preview-fixture.invalid",
          methodMatches: request.method === "POST",
          requestTypes: body.requests.map((entry) => entry.type),
          hasStatement: Boolean(body.requests[0]?.stmt),
          argsAreArray: Array.isArray(body.requests[0]?.stmt?.args),
        };
        const results = body.requests.map((entry) => {
          if (entry.type === "execute") {
            return { type: "error", error: { message: `private server detail ${fixtureUrl} ${fixtureToken}`, code } };
          }
          if (entry.type === "close") return { type: "ok", response: { type: "close" } };
          return { type: "error", error: { message: "unexpected synthetic request", code: "HRANA_PROTO_ERROR" } };
        });
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const clientFactory = async ({ url, authToken }) => {
        assert.equal(url, fixtureUrl);
        assert.equal(authToken, fixtureToken);
        const client = createHttpClient({ url, authToken, fetch: fakeFetch });
        const execute = client.execute.bind(client);
        client.execute = async (...args) => {
          try {
            return await execute(...args);
          } catch (error) {
            receivedSdkCode = Object.getOwnPropertyDescriptor(error, "code")?.value;
            throw error;
          }
        };
        return client;
      };
      await assert.rejects(
        invoke(run, { mode: "verify-only", clientFactory }),
        (error) => {
          const report = formatPreviewFailure(error);
          assert.equal(receivedSdkCode, code);
          assert.equal(
            report,
            `Preview migration stopped safely: PREVIEW_RUN_FAILED (stage=first-read; operation=migration-ledger-presence; phase=query; databaseCode=${code}).`,
          );
          assert.doesNotMatch(report, /preview-fixture\.invalid|synthetic-preview-token|private server detail/);
          return true;
        },
      );
      assert.equal(fetchCalls, 1);
      assert.deepEqual(fetchShape, {
        hostMatches: true,
        methodMatches: true,
        requestTypes: ["execute", "close"],
        hasStatement: true,
        argsAreArray: true,
      });
      assert.equal(receivedSdkCode, code);
    });
  }

  await t.test("malformed Hrana response uses the fixed protocol category only", async () => {
    let fetchCalls = 0;
    const fakeFetch = async (request) => {
      fetchCalls += 1;
      assert.equal(new URL(request.url).hostname, "preview-fixture.invalid");
      assert.equal(request.method, "POST");
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const clientFactory = async ({ url, authToken }) => createHttpClient({ url, authToken, fetch: fakeFetch });

    await assert.rejects(
      invoke(run, { mode: "verify-only", clientFactory }),
      (error) => {
        const report = formatPreviewFailure(error);
        assert.equal(
          report,
          "Preview migration stopped safely: PREVIEW_RUN_FAILED (stage=first-read; operation=migration-ledger-presence; phase=query; clientCode=HRANA_PROTO_ERROR).",
        );
        assert.doesNotMatch(report, /preview-fixture\.invalid|synthetic-preview-token|Server returned unexpected/);
        return true;
      },
    );
    assert.equal(fetchCalls, 1);
  });
});

test("managed HTTP boundary diagnostics preserve installed SDK sequence semantics", async (t) => {
  const sentinel = "SECRET_SENTINEL_HTTP_DIAGNOSTICS";
  const sql = "PRAGMA foreign_keys=OFF;\nBEGIN IMMEDIATE;\nSELECT 1;\nCOMMIT;\nPRAGMA foreign_keys=ON;";
  let baseline;
  const okResponse = (requests) => new Response(JSON.stringify({ results: requests.map((request) => ({
    type: "ok", response: { type: request.type },
  })) }), { headers: { "content-type": "application/json" } });
  const baselineClient = createClient({ url: fixtureUrl, authToken: fixtureToken, fetch: async (request) => {
    baseline = JSON.parse(await request.text());
    return okResponse(baseline.requests);
  } });
  await baselineClient.executeMultiple(sql);
  baselineClient.close();
  assert.deepEqual(baseline.requests.map((request) => request.type), ["sequence", "close"]);
  assert.equal(baseline.requests[0].sql, sql);

  const cases = [
    ["before dispatch", "pre-send"],
    ["transport rejection", "transport"],
    ["HTTP 400", "http-rejection", 400],
    ["HTTP 500", "http-rejection", 500],
    ["Hrana protocol", "protocol-error"],
    ["SQLite server", "server-sql-error"],
    ["unknown structured code", "unclassified"],
    ["malformed JSON", "unclassified"],
    ["malformed schema", "protocol-error"],
    ["plain local exception", "unclassified"],
    ["hostile accessors", "unclassified"],
    ["hostile transport exception", "transport"],
    ["successful completion", undefined],
  ];
  for (const [label, expectedClass, status] of cases) {
    await t.test(label, async () => {
      let batchPayload;
      let dispatched = 0;
      const transportError = new Error(sentinel);
      transportError.cause = { code: "ECONNRESET", message: sentinel };
      const hostileError = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(sentinel); } });
      let accessorCalls = 0;
      const accessorError = new Error(sentinel);
      for (const key of ["name", "code", "cause", "proto", "originalError", "error"]) {
        Object.defineProperty(accessorError, key, { get() { accessorCalls += 1; throw new Error(sentinel); } });
      }
      const diagnostics = createPreviewHttpBatchDiagnostics(async (request) => {
        dispatched += 1;
        const body = JSON.parse(await request.text());
        // Metadata reads and cleanup dispatches are deliberately outside the scope.
        if (body.requests[0].type !== "sequence") {
          return new Response(JSON.stringify({ results: [
            { type: "ok", response: { type: "execute", result: { cols: [], rows: [], affected_row_count: 0, last_insert_rowid: null } } },
            { type: "ok", response: { type: "close" } },
          ] }), { headers: { "content-type": "application/json" } });
        }
        batchPayload = body;
        if (label === "transport rejection") throw transportError;
        if (label === "hostile transport exception") throw hostileError;
        if (status) return new Response(sentinel, { status, headers: { "content-type": "text/plain" } });
        if (label === "malformed JSON") return new Response(`invalid-json-${sentinel}`, {
          headers: { "content-type": "application/json" },
        });
        if (label === "malformed schema") return new Response(JSON.stringify({ results: sentinel }), {
          headers: { "content-type": "application/json" },
        });
        if (label === "Hrana protocol") return new Response(JSON.stringify({ results: [] }), {
          headers: { "content-type": "application/json" },
        });
        if (label === "SQLite server" || label === "unknown structured code") {
          return new Response(JSON.stringify({ results: [
            { type: "error", error: { code: label === "SQLite server" ? "SQLITE_ERROR" : sentinel, message: sentinel } },
            { type: "ok", response: { type: "close" } },
          ] }), { headers: { "content-type": "application/json" } });
        }
        return okResponse(body.requests);
      });
      const client = createClient({ url: fixtureUrl, authToken: fixtureToken, fetch: diagnostics.fetch });
      const sdkExecuteMultiple = client.executeMultiple.bind(client);
      let sdkFailure;
      let sdkCalls = 0;
      client.executeMultiple = async (...args) => {
        sdkCalls += 1;
        try {
          const result = await sdkExecuteMultiple(...args);
          if (label === "plain local exception") throw new Error(sentinel);
          if (label === "hostile accessors") throw accessorError;
          return result;
        } catch (error) { sdkFailure = error; throw error; }
      };
      diagnostics.instrument(client);
      await client.execute("SELECT 1");
      assert.equal(diagnostics.getLastSnapshot(), undefined);
      if (label === "before dispatch") client.close();
      let failure;
      try { await client.executeMultiple(sql); } catch (error) { failure = error; }
      const snapshot = diagnostics.getLastSnapshot();
      assert.equal(sdkCalls, 1);
      assert.equal(failure, sdkFailure, "instrumentation must rethrow the identical SDK failure");
      assert.equal(Object.isFrozen(snapshot), true);
      assert.equal(snapshot.sdkEntered, true);
      assert.equal(snapshot.batchFailureClass, expectedClass);
      assert.equal(snapshot.fetchInvoked, label !== "before dispatch");
      assert.equal(snapshot.httpAttempts, label === "before dispatch" ? 0 : 1);
      assert.equal(snapshot.transportException, label.includes("transport"));
      assert.equal(snapshot.responseReceived, label !== "before dispatch" && !label.includes("transport"));
      if (status) assert.equal(snapshot.httpStatus, status);
      if (label === "transport rejection") assert.equal(snapshot.transportCode, "ECONNRESET");
      if (label === "SQLite server") assert.equal(snapshot.sdkOutcome, "database-error");
      if (label === "Hrana protocol") assert.equal(snapshot.sdkOutcome, "protocol-error");
      if (["SQLite server", "unknown structured code"].includes(label)) {
        assert.equal(snapshot.exceptionFamily, "LibsqlError");
        assert.equal(snapshot.nestedExceptionFamily, "ResponseError");
        assert.equal(snapshot.codePresent, true);
        assert.equal(snapshot.nestedCausePresent, true);
        assert.equal(snapshot.protoPresent, true);
        assert.equal(snapshot.structuredServerErrorPresent, true);
        assert.equal(snapshot.protocolEvidence, "structured-server-error");
      }
      if (label === "malformed JSON") {
        assert.equal(snapshot.exceptionFamily, "SyntaxError");
        assert.equal(snapshot.codePresent, false);
        assert.equal(snapshot.protocolEvidence, "unknown", "SyntaxError alone must not be assigned a decoding stage");
      }
      if (label === "malformed schema") {
        assert.equal(snapshot.exceptionFamily, "LibsqlError");
        assert.equal(snapshot.nestedExceptionFamily, "ProtoError");
        assert.equal(snapshot.protocolEvidence, "recognized-protocol-error");
      }
      if (label === "plain local exception" || label === "hostile accessors") {
        assert.equal(snapshot.exceptionFamily, "Error");
        assert.equal(snapshot.protocolEvidence, "unknown");
      }
      if (expectedClass) {
        assert.ok(failure);
        const report = formatPreviewFailure(failure);
        assert.ok(report.includes(`batchFailureClass=${expectedClass}`));
        assert.doesNotMatch(report, /SECRET_SENTINEL|preview-fixture|synthetic-preview-token/);
        if (label === "SQLite server") assert.match(report, /databaseCode=SQLITE_ERROR/);
      } else {
        assert.equal(failure, undefined);
        assert.equal(snapshot.sdkOutcome, "completed");
        assert.equal(snapshot.protocolEvidence, "completed");
      }
      assert.doesNotMatch(JSON.stringify(snapshot), /SECRET_SENTINEL|preview-fixture|synthetic-preview-token/);
      assert.equal(accessorCalls, 0);
      if (batchPayload) assert.deepEqual(batchPayload, baseline);
      if (label !== "before dispatch") await client.execute("PRAGMA foreign_keys=ON");
      assert.equal(diagnostics.getLastSnapshot(), snapshot, "cleanup must not replace the frozen batch snapshot");
      assert.equal(dispatched, label === "before dispatch" ? 1 : 3);
      client.close();
    });
  }
});

test("managed HTTP diagnostics survive runner failure wrapping and cleanup at prefix 50", async () => {
  const filename = nextFixturePath("sqlite", "managed-http-runner-diagnostics");
  const run = makeRun();
  const fault = makeCheckpointFaultFactory("sqlite", filename, "20261004120000_separate_accounts_players", "before-commit");
  await assert.rejects(invoke(run, { mode: "initial", clientFactory: fault.clientFactory }),
    (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED"));
  let sequenceSql;
  let cleanupCalls = 0;
  let httpCalls = 0;
  const diagnostics = createPreviewHttpBatchDiagnostics(async (request) => {
    httpCalls += 1;
    const body = JSON.parse(await request.text());
    assert.deepEqual(body.requests.map((entry) => entry.type), ["sequence", "close"]);
    sequenceSql = body.requests[0].sql;
    return new Response(JSON.stringify({ results: [
      { type: "error", error: { code: "SQLITE_ERROR", message: `SECRET_SENTINEL ${fixtureToken}` } },
      { type: "ok", response: { type: "close" } },
    ] }), { headers: { "content-type": "application/json" } });
  });
  let batchSnapshot;
  await assert.rejects(invoke(run, { mode: "resume", clientFactory: makeClientFactory("sqlite", filename, {
    wrapClient(local) {
      // All metadata uses the local fixture. Only the managed write boundary
      // uses the actual HTTP SDK with an injected, non-networking response.
      const http = diagnostics.instrument(createClient({ url: fixtureUrl, authToken: fixtureToken, fetch: diagnostics.fetch }));
      return {
        execute: async (...args) => {
          if (args[0] === "PRAGMA foreign_keys=ON") {
            cleanupCalls += 1;
            batchSnapshot = diagnostics.getLastSnapshot();
          }
          return local.execute(...args);
        },
        executeMultiple: (...args) => http.executeMultiple(...args),
        transaction: (...args) => local.transaction(...args),
        close: () => { http.close(); return local.close(); },
      };
    },
  }) }), (error) => {
    assert.equal(error.code, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED");
    const report = formatPreviewFailure(error);
    assert.match(report, /stage=migration-application; databaseCode=SQLITE_ERROR/);
    assert.match(report, /batchFailureClass=server-sql-error/);
    assert.match(report, /sdkEntered=true; fetchInvoked=true; responseReceived=true; transportException=false/);
    assert.match(report, /codePresent=true; nestedCausePresent=true; protoPresent=true; structuredServerErrorPresent=true; httpAttempts=1; sdkOutcome=database-error/);
    assert.match(report, /exceptionFamily=LibsqlError; nestedExceptionFamily=ResponseError; protocolEvidence=structured-server-error; failureBoundary=sdk-execute-multiple/);
    assert.doesNotMatch(report, /SECRET_SENTINEL|preview-fixture|synthetic-preview-token/);
    return true;
  });
  assert.equal(httpCalls, 1);
  assert.equal(cleanupCalls, 1);
  assert.equal(diagnostics.getLastSnapshot(), batchSnapshot);
  assert.equal(Object.isFrozen(batchSnapshot), true);
  assert.equal(sequenceSql.match(/^BEGIN IMMEDIATE;$/gm).length, 1);
  assert.equal(sequenceSql.match(/^COMMIT;$/gm).length, 1);
  assert.match(sequenceSql, /INSERT INTO "_preview_turso_schema_checkpoint"/);
  assert.match(sequenceSql, /INSERT INTO "_turso_sql_migrations"/);
  const prefix = await invoke(run, { mode: "verify-only", clientFactory: makeClientFactory("sqlite", filename) });
  assert.equal(prefix.status, "RESUMABLE_PREFIX");
  assert.equal(prefix.applied, 50);
});

test("preflight rejects invalid inputs before a client can be created", async (t) => {
  const run = makeRun();
  const attempts = [
    ["wrong target name", { confirmation: { ...fixtureConfirmation, databaseName: "other" } }, "PREVIEW_CONFIRMATION_MISMATCH"],
    ["wrong endpoint confirmation", { confirmation: { ...fixtureConfirmation, endpointSha256: "0".repeat(64) } }, "PREVIEW_CONFIRMATION_MISMATCH"],
    ["wrong manifest confirmation", { confirmation: { ...fixtureConfirmation, manifestSha256: "0".repeat(64) } }, "PREVIEW_CONFIRMATION_MISMATCH"],
    ["missing empty confirmation", { confirmation: { ...fixtureConfirmation, expectEmpty: false } }, "PREVIEW_EMPTY_CONFIRMATION_REQUIRED"],
    ["mixed generic credentials", { readFile: async () => `${syntheticCredentialText}TURSO_AUTH_TOKEN=unexpected\n` }, "PREVIEW_CREDENTIAL_FILE_INVALID"],
    ["missing credential", { readFile: async () => "PREVIEW_TURSO_DATABASE_URL=https://preview-fixture.invalid\n" }, "PREVIEW_CREDENTIAL_FILE_INVALID"],
    ["wrong endpoint", { readFile: async () => "PREVIEW_TURSO_DATABASE_URL=https://other.invalid\nPREVIEW_TURSO_AUTH_TOKEN=synthetic\n" }, "PREVIEW_TARGET_MISMATCH"],
  ];
  for (const [label, options, code] of attempts) {
    await t.test(label, async () => {
      let factoryCalls = 0;
      await assert.rejects(
        invoke(run, {
          ...options,
          clientFactory: async () => { factoryCalls += 1; throw new Error("factory must not run"); },
        }),
        (error) => matchesErrorCode(error, code),
      );
      assert.equal(factoryCalls, 0);
    });
  }
});

test("safe diagnostics classify auth, transport, and SQL failures without exposing error text", async (t) => {
  const credentials = syntheticReadFile;
  const authError = new Error(`rejected ${fixtureUrl} token=${fixtureToken} Authorization: Bearer ${fixtureToken}`);
  authError.code = "SQLITE_AUTH";
  authError.status = 401;
  authError.headers = { authorization: fixtureToken };
  authError.cause = Object.assign(new Error(`nested ${fixtureToken}`), { code: "ECONNRESET" });

  await t.test("database authentication on the first read", async () => {
    const run = makeRun();
    let closeCalls = 0;
    await assert.rejects(
      invoke(run, {
        mode: "verify-only",
        readFile: credentials,
        clientFactory: async () => ({
          execute: async () => { throw authError; },
          close: async () => { closeCalls += 1; },
        }),
      }),
      (error) => {
        const report = formatPreviewFailure(error);
        assert.match(report, /PREVIEW_RUN_FAILED/);
        assert.match(report, /stage=first-read/);
        assert.match(report, /databaseCode=SQLITE_AUTH/);
        assert.match(report, /httpStatus=401/);
        assert.match(report, /transportCode=ECONNRESET/);
        assert.doesNotMatch(report, /preview-fixture\.invalid|synthetic-preview-token|Authorization|Bearer|rejected|nested/);
        return true;
      },
    );
    assert.equal(closeCalls, 1);
  });

  await t.test("connection network failure with cyclic and accessor causes", async () => {
    const error = new Error(`network details include ${fixtureUrl} and ${fixtureToken}`);
    error.code = fixtureToken;
    error.status = fixtureUrl;
    const transportCause = Object.assign(new Error(`socket details include ${fixtureToken}`), { code: "ETIMEDOUT" });
    error.cause = transportCause;
    transportCause.cause = error;
    Object.defineProperty(error, "response", {
      get() { throw new Error(`getter leaked ${fixtureToken}`); },
    });
    const nestedErrors = [];
    Object.defineProperty(nestedErrors, "0", {
      get() { throw new Error(`array getter leaked ${fixtureToken}`); },
    });
    error.errors = nestedErrors;
    const run = makeRun();
    await assert.rejects(
      invoke(run, {
        readFile: credentials,
        clientFactory: async () => { throw error; },
      }),
      (failure) => {
        const report = formatPreviewFailure(failure);
        assert.match(report, /PREVIEW_RUN_FAILED/);
        assert.match(report, /stage=connection/);
        assert.match(report, /transportCode=ETIMEDOUT/);
        assert.doesNotMatch(report, /preview-fixture\.invalid|synthetic-preview-token|network details|getter leaked/);
        assert.doesNotMatch(report, /databaseCode=|httpStatus=/);
        return true;
      },
    );
  });

  await t.test("SQL failure during migration application", async () => {
    const migrationName = "20261010120000_diagnostic_probe";
    const fixtureMigrationsRoot = path.join(runDir, "diagnostic-migrations");
    const migrationDirectory = path.join(fixtureMigrationsRoot, migrationName);
    fs.mkdirSync(migrationDirectory, { recursive: true });
    const sql = "CREATE TABLE DiagnosticProbe (id TEXT PRIMARY KEY);\n";
    fs.writeFileSync(path.join(migrationDirectory, "migration.sql"), sql);
    const target = Object.freeze({
      databaseName: "preview-diagnostic-fixture",
      endpointSha256: fixtureTarget.endpointSha256,
      migrationCount: 1,
    });
    const manifest = {
      version: 1,
      target: { ...target },
      migrations: [{
        name: migrationName,
        sqlSha256: createHash("sha256").update(sql).digest("hex"),
      }],
      manifestSha256: "",
    };
    manifest.manifestSha256 = previewManifestSha256(manifest);
    const confirmation = {
      databaseName: target.databaseName,
      endpointSha256: target.endpointSha256,
      manifestSha256: manifest.manifestSha256,
      expectEmpty: true,
    };
    const filename = nextFixturePath("sqlite", "diagnostic-sql-error");
    const run = createPreviewMigrationRunner({ target, manifest, migrationsRoot: fixtureMigrationsRoot });
    const sqlError = new Error(`SQL rejected ${fixtureUrl} token=${fixtureToken}`);
    sqlError.code = "SQLITE_ERROR";
    const baseClient = makeNativeSqliteClient(filename);
    const baseTransaction = baseClient.transaction.bind(baseClient);
    const client = {
      ...baseClient,
      transaction: async (...args) => {
        const transaction = await baseTransaction(...args);
        const originalExecuteMultiple = transaction.executeMultiple.bind(transaction);
        return {
          ...transaction,
          executeMultiple: async (batchSql) => {
            if (batchSql === sql) throw sqlError;
            return originalExecuteMultiple(batchSql);
          },
        };
      },
    };

    await assert.rejects(
      run({
        mode: "initial",
        confirmation,
        readFile: credentials,
        clientFactory: async ({ url, authToken }) => {
          assert.equal(url, fixtureUrl);
          assert.equal(authToken, fixtureToken);
          return client;
        },
      }),
      (error) => {
        const report = formatPreviewFailure(error);
        assert.match(report, /PREVIEW_MIGRATION_TRANSACTION_FAILED/);
        assert.match(report, /stage=migration-application/);
        assert.match(report, /databaseCode=SQLITE_ERROR/);
        assert.doesNotMatch(report, /preview-fixture\.invalid|synthetic-preview-token|SQL rejected/);
        return true;
      },
    );
    await inspectSqlite(filename, async (db) => {
      const objects = await db.execute("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
      assert.equal(objects.rows.length, 0, "diagnostic wrapping must preserve transaction rollback");
      await assertHealthyEmptyDatabase(db);
    });
  });
});

test("safe diagnostic formatter uses only fixed codes and never evaluates error accessors", () => {
  const unsafe = new Error(`secret ${fixtureToken} ${fixtureUrl}`);
  unsafe.code = `PREVIEW_${fixtureToken}`;
  unsafe.status = `401 ${fixtureToken}`;
  Object.defineProperty(unsafe, "cause", {
    get() { throw new Error(`secret getter ${fixtureToken}`); },
  });
  const report = formatPreviewFailure(unsafe);
  assert.equal(report, "Preview migration stopped safely: PREVIEW_RUN_FAILED.");
  assert.doesNotMatch(report, /synthetic-preview-token|preview-fixture\.invalid|secret/);
  assert.equal(formatPreviewFailure(fixtureToken), "Preview migration stopped safely: PREVIEW_RUN_FAILED.");
});

test("verify-only diagnostics identify post-first-read query, result, and check failures", async (t) => {
  const run = makeRun();
  const mockClientFactory = (execute, close = async () => {}) => async ({ url, authToken }) => {
    assert.equal(url, fixtureUrl);
    assert.equal(authToken, fixtureToken);
    return { execute, close };
  };
  const sqlOf = (input) => typeof input === "string" ? input : input.sql;

  await t.test("metadata query failure includes only allowlisted client code and status", async () => {
    let presenceReads = 0;
    let closeCalls = 0;
    const serverError = new Error(`synthetic response ${fixtureUrl} token=${fixtureToken}`);
    serverError.code = "SERVER_ERROR";
    serverError.status = 400;
    const execute = async (input) => {
      if (sqlOf(input).startsWith("SELECT 1 AS found FROM sqlite_schema")) {
        presenceReads += 1;
        if (presenceReads === 1) return { rows: [] };
        throw serverError;
      }
      throw new Error("unexpected synthetic query");
    };

    await assert.rejects(
      invoke(run, {
        mode: "verify-only",
        clientFactory: mockClientFactory(execute, async () => { closeCalls += 1; }),
      }),
      (error) => {
        assert.equal(
          formatPreviewFailure(error),
          "Preview migration stopped safely: PREVIEW_RUN_FAILED (stage=schema-verification; operation=control-table-presence; phase=query; clientCode=SERVER_ERROR; httpStatus=400).",
        );
        assert.doesNotMatch(formatPreviewFailure(error), /preview-fixture\.invalid|synthetic-preview-token|synthetic response/);
        return true;
      },
    );
    assert.equal(presenceReads, 2);
    assert.equal(closeCalls, 1);
  });

  await t.test("result consumption failure does not evaluate hostile error accessors", async () => {
    let accessorCalls = 0;
    const resultError = new Error(`synthetic result ${fixtureToken}`);
    resultError.code = "SERVER_ERROR";
    Object.defineProperty(resultError, "status", {
      get() { accessorCalls += 1; throw new Error("status getter must stay inert"); },
    });
    resultError.statusCode = "400 private";
    Object.defineProperty(resultError, "cause", {
      get() { accessorCalls += 1; throw new Error("cause getter must stay inert"); },
    });
    Object.defineProperty(resultError, "response", {
      get() { accessorCalls += 1; throw new Error("response getter must stay inert"); },
    });
    const result = Object.defineProperty({}, "rows", {
      get() { throw resultError; },
    });

    await assert.rejects(
      invoke(run, {
        mode: "verify-only",
        clientFactory: mockClientFactory(async () => result),
      }),
      (error) => {
        const report = formatPreviewFailure(error);
        assert.equal(
          report,
          "Preview migration stopped safely: PREVIEW_RUN_FAILED (stage=schema-verification; operation=migration-ledger-presence; phase=result; clientCode=SERVER_ERROR).",
        );
        assert.doesNotMatch(report, /synthetic-preview-token|synthetic result|getter must stay inert|httpStatus=/);
        return true;
      },
    );
    assert.equal(accessorCalls, 0);
  });

  await t.test("foreign-key check failure is identified after successful metadata reads", async () => {
    const execute = async (input) => {
      const sql = sqlOf(input);
      if (sql.startsWith("SELECT 1 AS found FROM sqlite_schema")) return { rows: [] };
      if (sql.includes("SELECT type, name FROM sqlite_schema")) return { rows: [] };
      if (sql === "PRAGMA foreign_key_check") return { rows: [{ table: "synthetic" }] };
      throw new Error("unexpected synthetic query");
    };

    await assert.rejects(
      invoke(run, {
        mode: "verify-only",
        clientFactory: mockClientFactory(execute),
      }),
      (error) => {
        assert.equal(
          formatPreviewFailure(error),
          "Preview migration stopped safely: PREVIEW_FOREIGN_KEY_CHECK_FAILED (stage=schema-verification; operation=integrity-foreign-key-check; phase=check).",
        );
        return true;
      },
    );
  });

  await t.test("integrity check failure has its own fixed operation ID", async () => {
    const execute = async (input) => {
      const sql = sqlOf(input);
      if (sql.startsWith("SELECT 1 AS found FROM sqlite_schema")) return { rows: [] };
      if (sql.includes("SELECT type, name FROM sqlite_schema")) return { rows: [] };
      if (sql === "PRAGMA foreign_key_check") return { rows: [] };
      if (sql === "PRAGMA integrity_check") return { rows: [{ integrity_check: "corrupt" }] };
      throw new Error("unexpected synthetic query");
    };

    await assert.rejects(
      invoke(run, {
        mode: "verify-only",
        clientFactory: mockClientFactory(execute),
      }),
      (error) => {
        assert.equal(
          formatPreviewFailure(error),
          "Preview migration stopped safely: PREVIEW_INTEGRITY_CHECK_FAILED (stage=schema-verification; operation=integrity-check; phase=check).",
        );
        return true;
      },
    );
  });
});

test("CLI rejects the removed credential-path override before any credential or client access", () => {
  const cliPath = path.join(projectRoot, "scripts", "apply-preview-turso-migrations.mjs");
  const result = spawnSync(process.execPath, [
    cliPath,
    "--credentials-file",
    "..\\not-a-real-credential.env",
    "--verify-only",
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
    env: {
      SystemRoot: process.env.SystemRoot ?? "",
      PATH: process.env.PATH ?? "",
      LOCALAPPDATA: ".\\tampered-local-app-data",
      USERPROFILE: "\\\\server\\share\\tampered-profile",
      NODE_ENV: "test",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PREVIEW_(?:ARGUMENTS_INVALID|RUN_FAILED)/);
  assert.doesNotMatch(result.stderr, /TURSO_(?:DATABASE_URL|AUTH_TOKEN)=/);
  assert.doesNotMatch(result.stdout, /Preview migration verification:/);
});

test("Known Folder resolution ignores environment path hints and never creates the credential path", () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "preview-known-folder-resolution-"));
  const known = makeKnownFolders(rootPath);
  const oldLocalAppData = process.env.LOCALAPPDATA;
  const oldUserProfile = process.env.USERPROFILE;
  try {
    for (const untrustedValue of ["relative\\redirect", "\\\\server\\share\\redirect", path.join(rootPath, "elsewhere")]) {
      process.env.LOCALAPPDATA = untrustedValue;
      process.env.USERPROFILE = untrustedValue;
      const resolved = resolvePreviewCredentialLocation({
        platform: "win32",
        knownFolderResolver: known.knownFolderResolver,
      });
      assert.equal(resolved.profilePath, known.profilePath);
      assert.equal(resolved.migrationDirectory, path.join(known.profilePath, "AntiSelekPreviewMigration"));
      assert.equal(resolved.credentialPath, path.join(known.profilePath, "AntiSelekPreviewMigration", "preview-turso-writer.env"));
      assert.equal(resolved.currentSid, known.currentSid);
      assert.equal(fs.existsSync(known.profilePath), false, "resolution must not create any Known Folder fixture paths");
    }
  } finally {
    if (oldLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocalAppData;
    if (oldUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserProfile;
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

test("the production Known Folder resolver ignores LOCALAPPDATA and USERPROFILE", (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows Known Folder API integration requires Windows");
    return;
  }
  const oldLocalAppData = process.env.LOCALAPPDATA;
  const oldUserProfile = process.env.USERPROFILE;
  try {
    for (const untrustedValue of ["relative\\redirect", "\\\\server\\share\\redirect"]) {
      process.env.LOCALAPPDATA = untrustedValue;
      process.env.USERPROFILE = untrustedValue;
      const resolved = resolvePreviewCredentialLocation({ platform: "win32" });
      assert.equal(path.win32.dirname(resolved.migrationDirectory), path.win32.normalize(resolved.profilePath));
      assert.equal(path.win32.basename(resolved.migrationDirectory), "AntiSelekPreviewMigration");
      assert.equal(path.win32.basename(resolved.credentialPath), "preview-turso-writer.env");
      assert.notEqual(resolved.profilePath, path.win32.normalize(untrustedValue));
    }
  } finally {
    if (oldLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocalAppData;
    if (oldUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserProfile;
  }
});

test("actual Known Folder profile ancestry passes metadata policy without opening credentials", (t) => {
  if (process.platform !== "win32") {
    t.skip("actual Windows Known Folder ACL metadata requires Windows");
    return;
  }
  const location = resolvePreviewCredentialLocation({ platform: "win32" });
  const credentialExistedBefore = fs.existsSync(location.credentialPath);
  const components = windowsComponentsThrough(location.profilePath);
  const volumeRoot = path.win32.parse(location.profilePath).root.toLowerCase();
  for (const component of components.slice(0, -1)) {
    const acl = readActualWindowsAclSnapshot(component);
    assert.equal(validateWindowsHigherAncestorAclJson(JSON.stringify(acl), location.currentSid, {
      isVolumeRoot: component.toLowerCase() === volumeRoot,
    }), true);
  }
  const profileAcl = readActualWindowsAclSnapshot(location.profilePath);
  assert.equal(validateWindowsParentAclJson(JSON.stringify(profileAcl), location.currentSid), true);
  assert.equal(
    fs.existsSync(location.credentialPath),
    credentialExistedBefore,
    "the metadata-only check must not create or remove the credential file",
  );
});

test("Known Folder resolution rejects unsupported, relative, UNC, and out-of-profile locations", async (t) => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "preview-known-folder-invalid-"));
  const profilePath = path.join(rootPath, "profile");
  const valid = {
    profilePath,
    currentSid: "S-1-5-21-100-200-300-1001",
  };
  const cases = [
    ["unsupported platform", "linux", valid, "PREVIEW_CREDENTIAL_PLATFORM_UNSUPPORTED"],
    ["relative profile", "win32", { ...valid, profilePath: ".\\profile" }, "PREVIEW_CREDENTIAL_LOCATION_INVALID"],
    ["UNC profile", "win32", { ...valid, profilePath: "\\\\server\\share\\profile" }, "PREVIEW_CREDENTIAL_LOCATION_INVALID"],
    ["device profile", "win32", { ...valid, profilePath: "\\\\?\\C:\\Users\\profile" }, "PREVIEW_CREDENTIAL_LOCATION_INVALID"],
  ];
  try {
    for (const [name, platform, folders, code] of cases) {
      await t.test(name, () => {
        assert.throws(
          () => resolvePreviewCredentialLocation({ platform, knownFolderResolver: () => folders }),
          (error) => matchesErrorCode(error, code),
        );
      });
    }
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

test("reading a missing synthetic credential path fails closed without creating it", (t) => {
  if (process.platform !== "win32") {
    t.skip("Known Folder credential reader is Windows-only");
    return;
  }
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "preview-known-folder-no-create-"));
  const known = makeKnownFolders(rootPath);
  try {
    const resolved = resolvePreviewCredentialLocation({
      platform: "win32",
      knownFolderResolver: known.knownFolderResolver,
    });
    assert.throws(
      () => readProtectedPreviewCredentialFile({
        platform: "win32",
        knownFolderResolver: known.knownFolderResolver,
        windowsAclReader: () => ({
          currentSid: known.currentSid,
          ownerSid: known.currentSid,
          daclProtected: true,
          reparsePoint: false,
          entries: [{
            sid: known.currentSid,
            access: "Allow",
            rightsMask: 0x001f01ff,
            isInherited: false,
            isInheritOnly: false,
          }],
        }),
      }),
      (error) => error.code === "PREVIEW_CREDENTIAL_FILE_UNAVAILABLE",
    );
    assert.equal(fs.existsSync(resolved.credentialPath), false);
    assert.equal(fs.existsSync(resolved.migrationDirectory), false, "the reader must not create the credential directory");
    assert.equal(fs.existsSync(known.profilePath), false, "the reader must not create the profile fixture");
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

test("an initial target with unrelated schema or rows is rejected without mutation", async (t) => {
  for (const engine of ["sqlite", "libsql"]) {
    await t.test(engine, async () => {
      const filename = nextFixturePath(engine, "nonempty-initial");
      if (engine === "sqlite") {
        const db = new DatabaseSync(filename);
        db.exec("CREATE TABLE ExternalFixture(id TEXT PRIMARY KEY); INSERT INTO ExternalFixture VALUES ('kept')");
        db.close();
      } else {
        const db = await makeLocalLibsqlClient(filename);
        await db.execute("CREATE TABLE ExternalFixture(id TEXT PRIMARY KEY)");
        await db.execute("INSERT INTO ExternalFixture VALUES ('kept')");
        await db.close();
      }
      const run = makeRun();
      await assert.rejects(
        invoke(run, { clientFactory: makeClientFactory(engine, filename) }),
        (error) => matchesErrorCode(error, "PREVIEW_UNTRACKED_DATABASE_STATE"),
      );
      const inspect = engine === "sqlite" ? inspectSqlite : inspectLibsql;
      await inspect(filename, async (db) => {
        assert.equal((await db.execute("SELECT id FROM ExternalFixture")).rows[0].id, "kept");
        const runnerTables = await db.execute(`SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE '_preview_%'`);
        assert.equal(runnerTables.rows.length, 0);
      });
    });
  }
});

test("migration-directory or SQL tampering fails before opening a client", async (t) => {
  const tamperRoot = fs.mkdtempSync(path.join(os.tmpdir(), "preview-migration-tamper-"));
  const tamperedMigrations = path.join(tamperRoot, "migrations");
  fs.mkdirSync(tamperedMigrations);
  try {
    for (const entry of fixtureManifest.migrations) {
      const source = path.join(migrationsRoot, entry.name);
      const destination = path.join(tamperedMigrations, entry.name);
      fs.cpSync(source, destination, { recursive: true });
    }
    const changedName = fixtureManifest.migrations[0].name;
    fs.appendFileSync(path.join(tamperedMigrations, changedName, "migration.sql"), "\n-- synthetic tamper\n");
    const run = makeRun({ migrationRoot: tamperedMigrations });
    let factoryCalls = 0;
      await assert.rejects(
        invoke(run, { clientFactory: async () => { factoryCalls += 1; throw new Error("must not open"); } }),
      (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_HASH_MISMATCH"),
    );
    assert.equal(factoryCalls, 0);
    await t.test("directory addition", async () => {
      fs.rmSync(path.join(tamperedMigrations, changedName), { recursive: true, force: true });
      for (const entry of fixtureManifest.migrations) {
        const source = path.join(migrationsRoot, entry.name);
        const destination = path.join(tamperedMigrations, entry.name);
        if (!fs.existsSync(destination)) fs.cpSync(source, destination, { recursive: true });
      }
      fs.mkdirSync(path.join(tamperedMigrations, "20279999999999_unexpected"));
      let extraFactoryCalls = 0;
      await assert.rejects(
        invoke(makeRun({ migrationRoot: tamperedMigrations }), {
          clientFactory: async () => { extraFactoryCalls += 1; throw new Error("must not open"); },
        }),
        (error) => matchesErrorCode(error, "PREVIEW_MIGRATION_CHAIN_MISMATCH"),
      );
      assert.equal(extraFactoryCalls, 0);
    });
  } finally {
    const resolved = path.resolve(tamperRoot);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^preview-migration-tamper-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test("Windows ACL policy separates harmless ancestor read access from strict credential ACLs", async (t) => {
  const currentSid = "S-1-5-21-100-200-300-1001";
  const trustedInstallerSid = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
  const acl = ({ entries, ownerSid = currentSid, daclProtected = true, reparsePoint = false }) => JSON.stringify({
    currentSid,
    ownerSid,
    daclProtected,
    reparsePoint,
    entries,
  });
  const good = [
    { sid: currentSid, access: "Allow", rightsMask: 0x001f01ff, isInherited: false, isInheritOnly: false },
    { sid: "S-1-5-18", access: "Allow", rightsMask: 0x001f01ff, isInherited: false, isInheritOnly: false },
    { sid: "S-1-5-32-544", access: "Allow", rightsMask: 0x001f01ff, isInherited: false, isInheritOnly: false },
  ];
  assert.equal(validateWindowsPrivateAclJson(acl({ entries: good }), currentSid), true);
  const harmlessAncestorRead = [
    ...good,
    { sid: "S-1-5-11", access: "Allow", rightsMask: 0x000200a9, isInherited: false, isInheritOnly: false },
  ];
  assert.equal(validateWindowsParentAclJson(acl({ entries: harmlessAncestorRead }), currentSid), true);
  assert.throws(
    () => validateWindowsParentAclJson(acl({ entries: good, ownerSid: trustedInstallerSid }), currentSid),
    (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
    "the volume-root owner exception is not accepted for Profile or the profile child directory",
  );
  assert.equal(validateWindowsParentAclJson(acl({
    entries: [...good, { sid: "S-1-5-11", access: "Allow", rightsMask: 0x00000002, isInherited: true, isInheritOnly: true }],
  }), currentSid), true, "inherit-only ACEs do not affect the ancestor itself");

  const badCases = [
    ["Everyone grant", { entries: [...good, { sid: "S-1-1-0", access: "Allow", rightsMask: 1, isInherited: false, isInheritOnly: false }], code: "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED" }],
    ["Users grant", { entries: [...good, { sid: "S-1-5-32-545", access: "Allow", rightsMask: 1, isInherited: false, isInheritOnly: false }], code: "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED" }],
    ["empty DACL", { entries: [], code: ["PREVIEW_CREDENTIAL_ACL_UNVERIFIED", "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED"] }],
    ["unresolvable principal", { entries: [...good, { sid: "not-a-sid", access: "Allow", rightsMask: 1, isInherited: false, isInheritOnly: false }], code: "PREVIEW_CREDENTIAL_ACL_UNVERIFIED" }],
    ["unexpected owner", { entries: [good[0]], ownerSid: "S-1-5-21-1-2-3-4", code: "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED" }],
    ["TrustedInstaller owner on strict directory or file", { entries: [good[0]], ownerSid: trustedInstallerSid, code: "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED" }],
    ["unprotected inheritance", { entries: good, daclProtected: false, code: "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED" }],
    ["inherited strict ACE", { entries: good.map((entry, index) => index === 0 ? { ...entry, isInherited: true } : entry), code: "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED" }],
    ["reparse point", { entries: good, reparsePoint: true, code: "PREVIEW_CREDENTIAL_PATH_UNSAFE" }],
  ];
  for (const [name, badAcl] of badCases) {
    await t.test(name, async () => {
      assert.throws(
        () => validateWindowsPrivateAclJson(acl(badAcl), currentSid),
        (error) => Array.isArray(badAcl.code) ? badAcl.code.includes(error.code) : error.code === badAcl.code,
      );
    });
  }

  for (const [name, rightsMask] of [
    ["effective untrusted profile write", 0x00000002],
    ["effective untrusted profile delete-child", 0x00000040],
    ["effective untrusted profile DACL change", 0x00040000],
    ["effective untrusted profile owner change", 0x00080000],
  ]) {
    await t.test(name, () => {
      const parent = acl({
        entries: [...good, { sid: "S-1-5-11", access: "Allow", rightsMask, isInherited: false, isInheritOnly: false }],
      });
      assert.throws(
        () => validateWindowsParentAclJson(parent, currentSid),
        (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
      );
    });
  }
  await t.test("null DACL data fails closed", () => {
    assert.throws(
      () => validateWindowsPrivateAclJson(JSON.stringify({ currentSid, ownerSid: currentSid, daclProtected: true, reparsePoint: false, entries: null }), currentSid),
      (error) => error.code === "PREVIEW_CREDENTIAL_ACL_UNVERIFIED",
    );
  });
});

test("higher-ancestor ACL policy blocks replacement rights but allows create-only and read access", async (t) => {
  const currentSid = "S-1-5-21-100-200-300-1001";
  const trustedInstallerSid = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
  const acl = (entries, ownerSid = currentSid) => JSON.stringify({
    currentSid,
    ownerSid,
    daclProtected: false,
    reparsePoint: false,
    entries,
  });
  const trusted = { sid: currentSid, access: "Allow", rightsMask: 0x001f01ff, isInherited: true, isInheritOnly: false };
  const safeHigherAncestor = [
    trusted,
    { sid: "S-1-5-11", access: "Allow", rightsMask: 0x000200a9, isInherited: false, isInheritOnly: false },
    { sid: "S-1-5-11", access: "Allow", rightsMask: 0x00000004, isInherited: false, isInheritOnly: false },
    { sid: "S-1-5-11", access: "Allow", rightsMask: 0x001f01ff, isInherited: true, isInheritOnly: true },
  ];
  assert.equal(validateWindowsHigherAncestorAclJson(acl(safeHigherAncestor), currentSid), true);
  assert.equal(
    validateWindowsHigherAncestorAclJson(acl(safeHigherAncestor, trustedInstallerSid), currentSid, { isVolumeRoot: true }),
    true,
    "the exact Windows servicing owner is accepted only for the volume root",
  );
  assert.throws(
    () => validateWindowsHigherAncestorAclJson(acl(safeHigherAncestor, trustedInstallerSid), currentSid),
    (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
    "the Windows servicing owner is not accepted on a non-root ancestor",
  );
  assert.throws(
    () => validateWindowsHigherAncestorAclJson(acl(safeHigherAncestor, "S-1-5-80-1-2-3-4-5"), currentSid, { isVolumeRoot: true }),
    (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
    "unknown service owners are not accepted at the volume root",
  );
  assert.throws(
    () => validateWindowsHigherAncestorAclJson(acl([
      ...safeHigherAncestor,
      { sid: "S-1-5-11", access: "Allow", rightsMask: 0x00000040, isInherited: false, isInheritOnly: false },
    ], trustedInstallerSid), currentSid, { isVolumeRoot: true }),
    (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
    "the root-owner exception does not permit untrusted delete-child rights",
  );
  for (const [name, rightsMask] of [
    ["delete-child", 0x00000040],
    ["delete", 0x00010000],
    ["DACL change", 0x00040000],
    ["owner change", 0x00080000],
    ["generic all", 0x10000000],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => validateWindowsHigherAncestorAclJson(acl([
          trusted,
          { sid: "S-1-5-11", access: "Allow", rightsMask, isInherited: true, isInheritOnly: false },
        ]), currentSid),
        (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
      );
    });
  }
});

test("Known Folder credential reader validates actual ACLs on a synthetic Temp subtree and rejects a broad profile grant", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows ACL reader integration requires Windows");
    return;
  }
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-credential-acl-"));
  const profilePath = path.join(rootDir, "profile");
  const migrationDirectory = path.join(profilePath, "AntiSelekPreviewMigration");
  const credentialPath = path.join(migrationDirectory, "preview-turso-writer.env");
  fs.mkdirSync(migrationDirectory, { recursive: true });
  fs.writeFileSync(credentialPath, syntheticCredentialText, { mode: 0o600 });
  const identity = spawnSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true });
  const currentSid = identity.stdout.match(/S-1-(?:\d+-)+\d+/)?.[0];
  const trustedSids = [currentSid, "S-1-5-18", "S-1-5-32-544"];
  const runIcacls = (args) => spawnSync("icacls.exe", args, { encoding: "utf8", windowsHide: true });
  const knownFolderResolver = () => ({ profilePath, currentSid });
  const safeOutsideFixtureAcl = safeSyntheticWindowsAcl(currentSid);
  const fixtureAclReader = (filename) => isWithinWindowsPath(rootDir, filename)
    ? readActualWindowsAclSnapshot(filename)
    : safeOutsideFixtureAcl;
  const readSyntheticCredential = () => readProtectedPreviewCredentialFile({
    platform: "win32",
    knownFolderResolver,
    windowsAclReader: fixtureAclReader,
  });
  const fixturePaths = [rootDir, profilePath, migrationDirectory, credentialPath];
  try {
    assert.equal(identity.status, 0, "current SID lookup must succeed for the Temp ACL fixture");
    assert.ok(currentSid, "current SID must be available for the Temp ACL fixture");
    for (const protectedPath of fixturePaths) {
      const setup = runIcacls([
        protectedPath,
        "/inheritance:r",
        "/grant:r",
        ...trustedSids.map((sid) => `*${sid}:(F)`),
      ]);
      assert.equal(setup.status, 0, `Temp ACL setup must succeed only on the disposable Temp path: ${setup.stderr}`);
    }
    const loaded = readSyntheticCredential();
    assert.equal(loaded, syntheticCredentialText);

    const harmlessRead = runIcacls([profilePath, "/grant", "*S-1-5-11:(RX)"]);
    assert.equal(harmlessRead.status, 0, "harmless ancestor read/traverse fixture setup must succeed on the Temp profile");
    assert.equal(readSyntheticCredential(), syntheticCredentialText);

    const broad = runIcacls([profilePath, "/grant", "*S-1-1-0:(WD)"]);
    assert.equal(broad.status, 0, "broad ACE fixture setup must affect only the synthetic Temp profile");
    assert.throws(
      () => readSyntheticCredential(),
      (error) => error.code === "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
    );

    const restoreProfile = runIcacls([profilePath, "/remove:g", "*S-1-1-0", "*S-1-5-11"]);
    assert.equal(restoreProfile.status, 0, "only synthetic Temp profile ACEs are removed before the reparse test");
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
    const junctionTarget = path.join(rootDir, "junction-target");
    fs.mkdirSync(junctionTarget, { recursive: true });
    fs.writeFileSync(path.join(junctionTarget, "preview-turso-writer.env"), syntheticCredentialText);
    fs.symlinkSync(junctionTarget, migrationDirectory, "junction");
    assert.throws(
      () => readSyntheticCredential(),
      (error) => error.code === "PREVIEW_CREDENTIAL_PATH_UNSAFE",
    );
  } finally {
    const resolved = path.resolve(rootDir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^preview-credential-acl-/);
    const reset = runIcacls([resolved, "/reset", "/T", "/C"]);
    assert.equal(reset.status, 0, `Temp ACL inheritance restoration must succeed before cleanup: ${reset.stderr}`);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
