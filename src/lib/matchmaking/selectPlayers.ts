import {
  FairnessCandidate,
  RankedFairnessCandidate,
  rankPlayersByFairness,
} from "./fairness";

export type PlayerCandidate = FairnessCandidate;

/**
 * Selection logic based on rotation fairness.
 * 
 * Priority:
 * 1. Fewer matches played
 * 2. Lower match rate relative to active time
 * 3. Older availableSince (waiting longest)
 * 4. Random tie-breaker
 */
export function selectMatchPlayers(
  players: PlayerCandidate[],
  options: {
    rankedCandidates?: RankedFairnessCandidate<PlayerCandidate>[];
    now?: number;
  } = {}
) {
  const sortedCandidates =
    options.rankedCandidates ??
    rankPlayersByFairness(players, { now: options.now });

  if (sortedCandidates.length < 4) return null;

  return sortedCandidates.slice(0, 4);
}
