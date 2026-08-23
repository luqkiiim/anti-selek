import {
  getSideSpecificCourtCreateMixedSide,
  getSideSpecificCourtCreateShortageMessage,
  type SideSpecificCourtCreateType,
} from "@/lib/courtCreate";
import { getClubEloByUserId } from "@/lib/clubElo";
import { prisma } from "@/lib/prisma";
import {
  getAcceptedSessionClubIds,
  getPlayerClubBadges,
} from "@/lib/sessionCollab";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  getEffectiveSessionMode,
  getEffectiveSessionType,
} from "@/lib/sessionSettings";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import {
  getNormalizedSessionPool,
} from "@/lib/sessionPools";
import {
  classifyCourtGroupSnapshot,
  type CourtGroupSnapshot,
} from "@/lib/playerGroups";
import {
  buildPlayerGroupCourtPlans,
  getPlayerGroupSelectionConstraints,
  type PlayerGroupCourtComposition,
  type PlayerGroupHistorySnapshot,
} from "@/lib/matchmaking/playerGroupPlanner";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { buildV3MatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
import { buildRestTurnsByUserId } from "@/lib/matchmaking/restTurns";
import {
  getPendingSkipNextUserIds,
  getSkippedSelectionUserIds,
} from "@/lib/sessionSkipNext";
import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
  deriveRaceRecordsByEntryTime,
  findBestBatchSelectionLadder,
  findBestSingleCourtSelectionLadder,
  type MatchmakerLadderPlayer,
} from "@/lib/matchmaking/ladder";
import {
  buildRotationHistory,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import {
  buildActivePlayers,
  findBestBatchSelectionV3,
  findBestSingleCourtSelectionV3,
  type MatchmakerV3Player,
  type V3BatchDebug,
  type V3SingleCourtSelection,
} from "@/lib/matchmaking/v3";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import {
  CourtGroupType,
  MixedSide,
  MatchStatus,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";
import { isInterclubSession } from "@/lib/sessionCollabFormat";
import {
  GenerateMatchError,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  type ReshuffleSource,
} from "./shared";
import {
  selectInterclubBatchMatches,
  selectInterclubReplacementMatch,
  selectInterclubSingleCourtMatch,
} from "./interclub";

type AvailableCandidate = {
  userId: string;
  matchesPlayed: number;
  matchmakingMatchesCredit: number;
  matchmakingBaseline: number;
  availableSince: Date;
  restTurns: number;
  arrivalPriorityAt: Date | null;
  strength: number;
  pool?: string | null;
  needsMoreRest: boolean;
  moreRestTarget: number;
  isBusy: false;
  isPaused: false;
};

type RankedCandidates = ReturnType<typeof buildActivePlayers<AvailableCandidate>>;

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}

interface PoolAwareSelection extends CourtGroupSnapshot {
  ids: [string, string, string, string];
  partition: {
    team1: [string, string];
    team2: [string, string];
  };
  targetPool?: SessionPool | null;
  missedPool?: SessionPool | null;
  competitiveTargetRatio: number;
  matchmakingReasonJson?: string | null;
}

type MatchSelectionBase = {
  ids: [string, string, string, string];
  partition: {
    team1: [string, string];
    team2: [string, string];
  };
  targetPool?: SessionPool | null;
  missedPool?: SessionPool | null;
  courtGroupType?: CourtGroupType | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  competitiveTargetRatio?: number;
  matchmakingReasonJson?: string | null;
};

const MAX_POOL_SELECTION_OPTIONS_PER_PLAN = 64;
const MAX_GROUP_QUOTA_COMBINATIONS_PER_POOL = 64;
const MAX_GROUP_BATCH_SEARCH_BRANCHES = 20_000;
const MAX_GROUP_BATCH_SEARCH_MS = 100;

function getMatchmakerSessionType(sessionData: GenerateMatchSession) {
  return getEffectiveSessionType(sessionData);
}

function getMatchmakerSessionMode(sessionData: GenerateMatchSession) {
  return getEffectiveSessionMode(sessionData);
}

function getV3QuartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function isV3Selection(
  selection: MatchSelectionBase | V3SingleCourtSelection
): selection is PoolAwareSelection & V3SingleCourtSelection {
  return (
    "players" in selection &&
    Array.isArray(selection.players) &&
    "restSummary" in selection &&
    typeof selection.balanceGap === "number" &&
    typeof selection.pointDiffGap === "number" &&
    typeof selection.partnerRepeatPenalty === "number" &&
    typeof selection.opponentRepeatPenalty === "number" &&
    typeof selection.exactRematchPenalty === "number"
  );
}

function withMatchmakingReason<
  TSelection extends MatchSelectionBase,
>(selection: TSelection, sessionData: GenerateMatchSession) {
  const groupSnapshot = sessionData.poolsEnabled
    ? {
        courtGroupType:
          "courtGroupType" in selection ? selection.courtGroupType : null,
        poolASeatCount:
          "poolASeatCount" in selection ? selection.poolASeatCount : null,
        poolBSeatCount:
          "poolBSeatCount" in selection ? selection.poolBSeatCount : null,
      }
    : {
        courtGroupType: null,
        poolASeatCount: null,
        poolBSeatCount: null,
      };

  if (!isV3Selection(selection)) {
    return {
      ...selection,
      ...groupSnapshot,
      matchmakingReasonJson: null,
    };
  }

  return {
    ...selection,
    ...groupSnapshot,
    matchmakingReasonJson: buildV3MatchmakingReasonJson(selection, {
      sessionType: getMatchmakerSessionType(sessionData),
      sessionMode: getMatchmakerSessionMode(sessionData),
      targetPool:
        "targetPool" in selection ? selection.targetPool ?? null : null,
      missedPool:
        "missedPool" in selection ? selection.missedPool ?? null : null,
      courtGroupType: groupSnapshot.courtGroupType,
      poolASeatCount: groupSnapshot.poolASeatCount ?? undefined,
      poolBSeatCount: groupSnapshot.poolBSeatCount ?? undefined,
      competitiveTargetRatio:
        "competitiveTargetRatio" in selection
          ? selection.competitiveTargetRatio
          : undefined,
      respectPlayerRest: sessionData.respectPlayerRest,
    }),
  };
}

function withNoPlayerGroupSnapshot<TSelection>(selection: TSelection) {
  return {
    ...selection,
    courtGroupType: null,
    poolASeatCount: null,
    poolBSeatCount: null,
  };
}

function getPlayerBalanceInput({
  sessionType,
  sessionPoints,
  clubElo,
  userElo,
}: {
  sessionType: SessionType;
  sessionPoints: number;
  clubElo?: number;
  userElo: number;
}) {
  switch (sessionType) {
    case SessionType.POINTS:
    case SessionType.SOCIAL_MIX:
      return sessionPoints;
    case SessionType.ELO:
      return clubElo ?? userElo;
    case SessionType.LADDER:
    case SessionType.RACE:
      return 0;
    default:
      return userElo;
  }
}

function buildCompletedMatches(sessionData: GenerateMatchSession) {
  return sessionData.matches
    .filter((match) => match.status === MatchStatus.COMPLETED)
    .map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      status: match.status,
      completedAt: match.completedAt ?? null,
    }));
}

function countPoolPlayers<T extends { pool?: string | null }>(
  players: readonly T[],
  pool: SessionPool
) {
  return players.filter(
    (player) => getNormalizedSessionPool(player.pool) === pool
  ).length;
}

function getPoolActiveCounts(sessionData: GenerateMatchSession) {
  return {
    [SessionPool.A]: sessionData.players.filter(
      (player) =>
        !player.isPaused && getNormalizedSessionPool(player.pool) === SessionPool.A
    ).length,
    [SessionPool.B]: sessionData.players.filter(
      (player) =>
        !player.isPaused && getNormalizedSessionPool(player.pool) === SessionPool.B
    ).length,
  };
}

function getPoolWaitingCounts(
  sessionData: GenerateMatchSession,
  rankedCandidates: RankedCandidates
) {
  return {
    [SessionPool.A]: countPoolPlayers(rankedCandidates, SessionPool.A),
    [SessionPool.B]: countPoolPlayers(rankedCandidates, SessionPool.B),
  };
}

function getSessionCourtCount(sessionData: GenerateMatchSession) {
  return Math.max(1, sessionData.courts?.length ?? 0);
}

function getPlayerMoreRestTarget(sessionData: GenerateMatchSession) {
  return getSessionCourtCount(sessionData);
}

