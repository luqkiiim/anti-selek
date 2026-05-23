import {
  getWeightedRecordScore,
  PREFERRED_CONNECTION_MIN_MATCHES,
} from "./connectionRanking";

export const COMMUNITY_PULSE_RECENT_MATCH_LIMIT = 24;

type MatchResult = "WIN" | "LOSS";

export interface CommunityPulseParticipant {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface CommunityPulseMemberSource extends CommunityPulseParticipant {
  elo: number;
}

export interface CommunityPulseSessionSource {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  isTest: boolean;
  createdAt: Date | string;
  endedAt?: Date | string | null;
  players: Array<{
    user: CommunityPulseParticipant;
  }>;
}

export interface CommunityPulseMatchSource {
  id: string;
  completedAt: Date | string | null;
  session: {
    id: string;
    code: string;
    name: string;
    type?: string;
    createdAt?: Date | string | null;
    endedAt?: Date | string | null;
  };
  winnerTeam: number | null;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1User1: CommunityPulseParticipant;
  team1User2: CommunityPulseParticipant;
  team2User1: CommunityPulseParticipant;
  team2User2: CommunityPulseParticipant;
  team1Score: number | null;
  team2Score: number | null;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

export interface CommunityPulseHotPlayer {
  user: CommunityPulseParticipant;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  ratingChange: number;
  pointDifferential: number;
  currentStreak: {
    result: MatchResult | null;
    count: number;
  };
  heatScore: number;
}

export interface CommunityPulseRivalry {
  players: [CommunityPulseParticipant, CommunityPulseParticipant];
  matches: number;
  playerOneWins: number;
  playerTwoWins: number;
  lastPlayedAt: string | null;
  lastSession: {
    code: string;
    name: string;
  } | null;
}

export interface CommunityPulsePartnership {
  players: [CommunityPulseParticipant, CommunityPulseParticipant];
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  lastPlayedAt: string | null;
  lastSession: {
    code: string;
    name: string;
  } | null;
}

export interface CommunityPulseLatestStory {
  session: {
    id: string;
    code: string;
    name: string;
    type: string;
    date: string | null;
    playerCount: number;
  };
  matches: number;
  topPerformer: {
    user: CommunityPulseParticipant;
    matches: number;
    wins: number;
    winRate: number;
    ratingChange: number;
    pointDifferential: number;
  } | null;
}

export interface CommunityPulseSnapshot {
  metrics: {
    members: number;
    activeTournaments: number;
    completedTournaments: number;
    recentMatches: number;
    activePlayers: number;
  };
  hotPlayers: CommunityPulseHotPlayer[];
  rivalries: CommunityPulseRivalry[];
  partnerships: CommunityPulsePartnership[];
  latestStory: CommunityPulseLatestStory | null;
}

interface HotPlayerAggregate {
  user: CommunityPulseParticipant;
  matches: number;
  wins: number;
  losses: number;
  ratingChange: number;
  pointDifferential: number;
  currentStreak: {
    result: MatchResult | null;
    count: number;
    open: boolean;
  };
}

interface RivalryAggregate {
  players: [CommunityPulseParticipant, CommunityPulseParticipant];
  matches: number;
  playerOneWins: number;
  playerTwoWins: number;
  lastPlayedAtMs: number;
  lastPlayedAt: string | null;
  lastSession: {
    code: string;
    name: string;
  } | null;
}

interface PartnershipAggregate {
  players: [CommunityPulseParticipant, CommunityPulseParticipant];
  matches: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  lastPlayedAtMs: number;
  lastPlayedAt: string | null;
  lastSession: {
    code: string;
    name: string;
  } | null;
}

interface LatestStoryAggregate {
  user: CommunityPulseParticipant;
  matches: number;
  wins: number;
  ratingChange: number;
  pointDifferential: number;
}

function getTime(value: Date | string | null | undefined) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getWinRate(wins: number, matches: number) {
  return matches > 0 ? Math.round((wins / matches) * 100) : 0;
}

function getCompletedSessions(sessions: CommunityPulseSessionSource[]) {
  return sessions
    .filter((session) => !session.isTest && session.status === "COMPLETED")
    .sort(
      (left, right) =>
        getTime(right.endedAt ?? right.createdAt) -
        getTime(left.endedAt ?? left.createdAt)
    );
}

function getActiveSessions(sessions: CommunityPulseSessionSource[]) {
  return sessions.filter(
    (session) => !session.isTest && session.status !== "COMPLETED"
  );
}

function getSortedCompletedMatches(matches: CommunityPulseMatchSource[]) {
  return matches
    .filter((match) => match.winnerTeam === 1 || match.winnerTeam === 2)
    .slice()
    .sort(
      (left, right) =>
        getTime(right.completedAt) - getTime(left.completedAt) ||
        left.id.localeCompare(right.id)
    );
}

function getMatchTeams(match: CommunityPulseMatchSource) {
  return {
    team1: [match.team1User1, match.team1User2],
    team2: [match.team2User1, match.team2User2],
  };
}

function updateHotPlayer(
  aggregates: Map<string, HotPlayerAggregate>,
  user: CommunityPulseParticipant,
  {
    result,
    pointDifferential,
    ratingChange,
  }: {
    result: MatchResult;
    pointDifferential: number;
    ratingChange: number;
  }
) {
  const aggregate = aggregates.get(user.id) ?? {
    user,
    matches: 0,
    wins: 0,
    losses: 0,
    ratingChange: 0,
    pointDifferential: 0,
    currentStreak: {
      result: null,
      count: 0,
      open: true,
    },
  };

  aggregate.matches += 1;
  aggregate.ratingChange += ratingChange;
  aggregate.pointDifferential += pointDifferential;

  if (result === "WIN") {
    aggregate.wins += 1;
  } else {
    aggregate.losses += 1;
  }

  if (aggregate.currentStreak.open) {
    if (aggregate.currentStreak.result === null) {
      aggregate.currentStreak.result = result;
      aggregate.currentStreak.count = 1;
    } else if (aggregate.currentStreak.result === result) {
      aggregate.currentStreak.count += 1;
    } else {
      aggregate.currentStreak.open = false;
    }
  }

  aggregates.set(user.id, aggregate);
}

function buildHotPlayers(matches: CommunityPulseMatchSource[]) {
  const aggregates = new Map<string, HotPlayerAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    for (const player of team1) {
      updateHotPlayer(aggregates, player, {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
        ratingChange: match.team1EloChange ?? 0,
      });
    }

    for (const player of team2) {
      updateHotPlayer(aggregates, player, {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
        ratingChange: match.team2EloChange ?? 0,
      });
    }
  }

