import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { SessionMode } from "@/types/enums";
import type { SocialHistoryMatch, V3DoublesPartition } from "../v3/types";
import {
  buildLevelDistributionContext, buildLevelDistributionTargets, parseLevelDistributionSnapshot,
  type LevelDistributionPlayer, type LevelDistributionSnapshot, type LevelMatchType,
} from "./levelDistribution";

export type ClubPlayDistributionSnapshot = LevelDistributionSnapshot;

export function buildClubPlayDistributionTargets(players: readonly LevelDistributionPlayer[]) {
  const targetFor = buildLevelDistributionTargets(players, false);
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  return (partition: V3DoublesPartition, category?: LevelMatchType | null): ClubPlayDistributionSnapshot | undefined => {
    const snapshot = targetFor(partition, category);
    if (!snapshot || snapshot.feasibility) return snapshot;
    const upperSeats = snapshot.target.UPPER + snapshot.target.MIXED / 2;
    const lowerSeats = snapshot.target.LOWER + snapshot.target.MIXED / 2;
    // The minority still gets at least half of its appearances on its own
    // side when both sides have enough players for a same-side court.
    const mixed = Math.min(snapshot.target.MIXED, upperSeats, lowerSeats);
    if (mixed === snapshot.target.MIXED) return snapshot;
    const target = { UPPER: upperSeats - mixed / 2, MIXED: mixed, LOWER: lowerSeats - mixed / 2 };
    const mixedTargetByPlayer = Object.fromEntries([...partition.team1, ...partition.team2].map((id) => {
      const side = sides.get(id);
      return [id, side ? mixed / (2 * target[side] + mixed) : 0];
    }));
    return { ...snapshot, target, mixedTargetByPlayer };
  };
}

export function parseClubPlayDistributionSnapshot(
  value: unknown, partition: V3DoublesPartition,
): ClubPlayDistributionSnapshot | null {
  const snapshot = parseLevelDistributionSnapshot(value, partition);
  return snapshot?.scope === "session" ? snapshot : null;
}

export function buildClubPlayDistributionContext(
  players: readonly LevelDistributionPlayer[], history: readonly SocialHistoryMatch[],
) {
  const exposure = new Map<string, number>();
  for (const match of history) {
    const snapshot = match.clubPlayMatchType;
    if (!snapshot) continue;
    const mixed = Number(snapshot.category === "MIXED");
    for (const [id, target] of Object.entries(snapshot.mixedTargetByPlayer)) {
      exposure.set(id, (exposure.get(id) ?? 0) + mixed - target);
    }
  }

  const distribution = buildLevelDistributionContext(players, history.map((match) => ({
    ...match,
    levelMatchType: match.clubPlayMatchType,
  })), SessionMode.MIXICANO, false);

  return {
    ...distribution,
    snapshot: buildClubPlayDistributionTargets(players),
    exposureCost(snapshot?: ClubPlayDistributionSnapshot) {
      if (!snapshot) return 0;
      const mixed = Number(snapshot.category === "MIXED");
      const change = Object.entries(snapshot.mixedTargetByPlayer).reduce((sum, [id, target]) => {
        const previous = exposure.get(id) ?? 0;
        const next = previous + mixed - target;
        return sum + next ** 2 - previous ** 2;
      }, 0);
      return Math.round(change * 1_000);
    },
  };
}
