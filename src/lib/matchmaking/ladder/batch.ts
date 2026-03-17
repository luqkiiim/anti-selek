import { SessionMode } from "../../../types/enums";
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
  LadderSingleCourtSelection,
  MatchmakerLadderPlayer,
} from "./types";

const MAX_BATCH_EXTRA_CANDIDATES = 2;
const MAX_BATCH_SEARCH_BRANCHES = 20000;
const MAX_BATCH_SEARCH_MS = 750;

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
  const maxCandidateCount = Math.max(
    requiredPlayerCount,
    requiredPlayerCount + MAX_BATCH_EXTRA_CANDIDATES
  );

  if (candidatePool.candidatePlayers.length <= maxCandidateCount) {
    return candidatePool.candidatePlayers;
  }

  const selectableLimit = Math.max(
    0,
    maxCandidateCount - candidatePool.lockedPlayers.length
  );

  return [
    ...candidatePool.lockedPlayers,
    ...candidatePool.selectablePlayers.slice(0, selectableLimit),
  ];
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

export function findBestBatchSelectionLadder<T extends MatchmakerLadderPlayer>(
  players: T[],
  {
    courtCount,
    sessionMode,
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): LadderBatchResult<ActiveMatchmakerLadderPlayer<T>> {
  const requiredPlayerCount = courtCount * 4;
  const candidatePool = buildCandidatePool(players, {
    requiredPlayerCount,
    now,
    matchDurationMs,
    randomFn,
  });
  const debug: LadderBatchDebug = {
    eligiblePlayerIds: candidatePool.activePlayers.map((player) => player.userId),
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
    candidatePool.insufficientPlayers ||
    candidatePool.candidatePlayers.length < requiredPlayerCount
  ) {
    return {
      selection: null,
      debug,
    };
  }

  const batchCandidatePlayers = limitBatchCandidatePlayers(
    candidatePool,
    requiredPlayerCount
  );
  const quartetSelections = buildQuartetSelections(
    batchCandidatePlayers,
    sessionMode
  ).sort((left, right) => compareSingleCourtSelections(left, right));

  debug.candidatePlayerIds = batchCandidatePlayers.map((player) => player.userId);
  debug.quartetCount = buildCombinations(batchCandidatePlayers, 4).length;
  debug.validQuartetCount = quartetSelections.length;

  if (quartetSelections.length < courtCount) {
    return {
      selection: null,
      debug,
    };
  }

  const orderedCandidateIds = batchCandidatePlayers.map((player) => player.userId);
  const lockedIds = new Set(candidatePool.lockedPlayers.map((player) => player.userId));
  const candidateIds = new Set(orderedCandidateIds);
  const quartetsByUserId = new Map(
    orderedCandidateIds.map((userId) => [
      userId,
      [] as LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[],
    ])
  );

  for (const quartet of quartetSelections) {
    for (const userId of quartet.ids) {
      quartetsByUserId.get(userId)?.push(quartet);
    }
  }

  let bestSelection: LadderBatchSelection<ActiveMatchmakerLadderPlayer<T>> | null =
    null;
  const searchDeadline = Date.now() + MAX_BATCH_SEARCH_MS;
  let searchAborted = false;

  const backtrack = (
    chosen: LadderSingleCourtSelection<ActiveMatchmakerLadderPlayer<T>>[],
    usedIds: Set<string>
  ) => {
    debug.exploredBranches += 1;

    if (
      debug.exploredBranches >= MAX_BATCH_SEARCH_BRANCHES ||
      Date.now() >= searchDeadline
    ) {
      searchAborted = true;
      debug.prunedBranches += 1;
      return;
    }

    const remainingCourts = courtCount - chosen.length;
    if (remainingCourts === 0) {
      if (lockedIds.size > 0 && [...lockedIds].some((id) => !usedIds.has(id))) {
        return;
      }

      const batchSelection = summarizeBatch(chosen);
      if (!bestSelection || compareBatchSelections(batchSelection, bestSelection) < 0) {
        bestSelection = batchSelection;
      }

      return;
    }

    const remainingAvailablePlayers = [...candidateIds].filter(
      (id) => !usedIds.has(id)
    );

    if (remainingAvailablePlayers.length < remainingCourts * 4) {
      debug.prunedBranches += 1;
      return;
    }

    const remainingLockedPlayers = [...lockedIds].filter((id) => !usedIds.has(id));
    if (remainingLockedPlayers.length > remainingCourts * 4) {
      debug.prunedBranches += 1;
      return;
    }

    const anchorId =
      orderedCandidateIds.find((id) => lockedIds.has(id) && !usedIds.has(id)) ??
      orderedCandidateIds.find((id) => !usedIds.has(id));

    if (!anchorId) {
      debug.prunedBranches += 1;
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

  const finalSelection =
    bestSelection ??
    (searchAborted
      ? findGreedyBatchSelection(
          quartetSelections,
          orderedCandidateIds,
          lockedIds,
          courtCount
        )
      : null);

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
