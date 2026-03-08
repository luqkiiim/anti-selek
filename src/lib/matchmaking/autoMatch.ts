import { SessionMode, SessionType } from "../../types/enums";
import { type RankedFairnessCandidate } from "./fairness";
import {
  findBestFallbackQuartet,
  type FallbackQuartetSelection,
  type PartitionCandidate,
  type RotationHistory,
} from "./partitioning";
import { selectMatchPlayers, type PlayerCandidate } from "./selectPlayers";

const BALANCED_SEARCH_WINDOW = 8;
const MIXICANO_SEARCH_WINDOW = 12;
const ELO_WIDENING_IMPROVEMENT_THRESHOLD = 40;
const POINTS_WIDENING_IMPROVEMENT_THRESHOLD = 1.5;

export interface AutoMatchSelection extends FallbackQuartetSelection {
  band: "gap0" | "gap1" | "gap2" | "fallback";
}

type RankedAutoMatchCandidate = RankedFairnessCandidate<PlayerCandidate>;

function getSearchWindow(sessionMode: SessionMode) {
  return sessionMode === SessionMode.MIXICANO
    ? MIXICANO_SEARCH_WINDOW
    : BALANCED_SEARCH_WINDOW;
}

function getWideningImprovementThreshold(sessionType: SessionType) {
  return sessionType === SessionType.POINTS
    ? POINTS_WIDENING_IMPROVEMENT_THRESHOLD
    : ELO_WIDENING_IMPROVEMENT_THRESHOLD;
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

function searchCandidatePool(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  excludedQuartetKey?: string
): FallbackQuartetSelection | null {
  if (rankedCandidates.length < 4) return null;

  const selected = selectMatchPlayers(rankedCandidates, { rankedCandidates });
  if (!selected) return null;

  const baselineIds = selected.map((player) => player.userId) as [
    string,
    string,
    string,
    string,
  ];
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

function withBand(
  selection: FallbackQuartetSelection | null,
  band: AutoMatchSelection["band"]
): AutoMatchSelection | null {
  return selection ? { ...selection, band } : null;
}

function shouldUseWiderBand(
  tighterSelection: FallbackQuartetSelection,
  widerSelection: FallbackQuartetSelection,
  sessionType: SessionType
) {
  return (
    tighterSelection.score - widerSelection.score >
    getWideningImprovementThreshold(sessionType)
  );
}

export function findBestAutoMatchSelection(
  rankedCandidates: RankedAutoMatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  options?: {
    excludedQuartetKey?: string;
  }
): AutoMatchSelection | null {
  const gapZeroSelection = withBand(
    searchCandidatePool(
      getCandidatesWithinMatchGap(rankedCandidates, 0),
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey
    ),
    "gap0"
  );
  const gapOneSelection = withBand(
    searchCandidatePool(
      getCandidatesWithinMatchGap(rankedCandidates, 1),
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey
    ),
    "gap1"
  );
  const gapTwoSelection = withBand(
    searchCandidatePool(
      getCandidatesWithinMatchGap(rankedCandidates, 2),
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey
    ),
    "gap2"
  );

  let preferredSelection = gapZeroSelection ?? gapOneSelection ?? gapTwoSelection;

  if (
    preferredSelection === gapZeroSelection &&
    gapZeroSelection &&
    gapOneSelection &&
    shouldUseWiderBand(gapZeroSelection, gapOneSelection, sessionType)
  ) {
    preferredSelection = gapOneSelection;
  }

  if (
    preferredSelection &&
    gapTwoSelection &&
    preferredSelection !== gapTwoSelection &&
    shouldUseWiderBand(preferredSelection, gapTwoSelection, sessionType)
  ) {
    preferredSelection = gapTwoSelection;
  }

  if (preferredSelection) return preferredSelection;

  return withBand(
    searchCandidatePool(
      rankedCandidates,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      options?.excludedQuartetKey
    ),
    "fallback"
  );
}
