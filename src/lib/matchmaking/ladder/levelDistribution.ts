import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, SessionMode } from "@/types/enums";
import { getBalancedMatchTypeTarget } from "../v3/balancedMatchTypes";
import { getExactPartitionKey } from "../v3/rematch";
import type { SocialHistoryMatch, V3DoublesPartition } from "../v3/types";

export const LEVEL_MATCH_TYPES = ["UPPER", "MIXED", "LOWER"] as const;
export type LevelMatchType = typeof LEVEL_MATCH_TYPES[number];
type Shares = Record<LevelMatchType, number>;
type Counts = [number, number, number];

export type LevelDistributionPlayer = Parameters<typeof getEffectiveMixedSide>[0] & {
  userId: string;
  pool?: string | null;
  isPaused?: boolean;
};

export interface LevelDistributionSnapshot {
  version: 1;
  partition: string;
  category: LevelMatchType;
  target: Shares;
  mixedTargetByPlayer: Record<string, number>;
  scope: "session" | `pool-a-seats:${number}`;
  feasibility?: "limited-categories" | "no-proportional-target";
}

export function isLevelMatch3Enabled() {
  return process.env.LEVEL_MATCH_3_ENABLED === "1";
}

export function isLevelMatch31Enabled() {
  return process.env.LEVEL_MATCH_31_ENABLED === "1";
}

const zeroCounts = (): Counts => [0, 0, 0];
const isFraction = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function parseLevelDistributionSnapshot(value: unknown, partition: V3DoublesPartition): LevelDistributionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<LevelDistributionSnapshot>;
  if (snapshot.version !== 1 || snapshot.partition !== getExactPartitionKey(partition) ||
    !snapshot.category || !LEVEL_MATCH_TYPES.includes(snapshot.category) || !snapshot.target ||
    !LEVEL_MATCH_TYPES.every((type) => isFraction(snapshot.target![type])) ||
    Math.abs(LEVEL_MATCH_TYPES.reduce((sum, type) => sum + snapshot.target![type], 0) - 1) > 1e-7 ||
    (snapshot.scope !== "session" && !/^pool-a-seats:[0-4]$/.test(snapshot.scope ?? "")) ||
    !snapshot.mixedTargetByPlayer || Object.keys(snapshot.mixedTargetByPlayer).length !== 4 ||
    ![...partition.team1, ...partition.team2].every((id) => isFraction(snapshot.mixedTargetByPlayer![id]))) return null;
  return snapshot as LevelDistributionSnapshot;
}

export function getLevelMatchCategory(partition: V3DoublesPartition, side: (id: string) => MixedSide | null | undefined): LevelMatchType | null {
  const sides = [...partition.team1, ...partition.team2].map(side);
  if (sides.some((entry) => !entry)) return null;
  if (sides.every((entry) => entry === MixedSide.UPPER)) return "UPPER";
  if (sides.every((entry) => entry === MixedSide.LOWER)) return "LOWER";
  return sides[0] !== sides[1] && sides[2] !== sides[3] ? "MIXED" : null;
}

const upperSeatShare = { UPPER: 1, MIXED: 0.5, LOWER: 0 };

function projectTarget(p: number, possible: readonly LevelMatchType[], entropyTarget: Shares | null) {
  if (!possible.length) return null;
  if (possible.length === 3 && entropyTarget) return { target: entropyTarget, feasibility: undefined };
  const target: Shares = { UPPER: 0, MIXED: 0, LOWER: 0 };
  const high = possible[0], low = possible[possible.length - 1];
  const highShare = upperSeatShare[high], lowShare = upperSeatShare[low];
  if (high === low) target[high] = 1;
  else {
    target[high] = Math.max(0, Math.min(1, (p - lowShare) / (highShare - lowShare)));
    target[low] = 1 - target[high];
  }
  const feasibility = p < lowShare - 1e-9 || p > highShare + 1e-9 ? "no-proportional-target" : "limited-categories";
  return { target, feasibility } as const;
}

