import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import { findBestSocialBatchSelection } from "./socialBatch";
import { buildCandidatePool } from "./candidatePool";
import { getDoublesPartitions, isValidPartitionForMode, getPartitionBalanceGap, getPartitionPointDiffGap } from "./balance";
import { buildSocialVarietyContext, getSocialVarietyGain, getSocialVarietyGains } from "./socialVariety";
import { getExactPartitionKey } from "./rematch";
import type { MatchmakerV3Player, V3CompletedMatch, V3DoublesPartition } from "./types";

const makePlayers = (count: number): MatchmakerV3Player[] => Array.from({ length: count }, (_, index) => ({
  userId: `P${index}`, matchesPlayed: 0, matchmakingBaseline: 0,
  availableSince: new Date("2026-01-01"), strength: 1000,
  gender: index < count / 2 ? "MALE" : "FEMALE", partnerPreference: index < count / 2 ? "OPEN" : "FEMALE_FLEX",
}));
const compare = (a: number[], b: number[]) => {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
};

describe("Social global batch solver", () => {
  it("checks every legal two-court partition pair in the 7+7 case", () => {
    const result = findBestSocialBatchSelection(makePlayers(14), { courtCount: 2, sessionMode: SessionMode.MIXICANO, randomFn: () => 0 });
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.debug.validQuartetCount).toBe(1092);
    expect(result.debug.exploredBranches).toBe(595686);
    expect(result.varietyOptimal).toBe(true);
    expect(result.fairnessCertified).toBe(true);
  });

  it.each([10, 14])("matches an independent exhaustive %i-player fairness/cadence/variety/balance oracle", (count) => {
    const players = makePlayers(count).map((player, index) => ({ ...player, matchesPlayed: index % 3 === 0 ? 1 : 0, restTurns: index % 2, strength: 850 + index * 47 }));
    const history: V3CompletedMatch[] = [{ team1: ["P0", "P5"], team2: ["P1", "P6"] }];
    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO });
    const byId = new Map(players.map((player) => [player.userId, player]));
    const legal: Array<{ ids: [string, string, string, string]; partition: V3DoublesPartition; gains: ReturnType<typeof getSocialVarietyGains>; balance: number; point: number }> = [];
    for (let a = 0; a < count - 3; a++) for (let b = a + 1; b < count - 2; b++) for (let c = b + 1; c < count - 1; c++) for (let d = c + 1; d < count; d++) {
      const ids: [string, string, string, string] = [a, b, c, d].map((index) => players[index].userId) as [string, string, string, string];
      for (const partition of getDoublesPartitions(ids)) if (isValidPartitionForMode(partition, byId, SessionMode.MIXICANO)) {
        legal.push({ ids, partition, gains: getSocialVarietyGains(partition, context), balance: getPartitionBalanceGap(partition, byId)!, point: getPartitionPointDiffGap(partition, byId)! });
      }
    }
    let optimum: number[] | null = null;
    const key = (left: typeof legal[number], right: typeof legal[number]) => {
      const selected = [...left.ids, ...right.ids].map((id) => byId.get(id)!);
      const rests = selected.map((player) => player.restTurns).sort((a, b) => a - b);
      const facetTotal = (facet: keyof typeof left.gains) => [left.gains[facet], right.gains[facet]]
        .sort((a, b) => a - b).reduce((sum, gain) => sum + gain, 0);
      const matchTypeGain = facetTotal("matchType");
      const relationshipGain = [facetTotal("courtmates"), facetTotal("partners"), facetTotal("opponents")]
        .sort((a, b) => a - b).reduce((sum, gain) => sum + gain, 0);
      return [...selected.map((player) => player.matchesPlayed).sort((a, b) => a - b),
        0, 0, 0, -matchTypeGain, rests.filter((rest) => rest === 0).length, -relationshipGain, ...rests.map((rest) => -rest),
        Math.max(left.balance, right.balance), left.balance + right.balance,
        Math.max(left.point, right.point), left.point + right.point];
    };
    for (let a = 0; a < legal.length; a++) for (let b = a + 1; b < legal.length; b++) {
      if (new Set([...legal[a].ids, ...legal[b].ids]).size !== 8) continue;
      const value = key(legal[a], legal[b]);
      if (!optimum || compare(value, optimum) < 0) optimum = value;
    }
    const result = findBestSocialBatchSelection(players, { courtCount: 2, sessionMode: SessionMode.MIXICANO, completedMatches: history, randomFn: () => 0 });
    const chosen = result.selection!.selections.map((selection) => legal.find((candidate) => getExactPartitionKey(candidate.partition) === getExactPartitionKey(selection.partition))!);
    expect(key(chosen[0], chosen[1])).toEqual(optimum);
  });

  it("prefers smoother rest over variety when stronger rotation priorities tie", () => {
    const players = makePlayers(8).map((player, index) => ({ ...player, restTurns: index < 4 ? 1 : 0 }));
    const completedMatches: V3CompletedMatch[] = Array.from({ length: 10 }, () => ({ team1: ["P0", "P1"], team2: ["P2", "P3"] }));
    const result = findBestSingleCourtSelectionV3(players, { sessionMode: SessionMode.MEXICANO, sessionType: SessionType.SOCIAL_MIX, completedMatches, randomFn: () => 0 });
    expect(result.selection?.ids.every((id) => Number(id.slice(1)) < 4)).toBe(true);
    expect(result.selection?.socialStarvation).toMatchObject({ idealRestGap: 1, availableOverdueCount: 0 });
    const ignoreRest = findBestSingleCourtSelectionV3(players, { sessionMode: SessionMode.MEXICANO, sessionType: SessionType.SOCIAL_MIX, completedMatches, randomFn: () => 0, respectPlayerRest: false });
    expect(ignoreRest.selection?.ids.some((id) => Number(id.slice(1)) >= 4)).toBe(true);
  });

  it("keeps match-type entropy inactive when a Mixed context is reused for MEXICANO", () => {
    const players = makePlayers(8);
    const mixedContext = buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO });
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      socialVarietyContext: mixedContext,
      randomFn: () => 0,
    });

    expect(result.selection?.socialVarietyGains?.matchType).toBe(0);
    expect(result.debug.chosenMatchTypeEntropyGain).toBe(0);
  });

  it("keeps arrival priority ahead of overdue-turn protection", () => {
    const players = makePlayers(5).map((player, index) => ({
      ...player,
      restTurns: index === 0 ? 5 : 0,
      arrivalPriorityAt: index === 1 ? new Date("2025-01-01") : null,
    }));
    const allowed = new Set(["P0|P2|P3|P4", "P1|P2|P3|P4"]);
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
      selectionConstraints: { isQuartetAllowed: (quartet) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) },
    });

    expect(result.selection?.selections[0].ids).toContain("P1");
    expect(result.selection?.selections[0].ids).not.toContain("P0");
  });

  it("chooses the highest-variety legal batch that includes overdue players, even when excluding them offers more variety", () => {
    const players = makePlayers(8).map((player, index) => ({
      ...player,
      restTurns: index === 0 ? 5 : 0,
    }));
    const overdueQuartet = ["P0", "P1", "P2", "P3"] as [string, string, string, string];
    const otherOverdueQuartet = ["P0", "P4", "P5", "P6"] as [string, string, string, string];
    const nonOverdueQuartet = ["P4", "P5", "P6", "P7"] as [string, string, string, string];
    const allowed = new Set([overdueQuartet, otherOverdueQuartet, nonOverdueQuartet].map((ids) => ids.sort().join("|")));
    const selectionConstraints = { isQuartetAllowed: (quartet: Array<{ userId: string }>) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) };
    const history: V3CompletedMatch[] = Array.from({ length: 100 }, () => ({
      team1: ["P0", "P1"], team2: ["P2", "P3"],
    }));
    const context = buildSocialVarietyContext(players, history, {
      sessionMode: SessionMode.MEXICANO,
      opportunityConstraints: [selectionConstraints],
    });
    const candidates = [overdueQuartet, otherOverdueQuartet, nonOverdueQuartet]
      .flatMap((ids) => getDoublesPartitions(ids))
      .filter((partition) => isValidPartitionForMode(partition, new Map(players.map((player) => [player.userId, player])), SessionMode.MEXICANO));
    const bestIncludedGain = Math.max(...candidates
      .filter((partition) => [...partition.team1, ...partition.team2].includes("P0"))
      .map((partition) => getSocialVarietyGain(partition, context)));
    const bestExcludedGain = Math.max(...candidates
      .filter((partition) => ![...partition.team1, ...partition.team2].includes("P0"))
      .map((partition) => getSocialVarietyGain(partition, context)));

    expect(bestExcludedGain).toBeGreaterThan(bestIncludedGain);
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      randomFn: () => 0,
      completedMatches: history,
      socialVarietyContext: context,
      selectionConstraints,
    });

    expect(result.selection?.ids).toContain("P0");
    expect(result.selection?.socialVarietyGain).toBeCloseTo(bestIncludedGain, 12);
    expect(result.selection?.socialStarvation).toMatchObject({
      idealRestGap: 1,
      availableOverdueCount: 1,
      selectedOverdueCount: 1,
      leftOutOverdueCount: 0,
    });

    const restDisabled = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      respectPlayerRest: false,
      randomFn: () => 0,
      completedMatches: history,
      socialVarietyContext: context,
      selectionConstraints,
    });
    expect(restDisabled.selection?.ids).toContain("P0");
  });

  it("uses full unpaused population including busy players, but ignores paused players when deriving the gap", () => {
    const players = makePlayers(12).map((player, index) => ({
      ...player,
      isBusy: index < 2,
      isPaused: index >= 10,
      restTurns: index < 2 ? 20 : index === 2 ? 3 : index < 10 ? 2 : 100,
    }));
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.selections[0].ids).toContain("P2");
    expect(result.selection?.selections[0].ids.some((id) => ["P0", "P1", "P10", "P11"].includes(id))).toBe(false);
    expect(result.selection?.selections[0].socialStarvation).toMatchObject({
      idealRestGap: 2,
      availableOverdueCount: 1,
      selectedOverdueCount: 1,
      leftOutOverdueCount: 0,
    });
  });

  it("protects all overdue players across the complete batch", () => {
    const players = makePlayers(14).map((player, index) => ({ ...player, restTurns: index < 6 ? 4 : 3 }));
    const result = findBestSocialBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });
    const summary = result.selection?.selections[0].socialStarvation;

    expect(result.selection?.selections.flatMap((selection) => selection.ids).filter((id) => Number(id.slice(1)) < 6)).toHaveLength(6);
    expect(summary).toMatchObject({
      idealRestGap: 3,
      availableOverdueCount: 6,
      selectedOverdueCount: 6,
      leftOutOverdueCount: 0,
    });
    expect(result.selection?.selections[1].socialStarvation).toEqual(summary);
  });

  it("keeps court-time fairness and an effective matchmaking baseline ahead of overdue-turn protection", () => {
    const players = makePlayers(9).map((player, index) => ({
      ...player,
      matchesPlayed: 0,
      matchmakingBaseline: index === 0 ? 3 : 0,
      restTurns: index === 0 ? 10 : 0,
    }));
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
    });

    expect(result.selection?.selections[0].ids).not.toContain("P0");
  });

  it("arrival priority cannot bypass court-time fairness", () => {
    const players = makePlayers(8);
    players[7].matchesPlayed = 5;
    players[7].arrivalPriorityAt = new Date("2025-01-01");
    const result = findBestBatchSelectionV3(players, { courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType: SessionType.SOCIAL_MIX, randomFn: () => 0 });
    expect(result.selection?.selections[0].ids).not.toContain("P7");
  });

  it("does not use implicit anchors or stop at a locally attractive first court", () => {
    const players = makePlayers(10);
    const allowed = new Set(["P0|P1|P2|P3", "P0|P1|P4|P5", "P2|P3|P6|P7", "P2|P3|P8|P9"]);
    const completedMatches: V3CompletedMatch[] = Array.from({ length: 100 }, () => [
      { team1: ["P4", "P5"] as [string, string], team2: ["P6", "P7"] as [string, string] },
      { team1: ["P6", "P7"] as [string, string], team2: ["P8", "P9"] as [string, string] },
    ]).flat();
    const selectionConstraints = { isQuartetAllowed: (quartet: Array<{ userId: string }>) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) };
    const socialVarietyContext = buildSocialVarietyContext(players, completedMatches, {
      sessionMode: SessionMode.MEXICANO, opportunityConstraints: [selectionConstraints],
    });
    const local = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.SOCIAL_MIX, randomFn: () => 0,
      completedMatches, socialVarietyContext, selectionConstraints,
    });
    expect(new Set(local.selection?.ids)).toEqual(new Set(["P0", "P1", "P2", "P3"]));
    const result = findBestSocialBatchSelection(players, {
      courtCount: 2, sessionMode: SessionMode.MEXICANO, randomFn: () => 0,
      completedMatches, socialVarietyContext, selectionConstraints,
    });
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.selection?.selections.some((selection) => selection.ids.includes("P4"))).toBe(true);
    for (const court of result.selection!.selections) {
      expect(local.selection!.socialVarietyGain!).toBeGreaterThan(court.socialVarietyGain!);
    }
  });

  it("returns a certified three-court incumbent when only variety search times out", () => {
    const players = makePlayers(12).map((player, index) => ({ ...player, restTurns: index < 4 ? 4 : 0 }));
    const allowed = new Set(["P0|P1|P2|P3", "P4|P5|P6|P7", "P10|P11|P8|P9"]);
    const result = findBestSocialBatchSelection(players, {
      courtCount: 3, sessionMode: SessionMode.MEXICANO, randomFn: () => 0, searchLimits: { maxBranches: 4 },
      selectionConstraints: { isQuartetAllowed: (quartet) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) },
    });
    expect(result.selection?.selections).toHaveLength(3);
    expect(result.fairnessCertified).toBe(true);
    expect(result.starvationCertified).toBe(true);
    expect(result.varietyOptimal).toBe(false);
  });

  it("does not certify an early timeout before an equally ranked profile can protect overdue players", () => {
    const players = makePlayers(8).map((player, index) => ({ ...player, restTurns: index >= 4 ? 5 : 0 }));
    const group = (first: number) => ({ isQuartetAllowed: (quartet: Array<{ userId: string }>) => quartet.every((player) => Number(player.userId.slice(1)) >= first && Number(player.userId.slice(1)) < first + 4) });
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
      searchLimits: { maxBranches: 1 },
      schedules: [
        { rank: 0, courts: [group(0)] },
        { rank: 0, courts: [group(4)] },
      ],
    });

    expect(result.selection).toBeNull();
    expect(result.fairnessCertified).toBe(true);
    expect(result.starvationCertified).toBe(false);
    expect(result.debug.failureReason).toBe("SEARCH_LIMIT_REACHED");
  });

  it("returns no batch when a timed-out incumbent cannot certify fairness", () => {
    const players = makePlayers(13);
    players[12].matchesPlayed = 8;
    const allowed = new Set(["P0|P1|P12|P2", "P3|P4|P5|P6", "P10|P7|P8|P9"]);
    const result = findBestSocialBatchSelection(players, {
      courtCount: 3, sessionMode: SessionMode.MEXICANO, randomFn: () => 0, searchLimits: { maxBranches: 4 },
      selectionConstraints: { isQuartetAllowed: (quartet) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) },
    });
    expect(result.selection).toBeNull();
    expect(result.debug.failureReason).toBe("SEARCH_LIMIT_REACHED");
    expect(result.fairnessCertified).toBe(false);
  });

  it("compares labelled schedules by scheduling rank before overdue protection and variety", () => {
    const players = makePlayers(8).map((player, index) => ({ ...player, restTurns: index < 4 ? 2 : 0 }));
    const group = (first: number) => ({ isQuartetAllowed: (quartet: Array<{ userId: string }>) => quartet.every((player) => Number(player.userId.slice(1)) >= first && Number(player.userId.slice(1)) < first + 4) });
    const result = findBestSocialBatchSelection(players, { courtCount: 1, sessionMode: SessionMode.MEXICANO, randomFn: () => 0, schedules: [{ rank: 0, courts: [group(4)] }, { rank: 1, courts: [group(0)] }] });
    expect(result.scheduleIndex).toBe(0);
    expect(result.selection?.selections[0].ids).toEqual(["P4", "P5", "P6", "P7"]);
  });

  it("searches lower-rank Social group schedules before returning a timed-out incumbent", () => {
    const players = makePlayers(8);
    const group = (first: number) => ({ isQuartetAllowed: (quartet: Array<{ userId: string }>) => quartet.every((player) => Number(player.userId.slice(1)) >= first && Number(player.userId.slice(1)) < first + 4) });
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      randomFn: () => 0,
      searchLimits: { maxBranches: 1 },
      schedules: [
        { rank: 1, courts: [group(4)] },
        { rank: 0, courts: [group(0)] },
      ],
    });

    expect(result.scheduleIndex).toBe(1);
    expect(result.selection?.selections[0].ids).toEqual(["P0", "P1", "P2", "P3"]);
    expect(result.varietyOptimal).toBe(false);
  });

  it("widens a supplied strict candidate pool without letting variety beat zero-rest prevention", () => {
    const players = makePlayers(5).map((player, index) => ({
      ...player,
      restTurns: index < 4 ? 1 : 0,
    }));
    const candidatePool = buildCandidatePool(players, {
      requiredPlayerCount: 4,
      randomFn: () => 0,
      respectPlayerRest: true,
    });
    const history: V3CompletedMatch[] = Array.from({ length: 10 }, () => ({
      team1: ["P0", "P1"], team2: ["P2", "P3"],
    }));

    expect(candidatePool.tieZone?.players.map((player) => player.userId)).not.toContain("P4");
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      completedMatches: history,
      candidatePool,
      randomFn: () => 0,
    });

    expect(result.debug.eligiblePlayerIds).toContain("P4");
    expect(result.selection?.selections[0].ids).not.toContain("P4");
    expect(result.selection?.selections[0].socialStarvation).toMatchObject({
      idealRestGap: 1,
      availableOverdueCount: 0,
      selectedOverdueCount: 0,
      leftOutOverdueCount: 0,
    });
  });

  it("keeps overdue protection effective after widening a supplied strict candidate pool", () => {
    const players = makePlayers(5).map((player, index) => ({
      ...player,
      restTurns: index < 4 ? 3 : 0,
    }));
    const candidatePool = buildCandidatePool(players, {
      requiredPlayerCount: 4,
      randomFn: () => 0,
      respectPlayerRest: true,
    });
    const history: V3CompletedMatch[] = Array.from({ length: 10 }, () => ({
      team1: ["P0", "P1"], team2: ["P2", "P3"],
    }));
    const result = findBestSocialBatchSelection(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      completedMatches: history,
      candidatePool,
      randomFn: () => 0,
    });

    expect(candidatePool.tieZone?.players.map((player) => player.userId)).not.toContain("P4");
    expect(result.debug.eligiblePlayerIds).toContain("P4");
    expect(result.selection?.selections[0].ids).not.toContain("P4");
    expect(result.selection?.selections[0].socialStarvation).toMatchObject({
      idealRestGap: 1,
      availableOverdueCount: 4,
      selectedOverdueCount: 4,
      leftOutOverdueCount: 0,
    });
  });

  it("matches a three-court exhaustive oracle while applying global bounds", () => {
    const players = makePlayers(12).map((player, index) => ({ ...player, strength: 800 + index * 73 }));
    const groups = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [0, 1, 4, 5], [2, 3, 8, 9], [6, 7, 10, 11]];
    const allowed = new Set(groups.map((group) => group.map((index) => `P${index}`).sort().join("|")));
    const history: V3CompletedMatch[] = [{ team1: ["P0", "P1"], team2: ["P2", "P3"] }];
    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MEXICANO });
    const byId = new Map(players.map((player) => [player.userId, player]));
    const candidates = groups.flatMap((group) => getDoublesPartitions(group.map((index) => `P${index}`) as [string, string, string, string]));
    const score = (partitions: typeof candidates) => [
      -partitions.map((partition) => getSocialVarietyGain(partition, context)).sort((a, b) => a - b).reduce((sum, gain) => sum + gain, 0),
      Math.max(...partitions.map((partition) => getPartitionBalanceGap(partition, byId)!)),
      partitions.reduce((sum, partition) => sum + getPartitionBalanceGap(partition, byId)!, 0),
    ];
    let optimum: number[] | null = null;
    for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) for (let c = b + 1; c < candidates.length; c++) {
      const partitions = [candidates[a], candidates[b], candidates[c]];
      if (new Set(partitions.flatMap((partition) => [...partition.team1, ...partition.team2])).size !== 12) continue;
      const value = score(partitions);
      if (!optimum || compare(value, optimum) < 0) optimum = value;
    }
    const result = findBestSocialBatchSelection(players, {
      courtCount: 3, sessionMode: SessionMode.MEXICANO, randomFn: () => 0, completedMatches: history,
      socialVarietyContext: context,
      selectionConstraints: { isQuartetAllowed: (quartet) => allowed.has(quartet.map((player) => player.userId).sort().join("|")) },
    });
    expect(score(result.selection!.selections.map((selection) => selection.partition))).toEqual(optimum);
    expect(result.varietyOptimal).toBe(true);
  });

  it("rejects normalized partitions that change quartet membership", () => {
    const result = findBestSocialBatchSelection(makePlayers(5), {
      courtCount: 1, sessionMode: SessionMode.MEXICANO, randomFn: () => 0,
      selectionConstraints: { normalizePartition: () => ({ team1: ["P0", "P0"], team2: ["P1", "P2"] }) },
    });
    expect(result.selection).toBeNull();
  });

  it("rejects an unavailable required replacement player", () => {
    const result = findBestSocialBatchSelection(makePlayers(8), {
      courtCount: 1, sessionMode: SessionMode.MEXICANO, randomFn: () => 0,
      lockedPlayerIds: new Set(["missing-player"]),
    });
    expect(result.selection).toBeNull();
    expect(result.debug.failureReason).toBe("LOCKED_PLAYERS_CANNOT_ALL_FIT");
  });
});
