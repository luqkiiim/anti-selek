import { SessionMode, SessionType } from "../../../types/enums";
import {
  mergeUniquePlayersById,
  sortArrivalPriorityPlayers,
} from "../arrivalPriority";
import { evaluateBalancedPartitions } from "./balance";
import { buildCandidatePool } from "./candidatePool";
import { getEmptyConsecutivePlayMetrics } from "./consecutive";
import {
  buildExactRematchHistory,
  buildOpponentRepeatHistory,
  buildPartnerRepeatHistory,
  buildSocialMixHistory,
  getExactRematchPenalty,
  getOpponentCoveragePenalty,
  getOpponentRepeatPenalty,
  getPartnerCoveragePenalty,
  getPartnerRepeatPenalty,
  getSharedCourtRepeatPenalty,
} from "./rematch";
import {
  buildRestSummary,
  compareBatchSelections,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerV3Player,
  V3BatchFailureReason,
  MatchmakerV3Player,
  V3BatchDebug,
  V3BatchResult,
  V3BatchSelection,
  V3CandidatePool,
  V3SingleCourtSelection,
} from "./types";

const MAX_SINGLE_COURT_CANDIDATES = 24;
const MAX_TWO_COURT_CANDIDATES = 20;
const MAX_MULTI_COURT_CANDIDATES = 24;
const MULTI_COURT_EXTRA_CANDIDATES = 8;
const MAX_BATCH_SEARCH_BRANCHES = 50000;
const MAX_BATCH_SEARCH_MS = 2000;

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
    const tails = buildCombinations(items.slice(index + 1), size - 1);

    for (const tail of tails) {
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

function getSelectionKey<T extends ActiveMatchmakerV3Player>(
  selection: V3SingleCourtSelection<T>
) {
  return [
    getQuartetKey(selection.ids),
    [...selection.partition.team1].sort().join("|"),
    [...selection.partition.team2].sort().join("|"),
  ]
    .sort()
    .join("||");
}

function getCandidateListKey<T extends ActiveMatchmakerV3Player>(
  candidatePlayers: T[],
  lockedIds: Set<string>
) {
  return [
    candidatePlayers.map((player) => player.userId).join("|"),
    [...lockedIds].sort().join("|"),
  ].join("::");
}

function buildFeasibilityCandidatePools<T extends MatchmakerV3Player>(
  initialPool: V3CandidatePool<ActiveMatchmakerV3Player<T>>
) {
  const variants = [initialPool];
  if (!initialPool.selectionBand) {
    return variants;
  }

  const selectionBandIndex = initialPool.fairnessBands.findIndex(
    (band) =>
      band.effectiveMatchCount === initialPool.selectionBandEffectiveMatchCount
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
    ...(variants[variants.length - 1]?.selectablePlayers ??
      initialPool.selectablePlayers),
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

function summarizeBatch<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[]
): V3BatchSelection<T> {
  const flattenedPlayers = selections.flatMap((selection) => selection.players);

  return {
    selections,
    restSummary: buildRestSummary(flattenedPlayers),
    maxBalanceGap: Math.max(
      ...selections.map((selection) => selection.balanceGap)
    ),
    totalBalanceGap: selections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    ),
    maxPointDiffGap: Math.max(
      ...selections.map((selection) => selection.pointDiffGap)
    ),
    totalPointDiffGap: selections.reduce(
      (sum, selection) => sum + selection.pointDiffGap,
      0
    ),
    totalSharedCourtRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.sharedCourtRepeatPenalty,
      0
    ),
    totalPartnerCoveragePenalty: selections.reduce(
      (sum, selection) => sum + selection.partnerCoveragePenalty,
      0
    ),
    totalOpponentCoveragePenalty: selections.reduce(
      (sum, selection) => sum + selection.opponentCoveragePenalty,
      0
    ),
    totalPartnerRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.partnerRepeatPenalty,
      0
    ),
    totalOpponentRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.opponentRepeatPenalty,
      0
    ),
    totalExactRematchPenalty: selections.reduce(
      (sum, selection) => sum + selection.exactRematchPenalty,
      0
    ),
    totalRandomScore: selections.reduce(
      (sum, selection) => sum + selection.randomScore,
      0
    ),
  };
}

