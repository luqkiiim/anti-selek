import { SessionMode } from "../../../types/enums";
import { SOCIAL_HORIZON_CAPS, SOCIAL_HORIZON_WEIGHTS, scoreSocialHorizon321 } from "./socialHorizonCoverageScoring";
import type { SocialHorizon321Score, SocialHorizonFacet } from "./socialHorizonCoverageScoring";
import { getSocialVarietySnapshot, parseSocialVarietySnapshot } from "./socialVariety";
import type { SocialVarietyContext, SocialVarietyCoverageScorer } from "./socialVariety";
import type { SocialHistoryMatch, V3DoublesPartition } from "./types";

export type RollingCoverageGainMetric = "rolling-equal" | "social-horizon-3211";
export type RollingMatchType = "MIXED" | "OWN_SIDE";
export type RecentMatchType = RollingMatchType | null;

const WINDOW_SIZE = 6;
const RELATIONSHIP_FACETS: readonly SocialHorizonFacet[] = ["courtmates", "opponents", "partners"];
const MATCH_TYPE_ORDER: readonly RollingMatchType[] = ["MIXED", "OWN_SIDE"];
const RELATIONSHIP_EXPOSURE_LIMITS: Readonly<Record<SocialHorizonFacet, number>> = {
  courtmates: 3,
  opponents: 2,
  partners: 1,
};

export interface SocialVariety3211PlayerScore {
  readonly userId: string;
  readonly score: number | null;
  readonly relationshipScore: number | null;
  /** Match-type coverage within this player's feasible type vocabulary. */
  readonly T: number | null;
  readonly feasibleMatchTypes: readonly RollingMatchType[];
  /** The latest six completed appearances, including null for unknown types. */
  readonly recentMatchTypes: readonly RecentMatchType[];
}

export interface SocialVariety3211Score {
  readonly score: number | null;
  readonly relationshipScore: number | null;
  readonly meanT: number | null;
  /** Share of type-eligible players whose T is 1. */
  readonly fullTypeCoverageFraction: number | null;
  /** Share of type-eligible players whose T is exactly 1/2. */
  readonly halfTypeCoverageFraction: number | null;
  readonly players: readonly SocialVariety3211PlayerScore[];
  readonly relationship: SocialHorizon321Score;
}

interface OrderedMatch {
  readonly match: SocialHistoryMatch;
  readonly inputIndex: number;
  readonly completedAt: number | null;
}

function getUniquePartitionIds(partition: V3DoublesPartition): string[] | null {
  const ids = [...partition.team1, ...partition.team2];
  return ids.length === 4 &&
    ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === 4
    ? ids
    : null;
}

function getCompletedAtValue(match: SocialHistoryMatch): number | null {
  if (!(match.completedAt instanceof Date)) return null;
  const value = match.completedAt.getTime();
  return Number.isFinite(value) ? value : null;
}

function orderCompletedMatches(matches: readonly SocialHistoryMatch[]): OrderedMatch[] {
  const seenIds = new Set<string>();
  const ordered: OrderedMatch[] = [];
  for (let inputIndex = 0; inputIndex < matches.length; inputIndex += 1) {
    const match = matches[inputIndex];
    if (match.id) {
      if (seenIds.has(match.id)) continue;
      seenIds.add(match.id);
    }
    ordered.push({ match, inputIndex, completedAt: getCompletedAtValue(match) });
  }

  // Fully dated histories have a total chronology. If a timestamp is missing,
  // preserve the source's completion order as the stable fallback.
  if (ordered.every((item) => item.completedAt !== null)) {
    ordered.sort((left, right) =>
      left.completedAt! - right.completedAt! || left.inputIndex - right.inputIndex
    );
  }
  return ordered;
}

