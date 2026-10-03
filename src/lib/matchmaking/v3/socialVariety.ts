import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { SessionMode } from "../../../types/enums";

import { getDoublesPartitions, isValidPartitionForMode } from "./balance";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  SocialVarietyGains,
  SocialVarietySnapshot,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";

export type {
  SocialHistoryMatch,
  SocialVarietyGains,
  SocialVarietySnapshot,
} from "./types";

type SocialPlayer = Pick<
  MatchmakerV3Player,
  "userId" | "gender" | "partnerPreference" | "mixedSideOverride"
>;
type SocialMatchType = "MIXED" | "OWN_SIDE";
type SocialFacet = keyof SocialVarietyGains;

export interface SocialVarietyHistogram {
  readonly opportunities: ReadonlySet<string>;
  readonly counts: ReadonlyMap<string, number>;
  readonly total: number;
  readonly countLogCountSum: number;
}

export interface SocialVarietyPlayerContext {
  readonly courtmates: SocialVarietyHistogram;
  readonly partners: SocialVarietyHistogram;
  readonly opponents: SocialVarietyHistogram;
  readonly matchType: SocialVarietyHistogram;
}

export interface SocialVarietyContext {
  readonly sessionMode: SessionMode;
  readonly effectiveSideByUserId: ReadonlyMap<string, "UPPER" | "LOWER" | null>;
  readonly playersByUserId: ReadonlyMap<string, SocialVarietyPlayerContext>;
}

export interface SocialVarietyCoverageFacet {
  /** Number of structurally feasible relationships experienced at least once. */
  readonly covered: number;
  /** Number of structurally feasible relationships in this player's vocabulary. */
  readonly possible: number;
  /** covered / possible, or null when this facet has no feasible opportunities. */
  readonly score: number | null;
}

export interface SocialVarietyPlayerCoverage {
  readonly userId: string;
  /** Equal-weight mean of courtmate, partner and opponent scores with opportunities. */
  readonly relationshipScore: number | null;
  readonly courtmates: SocialVarietyCoverageFacet;
  readonly partners: SocialVarietyCoverageFacet;
  readonly opponents: SocialVarietyCoverageFacet;
  readonly matchTypes: Readonly<Record<SocialMatchType, SocialVarietyCoverageFacet>>;
}

export interface SocialVarietyCoverage {
  /** Mean relationshipScore across players with at least one meaningful facet. */
  readonly score: number | null;
  /** Mean of each player's facet score, preserving equal weight per player. */
  readonly courtmateScore: number | null;
  readonly partnerScore: number | null;
  readonly opponentScore: number | null;
  /** Match-type coverage is reported separately from relationship coverage. */
  readonly matchTypeScores: Readonly<Record<SocialMatchType, number | null>>;
  readonly players: ReadonlyMap<string, SocialVarietyPlayerCoverage>;
}

type FacetMaps = Record<SocialFacet, Map<string, number>>;
type FacetOpportunities = Record<SocialFacet, Set<string>>;

function emptyFacetMaps(): FacetMaps {
  return {
    courtmates: new Map(),
    partners: new Map(),
    opponents: new Map(),
    matchType: new Map(),
  };
}

function emptyOpportunities(): FacetOpportunities {
  return {
    courtmates: new Set(),
    partners: new Set(),
    opponents: new Set(),
    matchType: new Set(),
  };
}

function getUniquePartitionIds(partition: V3DoublesPartition) {
  const ids = [...partition.team1, ...partition.team2];
  return ids.length === 4 &&
    ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === 4
    ? ids
    : null;
}

function getCourtType(
  partition: V3DoublesPartition,
  sideByUserId: ReadonlyMap<string, "UPPER" | "LOWER" | null>
): SocialVarietySnapshot["courtType"] {
  const ids = getUniquePartitionIds(partition);
  if (!ids) return null;
  const sides = ids.map((id) => sideByUserId.get(id));
  if (sides.some((side) => side !== "UPPER" && side !== "LOWER")) return null;
  if (sides.every((side) => side === "UPPER")) return "UPPER";
  if (sides.every((side) => side === "LOWER")) return "LOWER";
  if (
    sideByUserId.get(partition.team1[0]) !== sideByUserId.get(partition.team1[1]) &&
    sideByUserId.get(partition.team2[0]) !== sideByUserId.get(partition.team2[1])
  ) {
    return "MIXED";
  }
  return null;
}

