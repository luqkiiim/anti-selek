import {
  getSideSpecificCourtCreateMixedSide,
  getSideSpecificCourtCreateShortageMessage,
  type SideSpecificCourtCreateType,
} from "@/lib/courtCreate";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { prisma } from "@/lib/prisma";
import {
  getAcceptedSessionCommunityIds,
  getPlayerCommunityBadges,
} from "@/lib/sessionCollab";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import {
  getNormalizedSessionPool,
  getOppositeSessionPool,
  getSessionPoolCourtAssignments,
  getSessionPoolCrossoverMissThreshold,
  getSessionPoolMissedTurns,
  SESSION_POOL_IDS,
} from "@/lib/sessionPools";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { buildV3MatchmakingReasonJson } from "@/lib/matchmaking/matchReason";
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
  MixedSide,
  MatchStatus,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  type ReshuffleSource,
} from "./shared";

type AvailableCandidate = {
  userId: string;
  matchesPlayed: number;
  matchmakingMatchesCredit: number;
  matchmakingBaseline: number;
  availableSince: Date;
  strength: number;
  pool?: string | null;
  isBusy: false;
  isPaused: false;
};

type RankedCandidates = ReturnType<typeof buildActivePlayers<AvailableCandidate>>;

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}

interface PoolAwareSelection {
  ids: [string, string, string, string];
  partition: {
    team1: [string, string];
    team2: [string, string];
  };
  targetPool?: SessionPool | null;
  missedPool?: SessionPool | null;
  matchmakingReasonJson?: string | null;
}

const MAX_POOL_SELECTION_OPTIONS_PER_PLAN = 64;

function getV3QuartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function isV3Selection(
  selection: PoolAwareSelection | V3SingleCourtSelection
): selection is PoolAwareSelection & V3SingleCourtSelection {
  return (
    "players" in selection &&
    Array.isArray(selection.players) &&
    "waitSummary" in selection &&
    typeof selection.balanceGap === "number" &&
    typeof selection.pointDiffGap === "number" &&
    typeof selection.partnerRepeatPenalty === "number" &&
    typeof selection.opponentRepeatPenalty === "number" &&
    typeof selection.exactRematchPenalty === "number"
  );
}

function withMatchmakingReason<
  TSelection extends PoolAwareSelection | V3SingleCourtSelection,
>(selection: TSelection, sessionData: GenerateMatchSession) {
  if (!isV3Selection(selection)) {
    return {
      ...selection,
      matchmakingReasonJson: null,
    };
  }

    return {
      ...selection,
      matchmakingReasonJson: buildV3MatchmakingReasonJson(selection, {
        sessionType: sessionData.type as SessionType,
        sessionMode: sessionData.mode as SessionMode,
        targetPool: "targetPool" in selection ? selection.targetPool ?? null : null,
        missedPool: "missedPool" in selection ? selection.missedPool ?? null : null,
        respectPlayerRest: sessionData.respectPlayerRest,
      }),
    };
  }