function buildV3Players(
  sessionData: GenerateMatchSession,
  playersById: Map<string, PartitionCandidate>,
  rankedCandidates: RankedCandidates
): MatchmakerV3Player[] {
  const sessionPlayersById = new Map(
    sessionData.players.map((player) => [player.userId, player])
  );
  const availableUserIds = new Set(
    rankedCandidates.map((candidate) => candidate.userId)
  );
  const restTurnsByUserId = buildRestTurnsByUserId(
    sessionData.players,
    buildCompletedMatches(sessionData)
  );

  const orderedPlayers = [
    ...rankedCandidates
      .map((candidate) => sessionPlayersById.get(candidate.userId))
      .filter((player): player is GenerateMatchSession["players"][number] =>
        Boolean(player)
      ),
    ...sessionData.players.filter(
      (player) => !availableUserIds.has(player.userId)
    ),
  ];

  return orderedPlayers.map((player) => ({
    userId: player.userId,
    matchesPlayed: player.matchesPlayed,
    matchmakingBaseline:
      player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0),
    availableSince: player.availableSince,
    restTurns: restTurnsByUserId.get(player.userId) ?? 0,
    arrivalPriorityAt: player.arrivalPriorityAt ?? null,
    strength:
      playersById.get(player.userId)?.elo ??
      (getMatchmakerSessionType(sessionData) === SessionType.POINTS ||
      getMatchmakerSessionType(sessionData) === SessionType.SOCIAL_MIX
        ? player.sessionPoints
        : player.user.elo),
    pointDiff: playersById.get(player.userId)?.pointDiff ?? 0,
    isBusy: !player.isPaused && !availableUserIds.has(player.userId),
    isPaused: player.isPaused,
    needsMoreRest: player.needsMoreRest,
    moreRestTarget: getPlayerMoreRestTarget(sessionData),
    gender: player.gender,
    partnerPreference: player.partnerPreference,
    mixedSideOverride: player.mixedSideOverride,
    pool: player.pool,
    lastPartnerId: player.lastPartnerId,
  }));
}

function buildLadderPlayers(
  sessionData: GenerateMatchSession,
  playersById: Map<string, PartitionCandidate>,
  rankedCandidates: RankedCandidates
): MatchmakerLadderPlayer[] {
  const availableUserIds = new Set(
    rankedCandidates.map((candidate) => candidate.userId)
  );
  const completedMatches = buildCompletedMatches(sessionData);
  const restTurnsByUserId = buildRestTurnsByUserId(
    sessionData.players,
    completedMatches
  );
  const ladderEntryAtByUserId = new Map(
    sessionData.players.map((player) => [
      player.userId,
      getCompetitiveEntryAt(player),
    ])
  );
  const ladderRecordByUserId =
    getMatchmakerSessionType(sessionData) === SessionType.RACE
      ? deriveRaceRecordsByEntryTime(
          ladderEntryAtByUserId,
          completedMatches
        )
      : deriveLadderRecordsByEntryTime(
          ladderEntryAtByUserId,
          completedMatches
        );

  return sessionData.players.map((player) => {
    const record = ladderRecordByUserId.get(player.userId) ?? {
      wins: 0,
      losses: 0,
      pointDiff: 0,
      ladderScore: 0,
    };

    return {
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingBaseline:
        player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0),
      availableSince: player.availableSince,
      restTurns: restTurnsByUserId.get(player.userId) ?? 0,
      arrivalPriorityAt: player.arrivalPriorityAt ?? null,
      strength: playersById.get(player.userId)?.elo ?? 0,
      wins: record.wins,
      losses: record.losses,
      pointDiff: record.pointDiff,
      ladderScore: record.ladderScore,
      isBusy: !player.isPaused && !availableUserIds.has(player.userId),
      isPaused: player.isPaused,
      needsMoreRest: player.needsMoreRest,
      moreRestTarget: getPlayerMoreRestTarget(sessionData),
      gender: player.gender,
      partnerPreference: player.partnerPreference,
      mixedSideOverride: player.mixedSideOverride,
      pool: player.pool,
      lastPartnerId: player.lastPartnerId,
    };
  });
}

export async function buildMatchmakingState(
  sessionData: GenerateMatchSession,
  options?: { reserveQueuedPlayers?: boolean }
): Promise<MatchmakingState> {
  const busyPlayerIds = getBusyPlayerIds(sessionData.matches);
  if (options?.reserveQueuedPlayers !== false) {
    for (const userId of getQueuedMatchUserIds(sessionData.queuedMatch)) {
      busyPlayerIds.add(userId);
    }
  }
  const sessionClubIds =
    getMatchmakerSessionType(sessionData) === SessionType.ELO &&
    sessionData.clubId &&
    sessionData.players.length > 0
      ? await getAcceptedSessionClubIds(prisma, sessionData)
      : [];
  const playerIds = sessionData.players.map((player) => player.userId);
  const hostClubId = sessionData.clubId;
  let usesLegacySingleClubElo = false;
  let legacyClubEloByUserId = new Map<string, number>();

  if (
    typeof hostClubId === "string" &&
    sessionClubIds.length === 1 &&
    sessionClubIds[0] === hostClubId
  ) {
    usesLegacySingleClubElo = true;
    legacyClubEloByUserId = await getClubEloByUserId(
      hostClubId,
      playerIds
    );
  }

  const communityBadgesByUserId =
    sessionClubIds.length > 0 && !usesLegacySingleClubElo
      ? await getPlayerClubBadges(prisma, sessionClubIds, playerIds)
      : new Map<string, Array<{ id: string; name: string; elo: number }>>();
  const pointDiffByUserId = new Map<string, number>();

  for (const match of sessionData.matches) {
    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number"
    ) {
      continue;
    }

    const team1Diff = match.team1Score - match.team2Score;
    const team2Diff = match.team2Score - match.team1Score;

    for (const userId of [match.team1User1Id, match.team1User2Id]) {
      pointDiffByUserId.set(
        userId,
        (pointDiffByUserId.get(userId) ?? 0) + team1Diff
      );
    }

    for (const userId of [match.team2User1Id, match.team2User2Id]) {
      pointDiffByUserId.set(
        userId,
        (pointDiffByUserId.get(userId) ?? 0) + team2Diff
      );
    }
  }

  const playersById = new Map<string, PartitionCandidate>(
    sessionData.players.map((player) => [
      player.userId,
      {
        userId: player.userId,
        elo: getPlayerBalanceInput({
          sessionType: getMatchmakerSessionType(sessionData),
          sessionPoints: player.sessionPoints,
        clubElo:
          legacyClubEloByUserId.get(player.userId) ??
          communityBadgesByUserId
            .get(player.userId)
            ?.find((badge) => badge.id === sessionData.clubId)?.elo ??
          communityBadgesByUserId.get(player.userId)?.[0]?.elo,
          userElo: player.user.elo,
        }),
        pointDiff: pointDiffByUserId.get(player.userId) ?? 0,
        lastPartnerId: player.lastPartnerId,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
        mixedSideOverride: player.mixedSideOverride,
        pool: player.pool,
      },
    ])
  );
  const rotationHistory = buildRotationHistory(
    sessionData.matches
      .filter((match) => match.status === MatchStatus.COMPLETED)
      .sort((matchA, matchB) => {
        const timeA =
          matchA.completedAt?.getTime() ?? matchA.createdAt.getTime();
        const timeB =
          matchB.completedAt?.getTime() ?? matchB.createdAt.getTime();

        return timeA - timeB;
      })
  );

  return { busyPlayerIds, playersById, rotationHistory };
}

export function getRequestedOpenCourts(
  orderedTargetCourts: GenerateMatchCourt[],
  freedCourtIds: Set<string>
) {
  const requestedOpenCourts = orderedTargetCourts.filter(
    (court) => freedCourtIds.has(court.id) || !court.currentMatch
  );

  if (requestedOpenCourts.length !== orderedTargetCourts.length) {
    throw new GenerateMatchError(
      409,
      "Selected courts must be empty before creating matches."
    );
  }

  return requestedOpenCourts;
}

export function getRankedCandidates(
  sessionData: GenerateMatchSession,
  busyPlayerIds: Set<string>
) {
  const restTurnsByUserId = buildRestTurnsByUserId(
    sessionData.players,
    buildCompletedMatches(sessionData)
  );
  const availableCandidates: AvailableCandidate[] = sessionData.players
    .filter((player) => !busyPlayerIds.has(player.userId) && !player.isPaused)
    .map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingMatchesCredit: Math.max(
        0,
        player.matchmakingMatchesCredit ?? 0
      ),
      matchmakingBaseline:
        player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0),
      availableSince: player.availableSince,
      restTurns: restTurnsByUserId.get(player.userId) ?? 0,
      arrivalPriorityAt: player.arrivalPriorityAt ?? null,
      strength: 0,
      pool: player.pool,
      needsMoreRest: player.needsMoreRest,
      moreRestTarget: getPlayerMoreRestTarget(sessionData),
      isBusy: false,
      isPaused: false,
    }));

  return {
    availableCandidates,
    rankedCandidates: buildActivePlayers(availableCandidates, {
      randomFn: () => 0,
      respectPlayerRest: sessionData.respectPlayerRest,
    }),
  };
}

export function ensureEnoughPlayers(
  availableCandidatesCount: number,
  rankedCandidatesCount: number,
  requestedMatchCount: number
) {
  if (rankedCandidatesCount < requestedMatchCount * 4) {
    throw new GenerateMatchError(
      400,
      `Not enough players available (need ${requestedMatchCount * 4}, have ${availableCandidatesCount})`
    );
  }
}

export function filterRankedCandidatesByMatchType(
  rankedCandidates: RankedCandidates,
  sessionData: GenerateMatchSession,
  matchType: SideSpecificCourtCreateType
) {
  const requestedSide = getSideSpecificCourtCreateMixedSide(matchType);
  const eligibleUserIds = new Set(
    sessionData.players
      .filter(
        (player) =>
          getEffectiveMixedSide({
            gender: player.gender,
            partnerPreference: player.partnerPreference,
            mixedSideOverride: player.mixedSideOverride,
          }) === requestedSide
      )
      .map((player) => player.userId)
  );

  return rankedCandidates.filter((candidate) =>
    eligibleUserIds.has(candidate.userId)
  );
}