function getMatchType(courtType: SocialVarietySnapshot["courtType"]): SocialMatchType | null {
  return courtType === null ? null : courtType === "MIXED" ? "MIXED" : "OWN_SIDE";
}

function buildSideMap(players: readonly SocialPlayer[]) {
  return new Map(
    players.map((player) => [player.userId, getEffectiveMixedSide(player)])
  );
}

function snapshotForSides(
  partition: V3DoublesPartition,
  sideByUserId: ReadonlyMap<string, "UPPER" | "LOWER" | null>
): SocialVarietySnapshot {
  const effectiveSideByUserId = Object.fromEntries(
    [...partition.team1, ...partition.team2].map((id) => [id, sideByUserId.get(id) ?? null])
  );
  return {
    version: 1,
    basis: "EFFECTIVE_MIXED_SIDE",
    courtType: getCourtType(partition, sideByUserId),
    effectiveSideByUserId,
  };
}

export function buildSocialVarietySnapshot(
  partition: V3DoublesPartition,
  players: readonly SocialPlayer[]
) {
  return snapshotForSides(partition, buildSideMap(players));
}

export function getSocialVarietySnapshot(
  partition: V3DoublesPartition,
  context: SocialVarietyContext
) {
  return snapshotForSides(partition, context.effectiveSideByUserId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return isRecord(value) ? value : null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A valid null classification is historical information, not a missing snapshot. */
export function parseSocialVarietySnapshot(
  jsonOrObject: unknown,
  partition: V3DoublesPartition
): SocialVarietySnapshot | null {
  const root = parseJsonRecord(jsonOrObject);
  const value = root && "socialVariety" in root ? root.socialVariety : root;
  const ids = getUniquePartitionIds(partition);
  if (
    !ids ||
    !isRecord(value) ||
    value.version !== 1 ||
    value.basis !== "EFFECTIVE_MIXED_SIDE" ||
    !["MIXED", "UPPER", "LOWER", null].includes(value.courtType as string | null) ||
    !isRecord(value.effectiveSideByUserId) ||
    Object.keys(value.effectiveSideByUserId).length !== 4
  ) {
    return null;
  }
  const sides = value.effectiveSideByUserId;
  if (
    ids.some(
      (id) =>
        !Object.hasOwn(sides, id) ||
        (sides[id] !== "UPPER" && sides[id] !== "LOWER" && sides[id] !== null)
    )
  ) {
    return null;
  }
  const snapshot: SocialVarietySnapshot = {
    version: 1,
    basis: "EFFECTIVE_MIXED_SIDE",
    courtType: value.courtType as SocialVarietySnapshot["courtType"],
    effectiveSideByUserId: Object.fromEntries(
      ids.map((id) => [id, sides[id] as "UPPER" | "LOWER" | null])
    ),
  };
  return getCourtType(partition, new Map(Object.entries(snapshot.effectiveSideByUserId))) ===
    snapshot.courtType
    ? snapshot
    : null;
}

export function withSocialVarietySnapshot(
  reasonJson: string | null | undefined,
  partition: V3DoublesPartition,
  players: readonly SocialPlayer[]
) {
  const reason = parseJsonRecord(reasonJson) ?? {};
  if (reasonJson && parseSocialVarietySnapshot(reason, partition)) return reasonJson;
  const socialVariety =
    parseSocialVarietySnapshot(reason, partition) ?? buildSocialVarietySnapshot(partition, players);
  return JSON.stringify({ ...reason, socialVariety });
}

function visitExposures(
  partition: V3DoublesPartition,
  matchType: SocialMatchType | null,
  visit: (userId: string, facet: SocialFacet, experience: string) => void
) {
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
      if (matchType) visit(userId, "matchType", matchType);
    }
  }
}

