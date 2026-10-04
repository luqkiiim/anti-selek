import { SessionType } from "../../../types/enums";
import type { BenchmarkReport, BenchmarkSessionResult, SocialHorizonCoverageReport } from "./socialCoverageBenchmark";
import type { SocialHorizon321Score, SocialHorizonFacet, SocialHorizonFacetScore, SocialHorizonPlayerScore } from "./socialHorizonCoverageScoring";

const FACETS: readonly SocialHorizonFacet[] = ["courtmates", "opponents", "partners"];
const CAPS: Record<SocialHorizonFacet, number> = { courtmates: 13, opponents: 12, partners: 6 };
const WEIGHTS: Record<SocialHorizonFacet, number> = { courtmates: 3, opponents: 2, partners: 1 };
const FORMAT_ORDER = [SessionType.SOCIAL_MIX, SessionType.POINTS, SessionType.ELO] as const;
const FORMAT_LABELS: Record<SessionType, string> = {
  [SessionType.SOCIAL_MIX]: "Social",
  [SessionType.POINTS]: "Balanced Points",
  [SessionType.ELO]: "Balanced Rating/Elo",
  [SessionType.LADDER]: "Ladder",
  [SessionType.RACE]: "Race",
};

export interface NamedHorizonReport {
  policyName: string;
  report: SocialHorizonCoverageReport;
}

export interface NamedLegacyReport {
  policyName: string;
  report: BenchmarkReport;
}

export interface SocialHorizonPerSeedRow {
  policyName: string;
  matcherCoverageGainMetric: SocialHorizonCoverageReport["matcherCoverageGainMetric"];
  sessionType: SessionType;
  format: string;
  seed: number;
  completedMatches: number;
  score: number;
  normalizedEntropyScore: number | null;
  facetMean: Record<SocialHorizonFacet, number | null>;
  averageDistinctCount: Record<SocialHorizonFacet, number | null>;
  legacyRelationshipCoverage: number | null;
  legacyFacetCoverage: Record<SocialHorizonFacet, number | null>;
  backToBackRate: number | null;
  backToBackCount: number;
  eligibleAssignments: number;
  assignmentRestGap: { mean: number | null; p95: number | null; max: number };
  completedMatchCounts: {
    byPlayer: Array<{ userId: string; matchesPlayed: number }>;
    min: number;
    max: number;
    spread: number;
    allFourteenExactlySix: boolean | null;
  };
  starvation: {
    changedPlayerSet: number | null;
    changedPlayerSetKnownLowerBound: number;
    completedDecisions: number;
    certifiedCounterfactualDecisions: number;
    uncertifiedCounterfactualDecisions: number;
    decisionsWithOverdueAvailable: number;
    rate: number | null;
  };
  completedMatchTypeCounts: { MIXED: number; OWN_SIDE: number };
  last100CompletedMatchTypeCounts: { MIXED: number; OWN_SIDE: number } | null;
}

export interface SocialHorizonFormatSummary {
  policyName: string;
  matcherCoverageGainMetric: SocialHorizonCoverageReport["matcherCoverageGainMetric"];
  sessionType: SessionType;
  format: string;
  seeds: number;
  score: { mean: number; median: number; min: number; max: number; standardDeviation: number };
  normalizedEntropyMean: number | null;
  facetMean: Record<SocialHorizonFacet, number | null>;
  averageDistinctCount: Record<SocialHorizonFacet, number | null>;
  legacyRelationshipCoverageMean: number | null;
  backToBackRateMean: number | null;
  pooledBackToBack: { count: number; eligibleAssignments: number; rate: number | null };
  assignmentRestMean: number | null;
  assignmentRestP95Mean: number | null;
  assignmentRestMaxMeanOfSeedMaxima: number | null;
  assignmentRestWorstSeedMaximum: number | null;
  completedMatchCountMean: { min: number | null; max: number | null; spread: number | null };
  allFourteenExactlySixSeeds: number;
  starvation: {
    changedPlayerSetsMean: number | null;
    changedPlayerSetKnownLowerBoundMean: number | null;
    certifiedCounterfactualDecisions: number;
    uncertifiedCounterfactualDecisions: number;
    completedDecisionsMean: number | null;
    decisionsWithOverdueAvailableMean: number | null;
    rateMean: number | null;
  };
  completedMatchTypeMean: { MIXED: number | null; OWN_SIDE: number | null };
}

export interface Legacy400SecondaryRow {
  policyName: string;
  sessionType: SessionType;
  format: string;
  seeds: number;
  legacyRelationshipCoverageMean: number | null;
  partnerCoverageMean: number | null;
  opponentCoverageMean: number | null;
  courtmateCoverageMean: number | null;
  normalizedEntropyMean: number | null;
  backToBackRateMean: number | null;
  pooledBackToBack: { count: number; eligibleAssignments: number; rate: number | null };
  assignmentRestMean: number | null;
  assignmentRestP95Mean: number | null;
  assignmentRestMaxMeanOfSeedMaxima: number | null;
  assignmentRestWorstSeedMaximum: number | null;
  matchCountSpreadMean: number | null;
  starvationChangedMean: number | null;
  starvationChangedKnownLowerBoundMean: number | null;
  starvationCertifiedCounterfactualDecisions: number;
  starvationUncertifiedCounterfactualDecisions: number;
  starvationRateMean: number | null;
  mixedMatchesMean: number | null;
  ownSideMatchesMean: number | null;
  last100MixedMatchesMean: number | null;
  last100OwnSideMatchesMean: number | null;
}

export interface HorizonGateMetricDelta {
  sessionType: SessionType;
  format: string;
  seed: number;
  legacyGateScore: number;
  horizonGateScore: number;
  scoreDelta: number;
  legacyGateEntropy: number | null;
  horizonGateEntropy: number | null;
  entropyDelta: number | null;
  legacyGateRelationshipVcs: number | null;
  horizonGateRelationshipVcs: number | null;
  legacyGateB2bCount: number;
  legacyGateEligibleAssignments: number;
  horizonGateB2bCount: number;
  horizonGateEligibleAssignments: number;
  legacyGateMatchCountRange: { min: number; max: number; spread: number };
  horizonGateMatchCountRange: { min: number; max: number; spread: number };
  legacyGateMatchTypes: { MIXED: number; OWN_SIDE: number };
  horizonGateMatchTypes: { MIXED: number; OWN_SIDE: number };
}

export interface SocialHorizonPolicyComparison {
  schemaVersion: "social-horizon-policy-comparison-v1";
  generatedAt: string;
  definition: {
    metricId: "social-horizon-321";
    formula: "Per-player (3C + 2O + P) / active facet weight; C/O/P are capped distinct feasible peers over min(feasible peers, 13/12/6).";
    emptyFacetRule: "Empty facets are excluded and remaining weights are renormalized for that player.";
    opportunityRule: "Structural roster opportunities only; availability and balance do not change denominators.";
    completedHistoryRule: "At 21, only matches that have completed by that event contribute; active assignments are excluded.";
  };
  perSeed: SocialHorizonPerSeedRow[];
  perFormat: SocialHorizonFormatSummary[];
  gateMetricDeltas: HorizonGateMetricDelta[];
  legacy400Secondary: {
    sourceNote: string;
    rows: Legacy400SecondaryRow[];
  };
  measured400HorizonVariant: SocialHorizonPerSeedRow[];
  measured400HorizonMissingRelationships: Array<{
    policyName: string;
    sessionType: SessionType;
    seed: number;
    relationships: BenchmarkSessionResult["missingRelationships"];
  }>;
  provenance: Array<{
    policyName: string;
    enginePolicy: SocialHorizonCoverageReport["enginePolicy"];
    matcherCoverageGainMetric: SocialHorizonCoverageReport["matcherCoverageGainMetric"];
    sourceRevision: string;
    engineSourceSha256: string | null;
    measurementHarnessSha256: string | null;
    targetMatches: number;
  }>;
}

function addExposure(target: Record<SocialHorizonFacet, Map<string, Set<string>>>, facet: SocialHorizonFacet, left: string, right: string) {
  target[facet].get(left)?.add(right);
  target[facet].get(right)?.add(left);
}

