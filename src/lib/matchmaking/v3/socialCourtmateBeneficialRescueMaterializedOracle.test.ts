import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { getDoublesPartitions, isValidPartitionForMode } from "./balance";
import {
  auditSocialCourtmateBeneficialRescueSelection,
  type BenchmarkPlayer,
} from "./socialCoverageBenchmark";
import { createSocialCourtmatePriorityScorer } from "./socialCourtmatePriority";
import {
  compareCourtmateBeneficialRescuePrimary,
  findBestRotationBatchSelection,
  isCourtmateBeneficialRescueAdmissible,
} from "./socialBatch";
import { buildSocialVarietyContext, getSocialVarietySnapshot } from "./socialVariety";
import type { SocialHistoryMatch, V3DoublesPartition } from "./types";

type HistoryFixture = readonly [readonly number[], "MIXED" | "OWN_SIDE"];
type MaterializedBatch = {
  readonly partitions: readonly V3DoublesPartition[];
  readonly key: string;
  readonly courtmateGain: number;
  readonly rollingTypeGainUnits: bigint;
};

type MaterializedFrontier = {
  readonly batches: readonly MaterializedBatch[];
  readonly rollingTypeDenominator: bigint;
};

const RESCUE_CASES = [
  {
    name: "positive signed-T frontier",
    expectedDeficit: 1,
    history: [
      [[0, 1, 2, 3], "OWN_SIDE"], [[2, 3, 5, 7], "MIXED"], [[1, 2, 5, 6], "MIXED"],
      [[1, 3, 5, 6], "MIXED"], [[1, 3, 4, 5], "MIXED"], [[0, 1, 4, 5], "MIXED"],
      [[0, 2, 5, 7], "MIXED"], [[2, 3, 4, 7], "MIXED"],
    ],
  },
  {
    name: "T tied at Gmax",
    expectedDeficit: 0,
    history: [
      [[2, 3, 4, 7], "MIXED"], [[0, 1, 2, 3], "OWN_SIDE"], [[1, 2, 4, 5], "MIXED"],
      [[0, 3, 5, 6], "MIXED"],
    ],
  },
  {
    name: "negative Gmax frontier with positive recovery",
    expectedDeficit: 1,
    history: [
      [[0, 2, 5, 7], "MIXED"], [[0, 2, 6, 7], "MIXED"], [[4, 5, 6, 7], "OWN_SIDE"],
      [[0, 1, 2, 3], "OWN_SIDE"], [[0, 3, 4, 5], "MIXED"], [[0, 1, 4, 6], "MIXED"],
      [[2, 3, 5, 6], "MIXED"], [[0, 3, 4, 6], "MIXED"], [[1, 2, 5, 7], "MIXED"],
      [[0, 3, 6, 7], "MIXED"], [[0, 3, 4, 6], "MIXED"],
    ],
  },
] as const satisfies readonly { name: string; expectedDeficit: 0 | 1; history: readonly HistoryFixture[] }[];

