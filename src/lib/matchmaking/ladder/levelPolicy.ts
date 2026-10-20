import { SessionBalanceMetric, SessionType } from "@/types/enums";
import { getBalanceGuardrailPolicy } from "../v3/balanceGuardrail";
import type { V3BalanceGuardrail } from "../v3/types";
import type { ActiveMatchmakerLadderPlayer, LadderSingleCourtSelection } from "./types";

export interface LevelPolicy {
  metric: SessionBalanceMetric;
}

export interface LevelSelectionContext {
  strongerPriorityVector: number[];
  balanceGuardrail: V3BalanceGuardrail;
}

export interface LevelSelectionDiagnostics {
  metric: SessionBalanceMetric;
  levelSpread: number;
  balanceGap: number;
  bestBalanceGap: number;
  allowedBalanceGap: number;
  ceilingFeasible: boolean;
  baselineCertified: boolean;
  searchLimitReached: boolean;
}

export function getLevelBalancePolicy(policy: LevelPolicy) {
  return getBalanceGuardrailPolicy(
    policy.metric === SessionBalanceMetric.RATING ? SessionType.ELO : SessionType.POINTS
  )!;
}

export function compareLevelVectors(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function buildLevelGrouping(players: readonly { strength: number }[]) {
  const values = players.map((player) => player.strength).sort((a, b) => a - b);
  let pairwiseGap = 0;
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      pairwiseGap += values[right] - values[left];
    }
  }
  return {
    maxLadderGap: (values.at(-1) ?? 0) - (values[0] ?? 0),
    totalLadderGap: pairwiseGap,
    pointDiffSpread: 0,
    totalPointDiffGap: 0,
  };
}

/** One ordering for ordinary courts, grouped schedules and complete batches. */
export function getLevelQualityVector<T extends ActiveMatchmakerLadderPlayer>(
  selections: readonly LadderSingleCourtSelection<T>[],
  policy: LevelPolicy,
  respectPlayerRest: boolean
) {
  const points = policy.metric === SessionBalanceMetric.SESSION_POINTS;
  const rest = selections.flatMap((selection) => selection.players.map((player) => player.restTurns));
  return [
    Math.max(0, ...selections.map((selection) => selection.groupingSummary.maxLadderGap)),
    selections.reduce((sum, selection) => sum + selection.groupingSummary.totalLadderGap, 0),
    Math.max(0, ...selections.map((selection) => selection.balanceGap)),
    selections.reduce((sum, selection) => sum + selection.balanceGap, 0),
    ...(points ? [
      Math.max(0, ...selections.map((selection) => selection.pointDiffGap)),
      selections.reduce((sum, selection) => sum + selection.pointDiffGap, 0),
    ] : []),
    ...(respectPlayerRest ? rest.sort((a, b) => a - b).map((turns) => -turns) : []),
    selections.reduce((sum, selection) => sum + selection.randomScore, 0),
  ];
}