function classifyCompletedMatch(
  match: SocialHistoryMatch,
  context: SocialVarietyContext
): RecentMatchType {
  if (!getUniquePartitionIds(match)) return null;
  const snapshot = parseSocialVarietySnapshot(match.socialVariety, match);
  const courtType = snapshot?.courtType ??
    (snapshot ? null : getSocialVarietySnapshot(match, context).courtType);
  if (courtType === "MIXED") return "MIXED";
  if (courtType === "UPPER" || courtType === "LOWER") return "OWN_SIDE";
  return null;
}

/**
 * Returns each player's last six completed appearances in oldest-to-newest
 * order. A valid match with an unknown type still occupies a window slot.
 */
export function buildRecentMatchTypeWindows(
  completedMatches: readonly SocialHistoryMatch[],
  context: SocialVarietyContext
): ReadonlyMap<string, readonly RecentMatchType[]> {
  const windows = new Map<string, RecentMatchType[]>(
    [...context.playersByUserId.keys()].map((userId) => [userId, []])
  );
  for (const { match } of orderCompletedMatches(completedMatches)) {
    const ids = getUniquePartitionIds(match);
    if (!ids) continue;
    const type = classifyCompletedMatch(match, context);
    for (const userId of ids) {
      const window = windows.get(userId);
      if (!window) continue;
      window.push(type);
      if (window.length > WINDOW_SIZE) window.shift();
    }
  }
  return windows;
}

