import { SessionMode, SessionType } from "../../../types/enums";
import { buildCandidatePool } from "./candidatePool";
import {
  buildConsecutivePlayHistory,
  getConsecutivePlayMetrics,
} from "./consecutive";
import { evaluateBalancedPartitions } from "./balance";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import {
  buildExactRematchHistory,
  buildOpponentRepeatHistory,
  buildPartnerRepeatHistory,
  buildSocialMixHistory,
  getExactPartitionKey,
  getExactRematchPenalty,
  getOpponentCoveragePenalty,
  getOpponentRepeatPenalty,
  getPartnerCoveragePenalty,
  getPartnerRepeatPenalty,
  getSharedCourtRepeatPenalty,
} from "./rematch";
import {
  POINTS_WAIT_TOLERANCE_MS,
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

function relaxLockedPlayersForMixedFeasibility<T extends MatchmakerV3Player>(
  candidatePool: V3CandidatePool<ActiveMatchmakerV3Player<T>>
): V3CandidatePool<ActiveMatchmakerV3Player<T>> | null {
  if (candidatePool.lockedPlayers.length === 0) {
    return null;
  }

  return {
    ...candidatePool,
    lockedPlayers: [],
    requiredSelectableCount: 4,
    selectablePlayers: [...candidatePool.candidatePlayers],
    tieZone: null,
  };
}

function searchCandidatePool<T extends MatchmakerV3Player>({
  candidatePool,
  sessionMode,
  sessionType,
  targetPool,
  minimumTargetPoolPlayers,
  excludedQuartetKey,
  excludedQuartetKeys,
  excludedPartitionKey,
  rematchHistory,
  partnerHistory,
  opponentHistory,
  socialMixHistory,
  consecutivePlayHistory,
}: {
  candidatePool: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
  sessionMode: SessionMode;
  sessionType: SessionType;
  targetPool?: string;
  minimumTargetPoolPlayers?: number;
  excludedQuartetKey?: string;
  excludedQuartetKeys?: ReadonlySet<string>;
  excludedPartitionKey?: string;
  rematchHistory: ReturnType<typeof buildExactRematchHistory>;
  partnerHistory: ReturnType<typeof buildPartnerRepeatHistory>;
  opponentHistory: ReturnType<typeof buildOpponentRepeatHistory>;
  socialMixHistory: ReturnType<typeof buildSocialMixHistory>;
  consecutivePlayHistory: ReturnType<typeof buildConsecutivePlayHistory>;
}) {
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
  let quartetCount = 0;
  let validPartitionCount = 0;
  let bestSelection:
    | V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>
    | null = null;

  for (const group of quartetGroups) {
    const quartetPlayers = toQuartet(group);
    if (!quartetPlayers) {
      continue;
    }

    quartetCount += 1;

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
    const consecutivePlayMetrics = getConsecutivePlayMetrics(
      ids,
      consecutivePlayHistory
    );

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

      validPartitionCount += 1;

      const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
        ids,
        players: quartetPlayers,
        partition: evaluation.partition,
        waitSummary,
        balanceGap: evaluation.balanceGap,
        pointDiffGap: evaluation.pointDiffGap,
        sharedCourtRepeatPenalty: getSharedCourtRepeatPenalty(
          evaluation.partition,
          socialMixHistory
        ),
        partnerCoveragePenalty: getPartnerCoveragePenalty(
          evaluation.partition,
          socialMixHistory
        ),
        opponentCoveragePenalty: getOpponentCoveragePenalty(
          evaluation.partition,
          socialMixHistory
        ),
        partnerRepeatPenalty: getPartnerRepeatPenalty(
          evaluation.partition,
          partnerHistory
        ),
        opponentRepeatPenalty: getOpponentRepeatPenalty(
          evaluation.partition,
          opponentHistory
        ),
        exactRematchPenalty: getExactRematchPenalty(
          evaluation.partition,
          rematchHistory
        ),
        ...consecutivePlayMetrics,
        randomScore,
      };

      if (
        !bestSelection ||
        compareQuartetFairnessVectors(selection.players, bestSelection.players) < 0 ||
        (compareQuartetFairnessVectors(selection.players, bestSelection.players) === 0 &&
          compareSingleCourtSelections(selection, bestSelection, sessionType) < 0)
      ) {
        bestSelection = selection;
      }
    }
  }

  return {
    bestSelection,
    quartetCount,
    validPartitionCount,
  };
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
    waitToleranceMs:
      sessionType === SessionType.POINTS ||
      sessionType === SessionType.SOCIAL_MIX
        ? POINTS_WAIT_TOLERANCE_MS
        : 0,
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
        chosenPointDiffGap: null,
        chosenPartnerRepeatPenalty: null,
        chosenOpponentRepeatPenalty: null,
        chosenExactRematchPenalty: null,
        chosenConsecutivePlayCount: null,
        chosenConsecutivePlayMaxBurden: null,
        chosenConsecutivePlayTotalBurden: null,
      },
    };
  }

  const candidatePools = buildFeasibilityCandidatePools(initialCandidatePool);
  const rematchHistory = buildExactRematchHistory(completedMatches);
  const partnerHistory = buildPartnerRepeatHistory(completedMatches);
  const opponentHistory = buildOpponentRepeatHistory(completedMatches);
  const socialMixHistory = buildSocialMixHistory(completedMatches);
  const consecutivePlayHistory = buildConsecutivePlayHistory(completedMatches);
  let searchedCandidatePool = initialCandidatePool;
  let totalQuartetCount = 0;
  let totalValidPartitionCount = 0;

  let bestSelection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> | null =
    null;

  for (const candidatePool of candidatePools) {
    searchedCandidatePool = candidatePool;

    let candidatePoolSearch = searchCandidatePool({
      candidatePool,
      sessionMode,
      sessionType,
      targetPool,
      minimumTargetPoolPlayers,
      excludedQuartetKey,
      excludedQuartetKeys,
      excludedPartitionKey,
      rematchHistory,
      partnerHistory,
      opponentHistory,
      socialMixHistory,
      consecutivePlayHistory,
    });
    totalQuartetCount += candidatePoolSearch.quartetCount;
    totalValidPartitionCount += candidatePoolSearch.validPartitionCount;

    if (!candidatePoolSearch.bestSelection && sessionMode === SessionMode.MIXICANO) {
      const relaxedCandidatePool = relaxLockedPlayersForMixedFeasibility(candidatePool);

      if (relaxedCandidatePool) {
        candidatePoolSearch = searchCandidatePool({
          candidatePool: relaxedCandidatePool,
          sessionMode,
          sessionType,
          targetPool,
          minimumTargetPoolPlayers,
          excludedQuartetKey,
          excludedQuartetKeys,
          excludedPartitionKey,
          rematchHistory,
          partnerHistory,
          opponentHistory,
          socialMixHistory,
          consecutivePlayHistory,
        });
        totalQuartetCount += candidatePoolSearch.quartetCount;
        totalValidPartitionCount += candidatePoolSearch.validPartitionCount;
      }
    }

    if (candidatePoolSearch.bestSelection) {
      bestSelection = candidatePoolSearch.bestSelection;
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
    chosenPointDiffGap: null,
    chosenPartnerRepeatPenalty: null,
    chosenOpponentRepeatPenalty: null,
    chosenExactRematchPenalty: null,
    chosenConsecutivePlayCount: null,
    chosenConsecutivePlayMaxBurden: null,
    chosenConsecutivePlayTotalBurden: null,
  };

  if (bestSelection) {
    debug.chosenIds = bestSelection.ids;
    debug.chosenBalanceGap = bestSelection.balanceGap;
    debug.chosenPointDiffGap = bestSelection.pointDiffGap;
    debug.chosenPartnerRepeatPenalty = bestSelection.partnerRepeatPenalty;
    debug.chosenOpponentRepeatPenalty = bestSelection.opponentRepeatPenalty;
    debug.chosenExactRematchPenalty = bestSelection.exactRematchPenalty;
    debug.chosenConsecutivePlayCount = bestSelection.consecutivePlayCount;
    debug.chosenConsecutivePlayMaxBurden =
      bestSelection.consecutivePlayMaxBurden;
    debug.chosenConsecutivePlayTotalBurden =
      bestSelection.consecutivePlayTotalBurden;
  }

  return {
    selection: bestSelection,
    debug,
  };
}
