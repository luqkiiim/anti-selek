import { hash, quote, stable } from './production-release59.mjs';

const fail = code => { throw new Error(`PRODUCTION_RELEASE63_${code}`); };
const same = (a, b) => stable(a) === stable(b);
export const COLUMN_DEFAULTS = Object.freeze({
  SessionCommunity: { resetConfirmedRevision: null, rulesConfirmedRevision: null },
  Session: { collaborationVersion: 1, schedulingMode: 'FREE_PLAY', scoringFormat: 'SINGLE_GAME', ratingMode: 'RATED', rulesRevision: 0, resultsRevision: 0 },
  Match: { scoringFormat: 'SINGLE_GAME', gameScoresJson: null, scoreRevision: 0 },
  SessionPlayer: { hasStartedMatch: 0 },
});
const NEW_TABLES = ['SessionCollaborationEvent', 'SessionLineupRow'];

export function tableDigest(_table, columns, rows) {
  return hash(stable(rows.map(row => stable(columns.map(column => row[column]))).sort()));
}

// Independent of the proposed SQL: all predecessor columns and row identities
// must survive exactly, with only the reviewed additions and legacy defaults.
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
    const defaults = COLUMN_DEFAULTS[table] ?? {};
    if (!same(additions, Object.keys(defaults))) fail('UNEXPECTED_COLUMN_ADDITION');
    const original = before.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all();
    const current = after.prepare(`SELECT * FROM ${quote(table)} WHERE ${keys.map(key => `${quote(key)} IS ?`).join(' AND ')}`);
    for (const row of original) {
      const actual = current.get(...keys.map(key => row[key]));
      if (!actual) fail('ORIGINAL_ROW_MISSING');
      if (!same(columns.map(column => row[column]), columns.map(column => actual[column]))) fail('ORIGINAL_COLUMN_CHANGED');
      if (!Object.entries(defaults).every(([column, value]) => actual[column] === value)) fail('COLLABORATION_DEFAULT_INVALID');
      preservedRows++;
    }
    if (after.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n !== original.length) fail('ORIGINAL_TABLE_COUNT_CHANGED');
  }
  const expectedTables = [...tables.map(table => table.name), ...NEW_TABLES].sort();
  const afterTables = after.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(table => table.name);
  if (!same(expectedTables, afterTables)) fail('APPLICATION_TABLES_CHANGED');
  for (const table of NEW_TABLES) if (after.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n !== 0) fail('COLLABORATION_TABLES_NOT_EMPTY');
  const objects = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('index','trigger','view') ORDER BY type,name").all();
  const currentObjects = new Map(objects(after).map(object => [`${object.type}:${object.name}`, object]));
  if (!objects(before).every(object => same(currentObjects.get(`${object.type}:${object.name}`), object))) fail('ORIGINAL_SCHEMA_OBJECT_CHANGED');
  if (after.prepare('PRAGMA foreign_key_check').all().length || after.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') fail('INTEGRITY_INVALID');
  return { originalRowsPreserved: preservedRows, legacyCollaborationDefaultsVerified: true, newCollaborationTablesEmpty: true, credentialsAndSportingHistoryPreserved: true };
}