const rosterPool = (player: LevelDistributionPlayer) => player.pool === "B" ? "B" : "A";

/** Determine target contributions from the structural roster, including busy players. */
export function buildLevelDistributionTargets(players: readonly LevelDistributionPlayer[], groups: boolean) {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  const counts = { A: { UPPER: 0, LOWER: 0 }, B: { UPPER: 0, LOWER: 0 } };
  for (const player of players) {
    const side = sides.get(player.userId);
    if (side && !player.isPaused) counts[groups ? rosterPool(player) : "A"][side]++;
  }
  const totalA = counts.A.UPPER + counts.A.LOWER;
  const totalB = counts.B.UPPER + counts.B.LOWER;
  const bySeats = new Map<number, ReturnType<typeof projectTarget>>();
  for (const aSeats of groups ? [0, 1, 2, 3, 4] : [4]) {
    const bSeats = 4 - aSeats;
    if (aSeats > totalA || bSeats > totalB) continue;
    const possible = LEVEL_MATCH_TYPES.filter((type) => {
      const requiredUpper = 4 * upperSeatShare[type];
      for (let upperA = 0; upperA <= aSeats; upperA++) {
        const upperB = requiredUpper - upperA;
        if (upperB >= 0 && upperB <= bSeats && upperA <= counts.A.UPPER && upperB <= counts.B.UPPER &&
          aSeats - upperA <= counts.A.LOWER && bSeats - upperB <= counts.B.LOWER) return true;
      }
      return false;
    });
    // For 2/2 group courts, any feasible 0/2, 1/1 or 2/0 split of the
    // two upper seats can put one member of each group and side on each team.
    const denominator = 4 * (totalA || 1) * (totalB || 1);
    const upper = aSeats * counts.A.UPPER * (totalB || 1) + bSeats * counts.B.UPPER * (totalA || 1);
    const entropyTarget = groups
      ? getBalancedMatchTypeTarget(upper, denominator - upper)
      : getBalancedMatchTypeTarget(counts.A.UPPER, counts.A.LOWER);
    bySeats.set(aSeats, projectTarget(upper / denominator, possible, entropyTarget));
  }
  return (partition: V3DoublesPartition, knownCategory?: LevelMatchType | null): LevelDistributionSnapshot | undefined => {
    const ids = [...partition.team1, ...partition.team2];
    const category = knownCategory === undefined ? getLevelMatchCategory(partition, (id) => sides.get(id)) : knownCategory;
    const aSeats = groups ? ids.filter((id) => byId.has(id) && rosterPool(byId.get(id)!) === "A").length : 4;
    const projected = bySeats.get(aSeats);
    if (!category || !projected) return undefined;
    const { target, feasibility } = projected;
    const mixedTargetByPlayer = Object.fromEntries(ids.map((id) => {
      const side = sides.get(id);
      const seats = side ? 2 * target[side] + target.MIXED : 0;
      return [id, seats > 0 ? target.MIXED / seats : Number(category === "MIXED")];
    }));
    return { version: 1, partition: getExactPartitionKey(partition), category, target, mixedTargetByPlayer,
      scope: groups ? `pool-a-seats:${aSeats}` : "session", ...(feasibility ? { feasibility } : {}) };
  };
}

const SHARE_UNIT = 10_000;
// Fixed half-match-squared resolution, independent of candidate order. At a
// given batch size, scaling normalized error by T² preserves its units/order.
const ERROR_BAND = SHARE_UNIT * SHARE_UNIT / 2;

