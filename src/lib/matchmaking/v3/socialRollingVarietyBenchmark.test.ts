import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runSocialHorizonCoverageBenchmark } from "./socialCoverageBenchmark";
import type { BenchmarkCheckpoint, SocialHorizonCoverageReport } from "./socialCoverageBenchmark";
import type { SocialHorizon321Score, SocialHorizonFacet } from "./socialHorizonCoverageScoring";

const enabled = process.env.RUN_SOCIAL_ROLLING_VARIETY_BENCHMARK === "1";
const defaultSeeds = [1, 4729, 104729, 130363, 2097593];
const playerIds = Array.from({ length: 14 }, (_value, index) => `P${index + 1}`);
const facets: readonly SocialHorizonFacet[] = ["courtmates", "opponents", "partners"];
const relationshipCaps: Record<SocialHorizonFacet, number> = { courtmates: 13, opponents: 12, partners: 6 };
const relationshipWeights: Record<SocialHorizonFacet, number> = { courtmates: 3, opponents: 2, partners: 1 };
const feasibleTypes = ["MIXED", "OWN_SIDE"] as const;
const POLICY_METRICS = {
  baseline: "legacy-equal",
  a: "rolling-equal",
  b: "social-horizon-3211",
} as const;

type MatchType = "MIXED" | "OWN_SIDE";
type Layout = {
  completedMatchNumber: number;
  team1: readonly string[];
  team2: readonly string[];
  matchType: MatchType;
};
type PlayerAccumulator = {
  courtmates: Set<string>;
  opponents: Set<string>;
  partners: Set<string>;
  appearances: Array<{ completedMatchNumber: number; matchType: MatchType; courtmates: string[] }>;
};
type IndependentPlayerScore = {
  userId: string;
  score: number;
  relationshipScore: number;
  T: number;
  feasibleMatchTypes: MatchType[];
  recentMatchTypes: Array<MatchType | null>;
  coveredRecentMatchTypes: MatchType[];
  facets: SocialHorizon321Score["players"][number]["facets"];
};
type IndependentScore = {
  score: number;
  relationshipScore: number;
  meanT: number;
  fullTypeCoverageFraction: number;
  halfTypeCoverageFraction: number;
  facetMean: SocialHorizon321Score["facetMean"];
  averageDistinctCount: SocialHorizon321Score["averageDistinctCount"];
  relationship: SocialHorizon321Score;
  players: IndependentPlayerScore[];
};

function parseSeeds(raw: string | undefined) {
  const seeds = !raw?.trim() ? defaultSeeds : raw.split(",").map((value) => Number(value.trim()));
  if (!seeds.length || seeds.some((seed) => !Number.isSafeInteger(seed)) || new Set(seeds).size !== seeds.length) {
    throw new Error("Rolling variety benchmark seeds must be unique safe integers.");
  }
  return seeds;
}

function writeAtomically(filePath: string, contents: string) {
  const temporaryPath = `${filePath}.writing`;
  writeFileSync(temporaryPath, contents, "utf8");
  renameSync(temporaryPath, filePath);
}

function requireClose(actual: number | null | undefined, expected: number, message: string) {
  expect(actual, message).toBeCloseTo(expected, 12);
}

function emptyPlayerAccumulator(): PlayerAccumulator {
  return {
    courtmates: new Set(),
    opponents: new Set(),
    partners: new Set(),
    appearances: [],
  };
}

