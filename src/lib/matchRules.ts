export const MATCH_SCORE_ERROR_MESSAGE =
  "Score must be non-negative whole numbers with one team ahead";
export const SERIES_SCORE_ERROR_MESSAGE =
  "Enter ordered game scores ending in a 2–0 or 2–1 result";

export interface GameScore { team1Score: number; team2Score: number }
export interface MatchResultSource {
  scoringFormat?: string | null;
  gameScores?: unknown;
  gameScoresJson?: string | null;
  team1Score?: unknown;
  team2Score?: unknown;
  winnerTeam?: number | null;
}
export interface ResolvedMatchResult {
  team1Score: number;
  team2Score: number;
  gameScores: GameScore[];
  team1GameWins: number;
  team2GameWins: number;
  winnerTeam: 1 | 2 | null;
  complete: boolean;
}

export function isValidMatchScore(team1Score: number, team2Score: number): boolean {
  return Number.isSafeInteger(team1Score) && Number.isSafeInteger(team2Score) &&
    team1Score >= 0 && team2Score >= 0 && team1Score !== team2Score;
}

/** Invalid persisted JSON is never treated as a result. */
export function parseGameScores(value: unknown): GameScore[] | null {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length > 3) return null;
  if (!parsed.every(game => game && typeof game === "object" &&
    isValidMatchScore(game.team1Score, game.team2Score))) return null;
  return parsed.map(game => ({ team1Score: game.team1Score, team2Score: game.team2Score }));
}

/** Validates submitted scores, including an unfinished series when saving progress. */
export function resolveMatchScoreInput(source: MatchResultSource, options: { allowIncomplete?: boolean } = {}): ResolvedMatchResult | null {
  if (source.scoringFormat !== "BEST_OF_THREE") {
    const { team1Score, team2Score } = source;
    if (typeof team1Score !== "number" || typeof team2Score !== "number" || !isValidMatchScore(team1Score, team2Score)) return null;
    const winnerTeam = team1Score > team2Score ? 1 : 2;
    return { team1Score, team2Score, gameScores: [], team1GameWins: winnerTeam === 1 ? 1 : 0, team2GameWins: winnerTeam === 2 ? 1 : 0, winnerTeam, complete: true };
  }
  const gameScores = parseGameScores(source.gameScores ?? source.gameScoresJson);
  if (!gameScores) return null;
  let team1GameWins = 0, team2GameWins = 0, team1Score = 0, team2Score = 0;
  for (const game of gameScores) {
    // Once either side has won twice there can be no further games.
    if (team1GameWins === 2 || team2GameWins === 2) return null;
    team1Score += game.team1Score;
    team2Score += game.team2Score;
    if (game.team1Score > game.team2Score) team1GameWins++; else team2GameWins++;
  }
  if (!Number.isSafeInteger(team1Score) || !Number.isSafeInteger(team2Score)) return null;
  const winnerTeam = team1GameWins === 2 ? 1 : team2GameWins === 2 ? 2 : null;
  if (!winnerTeam && !options.allowIncomplete) return null;
  return { team1Score, team2Score, gameScores, team1GameWins, team2GameWins, winnerTeam, complete: winnerTeam !== null };
}

/** Resolve readers from game wins, while honoring an explicit stored legacy winner. */
export function resolveMatchResult(source: MatchResultSource): ResolvedMatchResult | null {
  const result = resolveMatchScoreInput(source);
  if (!result) return null;
  if (source.scoringFormat !== "BEST_OF_THREE" && (source.winnerTeam === 1 || source.winnerTeam === 2)) return { ...result, winnerTeam: source.winnerTeam };
  return result;
}

export function isCloseMatchResult(source: MatchResultSource, singleGameMargin = 2): boolean {
  const result = resolveMatchResult(source);
  if (!result) return false;
  if (source.scoringFormat === "BEST_OF_THREE") {
    if (result.gameScores.length !== 3) return false;
    const game = result.gameScores[2];
    return Math.abs(game.team1Score - game.team2Score) <= 2;
  }
  return Math.abs(result.team1Score - result.team2Score) <= singleGameMargin;
}
