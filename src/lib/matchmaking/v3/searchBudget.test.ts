import { describe, expect, it, vi } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { buildSocialVarietyContext } from "./socialVariety";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import { findBestRotationBatchSelection } from "./socialBatch";
import { runBalancedCandidateWithProductionFallback, verifyBalancedCandidateAcceptance } from "./balancedCandidateAcceptance";
import { createMatchmakingSearchBudget, MatchmakingSearchBudgetExceededError } from "./searchBudget";
import type { MatchmakerV3Player, V3SelectionConstraints } from "./types";

function players(): MatchmakerV3Player[] {
  return Array.from({ length: 8 }, (_, index) => ({
    userId: `P${index}`, matchesPlayed: 0, matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00Z"), strength: 1000,
    restTurns: 1, gender: index < 4 ? "MALE" : "FEMALE",
    mixedSideOverride: index < 4 ? "UPPER" : "LOWER", isBusy: false, isPaused: false,
  }));
}

describe("shared matchmaking computation budget", () => {
  it("caps child phases from the original monotonic start", () => {
    let time = 100;
    const budget = createMatchmakingSearchBudget({ now: () => time });
    const primary = budget.capAtElapsedMs(3_000);
    time = 3_050;
    expect(primary.remainingMs()).toBe(50);
    expect(primary.capAtElapsedMs(4_500).deadline).toBe(3_100);
    time = 3_100;
    expect(primary.isExpired()).toBe(true);
    expect(budget.capAtElapsedMs(4_500).remainingMs()).toBe(1_500);
    expect(budget.remainingMs()).toBe(2_000);
  });

  it("caches complete opportunity unions while rebuilding independent history counts", () => {
    const roster = players();
    const predicate = vi.fn(() => true);
    const rule: V3SelectionConstraints = { isQuartetAllowed: predicate };
    const budget = createMatchmakingSearchBudget();
    const options = { sessionMode: SessionMode.MIXICANO, opportunityConstraints: [rule, rule], searchBudget: budget };
    const first = buildSocialVarietyContext(roster, [], options);
    expect(predicate).toHaveBeenCalledTimes(70);
    // Consumer mutation cannot poison the private frozen vocabulary.
    (first.playersByUserId.get("P0")!.courtmates.opportunities as Set<string>).clear();
    const next = buildSocialVarietyContext(roster, [{ team1: ["P0", "P4"], team2: ["P1", "P5"] }], {
      ...options, searchBudget: budget.capAtElapsedMs(4_500),
    });
    expect(predicate).toHaveBeenCalledTimes(70);
    expect(next.playersByUserId.get("P0")!.courtmates.opportunities.size).toBe(7);
    expect(next.playersByUserId.get("P0")!.partners.counts.get("P4")).toBe(1);
    roster[0].strength = 1001;
    buildSocialVarietyContext(roster, [], options);
    expect(predicate).toHaveBeenCalledTimes(140);
    buildSocialVarietyContext(roster, [], { ...options, opportunityConstraints: [{ isQuartetAllowed: predicate }] });
    expect(predicate).toHaveBeenCalledTimes(210);
  });

  it("does not publish an interrupted opportunity union", () => {
    let time = 0;
    let expire = true;
    const predicate = vi.fn(() => { if (expire) time = 3_000; return true; });
    const rule: V3SelectionConstraints = { isQuartetAllowed: predicate };
    const budget = createMatchmakingSearchBudget({ now: () => time });
    const options = { sessionMode: SessionMode.MIXICANO, opportunityConstraints: [rule] };
    expect(() => buildSocialVarietyContext(players(), [], { ...options, searchBudget: budget.capAtElapsedMs(3_000) }))
      .toThrow(MatchmakingSearchBudgetExceededError);
    expect(predicate).toHaveBeenCalledTimes(1);
    expire = false;
    buildSocialVarietyContext(players(), [], { ...options, searchBudget: budget.capAtElapsedMs(4_500) });
    expect(predicate).toHaveBeenCalledTimes(71);
  });

  it("preserves seeded selection and the subsequent RNG state with a warm cache", () => {
    const roster = players();
    const rule: V3SelectionConstraints = { isQuartetAllowed: () => true };
    const budget = createMatchmakingSearchBudget();
    const options = {
      sessionType: SessionType.POINTS as const, sessionMode: SessionMode.MIXICANO,
      courtCount: 1, recurrencePolicy: "strict-replay-rescue" as const,
      socialStructuralOpportunityConstraints: [rule], selectionConstraints: rule,
    };
    const run = (cached: boolean) => {
      let state = 4729;
      const randomFn = () => { state = state * 48271 % 2147483647; return state / 2147483647; };
      const result = findBestBalancedRecurrenceSelection(roster, { ...options, randomFn, ...(cached ? { searchBudget: budget } : {}) });
      return { result, nextRandom: randomFn() };
    };
    const uncached = run(false);
    expect(run(true)).toEqual(uncached);
    expect(run(true)).toEqual(uncached);
  });

  it("rejects an otherwise certified candidate when independent acceptance expires", () => {
    let time = 0;
    const roster = players();
    const options = { sessionType: SessionType.POINTS as const, sessionMode: SessionMode.MIXICANO, courtCount: 1,
      recurrencePolicy: "strict-replay-rescue" as const, randomFn: () => 0.25 };
    const result = findBestBalancedRecurrenceSelection(roster, options);
    const rule: V3SelectionConstraints = { isQuartetAllowed: () => { time = 3_000; return true; } };
    const searchBudget = createMatchmakingSearchBudget({ now: () => time }).capAtElapsedMs(3_000);
    const reasons = verifyBalancedCandidateAcceptance(roster, { ...options, searchBudget, socialStructuralOpportunityConstraints: [rule] }, options, result);
    expect(reasons).toContain("CANDIDATE_ACCEPTANCE_BUDGET_EXHAUSTED");
  });

  it("fails closed after preparation exhaustion without reporting exhaustive infeasibility", () => {
    let time = 0;
    const searchBudget = createMatchmakingSearchBudget({ now: () => time });
    const rule: V3SelectionConstraints = { isQuartetAllowed: () => { time = 5_000; return true; } };
    const run = runBalancedCandidateWithProductionFallback({ candidatePlayers: players(), options: {
      sessionType: SessionType.POINTS, sessionMode: SessionMode.MIXICANO, courtCount: 1,
      schedules: [{ rank: 0, courts: [rule] }], searchBudget,
    } });
    expect(run.result.selection).toBeNull();
    expect(run.result.debug.searchLimitReached).toBe(true);
    expect(run.decision.outcome).toBe("no-certified-selection");
    expect(run.decision.reasonCodes).toContain("CANDIDATE_BUDGET_EXHAUSTED");
    expect(run.decision.fallbackProof?.certified).toBe(false);
  });

  it("keeps an interrupted phase uncertified even when the request still has time", () => {
    let time = 0;
    const searchBudget = createMatchmakingSearchBudget({ now: () => time++ });
    const result = findBestBalancedRecurrenceSelection(players(), {
      sessionType: SessionType.POINTS, sessionMode: SessionMode.MIXICANO,
      courtCount: 1, recurrencePolicy: "strict-replay-rescue",
      searchLimits: { maxMs: 10 }, searchBudget,
    });
    expect(searchBudget.remainingMs()).toBeGreaterThan(0);
    expect(result.selection).toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.recurrenceCertified).toBe(false);
    expect(result.recurrenceAdmissionCertified).toBe(false);
  });
  it.each([
    ["recurrence frontier", "retainPerMaskMetricFrontier", 8, 1],
    ["recurrence compatibility", "getCompatibleCandidates", 12, 3],
    ["fallback compatibility", "getCompatibleCandidates", 12, 3],
    ["recurrence coverage bound", "getOptimisticCoverageGainUnits", 12, 3],
    ["fallback coverage bound", "getOptimisticCoverageGainUnits", 12, 3],
  ] as const)("unwinds %s preparation when its clock expires", (_label, stage, size, courtCount) => {
    let time = 0;
    let stagePolls = 0;
    let clockPolls = 0;
    // A monotonic clock remains stopped during earlier phases, then expires
    // inside the specified real scan. No candidates or scores are mocked.
    const searchBudget = createMatchmakingSearchBudget({ now: () => {
      if (++clockPolls > 5_000) time = 5_000;
      if (new Error().stack?.includes(stage)) {
        stagePolls += 1;
        if (stagePolls === 2) time = 5_000;
      }
      return time;
    } });
    const roster = Array.from({ length: size }, (_, index) => ({
      ...players()[index % 8]!, userId: `P${index}`,
      gender: index < size / 2 ? "MALE" : "FEMALE",
      mixedSideOverride: index < size / 2 ? "UPPER" : "LOWER",
    }));
    const history = Array.from({ length: 4 }, (_, index) => ({
      id: `H${index}`, team1: ["P0", "P6"] as [string, string], team2: ["P1", "P7"] as [string, string],
      completedAt: new Date(2026, 0, 1, 0, 0, index),
    }));
    const coverageCase = stage === "getOptimisticCoverageGainUnits";
    const fallbackCompatibility = _label === "fallback compatibility";
    const fallbackCase = _label.startsWith("fallback");
    const fixedQuartets = [new Set(["P0", "P1", "P6", "P7"]),
      new Set(["P2", "P3", "P8", "P9"]), new Set(["P4", "P5", "P10", "P11"])];
    const selectionConstraints: V3SelectionConstraints | undefined = coverageCase ? { isQuartetAllowed: (quartet) =>
      fixedQuartets.some((ids) => quartet.every((player) => ids.has(player.userId))) } : undefined;
    const commonOptions = {
      ...(coverageCase ? {
        // The relaxed vocabulary has alternatives the physical-court rules
        // cannot realize, so coverage must inspect an actual search bound.
        socialVarietyContext: buildSocialVarietyContext(roster, history, { sessionMode: SessionMode.MIXICANO }),
        selectionConstraints,
      } : {}),
      sessionMode: SessionMode.MIXICANO, courtCount, rotationPlayerCount: size, respectPlayerRest: true,
      completedMatches: history,
      socialHistoryMatches: history, randomFn: () => 0.25, searchBudget,
    };
    const result = fallbackCase
      ? findBestRotationBatchSelection(roster, {
        ...commonOptions,
        sessionType: fallbackCompatibility ? SessionType.SOCIAL_MIX : SessionType.POINTS,
        ...(fallbackCompatibility ? { socialPriorityPolicy: "courtmate-beneficial-rescue" as const } : {}),
      })
      : findBestBalancedRecurrenceSelection(roster, {
        ...commonOptions,
        sessionType: SessionType.POINTS,
        recurrencePolicy: "strict-replay-rescue",
      });
    expect(stagePolls, "the real preparation scan must be exercised").toBe(2);
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.varietyOptimal).toBe(false);
    expect(result.selection).toBeNull();
  });

});
