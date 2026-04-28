export const MATCH_SCORE_ERROR_MESSAGE =
  "Score must be non-negative whole numbers with one team ahead";

export function isValidMatchScore(team1Score: number, team2Score: number): boolean {
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) return false;
  if (team1Score < 0 || team2Score < 0) return false;
  if (team1Score === team2Score) return false;
  return true;
}