/** Rebuild the corrected KPI from completed layouts; this never calls a production scorer. */
function independentlyScoreLayouts(layouts: readonly Layout[]): {
  score: IndependentScore;
  accumulators: Map<string, PlayerAccumulator>;
  mixedMatches: number;
  ownSideMatches: number;
} {
  const accumulators = new Map(playerIds.map((userId) => [userId, emptyPlayerAccumulator()]));
  let mixedMatches = 0;
  let ownSideMatches = 0;
  for (const [index, layout] of layouts.entries()) {
    const ids = [...layout.team1, ...layout.team2];
    if (layout.completedMatchNumber !== index + 1 || layout.team1.length !== 2 || layout.team2.length !== 2 ||
        ids.length !== 4 || new Set(ids).size !== 4 || ids.some((id) => !accumulators.has(id))) {
      throw new Error(`Malformed completed layout at match ${index + 1}.`);
    }
    const upperCountByTeam = [layout.team1, layout.team2].map((team) => team.filter((id) => {
      const suffix = Number(id.slice(1));
      return suffix >= 1 && suffix <= 7;
    }).length);
    const legalSidePattern = upperCountByTeam[0] === upperCountByTeam[1];
    const expectedType: MatchType = upperCountByTeam[0] === 1 ? "MIXED" : "OWN_SIDE";
    if (!legalSidePattern || layout.matchType !== expectedType) {
      throw new Error(`Match ${index + 1} does not match its fixed 7/7 side classification.`);
    }
    if (layout.matchType === "MIXED") mixedMatches += 1;
    else ownSideMatches += 1;

    const teams = [layout.team1, layout.team2] as const;
    for (const [teamIndex, team] of teams.entries()) {
      const opponents = teams[1 - teamIndex];
      for (const userId of team) {
        const player = accumulators.get(userId)!;
        const experiencedCourtmates = ids.filter((peerId) => peerId !== userId);
        const experiencedOpponents = [...opponents];
        const experiencedPartners = team.filter((peerId) => peerId !== userId);
        for (const peerId of experiencedCourtmates) player.courtmates.add(peerId);
        for (const peerId of experiencedOpponents) player.opponents.add(peerId);
        for (const peerId of experiencedPartners) player.partners.add(peerId);
        player.appearances.push({
          completedMatchNumber: layout.completedMatchNumber,
          matchType: layout.matchType,
          courtmates: experiencedCourtmates,
        });
      }
    }
  }

  const relationshipPlayers: SocialHorizon321Score["players"] = [];
  const players: IndependentPlayerScore[] = [];
  for (const userId of playerIds) {
    const history = accumulators.get(userId)!;
    const facetScores = {} as SocialHorizon321Score["players"][number]["facets"];
    for (const facet of facets) {
      const uniqueCount = history[facet].size;
      const denominator = relationshipCaps[facet];
      const cappedUniqueCount = Math.min(uniqueCount, denominator);
      const ratio = cappedUniqueCount / denominator;
      facetScores[facet] = { feasibleCount: 13, denominator, uniqueCount, cappedUniqueCount, ratio };
    }
    const relationshipScore = (
      relationshipWeights.courtmates * facetScores.courtmates.ratio! +
      relationshipWeights.opponents * facetScores.opponents.ratio! +
      relationshipWeights.partners * facetScores.partners.ratio!
    ) / 6;
    const recentAppearances = history.appearances.slice(-6);
    const recentMatchTypes = recentAppearances.map((match) => match.matchType);
    const coveredRecentMatchTypes = feasibleTypes.filter((type) => recentMatchTypes.includes(type));
    const T = coveredRecentMatchTypes.length / feasibleTypes.length;
    relationshipPlayers.push({ userId, score: relationshipScore, activeWeight: 6, facets: facetScores });
    players.push({
      userId,
      relationshipScore,
      T,
      score: (6 * relationshipScore + T) / 7,
      feasibleMatchTypes: [...feasibleTypes],
      recentMatchTypes: [...recentMatchTypes],
      coveredRecentMatchTypes,
      facets: facetScores,
    });
  }
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const relationship: SocialHorizon321Score = {
    score: mean(relationshipPlayers.map((player) => player.score!)),
    facetMean: Object.fromEntries(facets.map((facet) => [
      facet,
      mean(relationshipPlayers.map((player) => player.facets[facet].ratio!)),
    ])) as SocialHorizon321Score["facetMean"],
    averageDistinctCount: Object.fromEntries(facets.map((facet) => [
      facet,
      mean(relationshipPlayers.map((player) => player.facets[facet].uniqueCount)),
    ])) as SocialHorizon321Score["averageDistinctCount"],
    players: relationshipPlayers,
  };
  const fullTypeCoverageFraction = players.filter((player) => player.T === 1).length / players.length;
  const halfTypeCoverageFraction = players.filter((player) => player.T === 0.5).length / players.length;
  const score: IndependentScore = {
    score: mean(players.map((player) => player.score)),
    relationshipScore: relationship.score!,
    meanT: mean(players.map((player) => player.T)),
    fullTypeCoverageFraction,
    halfTypeCoverageFraction,
    facetMean: relationship.facetMean,
    averageDistinctCount: relationship.averageDistinctCount,
    relationship,
    players,
  };
  return { score, accumulators, mixedMatches, ownSideMatches };
}

