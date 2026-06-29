import {
  getWeightedRecordScore,
  PREFERRED_CONNECTION_MIN_MATCHES,
} from "./connectionRanking";
import { compareSessionStandings } from "./sessionStandings";

export const PROFILE_RECENT_FORM_MATCH_COUNT = 10;
export const PROFILE_RECENT_SESSION_COUNT = 5;
export const PROFILE_CONNECTION_RANKING_LIMIT = 20;

interface ProfileParticipant {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface ProfileSessionPlayerSource {
  userId: string;
  isGuest?: boolean;
  sessionPoints: number;
  user: ProfileParticipant;
}

interface ProfileSessionMatchSource {
  id: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeam: number | null;
}

export interface ProfileMatchSource {
  id: string;
  completedAt: Date | null;
  session: {
    id: string;
    code: string;
    name: string;
    players?: ProfileSessionPlayerSource[];
    matches?: ProfileSessionMatchSource[];
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

export interface PlayerProfileAchievement {
  id:
    | "strong-start"
    | "clutch-finish"
    | "perfect-session"
    | "clean-sweep"
    | "bounce-back"
    | "close-battle-tested"
    | "narrow-survivor"
    | "dominant-day"
    | "big-differential"
    | "podium-finish"
    | "podium-regular"
    | "podium-mainstay"
    | "podium-legend";
  title: string;
  description: string;
  progress: number;
  target: number;
  progressLabel: string;
  unlocked: boolean;
  earnedFromSession?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface PlayerProfileDerivedData {
  stats: PlayerProfileStatsSummary;
  recentForm: PlayerProfileRecentFormSummary;
  recentSessions: PlayerProfileSessionSummary[];
  trend: PlayerProfileTrendSummary;
  partners: {
    best: PlayerProfileConnectionSummary[];
  };
  opponents: {
    toughest: PlayerProfileConnectionSummary[];
  };
  sessions: {
    latest: PlayerProfileSessionSummary | null;
    best: PlayerProfileSessionSummary | null;
  };
  achievements: PlayerProfileAchievement[];
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

interface SessionAchievementMatch {
  id: string;
  completedAtMs: number;
  result: "WIN" | "LOSS";
  pointDifferential: number;
  scoreDifference: number;
}

interface SessionAchievementSummary {
  id: string;
  code: string;
  name: string;
  latestCompletedAtMs: number;
  matches: SessionAchievementMatch[];
  wins: number;
  losses: number;
  pointDifferential: number;
  podiumRank: number | null;
}

interface AchievementProgress {
  progress: number;
  earnedFromSession?: PlayerProfileAchievement["earnedFromSession"];
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

function clampProgress(value: number, target: number) {
  return Math.min(value, target);
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

function getSessionGuestUserIds(
  session: ProfileMatchSource["session"]
): Set<string> {
  return new Set(
    (session.players ?? [])
      .filter((player) => player.isGuest === true)
      .map((player) => player.userId)
  );
}

function pickPreferredConnections(
  summaries: PlayerProfileConnectionSummary[],
  compare: (
    left: PlayerProfileConnectionSummary,
    right: PlayerProfileConnectionSummary
  ) => number,
  limit = PROFILE_CONNECTION_RANKING_LIMIT
) {
  const candidates =
    summaries.filter(
      (summary) => summary.matches >= PREFERRED_CONNECTION_MIN_MATCHES
    );
  const sortedCandidates = candidates.slice().sort(compare);
  const selected = sortedCandidates.slice(0, limit);

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((summary) => summary.user.id));
    const fillers = summaries
      .filter((summary) => !selectedIds.has(summary.user.id))
      .sort(compare);
    selected.push(...fillers.slice(0, limit - selected.length));
  }

  return selected;
}

function compareBestPartnerConnections(
  left: PlayerProfileConnectionSummary,
  right: PlayerProfileConnectionSummary
) {
  const leftPartnerScore = getWeightedRecordScore(left.wins, left.losses);
  const rightPartnerScore = getWeightedRecordScore(right.wins, right.losses);

  return (
    rightPartnerScore - leftPartnerScore ||
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
  const leftToughness = getWeightedRecordScore(left.losses, left.wins);
  const rightToughness = getWeightedRecordScore(right.losses, right.wins);

  return (
    rightToughness - leftToughness ||
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

function getSessionPodiumRank(
  userId: string,
  session: ProfileMatchSource["session"]
) {
  if (!session.players || session.players.length === 0) {
    return null;
  }

  const sessionMatches = session.matches ?? [];
  const pointDiffByUserId = new Map<string, number>();

  for (const match of sessionMatches) {
    if (
      match.team1Score === null ||
      match.team2Score === null ||
      match.winnerTeam === null
    ) {
      continue;
    }

    const team1Diff = match.team1Score - match.team2Score;
    const team2Diff = match.team2Score - match.team1Score;

    for (const playerId of [match.team1User1Id, match.team1User2Id]) {
      pointDiffByUserId.set(
        playerId,
        (pointDiffByUserId.get(playerId) ?? 0) + team1Diff
      );
    }

    for (const playerId of [match.team2User1Id, match.team2User2Id]) {
      pointDiffByUserId.set(
        playerId,
        (pointDiffByUserId.get(playerId) ?? 0) + team2Diff
      );
    }
  }

  const standings = session.players
    .map((player) => ({
      userId: player.userId,
      name: player.user.name,
      sessionPoints: player.sessionPoints,
      pointDiff: pointDiffByUserId.get(player.userId) ?? 0,
    }))
    .sort(compareSessionStandings);

  const rankIndex = standings.findIndex((entry) => entry.userId === userId);

  return rankIndex >= 0 ? rankIndex + 1 : null;
}

function buildAchievement({
  id,
  title,
  description,
  target,
  progressLabel,
  progress,
  earnedFromSession,
}: Omit<PlayerProfileAchievement, "unlocked">): PlayerProfileAchievement {
  const unlocked = progress >= target;

  return {
    id,
    title,
    description,
    progress: clampProgress(progress, target),
    target,
    progressLabel,
    unlocked,
    earnedFromSession: unlocked ? earnedFromSession : undefined,
  };
}

function getBestSessionProgress(
  sessions: SessionAchievementSummary[],
  getProgress: (session: SessionAchievementSummary) => number
): AchievementProgress {
  let best: AchievementProgress = {
    progress: 0,
  };

  for (const session of sessions) {
    const progress = getProgress(session);

    if (progress > best.progress) {
      best = {
        progress,
        earnedFromSession: {
          id: session.id,
          code: session.code,
          name: session.name,
        },
      };
    }
  }

  return best;
}

function countCompletedSessionPodiums(sessions: SessionAchievementSummary[]) {
  return sessions.filter(
    (session) => session.podiumRank !== null && session.podiumRank <= 3
  ).length;
}

function buildAchievementsFromSessions(
  sessions: SessionAchievementSummary[]
): PlayerProfileAchievement[] {
  const orderedSessions = sessions
    .slice()
    .sort((left, right) => right.latestCompletedAtMs - left.latestCompletedAtMs);
  const strongStart = getBestSessionProgress(orderedSessions, (session) => {
    const firstTwo = session.matches.slice(0, 2);
    return firstTwo.length >= 2 && firstTwo.every((match) => match.result === "WIN")
      ? 2
      : firstTwo.filter((match) => match.result === "WIN").length;
  });
  const clutchFinish = getBestSessionProgress(orderedSessions, (session) => {
    const finalTwo = session.matches.slice(-2);
    return finalTwo.length >= 2 && finalTwo.every((match) => match.result === "WIN")
      ? 2
      : finalTwo.filter((match) => match.result === "WIN").length;
  });
  const perfectSession = getBestSessionProgress(orderedSessions, (session) =>
    session.matches.length >= 3 && session.losses === 0
      ? 3
      : Math.min(session.wins, 2)
  );
  const cleanSweep = getBestSessionProgress(orderedSessions, (session) =>
    session.matches.length >= 5 && session.losses === 0
      ? 5
      : Math.min(session.wins, 4)
  );
  const bounceBack = getBestSessionProgress(orderedSessions, (session) =>
    session.matches[0]?.result === "LOSS" && session.wins > session.losses
      ? 1
      : 0
  );
  const closeBattleTested = getBestSessionProgress(orderedSessions, (session) =>
    session.matches.filter((match) => match.scoreDifference <= 3).length
  );
  const narrowSurvivor = getBestSessionProgress(orderedSessions, (session) =>
    session.matches.filter(
      (match) => match.result === "WIN" && match.scoreDifference <= 2
    ).length
  );
  const dominantDay = getBestSessionProgress(orderedSessions, (session) =>
    session.wins >= 5 && getWinRate(session.wins, session.matches.length) >= 80
      ? 5
      : Math.min(session.wins, 4)
  );
  const bigDifferential = getBestSessionProgress(orderedSessions, (session) =>
    Math.max(0, session.pointDifferential)
  );
  const podiums = countCompletedSessionPodiums(orderedSessions);
  const firstPodiumSession = orderedSessions.find(
    (session) => session.podiumRank !== null && session.podiumRank <= 3
  );
  const podiumEarnedFrom = firstPodiumSession
    ? {
        id: firstPodiumSession.id,
        code: firstPodiumSession.code,
        name: firstPodiumSession.name,
      }
    : undefined;

  return [
    buildAchievement({
      id: "strong-start",
      title: "Strong Start",
      description: "Win your first 2 matches.",
      progressLabel: "wins",
      target: 2,
      ...strongStart,
    }),
    buildAchievement({
      id: "clutch-finish",
      title: "Clutch Finish",
      description: "Win your final 2 matches.",
      progressLabel: "wins",
      target: 2,
      ...clutchFinish,
    }),
    buildAchievement({
      id: "perfect-session",
      title: "Perfect Session",
      description: "Go unbeaten with 3+ matches.",
      progressLabel: "wins",
      target: 3,
      ...perfectSession,
    }),
    buildAchievement({
      id: "podium-finish",
      title: "Podium Finish",
      description: "Finish top 3 once.",
      progressLabel: "podium",
      target: 1,
      progress: podiums,
      earnedFromSession: podiumEarnedFrom,
    }),
    buildAchievement({
      id: "clean-sweep",
      title: "Clean Sweep",
      description: "Win all 5+ matches.",
      progressLabel: "wins",
      target: 5,
      ...cleanSweep,
    }),
    buildAchievement({
      id: "bounce-back",
      title: "Bounce Back",
      description: "Lose first, finish winning.",
      progressLabel: "bounce back",
      target: 1,
      ...bounceBack,
    }),
    buildAchievement({
      id: "close-battle-tested",
      title: "Close Battle Tested",
      description: "Play 3 close matches.",
      progressLabel: "close matches",
      target: 3,
      ...closeBattleTested,
    }),
    buildAchievement({
      id: "narrow-survivor",
      title: "Narrow Survivor",
      description: "Win 2 narrow matches.",
      progressLabel: "narrow wins",
      target: 2,
      ...narrowSurvivor,
    }),
    buildAchievement({
      id: "dominant-day",
      title: "Dominant Day",
      description: "5+ wins, 80%+ win rate.",
      progressLabel: "wins",
      target: 5,
      ...dominantDay,
    }),
    buildAchievement({
      id: "big-differential",
      title: "Big Differential",
      description: "+25 point differential.",
      progressLabel: "point diff",
      target: 25,
      ...bigDifferential,
    }),
    buildAchievement({
      id: "podium-regular",
      title: "Podium Regular",
      description: "Finish top 3 three times.",
      progressLabel: "podiums",
      target: 3,
      progress: podiums,
      earnedFromSession: podiumEarnedFrom,
    }),
    buildAchievement({
      id: "podium-mainstay",
      title: "Podium Mainstay",
      description: "Finish top 3 five times.",
      progressLabel: "podiums",
      target: 5,
      progress: podiums,
      earnedFromSession: podiumEarnedFrom,
    }),
    buildAchievement({
      id: "podium-legend",
      title: "Podium Legend",
      description: "Finish top 3 ten times.",
      progressLabel: "podiums",
      target: 10,
      progress: podiums,
      earnedFromSession: podiumEarnedFrom,
    }),
  ];
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
  const achievementSessionAggregates = new Map<
    string,
    SessionAchievementSummary
  >();
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
    const scoreDifference = Math.abs(myScore - opponentScore);
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
    const sessionGuestUserIds = getSessionGuestUserIds(match.session);

    if (result === "WIN") {
      wins += 1;
    }

    pointsScored += myScore;
    pointsConceded += opponentScore;

    if (!sessionGuestUserIds.has(partner.id)) {
      updateConnectionAggregate(partnerAggregates, partner, {
        result,
        pointDifferential,
        ratingChange,
      });
    }

    for (const opponent of opponents) {
      if (sessionGuestUserIds.has(opponent.id)) continue;

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

    const existingAchievementSession =
      achievementSessionAggregates.get(match.session.id) ?? {
        id: match.session.id,
        code: match.session.code,
        name: match.session.name,
        latestCompletedAtMs: 0,
        matches: [],
        wins: 0,
        losses: 0,
        pointDifferential: 0,
        podiumRank: getSessionPodiumRank(userId, match.session),
      };

    existingAchievementSession.latestCompletedAtMs = Math.max(
      existingAchievementSession.latestCompletedAtMs,
      getTimeOrZero(match.completedAt)
    );
    existingAchievementSession.matches.push({
      id: match.id,
      completedAtMs: getTimeOrZero(match.completedAt),
      result,
      pointDifferential,
      scoreDifference,
    });
    existingAchievementSession.pointDifferential += pointDifferential;

    if (result === "WIN") {
      existingAchievementSession.wins += 1;
    } else {
      existingAchievementSession.losses += 1;
    }

    achievementSessionAggregates.set(
      match.session.id,
      existingAchievementSession
    );

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
  const achievementSessions = [...achievementSessionAggregates.values()].map(
    (session) => ({
      ...session,
      matches: session.matches
        .slice()
        .sort((left, right) => left.completedAtMs - right.completedAtMs),
    })
  );
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
      best: pickPreferredConnections(
        partnerSummaries,
        compareBestPartnerConnections
      ),
    },
    opponents: {
      toughest: pickPreferredConnections(
        opponentSummaries,
        compareToughestOpponents
      ),
    },
    sessions: {
      latest: recentSessions[0] ?? null,
      best: sessionSummaries.slice().sort(compareBestSessions)[0] ?? null,
    },
    achievements: buildAchievementsFromSessions(achievementSessions),
    matchHistory,
  };
}
