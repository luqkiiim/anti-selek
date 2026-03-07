export interface FairnessCandidate {
  userId: string;
  matchesPlayed: number;
  availableSince: Date;
  joinedAt: Date;
  inactiveSeconds: number;
}

export type RankedFairnessCandidate<T extends FairnessCandidate = FairnessCandidate> = T & {
  _rate: number;
  _availableSinceTs: number;
  _random: number;
};

export function rankPlayersByFairness<T extends FairnessCandidate>(
  players: T[],
  {
    now = Date.now(),
    randomFn = Math.random,
  }: {
    now?: number;
    randomFn?: () => number;
  } = {}
): RankedFairnessCandidate<T>[] {
  return players
    .map((player) => {
      const activeMs = Math.max(
        1000,
        now - player.joinedAt.getTime() - player.inactiveSeconds * 1000
      );

      return {
        ...player,
        _rate: player.matchesPlayed / activeMs,
        _availableSinceTs: player.availableSince.getTime(),
        _random: randomFn(),
      };
    })
    .sort((a, b) => {
      if (a._rate !== b._rate) return a._rate - b._rate;
      if (a._availableSinceTs !== b._availableSinceTs) {
        return a._availableSinceTs - b._availableSinceTs;
      }
      return a._random - b._random;
    });
}