function checkpointMetric(checkpoint: BenchmarkCheckpoint | undefined) {
  if (!checkpoint) return null;
  return {
    assignmentRestGap: checkpoint.assignmentRestGap,
    backToBack: checkpoint.backToBack,
    matchCountSpread: checkpoint.matchCountSpread,
    starvation: checkpoint.starvation,
    optimizer: checkpoint.optimizer,
  };
}

function assertHorizonMatches(actual: SocialHorizon321Score | undefined, expected: SocialHorizon321Score, label: string) {
  expect(actual, `${label}: missing old relationship KPI`).toBeDefined();
  requireClose(actual!.score, expected.score!, `${label}: relationship score`);
  for (const facet of facets) {
    requireClose(actual!.facetMean[facet], expected.facetMean[facet]!, `${label}: ${facet} mean`);
    requireClose(actual!.averageDistinctCount[facet], expected.averageDistinctCount[facet]!, `${label}: ${facet} distinct count`);
  }
  for (const expectedPlayer of expected.players) {
    const player = actual!.players.find((row) => row.userId === expectedPlayer.userId);
    expect(player, `${label}: relationship player ${expectedPlayer.userId}`).toBeDefined();
    requireClose(player!.score, expectedPlayer.score!, `${label}: ${expectedPlayer.userId} relationship score`);
    for (const facet of facets) expect(player!.facets[facet]).toEqual(expectedPlayer.facets[facet]);
  }
}

function assert3211Matches(actual: unknown, expected: IndependentScore, label: string) {
  expect(actual, `${label}: missing 3211 checkpoint`).toBeDefined();
  const measured = actual as {
    score: number | null;
    relationshipScore: number | null;
    meanT: number;
    fullTypeCoverageFraction: number;
    halfTypeCoverageFraction: number;
    players: Array<{
      userId: string;
      score: number | null;
      relationshipScore: number | null;
      T: number;
      feasibleMatchTypes: string[];
      recentMatchTypes: Array<string | null>;
    }>;
    relationship: SocialHorizon321Score;
  };
  requireClose(measured.score, expected.score, `${label}: 3211 score`);
  requireClose(measured.relationshipScore, expected.relationshipScore, `${label}: relationship score`);
  requireClose(measured.meanT, expected.meanT, `${label}: mean T`);
  requireClose(measured.fullTypeCoverageFraction, expected.fullTypeCoverageFraction, `${label}: full type fraction`);
  requireClose(measured.halfTypeCoverageFraction, expected.halfTypeCoverageFraction, `${label}: half type fraction`);
  assertHorizonMatches(measured.relationship, expected.relationship, `${label}: embedded relationship score`);
  expect(measured.players).toHaveLength(playerIds.length);
  for (const expectedPlayer of expected.players) {
    const player = measured.players.find((row) => row.userId === expectedPlayer.userId);
    expect(player, `${label}: 3211 player ${expectedPlayer.userId}`).toBeDefined();
    requireClose(player!.score, expectedPlayer.score, `${label}: ${expectedPlayer.userId} 3211 score`);
    requireClose(player!.relationshipScore, expectedPlayer.relationshipScore, `${label}: ${expectedPlayer.userId} relationship score`);
    requireClose(player!.T, expectedPlayer.T, `${label}: ${expectedPlayer.userId} T`);
    expect([...player!.feasibleMatchTypes].sort()).toEqual([...expectedPlayer.feasibleMatchTypes].sort());
    expect(player!.recentMatchTypes).toEqual(expectedPlayer.recentMatchTypes);
  }
}