function makePlayers(): BenchmarkPlayer[] {
  return Array.from({ length: 8 }, (_value, index) => {
    const upper = index < 4;
    return {
      userId: `P${index}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-01-01T00:00:00.000Z"),
      arrivalPriorityAt: null,
      restTurns: 1,
      strength: 1000 + index * 7,
      pointDiff: (index * 5) % 17,
      gender: upper ? "FEMALE" : "MALE",
      partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: upper ? "UPPER" : "LOWER",
      lastPartnerId: null,
      isBusy: false,
      isPaused: false,
    } satisfies BenchmarkPlayer;
  });
}

function makeHistory(players: BenchmarkPlayer[], fixtures: readonly HistoryFixture[]): SocialHistoryMatch[] {
  const unstamped = fixtures.map(([indexes], index) => {
    const upper = indexes.filter((player) => player < 4).map((player) => `P${player}`);
    const lower = indexes.filter((player) => player >= 4).map((player) => `P${player}`);
    const teams = upper.length === 2 && lower.length === 2
      ? [[upper[0], lower[0]], [upper[1], lower[1]]]
      : [[...indexes.slice(0, 2).map((player) => `P${player}`)], [...indexes.slice(2, 4).map((player) => `P${player}`)]];
    return {
      id: `materialized-history-${index + 1}`,
      team1: teams[0] as [string, string],
      team2: teams[1] as [string, string],
      completedAt: new Date(Date.UTC(2025, 0, index + 1)),
    } satisfies SocialHistoryMatch;
  });
  const context = buildSocialVarietyContext(players, unstamped, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  return unstamped.map((match) => ({
    ...match,
    socialVariety: getSocialVarietySnapshot(match, context),
  }));
}

function combinations<T>(items: readonly T[], count: number): T[][] {
  const output: T[][] = [];
  const chosen: T[] = [];
  const walk = (start: number) => {
    if (chosen.length === count) {
      output.push([...chosen]);
      return;
    }
    const remaining = count - chosen.length;
    for (let index = start; index <= items.length - remaining; index += 1) {
      chosen.push(items[index]);
      walk(index + 1);
      chosen.pop();
    }
  };
  walk(0);
  return output;
}

function partitionKey(partition: V3DoublesPartition): string {
  return [partition.team1, partition.team2]
    .map((team) => [...team].sort().join("+"))
    .sort()
    .join("/");
}

function batchKey(partitions: readonly V3DoublesPartition[]): string {
  return partitions.map(partitionKey).sort().join("||");
}

function matchType(match: SocialHistoryMatch, context: ReturnType<typeof buildSocialVarietyContext>): "MIXED" | "OWN_SIDE" | null {
  const type = match.socialVariety?.courtType ?? getSocialVarietySnapshot(match, context).courtType;
  if (type === "MIXED") return "MIXED";
  if (type === "UPPER" || type === "LOWER") return "OWN_SIDE";
  return null;
}

function unorderedPairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

function leastCommonMultiple(left: bigint, right: bigint): bigint {
  let first = left;
  let second = right;
  while (second !== BigInt(0)) [first, second] = [second, first % second];
  return left === BigInt(0) || right === BigInt(0) ? BigInt(0) : (left / first) * right;
}

function expectAuditObjectivesEquivalent(
  selected: NonNullable<ReturnType<typeof auditSocialCourtmateBeneficialRescueSelection>["selectedObjective"]>,
  best: NonNullable<ReturnType<typeof auditSocialCourtmateBeneficialRescueSelection>["bestObjective"]>,
) {
  expect(selected.newCourtmatePairs).toBe(best.newCourtmatePairs);
  expect(selected.ascendingCoverageProfile).toEqual(best.ascendingCoverageProfile);
  expect(selected.signedRollingTypeDelta).toBe(best.signedRollingTypeDelta);
  expect(selected.immediateReplayCount).toBe(best.immediateReplayCount);
  expect(selected.softCadenceVector).toEqual(best.softCadenceVector);
  expect(selected.newPartnerPairs).toBe(best.newPartnerPairs);
  expect(selected.newOpponentPairs).toBe(best.newOpponentPairs);
  for (const metric of [
    "relationshipEntropyGain",
    "sharedCourtRepeatPenalty",
    "sharedCourtEncounterFrequencyPenalty",
    "partnerRepeatPenalty",
    "opponentRepeatPenalty",
    "exactRematchPenalty",
    "maxBalanceGap",
    "totalBalanceGap",
  ] as const) {
    expect(Math.abs(selected[metric] - best[metric])).toBeLessThan(1e-12);
  }
}

/** Enumerates each legal unordered two-court whole batch exactly once. */
function materializeEveryBatch(
  players: BenchmarkPlayer[],
  completedHistory: readonly SocialHistoryMatch[]
): MaterializedFrontier {
  const context = buildSocialVarietyContext(players, completedHistory, {
    sessionMode: SessionMode.MIXICANO,
    includePausedPlayers: true,
  });
  const scorer = createSocialCourtmatePriorityScorer(context, completedHistory);
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const playerIds = players.map((player) => player.userId).sort();
  const choicesByQuartet = new Map<string, V3DoublesPartition[]>();
  for (const quartet of combinations(playerIds, 4)) {
    const choices = getDoublesPartitions(quartet as [string, string, string, string])
      .filter((partition) => isValidPartitionForMode(partition, playersById, SessionMode.MIXICANO));
    if (choices.length) choicesByQuartet.set(quartet.join("|"), choices);
  }
  const coveredPairs = new Set<string>();
  for (const match of completedHistory) {
    const ids = [...match.team1, ...match.team2];
    for (const left of ids) for (const right of ids) {
      if (left < right) coveredPairs.add(unorderedPairKey(left, right));
    }
  }
  const windowsByPlayer = new Map(players.map((player) => [player.userId, [] as Array<"MIXED" | "OWN_SIDE" | null>]));
  for (const match of completedHistory) {
    const type = matchType(match, context);
    for (const userId of [...match.team1, ...match.team2]) windowsByPlayer.get(userId)?.push(type);
  }
  const feasibleTypesByPlayer = new Map([...context.playersByUserId].map(([userId, history]) => [
    userId,
    new Set(["MIXED", "OWN_SIDE"].filter((type) => history.matchType.opportunities.has(type as "MIXED" | "OWN_SIDE"))),
  ]));
  const rollingTypeDenominator = [...feasibleTypesByPlayer.values()].reduce((denominator, types) =>
    types.size ? leastCommonMultiple(denominator, BigInt(types.size)) : denominator,
  BigInt(1));
  const batchTUnits = (partitions: readonly V3DoublesPartition[]) => {
    let units = BigInt(0);
    for (const partition of partitions) {
      const type = getSocialVarietySnapshot(partition, context).courtType;
      const appended: "MIXED" | "OWN_SIDE" | null = type === "MIXED" ? "MIXED"
        : type === "UPPER" || type === "LOWER" ? "OWN_SIDE" : null;
      for (const userId of [...partition.team1, ...partition.team2]) {
        const feasible = feasibleTypesByPlayer.get(userId) ?? new Set<string>();
        if (!feasible.size) continue;
        const before = (windowsByPlayer.get(userId) ?? []).slice(-6);
        const after = [...before, appended].slice(-6);
        const countCovered = (window: readonly ("MIXED" | "OWN_SIDE" | null)[]) =>
          new Set(window.filter((value): value is "MIXED" | "OWN_SIDE" => value !== null && feasible.has(value))).size;
        const delta = countCovered(after) - countCovered(before);
        units += BigInt(delta) * (rollingTypeDenominator / BigInt(feasible.size));
      }
    }
    return units;
  };
  const batches: MaterializedBatch[] = [];
  const anchorId = playerIds[0];
  for (const [firstQuartetKey, firstChoices] of choicesByQuartet) {
    const firstIds = firstQuartetKey.split("|");
    if (!firstIds.includes(anchorId)) continue;
    const firstSet = new Set(firstIds);
    const secondIds = playerIds.filter((id) => !firstSet.has(id));
    const secondChoices = choicesByQuartet.get(secondIds.join("|"));
    if (!secondChoices) continue;
    for (const first of firstChoices) for (const second of secondChoices) {
      const partitions = [first, second] as const;
      const scorerMetrics = scorer.getBatchMetrics(partitions);
      let manuallyCountedPairs = 0;
      for (const partition of partitions) {
        const ids = [...partition.team1, ...partition.team2];
        for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
            const left = ids[leftIndex];
            const right = ids[rightIndex];
            const leftPeers = context.playersByUserId.get(left)?.courtmates.opportunities;
            const rightPeers = context.playersByUserId.get(right)?.courtmates.opportunities;
            if (leftPeers?.has(right) && rightPeers?.has(left) &&
                !coveredPairs.has(unorderedPairKey(left, right))) manuallyCountedPairs += 1;
          }
        }
      }
      const independentTUnits = batchTUnits(partitions);
      expect(scorerMetrics.newCourtmatePairs).toBe(manuallyCountedPairs);
      expect(scorerMetrics.rollingMatchTypeGainUnits).toBe(independentTUnits);
      batches.push({
        partitions,
        key: batchKey(partitions),
        courtmateGain: manuallyCountedPairs,
        rollingTypeGainUnits: independentTUnits,
      });
    }
  }
  return { batches, rollingTypeDenominator };
}

const matcherOptions = {
  courtCount: 2,
  rotationPlayerCount: 8,
  sessionMode: SessionMode.MIXICANO,
  sessionType: SessionType.SOCIAL_MIX,
  respectPlayerRest: true,
  socialPriorityPolicy: "courtmate-beneficial-rescue" as const,
  randomFn: () => 0.371,
};

describe("materialized beneficial-rescue frontier oracle", () => {
  it.each(RESCUE_CASES)("enumerates the complete disjoint-batch frontier for $name", ({ history: fixture, expectedDeficit }) => {
    const players = makePlayers();
    const completedHistory = makeHistory(players, fixture);
    const frontier = materializeEveryBatch(players, completedHistory);
    const allBatches = frontier.batches;
    const result = findBestRotationBatchSelection(players, {
      ...matcherOptions,
      completedMatches: completedHistory,
      socialHistoryMatches: completedHistory,
    });
    const selectedPartitions = result.selection!.selections.map((selection) => selection.partition);
    const selectedKey = batchKey(selectedPartitions);
    const maximumGain = Math.max(...allBatches.map((candidate) => candidate.courtmateGain));
    const maximumTAtMaximumGain = allBatches
      .filter((candidate) => candidate.courtmateGain === maximumGain)
      .reduce((best, candidate) => candidate.rollingTypeGainUnits > best ? candidate.rollingTypeGainUnits : best,
        BigInt(Number.MIN_SAFE_INTEGER));
    const rescueFrontier = allBatches.filter((candidate) => candidate.courtmateGain === maximumGain - 1);
    const admittedRescues = rescueFrontier.filter((candidate) => candidate.rollingTypeGainUnits > maximumTAtMaximumGain);
    const inadmissibleRescues = rescueFrontier.filter((candidate) => candidate.rollingTypeGainUnits <= maximumTAtMaximumGain);
    const admitted = allBatches.filter((candidate) => candidate.courtmateGain === maximumGain ||
      (candidate.courtmateGain === maximumGain - 1 && candidate.rollingTypeGainUnits > maximumTAtMaximumGain));
    const admittedByMatcherPredicate = allBatches.filter((candidate) => isCourtmateBeneficialRescueAdmissible(
      candidate.courtmateGain,
      maximumGain,
      candidate.rollingTypeGainUnits,
      maximumTAtMaximumGain,
    ));
    const comparePrimaryIndependently = (left: MaterializedBatch, right: MaterializedBatch) =>
      left.rollingTypeGainUnits === right.rollingTypeGainUnits
        ? right.courtmateGain - left.courtmateGain
        : left.rollingTypeGainUnits > right.rollingTypeGainUnits ? -1 : 1;
    const primaryWinner = [...admitted].sort((left, right) =>
      right.rollingTypeGainUnits > left.rollingTypeGainUnits ? 1
        : right.rollingTypeGainUnits < left.rollingTypeGainUnits ? -1
          : right.courtmateGain - left.courtmateGain
    )[0];

    expect(new Set(allBatches.map((candidate) => candidate.key)).size).toBe(allBatches.length);
    // 9 own-side/own-side layouts plus 72 mixed/mixed layouts for a free 4/4 roster.
    expect(allBatches.length).toBe(81);
    expect(admittedByMatcherPredicate.map((candidate) => candidate.key).sort()).toEqual(
      admitted.map((candidate) => candidate.key).sort(),
    );
    const orderingMismatches: string[] = [];
    for (const left of allBatches) for (const right of allBatches) {
      const actualOrder = Math.sign(compareCourtmateBeneficialRescuePrimary(
        left.rollingTypeGainUnits,
        left.courtmateGain,
        right.rollingTypeGainUnits,
        right.courtmateGain,
      ));
      const expectedOrder = Math.sign(comparePrimaryIndependently(left, right));
      if (actualOrder !== expectedOrder && orderingMismatches.length < 5) {
        orderingMismatches.push(`${left.key} vs ${right.key}`);
      }
    }
    expect(orderingMismatches).toEqual([]);
    expect(allBatches.length).toBeGreaterThan(0);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    expect(result.courtmateGainMaximum).toBe(maximumGain);
    expect(result.bestRollingMatchTypeGainAtGmax).toBe(Number(maximumTAtMaximumGain) / Number(frontier.rollingTypeDenominator));
    expect(result.chosenCourtmateGainDeficit).toBe(expectedDeficit);
    expect(allBatches.find((candidate) => candidate.key === selectedKey)).toBeDefined();
    expect(primaryWinner.courtmateGain).toBe(result.chosenNewCourtmatePairCount);
    expect(primaryWinner.rollingTypeGainUnits).toBe(
      BigInt(Math.round(result.chosenRollingMatchTypeGain! * Number(frontier.rollingTypeDenominator)))
    );
    expect(result.chosenNewCourtmatePairCount).toBe(maximumGain - expectedDeficit);
    expect(admittedRescues.every((candidate) => candidate.rollingTypeGainUnits > maximumTAtMaximumGain)).toBe(true);
    expect(inadmissibleRescues.every((candidate) => candidate.rollingTypeGainUnits <= maximumTAtMaximumGain)).toBe(true);
    expect(expectedDeficit === 1 ? admittedRescues.length > 0 : admittedRescues.length === 0).toBe(true);
    expect(result.chosenCourtmateGainDeficit === 1
      ? result.chosenRollingMatchTypeGain! > Number(maximumTAtMaximumGain) / Number(frontier.rollingTypeDenominator)
      : true).toBe(true);

    const independent = auditSocialCourtmateBeneficialRescueSelection(
      players,
      completedHistory,
      selectedPartitions.map((partition) => ({ ids: [...partition.team1, ...partition.team2], partition })),
      2,
    );
    expect(independent.complete).toBe(true);
    expect(independent.candidateCount).toBe(allBatches.length);
    expect(independent.admittedCandidateCount).toBe(admitted.length);
    expect(independent.courtmateGainMaximum).toBe(maximumGain);
    expect(independent.bestRollingMatchTypeGainAtGmax).toBe(maximumTAtMaximumGain);
    expectAuditObjectivesEquivalent(independent.selectedObjective!, independent.bestObjective!);
    expect(independent.selectedObjective?.newCourtmatePairs).toBe(primaryWinner.courtmateGain);
    expect(independent.selectedObjective?.signedRollingTypeDelta).toBe(primaryWinner.rollingTypeGainUnits);
  });
});
