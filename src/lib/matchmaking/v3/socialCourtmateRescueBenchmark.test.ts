import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import { assertSocialCourtmateRescueCheckpoint } from "../../../../scripts/social-courtmate-rescue-validation.mjs";
import { runSocialHorizonCoverageBenchmark } from "./socialCoverageBenchmark";
import type { BenchmarkCheckpoint } from "./socialCoverageBenchmark";

const enabled = process.env.RUN_SOCIAL_COURTMATE_RESCUE_BENCHMARK === "1";
const fixedSeeds = [1, 4729, 104729, 130363, 2097593];
const userIds = Array.from({ length: 14 }, (_value, index) => `P${index + 1}`);
const feasibleTypes = ["MIXED", "OWN_SIDE"] as const;
type MatchType = (typeof feasibleTypes)[number];
type Policy = "baseline" | "strict" | "rescue";
type Layout = {
  completedMatchNumber: number;
  team1: readonly string[];
  team2: readonly string[];
  matchType: MatchType;
};
type Facet = "courtmates" | "partners" | "opponents";
type PlayerState = {
  types: MatchType[];
  courtmates: Set<string>;
  partners: Set<string>;
  opponents: Set<string>;
  counts: Record<Facet, Map<string, number>>;
};
type SavedReferenceReport = {
  validationStatus?: string;
  sessions: Array<{
    seed: number;
    sessionType: string;
    profile: string;
    completedHistory: Layout[];
    checkpoints: Record<string, unknown>;
  }>;
};
type RescueWitnessFixture = Record<string, unknown> & {
  gMaxCertified: boolean;
  chosenCourtmateGainDeficit: number;
  chosenRollingMatchTypeGain: number;
  incrementalTGainVsBestFullGainCandidate: number;
};
type RescueSummaryFixture = Record<string, unknown> & {
  startedDecisions: number;
  auditCompletedDecisions?: number;
  gMaxCertificationFailures: number;
  admissionFailures: number;
  searchLimitDecisions: number;
  incompleteAuditDecisions: number;
  witnesses: RescueWitnessFixture[];
  counterfactualStartedDecisions: number;
  counterfactualAuditCompletedDecisions: number;
  counterfactualCertifiedDecisions: number;
  counterfactualSearchLimitDecisions: number;
  counterfactualIncompleteAuditDecisions: number;
  completedChosenCourtmatePairSacrifice: number;
  completedOnePairSacrificesWithZeroTBenefit: number;
  completedIncrementalTGainVsBestFullGain: number;
};
type ValidatorFixture = {
  completedMatches: number;
  optimizer: { callsStarted: number; callsCompleted: number; counterfactualWrapperCalls: number; [key: string]: number };
  starvation: { decisionsWithOverdueAvailable: number; certifiedCounterfactualDecisions: number; completedRotationDecisions: number; uncertifiedCounterfactualDecisions: number };
  coverageGate: { policyApplied: boolean; [key: string]: boolean | number };
  replayEnvelope: { policyApplied: boolean; [key: string]: boolean | number };
  socialPriority?: Record<string, unknown>;
  socialCourtmateRescue?: RescueSummaryFixture;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join("|");
}

