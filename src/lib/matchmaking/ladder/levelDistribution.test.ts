import { describe, expect, it } from "vitest";
import { SessionMode } from "@/types/enums";
import { buildSocialSessionHistory } from "../socialSessionHistory";
import type { V3DoublesPartition } from "../v3/types";
import { buildLevelDistributionContext, buildLevelDistributionTargets, type LevelDistributionPlayer } from "./levelDistribution";

function roster(upper: number, lower: number) {
  return Array.from({ length: upper + lower }, (_, index): LevelDistributionPlayer => ({
    userId: index < upper ? `u${index}` : `l${index - upper}`,
    gender: index < upper ? "MALE" : "FEMALE",
  }));
}

const mixed: V3DoublesPartition = { team1: ["u0", "l0"], team2: ["u1", "l1"] };
const upper: V3DoublesPartition = { team1: ["u0", "u1"], team2: ["u2", "u3"] };
const otherUpper: V3DoublesPartition = { team1: ["u4", "u5"], team2: ["u6", "u7"] };
const lower: V3DoublesPartition = { team1: ["l0", "l1"], team2: ["l2", "l3"] };

describe("Level Match distribution ledger", () => {
  it("projects unavailable types and reports when proportional slots are impossible", () => {
    const asymmetric = buildLevelDistributionTargets(roster(10, 2), false)(mixed)!;
    expect(asymmetric.target.LOWER).toBe(0);
    expect(asymmetric.target.MIXED).toBeCloseTo(1 / 3);
    expect(asymmetric.mixedTargetByPlayer).toMatchObject({ l0: 1, l1: 1 });
    expect(asymmetric.mixedTargetByPlayer.u0).toBeCloseTo(0.2);
    expect(buildLevelDistributionTargets(roster(13, 1), false)(upper)).toMatchObject({
      feasibility: "no-proportional-target", target: { UPPER: 1, LOWER: 0, MIXED: 0 },
    });
    expect(buildLevelDistributionTargets(roster(3, 3), false)(mixed)?.target.MIXED).toBe(1);
    const grouped = roster(7, 7).map((player) => ({ ...player, pool: player.gender === "MALE" ? "A" : "B" }));
    expect(buildLevelDistributionTargets(grouped, true)(mixed)).toMatchObject({
      scope: "pool-a-seats:2", target: { UPPER: 0, MIXED: 1, LOWER: 0 },
    });
  });

  it("counts committed rows once, keeps historical expectations, and reverses cancelled assignments", () => {
    const snapshot = buildLevelDistributionTargets(roster(7, 7), false)(mixed)!;
    const row = {
      id: "queue", team1User1Id: "u0", team1User2Id: "l0", team2User1Id: "u1", team2User2Id: "l1",
      matchmakingReasonJson: JSON.stringify({ levelMatchType: snapshot }),
    };
    const build = (status: string, queue = true) => buildLevelDistributionContext(roster(10, 2), buildSocialSessionHistory({
      matches: [{ ...row, id: "match", status }], queuedMatch: queue ? row : null,
    }), SessionMode.MIXICANO, false);
    const current = build("IN_PROGRESS").diagnostics([]);
    expect(current.count).toBe(1);
    expect(current.actual).toEqual([0, 1, 0]);
    expect(current.expected[2]).toBeCloseTo(1 / 3);
    expect(build("CANCELLED", false).diagnostics([]).count).toBe(0);
  });

  it("scores complete batches and uses an optimistic bound for their remaining courts", () => {
    const players = roster(8, 8);
    const target = buildLevelDistributionTargets(players, false);
    const ledger = buildLevelDistributionContext(players, [{ ...mixed, levelMatchType: target(mixed) }], SessionMode.MIXICANO, false);
    const left = ledger.impact(target(upper));
    const right = ledger.impact(target(lower));
    const repeat = ledger.impact(target(otherUpper));
    expect(ledger.band([left, right])).toBeLessThan(ledger.band([left, repeat]));
    const min = right.map((amount, index) => Math.min(amount, repeat[index])) as typeof right;
    const max = right.map((amount, index) => Math.max(amount, repeat[index])) as typeof right;
    expect(ledger.band([left], [{ min, max }])).toBeLessThanOrEqual(ledger.band([left, right]));
  });
});
