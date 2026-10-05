import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { backupLibsqlReadOnly, legacyManifest } from "./account-player-preservation.mjs";
import { atomicMigrationSql, committedMigrationBundle, CutoverError, loadCutoverAuthorization, manifestDigest, migrationState, protectedPath, rehearseSnapshot, requireCutover, sha256, verifyCompleteCutover, writePrivateJson } from "./phase1-cutover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function argument(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
function privateRun() {
  const base = path.join(root, "private/production-cutover");
  fs.mkdirSync(base, { recursive: true, mode: 0o700 }); fs.chmodSync(base, 0o700);
  const directory = fs.mkdtempSync(path.join(base, "run-")); fs.chmodSync(directory, 0o700);
  protectedPath(root, path.join(directory, "source-snapshot.db"), false);
  return directory;
}
async function assertBlocked(approval) {
  for (const url of approval.blockedLegacyUrls) {
    const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(10000) });
    requireCutover([403, 503].includes(response.status), "LEGACY_DEPLOYMENT_NOT_FROZEN");
  }
}
async function capture(credentials, filename) {
  protectedPath(root, filename, false);
  const reader = createClient({ url: credentials.url, authToken: credentials.readerToken });
  try { await backupLibsqlReadOnly(reader, filename); fs.chmodSync(filename, 0o600); }
  finally { reader.close(); }
}
function readJson(filename) { return JSON.parse(fs.readFileSync(protectedPath(root, filename))); }
async function main() {
  const valueFlags = new Set(["--rehearse-snapshot", "--approved-commit", "--run"]);
  const allowed = new Set([...valueFlags, "--production-cutover", "--snapshot", "--apply"]);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    requireCutover(allowed.has(flag) && !seen.has(flag), "UNSUPPORTED_CUTOVER_ARGUMENT");
    seen.add(flag);
    if (valueFlags.has(flag)) requireCutover(typeof args[++i] === "string" && !args[i].startsWith("--"), "CUTOVER_ARGUMENT_VALUE_REQUIRED");
  }
  requireCutover(args.filter(arg => ["--snapshot", "--apply", "--rehearse-snapshot"].includes(arg)).length === 1, "ONE_CUTOVER_STAGE_REQUIRED");
  requireCutover(!args.includes("--rehearse-snapshot") || (!args.includes("--production-cutover") && !args.includes("--run") && args.includes("--approved-commit")), "OFFLINE_REHEARSAL_ARGUMENTS_REQUIRED");
  requireCutover(args.includes("--rehearse-snapshot") || (!args.includes("--approved-commit") && (args.includes("--apply") === args.includes("--run"))), "LIVE_CUTOVER_ARGUMENTS_REQUIRED");
  if (args.includes("--rehearse-snapshot")) {
    const source = protectedPath(root, path.resolve(argument("--rehearse-snapshot") ?? ""));
    const bundle = committedMigrationBundle(root, argument("--approved-commit") ?? "");
    const directory = privateRun();
    const report = await rehearseSnapshot(source, directory, bundle);
    console.log(JSON.stringify({ stage: "historical-offline-rehearsal", productionWrites: 0, commit: bundle.commit, migrations: report.migrations, players: report.players, accounts: report.accounts, clubMembers: report.clubMembers, preservedLegacyRows: report.preservedLegacyRows, integrity: report.integrity, outputDirectory: directory }));
    return;
  }
  // No local env fallback, Vercel build access, default token or dev target exception.
  const { approval, credentials, bundle } = loadCutoverAuthorization(root, args);
  await assertBlocked(approval);
  if (args.includes("--snapshot")) {
    const directory = privateRun();
    const source = path.join(directory, "source-snapshot.db");
    await capture(credentials, source);
    const report = await rehearseSnapshot(source, directory, bundle);
    writePrivateJson(path.join(directory, "freeze-approval.json"), approval);
    writePrivateJson(path.join(directory, "final-snapshot.json"), { type: "final-frozen", createdAt: new Date().toISOString(), commit: bundle.commit, expectedMainCommit: approval.expectedMainCommit, productionEndpointSha256: approval.productionEndpointSha256 });
    console.log(JSON.stringify({ stage: "final-frozen-rehearsal-passed", productionWrites: 0, outputDirectory: directory, players: report.players, accounts: report.accounts, clubMembers: report.clubMembers, integrity: report.integrity }));
    return;
  }
  const directory = path.resolve(argument("--run") ?? "");
  const report = readJson(path.join(directory, "rehearsal-report.json"));
  const before = readJson(path.join(directory, "before-manifest.json"));
  const final = readJson(path.join(directory, "final-snapshot.json"));
  const frozenApproval = readJson(path.join(directory, "freeze-approval.json"));
  const snapshotAge = Date.now() - Date.parse(final.createdAt);
  requireCutover(final.type === "final-frozen" && final.commit === bundle.commit && final.expectedMainCommit === approval.expectedMainCommit && final.productionEndpointSha256 === approval.productionEndpointSha256 && snapshotAge >= 0 && snapshotAge < 3600_000, "FRESH_FINAL_SNAPSHOT_REQUIRED");
  requireCutover(JSON.stringify(frozenApproval) === JSON.stringify(approval), "FREEZE_APPROVAL_CHANGED");
  requireCutover(report.commit === bundle.commit && report.sourceSnapshotSha256 === sha256(fs.readFileSync(protectedPath(root, path.join(directory, "source-snapshot.db")))) && report.beforeManifestSha256 === manifestDigest(before) && JSON.stringify(report.migrations) === JSON.stringify(bundle.migrations.map(({ name, sha256 }) => ({ name, sha256 }))), "SNAPSHOT_PROVENANCE_MISMATCH");
  const checkDirectory = fs.mkdtempSync(path.join(directory, "verification-")); fs.chmodSync(checkDirectory, 0o700);
  const currentPath = path.join(checkDirectory, "current-before.db");
  await capture(credentials, currentPath);
  const current = new DatabaseSync(currentPath, { readOnly: true });
  let state;
  try {
    state = migrationState(current, bundle);
    if (state === "applied") {
      const verification = verifyCompleteCutover(before, current, bundle);
      console.log(JSON.stringify({ stage: "already-applied-and-verified", migrationsApplied: 0, ...verification }));
      return;
    }
    requireCutover(manifestDigest(legacyManifest(current)) === report.beforeManifestSha256, "PRODUCTION_CHANGED_AFTER_FINAL_SNAPSHOT");
  } finally { current.close(); }
  // Repeat the exact-snapshot rehearsal immediately before the only write call.
  await rehearseSnapshot(path.join(directory, "source-snapshot.db"), path.join(checkDirectory, "recheck"), bundle);
  await assertBlocked(approval);
  const writer = createClient({ url: credentials.url, authToken: credentials.writerToken });
  try { await writer.executeMultiple(atomicMigrationSql(bundle)); }
  catch {
    await writer.executeMultiple("ROLLBACK; PRAGMA foreign_keys=ON;").catch(() => {});
    throw new CutoverError("ATOMIC_MIGRATION_FAILED_KEEP_WRITES_FROZEN");
  } finally { writer.close(); }
  const afterPath = path.join(checkDirectory, "current-after.db");
  await capture(credentials, afterPath);
  const after = new DatabaseSync(afterPath, { readOnly: true });
  try {
    const verification = verifyCompleteCutover(before, after, bundle);
    const result = { stage: "production-migration-verified", commit: bundle.commit, migrationsApplied: bundle.migrations.map(m => m.name), ...verification, writesRemainFrozen: true, productionDeploymentActivated: false };
    writePrivateJson(path.join(directory, "migration-report.json"), result);
    console.log(JSON.stringify(result));
  } catch { throw new CutoverError("POST_MIGRATION_VERIFICATION_FAILED_KEEP_FROZEN_AND_RESTORE_PAIR"); }
  finally { after.close(); }
}
main().catch(error => {
  // Driver errors can include SQL arguments/production rows; print static codes only.
  console.error("Production identity cutover refused or failed:", error instanceof CutoverError ? error.code : "CUTOVER_FAILED_KEEP_WRITES_FROZEN");
  process.exitCode = 1;
});
