import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import type { PartitionCandidate } from "@/lib/matchmaking/partitioning";
import { buildCandidatePool } from "@/lib/matchmaking/v3/candidatePool";
import { buildFairnessBands } from "@/lib/matchmaking/v3/fairness";
import { findBestBatchSelectionV3 } from "@/lib/matchmaking/v3/batch";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import {
  FULL_REPEAT_REST_TOLERANCE,
  getBalanceVarietyTolerance,
} from "@/lib/matchmaking/v3/scoring";
import { findBestSingleCourtSelectionV3 } from "@/lib/matchmaking/v3/singleCourt";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CandidatePool,
  V3CompletedMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
  V3SingleCourtSelection,
} from "@/lib/matchmaking/v3/types";
import {
  getAcceptedInterclubClubIds,
  isInterclubSession,
  type SessionInterclubSource,
} from "@/lib/sessionCollabFormat";
import {
  getEffectiveSessionMode,
  getEffectiveSessionType,
} from "@/lib/sessionSettings";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { MatchStatus, SessionMode, SessionType } from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchSession,
  type ReshuffleSource,
} from "./shared";

type RankedInterclubCandidate = {
  userId: string;
  matchesPlayed: number;
  matchmakingBaseline: number;
  restTurns: number;
  needsMoreRest?: boolean;
  moreRestTarget?: number;
  arrivalPriorityAt?: Date | string | null;
  strength?: number;
};

interface InterclubMatchmakerPlayer extends MatchmakerV3Player {
  representingClubId: string;
}

type ActiveInterclubPlayer =
  ActiveMatchmakerV3Player<InterclubMatchmakerPlayer>;

interface InterclubSelection {
  ids: [string, string, string, string];
  partition: ManualMatchTeams;
  team1ClubId: string;
  team2ClubId: string;
  matchmakingReasonJson: string;
}

type InterclubReadinessSession = SessionInterclubSource & {
  poolsEnabled: boolean;
  players: Array<{
    isPaused: boolean;
    representingClubId?: string | null;
  }>;
};

function getInterclubClubIds(sessionData: SessionInterclubSource) {
  if (!isInterclubSession(sessionData)) {
    return null;
  }

  const clubIds = getAcceptedInterclubClubIds(sessionData);

  if (clubIds.length !== 2) {
    throw new GenerateMatchError(
      400,
      "Club vs club sessions require exactly two accepted clubs."
    );
  }

  return clubIds as [string, string];
}

function ensureBalancedInterclubSessionType(sessionData: GenerateMatchSession) {
  if (
    getEffectiveSessionType(sessionData) === SessionType.LADDER ||
    getEffectiveSessionType(sessionData) === SessionType.RACE
  ) {
    throw new GenerateMatchError(
      400,
      "Club vs club matchmaking uses balanced doubles, not ladder or race grouping."
    );
  }
}

function getPlayerRepresentingClubById(sessionData: GenerateMatchSession) {
  return new Map(
    sessionData.players.map((player) => [
      player.userId,
      player.representingClubId ?? null,
    ])
  );
}

export function ensureInterclubSessionReady(
  sessionData: InterclubReadinessSession
) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    return;
  }

  if (sessionData.poolsEnabled) {
    throw new GenerateMatchError(
      400,
      "Club vs club sessions cannot use pools."
    );
  }

  const validClubIds = new Set(clubIds);
  const invalidPlayers = sessionData.players.filter(
    (player) =>
      !player.isPaused &&
      (!player.representingClubId || !validClubIds.has(player.representingClubId))
  );

  if (invalidPlayers.length > 0) {
    throw new GenerateMatchError(
      400,
      "Assign every active player to one of the two clubs before creating club vs club matches."
    );
  }
}

