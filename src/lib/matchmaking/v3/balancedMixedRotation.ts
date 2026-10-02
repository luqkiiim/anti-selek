import { SessionMode, SessionType } from "../../../types/enums";
import {
  buildMixedVarietyContext,
  getMixedMatchClassification,
} from "./mixedVariety";
import {
  compareBatchSelections,
  compareBalancedMixedBatchSelections,
  compareBalancedMixedSingleCourtSelections,
  compareSingleCourtSelections,
  compareRestSummaries,
  ELO_BALANCE_GAP_CEILING,
  POINTS_BALANCE_VARIETY_TOLERANCE,
} from "./scoring";
import { randomUUID } from "node:crypto";

import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3BatchSelection,
  V3BalancedMixedRotationMetadata,
  V3CompletedMatch,
  V3SingleCourtSelectionOverride,
  V3BatchSelectionOverride,
  V3SingleCourtSelection,
} from "./types";
import { V3_SELECTION_OVERRIDE_REJECTED } from "./types";
import type { V3MixedHistoryMatch } from "./mixedVariety";
import {
  parseBalancedMixedRotationMetadata,
  parseMatchmakingReasonJson,
} from "../matchReason";

const MAX_PROJECTED_MATCH_SPREAD = 1;

type RotationCategory = "MIXED" | "UPPER" | "LOWER";

function buildRotationMetadata(
  context: ReturnType<typeof buildMixedVarietyContext>,
  category: RotationCategory | null,
  deferredPlayerIds: string[],
  {
    decisionId,
    timestamp,
    obligationOwner,
    fallbackReason,
    servedPlayerIds = [],
  }: {
    decisionId: string;
    timestamp: string;
    obligationOwner: boolean;
    fallbackReason?: string | null;
    servedPlayerIds?: string[];
  }
): V3BalancedMixedRotationMetadata {
  return {
    decisionId,
    timestamp,
    courtType: category,
    deferredPlayerIds: obligationOwner ? deferredPlayerIds : [],
    servedPlayerIds: obligationOwner ? servedPlayerIds : [],
    obligationOwner,
    target: {
      mixed: context.targetMixedGameRate,
      upperSameSide: context.targetUpperSameSideRate,
      lowerSameSide: context.targetLowerSameSideRate,
    },
    fallbackReason,
  };
}

export interface V3BalancedMixedRotationObligation {
  playerId: string;
  decisionId: string;
  timestamp: Date;
}

interface V3RotationHistoryEvent {
  createdAt: Date | string;
  userIds: string[];
  matchmakingReasonJson?: string | null;
}

export function buildBalancedMixedRotationObligations({
  players,
  events,
}: {
  players: Array<{
    userId: string;
    availableSince: Date | string;
    isPaused: boolean;
  }>;
  events: V3RotationHistoryEvent[];
}): V3BalancedMixedRotationObligation[] {
  const playerById = new Map(players.map((player) => [player.userId, player]));
  const parsedEvents = events.map((event) => {
    let rawReason: unknown;
    if (typeof event.matchmakingReasonJson === "string") {
      try {
        rawReason = JSON.parse(event.matchmakingReasonJson);
      } catch {
        rawReason = undefined;
      }
    }
    const parsedReason = parseMatchmakingReasonJson(event.matchmakingReasonJson);
    const rawMetadata =
      typeof rawReason === "object" && rawReason !== null
        ? (rawReason as Record<string, unknown>).balancedMixedRotation
        : undefined;
    return {
      ...event,
      createdAt: new Date(event.createdAt),
      metadata:
        parsedReason?.balancedMixedRotation ??
        parseBalancedMixedRotationMetadata(rawMetadata),
    };
  });
  const obligations = new Map<string, V3BalancedMixedRotationObligation>();

  for (const { metadata } of parsedEvents) {
    if (!metadata?.obligationOwner) continue;
    const createdAt = new Date(metadata.timestamp);
    if (!Number.isFinite(createdAt.getTime())) continue;

    for (const playerId of metadata.deferredPlayerIds) {
      const player = playerById.get(playerId);
      if (!player || player.isPaused) continue;
      if (new Date(player.availableSince).getTime() > createdAt.getTime()) {
        continue;
      }
      const wasScheduledAfterDecision = parsedEvents.some(
        (event) => {
          const metadataTime = event.metadata
            ? new Date(event.metadata.timestamp).getTime()
            : Number.NEGATIVE_INFINITY;
          const scheduledAt = Math.max(event.createdAt.getTime(), metadataTime);
          return (
          scheduledAt >= createdAt.getTime() &&
          event.userIds.includes(playerId) &&
          event.metadata?.decisionId !== metadata.decisionId
          );
        }
      );
      if (wasScheduledAfterDecision) continue;

      const existing = obligations.get(playerId);
      if (!existing || createdAt.getTime() < existing.timestamp.getTime()) {
        obligations.set(playerId, {
          playerId,
          decisionId: metadata.decisionId,
          timestamp: createdAt,
        });
      }
    }
  }

  return [...obligations.values()].sort(
    (left, right) =>
      left.timestamp.getTime() - right.timestamp.getTime() ||
      left.playerId.localeCompare(right.playerId)
  );
}

function getSelectionCategory<T extends MatchmakerV3Player>(
  selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  context: ReturnType<typeof buildMixedVarietyContext>
): RotationCategory | null {
  return getMixedMatchClassification(selection.partition, context.sideByUserId);
}

function getSelectionIds<T extends MatchmakerV3Player>(
  selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>
) {
  return selection.ids;
}

function getBatchIds<T extends MatchmakerV3Player>(
  selection: V3BatchSelection<ActiveMatchmakerV3Player<T>>
) {
  return selection.selections.flatMap((match) => match.ids);
}

function getSelectionCategories<T extends MatchmakerV3Player>(
  selections: readonly V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[],
  sideByUserId: Map<string, string | null>
) {
  return selections
    .map((selection) =>
      getMixedMatchClassification(selection.partition, sideByUserId)
    )
    .filter((category): category is RotationCategory => category !== null);
}

