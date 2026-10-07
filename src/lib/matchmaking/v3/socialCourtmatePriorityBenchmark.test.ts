import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import { assertSocialCourtmatePriorityCheckpoint } from "../../../../scripts/social-courtmate-priority-validation.mjs";
import { runSocialHorizonCoverageBenchmark } from "./socialCoverageBenchmark";
import type { BenchmarkCheckpoint } from "./socialCoverageBenchmark";

const enabled = process.env.RUN_SOCIAL_COURTMATE_PRIORITY_BENCHMARK === "1";
const defaultSeeds = [1, 4729, 104729, 130363, 2097593];
const playerIds = Array.from({ length: 14 }, (_value, index) => `P${index + 1}`);
const feasibleTypes = ["MIXED", "OWN_SIDE"] as const;
type MatchType = (typeof feasibleTypes)[number];
type Policy = "baseline" | "candidate";
type Layout = {
  completedMatchNumber: number;
  team1: readonly string[];
  team2: readonly string[];
  matchType: MatchType;
};
type Facet = "courtmates" | "partners" | "opponents";
type PlayerState = {
  courtmates: Set<string>;
  partners: Set<string>;
  opponents: Set<string>;
  counts: Record<Facet, Map<string, number>>;
  appearances: Layout[];
  firstFullCourtEvent: number | null;
};