function getSingleTeamClubId({
  team,
  clubByUserId,
  validClubIds,
}: {
  team: [string, string];
  clubByUserId: Map<string, string | null>;
  validClubIds: ReadonlySet<string>;
}) {
  const [firstClubId, secondClubId] = team.map(
    (userId) => clubByUserId.get(userId) ?? null
  );

  if (
    !firstClubId ||
    firstClubId !== secondClubId ||
    !validClubIds.has(firstClubId)
  ) {
    return null;
  }

  return firstClubId;
}

export function getInterclubTeamClubIdsForPartition(
  sessionData: GenerateMatchSession,
  partition: ManualMatchTeams
) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    return { team1ClubId: null, team2ClubId: null };
  }

  const validClubIds = new Set(clubIds);
  const clubByUserId = getPlayerRepresentingClubById(sessionData);
  const team1ClubId = getSingleTeamClubId({
    team: partition.team1,
    clubByUserId,
    validClubIds,
  });
  const team2ClubId = getSingleTeamClubId({
    team: partition.team2,
    clubByUserId,
    validClubIds,
  });

  if (!team1ClubId || !team2ClubId || team1ClubId === team2ClubId) {
    throw new GenerateMatchError(
      400,
      "Club vs club matches require two players from one club against two players from the other club."
    );
  }

  return { team1ClubId, team2ClubId };
}

function getInterclubRestTurnTieZoneTolerance(sessionType: SessionType) {
  if (getBalanceVarietyTolerance(sessionType) !== null) {
    return Number.POSITIVE_INFINITY;
  }

  return sessionType === SessionType.SOCIAL_MIX ? FULL_REPEAT_REST_TOLERANCE : 0;
}

function buildCompletedInterclubMatches(
  sessionData: GenerateMatchSession
): V3CompletedMatch[] {
  return sessionData.matches
    .filter((match) => match.status === MatchStatus.COMPLETED)
    .map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      completedAt: match.completedAt ?? null,
    }));
}

function getCandidatesByClubId({
  sessionData,
  rankedCandidates,
  clubIds,
}: {
  sessionData: GenerateMatchSession;
  rankedCandidates: readonly RankedInterclubCandidate[];
  clubIds: [string, string];
}) {
  const clubByUserId = getPlayerRepresentingClubById(sessionData);
  const candidatesByClubId = new Map<string, RankedInterclubCandidate[]>(
    clubIds.map((clubId) => [clubId, []])
  );

  for (const candidate of rankedCandidates) {
    const clubId = clubByUserId.get(candidate.userId);
    if (clubId && candidatesByClubId.has(clubId)) {
      candidatesByClubId.get(clubId)!.push(candidate);
    }
  }

  return candidatesByClubId;
}

function getInterclubShortageMessage({
  sessionData,
  clubIds,
  rankedCandidates,
  requiredPerClub = 2,
}: {
  sessionData: GenerateMatchSession;
  clubIds: [string, string];
  rankedCandidates: readonly RankedInterclubCandidate[];
  requiredPerClub?: number;
}) {
  const label = getSessionModeLabel(getEffectiveSessionMode(sessionData));
  const candidatesByClubId = getCandidatesByClubId({
    sessionData,
    rankedCandidates,
    clubIds,
  });
  const counts = clubIds.map(
    (clubId) => candidatesByClubId.get(clubId)?.length ?? 0
  );

  if (counts.some((count) => count < requiredPerClub)) {
    return `Club vs club needs at least ${requiredPerClub} available players from each club (currently ${counts[0]} vs ${counts[1]}).`;
  }

  return `No valid club vs club pairing found for current ${label} session rules. Try changing player preferences or side assignments.`;
}

function buildInterclubReasonJson({
  team1ClubId,
  team2ClubId,
  balanceGap,
  pointDiffGap,
}: {
  team1ClubId: string;
  team2ClubId: string;
  balanceGap: number;
  pointDiffGap: number;
}) {
  return JSON.stringify({
    type: "INTERCLUB",
    team1ClubId,
    team2ClubId,
    balanceGap,
    pointDiffGap,
  });
}

