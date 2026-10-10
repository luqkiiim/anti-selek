import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { parse } from "dotenv";
import policy from "../config/database-targets.json" with { type: "json" };
import { backupLocalSqlite, legacyManifest, managedMigrationSql, safePreservationReport, validateLegacySource, verifyLegacyPreservation } from "./account-player-preservation.mjs";
import { tursoEndpointFingerprint, tursoTokenFingerprint } from "./turso-local-target-guard.mjs";
import { validateReadOnlyTursoToken } from "./production-rehearsal-credentials.mjs";

export const APPROVED_FEATURE_COMMIT = "411281bd560f74706db7b8b788575fc9bcbc0f23";
export const CUTOVER_MIGRATIONS = Object.freeze([
  "20261004120000_separate_accounts_players",
  "20261005120000_preserve_legacy_creator_access",
  "20261005180000_player_invitations",
  "20261005190000_cleanup_player_invitation_continuations",
]);
export class CutoverError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireCutover(condition, code) { if (!condition) throw new CutoverError(code); }
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export function git(root, args) {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { throw new CutoverError("GIT_PROVENANCE_FAILED"); }
}
export function committedMigrationBundle(root, commit) {
  requireCutover(/^[0-9a-f]{40}$/.test(commit), "EXACT_COMMIT_REQUIRED");
  git(root, ["merge-base", "--is-ancestor", APPROVED_FEATURE_COMMIT, commit]);
  const names = git(root, ["ls-tree", "--name-only", `${commit}:prisma/migrations`]).split("\n").filter(name => /^\d{14}_/.test(name)).sort();
  requireCutover(JSON.stringify(names.filter(name => name >= CUTOVER_MIGRATIONS[0])) === JSON.stringify(CUTOVER_MIGRATIONS), "UNAPPROVED_MIGRATION_CHAIN");
  const migrations = CUTOVER_MIGRATIONS.map(name => {
    const sql = git(root, ["show", `${commit}:prisma/migrations/${name}/migration.sql`]);
    requireCutover(sql === git(root, ["show", `${APPROVED_FEATURE_COMMIT}:prisma/migrations/${name}/migration.sql`]), "REVIEWED_MIGRATION_CHANGED");
    // The production batch shares the first migration's existing transaction.
    if (name !== CUTOVER_MIGRATIONS[0]) requireCutover(!/^\s*(?:BEGIN(?:\s+(?:IMMEDIATE|DEFERRED|EXCLUSIVE|TRANSACTION))?\s*;|(?:COMMIT|ROLLBACK|PRAGMA)\b)/im.test(sql), "UNEXPECTED_MIGRATION_TRANSACTION");
    return { name, sql, sha256: sha256(sql) };
  });
  return { commit, baseline: names.filter(name => name < CUTOVER_MIGRATIONS[0]), migrations };
}
export function atomicMigrationSql(bundle) {
  requireCutover(bundle.migrations.length === 4 && bundle.migrations.every((m, i) => m.name === CUTOVER_MIGRATIONS[i] && sha256(m.sql) === m.sha256), "MIGRATION_PROVENANCE_MISMATCH");
  const rest = bundle.migrations.slice(1).map(m => m.sql).join("\n");
  const ledger = bundle.migrations.map(m => `INSERT INTO "_turso_sql_migrations" ("name", "applied_at") VALUES ('${m.name}', CURRENT_TIMESTAMP);`).join("\n");
  // Insert the three unchanged follow-up SQL files and all ledger entries before
  // the first migration's COMMIT. Any SQL failure rolls back the entire chain.
  return managedMigrationSql(bundle.migrations[0].sql, `${rest}\n${ledger}`);
}
export function migrationState(db, bundle) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
  requireCutover(tables.has("_turso_sql_migrations"), "PRODUCTION_LEDGER_REQUIRED");
  const names = db.prepare('SELECT "name" FROM "_turso_sql_migrations" ORDER BY "name"').all().map(row => row.name);
  const expected = bundle.baseline.concat(CUTOVER_MIGRATIONS);
  requireCutover(names.every(name => expected.includes(name)) && bundle.baseline.every(name => names.includes(name)), "LEGACY_BASELINE_MISMATCH");
  const applied = CUTOVER_MIGRATIONS.filter(name => names.includes(name));
  requireCutover(applied.length === 0 || applied.length === 4, "PARTIAL_CUTOVER_REFUSED");
  return applied.length === 4 ? "applied" : "legacy";
}
export function manifestDigest(manifest) {
  const tables = Object.fromEntries(Object.entries(manifest.tables).sort().map(([name, table]) => [name, { ...table, rows: [...table.rows].sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key))) }]));
  return sha256(JSON.stringify({ ...manifest, tables }));
}
export function verifyCompleteCutover(before, db, bundle) {
  requireCutover(migrationState(db, bundle) === "applied", "MIGRATION_LEDGER_INCOMPLETE");
  const preserved = verifyLegacyPreservation(before, db);
  const schema = new Set(db.prepare("SELECT name FROM sqlite_schema").all().map(row => row.name));
  const required = ["Account", "ClubAccess", "ClubAdmissionEvent", "PlayerInvitation", "PlayerInvitationEvent", "PlayerInvitationContinuation"];
  for (const migration of bundle.migrations) for (const match of migration.sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER)\s+"([^"]+)"/g)) required.push(match[1]);
  requireCutover(required.every(name => schema.has(name)), "EXPECTED_SCHEMA_MISSING");
  const count = sql => Number(db.prepare(sql).get().count);
  requireCutover(count('SELECT COUNT(*) AS count FROM "User" WHERE "isClaimed"=0 AND "ownerUserId" IS NOT NULL') === 0, "OFFLINE_PLAYER_OWNERSHIP_CHANGED");
  requireCutover(count('SELECT COUNT(*) AS count FROM "ClubAccess" a JOIN "User" p ON p."id"=a."userId" WHERE p."isClaimed"=0') === 0, "OFFLINE_ROSTER_PERMISSION_GRANTED");
  requireCutover(count('SELECT COUNT(*) AS count FROM (SELECT "communityId", "ownerUserId" FROM "CommunityMember" WHERE "ownerUserId" IS NOT NULL GROUP BY "communityId", "ownerUserId" HAVING COUNT(*)>1)') === 0, "DUPLICATE_ROSTER_OWNERSHIP");
  requireCutover(count('SELECT COUNT(*) AS count FROM "PlayerInvitationContinuation" c JOIN "PlayerInvitation" i ON i."id"=c."invitationId" WHERE i."status"<>\'ACTIVE\'') === 0, "TERMINAL_CONTINUATION_PRESENT");
  return { ...preserved, integrity: "ok", schemaObjectsVerified: required.length, offlineOwnershipErrors: 0, offlinePermissionErrors: 0, duplicateOwnershipErrors: 0, terminalContinuationErrors: 0 };
}
export function writePrivateJson(filename, value) {
  fs.writeFileSync(filename, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.chmodSync(filename, 0o600);
}
export function protectedPath(root, filename, mustExist = true) {
  const privateRoot = path.resolve(root, "private");
  const rootStat = fs.lstatSync(privateRoot);
  requireCutover(rootStat.isDirectory() && !rootStat.isSymbolicLink() && (rootStat.mode & 0o077) === 0, "PRIVATE_DIRECTORY_REQUIRED");
  const result = path.resolve(filename);
  const relative = path.relative(privateRoot, result);
  requireCutover(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "PRIVATE_PATH_REQUIRED");
  const parent = fs.lstatSync(path.dirname(result));
  requireCutover(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0, "PRIVATE_DIRECTORY_REQUIRED");
  const realRelative = path.relative(fs.realpathSync(privateRoot), fs.realpathSync(path.dirname(result)));
  requireCutover(!realRelative.startsWith("..") && !path.isAbsolute(realRelative), "PRIVATE_PATH_REQUIRED");
  if (mustExist) {
    const stat = fs.lstatSync(result);
    requireCutover(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, "PRIVATE_FILE_REQUIRED");
  } else requireCutover(!fs.existsSync(result), "OUTPUT_ALREADY_EXISTS");
  return result;
}
export async function rehearseSnapshot(sourcePath, outputDirectory, bundle) {
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 }); fs.chmodSync(outputDirectory, 0o700);
  const rehearsalPath = path.join(outputDirectory, "rehearsal.db");
  requireCutover(!fs.existsSync(rehearsalPath), "OUTPUT_ALREADY_EXISTS");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let before;
  try {
    validateLegacySource(source);
    requireCutover(migrationState(source, bundle) === "legacy", "LEGACY_SNAPSHOT_REQUIRED");
    before = legacyManifest(source);
  } finally { source.close(); }
  await backupLocalSqlite(sourcePath, rehearsalPath); fs.chmodSync(rehearsalPath, 0o600);
  const db = new DatabaseSync(rehearsalPath);
  try {
    db.exec(atomicMigrationSql(bundle));
    const verification = verifyCompleteCutover(before, db, bundle);
    writePrivateJson(path.join(outputDirectory, "before-manifest.json"), before);
    const preservation = safePreservationReport(before, db, "snapshot-copy");
    preservation.followUpMigrations = CUTOVER_MIGRATIONS.slice(1);
    const report = { commit: bundle.commit, migrations: bundle.migrations.map(({ name, sha256 }) => ({ name, sha256 })), sourceSnapshotSha256: sha256(fs.readFileSync(sourcePath)), beforeManifestSha256: manifestDigest(before), ...verification, preservation };
    writePrivateJson(path.join(outputDirectory, "rehearsal-report.json"), report);
    return report;
  } catch (error) {
    try { db.exec("ROLLBACK; PRAGMA foreign_keys=ON;"); } catch { /* connection may have no active transaction */ }
    throw error;
  } finally { db.close(); }
}
function tokenExpiry(token, now) {
  const parts = token.split(".");
  requireCutover(parts.length === 3 && parts.every(part => part.length > 0), "INVALID_CUTOVER_TOKEN");
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], "base64url")); } catch { throw new CutoverError("INVALID_CUTOVER_TOKEN"); }
  requireCutover(claims && typeof claims === "object" && !Array.isArray(claims), "INVALID_CUTOVER_TOKEN");
  requireCutover(Number.isFinite(claims.exp) && claims.exp > now / 1000 && claims.exp <= now / 1000 + 24 * 3600 && (claims.nbf === undefined || (Number.isFinite(claims.nbf) && claims.nbf <= now / 1000)), "SHORT_LIVED_CUTOVER_TOKEN_REQUIRED");
  return claims;
}
/** @param {import("./turso-local-target-guard.mjs").DatabaseTargetPolicy} [targetPolicy] */
export function validateCutoverCredentials(entries, approval, now = Date.now(), targetPolicy = policy) {
  const keys = ["PRODUCTION_CUTOVER_TURSO_URL", "PRODUCTION_CUTOVER_WRITER_TOKEN", "PRODUCTION_CUTOVER_READER_TOKEN"];
  requireCutover(Object.keys(entries).length === 3 && keys.every(key => typeof entries[key] === "string" && entries[key].trim()), "CUTOVER_CREDENTIALS_INCOMPLETE");
  const url = entries.PRODUCTION_CUTOVER_TURSO_URL.trim();
  const writerToken = entries.PRODUCTION_CUTOVER_WRITER_TOKEN.trim();
  const readerToken = entries.PRODUCTION_CUTOVER_READER_TOKEN.trim();
  requireCutover(tursoEndpointFingerprint(url) === targetPolicy.productionEndpointSha256 && approval.productionEndpointSha256 === targetPolicy.productionEndpointSha256, "PRODUCTION_ENDPOINT_MISMATCH");
  requireCutover(tursoTokenFingerprint(writerToken) !== targetPolicy.nonProductionTokenSha256 && tursoTokenFingerprint(readerToken) !== targetPolicy.nonProductionTokenSha256, "DEVELOPMENT_CREDENTIAL_REFUSED");
  requireCutover(writerToken !== readerToken && sha256(writerToken) === approval.writerTokenSha256 && sha256(readerToken) === approval.readerTokenSha256, "UNAPPROVED_CUTOVER_CREDENTIAL");
  const writer = tokenExpiry(writerToken, now);
  requireCutover(writer.a === "rw" && writer.p === undefined, "DEDICATED_DATABASE_WRITER_REQUIRED");
  tokenExpiry(readerToken, now); validateReadOnlyTursoToken(readerToken, now);
  return { url, writerToken, readerToken };
}
export const ACCEPTED_EXPOSURE_STATEMENT = "Approve the cutover and accept the unresolved token exposure";
export function validateCutoverPrerequisites(approval) {
  const gates = ["previewIsolationVerified", "rollbackRestoreVerified", "deploymentHoldVerified", "writesFrozen", "laptopAWritesStopped", "functionsDrained"];
  const rotated = approval.version === 1 && ["rotationVerified", "compromisedCredentialRejected", "vercelProductionCredentialsVerified", "laptopAProductionCredentialsVerified"].every(key => approval[key] === true);
  // An owner-approved exception records the incident as unresolved. It must not
  // fabricate rotation/rejection evidence or relax endpoint/credential guards.
  const accepted = approval.version === 2 && approval.rotationVerified === false && approval.compromisedCredentialRejected === false && approval.credentialExposureAccepted === true && approval.credentialExposureAcceptance === ACCEPTED_EXPOSURE_STATEMENT && approval.vercelProductionConfigurationVerified === true && approval.laptopAProductionAccessDisabled === true;
  requireCutover((rotated || accepted) && gates.every(key => approval[key] === true), "CUTOVER_PREREQUISITES_UNVERIFIED");
}
export function loadCutoverAuthorization(root, argv, env = process.env, now = Date.now()) {
  requireCutover(argv.includes("--production-cutover") && env.VERCEL !== "1" && env.NODE_ENV !== "test", "EXPLICIT_LOCAL_PRODUCTION_CUTOVER_REQUIRED");
  const approval = JSON.parse(fs.readFileSync(protectedPath(root, path.join(root, "private/production-cutover-approval.json"))));
  validateCutoverPrerequisites(approval);
  const checked = Date.parse(approval.freezeCheckedAt);
  requireCutover(Number.isFinite(checked) && checked <= now && now - checked < 3600_000, "FRESH_WRITE_FREEZE_REQUIRED");
  requireCutover(Array.isArray(approval.blockedLegacyUrls) && approval.blockedLegacyUrls.length > 0 && approval.blockedLegacyUrls.every(value => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"; } catch { return false; } }), "LEGACY_DEPLOYMENT_FREEZE_PROOF_REQUIRED");
  requireCutover(git(root, ["status", "--porcelain"]) === "" && git(root, ["rev-parse", "HEAD"]) === approval.approvedCommit, "APPROVED_CLEAN_CHECKOUT_REQUIRED");
  requireCutover(/^[0-9a-f]{40}$/.test(approval.expectedMainCommit) && git(root, ["ls-remote", "origin", "refs/heads/main"]).split(/\s/)[0] === approval.expectedMainCommit, "REMOTE_MAIN_CHANGED");
  git(root, ["merge-base", "--is-ancestor", approval.expectedMainCommit, approval.approvedCommit]);
  const entries = parse(fs.readFileSync(protectedPath(root, path.join(root, "private/production-cutover.env"))));
  return { approval, credentials: validateCutoverCredentials(entries, approval, now), bundle: committedMigrationBundle(root, approval.approvedCommit) };
}
