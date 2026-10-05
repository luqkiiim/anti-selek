export const SESSION_REBUILD_MIGRATION = "20260403075615_add_test_sessions";

const SESSION_REBUILD_COLUMNS = [
  ["poolsEnabled", "BOOLEAN NOT NULL DEFAULT false"],
  ["poolAName", "TEXT"],
  ["poolBName", "TEXT"],
  ["poolACourtAssignments", "INTEGER NOT NULL DEFAULT 0"],
  ["poolBCourtAssignments", "INTEGER NOT NULL DEFAULT 0"],
  ["poolAMissedTurns", "INTEGER NOT NULL DEFAULT 0"],
  ["poolBMissedTurns", "INTEGER NOT NULL DEFAULT 0"],
  ["crossoverMissThreshold", "INTEGER NOT NULL DEFAULT 1"],
];

export async function ensureSessionRebuildColumns(client) {
  // This historical rebuild reads these columns before any earlier migration creates them.
  // Reconcile only missing columns in the guarded local/development runner; never rewrite history.
  const result = await client.execute('PRAGMA table_info("Session")');
  const existing = new Set(result.rows.map((row) => String(row.name)));
  if (existing.size === 0) {
    throw new Error(
      `Cannot prepare ${SESSION_REBUILD_MIGRATION}: the legacy Session table is missing.`,
    );
  }

  const missing = SESSION_REBUILD_COLUMNS.filter(([name]) => !existing.has(name));
  if (missing.length === 0) return [];

  const statements = missing.map(
    ([name, definition]) => `ALTER TABLE "Session" ADD COLUMN "${name}" ${definition};`,
  );
  try {
    await client.executeMultiple(`BEGIN;\n${statements.join("\n")}\nCOMMIT;`);
  } catch (error) {
    await client.executeMultiple("ROLLBACK;").catch(() => {});
    throw error;
  }

  return missing.map(([name]) => name);
}
