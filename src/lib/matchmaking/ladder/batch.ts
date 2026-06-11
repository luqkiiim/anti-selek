import { SessionMode } from "../../../types/enums";
import { sortArrivalPriorityPlayers } from "../arrivalPriority";
import { findBestBalancedPartition } from "./balance";
import { buildCandidatePool } from "./candidatePool";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import { buildLadderGroupingSummary } from "./ladderGrouping";
import {
  buildWaitSummary,
  compareBatchSelections,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerLadderPlayer,
  LadderBatchDebug,
  LadderBatchResult,
  LadderBatchSelection,
  LadderCandidatePool,
  LadderSingleCourtSelection,
  MatchmakerLadderPlayer,
} from "./types";

const MAX_BATCH_EXTRA_CANDIDATES = 8;
const MAX_BATCH_CANDIDATE_PLAYERS = 20;
const MAX_BATCH_SEARCH_BRANCHES = 20000;
const MAX_BATCH_SEARCH_MS = 750;

function buildFeasibilityCandidatePools<T extends MatchmakerLadderPlayer>(
  initialPool: ReturnType<typeof buildCandidatePool<T>>
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

  const selectablePlayers = [...initialPool.selectablePlayers];
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
    });
  }

  return variants;
}

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

function summarizeBatch<T extends ActiveMatchmakerLadderPlayer>(
  selections: LadderSingleCourtSelection<T>[]
): LadderBatchSelection<T> {
  const flattenedPlayers = selections.flatMap((selection) => selection.players);

  return {
    selections,
    waitSummary: buildWaitSummary(flattenedPlayers),
    maxLadderGap: Math.max(
      ...selections.map((selection) => selection.groupingSummary.maxLadderGap)
    ),
    totalLadderGap: selections.reduce(
      (sum, selection) => sum + selection.groupingSummary.totalLadderGap,
      0
    ),
    totalPointDiffGap: selections.reduce(
      (sum, selection) => sum + selection.groupingSummary.totalPointDiffGap,
      0
    ),
    maxBalanceGap: Math.max(
      ...selections.map((selection) => selection.balanceGap)
    ),
    totalBalanceGap: selections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    ),
    maxPointDiffBalanceGap: Math.max(
      ...selections.map((selection) => selection.pointDiffGap)
    ),
    totalPointDiffBalanceGap: selections.reduce(
      (sum, selection) => sum + selection.pointDiffGap,
      0
    ),
    maxStrengthGap: Math.max(
      ...selections.map((selection) => selection.strengthGap)
    ),
    totalStrengthGap: selections.reduce(
      (sum, selection) => sum + selection.strengthGap,
      0
    ),
    totalRandomScore: selections.reduce(
      (sum, selection) => sum + selection.randomScore,
      0
    ),
  };
}

function buildQuartetSelections<T extends MatchmakerLadderPlayer>(
  candidatePlayers: ActiveMatchmakerLadderPlayer<T>[],
  sessionMode: SessionMode
) {
  const quartets = buildCombinations(candidatePlayers, 4);
  const playersById = new Map(
    candidatePlayers.map((player) => [player.userId, player])
  );
  const selections: LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[] =
    [];

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
    const bestPartition = findBestBalancedPartition(ids, playersById, sessionMode);

    if (!bestPartition) {
      continue;
    }

    selections.push({
      ids,
      players: quartetPlayers,
      partition: bestPartition.partition,
      waitSummary: buildWaitSummary(quartetPlayers),
      groupingSummary: buildLadderGroupingSummary(quartetPlayers),
      balanceGap: bestPartition.balanceGap,
      pointDiffGap: bestPartition.pointDiffGap,
      strengthGap: bestPartition.strengthGap,
      randomScore: getQuartetRandomScore(quartetPlayers),
    });
  }

  return selections;
}

