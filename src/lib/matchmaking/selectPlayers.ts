import {
  FairnessCandidate,
  RankedFairnessCandidate,
  rankPlayersByFairness,
} from "./fairness";

export type PlayerCandidate = FairnessCandidate;

/**
 * Selection logic based on MATCH RATE (fairness per hour active).
 * 
 * activeMs = now - joinedAt - inactiveSeconds
 * rate = matchesPlayed / activeMs
 * 
 * Priority:
 * 1. Lower rate (most underplayed relative to their time in session)
 * 2. Older availableSince (waiting longest)
 * 3. Random tie-breaker
 */
export function selectMatchPlayers(
  players: PlayerCandidate[],
  options: {
    rankedCandidates?: RankedFairnessCandidate<PlayerCandidate>[];
  } = {}
) {
  const sortedCandidates =
    options.rankedCandidates ?? rankPlayersByFairness(players);

  if (sortedCandidates.length < 4) return null;

  // 3. Bubble Prevention Rule
  // When a lowest cohort exists (e.g., recently unpaused players), avoid repeatedly
  // grouping too many of them in one match. Select 1-2 from that cohort depending
  // on its share of the pool, while still guaranteeing we can fill a 4-player match.
  const actualCounts = sortedCandidates.map((p) => p.matchesPlayed);
  const minActual = Math.min(...actualCounts);
  const maxActual = Math.max(...actualCounts);

  if (maxActual > minActual) {
    const lowGroup = sortedCandidates.filter((p) => p.matchesPlayed === minActual);
    const others = sortedCandidates.filter((p) => p.matchesPlayed > minActual);

    if (lowGroup.length >= 3 && others.length >= 2) {
      const cohortShare = lowGroup.length / sortedCandidates.length;
      const desiredLow = Math.round(cohortShare * 4);
      const minLowNeeded = Math.max(0, 4 - others.length);
      const lowQuota = Math.min(2, Math.max(1, minLowNeeded, desiredLow));
      const otherQuota = 4 - lowQuota;

      if (others.length >= otherQuota) {
        const selectedLow = lowGroup.slice(0, lowQuota);
        const selectedOthers = others.slice(0, otherQuota);
        return [...selectedLow, ...selectedOthers];
      }
    }
  }

  // Fallback to simple top-4 selection
  return sortedCandidates.slice(0, 4);
}
