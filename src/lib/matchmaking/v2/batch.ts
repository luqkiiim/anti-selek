import { SessionMode, SessionType } from "../../../types/enums";

import { buildFairnessPool } from "./fairness";
import { compareSelectionsV2, evaluateQuartetV2 } from "./scoring";
import type {
  MatchmakingContext,
  RankedRotationLoadCandidate,
  V2BatchSelection,
  V2Selection,
} from "./types";

const NORMAL_EXTRA_CANDIDATES = [4, 8];
const MIXICANO_EXTRA_CANDIDATES = [8, 12];
const MAX_BATCH_QUARTETS = 240;

interface BatchSummary {
  maxLoadGap: number;
  maxObjectiveScore: number;
  totalLoadGap: number;
  totalObjectiveScore: number;
  totalRankSum: number;
  totalRandomScore: number;
}

function getPoolSizes(
  sessionMode: SessionMode,
  rankedCandidateCount: number,
  neededPlayers: number
) {
  const extras =
    sessionMode === SessionMode.MIXICANO
      ? MIXICANO_EXTRA_CANDIDATES
      : NORMAL_EXTRA_CANDIDATES;

  return extras
    .map((extra) => Math.min(rankedCandidateCount, neededPlayers + extra))
    .filter((size, index, sizes) => sizes.indexOf(size) === index);
}

function summarizeBatch(selections: V2Selection[]): BatchSummary {
  return selections.reduce<BatchSummary>(
    (summary, selection) => ({
      maxLoadGap: Math.max(summary.maxLoadGap, selection.maxLoadGap),
      maxObjectiveScore: Math.max(
        summary.maxObjectiveScore,
        selection.objectiveScore
      ),
      totalLoadGap: summary.totalLoadGap + selection.totalLoadGap,
      totalObjectiveScore: summary.totalObjectiveScore + selection.objectiveScore,
      totalRankSum: summary.totalRankSum + selection.rankSum,
      totalRandomScore: summary.totalRandomScore + selection.randomScore,
    }),
    {
      maxLoadGap: 0,
      maxObjectiveScore: 0,
      totalLoadGap: 0,
      totalObjectiveScore: 0,
      totalRankSum: 0,
      totalRandomScore: 0,
    }
  );
}

function compareBatchSummaries(
  left: BatchSummary,
  right: BatchSummary,
  _sessionType: SessionType
) {
  if (left.maxLoadGap !== right.maxLoadGap) {
    return left.maxLoadGap - right.maxLoadGap;
  }

  if (left.totalLoadGap !== right.totalLoadGap) {
    return left.totalLoadGap - right.totalLoadGap;
  }

  if (left.totalRankSum !== right.totalRankSum) {
    return left.totalRankSum - right.totalRankSum;
  }

  if (left.maxObjectiveScore !== right.maxObjectiveScore) {
    return left.maxObjectiveScore - right.maxObjectiveScore;
  }

  if (left.totalObjectiveScore !== right.totalObjectiveScore) {
    return left.totalObjectiveScore - right.totalObjectiveScore;
  }

  return left.totalRandomScore - right.totalRandomScore;
}

function buildQuartetCandidates<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  context: MatchmakingContext,
  sessionMode: SessionMode,
  sessionType: SessionType,
  poolSize: number
) {
  const pool = buildFairnessPool(
    rankedCandidates,
    Math.min(rankedCandidates.length, poolSize),
    0
  );
  const selections: V2Selection[] = [];

  for (let i = 0; i < pool.length - 3; i++) {
    for (let j = i + 1; j < pool.length - 2; j++) {
      for (let k = j + 1; k < pool.length - 1; k++) {
        for (let l = k + 1; l < pool.length; l++) {
          const ids: [string, string, string, string] = [
            pool[i].userId,
            pool[j].userId,
            pool[k].userId,
            pool[l].userId,
          ];
          const selection = evaluateQuartetV2(
            rankedCandidates,
            context,
            sessionMode,
            sessionType,
            ids
          );

          if (selection) {
            selections.push(selection);
          }
        }
      }
    }
  }

  return selections.sort((left, right) =>
    compareSelectionsV2(left, right, sessionType)
  ).slice(0, MAX_BATCH_QUARTETS);
}

export function findBestBatchAutoMatchSelectionV2<
  T extends RankedRotationLoadCandidate,
>(
  rankedCandidates: T[],
  context: MatchmakingContext,
  sessionMode: SessionMode,
  sessionType: SessionType,
  matchCount: number
): V2BatchSelection | null {
  const neededPlayers = matchCount * 4;

  if (rankedCandidates.length < neededPlayers) {
    return null;
  }

  for (const poolSize of getPoolSizes(
    sessionMode,
    rankedCandidates.length,
    neededPlayers
  )) {
    const quartets = buildQuartetCandidates(
      rankedCandidates,
      context,
      sessionMode,
      sessionType,
      poolSize
    );
    let bestSelections: V2Selection[] | null = null;
    let bestSummary: BatchSummary | null = null;

    const backtrack = (
      startIndex: number,
      chosen: V2Selection[],
      usedIds: Set<string>
    ) => {
      if (chosen.length === matchCount) {
        const summary = summarizeBatch(chosen);

        if (
          !bestSummary ||
          compareBatchSummaries(summary, bestSummary, sessionType) < 0
        ) {
          bestSelections = chosen;
          bestSummary = summary;
        }

        return;
      }

      for (let index = startIndex; index < quartets.length; index++) {
        const quartet = quartets[index];

        if (quartet.ids.some((id) => usedIds.has(id))) {
          continue;
        }

        const nextUsedIds = new Set(usedIds);
        quartet.ids.forEach((id) => nextUsedIds.add(id));
        backtrack(index + 1, [...chosen, quartet], nextUsedIds);
      }
    };

    backtrack(0, [], new Set<string>());

    if (bestSelections) {
      return {
        selections: bestSelections,
      };
    }
  }

  return null;
}
