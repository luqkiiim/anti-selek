import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { getDoublesPartitions, getPartitionBalanceGap, isValidPartitionForMode } from "./balance";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import { getExactPartitionKey } from "./rematch";
import { buildSocialVarietyContext, getSocialVarietyGain, getSocialVarietyGains } from "./socialVariety";
import { addLateJoiner, createSimulationPlayers, createSimulationState, pausePlayers, playRound, resumePlayers } from "./simulation";
import type { MatchmakerV3Player, V3CompletedMatch, V3DoublesPartition } from "./types";

const players = (strengths: number[]): MatchmakerV3Player[] => strengths.map((strength, index) => ({
  userId: `P${index}`, strength, matchesPlayed: 0, matchmakingBaseline: 0,
  availableSince: new Date("2026-04-01"), restTurns: 0, gender: "MALE", partnerPreference: "OPEN",
}));
const repeated: V3CompletedMatch[] = Array.from({ length: 30 }, () => ({ team1: ["P0", "P1"], team2: ["P2", "P3"] }));
const types = [SessionType.POINTS, SessionType.ELO] as const;

describe("Balanced shared rotation policy and explicit balance envelope", () => {
  it.each([
    [25, 1, SessionType.POINTS], [20, 2, SessionType.POINTS], [30, 4, SessionType.POINTS],
    [25, 1, SessionType.ELO], [20, 2, SessionType.ELO], [30, 4, SessionType.ELO],
  ] as const)("returns a certified full batch for %i players on %i courts (%s) under bounded default search", (count, courtCount, sessionType) => {
    const result = findBestBatchSelectionV3(players(Array(count).fill(1000)), {
      courtCount, sessionMode: SessionMode.MEXICANO, sessionType, randomFn: () => 0,
    });
    expect(result.selection?.selections).toHaveLength(courtCount);
    expect(new Set(result.selection!.selections.flatMap((selection) => selection.ids)).size).toBe(courtCount * 4);
    expect(result.debug.balanceCertified).toBe(true);
    expect(result.debug.balanceGuardrail?.baselineCertified).toBe(true);
    if (count === 30 && courtCount === 4) {
      expect(result.debug.replayCertified).toBe(true);
      expect(result.debug.coverageGateCertified).toBe(true);
      expect(result.debug.coverageGateUpperBoundCertified).toBe(true);
    }
    expect(result.selection?.maxBalanceGap).toBeLessThanOrEqual(result.debug.balanceGuardrail!.allowedMaxBalanceGap);
    expect(result.debug.consideredCandidateCount).toBe(count);
  }, 15_000);

  it.each(types)("chooses organic entropy inside the near-best envelope and excludes a much worse fresh candidate (%s)", (sessionType) => {
    const roster = players(sessionType === SessionType.POINTS ? [10, 10, 10, 10, 13, 28] : [1000, 1000, 1000, 1000, 1060, 1452]);
    const context = buildSocialVarietyContext(roster, repeated, { sessionMode: SessionMode.MEXICANO });
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType, completedMatches: repeated, randomFn: () => 0,
    });
    expect(result.selection?.ids).toContain("P4");
    expect(result.selection?.ids).not.toContain("P5");
    expect(result.selection?.balanceGap).toBe(sessionType === SessionType.POINTS ? 1.5 : 30);
    expect(result.selection?.socialVarietyGain).toBeCloseTo(getSocialVarietyGain(result.selection!.partition, context), 12);
    expect(result.debug.balanceGuardrail).toMatchObject({ bestMaxBalanceGap: 0, allowedMaxBalanceGap: sessionType === SessionType.POINTS ? 1.5 : 30, baselineCertified: true });
    expect(result.debug.balanceCertified).toBe(true);
  });

  it("retains the rating absolute ceiling in addition to its near-best window", () => {
    const roster = players([1000, 1000, 1000, 1000, 1098]);
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType: SessionType.ELO, completedMatches: repeated, randomFn: () => 0,
    });
    expect(result.selection?.ids).not.toContain("P4");
    expect(result.selection?.balanceGap).toBe(0);
    expect(result.debug.balanceGuardrail).toMatchObject({ absoluteCeiling: 50, nearBestWindow: 30, allowedMaxBalanceGap: 30 });
  });

  it.each(types)("continues valuing neglected Mixed match types after every player has already experienced both (%s)", (sessionType) => {
    const roster = players(Array(8).fill(1000)).map((player, index) => ({ ...player, gender: index < 4 ? "MALE" : "FEMALE", partnerPreference: index < 4 ? "OPEN" : "FEMALE_FLEX" }));
    const byId = new Map(roster.map((player) => [player.userId, player]));
    const mixed: V3DoublesPartition[] = [];
    for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 4; b += 1) for (let c = 4; c < 7; c += 1) for (let d = c + 1; d < 8; d += 1) {
      mixed.push(...getDoublesPartitions([`P${a}`, `P${b}`, `P${c}`, `P${d}`]).filter((partition) => isValidPartitionForMode(partition, byId, SessionMode.MIXICANO)));
    }
    const ownSide: V3DoublesPartition[] = [
      { team1: ["P0", "P1"], team2: ["P2", "P3"] },
      { team1: ["P4", "P5"], team2: ["P6", "P7"] },
    ];
    const history = [...Array.from({ length: 5 }, () => mixed).flat(), ...ownSide];
    const context = buildSocialVarietyContext(roster, history, { sessionMode: SessionMode.MIXICANO });
    for (const player of context.playersByUserId.values()) expect(player.matchType.counts.size).toBe(2);
    expect(getSocialVarietyGains(ownSide[0], context).matchType).toBeGreaterThan(getSocialVarietyGains(mixed[0], context).matchType);
    const result = findBestSingleCourtSelectionV3(roster, { sessionMode: SessionMode.MIXICANO, sessionType, completedMatches: history, randomFn: () => 0 });
    expect(result.selection?.socialVariety?.courtType).not.toBe("MIXED");
    expect(result.selection?.socialVarietyGains?.matchType).toBeGreaterThan(0);
  });

  it.each(types)("recalculates the balance baseline inside the starvation-compliant class with rest disabled (%s)", (sessionType) => {
    const roster = players(sessionType === SessionType.POINTS ? [10, 10, 10, 10, 30] : [1000, 1000, 1000, 1000, 1200]);
    roster[4].restTurns = 4;
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType, respectPlayerRest: false, randomFn: () => 0,
    });
    const baseline = sessionType === SessionType.POINTS ? 10 : 100;
    expect(result.selection?.ids).toContain("P4");
    expect(result.selection?.balanceGap).toBe(baseline);
    expect(result.selection?.socialStarvation).toMatchObject({ availableOverdueCount: 1, selectedOverdueCount: 1, leftOutOverdueCount: 0 });
    expect(result.debug.balanceGuardrail?.bestMaxBalanceGap).toBe(baseline);
    if (sessionType === SessionType.ELO) expect(result.debug.balanceGuardrail).toMatchObject({ ceilingFeasible: false, allowedMaxBalanceGap: 100, allowedTotalBalanceGap: 100 });
  });

  it.each(types)("protects an overdue player globally before deriving the two-court envelope (%s)", (sessionType) => {
    const roster = players(Array(10).fill(sessionType === SessionType.POINTS ? 10 : 1000));
    roster[9].strength += sessionType === SessionType.POINTS ? 12 : 120;
    roster[9].restTurns = 3;
    const result = findBestBatchSelectionV3(roster, {
      courtCount: 2, sessionMode: SessionMode.MEXICANO, sessionType, respectPlayerRest: false, randomFn: () => 0,
    });
    expect(result.selection?.selections.flatMap((selection) => selection.ids)).toContain("P9");
    const baseline = sessionType === SessionType.POINTS ? 6 : 60;
    expect(result.debug.balanceGuardrail?.bestMaxBalanceGap).toBe(baseline);
    expect(result.selection?.maxBalanceGap).toBe(baseline);
    expect(result.selection?.selections[0].socialStarvation).toMatchObject({ selectedOverdueCount: 1, leftOutOverdueCount: 0 });
  });

  it.each(types)("matches an independent global minimax-and-entropy oracle rather than hiding one bad court (%s)", (sessionType) => {
    const scale = sessionType === SessionType.POINTS ? 0.25 : 5;
    const roster = players([0, 1, 2, 3, 5, 8, 13, 21, 34, 55].map((value) => 1000 + value * scale));
    const byId = new Map(roster.map((player) => [player.userId, player]));
    const context = buildSocialVarietyContext(roster, repeated, { sessionMode: SessionMode.MEXICANO });
    const candidates: Array<{ ids: string[]; partition: V3DoublesPartition; balance: number; gain: number }> = [];
    for (let a = 0; a < 7; a += 1) for (let b = a + 1; b < 8; b += 1) for (let c = b + 1; c < 9; c += 1) for (let d = c + 1; d < 10; d += 1) {
      const ids = [a, b, c, d].map((index) => `P${index}`) as [string, string, string, string];
      for (const partition of getDoublesPartitions(ids)) candidates.push({ ids, partition, balance: getPartitionBalanceGap(partition, byId)!, gain: getSocialVarietyGain(partition, context) });
    }
    const batches: Array<{ max: number; total: number; gain: number; courts: typeof candidates }> = [];
    for (let a = 0; a < candidates.length; a += 1) for (let b = a + 1; b < candidates.length; b += 1) {
      const left = candidates[a], right = candidates[b];
      if (left.ids.some((id) => right.ids.includes(id))) continue;
      batches.push({ max: Math.max(left.balance, right.balance), total: left.balance + right.balance, gain: left.gain + right.gain, courts: [left, right] });
    }
    const baseline = batches.slice().sort((a, b) => a.max - b.max || a.total - b.total)[0];
    const limit = sessionType === SessionType.POINTS ? baseline.max + 1.5 : Math.min(50, baseline.max + 30);
    const optimum = batches.filter((batch) => batch.max <= limit).sort((a, b) => b.gain - a.gain || a.max - b.max || a.total - b.total)[0];
    const result = findBestBatchSelectionV3(roster, {
      courtCount: 2, sessionMode: SessionMode.MEXICANO, sessionType, completedMatches: repeated, randomFn: () => 0,
    });
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.debug.balanceGuardrail?.bestMaxBalanceGap).toBe(baseline.max);
    expect(result.selection?.maxBalanceGap).toBeLessThanOrEqual(limit);
    expect(result.selection?.totalSocialVarietyGain).toBeCloseTo(optimum.gain, 12);
    expect(result.selection?.maxBalanceGap).toBe(optimum.max);
    expect(result.selection?.totalBalanceGap).toBe(optimum.total);
    const layouts = new Set(candidates.map((candidate) => getExactPartitionKey(candidate.partition)));
    for (const selection of result.selection!.selections) expect(layouts.has(getExactPartitionKey(selection.partition))).toBe(true);
  });

  it.each(types)("uses the full unpaused opportunity roster including busy players (%s)", (sessionType) => {
    const roster = players(Array(12).fill(1000));
    roster.slice(8).forEach((player) => { player.isBusy = true; });
    roster[11].isPaused = true;
    const context = buildSocialVarietyContext(roster, repeated, { sessionMode: SessionMode.MEXICANO });
    expect(context.playersByUserId.get("P0")?.partners.opportunities.has("P8")).toBe(true);
    expect(context.playersByUserId.get("P0")?.partners.opportunities.has("P11")).toBe(false);
    const result = findBestSingleCourtSelectionV3(roster, {
      sessionMode: SessionMode.MEXICANO, sessionType, completedMatches: repeated, randomFn: () => 0,
    });
    expect(result.selection?.ids.every((id) => Number(id.slice(1)) < 8)).toBe(true);
    expect(result.selection?.socialVarietyGain).toBeCloseTo(getSocialVarietyGain(result.selection!.partition, context), 12);
    expect(result.selection?.socialStarvation?.idealRestGap).toBe(2);
  });

  it.each(types)("gives late join and resume neutral entry rather than catch-up matches (%s)", (sessionType) => {
    const state = createSimulationState(createSimulationPlayers(7, { strengthStep: 0 }));
    pausePlayers(state, ["P7"]);
    for (let round = 0; round < 9; round += 1) playRound(state, { courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType, randomFn: () => 0 });
    const originalCounts = state.players.filter((player) => !player.isPaused).map((player) => player.matchesPlayed);
    const neutral = Math.min(...originalCounts);
    resumePlayers(state, ["P7"]);
    const late = { ...createSimulationPlayers(1)[0], userId: "Late" };
    addLateJoiner(state, late);
    expect(state.players.find((player) => player.userId === "P7")?.matchmakingBaseline).toBe(neutral);
    expect(state.players.find((player) => player.userId === "Late")?.matchmakingBaseline).toBe(neutral);
    for (let round = 0; round < 12; round += 1) playRound(state, { courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType, randomFn: () => 0 });
    const entrants = state.players.filter((player) => ["Late", "P7"].includes(player.userId));
    const incumbents = state.players.filter((player) => !["Late", "P7"].includes(player.userId));
    expect(Math.min(...incumbents.map((player) => player.matchesPlayed)) - Math.max(...entrants.map((player) => player.matchesPlayed))).toBeGreaterThanOrEqual(neutral - 1);
    const effective = state.players.map((player) => Math.max(player.matchesPlayed, player.matchmakingBaseline));
    expect(Math.max(...effective) - Math.min(...effective)).toBeLessThanOrEqual(1);
  });
});
