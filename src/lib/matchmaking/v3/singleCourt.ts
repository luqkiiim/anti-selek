import { SessionMode, SessionType } from "../../../types/enums";
import { sortArrivalPriorityPlayers } from "../arrivalPriority";
import { buildCandidatePool } from "./candidatePool";
import {
  buildConsecutivePlayHistory,
  getConsecutivePlayMetrics,
} from "./consecutive";
import { evaluateBalancedPartitions } from "./balance";
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
  buildRestSummary,
  compareSingleCourtSelections,
  FULL_REPEAT_REST_TOLERANCE,
  getBalanceVarietyTolerance,
  getPartitionPairingRandomScore,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3CandidatePool,
  V3SelectionConstraints,
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

function buildArrivalPriorityCandidatePools<T extends MatchmakerV3Player>(
  initialPool: V3CandidatePool<ActiveMatchmakerV3Player<T>>
) {
  return sortArrivalPriorityPlayers(initialPool.activePlayers).map(
    (priorityPlayer) => {
      const selectablePlayers = initialPool.activePlayers.filter(
        (player) => player.userId !== priorityPlayer.userId
      );

      return {
        ...initialPool,
        lockedPlayers: [priorityPlayer],
        requiredSelectableCount: 3,
        selectablePlayers,
        candidatePlayers: [priorityPlayer, ...selectablePlayers],
        tieZone: null,
        widened: true,
        includedBandValues: [
          ...new Set([
            ...initialPool.includedBandValues,
            priorityPlayer.effectiveMatchCount,
          ]),
        ].sort((left, right) => left - right),
      };
    }
  );
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

function getRestTurnTieZoneTolerance(sessionType: SessionType) {
  if (getBalanceVarietyTolerance(sessionType) !== null) {
    return Number.POSITIVE_INFINITY;
  }

  return sessionType === SessionType.SOCIAL_MIX ? FULL_REPEAT_REST_TOLERANCE : 0;
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
  respectPlayerRest,
  selectionConstraints,
  pairingRandomSalt,
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
  respectPlayerRest: boolean;
  selectionConstraints?: V3SelectionConstraints<ActiveMatchmakerV3Player<T>>;
  pairingRandomSalt: number;
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
  const selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[] = [];

  for (const group of quartetGroups) {
    const quartetPlayers = toQuartet(group);
    if (!quartetPlayers) {
      continue;
    }

    if (
      selectionConstraints?.isQuartetAllowed &&
      !selectionConstraints.isQuartetAllowed(quartetPlayers)
    ) {
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

    const restSummary = buildRestSummary(quartetPlayers);
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
      const partition = selectionConstraints?.normalizePartition
        ? selectionConstraints.normalizePartition({
            partition: evaluation.partition,
            players: quartetPlayers,
            playersById,
          })
        : evaluation.partition;

      if (!partition) {
        continue;
      }

      if (
        excludedPartitionKey &&
        getExactPartitionKey(partition) === excludedPartitionKey
      ) {
        continue;
      }

      validPartitionCount += 1;

      const selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>> = {
        ids,
        players: quartetPlayers,
        partition,
        restSummary,
        balanceGap: evaluation.balanceGap,
        pointDiffGap: evaluation.pointDiffGap,
        sharedCourtRepeatPenalty: getSharedCourtRepeatPenalty(
          partition,
          socialMixHistory
        ),
        partnerCoveragePenalty: getPartnerCoveragePenalty(
          partition,
          socialMixHistory
        ),
        opponentCoveragePenalty: getOpponentCoveragePenalty(
          partition,
          socialMixHistory
        ),
        partnerRepeatPenalty: getPartnerRepeatPenalty(
          partition,
          partnerHistory
        ),
        opponentRepeatPenalty: getOpponentRepeatPenalty(
          partition,
          opponentHistory
        ),
        exactRematchPenalty: getExactRematchPenalty(
          partition,
          rematchHistory
        ),
        ...consecutivePlayMetrics,
        randomScore,
        pairingRandomScore: getPartitionPairingRandomScore(
          partition,
          pairingRandomSalt
        ),
      };

      selections.push(selection);
    }
  }

  return {
    bestSelection: chooseBestSingleCourtSelection(
      selections,
      sessionType,
      respectPlayerRest
    ),
    quartetCount,
    validPartitionCount,
  };
}

function chooseBestSingleCourtSelection<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  sessionType: SessionType,
  respectPlayerRest: boolean
) {
  if (selections.length === 0) {
    return null;
  }

  const bestFairnessSelection = [...selections].sort((left, right) =>
    compareQuartetFairnessVectors(left.players, right.players)
  )[0];

  if (!bestFairnessSelection) {
    return null;
  }

  const fairnessSafeSelections = selections.filter(
    (selection) =>
      compareQuartetFairnessVectors(
        selection.players,
        bestFairnessSelection.players
      ) === 0
  );

  const balanceSafeSelections =
    getBalanceVarietyTolerance(sessionType) !== null
      ? filterBalanceSafeSelections(fairnessSafeSelections, sessionType)
      : fairnessSafeSelections;

  return [...balanceSafeSelections].sort((left, right) =>
    compareSingleCourtSelections(left, right, sessionType, {
      respectPlayerRest,
    })
  )[0] ?? null;
}

