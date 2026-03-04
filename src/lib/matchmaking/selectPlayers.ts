export interface PlayerCandidate {
  userId: string;
  matchesPlayed: number;
  availableSince: Date;
}

export function selectMatchPlayers(players: PlayerCandidate[]) {
  if (players.length < 4) return null;

  // 1. Calculate Match Floor
  const allCounts = players.map((p) => p.matchesPlayed);

  const sessionAvg =
    allCounts.length > 0
      ? allCounts.reduce((a, b) => a + b, 0) / allCounts.length
      : 0;
  const matchFloor = Math.floor(sessionAvg);

  // 2. Prepare and Sort Candidates
  const sortedCandidates = players
    .map((p) => {
      const effectiveCount = Math.max(p.matchesPlayed, matchFloor);
      return {
        ...p,
        _effCount: effectiveCount,
        _availableSinceTs: p.availableSince.getTime(),
        _random: Math.random(),
      };
    })
    .sort((a, b) => {
      if (a._effCount !== b._effCount) return a._effCount - b._effCount;
      if (a._availableSinceTs !== b._availableSinceTs)
        return a._availableSinceTs - b._availableSinceTs;
      return a._random - b._random;
    });

  // 3. Bubble Prevention Rule
  const minActual = Math.min(...sortedCandidates.map((p) => p.matchesPlayed));
  const lowGroup = sortedCandidates.filter((p) => p.matchesPlayed === minActual);
  const others = sortedCandidates.filter((p) => p.matchesPlayed > minActual);

  if (lowGroup.length >= 3 && others.length >= 2) {
    // Select max 2 from the lowest cohort to avoid "late-joiner bubble"
    const selectedLow = lowGroup.slice(0, 2);
    const selectedOthers = others.slice(0, 2);
    return [...selectedLow, ...selectedOthers];
  }

  // Fallback to simple top-4 selection
  return sortedCandidates.slice(0, 4);
}