function getPlayerBalanceInput({
  sessionType,
  sessionPoints,
  communityElo,
  userElo,
}: {
  sessionType: SessionType;
  sessionPoints: number;
  communityElo?: number;
  userElo: number;
}) {
  switch (sessionType) {
    case SessionType.POINTS:
    case SessionType.SOCIAL_MIX:
      return sessionPoints;
    case SessionType.ELO:
      return communityElo ?? userElo;
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

function chooseDuePool(
  sessionData: GenerateMatchSession,
  rankedCandidates: RankedCandidates
) {
  if (!sessionData.poolsEnabled) {
    return null;
  }

  const activeCounts = getPoolActiveCounts(sessionData);
  const waitingCounts = getPoolWaitingCounts(sessionData, rankedCandidates);
  const poolsWithWaiting = SESSION_POOL_IDS.filter(
    (pool) => waitingCounts[pool] > 0 && activeCounts[pool] > 0
  );

  if (poolsWithWaiting.length === 0) {
    return null;
  }

  return poolsWithWaiting.sort((left, right) => {
    const leftAssignments = getSessionPoolCourtAssignments(sessionData, left);
    const rightAssignments = getSessionPoolCourtAssignments(sessionData, right);
    const leftRatio = leftAssignments / Math.max(activeCounts[left], 1);
    const rightRatio = rightAssignments / Math.max(activeCounts[right], 1);

    if (leftRatio !== rightRatio) {
      return leftRatio - rightRatio;
    }

    const leftMissedTurns = getSessionPoolMissedTurns(sessionData, left);
    const rightMissedTurns = getSessionPoolMissedTurns(sessionData, right);
    if (leftMissedTurns !== rightMissedTurns) {
      return rightMissedTurns - leftMissedTurns;
    }

    if (waitingCounts[left] !== waitingCounts[right]) {
      return waitingCounts[right] - waitingCounts[left];
    }

    if (leftAssignments !== rightAssignments) {
      return leftAssignments - rightAssignments;
    }

    return left === SessionPool.A ? -1 : 1;
  })[0];
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
    strength:
      playersById.get(player.userId)?.elo ??
      (sessionData.type === SessionType.POINTS ||
      sessionData.type === SessionType.SOCIAL_MIX
        ? player.sessionPoints
        : player.user.elo),
    pointDiff: playersById.get(player.userId)?.pointDiff ?? 0,
    isBusy: !player.isPaused && !availableUserIds.has(player.userId),
    isPaused: player.isPaused,
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
  const ladderEntryAtByUserId = new Map(
    sessionData.players.map((player) => [
      player.userId,
      getCompetitiveEntryAt(player),
    ])
  );
  const ladderRecordByUserId =
    sessionData.type === SessionType.RACE
      ? deriveRaceRecordsByEntryTime(
          ladderEntryAtByUserId,
          buildCompletedMatches(sessionData)
        )
      : deriveLadderRecordsByEntryTime(
          ladderEntryAtByUserId,
          buildCompletedMatches(sessionData)
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
      strength: playersById.get(player.userId)?.elo ?? 0,
      wins: record.wins,
      losses: record.losses,
      pointDiff: record.pointDiff,
      ladderScore: record.ladderScore,
      isBusy: !player.isPaused && !availableUserIds.has(player.userId),
      isPaused: player.isPaused,
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
  const sessionCommunityIds =
    sessionData.type === SessionType.ELO &&
    sessionData.communityId &&
    sessionData.players.length > 0
      ? await getAcceptedSessionCommunityIds(prisma, sessionData)
      : [];
  const playerIds = sessionData.players.map((player) => player.userId);
  const hostCommunityId = sessionData.communityId;
  let usesLegacySingleCommunityElo = false;
  let legacyCommunityEloByUserId = new Map<string, number>();

  if (
    typeof hostCommunityId === "string" &&
    sessionCommunityIds.length === 1 &&
    sessionCommunityIds[0] === hostCommunityId
  ) {
    usesLegacySingleCommunityElo = true;
    legacyCommunityEloByUserId = await getCommunityEloByUserId(
      hostCommunityId,
      playerIds
    );
  }

  const communityBadgesByUserId =
    sessionCommunityIds.length > 0 && !usesLegacySingleCommunityElo
      ? await getPlayerCommunityBadges(prisma, sessionCommunityIds, playerIds)
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
          sessionType: sessionData.type as SessionType,
          sessionPoints: player.sessionPoints,
        communityElo:
          legacyCommunityEloByUserId.get(player.userId) ??
          communityBadgesByUserId
            .get(player.userId)
            ?.find((badge) => badge.id === sessionData.communityId)?.elo ??
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
      strength: 0,
      pool: player.pool,
      isBusy: false,
      isPaused: false,
    }));

  return {
    availableCandidates,
    rankedCandidates: buildActivePlayers(availableCandidates, {
      randomFn: () => 0,
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
  const modeLabel = getSessionModeLabel(sessionData.mode);
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
    sessionData.mode === SessionMode.MIXICANO
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

function getMissedPoolOutcome(
  duePool: SessionPool,
  selectedPool: SessionPool,
  waitingCounts: Record<SessionPool, number>
) {
  return selectedPool !== duePool && waitingCounts[duePool] > 0 ? duePool : null;
}

function buildPoolSelectionPlanner({
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
    sessionData.type === SessionType.LADDER ||
    sessionData.type === SessionType.RACE;
  const waitingCounts = getPoolWaitingCounts(sessionData, rankedCandidates);
  const duePool = chooseDuePool(sessionData, rankedCandidates);

  if (!duePool) {
    return null;
  }

  const v3Players = usesCompetitiveGrouping
    ? null
    : buildV3Players(sessionData, playersById, rankedCandidates);
  const ladderPlayers = usesCompetitiveGrouping
    ? buildLadderPlayers(sessionData, playersById, rankedCandidates)
    : null;

  const runSelection = ({
    targetPool,
    restrictToPool = false,
    minimumTargetPoolPlayers,
    excludedQuartetKey,
    excludedQuartetKeys,
    excludedPartitionKey,
  }: {
    targetPool: SessionPool;
    restrictToPool?: boolean;
    minimumTargetPoolPlayers?: number;
    excludedQuartetKey?: string;
    excludedQuartetKeys?: ReadonlySet<string>;
    excludedPartitionKey?: string;
  }): PoolAwareSelection | null => {
    if (usesCompetitiveGrouping && ladderPlayers) {
      const sourcePlayers = restrictToPool
        ? ladderPlayers.filter(
            (player) => getNormalizedSessionPool(player.pool) === targetPool
          )
        : ladderPlayers;
      const result = findBestSingleCourtSelectionLadder(sourcePlayers, {
        sessionMode: sessionData.mode as SessionMode,
        respectPlayerRest: sessionData.respectPlayerRest,
        excludedQuartetKey,
        excludedQuartetKeys,
        excludedPartitionKey,
        targetPool: restrictToPool ? undefined : targetPool,
        minimumTargetPoolPlayers,
      });
      return result.selection
        ? {
            ...result.selection,
            targetPool,
          }
        : null;
    }

    if (!v3Players) {
      return null;
    }

    const sourcePlayers = restrictToPool
      ? v3Players.filter(
          (player) => getNormalizedSessionPool(player.pool) === targetPool
        )
      : v3Players;
    const result = findBestSingleCourtSelectionV3(sourcePlayers, {
      sessionMode: sessionData.mode as SessionMode,
      sessionType: sessionData.type as SessionType,
      respectPlayerRest: sessionData.respectPlayerRest,
      completedMatches,
      excludedQuartetKey,
      excludedQuartetKeys,
      excludedPartitionKey,
      targetPool: restrictToPool ? undefined : targetPool,
      minimumTargetPoolPlayers,
    });
    return result.selection
      ? {
          ...result.selection,
          targetPool,
        }
      : null;
  };

  return {
    duePool,
    waitingCounts,
    runSelection,
  };
}

function collectPoolPlanSelections({
  runSelection,
  targetPool,
  restrictToPool,
  minimumTargetPoolPlayers,
}: {
  runSelection: NonNullable<
    ReturnType<typeof buildPoolSelectionPlanner>
  >["runSelection"];
  targetPool: SessionPool;
  restrictToPool: boolean;
  minimumTargetPoolPlayers?: number;
}) {
  const selections: PoolAwareSelection[] = [];
  const excludedQuartetKeys = new Set<string>();

  while (selections.length < MAX_POOL_SELECTION_OPTIONS_PER_PLAN) {
    const selection = runSelection({
      targetPool,
      restrictToPool,
      minimumTargetPoolPlayers,
      excludedQuartetKeys,
    });

    if (!selection) {
      break;
    }

    const quartetKey = getV3QuartetKey(selection.ids);
    if (excludedQuartetKeys.has(quartetKey)) {
      break;
    }

    excludedQuartetKeys.add(quartetKey);
    selections.push(selection);
  }

  return selections;
}

function listPoolEnabledSingleCourtMatches({
  rankedCandidates,
  playersById,
  sessionData,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
}) {
  const planner = buildPoolSelectionPlanner({
    rankedCandidates,
    playersById,
    sessionData,
  });

  if (!planner) {
    return [];
  }

  const { duePool, waitingCounts, runSelection } = planner;
  const crossoverThreshold = getSessionPoolCrossoverMissThreshold(sessionData);
  const totalWaitingPlayers =
    waitingCounts[SessionPool.A] + waitingCounts[SessionPool.B];
  const orderedPools = [duePool, getOppositeSessionPool(duePool)] as const;
  const samePoolSelections: PoolAwareSelection[] = [];

  for (const pool of orderedPools) {
    const selectionsForPool = collectPoolPlanSelections({
      runSelection,
      targetPool: pool,
      restrictToPool: true,
    });

    samePoolSelections.push(
      ...selectionsForPool.map((selection) => ({
        ...selection,
        missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
      })).map((selection) => withMatchmakingReason(selection, sessionData))
    );
  }

  const allowEmergencyCrossover = samePoolSelections.length === 0;
  const crossoverSelections: PoolAwareSelection[] = [];

  for (const pool of orderedPools) {
    const waitingInPool = waitingCounts[pool];
    const missedTurns = getSessionPoolMissedTurns(sessionData, pool);
    const canCrossPool =
      waitingInPool > 0 &&
      totalWaitingPlayers >= 4 &&
      (missedTurns >= crossoverThreshold || allowEmergencyCrossover);

    if (!canCrossPool) {
      continue;
    }

    for (
      let minimumTargetPoolPlayers = Math.min(waitingInPool, 3);
      minimumTargetPoolPlayers >= 1;
      minimumTargetPoolPlayers -= 1
    ) {
      const selectionsForPool = collectPoolPlanSelections({
        runSelection,
        targetPool: pool,
        restrictToPool: false,
        minimumTargetPoolPlayers,
      });

      crossoverSelections.push(
        ...selectionsForPool.map((selection) => ({
          ...selection,
          missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
        })).map((selection) => withMatchmakingReason(selection, sessionData))
      );
    }
  }

  return [...samePoolSelections, ...crossoverSelections];
}

function selectPoolEnabledSingleCourtMatch({
  rankedCandidates,
  playersById,
  sessionData,
  reshuffleSource,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  reshuffleSource: ReshuffleSource | null;
}): PoolAwareSelection {
  const planner = buildPoolSelectionPlanner({
    rankedCandidates,
    playersById,
    sessionData,
  });

  if (!planner) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${getSessionModeLabel(
        sessionData.mode
      )} session rules. Try changing player preferences.`
    );
  }

  const { duePool, waitingCounts, runSelection } = planner;

  const tryPlan = ({
    targetPool,
    restrictToPool,
    minimumTargetPoolPlayers,
  }: {
    targetPool: SessionPool;
    restrictToPool: boolean;
    minimumTargetPoolPlayers?: number;
  }) =>
    applyReshuffleExclusions(
      runSelection({
        targetPool,
        restrictToPool,
        minimumTargetPoolPlayers,
      }),
      reshuffleSource,
      ({ excludedQuartetKey, excludedPartitionKey }) =>
        runSelection({
          targetPool,
          restrictToPool,
          minimumTargetPoolPlayers,
          excludedQuartetKey,
          excludedPartitionKey,
        })
    );

  const crossoverThreshold = getSessionPoolCrossoverMissThreshold(sessionData);
  const totalWaitingPlayers =
    waitingCounts[SessionPool.A] + waitingCounts[SessionPool.B];
  const orderedPools = [duePool, getOppositeSessionPool(duePool)] as const;
  let foundSamePoolSelection = false;

  for (const pool of orderedPools) {
    const samePoolSelection = tryPlan({
      targetPool: pool,
      restrictToPool: true,
    });
    if (samePoolSelection) {
      foundSamePoolSelection = true;
      return withMatchmakingReason(
        {
          ...samePoolSelection,
          missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
        },
        sessionData
      );
    }
  }

  const allowEmergencyCrossover = !foundSamePoolSelection;

  for (const pool of orderedPools) {
    const waitingInPool = waitingCounts[pool];
    const missedTurns = getSessionPoolMissedTurns(sessionData, pool);
    if (
      waitingInPool > 0 &&
      totalWaitingPlayers >= 4 &&
      (missedTurns >= crossoverThreshold || allowEmergencyCrossover)
    ) {
      for (
        let minimumTargetPoolPlayers = Math.min(waitingInPool, 3);
        minimumTargetPoolPlayers >= 1;
        minimumTargetPoolPlayers -= 1
      ) {
        const crossoverSelection = tryPlan({
          targetPool: pool,
          restrictToPool: false,
          minimumTargetPoolPlayers,
        });
        if (crossoverSelection) {
          return withMatchmakingReason(
            {
              ...crossoverSelection,
              missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
            },
            sessionData
          );
        }
      }
    }
  }

  if (reshuffleSource) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  throw new GenerateMatchError(
    400,
    `No valid pairing found for current ${getSessionModeLabel(
      sessionData.mode
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
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
}) {
  if (sessionData.poolsEnabled) {
    return selectPoolEnabledSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      reshuffleSource,
    });
  }

  const completedMatches = buildCompletedMatches(sessionData);
  const usesCompetitiveGrouping =
    sessionData.type === SessionType.LADDER ||
    sessionData.type === SessionType.RACE;
  const initialResult = usesCompetitiveGrouping
      ? findBestSingleCourtSelectionLadder(
          buildLadderPlayers(sessionData, playersById, rankedCandidates),
          {
            sessionMode: sessionData.mode as SessionMode,
            respectPlayerRest: sessionData.respectPlayerRest,
          }
        )
    : findBestSingleCourtSelectionV3(
        buildV3Players(sessionData, playersById, rankedCandidates),
        {
          sessionMode: sessionData.mode as SessionMode,
          sessionType: sessionData.type as SessionType,
          respectPlayerRest: sessionData.respectPlayerRest,
          completedMatches,
        }
      );

  if (!initialResult.selection) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${getSessionModeLabel(
        sessionData.mode
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
        sessionMode: sessionData.mode as SessionMode,
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
        sessionMode: sessionData.mode as SessionMode,
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
    sessionMode: sessionData.mode as SessionMode,
    sessionType: sessionData.type as SessionType,
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
    sessionMode: sessionData.mode as SessionMode,
    sessionType: sessionData.type as SessionType,
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
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  selectedIds: [string, string, string, string];
}): PoolAwareSelection | null {
  const selectedUserIds = new Set(selectedIds);
  const exactRankedCandidates = rankedCandidates.filter((candidate) =>
    selectedUserIds.has(candidate.userId)
  );

  if (exactRankedCandidates.length !== 4) {
    return null;
  }

  const usesCompetitiveGrouping =
    sessionData.type === SessionType.LADDER ||
    sessionData.type === SessionType.RACE;

  if (usesCompetitiveGrouping) {
    const result = findBestSingleCourtSelectionLadder(
      buildLadderPlayers(sessionData, playersById, exactRankedCandidates),
      {
        sessionMode: sessionData.mode as SessionMode,
        respectPlayerRest: sessionData.respectPlayerRest,
      }
    );

    return result.selection
      ? withMatchmakingReason(
          {
            ids: result.selection.ids,
            partition: result.selection.partition,
          },
          sessionData
        )
      : null;
  }

  const result = findBestSingleCourtSelectionV3(
    buildV3Players(sessionData, playersById, exactRankedCandidates),
    {
      sessionMode: sessionData.mode as SessionMode,
      sessionType: sessionData.type as SessionType,
      respectPlayerRest: sessionData.respectPlayerRest,
      completedMatches: buildCompletedMatches(sessionData),
    }
  );

  return result.selection
    ? withMatchmakingReason(result.selection, sessionData)
    : null;
}

export function selectReplacementMatch({
  rankedCandidates,
  playersById,
  sessionData,
  retainedUserIds,
  excludedUserIds = [],
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  retainedUserIds: [string, string, string];
  excludedUserIds?: string[];
}) {
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

export function selectBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  requestedMatchCount,
  randomFn,
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
  randomFn?: () => number;
}) {
  if (sessionData.poolsEnabled) {
    const search = ({
      workingSessionData,
      workingRankedCandidates,
      selections,
    }: {
      workingSessionData: GenerateMatchSession;
      workingRankedCandidates: RankedCandidates;
      selections: PoolAwareSelection[];
    }): { selections: PoolAwareSelection[]; poolSchedulingState: GenerateMatchSession } | null => {
      if (selections.length === requestedMatchCount) {
        return {
          selections,
          poolSchedulingState: workingSessionData,
        };
      }

      const remainingCourts = requestedMatchCount - selections.length;
      if (workingRankedCandidates.length < remainingCourts * 4) {
        return null;
      }

      const candidateSelections = listPoolEnabledSingleCourtMatches({
        rankedCandidates: workingRankedCandidates,
        playersById,
        sessionData: workingSessionData,
      });

      for (const selection of candidateSelections) {
        const selectedIds = new Set(selection.ids);
        const nextRankedCandidates = workingRankedCandidates.filter(
          (candidate) => !selectedIds.has(candidate.userId)
        );
        const nextSessionData = applyPoolSelectionOutcome(
          workingSessionData,
          selection
        );
        const result = search({
          workingSessionData: nextSessionData,
          workingRankedCandidates: nextRankedCandidates,
          selections: [...selections, selection],
        });

        if (result) {
          return result;
        }
      }

      return null;
    };

    const result = search({
      workingSessionData: sessionData,
      workingRankedCandidates: rankedCandidates,
      selections: [],
    });

    if (!result) {
      throw new GenerateMatchError(
        400,
        `No valid set of matches found for current ${getSessionModeLabel(
          sessionData.mode
        )} session rules. Try changing player preferences.`
      );
    }

    return result;
  }

  if (
    sessionData.type === SessionType.LADDER ||
    sessionData.type === SessionType.RACE
  ) {
    const result = findBestBatchSelectionLadder(
      buildLadderPlayers(sessionData, playersById, rankedCandidates),
      {
        courtCount: requestedMatchCount,
        sessionMode: sessionData.mode as SessionMode,
        respectPlayerRest: sessionData.respectPlayerRest,
      }
    );

    if (!result.selection) {
      throw new GenerateMatchError(
        400,
        `No valid set of matches found for current ${getSessionModeLabel(
          sessionData.mode
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
      sessionMode: sessionData.mode as SessionMode,
      sessionType: sessionData.type as SessionType,
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