function buildInterclubMatchmakerPlayers({
  sessionData,
  rankedCandidates,
  playersById,
  clubIds,
}: {
  sessionData: GenerateMatchSession;
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  clubIds: [string, string];
}): InterclubMatchmakerPlayer[] {
  const sessionPlayersById = new Map(
    sessionData.players.map((player) => [player.userId, player])
  );
  const validClubIds = new Set(clubIds);

  return rankedCandidates.flatMap((candidate) => {
    const player = sessionPlayersById.get(candidate.userId);
    const representingClubId = player?.representingClubId ?? null;

    if (!player || !representingClubId || !validClubIds.has(representingClubId)) {
      return [];
    }

    return [
      {
        userId: player.userId,
        matchesPlayed: candidate.matchesPlayed,
        matchmakingBaseline: candidate.matchmakingBaseline,
        availableSince: player.availableSince,
        restTurns: candidate.restTurns,
        needsMoreRest: candidate.needsMoreRest ?? player.needsMoreRest,
        moreRestTarget: candidate.moreRestTarget,
        arrivalPriorityAt:
          candidate.arrivalPriorityAt ?? player.arrivalPriorityAt ?? null,
        strength: playersById.get(player.userId)?.elo ?? 0,
        pointDiff: playersById.get(player.userId)?.pointDiff ?? 0,
        isBusy: false,
        isPaused: player.isPaused,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
        mixedSideOverride: player.mixedSideOverride,
        pool: player.pool,
        lastPartnerId: player.lastPartnerId,
        representingClubId,
      },
    ];
  });
}

function interleaveLists<T>(lists: T[][]) {
  const result: T[] = [];
  let index = 0;

  while (true) {
    let added = false;

    for (const list of lists) {
      const item = list[index];
      if (item) {
        result.push(item);
        added = true;
      }
    }

    if (!added) {
      return result;
    }

    index += 1;
  }
}

function sortActivePlayers(
  players: ActiveInterclubPlayer[],
  respectPlayerRest: boolean
) {
  return [...players].sort((left, right) => {
    if (left.effectiveMatchCount !== right.effectiveMatchCount) {
      return left.effectiveMatchCount - right.effectiveMatchCount;
    }

    if (respectPlayerRest && left.moreRestDeficit !== right.moreRestDeficit) {
      return left.moreRestDeficit - right.moreRestDeficit;
    }

    if (respectPlayerRest && left.restTurns !== right.restTurns) {
      return right.restTurns - left.restTurns;
    }

    return left.randomScore - right.randomScore;
  });
}

function buildClubAwareSelectablePlayers({
  clubPools,
  requiredPerClub,
}: {
  clubPools: Array<V3CandidatePool<ActiveInterclubPlayer>>;
  requiredPerClub: number;
}) {
  const selectedIds = new Set<string>();
  const neededLists = clubPools.map((pool) => {
    const neededCount = Math.max(
      0,
      requiredPerClub - pool.lockedPlayers.length
    );
    const neededPlayers = pool.selectablePlayers.slice(0, neededCount);

    for (const player of [...pool.lockedPlayers, ...neededPlayers]) {
      selectedIds.add(player.userId);
    }

    return neededPlayers;
  });
  const extraLists = clubPools.map((pool) =>
    pool.activePlayers.filter((player) => !selectedIds.has(player.userId))
  );

  return [...interleaveLists(neededLists), ...interleaveLists(extraLists)];
}

