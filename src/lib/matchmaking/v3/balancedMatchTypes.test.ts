import { describe, expect, it } from "vitest";
import {
  buildBalancedMatchTypeContext,
  getBalancedMatchTypeTarget,
  parseBalancedMatchTypeSnapshot,
} from "./balancedMatchTypes";
import { getPlayerGroupSelectionConstraints } from "../playerGroupPlanner";
import { CourtGroupType } from "../../../types/enums";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
} from "./types";

function roster(
  upper: number,
  lower: number,
  pool = "A",
): MatchmakerV3Player[] {
  return Array.from({ length: upper + lower }, (_, index) => ({
    userId: `${pool}${index}`,
    pool,
    gender: index < upper ? "MALE" : "FEMALE",
    partnerPreference: index < upper ? "OPEN" : "FEMALE_FLEX",
    strength: 1000,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date(0),
    restTurns: 2,
  }));
}
const partition = (...ids: string[]): V3DoublesPartition => ({
  team1: [ids[0], ids[1]],
  team2: [ids[2], ids[3]],
});

describe("Balanced roster-adaptive distribution", () => {
  it("checks fair opportunities within each represented club", () => {
    const rules = {
      normalizePartition({
        partition,
        playersById,
      }: {
        partition: V3DoublesPartition;
        playersById: Map<string, MatchmakerV3Player>;
      }) {
        const first = playersById.get(partition.team1[0])?.representingClubId;
        const second = playersById.get(partition.team2[0])?.representingClubId;
        return first &&
          second &&
          first !== second &&
          first === playersById.get(partition.team1[1])?.representingClubId &&
          second === playersById.get(partition.team2[1])?.representingClubId
          ? partition
          : null;
      },
    };
    const rosterForClubs = (
      upperA: number,
      lowerA: number,
      upperB: number,
      lowerB: number,
    ) => [
      ...roster(upperA, lowerA, "A").map((player) => ({
        ...player,
        representingClubId: "clubA",
      })),
      ...roster(upperB, lowerB, "B").map((player) => ({
        ...player,
        representingClubId: "clubB",
      })),
    ];
    const impossible = buildBalancedMatchTypeContext(
      rosterForClubs(9, 1, 1, 9),
      [],
      { clubs: true, constraints: [rules] },
    );
    expect(impossible.diagnostics[0].reason).toBe(
      "NO_FAIR_STRUCTURAL_DISTRIBUTION",
    );
    const feasible = buildBalancedMatchTypeContext(
      rosterForClubs(3, 3, 3, 3),
      [],
      { clubs: true, constraints: [rules] },
    );
    expect(feasible.diagnostics[0].reason).toBeNull();
    expect(feasible.diagnostics[0].target.MIXED).toBeCloseTo(1 / 3);
    expect(
      feasible.snapshot(partition("A0", "A3", "B0", "B3"))?.mixedTargetByPlayer
        .A0,
    ).toBeCloseTo(1 / 3);
  });
  it("projects structurally impossible categories onto equal opportunities", () => {
    expect(getBalancedMatchTypeTarget(11, 3)?.UPPER).toBeCloseTo(4 / 7);
    expect(getBalancedMatchTypeTarget(11, 3)?.MIXED).toBeCloseTo(3 / 7);
    expect(getBalancedMatchTypeTarget(11, 3)?.LOWER).toBe(0);
    expect(getBalancedMatchTypeTarget(13, 1)).toBeNull();
    expect(getBalancedMatchTypeTarget(0, 0)).toBeNull();
    expect(getBalancedMatchTypeTarget(5, 0)).toEqual({
      UPPER: 1,
      MIXED: 0,
      LOWER: 0,
    });
    expect(getBalancedMatchTypeTarget(3, 2)).toBeNull();
    expect(getBalancedMatchTypeTarget(3, 3)).toEqual({
      UPPER: 0,
      MIXED: 1,
      LOWER: 0,
    });
  });
  it("honours effective side overrides and includes busy players structurally", () => {
    const players = roster(6, 2);
    players[0].mixedSideOverride = "LOWER";
    players[1].mixedSideOverride = "LOWER";
    players[2].isBusy = true;
    const context = buildBalancedMatchTypeContext(players, []);
    expect(context.diagnostics[0].target.MIXED).toBeCloseTo(1 / 3);
    expect(context.snapshot(partition("A0", "A1", "A6", "A7"))?.category).toBe(
      "LOWER",
    );
  });
  it("round-trips saturated minority expectations without floating-point overflow", () => {
    const players = roster(12, 2),
      match = partition("A0", "A12", "A1", "A13");
    const snapshot = buildBalancedMatchTypeContext(players, []).snapshot(
      match,
    )!;
    expect(snapshot.mixedTargetByPlayer.A12).toBe(1);
    expect(
      parseBalancedMatchTypeSnapshot({ balancedMatchType: snapshot }, match),
    ).toEqual(snapshot);
  });
  it("keeps crossover targets feasible under per-pool participation", () => {
    const players = [...roster(2, 2, "A"), ...roster(4, 0, "B")];
    const constraints = getPlayerGroupSelectionConstraints({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });
    const context = buildBalancedMatchTypeContext(players, [], {
      groups: true,
      constraints: [constraints],
    });
    const target = context.diagnostics.find(
      (entry) => entry.group === "cross:2",
    )!;
    expect(target.reason).toBeNull();
    expect(target.target).toEqual({ UPPER: 0.5, MIXED: 0.5, LOWER: 0 });
    expect(
      context.snapshot(partition("A2", "B0", "A3", "B1"))?.mixedTargetByPlayer
        .A2,
    ).toBeCloseTo(1);
    expect(
      buildBalancedMatchTypeContext([...players].reverse(), [], {
        groups: true,
        constraints: [constraints],
      }).snapshot(partition("A2", "B0", "A3", "B1")),
    ).toEqual(context.snapshot(partition("A2", "B0", "A3", "B1")));
  });
  it("reports a group whose own court has no legal fair category", () => {
    const players = [...roster(3, 1, "A"), ...roster(4, 4, "B")];
    const constraints = getPlayerGroupSelectionConstraints({
      courtGroupType: CourtGroupType.COMPETITIVE,
      poolASeatCount: 4,
      poolBSeatCount: 0,
    });
    const context = buildBalancedMatchTypeContext(players, [], {
      groups: true,
      constraints: [constraints],
    });
    expect(context.diagnostics).toContainEqual({
      group: "pool:A",
      target: { UPPER: 0, MIXED: 0, LOWER: 0 },
      reason: "NO_FAIR_STRUCTURAL_DISTRIBUTION",
    });
  });
  it("counts target snapshots once and reverses cancelled reservations by removing their rows", () => {
    const players = roster(7, 7),
      mixed = partition("A0", "A7", "A1", "A8"),
      upper = partition("A0", "A1", "A2", "A3");
    const initial = buildBalancedMatchTypeContext(players, []);
    const snapshot = initial.snapshot(mixed)!;
    expect(
      parseBalancedMatchTypeSnapshot({ balancedMatchType: snapshot }, mixed),
    ).toEqual(snapshot);
    const row: SocialHistoryMatch = {
      id: "queue",
      ...mixed,
      balancedMatchType: snapshot,
    };
    const committed = buildBalancedMatchTypeContext(players, [row, row]);
    expect(committed.score([upper])[0]).toBeLessThan(
      committed.score([mixed])[0],
    );
    expect(
      buildBalancedMatchTypeContext(players, [row]).score([upper]),
    ).toEqual(committed.score([upper]));
    expect(buildBalancedMatchTypeContext(players, []).score([mixed])).toEqual(
      initial.score([mixed]),
    );
  });
  it("freezes old targets across a level change and rejects malformed target records", () => {
    const players = roster(7, 7),
      match = partition("A0", "A7", "A1", "A8");
    const before = buildBalancedMatchTypeContext(players, []).snapshot(match)!;
    players[2].mixedSideOverride = "LOWER";
    const after = buildBalancedMatchTypeContext(players, [
      { id: "old", ...match, balancedMatchType: before },
    ]);
    expect(after.snapshot(match)?.target).not.toEqual(before.target);
    expect(
      parseBalancedMatchTypeSnapshot(
        { ...before, target: { UPPER: 1, MIXED: 1, LOWER: 0 } },
        match,
      ),
    ).toBeNull();
  });
});
