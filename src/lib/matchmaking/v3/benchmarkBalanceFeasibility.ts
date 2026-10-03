import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { SessionMode, SessionType } from "../../../types/enums";
import { getBalanceGuardrailPolicy } from "./balanceGuardrail";
import { buildSocialVarietyContext } from "./socialVariety";
import type { MatchmakerV3Player, V3DoublesPartition, V3SelectionConstraints } from "./types";
import type { ActiveMatchmakerV3Player } from "./types";

export type RelationshipFacet = "partners" | "opponents" | "courtmates";
export type StaticBalanceClassification =
  | "ADMISSIBLE"
  | "BALANCE_GUARDRAIL"
  | "STRUCTURAL_BATCH_CONSTRAINT"
  | "STRONGER_SCHEDULE_PRIORITY"
  | "NO_ADMISSIBLE_BATCH";

export interface StaticBalanceSchedule {
  rank: number;
  courts: Array<V3SelectionConstraints<ActiveMatchmakerV3Player> | undefined>;
}

export interface StaticRelationshipBalanceEvidence {
  playerId: string;
  otherPlayerId: string;
  /** Best single-court strength gap among structurally legal layouts. */
  minimumSingleCourtBalanceGap: number | null;
  /** True if an equally fair two-court batch inside the static envelope contains this relation. */
  admissibleInStrongestSchedule: boolean;
  /** Static classification only; this does not imply permanent exclusion as fairness classes evolve. */
  classification: StaticBalanceClassification;
}

export interface StaticBalanceFeasibilityReport {
  /** This report fixes the initial equal-count roster class and two-court refill shape. */
  analysisBasis: "STATIC_EQUAL_COUNT_TWO_COURT_ROSTER";
  sessionType: SessionType.POINTS | SessionType.ELO;
  sessionMode: SessionMode;
  strongestScheduleRank: number | null;
  bestBatchMaxBalanceGap: number | null;
  bestBatchTotalBalanceGap: number | null;
  allowedMaxBalanceGap: number | null;
  allowedTotalBalanceGap: number | null;
  ceilingFeasible: boolean | null;
  /** True when Elo's 50-point ceiling cannot be met by the strongest static rotation class. */
  ratingCeilingFallback: boolean;
  byFacet: Record<RelationshipFacet, StaticRelationshipBalanceEvidence[]>;
  structurallyFeasibleRelationshipCount: number;
  admissibleRelationshipCount: number;
  balanceGuardrailExcludedRelationshipCount: number;
  balanceGuardrailExcludedRelationships: Array<StaticRelationshipBalanceEvidence & { facet: RelationshipFacet }>;
}

interface CourtLayout {
  ids: string[];
  balanceGap: number;
  relations: Set<string>;
}

interface CourtBatch {
  left: CourtLayout;
  right: CourtLayout;
  maxBalanceGap: number;
  totalBalanceGap: number;
}

const FACETS: readonly RelationshipFacet[] = ["partners", "opponents", "courtmates"];

function relationshipKey(facet: RelationshipFacet, playerId: string, otherPlayerId: string) {
  return `${facet}\u0000${playerId}\u0000${otherPlayerId}`;
}

function partitionKey(partition: V3DoublesPartition) {
  const teamKey = (team: readonly string[]) => [...team].sort().join("+");
  return [teamKey(partition.team1), teamKey(partition.team2)].sort().join("/");
}