function limitBatchCandidatePlayers<T extends MatchmakerLadderPlayer>(
  candidatePool: ReturnType<typeof buildCandidatePool<T>>,
  requiredPlayerCount: number
) {
  const maxCandidateCount = Math.min(
    MAX_BATCH_CANDIDATE_PLAYERS,
    Math.max(requiredPlayerCount, requiredPlayerCount + MAX_BATCH_EXTRA_CANDIDATES)
  );

  if (candidatePool.candidatePlayers.length <= maxCandidateCount) {
    return candidatePool.candidatePlayers;
  }

  const selectableLimit = Math.max(
    0,
    maxCandidateCount - candidatePool.lockedPlayers.length
  );

  const distributedSelectablePlayers = [...candidatePool.selectablePlayers].sort(
    (left, right) =>
      left.ladderScore - right.ladderScore ||
      left.pointDiff - right.pointDiff ||
      left.strength - right.strength ||
      left.rank - right.rank
  );
  const limitedSelectablePlayers: ActiveMatchmakerLadderPlayer<T>[] = [];
  const usedIndices = new Set<number>();

  for (let selectionIndex = 0; selectionIndex < selectableLimit; selectionIndex++) {
    const targetIndex =
      selectableLimit <= 1
        ? 0
        : Math.round(
            (selectionIndex * (distributedSelectablePlayers.length - 1)) /
              (selectableLimit - 1)
          );

    let nextIndex = targetIndex;
    while (
      usedIndices.has(nextIndex) &&
      nextIndex < distributedSelectablePlayers.length - 1
    ) {
      nextIndex += 1;
    }

    while (usedIndices.has(nextIndex) && nextIndex > 0) {
      nextIndex -= 1;
    }

    if (usedIndices.has(nextIndex)) {
      break;
    }

    usedIndices.add(nextIndex);
    limitedSelectablePlayers.push(distributedSelectablePlayers[nextIndex]);
  }

  return [
    ...candidatePool.lockedPlayers,
    ...limitedSelectablePlayers,
  ];
}

function buildArrivalPriorityBatchCandidatePool<
  T extends MatchmakerLadderPlayer,
