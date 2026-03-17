import {
  buildActivePlayers,
  buildFairnessBands,
  buildWaitingTimeTieZone,
  DEFAULT_MATCH_DURATION_MS,
} from "./fairness";

import type {
  ActiveMatchmakerLadderPlayer,
  LadderCandidatePool,
  LadderFairnessBand,
  LadderWaitingTimeTieZone,
  MatchmakerLadderPlayer,
} from "./types";

export function buildCandidatePool<T extends MatchmakerLadderPlayer>(
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
): LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>> {
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
  const lockedPlayers: ActiveMatchmakerLadderPlayer<T>[] = [];
  let selectionBand:
    | LadderFairnessBand<ActiveMatchmakerLadderPlayer<T>>
    | null = null;
  let requiredSelectableCount = 0;
  let selectablePlayers: ActiveMatchmakerLadderPlayer<T>[] = [];
  let tieZone: LadderWaitingTimeTieZone<ActiveMatchmakerLadderPlayer<T>> | null =
    null;

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
