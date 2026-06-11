import type {
  ActiveMatchmakerLadderPlayer,
  LadderFairnessBand,
  LadderRestTurnTieZone,
  MatchmakerLadderPlayer,
} from "./types";

export function getEffectiveMatchCount(
  player: Pick<MatchmakerLadderPlayer, "matchesPlayed" | "matchmakingBaseline">
) {
  return Math.max(player.matchesPlayed, player.matchmakingBaseline);
}

export function buildActivePlayers<T extends MatchmakerLadderPlayer>(
  players: T[],
  {
    randomFn = Math.random,
  }: {
    randomFn?: () => number;
  } = {}
): ActiveMatchmakerLadderPlayer<T>[] {
  return players
    .filter((player) => !player.isPaused && !player.isBusy)
    .map((player) => ({
      ...player,
      ladderScore:
        typeof player.ladderScore === "number"
          ? player.ladderScore
          : player.wins - player.losses,
      effectiveMatchCount: getEffectiveMatchCount(player),
      restTurns: Math.max(0, player.restTurns ?? 0),
      randomScore: randomFn(),
      rank: 0,
    }))
    .sort((left, right) => {
      if (left.effectiveMatchCount !== right.effectiveMatchCount) {
        return left.effectiveMatchCount - right.effectiveMatchCount;
      }

      if (left.restTurns !== right.restTurns) {
        return right.restTurns - left.restTurns;
      }

      return left.randomScore - right.randomScore;
    })
    .map((player, index) => ({
      ...player,
      rank: index,
    }));
}

export function buildFairnessBands<
  T extends ActiveMatchmakerLadderPlayer,
>(players: T[]): LadderFairnessBand<T>[] {
  const bands = new Map<number, T[]>();

  for (const player of players) {
    const band = bands.get(player.effectiveMatchCount);
    if (band) {
      band.push(player);
      continue;
    }

    bands.set(player.effectiveMatchCount, [player]);
  }

  return Array.from(bands.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([effectiveMatchCount, bandPlayers]) => ({
      effectiveMatchCount,
      players: bandPlayers,
    }));
}

export function buildRestTurnTieZone<
  T extends ActiveMatchmakerLadderPlayer,
>(
  players: T[],
  requiredSlots: number
): LadderRestTurnTieZone<T> | null {
  if (requiredSlots <= 0 || players.length <= requiredSlots) {
    return null;
  }

  const cutoffPlayer = players[requiredSlots - 1];
  if (!cutoffPlayer) {
    return null;
  }

  const tieZonePlayers = players.filter(
    (player) => player.restTurns >= cutoffPlayer.restTurns
  );

  return {
    requiredSlots,
    cutoffRestTurns: cutoffPlayer.restTurns,
    players: tieZonePlayers,
  };
}
