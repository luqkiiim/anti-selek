import type {
  ActiveMatchmakerLadderPlayer,
  LadderGroupingSummary,
} from "./types";

function buildPairwiseGapTotal(values: number[]) {
  let total = 0;

  for (let leftIndex = 0; leftIndex < values.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex++) {
      total += Math.abs(values[leftIndex] - values[rightIndex]);
    }
  }

  return total;
}

export function buildLadderGroupingSummary<
  T extends Pick<ActiveMatchmakerLadderPlayer, "ladderScore" | "pointDiff">,
>(players: T[]): LadderGroupingSummary {
  const ladderScores = [...players]
    .map((player) => player.ladderScore)
    .sort((left, right) => left - right);
  const pointDiffs = [...players]
    .map((player) => player.pointDiff)
    .sort((left, right) => left - right);

  return {
    maxLadderGap:
      (ladderScores[ladderScores.length - 1] ?? 0) - (ladderScores[0] ?? 0),
    totalLadderGap: buildPairwiseGapTotal(ladderScores),
    pointDiffSpread:
      (pointDiffs[pointDiffs.length - 1] ?? 0) - (pointDiffs[0] ?? 0),
    totalPointDiffGap: buildPairwiseGapTotal(pointDiffs),
  };
}

export function compareLadderGroupingSummaries(
  left: LadderGroupingSummary,
  right: LadderGroupingSummary
) {
  if (left.maxLadderGap !== right.maxLadderGap) {
    return left.maxLadderGap - right.maxLadderGap;
  }

  if (left.totalLadderGap !== right.totalLadderGap) {
    return left.totalLadderGap - right.totalLadderGap;
  }

  if (left.pointDiffSpread !== right.pointDiffSpread) {
    return left.pointDiffSpread - right.pointDiffSpread;
  }

  if (left.totalPointDiffGap !== right.totalPointDiffGap) {
    return left.totalPointDiffGap - right.totalPointDiffGap;
  }

  return 0;
}
