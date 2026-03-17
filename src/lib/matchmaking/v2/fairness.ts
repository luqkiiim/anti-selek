import { getEffectiveMatchesPlayed } from "../matchmakingCredit";

import type {
  FairnessSummary,
  RankedRotationLoadCandidate,
  RotationLoadCandidate,
} from "./types";

export function rankPlayersByRotationLoad<T extends RotationLoadCandidate>(
  players: T[],
  {
    now = Date.now(),
    randomFn = Math.random,
  }: {
    now?: number;
    randomFn?: () => number;
  } = {}
): RankedRotationLoadCandidate<T>[] {
  return players
    .map((player) => ({
      ...player,
      _random: randomFn(),
      rank: 0,
      rotationLoad: getEffectiveMatchesPlayed(player),
      waitMs: Math.max(0, now - player.availableSince.getTime()),
    }))
    .sort((left, right) => {
      if (left.rotationLoad !== right.rotationLoad) {
        return left.rotationLoad - right.rotationLoad;
      }

      if (left.availableSince.getTime() !== right.availableSince.getTime()) {
        return left.availableSince.getTime() - right.availableSince.getTime();
      }

      return left._random - right._random;
    })
    .map((player, index) => ({
      ...player,
      rank: index,
    }));
}

export function buildFairnessPool<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  neededPlayers: number,
  extraCandidates: number
) {
  return rankedCandidates.slice(
    0,
    Math.min(rankedCandidates.length, neededPlayers + extraCandidates)
  );
}

export function summarizeFairness<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  ids: [string, string, string, string]
): FairnessSummary {
  const globalMinLoad = rankedCandidates[0]?.rotationLoad ?? 0;
  const byUserId = new Map(rankedCandidates.map((candidate) => [candidate.userId, candidate]));

  const loads = ids.map((id) => byUserId.get(id)?.rotationLoad ?? globalMinLoad);
  const ranks = ids.map((id) => byUserId.get(id)?.rank ?? rankedCandidates.length);

  return {
    maxLoadGap: Math.max(...loads.map((load) => load - globalMinLoad)),
    rankSum: ranks.reduce((sum, rank) => sum + rank, 0),
    totalLoadGap: loads.reduce((sum, load) => sum + (load - globalMinLoad), 0),
  };
}

export function compareFairness(
  left: FairnessSummary,
  right: FairnessSummary
) {
  if (left.maxLoadGap !== right.maxLoadGap) {
    return left.maxLoadGap - right.maxLoadGap;
  }

  if (left.totalLoadGap !== right.totalLoadGap) {
    return left.totalLoadGap - right.totalLoadGap;
  }

  if (left.rankSum !== right.rankSum) {
    return left.rankSum - right.rankSum;
  }

  return 0;
}
