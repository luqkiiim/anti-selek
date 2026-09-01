import {
  getNormalizedSessionPool,
  getSessionCrossoverTarget,
} from "@/lib/sessionPools";
import { CourtGroupType, SessionPool } from "@/types/enums";

export interface PlayerGroupCourtComposition {
  courtGroupType: CourtGroupType;
  poolASeatCount: number;
  poolBSeatCount: number;
}

export interface PlayerGroupHistorySnapshot {
  courtGroupType?: CourtGroupType | string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
}

export interface PlayerGroupCourtPlan {
  compositions: PlayerGroupCourtComposition[];
  filledCourtCount: number;
  overflowCourtCount: number;
  crossoverCourtCount: number;
  crossoverShortfall: number;
  crossoverExcess: number;
  cadenceViolationCount: number;
  projectedCompetitiveSeatShare: number;
  competitiveTargetRatio: number;
  ratioError: number;
}

export interface PlayerGroupPlannerInput {
  requestedCourtCount: number;
  activePoolAPlayerCount: number;
  activePoolBPlayerCount: number;
  waitingPoolAPlayerCount: number;
  waitingPoolBPlayerCount: number;
  history?: readonly PlayerGroupHistorySnapshot[];
  crossoverFrequency?: unknown;
}

type GroupPlayer = {
  userId: string;
  pool?: SessionPool | string | null;
};

type GroupPartition = {
  team1: [string, string];
  team2: [string, string];
};

const COMPOSITION_OPTIONS: readonly PlayerGroupCourtComposition[] = [
  {
    courtGroupType: CourtGroupType.COMPETITIVE,
    poolASeatCount: 4,
    poolBSeatCount: 0,
  },
  {
    courtGroupType: CourtGroupType.SOCIAL,
    poolASeatCount: 0,
    poolBSeatCount: 4,
  },
  {
    courtGroupType: CourtGroupType.CROSSOVER,
    poolASeatCount: 2,
    poolBSeatCount: 2,
  },
  {
    courtGroupType: CourtGroupType.OPEN_OVERFLOW,
    poolASeatCount: 1,
    poolBSeatCount: 3,
  },
  {
    courtGroupType: CourtGroupType.OPEN_OVERFLOW,
    poolASeatCount: 2,
    poolBSeatCount: 2,
  },
  {
    courtGroupType: CourtGroupType.OPEN_OVERFLOW,
    poolASeatCount: 3,
    poolBSeatCount: 1,
  },
] as const;

