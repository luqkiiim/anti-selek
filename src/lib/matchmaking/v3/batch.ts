import { SessionMode, SessionType } from "../../../types/enums";
import { evaluateBalancedPartitions } from "./balance";
import { buildCandidatePool } from "./candidatePool";
import { DEFAULT_MATCH_DURATION_MS } from "./fairness";
import {
  buildExactRematchHistory,
  buildPartnerRepeatHistory,
  getExactRematchPenalty,
  getPartnerRepeatPenalty,
} from "./rematch";
import {
  buildWaitSummary,
  compareBatchSelections,
  compareSingleCourtSelections,
  getQuartetRandomScore,
} from "./scoring";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3BatchDebug,
  V3BatchResult,
  V3BatchSelection,
  V3SingleCourtSelection,
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

function summarizeBatch<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[]
): V3BatchSelection<T> {
  const flattenedPlayers = selections.flatMap((selection) => selection.players);

  return {
    selections,
    waitSummary: buildWaitSummary(flattenedPlayers),
    maxBalanceGap: Math.max(
      ...selections.map((selection) => selection.balanceGap)
    ),
    totalBalanceGap: selections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    ),
    totalPartnerRepeatPenalty: selections.reduce(
      (sum, selection) => sum + selection.partnerRepeatPenalty,
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
    const waitSummary = buildWaitSummary(quartetPlayers);
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
      });
    }
  }

  return selections;
}

function limitBatchCandidatePlayers<T extends MatchmakerV3Player>(
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

function compressQuartetSelections<T extends ActiveMatchmakerV3Player>(
  selections: V3SingleCourtSelection<T>[],
  sessionType: SessionType
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
      compareSingleCourtSelections(left, right, sessionType)
    );
    const firstSelection = sortedGroup[0];

    if (!firstSelection) {
      continue;
    }

    compressedSelections.push(firstSelection);

    const bestBalanceSelection = [...group].sort(
      (left, right) => left.balanceGap - right.balanceGap
    )[0];

    if (
      bestBalanceSelection &&
      getSelectionKey(bestBalanceSelection) !== getSelectionKey(firstSelection)
    ) {
      compressedSelections.push(bestBalanceSelection);
    }

    const bestVarietySelection =
      sessionType === SessionType.POINTS || sessionType === SessionType.ELO
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
    compareSingleCourtSelections(left, right, sessionType)
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

export function findBestBatchSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  {
    courtCount,
    sessionMode,
    sessionType,
    completedMatches = [],
    now = Date.now(),
    matchDurationMs = DEFAULT_MATCH_DURATION_MS,
    randomFn = Math.random,
  }: {
    courtCount: number;
    sessionMode: SessionMode;
    sessionType: SessionType;
    completedMatches?: Array<{
      team1: [string, string];
      team2: [string, string];
      completedAt?: Date | null;
    }>;
    now?: number;
    matchDurationMs?: number;
    randomFn?: () => number;
  }
): V3BatchResult<ActiveMatchmakerV3Player<T>> {
  const requiredPlayerCount = courtCount * 4;
  const candidatePool = buildCandidatePool(players, {
    requiredPlayerCount,
    now,
    matchDurationMs,
    randomFn,
  });
  const debug: V3BatchDebug = {
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
    chosenMaxBalanceGap: null,
    chosenTotalBalanceGap: null,
    chosenTotalPartnerRepeatPenalty: null,
    chosenTotalExactRematchPenalty: null,
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
  const quartetSelections = compressQuartetSelections(
    buildQuartetSelections(batchCandidatePlayers, {
      sessionMode,
      completedMatches,
    }),
    sessionType
  );

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
    orderedCandidateIds.map((userId) => [userId, [] as typeof quartetSelections])
  );

  for (const quartet of quartetSelections) {
    for (const userId of quartet.ids) {
      quartetsByUserId.get(userId)?.push(quartet);
    }
  }

  let bestSelection: V3BatchSelection<ActiveMatchmakerV3Player<T>> | null =
    null;
  const searchDeadline = Date.now() + MAX_BATCH_SEARCH_MS;
  let searchAborted = false;

  const backtrack = (
    chosen: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[],
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
      if (
        !bestSelection ||
        compareBatchSelections(batchSelection, bestSelection, sessionType) < 0
      ) {
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
    (bestSelection ??
      (searchAborted
        ? findGreedyBatchSelection(
            quartetSelections,
            orderedCandidateIds,
            lockedIds,
            courtCount
          )
        : null)) as V3BatchSelection<ActiveMatchmakerV3Player<T>> | null;

  if (finalSelection !== null) {
    debug.chosenQuartets = finalSelection.selections.map(
      (selection) => selection.ids
    );
    debug.chosenMaxBalanceGap = finalSelection.maxBalanceGap;
    debug.chosenTotalBalanceGap = finalSelection.totalBalanceGap;
    debug.chosenTotalPartnerRepeatPenalty =
      finalSelection.totalPartnerRepeatPenalty;
    debug.chosenTotalExactRematchPenalty =
      finalSelection.totalExactRematchPenalty;
  }

  return {
    selection: finalSelection,
    debug,
  };
}
