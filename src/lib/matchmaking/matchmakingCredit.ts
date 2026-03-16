export interface MatchmakingCreditPlayer {
  matchesPlayed: number;
  matchmakingMatchesCredit?: number | null;
}

export function getEffectiveMatchesPlayed(player: MatchmakingCreditPlayer) {
  return player.matchesPlayed + Math.max(0, player.matchmakingMatchesCredit ?? 0);
}

export function calculateNoCatchUpMatchmakingCredit({
  player,
  activePlayers,
}: {
  player: MatchmakingCreditPlayer;
  activePlayers: MatchmakingCreditPlayer[];
}) {
  const currentCredit = Math.max(0, player.matchmakingMatchesCredit ?? 0);
  if (activePlayers.length === 0) {
    return currentCredit;
  }

  const averageEffectiveMatches =
    activePlayers.reduce(
      (sum, player) => sum + getEffectiveMatchesPlayed(player),
      0
    ) / activePlayers.length;
  const targetEffectiveMatches = Math.round(averageEffectiveMatches);

  return Math.max(
    currentCredit,
    Math.max(0, targetEffectiveMatches - player.matchesPlayed)
  );
}
