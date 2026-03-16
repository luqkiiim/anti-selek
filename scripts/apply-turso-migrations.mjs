import "dotenv/config";

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const MIGRATION_TABLE = "_turso_sql_migrations";

function shouldRunMigrations() {
  return process.argv.includes("--force") || process.env.VERCEL === "1";
}

function getBaselineThroughName() {
  const flagIndex = process.argv.indexOf("--baseline-through");
  if (flagIndex === -1) return null;

  return process.argv[flagIndex + 1] ?? null;
}

function getMigrationDirectories(migrationsRoot) {
  return readdirSync(migrationsRoot)
    .filter((entry) => {
      const fullPath = path.join(migrationsRoot, entry);
      return statSync(fullPath).isDirectory();
    })
    .sort((left, right) => left.localeCompare(right));
}

function escapeSqlString(value) {
  return value.replaceAll("'", "''");
}

async function main() {
  if (!shouldRunMigrations()) {
    console.log("Skipping Turso SQL migrations outside Vercel build.");
    return;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN for Turso migration run."
    );
  }

  const rootDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsRoot = path.resolve(rootDir, "..", "prisma", "migrations");
  const client = createClient({ url, authToken });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedRows = await client.execute(
    `SELECT name FROM "${MIGRATION_TABLE}" ORDER BY name`
  );
  const appliedNames = new Set(
    appliedRows.rows.map((row) => String(row.name))
  );

  const migrationDirs = getMigrationDirectories(migrationsRoot);
  const baselineThroughName = getBaselineThroughName();

  if (baselineThroughName) {
    const baselineTargets = migrationDirs.filter(
      (dir) => dir <= baselineThroughName && !appliedNames.has(dir)
    );

    for (const migrationDir of baselineTargets) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO "${MIGRATION_TABLE}" (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)`,
        args: [migrationDir],
      });
      appliedNames.add(migrationDir);
      console.log(`Baselined Turso migration ${migrationDir}.`);
    }
  }

  const pendingDirs = migrationDirs.filter((dir) => !appliedNames.has(dir));

  if (pendingDirs.length === 0) {
    console.log("No pending Turso SQL migrations.");
    return;
  }

  for (const migrationDir of pendingDirs) {
    const migrationPath = path.join(
      migrationsRoot,
      migrationDir,
      "migration.sql"
    );
    const migrationSql = readFileSync(migrationPath, "utf8").trim();

    if (!migrationSql) {
      console.log(`Skipping empty migration ${migrationDir}.`);
      continue;
    }

    console.log(`Applying Turso migration ${migrationDir}...`);

    await client.executeMultiple(`
BEGIN;
${migrationSql}
INSERT INTO "${MIGRATION_TABLE}" (name, applied_at)
VALUES ('${escapeSqlString(migrationDir)}', CURRENT_TIMESTAMP);
COMMIT;
`);
  }

  console.log(`Applied ${pendingDirs.length} Turso migration(s).`);
}

main().catch((error) => {
  console.error("Turso migration runner failed:", error);
  process.exitCode = 1;
});
