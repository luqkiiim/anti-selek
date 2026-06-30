import {
  getWeightedRecordScore,
  PREFERRED_CONNECTION_MIN_MATCHES,
} from "./connectionRanking";

export const COMMUNITY_PULSE_RECENT_MATCH_LIMIT = 24;

type MatchResult = "WIN" | "LOSS";

export interface ClubPulseParticipant {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ClubPulseMemberSource extends ClubPulseParticipant {
  elo: number;
}

export interface ClubPulseSessionSource {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  isTest: boolean;
  createdAt: Date | string;
  endedAt?: Date | string | null;
  players: Array<{
    isGuest?: boolean;
    user: ClubPulseParticipant;
  }>;
}

export interface ClubPulseMatchSource {
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
  team1User1: ClubPulseParticipant;
  team1User2: ClubPulseParticipant;
  team2User1: ClubPulseParticipant;
  team2User2: ClubPulseParticipant;
  team1Score: number | null;
  team2Score: number | null;
  team1EloChange: number | null;
  team2EloChange: number | null;
  eloAdjustments?: Array<{
    userId: string;
    delta: number;
    beforeElo: number;
    afterElo: number;
  }>;
}

export interface ClubPulseHotPlayer {
  user: ClubPulseParticipant;
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

export interface ClubPulseRivalry {
  players: [ClubPulseParticipant, ClubPulseParticipant];
  matches: number;
  playerOneWins: number;
  playerTwoWins: number;
  lastPlayedAt: string | null;
  lastSession: {
    code: string;
    name: string;
  } | null;
}

export interface ClubPulsePartnership {
  players: [ClubPulseParticipant, ClubPulseParticipant];
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

export interface ClubPulseLatestStory {
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
    user: ClubPulseParticipant;
    matches: number;
    wins: number;
    winRate: number;
    ratingChange: number;
    pointDifferential: number;
  } | null;
}

export type ClubPulseNewsType =
  | "RATING_JUMP"
  | "PERFECT_SESSION"
  | "UPSET"
  | "STREAK_EXTENDED"
  | "BOUNCE_BACK"
  | "NEW_PEAK";

export interface ClubPulseNewsItem {
  id: string;
  type: ClubPulseNewsType;
  session: {
    id: string;
    code: string;
    name: string;
    date: string | null;
  };
  title: string;
  detail: string;
  value: string;
  players: ClubPulseParticipant[];
  featuredPlayers: ClubPulseParticipant[];
  likeCount: number;
  likedByMe: boolean;
}

export interface ClubPulseRecentMatch {
  id: string;
  completedAt: string | null;
  session: {
    id: string;
    code: string;
    name: string;
  };
  team1: ClubPulseParticipant[];
  team2: ClubPulseParticipant[];
  team1Score: number | null;
  team2Score: number | null;
  winnerTeam: number | null;
}

export interface ClubPulseSnapshot {
  metrics: {
    members: number;
    activeTournaments: number;
    completedTournaments: number;
    recentMatches: number;
    activePlayers: number;
    totalMatches: number;
    totalSessions: number;
    lastPlayedAt: string | null;
  };
  hotPlayers: ClubPulseHotPlayer[];
  ratingMovers: ClubPulseHotPlayer[];
  rivalries: ClubPulseRivalry[];
  partnerships: ClubPulsePartnership[];
  recentMatches: ClubPulseRecentMatch[];
  sessionNews: ClubPulseNewsItem[];
  latestStory: ClubPulseLatestStory | null;
}

interface HotPlayerAggregate {
  user: ClubPulseParticipant;
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
  players: [ClubPulseParticipant, ClubPulseParticipant];
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
  players: [ClubPulseParticipant, ClubPulseParticipant];
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
  user: ClubPulseParticipant;
  matches: number;
  wins: number;
  ratingChange: number;
  pointDifferential: number;
}

interface SessionPlayerAggregate {
  user: ClubPulseParticipant;
  matches: number;
  wins: number;
  losses: number;
  ratingChange: number;
  pointDifferential: number;
  maxAfterElo: number | null;
}

interface SessionNewsLikeState {
  likeCount: number;
  likedByMe: boolean;
}

type GuestIdsBySessionId = Map<string, Set<string>>;

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

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function getMatchAdjustment(match: ClubPulseMatchSource, userId: string) {
  return match.eloAdjustments?.find(
    (adjustment) => adjustment.userId === userId
  );
}

function getMatchRatingChange(
  match: ClubPulseMatchSource,
  userId: string,
  team: 1 | 2
) {
  return (
    getMatchAdjustment(match, userId)?.delta ??
    (team === 1 ? match.team1EloChange : match.team2EloChange) ??
    0
  );
}

function getTeamBeforeElo(
  match: ClubPulseMatchSource,
  team: ClubPulseParticipant[]
) {
  let total = 0;

  for (const player of team) {
    const beforeElo = getMatchAdjustment(match, player.id)?.beforeElo;
    if (typeof beforeElo !== "number") {
      return null;
    }
    total += beforeElo;
  }

  return total;
}

function getCompletedSessions(sessions: ClubPulseSessionSource[]) {
  return sessions
    .filter((session) => !session.isTest && session.status === "COMPLETED")
    .sort(
      (left, right) =>
        getTime(right.endedAt ?? right.createdAt) -
        getTime(left.endedAt ?? left.createdAt)
    );
}

function getActiveSessions(sessions: ClubPulseSessionSource[]) {
  return sessions.filter(
    (session) => !session.isTest && session.status !== "COMPLETED"
  );
}

function getSortedCompletedMatches(matches: ClubPulseMatchSource[]) {
  return matches
    .filter((match) => match.winnerTeam === 1 || match.winnerTeam === 2)
    .slice()
    .sort(
      (left, right) =>
        getTime(right.completedAt) - getTime(left.completedAt) ||
        left.id.localeCompare(right.id)
    );
}

function getMatchTeams(match: ClubPulseMatchSource) {
  return {
    team1: [match.team1User1, match.team1User2],
    team2: [match.team2User1, match.team2User2],
  };
}

function getGuestIdsBySessionId(
  sessions: ClubPulseSessionSource[]
): GuestIdsBySessionId {
  const guestIdsBySessionId = new Map<string, Set<string>>();

  for (const session of sessions) {
    const guestIds = new Set<string>();

    for (const player of session.players) {
      if (player.isGuest === true) {
        guestIds.add(player.user.id);
      }
    }

    guestIdsBySessionId.set(session.id, guestIds);
  }

  return guestIdsBySessionId;
}

function isMatchGuest(
  guestIdsBySessionId: GuestIdsBySessionId,
  match: ClubPulseMatchSource,
  userId: string
) {
  return guestIdsBySessionId.get(match.session.id)?.has(userId) === true;
}

function isTeamGuestFree(
  guestIdsBySessionId: GuestIdsBySessionId,
  match: ClubPulseMatchSource,
  team: ClubPulseParticipant[]
) {
  return team.every(
    (player) => !isMatchGuest(guestIdsBySessionId, match, player.id)
  );
}

function updateHotPlayer(
  aggregates: Map<string, HotPlayerAggregate>,
  user: ClubPulseParticipant,
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

function buildHotPlayers(
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const aggregates = new Map<string, HotPlayerAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    for (const player of team1) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;

      updateHotPlayer(aggregates, player, {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
        ratingChange: getMatchRatingChange(match, player.id, 1),
      });
    }

    for (const player of team2) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;

      updateHotPlayer(aggregates, player, {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
        ratingChange: getMatchRatingChange(match, player.id, 2),
      });
    }
  }