function parseSeeds(raw: string | undefined) {
  const parsed = !raw?.trim() ? defaultSeeds : raw.split(",").map((value) => Number(value.trim()));
  if (parsed.length === 0 || parsed.some((seed) => !Number.isSafeInteger(seed)) || new Set(parsed).size !== parsed.length) {
    throw new Error("Courtmate-priority seeds must be unique safe integers.");
  }
  return parsed;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function emptyCounts(): Record<Facet, Map<string, number>> {
  return { courtmates: new Map(), partners: new Map(), opponents: new Map() };
}

function createStates() {
  return new Map(playerIds.map((userId) => [userId, {
    courtmates: new Set<string>(),
    partners: new Set<string>(),
    opponents: new Set<string>(),
    counts: emptyCounts(),
    appearances: [] as Layout[],
    firstFullCourtEvent: null as number | null,
  }]));
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function bump(counts: Map<string, number>, id: string) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shannonEntropy(counts: Map<string, number>) {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  return -[...counts.values()].reduce((sum, value) => {
    const probability = value / total;
    return sum + probability * Math.log(probability);
  }, 0);
}

function normalizedEntropy(counts: Map<string, number>) {
  return counts.size <= 1 ? 0 : shannonEntropy(counts) / Math.log(counts.size);
}

function structuralNormalizedEntropy(counts: Map<string, number>) {
  return shannonEntropy(counts) / Math.log(13);
}

function addLayout(states: Map<string, PlayerState>, pairs: Set<string>, layout: Layout, index: number) {
  const ids = [...layout.team1, ...layout.team2];
  assert(layout.completedMatchNumber === index + 1, `Completed layout ${index + 1} is out of order.`);
  assert(layout.team1.length === 2 && layout.team2.length === 2 && ids.length === 4 && new Set(ids).size === 4,
    `Completed layout ${index + 1} does not contain four unique players.`);
  assert(ids.every((id) => states.has(id)), `Completed layout ${index + 1} contains an unknown player.`);
  const upperByTeam = [layout.team1, layout.team2].map((team) => team.filter((id) => Number(id.slice(1)) <= 7).length);
  const expectedType: MatchType = upperByTeam[0] === 1 && upperByTeam[1] === 1 ? "MIXED" : "OWN_SIDE";
  assert(upperByTeam[0] === upperByTeam[1] && layout.matchType === expectedType,
    `Completed layout ${index + 1} violates the fixed 7/7 match-type structure.`);

  const teams = [layout.team1, layout.team2] as const;
  for (const [teamIndex, team] of teams.entries()) {
    const opponents = teams[1 - teamIndex];
    for (const userId of team) {
      const state = states.get(userId)!;
      const courtmates = ids.filter((id) => id !== userId);
      const partner = team.find((id) => id !== userId)!;
      state.appearances.push(layout);
      for (const peer of courtmates) {
        state.courtmates.add(peer);
        bump(state.counts.courtmates, peer);
        pairs.add(pairKey(userId, peer));
      }
      state.partners.add(partner);
      bump(state.counts.partners, partner);
      for (const opponent of opponents) {
        state.opponents.add(opponent);
        bump(state.counts.opponents, opponent);
      }
      if (state.courtmates.size === 13 && state.firstFullCourtEvent === null) state.firstFullCourtEvent = index + 1;
    }
  }
}

function buildCheckpoint(layouts: readonly Layout[]) {
  const states = createStates();
  const pairs = new Set<string>();
  const matchTypeCounts = { MIXED: 0, OWN_SIDE: 0 };
  layouts.forEach((layout, index) => {
    addLayout(states, pairs, layout, index);
    matchTypeCounts[layout.matchType] += 1;
  });
  const players = playerIds.map((userId) => {
    const state = states.get(userId)!;
    const recent = state.appearances.slice(-6);
    const recentTypes = [...new Set(recent.map((row) => row.matchType))];
    const absentStreaks = Object.fromEntries(feasibleTypes.map((type) => {
      let current = 0;
      let longest = 0;
      for (const appearance of state.appearances) {
        current = appearance.matchType === type ? 0 : current + 1;
        longest = Math.max(longest, current);
      }
      return [type, {
        longestConsecutiveOppositeTypeAppearances: longest,
        trailingConsecutiveOppositeTypeAppearances: current,
      }];
    })) as Record<MatchType, { longestConsecutiveOppositeTypeAppearances: number; trailingConsecutiveOppositeTypeAppearances: number }>;
    const ownGaps = state.appearances.slice(1).map((row, index) => row.completedMatchNumber - state.appearances[index].completedMatchNumber - 1);
    const stats = (facet: Facet, relationships: Set<string>) => ({
      distinct: relationships.size,
      exposures: [...state.counts[facet].values()].reduce((sum, value) => sum + value, 0),
      repeatedExposures: [...state.counts[facet].values()].reduce((sum, value) => sum + value - 1, 0),
      entropy: shannonEntropy(state.counts[facet]),
      observedRelationshipEvenness: normalizedEntropy(state.counts[facet]),
      structuralNormalizedEntropy: structuralNormalizedEntropy(state.counts[facet]),
      maximumRepeat: Math.max(0, ...state.counts[facet].values()),
    });
    const court = stats("courtmates", state.courtmates);
    const partners = stats("partners", state.partners);
    const opponents = stats("opponents", state.opponents);
    return {
      userId,
      completedMatches: state.appearances.length,
      distinctCourtmates: court.distinct,
      courtmateCoverageFraction: court.distinct / 13,
      distinctPartners: partners.distinct,
      distinctOpponents: opponents.distinct,
      latestSixMatchTypes: recent.map((row) => row.matchType),
      latestSixCoveredTypes: recentTypes,
      latestSixT: recentTypes.length / feasibleTypes.length,
      latestSixSingleType: recentTypes.length === 1,
      latestSixTypeState: recentTypes.length === 2 ? "both" : recentTypes.length === 1 ? recentTypes[0] : "none",
      lifetimeMatchTypes: [...new Set(state.appearances.map((row) => row.matchType))],
      absenceStreaksByMissingType: absentStreaks,
      maximumGlobalCompletedMatchesBetweenAppearances: Math.max(0, ...ownGaps),
      trailingGlobalCompletedMatchesBetweenAppearances: ownGaps.at(-1) ?? null,
      firstFullCourtCoverageAtCompletedMatch: state.firstFullCourtEvent,
      relationships: { courtmates: court, partners, opponents },
    };
  });
  const courtmateCounts = players.map((player) => player.distinctCourtmates);
  const partnerCounts = players.map((player) => player.distinctPartners);
  const opponentCounts = players.map((player) => player.distinctOpponents);
  const typeFractions = {
    both: players.filter((player) => player.latestSixT === 1).length,
    one: players.filter((player) => player.latestSixT === 0.5).length,
    none: players.filter((player) => player.latestSixT === 0).length,
  };
  const fairnessCounts = players.map((player) => ({ userId: player.userId, completedMatches: player.completedMatches }));
  const counts = fairnessCounts.map((player) => player.completedMatches);
  return {
    completedMatches: layouts.length,
    globalMatchTypeCounts: { mixedMatches: matchTypeCounts.MIXED, ownSideMatches: matchTypeCounts.OWN_SIDE },
    fairness: {
      completedMatchCountsByPlayer: fairnessCounts,
      minimumCompletedMatches: Math.min(...counts),
      maximumCompletedMatches: Math.max(...counts),
      countSpread: Math.max(...counts) - Math.min(...counts),
      countHistogram: Object.fromEntries([...new Set(counts)].sort((a, b) => a - b).map((count) => [count, counts.filter((item) => item === count).length])),
    },
    courtmateBreadth: {
      averageDistinctCourtmatesPerPlayer: mean(courtmateCounts),
      minimumDistinctCourtmatesPerPlayer: Math.min(...courtmateCounts),
      averageCoverageFraction: mean(courtmateCounts.map((count) => count / 13)),
      worstPlayerCoverageFraction: Math.min(...courtmateCounts) / 13,
      averageCoveragePercent: 100 * mean(courtmateCounts.map((count) => count / 13)),
      worstPlayerCoveragePercent: 100 * Math.min(...courtmateCounts) / 13,
      playersWithFullCourtmateCoverage: courtmateCounts.filter((count) => count === 13).length,
      distinctUnorderedCourtPairCount: pairs.size,
      possibleUnorderedCourtPairCount: 91,
      pairSaturationFraction: pairs.size / 91,
      timeToFullCoverageByPlayer: players.map((player) => ({ userId: player.userId, completedMatch: player.firstFullCourtCoverageAtCompletedMatch })),
      notYetFullyCoveredPlayers: players.filter((player) => player.firstFullCourtCoverageAtCompletedMatch === null).map((player) => player.userId),
    },
    matchTypeCoverage: {
      feasibleTypes: [...feasibleTypes],
      latestSixPlayersWithBothTypes: typeFractions.both,
      latestSixPlayersWithOneType: typeFractions.one,
      latestSixPlayersWithNoType: typeFractions.none,
      latestSixBothTypeFraction: typeFractions.both / players.length,
      latestSixMeanT: mean(players.map((player) => player.latestSixT)),
      players,
    },
    relationshipVariety: {
      averageDistinctPartnersPerPlayer: mean(partnerCounts),
      minimumDistinctPartnersPerPlayer: Math.min(...partnerCounts),
      averageDistinctOpponentsPerPlayer: mean(opponentCounts),
      minimumDistinctOpponentsPerPlayer: Math.min(...opponentCounts),
      meanPartnerEntropy: mean(players.map((player) => player.relationships.partners.entropy)),
      meanPartnerObservedEvenness: mean(players.map((player) => player.relationships.partners.observedRelationshipEvenness)),
      meanPartnerStructuralNormalizedEntropy: mean(players.map((player) => player.relationships.partners.structuralNormalizedEntropy)),
      meanOpponentEntropy: mean(players.map((player) => player.relationships.opponents.entropy)),
      meanOpponentObservedEvenness: mean(players.map((player) => player.relationships.opponents.observedRelationshipEvenness)),
      meanOpponentStructuralNormalizedEntropy: mean(players.map((player) => player.relationships.opponents.structuralNormalizedEntropy)),
      repeatedPartnerExposures: players.reduce((sum, player) => sum + player.relationships.partners.repeatedExposures, 0),
      repeatedOpponentExposures: players.reduce((sum, player) => sum + player.relationships.opponents.repeatedExposures, 0),
      maximumRepeatedPartnerExposure: Math.max(...players.map((player) => player.relationships.partners.maximumRepeat)),
      maximumRepeatedOpponentExposure: Math.max(...players.map((player) => player.relationships.opponents.maximumRepeat)),
    },
    globalCompletionGap: {
      definition: "Number of other completed matches strictly between two of a player's own appearances; based on completion event numbers, not elapsed time.",
      longestCompletedMatchesBetweenOwnAppearances: Math.max(...players.map((player) => player.maximumGlobalCompletedMatchesBetweenAppearances)),
      worstPlayer: players.reduce((worst, player) => player.maximumGlobalCompletedMatchesBetweenAppearances > worst.maximumGlobalCompletedMatchesBetweenAppearances ? player : worst, players[0]).userId,
    },
    players,
  };
}

function countWindowTypes(layouts: readonly Layout[]) {
  return layouts.reduce((counts, layout) => {
    counts[layout.matchType] += 1;
    return counts;
  }, { MIXED: 0, OWN_SIDE: 0 });
}

function buildFinalWindows(layouts: readonly Layout[]) {
  return Object.fromEntries([25, 50, 100].map((size) => {
    const window = layouts.slice(-Math.min(size, layouts.length)).map((layout, index) => ({ ...layout, completedMatchNumber: index + 1 }));
    const checkpoint = buildCheckpoint(window);
    const types = countWindowTypes(window);
    const partnerPairs = new Set(window.flatMap((layout) => [
      pairKey(layout.team1[0], layout.team1[1]), pairKey(layout.team2[0], layout.team2[1]),
    ]));
    const opponentPairs = new Set(window.flatMap((layout) => [
      pairKey(layout.team1[0], layout.team2[0]), pairKey(layout.team1[0], layout.team2[1]),
      pairKey(layout.team1[1], layout.team2[0]), pairKey(layout.team1[1], layout.team2[1]),
    ]));
    return [String(size), {
      effectiveWindowLength: window.length,
      globalMatchTypeCounts: {
        mixedMatches: types.MIXED,
        ownSideMatches: types.OWN_SIDE,
      },
      distinctCourtPairCount: checkpoint.courtmateBreadth.distinctUnorderedCourtPairCount,
      courtmateBreadth: {
        averageDistinctCourtmatesPerPlayer: checkpoint.courtmateBreadth.averageDistinctCourtmatesPerPlayer,
        minimumDistinctCourtmatesPerPlayer: checkpoint.courtmateBreadth.minimumDistinctCourtmatesPerPlayer,
      averageCoverageFraction: checkpoint.courtmateBreadth.averageCoverageFraction,
      worstPlayerCoverageFraction: checkpoint.courtmateBreadth.worstPlayerCoverageFraction,
      averageCoveragePercent: checkpoint.courtmateBreadth.averageCoveragePercent,
      worstPlayerCoveragePercent: checkpoint.courtmateBreadth.worstPlayerCoveragePercent,
      },
      relationshipVariety: {
        averageDistinctPartnersPerPlayer: checkpoint.relationshipVariety.averageDistinctPartnersPerPlayer,
        minimumDistinctPartnersPerPlayer: checkpoint.relationshipVariety.minimumDistinctPartnersPerPlayer,
        averageDistinctOpponentsPerPlayer: checkpoint.relationshipVariety.averageDistinctOpponentsPerPlayer,
        minimumDistinctOpponentsPerPlayer: checkpoint.relationshipVariety.minimumDistinctOpponentsPerPlayer,
        distinctPartnerPairCount: partnerPairs.size,
        distinctOpponentPairCount: opponentPairs.size,
      },
    }];
  }));
}

function summarizeSession(session: {
  seed: number;
  sessionType: string;
  completedHistory?: Array<Layout>;
  checkpoints: Record<string, BenchmarkCheckpoint>;
}, targetMatches: number) {
  const layouts = session.completedHistory;
  assert(layouts?.length === targetMatches, `Seed ${session.seed}: expected ${targetMatches} completed layouts.`);
  const prefixTimeSeries: Array<{
    completedMatches: number;
    meanT: number;
    playersWithBothRecentTypes: number;
    playersWithOnlyOneRecentType: number;
    averageDistinctCourtmatesPerPlayer: number;
    minimumDistinctCourtmatesPerPlayer: number;
    distinctUnorderedCourtPairCount: number;
    fairnessCountSpread: number;
    globalMatchTypeCounts: { mixedMatches: number; ownSideMatches: number };
  }> = [];
  for (let completedMatches = 1; completedMatches <= targetMatches; completedMatches += 1) {
    const prefix = buildCheckpoint(layouts.slice(0, completedMatches));
    prefixTimeSeries.push({
      completedMatches,
      meanT: prefix.matchTypeCoverage.latestSixMeanT,
      playersWithBothRecentTypes: prefix.matchTypeCoverage.latestSixPlayersWithBothTypes,
      playersWithOnlyOneRecentType: prefix.matchTypeCoverage.latestSixPlayersWithOneType,
      averageDistinctCourtmatesPerPlayer: prefix.courtmateBreadth.averageDistinctCourtmatesPerPlayer,
      minimumDistinctCourtmatesPerPlayer: prefix.courtmateBreadth.minimumDistinctCourtmatesPerPlayer,
      distinctUnorderedCourtPairCount: prefix.courtmateBreadth.distinctUnorderedCourtPairCount,
      fairnessCountSpread: prefix.fairness.countSpread,
      globalMatchTypeCounts: prefix.globalMatchTypeCounts,
    });
  }
  const checkpoints = Object.fromEntries([...new Set([21, targetMatches])].map((horizon) => {
    const layoutsAtHorizon = layouts.slice(0, horizon);
    const independent = buildCheckpoint(layoutsAtHorizon);
    const raw = session.checkpoints[String(horizon)];
    assert(raw?.completedMatches === horizon, `Seed ${session.seed}: missing checkpoint ${horizon}.`);
    const rawCounts = raw.playerMatchCounts.map((entry) => ({ userId: entry.userId, completedMatches: entry.matchesPlayed })).sort((a, b) => a.userId.localeCompare(b.userId));
    const independentCounts = [...independent.fairness.completedMatchCountsByPlayer].sort((a, b) => a.userId.localeCompare(b.userId));
    expect(rawCounts, `Seed ${session.seed}/${horizon}: checkpoint appearances disagree with completed layouts.`).toEqual(independentCounts);
    expect(raw.matchCountSpread, `Seed ${session.seed}/${horizon}: count spread disagrees with completed layouts.`)
      .toBe(independent.fairness.countSpread);
    expect(raw.minimumPlayerMatchCount).toBe(independent.fairness.minimumCompletedMatches);
    expect(raw.maximumPlayerMatchCount).toBe(independent.fairness.maximumCompletedMatches);
    expect(raw.completedMatchTypeCounts).toEqual({
      MIXED: independent.globalMatchTypeCounts.mixedMatches,
      OWN_SIDE: independent.globalMatchTypeCounts.ownSideMatches,
    });
    expect(raw.courtmateCoverage).toBeCloseTo(independent.courtmateBreadth.averageCoverageFraction, 12);
    expect(raw.socialHorizon321).toBeDefined();
    expect(raw.socialHorizon321!.averageDistinctCount.courtmates)
      .toBeCloseTo(independent.courtmateBreadth.averageDistinctCourtmatesPerPlayer, 12);
    expect(raw.socialHorizon321!.averageDistinctCount.partners)
      .toBeCloseTo(independent.relationshipVariety.averageDistinctPartnersPerPlayer, 12);
    expect(raw.socialHorizon321!.averageDistinctCount.opponents)
      .toBeCloseTo(independent.relationshipVariety.averageDistinctOpponentsPerPlayer, 12);
    expect(raw.socialVariety3211).toBeDefined();
    expect(raw.socialVariety3211!.meanT)
      .toBeCloseTo(independent.matchTypeCoverage.latestSixMeanT, 12);
    expect(raw.socialVariety3211!.fullTypeCoverageFraction)
      .toBeCloseTo(independent.matchTypeCoverage.latestSixBothTypeFraction, 12);
    expect(raw.socialVariety3211!.halfTypeCoverageFraction)
      .toBeCloseTo(independent.matchTypeCoverage.latestSixPlayersWithOneType / playerIds.length, 12);
    const prefixSpreads = prefixTimeSeries.filter((row) => row.completedMatches <= horizon).map((row) => row.fairnessCountSpread);
    expect(raw.maximumFairnessSpread).toBe(Math.max(...prefixSpreads));
    expect(raw.minimumFairnessSpread).toBe(Math.min(...prefixSpreads));
    expect(independent.globalCompletionGap.longestCompletedMatchesBetweenOwnAppearances,
      `Seed ${session.seed}/${horizon}: event-based completed-match gap disagrees with checkpoint accounting.`)
      .toBe(raw.betweenOwnCompletionEventGap.max);
    return [String(horizon), {
      ...independent,
      restAndFairnessAudit: {
        benchmarkMatchCountSpread: raw.matchCountSpread,
        benchmarkMaximumFairnessSpread: raw.maximumFairnessSpread,
        benchmarkMinimumFairnessSpread: raw.minimumFairnessSpread,
        assignmentRestGap: raw.assignmentRestGap,
        betweenOwnCompletionEventGap: raw.betweenOwnCompletionEventGap,
        backToBack: raw.backToBack,
        starvation: raw.starvation,
        optimizer: raw.optimizer,
        coverageGate: raw.coverageGate,
        replayEnvelope: raw.replayEnvelope,
        socialPriority: (raw as BenchmarkCheckpoint & { socialPriority?: unknown }).socialPriority ?? null,
      },
      finalGlobalMatchTypeCounts: {
        last25: countWindowTypes(layoutsAtHorizon.slice(-Math.min(25, horizon))),
        last50: countWindowTypes(layoutsAtHorizon.slice(-Math.min(50, horizon))),
        last100: countWindowTypes(layoutsAtHorizon.slice(-Math.min(100, horizon))),
      },
      final50CourtmateCohort: buildFinalWindows(layoutsAtHorizon)["50"],
    }];
  }));
  const lateT = prefixTimeSeries.filter((row) => row.completedMatches >= 76 && row.completedMatches <= 100).map((row) => row.meanT);
  return {
    seed: session.seed,
    sessionType: session.sessionType,
    targetMatches,
    checkpoints,
    final25GlobalMatchTypeCounts: checkpoints[String(targetMatches)].finalGlobalMatchTypeCounts.last25,
    final50GlobalMatchTypeCounts: checkpoints[String(targetMatches)].finalGlobalMatchTypeCounts.last50,
    final100GlobalMatchTypeCounts: checkpoints[String(targetMatches)].finalGlobalMatchTypeCounts.last100,
    meanTOverEvents76To100: lateT.length ? mean(lateT) : null,
    prefixTimeSeries,
    finalWindowDiagnostics: buildFinalWindows(layouts),
  };
}

function compareToFrozenBaseline(session: { seed: number; sessionType: string; completedHistory?: Layout[]; checkpoints: Record<string, BenchmarkCheckpoint> }) {
  const fixturePath = resolve("benchmarks/social-horizon-321/current/social-horizon-21-current-legacy-gate.json.gz");
  const fixture = JSON.parse(gunzipSync(readFileSync(fixturePath)).toString("utf8")) as {
    sessions: Array<{ profile: string; sessionType: string; seed: number; completedHistory: Layout[]; checkpoints: Record<string, unknown> }>;
  };
  const reference = fixture.sessions.find((item) => item.profile === "narrow" && item.sessionType === "SOCIAL_MIX" && item.seed === session.seed);
  assert(reference, `Frozen baseline fixture has no Social session for seed ${session.seed}.`);
  const first21 = session.completedHistory!.slice(0, 21);
  expect(first21, `Baseline seed ${session.seed}: completed match layouts differ from the frozen current fixture.`).toEqual(reference.completedHistory);
  // The frozen fixture is JSON: normalize nonfinite values and negative zero
  // before comparing the same serialized checkpoint representation.
  const currentCheckpoint = JSON.parse(JSON.stringify(session.checkpoints["21"])) as Record<string, unknown>;
  const oldCheckpoint = reference.checkpoints["21"] as Record<string, unknown>;
  expect(projectToReference(currentCheckpoint, oldCheckpoint), `Baseline seed ${session.seed}: existing checkpoint metrics differ from the frozen current fixture.`).toEqual(projectToReference(oldCheckpoint, oldCheckpoint));
  return { fixture: "benchmarks/social-horizon-321/current/social-horizon-21-current-legacy-gate.json.gz", first21LayoutsMatched: true, existingCheckpointMetricsMatched: true };
}

function projectToReference(actual: unknown, reference: unknown): unknown {
  // Entropy sums can differ by a few ulps across runtime versions. Layouts,
  // counts and all materially different metrics must still compare exactly.
  if (typeof actual === "number" && typeof reference === "number" &&
      (!Number.isInteger(actual) || !Number.isInteger(reference)) &&
      Math.abs(actual - reference) <= 8 * Number.EPSILON * Math.max(1, Math.abs(reference))) {
    return reference;
  }
  if (Array.isArray(reference)) {
    assert(Array.isArray(actual) && actual.length === reference.length, "Frozen checkpoint array shape changed.");
    return reference.map((row, index) => projectToReference(actual[index], row));
  }
  if (reference && typeof reference === "object") {
    assert(actual && typeof actual === "object" && !Array.isArray(actual), "Frozen checkpoint object is missing.");
    const volatileTimingFields = new Set(["ordinaryProductionWallMs", "counterfactualWrapperWallMs"]);
    return Object.fromEntries(Object.entries(reference).filter(([key]) => !volatileTimingFields.has(key)).map(([key, value]) => {
      assert(Object.hasOwn(actual, key), `Frozen checkpoint metric ${key} is missing.`);
      return [key, projectToReference((actual as Record<string, unknown>)[key], value)];
    }));
  }
  return actual;
}

function writeAtomically(filePath: string, contents: string) {
  const writingPath = `${filePath}.writing`;
  writeFileSync(writingPath, contents, { encoding: "utf8", flag: "wx" });
  renameSync(writingPath, filePath);
  unlinkSync(`${filePath}.pending`);
}

function makeValidCheckpoint(policy: Policy) {
  const optimizer = {
    searchLimitCalls: 0, incompleteCounterfactualCalls: 0, counterfactualWrapperCalls: 0,
    fairnessCertificateFailures: 0, starvationCertificateFailures: 0, balanceCertificateFailures: 0,
  };
  const starvation = { uncertifiedCounterfactualDecisions: 0, decisionsWithOverdueAvailable: 1, certifiedCounterfactualDecisions: 1 };
  const disabledCoverage = {
    policyApplied: false, refillDecisions: 0, certifiedDecisions: 0, uncertifiedDecisions: 0,
    noStarvationRefillDecisions: 0, noStarvationCertifiedDecisions: 0, noStarvationUncertifiedDecisions: 0,
  };
  const disabledReplay = {
    policyApplied: false, productionRefillDecisions: 0, productionReplayEnvelopeCertifiedDecisions: 0,
    productionCertifiedDecisions: 0, productionUncertifiedDecisions: 0, noStarvationRefillDecisions: 0,
    noStarvationReplayEnvelopeCertifiedDecisions: 0, noStarvationCertifiedDecisions: 0, noStarvationUncertifiedDecisions: 0,
  };
  if (policy === "candidate") return {
    completedMatches: 21, optimizer: { ...optimizer, callsStarted: 21, counterfactualWrapperCalls: 5 }, starvation, coverageGate: disabledCoverage, replayEnvelope: disabledReplay,
    socialPriority: {
      policyApplied: true, objectiveDecisions: 21, objectiveCertifiedDecisions: 21, objectiveUncertifiedDecisions: 0,
      rankingDiscrepancies: 0, fairnessCertificateFailures: 0, starvationSafetyFailures: 0, searchLimitDecisions: 0,
      incompleteCounterfactualDecisions: 0, coverageGateStatus: "DISABLED", replayEnvelopeStatus: "DISABLED",
      counterfactualAuditDecisions: 5, counterfactualCertifiedDecisions: 5, counterfactualUncertifiedDecisions: 0,
      counterfactualRankingDiscrepancies: 0, counterfactualFairnessCertificateFailures: 0,
      counterfactualSearchLimitDecisions: 0, counterfactualIncompleteDecisions: 0,
    },
  };
  const coverageGate = {
    policyApplied: true, refillDecisions: 20, certifiedDecisions: 20, uncertifiedDecisions: 0,
    noStarvationRefillDecisions: 20, noStarvationCertifiedDecisions: 20, noStarvationUncertifiedDecisions: 0,
  };
  const replayEnvelope = {
    policyApplied: true, productionRefillDecisions: 20, productionReplayEnvelopeCertifiedDecisions: 20,
    productionCertifiedDecisions: 20, productionUncertifiedDecisions: 0, noStarvationRefillDecisions: 20,
    noStarvationReplayEnvelopeCertifiedDecisions: 20, noStarvationCertifiedDecisions: 20, noStarvationUncertifiedDecisions: 0,
  };
  return { completedMatches: 21, optimizer, starvation, coverageGate, replayEnvelope };
}

describe("Social courtmate-priority strict certificate validator", () => {
  it("accepts a complete production baseline gate certificate", () => {
    expect(assertSocialCourtmatePriorityCheckpoint(makeValidCheckpoint("baseline"), "baseline")).toBe(true);
  });
  it("rejects incomplete or zero baseline gate cohorts", () => {
    const checkpoint = makeValidCheckpoint("baseline");
    checkpoint.coverageGate.refillDecisions = 0;
    checkpoint.coverageGate.certifiedDecisions = 0;
    expect(() => assertSocialCourtmatePriorityCheckpoint(checkpoint, "baseline")).toThrow(/expected 20/);
  });
  it("accepts complete candidate proofs with started and completed overdue cohorts separated", () => {
    expect(assertSocialCourtmatePriorityCheckpoint(makeValidCheckpoint("candidate"), "candidate")).toBe(true);
  });
  it("rejects missing or zero candidate audit cohorts and incomplete proofs", () => {
    type MutableCheckpoint = {
      socialPriority?: Partial<Record<string, unknown>>;
      coverageGate: { policyApplied: boolean };
    };
    const mutations: Array<(checkpoint: MutableCheckpoint) => void> = [
      (checkpoint) => { delete checkpoint.socialPriority; },
      (checkpoint) => { if (checkpoint.socialPriority) delete checkpoint.socialPriority.objectiveDecisions; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.objectiveDecisions = 0; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.objectiveDecisions = 1; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.fairnessCertificateFailures = 1; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.searchLimitDecisions = 1; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.incompleteCounterfactualDecisions = 1; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.counterfactualAuditDecisions = 0; },
      (checkpoint) => { if (checkpoint.socialPriority) delete checkpoint.socialPriority.counterfactualCertifiedDecisions; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.coverageGateStatus = "CERTIFIED"; },
      (checkpoint) => { if (checkpoint.socialPriority) checkpoint.socialPriority.replayEnvelopeStatus = "CERTIFIED"; },
      (checkpoint) => { checkpoint.coverageGate.policyApplied = true; },
    ];
    for (const mutate of mutations) {
      const checkpoint = structuredClone(makeValidCheckpoint("candidate")) as MutableCheckpoint;
      mutate(checkpoint);
      expect(() => assertSocialCourtmatePriorityCheckpoint(checkpoint, "candidate")).toThrow();
    }
  });
});

describe("Social courtmate-priority benchmark", () => {
  it.skipIf(!enabled)("independently reports fair courtmate breadth, rolling type coverage, and rest diagnostics", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_COURTMATE_SEEDS);
    const targetMatches = Number(process.env.BENCHMARK_COURTMATE_TARGET_MATCHES ?? "100");
    const policy = process.env.BENCHMARK_COURTMATE_POLICY as Policy | undefined;
    assert(policy === "baseline" || policy === "candidate", "Courtmate-priority policy must be baseline or candidate.");
    assert(targetMatches === 21 || targetMatches === 100, "Courtmate-priority run must stop at 21 or 100 completed matches.");
    assert(targetMatches <= 100, "This Social experiment is capped at 100 completed matches.");
    const sourceRevision = process.env.BENCHMARK_COURTMATE_SOURCE_REVISION ?? "recorded by runner";
    const sourceProvenance = process.env.BENCHMARK_COURTMATE_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_COURTMATE_SOURCE_PROVENANCE)
      : undefined;
    const jsonPath = process.env.BENCHMARK_COURTMATE_OUTPUT_JSON;
    assert(jsonPath, "The courtmate-priority runner must provide a JSON output path.");
    const absolutePath = resolve(jsonPath);
    const pendingPath = `${absolutePath}.pending`;
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(pendingPath, JSON.stringify({ validationStatus: "pending", policy, seeds, targetMatches }), { encoding: "utf8", flag: "wx" });

    const report = runSocialHorizonCoverageBenchmark({
      seeds,
      enginePolicy: "current",
      sourceRevision,
      sourceProvenance,
      targetMatches,
      sessionTypes: [SessionType.SOCIAL_MIX],
      socialPriorityPolicy: policy === "candidate" ? "courtmate-first" : "production",
    });
    expect(report.enginePolicy).toBe("current");
    expect(report.targetMatches).toBe(targetMatches);
    expect(report.seeds).toEqual(seeds);
    expect(report.sessions).toHaveLength(seeds.length);
    expect(report.sessions.every((session) => session.profile === "narrow" && session.sessionType === SessionType.SOCIAL_MIX)).toBe(true);

    const analyzedSessions = [];
    const fixtureMatches = [];
    for (const session of report.sessions) {
      const layouts = session.completedHistory as Layout[] | undefined;
      assert(layouts?.length === targetMatches, `Social seed ${session.seed}: completed history is missing or exceeds the cap.`);
      for (let index = 0; index < layouts.length; index += 1) {
        const layout = layouts[index];
        assert(layout.completedMatchNumber === index + 1, `Seed ${session.seed}: layout numbering is invalid.`);
        const ids = [...layout.team1, ...layout.team2];
        assert(ids.every((id) => /^P(?:[1-9]|1[0-4])$/.test(id)), `Seed ${session.seed}: invalid player ID.`);
      }
      if (policy === "baseline") fixtureMatches.push({ seed: session.seed, ...compareToFrozenBaseline(session) });
      for (const horizon of new Set([21, targetMatches])) {
        const checkpoint = session.checkpoints[String(horizon)];
        assert(checkpoint?.completedMatches === horizon, `Seed ${session.seed}: checkpoint ${horizon} is missing.`);
        assertSocialCourtmatePriorityCheckpoint(checkpoint, policy, `${policy}/${session.seed}/${horizon}`);
        expect(checkpoint.playerMatchCounts.reduce((sum, player) => sum + player.matchesPlayed, 0)).toBe(horizon * 4);
      }
      analyzedSessions.push(summarizeSession(session, targetMatches));
    }
    const analysis = {
      policy,
      policyLabel: sourceProvenance?.policyLabel ?? policy,
      socialPriorityPolicy: policy === "candidate" ? "courtmate-first" : "production",
      seeds,
      targetMatches,
      sessionTypes: ["SOCIAL_MIX"],
      definitions: {
        courtmateOpportunity: "All 13 other players in the fixed 14-player roster are structurally feasible courtmates; temporary availability never changes the denominator.",
        courtmateCoverage: "Distinct unordered player pairs sharing a completed court; each player's coverage fraction divides their unique courtmates by 13.",
        recentTypeCoverage: "Among each player's six latest completed appearances, fraction of structurally feasible types (MIXED and OWN_SIDE) seen; no ratio targets or quotas.",
        absenceGap: "For each feasible type, consecutive own appearances of the opposite type; separate from global completion-event gaps.",
        globalGap: "Number of other completed matches strictly between a player's own appearances; event-based, not wall-clock.",
        finiteRunLimit: "A finite session can show disappearance and recovery but cannot prove permanent extinction.",
      },
      frozenBaselineIdentity: fixtureMatches,
      sessions: analyzedSessions,
    };
    const finalReport = {
      ...report,
      socialCourtmatePriorityPolicy: policy,
      validationStatus: "passed" as const,
      courtPriorityAnalysis: analysis,
    };
    writeAtomically(absolutePath, `${JSON.stringify(finalReport, null, 2)}\n`);
  }, 1_800_000);
});