function getCategoryPenalty(
  context: ReturnType<typeof buildMixedVarietyContext>,
  categoriesAdded: RotationCategory[]
) {
  const currentCount = context.classifiableMatchCount;
  const targets = {
    MIXED: context.targetMixedGameRate,
    UPPER: context.targetUpperSameSideRate,
    LOWER: context.targetLowerSameSideRate,
  };
  const counts = {
    MIXED: context.mixedGameCount,
    UPPER: context.upperSameSideGameCount,
    LOWER: context.lowerSameSideGameCount,
  };
  const nextCounts = { ...counts };
  for (const category of categoriesAdded) {
    nextCounts[category] += 1;
  }
  const nextCount = currentCount + categoriesAdded.length;
  const currentScore = (Object.keys(targets) as RotationCategory[]).reduce(
    (score, category) => {
      const debt = counts[category] - targets[category] * currentCount;
      return score + debt * debt;
    },
    0
  );
  const nextScore = (Object.keys(targets) as RotationCategory[]).reduce(
    (score, category) => {
      const debt = nextCounts[category] - targets[category] * nextCount;
      return score + debt * debt;
    },
    0
  );
  return nextScore - currentScore;
}

export function getBalancedMixedBatchCategoryPenalty(
  context: ReturnType<typeof buildMixedVarietyContext>,
  selections: readonly V3SingleCourtSelection[]
) {
  return getCategoryPenalty(
    context,
    getSelectionCategories(selections, context.sideByUserId)
  );
}

function getProjectedMatchCount(
  player: MatchmakerV3Player,
  outstandingMatchCountByUserId: ReadonlyMap<string, number>
) {
  return Math.max(player.matchesPlayed, player.matchmakingBaseline) +
    (outstandingMatchCountByUserId.get(player.userId) ?? 0);
}

function getProjectedSpread(
  players: MatchmakerV3Player[],
  selectedUserIds: string[],
  outstandingMatchCountByUserId: ReadonlyMap<string, number>
) {
  const selected = new Set(selectedUserIds);
  const projected = players
    .filter((player) => !player.isPaused)
    .map(
      (player) =>
        getProjectedMatchCount(player, outstandingMatchCountByUserId) +
        (selected.has(player.userId) ? 1 : 0)
    );
  return projected.length > 0
    ? Math.max(...projected) - Math.min(...projected)
    : 0;
}

export function isBalancedMixedProjectedFairnessWithinBounds<T extends MatchmakerV3Player>(
  players: T[],
  selectedUserIds: string[],
  outstandingMatchCountByUserId: ReadonlyMap<string, number> = new Map()
) {
  const currentSpread = getProjectedSpread(
    players,
    [],
    outstandingMatchCountByUserId
  );
  const candidateSpread = getProjectedSpread(
    players,
    selectedUserIds,
    outstandingMatchCountByUserId
  );

  return currentSpread <= MAX_PROJECTED_MATCH_SPREAD
    ? candidateSpread <= MAX_PROJECTED_MATCH_SPREAD
    : candidateSpread <= currentSpread;
}

export function compareBalancedMixedProjectedCounts<T extends MatchmakerV3Player>(
  leftUserIds: string[],
  rightUserIds: string[],
  players: T[],
  outstandingMatchCountByUserId: ReadonlyMap<string, number>
) {
  const getCounts = (userIds: string[]) => {
    const selectedIds = new Set(userIds);
    return players
      .filter((player) => !player.isPaused)
      .map(
        (player) =>
          getProjectedMatchCount(player, outstandingMatchCountByUserId) +
          (selectedIds.has(player.userId) ? 1 : 0)
      )
      .sort((left, right) => right - left);
  };

  const leftCounts = getCounts(leftUserIds);
  const rightCounts = getCounts(rightUserIds);
  for (let index = 0; index < Math.max(leftCounts.length, rightCounts.length); index++) {
    const difference =
      (leftCounts[index] ?? Number.POSITIVE_INFINITY) -
      (rightCounts[index] ?? Number.POSITIVE_INFINITY);
    if (difference !== 0) return difference;
  }
  return 0;
}

function getProjectedFairCandidates<TSelection>(
  candidates: TSelection[],
  getIds: (candidate: TSelection) => string[],
  players: MatchmakerV3Player[],
  outstandingMatchCountByUserId: ReadonlyMap<string, number>,
  enforceProjectedFairness: boolean
) {
  if (!enforceProjectedFairness) return candidates;
  const safe = candidates.filter((candidate) =>
    isBalancedMixedProjectedFairnessWithinBounds(
      players,
      getIds(candidate),
      outstandingMatchCountByUserId
    )
  );
  const best = [...safe].sort((left, right) =>
    compareBalancedMixedProjectedCounts(
      getIds(left),
      getIds(right),
      players,
      outstandingMatchCountByUserId
    )
  )[0];
  return best
    ? safe.filter(
        (candidate) =>
          compareBalancedMixedProjectedCounts(
            getIds(candidate),
            getIds(best),
            players,
            outstandingMatchCountByUserId
          ) === 0
      )
    : [];
}

function filterFairSingleBalance<T extends ActiveMatchmakerV3Player>(
  candidates: V3SingleCourtSelection<T>[],
  sessionType: SessionType
) {
  if (candidates.length === 0) return candidates;
  const bestGap = Math.min(...candidates.map((candidate) => candidate.balanceGap));
  if (sessionType === SessionType.POINTS) {
    return candidates.filter(
      (candidate) =>
        candidate.balanceGap <= bestGap + POINTS_BALANCE_VARIETY_TOLERANCE
    );
  }
  if (sessionType === SessionType.ELO) {
    const withinCeiling = candidates.filter(
      (candidate) => candidate.balanceGap <= ELO_BALANCE_GAP_CEILING
    );
    return withinCeiling.length > 0
      ? withinCeiling
      : candidates.filter((candidate) => candidate.balanceGap === bestGap);
  }
  return candidates;
}

