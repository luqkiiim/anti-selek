import { SessionMode } from "@/types/enums";
import { getArrivalPriorityTime } from "./arrivalPriority";
import type { BenchmarkPlayer } from "./clubPlayBenchmarkFixtures";
import { buildClubPlayCompatibilityScorer } from "./ladder/clubPlayCompatibility";
import type { ClubPlaySelectionContext } from "./ladder/clubPlaySelection";
import { LEVEL_SKILL_UNIT } from "./ladder/levelCompatibility";
import { getDoublesPartitions, isValidPartitionForMode } from "./v3/balance";
import { isBalanceGuardrailAdmissible } from "./v3/balanceGuardrail";
import type { V3DoublesPartition } from "./v3/types";

type Candidate = {
  userId: string;
  effectiveMatchCount: number;
  restTurns: number;
  arrivalPriorityAt?: Date | string | null;
};

export interface ReplayDecision {
  minute: number;
  completed: number;
  action: "start" | "reserve" | "activate";
  available: Candidate[];
  selected: V3DoublesPartition[];
  context: ClubPlaySelectionContext;
}

interface Court {
  partition: V3DoublesPartition;
  mask: bigint;
  balanceGap: number;
  rawSpread: number;
  compatibilityWorst: number;
  compatibilityMean: number;
  type: "UPPER" | "MIXED" | "LOWER" | null;
}

interface Layout {
  courts: Court[];
  worst: number;
  total: number;
  maxBalanceGap: number;
  totalBalanceGap: number;
}

