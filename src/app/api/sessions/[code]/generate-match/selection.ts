import { getCommunityEloByUserId } from "@/lib/communityElo";
import { findBestAutoMatchSelection } from "@/lib/matchmaking/autoMatch";
import { findBestBatchAutoMatchSelection } from "@/lib/matchmaking/batchAutoMatch";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { rankPlayersByFairness } from "@/lib/matchmaking/fairness";
import {
  buildRotationHistory,
  evaluateBestPartition,
  getPartitionKey,
  getQuartetKey,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import { MatchStatus, SessionMode, SessionType } from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  type ReshuffleSource,
  mixedModeLabel,
} from "./shared";

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
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
  const availableCandidates = sessionData.players
    .filter((player) => !busyPlayerIds.has(player.userId) && !player.isPaused)
    .map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
    }));

  return {
    availableCandidates,
    rankedCandidates: rankPlayersByFairness(availableCandidates),
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
  rotationHistory,
  reshuffleSource,
}: {
  rankedCandidates: ReturnType<typeof rankPlayersByFairness>;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
}) {
  let bestSelection = findBestAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory
  );

  if (!bestSelection) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${mixedModeLabel} preferences. Try changing player preferences.`
    );
  }

  if (!reshuffleSource) {
    return bestSelection;
  }

  const previousQuartetKey = getQuartetKey(reshuffleSource.ids);
  const previousPartitionKey = getPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = getQuartetKey(bestSelection.ids);
  const selectedPartitionKey = getPartitionKey(bestSelection.partition);

  if (selectedQuartetKey !== previousQuartetKey) {
    return bestSelection;
  }

  const alternativeQuartet = findBestAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    {
      excludedQuartetKey: previousQuartetKey,
    }
  );

  if (alternativeQuartet) {
    return alternativeQuartet;
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return bestSelection;
  }

  const alternativePartition = evaluateBestPartition(
    bestSelection.ids,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    {
      excludedPartitionKey: previousPartitionKey,
    }
  );

  if (!alternativePartition) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  return {
    ...bestSelection,
    partition: alternativePartition.partition,
    score: alternativePartition.score,
    exactPartitionPenalty: alternativePartition.exactPartitionPenalty,
  };
}

export function selectBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  requestedMatchCount,
}: {
  rankedCandidates: ReturnType<typeof rankPlayersByFairness>;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
}) {
  const batchSelection = findBestBatchAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    requestedMatchCount
  );

  if (!batchSelection) {
    throw new GenerateMatchError(
      400,
      `No valid set of matches found for current ${mixedModeLabel} preferences. Try changing player preferences.`
    );
  }

  return batchSelection;
}
