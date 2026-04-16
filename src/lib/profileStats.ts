export const PROFILE_RECENT_FORM_MATCH_COUNT = 10;
export const PROFILE_RECENT_SESSION_COUNT = 5;
const PREFERRED_CONNECTION_MIN_MATCHES = 2;

interface ProfileParticipant {
  id: string;
  name: string;
}

export interface ProfileMatchSource {
  id: string;
  completedAt: Date | null;
  session: {
    id: string;
    code: string;
    name: string;
  };
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1User1: ProfileParticipant;
  team1User2: ProfileParticipant;
  team2User1: ProfileParticipant;
  team2User2: ProfileParticipant;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeam: number | null;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

export interface PlayerProfileStatsSummary {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsScored: number;
  pointsConceded: number;
  pointDifferential: number;
  sessionsPlayed: number;
  averageMatchesPerSession: number;
  lastPlayedAt: string | null;
}

export interface PlayerProfileRecentFormSummary {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointDifferential: number;
  ratingChange: number;
  currentStreak: {
    result: "WIN" | "LOSS" | null;
    count: number;
  };
}

export type PlayerProfileTrendDirection = "RISING" | "FLAT" | "SLIPPING";

export interface PlayerProfileConnectionSummary {
  user: ProfileParticipant;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointDifferential: number;
  ratingChange: number;
}

export interface PlayerProfileSessionSummary {
  id: string;
  code: string;
  name: string;
  date: string | null;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointDifferential: number;
  ratingChange: number;
}

export interface PlayerProfileTrendSummary {
  sessions: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointDifferential: number;
  ratingChange: number;
  direction: PlayerProfileTrendDirection;
  bestSession: PlayerProfileSessionSummary | null;
  worstSession: PlayerProfileSessionSummary | null;
}

export interface PlayerProfileMatchHistoryEntry {
  id: string;
  date: string | null;
  sessionId: string;
  sessionCode: string;
  sessionName: string;
  partner: ProfileParticipant;
  opponents: ProfileParticipant[];
  score: string;
  result: "WIN" | "LOSS";
  eloChange: number | null;
  pointDifferential: number;
}

export interface PlayerProfileDerivedData {
  stats: PlayerProfileStatsSummary;
  recentForm: PlayerProfileRecentFormSummary;
  recentSessions: PlayerProfileSessionSummary[];
  trend: PlayerProfileTrendSummary;
  partners: {
    mostPlayed: PlayerProfileConnectionSummary | null;
    bestWinRate: PlayerProfileConnectionSummary | null;
  };
  opponents: {
    mostFaced: PlayerProfileConnectionSummary | null;
    toughest: PlayerProfileConnectionSummary | null;
  };
  sessions: {
    latest: PlayerProfileSessionSummary | null;
    best: PlayerProfileSessionSummary | null;
  };
  matchHistory: PlayerProfileMatchHistoryEntry[];
}

interface ConnectionAggregate {
  user: ProfileParticipant;
  matches: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  ratingChange: number;
}

interface SessionAggregate {
  id: string;
  code: string;
  name: string;
  latestCompletedAtMs: number;
  matches: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  ratingChange: number;
}

function getTimeOrZero(value: Date | null) {
  return value?.getTime() ?? 0;
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function getWinRate(wins: number, matches: number) {
  return matches > 0 ? Math.round((wins / matches) * 100) : 0;
}

function toConnectionSummary(
  aggregate: ConnectionAggregate
): PlayerProfileConnectionSummary {
  return {
    user: aggregate.user,
    matches: aggregate.matches,
    wins: aggregate.wins,
    losses: aggregate.losses,
    winRate: getWinRate(aggregate.wins, aggregate.matches),
    pointDifferential: aggregate.pointDifferential,
    ratingChange: aggregate.ratingChange,
  };
}

function toSessionSummary(
  aggregate: SessionAggregate
): PlayerProfileSessionSummary {
  return {
    id: aggregate.id,
    code: aggregate.code,
    name: aggregate.name,
    date:
      aggregate.latestCompletedAtMs > 0
        ? new Date(aggregate.latestCompletedAtMs).toISOString()
        : null,
    matches: aggregate.matches,
    wins: aggregate.wins,
    losses: aggregate.losses,
    winRate: getWinRate(aggregate.wins, aggregate.matches),
    pointDifferential: aggregate.pointDifferential,
    ratingChange: aggregate.ratingChange,
  };
}

function updateConnectionAggregate(
  aggregates: Map<string, ConnectionAggregate>,
  participant: ProfileParticipant,
  {
    result,
    pointDifferential,
    ratingChange,
  }: {
    result: "WIN" | "LOSS";
    pointDifferential: number;
    ratingChange: number;
  }
) {
  const existing = aggregates.get(participant.id) ?? {
    user: participant,
    matches: 0,
    wins: 0,
    losses: 0,
    pointDifferential: 0,
    ratingChange: 0,
  };

  existing.matches += 1;
  existing.pointDifferential += pointDifferential;
  existing.ratingChange += ratingChange;

  if (result === "WIN") {
    existing.wins += 1;
  } else {
    existing.losses += 1;
  }

  aggregates.set(participant.id, existing);
}

function pickPreferredConnection(
  summaries: PlayerProfileConnectionSummary[],
  compare: (
    left: PlayerProfileConnectionSummary,
    right: PlayerProfileConnectionSummary
  ) => number
) {
  const candidates =
    summaries.filter(
      (summary) => summary.matches >= PREFERRED_CONNECTION_MIN_MATCHES
    );
  const source = candidates.length > 0 ? candidates : summaries;

  return source.slice().sort(compare)[0] ?? null;
}

function compareMostPlayedConnections(
  left: PlayerProfileConnectionSummary,
  right: PlayerProfileConnectionSummary
) {
  return (
    right.matches - left.matches ||
    right.winRate - left.winRate ||
    right.pointDifferential - left.pointDifferential ||
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    })
  );
}

