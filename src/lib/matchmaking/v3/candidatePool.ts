import {
  buildActivePlayers,
  buildFairnessBands,
  buildRestTurnTieZone,
} from "./fairness";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CandidatePool,
  V3FairnessBand,
  V3RestTurnTieZone,
} from "./types";

function getLoadPreferredPlayers<T extends ActiveMatchmakerV3Player>(
  players: T[],
  requiredSlots: number
) {
  const readyPlayers = players.filter((player) => player.moreRestDeficit === 0);
  return readyPlayers.length >= requiredSlots ? readyPlayers : players;
}

export function buildCandidatePool<T extends MatchmakerV3Player>(
  players: T[],
  {
    requiredPlayerCount,
    randomFn = Math.random,
    respectPlayerRest = true,
    restTurnTieZoneTolerance = 0,
  }: {
    requiredPlayerCount: number;
    randomFn?: () => number;
    respectPlayerRest?: boolean;
    restTurnTieZoneTolerance?: number;
  }
): V3CandidatePool<ActiveMatchmakerV3Player<T>> {
  const activePlayers = buildActivePlayers(players, {
    randomFn,
    respectPlayerRest,
  });
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
  let tieZone: V3RestTurnTieZone<ActiveMatchmakerV3Player<T>> | null = null;

  for (const band of fairnessBands) {
    includedBandValues.push(band.effectiveMatchCount);

    if (lockedPlayers.length + band.players.length < requiredPlayerCount) {
      lockedPlayers.push(...band.players);
      continue;
    }

    selectionBand = band;
    requiredSelectableCount = requiredPlayerCount - lockedPlayers.length;
    const loadPreferredPlayers = respectPlayerRest
      ? getLoadPreferredPlayers(band.players, requiredSelectableCount)
      : band.players;
    tieZone = respectPlayerRest
      ? buildRestTurnTieZone(
          loadPreferredPlayers,
          requiredSelectableCount,
          restTurnTieZoneTolerance
        )
      : null;
    selectablePlayers = tieZone?.players ?? loadPreferredPlayers;
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