function buildInterclubCandidatePool({
  players,
  clubIds,
  requiredPerClub,
  sessionType,
  respectPlayerRest,
  randomFn,
}: {
  players: InterclubMatchmakerPlayer[];
  clubIds: [string, string];
  requiredPerClub: number;
  sessionType: SessionType;
  respectPlayerRest: boolean;
  randomFn?: () => number;
}): V3CandidatePool<ActiveInterclubPlayer> {
  const clubPools = clubIds.map((clubId) =>
    buildCandidatePool(
      players.filter((player) => player.representingClubId === clubId),
      {
        requiredPlayerCount: requiredPerClub,
        randomFn,
        respectPlayerRest,
        restTurnTieZoneTolerance:
          getInterclubRestTurnTieZoneTolerance(sessionType),
      }
    )
  );
  const activePlayers = sortActivePlayers(
    clubPools.flatMap((pool) => pool.activePlayers),
    respectPlayerRest
  );
  const fairnessBands = buildFairnessBands(activePlayers);
  const lockedPlayers = clubPools.flatMap((pool) => pool.lockedPlayers);
  const selectablePlayers = buildClubAwareSelectablePlayers({
    clubPools,
    requiredPerClub,
  });
  const candidatePlayers = [...lockedPlayers, ...selectablePlayers];

  return {
    requiredPlayerCount: requiredPerClub * 2,
    activePlayers,
    fairnessBands,
    lowestBand: fairnessBands[0]?.effectiveMatchCount ?? null,
    includedBandValues: [
      ...new Set(clubPools.flatMap((pool) => pool.includedBandValues)),
    ].sort((left, right) => left - right),
    widened: clubPools.some((pool) => pool.widened),
    insufficientPlayers: clubPools.some((pool) => pool.insufficientPlayers),
    lockedPlayers,
    selectionBand: null,
    selectionBandEffectiveMatchCount: null,
    requiredSelectableCount: clubPools.reduce(
      (sum, pool) =>
        sum + Math.max(0, requiredPerClub - pool.lockedPlayers.length),
      0
    ),
    selectablePlayers,
    candidatePlayers,
    tieZone: null,
  };
}

function buildInterclubReplacementCandidatePool({
  players,
  clubIds,
  retainedUserIds,
  sessionType,
  respectPlayerRest,
}: {
  players: InterclubMatchmakerPlayer[];
  clubIds: [string, string];
  retainedUserIds: [string, string, string];
  sessionType: SessionType;
  respectPlayerRest: boolean;
}) {
  const basePool = buildInterclubCandidatePool({
    players,
    clubIds,
    requiredPerClub: 2,
    sessionType,
    respectPlayerRest,
  });
  const playersById = new Map(
    basePool.activePlayers.map((player) => [player.userId, player])
  );
  const retainedPlayers = retainedUserIds
    .map((userId) => playersById.get(userId))
    .filter((player): player is ActiveInterclubPlayer => Boolean(player));
  const retainedUserIdSet = new Set(retainedUserIds);
  const selectablePlayers = basePool.activePlayers.filter(
    (player) => !retainedUserIdSet.has(player.userId)
  );

  return {
    ...basePool,
    insufficientPlayers:
      basePool.insufficientPlayers || retainedPlayers.length !== 3,
    lockedPlayers: retainedPlayers,
    requiredSelectableCount: 1,
    selectablePlayers,
    candidatePlayers: [...retainedPlayers, ...selectablePlayers],
    tieZone: null,
  };
}

function getTeamClubId(
  team: [string, string],
  playersById: Map<string, ActiveInterclubPlayer>
) {
  const firstClubId = playersById.get(team[0])?.representingClubId ?? null;
  const secondClubId = playersById.get(team[1])?.representingClubId ?? null;

  return firstClubId && firstClubId === secondClubId ? firstClubId : null;
}

function getInterclubSelectionConstraints(
  clubIds: [string, string]
): V3SelectionConstraints<ActiveInterclubPlayer> {
  return {
    isQuartetAllowed: (players) => {
      const clubACount = players.filter(
        (player) => player.representingClubId === clubIds[0]
      ).length;
      const clubBCount = players.filter(
        (player) => player.representingClubId === clubIds[1]
      ).length;

      return clubACount === 2 && clubBCount === 2;
    },
    normalizePartition: ({ partition, playersById }) => {
      const team1ClubId = getTeamClubId(partition.team1, playersById);
      const team2ClubId = getTeamClubId(partition.team2, playersById);

      if (team1ClubId === clubIds[0] && team2ClubId === clubIds[1]) {
        return partition;
      }

      if (team1ClubId === clubIds[1] && team2ClubId === clubIds[0]) {
        return {
          team1: partition.team2,
          team2: partition.team1,
        };
      }

      return null;
    },
  };
}

