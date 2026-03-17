import { getCommunityEloByUserId } from "@/lib/communityElo";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import {
  deriveLadderRecordsByEntryTime,
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
  const ladderRecordByUserId = deriveLadderRecordsByEntryTime(
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
      strength:
        playersById.get(player.userId)?.elo ?? player.user.elo,
      wins: record.wins,
      losses: record.losses,
      pointDiff: record.pointDiff,
      ladderScore: record.ladderScore,
      isBusy: !player.isPaused && !availableUserIds.has(player.userId),
      isPaused: player.isPaused,
      gender: player.gender,
      partnerPreference: player.partnerPreference,
      lastPartnerId: player.lastPartnerId,
    };
  });
}

export async function buildMatchmakingState(
  sessionData: GenerateMatchSession
): Promise<MatchmakingState> {
  const busyPlayerIds = getBusyPlayerIds(sessionData.matches);
  const communityEloByUserId =
    sessionData.communityId && sessionData.players.length > 0
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
        elo:
          sessionData.type === SessionType.POINTS
            ? player.sessionPoints
            : communityEloByUserId.get(player.userId) ?? player.user.elo,
        pointDiff: pointDiffByUserId.get(player.userId) ?? 0,
        lastPartnerId: player.lastPartnerId,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
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
  const isLadderSession = sessionData.type === SessionType.LADDER;
  const initialResult = isLadderSession
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

  if (isLadderSession) {
    return initialResult.selection;
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
    sessionData.type === SessionType.LADDER
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
