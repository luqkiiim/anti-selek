import {
  getWeightedRecordScore,
  PREFERRED_CONNECTION_MIN_MATCHES,
} from "./connectionRanking";
import {
  buildPlayerProfileDerivedData,
  type PlayerProfileMatchHistoryEntry,
  type PlayerProfileSessionSummary,
  type ProfileMatchSource,
} from "./profileStats";

export interface MemberProfileTimelineEntry {
  id: string;
  kind: "SESSION" | "MANUAL" | "ACTIVE" | "GAP";
  date: string | null;
  rating: number | null;
  delta: number | null;
  sessionId?: string;
  sessionCode?: string;
  label: string;
  /** Present on every exact session point, including points outside history.items. */
  session?: PlayerProfileSessionSummary;
}

export interface MemberProfileSessionSource {
  id: string;
  code: string;
  name: string;
  status?: string | null;
  isTest?: boolean;
  type?: string | null;
  createdAt?: Date | string | null;
  endedAt?: Date | string | null;
  players?: Array<{ userId: string; isGuest?: boolean }>;
}

export interface MemberProfileRatingAdjustmentSource {
  id: string;
  userId?: string;
  beforeElo: number;
  afterElo: number;
  delta?: number | null;
  createdAt: Date | string | null;
  reason?: string | null;
}

export interface MemberProfileMatchEloAdjustmentSource
  extends MemberProfileRatingAdjustmentSource {
  matchId: string;
  clubId?: string;
}

export interface MemberProfileMatchSource extends ProfileMatchSource {
  session: ProfileMatchSource["session"] & {
    status?: string | null;
    isTest?: boolean;
    type?: string | null;
    createdAt?: Date | string | null;
    endedAt?: Date | string | null;
  };
  eloAdjustments?: MemberProfileMatchEloAdjustmentSource[];
}

export type RecordedSessionSummary = PlayerProfileSessionSummary & { ratingVerified?: boolean };

export interface MemberProfileData {
  latestSession: RecordedSessionSummary | null;
  recentForm: PlayerProfileMatchHistoryEntry[];
  timeline: MemberProfileTimelineEntry[];
  records: {
    highestRating: { value: number; date: string | null } | null;
    longestStreak: {
      value: number;
      date: string | null;
      sessionCode?: string;
    } | null;
    bestSession: PlayerProfileSessionSummary | null;
  };
  history: {
    items: RecordedSessionSummary[];
    hasMore: boolean;
    nextOffset: number | null;
  };
  matchHistory: PlayerProfileMatchHistoryEntry[];
  relationships: {
    partner: {
      id: string;
      name: string;
      avatarUrl?: string | null;
      matches: number;
      wins: number;
      losses: number;
    } | null;
    rival: {
      id: string;
      name: string;
      avatarUrl?: string | null;
      wins: number;
      losses: number;
    } | null;
  };
}

export interface BuildMemberProfileInput {
  userId: string;
  memberStatus?: string | null;
  currentCoreMemberIds?: Iterable<string>;
  matches: MemberProfileMatchSource[];
  sessions?: MemberProfileSessionSource[];
  matchEloAdjustments?: MemberProfileMatchEloAdjustmentSource[];
  manualRatingAdjustments?: MemberProfileRatingAdjustmentSource[];
  derivedData?: ReturnType<typeof buildPlayerProfileDerivedData>;
  historyOffset?: number;
  historyLimit?: number;
}

type Participant = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

interface ConnectionAggregate {
  participant: Participant;
  matches: number;
  wins: number;
  losses: number;
  pointDifferential: number;
  lastPlayedAtMs: number;
}

function asTime(value: Date | string | null | undefined) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function asIso(value: Date | string | null | undefined) {
  const time = asTime(value);
  return time > 0 ? new Date(time).toISOString() : null;
}

function sessionDate(session: MemberProfileSessionSource) {
  return asIso(session.endedAt ?? session.createdAt);
}

function getGuests(session: MemberProfileSessionSource | MemberProfileMatchSource["session"]) {
  return new Set(
    (session.players ?? [])
      .filter((player) => player.isGuest === true)
      .map((player) => player.userId)
  );
}

