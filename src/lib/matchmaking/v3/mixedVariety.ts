import { getEffectiveMixedSide } from "@/lib/mixedSide";

import type { MatchmakerV3Player, V3DoublesPartition } from "./types";

export type V3MixedHistoryMatch = {
  team1: [string, string];
  team2: [string, string];
};

export interface V3MixedVarietyContext {
  sideByUserId: Map<string, string | null>;
  targetMixedRateByUserId: Map<string, number>;
  matchCountByUserId: Map<string, number>;
  mixedMatchCountByUserId: Map<string, number>;
  targetMixedGameRate: number;
  classifiableMatchCount: number;
  mixedGameCount: number;
  upperSameSideGameCount: number;
  lowerSameSideGameCount: number;
  targetUpperSameSideRate: number;
  targetLowerSameSideRate: number;
}

function isOneFromEachSide(
  userIds: [string, string],
  sideByUserId: Map<string, string | null>
) {
  const firstSide = sideByUserId.get(userIds[0]);
  const secondSide = sideByUserId.get(userIds[1]);

  return (
    (firstSide === "UPPER" && secondSide === "LOWER") ||
    (firstSide === "LOWER" && secondSide === "UPPER")
  );
}

export function isMixedPartitionForSides(
  partition: V3DoublesPartition,
  sideByUserId: Map<string, string | null>
) {
  return (
    isOneFromEachSide(partition.team1, sideByUserId) &&
    isOneFromEachSide(partition.team2, sideByUserId)
  );
}

function getMixedSideCounts(players: MatchmakerV3Player[]) {
  const sideByUserId = new Map(
    players.map((player) => [
      player.userId,
      getEffectiveMixedSide({
        gender: player.gender,
        mixedSideOverride: player.mixedSideOverride,
        partnerPreference: player.partnerPreference,
      }),
    ])
  );
  let upperCount = 0;
  let lowerCount = 0;

  for (const player of players) {
    if (player.isPaused) {
      continue;
    }

    const side = sideByUserId.get(player.userId);
    if (side === "UPPER") upperCount += 1;
    if (side === "LOWER") lowerCount += 1;
  }

  return { sideByUserId, upperCount, lowerCount };
}

function getTargetMixedRates(upperCount: number, lowerCount: number) {
  if (upperCount < 2 || lowerCount < 2) {
    return { upperRate: 0, lowerRate: 0 };
  }

  if (upperCount < 4 && lowerCount < 4) {
    return { upperRate: 1, lowerRate: 1 };
  }

  if (upperCount < 4) {
    return {
      upperRate: 1,
      lowerRate: upperCount / lowerCount,
    };
  }

  if (lowerCount < 4) {
    return {
      upperRate: lowerCount / upperCount,
      lowerRate: 1,
    };
  }

  const totalCount = upperCount + lowerCount;
  return {
    upperRate: lowerCount / totalCount,
    lowerRate: upperCount / totalCount,
  };
}

function getTargetSameSideRates(
  upperCount: number,
  lowerCount: number,
  mixedRate: number
) {
  const sameSideRate = Math.max(0, 1 - mixedRate);
  if (upperCount >= 4 && lowerCount >= 4) {
    const upperWeight = upperCount * upperCount;
    const lowerWeight = lowerCount * lowerCount;
    const totalWeight = upperWeight + lowerWeight;
    return {
      targetUpperSameSideRate: (sameSideRate * upperWeight) / totalWeight,
      targetLowerSameSideRate: (sameSideRate * lowerWeight) / totalWeight,
    };
  }

  return {
    targetUpperSameSideRate: upperCount >= 4 ? sameSideRate : 0,
    targetLowerSameSideRate: lowerCount >= 4 ? sameSideRate : 0,
  };
}

function getMatchUserIds(match: V3MixedHistoryMatch) {
  return [...new Set([...match.team1, ...match.team2])];
}

export function getMixedMatchClassification(
  match: V3MixedHistoryMatch,
  sideByUserId: Map<string, string | null>
) {
  const userIds = [...match.team1, ...match.team2];
  if (new Set(userIds).size !== 4) {
    return null;
  }

  const sides = userIds.map((userId) => sideByUserId.get(userId));
  if (sides.some((side) => side !== "UPPER" && side !== "LOWER")) {
    return null;
  }

  if (isMixedPartitionForSides(match, sideByUserId)) {
    return "MIXED" as const;
  }

  if (sides.every((side) => side === "UPPER")) {
    return "UPPER" as const;
  }

  if (sides.every((side) => side === "LOWER")) {
    return "LOWER" as const;
  }

  return null;
}

