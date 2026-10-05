import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { ACCOUNT_PLAYER_MIGRATION, LEGACY_CREATOR_ACCESS_MIGRATION, backupLibsqlReadOnly, backupLocalSqlite, legacyManifest, managedMigrationSql, safePreservationReport, validateLegacySource, verifyLegacyPreservation } from "./account-player-preservation.mjs";
import { loadProductionRehearsalCredentials } from "./production-rehearsal-credentials.mjs";
import { assertLocalTursoEndpoint, assertProductionRehearsalEnabled } from "./turso-local-target-guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Explicit command environment wins; local config supplies defaults only.
dotenv.config({ path: path.join(projectRoot, ".env.local"), quiet: true });
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

function createProtectedProductionOutputDirectory() {
  const privateRoot = path.join(projectRoot, "private");
  const snapshotRoot = path.join(privateRoot, "production-rehearsal");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  fs.mkdirSync(snapshotRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(snapshotRoot, 0o700);
  const outputDirectory = fs.mkdtempSync(path.join(snapshotRoot, "snapshot-"));
  fs.chmodSync(outputDirectory, 0o700);
  return outputDirectory;
}

function protectFile(filename, productionRehearsal) {
  if (productionRehearsal && fs.existsSync(filename)) fs.chmodSync(filename, 0o600);
}

function writeReport(filename, value, productionRehearsal) {
  fs.writeFileSync(filename, JSON.stringify(value, null, 2), { mode: productionRehearsal ? 0o600 : 0o666 });
  protectFile(filename, productionRehearsal);
}

async function main() {
  const sourceKind = argument("--source") ?? "sqlite";
  const productionRehearsal = sourceKind === "production";
  if (productionRehearsal) assertProductionRehearsalEnabled();
  if (!productionRehearsal && sourceKind !== "sqlite" && sourceKind !== "libsql" && sourceKind !== "turso") {
    throw new Error("Use --source sqlite, libsql, turso, or production");
  }
  if (productionRehearsal && argument("--output")) {
    throw new Error("Production rehearsal output is fixed under the protected private/ directory");
  }
  const productionCredentials = productionRehearsal ? loadProductionRehearsalCredentials() : null;
  const outputDirectory = productionRehearsal
    ? createProtectedProductionOutputDirectory()
    : path.resolve(argument("--output") ?? fs.mkdtempSync(path.join(os.tmpdir(), "anti-selek-account-player-rehearsal-")));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const sourcePath = path.join(outputDirectory, "source-snapshot.db");
  const rehearsalPath = path.join(outputDirectory, "rehearsal.db");
  if (fs.existsSync(sourcePath) || fs.existsSync(rehearsalPath)) throw new Error("Use a fresh rehearsal directory; snapshots must not be overwritten");
  if (productionRehearsal) {
    const client = createClient({ url: productionCredentials.url, authToken: productionCredentials.authToken });
    try { await backupLibsqlReadOnly(client, sourcePath); } finally { client.close(); }
    protectFile(sourcePath, true);
  } else if (sourceKind === "turso") {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) throw new Error("Turso credentials are unavailable; no source database was modified");
    assertLocalTursoEndpoint(process.env.TURSO_DATABASE_URL, { authToken: process.env.TURSO_AUTH_TOKEN });
    const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    try { await backupLibsqlReadOnly(client, sourcePath); } finally { client.close(); }
  } else if (sourceKind === "sqlite" || sourceKind === "libsql") {
    const input = argument("--database");
    const configured = process.env.DATABASE_URL;
    if (!input && !configured?.startsWith("file:")) throw new Error("Specify --database for the SQLite rehearsal");
    const databasePath = path.resolve(input ?? path.join(projectRoot, "prisma", configured.slice(5)));
    if (databasePath === sourcePath || databasePath === rehearsalPath) throw new Error("Source and rehearsal database paths must differ");
    if (!fs.existsSync(databasePath)) throw new Error("The configured local SQLite source does not exist");
    await backupLocalSqlite(databasePath, sourcePath);
  } else throw new Error("Use --source sqlite, libsql, or turso");
  const sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
  try { validateLegacySource(sourceDb); } finally { sourceDb.close(); }
  await backupLocalSqlite(sourcePath, rehearsalPath);
  protectFile(rehearsalPath, productionRehearsal);
  const db = new DatabaseSync(rehearsalPath);
  try {
    const before = legacyManifest(db);
    writeReport(path.join(outputDirectory, "before-manifest.json"), before, productionRehearsal);
    // Bring an older local copy up to the existing legacy baseline before the new migration.
    // Original manifests still compare every original column/value after both steps.
    const tableNames = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
    const ledger = tableNames.has("_turso_sql_migrations") ? "_turso_sql_migrations" : tableNames.has("_prisma_migrations") ? "_prisma_migrations" : null;
    if (!ledger) throw new Error("Source lacks a migration ledger; baseline it explicitly before rehearsal");
    const applied = new Set(db.prepare(ledger === "_prisma_migrations" ? 'SELECT "migration_name" AS name FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL' : 'SELECT "name" FROM "_turso_sql_migrations"').all().map((row) => row.name));
    const migrationRoot = path.join(projectRoot, "prisma", "migrations");
    const priorMigrations = fs.readdirSync(migrationRoot).filter((name) => name < ACCOUNT_PLAYER_MIGRATION && fs.statSync(path.join(migrationRoot, name)).isDirectory() && !applied.has(name)).sort();
    for (const name of priorMigrations) db.exec(fs.readFileSync(path.join(migrationRoot, name, "migration.sql"), "utf8"));
    const sql = fs.readFileSync(path.join(projectRoot, "prisma", "migrations", ACCOUNT_PLAYER_MIGRATION, "migration.sql"), "utf8");
    try {
      db.exec(managedMigrationSql(sql));
      db.exec(fs.readFileSync(path.join(migrationRoot, LEGACY_CREATOR_ACCESS_MIGRATION, "migration.sql"), "utf8"));
    } catch (error) { try { db.exec("ROLLBACK; PRAGMA foreign_keys=ON;"); } catch { /* closed transaction */ } throw error; }
    const report = { sourceKind, baselineMigrationsOnCopy: priorMigrations.length, ...verifyLegacyPreservation(before, db) };
    writeReport(path.join(outputDirectory, "verification.json"), report, productionRehearsal);
    const safeReportPath = path.join(outputDirectory, "preservation-report.json");
    const safeReport = safePreservationReport(before, db, sourceKind);
    writeReport(safeReportPath, safeReport, productionRehearsal);
    console.log(JSON.stringify({ ...report, orphanLastPartnerCount: safeReport.rawOrphanLastPartnerDigest.count, outputDirectory, safeReportPath }, null, 2));
  } finally { db.close(); }
}

main().catch((error) => {
  // Never echo remote URLs, tokens, credentials, SQL argument values, or driver error objects.
  console.error(`Account/Player migration rehearsal failed: ${error instanceof Error ? error.message.replace(/(?:libsql|https?):\/\/\S+/g, "[redacted endpoint]") : "unknown error"}`);
  process.exitCode = 1;
});