function bump(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function entropy(counts: Map<string, number>) {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  return -[...counts.values()].reduce((sum, value) => {
    const probability = value / total;
    return sum + probability * Math.log(probability);
  }, 0);
}

function createStates() {
  return new Map<string, PlayerState>(userIds.map((userId) => [userId, {
    types: [],
    courtmates: new Set(),
    partners: new Set(),
    opponents: new Set(),
    counts: { courtmates: new Map(), partners: new Map(), opponents: new Map() },
  }]));
}

function buildIndependent(layouts: readonly Layout[]) {
  const states = createStates();
  const courtPairs = new Set<string>();
  const partnerPairs = new Set<string>();
  const opponentPairs = new Set<string>();
  const matchTypeCounts = { MIXED: 0, OWN_SIDE: 0 };
  for (const [index, layout] of layouts.entries()) {
    assert(layout.completedMatchNumber === index + 1, `Layout ${index + 1} is out of chronology.`);
    const ids = [...layout.team1, ...layout.team2];
    assert(ids.length === 4 && new Set(ids).size === 4 && ids.every((id) => states.has(id)), `Layout ${index + 1} has invalid players.`);
    assert(layout.team1.length === 2 && layout.team2.length === 2, `Layout ${index + 1} does not have two doubles teams.`);
    const maleCountByTeam = [layout.team1, layout.team2].map((team) => team.filter((id) => Number(id.slice(1)) <= 7).length);
    const expectedType: MatchType = maleCountByTeam[0] === 1 && maleCountByTeam[1] === 1 ? "MIXED" : "OWN_SIDE";
    assert(maleCountByTeam[0] === maleCountByTeam[1] && expectedType === layout.matchType, `Layout ${index + 1} violates the fixed 7/7 format.`);
    matchTypeCounts[layout.matchType] += 1;
    const teams = [layout.team1, layout.team2] as const;
    for (const [teamIndex, team] of teams.entries()) {
      const peers = teams[1 - teamIndex];
      for (const userId of team) {
        const state = states.get(userId)!;
        state.types.push(layout.matchType);
        for (const peer of ids) {
          if (peer === userId) continue;
          state.courtmates.add(peer);
          bump(state.counts.courtmates, peer);
          courtPairs.add(pairKey(userId, peer));
        }
        const partner = team.find((id) => id !== userId)!;
        state.partners.add(partner);
        bump(state.counts.partners, partner);
        partnerPairs.add(pairKey(userId, partner));
        for (const opponent of peers) {
          state.opponents.add(opponent);
          bump(state.counts.opponents, opponent);
          opponentPairs.add(pairKey(userId, opponent));
        }
      }
    }
  }

  const players = userIds.map((userId) => {
    const state = states.get(userId)!;
    const latestSixTypes = [...new Set(state.types.slice(-6))];
    const missingTypeStreaks = Object.fromEntries(feasibleTypes.map((missingType) => {
      let current = 0;
      let longest = 0;
      for (const type of state.types) {
        current = type === missingType ? 0 : current + 1;
        longest = Math.max(longest, current);
      }
      return [missingType, { longest, trailing: current }];
    })) as Record<MatchType, { longest: number; trailing: number }>;
    const values = (facet: Facet, peers: Set<string>, vocabulary: number) => {
      const counts = state.counts[facet];
      return {
        distinct: peers.size,
        exposures: [...counts.values()].reduce((sum, value) => sum + value, 0),
        repeatedExposures: [...counts.values()].reduce((sum, value) => sum + value - 1, 0),
        maximumRepeat: Math.max(0, ...counts.values()),
        entropy: entropy(counts),
        structuralNormalizedEntropy: vocabulary > 1 ? entropy(counts) / Math.log(vocabulary) : 0,
      };
    };
    return {
      userId,
      completedMatches: state.types.length,
      distinctCourtmates: state.courtmates.size,
      courtmateCoverageFraction: state.courtmates.size / 13,
      distinctPartners: state.partners.size,
      distinctOpponents: state.opponents.size,
      latestSixMatchTypes: state.types.slice(-6),
      latestSixCoveredTypes: latestSixTypes,
      latestSixT: latestSixTypes.length / 2,
      latestSixTypeState: latestSixTypes.length === 2 ? "both" : latestSixTypes.length === 1 ? latestSixTypes[0] : "none",
      missingTypeStreaks,
      relationshipVariety: {
        courtmates: values("courtmates", state.courtmates, 13),
        partners: values("partners", state.partners, 13),
        opponents: values("opponents", state.opponents, 13),
      },
    };
  });
  // Checkpoint entropy is normalized per histogram's complete feasible
  // vocabulary: 13 relationship peers and both match types. Include zero
  // exposure players as zero-entropy entries, matching getCheckpoint.
  const relationshipEntropies = players.flatMap((player) => [
    player.relationshipVariety.courtmates,
    player.relationshipVariety.partners,
    player.relationshipVariety.opponents,
  ].map((facet) => facet.structuralNormalizedEntropy));
  const matchTypeEntropies = players.map((player) => {
    const counts = new Map<MatchType, number>();
    for (const type of states.get(player.userId)!.types) bump(counts, type);
    return entropy(counts) / Math.log(feasibleTypes.length);
  });
  const appearances = players.map((player) => player.completedMatches);
  const latestT = players.map((player) => player.latestSixT);
  const courtmateCounts = players.map((player) => player.distinctCourtmates);
  const partnerCounts = players.map((player) => player.distinctPartners);
  const opponentCounts = players.map((player) => player.distinctOpponents);
  return {
    completedMatches: layouts.length,
    globalMatchTypeCounts: matchTypeCounts,
    courtmateBreadth: {
      averageDistinctCourtmatesPerPlayer: mean(courtmateCounts),
      minimumDistinctCourtmatesPerPlayer: Math.min(...courtmateCounts),
      averageCoverageFraction: mean(courtmateCounts) / 13,
      worstPlayerCoverageFraction: Math.min(...courtmateCounts) / 13,
      fullyCoveredPlayers: courtmateCounts.filter((count) => count === 13).length,
      distinctUnorderedCourtPairCount: courtPairs.size,
      maximumPossibleUnorderedCourtPairCount: 91,
    },
    relationshipVariety: {
      averageDistinctPartnersPerPlayer: mean(partnerCounts),
      minimumDistinctPartnersPerPlayer: Math.min(...partnerCounts),
      averageDistinctOpponentsPerPlayer: mean(opponentCounts),
      minimumDistinctOpponentsPerPlayer: Math.min(...opponentCounts),
      distinctPartnerPairCount: partnerPairs.size,
      distinctOpponentPairCount: opponentPairs.size,
      averageStructuralNormalizedPartnerEntropy: mean(players.map((player) => player.relationshipVariety.partners.structuralNormalizedEntropy)),
      averageStructuralNormalizedOpponentEntropy: mean(players.map((player) => player.relationshipVariety.opponents.structuralNormalizedEntropy)),
    },
    fairness: {
      appearancesByPlayer: players.map(({ userId, completedMatches }) => ({ userId, completedMatches })),
      countSpread: Math.max(...appearances) - Math.min(...appearances),
      countHistogram: Object.fromEntries([...new Set(appearances)].sort().map((count) => [String(count), appearances.filter((value) => value === count).length])),
    },
    matchTypeCoverage: {
      latestSixMeanT: mean(latestT),
      latestSixBothTypeFraction: players.filter((player) => player.latestSixTypeState === "both").length / players.length,
      latestSixOneTypeFraction: players.filter((player) => player.latestSixTypeState === "MIXED" || player.latestSixTypeState === "OWN_SIDE").length / players.length,
      latestSixZeroTypeFraction: players.filter((player) => player.latestSixTypeState === "none").length / players.length,
      playersWithBothRecentTypes: players.filter((player) => player.latestSixTypeState === "both").length,
      playersWithOneRecentType: players.filter((player) => player.latestSixTypeState === "MIXED" || player.latestSixTypeState === "OWN_SIDE").length,
      playersWithNoRecentType: players.filter((player) => player.latestSixTypeState === "none").length,
    },
    entropyScores: {
      relationshipEntropy: mean(relationshipEntropies),
      matchTypeEntropy: mean(matchTypeEntropies),
      normalizedEntropy: mean([...relationshipEntropies, ...matchTypeEntropies]),
    },
    players,
  };
}

function countWindowTypes(layouts: readonly Layout[]) {
  return layouts.reduce((counts, layout) => {
    counts[layout.matchType === "MIXED" ? "mixedMatches" : "ownSideMatches"] += 1;
    return counts;
  }, { mixedMatches: 0, ownSideMatches: 0 });
}

function projectAgainstReference(actual: unknown, reference: unknown, path = "") : unknown {
  if (typeof actual === "number" && typeof reference === "number" &&
      (!Number.isInteger(actual) || !Number.isInteger(reference)) &&
      Math.abs(actual - reference) <= 8 * Number.EPSILON * Math.max(1, Math.abs(reference))) return reference;
  if (Array.isArray(reference)) {
    assert(Array.isArray(actual) && actual.length === reference.length, `Reference array shape differs at ${path}.`);
    return reference.map((value, index) => projectAgainstReference(actual[index], value, `${path}[${index}]`));
  }
  if (reference && typeof reference === "object") {
    assert(actual && typeof actual === "object" && !Array.isArray(actual), `Reference object is missing at ${path}.`);
    const omitted = new Set(["ordinaryProductionWallMs", "counterfactualWrapperWallMs"]);
    return Object.fromEntries(Object.entries(reference).filter(([key]) => !omitted.has(key)).map(([key, value]) => {
      assert(Object.hasOwn(actual, key), `Reference field ${path}.${key} is missing.`);
      return [key, projectAgainstReference((actual as Record<string, unknown>)[key], value, `${path}.${key}`)];
    }));
  }
  return actual;
}

function compareReference(session: { seed: number; completedHistory?: Layout[]; checkpoints: Record<string, BenchmarkCheckpoint> }, referenceReport: SavedReferenceReport, targetMatches: number, policy: Policy) {
  const reference = referenceReport.sessions.find((row) => row.seed === session.seed && row.sessionType === "SOCIAL_MIX" && row.profile === "narrow");
  assert(reference, `No frozen ${policy} reference session for seed ${session.seed}.`);
  expect(session.completedHistory!.slice(0, targetMatches), `${policy} seed ${session.seed}: layouts differ from the prior validated run.`)
    .toEqual(reference.completedHistory.slice(0, targetMatches));
  for (const horizon of new Set([21, targetMatches])) {
    const actual = JSON.parse(JSON.stringify(session.checkpoints[String(horizon)])) as unknown;
    const expected = reference.checkpoints[String(horizon)];
    expect(projectAgainstReference(actual, expected), `${policy} seed ${session.seed} checkpoint ${horizon} differs from the prior validated run.`)
      .toEqual(projectAgainstReference(expected, expected));
  }
  return { policy, seed: session.seed, comparedCompletedMatches: targetMatches, checkpoints: [...new Set([21, targetMatches])] };
}

function summarizeSession(session: {
  seed: number;
  sessionType: string;
  policy: Policy;
  completedHistory?: Layout[];
  checkpoints: Record<string, BenchmarkCheckpoint>;
}, targetMatches: number) {
  const layouts = session.completedHistory;
  assert(layouts?.length === targetMatches, `Seed ${session.seed}: expected ${targetMatches} completed layouts.`);
  const prefixTrajectory = [];
  for (let index = 1; index <= targetMatches; index += 1) {
    const prefix = buildIndependent(layouts.slice(0, index));
    prefixTrajectory.push({
      completedMatches: index,
      meanT: prefix.matchTypeCoverage.latestSixMeanT,
      fullTPlayers: prefix.matchTypeCoverage.playersWithBothRecentTypes,
      courtmatePairCount: prefix.courtmateBreadth.distinctUnorderedCourtPairCount,
      meanCourtmateCoverage: prefix.courtmateBreadth.averageCoverageFraction,
    });
  }
  const checkpoints = Object.fromEntries([...new Set([21, targetMatches])].map((horizon) => {
    const independent = buildIndependent(layouts.slice(0, horizon));
    const raw = session.checkpoints[String(horizon)];
    assert(raw?.completedMatches === horizon, `Seed ${session.seed}: missing checkpoint ${horizon}.`);
    const rawCounts = raw.playerMatchCounts.map((row) => ({ userId: row.userId, completedMatches: row.matchesPlayed })).sort((a, b) => a.userId.localeCompare(b.userId));
    expect(rawCounts).toEqual([...independent.fairness.appearancesByPlayer].sort((a, b) => a.userId.localeCompare(b.userId)));
    expect(raw.matchCountSpread).toBe(independent.fairness.countSpread);
    expect(raw.completedMatchTypeCounts).toEqual({ MIXED: independent.globalMatchTypeCounts.MIXED, OWN_SIDE: independent.globalMatchTypeCounts.OWN_SIDE });
    expect(raw.courtmateCoverage).toBeCloseTo(independent.courtmateBreadth.averageCoverageFraction, 12);
    expect(raw.socialHorizon321?.averageDistinctCount.courtmates).toBeCloseTo(independent.courtmateBreadth.averageDistinctCourtmatesPerPlayer, 12);
    expect(raw.socialHorizon321?.averageDistinctCount.partners).toBeCloseTo(independent.relationshipVariety.averageDistinctPartnersPerPlayer, 12);
    expect(raw.socialHorizon321?.averageDistinctCount.opponents).toBeCloseTo(independent.relationshipVariety.averageDistinctOpponentsPerPlayer, 12);
    const raw321Players = new Map(raw.socialHorizon321?.players.map((player) => [player.userId, player]));
    for (const player of independent.players) {
      const rawPlayer = raw321Players.get(player.userId);
      expect(rawPlayer?.facets.courtmates.uniqueCount).toBe(player.distinctCourtmates);
      expect(rawPlayer?.facets.partners.uniqueCount).toBe(player.distinctPartners);
      expect(rawPlayer?.facets.opponents.uniqueCount).toBe(player.distinctOpponents);
    }
    expect(raw.socialVariety3211?.meanT).toBeCloseTo(independent.matchTypeCoverage.latestSixMeanT, 12);
    expect(raw.socialVariety3211?.fullTypeCoverageFraction).toBeCloseTo(independent.matchTypeCoverage.latestSixBothTypeFraction, 12);
    expect(raw.socialVariety3211?.halfTypeCoverageFraction).toBeCloseTo(independent.matchTypeCoverage.latestSixOneTypeFraction, 12);
    const rawRollingPlayers = new Map(raw.socialVariety3211?.players.map((player) => [player.userId, player]));
    for (const player of independent.players) expect(rawRollingPlayers.get(player.userId)?.T).toBeCloseTo(player.latestSixT, 12);
    expect(raw.relationshipEntropyScore).toBeCloseTo(independent.entropyScores.relationshipEntropy, 12);
    expect(raw.matchTypeEntropyScore).toBeCloseTo(independent.entropyScores.matchTypeEntropy, 12);
    expect(raw.normalizedEntropyScore).toBeCloseTo(independent.entropyScores.normalizedEntropy, 12);
    expect(independent.matchTypeCoverage.playersWithBothRecentTypes + independent.matchTypeCoverage.playersWithOneRecentType + independent.matchTypeCoverage.playersWithNoRecentType).toBe(14);
    const globalGap = Math.max(0, ...independent.players.flatMap((player) => {
      const appearances = layouts.slice(0, horizon).filter((layout) => [...layout.team1, ...layout.team2].includes(player.userId)).map((layout) => layout.completedMatchNumber);
      return appearances.slice(1).map((number, index) => number - appearances[index] - 1);
    }));
    expect(raw.betweenOwnCompletionEventGap.max).toBe(globalGap);
    if (session.policy === "baseline") {
      expect(raw.socialPriority).toBeUndefined();
      expect(raw.socialCourtmateRescue).toBeUndefined();
    } else if (session.policy === "strict") {
      expect(raw.socialPriority).toBeDefined();
      expect(raw.socialCourtmateRescue).toBeUndefined();
    } else {
      expect(raw.socialPriority).toBeUndefined();
      expect(raw.socialCourtmateRescue).toBeDefined();
    }
    assertSocialCourtmateRescueCheckpoint(raw, session.policy, `seed-${session.seed}/${horizon}`);
    return [String(horizon), {
      independent,
      rawCheckpoint: {
        assignmentRestGap: raw.assignmentRestGap,
        betweenOwnCompletionEventGap: raw.betweenOwnCompletionEventGap,
        backToBack: raw.backToBack,
        starvation: raw.starvation,
        optimizer: raw.optimizer,
        coverageGate: raw.coverageGate,
        replayEnvelope: raw.replayEnvelope,
        socialPriority: raw.socialPriority ?? null,
        socialCourtmateRescue: raw.socialCourtmateRescue ?? null,
        maximumFairnessSpread: raw.maximumFairnessSpread,
        minimumFairnessSpread: raw.minimumFairnessSpread,
        maximumBalanceGap: raw.maximumBalanceGap,
        reachedIdealPlusOne: raw.reachedIdealPlusOne,
        reachedIdealPlusTwo: raw.reachedIdealPlusTwo,
      },
      finalWindowMatchTypeCounts: {
        last25: countWindowTypes(layouts.slice(0, horizon).slice(-Math.min(25, horizon))),
        last50: countWindowTypes(layouts.slice(0, horizon).slice(-Math.min(50, horizon))),
        last100: countWindowTypes(layouts.slice(0, horizon).slice(-Math.min(100, horizon))),
      },
    }];
  }));
  const finalTypes = checkpoints[String(targetMatches)].finalWindowMatchTypeCounts;
  const lateT = prefixTrajectory.filter((row) => row.completedMatches >= 76 && row.completedMatches <= 100).map((row) => row.meanT);
  return {
    seed: session.seed,
    sessionType: session.sessionType,
    targetMatches,
    checkpoints,
    final25GlobalMatchTypeCounts: finalTypes.last25,
    final50GlobalMatchTypeCounts: finalTypes.last50,
    final100GlobalMatchTypeCounts: finalTypes.last100,
    meanTOverEvents76To100: lateT.length ? mean(lateT) : null,
    prefixTrajectory,
  };
}

function writeAtomically(filePath: string, contents: string) {
  const writingPath = `${filePath}.writing`;
  writeFileSync(writingPath, contents, { encoding: "utf8", flag: "wx" });
  renameSync(writingPath, filePath);
  // The runner owns the final passed marker after it rechecks frozen hashes.
}

function validatorFixture(policy: Policy): ValidatorFixture {
  const optimizer = {
    callsStarted: 21,
    counterfactualWrapperCalls: 5,
    searchLimitCalls: 0,
    incompleteCounterfactualCalls: 0,
    fairnessCertificateFailures: 0,
    starvationCertificateFailures: 0,
    balanceCertificateFailures: 0,
  };
  const starvation = { uncertifiedCounterfactualDecisions: 0, decisionsWithOverdueAvailable: 4, certifiedCounterfactualDecisions: 4 };
  const disabledCoverage = {
    policyApplied: false, refillDecisions: 0, certifiedDecisions: 0, uncertifiedDecisions: 0,
    noStarvationRefillDecisions: 0, noStarvationCertifiedDecisions: 0, noStarvationUncertifiedDecisions: 0,
  };
  const disabledReplay = {
    policyApplied: false, productionRefillDecisions: 0, productionReplayEnvelopeCertifiedDecisions: 0,
    productionCertifiedDecisions: 0, productionUncertifiedDecisions: 0, noStarvationRefillDecisions: 0,
    noStarvationReplayEnvelopeCertifiedDecisions: 0, noStarvationCertifiedDecisions: 0, noStarvationUncertifiedDecisions: 0,
  };
  const checkpoint: ValidatorFixture = {
    completedMatches: 21,
    optimizer: { ...optimizer, callsCompleted: 20 },
    starvation: { ...starvation, completedRotationDecisions: 20 },
    coverageGate: structuredClone(disabledCoverage), replayEnvelope: structuredClone(disabledReplay),
  };
  if (policy === "strict") checkpoint.socialPriority = {
    policyApplied: true, objectiveDecisions: 21, objectiveCertifiedDecisions: 21, objectiveUncertifiedDecisions: 0,
    rankingDiscrepancies: 0, fairnessCertificateFailures: 0, starvationSafetyFailures: 0, searchLimitDecisions: 0,
    incompleteCounterfactualDecisions: 0, coverageGateStatus: "DISABLED", replayEnvelopeStatus: "DISABLED",
    counterfactualAuditDecisions: 5, counterfactualCertifiedDecisions: 5, counterfactualUncertifiedDecisions: 0,
    counterfactualRankingDiscrepancies: 0, counterfactualFairnessCertificateFailures: 0,
    counterfactualSearchLimitDecisions: 0, counterfactualIncompleteDecisions: 0,
  };
  if (policy === "rescue") checkpoint.socialCourtmateRescue = {
    policyApplied: true, coverageGateStatus: "DISABLED", replayEnvelopeStatus: "DISABLED",
    startedDecisions: 21, completedDecisions: 20, auditCompletedDecisions: 21, certifiedDecisions: 21,
    uncertifiedDecisions: 0, rankingDiscrepancies: 0, fairnessCertificateFailures: 0,
    starvationSafetyFailures: 0, gMaxCertificationFailures: 0, admissionFailures: 0,
    searchLimitDecisions: 0, incompleteAuditDecisions: 0,
    completedChosenCourtmatePairSacrifice: 0, completedOnePairSacrifices: 0,
    completedOnePairSacrificesWithPositiveTBenefit: 0, completedOnePairSacrificesWithZeroTBenefit: 0,
    completedOnePairSacrificesWithNegativeTBenefit: 0, completedSignedRollingTGain: 60,
    completedBestGmaxSignedRollingTGain: 60, completedIncrementalTGainVsBestFullGain: 0,
    completedTGainDenominator: "sum of per-player T change per completed decision",
    counterfactualStartedDecisions: 5, counterfactualAuditCompletedDecisions: 5,
    counterfactualCertifiedDecisions: 5, counterfactualUncertifiedDecisions: 0,
    counterfactualRankingDiscrepancies: 0, counterfactualFairnessCertificateFailures: 0,
    counterfactualGMaxCertificationFailures: 0, counterfactualAdmissionFailures: 0, counterfactualSearchLimitDecisions: 0,
    counterfactualIncompleteAuditDecisions: 0,
    witnesses: Array.from({ length: 21 }, (_row, index) => ({
      started: true, completed: index < 20, completedAfterMatchNumber: index < 20 ? index + 1 : null,
      auditCompleted: true, counterfactual: false, respectStarvation: true,
      fairnessCertified: true, starvationCertified: true, gMaxCertified: true, policyCertified: true,
      rankingMatches: true, courtmateCoverageProfileMatches: true, searchLimitReached: false, courtMateGainMaximum: 4, chosenCourtmateGain: 4,
      chosenCourtmateGainDeficit: 0, bestRollingMatchTypeGainAtGmax: 3, chosenRollingMatchTypeGain: 3,
      incrementalTGainVsBestFullGainCandidate: 0, rollingTypeGainDenominator: "sum of all players' T change",
      courtCount: 1, selectedCourts: [{}], bestGmaxCourts: [{}], independentCandidateCount: 8, admittedCandidateCount: 4,
      selectedCourtmateCoverageProfile: userIds.map((userId) => ({ userId, covered: 4, possible: 13 })),
      engineCourtmateCoverageProfile: userIds.map((userId) => ({ userId, covered: 4, possible: 13 })),
      bestGmaxFullTypePlayerCount: 4, chosenFullTypePlayerCount: 4, fullTypePlayerCountDeltaVsGmax: 0,
      zeroTBenefitSacrifice: false, perPlayerTypeWindows: [],
    })),
    counterfactualWitnesses: Array.from({ length: 5 }, () => ({
      started: true, completed: null, completedAfterMatchNumber: null, auditCompleted: true,
      counterfactual: true, respectStarvation: false,
      fairnessCertified: true, starvationCertified: true, gMaxCertified: true, policyCertified: true,
      rankingMatches: true, courtmateCoverageProfileMatches: true, searchLimitReached: false, courtMateGainMaximum: 4, chosenCourtmateGain: 4,
      chosenCourtmateGainDeficit: 0, bestRollingMatchTypeGainAtGmax: 3, chosenRollingMatchTypeGain: 3,
      incrementalTGainVsBestFullGainCandidate: 0, rollingTypeGainDenominator: "sum of all players' T change",
      courtCount: 1, selectedCourts: [{}], bestGmaxCourts: [{}], independentCandidateCount: 8, admittedCandidateCount: 4,
      selectedCourtmateCoverageProfile: userIds.map((userId) => ({ userId, covered: 4, possible: 13 })),
      engineCourtmateCoverageProfile: userIds.map((userId) => ({ userId, covered: 4, possible: 13 })),
      bestGmaxFullTypePlayerCount: 4, chosenFullTypePlayerCount: 4, fullTypePlayerCountDeltaVsGmax: 0,
      zeroTBenefitSacrifice: false, perPlayerTypeWindows: [],
    })),
  };
  if (policy === "baseline") {
    checkpoint.coverageGate = {
      policyApplied: true, refillDecisions: 20, certifiedDecisions: 20, uncertifiedDecisions: 0,
      noStarvationRefillDecisions: 20, noStarvationCertifiedDecisions: 20, noStarvationUncertifiedDecisions: 0,
    };
    checkpoint.replayEnvelope = {
      policyApplied: true, productionRefillDecisions: 20, productionReplayEnvelopeCertifiedDecisions: 20,
      productionCertifiedDecisions: 20, productionUncertifiedDecisions: 0, noStarvationRefillDecisions: 20,
      noStarvationReplayEnvelopeCertifiedDecisions: 20, noStarvationCertifiedDecisions: 20, noStarvationUncertifiedDecisions: 0,
    };
  }
  return checkpoint;
}

describe("Social courtmate-rescue strict validator", () => {
  it("accepts baseline, strict, and near-best checkpoints only with complete, matching certificates", () => {
    for (const policy of ["baseline", "strict", "rescue"] as const) {
      expect(assertSocialCourtmateRescueCheckpoint(validatorFixture(policy), policy)).toBe(true);
    }
  });

  it("rejects missing, zero, incomplete, failed, or policy-mismatched rescue audits", () => {
    const mutations: Array<(checkpoint: ValidatorFixture) => void> = [
      (checkpoint) => { delete checkpoint.socialCourtmateRescue; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.startedDecisions = 0; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.startedDecisions = 1; },
      (checkpoint) => { delete checkpoint.socialCourtmateRescue!.auditCompletedDecisions; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.gMaxCertificationFailures = 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.admissionFailures = 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].gMaxCertified = false; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].courtmateCoverageProfileMatches = false; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].chosenCourtmateGain = 7; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].courtMateGainMaximum = -1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].chosenCourtmateGainDeficit = 0.5; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.witnesses[0].chosenRollingMatchTypeGain = 2; checkpoint.socialCourtmateRescue!.witnesses[0].incrementalTGainVsBestFullGainCandidate = -1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.searchLimitDecisions = 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.incompleteAuditDecisions = 1; },
      (checkpoint) => { Reflect.deleteProperty(checkpoint.socialCourtmateRescue!, "completedChosenCourtmatePairSacrifice"); },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.completedOnePairSacrificesWithZeroTBenefit = 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.completedIncrementalTGainVsBestFullGain += 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.counterfactualStartedDecisions = 4; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.counterfactualCertifiedDecisions = 4; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.counterfactualAdmissionFailures = 1; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.counterfactualAdmissionFailures = 1; },
      (checkpoint) => { checkpoint.coverageGate.policyApplied = true; },
      (checkpoint) => { checkpoint.socialCourtmateRescue!.policyApplied = false; },
      (checkpoint) => { checkpoint.socialPriority = {}; },
    ];
    for (const mutate of mutations) {
      const checkpoint = validatorFixture("rescue");
      mutate(checkpoint);
      expect(() => assertSocialCourtmateRescueCheckpoint(checkpoint, "rescue")).toThrow();
    }
  });

  it("separates the started overdue wrapper cohort from completed-overdue decisions", () => {
    const checkpoint = validatorFixture("rescue");
    checkpoint.optimizer.counterfactualWrapperCalls = 7;
    checkpoint.socialCourtmateRescue!.counterfactualStartedDecisions = 7;
    checkpoint.socialCourtmateRescue!.counterfactualAuditCompletedDecisions = 7;
    checkpoint.socialCourtmateRescue!.counterfactualCertifiedDecisions = 7;
    checkpoint.socialCourtmateRescue!.counterfactualWitnesses = Array.from({ length: 7 }, () =>
      structuredClone((checkpoint.socialCourtmateRescue!.counterfactualWitnesses as RescueWitnessFixture[])[0]!));
    checkpoint.starvation.decisionsWithOverdueAvailable = 6;
    checkpoint.starvation.certifiedCounterfactualDecisions = 6;
    expect(assertSocialCourtmateRescueCheckpoint(checkpoint, "rescue")).toBe(true);
    checkpoint.socialCourtmateRescue!.counterfactualStartedDecisions = 6;
    expect(() => assertSocialCourtmateRescueCheckpoint(checkpoint, "rescue")).toThrow();
  });
});

