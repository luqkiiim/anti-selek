import { SessionMode, SessionType } from "../../types/enums";
import { type RankedFairnessCandidate } from "./fairness";
import {
  evaluateBestPartition,
  findBestFallbackQuartet,
  findBestQuartetInFairnessWindow,
  getQuartetKey,
  type FallbackQuartetSelection,
  type PartitionCandidate,
  type RotationHistory,
} from "./partitioning";
import { selectMatchPlayers, type PlayerCandidate } from "./selectPlayers";

const BALANCED_SEARCH_WINDOW = 8;
const MIXICANO_SEARCH_WINDOW = 12;
const FAIRNESS_SLACK = 4;

export interface AutoMatchSelection extends FallbackQuartetSelection {
  band: "gap0" | "gap1" | "gap2" | "fallback";
}

type RankedAutoMatchCandidate = RankedFairnessCandidate<PlayerCandidate>;

function getSearchWindow(sessionMode: SessionMode) {
  return sessionMode === SessionMode.MIXICANO
    ? MIXICANO_SEARCH_WINDOW
    : BALANCED_SEARCH_WINDOW;
}

function getCandidatesWithinMatchGap(
  rankedCandidates: RankedAutoMatchCandidate[],
  maxMatchGap?: number
) {
  if (rankedCandidates.length === 0 || typeof maxMatchGap !== "number") {
    return rankedCandidates;
  }

  const minMatchesPlayed = Math.min(
    ...rankedCandidates.map((candidate) => candidate.matchesPlayed)
  );

  return rankedCandidates.filter(
    (candidate) => candidate.matchesPlayed <= minMatchesPlayed + maxMatchGap
  );
}

function getFairnessScore(
  rankedCandidates: RankedAutoMatchCandidate[],
  ids: [string, string, string, string]
) {
  const rankByUserId = new Map(
    rankedCandidates.map((candidate, index) => [candidate.userId, index])
  );

  return ids.reduce(
    (sum, id) => sum + (rankByUserId.get(id) ?? rankedCandidates.length),
    0
  );
}

function getSelectionGuardrails(
  rankedCandidates: RankedAutoMatchCandidate[],
  baselineIds: [string, string, string, string]
) {
  const actualCounts = rankedCandidates.map((candidate) => candidate.matchesPlayed);
  const minActual = Math.min(...actualCounts);
  const maxActual = Math.max(...actualCounts);
  const lowestCohortUserIds =
    maxActual > minActual
      ? new Set(
          rankedCandidates
            .filter((candidate) => candidate.matchesPlayed === minActual)
            .map((candidate) => candidate.userId)
        )
      : undefined;
  const maxLowestCohortPlayers =
    lowestCohortUserIds && lowestCohortUserIds.size > 0
      ? baselineIds.filter((id) => lowestCohortUserIds.has(id)).length
      : undefined;

  return { lowestCohortUserIds, maxLowestCohortPlayers };
}

function getBaselineMatchesPlayedQuota(
  rankedCandidates: RankedAutoMatchCandidate[],
  baselineIds: [string, string, string, string]
) {
  const matchesPlayedByUserId = new Map(
    rankedCandidates.map((candidate) => [candidate.userId, candidate.matchesPlayed])
  );
  const quota = new Map<number, number>();

  for (const id of baselineIds) {
    const matchesPlayed = matchesPlayedByUserId.get(id);

    if (typeof matchesPlayed !== "number") {
      return null;
    }

    quota.set(matchesPlayed, (quota.get(matchesPlayed) ?? 0) + 1);
  }

  return quota;
}

function buildLockedQuartetSelection(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  baselineIds: [string, string, string, string],
  excludedQuartetKey?: string
): FallbackQuartetSelection | null {
  if (excludedQuartetKey && getQuartetKey(baselineIds) === excludedQuartetKey) {
    return null;
  }

  const evaluation = evaluateBestPartition(
    baselineIds,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory
  );

  if (!evaluation) {
    return null;
  }

  return {
    ids: baselineIds,
    partition: evaluation.partition,
    fairnessScore: getFairnessScore(rankedCandidates, baselineIds),
    score: evaluation.score,
    pointDiffGap: evaluation.pointDiffGap,
    exactPartitionPenalty: evaluation.exactPartitionPenalty,
  };
}

