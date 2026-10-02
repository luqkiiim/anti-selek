import { SessionMode, SessionType } from "../../../types/enums";
import {
  buildMixedVarietyContext,
  getMixedMatchClassification,
} from "./mixedVariety";
import {
  compareBatchSelections,
  compareSingleCourtSelections,
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
import type { V3MixedHistoryMatch } from "./mixedVariety";
import {
  parseBalancedMixedRotationMetadata,
  parseMatchmakingReasonJson,
} from "../matchReason";

const SCORE_EPSILON = 1e-9;

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

function hasSafeReplacementCounts<T extends MatchmakerV3Player>(
  deferred: ActiveMatchmakerV3Player<T>[],
  added: ActiveMatchmakerV3Player<T>[]
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
        addedPlayer.effectiveMatchCount > deferredPlayer.effectiveMatchCount + 1
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

function getTrueConsecutiveStreaks(matches: V3CompletedMatch[]) {
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
    deferred.length > 2 ||
    !hasSafeReplacementCounts(deferred, added) ||
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
    const streaks = getTrueConsecutiveStreaks(completedMatches);
    if (
      added.some((player) => (streaks.get(player.userId) ?? 0) >= 2)
    ) {
      return false;
    }
  }

  const baselineSpread = getProjectedSpread(
    players,
    baselinePlayers.map((player) => player.userId),
    outstandingMatchCountByUserId
  );
  const candidateSpread = getProjectedSpread(
    players,
    candidatePlayers.map((player) => player.userId),
    outstandingMatchCountByUserId
  );
  if (candidateSpread > Math.max(2, baselineSpread)) return false;

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
  return (
    sessionType === SessionType.ELO &&
    candidateMaxBalanceGap <= ELO_BALANCE_GAP_CEILING
  );
}

function selectionIsSafe<T extends MatchmakerV3Player>(
  baseline: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  candidate: V3SingleCourtSelection<ActiveMatchmakerV3Player<T>>,
  players: T[],
  respectPlayerRest: boolean,
  maxProjectedSpread: number,
  consecutiveStreakByUserId: Map<string, number>,
  outstandingMatchCountByUserId: ReadonlyMap<string, number>,
  pendingPlayerIds: ReadonlySet<string>
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

  if (deferred.length > 2 || !hasSafeReplacementCounts(deferred, added)) {
    return false;
  }

  const urgentArrivalIds = baseline.players
    .filter((player) => player.arrivalPriorityAt)
    .map((player) => player.userId);
  if (urgentArrivalIds.some((userId) => !candidateIds.has(userId))) {
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

  return (
    getProjectedSpread(
      players,
      getSelectionIds(candidate),
      outstandingMatchCountByUserId
    ) <= maxProjectedSpread
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
    return candidate.balanceGap <= ELO_BALANCE_GAP_CEILING;
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
  alreadyDeferredPlayerIds = [],
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
}): V3SingleCourtSelectionOverride<ActiveMatchmakerV3Player<T>> | undefined {
  if (
    sessionMode !== SessionMode.MIXICANO ||
    (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO)
  ) {
    return undefined;
  }

  const context = buildMixedVarietyContext(players, mixedHistoryMatches);
  const consecutiveStreakByUserId = getTrueConsecutiveStreaks(completedMatches);
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
  return ({ baselineSelection, candidates }: {
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
    const baselineSpread = getProjectedSpread(
      players,
      getSelectionIds(baselineSelection),
      outstandingMatchCountByUserId
    );
    const maxProjectedSpread = Math.max(2, baselineSpread);
    const baselinePersonalPenalty = baselineSelection.mixedVarietyPenalty ?? 0;
    const baselineCategoryPenalty = getCategoryPenalty(
      context,
      getSelectionCategories([baselineSelection], context.sideByUserId)
    );

    const pendingPlayerIds = new Set(
      pendingObligations.map((obligation) => obligation.playerId)
    );
    const eligible = allCandidates.filter(
      (candidate) =>
        candidate === baselineSelection ||
        (selectionIsSafe(
          baselineSelection,
          candidate,
          players,
          respectPlayerRest,
          maxProjectedSpread,
          consecutiveStreakByUserId,
          outstandingMatchCountByUserId,
          pendingPlayerIds
        ) &&
          baselineSelection.ids.filter((userId) => !candidate.ids.includes(userId)).length +
            alreadyDeferredPlayerIds.length <= 2 &&
          selectionIsBalanceSafe(candidate, allCandidates, sessionType))
    );

    const catchupPlayerId = pendingObligations.find((obligation) =>
      eligible.some((candidate) => candidate.ids.includes(obligation.playerId))
    )?.playerId;
    const catchupCandidates = catchupPlayerId
      ? eligible.filter((candidate) => candidate.ids.includes(catchupPlayerId))
      : eligible;

    catchupCandidates.sort((left, right) => {
      const personalDiff =
        (left.mixedVarietyPenalty ?? 0) - (right.mixedVarietyPenalty ?? 0);
      if (Math.abs(personalDiff) > SCORE_EPSILON) return personalDiff;
      const categoryDiff =
        getCategoryPenalty(
          context,
          getSelectionCategories([left], context.sideByUserId)
        ) -
        getCategoryPenalty(
          context,
          getSelectionCategories([right], context.sideByUserId)
        );
      if (Math.abs(categoryDiff) > SCORE_EPSILON) return categoryDiff;
      return compareSingleCourtSelections(left, right, sessionType, {
        respectPlayerRest,
      });
    });

    const selected = catchupCandidates[0];
    if (!selected) return null;
    const selectedPersonalPenalty = selected.mixedVarietyPenalty ?? 0;
    const selectedCategoryPenalty = getCategoryPenalty(
      context,
      getSelectionCategories([selected], context.sideByUserId)
    );
    const improvesComposition =
      selectedPersonalPenalty < baselinePersonalPenalty - SCORE_EPSILON ||
      (Math.abs(selectedPersonalPenalty - baselinePersonalPenalty) <=
        SCORE_EPSILON &&
        selectedCategoryPenalty < baselineCategoryPenalty - SCORE_EPSILON);
    const servedPlayerIds = pendingObligations
      .filter((obligation) => selected.ids.includes(obligation.playerId))
      .map((obligation) => obligation.playerId);
    if (!improvesComposition && !servedPlayerIds.length) {
      return annotate(baselineSelection, [], "NO_SAFE_IMPROVEMENT");
    }

    const selectedIds = new Set(selected.ids);
    const deferredPlayerIds = baselineSelection.ids.filter(
      (userId) => !selectedIds.has(userId)
    );
    return annotate(selected, deferredPlayerIds, null, servedPlayerIds);
  };
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
  alreadyDeferredPlayerIds = [],
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
}): V3BatchSelectionOverride<ActiveMatchmakerV3Player<T>> | undefined {
  if (
    sessionMode !== SessionMode.MIXICANO ||
    (sessionType !== SessionType.POINTS && sessionType !== SessionType.ELO)
  ) {
    return undefined;
  }

  const context = buildMixedVarietyContext(players, mixedHistoryMatches);
  const consecutiveStreakByUserId = getTrueConsecutiveStreaks(completedMatches);
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
    if (searchInterrupted) {
      return annotate(baselineSelection, [], "SEARCH_BUDGET");
    }
    const baselineIds = getBatchIds(baselineSelection);
    const baseSpread = getProjectedSpread(
      players,
      baselineIds,
      outstandingMatchCountByUserId
    );
    const maxSpread = Math.max(2, baseSpread);
    const getPersonalPenalty = (selection: V3BatchSelection<ActiveMatchmakerV3Player<T>>) =>
      selection.totalMixedVarietyPenalty ?? 0;
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
    const pendingPlayerIds = new Set(
      pendingObligations.map((obligation) => obligation.playerId)
    );
    const bestBalance = Math.min(...allCandidates.map((selection) => selection.maxBalanceGap));
    const eligible = allCandidates.filter((candidate) => {
      const candidateIds = new Set(getBatchIds(candidate));
      const baselineIdSet = new Set(baselineIds);
      const deferred = baselineSelection.selections.flatMap((match) => match.players)
        .filter((player) => !candidateIds.has(player.userId));
      const added = candidate.selections.flatMap((match) => match.players)
        .filter((player) => !baselineIdSet.has(player.userId));
      if (
        deferred.length + alreadyDeferredPlayerIds.length > 2 ||
        !hasSafeReplacementCounts(deferred, added)
      ) return false;
      if (deferred.some((player) => pendingPlayerIds.has(player.userId))) return false;
      if (
        getProjectedSpread(
          players,
          getBatchIds(candidate),
          outstandingMatchCountByUserId
        ) > maxSpread
      ) return false;
      const urgentArrivalIds = baselineSelection.selections
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
      if (sessionType === SessionType.POINTS) {
        return candidate.maxBalanceGap <= bestBalance + POINTS_BALANCE_VARIETY_TOLERANCE;
      }
      return candidate.maxBalanceGap <= ELO_BALANCE_GAP_CEILING;
    });
    const catchupPlayerId = pendingObligations.find((obligation) =>
      eligible.some((candidate) => getBatchIds(candidate).includes(obligation.playerId))
    )?.playerId;
    const catchupCandidates = catchupPlayerId
      ? eligible.filter((candidate) => getBatchIds(candidate).includes(catchupPlayerId))
      : eligible;
    catchupCandidates.sort((left, right) => {
      const personalDiff = getPersonalPenalty(left) - getPersonalPenalty(right);
      if (Math.abs(personalDiff) > SCORE_EPSILON) return personalDiff;
      const categoryDiff = getCategoryScore(left) - getCategoryScore(right);
      if (Math.abs(categoryDiff) > SCORE_EPSILON) return categoryDiff;
      return compareBatchSelections(left, right, sessionType, {
        respectPlayerRest,
      });
    });
    const selected = catchupCandidates[0];
    if (!selected) {
      return annotate(baselineSelection, [], "NO_SAFE_IMPROVEMENT");
    }
    const selectedPersonalPenalty = getPersonalPenalty(selected);
    const baselinePersonalPenalty = getPersonalPenalty(baselineSelection);
    const selectedCategoryPenalty = getCategoryScore(selected);
    const baselineCategoryPenalty = getCategoryScore(baselineSelection);
    const selectedIds = new Set(getBatchIds(selected));
    const servedPlayerIds = pendingObligations
      .filter((obligation) => selectedIds.has(obligation.playerId))
      .map((obligation) => obligation.playerId);
    if (selectedPersonalPenalty < baselinePersonalPenalty - SCORE_EPSILON ||
      (Math.abs(selectedPersonalPenalty - baselinePersonalPenalty) <= SCORE_EPSILON &&
        selectedCategoryPenalty < baselineCategoryPenalty - SCORE_EPSILON) ||
      servedPlayerIds.length > 0) {
      const deferredPlayerIds = baselineIds.filter(
        (userId) => !selectedIds.has(userId)
      );
      return annotate(selected, deferredPlayerIds);
    }
    return annotate(baselineSelection, [], "NO_SAFE_IMPROVEMENT");
  };
}