function buildUnrestrictedOpportunities(
  players: readonly MatchmakerV3Player[],
  sessionMode: SessionMode,
  sides: ReadonlyMap<string, "UPPER" | "LOWER" | null>,
  opportunities: Map<string, FacetOpportunities>
) {
  if (players.length < 4) return;
  const upperIds = players.filter((player) => sides.get(player.userId) === "UPPER").map((p) => p.userId);
  const lowerIds = players.filter((player) => sides.get(player.userId) === "LOWER").map((p) => p.userId);
  const mixedPossible = upperIds.length >= 2 && lowerIds.length >= 2;
  for (const player of players) {
    const facets = opportunities.get(player.userId)!;
    if (sessionMode !== SessionMode.MIXICANO) {
      for (const peer of players) {
        if (peer.userId === player.userId) continue;
        facets.courtmates.add(peer.userId);
        facets.partners.add(peer.userId);
        facets.opponents.add(peer.userId);
      }
      continue;
    }
    const side = sides.get(player.userId);
    if (!side) continue;
    const ownIds = side === "UPPER" ? upperIds : lowerIds;
    const otherIds = side === "UPPER" ? lowerIds : upperIds;
    const ownPossible = ownIds.length >= 4;
    if (mixedPossible) {
      facets.matchType.add("MIXED");
      for (const peerId of otherIds) {
        facets.courtmates.add(peerId);
        facets.partners.add(peerId);
        facets.opponents.add(peerId);
      }
    }
    if (ownPossible) facets.matchType.add("OWN_SIDE");
    if (mixedPossible || ownPossible) {
      for (const peerId of ownIds) {
        if (peerId === player.userId) continue;
        facets.courtmates.add(peerId);
        facets.opponents.add(peerId);
        if (ownPossible) facets.partners.add(peerId);
      }
    }
  }
}

function buildConstrainedOpportunities<T extends MatchmakerV3Player>(
  players: readonly T[],
  sessionMode: SessionMode,
  sides: ReadonlyMap<string, "UPPER" | "LOWER" | null>,
  constraints: Array<V3SelectionConstraints<ActiveMatchmakerV3Player<T>>>,
  opportunities: Map<string, FacetOpportunities>
) {
  // Structural rules see the whole roster without temporary busy/rest exclusions.
  const roster: ActiveMatchmakerV3Player<T>[] = players.map((player, rank) => ({
    ...player,
    isBusy: false,
    effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
    restTurns: player.restTurns ?? 0,
    randomScore: 0,
    rank,
  }));
  const playersById = new Map(roster.map((player) => [player.userId, player]));
  for (let a = 0; a < roster.length - 3; a += 1) {
    for (let b = a + 1; b < roster.length - 2; b += 1) {
      for (let c = b + 1; c < roster.length - 1; c += 1) {
        for (let d = c + 1; d < roster.length; d += 1) {
          const quartet: [ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>, ActiveMatchmakerV3Player<T>] =
            [roster[a], roster[b], roster[c], roster[d]];
          const quartetIds = quartet.map((player) => player.userId) as [string, string, string, string];
          for (const rule of constraints) {
            if (rule.isQuartetAllowed && !rule.isQuartetAllowed(quartet)) continue;
            for (const rawPartition of getDoublesPartitions(quartetIds)) {
              const partition = rule.normalizePartition
                ? rule.normalizePartition({ partition: rawPartition, players: quartet, playersById })
                : rawPartition;
              const ids = partition && getUniquePartitionIds(partition);
              if (
                !partition || !ids ||
                ids.some((id) => !quartetIds.includes(id)) ||
                !isValidPartitionForMode(partition, playersById, sessionMode)
              ) continue;
              visitExposures(
                partition,
                sessionMode === SessionMode.MIXICANO ? getMatchType(getCourtType(partition, sides)) : null,
                (id, facet, experience) => opportunities.get(id)?.[facet].add(experience)
              );
            }
          }
        }
      }
    }
  }
}

function countLogCount(count: number) {
  return count > 0 ? count * Math.log(count) : 0;
}

function buildHistogram(opportunities: Set<string>, allCounts: Map<string, number>): SocialVarietyHistogram {
  const counts = new Map<string, number>();
  let total = 0;
  for (const experience of [...opportunities].sort()) {
    const count = allCounts.get(experience) ?? 0;
    if (count <= 0) continue;
    counts.set(experience, count);
    total += count;
  }
  const countLogCountSum = [...counts.values()]
    .sort((left, right) => left - right)
    .reduce((sum, count) => sum + countLogCount(count), 0);
  return { opportunities: new Set(opportunities), counts, total, countLogCountSum };
}