  return Array.from(aggregates.values())
    .map((aggregate): CommunityPulseHotPlayer => {
      const heatScore =
        aggregate.wins * 8 +
        aggregate.ratingChange * 2 +
        aggregate.pointDifferential +
        (aggregate.currentStreak.result === "WIN"
          ? aggregate.currentStreak.count * 3
          : 0) -
        aggregate.losses * 2;

      return {
        user: aggregate.user,
        matches: aggregate.matches,
        wins: aggregate.wins,
        losses: aggregate.losses,
        winRate: getWinRate(aggregate.wins, aggregate.matches),
        ratingChange: aggregate.ratingChange,
        pointDifferential: aggregate.pointDifferential,
        currentStreak: {
          result: aggregate.currentStreak.result,
          count: aggregate.currentStreak.count,
        },
        heatScore,
      };
    })
    .sort(
      (left, right) =>
        right.heatScore - left.heatScore ||
        right.wins - left.wins ||
        right.ratingChange - left.ratingChange ||
        right.pointDifferential - left.pointDifferential ||
        right.matches - left.matches ||
        left.user.name.localeCompare(right.user.name, undefined, {
          sensitivity: "base",
        })
    )
    .slice(0, 3);
}

function getPlayerPairKey(
  left: CommunityPulseParticipant,
  right: CommunityPulseParticipant
) {
  return [left.id, right.id].sort().join(":");
}

function getOrderedPairPlayers(
  left: CommunityPulseParticipant,
  right: CommunityPulseParticipant
): [CommunityPulseParticipant, CommunityPulseParticipant] {
  return left.id.localeCompare(right.id) <= 0 ? [left, right] : [right, left];
}

function selectUniquePlayerPairs<
  T extends {
    players: [CommunityPulseParticipant, CommunityPulseParticipant];
  },
>(pairs: T[]) {
  const selected: T[] = [];
  const usedPlayerIds = new Set<string>();

  for (const pair of pairs) {
    const [leftPlayer, rightPlayer] = pair.players;

    if (
      usedPlayerIds.has(leftPlayer.id) ||
      usedPlayerIds.has(rightPlayer.id)
    ) {
      continue;
    }

    selected.push(pair);
    usedPlayerIds.add(leftPlayer.id);
    usedPlayerIds.add(rightPlayer.id);

    if (selected.length === 3) {
      break;
    }
  }

  return selected;
}

function updateRivalry(
  aggregates: Map<string, RivalryAggregate>,
  left: CommunityPulseParticipant,
  right: CommunityPulseParticipant,
  winnerIds: Set<string>,
  match: CommunityPulseMatchSource
) {
  const key = getPlayerPairKey(left, right);
  const players = getOrderedPairPlayers(left, right);
  const aggregate = aggregates.get(key) ?? {
    players,
    matches: 0,
    playerOneWins: 0,
    playerTwoWins: 0,
    lastPlayedAtMs: 0,
    lastPlayedAt: null,
    lastSession: null,
  };
  const completedAtMs = getTime(match.completedAt);

  aggregate.matches += 1;
  if (winnerIds.has(players[0].id)) {
    aggregate.playerOneWins += 1;
  } else if (winnerIds.has(players[1].id)) {
    aggregate.playerTwoWins += 1;
  }

  if (completedAtMs >= aggregate.lastPlayedAtMs) {
    aggregate.lastPlayedAtMs = completedAtMs;
    aggregate.lastPlayedAt = toIsoString(match.completedAt);
    aggregate.lastSession = {
      code: match.session.code,
      name: match.session.name,
    };
  }

  aggregates.set(key, aggregate);
}

function buildRivalries(matches: CommunityPulseMatchSource[]) {
  const aggregates = new Map<string, RivalryAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const winnerIds = new Set(
      match.winnerTeam === 1
        ? [match.team1User1Id, match.team1User2Id]
        : [match.team2User1Id, match.team2User2Id]
    );

    for (const team1Player of team1) {
      for (const team2Player of team2) {
        updateRivalry(aggregates, team1Player, team2Player, winnerIds, match);
      }
    }
  }

