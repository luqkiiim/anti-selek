import { describe, expect, it } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import { getDoublesPartitions } from "./balance";
import {
  buildRecentMatchTypeWindows,
  createRollingSocialCoverageScorer,
  scoreSocialVariety3211,
} from "./socialRollingVariety";
import type { RollingMatchType } from "./socialRollingVariety";
import { buildSocialVarietyContext } from "./socialVariety";
import type { SocialVarietyContext, SocialVarietyHistogram } from "./socialVariety";
import type { MatchmakerV3Player, SocialHistoryMatch, SocialVarietySnapshot, V3DoublesPartition } from "./types";

function createRoster(upperCount: number, lowerCount: number): MatchmakerV3Player[] {
  return [
    ...Array.from({ length: upperCount }, (_, index) => ({
      userId: `U${index + 1}`,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    })),
    ...Array.from({ length: lowerCount }, (_, index) => ({
      userId: `L${index + 1}`,
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.FEMALE_FLEX,
    })),
  ].map((player) => ({
    ...player,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-10-01T00:00:00.000Z"),
    strength: 0,
  }));
}

function snapshotForType(
  partition: V3DoublesPartition,
  type: RollingMatchType | null
): SocialVarietySnapshot {
  const ids = [...partition.team1, ...partition.team2];
  const effectiveSideByUserId: Record<string, "UPPER" | "LOWER" | null> = {};
  if (type === "MIXED") {
    partition.team1.forEach((id, index) => {
      effectiveSideByUserId[id] = index === 0 ? "UPPER" : "LOWER";
    });
    partition.team2.forEach((id, index) => {
      effectiveSideByUserId[id] = index === 0 ? "UPPER" : "LOWER";
    });
  } else if (type === "OWN_SIDE") {
    for (const id of ids) effectiveSideByUserId[id] = "UPPER";
  } else {
    for (const id of ids) effectiveSideByUserId[id] = null;
  }
  return {
    version: 1,
    basis: "EFFECTIVE_MIXED_SIDE",
    courtType: type === "MIXED" ? "MIXED" : type === "OWN_SIDE" ? "UPPER" : null,
    effectiveSideByUserId,
  };
}

function match(
  id: string,
  partition: V3DoublesPartition,
  type: RollingMatchType | null,
  completedDay?: number
): SocialHistoryMatch {
  return {
    id,
    ...partition,
    ...(completedDay === undefined ? {} : { completedAt: new Date(Date.UTC(2026, 9, completedDay)) }),
    socialVariety: snapshotForType(partition, type),
  };
}

function coverRelationshipOpportunities(context: SocialVarietyContext): SocialVarietyContext {
  const cover = (histogram: SocialVarietyHistogram): SocialVarietyHistogram => {
    const counts = new Map([...histogram.opportunities].map((peerId) => [peerId, 1]));
    return { ...histogram, counts, total: counts.size };
  };
  const playersByUserId = new Map(
    [...context.playersByUserId].map(([userId, histograms]) => [userId, {
      courtmates: cover(histograms.courtmates),
      partners: cover(histograms.partners),
      opponents: cover(histograms.opponents),
      matchType: histograms.matchType,
    }])
  );
  return { ...context, playersByUserId };
}

const mixed: V3DoublesPartition = { team1: ["U1", "L1"], team2: ["U2", "L2"] };
const ownUpper: V3DoublesPartition = { team1: ["U1", "U2"], team2: ["U3", "U4"] };
const ownLower: V3DoublesPartition = { team1: ["L1", "L2"], team2: ["L3", "L4"] };