function compareBestPartnerConnections(
  left: PlayerProfileConnectionSummary,
  right: PlayerProfileConnectionSummary
) {
  return (
    right.winRate - left.winRate ||
    right.matches - left.matches ||
    right.pointDifferential - left.pointDifferential ||
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    })
  );
}

function compareToughestOpponents(
  left: PlayerProfileConnectionSummary,
  right: PlayerProfileConnectionSummary
) {
  return (
    left.winRate - right.winRate ||
    right.matches - left.matches ||
    left.pointDifferential - right.pointDifferential ||
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    })
  );
}

function compareLatestSessions(
  left: PlayerProfileSessionSummary,
  right: PlayerProfileSessionSummary
) {
  return (
    (getTimeOrZero(left.date ? new Date(left.date) : null) -
      getTimeOrZero(right.date ? new Date(right.date) : null)) * -1 ||
    right.matches - left.matches ||
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    })
  );
}

function compareBestSessions(
  left: PlayerProfileSessionSummary,
  right: PlayerProfileSessionSummary
) {
  return (
    right.wins - left.wins ||
    right.winRate - left.winRate ||
    right.pointDifferential - left.pointDifferential ||
    right.matches - left.matches ||
    compareLatestSessions(left, right)
  );
}

function compareWorstSessions(
  left: PlayerProfileSessionSummary,
  right: PlayerProfileSessionSummary
) {
  return (
    left.wins - right.wins ||
    left.winRate - right.winRate ||
    left.pointDifferential - right.pointDifferential ||
    left.ratingChange - right.ratingChange ||
    compareLatestSessions(left, right)
  );
}

