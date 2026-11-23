import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { parse } from "dotenv";
import { backupLibsqlReadOnly, backupLocalSqlite } from "./account-player-preservation.mjs";
import { loadProductionRehearsalCredentials } from "./production-rehearsal-credentials.mjs";
import { hash, quote, splitSql, stable } from "./production-release59.mjs";
import { validateWriterToken } from "./production-release63-security.mjs";
import { tursoEndpointFingerprint } from "./turso-local-target-guard.mjs";

const root = path.resolve(import.meta.dirname, "..");
const predecessor = "8d0ccd2408aeb81ff30aea9c4b21880754fab126";
const migration = "20261124000000_queued_doubles_type";
const sqlHash = "f4f7fc7884003858a53df369d5fc0346290a8789b24ef885c3f8768d1584edc4";
const endpoint = "af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d";
const migrationFile = `prisma/migrations/${migration}/migration.sql`;
const newFields = ["requestedMatchType", "refreshToken"];
const ledgerSql = 'SELECT name, applied_at FROM "_turso_sql_migrations" ORDER BY name';

class ReleaseError extends Error {}
function requireRelease(condition, message) {
  if (!condition) throw new ReleaseError(message);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readPlan(commit) {
  requireRelease(/^[a-f0-9]{40}$/.test(commit ?? "") && git("rev-parse", "HEAD") === commit, "Pin the current full commit SHA.");
  requireRelease(!git("status", "--porcelain"), "Use the clean reviewed worktree.");
  requireRelease(git("merge-base", predecessor, commit) === predecessor, "The pinned production predecessor is not part of this commit.");
  requireRelease(git("diff", "--name-status", predecessor, commit, "--", "prisma/migrations") === `A\t${migrationFile}`,
    "The release must add exactly the queued doubles migration.");
  const sql = fs.readFileSync(path.join(root, migrationFile), "utf8");
  requireRelease(hash(sql) === sqlHash, "The queued doubles SQL hash changed.");
  const priorMigrations = git("ls-tree", "--name-only", `${predecessor}:prisma/migrations`)
    .split("\n").filter((name) => /^\d{14}_/.test(name)).sort();
  requireRelease(priorMigrations.at(-1) === "20261105000000_google_sign_in", "Unexpected predecessor migration chain.");
  return { commit, priorMigrations, statements: splitSql(sql) };
}

function protectedPath(filename, directory) {
  const stat = fs.lstatSync(filename);
  requireRelease((directory ? stat.isDirectory() : stat.isFile()) && (stat.mode & 0o077) === 0
    && stat.uid === process.getuid(), "The release inputs must be private files owned by the current user.");
  return filename;
}

function readReader() {
  const credentials = loadProductionRehearsalCredentials();
  requireRelease(tursoEndpointFingerprint(credentials.url) === endpoint, "The reader target does not match production.");
  return credentials;
}

function readWriter(filename) {
  const entries = parse(fs.readFileSync(protectedPath(filename, false)));
  const { QUEUED_DOUBLES_WRITER_URL: url, QUEUED_DOUBLES_WRITER_TOKEN: authToken } = entries;
  requireRelease(Object.keys(entries).length === 2 && url && authToken, "The dedicated writer file is incomplete.");
  requireRelease(tursoEndpointFingerprint(url) === endpoint, "The writer target does not match production.");
  validateWriterToken(authToken);
  return { url, authToken };
}

function getColumnInfo(columns) {
  return columns.map(({ name, type, notnull, dflt_value, pk }) =>
    ({ name, type, notnull: Number(notnull), dflt_value, pk: Number(pk) }));
}

async function migrationState(db, priorMigrations, applied) {
  const ledger = (await db.execute(ledgerSql)).rows.map(({ name, applied_at }) => ({ name, applied_at }));
  const expected = applied ? [...priorMigrations, migration] : priorMigrations;
  requireRelease(stable(ledger.map((row) => row.name)) === stable(expected) &&
    ledger.every((row) => typeof row.applied_at === "string" && row.applied_at.length > 0),
  "The live migration ledger does not match the reviewed history.");
  const columns = getColumnInfo((await db.execute('PRAGMA table_info("QueuedMatch")')).rows);
  requireRelease(columns.some((column) => column.name === "id"), "The queue table is missing.");
  const observed = columns.filter((column) => newFields.includes(column.name));
  const expectedColumns = applied
    ? newFields.map((name) => ({ name, type: "TEXT", notnull: 0, dflt_value: null, pk: 0 }))
    : [];
  requireRelease(stable(observed) === stable(expectedColumns), "The queue schema differs from the expected phase.");
  return { columns, ledger };
}

async function queueDigest(db, columns) {
  const names = columns.map(({ name }) => name);
  const rows = (await db.execute(`SELECT ${names.map(quote).join(", ")} FROM "QueuedMatch" ORDER BY "id"`)).rows;
  return hash(stable(rows.map((row) => names.map((name) => row[name]))));
}

async function verifyIntegrity(db) {
  const integrity = (await db.execute("PRAGMA integrity_check")).rows;
  const violations = (await db.execute("PRAGMA foreign_key_check")).rows;
  requireRelease(integrity.length === 1 && integrity[0].integrity_check === "ok" && violations.length === 0,
    "Database integrity or foreign-key verification failed.");
}

/** The caller owns the transaction, including rollback on any failed check. */
export async function applyQueuedDoubles(tx, plan, expectedColumns) {
  const before = await migrationState(tx, plan.priorMigrations, false);
  requireRelease(stable(before.columns) === stable(expectedColumns), "The queue schema changed since rehearsal.");
  const beforeDigest = await queueDigest(tx, before.columns);
  for (const sql of plan.statements) await tx.execute(sql);
  const nonNull = (await tx.execute('SELECT count(*) AS count FROM "QueuedMatch" WHERE "requestedMatchType" IS NOT NULL OR "refreshToken" IS NOT NULL')).rows[0];
  requireRelease(Number(nonNull.count) === 0, "An existing queue acquired doubles metadata.");
  await tx.execute({
    sql: 'INSERT INTO "_turso_sql_migrations" (name, applied_at) VALUES (?, ?)',
    args: [migration, new Date().toISOString()],
  });
  const after = await migrationState(tx, plan.priorMigrations, true);
  const originalColumns = after.columns.filter(({ name }) => !newFields.includes(name));
  requireRelease(stable(originalColumns) === stable(before.columns) &&
    stable(after.ledger.slice(0, -1)) === stable(before.ledger) &&
    await queueDigest(tx, before.columns) === beforeDigest,
  "The migration changed an existing queue or ledger entry.");
}

async function rehearse(plan, directory, reader) {
  const source = path.join(directory, "source.db");
  const restored = path.join(directory, "rehearsal.db");
  await backupLibsqlReadOnly(reader, source);
  await backupLocalSqlite(source, restored);
  const db = new DatabaseSync(restored, { enableDoubleQuotedStringLiterals: true });
  try {
    const execute = async (input) => {
      const { sql, args = [] } = typeof input === "string" ? { sql: input } : input;
      const statement = db.prepare(sql);
      return { rows: statement.columns().length ? statement.all(...args) : (statement.run(...args), []) };
    };
    const wrapper = { execute };
    const before = await migrationState(wrapper, plan.priorMigrations, false);
    await verifyIntegrity(wrapper);
    db.exec("BEGIN IMMEDIATE");
    await applyQueuedDoubles(wrapper, plan, before.columns);
    db.exec("COMMIT");
    await verifyIntegrity(wrapper);
    fs.writeFileSync(path.join(directory, "rehearsal.json"), JSON.stringify({
      commit: plan.commit, sqlHash, endpoint, columns: before.columns,
      backupSha256: hash(fs.readFileSync(source)), completedAt: Date.now(),
    }), { flag: "wx", mode: 0o600 });
    console.log("Read-only production backup and local queued doubles rehearsal passed.");
  } finally {
    if (db.isTransaction) db.exec("ROLLBACK");
    db.close();
  }
}

export async function runQueuedDoublesRelease(mode, commit, attempt, approval) {
  process.umask(0o077);
  requireRelease(["rehearse", "apply", "verify"].includes(mode) && /^[a-z0-9][a-z0-9-]{0,39}$/.test(attempt ?? ""),
    "Supply a release mode, commit SHA, and fresh attempt name.");
  requireRelease(mode === "apply" ? approval === "--approved-production-release" : approval === undefined,
    "Apply requires explicit production approval.");
  const plan = readPlan(commit);
  const privateRoot = protectedPath(path.join(root, "private"), true);
  const releaseRoot = path.join(privateRoot, "production-queued-doubles");
  if (!fs.existsSync(releaseRoot)) fs.mkdirSync(releaseRoot, { mode: 0o700 });
  protectedPath(releaseRoot, true);
  const directory = path.join(releaseRoot, attempt);
  if (mode === "rehearse") fs.mkdirSync(directory, { mode: 0o700 });
  protectedPath(directory, true);
  const reader = createClient(readReader());
  try {
    if (mode === "rehearse") {
      return await rehearse(plan, directory, reader);
    }
    const report = JSON.parse(fs.readFileSync(protectedPath(path.join(directory, "rehearsal.json"), false), "utf8"));
    requireRelease(report.commit === commit && report.sqlHash === sqlHash && report.endpoint === endpoint &&
      report.backupSha256 === hash(fs.readFileSync(protectedPath(path.join(directory, "source.db"), false))),
    "The rehearsal does not match the reviewed commit, migration, and backup.");

    if (mode === "apply") {
      const review = JSON.parse(fs.readFileSync(protectedPath(path.join(releaseRoot, "review.json"), false), "utf8"));
      requireRelease(review.passed === true && review.commit === commit && Array.isArray(review.reviewers) &&
        new Set(review.reviewers).size >= 2 && review.reviewers.every((name) => /^\/root\/[a-z0-9_]+$/.test(name)),
      "A separate review bound to this exact commit is required.");
      const age = Date.now() - report.completedAt;
      requireRelease(Number.isFinite(age) && age >= 0 && age < 15 * 60 * 1000, "The rehearsal backup has expired.");
      requireRelease(git("ls-remote", "--heads", "origin", "refs/heads/main") === `${predecessor}\trefs/heads/main`,
        "Remote main changed. Recheck the deployment before proceeding.");
      const writer = createClient(readWriter(path.join(releaseRoot, "writer.env")));
      try {
        const tx = await writer.transaction("write");
        try {
          await applyQueuedDoubles(tx, plan, report.columns);
          await tx.commit();
        } catch (error) {
          await tx.rollback().catch(() => {});
          throw error;
        } finally {
          tx.close();
        }
      } finally {
        writer.close();
      }
      console.log("Production queued doubles migration and ledger committed together.");
    }

    const read = await reader.transaction("read");
    try {
      const { columns } = await migrationState(read, plan.priorMigrations, true);
      assert.deepEqual(columns.filter(({ name }) => !newFields.includes(name)), report.columns);
      await verifyIntegrity(read);
      console.log("Production queue schema, migration ledger, integrity, and foreign keys verified.");
    } finally {
      await read.rollback().catch(() => {});
      read.close();
    }
  } finally {
    reader.close();
  }
}

export function reportReleaseError(error) {
  console.error(error instanceof ReleaseError ? error.message : "Release stopped. Inspect the production schema and ledger before retrying any write.");
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runQueuedDoublesRelease(...process.argv.slice(2)).catch(reportReleaseError);
}
