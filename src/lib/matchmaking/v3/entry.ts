import { buildActivePlayers, buildFairnessBands } from "./fairness";

import type { MatchmakerV3Player } from "./types";

export function getNeutralMatchmakingBaseline<T extends MatchmakerV3Player>(
  players: T[],
  {
    randomFn = () => 0,
  }: {
    randomFn?: () => number;
  } = {}
) {
  const activePlayers = buildActivePlayers(players, { randomFn });
  const lowestBand = buildFairnessBands(activePlayers)[0];

  return lowestBand?.effectiveMatchCount ?? 0;
}

export function applyNeutralEntryBaseline<T extends MatchmakerV3Player>(
  player: T,
  activePlayers: T[],
  {
    now = Date.now(),
    randomFn = () => 0,
  }: {
    now?: number;
    randomFn?: () => number;
  } = {}
): T {
  return {
    ...player,
    matchmakingBaseline: Math.max(
      player.matchmakingBaseline,
      getNeutralMatchmakingBaseline(activePlayers, { randomFn })
    ),
    availableSince: new Date(now),
    restTurns: 0,
  };
}