export function ensureEnoughMatchTypePlayers(
  matchType: SideSpecificCourtCreateType,
  availableCount: number
) {
  if (availableCount < 4) {
    throw new GenerateMatchError(
      400,
      getSideSpecificCourtCreateShortageMessage(matchType, availableCount)
    );
  }
}

function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getMixedSideCounts(
  sessionData: GenerateMatchSession,
  includedUserIds: ReadonlySet<string>
) {
  let upper = 0;
  let lower = 0;
  let unspecified = 0;

  for (const player of sessionData.players) {
    if (!includedUserIds.has(player.userId)) {
      continue;
    }

    const side = getEffectiveMixedSide({
      gender: player.gender,
      partnerPreference: player.partnerPreference,
      mixedSideOverride: player.mixedSideOverride,
    });

    if (side === MixedSide.UPPER) {
      upper += 1;
    } else if (side === MixedSide.LOWER) {
      lower += 1;
    } else {
      unspecified += 1;
    }
  }

  return { upper, lower, unspecified };
}

function formatMixedSideCounts({
  upper,
  lower,
  unspecified,
}: ReturnType<typeof getMixedSideCounts>) {
  const parts = [
    `${upper} upper-side`,
    `${lower} lower-side`,
  ];

  if (unspecified > 0) {
    parts.push(`${unspecified} unspecified`);
  }

  return `Available Mixed sides: ${parts.join(", ")}.`;
}

function getV3BatchFailureMessage({
  debug,
  rankedCandidates,
  requestedMatchCount,
  sessionData,
}: {
  debug: V3BatchDebug;
  rankedCandidates: RankedCandidates;
  requestedMatchCount: number;
  sessionData: GenerateMatchSession;
}) {
  const requiredPlayerCount = requestedMatchCount * 4;
  const modeLabel = getSessionModeLabel(getMatchmakerSessionMode(sessionData));
  const courtLabel = formatCountLabel(requestedMatchCount, "court");
  const candidateIds =
    Array.isArray(debug.candidatePlayerIds) && debug.candidatePlayerIds.length > 0
      ? debug.candidatePlayerIds
      : rankedCandidates.map((candidate) => candidate.userId);
  const eligibleCount = Array.isArray(debug.eligiblePlayerIds)
    ? debug.eligiblePlayerIds.length
    : rankedCandidates.length;
  const validQuartetCount =
    typeof debug.validQuartetCount === "number" ? debug.validQuartetCount : 0;
  const sideSummary =
    getMatchmakerSessionMode(sessionData) === SessionMode.MIXICANO
      ? ` ${formatMixedSideCounts(
          getMixedSideCounts(sessionData, new Set(candidateIds))
        )}`
      : "";

  switch (debug.failureReason) {
    case "INSUFFICIENT_PLAYERS":
      return `Need ${requiredPlayerCount} available players for ${courtLabel}, but only ${eligibleCount} are available.`;
    case "NO_VALID_MIXED_QUARTETS":
      return `Mixed rules could not form any legal court from ${formatCountLabel(
        candidateIds.length,
        "candidate"
      )}. Each Mixed court must be all upper-side, all lower-side, or 2 upper-side + 2 lower-side players.${sideSummary}`;
    case "NOT_ENOUGH_NON_OVERLAPPING_COURTS":
      return `Found ${formatCountLabel(
        validQuartetCount,
        "legal court option"
      )}, but not ${requestedMatchCount} non-overlapping courts from ${formatCountLabel(
        candidateIds.length,
        "candidate"
      )}.${sideSummary}`;
    case "LOCKED_PLAYERS_CANNOT_ALL_FIT":
      return `The fairest waiting group could not be split into ${courtLabel} under current ${modeLabel} rules. The matcher considered ${formatCountLabel(
        candidateIds.length,
        "candidate"
      )} and found ${formatCountLabel(
        validQuartetCount,
        "legal court option"
      )}.${sideSummary}`;
    case "SEARCH_LIMIT_REACHED":
      return `The matcher hit its search limit while trying to form ${courtLabel}. Try creating fewer courts at once.`;
    default:
      return `No valid set of matches found for current ${modeLabel} session rules. Try changing player preferences.`;
  }
}

function applyReshuffleExclusions<TSelection extends PoolAwareSelection>(
  selection: TSelection | null,
  reshuffleSource: ReshuffleSource | null,
  rerun: (options: {
    excludedQuartetKey?: string;
    excludedPartitionKey?: string;
  }) => TSelection | null
) {
  if (!selection || !reshuffleSource) {
    return selection;
  }

  const previousQuartetKey = getV3QuartetKey(reshuffleSource.ids);
  const previousPartitionKey = getExactPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = getV3QuartetKey(selection.ids);
  const selectedPartitionKey = getExactPartitionKey(selection.partition);

  if (selectedQuartetKey !== previousQuartetKey) {
    return selection;
  }

  const alternativeQuartet = rerun({
    excludedQuartetKey: previousQuartetKey,
  });
  if (alternativeQuartet) {
    return alternativeQuartet;
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return selection;
  }

  return rerun({
    excludedPartitionKey: previousPartitionKey,
  });
}

function getPlayerGroupHistory(
  sessionData: GenerateMatchSession
): PlayerGroupHistorySnapshot[] {
  return [...sessionData.matches]
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id)
    )
    .map((match) => {
      const snapshot = match as typeof match & PlayerGroupHistorySnapshot;
      return {
        courtGroupType: snapshot.courtGroupType ?? null,
        poolASeatCount: snapshot.poolASeatCount ?? null,
        poolBSeatCount: snapshot.poolBSeatCount ?? null,
      };
    })
    .filter(
      (snapshot) =>
        typeof snapshot.poolASeatCount === "number" &&
        typeof snapshot.poolBSeatCount === "number" &&
        snapshot.poolASeatCount + snapshot.poolBSeatCount === 4
    );
}

function getCompositionTargetPool(
  composition: PlayerGroupCourtComposition
) {
  switch (composition.courtGroupType) {
    case CourtGroupType.COMPETITIVE:
      return SessionPool.A;
    case CourtGroupType.SOCIAL:
      return SessionPool.B;
    case CourtGroupType.CROSSOVER:
    case CourtGroupType.OPEN_OVERFLOW:
      return null;
  }
}

function getNormalizedCourtGroupType(
  value: CourtGroupType | string | null | undefined
) {
  return Object.values(CourtGroupType).includes(value as CourtGroupType)
    ? (value as CourtGroupType)
    : null;
}

function getSelectionSnapshot(
  sessionData: GenerateMatchSession,
  partition: { team1: [string, string]; team2: [string, string] }
) {
  return classifyCourtGroupSnapshot(
    partition.team1,
    partition.team2,
    new Map(
      sessionData.players.map((player) => [player.userId, player.pool])
    )
  );
}

type QuotaFairnessPlayer = {
  userId: string;
  pool?: string | null;
  matchesPlayed: number;
  matchmakingBaseline: number;
  restTurns?: number;
  needsMoreRest?: boolean;
  moreRestTarget?: number;
  arrivalPriorityAt?: Date | string | null;
  availableSince: Date;
  isBusy?: boolean;
  isPaused?: boolean;
};

type QuotaCombination<T extends QuotaFairnessPlayer> = {
  players: T[];
  missingArrivalPriorityCount: number;
  effectiveMatchCountVector: number[];
  moreRestDeficitTotal: number;
  restTurnVector: number[];
  waitTimeVector: number[];
};

function buildCombinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];

  const combinations: T[][] = [];
  for (let index = 0; index <= items.length - size; index += 1) {
    for (const tail of buildCombinations(items.slice(index + 1), size - 1)) {
      combinations.push([items[index], ...tail]);
    }
  }
  return combinations;
}

function getArrivalPriorityTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareNumberVectors(
  left: readonly number[],
  right: readonly number[],
  direction: 1 | -1 = 1
) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? Number.POSITIVE_INFINITY;
    const rightValue = right[index] ?? Number.POSITIVE_INFINITY;
    if (leftValue !== rightValue) return (leftValue - rightValue) * direction;
  }
  return 0;
}

function compareQuotaCombinations<T extends QuotaFairnessPlayer>(
  left: QuotaCombination<T>,
  right: QuotaCombination<T>,
  includeStableTieBreak = true
) {
  if (left.missingArrivalPriorityCount !== right.missingArrivalPriorityCount) {
    return left.missingArrivalPriorityCount - right.missingArrivalPriorityCount;
  }
  const matchCountCompare = compareNumberVectors(
    left.effectiveMatchCountVector,
    right.effectiveMatchCountVector
  );
  if (matchCountCompare !== 0) return matchCountCompare;
  if (left.moreRestDeficitTotal !== right.moreRestDeficitTotal) {
    return left.moreRestDeficitTotal - right.moreRestDeficitTotal;
  }
  const restCompare = compareNumberVectors(
    left.restTurnVector,
    right.restTurnVector,
    -1
  );
  if (restCompare !== 0) return restCompare;
  const waitCompare = compareNumberVectors(
    left.waitTimeVector,
    right.waitTimeVector
  );
  if (waitCompare !== 0) return waitCompare;

  return includeStableTieBreak
    ? left.players
        .map((player) => player.userId)
        .sort()
        .join("|")
        .localeCompare(
          right.players.map((player) => player.userId).sort().join("|")
        )
    : 0;
}

