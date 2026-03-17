import { buildActivePlayers, buildFairnessBands } from "./fairness";
import { createEmptyLadderRecord } from "./records";

import type { MatchmakerLadderPlayer } from "./types";

export function getNeutralMatchmakingBaseline<T extends MatchmakerLadderPlayer>(
  players: T[],
  {
    now = Date.now(),
    randomFn = () => 0,
  }: {
    now?: number;
    randomFn?: () => number;
  } = {}
) {
  const activePlayers = buildActivePlayers(players, { now, randomFn });
  const lowestBand = buildFairnessBands(activePlayers)[0];

  return lowestBand?.effectiveMatchCount ?? 0;
}

export function applyNeutralLadderEntry<T extends MatchmakerLadderPlayer>(
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
  const neutralRecord = createEmptyLadderRecord();

  return {
    ...player,
    ...neutralRecord,
    matchmakingBaseline: Math.max(
      player.matchmakingBaseline,
      getNeutralMatchmakingBaseline(activePlayers, { now, randomFn })
    ),
    availableSince: new Date(now),
  };
}