/** Independent completed-tuple rescore; does not read the benchmark scorer's precomputed result. */
export function rescoreSocialHorizonHistory(session: BenchmarkSessionResult, completedMatches = 21): SocialHorizon321Score {
  const history = session.completedHistory;
  if (!history || history.length < completedMatches) {
    throw new Error(`${session.sessionType}/${session.profile}/seed ${session.seed}: completed history does not contain ${completedMatches} tuples.`);
  }
  const checkpoint = session.checkpoints[String(completedMatches)];
  if (!checkpoint || checkpoint.completedMatches !== completedMatches) {
    throw new Error(`${session.sessionType}/${session.profile}/seed ${session.seed}: exact ${completedMatches}-match checkpoint is missing.`);
  }
  const opportunityMaps = session.relationshipOpportunityCounts as Record<SocialHorizonFacet, Record<string, number>>;
  const roster = checkpoint.playerMatchCounts.map((player) => player.userId).sort((a, b) => a.localeCompare(b));
  const feasiblePeers: Record<SocialHorizonFacet, Map<string, Set<string>>> = {
    courtmates: new Map(roster.map((id) => [id, new Set<string>()])),
    opponents: new Map(roster.map((id) => [id, new Set<string>()])),
    partners: new Map(roster.map((id) => [id, new Set<string>()])),
  };
  const experiencedPeers: Record<SocialHorizonFacet, Map<string, Set<string>>> = {
    courtmates: new Map(roster.map((id) => [id, new Set<string>()])),
    opponents: new Map(roster.map((id) => [id, new Set<string>()])),
    partners: new Map(roster.map((id) => [id, new Set<string>()])),
  };
  for (const facet of FACETS) {
    for (const pair of Object.keys(opportunityMaps[facet] ?? {})) {
      const [left, right] = pair.split("|");
      if (!left || !right || left === right || !feasiblePeers[facet].has(left) || !feasiblePeers[facet].has(right)) {
        throw new Error(`Invalid structural ${facet} pair in benchmark report: ${pair}`);
      }
      addExposure(feasiblePeers, facet, left, right);
    }
  }
  const perPlayerMatchCounts = new Map(roster.map((id) => [id, 0]));
  const typeCounts = { MIXED: 0, OWN_SIDE: 0 };
  for (const [index, tuple] of history.slice(0, completedMatches).entries()) {
    if (tuple.completedMatchNumber !== index + 1) {
      throw new Error(`Completed history is not in exact event order at match ${index + 1} for ${session.sessionType}/${session.profile}/seed ${session.seed}.`);
    }
    const ids = [...tuple.team1, ...tuple.team2];
    if (tuple.team1.length !== 2 || tuple.team2.length !== 2 || new Set(ids).size !== 4 || ids.some((id) => !perPlayerMatchCounts.has(id))) {
      throw new Error(`Invalid completed history tuple ${tuple.completedMatchNumber} in ${session.sessionType}/${session.profile}/seed ${session.seed}.`);
    }
    if (tuple.matchType !== "MIXED" && tuple.matchType !== "OWN_SIDE") {
      throw new Error(`Invalid completed match type at match ${tuple.completedMatchNumber}.`);
    }
    if (tuple.matchType === "MIXED") typeCounts.MIXED += 1;
    else typeCounts.OWN_SIDE += 1;
    for (const id of ids) perPlayerMatchCounts.set(id, perPlayerMatchCounts.get(id)! + 1);
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        addExposure(experiencedPeers, "courtmates", ids[leftIndex], ids[rightIndex]);
      }
    }
    addExposure(experiencedPeers, "partners", tuple.team1[0], tuple.team1[1]);
    addExposure(experiencedPeers, "partners", tuple.team2[0], tuple.team2[1]);
    for (const left of tuple.team1) for (const right of tuple.team2) addExposure(experiencedPeers, "opponents", left, right);
  }
  const expectedCounts = new Map(checkpoint.playerMatchCounts.map(({ userId, matchesPlayed }) => [userId, matchesPlayed]));
  for (const userId of roster) {
    if (perPlayerMatchCounts.get(userId) !== expectedCounts.get(userId)) {
      throw new Error(`${session.sessionType}/${session.profile}/seed ${session.seed}: completed tuple count for ${userId} does not match checkpoint ${completedMatches}.`);
    }
  }
  if (typeCounts.MIXED !== checkpoint.completedMatchTypeCounts.MIXED || typeCounts.OWN_SIDE !== checkpoint.completedMatchTypeCounts.OWN_SIDE) {
    throw new Error(`${session.sessionType}/${session.profile}/seed ${session.seed}: completed tuple types do not match checkpoint ${completedMatches}.`);
  }
  const players = roster.map((userId): SocialHorizonPlayerScore => {
    const facets = {} as Record<SocialHorizonFacet, SocialHorizonFacetScore>;
    let weighted = 0;
    let activeWeight = 0;
    for (const facet of FACETS) {
      const feasible = feasiblePeers[facet].get(userId)!;
      const experienced = experiencedPeers[facet].get(userId)!;
      for (const peerId of experienced) {
        if (!feasible.has(peerId)) throw new Error(`Observed ${facet} relationship ${userId}|${peerId} is structurally infeasible.`);
      }
      const feasibleCount = feasible.size;
      const denominator = Math.min(feasibleCount, CAPS[facet]);
      const uniqueCount = experienced.size;
      const cappedUniqueCount = Math.min(uniqueCount, denominator);
      const ratio = denominator === 0 ? null : cappedUniqueCount / denominator;
      facets[facet] = { feasibleCount, denominator, uniqueCount, cappedUniqueCount, ratio };
      if (ratio === null) continue;
      weighted += ratio * WEIGHTS[facet];
      activeWeight += WEIGHTS[facet];
    }
    return { userId, score: activeWeight ? weighted / activeWeight : null, activeWeight, facets };
  });
  const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const playersWithScore = players.filter((player) => player.score !== null);
  return {
    score: average(playersWithScore.map((player) => player.score!)),
    facetMean: {
      courtmates: average(players.map((player) => player.facets.courtmates.ratio).filter((value): value is number => value !== null)),
      opponents: average(players.map((player) => player.facets.opponents.ratio).filter((value): value is number => value !== null)),
      partners: average(players.map((player) => player.facets.partners.ratio).filter((value): value is number => value !== null)),
    },
    averageDistinctCount: {
      courtmates: average(players.filter((player) => player.facets.courtmates.ratio !== null).map((player) => player.facets.courtmates.uniqueCount)),
      opponents: average(players.filter((player) => player.facets.opponents.ratio !== null).map((player) => player.facets.opponents.uniqueCount)),
      partners: average(players.filter((player) => player.facets.partners.ratio !== null).map((player) => player.facets.partners.uniqueCount)),
    },
    players,
  };
}

function approximatelyEqual(left: number | null, right: number | null, label: string) {
  if (left === null || right === null) {
    if (left !== right) throw new Error(`${label} differs: ${left} vs ${right}.`);
    return;
  }
  if (Math.abs(left - right) > 1e-12) throw new Error(`${label} differs: ${left} vs ${right}.`);
}

