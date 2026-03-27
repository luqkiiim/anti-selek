export interface SessionStandingEntry {
  name: string;
  pointDiff: number;
  sessionPoints: number;
}

export interface LadderStandingEntry {
  name: string;
  wins: number;
  losses: number;
  pointDiff: number;
}

export interface CompetitiveStandingEntry {
  name: string;
  score: number;
  pointDiff: number;
}

export function compareSessionStandings(
  a: SessionStandingEntry,
  b: SessionStandingEntry
): number {
  return (
    b.sessionPoints - a.sessionPoints ||
    b.pointDiff - a.pointDiff ||
    a.name.localeCompare(b.name)
  );
}

export function compareLadderStandings(
  a: LadderStandingEntry,
  b: LadderStandingEntry
): number {
  return (
    b.wins -
      b.losses -
      (a.wins - a.losses) ||
    b.pointDiff - a.pointDiff ||
    a.name.localeCompare(b.name)
  );
}

export function compareCompetitiveStandings(
  a: CompetitiveStandingEntry,
  b: CompetitiveStandingEntry
): number {
  return b.score - a.score || b.pointDiff - a.pointDiff || a.name.localeCompare(b.name);
}

export function getStandingPointsForTeam(
  winnerTeam: 1 | 2,
  teamNumber: 1 | 2
): number {
  return winnerTeam === teamNumber ? 3 : 0;
}
