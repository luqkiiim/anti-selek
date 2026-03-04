export function isValidBadmintonScore(team1Score: number, team2Score: number): boolean {
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) return false;
  if (team1Score < 0 || team2Score < 0) return false;
  if (team1Score === team2Score) return false;

  const maxScore = Math.max(team1Score, team2Score);
  const minScore = Math.min(team1Score, team2Score);

  const isWinBy2 = maxScore >= 21 && maxScore - minScore >= 2;
  const isCapAt30 = maxScore === 30 && minScore === 29;

  return isWinBy2 || isCapAt30;
}
