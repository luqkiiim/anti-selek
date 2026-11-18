import { describe, expect, it } from "vitest";
import { findBestLevelBatchSelection, type LevelSelectionOptions } from "@/lib/matchmaking/ladder/levelSelection";
import type { MatchmakerLadderPlayer } from "@/lib/matchmaking/ladder/types";
import { SessionBalanceMetric, SessionMode } from "@/types/enums";
import {
  buildRefillForecastProbe, compareRefillForecast, forecastSingleLevelRefill, projectLevelRefillPlayers,
} from "./level-match-refill-forecast";

const before = new Date("2026-10-01T00:00:00Z");
const after = new Date("2026-10-01T00:01:00Z");
const options: LevelSelectionOptions<MatchmakerLadderPlayer> = {
  courtCount: 1, sessionMode: SessionMode.MIXICANO, levelPolicy: { metric: SessionBalanceMetric.RATING },
  level3: { groups: false, recoverDistribution: true }, randomFn: () => 0,
};

function player(userId: string, overrides: Partial<MatchmakerLadderPlayer> = {}): MatchmakerLadderPlayer {
  return {
    userId, strength: 1000, matchesPlayed: 2, matchmakingBaseline: 2, restTurns: 2,
    availableSince: before, wins: 0, losses: 0, ladderScore: 0, pointDiff: 0, gender: "MALE", ...overrides,
  };
}

function roster() {
  return Array.from({ length: 12 }, (_, i) => player(`p${i}`, {
    gender: i < 6 ? "MALE" : "FEMALE",
    strength: [900, 1020, 1030, 1050, 700, 1250, 750, 990, 1020, 1020, 800, 1230][i],
    isBusy: [0, 1, 6, 7].includes(i),
  }));
}