function compareBatchFairnessVectors<T extends ActiveMatchmakerV3Player>(
  left: V3BatchSelection<T>,
  right: V3BatchSelection<T>
) {
  const leftVector = left.selections
    .flatMap((selection) => selection.players)
    .map((player) => player.effectiveMatchCount)
    .sort((leftValue, rightValue) => leftValue - rightValue);
  const rightVector = right.selections
    .flatMap((selection) => selection.players)
    .map((player) => player.effectiveMatchCount)
    .sort((leftValue, rightValue) => leftValue - rightValue);

  for (
    let index = 0;
    index < Math.max(leftVector.length, rightVector.length);
    index++
  ) {
    const leftValue = leftVector[index] ?? Number.POSITIVE_INFINITY;
    const rightValue = rightVector[index] ?? Number.POSITIVE_INFINITY;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function buildQuartetSelections<T extends MatchmakerV3Player>(
  candidatePlayers: ActiveMatchmakerV3Player<T>[],
  {
    sessionMode,
    completedMatches,
  }: {
    sessionMode: SessionMode;
    completedMatches: Array<{
      team1: [string, string];
      team2: [string, string];
      completedAt?: Date | null;
    }>;
  }
) {
  const quartets = buildCombinations(candidatePlayers, 4);
  const playersById = new Map(
    candidatePlayers.map((player) => [player.userId, player])
  );
  const rematchHistory = buildExactRematchHistory(completedMatches);
  const partnerHistory = buildPartnerRepeatHistory(completedMatches);
  const opponentHistory = buildOpponentRepeatHistory(completedMatches);
  const socialMixHistory = buildSocialMixHistory(completedMatches);
  const selections: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[] = [];

  for (const group of quartets) {
    const quartetPlayers = toQuartet(group);
    if (!quartetPlayers) {
      continue;
    }

    const ids = quartetPlayers.map((player) => player.userId) as [
      string,
      string,
      string,
      string,
    ];
    const restSummary = buildRestSummary(quartetPlayers);
    const randomScore = getQuartetRandomScore(quartetPlayers);

    for (const evaluation of evaluateBalancedPartitions(
      ids,
      playersById,
      sessionMode
    )) {
      selections.push({
        ids,
        players: quartetPlayers,
        partition: evaluation.partition,
        restSummary,
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
        ...getEmptyConsecutivePlayMetrics(),
        randomScore,
      });
    }
  }

  return selections;
}

function getBatchCandidateCap(courtCount: number, requiredPlayerCount: number) {
  if (courtCount <= 1) {
    return MAX_SINGLE_COURT_CANDIDATES;
  }

  if (courtCount === 2) {
    return MAX_TWO_COURT_CANDIDATES;
  }

  return Math.min(
    requiredPlayerCount + MULTI_COURT_EXTRA_CANDIDATES,
    MAX_MULTI_COURT_CANDIDATES
  );
}

function limitBatchCandidatePlayers<T extends MatchmakerV3Player>(
  candidatePool: V3CandidatePool<ActiveMatchmakerV3Player<T>>,
  candidateCap: number
) {
  const boundedMaxCandidateCount = Math.max(
    candidatePool.requiredPlayerCount,
    candidateCap
  );

  if (candidatePool.candidatePlayers.length <= boundedMaxCandidateCount) {
    return candidatePool.candidatePlayers;
  }

  const selectableLimit = Math.max(
    0,
    boundedMaxCandidateCount - candidatePool.lockedPlayers.length
  );

  return [
    ...candidatePool.lockedPlayers,
    ...candidatePool.selectablePlayers.slice(0, selectableLimit),
  ];
}

function buildArrivalPriorityBatchCandidatePool<T extends MatchmakerV3Player>(
  candidatePool: V3CandidatePool<ActiveMatchmakerV3Player<T>>,
  priorityPlayers: ActiveMatchmakerV3Player<T>[],
  requiredPlayerCount: number,
  candidateCap: number
): V3CandidatePool<ActiveMatchmakerV3Player<T>> {
  const priorityIds = new Set(priorityPlayers.map((player) => player.userId));
  const maxCandidateCount = Math.max(requiredPlayerCount, candidateCap);
  const fallbackCandidates = limitBatchCandidatePlayers(
    candidatePool,
    candidateCap
  );
  const candidatePlayers = mergeUniquePlayersById(
    [
      priorityPlayers,
      fallbackCandidates.filter((player) => !priorityIds.has(player.userId)),
      candidatePool.activePlayers.filter((player) => !priorityIds.has(player.userId)),
    ],
    maxCandidateCount
  );
  const selectablePlayers = candidatePlayers.filter(
    (player) => !priorityIds.has(player.userId)
  );

  return {
    ...candidatePool,
    lockedPlayers: priorityPlayers,
    requiredSelectableCount: Math.max(0, requiredPlayerCount - priorityPlayers.length),
    selectablePlayers,
    candidatePlayers,
    tieZone: null,
    widened: true,
    includedBandValues: [
      ...new Set([
        ...candidatePool.includedBandValues,
        ...priorityPlayers.map((player) => player.effectiveMatchCount),
      ]),
    ].sort((left, right) => left - right),
  };
}

function compressQuartetSelections<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  sessionType: SessionType,
  respectPlayerRest: boolean
) {
  const groupedSelections = new Map<string, V3SingleCourtSelection<T>[]>();

  for (const selection of selections) {
    const quartetKey = getQuartetKey(selection.ids);
    const group = groupedSelections.get(quartetKey);

    if (group) {
      group.push(selection);
      continue;
    }

    groupedSelections.set(quartetKey, [selection]);
  }

  const compressedSelections: V3SingleCourtSelection<T>[] = [];

  for (const group of groupedSelections.values()) {
    const sortedGroup = [...group].sort((left, right) =>
      compareSingleCourtSelections(left, right, sessionType, {
        respectPlayerRest,
      })
    );
    const firstSelection = sortedGroup[0];

    if (!firstSelection) {
      continue;
    }

    compressedSelections.push(firstSelection);

    const bestBalanceSelection =
      sessionType === SessionType.POINTS ||
      sessionType === SessionType.SOCIAL_MIX
        ? [...group].sort(
            (left, right) =>
              left.balanceGap - right.balanceGap ||
              left.pointDiffGap - right.pointDiffGap ||
              left.randomScore - right.randomScore
          )[0]
        : [...group].sort(
            (left, right) => left.balanceGap - right.balanceGap
          )[0];

    if (
      bestBalanceSelection &&
      getSelectionKey(bestBalanceSelection) !== getSelectionKey(firstSelection)
    ) {
      compressedSelections.push(bestBalanceSelection);
    }

    const bestVarietySelection =
      sessionType === SessionType.SOCIAL_MIX
        ? [...group].sort(
            (left, right) =>
              left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
              left.partnerCoveragePenalty - right.partnerCoveragePenalty ||
              left.opponentCoveragePenalty - right.opponentCoveragePenalty ||
              left.balanceGap - right.balanceGap ||
              left.pointDiffGap - right.pointDiffGap ||
              left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
              left.opponentRepeatPenalty - right.opponentRepeatPenalty ||
              left.exactRematchPenalty - right.exactRematchPenalty ||
              left.randomScore - right.randomScore
          )[0]
        : sessionType === SessionType.POINTS
        ? [...group].sort(
            (left, right) =>
              left.sharedCourtRepeatPenalty - right.sharedCourtRepeatPenalty ||
              left.balanceGap - right.balanceGap ||
              left.pointDiffGap - right.pointDiffGap ||
              left.randomScore - right.randomScore
          )[0]
        : sessionType === SessionType.ELO
          ? [...group].sort(
              (left, right) =>
                left.partnerRepeatPenalty - right.partnerRepeatPenalty ||
                left.balanceGap - right.balanceGap ||
                left.randomScore - right.randomScore
            )[0]
          : [...group].sort(
              (left, right) =>
                left.exactRematchPenalty - right.exactRematchPenalty ||
                left.balanceGap - right.balanceGap ||
                left.randomScore - right.randomScore
            )[0];

    if (
      bestVarietySelection &&
      getSelectionKey(bestVarietySelection) !== getSelectionKey(firstSelection) &&
      (!bestBalanceSelection ||
        getSelectionKey(bestVarietySelection) !==
          getSelectionKey(bestBalanceSelection))
    ) {
      compressedSelections.push(bestVarietySelection);
    }
  }

  return compressedSelections.sort((left, right) =>
    compareSingleCourtSelections(left, right, sessionType, {
      respectPlayerRest,
    })
  );
}

function findGreedyBatchSelection<T extends ActiveMatchmakerV3Player>(
  quartetSelections: V3SingleCourtSelection<T>[],
  orderedCandidateIds: string[],
  lockedIds: Set<string>,
  courtCount: number
) {
  const chosen: V3SingleCourtSelection<T>[] = [];
  const usedIds = new Set<string>();
  const quartetsByUserId = new Map(
    orderedCandidateIds.map((userId) => [userId, [] as V3SingleCourtSelection<T>[]])
  );

  for (const quartet of quartetSelections) {
    for (const userId of quartet.ids) {
      quartetsByUserId.get(userId)?.push(quartet);
    }
  }

  while (chosen.length < courtCount) {
    const anchorId =
      orderedCandidateIds.find((id) => lockedIds.has(id) && !usedIds.has(id)) ??
      orderedCandidateIds.find((id) => !usedIds.has(id));

    if (!anchorId) {
      return null;
    }

    const nextQuartet = (quartetsByUserId.get(anchorId) ?? []).find(
      (quartet) => !quartet.ids.some((id) => usedIds.has(id))
    );

    if (!nextQuartet) {
      return null;
    }

    chosen.push(nextQuartet);
    nextQuartet.ids.forEach((id) => usedIds.add(id));
  }

  if ([...lockedIds].some((id) => !usedIds.has(id))) {
    return null;
  }

  return summarizeBatch(chosen);
}

interface BatchSearchAttemptResult<T extends ActiveMatchmakerV3Player> {
  selection: V3BatchSelection<T> | null;
  candidatePlayerIds: string[];
  quartetCount: number;
  validQuartetCount: number;
  exploredBranches: number;
  prunedBranches: number;
  searchLimitReached: boolean;
  failureReason: V3BatchFailureReason | null;
}

function searchBatchCandidatePlayers<T extends MatchmakerV3Player>({
  candidatePlayers,
  lockedIds,
  courtCount,
  sessionMode,
  sessionType,
  respectPlayerRest,
  completedMatches,
  searchLimits,
}: {
  candidatePlayers: ActiveMatchmakerV3Player<T>[];
  lockedIds: Set<string>;
  courtCount: number;
  sessionMode: SessionMode;
  sessionType: SessionType;
  respectPlayerRest: boolean;
  completedMatches: Array<{
    team1: [string, string];
    team2: [string, string];
    completedAt?: Date | null;
  }>;
  searchLimits?: {
    maxBranches?: number;
    maxMs?: number;
  };
}): BatchSearchAttemptResult<ActiveMatchmakerV3Player<T>> {
  const requiredPlayerCount = courtCount * 4;
  const candidatePlayerIds = candidatePlayers.map((player) => player.userId);
  const quartetCount =
    candidatePlayers.length >= 4
      ? buildCombinations(candidatePlayers, 4).length
      : 0;

  if (courtCount <= 0 || candidatePlayers.length < requiredPlayerCount) {
    return {
      selection: null,
      candidatePlayerIds,
      quartetCount,
      validQuartetCount: 0,
      exploredBranches: 0,
      prunedBranches: 0,
      searchLimitReached: false,
      failureReason: "INSUFFICIENT_PLAYERS",
    };
  }

  const quartetSelections = compressQuartetSelections(
    buildQuartetSelections(candidatePlayers, {
      sessionMode,
      completedMatches,
    }),
    sessionType,
    respectPlayerRest
  );

  if (quartetSelections.length < courtCount) {
    return {
      selection: null,
      candidatePlayerIds,
      quartetCount,
      validQuartetCount: quartetSelections.length,
      exploredBranches: 0,
      prunedBranches: 0,
      searchLimitReached: false,
      failureReason:
        sessionMode === SessionMode.MIXICANO && quartetSelections.length === 0
          ? "NO_VALID_MIXED_QUARTETS"
          : "NOT_ENOUGH_NON_OVERLAPPING_COURTS",
    };
  }

  const orderedCandidateIds = candidatePlayerIds;
  const candidateIds = new Set(orderedCandidateIds);
  const quartetsByUserId = new Map(
    orderedCandidateIds.map((userId) => [userId, [] as typeof quartetSelections])
  );

  for (const quartet of quartetSelections) {
    for (const userId of quartet.ids) {
      quartetsByUserId.get(userId)?.push(quartet);
    }
  }

  let bestSelection: V3BatchSelection<ActiveMatchmakerV3Player<T>> | null =
    null;
  const maxBranches = searchLimits?.maxBranches ?? MAX_BATCH_SEARCH_BRANCHES;
  const searchDeadline = Date.now() + (searchLimits?.maxMs ?? MAX_BATCH_SEARCH_MS);
  let searchLimitReached = false;
  let exploredBranches = 0;
  let prunedBranches = 0;

  const backtrack = (
    chosen: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[],
    usedIds: Set<string>
  ) => {
    exploredBranches += 1;

    if (
      exploredBranches >= maxBranches ||
      Date.now() >= searchDeadline
    ) {
      searchLimitReached = true;
      prunedBranches += 1;
      return;
    }

    const remainingCourts = courtCount - chosen.length;
    if (remainingCourts === 0) {
      if (lockedIds.size > 0 && [...lockedIds].some((id) => !usedIds.has(id))) {
        return;
      }

      const batchSelection = summarizeBatch(chosen);
      const fairnessCompare = bestSelection
        ? compareBatchFairnessVectors(batchSelection, bestSelection)
        : -1;
      if (
        !bestSelection ||
        fairnessCompare < 0 ||
        (fairnessCompare === 0 &&
          compareBatchSelections(batchSelection, bestSelection, sessionType, {
            respectPlayerRest,
          }) < 0)
      ) {
        bestSelection = batchSelection;
      }

      return;
    }

    const remainingAvailablePlayers = [...candidateIds].filter(
      (id) => !usedIds.has(id)
    );

    if (remainingAvailablePlayers.length < remainingCourts * 4) {
      prunedBranches += 1;
      return;
    }

    const remainingLockedPlayers = [...lockedIds].filter((id) => !usedIds.has(id));
    if (remainingLockedPlayers.length > remainingCourts * 4) {
      prunedBranches += 1;
      return;
    }

    const anchorId =
      orderedCandidateIds.find((id) => lockedIds.has(id) && !usedIds.has(id)) ??
      orderedCandidateIds.find((id) => !usedIds.has(id));

    if (!anchorId) {
      prunedBranches += 1;
      return;
    }

    for (const quartet of quartetsByUserId.get(anchorId) ?? []) {
      if (quartet.ids.some((id) => usedIds.has(id))) {
        continue;
      }

      const nextUsedIds = new Set(usedIds);
      quartet.ids.forEach((id) => nextUsedIds.add(id));
      backtrack([...chosen, quartet], nextUsedIds);
    }
  };

  backtrack([], new Set<string>());

  const selection =
    bestSelection ??
    (searchLimitReached
      ? findGreedyBatchSelection(
          quartetSelections,
          orderedCandidateIds,
          lockedIds,
          courtCount
        )
      : null);

  return {
    selection,
    candidatePlayerIds,
    quartetCount,
    validQuartetCount: quartetSelections.length,
    exploredBranches,
    prunedBranches,
    searchLimitReached,
    failureReason: selection
      ? null
      : searchLimitReached
        ? "SEARCH_LIMIT_REACHED"
        : lockedIds.size > 0
          ? "LOCKED_PLAYERS_CANNOT_ALL_FIT"
          : "NOT_ENOUGH_NON_OVERLAPPING_COURTS",
  };
}

export function findBestBatchSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  {
    courtCount,
    sessionMode,
    sessionType,
    respectPlayerRest = true,
    completedMatches = [],
    randomFn = Math.random,
    searchLimits,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    sessionType: SessionType;
    respectPlayerRest?: boolean;
    completedMatches?: Array<{
      team1: [string, string];
      team2: [string, string];
      completedAt?: Date | null;
    }>;
    randomFn?: () => number;
    searchLimits?: {
      maxBranches?: number;
      maxMs?: number;
    };
  }
): V3BatchResult<ActiveMatchmakerV3Player<T>> {
  const requiredPlayerCount = courtCount * 4;
  const candidateCap =
    courtCount > 0 ? getBatchCandidateCap(courtCount, requiredPlayerCount) : null;
  const candidatePool = buildCandidatePool(players, {
    requiredPlayerCount,
    randomFn,
  });
  const debug: V3BatchDebug = {
    eligiblePlayerIds: candidatePool.activePlayers.map((player) => player.userId),
    availableCandidateCount: candidatePool.candidatePlayers.length,
    consideredCandidateCount: 0,
    candidateCap,
    lowestBand: candidatePool.lowestBand,
    includedBandValues: candidatePool.includedBandValues,
    widened: candidatePool.widened,
    lockedPlayerIds: candidatePool.lockedPlayers.map((player) => player.userId),
    tieZonePlayerIds:
      candidatePool.tieZone?.players.map((player) => player.userId) ?? [],
    candidatePlayerIds: candidatePool.candidatePlayers.map((player) => player.userId),
    quartetCount: 0,
    validQuartetCount: 0,
    exploredBranches: 0,
    prunedBranches: 0,
    searchAttemptCount: 0,
    searchLimitReached: false,
    failureReason: null,
    chosenQuartets: [],
    chosenMaxBalanceGap: null,
    chosenTotalBalanceGap: null,
    chosenMaxPointDiffGap: null,
    chosenTotalPointDiffGap: null,
    chosenTotalPartnerRepeatPenalty: null,
    chosenTotalOpponentRepeatPenalty: null,
    chosenTotalExactRematchPenalty: null,
  };

  if (
    courtCount <= 0 ||
    candidatePool.insufficientPlayers ||
    candidatePool.candidatePlayers.length < requiredPlayerCount
  ) {
    debug.failureReason = "INSUFFICIENT_PLAYERS";
    return {
      selection: null,
      debug,
    };
  }

  const attemptedCandidateLists = new Set<string>();
  const candidatePools =
    sessionMode === SessionMode.MIXICANO
      ? buildFeasibilityCandidatePools(candidatePool)
      : [candidatePool];
  let finalSelection: V3BatchSelection<ActiveMatchmakerV3Player<T>> | null =
    null;
  const attemptRecords: Array<{
    pool: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
    result: BatchSearchAttemptResult<ActiveMatchmakerV3Player<T>>;
  }> = [];

  const runAttempt = ({
    pool,
    candidatePlayers,
    lockedIds,
  }: {
    pool: V3CandidatePool<ActiveMatchmakerV3Player<T>>;
    candidatePlayers: ActiveMatchmakerV3Player<T>[];
    lockedIds: Set<string>;
  }) => {
    const candidateKey = getCandidateListKey(candidatePlayers, lockedIds);
    if (attemptedCandidateLists.has(candidateKey)) {
      return null;
    }

    attemptedCandidateLists.add(candidateKey);
    debug.searchAttemptCount += 1;

    const attempt = searchBatchCandidatePlayers({
      candidatePlayers,
      lockedIds,
      courtCount,
      sessionMode,
      sessionType,
      respectPlayerRest,
      completedMatches,
      searchLimits,
    });

    attemptRecords.push({ pool, result: attempt });
    return attempt;
  };

  const priorityPlayers = sortArrivalPriorityPlayers(candidatePool.activePlayers);
  if (priorityPlayers.length > 0) {
    const maxPriorityCount = Math.min(priorityPlayers.length, requiredPlayerCount);

    for (
      let priorityCount = maxPriorityCount;
      priorityCount >= 1 && !finalSelection;
      priorityCount--
    ) {
      const requiredPriorityPlayers = priorityPlayers.slice(0, priorityCount);
      const priorityPool = buildArrivalPriorityBatchCandidatePool(
        candidatePool,
        requiredPriorityPlayers,
        requiredPlayerCount,
        candidateCap ?? requiredPlayerCount
      );
      const priorityAttempt = runAttempt({
        pool: priorityPool,
        candidatePlayers: priorityPool.candidatePlayers,
        lockedIds: new Set(
          requiredPriorityPlayers.map((player) => player.userId)
        ),
      });

      if (priorityAttempt?.selection) {
        finalSelection = priorityAttempt.selection;
      }
    }
  }

  if (!finalSelection) {
    const strictLockedIds = new Set(
      candidatePool.lockedPlayers.map((player) => player.userId)
    );
    const strictAttempt = runAttempt({
      pool: candidatePool,
      candidatePlayers: limitBatchCandidatePlayers(
        candidatePool,
        candidateCap ?? requiredPlayerCount
      ),
      lockedIds: strictLockedIds,
    });

    if (strictAttempt?.selection) {
      finalSelection = strictAttempt.selection;
    }
  }

  if (!finalSelection && sessionMode === SessionMode.MIXICANO) {
    for (const fallbackPool of candidatePools) {
      const fallbackCandidatePlayers = limitBatchCandidatePlayers(
        fallbackPool,
        candidateCap ?? requiredPlayerCount
      );
      const fallbackLockedIds = new Set(
        fallbackPool.lockedPlayers.map((player) => player.userId)
      );

      const widenedAttempt = runAttempt({
        pool: fallbackPool,
        candidatePlayers: fallbackCandidatePlayers,
        lockedIds: fallbackLockedIds,
      });

      if (widenedAttempt?.selection) {
        finalSelection = widenedAttempt.selection;
        break;
      }

      if (fallbackPool.lockedPlayers.length === 0) {
        continue;
      }

      const relaxedAttempt = runAttempt({
        pool: fallbackPool,
        candidatePlayers: fallbackCandidatePlayers,
        lockedIds: new Set<string>(),
      });

      if (relaxedAttempt?.selection) {
        finalSelection = relaxedAttempt.selection;
        break;
      }
    }
  }

  const finalAttemptRecord = attemptRecords[attemptRecords.length - 1];
  if (finalAttemptRecord) {
    debug.includedBandValues = finalAttemptRecord.pool.includedBandValues;
    debug.widened = finalAttemptRecord.pool.widened;
    debug.lockedPlayerIds = finalAttemptRecord.pool.lockedPlayers.map(
      (player) => player.userId
    );
    debug.tieZonePlayerIds =
      finalAttemptRecord.pool.tieZone?.players.map((player) => player.userId) ??
      [];
    debug.candidatePlayerIds = finalAttemptRecord.result.candidatePlayerIds;
    debug.availableCandidateCount =
      finalAttemptRecord.pool.candidatePlayers.length;
    debug.consideredCandidateCount =
      finalAttemptRecord.result.candidatePlayerIds.length;
    debug.candidateCap = candidateCap;
    debug.quartetCount = finalAttemptRecord.result.quartetCount;
    debug.validQuartetCount = finalAttemptRecord.result.validQuartetCount;
    debug.exploredBranches = finalAttemptRecord.result.exploredBranches;
    debug.prunedBranches = finalAttemptRecord.result.prunedBranches;
    debug.searchLimitReached = finalAttemptRecord.result.searchLimitReached;
    debug.failureReason = finalAttemptRecord.result.failureReason;
  }

  if (finalSelection !== null) {
    debug.failureReason = null;
    debug.chosenQuartets = finalSelection.selections.map(
      (selection) => selection.ids
    );
    debug.chosenMaxBalanceGap = finalSelection.maxBalanceGap;
    debug.chosenTotalBalanceGap = finalSelection.totalBalanceGap;
    debug.chosenMaxPointDiffGap = finalSelection.maxPointDiffGap;
    debug.chosenTotalPointDiffGap = finalSelection.totalPointDiffGap;
    debug.chosenTotalPartnerRepeatPenalty =
      finalSelection.totalPartnerRepeatPenalty;
    debug.chosenTotalOpponentRepeatPenalty =
      finalSelection.totalOpponentRepeatPenalty;
    debug.chosenTotalExactRematchPenalty =
      finalSelection.totalExactRematchPenalty;
  }

  return {
    selection: finalSelection,
    debug,
  };
}