function getMatchAdjustment(
  match: MemberProfileMatchSource,
  userId: string,
  allAdjustments: MemberProfileMatchEloAdjustmentSource[]
) {
  return (
    match.eloAdjustments?.find((entry) => entry.userId === userId) ??
    allAdjustments.find(
      (entry) => entry.matchId === match.id && entry.userId === userId
    )
  );
}

function makeConnection(
  aggregate: ConnectionAggregate
): NonNullable<MemberProfileData["relationships"]["partner"]> {
  return {
    id: aggregate.participant.id,
    name: aggregate.participant.name,
    avatarUrl: aggregate.participant.avatarUrl,
    matches: aggregate.matches,
    wins: aggregate.wins,
    losses: aggregate.losses,
  };
}

function compareConnectionNames(left: ConnectionAggregate, right: ConnectionAggregate) {
  return left.participant.name.localeCompare(right.participant.name, undefined, {
    sensitivity: "base",
  });
}

function buildRelationships(
  userId: string,
  matches: MemberProfileMatchSource[],
  currentCoreMemberIds: Set<string>
) {
  const partners = new Map<string, ConnectionAggregate>();
  const rivals = new Map<string, ConnectionAggregate>();

  for (const match of matches) {
    if (match.winnerTeam !== 1 && match.winnerTeam !== 2) continue;
    if (
      match.session.isTest ||
      (match.session.status && match.session.status !== "COMPLETED")
    ) {
      continue;
    }
    const guestIds = getGuests(match.session);
    if (guestIds.has(userId)) continue;

    const isTeam1 =
      match.team1User1Id === userId || match.team1User2Id === userId;
    if (!isTeam1 && match.team2User1Id !== userId && match.team2User2Id !== userId) {
      continue;
    }

    const myTeam = isTeam1 ? 1 : 2;
    const won = match.winnerTeam === myTeam;
    const myScore = isTeam1 ? match.team1Score ?? 0 : match.team2Score ?? 0;
    const theirScore = isTeam1 ? match.team2Score ?? 0 : match.team1Score ?? 0;
    const pointDifferential = myScore - theirScore;
    const dateMs = asTime(match.completedAt);
    const partnerId = isTeam1
      ? match.team1User1Id === userId
        ? match.team1User2Id
        : match.team1User1Id
      : match.team2User1Id === userId
        ? match.team2User2Id
        : match.team2User1Id;
    const partner = isTeam1
      ? match.team1User1Id === userId
        ? match.team1User2
        : match.team1User1
      : match.team2User1Id === userId
        ? match.team2User2
        : match.team2User1;

    const opponents = isTeam1
      ? [
          [match.team2User1Id, match.team2User1],
          [match.team2User2Id, match.team2User2],
        ]
      : [
          [match.team1User1Id, match.team1User1],
          [match.team1User2Id, match.team1User2],
        ];

    if (
      partnerId !== userId &&
      currentCoreMemberIds.has(partnerId) &&
      !guestIds.has(partnerId)
    ) {
      const aggregate = partners.get(partnerId) ?? {
        participant: partner,
        matches: 0,
        wins: 0,
        losses: 0,
        pointDifferential: 0,
        lastPlayedAtMs: 0,
      };
      aggregate.matches += 1;
      if (won) aggregate.wins += 1;
      else aggregate.losses += 1;
      aggregate.pointDifferential += pointDifferential;
      aggregate.lastPlayedAtMs = Math.max(aggregate.lastPlayedAtMs, dateMs);
      partners.set(partnerId, aggregate);
    }

    for (const [opponentId, opponent] of opponents as Array<[string, Participant]>) {
      if (
        opponentId === userId ||
        !currentCoreMemberIds.has(opponentId) ||
        guestIds.has(opponentId)
      ) {
        continue;
      }
      const aggregate = rivals.get(opponentId) ?? {
        participant: opponent,
        matches: 0,
        wins: 0,
        losses: 0,
        pointDifferential: 0,
        lastPlayedAtMs: 0,
      };
      aggregate.matches += 1;
      if (won) aggregate.wins += 1;
      else aggregate.losses += 1;
      aggregate.pointDifferential += pointDifferential;
      aggregate.lastPlayedAtMs = Math.max(aggregate.lastPlayedAtMs, dateMs);
      rivals.set(opponentId, aggregate);
    }
  }

  const partner = [...partners.values()]
    .filter((entry) => entry.matches >= PREFERRED_CONNECTION_MIN_MATCHES)
    .sort(
      (left, right) =>
        getWeightedRecordScore(right.wins, right.losses) -
          getWeightedRecordScore(left.wins, left.losses) ||
        right.matches - left.matches ||
        right.pointDifferential - left.pointDifferential ||
        right.lastPlayedAtMs - left.lastPlayedAtMs ||
        compareConnectionNames(left, right)
    )[0];

  const rival = [...rivals.values()]
    .filter((entry) => entry.matches >= 2)
    .sort(
      (left, right) =>
        Math.sqrt(right.matches) *
          (1 - Math.abs(right.wins - right.losses) / right.matches) -
          Math.sqrt(left.matches) *
            (1 - Math.abs(left.wins - left.losses) / left.matches) ||
        right.matches - left.matches ||
        Math.abs(left.wins - left.losses) - Math.abs(right.wins - right.losses) ||
        right.lastPlayedAtMs - left.lastPlayedAtMs ||
        compareConnectionNames(left, right)
    )[0];

  return {
    partner: partner ? makeConnection(partner) : null,
    rival: rival
      ? {
          id: rival.participant.id,
          name: rival.participant.name,
          avatarUrl: rival.participant.avatarUrl,
          wins: rival.wins,
          losses: rival.losses,
        }
      : null,
  };
}

