import type {
  ActiveMatchmakerLadderPlayer,
  LadderFairnessBand,
  LadderWaitingTimeTieZone,
  MatchmakerLadderPlayer,
} from "./types";

export const DEFAULT_MATCH_DURATION_MS = 15 * 60 * 1000;

export function getEffectiveMatchCount(
  player: Pick<MatchmakerLadderPlayer, "matchesPlayed" | "matchmakingBaseline">
) {
  return Math.max(player.matchesPlayed, player.matchmakingBaseline);
}

export function buildActivePlayers<T extends MatchmakerLadderPlayer>(
  players: T[],
  {
    now = Date.now(),
    randomFn = Math.random,
  }: {
    now?: number;
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

export function buildWaitingTimeTieZone<
  T extends ActiveMatchmakerLadderPlayer,
>(
  players: T[],
  requiredSlots: number,
  {
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
  }: {
    matchDurationMs?: number;
  } = {}
): LadderWaitingTimeTieZone<T> | null {
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