function getTrendDirection({
  ratingChange,
  pointDifferential,
  wins,
  losses,
}: {
  ratingChange: number;
  pointDifferential: number;
  wins: number;
  losses: number;
}): PlayerProfileTrendDirection {
  if (
    ratingChange > 0 ||
    (ratingChange === 0 && (pointDifferential > 0 || wins > losses))
  ) {
    return "RISING";
  }

  if (
    ratingChange < 0 ||
    (ratingChange === 0 && (pointDifferential < 0 || wins < losses))
  ) {
    return "SLIPPING";
  }

  return "FLAT";
}

export function buildPlayerProfileDerivedData(
  userId: string,
  matches: ProfileMatchSource[]
): PlayerProfileDerivedData {
  const sortedMatches = matches
    .slice()
    .sort((left, right) => getTimeOrZero(right.completedAt) - getTimeOrZero(left.completedAt));

  const partnerAggregates = new Map<string, ConnectionAggregate>();
  const opponentAggregates = new Map<string, ConnectionAggregate>();
  const sessionAggregates = new Map<string, SessionAggregate>();
  const matchHistory: PlayerProfileMatchHistoryEntry[] = [];

  let wins = 0;
  let pointsScored = 0;
  let pointsConceded = 0;

  for (const match of sortedMatches) {
    const isTeam1 =
      match.team1User1Id === userId || match.team1User2Id === userId;
    const myTeam = isTeam1 ? 1 : 2;
    const result = match.winnerTeam === myTeam ? "WIN" : "LOSS";
    const myScore = isTeam1 ? match.team1Score ?? 0 : match.team2Score ?? 0;
    const opponentScore =
      isTeam1 ? match.team2Score ?? 0 : match.team1Score ?? 0;
    const ratingChange =
      (isTeam1 ? match.team1EloChange : match.team2EloChange) ?? 0;
    const pointDifferential = myScore - opponentScore;
    const partner = isTeam1
      ? match.team1User1Id === userId
        ? match.team1User2
        : match.team1User1
      : match.team2User1Id === userId
        ? match.team2User2
        : match.team2User1;
    const opponents = isTeam1
      ? [match.team2User1, match.team2User2]
      : [match.team1User1, match.team1User2];

    if (result === "WIN") {
      wins += 1;
    }

    pointsScored += myScore;
    pointsConceded += opponentScore;

    updateConnectionAggregate(partnerAggregates, partner, {
      result,
      pointDifferential,
      ratingChange,
    });

    for (const opponent of opponents) {
      updateConnectionAggregate(opponentAggregates, opponent, {
        result,
        pointDifferential,
        ratingChange,
      });
    }

    const existingSession = sessionAggregates.get(match.session.id) ?? {
      id: match.session.id,
      code: match.session.code,
      name: match.session.name,
      latestCompletedAtMs: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      pointDifferential: 0,
      ratingChange: 0,
    };

    existingSession.latestCompletedAtMs = Math.max(
      existingSession.latestCompletedAtMs,
      getTimeOrZero(match.completedAt)
    );
    existingSession.matches += 1;
    existingSession.pointDifferential += pointDifferential;
    existingSession.ratingChange += ratingChange;

    if (result === "WIN") {
      existingSession.wins += 1;
    } else {
      existingSession.losses += 1;
    }

    sessionAggregates.set(match.session.id, existingSession);

    matchHistory.push({
      id: match.id,
      date: toIsoString(match.completedAt),
      sessionId: match.session.id,
      sessionCode: match.session.code,
      sessionName: match.session.name,
      partner,
      opponents,
      score: `${myScore} - ${opponentScore}`,
      result,
      eloChange:
        (isTeam1 ? match.team1EloChange : match.team2EloChange) ?? null,
      pointDifferential,
    });
  }

  const totalMatches = sortedMatches.length;
  const losses = totalMatches - wins;
  const pointDifferential = pointsScored - pointsConceded;
  const sessionsPlayed = sessionAggregates.size;
  const averageMatchesPerSession =
    sessionsPlayed > 0
      ? Number((totalMatches / sessionsPlayed).toFixed(1))
      : 0;
  const lastPlayedAt = matchHistory[0]?.date ?? null;
  const recentHistory = matchHistory.slice(0, PROFILE_RECENT_FORM_MATCH_COUNT);
  const recentWins = recentHistory.filter((match) => match.result === "WIN").length;
  const recentLosses = recentHistory.length - recentWins;
  const currentStreak = (() => {
    const latestResult = matchHistory[0]?.result ?? null;
    if (!latestResult) {
      return {
        result: null,
        count: 0,
      } as const;
    }

    let count = 0;
    for (const match of matchHistory) {
      if (match.result !== latestResult) {
        break;
      }
      count += 1;
    }

    return {
      result: latestResult,
      count,
    } as const;
  })();

  const partnerSummaries = [...partnerAggregates.values()].map(toConnectionSummary);
  const opponentSummaries = [...opponentAggregates.values()].map(
    toConnectionSummary
  );
  const sessionSummaries = [...sessionAggregates.values()].map(toSessionSummary);
  const recentSessions = sessionSummaries
    .slice()
    .sort(compareLatestSessions)
    .slice(0, PROFILE_RECENT_SESSION_COUNT);
  const recentSessionWins = recentSessions.reduce(
    (sum, session) => sum + session.wins,
    0
  );
  const recentSessionLosses = recentSessions.reduce(
    (sum, session) => sum + session.losses,
    0
  );
  const recentSessionMatches = recentSessions.reduce(
    (sum, session) => sum + session.matches,
    0
  );
  const recentSessionPointDifferential = recentSessions.reduce(
    (sum, session) => sum + session.pointDifferential,
    0
  );
  const recentSessionRatingChange = recentSessions.reduce(
    (sum, session) => sum + session.ratingChange,
    0
  );

  return {
    stats: {
      totalMatches,
      wins,
      losses,
      winRate: getWinRate(wins, totalMatches),
      pointsScored,
      pointsConceded,
      pointDifferential,
      sessionsPlayed,
      averageMatchesPerSession,
      lastPlayedAt,
    },
    recentForm: {
      matches: recentHistory.length,
      wins: recentWins,
      losses: recentLosses,
      winRate: getWinRate(recentWins, recentHistory.length),
      pointDifferential: recentHistory.reduce(
        (sum, match) => sum + match.pointDifferential,
        0
      ),
      ratingChange: recentHistory.reduce(
        (sum, match) => sum + (match.eloChange ?? 0),
        0
      ),
      currentStreak,
    },
    recentSessions,
    trend: {
      sessions: recentSessions.length,
      matches: recentSessionMatches,
      wins: recentSessionWins,
      losses: recentSessionLosses,
      winRate: getWinRate(recentSessionWins, recentSessionMatches),
      pointDifferential: recentSessionPointDifferential,
      ratingChange: recentSessionRatingChange,
      direction: getTrendDirection({
        ratingChange: recentSessionRatingChange,
        pointDifferential: recentSessionPointDifferential,
        wins: recentSessionWins,
        losses: recentSessionLosses,
      }),
      bestSession:
        recentSessions.slice().sort(compareBestSessions)[0] ?? null,
      worstSession:
        recentSessions.slice().sort(compareWorstSessions)[0] ?? null,
    },
    partners: {
      mostPlayed: pickPreferredConnection(
        partnerSummaries,
        compareMostPlayedConnections
      ),
      bestWinRate: pickPreferredConnection(
        partnerSummaries,
        compareBestPartnerConnections
      ),
    },
    opponents: {
      mostFaced: pickPreferredConnection(
        opponentSummaries,
        compareMostPlayedConnections
      ),
      toughest: pickPreferredConnection(
        opponentSummaries,
        compareToughestOpponents
      ),
    },
    sessions: {
      latest: recentSessions[0] ?? null,
      best: sessionSummaries.slice().sort(compareBestSessions)[0] ?? null,
    },
    matchHistory,
  };
}