/** Verifies that a short rerun is the same deterministic 21-match prefix as the saved 400-match report. */
export function assertHorizon21MatchesLegacyPrefix(horizon: BenchmarkSessionResult, legacy: BenchmarkSessionResult) {
  const checkpoint = horizon.checkpoints["21"];
  const oldCheckpoint = legacy.checkpoints["21"];
  if (!checkpoint || !oldCheckpoint || checkpoint.completedMatches !== 21 || oldCheckpoint.completedMatches !== 21) {
    throw new Error("Both horizon and historical sessions must contain their exact 21-match checkpoint.");
  }
  for (const [label, actual, expected] of [
    ["profile", horizon.profile, legacy.profile],
    ["format", horizon.sessionType, legacy.sessionType],
    ["seed", horizon.seed, legacy.seed],
  ] as const) if (actual !== expected) throw new Error(`Cannot compare mismatched session ${label}: ${actual} vs ${expected}.`);
  if (JSON.stringify(horizon.externalCompletionSchedule.slice(0, 21)) !== JSON.stringify(legacy.externalCompletionSchedule.slice(0, 21))) {
    throw new Error("The 21-match external completion schedule differs from the saved historical prefix.");
  }
  if (JSON.stringify(horizon.completedMatchTypes.slice(0, 21)) !== JSON.stringify(legacy.completedMatchTypes.slice(0, 21))) {
    throw new Error("The completed MIXED/OWN_SIDE sequence differs from the saved historical prefix.");
  }
  const scalarFields: Array<keyof BenchmarkSessionResult["checkpoints"][string]> = [
    "varietyCoverageScore", "partnerCoverage", "opponentCoverage", "courtmateCoverage", "normalizedEntropyScore",
    "relationshipEntropyScore", "matchTypeEntropyScore", "matchCountSpread", "maximumFairnessSpread", "minimumFairnessSpread",
    "maximumBalanceGap", "externalBusyEventCount", "maximumObservedAvailableRestTurns",
  ];
  for (const key of scalarFields) {
    const actual = checkpoint[key] as number | null;
    const expected = oldCheckpoint[key] as number | null;
    approximatelyEqual(actual, expected, `checkpoint21.${key}`);
  }
  for (const key of ["assignmentRestGap", "betweenOwnCompletionEventGap", "backToBack", "playerMatchCounts", "completedMatchTypeCounts", "starvation"] as const) {
    if (JSON.stringify(checkpoint[key]) !== JSON.stringify(oldCheckpoint[key])) {
      throw new Error(`checkpoint21.${key} differs from the saved historical prefix.`);
    }
  }
}

