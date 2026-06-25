import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import type { PartitionCandidate } from "@/lib/matchmaking/partitioning";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import { isValidPartitionForMode } from "@/lib/matchmaking/v3/balance";
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
import { SessionMode, SessionType } from "@/types/enums";
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
  strength?: number;
};

interface InterclubSelection {
  ids: [string, string, string, string];
  partition: ManualMatchTeams;
  team1ClubId: string;
  team2ClubId: string;
  matchmakingReasonJson: string;
}

interface InterclubCandidateScore {
  selection: InterclubSelection;
  fairnessKey: number[];
  rankSum: number;
  balanceGap: number;
  pointDiffGap: number;
  restScore: number;
  stableKey: string;
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

function buildPairs<T>(items: T[]) {
  const pairs: Array<[T, T]> = [];

  for (let left = 0; left < items.length - 1; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      pairs.push([items[left], items[right]]);
    }
  }

  return pairs;
}

function getCandidateRankByUserId(
  rankedCandidates: readonly RankedInterclubCandidate[]
) {
  return new Map(
    rankedCandidates.map((candidate, index) => [candidate.userId, index])
  );
}

function getCandidateByUserId(
  rankedCandidates: readonly RankedInterclubCandidate[]
) {
  return new Map(
    rankedCandidates.map((candidate) => [candidate.userId, candidate])
  );
}

function getTeamStrength(
  playersById: Map<string, PartitionCandidate>,
  team: [string, string]
) {
  return team.reduce(
    (sum, userId) => sum + (playersById.get(userId)?.elo ?? 0),
    0
  );
}

function getTeamPointDiff(
  playersById: Map<string, PartitionCandidate>,
  team: [string, string]
) {
  return team.reduce(
    (sum, userId) => sum + (playersById.get(userId)?.pointDiff ?? 0),
    0
  );
}

function getFairnessKey(
  candidateByUserId: Map<string, RankedInterclubCandidate>,
  ids: readonly string[]
) {
  return ids
    .map((id) => {
      const candidate = candidateByUserId.get(id);
      return candidate?.matchmakingBaseline ?? candidate?.matchesPlayed ?? 0;
    })
    .sort((left, right) => left - right);
}