function filterFairBatchBalance<T extends ActiveMatchmakerV3Player>(
  candidates: V3BatchSelection<T>[],
  sessionType: SessionType
) {
  if (candidates.length === 0) return candidates;
  const bestGap = Math.min(
    ...candidates.map((candidate) => candidate.maxBalanceGap)
  );
  if (sessionType === SessionType.POINTS) {
    return candidates.filter(
      (candidate) =>
        candidate.maxBalanceGap <=
        bestGap + POINTS_BALANCE_VARIETY_TOLERANCE
    );
  }
  if (sessionType === SessionType.ELO) {
    const withinCeiling = candidates.filter(
      (candidate) => candidate.maxBalanceGap <= ELO_BALANCE_GAP_CEILING
    );
    if (withinCeiling.length > 0) return withinCeiling;
    const bestTotalGap = Math.min(
      ...candidates
        .filter((candidate) => candidate.maxBalanceGap === bestGap)
        .map((candidate) => candidate.totalBalanceGap)
    );
    return candidates.filter(
      (candidate) =>
        candidate.maxBalanceGap === bestGap &&
        candidate.totalBalanceGap === bestTotalGap
    );
  }
  return candidates;
}

function compareArrivalPriority(
  left: V3SingleCourtSelection,
  right: V3SingleCourtSelection
) {
  return compareArrivalPriorityPlayers(left.players, right.players);
}

