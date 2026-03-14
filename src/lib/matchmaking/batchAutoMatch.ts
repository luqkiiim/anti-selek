import { SessionMode, SessionType } from "../../types/enums";
import { type RankedFairnessCandidate } from "./fairness";
import {
  evaluateBestPartition,
  type FallbackQuartetSelection,
  type PartitionCandidate,
  type RotationHistory,
} from "./partitioning";
import { type PlayerCandidate } from "./selectPlayers";

const BALANCED_SEARCH_WINDOW = 8;
const MIXICANO_SEARCH_WINDOW = 12;
const FAIRNESS_SLACK = 4;

type RankedBatchCandidate = RankedFairnessCandidate<PlayerCandidate>;

interface BatchSummary {
  maxTeamBalanceGap: number;
  totalTeamBalanceGap: number;
  maxPointDiffGap: number;
  totalPointDiffGap: number;
  totalExactPartitionPenalty: number;
  totalFairnessScore: number;
}

interface EvaluatedQuartet extends FallbackQuartetSelection {
  quartetQuota: Map<number, number>;
  userIds: Set<string>;
}

export interface BatchAutoMatchSelection {
  selections: FallbackQuartetSelection[];
  band: "gap0" | "gap1" | "gap2" | "fallback";
}

function getSearchWindow(sessionMode: SessionMode, matchCount: number) {
  const base =
    sessionMode === SessionMode.MIXICANO
      ? MIXICANO_SEARCH_WINDOW
      : BALANCED_SEARCH_WINDOW;

  return Math.max(matchCount * 4, base + Math.max(0, matchCount - 1) * 4);
}