function buildQuotaCombinations<T extends QuotaFairnessPlayer>(
  players: readonly T[],
  requiredCount: number,
  respectPlayerRest: boolean
) {
  if (requiredCount === 0) {
    return [{
      players: [],
      missingArrivalPriorityCount: 0,
      effectiveMatchCountVector: [],
      moreRestDeficitTotal: 0,
      restTurnVector: [],
      waitTimeVector: [],
    } satisfies QuotaCombination<T>];
  }

  const activePlayers = players.filter(
    (player) => !player.isBusy && !player.isPaused
  );
  const requiredPriorityIds = new Set(
    [...activePlayers]
      .filter(
        (player) => getArrivalPriorityTime(player.arrivalPriorityAt) !== null
      )
      .sort(
        (left, right) =>
          (getArrivalPriorityTime(left.arrivalPriorityAt) ?? 0) -
            (getArrivalPriorityTime(right.arrivalPriorityAt) ?? 0) ||
          left.userId.localeCompare(right.userId)
      )
      .slice(0, requiredCount)
      .map((player) => player.userId)
  );

  return buildCombinations(activePlayers, requiredCount)
    .map((combination): QuotaCombination<T> => {
      const selectedIds = new Set(combination.map((player) => player.userId));
      const restTurnVector = combination
        .map((player) => Math.max(0, player.restTurns ?? 0))
        .sort((left, right) => right - left);

      return {
        players: combination,
        missingArrivalPriorityCount: [...requiredPriorityIds].filter(
          (userId) => !selectedIds.has(userId)
        ).length,
        effectiveMatchCountVector: combination
          .map((player) =>
            Math.max(player.matchesPlayed, player.matchmakingBaseline)
          )
          .sort((left, right) => left - right),
        moreRestDeficitTotal: respectPlayerRest
          ? combination.reduce(
              (total, player) =>
                total +
                (player.needsMoreRest
                  ? Math.max(
                      0,
                      Math.max(1, player.moreRestTarget ?? 1) -
                        Math.max(0, player.restTurns ?? 0)
                    )
                  : 0),
              0
            )
          : 0,
        restTurnVector: respectPlayerRest ? restTurnVector : [],
        waitTimeVector: combination
          .map((player) => player.availableSince.getTime())
          .sort((left, right) => left - right),
      };
    })
    .sort((left, right) => compareQuotaCombinations(left, right))
    .slice(0, MAX_GROUP_QUOTA_COMBINATIONS_PER_POOL);
}

function combineQuotaFairness<T extends QuotaFairnessPlayer>(
  players: [T, T, T, T],
  poolACombination: QuotaCombination<T>,
  poolBCombination: QuotaCombination<T>
): QuotaCombination<T> {
  return {
    players,
    missingArrivalPriorityCount:
      poolACombination.missingArrivalPriorityCount +
      poolBCombination.missingArrivalPriorityCount,
    effectiveMatchCountVector: [
      ...poolACombination.effectiveMatchCountVector,
      ...poolBCombination.effectiveMatchCountVector,
    ].sort((a, b) => a - b),
    moreRestDeficitTotal:
      poolACombination.moreRestDeficitTotal +
      poolBCombination.moreRestDeficitTotal,
    restTurnVector: [
      ...poolACombination.restTurnVector,
      ...poolBCombination.restTurnVector,
    ].sort((a, b) => b - a),
    waitTimeVector: [
      ...poolACombination.waitTimeVector,
      ...poolBCombination.waitTimeVector,
    ].sort((a, b) => a - b),
  };
}

function buildQuotaAwareQuartets<T extends QuotaFairnessPlayer>(
  players: readonly T[],
  composition: PlayerGroupCourtComposition,
  respectPlayerRest: boolean
) {
  const poolACombinations = buildQuotaCombinations(
    players.filter(
      (player) => getNormalizedSessionPool(player.pool) === SessionPool.A
    ),
    composition.poolASeatCount,
    respectPlayerRest
  );
  const poolBCombinations = buildQuotaCombinations(
    players.filter(
      (player) => getNormalizedSessionPool(player.pool) === SessionPool.B
    ),
    composition.poolBSeatCount,
    respectPlayerRest
  );

  return poolACombinations
    .flatMap((poolACombination) =>
      poolBCombinations.map((poolBCombination) => {
        const players = [...poolACombination.players, ...poolBCombination.players] as [
          T,
          T,
          T,
          T,
        ];
        return {
          players,
          fairness: combineQuotaFairness(
            players,
            poolACombination,
            poolBCombination
          ),
        };
      })
    )
    .filter((quartet) => quartet.players.length === 4)
    .sort((left, right) =>
      compareQuotaCombinations(left.fairness, right.fairness)
    );
}

function buildQuotaAwareQuartetTiers<T extends QuotaFairnessPlayer>(
  players: readonly T[],
  composition: PlayerGroupCourtComposition,
  respectPlayerRest: boolean,
  excludedQuartetKey?: string,
  excludedQuartetKeys?: ReadonlySet<string>
) {
  const tiers: Array<
    ReturnType<typeof buildQuotaAwareQuartets<T>>
  > = [];

  for (const quartet of buildQuotaAwareQuartets(
    players,
    composition,
    respectPlayerRest
  )) {
    const quartetKey = getV3QuartetKey(
      quartet.players.map((player) => player.userId)
    );
    if (
      quartetKey === excludedQuartetKey ||
      excludedQuartetKeys?.has(quartetKey)
    ) {
      continue;
    }

    const currentTier = tiers.at(-1);
    if (
      !currentTier ||
      compareQuotaCombinations(
        quartet.fairness,
        currentTier[0].fairness,
        false
      ) !== 0
    ) {
      tiers.push([quartet]);
      continue;
    }

    currentTier.push(quartet);
  }

  return tiers;
}

function buildQuotaTierConstraints<T extends QuotaFairnessPlayer>(
  composition: PlayerGroupCourtComposition,
  tier: ReturnType<typeof buildQuotaAwareQuartets<T>>
) {
  const compositionConstraints = getPlayerGroupSelectionConstraints<T>(
    composition
  );
  const allowedQuartetKeys = new Set(
    tier.map((quartet) =>
      getV3QuartetKey(quartet.players.map((player) => player.userId))
    )
  );

  return {
    ...compositionConstraints,
    isQuartetAllowed(players: [T, T, T, T]) {
      return (
        allowedQuartetKeys.has(
          getV3QuartetKey(players.map((player) => player.userId))
        ) && compositionConstraints.isQuartetAllowed(players)
      );
    },
  };
}

function getQuotaTierPlayers<T extends QuotaFairnessPlayer>(
  tier: ReturnType<typeof buildQuotaAwareQuartets<T>>
) {
  return [
    ...new Map(
      tier.flatMap((quartet) =>
        quartet.players.map((player) => [player.userId, player] as const)
      )
    ).values(),
  ];
}