function playerPathologyRows(accumulators: Map<string, PlayerAccumulator>, last100: readonly Layout[]) {
  const final100Counts = new Map(playerIds.map((userId) => [userId, { MIXED: 0, OWN_SIDE: 0 }]));
  for (const layout of last100) {
    for (const userId of [...layout.team1, ...layout.team2]) final100Counts.get(userId)![layout.matchType] += 1;
  }
  return playerIds.map((userId) => {
    const history = accumulators.get(userId)!;
    const matchTypes = new Set(history.appearances.map((match) => match.matchType));
    let maximumMixedOnlyStreak = 0;
    let mixedOnlyStreak = 0;
    for (const match of history.appearances) {
      if (match.matchType === "MIXED") {
        mixedOnlyStreak += 1;
        maximumMixedOnlyStreak = Math.max(maximumMixedOnlyStreak, mixedOnlyStreak);
      } else mixedOnlyStreak = 0;
    }
    const recent = history.appearances.slice(-6);
    const courtmateCounts = new Map<string, number>();
    for (const appearance of history.appearances) {
      for (const peerId of appearance.courtmates) courtmateCounts.set(peerId, (courtmateCounts.get(peerId) ?? 0) + 1);
    }
    const repeatedCourtmate = [...courtmateCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? null;
    return {
      userId,
      completedMatches: history.appearances.length,
      lifetimeMatchTypes: [...feasibleTypes].filter((type) => matchTypes.has(type)),
      feasibleMatchTypes: [...feasibleTypes],
      latestSixMatchTypes: recent.map((match) => match.matchType),
      latestSixSingleType: new Set(recent.map((match) => match.matchType)).size === 1,
      latestSixT: new Set(recent.map((match) => match.matchType)).size / feasibleTypes.length,
      missingLifetimeTypes: [...feasibleTypes].filter((type) => !matchTypes.has(type)),
      final100MatchesByType: final100Counts.get(userId)!,
      maximumConsecutiveOwnSideAbsenceInPlayerMatches: maximumMixedOnlyStreak,
      trailingConsecutiveOwnSideAbsenceInPlayerMatches: mixedOnlyStreak,
      distinctCourtmates: history.courtmates.size,
      distinctPartners: history.partners.size,
      distinctOpponents: history.opponents.size,
      mostRepeatedCourtmate: repeatedCourtmate ? { userId: repeatedCourtmate[0], meetings: repeatedCourtmate[1] } : null,
      mostRepeatedCourtmateShareOfCourtmateExposures: history.appearances.length
        ? (repeatedCourtmate?.[1] ?? 0) / (history.appearances.length * 3)
        : 0,
    };
  });
}

function buildPrefixSeries(layouts: readonly Layout[]) {
  const prefixTimeSeries = [];
  for (let completedMatches = 1; completedMatches <= layouts.length; completedMatches += 1) {
    const measured = independentlyScoreLayouts(layouts.slice(0, completedMatches));
    const latest6SingleTypePlayers = measured.score.players
      .filter((player) => player.T === 0.5)
      .map((player) => player.userId);
    prefixTimeSeries.push({
      completedMatches,
      score3211: measured.score.score,
      relationshipScore321: measured.score.relationshipScore,
      meanT: measured.score.meanT,
      fullTypeCoverageFraction: measured.score.fullTypeCoverageFraction,
      halfTypeCoverageFraction: measured.score.halfTypeCoverageFraction,
      mixedMatches: measured.mixedMatches,
      ownSideMatches: measured.ownSideMatches,
      latest6SingleTypePlayers,
      relationshipFacetMean: measured.score.facetMean,
    });
  }
  return prefixTimeSeries;
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function formatNumber(value: number | null | undefined, places = 3) {
  return typeof value === "number" ? value.toFixed(places) : "n/a";
}

function formatMarkdown(report: SocialHorizonCoverageReport & { rollingVarietyAnalysis: Record<string, unknown> }) {
  const analysis = report.rollingVarietyAnalysis as {
    policy: string;
    policyLabel: string;
    targetMatches: number;
    seeds: number[];
    sessions: Array<{
      seed: number;
      sessionType: string;
      checkpoints: Record<string, {
        independent: IndependentScore;
        historyCounts: { mixedMatches: number; ownSideMatches: number };
        checkpoint: ReturnType<typeof checkpointMetric>;
        allMatchCounts: { mixedMatches: number; ownSideMatches: number };
        final100MatchCounts: { mixedMatches: number; ownSideMatches: number };
      }>;
      playerPathologies: ReturnType<typeof playerPathologyRows>;
    }>;
  };
  const lines = [
    "# Rolling Social Variety benchmark",
    "",
    `Policy: **${analysis.policyLabel}** (${analysis.policy}). Engine policy ${report.enginePolicy}; gate metric ${report.matcherCoverageGainMetric}; source revision ${report.sourceRevision}.`,
    `Seeds: ${analysis.seeds.join(", ")}. Fixed 14-player, 7/7 MIXICANO roster, two courts, asynchronous completions; target ${analysis.targetMatches}.`,
    "",
    "The completed-only per-player KPI is (3C + 2O + P + T) / 7. C/O/P are capped structural coverage at 13/12/6; T is distinct feasible match types among each player's six most recent completed matches divided by feasible types. Match-type coverage has no ratio target or quota. The rolling gate changes replay admission value only; lifetime entropy ranking remains unchanged.",
    "",
    "A finite run can show match-type disappearance and recovery in these sessions. It cannot prove permanent extinction across every possible session.",
    "",
    `| Format | Seed | N | KPI 3211 | Old 321 C/O/P score | C | O | P | unique C/O/P | T mean / T=1 / T=.5 | M/O counts | Rest mean / p95 / max | B2B | spread | starvation changed / certified / uncertified | proof failures fairness / starvation / balance |`,
    "|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|---:|---|---|",
  ];
  for (const session of analysis.sessions) {
    for (const checkpointNumber of new Set([21, 100, analysis.targetMatches])) {
      const row = session.checkpoints[String(checkpointNumber)];
      if (!row) continue;
      const values = row.independent;
      const checkpoint = row.checkpoint;
      const rest = checkpoint?.assignmentRestGap;
      const b2b = checkpoint?.backToBack;
      const starvation = checkpoint?.starvation;
      const optimizer = checkpoint?.optimizer;
      const f = values.facetMean;
      const d = values.averageDistinctCount;
      lines.push(`| ${session.sessionType} | ${session.seed} | ${checkpointNumber} | ${formatPercent(values.score)} | ${formatPercent(values.relationshipScore)} | ${formatPercent(f.courtmates)} | ${formatPercent(f.opponents)} | ${formatPercent(f.partners)} | ${formatNumber(d.courtmates, 2)} / ${formatNumber(d.opponents, 2)} / ${formatNumber(d.partners, 2)} | ${formatPercent(values.meanT)} / ${formatPercent(values.fullTypeCoverageFraction)} / ${formatPercent(values.halfTypeCoverageFraction)} | ${row.allMatchCounts.mixedMatches}/${row.allMatchCounts.ownSideMatches} (last100 ${row.final100MatchCounts.mixedMatches}/${row.final100MatchCounts.ownSideMatches}) | ${formatNumber(rest?.mean)} / ${formatNumber(rest?.p95)} / ${rest?.max ?? "n/a"} | ${formatPercent(b2b?.rate)} (${b2b?.count ?? "n/a"}/${b2b?.eligibleAssignments ?? "n/a"}) | ${checkpoint?.matchCountSpread ?? "n/a"} | ${starvation?.materiallyChangedPlayerSet ?? "n/a"} / ${starvation?.certifiedCounterfactualDecisions ?? "n/a"} / ${starvation?.uncertifiedCounterfactualDecisions ?? "n/a"} | ${optimizer?.fairnessCertificateFailures ?? "n/a"} / ${optimizer?.starvationCertificateFailures ?? "n/a"} / ${optimizer?.balanceCertificateFailures ?? "n/a"} |`);
    }
  }
  lines.push("", "## Long-run diagnostics", "", "Each session's JSON includes a score time series at every completed-match prefix, including the latest-six single-type player cohort, cumulative C/O/P coverage, and cumulative MIXED/OWN_SIDE counts. Per-player pathology rows report lifetime and latest-six type coverage, final-100 counts, consecutive own-side absence across the player's own matches, and courtmate concentration.", "");
  for (const session of analysis.sessions) {
    const target = session.checkpoints[String(analysis.targetMatches)];
    lines.push(`### ${session.sessionType}, seed ${session.seed}`, "");
    lines.push("| Player | latest 6 types | latest T | lifetime missing type | final 100 M/O | max own-side absence | distinct courtmates | top courtmate share |");
    lines.push("|---|---|---:|---|---|---:|---:|---:|");
    for (const player of session.playerPathologies) {
      lines.push(`| ${player.userId} | ${player.latestSixMatchTypes.join(", ") || "none"} | ${formatPercent(player.latestSixT)} | ${player.missingLifetimeTypes.join(", ") || "none"} | ${player.final100MatchesByType.MIXED}/${player.final100MatchesByType.OWN_SIDE} | ${player.maximumConsecutiveOwnSideAbsenceInPlayerMatches} | ${player.distinctCourtmates} | ${formatPercent(player.mostRepeatedCourtmateShareOfCourtmateExposures)} |`);
    }
    lines.push("", `Final ${analysis.targetMatches}-match KPI ${formatPercent(target.independent.score)}; relationship score ${formatPercent(target.independent.relationshipScore)}; T mean ${formatPercent(target.independent.meanT)}.`, "");
  }
  lines.push("## Provenance", "", `commitSha: ${report.sourceProvenance.commitSha}; dirty: ${report.sourceProvenance.workingTreeDirty}; engine SHA-256: ${report.sourceProvenance.engineSourceSha256}; measurement SHA-256: ${report.sourceProvenance.measurementHarnessSha256}.`, "");
  return lines.join("\n");
}

describe("rolling Social Variety benchmark export", () => {
  it.skipIf(!enabled)("recomputes the 3211 KPI from completed layouts and exports diagnostics", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_ROLLING_SEEDS);
    const targetMatches = Number(process.env.BENCHMARK_ROLLING_TARGET_MATCHES ?? "400");
    const policy = process.env.BENCHMARK_ROLLING_POLICY ?? "baseline";
    const coverageGainMetric = POLICY_METRICS[policy as keyof typeof POLICY_METRICS];
    if (!(policy in POLICY_METRICS)) throw new Error("Rolling variety policy must be baseline, a, or b.");
    if (targetMatches !== 21 && targetMatches !== 400) throw new Error("Rolling variety target must be 21 or 400 completed matches.");
    if (!coverageGainMetric) throw new Error("The requested rolling variety policy has no gate metric.");
    const sourceRevision = process.env.BENCHMARK_ROLLING_SOURCE_REVISION ?? "recorded by runner";
    const sourceProvenance = process.env.BENCHMARK_ROLLING_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_ROLLING_SOURCE_PROVENANCE)
      : undefined;
    const jsonPath = process.env.BENCHMARK_ROLLING_OUTPUT_JSON;
    const markdownPath = process.env.BENCHMARK_ROLLING_OUTPUT_MARKDOWN;
    if (!jsonPath || !markdownPath) throw new Error("The rolling variety runner must provide JSON and Markdown output paths.");
    if (resolve(jsonPath) === resolve(markdownPath)) throw new Error("Rolling variety JSON and Markdown outputs must be distinct.");

    const report = runSocialHorizonCoverageBenchmark({
      seeds,
      enginePolicy: "current",
      sourceRevision,
      sourceProvenance,
      targetMatches,
      coverageGainMetric,
    });
    const jsonAbsolutePath = resolve(jsonPath);
    const markdownAbsolutePath = resolve(markdownPath);
    const pendingPath = `${jsonAbsolutePath}.pending`;
    mkdirSync(dirname(jsonAbsolutePath), { recursive: true });
    mkdirSync(dirname(markdownAbsolutePath), { recursive: true });
    writeFileSync(pendingPath, `${JSON.stringify({ ...report, validationStatus: "pending" }, null, 2)}\n`, "utf8");

    expect(report.schemaVersion).toBe("social-horizon-321-v1");
    expect(report.enginePolicy).toBe("current");
    expect(report.targetMatches).toBe(targetMatches);
    expect(report.seeds).toEqual(seeds);
    expect(report.matcherCoverageGainMetric).toBe(coverageGainMetric);
    expect(report.sessions).toHaveLength(seeds.length * 3);
    const checkpointNumbers = [...new Set([21, 100, targetMatches].filter((number) => number <= targetMatches))];
    const analyzedSessions: Array<Record<string, unknown>> = [];

    for (const session of report.sessions) {
      const layouts = session.completedHistory;
      if (!layouts) throw new Error(`Completed history is missing for ${session.seed}/${session.sessionType}.`);
      expect(layouts).toHaveLength(targetMatches);
      expect(layouts.map((layout) => layout.completedMatchNumber)).toEqual(Array.from({ length: targetMatches }, (_value, index) => index + 1));
      expect(session.checkpoints["21"]?.completedMatches).toBe(21);
      expect(session.checkpoints[String(targetMatches)]?.completedMatches).toBe(targetMatches);
      expect(session.checkpoints["21"]?.playerMatchCounts.reduce((sum, player) => sum + player.matchesPlayed, 0)).toBe(84);
      expect(session.checkpoints[String(targetMatches)]?.playerMatchCounts.reduce((sum, player) => sum + player.matchesPlayed, 0)).toBe(targetMatches * 4);

      const analysisByCheckpoint: Record<string, unknown> = {};
      for (const checkpointNumber of checkpointNumbers) {
        const prefix = layouts.slice(0, checkpointNumber) as Layout[];
        const computed = independentlyScoreLayouts(prefix);
        const checkpoint = session.checkpoints[String(checkpointNumber)] as (BenchmarkCheckpoint & {
          socialVariety3211?: unknown;
        }) | undefined;
        const label = `${session.sessionType}/seed ${session.seed}/checkpoint ${checkpointNumber}`;
        if (checkpoint) {
          expect(checkpoint.completedMatches).toBe(checkpointNumber);
          if (checkpoint.socialHorizon321) assertHorizonMatches(checkpoint.socialHorizon321, computed.score.relationship, `${label} old 321`);
          assert3211Matches(checkpoint.socialVariety3211, computed.score, label);
        } else if (checkpointNumber === 21 || checkpointNumber === targetMatches) {
          throw new Error(`${label}: required production checkpoint is missing.`);
        }
        const final100Layouts = layouts.slice(Math.max(0, checkpointNumber - 100), checkpointNumber) as Layout[];
        const final100TypeCounts = final100Layouts.reduce((counts, layout) => {
          counts[layout.matchType] += 1;
          return counts;
        }, { MIXED: 0, OWN_SIDE: 0 });
        const allTypeCounts = prefix.reduce((counts, layout) => {
          counts[layout.matchType] += 1;
          return counts;
        }, { MIXED: 0, OWN_SIDE: 0 });
        analysisByCheckpoint[String(checkpointNumber)] = {
          completedMatches: checkpointNumber,
          independent: computed.score,
          historyCounts: { mixedMatches: computed.mixedMatches, ownSideMatches: computed.ownSideMatches },
          allMatchCounts: { mixedMatches: allTypeCounts.MIXED, ownSideMatches: allTypeCounts.OWN_SIDE },
          final100MatchCounts: { mixedMatches: final100TypeCounts.MIXED, ownSideMatches: final100TypeCounts.OWN_SIDE },
          checkpoint: checkpointMetric(checkpoint),
          checkpointScoreValidated: Boolean(checkpoint?.socialVariety3211),
        };
      }
      const finalComputed = independentlyScoreLayouts(layouts as Layout[]);
      analyzedSessions.push({
        seed: session.seed,
        sessionType: session.sessionType,
        checkpoints: analysisByCheckpoint,
        prefixTimeSeries: buildPrefixSeries(layouts as Layout[]),
        playerPathologies: playerPathologyRows(finalComputed.accumulators, layouts.slice(-100) as Layout[]),
        formatCountsAtTarget: { mixedMatches: finalComputed.mixedMatches, ownSideMatches: finalComputed.ownSideMatches },
      });
    }

    const rollingVarietyAnalysis = {
      definition: {
        formula: "Per-player (3C + 2O + P + T) / 7; C/O/P use capped structural coverage at 13/12/6; T is the fraction of feasible match types seen in the player’s latest six completed matches.",
        historyRule: "Completed layouts only; active assignments are excluded. Every completed-history prefix is independently rescored.",
        typeCoverageRule: "Coverage only, with no target ratio, quota, debt, or forced type selection.",
        finiteRunLimit: "A finite run can show disappearance and recovery; it cannot prove permanent extinction across every possible session.",
        rankingRule: "A and B alter replay-gate gain only; lifetime entropy ranking remains unchanged.",
      },
      policy,
      policyLabel: sourceProvenance?.policyLabel ?? policy,
      metric: coverageGainMetric,
      targetMatches,
      seeds,
      sessions: analyzedSessions,
    };
    const validatedReport = { ...report, validationStatus: "passed" as const, rollingVarietyAnalysis };
    writeAtomically(markdownAbsolutePath, `${formatMarkdown(validatedReport)}\n`);
    writeAtomically(jsonAbsolutePath, `${JSON.stringify(validatedReport, null, 2)}\n`);
    unlinkSync(pendingPath);
  }, 1_800_000);
});