function getCoverageFacet(histogram: SocialVarietyHistogram): SocialVarietyCoverageFacet {
  const possible = histogram.opportunities.size;
  let covered = 0;
  for (const opportunity of histogram.opportunities) {
    if ((histogram.counts.get(opportunity) ?? 0) > 0) covered += 1;
  }
  return { covered, possible, score: possible > 0 ? covered / possible : null };
}

function meanPresent(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

/**
 * Measures whether each player has experienced the structurally feasible
 * relationship vocabulary. This is coverage, not normalized Shannon entropy:
 * each distinct relationship contributes once regardless of repetition count.
 */
export function getSocialVarietyCoverage(context: SocialVarietyContext): SocialVarietyCoverage {
  const players = new Map<string, SocialVarietyPlayerCoverage>();
  for (const [userId, histograms] of context.playersByUserId) {
    const courtmates = getCoverageFacet(histograms.courtmates);
    const partners = getCoverageFacet(histograms.partners);
    const opponents = getCoverageFacet(histograms.opponents);
    const mixed = getCoverageFacet({
      ...histograms.matchType,
      opportunities: new Set(histograms.matchType.opportunities.has("MIXED") ? ["MIXED"] : []),
    });
    const ownSide = getCoverageFacet({
      ...histograms.matchType,
      opportunities: new Set(histograms.matchType.opportunities.has("OWN_SIDE") ? ["OWN_SIDE"] : []),
    });
    const relationshipScore = meanPresent([courtmates.score, partners.score, opponents.score]);
    players.set(userId, { userId, relationshipScore, courtmates, partners, opponents, matchTypes: { MIXED: mixed, OWN_SIDE: ownSide } });
  }
  const playerCoverage = [...players.values()];
  return {
    score: meanPresent(playerCoverage.map((player) => player.relationshipScore)),
    courtmateScore: meanPresent(playerCoverage.map((player) => player.courtmates.score)),
    partnerScore: meanPresent(playerCoverage.map((player) => player.partners.score)),
    opponentScore: meanPresent(playerCoverage.map((player) => player.opponents.score)),
    matchTypeScores: {
      MIXED: meanPresent(playerCoverage.map((player) => player.matchTypes.MIXED.score)),
      OWN_SIDE: meanPresent(playerCoverage.map((player) => player.matchTypes.OWN_SIDE.score)),
    },
    players,
  };
}

/**
 * Lifetime diversity, projected onto a fixed roster-level legal vocabulary.
 * Constraint entries are alternatives (a union of structural compositions).
 */
export function buildSocialVarietyContext<T extends MatchmakerV3Player>(
  players: readonly T[],
  matches: readonly SocialHistoryMatch[],
  {
    sessionMode,
    opportunityConstraints,
  }: {
    sessionMode: SessionMode;
    opportunityConstraints?: Array<V3SelectionConstraints<ActiveMatchmakerV3Player<T>>>;
  }
): SocialVarietyContext {
  const sides = buildSideMap(players);
  const roster = players.filter((player) => !player.isPaused);
  const opportunities = new Map(roster.map((player) => [player.userId, emptyOpportunities()]));
  if (opportunityConstraints?.length) {
    buildConstrainedOpportunities(roster, sessionMode, sides, opportunityConstraints, opportunities);
  } else {
    buildUnrestrictedOpportunities(roster, sessionMode, sides, opportunities);
  }
  const counts = new Map(roster.map((player) => [player.userId, emptyFacetMaps()]));
  const includedIds = new Set<string>();
  for (const match of matches) {
    if (!getUniquePartitionIds(match)) continue;
    if (match.id) {
      if (includedIds.has(match.id)) continue;
      includedIds.add(match.id);
    }
    const snapshot = parseSocialVarietySnapshot(match.socialVariety, match);
    const courtType = snapshot ? snapshot.courtType : getCourtType(match, sides);
    visitExposures(
      match,
      sessionMode === SessionMode.MIXICANO ? getMatchType(courtType) : null,
      (id, facet, experience) => {
        const facetCounts = counts.get(id)?.[facet];
        if (facetCounts) facetCounts.set(experience, (facetCounts.get(experience) ?? 0) + 1);
      }
    );
  }
  const playersByUserId = new Map<string, SocialVarietyPlayerContext>();
  for (const player of roster) {
    const vocabulary = opportunities.get(player.userId)!;
    const playerCounts = counts.get(player.userId)!;
    playersByUserId.set(player.userId, {
      courtmates: buildHistogram(vocabulary.courtmates, playerCounts.courtmates),
      partners: buildHistogram(vocabulary.partners, playerCounts.partners),
      opponents: buildHistogram(vocabulary.opponents, playerCounts.opponents),
      matchType: buildHistogram(vocabulary.matchType, playerCounts.matchType),
    });
  }
  return { sessionMode, effectiveSideByUserId: sides, playersByUserId };
}

function getEntropyGain(histogram: SocialVarietyHistogram, additions: Map<string, number>) {
  const opportunityCount = histogram.opportunities.size;
  if (opportunityCount < 2) return 0;
  let addedTotal = 0;
  let addedCountLogCount = 0;
  const orderedAdditions = [...additions].sort(([leftExperience, leftAdded], [rightExperience, rightAdded]) =>
    (histogram.counts.get(leftExperience) ?? 0) - (histogram.counts.get(rightExperience) ?? 0) || leftAdded - rightAdded
  );
  for (const [experience, added] of orderedAdditions) {
    if (!histogram.opportunities.has(experience)) continue;
    const count = histogram.counts.get(experience) ?? 0;
    addedTotal += added;
    // log1p preserves the marginal change when a session has large counts.
    addedCountLogCount += count > 0
      ? added * Math.log(count) + (count + added) * Math.log1p(added / count)
      : countLogCount(added);
  }
  if (addedTotal === 0) return 0;
  const nextTotal = histogram.total + addedTotal;
  const gain = histogram.total === 0
    ? Math.log(nextTotal) - addedCountLogCount / nextTotal
    : Math.log1p(addedTotal / histogram.total) +
      ((histogram.countLogCountSum / histogram.total) * addedTotal - addedCountLogCount) / nextTotal;
  return gain / Math.log(opportunityCount);
}

/** Gains sum exactly across disjoint courts because each player appears once. */
export function getSocialVarietyGains(
  partition: V3DoublesPartition,
  context: SocialVarietyContext
): SocialVarietyGains {
  const gains: SocialVarietyGains = { courtmates: 0, partners: 0, opponents: 0, matchType: 0 };
  if (!getUniquePartitionIds(partition)) return gains;
  const additionsByUserId = new Map<string, FacetMaps>();
  const courtType = getCourtType(partition, context.effectiveSideByUserId);
  visitExposures(
    partition,
    context.sessionMode === SessionMode.MIXICANO ? getMatchType(courtType) : null,
    (id, facet, experience) => {
      let additions = additionsByUserId.get(id);
      if (!additions) {
        additions = emptyFacetMaps();
        additionsByUserId.set(id, additions);
      }
      const facetCounts = additions[facet];
      facetCounts.set(experience, (facetCounts.get(experience) ?? 0) + 1);
    }
  );
  const playerGains: Record<SocialFacet, number[]> = { courtmates: [], partners: [], opponents: [], matchType: [] };
  for (const [id, additions] of additionsByUserId) {
    const player = context.playersByUserId.get(id);
    if (!player) continue;
    for (const facet of ["courtmates", "partners", "opponents", "matchType"] as const) {
      playerGains[facet].push(getEntropyGain(player[facet], additions[facet]));
    }
  }
  for (const facet of ["courtmates", "partners", "opponents", "matchType"] as const) {
    gains[facet] = playerGains[facet].sort((left, right) => left - right).reduce((sum, gain) => sum + gain, 0);
  }
  return gains;
}

export function sumSocialVarietyGains(gains: SocialVarietyGains) {
  return gains.courtmates + gains.partners + gains.opponents + gains.matchType;
}

export function getSocialVarietyGain(partition: V3DoublesPartition, context: SocialVarietyContext) {
  return sumSocialVarietyGains(getSocialVarietyGains(partition, context));
}