function compareVectors(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const summarize = (layout: Layout | null) => layout && {
  compatibilityWorst: layout.worst / LEVEL_SKILL_UNIT,
  compatibilityTotal: layout.total / LEVEL_SKILL_UNIT,
  maxBalanceGap: layout.maxBalanceGap,
  totalBalanceGap: layout.totalBalanceGap,
  courts: layout.courts.map(({ partition, type, balanceGap, rawSpread, compatibilityWorst, compatibilityMean }) => ({
    partition, type, balanceGap, rawSpread,
    compatibilityWorst: compatibilityWorst / LEVEL_SKILL_UNIT, compatibilityMean: compatibilityMean / LEVEL_SKILL_UNIT,
  })),
};

/** Enumerate complete layouts for the small replay roster. Each legal quartet uses its best-balanced partition. */
export function analyzeReplayAdmission(roster: readonly BenchmarkPlayer[], decision: ReplayDecision) {
  const { available, context, selected } = decision;
  const byId = new Map(roster.map((player) => [player.id, player]));
  const active = roster.filter((player) => player.effectiveSide !== null);
  const scorer = buildClubPlayCompatibilityScorer(active.map((player) => ({ ...player, userId: player.id, strength: player.rating })));
  const riskRest = Math.max(0, Math.ceil((active.length - 4) / 4));
  const courtCount = selected.length;
  const seats = courtCount * 4;
  const eligible = available.filter((player) => byId.get(player.userId)?.effectiveSide);
  const emptyMask = BigInt(0);
  const availableMask = new Map(eligible.map((player, index) => [player.userId, BigInt(1) << BigInt(index)]));
  const vectors = new Map<bigint, number[]>();
  const vectorFor = (mask: bigint) => {
    const cached = vectors.get(mask);
    if (cached) return cached;
    const selected = eligible.filter((player) => (mask & availableMask.get(player.userId)!) !== emptyMask);
    const counts = selected.map((player) => player.effectiveMatchCount).sort((a, b) => a - b);
    const arrivals = selected.map((player) => getArrivalPriorityTime(player.arrivalPriorityAt))
      .filter((time): time is number => time !== null).sort((a, b) => a - b);
    const missedOverdue = eligible.filter((player) => (mask & availableMask.get(player.userId)!) === emptyMask && player.restTurns > riskRest)
      .map((player) => player.restTurns);
    const vector = [...counts, -arrivals.length, ...arrivals, ...Array<number>(seats - arrivals.length).fill(0), 0,
      missedOverdue.length, Math.max(0, ...missedOverdue), missedOverdue.reduce((sum, rest) => sum + rest, 0)];
    vectors.set(mask, vector);
    return vector;
  };
  const ids = eligible.map((player) => player.userId);
  const possible: Court[] = [];
  const balance = ({ team1, team2 }: V3DoublesPartition) => Math.abs(
    team1.reduce((sum, id) => sum + byId.get(id)!.rating, 0) - team2.reduce((sum, id) => sum + byId.get(id)!.rating, 0),
  ) / 2;
  for (let a = 0; a < ids.length - 3; a++) {
    for (let b = a + 1; b < ids.length - 2; b++) {
      for (let c = b + 1; c < ids.length - 1; c++) {
        for (let d = c + 1; d < ids.length; d++) {
          const quartet: [string, string, string, string] = [ids[a], ids[b], ids[c], ids[d]];
          let partition: V3DoublesPartition | undefined;
          let balanceGap = Infinity;
          for (const candidate of getDoublesPartitions(quartet)) {
            if (!isValidPartitionForMode(candidate, byId, SessionMode.MIXICANO)) continue;
            const gap = balance(candidate);
            if (gap < balanceGap) { partition = candidate; balanceGap = gap; }
          }
          if (!partition) continue;
          const players = quartet.map((id) => byId.get(id)!);
          const strengths = players.map((player) => player.rating);
          const score = scorer.score(players.map((player) => ({ ...player, userId: player.id, strength: player.rating })));
          possible.push({ partition, balanceGap, rawSpread: Math.max(...strengths) - Math.min(...strengths),
            mask: quartet.reduce((mask, id) => mask | availableMask.get(id)!, emptyMask),
            compatibilityWorst: score.worst, compatibilityMean: score.mean, type: score.matchType });
        }
      }
    }
  }

  const counts = { legal: 0, fair: 0, balanced: 0, admitted: 0 };
  const sameSide = { legal: 0, fair: 0, balanced: 0, admitted: 0 };
  let bestFair: number[] | null = null;
  let closestSameSide: Layout | null = null;
  let closestAllMixed: Layout | null = null;
  const closest = (next: Layout, existing: Layout | null) => !existing || compareVectors(
    [next.worst, next.total, next.maxBalanceGap, next.totalBalanceGap],
    [existing.worst, existing.total, existing.maxBalanceGap, existing.totalBalanceGap],
  ) < 0;
  const inspect = (courts: Court[], mask: bigint) => {
    const containsOwnSide = courts.some((court) => court.type === "UPPER" || court.type === "LOWER");
    counts.legal++;
    if (containsOwnSide) sameSide.legal++;
    const fairnessVector = vectorFor(mask);
    if (!bestFair || compareVectors(fairnessVector, bestFair) < 0) bestFair = fairnessVector;
    if (compareVectors(fairnessVector, context.strongerPriorityVector) !== 0) return;
    counts.fair++;
    if (containsOwnSide) sameSide.fair++;
    const maxBalanceGap = Math.max(...courts.map((court) => court.balanceGap));
    const totalBalanceGap = courts.reduce((sum, court) => sum + court.balanceGap, 0);
    if (!isBalanceGuardrailAdmissible({ maxBalanceGap, totalBalanceGap }, context.balanceGuardrail)) return;
    counts.balanced++;
    if (containsOwnSide) sameSide.balanced++;
    const worst = Math.max(...courts.map((court) => court.compatibilityWorst));
    const total = courts.reduce((sum, court) => sum + court.compatibilityMean, 0);
    const layout = { courts, worst, total, maxBalanceGap, totalBalanceGap };
    if (containsOwnSide && closest(layout, closestSameSide)) closestSameSide = layout;
    if (!containsOwnSide && closest(layout, closestAllMixed)) closestAllMixed = layout;
    const { skillEnvelope } = context;
    if (skillEnvelope && (worst > skillEnvelope.allowedWorst || total > skillEnvelope.allowedTotal)) return;
    counts.admitted++;
    if (containsOwnSide) sameSide.admitted++;
  };
  for (const [index, first] of possible.entries()) {
    if (courtCount === 1) inspect([first], first.mask);
    else for (let later = index + 1; later < possible.length; later++) {
      const second = possible[later];
      if ((first.mask & second.mask) === emptyMask) inspect([first, second], first.mask | second.mask);
    }
  }

  return {
    minute: decision.minute, completed: decision.completed, action: decision.action, selected,
    counts, sameSide, fairnessAgrees: bestFair !== null && compareVectors(bestFair, context.strongerPriorityVector) === 0,
    skillEnvelope: context.skillEnvelope, balanceGuardrail: context.balanceGuardrail,
    closestSameSide: summarize(closestSameSide), closestAllMixed: summarize(closestAllMixed),
  };
}