  return selectUniquePlayerPairs(
    Array.from(aggregates.values())
    .filter((rivalry) => rivalry.matches >= 2)
    .sort(
      (left, right) =>
        Math.abs(left.playerOneWins - left.playerTwoWins) -
          Math.abs(right.playerOneWins - right.playerTwoWins) ||
        right.matches - left.matches ||
        right.lastPlayedAtMs - left.lastPlayedAtMs ||
        left.players[0].name.localeCompare(right.players[0].name, undefined, {
          sensitivity: "base",
        })
    )
  )
    .map((rivalry) => ({
      players: rivalry.players,
      matches: rivalry.matches,
      playerOneWins: rivalry.playerOneWins,
      playerTwoWins: rivalry.playerTwoWins,
      lastPlayedAt: rivalry.lastPlayedAt,
      lastSession: rivalry.lastSession,
    }));
}

function updatePartnership(
  aggregates: Map<string, PartnershipAggregate>,
  left: CommunityPulseParticipant,
  right: CommunityPulseParticipant,
  {
    result,
    pointDifferential,
  }: {
    result: MatchResult;
    pointDifferential: number;
  },
  match: CommunityPulseMatchSource
) {
  const key = getPlayerPairKey(left, right);
  const players = getOrderedPairPlayers(left, right);
  const aggregate = aggregates.get(key) ?? {
    players,
    matches: 0,
    wins: 0,
    losses: 0,
    pointDifferential: 0,
    lastPlayedAtMs: 0,
    lastPlayedAt: null,
    lastSession: null,
  };
  const completedAtMs = getTime(match.completedAt);

  aggregate.matches += 1;
  aggregate.pointDifferential += pointDifferential;

  if (result === "WIN") {
    aggregate.wins += 1;
  } else {
    aggregate.losses += 1;
  }

  if (completedAtMs >= aggregate.lastPlayedAtMs) {
    aggregate.lastPlayedAtMs = completedAtMs;
    aggregate.lastPlayedAt = toIsoString(match.completedAt);
    aggregate.lastSession = {
      code: match.session.code,
      name: match.session.name,
    };
  }

  aggregates.set(key, aggregate);
}

function buildPartnerships(matches: CommunityPulseMatchSource[]) {
  const aggregates = new Map<string, PartnershipAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    updatePartnership(
      aggregates,
      team1[0],
      team1[1],
      {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
      },
      match
    );
    updatePartnership(
      aggregates,
      team2[0],
      team2[1],
      {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
      },
      match
    );
  }

  return selectUniquePlayerPairs(
    Array.from(aggregates.values())
    .filter(
      (partnership) =>
        partnership.matches >= PREFERRED_CONNECTION_MIN_MATCHES
    )
    .sort(
      (left, right) =>
        getWeightedRecordScore(right.wins, right.losses) -
          getWeightedRecordScore(left.wins, left.losses) ||
        right.matches - left.matches ||
        right.pointDifferential - left.pointDifferential ||
        right.lastPlayedAtMs - left.lastPlayedAtMs ||
        left.players[0].name.localeCompare(right.players[0].name, undefined, {
          sensitivity: "base",
        }) ||
        left.players[1].name.localeCompare(right.players[1].name, undefined, {
          sensitivity: "base",
        })
    )
  )
    .map((partnership) => ({
      players: partnership.players,
      matches: partnership.matches,
      wins: partnership.wins,
      losses: partnership.losses,
      winRate: getWinRate(partnership.wins, partnership.matches),
      lastPlayedAt: partnership.lastPlayedAt,
      lastSession: partnership.lastSession,
    }));
}