describe("experimental rolling social variety", () => {
  it("normalizes T by each player's structurally feasible type vocabulary", () => {
    const fiveOneRoster = createRoster(5, 1);
    const fiveOneHistory = [match("own", ownUpper, "OWN_SIDE", 1)];
    const fiveOneContext = buildSocialVarietyContext(fiveOneRoster, fiveOneHistory, {
      sessionMode: SessionMode.MIXICANO,
    });
    const fiveOne = scoreSocialVariety3211(fiveOneContext, fiveOneHistory);
    expect(fiveOne.players.find((player) => player.userId === "U1")).toMatchObject({
      T: 1,
      feasibleMatchTypes: ["OWN_SIDE"],
      recentMatchTypes: ["OWN_SIDE"],
    });
    expect(fiveOne.players.find((player) => player.userId === "L1")?.T).toBeNull();

    const threeThreeRoster = createRoster(3, 3);
    const threeThreeMatch: V3DoublesPartition = { team1: ["U1", "L1"], team2: ["U2", "L2"] };
    const threeThreeHistory = [match("mixed", threeThreeMatch, "MIXED", 1)];
    const threeThreeContext = buildSocialVarietyContext(threeThreeRoster, threeThreeHistory, {
      sessionMode: SessionMode.MIXICANO,
    });
    const threeThree = scoreSocialVariety3211(threeThreeContext, threeThreeHistory);
    expect(threeThree.players.find((player) => player.userId === "U1")).toMatchObject({
      T: 1,
      feasibleMatchTypes: ["MIXED"],
      recentMatchTypes: ["MIXED"],
    });
  });

  it("uses completedAt chronology, stable input fallback, and deduplicates match IDs", () => {
    const roster = createRoster(4, 4);
    const dated = [
      match("own-7", ownUpper, "OWN_SIDE", 7),
      match("own-6", ownUpper, "OWN_SIDE", 6),
      match("own-5", ownUpper, "OWN_SIDE", 5),
      match("own-4", ownUpper, "OWN_SIDE", 4),
      match("own-3", ownUpper, "OWN_SIDE", 3),
      match("own-2", ownUpper, "OWN_SIDE", 2),
      match("old-mixed", mixed, "MIXED", 1),
      match("old-mixed", mixed, "MIXED", 8),
      match("unknown-latest", mixed, null, 9),
    ];
    const context = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MIXICANO });
    const window = buildRecentMatchTypeWindows(dated, context).get("U1");
    expect(window).toEqual(["OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", null]);

    const fallback = [
      match("unknown-1", mixed, null),
      match("mixed-1", mixed, "MIXED"),
      match("own-1", ownUpper, "OWN_SIDE"),
      match("unknown-2", mixed, null),
      match("own-2", ownUpper, "OWN_SIDE"),
      match("mixed-2", mixed, "MIXED"),
      match("own-3", ownUpper, "OWN_SIDE"),
    ];
    expect(buildRecentMatchTypeWindows(fallback, context).get("U1")).toEqual([
      "MIXED", "OWN_SIDE", null, "OWN_SIDE", "MIXED", "OWN_SIDE",
    ]);
  });

  it("uses assignment-side snapshots and lets unknown types consume a window slot", () => {
    const roster = createRoster(4, 4).map((player) => ({ ...player, mixedSideOverride: "UPPER" }));
    const context = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MIXICANO });
    const history = [
      match("saved-mixed", mixed, "MIXED"),
      ...Array.from({ length: 5 }, (_, index) => match(`own-${index}`, ownUpper, "OWN_SIDE")),
      match("unknown", mixed, null),
    ];
    const windows = buildRecentMatchTypeWindows(history, context);
    expect(windows.get("U1")).toEqual([
      "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", null,
    ]);
    // Current sides say OWN_SIDE, but the historical assignment snapshot says MIXED.
    expect(buildRecentMatchTypeWindows([history[0]], context).get("U1")).toEqual(["MIXED"]);
    const noSnapshot = { ...history[0], socialVariety: undefined };
    expect(buildRecentMatchTypeWindows([noSnapshot], context).get("U1")).toEqual(["OWN_SIDE"]);
  });

  it("reports full and half feasible-type coverage and omits players with no feasible type", () => {
    const roster = createRoster(4, 4);
    const history = [match("one-mixed", mixed, "MIXED", 1)];
    const context = buildSocialVarietyContext(roster, history, { sessionMode: SessionMode.MIXICANO });
    const result = scoreSocialVariety3211(context, history);
    expect(result.players.find((player) => player.userId === "U1")?.T).toBe(0.5);
    expect(result.meanT).toBe(0.25);
    expect(result.fullTypeCoverageFraction).toBe(0);
    expect(result.halfTypeCoverageFraction).toBe(0.5);

    const singletonRoster = createRoster(2, 2);
    const singletonMatch: V3DoublesPartition = { team1: ["U1", "L1"], team2: ["U2", "L2"] };
    const singletonHistory = [match("singleton", singletonMatch, "MIXED", 1)];
    const singletonContext = buildSocialVarietyContext(singletonRoster, singletonHistory, {
      sessionMode: SessionMode.MIXICANO,
    });
    expect(scoreSocialVariety3211(singletonContext, singletonHistory).players[0].T).toBe(1);

    const noOpportunityContext = buildSocialVarietyContext(createRoster(1, 1), [], {
      sessionMode: SessionMode.MIXICANO,
    });
    const noOpportunity = scoreSocialVariety3211(noOpportunityContext, []);
    expect(noOpportunity.score).toBeNull();
    expect(noOpportunity.meanT).toBeNull();
    expect(noOpportunity.fullTypeCoverageFraction).toBeNull();
  });

  it("scores signed extinction and recovery as completed windows advance", () => {
    const roster = createRoster(4, 4);
    const history = [
      match("mixed-old", mixed, "MIXED", 1),
      ...Array.from({ length: 5 }, (_, index) => match(`own-${index}`, ownUpper, "OWN_SIDE", index + 2)),
    ];
    const relationContext = coverRelationshipOpportunities(buildSocialVarietyContext(roster, history, {
      sessionMode: SessionMode.MIXICANO,
    }));
    const scorer = createRollingSocialCoverageScorer(relationContext, history, "rolling-equal");
    expect(scoreSocialVariety3211(relationContext, history).players.find((player) => player.userId === "U1")?.T).toBe(1);
    const extinction = scorer.getPartitionGainUnits(ownUpper);
    expect(extinction).toBeLessThan(BigInt(0));
    expect(scorer.toNormalizedScore(extinction)).toBeLessThan(0);

    const ownOnlyHistory = Array.from({ length: 6 }, (_, index) =>
      match(`only-own-${index}`, ownUpper, "OWN_SIDE", index + 1)
    );
    const ownOnlyContext = coverRelationshipOpportunities(buildSocialVarietyContext(roster, ownOnlyHistory, {
      sessionMode: SessionMode.MIXICANO,
    }));
    const recoveryScorer = createRollingSocialCoverageScorer(ownOnlyContext, ownOnlyHistory, "rolling-equal");
    expect(scoreSocialVariety3211(ownOnlyContext, ownOnlyHistory).players.find((player) => player.userId === "U1")?.T).toBe(0.5);
    const recovery = recoveryScorer.getPartitionGainUnits(mixed);
    expect(recovery).toBeGreaterThan(BigInt(0));
    expect(recoveryScorer.toNormalizedScore(recovery)).toBeGreaterThan(0);
  });

  it("applies sequential batch windows without duplicate type credit and supports disjoint courts", () => {
    const roster = createRoster(4, 4);
    const ownHistory = Array.from({ length: 6 }, (_, index) =>
      match(`own-${index}`, ownUpper, "OWN_SIDE", index + 1)
    );
    const context = coverRelationshipOpportunities(buildSocialVarietyContext(roster, ownHistory, {
      sessionMode: SessionMode.MIXICANO,
    }));
    const scorer = createRollingSocialCoverageScorer(context, ownHistory, "rolling-equal");
    const firstMixedGain = scorer.getPartitionGainUnits(mixed);
    expect(scorer.getBatchGainUnits([mixed, mixed])).toBe(firstMixedGain);

    const dropAndRecoveryHistory = [
      match("mixed-old", mixed, "MIXED", 1),
      ...Array.from({ length: 5 }, (_, index) => match(`own-${index}`, ownUpper, "OWN_SIDE", index + 2)),
    ];
    const sequentialContext = coverRelationshipOpportunities(buildSocialVarietyContext(roster, dropAndRecoveryHistory, {
      sessionMode: SessionMode.MIXICANO,
    }));
    const sequentialScorer = createRollingSocialCoverageScorer(sequentialContext, dropAndRecoveryHistory, "rolling-equal");
    expect(sequentialScorer.getBatchGainUnits([ownUpper, mixed])).toBe(BigInt(0));

    const freshContext = buildSocialVarietyContext(roster, [], { sessionMode: SessionMode.MIXICANO });
    const twoCourtScorer = createRollingSocialCoverageScorer(freshContext, [], "social-horizon-3211");
    const disjointGain = twoCourtScorer.getBatchGainUnits([ownUpper, ownLower]);
    expect(disjointGain).toBe(
      twoCourtScorer.getPartitionGainUnits(ownUpper) + twoCourtScorer.getPartitionGainUnits(ownLower)
    );
    const allPlayerBound = roster.reduce(
      (sum, player) => sum + twoCourtScorer.getMaximumSingleMatchGainUnits(player.userId),
      BigInt(0)
    );
    expect(allPlayerBound).toBeGreaterThanOrEqual(disjointGain);
  });

  it("matches the 3:2:1:1 KPI delta, retains singleton facets, and has admissible single-match bounds", () => {
    const roster = createRoster(4, 4);
    const history = [match("prior", ownUpper, "OWN_SIDE", 1)];
    const context = buildSocialVarietyContext(roster, history, { sessionMode: SessionMode.MIXICANO });
    const scorer = createRollingSocialCoverageScorer(context, history, "social-horizon-3211");
    const candidate = match("candidate", mixed, "MIXED", 2);
    const candidateGain = scorer.getPartitionGainUnits(candidate);
    const afterHistory = [...history, candidate];
    const afterContext = buildSocialVarietyContext(roster, afterHistory, { sessionMode: SessionMode.MIXICANO });
    const beforeScore = scoreSocialVariety3211(context, history).score!;
    const afterScore = scoreSocialVariety3211(afterContext, afterHistory).score!;
    expect(scorer.toNormalizedScore(candidateGain)).toBeCloseTo(afterScore - beforeScore, 14);

    for (const ids of [
      ["U1", "U2", "L1", "L2"],
      ["U1", "U2", "U3", "U4"],
      ["L1", "L2", "L3", "L4"],
    ]) {
      for (const partition of getDoublesPartitions(ids as [string, string, string, string])) {
        const perPlayerUpperBound = ids.reduce(
          (sum, userId) => sum + scorer.getMaximumSingleMatchGainUnits(userId),
          BigInt(0)
        );
        expect(perPlayerUpperBound).toBeGreaterThanOrEqual(scorer.getPartitionGainUnits(partition));
      }
    }
  });

  it("keeps structural opportunities stable across busy, rest, and paused state", () => {
    const roster = createRoster(4, 4);
    const availabilityRule = {
      isQuartetAllowed: (quartet: MatchmakerV3Player[]) =>
        quartet.every((player) => player.isBusy !== true && player.isPaused !== true),
    };
    const baseline = buildSocialVarietyContext(roster, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [availabilityRule],
      includePausedPlayers: true,
    });
    const temporarilyUnavailable = roster.map((player, index) => ({
      ...player,
      isBusy: index < 4,
      isPaused: index === 7,
      restTurns: index + 1,
    }));
    const unavailable = buildSocialVarietyContext(temporarilyUnavailable, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [availabilityRule],
      includePausedPlayers: true,
    });
    const baselineScorer = createRollingSocialCoverageScorer(baseline, [], "social-horizon-3211");
    const unavailableScorer = createRollingSocialCoverageScorer(unavailable, [], "social-horizon-3211");
    expect(unavailableScorer.denominator).toBe(baselineScorer.denominator);
    expect(unavailableScorer.getPartitionGainUnits(mixed)).toBe(baselineScorer.getPartitionGainUnits(mixed));
    expect(unavailable.playersByUserId.get("L4")?.matchType.opportunities).toEqual(
      baseline.playersByUserId.get("L4")?.matchType.opportunities
    );
  });
});