function buildTimeline(
  userId: string,
  matches: MemberProfileMatchSource[],
  sessions: MemberProfileSessionSource[],
  matchAdjustments: MemberProfileMatchEloAdjustmentSource[],
  manualAdjustments: MemberProfileRatingAdjustmentSource[],
  sessionSummaries: Map<string, PlayerProfileSessionSummary>
) {
  const points: MemberProfileTimelineEntry[] = [];
  const coveredMatchesBySession = new Map<string, number>();
  const adjustedMatchesBySession = new Map<string, number>();

  for (const match of matches) {
    const sessionId = match.session.id;
    coveredMatchesBySession.set(
      sessionId,
      (coveredMatchesBySession.get(sessionId) ?? 0) + 1
    );
    const adjustment = getMatchAdjustment(match, userId, matchAdjustments);
    if (!adjustment) {
      if (match.session.status === "COMPLETED") points.push({ id: `gap:${match.id}`, kind: "GAP", date: asIso(match.completedAt), rating: null, delta: null, sessionId, sessionCode: match.session.code, label: `${match.session.name} - rating unavailable` });
      continue;
    }
    adjustedMatchesBySession.set(
      sessionId,
      (adjustedMatchesBySession.get(sessionId) ?? 0) + 1
    );
    const summary = sessionSummaries.get(sessionId);
    points.push({
      id: adjustment.id || `match:${match.id}:${userId}`,
      kind: match.session.status === "COMPLETED" ? "SESSION" : "ACTIVE",
      date: asIso(adjustment.createdAt),
      rating: adjustment.afterElo,
      delta: adjustment.delta ?? adjustment.afterElo - adjustment.beforeElo,
      sessionId,
      sessionCode: match.session.code,
      label: match.session.name,
      ...(summary ? { session: summary } : {}),
    });
  }

  for (const adjustment of manualAdjustments) {
    points.push({
      id: adjustment.id,
      kind: "MANUAL",
      date: asIso(adjustment.createdAt),
      rating: adjustment.afterElo,
      delta: adjustment.delta ?? adjustment.afterElo - adjustment.beforeElo,
      label: adjustment.reason?.trim() || "Manual rating adjustment",
    });
  }

  const knownSessionIds = new Set(sessions.map((session) => session.id));
  for (const match of matches) {
    if (!knownSessionIds.has(match.session.id)) {
      sessions.push({
        id: match.session.id,
        code: match.session.code,
        name: match.session.name,
        status: match.session.status ?? "COMPLETED",
        isTest: match.session.isTest,
        createdAt: match.session.createdAt,
        endedAt: match.session.endedAt,
      });
      knownSessionIds.add(match.session.id);
    }
  }

  for (const session of sessions) {
    if (session.isTest) continue;
    const status = session.status ?? "COMPLETED";
    const date = sessionDate(session);
    const base = {
      sessionId: session.id,
      sessionCode: session.code,
      label: session.name || session.code,
      date,
      rating: null,
      delta: null,
    } as const;
    if (status !== "COMPLETED") {
      if (status !== "ACTIVE" || points.some(p => p.sessionId === session.id)) continue;
      points.push({ id: `active:${session.id}`, kind: "ACTIVE", ...base });
      continue;
    }
    const covered = coveredMatchesBySession.get(session.id) ?? 0;
    const adjusted = adjustedMatchesBySession.get(session.id) ?? 0;
    if (covered > 0 || adjusted > 0) continue;
    points.push({
      id: `gap:${session.id}`,
      kind: "GAP",
      ...base,
      label: `${session.name || session.code} · rating unavailable`,
    });
  }

  return points.sort(
    (left, right) =>
      asTime(left.date) - asTime(right.date) || left.id.localeCompare(right.id)
  );
}