function filterBalanceSafeSelections<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  sessionType: SessionType
) {
  const tolerance = getBalanceVarietyTolerance(sessionType);

  if (tolerance === null) {
    return selections;
  }

  const bestBalanceGap = Math.min(
    ...selections.map((selection) => selection.balanceGap)
  );

  return selections.filter(
    (selection) =>
      selection.balanceGap <= bestBalanceGap + tolerance
  );
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
    respectPlayerRest = true,
    randomFn = Math.random,
    candidatePool,
    candidatePoolVariants,
    selectionConstraints,
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
    respectPlayerRest?: boolean;
    randomFn?: () => number;
    candidatePool?: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
    candidatePoolVariants?: (
      candidatePool: V3CandidatePool<ActiveMatchmakerV3Player<T>>
    ) => Array<V3CandidatePool<ActiveMatchmakerV3Player<T>>>;
    selectionConstraints?: V3SelectionConstraints<ActiveMatchmakerV3Player<T>>;
  }
): V3SingleCourtResult<ActiveMatchmakerV3Player<T>> {
  const initialCandidatePool =
    candidatePool ??
    buildCandidatePool(players, {
      requiredPlayerCount: 4,
      randomFn,
      respectPlayerRest,
      restTurnTieZoneTolerance: getRestTurnTieZoneTolerance(sessionType),
    });
  const pairingRandomSalt = randomFn();

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

  const candidatePoolEntries = [
    ...(candidatePoolVariants
      ? []
      : buildArrivalPriorityCandidatePools(initialCandidatePool).map(
          (candidatePool) => ({
            candidatePool,
            requiresArrivalPriority: true,
          })
        )),
    ...(candidatePoolVariants?.(initialCandidatePool) ??
      buildFeasibilityCandidatePools(initialCandidatePool)).map(
        (candidatePool) => ({
          candidatePool,
          requiresArrivalPriority: false,
        })
      ),
  ];
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

  for (const { candidatePool, requiresArrivalPriority } of candidatePoolEntries) {
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
      respectPlayerRest,
      selectionConstraints,
      pairingRandomSalt,
    });
    totalQuartetCount += candidatePoolSearch.quartetCount;
    totalValidPartitionCount += candidatePoolSearch.validPartitionCount;

    if (
      !requiresArrivalPriority &&
      !candidatePoolSearch.bestSelection &&
      sessionMode === SessionMode.MIXICANO
    ) {
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
          respectPlayerRest,
          selectionConstraints,
          pairingRandomSalt,
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
