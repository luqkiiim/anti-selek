import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3FairnessBand,
  V3RestTurnTieZone,
} from "./types";

export function getEffectiveMatchCount(
  player: Pick<MatchmakerV3Player, "matchesPlayed" | "matchmakingBaseline">
) {
  return Math.max(player.matchesPlayed, player.matchmakingBaseline);
}

export function buildActivePlayers<T extends MatchmakerV3Player>(
  players: T[],
  {
    randomFn = Math.random,
    respectPlayerRest = true,
  }: {
    randomFn?: () => number;
    respectPlayerRest?: boolean;
  } = {}
): ActiveMatchmakerV3Player<T>[] {
  return players
    .filter((player) => !player.isPaused && !player.isBusy)
    .map((player) => ({
      ...player,
      effectiveMatchCount: getEffectiveMatchCount(player),
      restTurns: Math.max(0, player.restTurns ?? 0),
      randomScore: randomFn(),
      rank: 0,
    }))
    .sort((left, right) => {
      if (left.effectiveMatchCount !== right.effectiveMatchCount) {
        return left.effectiveMatchCount - right.effectiveMatchCount;
      }

      if (respectPlayerRest && left.restTurns !== right.restTurns) {
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
  T extends ActiveMatchmakerV3Player,
>(players: T[]): V3FairnessBand<T>[] {
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
  T extends ActiveMatchmakerV3Player,
>(
  players: T[],
  requiredSlots: number
): V3RestTurnTieZone<T> | null {
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
