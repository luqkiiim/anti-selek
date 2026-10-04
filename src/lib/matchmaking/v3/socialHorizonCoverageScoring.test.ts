import { describe, expect, it } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import { measureIndependentCoverageGainForBenchmark } from "./socialCoverageBenchmark";
import { buildSocialVarietyContext, buildSocialVarietySnapshot, createSocialHorizonCoverageScorer } from "./socialVariety";
import { scoreSocialHorizon321FromEvidence, type SocialHorizonFacetEvidence, type SocialHorizonPlayerEvidence } from "./socialHorizonCoverageScoring";

function facet(feasiblePeerIds: string[], experiencedPeerIds: string[] = []): SocialHorizonFacetEvidence {
  return { feasiblePeerIds, experiencedPeerIds };
}

function evidence(
  userId: string,
  partialFacets: Partial<Record<"courtmates" | "opponents" | "partners", SocialHorizonFacetEvidence>> = {}
): SocialHorizonPlayerEvidence {
  return {
    userId,
    facets: {
      courtmates: partialFacets.courtmates ?? facet([]),
      opponents: partialFacets.opponents ?? facet([]),
      partners: partialFacets.partners ?? facet([]),
    },
  };
}

describe("social horizon 3:2:1 coverage scorer", () => {
  it("uses the 13/12/6 caps and reports raw distinct counts separately", () => {
    const allPeers = Array.from({ length: 13 }, (_value, index) => `P${index + 2}`);
    const result = scoreSocialHorizon321FromEvidence([
      evidence("P1", {
        courtmates: facet(allPeers, allPeers),
        opponents: facet(allPeers.slice(0, 12), allPeers.slice(0, 12)),
        partners: facet(allPeers, allPeers.slice(0, 7)),
      }),
    ]);
    const player = result.players[0];
    expect(result.score).toBe(1);
    expect(player.facets.courtmates).toMatchObject({ feasibleCount: 13, denominator: 13, uniqueCount: 13, cappedUniqueCount: 13, ratio: 1 });
    expect(player.facets.opponents).toMatchObject({ feasibleCount: 12, denominator: 12, uniqueCount: 12, cappedUniqueCount: 12, ratio: 1 });
    expect(player.facets.partners).toMatchObject({ feasibleCount: 13, denominator: 6, uniqueCount: 7, cappedUniqueCount: 6, ratio: 1 });
    expect(result.averageDistinctCount).toEqual({ courtmates: 13, opponents: 12, partners: 7 });
  });

  it("weights facets 3:2:1 and excludes empty facets with per-player renormalization", () => {
    const result = scoreSocialHorizon321FromEvidence([
      evidence("P1", {
        courtmates: facet(["P2", "P3"]),
        opponents: facet(["P2", "P3"], ["P2"]),
        partners: facet(["P2"], ["P2"]),
      }),
      evidence("P4"),
    ]);
    expect(result.players[0].facets.courtmates.ratio).toBe(0);
    expect(result.players[0].facets.opponents.ratio).toBe(0.5);
    expect(result.players[0].facets.partners.ratio).toBe(1);
    expect(result.players[0].activeWeight).toBe(6);
    expect(result.players[0].score).toBeCloseTo(1 / 3);
    expect(result.players[1].score).toBeNull();
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.facetMean).toEqual({ courtmates: 0, opponents: 0.5, partners: 1 });
  });

  it("ignores experiences outside the structural feasible opportunity set", () => {
    const result = scoreSocialHorizon321FromEvidence([
      evidence("P1", {
        courtmates: facet(["P2"], ["P99"]),
      }),
    ]);
    expect(result.players[0].facets.courtmates.uniqueCount).toBe(0);
    expect(result.score).toBe(0);
  });

  it("independently certifies horizon first-exposure gain and stops paying after saturation", () => {
    const players = [
      { userId: "P1", matchesPlayed: 0, matchmakingBaseline: 0, availableSince: new Date("2026-10-03T00:00:00.000Z"), strength: 10, gender: PlayerGender.MALE, partnerPreference: PartnerPreference.OPEN, mixedSideOverride: null },
      { userId: "P2", matchesPlayed: 0, matchmakingBaseline: 0, availableSince: new Date("2026-10-03T00:00:00.000Z"), strength: 9, gender: PlayerGender.MALE, partnerPreference: PartnerPreference.OPEN, mixedSideOverride: null },
      { userId: "P3", matchesPlayed: 0, matchmakingBaseline: 0, availableSince: new Date("2026-10-03T00:00:00.000Z"), strength: 8, gender: PlayerGender.FEMALE, partnerPreference: PartnerPreference.FEMALE_FLEX, mixedSideOverride: null },
      { userId: "P4", matchesPlayed: 0, matchmakingBaseline: 0, availableSince: new Date("2026-10-03T00:00:00.000Z"), strength: 7, gender: PlayerGender.FEMALE, partnerPreference: PartnerPreference.FEMALE_FLEX, mixedSideOverride: null },
    ];
    const partition = {
      team1: ["P1", "P3"] as [string, string],
      team2: ["P2", "P4"] as [string, string],
    };
    const context = buildSocialVarietyContext(players, [], {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const productionScorer = createSocialHorizonCoverageScorer(context);
    const oracle = measureIndependentCoverageGainForBenchmark(partition, players, [], "social-horizon-321");
    const productionGain = productionScorer.getPartitionGainUnits(partition);
    expect(BigInt(oracle.numerator)).toBe(productionGain);
    expect(BigInt(oracle.denominator)).toBe(productionScorer.denominator);
    expect(oracle.normalized).toBe(productionScorer.toNormalizedScore(productionGain));
    expect(productionGain > BigInt(0)).toBe(true);

    const completedHistory = [{
      id: "prior",
      ...partition,
      socialVariety: buildSocialVarietySnapshot(partition, players),
    }];
    const saturatedContext = buildSocialVarietyContext(players, completedHistory, {
      sessionMode: SessionMode.MIXICANO,
      includePausedPlayers: true,
    });
    const saturated = measureIndependentCoverageGainForBenchmark(
      partition,
      players,
      completedHistory,
      "social-horizon-321"
    );
    expect(BigInt(saturated.numerator)).toBe(createSocialHorizonCoverageScorer(saturatedContext).getPartitionGainUnits(partition));
    expect(BigInt(saturated.numerator)).toBe(BigInt(0));
  });
});
