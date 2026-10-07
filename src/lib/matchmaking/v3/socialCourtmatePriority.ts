import { SessionMode } from "../../../types/enums";
import { buildRecentMatchTypeWindows } from "./socialRollingVariety";
import type { RecentMatchType } from "./socialRollingVariety";
import { getSocialVarietySnapshot } from "./socialVariety";
import type { SocialVarietyContext } from "./socialVariety";
import type { SocialCourtmateCoverageEntry, SocialHistoryMatch, V3DoublesPartition } from "./types";

export interface SocialCourtmatePriorityPartitionMetrics {
  /** New undirected player pairs that have not shared a court in completed history. */
  readonly newCourtmatePairs: number;
  /** New undirected partner pairs, retained as a late objective. */
  readonly newPartnerPairs: number;
  /** New undirected opponent pairs, retained as a late objective. */
  readonly newOpponentPairs: number;
  /** Per-player new courtmates, used for the post-batch leximin profile. */
  readonly courtmateGainsByPlayer: ReadonlyMap<string, number>;
  /** Signed exact common-denominator sum of per-player rolling-six T changes. */
  readonly rollingMatchTypeGainUnits: bigint;
}

export interface SocialCourtmatePriorityBatchMetrics extends SocialCourtmatePriorityPartitionMetrics {
  readonly courtmateCoverageProfile: readonly SocialCourtmateCoverageEntry[];
}

interface PlayerTypeState {
  readonly feasibleTypes: ReadonlySet<"MIXED" | "OWN_SIDE">;
  readonly baselineWindow: readonly RecentMatchType[];
}

type RelationshipFacet = "courtmates" | "partners" | "opponents";

function getUniquePartitionIds(partition: V3DoublesPartition): string[] | null {
  const ids = [...partition.team1, ...partition.team2];
  return ids.length === 4 && ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === 4
    ? ids
    : null;
}

function unorderedPairKey(left: string, right: string): string {
  return left < right ? left + "\u0000" + right : right + "\u0000" + left;
}

function facetPairKey(facet: RelationshipFacet, left: string, right: string): string {
  return facet + "\u0001" + unorderedPairKey(left, right);
}

function getCourtType(partition: V3DoublesPartition, context: SocialVarietyContext): RecentMatchType {
  if (context.sessionMode !== SessionMode.MIXICANO || !getUniquePartitionIds(partition)) return null;
  const courtType = getSocialVarietySnapshot(partition, context).courtType;
  return courtType === "MIXED" ? "MIXED"
    : courtType === "UPPER" || courtType === "LOWER" ? "OWN_SIDE" : null;
}

function getCoveredTypes(window: readonly RecentMatchType[], feasibleTypes: ReadonlySet<"MIXED" | "OWN_SIDE">): number {
  const covered = new Set<"MIXED" | "OWN_SIDE">();
  for (const matchType of window) {
    if (matchType !== null && feasibleTypes.has(matchType)) covered.add(matchType);
  }
  return covered.size;
}

function leastCommonMultiple(left: bigint, right: bigint): bigint {
  if (left === BigInt(0) || right === BigInt(0)) return BigInt(0);
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return (left / a) * right;
}

/**
 * Scores uncapped completed-only courtmate breadth and the signed change in
 * distinct match types inside each player's six most recent completed matches.
 * The context must use the full structural roster and must not contain active
 * reservations in its history counts.
 */