function mean(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function stats(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return null;
  const avg = ordered.reduce((sum, value) => sum + value, 0) / ordered.length;
  const median = ordered.length % 2 ? ordered[(ordered.length - 1) / 2] : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
  return {
    mean: avg,
    median,
    min: ordered[0],
    max: ordered[ordered.length - 1],
    standardDeviation: Math.sqrt(ordered.reduce((sum, value) => sum + (value - avg) ** 2, 0) / ordered.length),
  };
}

function makePerSeedRow(
  policyName: string,
  session: BenchmarkSessionResult,
  completedMatches = 21,
  matcherCoverageGainMetric: SocialHorizonCoverageReport["matcherCoverageGainMetric"] = "legacy-equal"
): SocialHorizonPerSeedRow {
  const checkpoint = session.checkpoints[String(completedMatches)];
  if (!checkpoint || checkpoint.completedMatches !== completedMatches) {
    throw new Error(`${policyName}/${session.sessionType}/seed ${session.seed} is missing the ${completedMatches}-match checkpoint.`);
  }
  const independentlyScored = rescoreSocialHorizonHistory(session, completedMatches);
  const stored = checkpoint.socialHorizon321;
  if (!stored) throw new Error(`${policyName}/${session.sessionType}/seed ${session.seed} has no socialHorizon321 checkpoint score.`);
  approximatelyEqual(independentlyScored.score, stored.score, "independent socialHorizon321 score");
  for (const facet of FACETS) {
    approximatelyEqual(independentlyScored.facetMean[facet], stored.facetMean[facet], `independent ${facet} mean`);
    approximatelyEqual(independentlyScored.averageDistinctCount[facet], stored.averageDistinctCount[facet], `independent ${facet} distinct count`);
  }
  const storedPlayersById = new Map(stored.players.map((player) => [player.userId, player]));
  if (storedPlayersById.size !== independentlyScored.players.length) {
    throw new Error("Independent horizon rescore player roster size mismatch.");
  }
  for (const actual of independentlyScored.players) {
    const expected = storedPlayersById.get(actual.userId);
    if (!expected) throw new Error(`Independent horizon rescore is missing stored player ${actual.userId}.`);
    approximatelyEqual(actual.score, expected.score, `independent player ${actual.userId} score`);
    for (const facet of FACETS) {
      const actualFacet = actual.facets[facet];
      const expectedFacet = expected.facets[facet];
      for (const field of ["feasibleCount", "denominator", "uniqueCount", "cappedUniqueCount"] as const) {
        if (actualFacet[field] !== expectedFacet[field]) throw new Error(`Independent player ${actual.userId} ${facet}.${field} mismatch.`);
      }
      approximatelyEqual(actualFacet.ratio, expectedFacet.ratio, `independent player ${actual.userId} ${facet} ratio`);
    }
  }
  return {
    policyName,
    matcherCoverageGainMetric,
    sessionType: session.sessionType,
    format: FORMAT_LABELS[session.sessionType],
    seed: session.seed,
    completedMatches,
    score: independentlyScored.score ?? 0,
    normalizedEntropyScore: checkpoint.normalizedEntropyScore,
    facetMean: independentlyScored.facetMean,
    averageDistinctCount: independentlyScored.averageDistinctCount,
    legacyRelationshipCoverage: checkpoint.varietyCoverageScore,
    legacyFacetCoverage: {
      courtmates: checkpoint.courtmateCoverage,
      opponents: checkpoint.opponentCoverage,
      partners: checkpoint.partnerCoverage,
    },
    backToBackRate: checkpoint.backToBack.rate,
    backToBackCount: checkpoint.backToBack.count,
    eligibleAssignments: checkpoint.backToBack.eligibleAssignments,
    assignmentRestGap: {
      mean: checkpoint.assignmentRestGap.mean,
      p95: checkpoint.assignmentRestGap.p95,
      max: checkpoint.assignmentRestGap.max,
    },
    completedMatchCounts: {
      byPlayer: checkpoint.playerMatchCounts,
      min: checkpoint.minimumPlayerMatchCount,
      max: checkpoint.maximumPlayerMatchCount,
      spread: checkpoint.matchCountSpread,
      allFourteenExactlySix: completedMatches === 21 ? checkpoint.allPlayersExactlySixMatches : null,
    },
    starvation: {
      changedPlayerSet: checkpoint.starvation.uncertifiedCounterfactualDecisions === 0
        ? checkpoint.starvation.materiallyChangedPlayerSet
        : null,
      changedPlayerSetKnownLowerBound: checkpoint.starvation.materiallyChangedPlayerSet,
      completedDecisions: checkpoint.starvation.completedRotationDecisions,
      certifiedCounterfactualDecisions: checkpoint.starvation.certifiedCounterfactualDecisions,
      uncertifiedCounterfactualDecisions: checkpoint.starvation.uncertifiedCounterfactualDecisions,
      decisionsWithOverdueAvailable: checkpoint.starvation.decisionsWithOverdueAvailable,
      rate: checkpoint.starvation.uncertifiedCounterfactualDecisions === 0
        ? checkpoint.starvation.rateAcrossCompletedDecisions
        : null,
    },
    completedMatchTypeCounts: checkpoint.completedMatchTypeCounts,
    last100CompletedMatchTypeCounts: session.completedMatchTypes.length >= 100
      ? session.completedMatchTypes.slice(-100).reduce((counts, matchType) => {
        counts[matchType] += 1;
        return counts;
      }, { MIXED: 0, OWN_SIDE: 0 })
      : null,
  };
}

function makeFormatSummary(policyName: string, sessionType: SessionType, sessions: SocialHorizonPerSeedRow[]): SocialHorizonFormatSummary {
  const scoreStats = stats(sessions.map((session) => session.score))!;
  return {
    policyName,
    matcherCoverageGainMetric: sessions[0]?.matcherCoverageGainMetric ?? "legacy-equal",
    sessionType,
    format: FORMAT_LABELS[sessionType],
    seeds: sessions.length,
    score: scoreStats,
    normalizedEntropyMean: mean(sessions.map((session) => session.normalizedEntropyScore)),
    facetMean: {
      courtmates: mean(sessions.map((session) => session.facetMean.courtmates)),
      opponents: mean(sessions.map((session) => session.facetMean.opponents)),
      partners: mean(sessions.map((session) => session.facetMean.partners)),
    },
    averageDistinctCount: {
      courtmates: mean(sessions.map((session) => session.averageDistinctCount.courtmates)),
      opponents: mean(sessions.map((session) => session.averageDistinctCount.opponents)),
      partners: mean(sessions.map((session) => session.averageDistinctCount.partners)),
    },
    legacyRelationshipCoverageMean: mean(sessions.map((session) => session.legacyRelationshipCoverage)),
    backToBackRateMean: mean(sessions.map((session) => session.backToBackRate)),
    pooledBackToBack: {
      count: sessions.reduce((sum, session) => sum + session.backToBackCount, 0),
      eligibleAssignments: sessions.reduce((sum, session) => sum + session.eligibleAssignments, 0),
      rate: sessions.reduce((sum, session) => sum + session.eligibleAssignments, 0)
        ? sessions.reduce((sum, session) => sum + session.backToBackCount, 0) /
          sessions.reduce((sum, session) => sum + session.eligibleAssignments, 0)
        : null,
    },
    assignmentRestMean: mean(sessions.map((session) => session.assignmentRestGap.mean)),
    assignmentRestP95Mean: mean(sessions.map((session) => session.assignmentRestGap.p95)),
    assignmentRestMaxMeanOfSeedMaxima: mean(sessions.map((session) => session.assignmentRestGap.max)),
    assignmentRestWorstSeedMaximum: Math.max(...sessions.map((session) => session.assignmentRestGap.max)),
    completedMatchCountMean: {
      min: mean(sessions.map((session) => session.completedMatchCounts.min)),
      max: mean(sessions.map((session) => session.completedMatchCounts.max)),
      spread: mean(sessions.map((session) => session.completedMatchCounts.spread)),
    },
    allFourteenExactlySixSeeds: sessions.filter((session) => session.completedMatchCounts.allFourteenExactlySix).length,
    starvation: {
      changedPlayerSetsMean: sessions.every((session) => session.starvation.uncertifiedCounterfactualDecisions === 0)
        ? mean(sessions.map((session) => session.starvation.changedPlayerSet))
        : null,
      changedPlayerSetKnownLowerBoundMean: mean(sessions.map((session) => session.starvation.changedPlayerSetKnownLowerBound)),
      certifiedCounterfactualDecisions: sessions.reduce((sum, session) => sum + session.starvation.certifiedCounterfactualDecisions, 0),
      uncertifiedCounterfactualDecisions: sessions.reduce((sum, session) => sum + session.starvation.uncertifiedCounterfactualDecisions, 0),
      completedDecisionsMean: mean(sessions.map((session) => session.starvation.completedDecisions)),
      decisionsWithOverdueAvailableMean: mean(sessions.map((session) => session.starvation.decisionsWithOverdueAvailable)),
      rateMean: sessions.every((session) => session.starvation.uncertifiedCounterfactualDecisions === 0)
        ? mean(sessions.map((session) => session.starvation.rate))
        : null,
    },
    completedMatchTypeMean: {
      MIXED: mean(sessions.map((session) => session.completedMatchTypeCounts.MIXED)),
      OWN_SIDE: mean(sessions.map((session) => session.completedMatchTypeCounts.OWN_SIDE)),
    },
  };
}

function makeLegacy400Row(policyName: string, sessionType: SessionType, sessions: BenchmarkSessionResult[]): Legacy400SecondaryRow {
  const checkpoints = sessions.map((session) => {
    const checkpoint = session.checkpoints["400"];
    if (!checkpoint || checkpoint.completedMatches !== 400) {
      throw new Error(`${policyName}/${session.sessionType}/seed ${session.seed} is missing the exact 400-match checkpoint.`);
    }
    return checkpoint;
  });
  return {
    policyName,
    sessionType,
    format: FORMAT_LABELS[sessionType],
    seeds: sessions.length,
    legacyRelationshipCoverageMean: mean(checkpoints.map((checkpoint) => checkpoint.varietyCoverageScore)),
    partnerCoverageMean: mean(checkpoints.map((checkpoint) => checkpoint.partnerCoverage)),
    opponentCoverageMean: mean(checkpoints.map((checkpoint) => checkpoint.opponentCoverage)),
    courtmateCoverageMean: mean(checkpoints.map((checkpoint) => checkpoint.courtmateCoverage)),
    normalizedEntropyMean: mean(checkpoints.map((checkpoint) => checkpoint.normalizedEntropyScore)),
    backToBackRateMean: mean(checkpoints.map((checkpoint) => checkpoint.backToBack.rate)),
    pooledBackToBack: {
      count: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.backToBack.count, 0),
      eligibleAssignments: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.backToBack.eligibleAssignments, 0),
      rate: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.backToBack.eligibleAssignments, 0)
        ? checkpoints.reduce((sum, checkpoint) => sum + checkpoint.backToBack.count, 0) /
          checkpoints.reduce((sum, checkpoint) => sum + checkpoint.backToBack.eligibleAssignments, 0)
        : null,
    },
    assignmentRestMean: mean(checkpoints.map((checkpoint) => checkpoint.assignmentRestGap.mean)),
    assignmentRestP95Mean: mean(checkpoints.map((checkpoint) => checkpoint.assignmentRestGap.p95)),
    assignmentRestMaxMeanOfSeedMaxima: mean(checkpoints.map((checkpoint) => checkpoint.assignmentRestGap.max)),
    assignmentRestWorstSeedMaximum: Math.max(...checkpoints.map((checkpoint) => checkpoint.assignmentRestGap.max)),
    matchCountSpreadMean: mean(checkpoints.map((checkpoint) => checkpoint.matchCountSpread)),
    starvationChangedMean: checkpoints.every((checkpoint) => checkpoint.starvation.uncertifiedCounterfactualDecisions === 0)
      ? mean(checkpoints.map((checkpoint) => checkpoint.starvation.materiallyChangedPlayerSet))
      : null,
    starvationChangedKnownLowerBoundMean: mean(checkpoints.map((checkpoint) => checkpoint.starvation.materiallyChangedPlayerSet)),
    starvationCertifiedCounterfactualDecisions: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.starvation.certifiedCounterfactualDecisions, 0),
    starvationUncertifiedCounterfactualDecisions: checkpoints.reduce((sum, checkpoint) => sum + checkpoint.starvation.uncertifiedCounterfactualDecisions, 0),
    starvationRateMean: checkpoints.every((checkpoint) => checkpoint.starvation.uncertifiedCounterfactualDecisions === 0)
      ? mean(checkpoints.map((checkpoint) => checkpoint.starvation.rateAcrossCompletedDecisions))
      : null,
    mixedMatchesMean: mean(checkpoints.map((checkpoint) => checkpoint.completedMatchTypeCounts.MIXED)),
    ownSideMatchesMean: mean(checkpoints.map((checkpoint) => checkpoint.completedMatchTypeCounts.OWN_SIDE)),
    last100MixedMatchesMean: mean(sessions.map((session) => session.completedMatchTypes.length >= 100
      ? session.completedMatchTypes.slice(-100).filter((matchType) => matchType === "MIXED").length
      : null)),
    last100OwnSideMatchesMean: mean(sessions.map((session) => session.completedMatchTypes.length >= 100
      ? session.completedMatchTypes.slice(-100).filter((matchType) => matchType === "OWN_SIDE").length
      : null)),
  };
}

/**
 * Builds the primary 21-match six-policy comparison from per-player horizon
 * scores. Optional legacy reports contribute only an explicitly secondary
 * appendix of the previously measured 400-match metrics.
 */
