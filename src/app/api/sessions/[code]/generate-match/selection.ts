import {
  getSideSpecificCourtCreateMixedSide,
  getSideSpecificCourtCreateShortageMessage,
  type SideSpecificCourtCreateType,
} from "@/lib/courtCreate";
import { getCommunityEloByUserId } from "@/lib/communityElo";
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
} from "@/lib/matchmaking/v3";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import {
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
}

const MAX_POOL_SELECTION_OPTIONS_PER_PLAN = 64;

function getV3QuartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
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
  const availableUserIds = new Set(
    rankedCandidates.map((candidate) => candidate.userId)
  );

  return sessionData.players.map((player) => ({
    userId: player.userId,
    matchesPlayed: player.matchesPlayed,
    matchmakingBaseline:
      player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0),
    availableSince: player.availableSince,
    strength:
      playersById.get(player.userId)?.elo ??
      (sessionData.type === SessionType.POINTS
        ? player.sessionPoints
        : player.user.elo),
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
  const communityEloByUserId =
    sessionData.type === SessionType.ELO &&
    sessionData.communityId &&
    sessionData.players.length > 0
      ? await getCommunityEloByUserId(
          sessionData.communityId,
          sessionData.players.map((player) => player.userId)
        )
      : new Map<string, number>();
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
          communityElo: communityEloByUserId.get(player.userId),
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
      }))
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
        }))
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
      return {
        ...samePoolSelection,
        missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
      };
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
          return {
            ...crossoverSelection,
            missedPool: getMissedPoolOutcome(duePool, pool, waitingCounts),
          };
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
        }
      )
    : findBestSingleCourtSelectionV3(
        buildV3Players(sessionData, playersById, rankedCandidates),
        {
          sessionMode: sessionData.mode as SessionMode,
          sessionType: sessionData.type as SessionType,
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
    return initialResult.selection;
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
      return initialResult.selection;
    }

    const alternativeQuartet = findBestSingleCourtSelectionLadder(
      competitivePlayers,
      {
        sessionMode: sessionData.mode as SessionMode,
        excludedQuartetKey: previousQuartetKey,
      }
    );

    if (alternativeQuartet.selection) {
      return alternativeQuartet.selection;
    }

    if (selectedPartitionKey !== previousPartitionKey) {
      return initialResult.selection;
    }

    const alternativePartition = findBestSingleCourtSelectionLadder(
      competitivePlayers,
      {
        sessionMode: sessionData.mode as SessionMode,
        excludedPartitionKey: previousPartitionKey,
      }
    );

    if (!alternativePartition.selection) {
      throw new GenerateMatchError(
        409,
        "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
      );
    }

    return alternativePartition.selection;
  }

  const v3Players = buildV3Players(sessionData, playersById, rankedCandidates);
  const previousQuartetKey = getV3QuartetKey(reshuffleSource.ids);
  const previousPartitionKey = getExactPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = getV3QuartetKey(initialResult.selection.ids);
  const selectedPartitionKey = getExactPartitionKey(
    initialResult.selection.partition
  );

  if (selectedQuartetKey !== previousQuartetKey) {
    return initialResult.selection;
  }

  const alternativeQuartet = findBestSingleCourtSelectionV3(v3Players, {
    sessionMode: sessionData.mode as SessionMode,
    sessionType: sessionData.type as SessionType,
    completedMatches,
    excludedQuartetKey: previousQuartetKey,
  });

  if (alternativeQuartet.selection) {
    return alternativeQuartet.selection;
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return initialResult.selection;
  }

  const alternativePartition = findBestSingleCourtSelectionV3(v3Players, {
    sessionMode: sessionData.mode as SessionMode,
    sessionType: sessionData.type as SessionType,
    completedMatches,
    excludedPartitionKey: previousPartitionKey,
  });

  if (!alternativePartition.selection) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  return alternativePartition.selection;
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
      }
    );

    return result.selection
      ? {
          ids: result.selection.ids,
          partition: result.selection.partition,
        }
      : null;
  }

  const result = findBestSingleCourtSelectionV3(
    buildV3Players(sessionData, playersById, exactRankedCandidates),
    {
      sessionMode: sessionData.mode as SessionMode,
      sessionType: sessionData.type as SessionType,
      completedMatches: buildCompletedMatches(sessionData),
    }
  );

  return result.selection
    ? {
        ids: result.selection.ids,
        partition: result.selection.partition,
      }
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
}: {
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
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

  const result =
    sessionData.type === SessionType.LADDER ||
    sessionData.type === SessionType.RACE
      ? findBestBatchSelectionLadder(
          buildLadderPlayers(sessionData, playersById, rankedCandidates),
          {
            courtCount: requestedMatchCount,
            sessionMode: sessionData.mode as SessionMode,
          }
        )
      : findBestBatchSelectionV3(
          buildV3Players(sessionData, playersById, rankedCandidates),
          {
            courtCount: requestedMatchCount,
            sessionMode: sessionData.mode as SessionMode,
            sessionType: sessionData.type as SessionType,
            completedMatches: buildCompletedMatches(sessionData),
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

  return result.selection;
}
