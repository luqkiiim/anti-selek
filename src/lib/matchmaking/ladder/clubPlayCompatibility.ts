import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, SessionMode } from "@/types/enums";
import type { LevelCompatibility } from "./levelCompatibility";
import { LEVEL_SKILL_UNIT } from "./levelCompatibility";
import type { LadderDoublesPartition, MatchmakerLadderPlayer } from "./types";

type RatedPlayer = Pick<MatchmakerLadderPlayer,
  "userId" | "strength" | "isPaused" | "gender" | "partnerPreference" | "mixedSideOverride">;

function median(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const midpoint = Math.floor(ordered.length / 2);
  return (ordered[midpoint] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2;
}

/** Elo's expected-result distance from an even head-to-head, scaled to [0, 1]. */
function eloDistance(gap: number) {
  return 2 / (1 + 10 ** (-Math.abs(gap) / 400)) - 1;
}

function buildNeighborhood(players: readonly RatedPlayer[]) {
  const ordered = [...players].sort((left, right) => left.strength - right.strength);
  const values = [...new Set(ordered.map((player) => player.strength))];
  const gaps = values.slice(1).map((value, index) => value - values[index]);
  const typicalGap = median(gaps);
  const gapPressure = gaps.map((gap, index) => {
    const neighbors = [...gaps.slice(Math.max(0, index - 2), index), ...gaps.slice(index + 1, index + 3)];
    const localGap = neighbors.length >= 2 ? median(neighbors) : typicalGap;
    return gap / (gap + localGap);
  });
  const center = median(ordered.map((player) => player.strength));
  const positions = new Map<number, { index: number; quantile: number }>();
  for (let start = 0, index = 0; start < ordered.length; index++) {
    const rating = ordered[start].strength;
    let end = start + 1;
    while (end < ordered.length && ordered[end].strength === rating) end++;
    positions.set(rating, { index, quantile: (start + end) / (2 * ordered.length) });
    start = end;
  }

  const distances = new Map<number, Map<number, number>>();
  const distance = (left: number, right: number) => {
    const low = Math.min(left, right);
    const high = Math.max(left, right);
    const cached = distances.get(low)?.get(high);
    if (cached !== undefined) return cached;
    const numerical = eloDistance(left - right);
    const a = positions.get(low);
    const b = positions.get(high);
    if (!a || !b || a.index === b.index) return numerical;
    const mostIsolatedGap = Math.max(...gapPressure.slice(a.index, b.index));
    const cost = numerical + 0.35 * Math.sqrt(numerical) * (b.quantile - a.quantile + mostIsolatedGap) / 2;
    const byHigh = distances.get(low) ?? new Map<number, number>();
    byHigh.set(high, cost);
    distances.set(low, byHigh);
    return cost;
  };

  // One extra local candidate beyond a four-player court gives distribution
  // room to influence close decisions. Cap that room by typical local steps
  // so a gap beyond a tight cluster does not make that gap acceptable.
  const localWidths = ordered.map((player) => {
    const nearby = ordered.filter((other) => other.userId !== player.userId)
      .map((other) => distance(player.strength, other.strength)).sort((left, right) => left - right);
    return {
      step: nearby[0] ?? 0,
      neighborhood: nearby[Math.min(3, nearby.length - 1)] ?? 0,
    };
  });
  return {
    center,
    distance,
    typicalWidth: Math.min(
      3 * median(localWidths.map((width) => width.step)),
      median(localWidths.map((width) => width.neighborhood)),
    ),
    quantile: (rating: number) => positions.get(rating)?.quantile ?? 0.5,
  };
}

function summarizeCosts(costs: readonly number[]) {
  return {
    worst: Math.round(Math.max(...costs) * LEVEL_SKILL_UNIT),
    mean: Math.round(costs.reduce((sum, value) => sum + value, 0) / costs.length * LEVEL_SKILL_UNIT),
  };
}

export function buildClubPlayCompatibilityScorer(
  players: readonly RatedPlayer[], sessionMode = SessionMode.MIXICANO,
) {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  // Busy players remain members of the same skill neighborhood as they cycle on and off court.
  const roster = players.filter((player) => !player.isPaused && Number.isFinite(player.strength));
  const enrollment = (side: MixedSide) => roster.filter((player) => sides.get(player.userId) === side);
  const upper = buildNeighborhood(enrollment(MixedSide.UPPER));
  const lower = buildNeighborhood(enrollment(MixedSide.LOWER));
  const overall = buildNeighborhood(roster);
  const typicalWidths = [upper.typicalWidth, lower.typicalWidth].filter((width) => width > 0);
  const frontierMargin = Math.round(
    (sessionMode === SessionMode.MIXICANO && typicalWidths.length
      ? median(typicalWidths) : overall.typicalWidth) * LEVEL_SKILL_UNIT
  );

  return {
    frontierMargin,
    score(quartet: readonly RatedPlayer[]): LevelCompatibility {
      const strongerSide = sessionMode === SessionMode.MIXICANO
        ? quartet.filter((player) => sides.get(player.userId) === MixedSide.UPPER) : [];
      const otherSide = sessionMode === SessionMode.MIXICANO
        ? quartet.filter((player) => sides.get(player.userId) === MixedSide.LOWER) : [];
      if (strongerSide.length === 2 && otherSide.length === 2) {
        const upperStrengths = strongerSide.map((player) => player.strength).sort((left, right) => left - right);
        const lowerStrengths = otherSide.map((player) => player.strength).sort((left, right) => left - right);
        const percentileGaps = upperStrengths.map((strength, index) =>
          Math.abs(upper.quantile(strength) - lower.quantile(lowerStrengths[index])));
        const costs = [
          upper.distance(upperStrengths[0], upperStrengths[1]),
          lower.distance(lowerStrengths[0], lowerStrengths[1]),
          ...percentileGaps,
        ];
        return {
          ...summarizeCosts(costs),
          matchType: "MIXED",
          relativeGap: Math.max(...percentileGaps),
          withinSideGap: Math.max(upperStrengths[1] - upperStrengths[0], lowerStrengths[1] - lowerStrengths[0]),
        };
      }

      const matchType = strongerSide.length === 4 ? "UPPER" : otherSide.length === 4 ? "LOWER" : null;
      const neighborhood = matchType === "UPPER" ? upper : matchType === "LOWER" ? lower : overall;
      const costs = quartet.flatMap((player, index) =>
        quartet.slice(index + 1).map((other) => neighborhood.distance(player.strength, other.strength)));
      return { ...summarizeCosts(costs), matchType, relativeGap: null, withinSideGap: null };
    },
    partnerGap(partition: LadderDoublesPartition) {
      const adjusted = (id: string) => {
        const strength = byId.get(id)?.strength ?? 0;
        const side = sides.get(id);
        if (sessionMode !== SessionMode.MIXICANO) return strength;
        return strength - (side === MixedSide.UPPER ? upper.center : side === MixedSide.LOWER ? lower.center : 0);
      };
      return Math.round(Math.max(
        eloDistance(adjusted(partition.team1[0]) - adjusted(partition.team1[1])),
        eloDistance(adjusted(partition.team2[0]) - adjusted(partition.team2[1])),
      ) * LEVEL_SKILL_UNIT);
    },
  };
}