export function createSocialCourtmatePriorityScorer(
  context: SocialVarietyContext,
  completedMatches: readonly SocialHistoryMatch[]
) {
  const courtmateOpportunities = new Map(
    [...context.playersByUserId].map(([userId, histograms]) => [userId, histograms.courtmates.opportunities])
  );
  const relationshipOpportunities = new Map<string, ReadonlySet<string>>();
  const previousPairs = new Set<string>();
  const courtmateCovered = new Map<string, number>();
  const courtmatePossible = new Map<string, number>();

  for (const [userId, histograms] of context.playersByUserId) {
    let covered = 0;
    for (const peerId of histograms.courtmates.opportunities) {
      if ((histograms.courtmates.counts.get(peerId) ?? 0) > 0) {
        covered += 1;
        previousPairs.add(facetPairKey("courtmates", userId, peerId));
      }
    }
    courtmateCovered.set(userId, covered);
    courtmatePossible.set(userId, histograms.courtmates.opportunities.size);
    relationshipOpportunities.set(userId + "\u0001partners", histograms.partners.opportunities);
    relationshipOpportunities.set(userId + "\u0001opponents", histograms.opponents.opportunities);
    for (const peerId of histograms.partners.opportunities) {
      if ((histograms.partners.counts.get(peerId) ?? 0) > 0) {
        previousPairs.add(facetPairKey("partners", userId, peerId));
      }
    }
    for (const peerId of histograms.opponents.opportunities) {
      if ((histograms.opponents.counts.get(peerId) ?? 0) > 0) {
        previousPairs.add(facetPairKey("opponents", userId, peerId));
      }
    }
  }

  const windows = buildRecentMatchTypeWindows(completedMatches, context);
  const playerTypes = new Map<string, PlayerTypeState>();
  let rollingTypeDenominator = BigInt(1);
  let typeEligiblePlayerCount = 0;
  for (const [userId, histograms] of context.playersByUserId) {
    const feasibleTypes = new Set<"MIXED" | "OWN_SIDE">(
      ["MIXED", "OWN_SIDE"].filter((type) => histograms.matchType.opportunities.has(type)) as Array<"MIXED" | "OWN_SIDE">
    );
    const baselineWindow = windows.get(userId) ?? [];
    playerTypes.set(userId, { feasibleTypes, baselineWindow });
    if (context.sessionMode !== SessionMode.MIXICANO || feasibleTypes.size === 0) continue;
    typeEligiblePlayerCount += 1;
    rollingTypeDenominator = leastCommonMultiple(rollingTypeDenominator, BigInt(feasibleTypes.size));
  }

  const isPairFeasibleAndNew = (
    facet: RelationshipFacet,
    userId: string,
    peerId: string
  ) => {
    const leftKey = userId + "\u0001" + facet;
    const left = facet === "courtmates" ? courtmateOpportunities.get(userId) : relationshipOpportunities.get(leftKey);
    const rightKey = peerId + "\u0001" + facet;
    const right = facet === "courtmates" ? courtmateOpportunities.get(peerId) : relationshipOpportunities.get(rightKey);
    return Boolean(left?.has(peerId) && right?.has(userId) &&
      !previousPairs.has(facetPairKey(facet, userId, peerId)));
  };

  const getPartitionMetrics = (partition: V3DoublesPartition): SocialCourtmatePriorityPartitionMetrics => {
    const ids = getUniquePartitionIds(partition);
    const courtmateGains = new Map<string, number>();
    if (!ids) {
      return {
        newCourtmatePairs: 0,
        newPartnerPairs: 0,
        newOpponentPairs: 0,
        courtmateGainsByPlayer: courtmateGains,
        rollingMatchTypeGainUnits: BigInt(0),
      };
    }

    let newCourtmatePairs = 0;
    let newPartnerPairs = 0;
    let newOpponentPairs = 0;
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const leftId = ids[leftIndex];
        const rightId = ids[rightIndex];
        if (!isPairFeasibleAndNew("courtmates", leftId, rightId)) continue;
        newCourtmatePairs += 1;
        courtmateGains.set(leftId, (courtmateGains.get(leftId) ?? 0) + 1);
        courtmateGains.set(rightId, (courtmateGains.get(rightId) ?? 0) + 1);
      }
    }

    for (const team of [partition.team1, partition.team2]) {
      if (isPairFeasibleAndNew("partners", team[0], team[1])) newPartnerPairs += 1;
    }
    for (const playerId of partition.team1) {
      for (const opponentId of partition.team2) {
        if (isPairFeasibleAndNew("opponents", playerId, opponentId)) {
          newOpponentPairs += 1;
        }
      }
    }

    const matchType = getCourtType(partition, context);
    let rollingMatchTypeGainUnits = BigInt(0);
    if (context.sessionMode === SessionMode.MIXICANO && rollingTypeDenominator > BigInt(0)) {
      for (const userId of ids) {
        const player = playerTypes.get(userId);
        if (!player || player.feasibleTypes.size === 0) continue;
        const before = getCoveredTypes(player.baselineWindow, player.feasibleTypes);
        const nextWindow = [...player.baselineWindow, matchType];
        if (nextWindow.length > 6) nextWindow.shift();
        const after = getCoveredTypes(nextWindow, player.feasibleTypes);
        rollingMatchTypeGainUnits += BigInt(after - before) *
          (rollingTypeDenominator / BigInt(player.feasibleTypes.size));
      }
    }
    return {
      newCourtmatePairs,
      newPartnerPairs,
      newOpponentPairs,
      courtmateGainsByPlayer: courtmateGains,
      rollingMatchTypeGainUnits,
    };
  };

  const getPostBatchCourtmateCoverageProfile = (
    gainsByPlayer: ReadonlyMap<string, number>
  ): readonly SocialCourtmateCoverageEntry[] => [...courtmatePossible]
    .flatMap(([userId, possible]) => possible > 0 ? [{
      userId,
      covered: Math.min(possible, (courtmateCovered.get(userId) ?? 0) + (gainsByPlayer.get(userId) ?? 0)),
      possible,
    }] : [])
    .sort((left, right) => compareCourtmateCoverageFractions(left, right) || left.userId.localeCompare(right.userId));

  const getBatchMetrics = (partitions: readonly V3DoublesPartition[]): SocialCourtmatePriorityBatchMetrics => {
    const seenPairs = new Set(previousPairs);
    const rollingWindows = new Map([...playerTypes].map(([userId, player]) => [userId, [...player.baselineWindow]]));
    const courtmateGains = new Map<string, number>();
    let newCourtmatePairs = 0;
    let newPartnerPairs = 0;
    let newOpponentPairs = 0;
    let rollingMatchTypeGainUnits = BigInt(0);
    for (const partition of partitions) {
      const ids = getUniquePartitionIds(partition);
      if (!ids) continue;

      for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
          const leftId = ids[leftIndex];
          const rightId = ids[rightIndex];
          const key = facetPairKey("courtmates", leftId, rightId);
          if (!isPairFeasibleAndNew("courtmates", leftId, rightId) || seenPairs.has(key)) continue;
          seenPairs.add(key);
          newCourtmatePairs += 1;
          courtmateGains.set(leftId, (courtmateGains.get(leftId) ?? 0) + 1);
          courtmateGains.set(rightId, (courtmateGains.get(rightId) ?? 0) + 1);
        }
      }

      for (const team of [partition.team1, partition.team2]) {
        const partnerKey = facetPairKey("partners", team[0], team[1]);
        if (isPairFeasibleAndNew("partners", team[0], team[1]) && !seenPairs.has(partnerKey)) {
          seenPairs.add(partnerKey);
          newPartnerPairs += 1;
        }
      }
      for (const playerId of partition.team1) {
        for (const opponentId of partition.team2) {
          const opponentKey = facetPairKey("opponents", playerId, opponentId);
          if (isPairFeasibleAndNew("opponents", playerId, opponentId) && !seenPairs.has(opponentKey)) {
            seenPairs.add(opponentKey);
            newOpponentPairs += 1;
          }
        }
      }

      const matchType = getCourtType(partition, context);
      if (context.sessionMode === SessionMode.MIXICANO && rollingTypeDenominator > BigInt(0)) {
        for (const userId of ids) {
          const player = playerTypes.get(userId);
          if (!player || player.feasibleTypes.size === 0) continue;
          const window = rollingWindows.get(userId) ?? [];
          const before = getCoveredTypes(window, player.feasibleTypes);
          const nextWindow = [...window, matchType];
          if (nextWindow.length > 6) nextWindow.shift();
          rollingWindows.set(userId, nextWindow);
          const after = getCoveredTypes(nextWindow, player.feasibleTypes);
          rollingMatchTypeGainUnits += BigInt(after - before) *
            (rollingTypeDenominator / BigInt(player.feasibleTypes.size));
        }
      }
    }
    return {
      newCourtmatePairs,
      newPartnerPairs,
      newOpponentPairs,
      courtmateGainsByPlayer: courtmateGains,
      rollingMatchTypeGainUnits,
      courtmateCoverageProfile: getPostBatchCourtmateCoverageProfile(courtmateGains),
    };
  };

  return {
    rollingTypeDenominator,
    typeEligiblePlayerCount,
    getPartitionMetrics,
    getBatchMetrics,
    getPostBatchCourtmateCoverageProfile,
    getMaximumSingleMatchCourtmateGain(userId: string) {
      const possible = courtmatePossible.get(userId) ?? 0;
      const covered = courtmateCovered.get(userId) ?? 0;
      return Math.min(3, Math.max(0, possible - covered));
    },
    toNormalizedRollingTypeGain(units: bigint) {
      if (rollingTypeDenominator <= BigInt(0) || typeEligiblePlayerCount === 0) return 0;
      const scale = BigInt(1_000_000_000_000);
      return Number((units * scale) / rollingTypeDenominator) / Number(scale);
    },
  };
}

export function compareCourtmateCoverageFractions(
  left: SocialCourtmateCoverageEntry,
  right: SocialCourtmateCoverageEntry
): number {
  const leftCross = BigInt(left.covered) * BigInt(right.possible);
  const rightCross = BigInt(right.covered) * BigInt(left.possible);
  return leftCross === rightCross ? 0 : leftCross < rightCross ? -1 : 1;
}

/** Both inputs are already sorted from lowest to highest coverage. */
export function compareCourtmateCoverageProfiles(
  left: readonly SocialCourtmateCoverageEntry[],
  right: readonly SocialCourtmateCoverageEntry[]
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (!leftEntry || !rightEntry) return leftEntry ? 1 : rightEntry ? -1 : 0;
    const comparison = compareCourtmateCoverageFractions(leftEntry, rightEntry);
    if (comparison !== 0) return comparison;
  }
  return 0;
}