function compareArrivalPriorityPlayers(
  leftPlayers: readonly MatchmakerV3Player[],
  rightPlayers: readonly MatchmakerV3Player[]
) {
  const getTimes = (players: readonly MatchmakerV3Player[]) =>
    players
      .map((player) => player.arrivalPriorityAt)
      .filter((value): value is Date | string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  const leftTimes = getTimes(leftPlayers);
  const rightTimes = getTimes(rightPlayers);
  if (leftTimes.length !== rightTimes.length) {
    return rightTimes.length - leftTimes.length;
  }
  for (let index = 0; index < leftTimes.length; index += 1) {
    const difference = (leftTimes[index] ?? 0) - (rightTimes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function filterFairSingleRestPriority<T extends ActiveMatchmakerV3Player>(
  candidates: V3SingleCourtSelection<T>[],
  respectPlayerRest: boolean
) {
  if (candidates.length < 2) return candidates;
  let preferred = [...candidates];
  const arrivalBaseline = [...preferred].sort(compareArrivalPriority)[0];
  preferred = preferred.filter(
    (candidate) => compareArrivalPriority(candidate, arrivalBaseline) === 0
  );
  if (!respectPlayerRest || preferred.length < 2) return preferred;

  const getMoreRestDeficit = (candidate: V3SingleCourtSelection<T>) =>
    candidate.players.reduce((sum, player) => sum + player.moreRestDeficit, 0);
  const minimumMoreRestDeficit = Math.min(...preferred.map(getMoreRestDeficit));
  preferred = preferred.filter(
    (candidate) => getMoreRestDeficit(candidate) === minimumMoreRestDeficit
  );
  if (preferred.length < 2) return preferred;

  const bestRest = [...preferred].sort((left, right) =>
    compareRestSummaries(left.restSummary, right.restSummary)
  )[0];
  preferred = preferred.filter(
    (candidate) => compareRestSummaries(candidate.restSummary, bestRest.restSummary) === 0
  );
  if (preferred.length < 2) return preferred;

  const compareConsecutive = (
    left: V3SingleCourtSelection<T>,
    right: V3SingleCourtSelection<T>
  ) =>
    left.consecutivePlayCount - right.consecutivePlayCount ||
    left.consecutivePlayMaxBurden - right.consecutivePlayMaxBurden ||
    left.consecutivePlayTotalBurden - right.consecutivePlayTotalBurden;
  const bestConsecutive = [...preferred].sort(compareConsecutive)[0];
  return preferred.filter(
    (candidate) => compareConsecutive(candidate, bestConsecutive) === 0
  );
}

function filterFairBatchRestPriority<T extends ActiveMatchmakerV3Player>(
  candidates: V3BatchSelection<T>[],
  respectPlayerRest: boolean
) {
  if (candidates.length < 2) return candidates;
  let preferred = [...candidates];
  const arrivalBaseline = [...preferred].sort((left, right) =>
    compareArrivalPriorityPlayers(
      left.selections.flatMap((selection) => selection.players),
      right.selections.flatMap((selection) => selection.players)
    )
  )[0];
  preferred = preferred.filter(
    (candidate) =>
      compareArrivalPriorityPlayers(
        candidate.selections.flatMap((selection) => selection.players),
        arrivalBaseline.selections.flatMap((selection) => selection.players)
      ) === 0
  );
  if (!respectPlayerRest || preferred.length < 2) return preferred;

  const getMoreRestDeficit = (candidate: V3BatchSelection<T>) =>
    candidate.selections
      .flatMap((selection) => selection.players)
      .reduce((sum, player) => sum + player.moreRestDeficit, 0);
  const minimumMoreRestDeficit = Math.min(...preferred.map(getMoreRestDeficit));
  preferred = preferred.filter(
    (candidate) => getMoreRestDeficit(candidate) === minimumMoreRestDeficit
  );
  if (preferred.length < 2) return preferred;

  const bestRest = [...preferred].sort((left, right) =>
    compareRestSummaries(left.restSummary, right.restSummary)
  )[0];
  preferred = preferred.filter(
    (candidate) => compareRestSummaries(candidate.restSummary, bestRest.restSummary) === 0
  );
  if (preferred.length < 2) return preferred;

  const getConsecutiveVector = (candidate: V3BatchSelection<T>) => {
    const selections = candidate.selections;
    return [
      selections.reduce((sum, selection) => sum + selection.consecutivePlayCount, 0),
      Math.max(0, ...selections.map((selection) => selection.consecutivePlayMaxBurden)),
      selections.reduce((sum, selection) => sum + selection.consecutivePlayTotalBurden, 0),
    ];
  };
  const compareConsecutive = (left: V3BatchSelection<T>, right: V3BatchSelection<T>) => {
    const leftVector = getConsecutiveVector(left);
    const rightVector = getConsecutiveVector(right);
    for (let index = 0; index < leftVector.length; index += 1) {
      if (leftVector[index] !== rightVector[index]) {
        return leftVector[index] - rightVector[index];
      }
    }
    return 0;
  };
  const bestConsecutive = [...preferred].sort(compareConsecutive)[0];
  return preferred.filter(
    (candidate) => compareConsecutive(candidate, bestConsecutive) === 0
  );
}

function hasSafeReplacementCounts<T extends MatchmakerV3Player>(
  deferred: ActiveMatchmakerV3Player<T>[],
  added: ActiveMatchmakerV3Player<T>[],
  outstandingMatchCountByUserId: ReadonlyMap<string, number> = new Map()
) {
  if (deferred.length !== added.length) return false;
  if (deferred.length === 0) return true;

  const tryAssign = (addedIndex: number, used: Set<number>): boolean => {
    if (addedIndex >= added.length) return true;
    const addedPlayer = added[addedIndex];
    if (!addedPlayer) return false;

    return deferred.some((deferredPlayer, deferredIndex) => {
      if (
        used.has(deferredIndex) ||
        getProjectedMatchCount(addedPlayer, outstandingMatchCountByUserId) >
          getProjectedMatchCount(deferredPlayer, outstandingMatchCountByUserId)
      ) {
        return false;
      }
      const nextUsed = new Set(used);
      nextUsed.add(deferredIndex);
      return tryAssign(addedIndex + 1, nextUsed);
    });
  };

  return tryAssign(0, new Set());
}

export function getBalancedMixedTrueConsecutiveStreaks(
  matches: V3CompletedMatch[]
) {
  const chronological = matches
    .map((match, index) => ({ match, index }))
    .sort((left, right) => {
      const leftTime = left.match.completedAt?.getTime();
      const rightTime = right.match.completedAt?.getTime();
      if (typeof leftTime === "number" && typeof rightTime === "number") {
        return leftTime - rightTime || left.index - right.index;
      }
      return left.index - right.index;
    });
  let previous = new Set<string>();
  let streakByUserId = new Map<string, number>();
  for (const { match } of chronological) {
    const current = new Set([
      ...match.team1,
      ...match.team2,
    ]);
    streakByUserId = new Map(
      [...current].map((userId) => [
        userId,
        previous.has(userId) ? (streakByUserId.get(userId) ?? 1) + 1 : 1,
      ])
    );
    previous = current;
  }
  return streakByUserId;
}

export function isBalancedMixedRotationBatchWithinBounds<T extends MatchmakerV3Player>({
  baselineSelections,
  candidateSelections,
  players,
  outstandingMatchCountByUserId = new Map(),
  completedMatches = [],
  pendingObligations = [],
  sessionType,
  respectPlayerRest,
}: {
  baselineSelections: readonly V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[];
  candidateSelections: readonly V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[];
  players: T[];
  outstandingMatchCountByUserId?: ReadonlyMap<string, number>;
  completedMatches?: V3CompletedMatch[];
  pendingObligations?: V3BalancedMixedRotationObligation[];
  sessionType: SessionType;
  respectPlayerRest: boolean;
}) {
  const getPlayers = (selections: readonly V3SingleCourtSelection[]) =>
    selections.flatMap((selection) => selection.players);
  const baselinePlayers = getPlayers(baselineSelections);
  const candidatePlayers = getPlayers(candidateSelections);
  const baselineIds = new Set(baselinePlayers.map((player) => player.userId));
  const candidateIds = new Set(candidatePlayers.map((player) => player.userId));
  const deferred = baselinePlayers.filter(
    (player) => !candidateIds.has(player.userId)
  );
  const added = candidatePlayers.filter(
    (player) => !baselineIds.has(player.userId)
  );
  const pendingPlayerIds = new Set(
    pendingObligations.map((obligation) => obligation.playerId)
  );
  if (
    !hasSafeReplacementCounts(
      deferred,
      added,
      outstandingMatchCountByUserId
    ) ||
    deferred.some((player) => pendingPlayerIds.has(player.userId)) ||
    (respectPlayerRest && added.some((player) => player.moreRestDeficit > 0))
  ) {
    return false;
  }

  const baselineArrivalIds = baselinePlayers
    .filter((player) => player.arrivalPriorityAt)
    .map((player) => player.userId);
  if (baselineArrivalIds.some((userId) => !candidateIds.has(userId))) {
    return false;
  }

  if (respectPlayerRest) {
    const streaks = getBalancedMixedTrueConsecutiveStreaks(completedMatches);
    if (
      added.some((player) => (streaks.get(player.userId) ?? 0) >= 2)
    ) {
      return false;
    }
  }

  if (
    !isBalancedMixedProjectedFairnessWithinBounds(
      players,
      candidatePlayers.map((player) => player.userId),
      outstandingMatchCountByUserId
    )
  ) {
    return false;
  }

  const baselineMaxBalanceGap = Math.max(
    0,
    ...baselineSelections.map((selection) => selection.balanceGap)
  );
  const candidateMaxBalanceGap = Math.max(
    0,
    ...candidateSelections.map((selection) => selection.balanceGap)
  );
  if (sessionType === SessionType.POINTS) {
    return (
      candidateMaxBalanceGap <=
      baselineMaxBalanceGap + POINTS_BALANCE_VARIETY_TOLERANCE
    );
  }
  if (sessionType === SessionType.ELO) {
    if (candidateMaxBalanceGap <= ELO_BALANCE_GAP_CEILING) return true;
    if (baselineMaxBalanceGap <= ELO_BALANCE_GAP_CEILING) return false;
    if (candidateMaxBalanceGap !== baselineMaxBalanceGap) {
      return candidateMaxBalanceGap < baselineMaxBalanceGap;
    }
    const baselineTotalBalanceGap = baselineSelections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    );
    const candidateTotalBalanceGap = candidateSelections.reduce(
      (sum, selection) => sum + selection.balanceGap,
      0
    );
    return candidateTotalBalanceGap <= baselineTotalBalanceGap;
  }
  return false;
}

function selectionIsSafe<T extends MatchmakerV3Player>(
  baseline: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  candidate: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  players: T[],
  respectPlayerRest: boolean,
  consecutiveStreakByUserId: Map<string, number>,
  outstandingMatchCountByUserId: ReadonlyMap<string, number>,
  pendingPlayerIds: ReadonlySet<string>,
  enforceProjectedFairness: boolean
) {
  const baselineIds = new Set(getSelectionIds(baseline));
  const candidateIds = new Set(getSelectionIds(candidate));
  const deferred = baseline.players.filter(
    (player) => !candidateIds.has(player.userId)
  );
  const added = candidate.players.filter(
    (player) => !baselineIds.has(player.userId)
  );
  if (deferred.some((player) => pendingPlayerIds.has(player.userId))) {
    return false;
  }

  if (
    !hasSafeReplacementCounts(
      deferred,
      added,
      outstandingMatchCountByUserId
    )
  ) {
    return false;
  }

  if (
    respectPlayerRest &&
    added.some((player) => player.moreRestDeficit > 0)
  ) {
    return false;
  }

  if (
    respectPlayerRest &&
    candidate.players.some(
      (player) =>
        (consecutiveStreakByUserId.get(player.userId) ?? 0) >= 2 &&
        !baselineIds.has(player.userId)
    )
  ) {
    return false;
  }

  if (!enforceProjectedFairness) return true;
  const baselineIsFair = isBalancedMixedProjectedFairnessWithinBounds(
    players,
    getSelectionIds(baseline),
    outstandingMatchCountByUserId
  );
  const urgentArrivalIds = baseline.players
    .filter((player) => player.arrivalPriorityAt)
    .map((player) => player.userId);
  if (
    baselineIsFair &&
    urgentArrivalIds.some((userId) => !candidateIds.has(userId))
  ) {
    return false;
  }

  return isBalancedMixedProjectedFairnessWithinBounds(
    players,
    getSelectionIds(candidate),
    outstandingMatchCountByUserId
  );
}

function selectionIsBalanceSafe<T extends MatchmakerV3Player>(
  candidate: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  candidates: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[],
  sessionType: SessionType
) {
  if (sessionType === SessionType.POINTS) {
    const bestGap = Math.min(...candidates.map((selection) => selection.balanceGap));
    return candidate.balanceGap <= bestGap + POINTS_BALANCE_VARIETY_TOLERANCE;
  }
  if (sessionType === SessionType.ELO) {
    const withinCeiling = candidates.filter(
      (selection) => selection.balanceGap <= ELO_BALANCE_GAP_CEILING
    );
    if (withinCeiling.length > 0) {
      return candidate.balanceGap <= ELO_BALANCE_GAP_CEILING;
    }
    return candidate.balanceGap === Math.min(
      ...candidates.map((selection) => selection.balanceGap)
    );
  }
  return false;
}

export function buildBalancedMixedSingleSelectionOverride<T extends MatchmakerV3Player>({
  players,
  mixedHistoryMatches,
  completedMatches,
  sessionMode,
  sessionType,
  respectPlayerRest,
  outstandingMatchCountByUserId = new Map(),
  pendingObligations = [],
  decisionId: suppliedDecisionId,
  timestamp: suppliedTimestamp,
  enforceProjectedFairness = true,
}: {
  players: T[];
  mixedHistoryMatches: V3MixedHistoryMatch[];
  completedMatches: V3CompletedMatch[];
  sessionMode: SessionMode;
  sessionType: SessionType;
  respectPlayerRest: boolean;
  outstandingMatchCountByUserId?: ReadonlyMap<string, number>;
  pendingObligations?: V3BalancedMixedRotationObligation[];
  decisionId?: string;
  timestamp?: string;
  alreadyDeferredPlayerIds?: string[];
  enforceProjectedFairness?: boolean;
}): V3SingleCourtSelectionOverride<ActiveMatchmakerV3Player<T>> | undefined {
  if (
    sessionMode !== SessionMode.MIXICANO ||
    (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO)
  ) {
    return undefined;
  }

  const context = buildMixedVarietyContext(players, mixedHistoryMatches);
  const consecutiveStreakByUserId =
    getBalancedMixedTrueConsecutiveStreaks(completedMatches);
  const decisionId = suppliedDecisionId ?? randomUUID();
  const timestamp = suppliedTimestamp ?? new Date().toISOString();
  const annotate = (
    selection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
    deferredPlayerIds: string[],
    fallbackReason?: string | null,
    servedPlayerIds: string[] = []
  ) => ({
    ...selection,
    balancedMixedRotation: buildRotationMetadata(
      context,
      getSelectionCategory(selection, context),
      deferredPlayerIds,
      {
        decisionId,
        timestamp,
        obligationOwner: true,
        fallbackReason,
        servedPlayerIds,
      }
    ),
  });
  const choose: V3SingleCourtSelectionOverride<ActiveMatchmakerV3Player<T>> = ({ baselineSelection, candidates }: {
    baselineSelection: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>;
    candidates: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>[];
  }) => {
    const uniqueCandidates = new Map<
      string,
      V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>
    >();
    for (const candidate of [baselineSelection, ...candidates]) {
      const key = [...candidate.ids].sort().join("|");
      const existing = uniqueCandidates.get(key);
      if (
        !existing ||
        compareSingleCourtSelections(candidate, existing, sessionType, {
          respectPlayerRest,
        }) < 0
      ) {
        uniqueCandidates.set(key, candidate);
      }
    }
    const allCandidates = [...uniqueCandidates.values()];
    const projectedFairCandidates = getProjectedFairCandidates(
      allCandidates,
      getSelectionIds,
      players,
      outstandingMatchCountByUserId,
      enforceProjectedFairness
    );
    const pendingPlayerIds = new Set(
      pendingObligations.map((obligation) => obligation.playerId)
    );
    const getKey = (selection: V3SingleCourtSelection) =>
      [...selection.ids].sort().join("|");
    const baselineKey = getKey(baselineSelection);
    const baselineHasBestProjectedCounts =
      enforceProjectedFairness &&
      projectedFairCandidates.some((candidate) => getKey(candidate) === baselineKey);
    const baselineIsSafeReference =
      !enforceProjectedFairness || baselineHasBestProjectedCounts;
    const safeProjectedCandidates = baselineIsSafeReference
      ? projectedFairCandidates.filter(
          (candidate) =>
            getKey(candidate) === baselineKey ||
            selectionIsSafe(
              baselineSelection,
              candidate,
              players,
              respectPlayerRest,
              consecutiveStreakByUserId,
              outstandingMatchCountByUserId,
              pendingPlayerIds,
              enforceProjectedFairness
            )
        )
      : projectedFairCandidates;
    const priorityFairCandidates = filterFairSingleRestPriority(
      safeProjectedCandidates,
      respectPlayerRest
    );
    const baselineBalanceCandidates = filterFairSingleBalance(
      priorityFairCandidates,
      sessionType
    );
    const fairnessBaseline =
      baselineBalanceCandidates.find(
        (candidate) => getKey(candidate) === baselineKey
      ) ??
      [...baselineBalanceCandidates].sort((left, right) =>
        compareBalancedMixedSingleCourtSelections(left, right, sessionType, {
          respectPlayerRest,
          leftCategoryPenalty: getCategoryPenalty(
            context,
            getSelectionCategories([left], context.sideByUserId)
          ),
          rightCategoryPenalty: getCategoryPenalty(
            context,
            getSelectionCategories([right], context.sideByUserId)
          ),
        })
      )[0];
    if (!fairnessBaseline) return V3_SELECTION_OVERRIDE_REJECTED;
    const safetyFilteredFairCandidates = projectedFairCandidates.filter(
      (candidate) => {
        if (getKey(candidate) === getKey(fairnessBaseline)) return true;
        if (
          !selectionIsSafe(
            fairnessBaseline,
            candidate,
            players,
            respectPlayerRest,
            consecutiveStreakByUserId,
            outstandingMatchCountByUserId,
            pendingPlayerIds,
            enforceProjectedFairness
          )
        ) return false;
        return true;
      }
    );
    const balanceSafeCandidates = filterFairSingleBalance(
      safetyFilteredFairCandidates,
      sessionType
    );
    const fairCandidates = balanceSafeCandidates;

    const eligible = fairCandidates.filter((candidate) => {
      if (candidate === fairnessBaseline) return true;
      return (
        selectionIsSafe(
          fairnessBaseline,
          candidate,
          players,
          respectPlayerRest,
          consecutiveStreakByUserId,
          outstandingMatchCountByUserId,
          pendingPlayerIds,
          enforceProjectedFairness
        ) &&
          selectionIsBalanceSafe(candidate, fairCandidates, sessionType)
      );
    });

    const fairnessTiedCandidates = eligible;
    const catchupPlayerId = pendingObligations.find((obligation) =>
      fairnessTiedCandidates.some((candidate) =>
        candidate.ids.includes(obligation.playerId)
      )
    )?.playerId;
    const catchupCandidates = catchupPlayerId
      ? fairnessTiedCandidates.filter((candidate) =>
          candidate.ids.includes(catchupPlayerId)
        )
      : fairnessTiedCandidates;

    const getSingleCategoryPenalty = (selection: V3SingleCourtSelection) =>
      getCategoryPenalty(
        context,
        getSelectionCategories([selection], context.sideByUserId)
      );
    const compareRotationCandidates = (
      left: V3SingleCourtSelection,
      right: V3SingleCourtSelection,
      includeRandom = true
    ) =>
      compareBalancedMixedSingleCourtSelections(
        left,
        right,
        sessionType,
        {
          respectPlayerRest,
          leftCategoryPenalty: getSingleCategoryPenalty(left),
          rightCategoryPenalty: getSingleCategoryPenalty(right),
          includeRandom,
        }
      );
    catchupCandidates.sort((left, right) => {
      if (enforceProjectedFairness) {
        const fairnessDiff = compareBalancedMixedProjectedCounts(
          getSelectionIds(left),
          getSelectionIds(right),
          players,
          outstandingMatchCountByUserId
        );
        if (fairnessDiff !== 0) return fairnessDiff;
      }
      const arrivalDiff = compareArrivalPriority(left, right);
      if (arrivalDiff !== 0) return arrivalDiff;
      return compareRotationCandidates(left, right);
    });

    const selected = catchupCandidates[0];
    if (!selected) {
      return annotate(fairnessBaseline, [], "NO_SAFE_IMPROVEMENT");
    }
    const improvesRotationPriority =
      compareRotationCandidates(selected, fairnessBaseline, false) < 0;
    const improvesFairness = enforceProjectedFairness &&
      compareBalancedMixedProjectedCounts(
        getSelectionIds(selected),
        getSelectionIds(fairnessBaseline),
        players,
        outstandingMatchCountByUserId
      ) < 0;
    const servedPlayerIds = pendingObligations
      .filter((obligation) => selected.ids.includes(obligation.playerId))
      .map((obligation) => obligation.playerId);
    if (
      !improvesRotationPriority &&
      !improvesFairness &&
      !servedPlayerIds.length
    ) {
      return annotate(fairnessBaseline, [], "NO_SAFE_IMPROVEMENT");
    }

    const selectedIds = new Set(selected.ids);
    const deferredPlayerIds = fairnessBaseline.ids.filter(
      (userId) => !selectedIds.has(userId)
    );
    return annotate(selected, deferredPlayerIds, null, servedPlayerIds);
  };
  choose.collectAllCandidatePools = true;
  return choose;
}

export function buildBalancedMixedBatchSelectionOverride<T extends MatchmakerV3Player>({
  players,
  mixedHistoryMatches,
  completedMatches = [],
  sessionMode,
  sessionType,
  respectPlayerRest,
  outstandingMatchCountByUserId = new Map(),
  pendingObligations = [],
  decisionId: suppliedDecisionId,
  timestamp: suppliedTimestamp,
  enforceProjectedFairness = true,
}: {
  players: T[];
  mixedHistoryMatches: V3MixedHistoryMatch[];
  completedMatches?: V3CompletedMatch[];
  sessionMode: SessionMode;
  sessionType: SessionType;
  respectPlayerRest: boolean;
  outstandingMatchCountByUserId?: ReadonlyMap<string, number>;
  pendingObligations?: V3BalancedMixedRotationObligation[];
  decisionId?: string;
  timestamp?: string;
  alreadyDeferredPlayerIds?: string[];
  enforceProjectedFairness?: boolean;
}): V3BatchSelectionOverride<ActiveMatchmakerV3Player<T>> | undefined {
  if (
    sessionMode !== SessionMode.MIXICANO ||
    (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO)
  ) {
    return undefined;
  }

  const context = buildMixedVarietyContext(players, mixedHistoryMatches);
  const consecutiveStreakByUserId =
    getBalancedMixedTrueConsecutiveStreaks(completedMatches);
  const decisionId = suppliedDecisionId ?? randomUUID();
  const timestamp = suppliedTimestamp ?? new Date().toISOString();
  const annotate = (
    selection: V3BatchSelection<ActiveMatchmakerV3Player<T>>,
    deferredPlayerIds: string[],
    fallbackReason?: string | null
  ): V3BatchSelection<ActiveMatchmakerV3Player<T>> => {
    const selectedIds = new Set(getBatchIds(selection));
    const servedPlayerIds = pendingObligations
      .filter((obligation) => selectedIds.has(obligation.playerId))
      .map((obligation) => obligation.playerId);
    return {
      ...selection,
      selections: selection.selections.map((match, index) => ({
        ...match,
        balancedMixedRotation: buildRotationMetadata(
          context,
          getSelectionCategory(match, context),
          deferredPlayerIds,
          {
            decisionId,
            timestamp,
            obligationOwner: index === 0,
            fallbackReason,
            servedPlayerIds,
          }
        ),
      })),
    };
  };
  return ({ baselineSelection, candidates, searchInterrupted = false }: {
    baselineSelection: V3BatchSelection<ActiveMatchmakerV3Player<T>>;
    candidates: V3BatchSelection<ActiveMatchmakerV3Player<T>>[];
    searchInterrupted?: boolean;
  }) => {
    const getCategoryScore = (selection: V3BatchSelection) =>
      getCategoryPenalty(
        context,
        getSelectionCategories(
          selection.selections,
          context.sideByUserId
        )
      );
    const uniqueCandidates = new Map<string, V3BatchSelection<ActiveMatchmakerV3Player<T>>>();
    for (const candidate of [baselineSelection, ...candidates]) {
      const key = candidate.selections
        .map((match) => [...match.ids].sort().join("|"))
        .sort()
        .join(";");
      const existing = uniqueCandidates.get(key);
      if (
        !existing ||
        compareBatchSelections(candidate, existing, sessionType, {
          respectPlayerRest,
        }) < 0
      ) {
        uniqueCandidates.set(key, candidate);
      }
    }
    const allCandidates = [...uniqueCandidates.values()];
    const projectedFairCandidates = getProjectedFairCandidates(
      allCandidates,
      getBatchIds,
      players,
      outstandingMatchCountByUserId,
      enforceProjectedFairness
    );
    const pendingPlayerIds = new Set(
      pendingObligations.map((obligation) => obligation.playerId)
    );
    const getKey = (selection: V3BatchSelection) =>
      selection.selections
        .map((match) => [...match.ids].sort().join("|"))
        .sort()
        .join(";");
    const baselineKey = getKey(baselineSelection);
    const baselineHasBestProjectedCounts =
      enforceProjectedFairness &&
      projectedFairCandidates.some((candidate) => getKey(candidate) === baselineKey);
    const baselineIsSafeReference =
      !enforceProjectedFairness || baselineHasBestProjectedCounts;
    const isSafeAlternative = (
      baseline: V3BatchSelection<ActiveMatchmakerV3Player<T>>,
      candidate: V3BatchSelection<ActiveMatchmakerV3Player<T>>
    ) => {
      const candidateIds = new Set(getBatchIds(candidate));
      const baselineIdSet = new Set(getBatchIds(baseline));
      const deferred = baseline.selections
        .flatMap((match) => match.players)
        .filter((player) => !candidateIds.has(player.userId));
      const added = candidate.selections
        .flatMap((match) => match.players)
        .filter((player) => !baselineIdSet.has(player.userId));
      if (
        !hasSafeReplacementCounts(
          deferred,
          added,
          outstandingMatchCountByUserId
        ) ||
        deferred.some((player) => pendingPlayerIds.has(player.userId))
      ) {
        return false;
      }
      const urgentArrivalIds = baseline.selections
        .flatMap((match) => match.players)
        .filter((player) => player.arrivalPriorityAt)
        .map((player) => player.userId);
      if (urgentArrivalIds.some((userId) => !candidateIds.has(userId))) return false;
      if (respectPlayerRest) {
        if (added.some((player) => player.moreRestDeficit > 0)) return false;
        if (
          candidate.selections
            .flatMap((match) => match.players)
            .some(
              (player) =>
                (consecutiveStreakByUserId.get(player.userId) ?? 0) >= 2 &&
                !baselineIdSet.has(player.userId)
            )
        ) return false;
      }
      return true;
    };
    const safeProjectedCandidates = baselineIsSafeReference
      ? projectedFairCandidates.filter(
          (candidate) =>
            getKey(candidate) === baselineKey ||
            isSafeAlternative(baselineSelection, candidate)
        )
      : projectedFairCandidates;
    const priorityFairCandidates = filterFairBatchRestPriority(
      safeProjectedCandidates,
      respectPlayerRest
    );
    const baselineBalanceCandidates = filterFairBatchBalance(
      priorityFairCandidates,
      sessionType
    );
    const fairnessBaseline =
      baselineBalanceCandidates.find(
        (candidate) => getKey(candidate) === baselineKey
      ) ??
      [...baselineBalanceCandidates].sort((left, right) =>
        compareBalancedMixedBatchSelections(left, right, sessionType, {
          respectPlayerRest,
          leftCategoryPenalty: getCategoryScore(left),
          rightCategoryPenalty: getCategoryScore(right),
        })
      )[0];
    if (!fairnessBaseline) return V3_SELECTION_OVERRIDE_REJECTED;
    const safetyFilteredFairCandidates = projectedFairCandidates.filter(
      (candidate) =>
        getKey(candidate) === getKey(fairnessBaseline) ||
        isSafeAlternative(fairnessBaseline, candidate)
    );
    const balanceSafeAlternatives = filterFairBatchBalance(
      safetyFilteredFairCandidates,
      sessionType
    );
    const eligibleFairCandidates = balanceSafeAlternatives;
    const fairnessBaselineIds = getBatchIds(fairnessBaseline);
    const eligible = eligibleFairCandidates.filter((candidate) => {
      const candidateIds = new Set(getBatchIds(candidate));
      const baselineIdSet = new Set(fairnessBaselineIds);
      if (candidate === fairnessBaseline) return true;
      const deferred = fairnessBaseline.selections.flatMap((match) => match.players)
        .filter((player) => !candidateIds.has(player.userId));
      const added = candidate.selections.flatMap((match) => match.players)
        .filter((player) => !baselineIdSet.has(player.userId));
      if (
        !hasSafeReplacementCounts(
          deferred,
          added,
          outstandingMatchCountByUserId
        )
      ) return false;
      if (deferred.some((player) => pendingPlayerIds.has(player.userId))) return false;
      const urgentArrivalIds = fairnessBaseline.selections
        .flatMap((match) => match.players)
        .filter((player) => player.arrivalPriorityAt)
        .map((player) => player.userId);
      if (urgentArrivalIds.some((userId) => !candidateIds.has(userId))) return false;
      if (respectPlayerRest) {
        const candidateAdded = candidate.selections
          .flatMap((match) => match.players)
          .filter((player) => !baselineIdSet.has(player.userId));
        if (candidateAdded.some((player) => player.moreRestDeficit > 0)) return false;
        if (
          candidate.selections
            .flatMap((match) => match.players)
            .some(
              (player) =>
                (consecutiveStreakByUserId.get(player.userId) ?? 0) >= 2 &&
                !baselineIdSet.has(player.userId)
            )
        ) return false;
      }
      return true;
    });
    const sortedByFairness = [...eligible].sort((left, right) =>
      enforceProjectedFairness
        ? compareBalancedMixedProjectedCounts(
            getBatchIds(left),
            getBatchIds(right),
            players,
            outstandingMatchCountByUserId
          )
        : 0
    );
    const bestFairnessCandidate = sortedByFairness[0];
    const fairnessTiedCandidates = bestFairnessCandidate
      ? sortedByFairness.filter(
          (candidate) =>
            !enforceProjectedFairness ||
            compareBalancedMixedProjectedCounts(
              getBatchIds(candidate),
              getBatchIds(bestFairnessCandidate),
              players,
              outstandingMatchCountByUserId
            ) === 0
        )
      : [];
    const catchupPlayerId = pendingObligations.find((obligation) =>
      fairnessTiedCandidates.some((candidate) =>
        getBatchIds(candidate).includes(obligation.playerId)
      )
    )?.playerId;
    const catchupCandidates = catchupPlayerId
      ? fairnessTiedCandidates.filter((candidate) =>
          getBatchIds(candidate).includes(catchupPlayerId)
        )
      : fairnessTiedCandidates;
    catchupCandidates.sort((left, right) => {
      return compareBalancedMixedBatchSelections(left, right, sessionType, {
        respectPlayerRest,
        leftCategoryPenalty: getCategoryScore(left),
        rightCategoryPenalty: getCategoryScore(right),
      });
    });
    const selected = catchupCandidates[0];
    if (!selected) {
      return annotate(
        fairnessBaseline,
        [],
        searchInterrupted ? "SEARCH_BUDGET" : "NO_SAFE_IMPROVEMENT"
      );
    }
    const improvesRotationPriority =
      compareBalancedMixedBatchSelections(
        selected,
        fairnessBaseline,
        sessionType,
        {
          respectPlayerRest,
          leftCategoryPenalty: getCategoryScore(selected),
          rightCategoryPenalty: getCategoryScore(fairnessBaseline),
          includeRandom: false,
        }
      ) < 0;
    const improvesFairness = enforceProjectedFairness &&
      compareBalancedMixedProjectedCounts(
        getBatchIds(selected),
        fairnessBaselineIds,
        players,
        outstandingMatchCountByUserId
      ) < 0;
    const selectedIds = new Set(getBatchIds(selected));
    const servedPlayerIds = pendingObligations
      .filter((obligation) => selectedIds.has(obligation.playerId))
      .map((obligation) => obligation.playerId);
    if (improvesRotationPriority ||
      servedPlayerIds.length > 0 ||
      improvesFairness) {
      const deferredPlayerIds = fairnessBaselineIds.filter(
        (userId) => !selectedIds.has(userId)
      );
      return annotate(selected, deferredPlayerIds);
    }
    return annotate(
      fairnessBaseline,
      [],
      searchInterrupted ? "SEARCH_BUDGET" : "NO_SAFE_IMPROVEMENT"
    );
  };
}
