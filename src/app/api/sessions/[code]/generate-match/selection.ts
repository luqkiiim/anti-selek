import { getCommunityEloByUserId } from "@/lib/communityElo";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import {
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
import { MatchStatus, SessionMode, SessionType } from "@/types/enums";
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
  isBusy: false;
  isPaused: false;
};

type RankedCandidates = ReturnType<typeof buildActivePlayers<AvailableCandidate>>;

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}

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
      player.ladderEntryAt ?? player.joinedAt ?? null,
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