describe("Social courtmate-rescue benchmark", () => {
  it.skipIf(!enabled)("independently measures certified courtmate rescue and compares unchanged arms to frozen layouts", () => {
    const seeds = process.env.BENCHMARK_RESCUE_SEEDS?.split(",").map((value) => Number(value.trim())) ?? fixedSeeds;
    const targetMatches = Number(process.env.BENCHMARK_RESCUE_TARGET_MATCHES ?? "100");
    const policy = process.env.BENCHMARK_RESCUE_POLICY as Policy | undefined;
    assert(policy === "baseline" || policy === "strict" || policy === "rescue", "Rescue benchmark policy must be baseline, strict, or rescue.");
    assert(targetMatches === 21 || targetMatches === 100, "Rescue benchmark must stop at 21 or 100 completed matches.");
    assert(targetMatches <= 100 && seeds.length > 0 && new Set(seeds).size === seeds.length, "Invalid rescue benchmark horizon or seeds.");
    const sourceRevision = process.env.BENCHMARK_RESCUE_SOURCE_REVISION ?? "recorded by runner";
    const sourceProvenance = process.env.BENCHMARK_RESCUE_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_RESCUE_SOURCE_PROVENANCE)
      : undefined;
    const outputPath = process.env.BENCHMARK_RESCUE_OUTPUT_JSON;
    assert(outputPath, "The rescue runner must provide an output JSON path.");
    const absolutePath = resolve(outputPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(`${absolutePath}.pending`, JSON.stringify({ validationStatus: "pending", policy, seeds, targetMatches }), { encoding: "utf8", flag: "wx" });

    const report = runSocialHorizonCoverageBenchmark({
      seeds,
      enginePolicy: "current",
      sourceRevision,
      sourceProvenance,
      targetMatches,
      sessionTypes: [SessionType.SOCIAL_MIX],
      socialPriorityPolicy: policy === "baseline" ? "production" : policy === "strict" ? "courtmate-first" : "courtmate-near-best",
    });
    expect(report.enginePolicy).toBe("current");
    expect(report.targetMatches).toBe(targetMatches);
    expect(report.seeds).toEqual(seeds);
    expect(report.socialPriorityPolicy).toBe(policy === "baseline" ? undefined : policy === "strict" ? "courtmate-first" : "courtmate-near-best");
    expect(report.sessions).toHaveLength(seeds.length);
    expect(report.sessions.every((session) => session.profile === "narrow" && session.sessionType === SessionType.SOCIAL_MIX)).toBe(true);

    const references = {
      baseline: process.env.BENCHMARK_RESCUE_REFERENCE_BASELINE_JSON,
      strict: process.env.BENCHMARK_RESCUE_REFERENCE_STRICT_JSON,
    };
    const referenceReports: Partial<Record<"baseline" | "strict", SavedReferenceReport>> = {};
    for (const key of ["baseline", "strict"] as const) {
      const referencePath = references[key];
      if (referencePath) referenceReports[key] = JSON.parse(readFileSync(referencePath, "utf8")) as SavedReferenceReport;
    }
    const referenceComparisons = [];
    const analyses = [];
    for (const session of report.sessions) {
      expect(session.completedHistory).toHaveLength(targetMatches);
      for (const [index, layout] of (session.completedHistory as Layout[]).entries()) {
        expect(layout.completedMatchNumber).toBe(index + 1);
        const ids = [...layout.team1, ...layout.team2];
        expect(ids).toHaveLength(4);
        expect(ids.every((id) => /^P(?:[1-9]|1[0-4])$/.test(id))).toBe(true);
      }
      if (policy !== "rescue") {
        const reference = referenceReports[policy];
        assert(reference?.validationStatus === "passed", `Frozen ${policy} report is unavailable or unvalidated.`);
        referenceComparisons.push(compareReference(session, reference, targetMatches, policy));
      }
      analyses.push(summarizeSession({ ...session, policy }, targetMatches));
    }
    const analysis = {
      policy,
      policyLabel: sourceProvenance?.policyLabel ?? policy,
      socialPriorityPolicy: policy === "baseline" ? "production" : policy === "strict" ? "courtmate-first" : "courtmate-near-best",
      seeds,
      targetMatches,
      sessionTypes: ["SOCIAL_MIX"],
      definitions: {
        courtmatePairs: "Unique unordered pairs that shared any completed court; a match creates six undirected courtmate pairs, and structural maximum is 91.",
        recentT: "For each player, distinct feasible match types among the six latest completed personal appearances divided by two structurally feasible types.",
        strictGap: "Completed matches strictly between two own appearances; never wall-clock time.",
        rescueEnvelope: "The rescue policy may give up at most one Gmax courtmate pair at a decision; rolling-type gain is a signed, completed-only change in the sum of player T values.",
        finiteRun: "A finite 21/100-match run can show an observed type absence and recovery but cannot prove permanent extinction.",
      },
      frozenReferenceComparisons: referenceComparisons,
      sessions: analyses,
    };
    const finalReport = {
      ...report,
      socialCourtmateRescuePolicy: policy,
      validationStatus: "pending" as const,
      courtmateRescueAnalysis: analysis,
    };
    writeAtomically(absolutePath, `${JSON.stringify(finalReport, null, 2)}\n`);
  }, 1_800_000);
});