export function buildMixedVarietyContext(
  players: MatchmakerV3Player[],
  matches: V3MixedHistoryMatch[]
): V3MixedVarietyContext {
  const { sideByUserId, upperCount, lowerCount } = getMixedSideCounts(players);
  const targetRates = getTargetMixedRates(upperCount, lowerCount);
  const activeSideCount = upperCount + lowerCount;
  const targetMixedGameRate =
    activeSideCount > 0
      ? (upperCount * targetRates.upperRate +
          lowerCount * targetRates.lowerRate) /
        activeSideCount
      : 0;
  const sameSideTargets = getTargetSameSideRates(
    upperCount,
    lowerCount,
    targetMixedGameRate
  );
  const targetMixedRateByUserId = new Map<string, number>();

  for (const [userId, side] of sideByUserId) {
    if (side === "UPPER") {
      targetMixedRateByUserId.set(userId, targetRates.upperRate);
    } else if (side === "LOWER") {
      targetMixedRateByUserId.set(userId, targetRates.lowerRate);
    }
  }

  const matchCountByUserId = new Map<string, number>();
  const mixedMatchCountByUserId = new Map<string, number>();
  let classifiableMatchCount = 0;
  let mixedGameCount = 0;
  let upperSameSideGameCount = 0;
  let lowerSameSideGameCount = 0;

  for (const match of matches) {
    const userIds = getMatchUserIds(match);
    const classification = getMixedMatchClassification(match, sideByUserId);
    if (!classification) {
      continue;
    }

    classifiableMatchCount += 1;
    if (classification === "MIXED") {
      mixedGameCount += 1;
    } else if (classification === "UPPER") {
      upperSameSideGameCount += 1;
    } else if (classification === "LOWER") {
      lowerSameSideGameCount += 1;
    }

    for (const userId of userIds) {
      matchCountByUserId.set(
        userId,
        (matchCountByUserId.get(userId) ?? 0) + 1
      );
      if (classification === "MIXED") {
        mixedMatchCountByUserId.set(
          userId,
          (mixedMatchCountByUserId.get(userId) ?? 0) + 1
        );
      }
    }
  }

  return {
    sideByUserId,
    targetMixedRateByUserId,
    matchCountByUserId,
    mixedMatchCountByUserId,
    targetMixedGameRate,
    classifiableMatchCount,
    mixedGameCount,
    upperSameSideGameCount,
    lowerSameSideGameCount,
    ...sameSideTargets,
  };
}

function getMixedVarietyDebtScore(
  mixedMatchCount: number,
  matchCount: number,
  targetMixedRate: number
) {
  const debt = mixedMatchCount - targetMixedRate * matchCount;
  return debt * debt;
}

export function getMixedVarietyPenalty(
  userIds: string[],
  isMixed: boolean,
  context: V3MixedVarietyContext
) {
  return userIds.reduce((totalPenalty, userId) => {
    const targetMixedRate = context.targetMixedRateByUserId.get(userId);
    if (targetMixedRate === undefined) {
      return totalPenalty;
    }

    const matchCount = context.matchCountByUserId.get(userId) ?? 0;
    const mixedMatchCount = context.mixedMatchCountByUserId.get(userId) ?? 0;
    const currentScore = getMixedVarietyDebtScore(
      mixedMatchCount,
      matchCount,
      targetMixedRate
    );
    const nextScore = getMixedVarietyDebtScore(
      mixedMatchCount + (isMixed ? 1 : 0),
      matchCount + 1,
      targetMixedRate
    );

    return totalPenalty + nextScore - currentScore;
  }, 0);
}

export function getGlobalMixedVarietyPenalty(
  context: V3MixedVarietyContext,
  mixedMatchesAdded: number,
  matchesAdded: number
) {
  const globalDebt =
    context.mixedGameCount -
    context.targetMixedGameRate * context.classifiableMatchCount;
  const currentGlobalScore = globalDebt * globalDebt;
  const nextDebt =
    globalDebt + mixedMatchesAdded - context.targetMixedGameRate * matchesAdded;
  return nextDebt * nextDebt - currentGlobalScore;
}

export function getSingleMixedGlobalVarietyPenalty(
  isMixed: boolean,
  context: V3MixedVarietyContext
) {
  const mixedPenalty = getGlobalMixedVarietyPenalty(
    context,
    isMixed ? 1 : 0,
    1
  );
  const sameSidePenalty = getGlobalMixedVarietyPenalty(context, 0, 1);
  return mixedPenalty - sameSidePenalty;
}
