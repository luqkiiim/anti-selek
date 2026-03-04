export interface PlayerCandidate {
  userId: string;
  matchesPlayed: number;
  availableSince: Date;
  joinedAt: Date;
  inactiveSeconds: number;
}

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
export function selectMatchPlayers(players: PlayerCandidate[]) {
  if (players.length < 4) return null;

  const now = Date.now();

  // 1. Prepare Candidates with Rate
  const candidatesWithRate = players.map((p) => {
    const activeMs = Math.max(
      1000, // floor to 1s to avoid division by zero
      now - p.joinedAt.getTime() - p.inactiveSeconds * 1000
    );
    const rate = p.matchesPlayed / activeMs;

    return {
      ...p,
      _rate: rate,
      _availableSinceTs: p.availableSince.getTime(),
      _random: Math.random(),
    };
  });

  // 2. Sort by Rate, then availableSince, then Random
  const sortedCandidates = [...candidatesWithRate].sort((a, b) => {
    if (a._rate !== b._rate) return a._rate - b._rate;
    if (a._availableSinceTs !== b._availableSinceTs)
      return a._availableSinceTs - b._availableSinceTs;
    return a._random - b._random;
  });

  // 3. Bubble Prevention Rule
  // Only trigger if there is a distinct gap between the lowest cohort and the rest
  const actualCounts = sortedCandidates.map(p => p.matchesPlayed);
  const minActual = Math.min(...actualCounts);
  const maxActual = Math.max(...actualCounts);

  if (maxActual > minActual) {
    const lowGroup = sortedCandidates.filter((p) => p.matchesPlayed === minActual);
    const others = sortedCandidates.filter((p) => p.matchesPlayed > minActual);

    if (lowGroup.length >= 3 && others.length >= 2) {
      // Select max 2 from the lowest cohort to avoid "late-joiner bubble"
      const selectedLow = lowGroup.slice(0, 2);
      const selectedOthers = others.slice(0, 2);
      return [...selectedLow, ...selectedOthers];
    }
  }

  // Fallback to simple top-4 selection
  return sortedCandidates.slice(0, 4);
}
