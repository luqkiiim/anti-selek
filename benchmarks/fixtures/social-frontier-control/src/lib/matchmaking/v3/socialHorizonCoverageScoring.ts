import type { SocialVarietyContext } from "./socialVariety";

export const SOCIAL_HORIZON_CAPS = {
  courtmates: 13,
  opponents: 12,
  partners: 6,
} as const;

export const SOCIAL_HORIZON_WEIGHTS = {
  courtmates: 3,
  opponents: 2,
  partners: 1,
} as const;

export type SocialHorizonFacet = keyof typeof SOCIAL_HORIZON_CAPS;

export interface SocialHorizonFacetEvidence {
  /** Structurally feasible peers for this player and facet. */
  feasiblePeerIds: readonly string[];
  /** Peers actually experienced in completed matches; non-feasible IDs are ignored. */
  experiencedPeerIds: readonly string[];
}

export interface SocialHorizonPlayerEvidence {
  userId: string;
  facets: Record<SocialHorizonFacet, SocialHorizonFacetEvidence>;
}

export interface SocialHorizonFacetScore {
  feasibleCount: number;
  denominator: number;
  uniqueCount: number;
  cappedUniqueCount: number;
  ratio: number | null;
}

export interface SocialHorizonPlayerScore {
  userId: string;
  score: number | null;
  activeWeight: number;
  facets: Record<SocialHorizonFacet, SocialHorizonFacetScore>;
}

export interface SocialHorizon321Score {
  score: number | null;
  /** Mean facet ratios across players for whom each facet has opportunities. */
  facetMean: Record<SocialHorizonFacet, number | null>;
  /** Mean raw number of distinct feasible peers across players with that facet. */
  averageDistinctCount: Record<SocialHorizonFacet, number | null>;
  players: SocialHorizonPlayerScore[];
}

const FACETS: readonly SocialHorizonFacet[] = ["courtmates", "opponents", "partners"];

/**
 * Score capped, completed-only relationship coverage with structural opportunity sets.
 * Empty facets are omitted and the remaining per-player weights are renormalized.
 */
export function scoreSocialHorizon321FromEvidence(
  evidence: readonly SocialHorizonPlayerEvidence[]
): SocialHorizon321Score {
  const facetRatios: Record<SocialHorizonFacet, number[]> = {
    courtmates: [],
    opponents: [],
    partners: [],
  };
  const facetUniqueCounts: Record<SocialHorizonFacet, number[]> = {
    courtmates: [],
    opponents: [],
    partners: [],
  };
  const players = evidence.map((player): SocialHorizonPlayerScore => {
    const facets = {} as Record<SocialHorizonFacet, SocialHorizonFacetScore>;
    let weightedScore = 0;
    let activeWeight = 0;
    for (const facet of FACETS) {
      const feasiblePeers = new Set(player.facets[facet].feasiblePeerIds);
      const experiencedPeers = new Set(player.facets[facet].experiencedPeerIds);
      let uniqueCount = 0;
      for (const peerId of experiencedPeers) {
        if (feasiblePeers.has(peerId)) uniqueCount += 1;
      }
      const feasibleCount = feasiblePeers.size;
      const denominator = Math.min(feasibleCount, SOCIAL_HORIZON_CAPS[facet]);
      const cappedUniqueCount = Math.min(uniqueCount, denominator);
      const ratio = denominator === 0 ? null : cappedUniqueCount / denominator;
      facets[facet] = { feasibleCount, denominator, uniqueCount, cappedUniqueCount, ratio };
      if (ratio === null) continue;
      facetRatios[facet].push(ratio);
      facetUniqueCounts[facet].push(uniqueCount);
      const weight = SOCIAL_HORIZON_WEIGHTS[facet];
      weightedScore += weight * ratio;
      activeWeight += weight;
    }
    return {
      userId: player.userId,
      score: activeWeight === 0 ? null : weightedScore / activeWeight,
      activeWeight,
      facets,
    };
  });
  const average = (values: readonly number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  return {
    score: average(players.map((player) => player.score).filter((score): score is number => score !== null)),
    facetMean: {
      courtmates: average(facetRatios.courtmates),
      opponents: average(facetRatios.opponents),
      partners: average(facetRatios.partners),
    },
    averageDistinctCount: {
      courtmates: average(facetUniqueCounts.courtmates),
      opponents: average(facetUniqueCounts.opponents),
      partners: average(facetUniqueCounts.partners),
    },
    players,
  };
}

export function scoreSocialHorizon321(context: SocialVarietyContext): SocialHorizon321Score {
  return scoreSocialHorizon321FromEvidence([...context.playersByUserId].map(([userId, histograms]) => ({
    userId,
    facets: {
      courtmates: {
        feasiblePeerIds: [...histograms.courtmates.opportunities],
        experiencedPeerIds: [...histograms.courtmates.counts]
          .filter(([, count]) => count > 0)
          .map(([peerId]) => peerId),
      },
      opponents: {
        feasiblePeerIds: [...histograms.opponents.opportunities],
        experiencedPeerIds: [...histograms.opponents.counts]
          .filter(([, count]) => count > 0)
          .map(([peerId]) => peerId),
      },
      partners: {
        feasiblePeerIds: [...histograms.partners.opportunities],
        experiencedPeerIds: [...histograms.partners.counts]
          .filter(([, count]) => count > 0)
          .map(([peerId]) => peerId),
      },
    },
  })));
}