function buildRecords(
  userId: string,
  matches: MemberProfileMatchSource[],
  sessions: MemberProfileSessionSource[],
  matchAdjustments: MemberProfileMatchEloAdjustmentSource[],
  manualAdjustments: MemberProfileRatingAdjustmentSource[],
  bestSession: PlayerProfileSessionSummary | null
) {
  const ratingEvents: Array<{ value: number; date: string | null }> = [];
  for (const match of matches) {
    const adjustment = getMatchAdjustment(match, userId, matchAdjustments);
    if (!adjustment) continue;
    ratingEvents.push(
      { value: adjustment.beforeElo, date: asIso(adjustment.createdAt) },
      { value: adjustment.afterElo, date: asIso(match.completedAt ?? adjustment.createdAt) }
    );
  }
  for (const adjustment of manualAdjustments) {
    ratingEvents.push(
      { value: adjustment.beforeElo, date: asIso(adjustment.createdAt) },
      { value: adjustment.afterElo, date: asIso(adjustment.createdAt) }
    );
  }
  const highestRating = ratingEvents
    .slice()
    .sort((left, right) => right.value - left.value || asTime(left.date) - asTime(right.date))[0] ?? null;

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const orderedMatches = matches
    .filter((match) => {
      const session = sessionById.get(match.session.id);
      const status = session?.status ?? match.session.status;
      const isTest = session?.isTest ?? match.session.isTest;
      return (
        !isTest &&
        (status === undefined || status === null || status === "COMPLETED") &&
        (match.winnerTeam === 1 || match.winnerTeam === 2)
      );
    })
    .filter((match) => {
      const guestIds = getGuests(match.session);
      return !guestIds.has(userId);
    })
    .sort((left, right) => asTime(left.completedAt) - asTime(right.completedAt) || left.id.localeCompare(right.id));

  let current = 0;
  let longest: { value: number; date: string | null; sessionCode?: string } | null = null;
  for (const match of orderedMatches) {
    const isTeam1 = match.team1User1Id === userId || match.team1User2Id === userId;
    const won = match.winnerTeam === (isTeam1 ? 1 : 2);
    current = won ? current + 1 : 0;
    if (current > (longest?.value ?? 0)) {
      longest = {
        value: current,
        date: asIso(match.completedAt),
        sessionCode: match.session.code,
      };
    }
  }

  return { highestRating, longestStreak: longest, bestSession };
}

