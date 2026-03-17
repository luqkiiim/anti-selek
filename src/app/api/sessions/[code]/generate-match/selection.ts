import { getCommunityEloByUserId } from "@/lib/communityElo";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { findBestAutoMatchSelection } from "@/lib/matchmaking/autoMatch";
import { findBestBatchAutoMatchSelection } from "@/lib/matchmaking/batchAutoMatch";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { rankPlayersByFairness } from "@/lib/matchmaking/fairness";
import {
  getEffectiveActiveTimeBonusMs,
  getEffectiveMatchesPlayed,
} from "@/lib/matchmaking/matchmakingCredit";
import {
  buildRotationHistory,
  evaluateBestPartition,
  getPartitionKey,
  getQuartetKey,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import {
  findBestAutoMatchSelectionV2,
  findBestBatchAutoMatchSelectionV2,
  rankPlayersByRotationLoad,
} from "@/lib/matchmaking/v2";
import { MatchStatus, SessionMode, SessionType } from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  type ReshuffleSource,
} from "./shared";

export type MatchmakerVersion = "v1" | "v2";

type AvailableCandidate = {
  userId: string;
  matchesPlayed: number;
  matchmakingMatchesCredit: number;
  availableSince: Date;
  joinedAt: Date;
  inactiveSeconds: number;
  activeMsBonus: number;
};

type RankedCandidates =
  | ReturnType<typeof rankPlayersByFairness>
  | ReturnType<typeof rankPlayersByRotationLoad>;

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}

export function getMatchmakerVersion(): MatchmakerVersion {
  return process.env.MATCHMAKER_VERSION?.toLowerCase() === "v1" ? "v1" : "v2";
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
  const matchmakerVersion = getMatchmakerVersion();
  const availableCandidates: AvailableCandidate[] = sessionData.players
    .filter((player) => !busyPlayerIds.has(player.userId) && !player.isPaused)
    .map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      matchmakingMatchesCredit: Math.max(
        0,
        player.matchmakingMatchesCredit ?? 0
      ),
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
      activeMsBonus: getEffectiveActiveTimeBonusMs(player),
    }));

  return {
    availableCandidates,
    matchmakerVersion,
    rankedCandidates:
      matchmakerVersion === "v2"
        ? rankPlayersByRotationLoad(availableCandidates)
        : rankPlayersByFairness(
            availableCandidates.map((candidate) => ({
              userId: candidate.userId,
              matchesPlayed: getEffectiveMatchesPlayed(candidate),
              availableSince: candidate.availableSince,
              joinedAt: candidate.joinedAt,
              inactiveSeconds: candidate.inactiveSeconds,
              activeMsBonus: candidate.activeMsBonus,
            }))
          ),
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
  matchmakerVersion,
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  reshuffleSource,
}: {
  matchmakerVersion: MatchmakerVersion;
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
}) {
  let bestSelection =
    matchmakerVersion === "v2"
      ? findBestAutoMatchSelectionV2(
          rankedCandidates as ReturnType<typeof rankPlayersByRotationLoad>,
          { playersById, rotationHistory },
          sessionData.mode as SessionMode,
          sessionData.type as SessionType
        )
      : findBestAutoMatchSelection(
          rankedCandidates as ReturnType<typeof rankPlayersByFairness>,
          playersById,
          sessionData.mode as SessionMode,
          sessionData.type as SessionType,
          rotationHistory
        );

  if (!bestSelection) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${getSessionModeLabel(
        sessionData.mode
      )} session rules. Try changing player preferences.`
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

  const alternativeQuartet =
    matchmakerVersion === "v2"
      ? findBestAutoMatchSelectionV2(
          rankedCandidates as ReturnType<typeof rankPlayersByRotationLoad>,
          { playersById, rotationHistory },
          sessionData.mode as SessionMode,
          sessionData.type as SessionType,
          {
            excludedQuartetKey: previousQuartetKey,
          }
        )
      : findBestAutoMatchSelection(
          rankedCandidates as ReturnType<typeof rankPlayersByFairness>,
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
    pointDiffGap: alternativePartition.pointDiffGap,
    rotationPenalty: alternativePartition.rotationPenalty,
    exactPartitionPenalty: alternativePartition.exactPartitionPenalty,
  };
}

export function selectBatchMatches({
  matchmakerVersion,
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  requestedMatchCount,
}: {
  matchmakerVersion: MatchmakerVersion;
  rankedCandidates: RankedCandidates;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
}) {
  const batchSelection =
    matchmakerVersion === "v2"
      ? findBestBatchAutoMatchSelectionV2(
          rankedCandidates as ReturnType<typeof rankPlayersByRotationLoad>,
          { playersById, rotationHistory },
          sessionData.mode as SessionMode,
          sessionData.type as SessionType,
          requestedMatchCount
        )
      : findBestBatchAutoMatchSelection(
          rankedCandidates as ReturnType<typeof rankPlayersByFairness>,
          playersById,
          sessionData.mode as SessionMode,
          sessionData.type as SessionType,
          rotationHistory,
          requestedMatchCount
        );

  if (!batchSelection) {
    throw new GenerateMatchError(
      400,
      `No valid set of matches found for current ${getSessionModeLabel(
        sessionData.mode
      )} session rules. Try changing player preferences.`
    );
  }

  return batchSelection;
}