describe("Level Match refill research forecast", () => {
  it("releases only the finishing players and preserves credits, waiting arrival and pause state", () => {
    const source = [
      player("finishing", { isBusy: true, matchmakingBaseline: 5 }),
      player("paused", { isBusy: true, isPaused: true }),
      player("anotherCourt", { isBusy: true }),
      player("starting", { arrivalPriorityAt: before }),
      player("waiting", { arrivalPriorityAt: before }),
      player("justArrived", { availableSince: after, restTurns: 0 }),
    ];
    const projected = projectLevelRefillPlayers(source, ["starting"], ["finishing", "paused"], after);
    expect(projected[0]).toMatchObject({ isBusy: false, matchesPlayed: 3, matchmakingBaseline: 6, restTurns: 0, availableSince: after });
    expect(projected[1]).toMatchObject({ isPaused: true, isBusy: false });
    expect(projected[2]).toBe(source[2]);
    expect(projected[3]).toMatchObject({ isBusy: true, arrivalPriorityAt: null, matchesPlayed: 2 });
    expect(projected[4]).toMatchObject({ arrivalPriorityAt: before, restTurns: 3 });
    expect(projected[4].isBusy).toBeFalsy();
    expect(projected[5].restTurns).toBe(0);
    expect(source[0]).toMatchObject({ isBusy: true, matchesPlayed: 2, matchmakingBaseline: 5 });

    const first = projectLevelRefillPlayers(source, ["starting"], ["starting"], after);
    expect(first[3]).toMatchObject({ isBusy: false, matchesPlayed: 3, arrivalPriorityAt: null, restTurns: 0 });
    expect(first[0]).toBe(source[0]);
  });

  it("requires a quality improvement without sacrificing an alternate finish order or a same-side option", () => {
    const baseline = [{ severe: true, safeSameSideMask: 0 }, { severe: false, safeSameSideMask: 3 }];
    expect(compareRefillForecast(baseline, [
      { severe: false, safeSameSideMask: 1 }, { severe: false, safeSameSideMask: 3 },
    ])).toBe("improved");
    expect(compareRefillForecast(baseline, [
      { severe: false, safeSameSideMask: 1 }, { severe: true, safeSameSideMask: 0 },
    ])).toBe("newSevere");
    expect(compareRefillForecast(baseline, [
      { severe: false, safeSameSideMask: 1 }, { severe: false, safeSameSideMask: 1 },
    ])).toBe("lostSameSide");
    expect(compareRefillForecast(baseline, baseline)).toBe("noImprovement");
  });

  it("agrees with the refined selector's certified severe classification for both finish orders", () => {
    const players = roster();
    const original = findBestLevelBatchSelection(players, options);
    const selected = original.selection!.selections[0];
    const probe = buildRefillForecastProbe(players, options, selected, () => {});
    const history = [{ ...selected.partition, levelMatchType: selected.levelDiagnostics?.levelMatchType }];
    for (const finishing of [["p0", "p1", "p6", "p7"], selected.ids]) {
      const projected = projectLevelRefillPlayers(players, selected.ids, finishing, after);
      const next = findBestLevelBatchSelection(projected, { ...options, history });
      const bestCompatibility = next.selection!.selections[0].levelDiagnostics!.bestCompatibility!;
      expect(probe(projected)?.severe).toBe(bestCompatibility > 2.5);
    }
    const due = new Set(["p4", "p5", "p10", "p11"]);
    const stranded = players.map((p) => ({ ...p, isBusy: false,
      matchesPlayed: due.has(p.userId) ? 0 : 2, matchmakingBaseline: due.has(p.userId) ? 0 : 2 }));
    expect(probe(stranded)?.severe).toBe(true);
    expect(findBestLevelBatchSelection(stranded, { ...options, history }).debug.levelDiagnostics?.bestCompatibility)
      .toBeGreaterThan(2.5);
  });

  it("switches to a fair same-type quartet when it prevents a severe next refill", () => {
    const data = [
      [1174, 2, 3], [730, 2, 2], [894, 2, 2], [736, 3, 2], [774, 2, 2], [802, 4, 2], [1241, 2, 2], [780, 3, 1],
      [917, 4, 2], [966, 4, 0], [1027, 4, 3], [926, 2, 1], [910, 2, 1], [1314, 4, 1], [1168, 3, 2], [990, 2, 1],
    ];
    const players = data.map(([strength, matchesPlayed, restTurns], i) => player(`p${i}`, {
      strength, matchesPlayed, matchmakingBaseline: matchesPlayed, restTurns,
      gender: i < 8 ? "MALE" : "FEMALE", isBusy: [0, 1, 8, 9].includes(i),
    }));
    const original = findBestLevelBatchSelection(players, options);
    const decision = forecastSingleLevelRefill({
      players, options, original, liveCourts: [["p0", "p1", "p8", "p9"]],
      completionTime: after, randomForCandidate: () => () => 0, now: () => 0,
    });
    expect(decision).toMatchObject({ outcome: "switched", severePreventions: 1 });
    const incumbent = original.selection!.selections[0];
    const chosen = decision.result.selection!.selections[0];
    expect(incumbent.ids).toEqual(["p11", "p15", "p2", "p4"]);
    expect(chosen.ids).toEqual(["p12", "p15", "p2", "p4"]);
    expect(chosen.levelDiagnostics?.matchType).toBe(incumbent.levelDiagnostics?.matchType);
    expect(chosen.levelContext?.strongerPriorityVector).toEqual(incumbent.levelContext?.strongerPriorityVector);
  });

  it("keeps the exact original result on timeout and for Session Points", () => {
    const players = roster();
    const original = findBestLevelBatchSelection(players, options);
    const input = {
      players, original, options, liveCourts: [["p0", "p1", "p6", "p7"]],
      completionTime: after, randomForCandidate: () => () => 0,
    };
    let reads = 0;
    const timeout = forecastSingleLevelRefill({ ...input, now: () => reads++ ? 41 : 0 });
    expect(timeout.outcome).toBe("budget");
    expect(timeout.result).toBe(original);
    const points = forecastSingleLevelRefill({
      ...input, options: { ...options, levelPolicy: { metric: SessionBalanceMetric.SESSION_POINTS } },
    });
    expect(points.outcome).toBe("ineligible");
    expect(points.result).toBe(original);
  });
});
