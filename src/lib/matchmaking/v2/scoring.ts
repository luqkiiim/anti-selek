import { SessionType, SessionMode } from "../../../types/enums";
import {
  getDoublesPartitions,
  scorePartitionDetailed,
  type PartitionScoreDetails,
} from "../partitioning";

import { compareFairness, summarizeFairness } from "./fairness";
import type {
  RankedRotationLoadCandidate,
  MatchmakingContext,
  V2Selection,
} from "./types";

const BALANCE_WEIGHT = 2;
const POINT_DIFF_WEIGHT = 1 / 3;

function getRandomScore<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  ids: [string, string, string, string]
) {
  const randomByUserId = new Map(
    rankedCandidates.map((candidate) => [candidate.userId, candidate._random])
  );

  return ids.reduce((sum, id) => sum + (randomByUserId.get(id) ?? 0), 0);
}

function getObjectiveScore(
  score: PartitionScoreDetails,
  sessionType: SessionType
) {
  return (
    score.balanceScore * BALANCE_WEIGHT +
    score.rotationPenalty +
    score.exactPartitionPenalty +
    (sessionType === SessionType.POINTS
      ? score.pointDiffGap * POINT_DIFF_WEIGHT
      : 0)
  );
}

function comparePartitionScores(
  left: PartitionScoreDetails,
  right: PartitionScoreDetails,
  sessionType: SessionType
) {
  const objectiveDelta =
    getObjectiveScore(left, sessionType) - getObjectiveScore(right, sessionType);

  if (objectiveDelta !== 0) {
    return objectiveDelta;
  }

  if (left.teamBalanceGap !== right.teamBalanceGap) {
    return left.teamBalanceGap - right.teamBalanceGap;
  }

  if (sessionType === SessionType.POINTS && left.pointDiffGap !== right.pointDiffGap) {
    return left.pointDiffGap - right.pointDiffGap;
  }

  if (left.rotationPenalty !== right.rotationPenalty) {
    return left.rotationPenalty - right.rotationPenalty;
  }

  if (left.exactPartitionPenalty !== right.exactPartitionPenalty) {
    return left.exactPartitionPenalty - right.exactPartitionPenalty;
  }

  return 0;
}

export function evaluateQuartetV2<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  context: MatchmakingContext,
  sessionMode: SessionMode,
  sessionType: SessionType,
  ids: [string, string, string, string]
): V2Selection | null {
  const fairness = summarizeFairness(rankedCandidates, ids);
  const randomScore = getRandomScore(rankedCandidates, ids);
  let bestSelection: V2Selection | null = null;
  let bestScore: PartitionScoreDetails | null = null;

  for (const partition of getDoublesPartitions(ids)) {
    const score = scorePartitionDetailed(
      partition,
      context.playersById,
      sessionMode,
      sessionType,
      context.rotationHistory
    );

    if (!score) {
      continue;
    }

    if (!bestScore || comparePartitionScores(score, bestScore, sessionType) < 0) {
      bestScore = score;
      bestSelection = {
        ...fairness,
        ids,
        partition,
        objectiveScore: getObjectiveScore(score, sessionType),
        pointDiffGap: score.pointDiffGap,
        randomScore,
        rotationPenalty: score.rotationPenalty,
        score: score.teamBalanceGap,
        exactPartitionPenalty: score.exactPartitionPenalty,
      };
    }
  }

  return bestSelection;
}

export function compareSelectionsV2(
  left: V2Selection,
  right: V2Selection,
  sessionType: SessionType
) {
  const fairnessDelta = compareFairness(left, right);

  if (fairnessDelta !== 0) {
    return fairnessDelta;
  }

  if (left.objectiveScore !== right.objectiveScore) {
    return left.objectiveScore - right.objectiveScore;
  }

  if (left.score !== right.score) {
    return left.score - right.score;
  }

  if (sessionType === SessionType.POINTS && left.pointDiffGap !== right.pointDiffGap) {
    return left.pointDiffGap - right.pointDiffGap;
  }

  if (left.rotationPenalty !== right.rotationPenalty) {
    return left.rotationPenalty - right.rotationPenalty;
  }

  if (left.exactPartitionPenalty !== right.exactPartitionPenalty) {
    return left.exactPartitionPenalty - right.exactPartitionPenalty;
  }

  return left.randomScore - right.randomScore;
}