function partitions(ids: readonly string[]): V3DoublesPartition[] {
  const [a, b, c, d] = ids;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

function isValidPartition(partition: V3DoublesPartition, ids: readonly string[], sides: ReadonlyMap<string, string | null>, mode: SessionMode) {
  const allIds = [...partition.team1, ...partition.team2];
  if (allIds.length !== 4 || new Set(allIds).size !== 4 || allIds.some((id) => !ids.includes(id))) return false;
  if (mode !== SessionMode.MIXICANO) return true;
  const leftSides = partition.team1.map((id) => sides.get(id));
  const rightSides = partition.team2.map((id) => sides.get(id));
  if ([...leftSides, ...rightSides].some((side) => side !== "UPPER" && side !== "LOWER")) return false;
  const lowerCount = (team: readonly (string | null | undefined)[]) => team.filter((side) => side === "LOWER").length;
  // MIXICANO permits an all-upper/all-lower court and one upper plus one lower
  // on each team. The remaining 2+0 split is structurally illegal.
  return lowerCount(leftSides) === lowerCount(rightSides);
}

function balanceGap(partition: V3DoublesPartition, playersById: ReadonlyMap<string, MatchmakerV3Player>) {
  const teamAverage = (team: readonly string[]) => team.reduce((sum, id) => sum + playersById.get(id)!.strength, 0) / 2;
  return Math.abs(teamAverage(partition.team1) - teamAverage(partition.team2));
}

function exposedRelations(partition: V3DoublesPartition) {
  const result = new Set<string>();
  const teams = [partition.team1, partition.team2];
  const ids = teams.flatMap((team) => [...team]);
  for (let side = 0; side < teams.length; side += 1) {
    const team = teams[side];
    const opponents = teams[1 - side];
    for (let seat = 0; seat < team.length; seat += 1) {
      const playerId = team[seat];
      const partnerId = team[1 - seat];
      result.add(relationshipKey("partners", playerId, partnerId));
      result.add(relationshipKey("courtmates", playerId, partnerId));
      for (const opponentId of opponents) {
        result.add(relationshipKey("opponents", playerId, opponentId));
        result.add(relationshipKey("courtmates", playerId, opponentId));
      }
    }
  }
  return { ids, result };
}

/**
 * Enumerate the shared structural opportunity vocabulary and the minimum
 * two-court balance envelope for a fixed roster. This is a static benchmark
 * diagnostic: all unpaused players are treated as equally fair and available.
 * It does not use observed balance windows from later session rotation classes.
 */
export function analyzeStaticBalancedRelationshipFeasibility(
  players: readonly MatchmakerV3Player[],
  {
    sessionMode,
    sessionType,
    schedules,
  }: {
    sessionMode: SessionMode;
    sessionType: SessionType.POINTS | SessionType.ELO;
    schedules?: readonly StaticBalanceSchedule[];
  }
): StaticBalanceFeasibilityReport {
  const policy = getBalanceGuardrailPolicy(sessionType);
  if (!policy) throw new RangeError("Static balance feasibility requires Points or Rating/Elo.");
  const roster = players.filter((player) => !player.isPaused);
  const active = roster.map((player, rank) => ({
    ...player,
    isBusy: false,
    effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
    restTurns: player.restTurns ?? 0,
    randomScore: 0,
    rank,
  }));
  const profiles = schedules?.length
    ? schedules.filter((schedule) => schedule.courts.length === 2)
    : [{ rank: 0, courts: [undefined, undefined] }];
  const opportunityConstraints = profiles.flatMap((profile) => profile.courts)
    .filter((constraint): constraint is V3SelectionConstraints<ActiveMatchmakerV3Player> => Boolean(constraint));
  const vocabulary = buildSocialVarietyContext(roster, [], { sessionMode, opportunityConstraints });
  const playersById = new Map(roster.map((player) => [player.userId, player]));
  const activePlayersById = new Map(active.map((player) => [player.userId, player]));
  const sides = new Map(roster.map((player) => [player.userId, getEffectiveMixedSide({
    gender: player.gender,
    partnerPreference: player.partnerPreference,
    mixedSideOverride: player.mixedSideOverride,
  })]));

  const structurallyFeasible = new Map<string, { facet: RelationshipFacet; playerId: string; otherPlayerId: string }>();
  for (const [playerId, facets] of vocabulary.playersByUserId) {
    for (const facet of FACETS) {
      for (const otherPlayerId of facets[facet].opportunities) {
        const key = relationshipKey(facet, playerId, otherPlayerId);
        structurallyFeasible.set(key, { facet, playerId, otherPlayerId });
      }
    }
  }

  const minimumGapByRelationship = new Map([...structurallyFeasible.keys()].map((key) => [key, Infinity]));
  const layoutsByCourt = profiles.map((profile) => profile.courts.map((constraint) => {
    const layouts: CourtLayout[] = [];
    const seen = new Set<string>();
    for (let a = 0; a < active.length - 3; a += 1) {
      for (let b = a + 1; b < active.length - 2; b += 1) {
        for (let c = b + 1; c < active.length - 1; c += 1) {
          for (let d = c + 1; d < active.length; d += 1) {
            const quartet = [active[a], active[b], active[c], active[d]] as [
              ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
              ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
            ];
            if (constraint?.isQuartetAllowed && !constraint.isQuartetAllowed(quartet)) continue;
            const ids = quartet.map((player) => player.userId);
            for (const rawPartition of partitions(ids)) {
              const partition = constraint?.normalizePartition
                ? constraint.normalizePartition({ partition: rawPartition, players: quartet, playersById: activePlayersById })
                : rawPartition;
              if (!partition || !isValidPartition(partition, ids, sides, sessionMode)) continue;
              const key = partitionKey(partition);
              if (seen.has(key)) continue;
              seen.add(key);
              const gap = balanceGap(partition, playersById);
              const exposure = exposedRelations(partition);
              const relations = new Set([...exposure.result].filter((relation) => structurallyFeasible.has(relation)));
              for (const relation of relations) minimumGapByRelationship.set(relation, Math.min(minimumGapByRelationship.get(relation) ?? Infinity, gap));
              layouts.push({ ids: exposure.ids, balanceGap: gap, relations });
            }
          }
        }
      }
    }
    return layouts;
  }));

  const bestEnvelopeByRank = new Map<number, { maxBalanceGap: number; totalBalanceGap: number }>();
  const forEachDisjointBatch = (profileIndex: number, visit: (batch: CourtBatch) => void) => {
    const [leftLayouts, rightLayouts] = layoutsByCourt[profileIndex];
    for (const left of leftLayouts) {
      for (const right of rightLayouts) {
        if (left.ids.some((id) => right.ids.includes(id))) continue;
        visit({
          left,
          right,
          maxBalanceGap: Math.max(left.balanceGap, right.balanceGap),
          totalBalanceGap: left.balanceGap + right.balanceGap,
        });
      }
    }
  };
  for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
    const profile = profiles[profileIndex];
    forEachDisjointBatch(profileIndex, (batch) => {
      const existing = bestEnvelopeByRank.get(profile.rank);
      if (!existing || batch.maxBalanceGap < existing.maxBalanceGap) {
        bestEnvelopeByRank.set(profile.rank, {
          maxBalanceGap: batch.maxBalanceGap,
          totalBalanceGap: batch.totalBalanceGap,
        });
      } else if (batch.maxBalanceGap === existing.maxBalanceGap && batch.totalBalanceGap < existing.totalBalanceGap) {
        existing.totalBalanceGap = batch.totalBalanceGap;
      }
    });
  }

  const strongestScheduleRank = [...bestEnvelopeByRank.keys()].reduce<number | null>(
    (best, rank) => best === null || rank < best ? rank : best,
    null
  );
  const bestEnvelope = strongestScheduleRank === null ? null : bestEnvelopeByRank.get(strongestScheduleRank) ?? null;
  const presentAtStrongestSchedule = new Set<string>();
  if (strongestScheduleRank !== null) {
    profiles.forEach((profile, profileIndex) => {
      if (profile.rank !== strongestScheduleRank) return;
      for (const court of layoutsByCourt[profileIndex]) {
        for (const layout of court) for (const relation of layout.relations) presentAtStrongestSchedule.add(relation);
      }
    });
  }
  const bestBatchMaxBalanceGap = bestEnvelope?.maxBalanceGap ?? null;
  const bestBatchTotalBalanceGap = bestEnvelope?.totalBalanceGap ?? null;
  const ceilingFeasible = bestBatchMaxBalanceGap === null || policy.absoluteCeiling === null || bestBatchMaxBalanceGap <= policy.absoluteCeiling;
  const allowedMaxBalanceGap = bestBatchMaxBalanceGap === null ? null : ceilingFeasible
    ? Math.min(bestBatchMaxBalanceGap + policy.nearBestWindow, policy.absoluteCeiling ?? Infinity)
    : bestBatchMaxBalanceGap;
  const allowedTotalBalanceGap = ceilingFeasible ? null : bestBatchTotalBalanceGap;
  const presentInStrongestSchedule = new Set<string>();
  const admissibleInEnvelope = new Set<string>();
  if (strongestScheduleRank !== null) {
    for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
      if (profiles[profileIndex].rank !== strongestScheduleRank) continue;
      const [leftLayouts, rightLayouts] = layoutsByCourt[profileIndex];
      for (const left of leftLayouts) {
        for (const right of rightLayouts) {
          if (left.ids.some((id) => right.ids.includes(id))) continue;
          const allRelations = [...left.relations, ...right.relations];
          for (const relation of allRelations) presentInStrongestSchedule.add(relation);
          const maximumGap = Math.max(left.balanceGap, right.balanceGap);
          const totalGap = left.balanceGap + right.balanceGap;
          const insideEnvelope = maximumGap <= (allowedMaxBalanceGap ?? -Infinity) &&
            (allowedTotalBalanceGap === null || totalGap <= allowedTotalBalanceGap);
          if (insideEnvelope) {
            for (const relation of allRelations) admissibleInEnvelope.add(relation);
          }
        }
      }
    }
  }

  const byFacet: StaticBalanceFeasibilityReport["byFacet"] = { partners: [], opponents: [], courtmates: [] };
  for (const opportunity of structurallyFeasible.values()) {
    const key = relationshipKey(opportunity.facet, opportunity.playerId, opportunity.otherPlayerId);
    const inStrongest = presentInStrongestSchedule.has(key);
    const admissible = admissibleInEnvelope.has(key);
    const minimum = minimumGapByRelationship.get(key) ?? Infinity;
    const classification: StaticBalanceClassification = admissible
      ? "ADMISSIBLE"
      : inStrongest
        ? "BALANCE_GUARDRAIL"
        : presentAtStrongestSchedule.has(key)
          ? "STRUCTURAL_BATCH_CONSTRAINT"
          : strongestScheduleRank === null
          ? "NO_ADMISSIBLE_BATCH"
          : "STRONGER_SCHEDULE_PRIORITY";
    byFacet[opportunity.facet].push({
      playerId: opportunity.playerId,
      otherPlayerId: opportunity.otherPlayerId,
      minimumSingleCourtBalanceGap: Number.isFinite(minimum) ? minimum : null,
      admissibleInStrongestSchedule: admissible,
      classification,
    });
  }
  for (const facet of FACETS) byFacet[facet].sort((left, right) =>
    left.playerId.localeCompare(right.playerId) || left.otherPlayerId.localeCompare(right.otherPlayerId)
  );
  const all = FACETS.flatMap((facet) => byFacet[facet].map((evidence) => ({ ...evidence, facet })));
  const balanceGuardrailExcludedRelationships = all.filter((evidence) => evidence.classification === "BALANCE_GUARDRAIL");
  return {
    analysisBasis: "STATIC_EQUAL_COUNT_TWO_COURT_ROSTER",
    sessionType,
    sessionMode,
    strongestScheduleRank,
    bestBatchMaxBalanceGap,
    bestBatchTotalBalanceGap,
    allowedMaxBalanceGap,
    allowedTotalBalanceGap,
    ceilingFeasible: bestBatchMaxBalanceGap === null ? null : ceilingFeasible,
    ratingCeilingFallback: sessionType === SessionType.ELO && bestBatchMaxBalanceGap !== null && !ceilingFeasible,
    byFacet,
    structurallyFeasibleRelationshipCount: all.length,
    admissibleRelationshipCount: all.filter((evidence) => evidence.classification === "ADMISSIBLE").length,
    balanceGuardrailExcludedRelationshipCount: balanceGuardrailExcludedRelationships.length,
    balanceGuardrailExcludedRelationships,
  };
}