>(
  candidatePool: LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>>,
  priorityPlayers: ActiveMatchmakerLadderPlayer<T>[],
  requiredPlayerCount: number
): LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>> {
  const priorityIds = new Set(priorityPlayers.map((player) => player.userId));
  const selectablePlayers = candidatePool.activePlayers.filter(
    (player) => !priorityIds.has(player.userId)
  );

  return {
    ...candidatePool,
    lockedPlayers: priorityPlayers,
    requiredSelectableCount: Math.max(
      0,
      requiredPlayerCount - priorityPlayers.length
    ),
    selectablePlayers,
    candidatePlayers: [...priorityPlayers, ...selectablePlayers],
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

function findGreedyBatchSelection<T extends ActiveMatchmakerLadderPlayer>(
  quartetSelections: LadderSingleCourtSelection<T>[],
  orderedCandidateIds: string[],
  lockedIds: Set<string>,
  courtCount: number
) {
  const chosen: LadderSingleCourtSelection<T>[] = [];
  const usedIds = new Set<string>();
  const quartetsByUserId = new Map(
    orderedCandidateIds.map((userId) => [
      userId,
      [] as LadderSingleCourtSelection<T>[],
    ])
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

interface LadderBatchSearchAttemptResult<
  T extends ActiveMatchmakerLadderPlayer,
> {
  selection: LadderBatchSelection<T> | null;
  candidatePlayerIds: string[];
  quartetCount: number;
  validQuartetCount: number;
  exploredBranches: number;
  prunedBranches: number;
}

function searchBatchCandidatePool<T extends MatchmakerLadderPlayer>({
  candidatePool,
  requiredPlayerCount,
  courtCount,
  sessionMode,
  respectPlayerRest,
}: {
  candidatePool: LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>>;
  requiredPlayerCount: number;
  courtCount: number;
  sessionMode: SessionMode;
  respectPlayerRest: boolean;
}): LadderBatchSearchAttemptResult<ActiveMatchmakerLadderPlayer<T>> {
  const batchCandidatePlayers = limitBatchCandidatePlayers(
    candidatePool,
    requiredPlayerCount
  );
  const quartetSelections = buildQuartetSelections(
    batchCandidatePlayers,
    sessionMode
  ).sort((left, right) =>
    compareSingleCourtSelections(left, right, sessionMode, {
      respectPlayerRest,
    })
  );
  const candidatePlayerIds = batchCandidatePlayers.map(
    (player) => player.userId
  );
  const quartetCount = buildCombinations(batchCandidatePlayers, 4).length;

  if (quartetSelections.length < courtCount) {
    return {
      selection: null,
      candidatePlayerIds,
      quartetCount,
      validQuartetCount: quartetSelections.length,
      exploredBranches: 0,
      prunedBranches: 0,
    };
  }

  const lockedIds = new Set(
    candidatePool.lockedPlayers.map((player) => player.userId)
  );
  const candidateIds = new Set(candidatePlayerIds);
  const quartetsByUserId = new Map(
    candidatePlayerIds.map((userId) => [
      userId,
      [] as LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[],
    ])
  );

  for (const quartet of quartetSelections) {
    for (const userId of quartet.ids) {
      quartetsByUserId.get(userId)?.push(quartet);
    }
  }

  let bestSelection:
    | LadderBatchSelection<ActiveMatchmakerLadderPlayer<T>>
    | null = null;
  const searchDeadline = Date.now() + MAX_BATCH_SEARCH_MS;
  let searchAborted = false;
  let exploredBranches = 0;
  let prunedBranches = 0;

  const backtrack = (
    chosen: LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[],
    usedIds: Set<string>
  ) => {
    exploredBranches += 1;

    if (
      exploredBranches >= MAX_BATCH_SEARCH_BRANCHES ||
      Date.now() >= searchDeadline
    ) {
      searchAborted = true;
      prunedBranches += 1;
      return;
    }

    const remainingCourts = courtCount - chosen.length;
    if (remainingCourts === 0) {
      if (lockedIds.size > 0 && [...lockedIds].some((id) => !usedIds.has(id))) {
        return;
      }

      const batchSelection = summarizeBatch(chosen);
      if (
        !bestSelection ||
        compareBatchSelections(batchSelection, bestSelection, sessionMode, {
          respectPlayerRest,
        }) < 0
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

    const remainingLockedPlayers = [...lockedIds].filter(
      (id) => !usedIds.has(id)
    );
    if (remainingLockedPlayers.length > remainingCourts * 4) {
      prunedBranches += 1;
      return;
    }

    const anchorId =
      candidatePlayerIds.find((id) => lockedIds.has(id) && !usedIds.has(id)) ??
      candidatePlayerIds.find((id) => !usedIds.has(id));

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
    (searchAborted
      ? findGreedyBatchSelection(
          quartetSelections,
          candidatePlayerIds,
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
  };
}

export function findBestBatchSelectionLadder<T extends MatchmakerLadderPlayer>(
  players: T[],
  {
    courtCount,
    sessionMode,
    respectPlayerRest = true,
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    respectPlayerRest?: boolean;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): LadderBatchResult<ActiveMatchmakerLadderPlayer<T>> {
  const requiredPlayerCount = courtCount * 4;
  const initialCandidatePool = buildCandidatePool(players, {
    requiredPlayerCount,
    now,
    matchDurationMs,
    randomFn,
    useWaitingTimeTieZone: false,
  });
  let searchedCandidatePool = initialCandidatePool;
  const debug: LadderBatchDebug = {
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
      initialCandidatePool.tieZone?.players.map((player) => player.userId) ?? [],
    candidatePlayerIds: initialCandidatePool.candidatePlayers.map(
      (player) => player.userId
    ),
    quartetCount: 0,
    validQuartetCount: 0,
    exploredBranches: 0,
    prunedBranches: 0,
    chosenQuartets: [],
    chosenMaxLadderGap: null,
    chosenTotalLadderGap: null,
    chosenTotalPointDiffGap: null,
    chosenMaxBalanceGap: null,
    chosenTotalBalanceGap: null,
    chosenMaxPointDiffBalanceGap: null,
    chosenTotalPointDiffBalanceGap: null,
    chosenMaxStrengthGap: null,
    chosenTotalStrengthGap: null,
  };

  if (
    courtCount <= 0 ||
    initialCandidatePool.insufficientPlayers ||
    initialCandidatePool.candidatePlayers.length < requiredPlayerCount
  ) {
    return {
      selection: null,
      debug,
    };
  }

  const candidatePools = buildFeasibilityCandidatePools(initialCandidatePool);
  let finalSelection: LadderBatchSelection<ActiveMatchmakerLadderPlayer<T>> | null =
    null;
  const attemptRecords: Array<{
    pool: LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>>;
    result: LadderBatchSearchAttemptResult<ActiveMatchmakerLadderPlayer<T>>;
  }> = [];
  const runAttempt = (
    pool: LadderCandidatePool<ActiveMatchmakerLadderPlayer<T>>
  ) => {
    searchedCandidatePool = pool;
    const result = searchBatchCandidatePool({
      candidatePool: pool,
      requiredPlayerCount,
      courtCount,
      sessionMode,
      respectPlayerRest,
    });
    attemptRecords.push({ pool, result });
    return result;
  };

  const priorityPlayers = sortArrivalPriorityPlayers(
    initialCandidatePool.activePlayers
  );
  if (priorityPlayers.length > 0) {
    const maxPriorityCount = Math.min(priorityPlayers.length, requiredPlayerCount);

    for (
      let priorityCount = maxPriorityCount;
      priorityCount >= 1 && !finalSelection;
      priorityCount--
    ) {
      const priorityPool = buildArrivalPriorityBatchCandidatePool(
        initialCandidatePool,
        priorityPlayers.slice(0, priorityCount),
        requiredPlayerCount
      );
      const priorityAttempt = runAttempt(priorityPool);

      if (priorityAttempt.selection) {
        finalSelection = priorityAttempt.selection;
      }
    }
  }

  if (!finalSelection) {
    for (const candidatePool of candidatePools) {
      const attempt = runAttempt(candidatePool);

      if (!attempt.selection) {
        continue;
      }

      finalSelection = attempt.selection;
      break;
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
    debug.quartetCount = finalAttemptRecord.result.quartetCount;
    debug.validQuartetCount = finalAttemptRecord.result.validQuartetCount;
    debug.exploredBranches = finalAttemptRecord.result.exploredBranches;
    debug.prunedBranches = finalAttemptRecord.result.prunedBranches;
  } else {
    debug.includedBandValues = searchedCandidatePool.includedBandValues;
    debug.widened = searchedCandidatePool.widened;
    debug.lockedPlayerIds = searchedCandidatePool.lockedPlayers.map(
      (player) => player.userId
    );
    debug.tieZonePlayerIds =
      searchedCandidatePool.tieZone?.players.map((player) => player.userId) ??
      [];
  }

  if (finalSelection) {
    debug.chosenQuartets = finalSelection.selections.map(
      (selection) => selection.ids
    );
    debug.chosenMaxLadderGap = finalSelection.maxLadderGap;
    debug.chosenTotalLadderGap = finalSelection.totalLadderGap;
    debug.chosenTotalPointDiffGap = finalSelection.totalPointDiffGap;
    debug.chosenMaxBalanceGap = finalSelection.maxBalanceGap;
    debug.chosenTotalBalanceGap = finalSelection.totalBalanceGap;
    debug.chosenMaxPointDiffBalanceGap = finalSelection.maxPointDiffBalanceGap;
    debug.chosenTotalPointDiffBalanceGap =
      finalSelection.totalPointDiffBalanceGap;
    debug.chosenMaxStrengthGap = finalSelection.maxStrengthGap;
    debug.chosenTotalStrengthGap = finalSelection.totalStrengthGap;
  }

  return {
    selection: finalSelection,
    debug,
  };
}