function buildPlayerGroupSelectionRunner({
  rankedCandidates,
  playersById,
  sessionData,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
}) {
  const completedMatches = buildCompletedMatches(sessionData);
  const usesCompetitiveGrouping =
    getMatchmakerSessionType(sessionData) === SessionType.LADDER ||
    getMatchmakerSessionType(sessionData) === SessionType.RACE;
  const waitingCounts = getPoolWaitingCounts(sessionData, rankedCandidates);
  const activeCounts = getPoolActiveCounts(sessionData);
  const activePlayerCount = activeCounts[SessionPool.A] + activeCounts[SessionPool.B];
  const competitiveTargetRatio =
    activePlayerCount > 0
      ? activeCounts[SessionPool.A] / activePlayerCount
      : 0.5;

  const v3Players = usesCompetitiveGrouping
    ? null
    : buildV3Players(sessionData, playersById, rankedCandidates);
  const ladderPlayers = usesCompetitiveGrouping
    ? buildLadderPlayers(sessionData, playersById, rankedCandidates)
    : null;

  const runSelection = ({
    composition,
    excludedQuartetKey,
    excludedQuartetKeys,
    excludedPartitionKey,
  }: {
    composition: PlayerGroupCourtComposition;
    excludedQuartetKey?: string;
    excludedQuartetKeys?: ReadonlySet<string>;
    excludedPartitionKey?: string;
  }): PoolAwareSelection | null => {
    const targetPool = getCompositionTargetPool(composition);
    const selectionConstraints = getPlayerGroupSelectionConstraints(composition);

    const finishSelection = <TSelection extends MatchSelectionBase>(
      selection: TSelection | null
    ): PoolAwareSelection | null => {
      if (!selection) return null;
      const snapshot = getSelectionSnapshot(sessionData, selection.partition);
      if (snapshot.courtGroupType !== composition.courtGroupType) return null;

      return {
        ...selection,
        ...snapshot,
        targetPool,
        missedPool: null,
        competitiveTargetRatio,
      } as PoolAwareSelection;
    };

    if (usesCompetitiveGrouping && ladderPlayers) {
      const runLadder = (
        sourcePlayers: MatchmakerLadderPlayer[],
        constraints = selectionConstraints,
        useAllActivePlayers = false
      ) =>
        findBestSingleCourtSelectionLadder(sourcePlayers, {
          sessionMode: getMatchmakerSessionMode(sessionData),
          respectPlayerRest: sessionData.respectPlayerRest,
          excludedQuartetKey,
          excludedQuartetKeys,
          excludedPartitionKey,
          candidatePoolVariants: useAllActivePlayers
            ? (candidatePool) => [
                {
                  ...candidatePool,
                  includedBandValues: [
                    ...new Set(
                      candidatePool.activePlayers.map(
                        (player) => player.effectiveMatchCount
                      )
                    ),
                  ].sort((left, right) => left - right),
                  widened: true,
                  lockedPlayers: [],
                  requiredSelectableCount: 4,
                  selectablePlayers: [...candidatePool.activePlayers],
                  candidatePlayers: [...candidatePool.activePlayers],
                  tieZone: null,
                },
              ]
            : undefined,
          selectionConstraints: constraints,
        }).selection;

      if (targetPool) {
        return finishSelection(
          runLadder(
            ladderPlayers.filter(
              (player) => getNormalizedSessionPool(player.pool) === targetPool
            )
          )
        );
      }

      for (const tier of buildQuotaAwareQuartetTiers(
        ladderPlayers,
        composition,
        sessionData.respectPlayerRest,
        excludedQuartetKey,
        excludedQuartetKeys
      )) {
        const selection = runLadder(
          getQuotaTierPlayers(tier),
          buildQuotaTierConstraints(composition, tier),
          true
        );
        if (selection) return finishSelection(selection);
      }
      return null;
    }

    if (!v3Players) {
      return null;
    }

    const runV3 = (
      sourcePlayers: MatchmakerV3Player[],
      constraints = selectionConstraints,
      useAllActivePlayers = false
    ) =>
      findBestSingleCourtSelectionV3(sourcePlayers, {
        sessionMode: getMatchmakerSessionMode(sessionData),
        sessionType: getMatchmakerSessionType(sessionData),
        respectPlayerRest: sessionData.respectPlayerRest,
        completedMatches,
        excludedQuartetKey,
        excludedQuartetKeys,
        excludedPartitionKey,
        candidatePoolVariants: useAllActivePlayers
          ? (candidatePool) => [
              {
                ...candidatePool,
                includedBandValues: [
                  ...new Set(
                    candidatePool.activePlayers.map(
                      (player) => player.effectiveMatchCount
                    )
                  ),
                ].sort((left, right) => left - right),
                widened: true,
                lockedPlayers: [],
                requiredSelectableCount: 4,
                selectablePlayers: [...candidatePool.activePlayers],
                candidatePlayers: [...candidatePool.activePlayers],
                tieZone: null,
              },
            ]
          : undefined,
        selectionConstraints: constraints,
      }).selection;

    if (targetPool) {
      return finishSelection(
        runV3(
          v3Players.filter(
            (player) => getNormalizedSessionPool(player.pool) === targetPool
          )
        )
      );
    }

    for (const tier of buildQuotaAwareQuartetTiers(
      v3Players,
      composition,
      sessionData.respectPlayerRest,
      excludedQuartetKey,
      excludedQuartetKeys
    )) {
      const selection = runV3(
        getQuotaTierPlayers(tier),
        buildQuotaTierConstraints(composition, tier),
        true
      );
      if (selection) return finishSelection(selection);
    }
    return null;
  };

  return {
    activeCounts,
    waitingCounts,
    competitiveTargetRatio,
    runSelection,
  };
}

function selectPoolEnabledSingleCourtMatch({
  rankedCandidates,
  playersById,
  sessionData,
  reshuffleSource,
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  reshuffleSource: ReshuffleSource | null;
  requiredCourtGroupType?: CourtGroupType | string | null;
}): PoolAwareSelection {
  const runner = buildPlayerGroupSelectionRunner({
    rankedCandidates,
    playersById,
    sessionData,
  });

  const normalizedRequiredCourtGroupType = getNormalizedCourtGroupType(
    requiredCourtGroupType
  );
  const plans = buildPlayerGroupCourtPlans({
    requestedCourtCount: 1,
    activePoolAPlayerCount: runner.activeCounts[SessionPool.A],
    activePoolBPlayerCount: runner.activeCounts[SessionPool.B],
    waitingPoolAPlayerCount: runner.waitingCounts[SessionPool.A],
    waitingPoolBPlayerCount: runner.waitingCounts[SessionPool.B],
    history: getPlayerGroupHistory(sessionData),
  }).filter(
    (plan) =>
      !normalizedRequiredCourtGroupType ||
      plan.compositions[0]?.courtGroupType === normalizedRequiredCourtGroupType
  );

  for (const plan of plans) {
    const composition = plan.compositions[0];
    if (!composition) {
      continue;
    }

    const selection = applyReshuffleExclusions(
      runner.runSelection({ composition }),
      reshuffleSource,
      ({ excludedQuartetKey, excludedPartitionKey }) =>
        runner.runSelection({
          composition,
          excludedQuartetKey,
          excludedPartitionKey,
        })
    );

    if (selection) {
      return withMatchmakingReason(selection, sessionData);
    }
  }

  if (reshuffleSource || normalizedRequiredCourtGroupType) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle preserving this court type was available. Undo this match if you want the same players returned to the pool."
    );
  }

  throw new GenerateMatchError(
    400,
    `No valid pairing found for current ${getSessionModeLabel(
      getMatchmakerSessionMode(sessionData)
    )} session rules. Try changing player preferences.`
  );
}

export function applyPoolSelectionOutcome<
  T extends {
    poolsEnabled: boolean;
    poolACourtAssignments: number;
    poolBCourtAssignments: number;
    poolAMissedTurns: number;
    poolBMissedTurns: number;
  },
>(
  sessionData: T,
  outcome: Pick<PoolAwareSelection, "targetPool" | "missedPool">
) {
  if (!sessionData.poolsEnabled) {
    return sessionData;
  }

  return {
    ...sessionData,
    poolACourtAssignments:
      sessionData.poolACourtAssignments +
      (outcome.targetPool === SessionPool.A ? 1 : 0),
    poolBCourtAssignments:
      sessionData.poolBCourtAssignments +
      (outcome.targetPool === SessionPool.B ? 1 : 0),
    poolAMissedTurns:
      outcome.targetPool === SessionPool.A
        ? 0
        : sessionData.poolAMissedTurns +
          (outcome.missedPool === SessionPool.A ? 1 : 0),
    poolBMissedTurns:
      outcome.targetPool === SessionPool.B
        ? 0
        : sessionData.poolBMissedTurns +
          (outcome.missedPool === SessionPool.B ? 1 : 0),
  };
}