  return Array.from(aggregates.values())
    .map((aggregate): ClubPulseHotPlayer => {
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
  left: ClubPulseParticipant,
  right: ClubPulseParticipant
) {
  return [left.id, right.id].sort().join(":");
}

function getOrderedPairPlayers(
  left: ClubPulseParticipant,
  right: ClubPulseParticipant
): [ClubPulseParticipant, ClubPulseParticipant] {
  return left.id.localeCompare(right.id) <= 0 ? [left, right] : [right, left];
}

function selectUniquePlayerPairs<
  T extends {
    players: [ClubPulseParticipant, ClubPulseParticipant];
  },
>(pairs: T[], limit = 20) {
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

    if (selected.length === limit) {
      break;
    }
  }

  return selected;
}

function updateRivalry(
  aggregates: Map<string, RivalryAggregate>,
  left: ClubPulseParticipant,
  right: ClubPulseParticipant,
  winnerIds: Set<string>,
  match: ClubPulseMatchSource
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

function getRivalryWinDifference(rivalry: RivalryAggregate) {
  return Math.abs(rivalry.playerOneWins - rivalry.playerTwoWins);
}

function getRivalryStrength(rivalry: RivalryAggregate) {
  if (rivalry.matches <= 0) return 0;

  return (
    Math.sqrt(rivalry.matches) *
    (1 - getRivalryWinDifference(rivalry) / rivalry.matches)
  );
}

function buildRivalries(
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const aggregates = new Map<string, RivalryAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const eligibleTeam1 = team1.filter(
      (player) => !isMatchGuest(guestIdsBySessionId, match, player.id)
    );
    const eligibleTeam2 = team2.filter(
      (player) => !isMatchGuest(guestIdsBySessionId, match, player.id)
    );
    const winnerIds = new Set(
      match.winnerTeam === 1
        ? [match.team1User1Id, match.team1User2Id]
        : [match.team2User1Id, match.team2User2Id]
    );

    for (const team1Player of eligibleTeam1) {
      for (const team2Player of eligibleTeam2) {
        updateRivalry(aggregates, team1Player, team2Player, winnerIds, match);
      }
    }
  }

  return selectUniquePlayerPairs(
    Array.from(aggregates.values())
    .filter((rivalry) => rivalry.matches >= 2)
    .sort(
      (left, right) =>
        getRivalryStrength(right) - getRivalryStrength(left) ||
        right.matches - left.matches ||
        getRivalryWinDifference(left) - getRivalryWinDifference(right) ||
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
  left: ClubPulseParticipant,
  right: ClubPulseParticipant,
  {
    result,
    pointDifferential,
  }: {
    result: MatchResult;
    pointDifferential: number;
  },
  match: ClubPulseMatchSource
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

function buildPartnerships(
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const aggregates = new Map<string, PartnershipAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    if (isTeamGuestFree(guestIdsBySessionId, match, team1)) {
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
    }

    if (isTeamGuestFree(guestIdsBySessionId, match, team2)) {
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
  user: ClubPulseParticipant,
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
  completedSessions: ClubPulseSessionSource[],
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
): ClubPulseLatestStory | null {
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
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;

      updateLatestStoryAggregate(aggregates, player, {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
        ratingChange: getMatchRatingChange(match, player.id, 1),
      });
    }

    for (const player of team2) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;

      updateLatestStoryAggregate(aggregates, player, {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
        ratingChange: getMatchRatingChange(match, player.id, 2),
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
      playerCount: latestSession.players.filter(
        (player) => player.isGuest !== true
      ).length,
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

function buildRecentMatches(matches: ClubPulseMatchSource[]) {
  return matches.slice(0, 5).map((match): ClubPulseRecentMatch => {
    const { team1, team2 } = getMatchTeams(match);

    return {
      id: match.id,
      completedAt: toIsoString(match.completedAt),
      session: {
        id: match.session.id,
        code: match.session.code,
        name: match.session.name,
      },
      team1,
      team2,
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      winnerTeam: match.winnerTeam,
    };
  });
}

function createSessionNewsItem({
  type,
  latestSession,
  title,
  detail,
  value,
  players,
  featuredPlayers = players,
}: {
  type: ClubPulseNewsType;
  latestSession: ClubPulseSessionSource;
  title: string;
  detail: string;
  value: string;
  players: ClubPulseParticipant[];
  featuredPlayers?: ClubPulseParticipant[];
}): ClubPulseNewsItem {
  const playerKey = players
    .map((player) => player.id)
    .sort()
    .join("-");

  return {
    id: `${latestSession.id}:${type.toLowerCase()}:${playerKey}`,
    type,
    session: {
      id: latestSession.id,
      code: latestSession.code,
      name: latestSession.name,
      date: toIsoString(latestSession.endedAt ?? latestSession.createdAt),
    },
    title,
    detail,
    value,
    players,
    featuredPlayers,
    likeCount: 0,
    likedByMe: false,
  };
}

function updateSessionAggregate(
  aggregates: Map<string, SessionPlayerAggregate>,
  user: ClubPulseParticipant,
  {
    result,
    pointDifferential,
    ratingChange,
    afterElo,
  }: {
    result: MatchResult;
    pointDifferential: number;
    ratingChange: number;
    afterElo: number | null;
  }
) {
  const aggregate = aggregates.get(user.id) ?? {
    user,
    matches: 0,
    wins: 0,
    losses: 0,
    ratingChange: 0,
    pointDifferential: 0,
    maxAfterElo: null,
  };

  aggregate.matches += 1;
  aggregate.ratingChange += ratingChange;
  aggregate.pointDifferential += pointDifferential;
  if (result === "WIN") {
    aggregate.wins += 1;
  } else {
    aggregate.losses += 1;
  }
  if (afterElo !== null) {
    aggregate.maxAfterElo =
      aggregate.maxAfterElo === null
        ? afterElo
        : Math.max(aggregate.maxAfterElo, afterElo);
  }

  aggregates.set(user.id, aggregate);
}

function buildSessionAggregates(
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const aggregates = new Map<string, SessionPlayerAggregate>();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    const team1Result = match.winnerTeam === 1 ? "WIN" : "LOSS";
    const team2Result = match.winnerTeam === 2 ? "WIN" : "LOSS";

    for (const player of team1) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;
      updateSessionAggregate(aggregates, player, {
        result: team1Result,
        pointDifferential: team1Score - team2Score,
        ratingChange: getMatchRatingChange(match, player.id, 1),
        afterElo: getMatchAdjustment(match, player.id)?.afterElo ?? null,
      });
    }

    for (const player of team2) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;
      updateSessionAggregate(aggregates, player, {
        result: team2Result,
        pointDifferential: team2Score - team1Score,
        ratingChange: getMatchRatingChange(match, player.id, 2),
        afterElo: getMatchAdjustment(match, player.id)?.afterElo ?? null,
      });
    }
  }

  return aggregates;
}

function sortSessionAggregatesByImpact(
  left: SessionPlayerAggregate,
  right: SessionPlayerAggregate
) {
  return (
    right.ratingChange - left.ratingChange ||
    right.wins - left.wins ||
    right.pointDifferential - left.pointDifferential ||
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    })
  );
}

function buildRatingMovers(
  completedSessions: ClubPulseSessionSource[],
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const latestSession = completedSessions[0];
  if (!latestSession) return [];

  const latestMatches = matches.filter(
    (match) => match.session.id === latestSession.id
  );

  return Array.from(
    buildSessionAggregates(latestMatches, guestIdsBySessionId).values()
  )
    .filter((aggregate) => aggregate.ratingChange > 0)
    .sort(sortSessionAggregatesByImpact)
    .map((aggregate): ClubPulseHotPlayer => ({
      user: aggregate.user,
      matches: aggregate.matches,
      wins: aggregate.wins,
      losses: aggregate.losses,
      winRate: getWinRate(aggregate.wins, aggregate.matches),
      ratingChange: aggregate.ratingChange,
      pointDifferential: aggregate.pointDifferential,
      currentStreak: {
        result: null,
        count: 0,
      },
      heatScore: aggregate.ratingChange,
    }))
    .slice(0, 3);
}

function getCurrentStreaks(
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const streaks = new Map<
    string,
    {
      user: ClubPulseParticipant;
      result: MatchResult | null;
      count: number;
      open: boolean;
    }
  >();

  for (const match of matches) {
    const { team1, team2 } = getMatchTeams(match);
    const playerResults: Array<{
      player: ClubPulseParticipant;
      result: MatchResult;
    }> = [
      ...team1.map((player) => ({
        player,
        result: match.winnerTeam === 1 ? "WIN" as const : "LOSS" as const,
      })),
      ...team2.map((player) => ({
        player,
        result: match.winnerTeam === 2 ? "WIN" as const : "LOSS" as const,
      })),
    ];

    for (const { player, result } of playerResults) {
      if (isMatchGuest(guestIdsBySessionId, match, player.id)) continue;

      const streak = streaks.get(player.id) ?? {
        user: player,
        result: null,
        count: 0,
        open: true,
      };

      if (streak.open) {
        if (streak.result === null) {
          streak.result = result;
          streak.count = 1;
        } else if (streak.result === result) {
          streak.count += 1;
        } else {
          streak.open = false;
        }
      }

      streaks.set(player.id, streak);
    }
  }

  return streaks;
}

function getPreviousSessionAggregate(
  userId: string,
  latestSessionId: string,
  completedSessions: ClubPulseSessionSource[],
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  for (const session of completedSessions) {
    if (session.id === latestSessionId) continue;

    const aggregate = buildSessionAggregates(
      matches.filter((match) => match.session.id === session.id),
      guestIdsBySessionId
    ).get(userId);

    if (aggregate) return aggregate;
  }

  return null;
}

function getHistoricalPeakBeforeLatestSession(
  userId: string,
  latestSessionId: string,
  matches: ClubPulseMatchSource[]
) {
  let peak: number | null = null;

  for (const match of matches) {
    if (match.session.id === latestSessionId) continue;

    const afterElo = getMatchAdjustment(match, userId)?.afterElo;
    if (typeof afterElo !== "number") continue;

    peak = peak === null ? afterElo : Math.max(peak, afterElo);
  }

  return peak;
}

function buildSessionNews(
  completedSessions: ClubPulseSessionSource[],
  matches: ClubPulseMatchSource[],
  guestIdsBySessionId: GuestIdsBySessionId
) {
  const latestSession = completedSessions[0];
  if (!latestSession) return [];

  const latestMatches = matches.filter(
    (match) => match.session.id === latestSession.id
  );
  if (latestMatches.length === 0) return [];

  const latestAggregates = Array.from(
    buildSessionAggregates(latestMatches, guestIdsBySessionId).values()
  );
  const latestPlayerIds = new Set(
    latestAggregates.map((aggregate) => aggregate.user.id)
  );
  const news: ClubPulseNewsItem[] = [];

  const biggestJump =
    latestAggregates
      .filter((aggregate) => aggregate.ratingChange > 0)
      .sort(sortSessionAggregatesByImpact)[0] ?? null;
  if (biggestJump) {
    news.push(
      createSessionNewsItem({
        type: "RATING_JUMP",
        latestSession,
        title: biggestJump.user.name,
        detail: "Biggest rating jump",
        value: `${formatSigned(biggestJump.ratingChange)} rating`,
        players: [biggestJump.user],
      })
    );
  }

  const perfectSession =
    latestAggregates
      .filter(
        (aggregate) =>
          aggregate.matches >= 2 && aggregate.wins === aggregate.matches
      )
      .sort(
        (left, right) =>
          right.wins - left.wins ||
          sortSessionAggregatesByImpact(left, right)
      )[0] ?? null;
  if (perfectSession) {
    news.push(
      createSessionNewsItem({
        type: "PERFECT_SESSION",
        latestSession,
        title: perfectSession.user.name,
        detail: "Perfect session",
        value: `${perfectSession.wins}W/0L`,
        players: [perfectSession.user],
      })
    );
  }

  const upset = latestMatches
    .map((match) => {
      const { team1, team2 } = getMatchTeams(match);
      if (
        !isTeamGuestFree(guestIdsBySessionId, match, team1) ||
        !isTeamGuestFree(guestIdsBySessionId, match, team2)
      ) {
        return null;
      }

      const team1Before = getTeamBeforeElo(match, team1);
      const team2Before = getTeamBeforeElo(match, team2);
      if (team1Before === null || team2Before === null) return null;

      const winningTeam = match.winnerTeam === 1 ? team1 : team2;
      const losingTeam = match.winnerTeam === 1 ? team2 : team1;
      const winningBefore = match.winnerTeam === 1 ? team1Before : team2Before;
      const losingBefore = match.winnerTeam === 1 ? team2Before : team1Before;
      const gap = losingBefore - winningBefore;

      if (gap < 100) return null;

      return {
        match,
        gap,
        winningTeam,
        losingTeam,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.gap - left.gap)[0] ?? null;
  if (upset) {
    news.push(
      createSessionNewsItem({
        type: "UPSET",
        latestSession,
        title: upset.winningTeam.map((player) => player.name).join(" / "),
        detail: "Beat higher-rated side",
        value: `${formatSigned(upset.gap)} gap`,
        players: [...upset.winningTeam, ...upset.losingTeam],
        featuredPlayers: upset.winningTeam,
      })
    );
  }

  const streak =
    Array.from(getCurrentStreaks(matches, guestIdsBySessionId).values())
      .filter(
        (item) =>
          item.result === "WIN" &&
          item.count >= 3 &&
          latestPlayerIds.has(item.user.id)
      )
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.user.name.localeCompare(right.user.name, undefined, {
            sensitivity: "base",
          })
      )[0] ?? null;
  if (streak) {
    news.push(
      createSessionNewsItem({
        type: "STREAK_EXTENDED",
        latestSession,
        title: streak.user.name,
        detail: "Win streak extended",
        value: `W${streak.count}`,
        players: [streak.user],
      })
    );
  }

  const bounceBack =
    latestAggregates
      .map((aggregate) => ({
        latest: aggregate,
        previous: getPreviousSessionAggregate(
          aggregate.user.id,
          latestSession.id,
          completedSessions,
          matches,
          guestIdsBySessionId
        ),
      }))
      .filter(
        ({ latest, previous }) =>
          previous !== null &&
          previous.wins === 0 &&
          previous.losses >= 2 &&
          latest.wins >= 2
      )
      .sort((left, right) =>
        sortSessionAggregatesByImpact(left.latest, right.latest)
      )[0] ?? null;
  if (bounceBack) {
    news.push(
      createSessionNewsItem({
        type: "BOUNCE_BACK",
        latestSession,
        title: bounceBack.latest.user.name,
        detail: `Bounced back from 0W/${bounceBack.previous!.losses}L`,
        value: `${bounceBack.latest.wins}W/${bounceBack.latest.losses}L`,
        players: [bounceBack.latest.user],
      })
    );
  }

  const newPeak =
    latestAggregates
      .map((aggregate) => ({
        aggregate,
        previousPeak: getHistoricalPeakBeforeLatestSession(
          aggregate.user.id,
          latestSession.id,
          matches
        ),
      }))
      .filter(
        ({ aggregate, previousPeak }) =>
          aggregate.maxAfterElo !== null &&
          previousPeak !== null &&
          aggregate.maxAfterElo > previousPeak
      )
      .sort(
        (left, right) =>
          (right.aggregate.maxAfterElo ?? 0) -
            (left.aggregate.maxAfterElo ?? 0) ||
          sortSessionAggregatesByImpact(left.aggregate, right.aggregate)
      )[0] ?? null;
  if (newPeak) {
    news.push(
      createSessionNewsItem({
        type: "NEW_PEAK",
        latestSession,
        title: newPeak.aggregate.user.name,
        detail: "New peak rating",
        value: `${newPeak.aggregate.maxAfterElo}`,
        players: [newPeak.aggregate.user],
      })
    );
  }

  return news;
}

export function applyClubPulseNewsLikes(
  pulse: ClubPulseSnapshot,
  likeStateByNewsItemId: Map<string, SessionNewsLikeState>
): ClubPulseSnapshot {
  return {
    ...pulse,
    sessionNews: pulse.sessionNews.map((item) => {
      const likeState = likeStateByNewsItemId.get(item.id);
      if (!likeState) return item;

      return {
        ...item,
        likeCount: likeState.likeCount,
        likedByMe: likeState.likedByMe,
      };
    }),
  };
}

export function buildClubPulse({
  members,
  sessions,
  completedMatches,
}: {
  members: ClubPulseMemberSource[];
  sessions: ClubPulseSessionSource[];
  completedMatches: ClubPulseMatchSource[];
}): ClubPulseSnapshot {
  const activeSessions = getActiveSessions(sessions);
  const completedSessions = getCompletedSessions(sessions);
  const guestIdsBySessionId = getGuestIdsBySessionId(sessions);
  const sortedCompletedMatches = getSortedCompletedMatches(completedMatches);
  const recentMatches = sortedCompletedMatches.slice(
    0,
    COMMUNITY_PULSE_RECENT_MATCH_LIMIT
  );
  const activePlayerIds = new Set<string>();

  for (const match of recentMatches) {
    for (const playerId of [
      match.team1User1Id,
      match.team1User2Id,
      match.team2User1Id,
      match.team2User2Id,
    ]) {
      if (!isMatchGuest(guestIdsBySessionId, match, playerId)) {
        activePlayerIds.add(playerId);
      }
    }
  }

  return {
    metrics: {
      members: members.length,
      activeTournaments: activeSessions.length,
      completedTournaments: completedSessions.length,
      recentMatches: recentMatches.length,
      activePlayers: activePlayerIds.size,
      totalMatches: sortedCompletedMatches.length,
      totalSessions: completedSessions.length + activeSessions.length,
      lastPlayedAt: toIsoString(sortedCompletedMatches[0]?.completedAt),
    },
    hotPlayers: buildHotPlayers(recentMatches, guestIdsBySessionId),
    ratingMovers: buildRatingMovers(
      completedSessions,
      sortedCompletedMatches,
      guestIdsBySessionId
    ),
    rivalries: buildRivalries(sortedCompletedMatches, guestIdsBySessionId),
    partnerships: buildPartnerships(
      sortedCompletedMatches,
      guestIdsBySessionId
    ),
    recentMatches: buildRecentMatches(sortedCompletedMatches),
    sessionNews: buildSessionNews(
      completedSessions,
      sortedCompletedMatches,
      guestIdsBySessionId
    ),
    latestStory: buildLatestStory(
      completedSessions,
      sortedCompletedMatches,
      guestIdsBySessionId
    ),
  };
}
