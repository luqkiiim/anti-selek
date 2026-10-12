import { hash, quote, stable } from './production-release59.mjs';

const fail = code => { throw new Error(`PRODUCTION_RELEASE62_${code}`); };
const same = (a, b) => stable(a) === stable(b);

export function tableDigest(_table, columns, rows) {
  return hash(stable(rows.map(row => stable(columns.map(column => row[column]))).sort()));
}

// Independent from executing the proposed migration: match the existing
// normalizer's explicit-override precedence, then its legacy fallback.
export function expectedMembershipOverride(player) {
  if (['UPPER', 'LOWER'].includes(player.mixedSideOverride)) {
    if (player.gender === 'FEMALE' && player.mixedSideOverride === 'UPPER') return 'UPPER';
    if (player.gender === 'MALE' && player.mixedSideOverride === 'LOWER') return 'LOWER';
    return null;
  }
  if (player.gender === 'FEMALE' && player.partnerPreference === 'OPEN') return 'UPPER';
  if (player.gender === 'MALE' && player.partnerPreference === 'FEMALE_FLEX') return 'LOWER';
  return null;
}

export function verifyHistoricColumns(before, after) {
  const tables = before.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  let preservedRows = 0;
  for (const { name: table } of tables) {
    const info = before.prepare(`PRAGMA table_info(${quote(table)})`).all();
    const columns = info.map(column => column.name);
    const keys = info.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
    if (!keys.length) fail('PRIMARY_KEY_REQUIRED');
    const currentColumns = after.prepare(`PRAGMA table_info(${quote(table)})`).all().map(column => column.name);
    if (!columns.every(column => currentColumns.includes(column))) fail('ORIGINAL_COLUMN_MISSING');
    const additions = currentColumns.filter(column => !columns.includes(column));
    if (!same(additions, table === 'CommunityMember' ? ['mixedSideOverride'] : [])) fail('UNEXPECTED_COLUMN_ADDITION');
    const original = before.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all();
    const current = after.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} WHERE ${keys.map(key => `${quote(key)} IS ?`).join(' AND ')}`);
    for (const row of original) {
      const actual = current.get(...keys.map(key => row[key]));
      if (!actual) fail('ORIGINAL_ROW_MISSING');
      if (!same(columns.map(column => row[column]), columns.map(column => actual[column]))) fail('ORIGINAL_COLUMN_CHANGED');
      preservedRows++;
    }
    if (after.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n !== original.length) fail('ORIGINAL_TABLE_COUNT_CHANGED');
  }
  const originalTables = tables.map(table => table.name);
  const afterTables = after.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(table => table.name);
  if (!same(originalTables, afterTables)) fail('APPLICATION_TABLES_CHANGED');
  const players = new Map(before.prepare('SELECT id,gender,mixedSideOverride,partnerPreference FROM "User"').all().map(player => [player.id, player]));
  const memberships = before.prepare('SELECT id,userId FROM "CommunityMember"').all();
  const read = after.prepare('SELECT mixedSideOverride FROM "CommunityMember" WHERE id=?');
  for (const member of memberships) {
    const player = players.get(member.userId);
    if (!player || read.get(member.id)?.mixedSideOverride !== expectedMembershipOverride(player)) fail('PAIRING_BACKFILL_INVALID');
  }
  if (after.prepare('PRAGMA foreign_key_check').all().length || after.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('INTEGRITY_INVALID');
  return { originalRowsPreserved: preservedRows, membershipsBackfilled: memberships.length, credentialsAndSportingHistoryPreserved: true };
}
