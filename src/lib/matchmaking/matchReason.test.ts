import { describe, expect, it } from "vitest";

import { CourtGroupType, PlayerGender, SessionMode, SessionPool, SessionType } from "@/types/enums";
import { withSocialVarietySnapshot } from "./v3/socialVariety";
import {
  buildV3MatchmakingReason,
  buildV3MatchmakingReasonJson,
  parseMatchmakingReasonJson,
} from "./matchReason";
import { buildRestSummary } from "./v3/scoring";
import type {
  ActiveMatchmakerV3Player,
  V3SingleCourtSelection,
} from "./v3/types";

function createActivePlayer(
  userId: string,
  effectiveMatchCount: number,
  restTurns: number
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed: effectiveMatchCount,
    matchmakingBaseline: effectiveMatchCount,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount,
    restTurns,
    randomScore: 0,
    rank: 0,
  };
}

function createSelection(
  overrides: Partial<V3SingleCourtSelection> = {}
): V3SingleCourtSelection {
  const players = [
    createActivePlayer("A", 2, 4),
    createActivePlayer("B", 2, 3),
    createActivePlayer("C", 2, 2),
    createActivePlayer("D", 2, 1),
  ] as [
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
    ActiveMatchmakerV3Player,
  ];

  return {
    ids: ["A", "B", "C", "D"],
    players,
    partition: {
      team1: ["A", "C"],
      team2: ["B", "D"],
    },
    restSummary: buildRestSummary(players),
    balanceGap: 1.5,
    pointDiffGap: 0.5,
    sharedCourtRepeatPenalty: 0,
    partnerCoveragePenalty: 0,
    opponentCoveragePenalty: 0,
    partnerRepeatPenalty: 1,
    opponentRepeatPenalty: 2,
    exactRematchPenalty: 0,
    consecutivePlayCount: 0,
    consecutivePlayMaxBurden: 0,
    consecutivePlayTotalBurden: 0,
    randomScore: 0,
    pairingRandomScore: 0,
    ...overrides,
  };
}