function compareFairnessKeys(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function compareInterclubCandidateScores(
  left: InterclubCandidateScore,
  right: InterclubCandidateScore
) {
  return (
    compareFairnessKeys(left.fairnessKey, right.fairnessKey) ||
    left.rankSum - right.rankSum ||
    left.balanceGap - right.balanceGap ||
    left.pointDiffGap - right.pointDiffGap ||
    right.restScore - left.restScore ||
    left.stableKey.localeCompare(right.stableKey)
  );
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

function isSameReshuffleSelection(
  selection: Pick<InterclubSelection, "ids" | "partition">,
  reshuffleSource: ReshuffleSource | null
) {
  if (!reshuffleSource) {
    return false;
  }

  const quartetKey = [...selection.ids].sort().join("|");
  const previousQuartetKey = [...reshuffleSource.ids].sort().join("|");

  if (quartetKey !== previousQuartetKey) {
    return false;
  }

  return (
    getExactPartitionKey(selection.partition) ===
    getExactPartitionKey(reshuffleSource.partition)
  );
}

function getInterclubShortageMessage({
  sessionData,
  clubIds,
  candidatesByClubId,
}: {
  sessionData: GenerateMatchSession;
  clubIds: [string, string];
  candidatesByClubId: Map<string, RankedInterclubCandidate[]>;
}) {
  const label = getSessionModeLabel(getEffectiveSessionMode(sessionData));
  const counts = clubIds.map(
    (clubId) => candidatesByClubId.get(clubId)?.length ?? 0
  );

  if (counts.some((count) => count < 2)) {
    return `Club vs club needs at least 2 available players from each club (currently ${counts[0]} vs ${counts[1]}).`;
  }

  return `No valid club vs club pairing found for current ${label} session rules. Try changing player preferences or side assignments.`;
}

function scoreInterclubSelection({
  selection,
  rankedCandidates,
  playersById,
}: {
  selection: InterclubSelection;
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
}): InterclubCandidateScore {
  const rankByUserId = getCandidateRankByUserId(rankedCandidates);
  const candidateByUserId = getCandidateByUserId(rankedCandidates);
  const team1Strength = getTeamStrength(playersById, selection.partition.team1);
  const team2Strength = getTeamStrength(playersById, selection.partition.team2);
  const team1PointDiff = getTeamPointDiff(playersById, selection.partition.team1);
  const team2PointDiff = getTeamPointDiff(playersById, selection.partition.team2);
  const balanceGap = Math.abs(team1Strength - team2Strength);
  const pointDiffGap = Math.abs(team1PointDiff - team2PointDiff);
  const ids = [...selection.ids];

  return {
    selection: {
      ...selection,
      matchmakingReasonJson: buildInterclubReasonJson({
        team1ClubId: selection.team1ClubId,
        team2ClubId: selection.team2ClubId,
        balanceGap,
        pointDiffGap,
      }),
    },
    fairnessKey: getFairnessKey(candidateByUserId, ids),
    rankSum: ids.reduce((sum, id) => sum + (rankByUserId.get(id) ?? 0), 0),
    balanceGap,
    pointDiffGap,
    restScore: ids.reduce(
      (sum, id) => sum + (candidateByUserId.get(id)?.restTurns ?? 0),
      0
    ),
    stableKey: ids.slice().sort().join("|"),
  };
}

function getCandidatePairsByClub({
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

  return {
    candidatesByClubId,
    clubAPairs: buildPairs(candidatesByClubId.get(clubIds[0]) ?? []),
    clubBPairs: buildPairs(candidatesByClubId.get(clubIds[1]) ?? []),
  };
}

function selectBestInterclubScore({
  sessionData,
  rankedCandidates,
  playersById,
  reshuffleSource = null,
}: {
  sessionData: GenerateMatchSession;
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  reshuffleSource?: ReshuffleSource | null;
}) {
  const clubIds = getInterclubClubIds(sessionData);
  if (!clubIds) {
    return null;
  }

  ensureInterclubSessionReady(sessionData);

  const { candidatesByClubId, clubAPairs, clubBPairs } =
    getCandidatePairsByClub({ sessionData, rankedCandidates, clubIds });
  let bestScore: InterclubCandidateScore | null = null;

  for (const clubAPair of clubAPairs) {
    for (const clubBPair of clubBPairs) {
      const partition: ManualMatchTeams = {
        team1: [clubAPair[0].userId, clubAPair[1].userId],
        team2: [clubBPair[0].userId, clubBPair[1].userId],
      };

      if (
        !isValidPartitionForMode(
          partition,
          playersById,
          getEffectiveSessionMode(sessionData) as SessionMode
        )
      ) {
        continue;
      }

      const selection: InterclubSelection = {
        ids: [
          partition.team1[0],
          partition.team1[1],
          partition.team2[0],
          partition.team2[1],
        ],
        partition,
        team1ClubId: clubIds[0],
        team2ClubId: clubIds[1],
        matchmakingReasonJson: "",
      };

      if (isSameReshuffleSelection(selection, reshuffleSource)) {
        continue;
      }

      const score = scoreInterclubSelection({
        selection,
        rankedCandidates,
        playersById,
      });

      if (!bestScore || compareInterclubCandidateScores(score, bestScore) < 0) {
        bestScore = score;
      }
    }
  }

  if (!bestScore) {
    throw new GenerateMatchError(
      400,
      getInterclubShortageMessage({
        sessionData,
        clubIds,
        candidatesByClubId,
      })
    );
  }

  return bestScore;
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
  return selectBestInterclubScore({
    sessionData,
    rankedCandidates,
    playersById,
    reshuffleSource,
  })!.selection;
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

  ensureInterclubSessionReady(sessionData);

  const excludedUserIdSet = new Set(excludedUserIds);
  let bestScore: InterclubCandidateScore | null = null;

  for (const candidate of rankedCandidates) {
    if (
      retainedUserIdSet.has(candidate.userId) ||
      excludedUserIdSet.has(candidate.userId)
    ) {
      continue;
    }

    const selectedUserIds = [...retainedUserIds, candidate.userId] as [
      string,
      string,
      string,
      string,
    ];
    const selectedRankedCandidates = rankedCandidates.filter((rankedCandidate) =>
      selectedUserIds.includes(rankedCandidate.userId)
    );

    if (selectedRankedCandidates.length !== 4) {
      continue;
    }

    try {
      const score = selectBestInterclubScore({
        sessionData,
        rankedCandidates: selectedRankedCandidates,
        playersById,
      });

      if (score && (!bestScore || compareInterclubCandidateScores(score, bestScore) < 0)) {
        bestScore = score;
      }
    } catch (error) {
      if (!(error instanceof GenerateMatchError)) {
        throw error;
      }
    }
  }

  if (!bestScore) {
    throw new GenerateMatchError(
      409,
      "No eligible replacement player was available for this club vs club match."
    );
  }

  return bestScore.selection;
}

export function selectInterclubBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  requestedMatchCount,
}: {
  rankedCandidates: readonly RankedInterclubCandidate[];
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  requestedMatchCount: number;
}) {
  if (
    getEffectiveSessionType(sessionData) === SessionType.LADDER ||
    getEffectiveSessionType(sessionData) === SessionType.RACE
  ) {
    throw new GenerateMatchError(
      400,
      "Club vs club matchmaking uses balanced doubles, not ladder or race grouping."
    );
  }

  const selections: InterclubSelection[] = [];
  let workingRankedCandidates = [...rankedCandidates];

  for (let index = 0; index < requestedMatchCount; index += 1) {
    const selection = selectInterclubSingleCourtMatch({
      rankedCandidates: workingRankedCandidates,
      playersById,
      sessionData,
      reshuffleSource: null,
    });
    const selectedIds = new Set(selection.ids);
    selections.push(selection);
    workingRankedCandidates = workingRankedCandidates.filter(
      (candidate) => !selectedIds.has(candidate.userId)
    );
  }

  return { selections };
}
