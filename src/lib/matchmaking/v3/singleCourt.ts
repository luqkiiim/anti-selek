import { SessionMode, SessionType } from "../../../types/enums";
import { buildCandidatePool } from "./candidatePool";
import { evaluateBalancedPartitions } from "./balance";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import {
  buildExactRematchHistory,
  buildPartnerRepeatHistory,
  getExactPartitionKey,
  getExactRematchPenalty,
  getPartnerRepeatPenalty,
} from "./rematch";
import {
  buildWaitSummary,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CandidatePool,
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

function compareQuartetFairnessVectors<
  T extends Pick<ActiveMatchmakerV3Player, "effectiveMatchCount">,
>(quartetPlayers: [T, T, T, T], otherQuartetPlayers: [T, T, T, T]) {
  const leftVector = quartetPlayers
    .map((player) => player.effectiveMatchCount)
    .sort((left, right) => left - right);
  const rightVector = otherQuartetPlayers
    .map((player) => player.effectiveMatchCount)
    .sort((left, right) => left - right);

  for (let index = 0; index < Math.max(leftVector.length, rightVector.length); index++) {
    const leftValue = leftVector[index] ?? Number.POSITIVE_INFINITY;
    const rightValue = rightVector[index] ?? Number.POSITIVE_INFINITY;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function buildFeasibilityCandidatePools<T extends MatchmakerV3Player>(
  initialPool: V3CandidatePool<ActiveMatchmakerV3Player<T>>
) {
  const variants = [initialPool];
  if (!initialPool.selectionBand) {
    return variants;
  }

  const selectionBandIndex = initialPool.fairnessBands.findIndex(
    (band) => band.effectiveMatchCount === initialPool.selectionBandEffectiveMatchCount
  );
  if (selectionBandIndex < 0) {
    return variants;
  }

  if (
    initialPool.tieZone &&
    initialPool.tieZone.players.length < initialPool.selectionBand.players.length
  ) {
    variants.push({
      ...initialPool,
      selectablePlayers: [...initialPool.selectionBand.players],
      candidatePlayers: [
        ...initialPool.lockedPlayers,
        ...initialPool.selectionBand.players,
      ],
      tieZone: null,
    });
  }

  const selectablePlayers = [
    ...(variants[variants.length - 1]?.selectablePlayers ?? initialPool.selectablePlayers),
  ];
  const includedBandValues = [...initialPool.includedBandValues];

  for (const band of initialPool.fairnessBands.slice(selectionBandIndex + 1)) {
    selectablePlayers.push(...band.players);
    includedBandValues.push(band.effectiveMatchCount);

    variants.push({
      ...initialPool,
      selectablePlayers: [...selectablePlayers],
      candidatePlayers: [...initialPool.lockedPlayers, ...selectablePlayers],
      includedBandValues: [...includedBandValues],
      widened: includedBandValues.length > 1,
      selectionBand: band,
      selectionBandEffectiveMatchCount: band.effectiveMatchCount,
      tieZone: null,
    });
  }

  return variants;
}

export function findBestSingleCourtSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  {
    sessionMode,
    sessionType,
    completedMatches = [],
    excludedQuartetKey,
    excludedQuartetKeys,
    excludedPartitionKey,
    targetPool,
    minimumTargetPoolPlayers,
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
    excludedQuartetKeys?: ReadonlySet<string>;
    excludedPartitionKey?: string;
    targetPool?: string;
    minimumTargetPoolPlayers?: number;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): V3SingleCourtResult<ActiveMatchmakerV3Player<T>> {
  const initialCandidatePool = buildCandidatePool(players, {
    requiredPlayerCount: 4,
    now,
    matchDurationMs,
    randomFn,
  });

  if (
    initialCandidatePool.insufficientPlayers ||
    initialCandidatePool.candidatePlayers.length < 4
  ) {
    return {
      selection: null,
      debug: {
        eligiblePlayerIds: initialCandidatePool.activePlayers.map(
          (player) => player.userId
        ),
        lowestBand: initialCandidatePool.lowestBand,
        includedBandValues: initialCandidatePool.includedBandValues,
        widened: initialCandidatePool.widened,
        lockedPlayerIds: initialCandidatePool.lockedPlayers.map(
          (player) => player.userId
        ),
        tieZonePlayerIds:
          initialCandidatePool.tieZone?.players.map((player) => player.userId) ??
          [],
        candidatePlayerIds: initialCandidatePool.candidatePlayers.map(
          (player) => player.userId
        ),
        quartetCount: 0,
        validPartitionCount: 0,
        chosenIds: null,
        chosenBalanceGap: null,
        chosenPartnerRepeatPenalty: null,
        chosenExactRematchPenalty: null,
      },
    };
  }

  const candidatePools = buildFeasibilityCandidatePools(initialCandidatePool);
  const rematchHistory = buildExactRematchHistory(completedMatches);
  const partnerHistory = buildPartnerRepeatHistory(completedMatches);
  let searchedCandidatePool = initialCandidatePool;
  let totalQuartetCount = 0;
  let totalValidPartitionCount = 0;

  let bestSelection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> | null =
    null;

  for (const candidatePool of candidatePools) {
    searchedCandidatePool = candidatePool;

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
    let candidatePoolBestSelection:
      | V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>
      | null = null;

    for (const group of quartetGroups) {
      const quartetPlayers = toQuartet(group);
      if (!quartetPlayers) {
        continue;
      }

      totalQuartetCount += 1;

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

      const quartetKey = getQuartetKey(ids);
      if (
        (excludedQuartetKey && quartetKey === excludedQuartetKey) ||
        excludedQuartetKeys?.has(quartetKey)
      ) {
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

        totalValidPartitionCount += 1;

        const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
          ids,
          players: quartetPlayers,
          partition: evaluation.partition,
          waitSummary,
          balanceGap: evaluation.balanceGap,
          partnerRepeatPenalty: getPartnerRepeatPenalty(
            evaluation.partition,
            partnerHistory
          ),
          exactRematchPenalty: getExactRematchPenalty(
            evaluation.partition,
            rematchHistory
          ),
          randomScore,
        };

        if (
          !candidatePoolBestSelection ||
          compareQuartetFairnessVectors(
            selection.players,
            candidatePoolBestSelection.players
          ) < 0 ||
          (compareQuartetFairnessVectors(
            selection.players,
            candidatePoolBestSelection.players
          ) === 0 &&
            compareSingleCourtSelections(
              selection,
              candidatePoolBestSelection,
              sessionType
            ) < 0)
        ) {
          candidatePoolBestSelection = selection;
        }
      }
    }

    if (candidatePoolBestSelection) {
      bestSelection = candidatePoolBestSelection;
      break;
    }
  }

  const debug: V3SingleCourtDebug = {
    eligiblePlayerIds: initialCandidatePool.activePlayers.map(
      (player) => player.userId
    ),
    lowestBand: initialCandidatePool.lowestBand,
    includedBandValues: searchedCandidatePool.includedBandValues,
    widened: searchedCandidatePool.widened,
    lockedPlayerIds: searchedCandidatePool.lockedPlayers.map(
      (player) => player.userId
    ),
    tieZonePlayerIds:
      searchedCandidatePool.tieZone?.players.map((player) => player.userId) ?? [],
    candidatePlayerIds: searchedCandidatePool.candidatePlayers.map(
      (player) => player.userId
    ),
    quartetCount: totalQuartetCount,
    validPartitionCount: totalValidPartitionCount,
    chosenIds: null,
    chosenBalanceGap: null,
    chosenPartnerRepeatPenalty: null,
    chosenExactRematchPenalty: null,
  };

  if (bestSelection) {
    debug.chosenIds = bestSelection.ids;
    debug.chosenBalanceGap = bestSelection.balanceGap;
    debug.chosenPartnerRepeatPenalty = bestSelection.partnerRepeatPenalty;
    debug.chosenExactRematchPenalty = bestSelection.exactRematchPenalty;
  }

  return {
    selection: bestSelection,
    debug,
  };
}