export function buildLevelDistributionContext(
  players: readonly LevelDistributionPlayer[], history: readonly SocialHistoryMatch[], mode: SessionMode, groups: boolean,
) {
  const targetFor = buildLevelDistributionTargets(players, groups);
  const actual = zeroCounts(), expected = zeroCounts(), residual = zeroCounts();
  const exposure = new Map<string, { actual: number; expected: number }>();
  let count = 0;
  const impact = (snapshot?: LevelDistributionSnapshot): Counts => {
    if (!snapshot) return zeroCounts();
    const target = LEVEL_MATCH_TYPES.map((type) => Math.round(snapshot.target[type] * SHARE_UNIT));
    target[target.indexOf(Math.max(...target))] += SHARE_UNIT - target.reduce((sum, value) => sum + value, 0);
    return LEVEL_MATCH_TYPES.map((type, i) => Number(snapshot.category === type) * SHARE_UNIT - target[i]) as Counts;
  };
  for (const match of mode === SessionMode.MIXICANO ? history : []) {
    const snapshot = match.levelMatchType;
    if (!snapshot) continue; // Activation boundary: first versioned commitment.
    count++;
    for (let i = 0; i < 3; i++) {
      actual[i] += Number(snapshot.category === LEVEL_MATCH_TYPES[i]);
      expected[i] += snapshot.target[LEVEL_MATCH_TYPES[i]];
    }
    const delta = impact(snapshot);
    for (let i = 0; i < 3; i++) residual[i] += delta[i];
    for (const [id, target] of Object.entries(snapshot.mixedTargetByPlayer)) {
      const prior = exposure.get(id) ?? { actual: 0, expected: 0 };
      prior.actual += Number(snapshot.category === "MIXED");
      prior.expected += target;
      exposure.set(id, prior);
    }
  }
  return {
    recoveryTypes() {
      if (residual[1] < SHARE_UNIT) return [];
      return LEVEL_MATCH_TYPES.filter((type, i): type is Exclude<LevelMatchType, "MIXED"> =>
        type !== "MIXED" && residual[i] <= -0.75 * SHARE_UNIT);
    },
    snapshot: (partition: V3DoublesPartition, category?: LevelMatchType | null) =>
      mode === SessionMode.MIXICANO ? targetFor(partition, category) : undefined,
    impact,
    exposureCost(snapshot?: LevelDistributionSnapshot) {
      if (!snapshot) return 0;
      return Object.entries(snapshot.mixedTargetByPlayer).reduce((sum, [id, target]) => {
        const prior = exposure.get(id);
        if (!prior) return sum;
        const debt = prior.actual - prior.expected;
        const next = debt + Number(snapshot.category === "MIXED") - target;
        const excess = (value: number) => Math.max(0, Math.abs(value) - 1) ** 2;
        return sum + Math.round((excess(next) - excess(debt)) * 1_000);
      }, 0);
    },
    /** Independent coordinate intervals overstate possible repairs, making a safe lower bound. */
    band(chosen: readonly Counts[], remaining: readonly { min: Counts; max: Counts }[] = []) {
      let error = 0;
      for (let i = 0; i < 3; i++) {
        const projected = residual[i] + chosen.reduce((sum, delta) => sum + delta[i], 0);
        const low = projected + remaining.reduce((sum, range) => sum + range.min[i], 0);
        const high = projected + remaining.reduce((sum, range) => sum + range.max[i], 0);
        error += (low > 0 ? low : high < 0 ? high : 0) ** 2;
      }
      return Math.floor(error / ERROR_BAND);
    },
    diagnostics(entries: readonly (LevelDistributionSnapshot | undefined)[]) {
      const projectedActual = [...actual], projectedExpected = [...expected];
      let projectedCount = count;
      for (const snapshot of entries) {
        if (!snapshot) continue;
        projectedCount++;
        for (let i = 0; i < 3; i++) {
          projectedActual[i] += Number(snapshot.category === LEVEL_MATCH_TYPES[i]);
          projectedExpected[i] += snapshot.target[LEVEL_MATCH_TYPES[i]];
        }
      }
      const normalizedError = projectedCount ? projectedActual.reduce((sum, value, index) =>
        sum + ((value - projectedExpected[index]) / projectedCount) ** 2, 0) : 0;
      return { count: projectedCount, actual: projectedActual, expected: projectedExpected, normalizedError };
    },
  };
}
