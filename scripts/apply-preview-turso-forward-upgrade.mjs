import path from 'node:path';
import { fileURLToPath } from 'node:url';
import target from '../config/preview-turso-migration-target.json' with { type: 'json' };
import manifest from '../config/preview-turso-migration-manifest.json' with { type: 'json' };
import { assertPreviewTarget, parsePreviewCredentialFile } from './preview-turso-target-guard.mjs';
import { readProtectedPreviewCredentialFile } from './preview-turso-migration-core.mjs';
import { FORWARD_MANIFEST_SHA256, FORWARD_SQL_SHA256, loadForwardPlan, runForwardUpgrade } from './preview-turso-forward-upgrade.mjs';

const migrationsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
function parseArguments(argv) {
  const modes = argv.filter(arg => arg === '--apply' || arg === '--verify-only');
  if (modes.length !== 1) throw new Error('PREVIEW_FORWARD_ARGUMENTS_INVALID');
  const values = new Map();
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === modes[0]) continue;
    const key = argv[index];
    if (!['--confirm-name','--confirm-endpoint-sha256','--confirm-predecessor-manifest-sha256',
      '--confirm-forward-manifest-sha256','--confirm-sql-sha256'].includes(key)
      || values.has(key) || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('PREVIEW_FORWARD_ARGUMENTS_INVALID');
    values.set(key, argv[++index]);
  }
  if (values.size !== 5 || values.get('--confirm-name') !== target.databaseName
    || values.get('--confirm-endpoint-sha256') !== target.endpointSha256
    || values.get('--confirm-predecessor-manifest-sha256') !== manifest.manifestSha256
    || values.get('--confirm-forward-manifest-sha256') !== FORWARD_MANIFEST_SHA256
    || values.get('--confirm-sql-sha256') !== FORWARD_SQL_SHA256) throw new Error('PREVIEW_FORWARD_CONFIRMATION_INVALID');
  return modes[0] === '--apply' ? 'apply' : 'verify-only';
}
async function main() {
  const mode = parseArguments(process.argv.slice(2));
  loadForwardPlan(migrationsRoot); // Check every byte before reading credentials or opening a connection.
  const credentials = parsePreviewCredentialFile(readProtectedPreviewCredentialFile());
  assertPreviewTarget(credentials.url, target);
  const { createClient } = await import('@libsql/client');
  const client = createClient(credentials);
  try {
    const result = await runForwardUpgrade(client, { migrationsRoot, mode });
    console.log(`Preview forward upgrade: ${result.status}; outcome=${result.outcome}; guards=${result.identityGuards}; foreign-key violations=0.`);
    console.log(`Schema SHA-256: ${result.schemaSha256}.`);
    console.log(`Current application data SHA-256: ${result.applicationDataSha256}.`);
    console.log(`Application table counts: ${JSON.stringify(result.currentCounts)}.`);
  } finally { try { client.close(); } catch { /* Never emit provider details. */ } }
}
main().catch(error => {
  const code = typeof error?.message === 'string' && /^PREVIEW_(?:FORWARD|CREDENTIAL|TARGET|ENDPOINT|MANIFEST)_[A-Z_]+$/.test(error.message)
    ? error.message : 'PREVIEW_FORWARD_RUN_FAILED';
  console.error(`Preview forward upgrade stopped safely: ${code}.`);
  process.exitCode = 1;
});
