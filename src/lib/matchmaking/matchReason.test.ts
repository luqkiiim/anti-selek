import { describe, expect, it } from "vitest";

import { SessionMode, SessionPool, SessionType } from "@/types/enums";
import {
  buildV3MatchmakingReason,
  buildV3MatchmakingReasonJson,
  parseMatchmakingReasonJson,
} from "./matchReason";
import { buildWaitSummary, POINTS_WAIT_TOLERANCE_MS } from "./v3/scoring";
import type {
  ActiveMatchmakerV3Player,
  V3SingleCourtSelection,
} from "./v3/types";

function createActivePlayer(
  userId: string,
  effectiveMatchCount: number,
  waitMs: number
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed: effectiveMatchCount,
    matchmakingBaseline: effectiveMatchCount,
    availableSince: new Date("2026-03-18T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount,
    waitMs,
    randomScore: 0,
    rank: 0,
  };
}

function createSelection(
  overrides: Partial<V3SingleCourtSelection> = {}
): V3SingleCourtSelection {
  const players = [
    createActivePlayer("A", 2, POINTS_WAIT_TOLERANCE_MS),
    createActivePlayer("B", 2, POINTS_WAIT_TOLERANCE_MS - 10_000),
    createActivePlayer("C", 2, POINTS_WAIT_TOLERANCE_MS - 20_000),
    createActivePlayer("D", 2, POINTS_WAIT_TOLERANCE_MS - 30_000),
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
    waitSummary: buildWaitSummary(players),
    balanceGap: 1.5,
    sharedCourtRepeatPenalty: 0,
    partnerCoveragePenalty: 0,
    opponentCoveragePenalty: 0,
    partnerRepeatPenalty: 1,
    opponentRepeatPenalty: 2,
    exactRematchPenalty: 0,
    randomScore: 0,
    ...overrides,
  };
}

describe("matchmaking reason", () => {
  it("builds compact points reasons with wait tolerance and repeat penalties", () => {
    const reason = buildV3MatchmakingReason(createSelection(), {
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MIXICANO,
      targetPool: SessionPool.A,
      missedPool: SessionPool.B,
    });

    expect(reason.source).toBe("v3");
    expect(reason.metrics.waitToleranceSeconds).toBe(120);
    expect(reason.metrics.selectedMatchCounts).toEqual([2, 2, 2, 2]);
    expect(reason.metrics.balanceGap).toBe(1.5);
    expect(reason.metrics.partnerRepeatPenalty).toBe(1);
    expect(reason.metrics.opponentRepeatPenalty).toBe(2);
    expect(reason.metrics.targetPool).toBe(SessionPool.A);
    expect(reason.metrics.missedPool).toBe(SessionPool.B);
    expect(reason.summary.join(" ")).toContain("Wait differences within 120");
    expect(reason.summary.join(" ")).toContain("Mixed court legality");
  });

  it("omits points wait tolerance for rating reasons", () => {
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
    expect(reason.summary.join(" ")).not.toContain("Wait differences within");
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
      }),
      {
        sessionType: SessionType.SOCIAL_MIX,
        sessionMode: SessionMode.MEXICANO,
      }
    );

    expect(reason.metrics.waitToleranceSeconds).toBe(120);
    expect(reason.metrics.sharedCourtRepeatPenalty).toBe(1);
    expect(reason.metrics.partnerCoveragePenalty).toBe(0);
    expect(reason.metrics.opponentCoveragePenalty).toBe(2);
    expect(reason.summary.join(" ")).toContain("Shared-court repeat penalty");
    expect(reason.summary.join(" ")).toContain("Both partner pairings are new");
    expect(reason.summary.join(" ")).toContain("Opponent coverage");
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
});