describe("matchmaking reason", () => {
  it("builds compact points reasons without retired variety scoring text", () => {
    const reason = buildV3MatchmakingReason(createSelection(), {
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MIXICANO,
      targetPool: SessionPool.A,
      missedPool: SessionPool.B,
    });

    expect(reason.source).toBe("v3");
    expect(reason.metrics.totalRestTurns).toBe(10);
    expect(reason.metrics.minimumRestTurns).toBe(1);
    expect(reason.metrics.restTurnRange).toBe(3);
    expect(reason.metrics.selectedMatchCounts).toEqual([2, 2, 2, 2]);
    expect(reason.metrics.balanceGap).toBe(1.5);
    expect(reason.metrics.pointDiffGap).toBe(0.5);
    expect(reason.metrics.sharedCourtRepeatPenalty).toBe(0);
    expect(reason.metrics.partnerRepeatPenalty).toBe(1);
    expect(reason.metrics.opponentRepeatPenalty).toBe(2);
    expect(reason.metrics.targetPool).toBe(SessionPool.A);
    expect(reason.metrics.missedPool).toBe(SessionPool.B);
    expect(reason.summary.join(" ")).toContain("completed-match turns");
    expect(reason.summary.join(" ")).not.toContain("shared-court pairings");
    expect(reason.summary.join(" ")).toContain("Point-difference balance");
    expect(reason.summary.join(" ")).not.toContain("Partner repeat penalty");
    expect(reason.summary.join(" ")).not.toContain("Opponent repeat penalty");
    expect(reason.summary.join(" ")).toContain("Mixed court legality");
  });

  it("omits rest-specific wording when rest is disabled", () => {
    const reason = buildV3MatchmakingReason(
      createSelection({
        consecutivePlayCount: 1,
        consecutivePlayMaxBurden: 2,
        consecutivePlayTotalBurden: 2,
      }),
      {
        sessionType: SessionType.POINTS,
        sessionMode: SessionMode.MEXICANO,
        respectPlayerRest: false,
      }
    );

    expect(reason.metrics.waitToleranceSeconds).toBeUndefined();
    expect(reason.metrics.consecutivePlayCount).toBeUndefined();
    expect(reason.summary.join(" ")).not.toContain("completed-match turns");
    expect(reason.summary.join(" ")).not.toContain("previous match");
  });

  it("builds rating reasons without points-specific rest text", () => {
    const reason = buildV3MatchmakingReason(
      createSelection({
        balanceGap: 25,
        partnerRepeatPenalty: 0,
        opponentRepeatPenalty: 0,
      }),
      {
        sessionType: SessionType.ELO,
        sessionMode: SessionMode.MEXICANO,
      }
    );

    expect(reason.metrics.waitToleranceSeconds).toBeUndefined();
    expect(reason.summary.join(" ")).toContain("completed-match turns");
    expect(reason.summary.join(" ")).toContain("rating");
  });

  it("builds social mix reasons with first-time contact coverage metrics", () => {
    const reason = buildV3MatchmakingReason(
      createSelection({
        sharedCourtRepeatPenalty: 1,
        partnerCoveragePenalty: 0,
        opponentCoveragePenalty: 2,
        partnerRepeatPenalty: 0,
        opponentRepeatPenalty: 0,
        consecutivePlayCount: 1,
        consecutivePlayMaxBurden: 2,
        consecutivePlayTotalBurden: 2,
      }),
      {
        sessionType: SessionType.SOCIAL_MIX,
        sessionMode: SessionMode.MEXICANO,
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
      }
    );

    expect(reason.metrics.totalRestTurns).toBe(10);
    expect(reason.metrics.sharedCourtRepeatPenalty).toBe(1);
    expect(reason.metrics.partnerCoveragePenalty).toBe(0);
    expect(reason.metrics.opponentCoveragePenalty).toBe(2);
    expect(reason.metrics.consecutivePlayCount).toBe(1);
    expect(reason.metrics.consecutivePlayMaxBurden).toBe(2);
    expect(reason.metrics.consecutivePlayTotalBurden).toBe(2);
    expect(reason.summary.join(" ")).toContain("Shared-court repeat penalty");
    expect(reason.summary.join(" ")).toContain("completed-match turns");
    expect(reason.summary.join(" ")).toContain("Both partner pairings are new");
    expect(reason.summary.join(" ")).toContain("Opponent coverage");
    expect(reason.summary.join(" ")).toContain("previous match");
  });

  it("explains the shared replay envelope and combined-entropy order for Mixed Social", () => {
    const reason = buildV3MatchmakingReason(
      createSelection({ socialVarietyGain: 0.25 }),
      {
        sessionType: SessionType.SOCIAL_MIX,
        sessionMode: SessionMode.MIXICANO,
        courtGroupType: CourtGroupType.CROSSOVER,
        poolASeatCount: 2,
        poolBSeatCount: 2,
      }
    );

    expect(reason.summary.join(" ")).toContain("fair turns, arrival priority, applicable player-group rules and overdue-turn protection");
    expect(reason.summary.join(" ")).toContain("certifies the lowest immediate-replay count for the whole refill batch");
    expect(reason.summary.join(" ")).toContain("one additional replay is admitted only when its first-exposure coverage strictly exceeds the best-replay frontier");
    expect(reason.summary.join(" ")).toContain("maximizes combined normalized entropy across courtmates, partners, opponents and match type");
    expect(reason.summary.join(" ")).toContain("smoother completed-match rest cadence breaks entropy ties");
    expect(reason.summary.join(" ")).toContain("completed-match rest turns");
  });

  it.each([SessionType.POINTS, SessionType.ELO])("explains %s entropy, starvation, fixed balance envelope and final tie-break", (sessionType) => {
    const balanceGuardrail = {
      mode: sessionType === SessionType.ELO ? "RATING" as const : "POINTS" as const,
      bestMaxBalanceGap: 2,
      bestTotalBalanceGap: 3,
      nearBestWindow: sessionType === SessionType.ELO ? 30 : 1.5,
      absoluteCeiling: sessionType === SessionType.ELO ? 50 : null,
      allowedMaxBalanceGap: sessionType === SessionType.ELO ? 32 : 3.5,
      allowedTotalBalanceGap: null,
      ceilingFeasible: true,
      baselineCertified: true,
    };
    const selection = createSelection({
      socialVarietyGain: 0.00000002,
      socialVarietyGains: { courtmates: 0.00000001, partners: 0.000000005, opponents: 0.000000005, matchType: 0 },
      socialStarvation: { idealRestGap: 3, availableOverdueCount: 2, selectedOverdueCount: 2, leftOutOverdueCount: 0, highestLeftOutRestTurns: 0, totalLeftOutRestTurns: 0 },
      balanceGuardrail,
      fairnessVector: [2, 2, 2, 2, 0, Infinity],
      schedulingRank: 0,
      finalTieBreak: "EXACT_REMATCH",
    });
    const reason = buildV3MatchmakingReason(selection, { sessionType, sessionMode: SessionMode.MIXICANO, respectPlayerRest: false });
    expect(reason.summary.join(" ")).toContain("The balance guardrail sets the admissible envelope");
    expect(reason.summary.join(" ")).toContain("best achievable worst-court balance gap was 2");
    expect(reason.summary.join(" ")).toContain("2 of 2 available players");
    expect(reason.summary.join(" ")).toContain("Normalized entropy gain");
    expect(reason.summary.join(" ")).toContain("match type");
    expect(reason.summary.join(" ")).toContain("Starvation protection remains active, while ordinary replay, first-exposure coverage and cadence gates are disabled");
    expect(reason.summary.join(" ")).toContain("combined normalized entropy across courtmates, partners, opponents and match type");
    expect(reason.summary.join(" ")).toContain("Exact rematch avoidance decided only after");
    expect(reason.summary.join(" ")).not.toMatch(/coverage penalty|Partner repeat penalty|Opponent repeat penalty|Shared-court repeat penalty/);
    const parsed = parseMatchmakingReasonJson(JSON.stringify(reason));
    expect(parsed?.metrics.balanceGuardrail).toEqual(balanceGuardrail);
    expect(parsed?.metrics.finalTieBreak).toBe("EXACT_REMATCH");
    expect(parsed?.metrics.fairnessVector).toEqual([2, 2, 2, 2, 0]);
    expect(parsed?.metrics.socialVarietyGain).toBe(0.00000002);
    expect(parsed?.socialVariety).toBeDefined();
  });

  it("preserves exact Balanced metrics at decimal guardrail boundaries", () => {
    const reason = buildV3MatchmakingReason(createSelection({
      balanceGap: 3.549,
      pointDiffGap: 0.12345,
      balanceGuardrail: { mode: "POINTS", bestMaxBalanceGap: 2.049, bestTotalBalanceGap: 2.049, nearBestWindow: 1.5, absoluteCeiling: null, allowedMaxBalanceGap: 3.549, allowedTotalBalanceGap: null, ceilingFeasible: true, baselineCertified: true },
    }), { sessionType: SessionType.POINTS, sessionMode: SessionMode.MEXICANO });
    const parsed = parseMatchmakingReasonJson(JSON.stringify(reason));
    expect(parsed?.metrics.balanceGap).toBe(3.549);
    expect(parsed?.metrics.pointDiffGap).toBe(0.12345);
    expect(parsed?.metrics.balanceGap).toBe(parsed?.metrics.balanceGuardrail?.allowedMaxBalanceGap);
  });

  it("explains an unavoidable Rating ceiling within the stronger starvation state", () => {
    const reason = buildV3MatchmakingReason(createSelection({
      balanceGap: 60,
      socialVarietyGain: 0.1,
      balanceGuardrail: { mode: "RATING", bestMaxBalanceGap: 60, bestTotalBalanceGap: 90, nearBestWindow: 30, absoluteCeiling: 50, allowedMaxBalanceGap: 60, allowedTotalBalanceGap: 90, ceilingFeasible: false, baselineCertified: true },
    }), { sessionType: SessionType.ELO, sessionMode: SessionMode.MEXICANO });
    expect(reason.summary.join(" ")).toContain("ceiling is unattainable within this stronger rotation state");
    expect(reason.summary.join(" ")).toContain("allowed total batch balance gap is at most 90");
  });

  it("parses valid reason JSON and ignores invalid JSON", () => {
    const json = buildV3MatchmakingReasonJson(createSelection(), {
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MEXICANO,
    });

    expect(parseMatchmakingReasonJson(json)?.selectedUserIds).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(parseMatchmakingReasonJson("{not-json")).toBeNull();
    expect(parseMatchmakingReasonJson(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it("preserves ongoing Social gains and assignment-time mixed sides", () => {
    const selection = createSelection({
      socialVarietyGain: 0.123456789,
      socialStarvation: {
        idealRestGap: 2,
        availableOverdueCount: 3,
        selectedOverdueCount: 2,
        leftOutOverdueCount: 1,
        highestLeftOutRestTurns: 5,
        totalLeftOutRestTurns: 5,
      },
      socialVarietyGains: {
        courtmates: 0.01,
        partners: 0.02,
        opponents: 0.03,
        matchType: 0.063456789,
      },
    });
    selection.players.forEach((player) => {
      player.gender = ["A", "B"].includes(player.userId)
        ? PlayerGender.MALE
        : PlayerGender.FEMALE;
    });
    const json = buildV3MatchmakingReasonJson(selection, {
      sessionType: SessionType.SOCIAL_MIX,
      sessionMode: SessionMode.MIXICANO,
    });
    const parsed = parseMatchmakingReasonJson(json);

    expect(parsed?.socialVariety?.courtType).toBe("MIXED");
    expect(parsed?.socialVariety?.effectiveSideByUserId).toEqual({
      A: "UPPER", B: "UPPER", C: "LOWER", D: "LOWER",
    });
    expect(parsed?.metrics.socialVarietyGain).toBe(0.123456789);
    expect(parsed?.metrics.socialVarietyGains).toEqual(selection.socialVarietyGains);
    expect(parsed?.metrics.socialStarvation).toEqual(selection.socialStarvation);
    expect(parsed?.summary.join(" ")).toContain("Ongoing variety includes courtmates");
    expect(parsed?.summary.join(" ")).toContain("match type");
    expect(parsed?.summary.join(" ")).toContain("2 of 3 available players beyond the 2-match usual rest gap were selected");
    expect(parsed?.summary.join(" ")).not.toContain("coverage penalty");
  });

  it("keeps metadata-only manual assignments out of displayed reasons", () => {
    const selection = createSelection();
    const json = withSocialVarietySnapshot(null, selection.partition, selection.players);
    expect(JSON.parse(json).socialVariety.courtType).toBeNull();
    expect(parseMatchmakingReasonJson(json)).toBeNull();
  });

  it("ignores invalid optional Social metadata while parsing the legacy reason", () => {
    const reason = buildV3MatchmakingReason(createSelection(), {
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MEXICANO,
    });
    const parsed = parseMatchmakingReasonJson({
      ...reason,
      socialVariety: { version: 99 },
      metrics: {
        ...reason.metrics,
        socialVarietyGain: "invalid",
        socialVarietyGains: { courtmates: 1 },
      },
    });
    expect(parsed?.selectedUserIds).toEqual(reason.selectedUserIds);
    expect(parsed?.socialVariety).toBeUndefined();
    expect(parsed?.metrics.socialVarietyGain).toBeUndefined();
    expect(parsed?.metrics.socialVarietyGains).toBeUndefined();
  });

  it("parses older reason JSON without point-difference metrics", () => {
    const parsed = parseMatchmakingReasonJson(
      JSON.stringify({
        version: 1,
        source: "v3",
        sessionType: SessionType.POINTS,
        sessionMode: SessionMode.MEXICANO,
        selectedUserIds: ["A", "B", "C", "D"],
        team1UserIds: ["A", "B"],
        team2UserIds: ["C", "D"],
        summary: ["Older reason"],
        metrics: {
          fairnessBand: 0,
          selectedMatchCounts: [0, 0, 0, 0],
          balanceGap: 0,
          partnerRepeatPenalty: 0,
          opponentRepeatPenalty: 0,
          exactRematchPenalty: 0,
          waitRangeSeconds: 0,
          minimumWaitSeconds: 0,
          totalWaitSeconds: 0,
          mixedMode: false,
        },
      })
    );

    expect(parsed?.metrics.pointDiffGap).toBeUndefined();
    expect(parsed?.metrics.restTurnRange).toBe(0);
    expect(parsed?.metrics.waitRangeSeconds).toBe(0);
    expect(parsed?.selectedUserIds).toEqual(["A", "B", "C", "D"]);
  });
});
