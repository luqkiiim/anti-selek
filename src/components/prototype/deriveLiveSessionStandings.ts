import { MatchStatus } from "@/types/enums";
import type { CompletedMatchInfo } from "@/components/session/sessionTypes";

export interface LiveSessionPlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointDiff: number;
}

type StandingsMatch = Pick<
  CompletedMatchInfo,
  | "team1User1Id"
  | "team1User2Id"
  | "team2User1Id"
  | "team2User2Id"
  | "team1Score"
  | "team2Score"
  | "status"
>;

const EMPTY_STATS: LiveSessionPlayerStats = {
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  pointDiff: 0,
};

/**
 * Derive standings details from completed, scored session matches only.
 * Pending approvals and matches without a valid winning score are ignored.
 */
export function deriveLiveSessionPlayerStats(
  userIds: Iterable<string>,
  matches: readonly StandingsMatch[] = [],
): Map<string, LiveSessionPlayerStats> {
  const statsByUserId = new Map<string, LiveSessionPlayerStats>();
  for (const userId of userIds) {
    if (!statsByUserId.has(userId)) {
      statsByUserId.set(userId, { ...EMPTY_STATS });
    }
  }

  for (const match of matches) {
    const team1Score = match.team1Score;
    const team2Score = match.team2Score;
    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof team1Score !== "number" ||
      typeof team2Score !== "number" ||
      !Number.isInteger(team1Score) ||
      !Number.isInteger(team2Score) ||
      team1Score < 0 ||
      team2Score < 0 ||
      team1Score === team2Score
    ) {
      continue;
    }

    const team1Won = team1Score > team2Score;
    const team1Diff = team1Score - team2Score;
    const team2Diff = -team1Diff;
    const team1Ids = new Set([match.team1User1Id, match.team1User2Id]);
    const team2Ids = new Set([match.team2User1Id, match.team2User2Id]);

    for (const userId of team1Ids) {
      const current = statsByUserId.get(userId) ?? { ...EMPTY_STATS };
      statsByUserId.set(userId, {
        matchesPlayed: current.matchesPlayed + 1,
        wins: current.wins + (team1Won ? 1 : 0),
        losses: current.losses + (team1Won ? 0 : 1),
        pointDiff: current.pointDiff + team1Diff,
      });
    }

    for (const userId of team2Ids) {
      const current = statsByUserId.get(userId) ?? { ...EMPTY_STATS };
      statsByUserId.set(userId, {
        matchesPlayed: current.matchesPlayed + 1,
        wins: current.wins + (team1Won ? 0 : 1),
        losses: current.losses + (team1Won ? 1 : 0),
        pointDiff: current.pointDiff + team2Diff,
      });
    }
  }

  return statsByUserId;
}