function toManualMatchTeams(partition: V3DoublesPartition): ManualMatchTeams {
  return {
    team1: partition.team1,
    team2: partition.team2,
  };
}

function toInterclubSelection(
  selection: V3SingleCourtSelection<ActiveInterclubPlayer>,
  clubIds: [string, string]
): InterclubSelection {
  const sortTeam = (team: [string, string]): [string, string] =>
    [...team].sort((left, right) => left.localeCompare(right)) as [
      string,
      string,
    ];
  const partition = {
    team1: sortTeam(selection.partition.team1),
    team2: sortTeam(selection.partition.team2),
  };

  return {
    ids: [
      partition.team1[0],
      partition.team1[1],
      partition.team2[0],
      partition.team2[1],
    ],
    partition: toManualMatchTeams(partition),
    team1ClubId: clubIds[0],
    team2ClubId: clubIds[1],
    matchmakingReasonJson: buildInterclubReasonJson({
      team1ClubId: clubIds[0],
      team2ClubId: clubIds[1],
      balanceGap: selection.balanceGap,
      pointDiffGap: selection.pointDiffGap,
    }),
  };
}

function buildInterclubSelectionContext({
  rankedCandidates,
  playersById,
  sessionData,
  requiredPerClub,
  randomFn,
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  requiredPerClub: number;
  randomFn?: () => number;
}) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    return null;
  }

  ensureInterclubSessionReady(sessionData);
  ensureBalancedInterclubSessionType(sessionData);

  const sessionType = getEffectiveSessionType(sessionData);
  const players = buildInterclubMatchmakerPlayers({
    sessionData,
    rankedCandidates,
    playersById,
    clubIds,
  });
  const candidatePool = buildInterclubCandidatePool({
    players,
    clubIds,
    requiredPerClub,
    sessionType,
    respectPlayerRest: sessionData.respectPlayerRest,
    randomFn,
  });

  return {
    clubIds,
    sessionMode: getEffectiveSessionMode(sessionData) as SessionMode,
    sessionType,
    completedMatches: buildCompletedInterclubMatches(sessionData),
    players,
    candidatePool,
    selectionConstraints: getInterclubSelectionConstraints(clubIds),
  };
}

function findInterclubSingleCourtSelection({
  rankedCandidates,
  playersById,
  sessionData,
  excludedQuartetKey,
  excludedPartitionKey,
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  excludedQuartetKey?: string;
  excludedPartitionKey?: string;
}) {
  const context = buildInterclubSelectionContext({
    rankedCandidates,
    playersById,
    sessionData,
    requiredPerClub: 2,
  });
  if (!context) {
    return null;
  }

  return findBestSingleCourtSelectionV3(context.players, {
    sessionMode: context.sessionMode,
    sessionType: context.sessionType,
    completedMatches: context.completedMatches,
    respectPlayerRest: sessionData.respectPlayerRest,
    candidatePool: context.candidatePool,
    selectionConstraints: context.selectionConstraints,
    excludedQuartetKey,
    excludedPartitionKey,
  }).selection;
}

