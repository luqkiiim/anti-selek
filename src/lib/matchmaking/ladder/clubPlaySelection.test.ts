import { describe, expect, it } from "vitest";
import { MixedSide, PlayerGender, SessionMode } from "@/types/enums";
import { getExactPartitionKey } from "../v3/rematch";
import { buildClubPlayCompatibilityScorer } from "./clubPlayCompatibility";
import { buildClubPlayDistributionTargets, parseClubPlayDistributionSnapshot } from "./clubPlayDistribution";
import { findBestClubPlayBatchSelection } from "./clubPlaySelection";
import type { LadderDoublesPartition, MatchmakerLadderPlayer } from "./types";

function player(id: string, strength: number, overrides: Partial<MatchmakerLadderPlayer> = {}): MatchmakerLadderPlayer {
  return {
    userId: id, strength, gender: PlayerGender.MALE, matchesPlayed: 0, matchmakingBaseline: 0,
    availableSince: new Date(0), wins: 0, losses: 0, pointDiff: 0, ladderScore: 0,
    ...overrides,
  };
}

function roster(ratings: number[]) {
  return ratings.map((rating, index) => player(`p${index}`, rating));
}

describe("Club Play selection", () => {
  it("fills three courts with local quartets when the entire fair cohort must play", () => {
    const players = roster([500, 510, 520, 530, 850, 860, 870, 880, 1270, 1280, 1290, 1300])
      .map((entrant, index) => ({ ...entrant, pool: index % 2 ? "A" : "B" }));
    const result = findBestClubPlayBatchSelection(players, { courtCount: 3 });
    expect(result.debug.baselineCertified).toBe(true);
    expect(result.selection?.selections.map((selection) =>
      selection.players.map(({ strength }) => strength).sort((a, b) => a - b)
    ).sort((left, right) => left[0] - right[0])).toEqual([[500, 510, 520, 530], [850, 860, 870, 880], [1270, 1280, 1290, 1300]]);
    expect(result.selection?.maxBalanceGap).toBe(0);
  });

  it("rotates repeated courtmates when a nearby balanced batch is available", () => {
    const players = roster([950, 960, 970, 980, 1000, 1010, 1020, 1030]);
    const options = { courtCount: 2, sessionMode: SessionMode.MEXICANO };
    const opening = findBestClubPlayBatchSelection(players, options).selection!;
    const firstGroups = opening.selections.map(({ ids }) => [...ids].sort().join());
    expect(firstGroups.sort()).toEqual(["p0,p1,p2,p3", "p4,p5,p6,p7"]);

    const history = [
      { team1: ["p0", "p3"], team2: ["p1", "p2"] },
      { team1: ["p4", "p7"], team2: ["p5", "p6"] },
      { team1: ["p0", "p2"], team2: ["p1", "p3"] },
      { team1: ["p4", "p6"], team2: ["p5", "p7"] },
    ] satisfies LadderDoublesPartition[];
    const rotated = findBestClubPlayBatchSelection(players, { ...options, history }).selection!;
    expect(rotated.selections.every(({ ids }) => !firstGroups.includes([...ids].sort().join()))).toBe(true);
    expect(rotated.maxBalanceGap).toBeLessThanOrEqual(30);
  });

  it("keeps an unavoidable 310-point court eligible and balances its teams", () => {
    const result = findBestClubPlayBatchSelection(roster([990, 1100, 1190, 1300]), { courtCount: 1 });
    expect(result.selection?.selections[0].clubPlayDiagnostics).toMatchObject({
      levelSpread: 310, balanceGap: 0, baselineCertified: true, fallback: "none",
    });
  });

  it("preserves hard fairness and busy eligibility even when a tighter court exists", () => {
    const players = roster([500, 510, 520, 530, 540, 550, 1250, 1260]);
    for (const player of players.slice(0, 6)) player.matchesPlayed = 1;
    players[7].isBusy = true;
    const selection = findBestClubPlayBatchSelection(players, { courtCount: 1 }).selection?.selections[0];
    expect(selection?.ids).toContain("p6");
    expect(selection?.ids).not.toContain("p7");
    expect(selection?.clubPlayDiagnostics?.ceilingFeasible).toBe(false);
    expect(selection?.clubPlayDiagnostics?.balanceGap).toBe(selection?.clubPlayDiagnostics?.bestBalanceGap);
  });

  it("gives two players a balanced play-up game above 400 Elo after two ordinary starts", () => {
    const players = roster([858, 897, 930, 969, 1237, 1301, 1000, 1100]);
    players[6].isBusy = true;
    players[7].isBusy = true;
    const lowerCourt: LadderDoublesPartition = { team1: ["p0", "p3"], team2: ["p1", "p2"] };
    const higherCourt: LadderDoublesPartition = { team1: ["p4", "p7"], team2: ["p5", "p6"] };
    const history = [lowerCourt, higherCourt, lowerCourt, higherCourt];
    const options = { courtCount: 1, lockedPlayerIds: new Set(["p0", "p1"]) };
    const opening = findBestClubPlayBatchSelection(players, options).selection?.selections[0];
    expect(opening?.clubPlayDiagnostics).toMatchObject({ levelSpread: 111, clubPlayBoosted: false });

    const next = findBestClubPlayBatchSelection(players, { ...options, history }).selection?.selections[0];
    expect(next?.clubPlayDiagnostics).toMatchObject({
      levelSpread: 443, balanceGap: 12.5, clubPlayBoosted: true, clubPlayPlayedUp: ["p0", "p1"],
    });

    const coolingOff = findBestClubPlayBatchSelection(players, {
      ...options, history: [...history, { ...higherCourt, clubPlayBoosted: true }],
    }).selection?.selections[0];
    expect(coolingOff?.clubPlayDiagnostics).toMatchObject({ levelSpread: 111, clubPlayBoosted: false });

    const strongerPlayersStillCooling = findBestClubPlayBatchSelection(players, {
      ...options, history: [...history, { ...higherCourt, clubPlayBoosted: true }, lowerCourt, lowerCourt, lowerCourt],
    }).selection?.selections[0];
    expect(strongerPlayersStillCooling?.clubPlayDiagnostics).toMatchObject({ levelSpread: 111, clubPlayBoosted: false });
  });

  it("keeps a close option ahead of an extreme court even with two play-up opportunities", () => {
    const players = roster([500, 520, 540, 560, 1190, 1210, 850, 950]);
    players[6].isBusy = true;
    players[7].isBusy = true;
    const close: LadderDoublesPartition = { team1: ["p0", "p3"], team2: ["p1", "p2"] };
    const higher: LadderDoublesPartition = { team1: ["p4", "p7"], team2: ["p5", "p6"] };
    const result = findBestClubPlayBatchSelection(players, {
      courtCount: 1, lockedPlayerIds: new Set(["p0", "p1"]),
      history: [close, higher, close, higher],
    }).selection?.selections[0];
    expect(result?.clubPlayDiagnostics).toMatchObject({ levelSpread: 60, balanceGap: 0, clubPlayBoosted: false });
  });

  it("finds a close same-side court when most ratings are tied", () => {
    const players = [
      ...roster([500, 1000, 1020, 1020, 1040, 1040, 1060]),
      ...[1000, 1000, 1020, 1020, 1040, 1040, 1550].map((rating, index) =>
        player(`f${index}`, rating, { gender: PlayerGender.FEMALE })),
    ];
    const result = findBestClubPlayBatchSelection(players, { courtCount: 2 });
    expect(result.debug.baselineCertified).toBe(true);
    const ownSide = result.selection?.selections.filter((court) => court.clubPlayDiagnostics?.matchType !== "MIXED") ?? [];
    expect(ownSide.length).toBeGreaterThan(0);
    expect(ownSide.every((court) => court.groupingSummary.maxLadderGap <= 40)).toBe(true);
  });

  it("keeps separated tied cohorts together even when doubles mix favors a wider court", () => {
    const ratings = [500, 500, 900, 900, 1300, 1300];
    const players = [...roster(ratings), ...ratings.map((rating, index) =>
      player(`f${index}`, rating, { gender: PlayerGender.FEMALE }))];
    const result = findBestClubPlayBatchSelection(players, { courtCount: 2 });
    expect(result.selection?.selections.map((court) => court.clubPlayDiagnostics?.matchType)).toEqual(["MIXED", "MIXED"]);
  });

  it("aligns mixed cohorts by relative strength and still uses raw team balance", () => {
    const players = [
      player("u1", 1300), player("u2", 1250), player("u3", 1100), player("u4", 1050),
      player("l1", 950, { gender: PlayerGender.FEMALE }), player("l2", 900, { gender: PlayerGender.FEMALE }),
      player("l3", 750, { gender: PlayerGender.FEMALE }), player("l4", 700, { gender: PlayerGender.FEMALE }),
    ];
    const scorer = buildClubPlayCompatibilityScorer(players);
    const topFour = [players[0], players[1], players[4], players[5]];
    const mismatchedRanks = [players[0], players[1], players[6], players[7]];
    expect(scorer.score(topFour).worst).toBeLessThan(scorer.score(mismatchedRanks).worst);
    const selection = findBestClubPlayBatchSelection(players, {
      courtCount: 1, lockedPlayerIds: new Set(topFour.map(({ userId }) => userId)),
    }).selection?.selections[0];
    expect(selection?.clubPlayDiagnostics).toMatchObject({ matchType: "MIXED", relativeGap: 0, balanceGap: 0 });
    expect(selection && getExactPartitionKey(selection.partition)).toBe("l1|u2||l2|u1");
  });

  it("allows open play without assigning a conventional match type or type target", () => {
    const players = roster([1000, 1000, 1000, 1000]);
    players[3].gender = PlayerGender.UNSPECIFIED;
    expect(findBestClubPlayBatchSelection(players, { courtCount: 1 }).selection).toBeNull();
    const result = findBestClubPlayBatchSelection(players, { courtCount: 1, sessionMode: SessionMode.MEXICANO });
    expect(result.selection?.selections[0].clubPlayDiagnostics).toMatchObject({ matchType: null });
    expect(result.selection?.selections[0].clubPlayDiagnostics?.clubPlayMatchType).toBeUndefined();
  });

  it("stores effective-side exposure for a mixed-side override", () => {
    const players = [
      player("p1", 1, { gender: PlayerGender.FEMALE, mixedSideOverride: MixedSide.UPPER }),
      player("p2", 1), player("p3", 1), player("p4", 1),
      player("p5", 1, { gender: PlayerGender.FEMALE }), player("p6", 1, { gender: PlayerGender.FEMALE }),
      player("p7", 1, { gender: PlayerGender.FEMALE }), player("p8", 1, { gender: PlayerGender.FEMALE }),
    ];
    const partition: LadderDoublesPartition = { team1: ["p1", "p2"], team2: ["p3", "p4"] };
    const snapshot = buildClubPlayDistributionTargets(players)(partition);
    expect(snapshot).toMatchObject({ category: "UPPER", scope: "session" });
    expect(snapshot?.target.UPPER).toBeCloseTo(1 / 3);
    expect(snapshot?.mixedTargetByPlayer.p1).toBeCloseTo(1 / 3);
    expect(parseClubPlayDistributionSnapshot(snapshot, partition)).toEqual(snapshot);
    expect(parseClubPlayDistributionSnapshot(snapshot, { team1: ["p1", "p3"], team2: ["p2", "p4"] })).toBeNull();
  });

  it("balances accumulated mixed exposure on tied ratings", () => {
    const players = roster([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000])
      .map((entrant, index) => ({ ...entrant, gender: index < 4 ? PlayerGender.MALE : PlayerGender.FEMALE }));
    const mixedOne: LadderDoublesPartition = { team1: ["p0", "p4"], team2: ["p1", "p5"] };
    const mixedTwo: LadderDoublesPartition = { team1: ["p2", "p6"], team2: ["p3", "p7"] };
    const targetFor = buildClubPlayDistributionTargets(players);
    const history = [mixedOne, mixedTwo].map((partition) => ({
      ...partition,
      clubPlayMatchType: targetFor(partition),
    }));
    const result = findBestClubPlayBatchSelection(players, { courtCount: 2, history });
    expect(result.selection?.selections.map((selection) => selection.clubPlayDiagnostics?.matchType)).toEqual(["UPPER", "LOWER"]);
  });

  it("caps minority individual exposure only when an own-side court exists", () => {
    const makeSide = (prefix: string, gender: PlayerGender, count: number) =>
      Array.from({ length: count }, (_, index) => player(`${prefix}${index}`, 1000, { gender }));
    const majority = makeSide("u", PlayerGender.MALE, 12);
    const minority = makeSide("l", PlayerGender.FEMALE, 4);
    const partition: LadderDoublesPartition = { team1: ["u0", "l0"], team2: ["u1", "l1"] };
    const targets = buildClubPlayDistributionTargets([...majority, ...minority])(partition);
    expect(targets?.target).toEqual({ UPPER: 0.625, MIXED: 0.25, LOWER: 0.125 });
    expect(targets?.mixedTargetByPlayer.l0).toBe(0.5);
    const constrained = buildClubPlayDistributionTargets([...majority.slice(0, 10), ...minority.slice(0, 2)])(partition);
    expect(constrained?.target.LOWER).toBe(0);
    expect(constrained?.mixedTargetByPlayer.l0).toBe(1);
  });

  it("keeps a queued lineup only within the current decision's fairness and balance envelope", () => {
    const players = roster([1000, 1000, 1000, 1000, 1000]);
    players[4].matchesPlayed = 1;
    const initial = findBestClubPlayBatchSelection(players, { courtCount: 1 }).selection?.selections[0];
    expect(initial?.clubPlayContext).toBeDefined();
    const admissible = findBestClubPlayBatchSelection(players, {
      courtCount: 1, selectionContext: initial?.clubPlayContext,
      requiredPartitionKey: getExactPartitionKey(initial!.partition),
    });
    expect(admissible.selection?.selections[0].partition).toEqual(initial?.partition);
    const stale = findBestClubPlayBatchSelection(players, {
      courtCount: 1, selectionContext: initial?.clubPlayContext, requiredPartitionKey: "p0|p4||p1|p2",
    });
    expect(stale.selection).toBeNull();
  });

  it("uses a certified balance fallback only when the search interrupts after certification", () => {
    const players = roster([1000, 1000, 1000, 1000]);
    const early = findBestClubPlayBatchSelection(players, { courtCount: 1, searchLimits: { maxBranches: 0 } });
    expect(early.selection).toBeNull();
    expect(early.debug).toMatchObject({ searchLimitReached: true, baselineCertified: false });
    const late = findBestClubPlayBatchSelection(players, { courtCount: 1, searchLimits: { maxBranches: 2 } });
    expect(late.selection?.selections[0].clubPlayDiagnostics).toMatchObject({
      searchLimitReached: true, baselineCertified: true, fallback: "balance-baseline",
    });
  });
});
