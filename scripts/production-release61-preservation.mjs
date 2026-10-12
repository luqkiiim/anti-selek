import { hash, quote, stable } from './production-release59.mjs';

const fail = code => { throw new Error(`PRODUCTION_RELEASE61_${code}`); };
const same = (a,b) => stable(a) === stable(b);
const requestFields = new Set(['status','decision','revision','reviewedAt','updatedAt']);
const invitationFields = new Set(['status','revocationReason','revokedAt','updatedAt']);
const pendingRequest = (row, db) => row.status === 'PENDING' && (row.kind === 'OWNED_PLAYER' || row.originInvitationId !== null
  || (row.requestedPlayerId !== null && !db.prepare('SELECT 1 FROM CommunityMember WHERE communityId=? AND userId=? AND retiredByAdmissionEventId IS NULL').get(row.clubId,row.requestedPlayerId)));
const pendingInvitation = row => row.status === 'ACTIVE' && row.purpose !== 'CLAIM';

// The reviewed migration uses database timestamps and random invitation audit
// IDs. Normalize only its new receipts so rehearsal and cutover can be compared.
// All original sporting, credential, ownership and historical audit values stay
// in the manifest, including their original timestamps.
export function migrationRow(table, original) {
  const row = { ...original };
  if (table === 'ClubJoinRequest' && row.status === 'CANCELLED' && row.decision === 'CLUB_LOCAL_OWNERSHIP') {
    row.reviewedAt = '<migration-time>'; row.updatedAt = '<migration-time>';
  }
  if (table === 'PlayerInvitation' && row.status === 'REVOKED' && row.revocationReason === 'CLUB_LOCAL_OWNERSHIP') {
    row.revokedAt = '<migration-time>'; row.updatedAt = '<migration-time>';
  }
  if (table === 'ClubAdmissionEvent' && String(row.id).startsWith('local-ownership-cutover:') && row.action === 'LOCAL_OWNERSHIP_MIGRATION_CANCEL') row.createdAt = '<migration-time>';
  if (table === 'PlayerInvitationEvent' && row.action === 'REVOKED' && row.reason === 'CLUB_LOCAL_OWNERSHIP') {
    row.id = `local-invitation-cutover:${row.invitationId}`; row.createdAt = '<migration-time>';
  }
  return row;
}
export function tableDigest(table, columns, rows) {
  return hash(stable(rows.map(raw => {
    const row = migrationRow(table, raw);
    return stable(columns.map(column => row[column]));
  }).sort()));
}

// Independent old-column comparison, separate from running the proposed SQL.
// Append-only audit receipts and the exact pending-flow cancellations are the
// only changes permitted to rows that existed in the production snapshot.
export function verifyHistoricColumns(before, after) {
  const tables = before.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  let preservedRows = 0; let cancelledRequests = 0; let revokedInvitations = 0;
  for (const { name: table } of tables) {
    const info = before.prepare(`PRAGMA table_info(${quote(table)})`).all();
    const columns = info.map(column => column.name);
    const keys = info.filter(column => column.pk).sort((a,b) => a.pk-b.pk).map(column => column.name);
    if (!keys.length) fail('PRIMARY_KEY_REQUIRED');
    const original = before.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all();
    const current = after.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} WHERE ${keys.map(key => `${quote(key)} IS ?`).join(' AND ')}`);
    for (const row of original) {
      const actual = current.get(...keys.map(key => row[key]));
      if (!actual) fail('ORIGINAL_ROW_MISSING');
      let allowed = new Set();
      if (table === 'ClubJoinRequest' && pendingRequest(row,before)) {
        if (actual.status !== 'CANCELLED' || actual.decision !== 'CLUB_LOCAL_OWNERSHIP' || actual.revision !== row.revision+1 || !actual.reviewedAt) fail('PENDING_REQUEST_NOT_CANCELLED');
        allowed = requestFields; cancelledRequests++;
        const audit = after.prepare('SELECT * FROM ClubAdmissionEvent WHERE id=?').get(`local-ownership-cutover:${row.id}`);
        if (!audit || audit.action !== 'LOCAL_OWNERSHIP_MIGRATION_CANCEL' || audit.revision !== actual.revision || audit.admissionRequestId !== row.id) fail('PENDING_REQUEST_AUDIT_MISSING');
        const details = JSON.parse(audit.detailsJson).before;
        if (details.kind !== row.kind || details.originInvitationId !== row.originInvitationId || details.requestedPlayerId !== row.requestedPlayerId) fail('PENDING_REQUEST_PAYLOAD_CHANGED');
      }
      if (table === 'PlayerInvitation' && pendingInvitation(row)) {
        if (actual.status !== 'REVOKED' || actual.revocationReason !== 'CLUB_LOCAL_OWNERSHIP' || !actual.revokedAt) fail('INCOMPATIBLE_INVITATION_NOT_REVOKED');
        allowed = invitationFields; revokedInvitations++;
        const audits = after.prepare("SELECT * FROM PlayerInvitationEvent WHERE invitationId=? AND action='REVOKED' AND reason='CLUB_LOCAL_OWNERSHIP'").all(row.id);
        if (audits.length !== 1) fail('INVITATION_REVOCATION_AUDIT_MISSING');
      }
      const immutable = columns.filter(column => !allowed.has(column));
      if (!same(immutable.map(column=>row[column]), immutable.map(column=>actual[column]))) fail('ORIGINAL_COLUMN_CHANGED');
      preservedRows++;
    }
    const count = after.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n;
    const additions = table === 'ClubAdmissionEvent' ? before.prepare('SELECT * FROM ClubJoinRequest').all().filter(row=>pendingRequest(row,before)).length
      : table === 'PlayerInvitationEvent' ? before.prepare("SELECT count(*) AS n FROM PlayerInvitation WHERE status='ACTIVE' AND purpose<>'CLAIM'").get().n : 0;
    if (count !== original.length + additions) fail('ORIGINAL_TABLE_COUNT_CHANGED');
  }
  if (after.prepare('PRAGMA foreign_key_check').all().length || after.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('INTEGRITY_INVALID');
  if (after.prepare('SELECT count(*) AS n FROM ClubPlayerOwnershipEvent').get().n !== 0) fail('OWNERSHIP_EVENTS_NOT_EMPTY');
  if (after.prepare('SELECT count(*) AS n FROM Session WHERE ratingPolicyVersion<>1').get().n !== 0) fail('LEGACY_POLICY_CHANGED');
  if (after.prepare('SELECT count(*) AS n FROM CommunityMember WHERE ownershipRevision<>0').get().n !== 0) fail('LEGACY_OWNERSHIP_REVISION_CHANGED');
  return { originalRowsPreserved: preservedRows, cancelledRequests, revokedInvitations, credentialsAndSportingHistoryPreserved: true };
}
