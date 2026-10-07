import { describe, expect, it } from "vitest";
import {
  auditSocialGeneralizationDecision,
  buildSocialGeneralizationOpportunityCatalog,
  scoreSocialGeneralizationPrefix,
} from "./socialGeneralizationAudit";
import {
  getSocialGeneralizationScenario,
  getSocialGeneralizationStructuralRoster,
} from "./socialGeneralizationScenarios";
import type { SocialGeneralizationStructuralPlayer } from "./socialGeneralizationScenarios";
import type { ActiveMatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";

function activePlayers(roster: readonly SocialGeneralizationStructuralPlayer[], options?: {
  readonly restTurns?: ReadonlyMap<string, number>;
  readonly effectiveMatchCount?: ReadonlyMap<string, number>;
}): ActiveMatchmakerV3Player[] {
  return roster.map((player, index) => {
    const gender = player.side === "UPPER" ? "MALE" : "FEMALE";
    const matchesPlayed = options?.effectiveMatchCount?.get(player.userId) ?? 0;
    return {
      userId: player.userId,
      matchesPlayed,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-01-01T00:00:00.000Z"),
      strength: 1000 + index,
      gender,
      isPaused: player.isPaused,
      isBusy: false,
      effectiveMatchCount: matchesPlayed,
      restTurns: options?.restTurns?.get(player.userId) ?? 0,
      randomScore: 0,
      rank: index,
      arrivalPriorityAt: null,
    };
  });
}

function mixedCourt(ids: readonly [string, string, string, string]): V3DoublesPartition {
  return { team1: [ids[0], ids[2]], team2: [ids[1], ids[3]] };
}

function ownCourt(ids: readonly [string, string, string, string]): V3DoublesPartition {
  return { team1: [ids[0], ids[1]], team2: [ids[2], ids[3]] };
}

function match(partition: V3DoublesPartition, courtType: "MIXED" | "UPPER" | "LOWER" | null): SocialHistoryMatch {
  const ids = [...partition.team1, ...partition.team2];
  return {
    ...partition,
    socialVariety: {
      version: 1,
      basis: "EFFECTIVE_MIXED_SIDE",
      courtType,
      effectiveSideByUserId: Object.fromEntries(ids.map((id) => [id,
        id.startsWith("U") ? "UPPER" : id.startsWith("L") ? "LOWER"
          : Number(id.slice(1)) <= 7 ? "UPPER" : "LOWER",
      ])),
    },
  };
}

describe("independent Social generalization audit", () => {
  it("derives structural type denominators from unequal ratios and roster changes", () => {
    const elevenThree = getSocialGeneralizationScenario("edge-14-11-3-2c");
    const catalog = buildSocialGeneralizationOpportunityCatalog(
      getSocialGeneralizationStructuralRoster(elevenThree, 0),
    );
    expect(catalog.players.filter((player) => player.side === "UPPER" && player.feasibleMatchTypes.length === 2)).toHaveLength(11);
    expect(catalog.players.filter((player) => player.side === "LOWER" && player.feasibleMatchTypes.length === 1)).toHaveLength(3);
    expect(catalog.players.filter((player) => player.side === "LOWER").every((player) =>
      player.feasibleMatchTypes[0] === "MIXED",
    )).toBe(true);
    expect(catalog.rollingTypeDenominator).toBe("2");

    const ownOnly = buildSocialGeneralizationOpportunityCatalog(
      getSocialGeneralizationStructuralRoster(getSocialGeneralizationScenario("edge-8-8-0-2c"), 0),
    );
    expect(ownOnly.players.every((player) => player.feasibleMatchTypes.join() === "OWN_SIDE")).toBe(true);
    expect(ownOnly.rollingTypeDenominator).toBe("1");

    const mixedOnly = buildSocialGeneralizationOpportunityCatalog(
      getSocialGeneralizationStructuralRoster(getSocialGeneralizationScenario("edge-6-3-3-1c"), 0),
    );
    expect(mixedOnly.players.every((player) => player.feasibleMatchTypes.join() === "MIXED")).toBe(true);
    expect(mixedOnly.rollingTypeDenominator).toBe("1");

    const changing = getSocialGeneralizationScenario("dynamic-feasibility-10-3-to-10-4-after-8");
    const before = buildSocialGeneralizationOpportunityCatalog(getSocialGeneralizationStructuralRoster(changing, 7));
    const after = buildSocialGeneralizationOpportunityCatalog(getSocialGeneralizationStructuralRoster(changing, 8));
    expect(before.players.find((player) => player.userId === "P11")?.feasibleMatchTypes).toEqual(["MIXED"]);
    expect(after.players.find((player) => player.userId === "P11")?.feasibleMatchTypes).toEqual(["MIXED", "OWN_SIDE"]);
    expect(after.players.find((player) => player.userId === "P14")?.feasibleMatchTypes).toEqual(["MIXED", "OWN_SIDE"]);
  });

  it("scores structural coverage against variable peer sets and keeps paused vocabulary", () => {
    const scenario = getSocialGeneralizationScenario("edge-8-8-0-2c");
    const roster = getSocialGeneralizationStructuralRoster(scenario, 0);
    const firstFour = roster.slice(0, 4).map((player) => player.userId) as [string, string, string, string];
    const history = [match(ownCourt(firstFour), "UPPER")];
    const score = scoreSocialGeneralizationPrefix({
      structuralRoster: roster,
      opportunityRoster: roster.slice(0, 4),
      completedHistory: history,
    });

    expect(score.structural.courtmates.feasiblePairCount).toBe(28);
    expect(score.structural.courtmates.coveredPairCount).toBe(6);
    expect(score.structural.courtmates.averageDistinctPeers).toBe(1.5);
    expect(score.structural.meanT).toBe(0.5);
    expect(score.structural.oneTypePlayerCount).toBe(8);
    expect(score.opportunity?.playerCount).toBe(4);
    expect(score.opportunity?.courtmates.feasiblePairCount).toBe(6);
    expect(score.opportunity?.courtmates.coveredPairCount).toBe(6);

    const departure = getSocialGeneralizationScenario("dynamic-played-departure-as-pause-14-10-4-p14-after-8");
    const before = buildSocialGeneralizationOpportunityCatalog(getSocialGeneralizationStructuralRoster(departure, 7));
    const after = buildSocialGeneralizationOpportunityCatalog(getSocialGeneralizationStructuralRoster(departure, 8));
    expect(after.players).toEqual(before.players);
  });

  it("uses stable history snapshots and exact rolling-six expiry for signed T", () => {
    const scenario = getSocialGeneralizationScenario("fixed-14-7-7-2c");
    const roster = getSocialGeneralizationStructuralRoster(scenario, 0);
    const repeatedMixed: SocialHistoryMatch[] = [];
    for (let round = 0; round < 6; round += 1) {
      repeatedMixed.push(match(mixedCourt(["P1", "P2", "P8", "P9"]), "MIXED"));
      repeatedMixed.push(match(mixedCourt(["P3", "P4", "P10", "P11"]), "MIXED"));
    }
    const available = activePlayers(roster);
    const selected: { ids: string[]; partition: V3DoublesPartition }[] = [{
      ids: ["P1", "P2", "P3", "P4"],
      partition: ownCourt(["P1", "P2", "P3", "P4"]),
    }];
    const result = auditSocialGeneralizationDecision({
      structuralRoster: roster,
      availablePlayers: available,
      completedHistory: repeatedMixed,
      selected,
      courtCount: 1,
    });

    expect(result.complete).toBe(true);
    expect(result.rollingTypeDenominator).toBe("2");
    expect(result.selectedSignedRollingTypeGainUnits).toBe("4");
    expect(result.selectedSignedRollingTypeGain).toBe(2);
    expect(result.baselineBothTypePlayerCount).toBe(0);
    expect(result.selectedBothTypePlayerCount).toBe(4);
    expect(result.selectedTypeWindows).toHaveLength(4);
    expect(result.selectedTypeWindows?.every((player) => player.recentTypesBefore.length === 6 &&
      player.recentTypesAfter.at(-1) === "OWN_SIDE" && player.TBefore === 0.5 && player.TAfter === 1,
    )).toBe(true);
  });

  it("certifies a small exhaustive two-court G/T frontier and the Gmax witness", () => {
    const roster = getSocialGeneralizationStructuralRoster(
      getSocialGeneralizationScenario("balanced-10-5-5-2c"),
      0,
    );
    // Use an 8-player 4/4 prefix with two courts: all eight must appear.
    const upper = roster.filter((player) => player.side === "UPPER").slice(0, 4);
    const lower = roster.filter((player) => player.side === "LOWER").slice(0, 4);
    const exactRoster = [...upper, ...lower];
    const available = activePlayers(exactRoster);
    const selected = [
      { ids: ["P1", "P2", "P6", "P7"], partition: mixedCourt(["P1", "P2", "P6", "P7"]) },
      { ids: ["P3", "P4", "P8", "P9"], partition: mixedCourt(["P3", "P4", "P8", "P9"]) },
    ];
    const result = auditSocialGeneralizationDecision({
      structuralRoster: exactRoster,
      availablePlayers: available,
      completedHistory: [],
      selected,
      courtCount: 2,
    });

    // Every court has six feasible, previously unseen pairs. Each of eight
    // two-type players gains one half-point of T, totaling four points.
    expect(result.status).toBe("certified");
    expect(result.courtmateGainMaximum).toBe(12);
    expect(result.bestSignedRollingTypeGainAtGmaxUnits).toBe("8");
    expect(result.bestSignedRollingTypeGainAtGmax).toBe(4);
    expect(result.selectedCourtmateGain).toBe(12);
    expect(result.selectedFairnessCertified).toBe(true);
    expect(result.selectedStarvationCertified).toBe(true);
    expect(result.beneficialRescueAdmitted).toBe(true);
    expect(result.bestGmaxWitness?.courts).toHaveLength(2);
    expect(result.bestGmaxWitness?.players).toHaveLength(8);
    expect(result.bestGmaxWitness?.fullTypePlayerCount).toBe(0);
    expect(result.bestGmaxWitness?.bothTypePlayerCount).toBe(0);
  });

  it("finishes the canonical 14-player, two-court opening frontier within its default cap", () => {
    const roster = getSocialGeneralizationStructuralRoster(
      getSocialGeneralizationScenario("fixed-14-7-7-2c"),
      0,
    );
    const selected = [
      ["P1", "P2", "P8", "P9"],
      ["P3", "P4", "P10", "P11"],
    ].map((values) => {
      const ids = values as [string, string, string, string];
      return { ids: [...ids], partition: mixedCourt(ids) };
    });
    const result = auditSocialGeneralizationDecision({
      structuralRoster: roster,
      availablePlayers: activePlayers(roster),
      completedHistory: [],
      selected,
      courtCount: 2,
    });
    expect(result.status).toBe("certified");
    expect(result.complete).toBe(true);
    expect(result.visitedBatches).toBe(125685);
    expect(result.courtmateGainMaximum).toBe(12);
    expect(result.bestSignedRollingTypeGainAtGmax).toBe(4);
  });

  it("uses roster-size-specific rest cutoffs and keeps relaxed certificates when 3-court proof is capped", () => {
    const ten = getSocialGeneralizationScenario("balanced-10-5-5-2c");
    const tenRoster = getSocialGeneralizationStructuralRoster(ten, 0);
    const tenAvailable = activePlayers(tenRoster, {
      restTurns: new Map(tenRoster.slice(0, 4).map((player) => [player.userId, 3])),
    });
    const oneCourt = [{ ids: ["P1", "P2", "P3", "P4"], partition: ownCourt(["P1", "P2", "P3", "P4"]) }];
    const tenResult = auditSocialGeneralizationDecision({
      structuralRoster: tenRoster,
      availablePlayers: tenAvailable,
      completedHistory: [],
      selected: oneCourt,
      courtCount: 1,
      rotationPlayerCount: 10,
    });
    expect(tenResult.idealRestGap).toBe(2);
    expect(tenResult.selectedStarvationCertified).toBe(true);

    const eighteen = getSocialGeneralizationScenario("balanced-18-9-9-3c");
    const roster = getSocialGeneralizationStructuralRoster(eighteen, 0);
    const available = activePlayers(roster);
    const selected = [
      ["P1", "P2", "P10", "P11"],
      ["P3", "P4", "P12", "P13"],
      ["P5", "P6", "P14", "P15"],
    ].map((values) => {
      const ids = values as [string, string, string, string];
      return { ids: [...ids], partition: mixedCourt(ids) };
    });
    const bounded = auditSocialGeneralizationDecision({
      structuralRoster: roster,
      availablePlayers: available,
      completedHistory: [],
      selected,
      courtCount: 3,
      maxSearchNodes: 1,
      maxBatches: 1,
    });
    expect(bounded.status).toBe("incomplete");
    expect(bounded.complete).toBe(false);
    expect(bounded.courtmateGainMaximum).toBeNull();
    // The selected 12-player count/arrival vector reaches the unconstrained
    // global lower bound, and no overdue players exist: these proofs survive
    // even though the larger G/T frontier does not.
    expect(bounded.selectedFairnessCertified).toBe(true);
    expect(bounded.selectedFairnessCertificate).toBe("global-lower-bound");
    expect(bounded.selectedStarvationCertified).toBe(true);
    expect(bounded.selectedStarvationCertificate).toBe("zero-starvation-lower-bound");
    expect(bounded.beneficialRescueAdmitted).toBe(false);
  });
});