export function buildSocialHorizonPolicyComparison(
  namedReports: readonly NamedHorizonReport[],
  legacy400Reports: readonly NamedLegacyReport[] = []
): SocialHorizonPolicyComparison {
  if (!namedReports.length) throw new Error("At least one horizon report is required.");
  if (new Set(namedReports.map(({ policyName }) => policyName)).size !== namedReports.length) {
    throw new Error("Horizon report policy names must be unique.");
  }
  const expectedSeeds = [...namedReports[0].report.seeds].sort((a, b) => a - b);
  const perSeed: SocialHorizonPerSeedRow[] = [];
  const provenance: SocialHorizonPolicyComparison["provenance"] = [];
  for (const { policyName, report } of namedReports) {
    if (report.schemaVersion !== "social-horizon-321-v1" || !["legacy-equal", "social-horizon-321"].includes(report.matcherCoverageGainMetric)) {
      throw new Error(`${policyName} is not a valid social-horizon report.`);
    }
    const runtimeReport = report as SocialHorizonCoverageReport & { validationStatus?: string };
    if (runtimeReport.validationStatus === "pending") throw new Error(`${policyName} horizon report is explicitly pending validation.`);
    if (JSON.stringify([...report.seeds].sort((a, b) => a - b)) !== JSON.stringify(expectedSeeds)) {
      throw new Error(`${policyName} was measured with a different seed set.`);
    }
    const sessions = report.sessions.filter((session) => session.profile === "narrow");
    if (sessions.length !== expectedSeeds.length * FORMAT_ORDER.length) {
      throw new Error(`${policyName} should contain one narrow session per seed and format.`);
    }
    for (const seed of expectedSeeds) for (const sessionType of FORMAT_ORDER) {
      const session = sessions.find((item) => item.seed === seed && item.sessionType === sessionType);
      if (!session) throw new Error(`${policyName} is missing ${sessionType} seed ${seed}.`);
      const row = makePerSeedRow(policyName, session, 21, report.matcherCoverageGainMetric);
      const baseline = namedReports[0].report.sessions.find((item) => item.profile === "narrow" && item.seed === seed && item.sessionType === sessionType);
      if (baseline && JSON.stringify(session.externalCompletionSchedule.slice(0, 21)) !== JSON.stringify(baseline.externalCompletionSchedule.slice(0, 21))) {
        throw new Error(`${policyName}/${sessionType}/seed ${seed} has a different external completion schedule.`);
      }
      const samePolicyLegacy = legacy400Reports.find((item) => item.policyName === policyName)?.report.sessions
        .find((item) => item.profile === "narrow" && item.seed === seed && item.sessionType === sessionType);
      if (samePolicyLegacy) assertHorizon21MatchesLegacyPrefix(session, samePolicyLegacy);
      perSeed.push(row);
    }
    provenance.push({
      policyName,
      enginePolicy: report.enginePolicy,
      matcherCoverageGainMetric: report.matcherCoverageGainMetric,
      sourceRevision: report.sourceRevision,
      engineSourceSha256: report.sourceProvenance.engineSourceSha256,
      measurementHarnessSha256: report.sourceProvenance.measurementHarnessSha256,
      targetMatches: report.targetMatches,
    });
  }
  const perFormat: SocialHorizonFormatSummary[] = [];
  for (const { policyName } of namedReports) for (const sessionType of FORMAT_ORDER) {
    perFormat.push(makeFormatSummary(policyName, sessionType, perSeed.filter((row) => row.policyName === policyName && row.sessionType === sessionType)));
  }
  const legacy400Rows = legacy400Reports.flatMap(({ policyName, report }) => {
    const narrowSessions = report.sessions.filter((session) => session.profile === "narrow");
    const legacySeeds = [...new Set(narrowSessions.map((session) => session.seed))].sort((a, b) => a - b);
    const exactFormatCohort = FORMAT_ORDER.every((sessionType) => narrowSessions.filter((session) => session.sessionType === sessionType).length === expectedSeeds.length);
    const exact400 = narrowSessions.every((session) => session.checkpoints["400"]?.completedMatches === 400);
    if (report.seedCount !== expectedSeeds.length || JSON.stringify(legacySeeds) !== JSON.stringify(expectedSeeds) ||
        narrowSessions.length !== expectedSeeds.length * FORMAT_ORDER.length || !exactFormatCohort || !exact400) {
      throw new Error(`${policyName} legacy 400 report does not match the primary seed/format cohort.`);
    }
    return FORMAT_ORDER.map((sessionType) => makeLegacy400Row(policyName, sessionType,
      report.sessions.filter((session) => session.profile === "narrow" && session.sessionType === sessionType)));
  });
  const measured400HorizonVariant = namedReports.flatMap(({ policyName, report }) => report.targetMatches === 400
    ? FORMAT_ORDER.flatMap((sessionType) => report.sessions.filter((session) => session.profile === "narrow" && session.sessionType === sessionType)
      .map((session) => makePerSeedRow(policyName, session, 400, report.matcherCoverageGainMetric)))
    : []);
  const measured400HorizonMissingRelationships = namedReports.flatMap(({ policyName, report }) => report.targetMatches === 400
    ? report.sessions.filter((session) => session.profile === "narrow")
      .map((session) => ({
        policyName,
        sessionType: session.sessionType,
        seed: session.seed,
        relationships: session.missingRelationships,
      }))
    : []);
  const legacyGatePolicy = "coverage-gated-legacy-metric";
  const legacyGateRows = new Map(perSeed.filter((row) => row.policyName === legacyGatePolicy)
    .map((row) => [`${row.sessionType}:${row.seed}`, row]));
  const gateMetricDeltas: HorizonGateMetricDelta[] = perSeed
    .filter((row) => row.matcherCoverageGainMetric === "social-horizon-321" && row.policyName !== legacyGatePolicy)
    .flatMap((horizonRow) => {
      const legacyRow = legacyGateRows.get(`${horizonRow.sessionType}:${horizonRow.seed}`);
      if (!legacyRow) return [];
      return [{
        sessionType: horizonRow.sessionType,
        format: horizonRow.format,
        seed: horizonRow.seed,
        legacyGateScore: legacyRow.score,
        horizonGateScore: horizonRow.score,
        scoreDelta: horizonRow.score - legacyRow.score,
        legacyGateEntropy: legacyRow.normalizedEntropyScore,
        horizonGateEntropy: horizonRow.normalizedEntropyScore,
        entropyDelta: legacyRow.normalizedEntropyScore !== null && horizonRow.normalizedEntropyScore !== null
          ? horizonRow.normalizedEntropyScore - legacyRow.normalizedEntropyScore
          : null,
        legacyGateRelationshipVcs: legacyRow.legacyRelationshipCoverage,
        horizonGateRelationshipVcs: horizonRow.legacyRelationshipCoverage,
        legacyGateB2bCount: legacyRow.backToBackCount,
        legacyGateEligibleAssignments: legacyRow.eligibleAssignments,
        horizonGateB2bCount: horizonRow.backToBackCount,
        horizonGateEligibleAssignments: horizonRow.eligibleAssignments,
        legacyGateMatchCountRange: {
          min: legacyRow.completedMatchCounts.min,
          max: legacyRow.completedMatchCounts.max,
          spread: legacyRow.completedMatchCounts.spread,
        },
        horizonGateMatchCountRange: {
          min: horizonRow.completedMatchCounts.min,
          max: horizonRow.completedMatchCounts.max,
          spread: horizonRow.completedMatchCounts.spread,
        },
        legacyGateMatchTypes: legacyRow.completedMatchTypeCounts,
        horizonGateMatchTypes: horizonRow.completedMatchTypeCounts,
      }];
    });
  return {
    schemaVersion: "social-horizon-policy-comparison-v1",
    generatedAt: new Date().toISOString(),
    definition: {
      metricId: "social-horizon-321",
      formula: "Per-player (3C + 2O + P) / active facet weight; C/O/P are capped distinct feasible peers over min(feasible peers, 13/12/6).",
      emptyFacetRule: "Empty facets are excluded and remaining weights are renormalized for that player.",
      opportunityRule: "Structural roster opportunities only; availability and balance do not change denominators.",
      completedHistoryRule: "At 21, only matches that have completed by that event contribute; active assignments are excluded.",
    },
    perSeed,
    perFormat,
    gateMetricDeltas,
    legacy400Secondary: {
      sourceNote: "These are legacy coverage/rest/fairness metrics copied from the original canonical 21/400 reports; they are secondary and were not recomputed as social-horizon-321 values.",
      rows: legacy400Rows,
    },
    measured400HorizonVariant,
    measured400HorizonMissingRelationships,
    provenance,
  };
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function scorePercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function fixed(value: number | null, digits = 2) {
  return value === null ? "n/a" : value.toFixed(digits);
}

export function formatSocialHorizonPolicyComparison(report: SocialHorizonPolicyComparison) {
  const lines = [
    "# Social Horizon 3:2:1 coverage comparison",
    "",
    "The primary score uses completed relationships only: each player scores `(3C + 2O + P) / active weight`, where C/O/P are distinct feasible courtmates/opponents/partners divided by the smaller of feasible opportunities and caps 13/12/6. Empty facets are excluded and remaining weights are renormalized. Opportunity sets come from full-roster structural legality, independent of player availability or balance guardrails.",
    "",
    "The 21-match rows are rescored independently from saved completed team tuples and structural relationship pairs; active, unfinished assignments are excluded. The existing equal-weight relationship-coverage score is shown as a secondary column.",
  ];
  lines.push(
    "",
    "## Results after 21 completed matches",
    "",
    "These rows lead with the mean 3:2:1 horizon score and pooled back-to-back rate for each of the five historical policies and, when present, the horizon-gated current policy. The pooled rate divides all zero-rest assignments by all eligible assignments across the five seeds within each format.",
    "",
    "| Policy | 3:2:1 horizon score (Social / Points / Elo) | Pooled B2B (Social / Points / Elo) |",
    "|---|---|---|"
  );
  const policyNames = [...new Set(report.perFormat.map((row) => row.policyName))];
  for (const policyName of policyNames) {
    const rows = FORMAT_ORDER.map((sessionType) => report.perFormat.find((row) => row.policyName === policyName && row.sessionType === sessionType));
    if (rows.some((row) => !row)) continue;
    lines.push(`| ${policyName} | ${rows.map((row) => scorePercent(row!.score.mean)).join(" / ")} | ${rows.map((row) => `${percent(row!.pooledBackToBack.rate)} (${row!.pooledBackToBack.count}/${row!.pooledBackToBack.eligibleAssignments})`).join(" / ")} |`);
  }
  if (report.gateMetricDeltas.length) {
    const signedPoints = (value: number | null) => value === null ? "n/a" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`;
    const deltaLines = FORMAT_ORDER.flatMap((sessionType) => {
      const rows = report.gateMetricDeltas.filter((row) => row.sessionType === sessionType);
      if (!rows.length) return [];
      const oldB2b = rows.reduce((sum, row) => sum + row.legacyGateB2bCount, 0);
      const oldEligible = rows.reduce((sum, row) => sum + row.legacyGateEligibleAssignments, 0);
      const newB2b = rows.reduce((sum, row) => sum + row.horizonGateB2bCount, 0);
      const newEligible = rows.reduce((sum, row) => sum + row.horizonGateEligibleAssignments, 0);
      const oldRate = oldEligible ? oldB2b / oldEligible : null;
      const newRate = newEligible ? newB2b / newEligible : null;
      const oldScore = mean(rows.map((row) => row.legacyGateScore));
      const newScore = mean(rows.map((row) => row.horizonGateScore));
      const avgScoreDelta = mean(rows.map((row) => row.scoreDelta));
      const avgB2bDelta = oldRate !== null && newRate !== null ? newRate - oldRate : null;
      const rawScoreDelta = avgScoreDelta === null ? "n/a" : `${avgScoreDelta >= 0 ? "+" : ""}${(avgScoreDelta * 100).toFixed(5)} pp`;
      return [`${FORMAT_LABELS[sessionType]}: horizon score ${scorePercent(oldScore ?? 0)} → ${scorePercent(newScore ?? 0)} (${rawScoreDelta}); pooled B2B ${percent(oldRate)} → ${percent(newRate)} (${signedPoints(avgB2bDelta)}).`];
    });
    lines.push(
      "",
      "Across the six policies, the table above reports the mean 3:2:1 coverage and pooled back-to-back rate after 21 completed matches. The 3:2:1 gate is experimental; the default remains the legacy gate. The paired mean score and B2B changes below are calculated from the matched seed and format rows.",
      "",
      "Paired legacy-gate → horizon-gate changes by format:",
      "",
      ...deltaLines.map((line) => `- ${line}`)
    );
    const pairedSeeds = [...new Set(report.gateMetricDeltas.map((row) => row.seed))].sort((left, right) => left - right);
    const seedCell = (rows: HorizonGateMetricDelta[], value: (row: HorizonGateMetricDelta) => number) => pairedSeeds
      .map((seed) => rows.find((row) => row.seed === seed))
      .map((row) => row ? value(row) : null);
    const normalizedDelta = (value: number) => Math.abs(value) <= 1e-12 ? 0 : value;
    const deltaPp = (value: number | null) => {
      if (value === null) return "n/a";
      const normalized = normalizedDelta(value);
      return `${normalized >= 0 ? "+" : ""}${(normalized * 100).toFixed(5)}`;
    };
    lines.push(
      "",
      "### Paired per-seed changes at 21 matches",
      "",
      `Each value is horizon gate minus legacy gate; seeds are ordered ${pairedSeeds.join(", ")}. Coverage deltas are percentage points; B2B deltas are zero-rest assignment counts.`,
      "",
      `| Format | Coverage Δ pp by seed (${pairedSeeds.join(" / ")}) | Coverage higher / flat / lower seeds | B2B count Δ by seed (${pairedSeeds.join(" / ")}) |`,
      "|---|---|---:|---|"
    );
    for (const sessionType of FORMAT_ORDER) {
      const rows = report.gateMetricDeltas.filter((row) => row.sessionType === sessionType).sort((left, right) => left.seed - right.seed);
      if (!rows.length) continue;
      const deltas = seedCell(rows, (row) => row.scoreDelta);
      const changes = deltas.filter((value): value is number => value !== null).map(normalizedDelta);
      const higher = changes.filter((value) => value > 0).length;
      const flat = changes.filter((value) => value === 0).length;
      const lower = changes.filter((value) => value < 0).length;
      const scoreCells = deltas.map((value) => deltaPp(value)).join(" / ");
      const b2bCells = seedCell(rows, (row) => row.horizonGateB2bCount - row.legacyGateB2bCount)
        .map((value) => value === null ? "n/a" : `${value > 0 ? "+" : ""}${value}`)
        .join(" / ");
      lines.push(`| ${FORMAT_LABELS[sessionType]} | ${scoreCells} | ${higher} / ${flat} / ${lower} | ${b2bCells} |`);
    }
  }
  lines.push(
    "",
    "## Per-format means across seeds",
    "",
    "| Policy | Gate metric | Format | Horizon score mean / median / min–max | Normalized entropy | C / O / P facet mean | Avg distinct C / O / P | Legacy relationship VCS | Pooled B2B rate (count / eligible) | Assignment rest mean / mean seed p95 | Max rest: mean of seed maxima / worst | Match-count min / max / spread mean | Seeds all players exactly 6 | Starvation changed / decisions; certified / unknown; rate | MIXED / OWN_SIDE completed |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---:|---|---|"
  );
  for (const row of report.perFormat) {
    const knownStarvation = row.starvation.changedPlayerSetsMean === null
      ? `${fixed(row.starvation.changedPlayerSetKnownLowerBoundMean)}+?`
      : fixed(row.starvation.changedPlayerSetsMean);
    lines.push(`| ${row.policyName} | ${row.matcherCoverageGainMetric} | ${row.format} | ${scorePercent(row.score.mean)} / ${scorePercent(row.score.median)} / ${scorePercent(row.score.min)}–${scorePercent(row.score.max)} | ${percent(row.normalizedEntropyMean)} | ${percent(row.facetMean.courtmates)} / ${percent(row.facetMean.opponents)} / ${percent(row.facetMean.partners)} | ${fixed(row.averageDistinctCount.courtmates)} / ${fixed(row.averageDistinctCount.opponents)} / ${fixed(row.averageDistinctCount.partners)} | ${percent(row.legacyRelationshipCoverageMean)} | ${percent(row.pooledBackToBack.rate)} (${row.pooledBackToBack.count} / ${row.pooledBackToBack.eligibleAssignments}) | ${fixed(row.assignmentRestMean)} / ${fixed(row.assignmentRestP95Mean)} | ${fixed(row.assignmentRestMaxMeanOfSeedMaxima)} / ${fixed(row.assignmentRestWorstSeedMaximum)} | ${fixed(row.completedMatchCountMean.min)} / ${fixed(row.completedMatchCountMean.max)} / ${fixed(row.completedMatchCountMean.spread)} | ${row.allFourteenExactlySixSeeds}/${row.seeds} | ${knownStarvation} / ${fixed(row.starvation.completedDecisionsMean)}; ${row.starvation.certifiedCounterfactualDecisions} / ${row.starvation.uncertifiedCounterfactualDecisions}; ${percent(row.starvation.rateMean)} | ${fixed(row.completedMatchTypeMean.MIXED, 1)} / ${fixed(row.completedMatchTypeMean.OWN_SIDE, 1)} |`);
  }
  lines.push("", "## Per-seed completed-match measurements", "", "Player count vectors are labeled by ID. Starvation uses completed rotation decisions; counterfactual rates are shown as n/a whenever any decision was uncertified. A known changed-player-set count under uncertainty is a lower bound, not a measured zero rate. The per-format B2B rate is pooled across eligible assignments: summed zero-rest assignments divided by summed post-first-match eligible assignments. The aggregate p95 is the mean of the per-seed assignment-rest p95 values; the reported worst maximum is the largest per-seed maximum.", "", "| Policy | Gate metric | Format | Completed | Seed | Horizon score | Normalized entropy | C / O / P | Avg distinct C / O / P | Legacy VCS | B2B count / eligible (rate) | Rest mean / p95 / max | Match count min–max (spread) | Player completed counts | Starvation known count / decisions; certified / unknown; rate | MIXED / OWN_SIDE |", "|---|---|---:|---:|---:|---:|---:|---|---|---:|---|---|---|---|---|---|");
  for (const row of report.perSeed) {
    const counts = row.completedMatchCounts.byPlayer.map(({ userId, matchesPlayed }) => `${userId}=${matchesPlayed}`).join(",");
    const knownChanges = row.starvation.changedPlayerSet === null
      ? `${row.starvation.changedPlayerSetKnownLowerBound}+?`
      : String(row.starvation.changedPlayerSet);
    lines.push(`| ${row.policyName} | ${row.matcherCoverageGainMetric} | ${row.format} | ${row.completedMatches} | ${row.seed} | ${scorePercent(row.score)} | ${percent(row.normalizedEntropyScore)} | ${percent(row.facetMean.courtmates)} / ${percent(row.facetMean.opponents)} / ${percent(row.facetMean.partners)} | ${fixed(row.averageDistinctCount.courtmates)} / ${fixed(row.averageDistinctCount.opponents)} / ${fixed(row.averageDistinctCount.partners)} | ${percent(row.legacyRelationshipCoverage)} | ${row.backToBackCount} / ${row.eligibleAssignments} (${percent(row.backToBackRate)}) | ${fixed(row.assignmentRestGap.mean)} / ${fixed(row.assignmentRestGap.p95)} / ${row.assignmentRestGap.max} | ${row.completedMatchCounts.min}–${row.completedMatchCounts.max} (${row.completedMatchCounts.spread}) | ${counts} | ${knownChanges} / ${row.starvation.completedDecisions}; ${row.starvation.certifiedCounterfactualDecisions} / ${row.starvation.uncertifiedCounterfactualDecisions}; ${percent(row.starvation.rate)} | ${row.completedMatchTypeCounts.MIXED} / ${row.completedMatchTypeCounts.OWN_SIDE} |`);
  }
  if (report.gateMetricDeltas.length) {
    const signedPoints = (value: number | null) => value === null ? "n/a" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`;
    const average = (values: Array<number | null>) => mean(values);
    lines.push(
      "",
      "## Legacy coverage gate versus horizon-321 gate at 21 completed matches",
      "",
      "Scores are compared on the same seed and format. Deltas are horizon-gate minus legacy-gate; the two VCS columns retain the previous uncapped, equal-weight relationship score. B2B is pooled over eligible assignments within each policy/format row.",
      "",
      "| Format | Legacy 3:2:1 score | Horizon-gate 3:2:1 score | Δ score | Legacy / horizon entropy | Δ entropy | Legacy / horizon VCS | Legacy B2B count / eligible | Horizon B2B count / eligible |",
      "|---|---:|---:|---:|---|---:|---|---|---|"
    );
    for (const sessionType of FORMAT_ORDER) {
      const rows = report.gateMetricDeltas.filter((row) => row.sessionType === sessionType);
      if (!rows.length) continue;
      const legacyB2b = rows.reduce((sum, row) => sum + row.legacyGateB2bCount, 0);
      const legacyEligible = rows.reduce((sum, row) => sum + row.legacyGateEligibleAssignments, 0);
      const horizonB2b = rows.reduce((sum, row) => sum + row.horizonGateB2bCount, 0);
      const horizonEligible = rows.reduce((sum, row) => sum + row.horizonGateEligibleAssignments, 0);
      lines.push(`| ${FORMAT_LABELS[sessionType]} | ${scorePercent(average(rows.map((row) => row.legacyGateScore)) ?? 0)} | ${scorePercent(average(rows.map((row) => row.horizonGateScore)) ?? 0)} | ${signedPoints(average(rows.map((row) => row.scoreDelta)))} | ${percent(average(rows.map((row) => row.legacyGateEntropy))) } / ${percent(average(rows.map((row) => row.horizonGateEntropy)))} | ${signedPoints(average(rows.map((row) => row.entropyDelta)))} | ${percent(average(rows.map((row) => row.legacyGateRelationshipVcs)))} / ${percent(average(rows.map((row) => row.horizonGateRelationshipVcs)))} | ${legacyB2b} / ${legacyEligible} | ${horizonB2b} / ${horizonEligible} |`);
    }
    lines.push(
      "",
      "### Paired per-seed gate comparison",
      "",
      "| Format | Seed | Legacy / horizon 3:2:1 score | Δ score | Legacy / horizon normalized entropy | Legacy / horizon VCS | Legacy min–max (spread) | Horizon min–max (spread) | Legacy MIXED / OWN_SIDE | Horizon MIXED / OWN_SIDE |",
      "|---|---:|---|---:|---|---|---|---|---|---|"
    );
    for (const row of report.gateMetricDeltas) {
      lines.push(`| ${row.format} | ${row.seed} | ${scorePercent(row.legacyGateScore)} / ${scorePercent(row.horizonGateScore)} | ${signedPoints(row.scoreDelta)} | ${percent(row.legacyGateEntropy)} / ${percent(row.horizonGateEntropy)} | ${percent(row.legacyGateRelationshipVcs)} / ${percent(row.horizonGateRelationshipVcs)} | ${row.legacyGateMatchCountRange.min}–${row.legacyGateMatchCountRange.max} (${row.legacyGateMatchCountRange.spread}) | ${row.horizonGateMatchCountRange.min}–${row.horizonGateMatchCountRange.max} (${row.horizonGateMatchCountRange.spread}) | ${row.legacyGateMatchTypes.MIXED} / ${row.legacyGateMatchTypes.OWN_SIDE} | ${row.horizonGateMatchTypes.MIXED} / ${row.horizonGateMatchTypes.OWN_SIDE} |`);
    }
  }
  lines.push("", "## Legacy 400-match secondary metrics", "", report.legacy400Secondary.sourceNote, "", "B2B is pooled across eligible post-first-match assignments. Rest p95 is the mean of per-seed p95 values; worst max is the maximum across seeds.", "", "| Policy | Format | Legacy relationship VCS | Partner / opponent / courtmate coverage | Normalized entropy | Pooled B2B count / eligible (rate) | Rest mean / mean seed p95 | Max rest: mean / worst | Match-count spread | Starvation changed / certified / unknown / rate | MIXED / OWN_SIDE completed | Last 100 MIXED / OWN_SIDE |", "|---|---|---:|---|---:|---|---|---|---:|---|---|---|");
  for (const row of report.legacy400Secondary.rows) {
    const starvationKnown = row.starvationChangedMean === null
      ? `${fixed(row.starvationChangedKnownLowerBoundMean)}+?`
      : fixed(row.starvationChangedMean);
    lines.push(`| ${row.policyName} | ${row.format} | ${percent(row.legacyRelationshipCoverageMean)} | ${percent(row.partnerCoverageMean)} / ${percent(row.opponentCoverageMean)} / ${percent(row.courtmateCoverageMean)} | ${percent(row.normalizedEntropyMean)} | ${row.pooledBackToBack.count} / ${row.pooledBackToBack.eligibleAssignments} (${percent(row.pooledBackToBack.rate)}) | ${fixed(row.assignmentRestMean)} / ${fixed(row.assignmentRestP95Mean)} | ${fixed(row.assignmentRestMaxMeanOfSeedMaxima)} / ${fixed(row.assignmentRestWorstSeedMaximum)} | ${fixed(row.matchCountSpreadMean)} | ${starvationKnown} / ${row.starvationCertifiedCounterfactualDecisions} / ${row.starvationUncertifiedCounterfactualDecisions} / ${percent(row.starvationRateMean)} | ${fixed(row.mixedMatchesMean, 1)} / ${fixed(row.ownSideMatchesMean, 1)} | ${fixed(row.last100MixedMatchesMean, 1)} / ${fixed(row.last100OwnSideMatchesMean, 1)} |`);
  }
  if (report.measured400HorizonVariant.length) {
    lines.push("", "## Horizon-gated variant at 400 completed matches", "", "This new 3:2:1 score and normalized Shannon entropy are independently summarized from its 400 completed tuples and remain separate from the legacy 400 metrics above. The legacy relationship VCS and partner/opponent/courtmate coverage use the uncapped structural ratios. Rest p95 is the mean of per-seed p95 values; worst max is the maximum over seeds. Exact per-seed unseen relationship IDs and their recorded policy-frontier classifications are retained in the JSON field `measured400HorizonMissingRelationships`.", "", "| Policy | Format | Horizon score mean | Normalized entropy | Legacy VCS | Legacy partner / opponent / courtmate coverage | Horizon C / O / P facet mean | Pooled B2B count / eligible (rate) | Assignment rest mean / mean seed p95 | Worst seed max rest | Match-count spread mean | Starvation changed / completed decisions; certified / unknown; rate | MIXED / OWN_SIDE mean | Last 100 MIXED / OWN_SIDE mean |", "|---|---|---:|---:|---:|---|---|---|---|---:|---:|---|---|---|");
    const policyName = report.measured400HorizonVariant[0].policyName;
    for (const sessionType of FORMAT_ORDER) {
      const rows = report.measured400HorizonVariant.filter((row) => row.sessionType === sessionType);
      if (!rows.length) continue;
      const totalB2B = rows.reduce((sum, row) => sum + row.backToBackCount, 0);
      const totalEligible = rows.reduce((sum, row) => sum + row.eligibleAssignments, 0);
      const changedKnown = rows.reduce((sum, row) => sum + row.starvation.changedPlayerSetKnownLowerBound, 0);
      const completedDecisions = rows.reduce((sum, row) => sum + row.starvation.completedDecisions, 0);
      const certified = rows.reduce((sum, row) => sum + row.starvation.certifiedCounterfactualDecisions, 0);
      const uncertified = rows.reduce((sum, row) => sum + row.starvation.uncertifiedCounterfactualDecisions, 0);
      const starvationRate = uncertified === 0 && completedDecisions > 0 ? changedKnown / completedDecisions : null;
      lines.push(`| ${policyName} | ${FORMAT_LABELS[sessionType]} | ${scorePercent(mean(rows.map((row) => row.score)) ?? 0)} | ${percent(mean(rows.map((row) => row.normalizedEntropyScore)))} | ${percent(mean(rows.map((row) => row.legacyRelationshipCoverage)))} | ${percent(mean(rows.map((row) => row.legacyFacetCoverage.partners)))} / ${percent(mean(rows.map((row) => row.legacyFacetCoverage.opponents)))} / ${percent(mean(rows.map((row) => row.legacyFacetCoverage.courtmates)))} | ${percent(mean(rows.map((row) => row.facetMean.courtmates)))} / ${percent(mean(rows.map((row) => row.facetMean.opponents)))} / ${percent(mean(rows.map((row) => row.facetMean.partners)))} | ${totalB2B} / ${totalEligible} (${percent(totalEligible ? totalB2B / totalEligible : null)}) | ${fixed(mean(rows.map((row) => row.assignmentRestGap.mean)))} / ${fixed(mean(rows.map((row) => row.assignmentRestGap.p95)))} | ${Math.max(...rows.map((row) => row.assignmentRestGap.max))} | ${fixed(mean(rows.map((row) => row.completedMatchCounts.spread)))} | ${uncertified > 0 ? `${changedKnown}+?` : String(changedKnown)} / ${completedDecisions}; ${certified} / ${uncertified}; ${percent(starvationRate)} | ${fixed(mean(rows.map((row) => row.completedMatchTypeCounts.MIXED)), 1)} / ${fixed(mean(rows.map((row) => row.completedMatchTypeCounts.OWN_SIDE)), 1)} | ${fixed(mean(rows.map((row) => row.last100CompletedMatchTypeCounts?.MIXED ?? null)), 1)} / ${fixed(mean(rows.map((row) => row.last100CompletedMatchTypeCounts?.OWN_SIDE ?? null)), 1)} |`);
    }
    lines.push("", "### Per-seed 400-match measurements", "", "The player-count column is explicit by ID. Coverage and entropy use only the 400 completed tuples; starvation uses completed optimizer decisions.", "", "| Format | Seed | Horizon score | Normalized entropy | Legacy VCS | Legacy partner / opponent / courtmate | Horizon C / O / P | B2B count / eligible (rate) | Rest mean / p95 / max | Match count min–max (spread) | Completed counts by player ID | Starvation known count / decisions; certified / unknown; rate | MIXED / OWN_SIDE | Last 100 MIXED / OWN_SIDE |", "|---|---:|---:|---:|---:|---|---|---|---|---|---|---|---|---|");
    for (const row of report.measured400HorizonVariant) {
      const counts = row.completedMatchCounts.byPlayer.map(({ userId, matchesPlayed }) => `${userId}=${matchesPlayed}`).join(",");
      const knownChanges = row.starvation.changedPlayerSet === null
        ? `${row.starvation.changedPlayerSetKnownLowerBound}+?`
        : String(row.starvation.changedPlayerSet);
      lines.push(`| ${row.format} | ${row.seed} | ${scorePercent(row.score)} | ${percent(row.normalizedEntropyScore)} | ${percent(row.legacyRelationshipCoverage)} | ${percent(row.legacyFacetCoverage.partners)} / ${percent(row.legacyFacetCoverage.opponents)} / ${percent(row.legacyFacetCoverage.courtmates)} | ${percent(row.facetMean.courtmates)} / ${percent(row.facetMean.opponents)} / ${percent(row.facetMean.partners)} | ${row.backToBackCount} / ${row.eligibleAssignments} (${percent(row.backToBackRate)}) | ${fixed(row.assignmentRestGap.mean)} / ${fixed(row.assignmentRestGap.p95)} / ${row.assignmentRestGap.max} | ${row.completedMatchCounts.min}–${row.completedMatchCounts.max} (${row.completedMatchCounts.spread}) | ${counts} | ${knownChanges} / ${row.starvation.completedDecisions}; ${row.starvation.certifiedCounterfactualDecisions} / ${row.starvation.uncertifiedCounterfactualDecisions}; ${percent(row.starvation.rate)} | ${row.completedMatchTypeCounts.MIXED} / ${row.completedMatchTypeCounts.OWN_SIDE} | ${row.last100CompletedMatchTypeCounts?.MIXED ?? "n/a"} / ${row.last100CompletedMatchTypeCounts?.OWN_SIDE ?? "n/a"} |`);
    }
  }
  lines.push("", "## Measurement provenance", "", "| Policy | Matcher policy | Source revision | Engine SHA-256 | Measurement harness SHA-256 | Run length |", "|---|---|---|---|---|---:|");
  for (const row of report.provenance) {
    lines.push(`| ${row.policyName} | ${row.enginePolicy} | ${row.sourceRevision} | ${row.engineSourceSha256 ?? "n/a"} | ${row.measurementHarnessSha256 ?? "n/a"} | ${row.targetMatches} |`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
