import { createHash } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";

export const ACCOUNT_PLAYER_MIGRATION = "20261004120000_separate_accounts_players";
export const LEGACY_CREATOR_ACCESS_MIGRATION = "20261005120000_preserve_legacy_creator_access";
export const MANAGED_MARKER = "-- ACCOUNT_PLAYER_MANAGED_TRANSACTION";
export const LEDGER_MARKER = "-- ACCOUNT_PLAYER_LEDGER_INSERT";

export function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function validateLegacySource(db) {
  const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name").all().map((row) => row.name);
  if (names.length === 0) {
    throw new Error("Source database has no application tables; expected the unmigrated legacy schema. No migration was applied.");
  }
  const tables = new Set(names);
  const separatedTables = ["Account", "ClubAccess", "ClubAdmissionEvent"].filter((name) => tables.has(name));
  if (separatedTables.length > 0) {
    throw new Error(`Source already contains account/Player identity tables (${separatedTables.join(", ")}); expected the unmigrated legacy schema. No migration was applied.`);
  }

  const requiredColumns = {
    User: ["id", "isClaimed", "email", "passwordHash"],
    Community: ["id", "createdById"],
    CommunityMember: ["id", "communityId", "userId", "role", "createdAt"],
    SessionPlayer: ["id", "lastPartnerId"],
  };
  const missingTables = [];
  const missingColumns = [];
  for (const [table, required] of Object.entries(requiredColumns)) {
    if (!tables.has(table)) {
      missingTables.push(table);
      continue;
    }
    const present = new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name));
    for (const column of required) if (!present.has(column)) missingColumns.push(`${table}.${column}`);
  }
  if (missingTables.length || missingColumns.length) {
    const details = [
      missingTables.length ? `missing required legacy tables: ${missingTables.join(", ")}` : null,
      missingColumns.length ? `missing required legacy columns: ${missingColumns.join(", ")}` : null,
    ].filter(Boolean).join("; ");
    throw new Error(`Source database is not a supported unmigrated legacy schema (${details}). No migration was applied.`);
  }
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? { bigint: String(item) } :
      item instanceof Uint8Array ? { blob: Buffer.from(item).toString("base64") } : item,
  )).digest("hex");
}

export function legacyManifest(db) {
  const tables = {};
  const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name").all();
  for (const { name } of names) {
    const info = db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all();
    const columns = info.map((item) => item.name);
    const keys = info.filter((item) => item.pk > 0).sort((a, b) => a.pk - b.pk).map((item) => item.name);
    if (!keys.length) throw new Error(`Cannot verify legacy table without a primary key: ${name}`);
    const rows = db.prepare(`SELECT ${columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(name)}`).all();
    tables[name] = { columns, keys, rows: rows.map((row) => ({
      key: keys.map((key) => row[key]), fingerprint: fingerprint(columns.map((column) => row[column])),
    })) };
  }
  const presentPlayerColumns = new Set(db.prepare('PRAGMA table_info("User")').all().map((column) => column.name));
  const accountColumns = ["id", "email", "passwordHash", "name", "avatarKey", "selfNameChangedAt", "selfGenderChangedAt", "gender", "isActive", "createdAt", "updatedAt"].filter((column) => presentPlayerColumns.has(column));
  const accounts = db.prepare(`SELECT ${accountColumns.map(quoteIdentifier).join(",")} FROM "User" WHERE "isClaimed"=1 ORDER BY "id"`).all();
  const access = db.prepare('SELECT m."communityId" AS "clubId", m."userId", m."role", m."createdAt" FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE p."isClaimed"=1 ORDER BY m."id"').all();
  return {
    version: 1, tables,
    accountColumns,
    accounts: accounts.map((row) => ({ id: row.id, fingerprint: fingerprint(accountColumns.map((column) => row[column])) })),
    access,
  };
}

export function verifyLegacyPreservation(before, db) {
  const errors = [];
  for (const [name, table] of Object.entries(before.tables)) {
    const statement = db.prepare(`SELECT ${table.columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(name)} WHERE ${table.keys.map((key) => `${quoteIdentifier(key)} IS ?`).join(" AND ")}`);
    for (const expected of table.rows) {
      const row = statement.get(...expected.key);
      if (!row || fingerprint(table.columns.map((column) => row[column])) !== expected.fingerprint) {
        errors.push(`Legacy data changed in ${name} for a primary key`);
        break;
      }
    }
    if (name !== "ClubJoinRequest") {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get().count;
      if (count !== table.rows.length) errors.push(`Legacy row count changed in ${name}`);
    }
  }
  const accountStmt = db.prepare(`SELECT ${before.accountColumns.map(quoteIdentifier).join(",")} FROM "Account" WHERE "id"=?`);
  for (const expected of before.accounts) {
    const row = accountStmt.get(expected.id);
    if (!row || fingerprint(before.accountColumns.map((column) => row[column])) !== expected.fingerprint) errors.push("Account credential/profile copy differs from its legacy account");
    const owner = db.prepare('SELECT "ownerUserId" FROM "User" WHERE "id"=?').get(expected.id);
    if (owner?.ownerUserId !== expected.id) errors.push("Legacy registered Player ownership changed");
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM "Account"').get().count !== before.accounts.length) errors.push("Unexpected account count after migration");
  for (const expected of before.access) {
    const access = db.prepare('SELECT "role", "status", "createdAt" FROM "ClubAccess" WHERE "clubId"=? AND "userId"=?').get(expected.clubId, expected.userId);
    const creator = db.prepare('SELECT "id" FROM "Community" WHERE "id"=? AND "createdById"=?').get(expected.clubId, expected.userId);
    const expectedRole = creator ? "OWNER" : expected.role;
    if (!access || access.role !== expectedRole || access.status !== "ACTIVE" || access.createdAt !== expected.createdAt) errors.push("Legacy registered club authorization changed");
  }
  const creatorAuthorityErrors = db.prepare('SELECT COUNT(*) AS count FROM "Community" c LEFT JOIN "ClubAccess" a ON a."clubId"=c."id" AND a."userId"=c."createdById" WHERE a."id" IS NULL OR a."role"<>\'OWNER\' OR a."status"<>\'ACTIVE\'').get().count;
  if (creatorAuthorityErrors) errors.push("Legacy creator authority was not preserved in ClubAccess");
  const invalidOwners = db.prepare('SELECT COUNT(*) AS count FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."ownerUserId" IS NOT p."ownerUserId"').get().count;
  if (invalidOwners) errors.push("Roster ownership projection mismatch");
  const fkErrors = db.prepare("PRAGMA foreign_key_check").all();
  if (fkErrors.length) errors.push(`Foreign-key check failed (${fkErrors.length} rows)`);
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.some((row) => Object.values(row)[0] !== "ok")) errors.push("SQLite integrity check failed");
  if (errors.length) throw new Error([...new Set(errors)].join("; "));
  return {
    preservedTables: Object.keys(before.tables).length,
    preservedLegacyRows: Object.values(before.tables).reduce((total, table) => total + table.rows.length, 0),
    players: before.tables.User.rows.length,
    accounts: before.accounts.length,
    clubMembers: before.tables.CommunityMember.rows.length,
    foreignKeyErrors: 0,
    creatorAccessErrors: 0,
  };
}