function clampCount(value: number) {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function isCountedSnapshot(
  snapshot: PlayerGroupHistorySnapshot
): snapshot is PlayerGroupHistorySnapshot & {
  poolASeatCount: number;
  poolBSeatCount: number;
} {
  return (
    Number.isInteger(snapshot.poolASeatCount) &&
    Number.isInteger(snapshot.poolBSeatCount) &&
    snapshot.poolASeatCount! >= 0 &&
    snapshot.poolBSeatCount! >= 0 &&
    snapshot.poolASeatCount! + snapshot.poolBSeatCount! === 4
  );
}

function isCrossoverType(value: unknown) {
  return value === CourtGroupType.CROSSOVER;
}

function getHistorySummary(history: readonly PlayerGroupHistorySnapshot[]) {
  const counted = history.filter(isCountedSnapshot);

  return {
    poolASeats: counted.reduce(
      (total, snapshot) => total + snapshot.poolASeatCount,
      0
    ),
    poolBSeats: counted.reduce(
      (total, snapshot) => total + snapshot.poolBSeatCount,
      0
    ),
    matchCount: counted.length,
    crossoverCount: counted.filter((snapshot) =>
      isCrossoverType(snapshot.courtGroupType)
    ).length,
  };
}

function compositionKey(composition: PlayerGroupCourtComposition) {
  return `${composition.courtGroupType}:${composition.poolASeatCount}`;
}

function getStableCompositionRank(composition: PlayerGroupCourtComposition) {
  switch (composition.courtGroupType) {
    case CourtGroupType.COMPETITIVE:
      return 0;
    case CourtGroupType.SOCIAL:
      return 1;
    case CourtGroupType.CROSSOVER:
      return 2;
    case CourtGroupType.OPEN_OVERFLOW:
      return 3 + composition.poolASeatCount;
  }
}

function orderCompositions({
  compositions,
  historyMatchCount,
  historyCrossoverCount,
  crossoverTarget,
  historyPoolASeats,
  historyPoolBSeats,
  targetRatio,
}: {
  compositions: readonly PlayerGroupCourtComposition[];
  historyMatchCount: number;
  historyCrossoverCount: number;
  crossoverTarget: { numerator: number; denominator: number };
  historyPoolASeats: number;
  historyPoolBSeats: number;
  targetRatio: number;
}) {
  const remaining = [...compositions];
  const ordered: PlayerGroupCourtComposition[] = [];
  let cadenceViolationCount = 0;
  let allocatedPoolASeats = 0;
  let allocatedPoolBSeats = 0;
  let allocatedCrossoverCount = 0;

  while (remaining.length > 0) {
    const projectedMatchCount = historyMatchCount + ordered.length + 1;
    const desiredCrossoverCount = Math.floor(
      (projectedMatchCount * crossoverTarget.numerator) /
        crossoverTarget.denominator
    );
    const crossoverDue =
      historyCrossoverCount + allocatedCrossoverCount <
      desiredCrossoverCount;
    const hasPlannedCrossover = remaining.some(
      (composition) =>
        composition.courtGroupType === CourtGroupType.CROSSOVER
    );
    const candidateIndexes = remaining
      .map((_, index) => index)
      .filter(
        (index) =>
          !crossoverDue ||
          !hasPlannedCrossover ||
          remaining[index].courtGroupType === CourtGroupType.CROSSOVER
      );

    candidateIndexes.sort((leftIndex, rightIndex) => {
      const left = remaining[leftIndex];
      const right = remaining[rightIndex];
      const existingSeatCount =
        historyPoolASeats +
        historyPoolBSeats +
        allocatedPoolASeats +
        allocatedPoolBSeats;
      const leftShare =
        (historyPoolASeats + allocatedPoolASeats + left.poolASeatCount) /
        (existingSeatCount + 4);
      const rightShare =
        (historyPoolASeats + allocatedPoolASeats + right.poolASeatCount) /
        (existingSeatCount + 4);
      const ratioComparison =
        Math.abs(leftShare - targetRatio) -
        Math.abs(rightShare - targetRatio);

      if (Math.abs(ratioComparison) > Number.EPSILON) {
        return ratioComparison;
      }

      return getStableCompositionRank(left) - getStableCompositionRank(right);
    });

    const selectedIndex = candidateIndexes[0];
    const [selected] = remaining.splice(selectedIndex, 1);

    if (
      crossoverDue &&
      selected.courtGroupType !== CourtGroupType.CROSSOVER
    ) {
      cadenceViolationCount += 1;
    }

    ordered.push(selected);
    allocatedPoolASeats += selected.poolASeatCount;
    allocatedPoolBSeats += selected.poolBSeatCount;
    if (selected.courtGroupType === CourtGroupType.CROSSOVER) {
      allocatedCrossoverCount += 1;
    }
  }

  return { ordered, cadenceViolationCount };
}

function comparePlans(left: PlayerGroupCourtPlan, right: PlayerGroupCourtPlan) {
  if (left.filledCourtCount !== right.filledCourtCount) {
    return right.filledCourtCount - left.filledCourtCount;
  }
  if (left.overflowCourtCount !== right.overflowCourtCount) {
    return left.overflowCourtCount - right.overflowCourtCount;
  }
  if (left.crossoverShortfall !== right.crossoverShortfall) {
    return left.crossoverShortfall - right.crossoverShortfall;
  }
  if (left.crossoverExcess !== right.crossoverExcess) {
    return left.crossoverExcess - right.crossoverExcess;
  }
  if (Math.abs(left.ratioError - right.ratioError) > Number.EPSILON) {
    return left.ratioError - right.ratioError;
  }

  return left.compositions
    .map(compositionKey)
    .join("|")
    .localeCompare(right.compositions.map(compositionKey).join("|"));
}

/**
 * Returns every count-feasible composition plan in matchmaking priority order.
 * Player legality (including Mixed pairing) is intentionally checked later by
 * the court matcher, allowing the caller to fall through to the next plan.
 */
export function buildPlayerGroupCourtPlans({
  requestedCourtCount,
  activePoolAPlayerCount,
  activePoolBPlayerCount,
  waitingPoolAPlayerCount,
  waitingPoolBPlayerCount,
  history = [],
  crossoverFrequency,
}: PlayerGroupPlannerInput): PlayerGroupCourtPlan[] {
  const waitingPoolASeats = clampCount(waitingPoolAPlayerCount);
  const waitingPoolBSeats = clampCount(waitingPoolBPlayerCount);
  const maxCourtCount = Math.min(
    clampCount(requestedCourtCount),
    Math.floor((waitingPoolASeats + waitingPoolBSeats) / 4)
  );
  if (maxCourtCount === 0) {
    return [];
  }

  const activePoolACount = clampCount(activePoolAPlayerCount);
  const activePoolBCount = clampCount(activePoolBPlayerCount);
  const activePlayerCount = activePoolACount + activePoolBCount;
  const competitiveTargetRatio =
    activePlayerCount > 0 ? activePoolACount / activePlayerCount : 0.5;
  const historySummary = getHistorySummary(history);
  const crossoverTarget = getSessionCrossoverTarget(crossoverFrequency);
  const plans: PlayerGroupCourtPlan[] = [];
  const optionCounts = Array(COMPOSITION_OPTIONS.length).fill(0) as number[];

  const visitOptionCounts = (optionIndex: number, courtsRemaining: number) => {
    if (optionIndex === COMPOSITION_OPTIONS.length - 1) {
      optionCounts[optionIndex] = courtsRemaining;
      const compositions = COMPOSITION_OPTIONS.flatMap((composition, index) =>
        Array.from({ length: optionCounts[index] }, () => composition)
      );
      const poolASeatCount = compositions.reduce(
        (total, composition) => total + composition.poolASeatCount,
        0
      );
      const poolBSeatCount = compositions.length * 4 - poolASeatCount;

      if (
        poolASeatCount > waitingPoolASeats ||
        poolBSeatCount > waitingPoolBSeats
      ) {
        return;
      }

      const { ordered, cadenceViolationCount } = orderCompositions({
        compositions,
        historyMatchCount: historySummary.matchCount,
        historyCrossoverCount: historySummary.crossoverCount,
        crossoverTarget,
        historyPoolASeats: historySummary.poolASeats,
        historyPoolBSeats: historySummary.poolBSeats,
        targetRatio: competitiveTargetRatio,
      });
      const totalPoolASeats = historySummary.poolASeats + poolASeatCount;
      const totalSeatCount =
        historySummary.poolASeats +
        historySummary.poolBSeats +
        compositions.length * 4;
      const projectedCompetitiveSeatShare =
        totalSeatCount > 0 ? totalPoolASeats / totalSeatCount : 0;
      const crossoverCourtCount = compositions.filter(
        (composition) =>
          composition.courtGroupType === CourtGroupType.CROSSOVER
      ).length;
      const desiredCrossoverCount = Math.floor(
        ((historySummary.matchCount + compositions.length) *
          crossoverTarget.numerator) /
          crossoverTarget.denominator
      );
      const projectedCrossoverCount =
        historySummary.crossoverCount + crossoverCourtCount;

      plans.push({
        compositions: ordered,
        filledCourtCount: compositions.length,
        overflowCourtCount: compositions.filter(
          (composition) =>
            composition.courtGroupType === CourtGroupType.OPEN_OVERFLOW
        ).length,
        crossoverCourtCount,
        crossoverShortfall: Math.max(
          0,
          desiredCrossoverCount - projectedCrossoverCount
        ),
        crossoverExcess: Math.max(
          0,
          projectedCrossoverCount - desiredCrossoverCount
        ),
        cadenceViolationCount,
        projectedCompetitiveSeatShare,
        competitiveTargetRatio,
        ratioError: Math.abs(
          projectedCompetitiveSeatShare - competitiveTargetRatio
        ),
      });
      return;
    }

    for (let count = 0; count <= courtsRemaining; count += 1) {
      optionCounts[optionIndex] = count;
      visitOptionCounts(optionIndex + 1, courtsRemaining - count);
    }
  };

  for (let courtCount = maxCourtCount; courtCount >= 1; courtCount -= 1) {
    optionCounts.fill(0);
    visitOptionCounts(0, courtCount);
  }

  return plans.sort(comparePlans);
}

export function getPlayerGroupSelectionConstraints<T extends GroupPlayer>(
  composition: PlayerGroupCourtComposition
) {
  return {
    isQuartetAllowed(players: [T, T, T, T]) {
      const poolASeatCount = players.filter(
        (player) =>
          getNormalizedSessionPool(player.pool) === SessionPool.A
      ).length;

      return poolASeatCount === composition.poolASeatCount;
    },
    normalizePartition({
      partition,
      playersById,
    }: {
      partition: GroupPartition;
      players: [T, T, T, T];
      playersById: Map<string, T>;
    }): GroupPartition | null {
      if (
        composition.courtGroupType !== CourtGroupType.CROSSOVER &&
        !(
          composition.courtGroupType === CourtGroupType.OPEN_OVERFLOW &&
          composition.poolASeatCount === 2
        )
      ) {
        return partition;
      }

      const isMixedGroupTeam = (team: [string, string]) => {
        const firstPool = getNormalizedSessionPool(
          playersById.get(team[0])?.pool
        );
        const secondPool = getNormalizedSessionPool(
          playersById.get(team[1])?.pool
        );
        return firstPool !== secondPool;
      };

      const isCrossoverPartition =
        isMixedGroupTeam(partition.team1) &&
        isMixedGroupTeam(partition.team2);

      return composition.courtGroupType === CourtGroupType.CROSSOVER
        ? isCrossoverPartition
          ? partition
          : null
        : isCrossoverPartition
          ? null
          : partition;
    },
  };
}
