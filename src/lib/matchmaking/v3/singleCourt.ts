import { SessionMode, SessionType } from "../../../types/enums";
import { buildCandidatePool } from "./candidatePool";
import { evaluateBalancedPartitions } from "./balance";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import {
  buildExactRematchHistory,
  getExactPartitionKey,
  getExactRematchPenalty,
} from "./rematch";
import {
  buildWaitSummary,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3SingleCourtDebug,
  V3SingleCourtResult,
  V3SingleCourtSelection,
} from "./types";

function buildCombinations<T>(items: T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }

  if (items.length < size) {
    return [];
  }

  if (items.length === size) {
    return [[...items]];
  }

  const combinations: T[][] = [];

  for (let index = 0; index <= items.length - size; index++) {
    const head = items[index];
    const tailCombinations = buildCombinations(items.slice(index + 1), size - 1);

    for (const tail of tailCombinations) {
      combinations.push([head, ...tail]);
    }
  }

  return combinations;
}

function toQuartet<T>(players: T[]): [T, T, T, T] | null {
  if (players.length !== 4) {
    return null;
  }

  return [players[0], players[1], players[2], players[3]];
}

function getQuartetKey(ids: [string, string, string, string]) {
  return [...ids].sort().join("|");
}

export function findBestSingleCourtSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  {
    sessionMode,
    sessionType,
    completedMatches = [],
    excludedQuartetKey,
    excludedPartitionKey,
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    sessionMode: SessionMode;
    sessionType: SessionType;
    completedMatches?: Array<{
      team1: [string, string];
      team2: [string, string];
      completedAt?: Date | null;
    }>;
    excludedQuartetKey?: string;
    excludedPartitionKey?: string;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): V3SingleCourtResult<ActiveMatchmakerV3Player<T>> {
  const candidatePool = buildCandidatePool(players, {
    requiredPlayerCount: 4,
    now,
    matchDurationMs,
    randomFn,
  });
  const debug: V3SingleCourtDebug = {
    eligiblePlayerIds: candidatePool.activePlayers.map((player) => player.userId),
    lowestBand: candidatePool.lowestBand,
    includedBandValues: candidatePool.includedBandValues,
    widened: candidatePool.widened,
    lockedPlayerIds: candidatePool.lockedPlayers.map((player) => player.userId),
    tieZonePlayerIds:
      candidatePool.tieZone?.players.map((player) => player.userId) ?? [],
    candidatePlayerIds: candidatePool.candidatePlayers.map((player) => player.userId),
    quartetCount: 0,
    validPartitionCount: 0,
    chosenIds: null,
    chosenBalanceGap: null,
    chosenExactRematchPenalty: null,
  };

  if (candidatePool.insufficientPlayers || candidatePool.candidatePlayers.length < 4) {
    return {
      selection: null,
      debug,
    };
  }

  const remainingSlots = 4 - candidatePool.lockedPlayers.length;
  const quartetGroups =
    remainingSlots === 0
      ? [candidatePool.lockedPlayers]
      : buildCombinations(candidatePool.selectablePlayers, remainingSlots).map(
          (playersInSelectionBand) => [
            ...candidatePool.lockedPlayers,
            ...playersInSelectionBand,
          ]
        );
  const playersById = new Map(
    candidatePool.candidatePlayers.map((player) => [player.userId, player])
  );
  const rematchHistory = buildExactRematchHistory(completedMatches);

  let bestSelection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> | null =
    null;

  for (const group of quartetGroups) {
    const quartetPlayers = toQuartet(group);
    if (!quartetPlayers) {
      continue;
    }

    debug.quartetCount += 1;

    const ids = quartetPlayers.map((player) => player.userId) as [
      string,
      string,
      string,
      string,
    ];

    if (excludedQuartetKey && getQuartetKey(ids) === excludedQuartetKey) {
      continue;
    }

    const waitSummary = buildWaitSummary(quartetPlayers);
    const randomScore = getQuartetRandomScore(quartetPlayers);

    for (const evaluation of evaluateBalancedPartitions(
      ids,
      playersById,
      sessionMode
    )) {
      if (
        excludedPartitionKey &&
        getExactPartitionKey(evaluation.partition) === excludedPartitionKey
      ) {
        continue;
      }

      debug.validPartitionCount += 1;

      const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
        ids,
        players: quartetPlayers,
        partition: evaluation.partition,
        waitSummary,
        balanceGap: evaluation.balanceGap,
        exactRematchPenalty: getExactRematchPenalty(
          evaluation.partition,
          rematchHistory
        ),
        randomScore,
      };

      if (
        !bestSelection ||
        compareSingleCourtSelections(selection, bestSelection, sessionType) < 0
      ) {
        bestSelection = selection;
      }
    }
  }

  if (bestSelection) {
    debug.chosenIds = bestSelection.ids;
    debug.chosenBalanceGap = bestSelection.balanceGap;
    debug.chosenExactRematchPenalty = bestSelection.exactRematchPenalty;
  }

  return {
    selection: bestSelection,
    debug,
  };
}
