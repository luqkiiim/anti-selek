import {
  buildActivePlayers,
  buildFairnessBands,
  buildWaitingTimeTieZone,
  DEFAULT_MATCH_DURATION_MS,
} from "./fairness";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CandidatePool,
  V3FairnessBand,
  V3WaitingTimeTieZone,
} from "./types";

export function buildCandidatePool<T extends MatchmakerV3Player>(
  players: T[],
  {
    requiredPlayerCount,
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    requiredPlayerCount: number;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): V3CandidatePool<ActiveMatchmakerV3Player<T>> {
  const activePlayers = buildActivePlayers(players, { now, randomFn });
  const fairnessBands = buildFairnessBands(activePlayers);
  const lowestBand = fairnessBands[0]?.effectiveMatchCount ?? null;

  if (requiredPlayerCount <= 0) {
    return {
      requiredPlayerCount,
      activePlayers,
      fairnessBands,
      lowestBand,
      includedBandValues: [],
      widened: false,
      insufficientPlayers: false,
      lockedPlayers: [],
      selectionBand: null,
      selectionBandEffectiveMatchCount: null,
      requiredSelectableCount: 0,
      selectablePlayers: [],
      candidatePlayers: [],
      tieZone: null,
    };
  }

  const includedBandValues: number[] = [];
  const lockedPlayers: ActiveMatchmakerV3Player<T>[] = [];
  let selectionBand: V3FairnessBand<ActiveMatchmakerV3Player<T>> | null = null;
  let requiredSelectableCount = 0;
  let selectablePlayers: ActiveMatchmakerV3Player<T>[] = [];
  let tieZone: V3WaitingTimeTieZone<ActiveMatchmakerV3Player<T>> | null = null;

  for (const band of fairnessBands) {
    includedBandValues.push(band.effectiveMatchCount);

    if (lockedPlayers.length + band.players.length < requiredPlayerCount) {
      lockedPlayers.push(...band.players);
      continue;
    }

    selectionBand = band;
    requiredSelectableCount = requiredPlayerCount - lockedPlayers.length;
    tieZone = buildWaitingTimeTieZone(band.players, requiredSelectableCount, {
      matchDurationMs,
    });
    selectablePlayers = tieZone?.players ?? band.players;
    break;
  }

  if (!selectionBand && fairnessBands.length > 0) {
    selectionBand = fairnessBands[fairnessBands.length - 1];
    requiredSelectableCount = Math.max(
      0,
      requiredPlayerCount - lockedPlayers.length
    );
    selectablePlayers = [];
  }

  const candidatePlayers = [...lockedPlayers, ...selectablePlayers];

  return {
    requiredPlayerCount,
    activePlayers,
    fairnessBands,
    lowestBand,
    includedBandValues,
    widened: includedBandValues.length > 1,
    insufficientPlayers: activePlayers.length < requiredPlayerCount,
    lockedPlayers,
    selectionBand,
    selectionBandEffectiveMatchCount:
      selectionBand?.effectiveMatchCount ?? null,
    requiredSelectableCount,
    selectablePlayers,
    candidatePlayers,
    tieZone,
  };
}