export function buildMemberProfileData({
  userId,
  memberStatus,
  currentCoreMemberIds,
  matches,
  sessions: inputSessions = [],
  matchEloAdjustments = [],
  manualRatingAdjustments = [],
  historyOffset = 0,
  historyLimit = 3,
}: BuildMemberProfileInput): MemberProfileData | null {
  matches = matches.filter(m => !m.session.isTest && m.session.type !== "PRACTICE");
  const completedMatches = matches.filter(m => m.session.status === "COMPLETED");

  const sessions = inputSessions.slice();
  const profileData =
    buildPlayerProfileDerivedData(userId, completedMatches.map(m => {
      const ledger = getMatchAdjustment(m, userId, matchEloAdjustments);
      const delta = ledger ? ledger.afterElo - ledger.beforeElo : null;
      return { ...m, team1EloChange: delta, team2EloChange: delta };
    }));
  const allSessionSummaries = new Map<string, PlayerProfileSessionSummary>();
  const sessionAggregates = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      date: string | null;
      matches: number;
      wins: number;
      losses: number;
      pointDifferential: number;
      ratingChange: number;
    }
  >();
  const historyByMatchId = new Map(
    profileData.matchHistory.map((entry) => [entry.id, entry])
  );
  for (const match of matches) {
    const historyEntry = historyByMatchId.get(match.id);
    if (!historyEntry) continue;
    const existing = sessionAggregates.get(match.session.id) ?? {
      id: match.session.id,
      code: match.session.code,
      name: match.session.name,
      date: null,
      matches: 0,
      wins: 0,
      losses: 0,
      pointDifferential: 0,
      ratingChange: 0,
    };
    existing.matches += 1;
    existing.wins += historyEntry.result === "WIN" ? 1 : 0;
    existing.losses += historyEntry.result === "LOSS" ? 1 : 0;
    existing.pointDifferential += historyEntry.pointDifferential;
    existing.ratingChange += historyEntry.eloChange ?? 0;
    if (asTime(historyEntry.date) >= asTime(existing.date)) {
      existing.date = historyEntry.date;
    }
    sessionAggregates.set(match.session.id, existing);
  }
  for (const aggregate of sessionAggregates.values()) {
    allSessionSummaries.set(aggregate.id, {
      ...aggregate,
      winRate:
        aggregate.matches > 0
          ? Math.round((aggregate.wins / aggregate.matches) * 100)
          : 0,
    });
  }
  for (const summary of [
    ...profileData.recentSessions,
    profileData.sessions.best,
    profileData.sessions.latest,
  ]) {
    if (summary) allSessionSummaries.set(summary.id, summary);
  }

  for (const [id, summary] of allSessionSummaries) {
    const played = completedMatches.filter(m => m.session.id === id);
    Object.assign(summary, { ratingVerified: played.every(m => !!getMatchAdjustment(m, userId, matchEloAdjustments)) });
  }
  const summaries = [...allSessionSummaries.values()].sort(
    (left, right) => asTime(right.date) - asTime(left.date) || left.id.localeCompare(right.id)
  );
  const safeOffset = Math.max(0, Number.isFinite(historyOffset) ? Math.floor(historyOffset) : 0);
  const safeLimit = Math.min(10, Math.max(1, Number.isFinite(historyLimit) ? Math.floor(historyLimit) : 3));
  const historyItems = summaries.slice(safeOffset, safeOffset + safeLimit);

  return {
    latestSession: summaries[0] ?? null,
    recentForm: profileData.matchHistory.slice(0, 6),
    timeline: buildTimeline(
      userId,
      matches,
      sessions,
      matchEloAdjustments,
      manualRatingAdjustments,
      allSessionSummaries
    ),
    records: buildRecords(
      userId,
      matches,
      sessions,
      matchEloAdjustments,
      manualRatingAdjustments,
      profileData.sessions.best
    ),
    history: {
      items: historyItems,
      hasMore: safeOffset + historyItems.length < summaries.length,
      nextOffset:
        safeOffset + historyItems.length < summaries.length
          ? safeOffset + historyItems.length
          : null,
    },
    matchHistory: profileData.matchHistory,
    relationships: memberStatus === "CORE" ? buildRelationships(
      userId,
      completedMatches,
      new Set(currentCoreMemberIds ?? [])
    ) : { partner: null, rival: null },
  };
}