function meanPresent(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function getFeasibleMatchTypes(context: SocialVarietyContext, userId: string): RollingMatchType[] {
  const opportunities = context.playersByUserId.get(userId)?.matchType.opportunities;
  if (!opportunities) return [];
  return MATCH_TYPE_ORDER.filter((matchType) => opportunities.has(matchType));
}

function coveredRecentTypeCount(
  recentMatchTypes: readonly RecentMatchType[],
  feasibleMatchTypes: readonly RollingMatchType[]
): number {
  const feasible = new Set(feasibleMatchTypes);
  const covered = new Set<RollingMatchType>();
  for (const matchType of recentMatchTypes) {
    if (matchType !== null && feasible.has(matchType)) covered.add(matchType);
  }
  return covered.size;
}

/** Score the corrected per-player 3:2:1:1 KPI from completed history. */
export function scoreSocialVariety3211(
  context: SocialVarietyContext,
  completedMatches: readonly SocialHistoryMatch[]
): SocialVariety3211Score {
  // Relationship evidence in `context` must be built from completed matches
  // only; recent match-type evidence is derived from the explicit argument.
  const relationship = scoreSocialHorizon321(context);
  const relationshipByUserId = new Map(relationship.players.map((player) => [player.userId, player]));
  const windows = buildRecentMatchTypeWindows(completedMatches, context);
  const players = [...context.playersByUserId.keys()].map((userId): SocialVariety3211PlayerScore => {
    const relationshipPlayer = relationshipByUserId.get(userId);
    const feasibleMatchTypes = getFeasibleMatchTypes(context, userId);
    const recentMatchTypes = windows.get(userId) ?? [];
    const T = feasibleMatchTypes.length
      ? coveredRecentTypeCount(recentMatchTypes, feasibleMatchTypes) / feasibleMatchTypes.length
      : null;
    const relationshipScore = relationshipPlayer?.score ?? null;
    const relationshipWeight = relationshipPlayer?.activeWeight ?? 0;
    const totalWeight = relationshipWeight + (T === null ? 0 : 1);
    const score = totalWeight === 0
      ? null
      : ((relationshipScore ?? 0) * relationshipWeight + (T ?? 0)) / totalWeight;
    return {
      userId,
      score,
      relationshipScore,
      T,
      feasibleMatchTypes,
      recentMatchTypes,
    };
  });
  const typeEligiblePlayers = players.filter((player) => player.T !== null);
  const meanT = meanPresent(typeEligiblePlayers.map((player) => player.T));
  const fullTypeCoverageFraction = typeEligiblePlayers.length
    ? typeEligiblePlayers.filter((player) => player.T === 1).length / typeEligiblePlayers.length
    : null;
  const halfTypeCoverageFraction = typeEligiblePlayers.length
    ? typeEligiblePlayers.filter((player) => player.T === 0.5).length / typeEligiblePlayers.length
    : null;
  return {
    score: meanPresent(players.map((player) => player.score)),
    relationshipScore: relationship.score,
    meanT,
    fullTypeCoverageFraction,
    halfTypeCoverageFraction,
    players,
    relationship,
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  const zero = BigInt(0);
  let a = left < zero ? -left : left;
  let b = right < zero ? -right : right;
  while (b !== zero) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left: bigint, right: bigint): bigint {
  const zero = BigInt(0);
  return left === zero || right === zero ? zero : (left / greatestCommonDivisor(left, right)) * right;
}

function relationshipExposures(
  partition: V3DoublesPartition,
  visit: (userId: string, facet: SocialHorizonFacet, peerId: string) => void
): void {
  const teams = [partition.team1, partition.team2];
  for (let side = 0; side < teams.length; side += 1) {
    const team = teams[side];
    const opponents = teams[1 - side];
    for (let seat = 0; seat < team.length; seat += 1) {
      const userId = team[seat];
      const partner = team[1 - seat];
      visit(userId, "courtmates", partner);
      visit(userId, "partners", partner);
      for (const opponent of opponents) {
        visit(userId, "courtmates", opponent);
        visit(userId, "opponents", opponent);
      }
    }
  }
}

function getCandidateMatchType(
  partition: V3DoublesPartition,
  context: SocialVarietyContext
): RecentMatchType {
  if (context.sessionMode !== SessionMode.MIXICANO || !getUniquePartitionIds(partition)) return null;
  const courtType = getSocialVarietySnapshot(partition, context).courtType;
  if (courtType === "MIXED") return "MIXED";
  if (courtType === "UPPER" || courtType === "LOWER") return "OWN_SIDE";
  return null;
}

interface RelationshipFacetPlan {
  readonly facet: SocialHorizonFacet;
  readonly denominator: number;
  readonly remainingCapacity: number;
  readonly unitsPerExposure: bigint;
}

interface PlayerPlan {
  readonly userId: string;
  readonly activeWeight: number;
  readonly relationshipFacets: ReadonlyMap<SocialHorizonFacet, RelationshipFacetPlan>;
  readonly typeDenominator: number;
  readonly typeUnitsPerType: bigint;
  readonly feasibleMatchTypes: ReadonlySet<RollingMatchType>;
  readonly baselineWindow: readonly RecentMatchType[];
}

function exposureKey(userId: string, facet: SocialHorizonFacet, peerId: string): string {
  return JSON.stringify([userId, facet, peerId]);
}

function playerFacetKey(userId: string, facet: SocialHorizonFacet): string {
  return JSON.stringify([userId, facet]);
}

function typeCount(window: readonly RecentMatchType[], feasibleTypes: ReadonlySet<RollingMatchType>): number {
  const covered = new Set<RollingMatchType>();
  for (const matchType of window) {
    if (matchType !== null && feasibleTypes.has(matchType)) covered.add(matchType);
  }
  return covered.size;
}

function toSignedNormalizedScore(units: bigint, denominator: bigint): number {
  if (denominator <= BigInt(0) || units === BigInt(0)) return 0;
  const scale = BigInt(1_000_000_000_000_000);
  return Number((units * scale) / denominator) / Number(scale);
}

/**
 * Creates the two experimental replay-gate metrics. Lifetime relationship
 * opportunities come from `context`; recent type feasibility and assignment
 * sides come from `matchTypeContext`, which can retain the full structural
 * roster even when `context` serves a narrower lifetime-history purpose.
 */
export function createRollingSocialCoverageScorer(
  context: SocialVarietyContext,
  completedMatches: readonly SocialHistoryMatch[],
  metric: RollingCoverageGainMetric,
  matchTypeContext: SocialVarietyContext = context
): SocialVarietyCoverageScorer {
  const windows = buildRecentMatchTypeWindows(completedMatches, matchTypeContext);
  const playerSeeds = [...context.playersByUserId].map(([userId, histograms]) => {
    const feasibleTypes = getFeasibleMatchTypes(matchTypeContext, userId);
    const relationshipFacets = RELATIONSHIP_FACETS.flatMap((facet) => {
      const feasibleCount = histograms[facet].opportunities.size;
      const denominator = metric === "social-horizon-3211"
        ? Math.min(feasibleCount, SOCIAL_HORIZON_CAPS[facet])
        : feasibleCount;
      return denominator > 0 ? [{ facet, denominator }] : [];
    });
    const typeDenominator = feasibleTypes.length;
    const activeWeight = metric === "social-horizon-3211"
      ? relationshipFacets.reduce((sum, item) => sum + SOCIAL_HORIZON_WEIGHTS[item.facet], 0) + (typeDenominator > 0 ? 1 : 0)
      : relationshipFacets.length + (typeDenominator > 0 ? 1 : 0);
    return {
      userId,
      histograms,
      feasibleTypes,
      typeDenominator,
      activeWeight,
      relationshipFacets,
      baselineWindow: windows.get(userId) ?? [],
    };
  });
  const eligiblePlayerCount = playerSeeds.filter((player) => player.activeWeight > 0).length;

  const denominatorTerms: bigint[] = [];
  for (const player of playerSeeds) {
    if (player.activeWeight <= 0) continue;
    for (const item of player.relationshipFacets) {
      denominatorTerms.push(
        BigInt(eligiblePlayerCount) * BigInt(player.activeWeight) * BigInt(item.denominator)
      );
    }
    if (player.typeDenominator > 0) {
      denominatorTerms.push(
        BigInt(eligiblePlayerCount) * BigInt(player.activeWeight) * BigInt(player.typeDenominator)
      );
    }
  }
  const denominator = denominatorTerms.reduce(leastCommonMultiple, BigInt(1));
  const players = new Map<string, PlayerPlan>();
  for (const player of playerSeeds) {
    const relationshipPlan = new Map<SocialHorizonFacet, RelationshipFacetPlan>();
    for (const item of player.relationshipFacets) {
      const weight = metric === "social-horizon-3211" ? SOCIAL_HORIZON_WEIGHTS[item.facet] : 1;
      const histogram = player.histograms[item.facet];
      let covered = 0;
      for (const peerId of histogram.opportunities) {
        if ((histogram.counts.get(peerId) ?? 0) > 0) covered += 1;
      }
      const cappedCovered = metric === "social-horizon-3211"
        ? Math.min(covered, item.denominator)
        : covered;
      const unitsPerExposure = denominator /
        (BigInt(eligiblePlayerCount) * BigInt(player.activeWeight) * BigInt(item.denominator)) *
        BigInt(weight);
      relationshipPlan.set(item.facet, {
        facet: item.facet,
        denominator: item.denominator,
        remainingCapacity: Math.max(0, item.denominator - cappedCovered),
        unitsPerExposure,
      });
    }
    const typeUnitsPerType = player.typeDenominator > 0
      ? denominator /
        (BigInt(eligiblePlayerCount) * BigInt(player.activeWeight) * BigInt(player.typeDenominator))
      : BigInt(0);
    players.set(player.userId, {
      userId: player.userId,
      activeWeight: player.activeWeight,
      relationshipFacets: relationshipPlan,
      typeDenominator: player.typeDenominator,
      typeUnitsPerType,
      feasibleMatchTypes: new Set(player.feasibleTypes),
      baselineWindow: player.baselineWindow,
    });
  }

  const addPartition = (
    partition: V3DoublesPartition,
    seenRelationships: Set<string>,
    earnedRelationshipCapacity: Map<string, number>,
    currentWindows: Map<string, RecentMatchType[]>
  ): bigint => {
    const zero = BigInt(0);
    const ids = getUniquePartitionIds(partition);
    if (!ids) return zero;
    let gain = zero;

    relationshipExposures(partition, (userId, facet, peerId) => {
      const plan = players.get(userId);
      const facetPlan = plan?.relationshipFacets.get(facet);
      if (!plan || !facetPlan) return;
      const key = exposureKey(userId, facet, peerId);
      if (seenRelationships.has(key)) return;
      seenRelationships.add(key);
      const histogram = context.playersByUserId.get(userId)?.[facet];
      if (!histogram?.opportunities.has(peerId) || (histogram.counts.get(peerId) ?? 0) > 0) return;
      if (metric === "social-horizon-3211") {
        const facetKey = playerFacetKey(userId, facet);
        const alreadyEarned = earnedRelationshipCapacity.get(facetKey) ?? 0;
        if (alreadyEarned >= facetPlan.remainingCapacity) return;
        earnedRelationshipCapacity.set(facetKey, alreadyEarned + 1);
      }
      gain += facetPlan.unitsPerExposure;
    });

    const matchType = getCandidateMatchType(partition, matchTypeContext);
    for (const userId of ids) {
      const plan = players.get(userId);
      if (!plan || plan.typeDenominator <= 0) continue;
      const previousWindow = currentWindows.get(userId) ?? [...plan.baselineWindow];
      const before = typeCount(previousWindow, plan.feasibleMatchTypes);
      const nextWindow = [...previousWindow, matchType];
      if (nextWindow.length > WINDOW_SIZE) nextWindow.shift();
      currentWindows.set(userId, nextWindow);
      const after = typeCount(nextWindow, plan.feasibleMatchTypes);
      gain += BigInt(after - before) * plan.typeUnitsPerType;
    }
    return gain;
  };

  const getMaximumSingleMatchGainUnits = (userId: string): bigint => {
    const zero = BigInt(0);
    const plan = players.get(userId);
    if (!plan) return zero;
    let maximum = zero;
    for (const [facet, facetPlan] of plan.relationshipFacets) {
      const histogram = context.playersByUserId.get(userId)?.[facet];
      if (!histogram) continue;
      let unseen = 0;
      for (const peerId of histogram.opportunities) {
        if ((histogram.counts.get(peerId) ?? 0) <= 0) unseen += 1;
      }
      const cap = metric === "social-horizon-3211" ? facetPlan.remainingCapacity : unseen;
      maximum += BigInt(Math.min(RELATIONSHIP_EXPOSURE_LIMITS[facet], unseen, cap)) * facetPlan.unitsPerExposure;
    }
    // Check each feasible appended type against the current window. This is
    // still optimistic for branch-and-bound, while returning zero once every
    // type is already covered and no single append can increase coverage.
    if (plan.typeDenominator > 0) {
      const before = typeCount(plan.baselineWindow, plan.feasibleMatchTypes);
      let maximumTypeGain = 0;
      for (const matchType of plan.feasibleMatchTypes) {
        const nextWindow = [...plan.baselineWindow, matchType];
        if (nextWindow.length > WINDOW_SIZE) nextWindow.shift();
        maximumTypeGain = Math.max(
          maximumTypeGain,
          typeCount(nextWindow, plan.feasibleMatchTypes) - before
        );
      }
      if (maximumTypeGain > 0) maximum += BigInt(maximumTypeGain) * plan.typeUnitsPerType;
    }
    return maximum;
  };

  return {
    denominator,
    eligiblePlayerCount,
    getPartitionGainUnits: (partition) => addPartition(partition, new Set(), new Map(), new Map()),
    getBatchGainUnits: (partitions) => {
      const seenRelationships = new Set<string>();
      const earnedRelationshipCapacity = new Map<string, number>();
      const currentWindows = new Map<string, RecentMatchType[]>(
        [...players].map(([userId, plan]) => [userId, [...plan.baselineWindow]])
      );
      let gain = BigInt(0);
      for (const partition of partitions) {
        gain += addPartition(partition, seenRelationships, earnedRelationshipCapacity, currentWindows);
      }
      return gain;
    },
    getMaximumSingleMatchGainUnits,
    toNormalizedScore: (gainUnits) => toSignedNormalizedScore(gainUnits, denominator),
  };
}
