import { MatchStatus } from "@/types/enums";
import { parseLevelDistributionSnapshot } from "./ladder/levelDistribution";
import { parseClubPlayDistributionSnapshot } from "./ladder/clubPlayDistribution";
import { parseBalancedMatchTypeSnapshot } from "./v3/balancedMatchTypes";
import {
  parseSocialVarietySnapshot,
  type SocialHistoryMatch,
} from "./v3/socialVariety";

interface SocialAssignmentRow {
  id?: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  matchmakingReasonJson?: string | null;
  createdAt?: Date;
  completedAt?: Date | null;
}

interface SocialSessionHistorySource {
  matches: readonly (SocialAssignmentRow & { status: string })[];
  queuedMatch?: SocialAssignmentRow | null;
}

const COMMITTED_STATUSES: ReadonlySet<string> = new Set([
  MatchStatus.COMPLETED,
  MatchStatus.PENDING,
  MatchStatus.IN_PROGRESS,
  MatchStatus.PENDING_APPROVAL,
]);

function toSocialHistoryMatch(row: SocialAssignmentRow): SocialHistoryMatch {
  const partition = {
    team1: [row.team1User1Id, row.team1User2Id] as [string, string],
    team2: [row.team2User1Id, row.team2User2Id] as [string, string],
  };
  let reason: unknown = null;
  try {
    if (row.matchmakingReasonJson) reason = JSON.parse(row.matchmakingReasonJson);
  } catch {
    // Legacy/manual reasons can be plain text. Their match still belongs in history.
  }
  const snapshot = parseSocialVarietySnapshot(reason, partition);
  const matchType = parseBalancedMatchTypeSnapshot(reason, partition);
  const levelMatchType = reason && typeof reason === "object" && "levelMatchType" in reason
    ? parseLevelDistributionSnapshot(reason.levelMatchType, partition) : null;
  const clubPlayMatchType = reason && typeof reason === "object" && "clubPlayMatchType" in reason
    ? parseClubPlayDistributionSnapshot(reason.clubPlayMatchType, partition) : null;
  const clubPlayReason = reason && typeof reason === "object" && "source" in reason && reason.source === "club-play"
    ? reason : null;
  const playedUp = clubPlayReason && "clubPlayPlayedUp" in clubPlayReason ? clubPlayReason.clubPlayPlayedUp : null;
  const ids = [...partition.team1, ...partition.team2];
  return {
    ...partition,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    ...(clubPlayReason && "clubPlayBoosted" in clubPlayReason && clubPlayReason.clubPlayBoosted === true
      ? { clubPlayBoosted: true } : {}),
    ...(Array.isArray(playedUp) && playedUp.every((id): id is string => typeof id === "string" && ids.includes(id))
      ? { clubPlayPlayedUp: playedUp } : {}),
    ...(row.id ? { id: row.id } : {}),
    completedAt: row.completedAt,
    ...(snapshot ? { socialVariety: snapshot } : {}),
    ...(matchType ? { balancedMatchType: matchType } : {}),
    ...(levelMatchType ? { levelMatchType } : {}),
    ...(clubPlayMatchType ? { clubPlayMatchType } : {}),
  };
}

function quartetKey(match: SocialHistoryMatch) {
  return [...match.team1, ...match.team2].sort().join("|");
}

/** Current rows are the source of truth, including reserved games and manual games. */
export function buildSocialSessionHistory(
  session: SocialSessionHistorySource,
  options: {
    excludeMatchIds?: ReadonlySet<string>;
    excludeQueuedMatch?: boolean;
    excludePendingMatches?: boolean;
  } = {}
): SocialHistoryMatch[] {
  const rows = session.matches.filter(
    (match) =>
      COMMITTED_STATUSES.has(match.status) &&
      !(options.excludePendingMatches && match.status === MatchStatus.PENDING) &&
      !(match.id && options.excludeMatchIds?.has(match.id))
  );
  const history = rows.map(toSocialHistoryMatch);
  if (!session.queuedMatch || options.excludeQueuedMatch) return history;

  const queued = toSocialHistoryMatch(session.queuedMatch);
  const activeQuartets = new Set(
    history
      .filter((_match, index) => rows[index].status !== MatchStatus.COMPLETED)
      .map(quartetKey)
  );
  // Assignment can briefly expose both rows. Completed repeats are never deduplicated.
  if (!activeQuartets.has(quartetKey(queued))) history.push(queued);
  return history;
}
