import { MatchStatus } from "@/types/enums";
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
  const snapshot = parseSocialVarietySnapshot(row.matchmakingReasonJson, partition);
  return {
    ...partition,
    ...(row.id ? { id: row.id } : {}),
    completedAt: row.completedAt,
    ...(snapshot ? { socialVariety: snapshot } : {}),
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
  } = {}
): SocialHistoryMatch[] {
  const rows = session.matches.filter(
    (match) =>
      COMMITTED_STATUSES.has(match.status) &&
      !(match.id && options.excludeMatchIds?.has(match.id))
  );
  const history = rows.map(toSocialHistoryMatch);
  if (!session.queuedMatch || options.excludeQueuedMatch) return history;

  const queued = toSocialHistoryMatch(session.queuedMatch);
  const activeQuartets = new Set(
    rows
      .filter((match) => match.status !== MatchStatus.COMPLETED)
      .map((match) => quartetKey(toSocialHistoryMatch(match)))
  );
  // Assignment can briefly expose both rows. Completed repeats are never deduplicated.
  if (!activeQuartets.has(quartetKey(queued))) history.push(queued);
  return history;
}