function updateLatestStoryAggregate(
  aggregates: Map<string, LatestStoryAggregate>,
  user: CommunityPulseParticipant,
  {
    result,
    pointDifferential,
    ratingChange,
  }: {
    result: MatchResult;
    pointDifferential: number;
    ratingChange: number;
  }
) {
  const aggregate = aggregates.get(user.id) ?? {
    user,
    matches: 0,
    wins: 0,
    ratingChange: 0,
    pointDifferential: 0,
  };

  aggregate.matches += 1;
  aggregate.ratingChange += ratingChange;
  aggregate.pointDifferential += pointDifferential;
  if (result === "WIN") {
    aggregate.wins += 1;
  }

  aggregates.set(user.id, aggregate);
}

function buildLatestStory(
  completedSessions: CommunityPulseSessionSource[],
  matches: CommunityPulseMatchSource[]
): CommunityPulseLatestStory | null {
  const latestSession = completedSessions[0];
  if (!latestSession) return null;

  const sessionMatches = matches.filter(
    (match) => match.session.id === latestSession.id
  );
  const aggregates = new Map<string, LatestStoryAggregate>();

  for (const match of sessionMatches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    for (const player of team1) {
      updateLatestStoryAggregate(aggregates, player, {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
        ratingChange: match.team1EloChange ?? 0,
      });
    }

    for (const player of team2) {
      updateLatestStoryAggregate(aggregates, player, {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
        ratingChange: match.team2EloChange ?? 0,
      });
    }
  }

  const topPerformer =
    Array.from(aggregates.values()).sort(
      (left, right) =>
        right.wins - left.wins ||
        getWinRate(right.wins, right.matches) -
          getWinRate(left.wins, left.matches) ||
        right.ratingChange - left.ratingChange ||
        right.pointDifferential - left.pointDifferential ||
        right.matches - left.matches ||
        left.user.name.localeCompare(right.user.name, undefined, {
          sensitivity: "base",
        })
    )[0] ?? null;

  return {
    session: {
      id: latestSession.id,
      code: latestSession.code,
      name: latestSession.name,
      type: latestSession.type,
      date: toIsoString(latestSession.endedAt ?? latestSession.createdAt),
      playerCount: latestSession.players.length,
    },
    matches: sessionMatches.length,
    topPerformer: topPerformer
      ? {
          user: topPerformer.user,
          matches: topPerformer.matches,
          wins: topPerformer.wins,
          winRate: getWinRate(topPerformer.wins, topPerformer.matches),
          ratingChange: topPerformer.ratingChange,
          pointDifferential: topPerformer.pointDifferential,
        }
      : null,
  };
}

export function buildCommunityPulse({
  members,
  sessions,
  completedMatches,
}: {
  members: CommunityPulseMemberSource[];
  sessions: CommunityPulseSessionSource[];
  completedMatches: CommunityPulseMatchSource[];
}): CommunityPulseSnapshot {
  const activeSessions = getActiveSessions(sessions);
  const completedSessions = getCompletedSessions(sessions);
  const sortedCompletedMatches = getSortedCompletedMatches(completedMatches);
  const recentMatches = sortedCompletedMatches.slice(
    0,
    COMMUNITY_PULSE_RECENT_MATCH_LIMIT
  );
  const activePlayerIds = new Set<string>();

  for (const match of recentMatches) {
    activePlayerIds.add(match.team1User1Id);
    activePlayerIds.add(match.team1User2Id);
    activePlayerIds.add(match.team2User1Id);
    activePlayerIds.add(match.team2User2Id);
  }

  return {
    metrics: {
      members: members.length,
      activeTournaments: activeSessions.length,
      completedTournaments: completedSessions.length,
      recentMatches: recentMatches.length,
      activePlayers: activePlayerIds.size,
    },
    hotPlayers: buildHotPlayers(recentMatches),
    rivalries: buildRivalries(sortedCompletedMatches),
    partnerships: buildPartnerships(sortedCompletedMatches),
    latestStory: buildLatestStory(completedSessions, sortedCompletedMatches),
  };
}
