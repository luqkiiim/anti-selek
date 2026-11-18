import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, SessionBalanceMetric, SessionMode } from "@/types/enums";
import { getBalancedMatchTypeTarget } from "../v3/balancedMatchTypes";
import {
  buildSocialMixHistory, getExactPartitionKey, getOpponentCoveragePenalty,
  getPartnerCoveragePenalty, getSharedCourtEncounterFrequencyPenalty, getSharedCourtRepeatPenalty,
} from "../v3/rematch";
import { type SocialHistoryMatch } from "../v3/socialVariety";
import type { LadderDoublesPartition, LadderGroupingSummary, MatchmakerLadderPlayer } from "./types";

export type LevelMatchType = "MIXED" | "UPPER" | "LOWER";
export type LevelVarietyCost = [number, number, number, number, number, number];

export interface LevelCompatibility {
  worst: number;
  mean: number;
  matchType: LevelMatchType | null;
  withinSideGap: number | null;
  relativeGap: number | null;
}

// One compatibility unit corresponds to a 100-rating or two-point spread,
// or a half-roster separation in mixed-side position. Use integer subunits
// to keep search bounds and comparisons exact.
export const LEVEL_SKILL_UNIT = 1_000;
export const LEVEL_SEVERE_COMPATIBILITY = 2.5 * LEVEL_SKILL_UNIT;

export function buildLevelCompatibilityScorer(
  players: readonly MatchmakerLadderPlayer[], sessionMode: SessionMode, metric: SessionBalanceMetric,
) {
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  const position = new Map<string, number>();
  if (sessionMode === SessionMode.MIXICANO) {
    for (const side of [MixedSide.UPPER, MixedSide.LOWER]) {
      // Busy players stay in the reference population. Only the selector
      // decides which of these players can be picked for the next court.
      const ordered = players.filter((player) => !player.isPaused && Number.isFinite(player.strength) && sides.get(player.userId) === side)
        .sort((left, right) => left.strength - right.strength);
      for (let start = 0; start < ordered.length;) {
        let end = start + 1;
        while (end < ordered.length && ordered[end].strength === ordered[start].strength) end++;
        // Midpoints of quantile intervals handle ties, unequal sides and
        // small rosters without treating an ordinal rank as a percentile.
        const percentile = (start + end) / (2 * ordered.length);
        for (let index = start; index < end; index++) position.set(ordered[index].userId, percentile);
        start = end;
      }
    }
  }
  const scale = LEVEL_SKILL_UNIT / (metric === SessionBalanceMetric.RATING ? 100 : 2);
  return (quartet: readonly MatchmakerLadderPlayer[], raw: LadderGroupingSummary): LevelCompatibility => {
    const upper = sessionMode === SessionMode.MIXICANO ? quartet.filter((player) => sides.get(player.userId) === MixedSide.UPPER) : [];
    const lower = sessionMode === SessionMode.MIXICANO ? quartet.filter((player) => sides.get(player.userId) === MixedSide.LOWER) : [];
    if (upper.length === 2 && lower.length === 2 && quartet.every((player) => position.has(player.userId))) {
      const upperPositions = upper.map((player) => position.get(player.userId)!).sort((a, b) => a - b);
      const lowerPositions = lower.map((player) => position.get(player.userId)!).sort((a, b) => a - b);
      const relativeGaps = upperPositions.map((value, index) => Math.abs(value - lowerPositions[index]));
      const withinGaps = [Math.abs(upper[0].strength - upper[1].strength), Math.abs(lower[0].strength - lower[1].strength)];
      const costs = [...withinGaps.map((gap) => gap * scale), ...relativeGaps.map((gap) => gap * 2 * LEVEL_SKILL_UNIT)];
      return {
        worst: Math.round(Math.max(...costs)),
        mean: Math.round(costs.reduce((sum, value) => sum + value, 0) / costs.length),
        matchType: "MIXED",
        withinSideGap: Math.max(...withinGaps),
        relativeGap: Math.max(...relativeGaps),
      };
    }
    return {
      worst: Math.round(raw.maxLadderGap * scale),
      mean: Math.round(raw.totalLadderGap * scale / 6),
      matchType: upper.length === 4 ? "UPPER" : lower.length === 4 ? "LOWER" : null,
      withinSideGap: null,
      relativeGap: null,
    };
  };
}

export function buildLevelVarietyScorer(
  players: readonly MatchmakerLadderPlayer[], history: readonly SocialHistoryMatch[], sessionMode: SessionMode,
) {
  const seen = new Set<string>();
  const matches = history.filter((match) => {
    if (new Set([...match.team1, ...match.team2]).size !== 4 || (match.id && seen.has(match.id))) return false;
    if (match.id) seen.add(match.id);
    return true;
  });
  const relationships = buildSocialMixHistory(matches);
  const exactCounts = new Map<string, number>();
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  const exposures = new Map<string, { mixed: number; total: number }>();
  for (const match of matches) {
    const key = getExactPartitionKey(match);
    exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
    if (sessionMode !== SessionMode.MIXICANO) continue;
    const ids = [...match.team1, ...match.team2];
    const knownSides = ids.map((id) => sides.get(id));
    const type = match.socialVariety ? match.socialVariety.courtType :
      knownSides.every((side) => side && side === knownSides[0]) ? knownSides[0] :
        knownSides.every(Boolean) && knownSides[0] !== knownSides[1] && knownSides[2] !== knownSides[3] ? "MIXED" : null;
    if (!type) continue;
    for (const id of ids) {
      const exposure = exposures.get(id) ?? { mixed: 0, total: 0 };
      exposure.total++;
      if (type === "MIXED") exposure.mixed++;
      exposures.set(id, exposure);
    }
  }
  const roster = players.filter((player) => !player.isPaused);
  const upper = roster.filter((player) => sides.get(player.userId) === MixedSide.UPPER).length;
  const lower = roster.filter((player) => sides.get(player.userId) === MixedSide.LOWER).length;
  const target = sessionMode === SessionMode.MIXICANO ? getBalancedMatchTypeTarget(upper, lower) : null;
  const typeCosts = new Map<string, { mixed: number; own: number }>();
  if (target) {
    for (const [id, exposure] of exposures) {
      const side = sides.get(id);
      if (!side) continue;
      const proportion = target.MIXED / (2 * target[side] + target.MIXED);
      if (!Number.isFinite(proportion)) continue;
      const error = exposure.mixed - proportion * exposure.total;
      const cost = (mixed: number) => Math.round(100 * (Math.abs(error + mixed - proportion) - Math.abs(error)));
      typeCosts.set(id, { mixed: cost(1), own: cost(0) });
    }
  }
  return (partition: LadderDoublesPartition, type: LevelMatchType | null): LevelVarietyCost => [
    getSharedCourtRepeatPenalty(partition, relationships),
    type ? [...partition.team1, ...partition.team2].reduce((cost, id) => cost + (typeCosts.get(id)?.[type === "MIXED" ? "mixed" : "own"] ?? 0), 0) : 0,
    getOpponentCoveragePenalty(partition, relationships),
    getPartnerCoveragePenalty(partition, relationships),
    exactCounts.get(getExactPartitionKey(partition)) ?? 0,
    getSharedCourtEncounterFrequencyPenalty(partition, relationships),
  ];
}