function getCandidatesWithinMatchGap(
  rankedCandidates: RankedBatchCandidate[],
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
  rankedCandidates: RankedBatchCandidate[],
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

function buildMatchesPlayedQuota(values: number[]) {
  const quota = new Map<number, number>();

  for (const value of values) {
    quota.set(value, (quota.get(value) ?? 0) + 1);
  }

  return quota;
}

function getMatchesPlayedQuotaForIds(
  rankedCandidates: RankedBatchCandidate[],
  ids: string[]
) {
  const matchesPlayedByUserId = new Map(
    rankedCandidates.map((candidate) => [candidate.userId, candidate.matchesPlayed])
  );

  const values: number[] = [];
  for (const id of ids) {
    const matchesPlayed = matchesPlayedByUserId.get(id);

    if (typeof matchesPlayed !== "number") {
      return null;
    }

    values.push(matchesPlayed);
  }

  return buildMatchesPlayedQuota(values);
}

function summarizeBatch(selections: FallbackQuartetSelection[]): BatchSummary {
  return selections.reduce<BatchSummary>(
    (summary, selection) => ({
      maxTeamBalanceGap: Math.max(summary.maxTeamBalanceGap, selection.score),
      totalTeamBalanceGap: summary.totalTeamBalanceGap + selection.score,
      maxPointDiffGap: Math.max(summary.maxPointDiffGap, selection.pointDiffGap),
      totalPointDiffGap: summary.totalPointDiffGap + selection.pointDiffGap,
      totalExactPartitionPenalty:
        summary.totalExactPartitionPenalty + selection.exactPartitionPenalty,
      totalFairnessScore: summary.totalFairnessScore + selection.fairnessScore,
    }),
    {
      maxTeamBalanceGap: 0,
      totalTeamBalanceGap: 0,
      maxPointDiffGap: 0,
      totalPointDiffGap: 0,
      totalExactPartitionPenalty: 0,
      totalFairnessScore: 0,
    }
  );
}

function compareBatchSummaries(
  left: BatchSummary,
  right: BatchSummary,
  sessionType: SessionType
) {
  if (left.maxTeamBalanceGap !== right.maxTeamBalanceGap) {
    return left.maxTeamBalanceGap - right.maxTeamBalanceGap;
  }

  if (left.totalTeamBalanceGap !== right.totalTeamBalanceGap) {
    return left.totalTeamBalanceGap - right.totalTeamBalanceGap;
  }

  if (sessionType === SessionType.POINTS) {
    if (left.maxPointDiffGap !== right.maxPointDiffGap) {
      return left.maxPointDiffGap - right.maxPointDiffGap;
    }

    if (left.totalPointDiffGap !== right.totalPointDiffGap) {
      return left.totalPointDiffGap - right.totalPointDiffGap;
    }
  }

  if (left.totalExactPartitionPenalty !== right.totalExactPartitionPenalty) {
    return left.totalExactPartitionPenalty - right.totalExactPartitionPenalty;
  }

  if (left.totalFairnessScore !== right.totalFairnessScore) {
    return left.totalFairnessScore - right.totalFairnessScore;
  }

  return 0;
}

function buildQuartetCandidates(
  rankedCandidates: RankedBatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  maxCandidates: number
) {
  const candidatePool = rankedCandidates.slice(
    0,
    Math.min(maxCandidates, rankedCandidates.length)
  );
  const matchesPlayedByUserId = new Map(
    candidatePool.map((candidate) => [candidate.userId, candidate.matchesPlayed])
  );
  const quartets: EvaluatedQuartet[] = [];

  for (let i = 0; i < candidatePool.length - 3; i++) {
    for (let j = i + 1; j < candidatePool.length - 2; j++) {
      for (let k = j + 1; k < candidatePool.length - 1; k++) {
        for (let l = k + 1; l < candidatePool.length; l++) {
          const ids: [string, string, string, string] = [
            candidatePool[i].userId,
            candidatePool[j].userId,
            candidatePool[k].userId,
            candidatePool[l].userId,
          ];
          const evaluation = evaluateBestPartition(
            ids,
            playersById,
            sessionMode,
            sessionType,
            rotationHistory
          );

          if (!evaluation) continue;

          const quartetQuotaValues = ids
            .map((id) => matchesPlayedByUserId.get(id))
            .filter((value): value is number => typeof value === "number");

          if (quartetQuotaValues.length !== ids.length) continue;

          quartets.push({
            ids,
            partition: evaluation.partition,
            fairnessScore: getFairnessScore(rankedCandidates, ids),
            score: evaluation.score,
            pointDiffGap: evaluation.pointDiffGap,
            exactPartitionPenalty: evaluation.exactPartitionPenalty,
            quartetQuota: buildMatchesPlayedQuota(quartetQuotaValues),
            userIds: new Set(ids),
          });
        }
      }
    }
  }

  return quartets.sort((left, right) => {
    const summaryComparison = compareBatchSummaries(
      summarizeBatch([left]),
      summarizeBatch([right]),
      sessionType
    );

    if (summaryComparison !== 0) {
      return summaryComparison;
    }

    return left.fairnessScore - right.fairnessScore;
  });
}

function fitsQuota(
  currentQuota: Map<number, number>,
  quartetQuota: Map<number, number>,
  targetQuota: Map<number, number>
) {
  for (const [matchesPlayed, count] of quartetQuota.entries()) {
    if ((currentQuota.get(matchesPlayed) ?? 0) + count > (targetQuota.get(matchesPlayed) ?? 0)) {
      return false;
    }
  }

  return true;
}

function mergeQuota(
  currentQuota: Map<number, number>,
  quartetQuota: Map<number, number>
) {
  const nextQuota = new Map(currentQuota);

  for (const [matchesPlayed, count] of quartetQuota.entries()) {
    nextQuota.set(matchesPlayed, (nextQuota.get(matchesPlayed) ?? 0) + count);
  }

  return nextQuota;
}

function quotaMatches(
  left: Map<number, number>,
  right: Map<number, number> | undefined
) {
  if (!right) return true;
  if (left.size !== right.size) return false;

  return [...right.entries()].every(
    ([matchesPlayed, count]) => left.get(matchesPlayed) === count
  );
}

function searchBatchCandidatePool(
  rankedCandidates: RankedBatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  matchCount: number
) {
  if (rankedCandidates.length < matchCount * 4) return null;

  const baselineIds = rankedCandidates
    .slice(0, matchCount * 4)
    .map((candidate) => candidate.userId);
  const baselineQuota = getMatchesPlayedQuotaForIds(rankedCandidates, baselineIds);
  const baselineFairnessScore = baselineIds.reduce(
    (sum, id, index) => sum + index + (rankedCandidates[index]?.userId === id ? 0 : 0),
    0
  );
  const maxFairnessScore = baselineFairnessScore + FAIRNESS_SLACK * matchCount;
  const quartets = buildQuartetCandidates(
    rankedCandidates,
    playersById,
    sessionMode,
    sessionType,
    rotationHistory,
    getSearchWindow(sessionMode, matchCount)
  );

  const search = (targetQuota?: Map<number, number>) => {
    let bestSelections: FallbackQuartetSelection[] | null = null;
    let bestSummary: BatchSummary | null = null;

    const backtrack = (
      startIndex: number,
      chosen: EvaluatedQuartet[],
      usedIds: Set<string>,
      quota: Map<number, number>,
      fairnessScoreTotal: number
    ) => {
      if (chosen.length === matchCount) {
        if (fairnessScoreTotal > maxFairnessScore) return;
        if (!quotaMatches(quota, targetQuota)) return;

        const nextSelections = chosen.map((quartet) => ({
          ids: quartet.ids,
          partition: quartet.partition,
          fairnessScore: quartet.fairnessScore,
          score: quartet.score,
          pointDiffGap: quartet.pointDiffGap,
          exactPartitionPenalty: quartet.exactPartitionPenalty,
        }));
        const nextSummary = summarizeBatch(nextSelections);

        if (
          !bestSummary ||
          compareBatchSummaries(nextSummary, bestSummary, sessionType) < 0
        ) {
          bestSelections = nextSelections;
          bestSummary = nextSummary;
        }
        return;
      }

      for (let index = startIndex; index < quartets.length; index++) {
        const quartet = quartets[index];

        if (fairnessScoreTotal + quartet.fairnessScore > maxFairnessScore) {
          continue;
        }

        if (
          [...quartet.userIds].some((userId) => usedIds.has(userId))
        ) {
          continue;
        }

        if (targetQuota && !fitsQuota(quota, quartet.quartetQuota, targetQuota)) {
          continue;
        }

        const nextUsedIds = new Set(usedIds);
        quartet.userIds.forEach((userId) => nextUsedIds.add(userId));

        backtrack(
          index + 1,
          [...chosen, quartet],
          nextUsedIds,
          mergeQuota(quota, quartet.quartetQuota),
          fairnessScoreTotal + quartet.fairnessScore
        );
      }
    };

    backtrack(0, [], new Set<string>(), new Map<number, number>(), 0);

    return bestSelections;
  };

  return search(baselineQuota ?? undefined) ?? search(undefined);
}

export function findBestBatchAutoMatchSelection(
  rankedCandidates: RankedBatchCandidate[],
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  sessionType: SessionType,
  rotationHistory: RotationHistory,
  matchCount: number
): BatchAutoMatchSelection | null {
  const gapSelections: Array<{
    band: BatchAutoMatchSelection["band"];
    candidates: RankedBatchCandidate[];
  }> = [
    { band: "gap0", candidates: getCandidatesWithinMatchGap(rankedCandidates, 0) },
    { band: "gap1", candidates: getCandidatesWithinMatchGap(rankedCandidates, 1) },
    { band: "gap2", candidates: getCandidatesWithinMatchGap(rankedCandidates, 2) },
    { band: "fallback", candidates: rankedCandidates },
  ];

  for (const { band, candidates } of gapSelections) {
    const selections = searchBatchCandidatePool(
      candidates,
      playersById,
      sessionMode,
      sessionType,
      rotationHistory,
      matchCount
    );

    if (selections) {
      return {
        selections,
        band,
      };
    }
  }

  return null;
}