export function selectSingleCourtMatch({
  rankedCandidates,
  playersById,
  sessionData,
  reshuffleSource,
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
  requiredCourtGroupType?: CourtGroupType | string | null;
}) {
  if (isInterclubSession(sessionData)) {
    return withNoPlayerGroupSnapshot(
      selectInterclubSingleCourtMatch({
        rankedCandidates,
        playersById,
        sessionData,
        reshuffleSource,
      })
    );
  }

  if (sessionData.poolsEnabled) {
    return selectPoolEnabledSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      reshuffleSource,
      requiredCourtGroupType,
    });
  }

  const completedMatches = buildCompletedMatches(sessionData);
  const usesCompetitiveGrouping =
    getMatchmakerSessionType(sessionData) === SessionType.LADDER ||
    getMatchmakerSessionType(sessionData) === SessionType.RACE;
  const initialResult = usesCompetitiveGrouping
      ? findBestSingleCourtSelectionLadder(
          buildLadderPlayers(sessionData, playersById, rankedCandidates),
          {
            sessionMode: getMatchmakerSessionMode(sessionData),
            respectPlayerRest: sessionData.respectPlayerRest,
          }
        )
    : findBestSingleCourtSelectionV3(
        buildV3Players(sessionData, playersById, rankedCandidates),
        {
          sessionMode: getMatchmakerSessionMode(sessionData),
          sessionType: getMatchmakerSessionType(sessionData),
          respectPlayerRest: sessionData.respectPlayerRest,
          completedMatches,
        }
      );

  if (!initialResult.selection) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${getSessionModeLabel(
        getMatchmakerSessionMode(sessionData)
      )} session rules. Try changing player preferences.`
    );
  }

  if (!reshuffleSource) {
    return withMatchmakingReason(initialResult.selection, sessionData);
  }

  if (usesCompetitiveGrouping) {
    const competitivePlayers = buildLadderPlayers(
      sessionData,
      playersById,
      rankedCandidates
    );
    const previousQuartetKey = getV3QuartetKey(reshuffleSource.ids);
    const previousPartitionKey = getExactPartitionKey(reshuffleSource.partition);
    const selectedQuartetKey = getV3QuartetKey(initialResult.selection.ids);
    const selectedPartitionKey = getExactPartitionKey(
      initialResult.selection.partition
    );

    if (selectedQuartetKey !== previousQuartetKey) {
      return withMatchmakingReason(initialResult.selection, sessionData);
    }

    const alternativeQuartet = findBestSingleCourtSelectionLadder(
      competitivePlayers,
      {
        sessionMode: getMatchmakerSessionMode(sessionData),
        respectPlayerRest: sessionData.respectPlayerRest,
        excludedQuartetKey: previousQuartetKey,
      }
    );

    if (alternativeQuartet.selection) {
      return withMatchmakingReason(alternativeQuartet.selection, sessionData);
    }

    if (selectedPartitionKey !== previousPartitionKey) {
      return withMatchmakingReason(initialResult.selection, sessionData);
    }

    const alternativePartition = findBestSingleCourtSelectionLadder(
      competitivePlayers,
      {
        sessionMode: getMatchmakerSessionMode(sessionData),
        respectPlayerRest: sessionData.respectPlayerRest,
        excludedPartitionKey: previousPartitionKey,
      }
    );

    if (!alternativePartition.selection) {
      throw new GenerateMatchError(
        409,
        "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
      );
    }

    return withMatchmakingReason(alternativePartition.selection, sessionData);
  }

  const v3Players = buildV3Players(sessionData, playersById, rankedCandidates);
  const previousQuartetKey = getV3QuartetKey(reshuffleSource.ids);
  const previousPartitionKey = getExactPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = getV3QuartetKey(initialResult.selection.ids);
  const selectedPartitionKey = getExactPartitionKey(
    initialResult.selection.partition
  );

  if (selectedQuartetKey !== previousQuartetKey) {
    return withMatchmakingReason(initialResult.selection, sessionData);
  }

  const alternativeQuartet = findBestSingleCourtSelectionV3(v3Players, {
    sessionMode: getMatchmakerSessionMode(sessionData),
    sessionType: getMatchmakerSessionType(sessionData),
    respectPlayerRest: sessionData.respectPlayerRest,
    completedMatches,
    excludedQuartetKey: previousQuartetKey,
  });

  if (alternativeQuartet.selection) {
    return withMatchmakingReason(alternativeQuartet.selection, sessionData);
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return withMatchmakingReason(initialResult.selection, sessionData);
  }

  const alternativePartition = findBestSingleCourtSelectionV3(v3Players, {
    sessionMode: getMatchmakerSessionMode(sessionData),
    sessionType: getMatchmakerSessionType(sessionData),
    respectPlayerRest: sessionData.respectPlayerRest,
    completedMatches,
    excludedPartitionKey: previousPartitionKey,
  });

  if (!alternativePartition.selection) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  return withMatchmakingReason(alternativePartition.selection, sessionData);
}

function selectExactQuartetMatch({
  rankedCandidates,
  playersById,
  sessionData,
  selectedIds,
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  selectedIds: [string, string, string, string];
  requiredCourtGroupType?: CourtGroupType | string | null;
}) {
  const selectedUserIds = new Set(selectedIds);
  const exactRankedCandidates = rankedCandidates.filter((candidate) =>
    selectedUserIds.has(candidate.userId)
  );

  if (exactRankedCandidates.length !== 4) {
    return null;
  }

  const usesCompetitiveGrouping =
    getMatchmakerSessionType(sessionData) === SessionType.LADDER ||
    getMatchmakerSessionType(sessionData) === SessionType.RACE;
  const activeCounts = getPoolActiveCounts(sessionData);
  const activePlayerCount = activeCounts[SessionPool.A] + activeCounts[SessionPool.B];
  const competitiveTargetRatio =
    activePlayerCount > 0
      ? activeCounts[SessionPool.A] / activePlayerCount
      : 0.5;
  const selectedPoolACount = exactRankedCandidates.filter(
    (candidate) => getNormalizedSessionPool(candidate.pool) === SessionPool.A
  ).length;
  const normalizedRequiredCourtGroupType = getNormalizedCourtGroupType(
    requiredCourtGroupType
  );
  const requiredComposition =
    sessionData.poolsEnabled && normalizedRequiredCourtGroupType
      ? {
          courtGroupType: normalizedRequiredCourtGroupType,
          poolASeatCount:
            normalizedRequiredCourtGroupType === CourtGroupType.COMPETITIVE
              ? 4
              : normalizedRequiredCourtGroupType === CourtGroupType.SOCIAL
                ? 0
                : normalizedRequiredCourtGroupType === CourtGroupType.CROSSOVER
                  ? 2
                  : selectedPoolACount,
          poolBSeatCount:
            normalizedRequiredCourtGroupType === CourtGroupType.COMPETITIVE
              ? 0
              : normalizedRequiredCourtGroupType === CourtGroupType.SOCIAL
                ? 4
                : normalizedRequiredCourtGroupType === CourtGroupType.CROSSOVER
                  ? 2
                  : 4 - selectedPoolACount,
        }
      : null;
  const selectionConstraints = requiredComposition
    ? getPlayerGroupSelectionConstraints(requiredComposition)
    : undefined;

  const finishSelection = <TSelection extends {
    ids: [string, string, string, string];
    partition: { team1: [string, string]; team2: [string, string] };
  }>(selection: TSelection | null) => {
    if (!selection) {
      return null;
    }

    if (!sessionData.poolsEnabled) {
      return withMatchmakingReason(selection, sessionData);
    }

    const snapshot = getSelectionSnapshot(sessionData, selection.partition);
    if (
      normalizedRequiredCourtGroupType &&
      snapshot.courtGroupType !== normalizedRequiredCourtGroupType
    ) {
      return null;
    }

    return withMatchmakingReason(
      {
        ...selection,
        ...snapshot,
        targetPool:
          snapshot.courtGroupType === CourtGroupType.COMPETITIVE
            ? SessionPool.A
            : snapshot.courtGroupType === CourtGroupType.SOCIAL
              ? SessionPool.B
              : null,
        missedPool: null,
        competitiveTargetRatio,
      },
      sessionData
    );
  };

  if (usesCompetitiveGrouping) {
    const result = findBestSingleCourtSelectionLadder(
      buildLadderPlayers(sessionData, playersById, exactRankedCandidates),
      {
        sessionMode: getMatchmakerSessionMode(sessionData),
        respectPlayerRest: sessionData.respectPlayerRest,
        selectionConstraints,
      }
    );

    return finishSelection(result.selection);
  }

  const result = findBestSingleCourtSelectionV3(
    buildV3Players(sessionData, playersById, exactRankedCandidates),
    {
      sessionMode: getMatchmakerSessionMode(sessionData),
      sessionType: getMatchmakerSessionType(sessionData),
      respectPlayerRest: sessionData.respectPlayerRest,
      completedMatches: buildCompletedMatches(sessionData),
      selectionConstraints,
    }
  );

  return finishSelection(result.selection);
}

export function selectReplacementMatch({
  rankedCandidates,
  playersById,
  sessionData,
  retainedUserIds,
  excludedUserIds = [],
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  retainedUserIds: [string, string, string];
  excludedUserIds?: string[];
  requiredCourtGroupType?: CourtGroupType | string | null;
}) {
  if (isInterclubSession(sessionData)) {
    return withNoPlayerGroupSnapshot(
      selectInterclubReplacementMatch({
        rankedCandidates,
        playersById,
        sessionData,
        retainedUserIds,
        excludedUserIds,
      })
    );
  }

  const retainedUserIdSet = new Set(retainedUserIds);
  if (retainedUserIdSet.size !== 3) {
    throw new GenerateMatchError(
      400,
      "Replace player requires exactly three retained players."
    );
  }

  const excludedUserIdSet = new Set(excludedUserIds);

  for (const candidate of rankedCandidates) {
    if (
      retainedUserIdSet.has(candidate.userId) ||
      excludedUserIdSet.has(candidate.userId)
    ) {
      continue;
    }

    const selection = selectExactQuartetMatch({
      rankedCandidates,
      playersById,
      sessionData,
      selectedIds: [...retainedUserIds, candidate.userId],
      requiredCourtGroupType,
    });

    if (selection) {
      return selection;
    }
  }

  throw new GenerateMatchError(
    409,
    "No eligible replacement player was available for this match."
  );
}

function getSkipNextAlternativeError() {
  return new GenerateMatchError(
    409,
    "No alternative match was available after honoring skip-next requests. Cancel skip next for a player or choose manually."
  );
}

function getSelectionUserIds(selection: { ids: readonly string[] }) {
  return [...selection.ids];
}

function getBatchSelectionUserIds(selection: {
  selections: Array<{ ids: readonly string[] }>;
}) {
  return selection.selections.flatMap((matchSelection) =>
    getSelectionUserIds(matchSelection)
  );
}

function filterRankedCandidatesByExcludedUserIds(
  rankedCandidates: RankedCandidates,
  excludedUserIds: ReadonlySet<string>
) {
  if (excludedUserIds.size === 0) {
    return rankedCandidates;
  }

  return rankedCandidates.filter(
    (candidate) => !excludedUserIds.has(candidate.userId)
  );
}

function appendUniqueUserIds(target: string[], userIds: readonly string[]) {
  for (const userId of userIds) {
    if (!target.includes(userId)) {
      target.push(userId);
    }
  }
}

export function selectSingleCourtMatchRespectingSkips({
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  reshuffleSource,
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
  requiredCourtGroupType?: CourtGroupType | string | null;
}) {
  const pendingSkipUserIds = getPendingSkipNextUserIds(sessionData.players);
  const excludedSkipUserIds = new Set<string>();
  const consumedSkipUserIds: string[] = [];

  for (let attempt = 0; attempt <= pendingSkipUserIds.size; attempt += 1) {
    const eligibleRankedCandidates = filterRankedCandidatesByExcludedUserIds(
      rankedCandidates,
      excludedSkipUserIds
    );

    if (eligibleRankedCandidates.length < 4) {
      throw getSkipNextAlternativeError();
    }

    let selection: ReturnType<typeof selectSingleCourtMatch>;
    try {
      selection = selectSingleCourtMatch({
        rankedCandidates: eligibleRankedCandidates,
        playersById,
        sessionData,
        rotationHistory,
        reshuffleSource,
        requiredCourtGroupType,
      });
    } catch (error) {
      if (consumedSkipUserIds.length > 0 && error instanceof GenerateMatchError) {
        throw getSkipNextAlternativeError();
      }

      throw error;
    }

    const selectedSkipUserIds = getSkippedSelectionUserIds(
      getSelectionUserIds(selection),
      pendingSkipUserIds,
      excludedSkipUserIds
    );

    if (selectedSkipUserIds.length === 0) {
      return { selection, consumedSkipUserIds };
    }

    appendUniqueUserIds(consumedSkipUserIds, selectedSkipUserIds);
    for (const userId of selectedSkipUserIds) {
      excludedSkipUserIds.add(userId);
    }
  }

  throw getSkipNextAlternativeError();
}

export function selectReplacementMatchRespectingSkips({
  rankedCandidates,
  playersById,
  sessionData,
  retainedUserIds,
  excludedUserIds = [],
  requiredCourtGroupType,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  retainedUserIds: [string, string, string];
  excludedUserIds?: string[];
  requiredCourtGroupType?: CourtGroupType | string | null;
}) {
  const pendingSkipUserIds = getPendingSkipNextUserIds(sessionData.players);
  const retainedUserIdSet = new Set(retainedUserIds);
  const excludedSkipUserIds = new Set<string>();
  const consumedSkipUserIds: string[] = [];

  for (let attempt = 0; attempt <= pendingSkipUserIds.size; attempt += 1) {
    let selection: ReturnType<typeof selectReplacementMatch>;
    try {
      selection = selectReplacementMatch({
        rankedCandidates,
        playersById,
        sessionData,
        retainedUserIds,
        excludedUserIds: [...excludedUserIds, ...excludedSkipUserIds],
        requiredCourtGroupType,
      });
    } catch (error) {
      if (consumedSkipUserIds.length > 0 && error instanceof GenerateMatchError) {
        throw getSkipNextAlternativeError();
      }

      throw error;
    }

    const selectedSkipUserIds = getSkippedSelectionUserIds(
      getSelectionUserIds(selection),
      pendingSkipUserIds,
      new Set([...excludedSkipUserIds, ...retainedUserIdSet])
    );

    if (selectedSkipUserIds.length === 0) {
      return { selection, consumedSkipUserIds };
    }

    appendUniqueUserIds(consumedSkipUserIds, selectedSkipUserIds);
    for (const userId of selectedSkipUserIds) {
      excludedSkipUserIds.add(userId);
    }
  }

  throw getSkipNextAlternativeError();
}

function compareGroupedBatchSelections(
  left: readonly PoolAwareSelection[],
  right: readonly PoolAwareSelection[],
  sessionData: GenerateMatchSession
) {
  const getPlayers = (selections: readonly PoolAwareSelection[]) =>
    selections.flatMap((selection) =>
      "players" in selection && Array.isArray(selection.players)
        ? (selection.players as Array<{
            effectiveMatchCount?: number;
            moreRestDeficit?: number;
            restTurns?: number;
            arrivalPriorityAt?: Date | string | null;
          }>)
        : []
    );
  const leftPlayers = getPlayers(left);
  const rightPlayers = getPlayers(right);
  const fairnessCompare = compareNumberVectors(
    leftPlayers
      .map((player) => player.effectiveMatchCount ?? 0)
      .sort((a, b) => a - b),
    rightPlayers
      .map((player) => player.effectiveMatchCount ?? 0)
      .sort((a, b) => a - b)
  );
  if (fairnessCompare !== 0) return fairnessCompare;

  const leftPriorityTimes = leftPlayers
    .map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);
  const rightPriorityTimes = rightPlayers
    .map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
    .filter((time): time is number => time !== null)
    .sort((a, b) => a - b);
  if (leftPriorityTimes.length !== rightPriorityTimes.length) {
    return rightPriorityTimes.length - leftPriorityTimes.length;
  }
  const priorityCompare = compareNumberVectors(
    leftPriorityTimes,
    rightPriorityTimes
  );
  if (priorityCompare !== 0) return priorityCompare;

  if (sessionData.respectPlayerRest) {
    const leftDeficit = leftPlayers.reduce(
      (sum, player) => sum + (player.moreRestDeficit ?? 0),
      0
    );
    const rightDeficit = rightPlayers.reduce(
      (sum, player) => sum + (player.moreRestDeficit ?? 0),
      0
    );
    if (leftDeficit !== rightDeficit) return leftDeficit - rightDeficit;

    const restCompare = compareNumberVectors(
      leftPlayers.map((player) => player.restTurns ?? 0).sort((a, b) => b - a),
      rightPlayers.map((player) => player.restTurns ?? 0).sort((a, b) => b - a),
      -1
    );
    if (restCompare !== 0) return restCompare;
  }

  const usesLevelMatch =
    getMatchmakerSessionType(sessionData) === SessionType.LADDER ||
    getMatchmakerSessionType(sessionData) === SessionType.RACE;

  if (usesLevelMatch) {
    const getLadderMetrics = (selections: readonly PoolAwareSelection[]) => {
      const typed = selections as Array<
        PoolAwareSelection & {
          groupingSummary?: {
            maxLadderGap: number;
            totalLadderGap: number;
            totalPointDiffGap: number;
          };
          balanceGap?: number;
          pointDiffGap?: number;
          strengthGap?: number;
          randomScore?: number;
        }
      >;
      const values = typed.map((selection) => ({
        maxLadderGap: selection.groupingSummary?.maxLadderGap ?? 0,
        totalLadderGap: selection.groupingSummary?.totalLadderGap ?? 0,
        totalPointDiffGap:
          selection.groupingSummary?.totalPointDiffGap ?? 0,
        balanceGap: selection.balanceGap ?? 0,
        pointDiffGap: selection.pointDiffGap ?? 0,
        strengthGap: selection.strengthGap ?? 0,
        randomScore: selection.randomScore ?? 0,
      }));
      return [
        Math.max(...values.map((value) => value.maxLadderGap), 0),
        values.reduce((sum, value) => sum + value.totalLadderGap, 0),
        values.reduce((sum, value) => sum + value.totalPointDiffGap, 0),
        Math.max(...values.map((value) => value.balanceGap), 0),
        values.reduce((sum, value) => sum + value.balanceGap, 0),
        Math.max(...values.map((value) => value.pointDiffGap), 0),
        values.reduce((sum, value) => sum + value.pointDiffGap, 0),
        Math.max(...values.map((value) => value.strengthGap), 0),
        values.reduce((sum, value) => sum + value.strengthGap, 0),
        values.reduce((sum, value) => sum + value.randomScore, 0),
      ];
    };

    return compareNumberVectors(
      getLadderMetrics(left),
      getLadderMetrics(right)
    );
  }

  const getV3Metrics = (selections: readonly PoolAwareSelection[]) => {
    const typed = selections as Array<
      PoolAwareSelection & {
        balanceGap?: number;
        pointDiffGap?: number;
        sharedCourtRepeatPenalty?: number;
        partnerCoveragePenalty?: number;
        opponentCoveragePenalty?: number;
        partnerRepeatPenalty?: number;
        opponentRepeatPenalty?: number;
        exactRematchPenalty?: number;
        randomScore?: number;
      }
    >;
    const values = typed.map((selection) => ({
      balanceGap: selection.balanceGap ?? 0,
      pointDiffGap: selection.pointDiffGap ?? 0,
      shared: selection.sharedCourtRepeatPenalty ?? 0,
      partnerCoverage: selection.partnerCoveragePenalty ?? 0,
      opponentCoverage: selection.opponentCoveragePenalty ?? 0,
      partner: selection.partnerRepeatPenalty ?? 0,
      opponent: selection.opponentRepeatPenalty ?? 0,
      rematch: selection.exactRematchPenalty ?? 0,
      random: selection.randomScore ?? 0,
    }));
    const balance = [
      Math.max(...values.map((value) => value.balanceGap), 0),
      values.reduce((sum, value) => sum + value.balanceGap, 0),
      Math.max(...values.map((value) => value.pointDiffGap), 0),
      values.reduce((sum, value) => sum + value.pointDiffGap, 0),
    ];
    const variety = [
      values.reduce((sum, value) => sum + value.shared, 0),
      values.reduce((sum, value) => sum + value.partnerCoverage, 0),
      values.reduce((sum, value) => sum + value.opponentCoverage, 0),
      values.reduce((sum, value) => sum + value.partner, 0),
      values.reduce((sum, value) => sum + value.opponent, 0),
      values.reduce((sum, value) => sum + value.rematch, 0),
    ];
    const random = values.reduce((sum, value) => sum + value.random, 0);

    return getMatchmakerSessionType(sessionData) === SessionType.SOCIAL_MIX
      ? [...variety, ...balance, random]
      : [...balance, ...variety, random];
  };

  return compareNumberVectors(getV3Metrics(left), getV3Metrics(right));
}

export function selectBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  requestedMatchCount,
  requestedCourtIds,
  randomFn,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
  requestedCourtIds?: string[];
  randomFn?: () => number;
}) {
  if (isInterclubSession(sessionData)) {
    const result = selectInterclubBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      requestedMatchCount,
      randomFn,
    });

    return {
      ...result,
      selections: result.selections.map(withNoPlayerGroupSnapshot),
    };
  }

  if (sessionData.poolsEnabled) {
    const activeCounts = getPoolActiveCounts(sessionData);
    const waitingCounts = getPoolWaitingCounts(sessionData, rankedCandidates);
    const plans = buildPlayerGroupCourtPlans({
      requestedCourtCount: requestedMatchCount,
      activePoolAPlayerCount: activeCounts[SessionPool.A],
      activePoolBPlayerCount: activeCounts[SessionPool.B],
      waitingPoolAPlayerCount: waitingCounts[SessionPool.A],
      waitingPoolBPlayerCount: waitingCounts[SessionPool.B],
      history: getPlayerGroupHistory(sessionData),
    });

    const orderForPhysicalCourts = (
      compositions: readonly PlayerGroupCourtComposition[]
    ) => {
      const physicalCourtIds = requestedCourtIds?.slice(0, compositions.length);
      if (!physicalCourtIds || physicalCourtIds.length !== compositions.length) {
        return [...compositions];
      }

      const matchesByCreatedAt = [...sessionData.matches].sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
      );
      const courtTypeHistory = new Map<string, Array<CourtGroupType | string>>();

      for (const match of matchesByCreatedAt) {
        const snapshot = match as typeof match & PlayerGroupHistorySnapshot;
        if (!snapshot.courtGroupType) {
          continue;
        }
        const history = courtTypeHistory.get(match.courtId) ?? [];
        history.push(snapshot.courtGroupType);
        courtTypeHistory.set(match.courtId, history);
      }

      const recentTypes = getPlayerGroupHistory(sessionData)
        .slice(-2)
        .map((snapshot) => snapshot.courtGroupType ?? null);
      const remaining = [...compositions];
      const ordered: PlayerGroupCourtComposition[] = [];

      for (const courtId of physicalCourtIds) {
        const crossoverDue =
          recentTypes.length >= 2 &&
          recentTypes
            .slice(-2)
            .every((type) => type !== CourtGroupType.CROSSOVER) &&
          remaining.some(
            (composition) =>
              composition.courtGroupType === CourtGroupType.CROSSOVER
          );
        const candidateIndexes = remaining
          .map((_, index) => index)
          .filter(
            (index) =>
              !crossoverDue ||
              remaining[index].courtGroupType === CourtGroupType.CROSSOVER
          );
        const physicalHistory = courtTypeHistory.get(courtId) ?? [];

        candidateIndexes.sort((leftIndex, rightIndex) => {
          const left = remaining[leftIndex];
          const right = remaining[rightIndex];
          const lastType = physicalHistory.at(-1);
          const leftLastRepeat = lastType === left.courtGroupType ? 1 : 0;
          const rightLastRepeat = lastType === right.courtGroupType ? 1 : 0;
          if (leftLastRepeat !== rightLastRepeat) {
            return leftLastRepeat - rightLastRepeat;
          }

          const leftHistoryCount = physicalHistory.filter(
            (type) => type === left.courtGroupType
          ).length;
          const rightHistoryCount = physicalHistory.filter(
            (type) => type === right.courtGroupType
          ).length;
          if (leftHistoryCount !== rightHistoryCount) {
            return leftHistoryCount - rightHistoryCount;
          }

          return leftIndex - rightIndex;
        });

        const [selected] = remaining.splice(candidateIndexes[0], 1);
        ordered.push(selected);
        recentTypes.push(selected.courtGroupType);
        if (recentTypes.length > 2) {
          recentTypes.shift();
        }
      }

      return ordered;
    };

    const searchPlan = (
      compositions: readonly PlayerGroupCourtComposition[]
    ): PoolAwareSelection[] | null => {
      let bestSelections: PoolAwareSelection[] | null = null;
      let exploredBranches = 0;
      const deadline = Date.now() + MAX_GROUP_BATCH_SEARCH_MS;

      const backtrack = (
        workingRankedCandidates: RankedCandidates,
        selections: PoolAwareSelection[]
      ) => {
        exploredBranches += 1;
        if (selections.length === compositions.length) {
          if (
            !bestSelections ||
            compareGroupedBatchSelections(
              selections,
              bestSelections,
              sessionData
            ) < 0
          ) {
            bestSelections = selections;
          }
          return;
        }

        if (
          exploredBranches > MAX_GROUP_BATCH_SEARCH_BRANCHES ||
          (bestSelections && Date.now() >= deadline)
        ) {
          return;
        }

        const remainingCourts = compositions.length - selections.length;
        if (workingRankedCandidates.length < remainingCourts * 4) return;

        const composition = compositions[selections.length];
        const runner = buildPlayerGroupSelectionRunner({
          rankedCandidates: workingRankedCandidates,
          playersById,
          sessionData,
        });
        const excludedQuartetKeys = new Set<string>();
        while (
          excludedQuartetKeys.size < MAX_POOL_SELECTION_OPTIONS_PER_PLAN
        ) {
          const selection = runner.runSelection({
            composition,
            excludedQuartetKeys,
          });
          if (!selection) break;

          const quartetKey = getV3QuartetKey(selection.ids);
          if (excludedQuartetKeys.has(quartetKey)) break;
          excludedQuartetKeys.add(quartetKey);

          const selectedIds = new Set(selection.ids);
          backtrack(
            workingRankedCandidates.filter(
              (candidate) => !selectedIds.has(candidate.userId)
            ),
            [...selections, selection]
          );
          if (
            exploredBranches > MAX_GROUP_BATCH_SEARCH_BRANCHES ||
            Date.now() >= deadline
          ) {
            break;
          }
        }
      };

      backtrack(rankedCandidates, []);
      return bestSelections;
    };

    for (const plan of plans) {
      const compositions = orderForPhysicalCourts(plan.compositions);
      const selections = searchPlan(compositions);

      if (selections) {
        return {
          selections: selections.map((selection) =>
            withMatchmakingReason(selection, sessionData)
          ),
          poolSchedulingState: sessionData,
          competitiveTargetRatio: plan.competitiveTargetRatio,
        };
      }
    }

    throw new GenerateMatchError(
      400,
      `No valid set of matches found for current ${getSessionModeLabel(
        getMatchmakerSessionMode(sessionData)
      )} session rules. Try changing player preferences.`
    );
  }

  if (
    getMatchmakerSessionType(sessionData) === SessionType.LADDER ||
    getMatchmakerSessionType(sessionData) === SessionType.RACE
  ) {
    const result = findBestBatchSelectionLadder(
      buildLadderPlayers(sessionData, playersById, rankedCandidates),
      {
        courtCount: requestedMatchCount,
        sessionMode: getMatchmakerSessionMode(sessionData),
        respectPlayerRest: sessionData.respectPlayerRest,
      }
    );

    if (!result.selection) {
      throw new GenerateMatchError(
        400,
        `No valid set of matches found for current ${getSessionModeLabel(
          getMatchmakerSessionMode(sessionData)
        )} session rules. Try changing player preferences.`
      );
    }

    return {
      ...result.selection,
      selections: result.selection.selections.map((selection) =>
        withMatchmakingReason(selection, sessionData)
      ),
    };
  }

  const result = findBestBatchSelectionV3(
    buildV3Players(sessionData, playersById, rankedCandidates),
    {
      courtCount: requestedMatchCount,
      sessionMode: getMatchmakerSessionMode(sessionData),
      sessionType: getMatchmakerSessionType(sessionData),
      respectPlayerRest: sessionData.respectPlayerRest,
      completedMatches: buildCompletedMatches(sessionData),
      randomFn,
    }
  );

  if (!result.selection) {
    throw new GenerateMatchError(
      400,
      getV3BatchFailureMessage({
        debug: result.debug,
        rankedCandidates,
        requestedMatchCount,
        sessionData,
      })
    );
  }

  return {
    ...result.selection,
    selections: result.selection.selections.map((selection) =>
      withMatchmakingReason(selection, sessionData)
    ),
  };
}

export function selectBatchMatchesRespectingSkips({
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  requestedMatchCount,
  requestedCourtIds,
  randomFn,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
  requestedCourtIds?: string[];
  randomFn?: () => number;
}) {
  const pendingSkipUserIds = getPendingSkipNextUserIds(sessionData.players);
  const excludedSkipUserIds = new Set<string>();
  const consumedSkipUserIds: string[] = [];

  for (let attempt = 0; attempt <= pendingSkipUserIds.size; attempt += 1) {
    const eligibleRankedCandidates = filterRankedCandidatesByExcludedUserIds(
      rankedCandidates,
      excludedSkipUserIds
    );

    const minimumRequiredPlayerCount = sessionData.poolsEnabled
      ? 4
      : requestedMatchCount * 4;
    if (eligibleRankedCandidates.length < minimumRequiredPlayerCount) {
      throw getSkipNextAlternativeError();
    }

    let selection: ReturnType<typeof selectBatchMatches>;
    try {
      selection = selectBatchMatches({
        rankedCandidates: eligibleRankedCandidates,
        playersById,
        sessionData,
        rotationHistory,
        requestedMatchCount,
        requestedCourtIds,
        randomFn,
      });
    } catch (error) {
      if (consumedSkipUserIds.length > 0 && error instanceof GenerateMatchError) {
        throw getSkipNextAlternativeError();
      }

      throw error;
    }

    const selectedSkipUserIds = getSkippedSelectionUserIds(
      getBatchSelectionUserIds(selection),
      pendingSkipUserIds,
      excludedSkipUserIds
    );

    if (selectedSkipUserIds.length === 0) {
      return { selection, consumedSkipUserIds };
    }

    appendUniqueUserIds(consumedSkipUserIds, selectedSkipUserIds);
    for (const userId of selectedSkipUserIds) {
      excludedSkipUserIds.add(userId);
    }
  }

  throw getSkipNextAlternativeError();
}