export function safePreservationReport(before, db, sourceKind) {
  const tables = Object.fromEntries(Object.entries(before.tables).map(([name, table]) => {
    const rowFingerprints = table.rows.map((row) => row.fingerprint).sort();
    return [name, {
      originalColumns: table.columns,
      originalRowCount: rowFingerprints.length,
      stableSha256: fingerprint({ columns: table.columns, rowFingerprints }),
    }];
  }));
  const orphanLastPartners = db.prepare(`
    SELECT sp."lastPartnerId" AS value
    FROM "SessionPlayer" sp LEFT JOIN "User" p ON p."id"=sp."lastPartnerId"
    WHERE sp."lastPartnerId" IS NOT NULL AND p."id" IS NULL
  `).all().map((row) => String(row.value)).sort();
  const accountFingerprints = before.accounts.map((row) => row.fingerprint).sort();
  const accessFingerprints = before.access.map((row) => fingerprint(row)).sort();
  const rels = (table) => db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all()
    .filter((row) => (table === "Community" && row.from === "createdById") || (table === "ClubRatingAdjustment" && row.from === "actorId"))
    .map((row) => ({ table, column: row.from, references: row.table, onDelete: row.on_delete }));
  return {
    reportVersion: 1,
    migration: ACCOUNT_PLAYER_MIGRATION,
    followUpMigrations: [LEGACY_CREATOR_ACCESS_MIGRATION],
    sourceKind,
    legacyTables: tables,
    legacyClaimedAccountCredentialProfileDigest: { count: accountFingerprints.length, stableSha256: fingerprint(accountFingerprints) },
    legacyClubAuthorizationDigest: { count: accessFingerprints.length, stableSha256: fingerprint(accessFingerprints) },
    creatorAuthorityPreserved: db.prepare('SELECT COUNT(*) AS count FROM "Community" c LEFT JOIN "ClubAccess" a ON a."clubId"=c."id" AND a."userId"=c."createdById" WHERE a."id" IS NULL OR a."role"<>\'OWNER\' OR a."status"<>\'ACTIVE\'').get().count === 0,
    rawOrphanLastPartnerDigest: { count: orphanLastPartners.length, stableSha256: fingerprint(orphanLastPartners) },
    accountDeletionRelations: rels("Community").concat(rels("ClubRatingAdjustment")),
    rawValuesIncluded: false,
    primaryKeysIncluded: false,
  };
}

export function managedMigrationSql(sql, ledgerInsert = "") {
  if (!sql.includes(MANAGED_MARKER)) throw new Error("Expected a self-managed account/Player migration");
  if (!sql.includes(LEDGER_MARKER)) throw new Error("Missing atomic migration-ledger insertion marker");
  return sql.replace(LEDGER_MARKER, ledgerInsert);
}

export async function backupLocalSqlite(sourcePath, destinationPath) {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try { await backup(source, destinationPath); } finally { source.close(); }
}

export async function backupLibsqlReadOnly(client, destinationPath) {
  // A read transaction gives a consistent production snapshot; only the destination is written.
  const transaction = await client.transaction("read");
  const destination = new DatabaseSync(destinationPath);
  try {
    destination.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    const schema = await transaction.execute("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name");
    for (const row of schema.rows.filter((row) => row.type === "table")) {
      destination.exec(String(row.sql));
      const rows = await transaction.execute(`SELECT * FROM ${quoteIdentifier(row.name)}`);
      if (!rows.rows.length) continue;
      const statement = destination.prepare(`INSERT INTO ${quoteIdentifier(row.name)} (${rows.columns.map(quoteIdentifier).join(",")}) VALUES (${rows.columns.map(() => "?").join(",")})`);
      for (const data of rows.rows) statement.run(...rows.columns.map((column) => data[column]));
    }
    for (const row of schema.rows.filter((row) => row.type !== "table")) destination.exec(String(row.sql));
    destination.exec("COMMIT; PRAGMA foreign_keys=ON;");
    await transaction.commit();
  } catch (error) {
    try { destination.exec("ROLLBACK;"); } catch { /* No transaction remains. */ }
    await transaction.rollback().catch(() => {});
    throw error;
  } finally {
    destination.close();
    transaction.close();
  }
}
