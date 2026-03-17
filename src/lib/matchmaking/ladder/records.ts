import type { LadderHistoryMatch, LadderRecord } from "./types";

export function createEmptyLadderRecord(): LadderRecord {
  return {
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
  };
}

export function getLadderScore(
  record: Pick<LadderRecord, "wins" | "losses">
): number {
  return record.wins - record.losses;
}

function ensureRecord(
  records: Map<string, LadderRecord>,
  userId: string
): LadderRecord {
  const existing = records.get(userId);
  if (existing) {
    return existing;
  }

  const created = createEmptyLadderRecord();
  records.set(userId, created);
  return created;
}

export function deriveLadderRecords(
  playerIds: Iterable<string>,
  matches: LadderHistoryMatch[]
): Map<string, LadderRecord> {
  const records = new Map<string, LadderRecord>();

  for (const playerId of playerIds) {
    records.set(playerId, createEmptyLadderRecord());
  }

  for (const match of matches) {
    if (match.status && match.status !== "COMPLETED") {
      continue;
    }

    if (
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number"
    ) {
      continue;
    }

    const team1Diff = match.team1Score - match.team2Score;
    const team2Diff = match.team2Score - match.team1Score;
    const team1Won = match.team1Score > match.team2Score;
    const team2Won = match.team2Score > match.team1Score;

    for (const userId of match.team1) {
      const record = ensureRecord(records, userId);
      record.pointDiff += team1Diff;
      if (team1Won) record.wins += 1;
      if (team2Won) record.losses += 1;
      record.ladderScore = getLadderScore(record);
    }

    for (const userId of match.team2) {
      const record = ensureRecord(records, userId);
      record.pointDiff += team2Diff;
      if (team2Won) record.wins += 1;
      if (team1Won) record.losses += 1;
      record.ladderScore = getLadderScore(record);
    }
  }

  return records;
}

export function deriveLadderRecordsByEntryTime(
  playerEntryAtById: Map<string, Date | null | undefined>,
  matches: LadderHistoryMatch[]
): Map<string, LadderRecord> {
  const records = new Map<string, LadderRecord>();

  for (const playerId of playerEntryAtById.keys()) {
    records.set(playerId, createEmptyLadderRecord());
  }

  for (const match of matches) {
    if (match.status && match.status !== "COMPLETED") {
      continue;
    }

    if (
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number"
    ) {
      continue;
    }

    const matchCompletedAt = match.completedAt?.getTime() ?? 0;
    const team1Diff = match.team1Score - match.team2Score;
    const team2Diff = match.team2Score - match.team1Score;
    const team1Won = match.team1Score > match.team2Score;
    const team2Won = match.team2Score > match.team1Score;

    for (const userId of match.team1) {
      const entryAt = playerEntryAtById.get(userId);
      if (entryAt && matchCompletedAt < entryAt.getTime()) {
        continue;
      }

      const record = ensureRecord(records, userId);
      record.pointDiff += team1Diff;
      if (team1Won) record.wins += 1;
      if (team2Won) record.losses += 1;
      record.ladderScore = getLadderScore(record);
    }

    for (const userId of match.team2) {
      const entryAt = playerEntryAtById.get(userId);
      if (entryAt && matchCompletedAt < entryAt.getTime()) {
        continue;
      }

      const record = ensureRecord(records, userId);
      record.pointDiff += team2Diff;
      if (team2Won) record.wins += 1;
      if (team1Won) record.losses += 1;
      record.ladderScore = getLadderScore(record);
    }
  }

  return records;
}