export function selectInterclubSingleCourtMatch({
  rankedCandidates,
  playersById,
  sessionData,
  reshuffleSource,
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  reshuffleSource: ReshuffleSource | null;
}) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    throw new GenerateMatchError(400, "Club vs club session is not ready.");
  }

  const initialSelection = findInterclubSingleCourtSelection({
    rankedCandidates,
    playersById,
    sessionData,
  });

  if (!initialSelection) {
    throw new GenerateMatchError(
      400,
      getInterclubShortageMessage({
        sessionData,
        clubIds,
        rankedCandidates,
      })
    );
  }

  if (!reshuffleSource) {
    return toInterclubSelection(initialSelection, clubIds);
  }

  const previousQuartetKey = [...reshuffleSource.ids].sort().join("|");
  const previousPartitionKey = getExactPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = [...initialSelection.ids].sort().join("|");
  const selectedPartitionKey = getExactPartitionKey(initialSelection.partition);

  if (selectedQuartetKey !== previousQuartetKey) {
    return toInterclubSelection(initialSelection, clubIds);
  }

  const alternativeQuartet = findInterclubSingleCourtSelection({
    rankedCandidates,
    playersById,
    sessionData,
    excludedQuartetKey: previousQuartetKey,
  });

  if (alternativeQuartet) {
    return toInterclubSelection(alternativeQuartet, clubIds);
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return toInterclubSelection(initialSelection, clubIds);
  }

  const alternativePartition = findInterclubSingleCourtSelection({
    rankedCandidates,
    playersById,
    sessionData,
    excludedPartitionKey: previousPartitionKey,
  });

  if (!alternativePartition) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  return toInterclubSelection(alternativePartition, clubIds);
}

export function selectInterclubReplacementMatch({
  rankedCandidates,
  playersById,
  sessionData,
  retainedUserIds,
  excludedUserIds = [],
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
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

  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    throw new GenerateMatchError(400, "Club vs club session is not ready.");
  }

  ensureInterclubSessionReady(sessionData);
  ensureBalancedInterclubSessionType(sessionData);

  const excludedUserIdSet = new Set(excludedUserIds);
  const eligibleCandidates = rankedCandidates.filter(
    (candidate) =>
      retainedUserIdSet.has(candidate.userId) ||
      !excludedUserIdSet.has(candidate.userId)
  );
  const sessionType = getEffectiveSessionType(sessionData);
  const players = buildInterclubMatchmakerPlayers({
    sessionData,
    rankedCandidates: eligibleCandidates,
    playersById,
    clubIds,
  });
  const candidatePool = buildInterclubReplacementCandidatePool({
    players,
    clubIds,
    retainedUserIds,
    sessionType,
    respectPlayerRest: sessionData.respectPlayerRest,
  });
  const result = findBestSingleCourtSelectionV3(players, {
    sessionMode: getEffectiveSessionMode(sessionData) as SessionMode,
    sessionType,
    completedMatches: buildCompletedInterclubMatches(sessionData),
    respectPlayerRest: sessionData.respectPlayerRest,
    candidatePool,
    candidatePoolVariants: (pool) => [pool],
    selectionConstraints: getInterclubSelectionConstraints(clubIds),
  });

  if (!result.selection) {
    throw new GenerateMatchError(
      409,
      "No eligible replacement player was available for this club vs club match."
    );
  }

  return toInterclubSelection(result.selection, clubIds);
}

export function selectInterclubBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  requestedMatchCount,
  randomFn,
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  requestedMatchCount: number;
  randomFn?: () => number;
}) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    throw new GenerateMatchError(400, "Club vs club session is not ready.");
  }

  const context = buildInterclubSelectionContext({
    rankedCandidates,
    playersById,
    sessionData,
    requiredPerClub: requestedMatchCount * 2,
    randomFn,
  });

  if (!context) {
    throw new GenerateMatchError(400, "Club vs club session is not ready.");
  }

  const result = findBestBatchSelectionV3(context.players, {
    courtCount: requestedMatchCount,
    sessionMode: context.sessionMode,
    sessionType: context.sessionType,
    respectPlayerRest: sessionData.respectPlayerRest,
    completedMatches: context.completedMatches,
    randomFn,
    candidatePool: context.candidatePool,
    candidatePoolVariants: (pool) => [pool],
    selectionConstraints: context.selectionConstraints,
  });

  if (!result.selection) {
    throw new GenerateMatchError(
      400,
      getInterclubShortageMessage({
        sessionData,
        clubIds,
        rankedCandidates,
        requiredPerClub: requestedMatchCount * 2,
      })
    );
  }

  return {
    selections: result.selection.selections.map((selection) =>
      toInterclubSelection(selection, clubIds)
    ),
  };
}
