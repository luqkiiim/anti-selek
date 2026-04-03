import { SessionMode } from "../../../types/enums";
import { getExactPartitionKey } from "../v3/rematch";
import { evaluateBalancedPartitions } from "./balance";
import { buildCandidatePool } from "./candidatePool";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import { buildLadderGroupingSummary } from "./ladderGrouping";
import {
  buildWaitSummary,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerLadderPlayer,
  LadderSingleCourtDebug,
  LadderSingleCourtResult,
  LadderSingleCourtSelection,
  MatchmakerLadderPlayer,
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

export function findBestSingleCourtSelectionLadder<
  T extends MatchmakerLadderPlayer,
>(
  players: T[],
  {
    sessionMode,
    excludedQuartetKey,
    excludedPartitionKey,
    targetPool,
    minimumTargetPoolPlayers,
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    sessionMode: SessionMode;
    excludedQuartetKey?: string;
    excludedPartitionKey?: string;
    targetPool?: string;
    minimumTargetPoolPlayers?: number;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): LadderSingleCourtResult<ActiveMatchmakerLadderPlayer<T>> {
  const candidatePool = buildCandidatePool(players, {
    requiredPlayerCount: 4,
    now,
    matchDurationMs,
    randomFn,
    useWaitingTimeTieZone: false,
  });
  const debug: LadderSingleCourtDebug = {
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
    chosenGrouping: null,
    chosenBalanceGap: null,
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

  let bestSelection:
    | LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>
    | null = null;

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

    if (targetPool) {
      const targetPoolCount = quartetPlayers.filter(
        (player) => player.pool === targetPool
      ).length;
      if (targetPoolCount < (minimumTargetPoolPlayers ?? 1)) {
        continue;
      }
    }

    if (excludedQuartetKey && getQuartetKey(ids) === excludedQuartetKey) {
      continue;
    }

    const waitSummary = buildWaitSummary(quartetPlayers);
    const groupingSummary = buildLadderGroupingSummary(quartetPlayers);
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

      const selection: LadderSingleCourtSelection<
        ActiveMatchmakerLadderPlayer<T>
      > = {
        ids,
        players: quartetPlayers,
        partition: evaluation.partition,
        waitSummary,
        groupingSummary,
        balanceGap: evaluation.balanceGap,
        pointDiffGap: evaluation.pointDiffGap,
        strengthGap: evaluation.strengthGap,
        randomScore,
      };

      if (
        !bestSelection ||
        compareSingleCourtSelections(selection, bestSelection) < 0
      ) {
        bestSelection = selection;
      }
    }
  }

  if (bestSelection) {
    debug.chosenIds = bestSelection.ids;
    debug.chosenGrouping = bestSelection.groupingSummary;
    debug.chosenBalanceGap = bestSelection.balanceGap;
  }

  return {
    selection: bestSelection,
    debug,
  };
}