function searchAlternativeQuartet(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  baselineIds: [string, string, string, string],
  excludedQuartetKey?: string
): FallbackQuartetSelection | null {
  const { lowestCohortUserIds, maxLowestCohortPlayers } = getSelectionGuardrails(
    rankedCandidates,
    baselineIds
  );

  const fairnessWindowSelection = findBestQuartetInFairnessWindow(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    {
      baselineIds,
      fairnessSlack: FAIRNESS_SLACK,
      maxCandidates: getSearchWindow(sessionMode),
      excludedQuartetKey,
      lowestCohortUserIds,
      maxLowestCohortPlayers,
    }
  );

  if (fairnessWindowSelection) {
    return fairnessWindowSelection;
  }

  return findBestFallbackQuartet(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    getSearchWindow(sessionMode),
    {
      excludedQuartetKey,
      lowestCohortUserIds,
      maxLowestCohortPlayers,
    }
  );
}

function searchWithinLockedFairnessProfile(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  baselineIds: [string, string, string, string],
  excludedQuartetKey?: string
) {
  const matchesPlayedQuota = getBaselineMatchesPlayedQuota(
    rankedCandidates,
    baselineIds
  );

  if (!matchesPlayedQuota) {
    return null;
  }

  return findBestQuartetInFairnessWindow(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    {
      baselineIds,
      fairnessSlack: FAIRNESS_SLACK,
      matchesPlayedQuota,
      maxCandidates: getSearchWindow(sessionMode),
      excludedQuartetKey,
    }
  );
}

function searchCandidatePool(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  excludedQuartetKey?: string,
  now?: number
): FallbackQuartetSelection | null {
  if (rankedCandidates.length < 4) return null;

  const selected = selectMatchPlayers(rankedCandidates, {
    rankedCandidates,
    now,
  });
  if (!selected) return null;

  const baselineIds = selected.map((player) => player.userId) as [
    string,
    string,
    string,
    string,
  ];

  const lockedSelection = buildLockedQuartetSelection(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    baselineIds,
    excludedQuartetKey
  );

  if (lockedSelection) {
    return (
      searchWithinLockedFairnessProfile(
        rankedCandidates,
        playersById,
        sessionMode,
        sessionType,
        rotationHistory,
        baselineIds,
        excludedQuartetKey
      ) ?? lockedSelection
    );
  }

  return searchAlternativeQuartet(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    baselineIds,
    excludedQuartetKey
  );
}

function withBand(
  selection: FallbackQuartetSelection | null,
  band: AutoMatchSelection["band"]
): AutoMatchSelection | null {
  return selection ? { ...selection, band } : null;
}

export function findBestAutoMatchSelection(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  options?: {
    excludedQuartetKey?: string;
    now?: number;
  }
): AutoMatchSelection | null {
  const gapSelections: Array<{
    band: AutoMatchSelection["band"];
    candidates: RankedAutoMatchCandidate[];
  }> = [
    { band: "gap0", candidates: getCandidatesWithinMatchGap(rankedCandidates, 0) },
    { band: "gap1", candidates: getCandidatesWithinMatchGap(rankedCandidates, 1) },
    { band: "gap2", candidates: getCandidatesWithinMatchGap(rankedCandidates, 2) },
  ];

  for (const { band, candidates } of gapSelections) {
    const selection = searchCandidatePool(
      candidates,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey,
      options?.now
    );

    if (selection) {
      return withBand(selection, band);
    }
  }

  return withBand(
    searchCandidatePool(
      rankedCandidates,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey,
      options?.now
    ),
    "fallback"
  );
}
