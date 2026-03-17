import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3FairnessBand,
  V3WaitingTimeTieZone,
} from "./types";

export const DEFAULT_MATCH_DURATION_MS = 15 * 60 * 1000;

export function getEffectiveMatchCount(
  player: Pick<MatchmakerV3Player, "matchesPlayed" | "matchmakingBaseline">
) {
  return Math.max(player.matchesPlayed, player.matchmakingBaseline);
}

export function buildActivePlayers<T extends MatchmakerV3Player>(
  players: T[],
  {
    now = Date.now(),
    randomFn = Math.random,
  }: {
    now?: number;
    randomFn?: () => number;
  } = {}
): ActiveMatchmakerV3Player<T>[] {
  return players
    .filter((player) => !player.isPaused && !player.isBusy)
    .map((player) => ({
      ...player,
      effectiveMatchCount: getEffectiveMatchCount(player),
      waitMs: Math.max(0, now - player.availableSince.getTime()),
      randomScore: randomFn(),
      rank: 0,
    }))
    .sort((left, right) => {
      if (left.effectiveMatchCount !== right.effectiveMatchCount) {
        return left.effectiveMatchCount - right.effectiveMatchCount;
      }

      if (left.waitMs !== right.waitMs) {
        return right.waitMs - left.waitMs;
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

export function buildWaitingTimeTieZone<
  T extends ActiveMatchmakerV3Player,
>(
  players: T[],
  requiredSlots: number,
  {
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
  }: {
    matchDurationMs?: number;
  } = {}
): V3WaitingTimeTieZone<T> | null {
  if (requiredSlots <= 0 || players.length <= requiredSlots) {
    return null;
  }

  const cutoffPlayer = players[requiredSlots - 1];
  if (!cutoffPlayer) {
    return null;
  }

  const minimumIncludedWaitMs = Math.max(
    0,
    cutoffPlayer.waitMs - matchDurationMs
  );
  const tieZonePlayers = players.filter(
    (player) => player.waitMs >= minimumIncludedWaitMs
  );

  return {
    requiredSlots,
    cutoffWaitMs: cutoffPlayer.waitMs,
    minimumIncludedWaitMs,
    players: tieZonePlayers,
  };
}
