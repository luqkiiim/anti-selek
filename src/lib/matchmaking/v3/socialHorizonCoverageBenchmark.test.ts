import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runSocialHorizonCoverageBenchmark } from "./socialCoverageBenchmark";
import type { SocialHorizonCoverageReport } from "./socialCoverageBenchmark";
import type { SocialHorizonFacet, SocialHorizon321Score } from "./socialHorizonCoverageScoring";

const enabled = process.env.RUN_SOCIAL_HORIZON_BENCHMARK === "1";
const defaultSeeds = [1, 4729, 104729, 130363, 2097593];
const caps: Record<SocialHorizonFacet, number> = { courtmates: 13, opponents: 12, partners: 6 };
const weights: Record<SocialHorizonFacet, number> = { courtmates: 3, opponents: 2, partners: 1 };
const facets: readonly SocialHorizonFacet[] = ["courtmates", "opponents", "partners"];

function parseSeeds(raw: string | undefined) {
  if (!raw?.trim()) return defaultSeeds;
  return raw.split(",").map((value) => Number(value.trim()));
}

function writeAtomically(path: string, contents: string) {
  const temporaryPath = `${path}.writing`;
  writeFileSync(temporaryPath, contents, "utf8");
  renameSync(temporaryPath, path);
}

function independentScoreFromCompletedLayouts(
  playerIds: readonly string[],
  layouts: readonly { team1: readonly string[]; team2: readonly string[] }[]
): SocialHorizon321Score {
  const relationships = new Map(playerIds.map((userId) => [userId, {
    courtmates: new Set<string>(),
    opponents: new Set<string>(),
    partners: new Set<string>(),
  }]));

  for (const layout of layouts) {
    const teams = [layout.team1, layout.team2] as const;
    const court = [...layout.team1, ...layout.team2];
    for (const [teamIndex, team] of teams.entries()) {
      const opponents = teams[teamIndex === 0 ? 1 : 0];
      for (const userId of team) {
        const experienced = relationships.get(userId);
        if (!experienced) throw new Error(`Unknown completed-history player: ${userId}`);
        for (const peerId of court) if (peerId !== userId) experienced.courtmates.add(peerId);
        for (const peerId of opponents) experienced.opponents.add(peerId);
        for (const peerId of team) if (peerId !== userId) experienced.partners.add(peerId);
      }
    }
  }

  const playerScores = playerIds.map((userId) => {
    const seen = relationships.get(userId)!;
    const scores = {} as SocialHorizon321Score["players"][number]["facets"];
    let weightedTotal = 0;
    let activeWeight = 0;
    for (const facet of facets) {
      // In the fixed 7/7 MIXICANO roster, Mixed and OWN_SIDE layouts make
      // every other player structurally feasible for each relationship facet.
      const feasibleCount = playerIds.length - 1;
      const denominator = Math.min(feasibleCount, caps[facet]);
      const uniqueCount = seen[facet].size;
      const cappedUniqueCount = Math.min(uniqueCount, denominator);
      const ratio = denominator === 0 ? null : cappedUniqueCount / denominator;
      scores[facet] = { feasibleCount, denominator, uniqueCount, cappedUniqueCount, ratio };
      if (ratio !== null) {
        weightedTotal += weights[facet] * ratio;
        activeWeight += weights[facet];
      }
    }
    return {
      userId,
      score: activeWeight === 0 ? null : weightedTotal / activeWeight,
      activeWeight,
      facets: scores,
    };
  });

  const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    score: mean(playerScores.map((player) => player.score).filter((value): value is number => value !== null)),
    facetMean: Object.fromEntries(facets.map((facet) => [
      facet,
      mean(playerScores.map((player) => player.facets[facet].ratio).filter((value): value is number => value !== null)),
    ])) as SocialHorizon321Score["facetMean"],
    averageDistinctCount: Object.fromEntries(facets.map((facet) => [
      facet,
      mean(playerScores.map((player) => player.facets[facet].uniqueCount)),
    ])) as SocialHorizon321Score["averageDistinctCount"],
    players: playerScores,
  };
}

function expectSameScore(actual: SocialHorizon321Score, expected: SocialHorizon321Score) {
  expect(actual.players).toHaveLength(expected.players.length);
  for (const expectedPlayer of expected.players) {
    const actualPlayer = actual.players.find((player) => player.userId === expectedPlayer.userId);
    expect(actualPlayer).toBeDefined();
    expect(actualPlayer!.score).toBeCloseTo(expectedPlayer.score!, 12);
    expect(actualPlayer!.activeWeight).toBe(expectedPlayer.activeWeight);
    for (const facet of facets) {
      expect(actualPlayer!.facets[facet]).toEqual(expectedPlayer.facets[facet]);
    }
  }
  expect(actual.score).toBeCloseTo(expected.score!, 12);
  for (const facet of facets) {
    expect(actual.facetMean[facet]).toBeCloseTo(expected.facetMean[facet]!, 12);
    expect(actual.averageDistinctCount[facet]).toBeCloseTo(expected.averageDistinctCount[facet]!, 12);
  }
}

function formatMarkdown(report: SocialHorizonCoverageReport) {
  const target = String(report.targetMatches);
  const formats = [...new Set(report.sessions.map((session) => session.sessionType))];
  const lines = [
    "# Social Horizon 321 benchmark",
    "",
    `Engine policy: \`${report.enginePolicy}\`. Measurement source: \`${report.sourceRevision}\`. Matcher coverage gain metric: \`${report.matcherCoverageGainMetric}\`.`,
    `Target: exactly ${report.targetMatches} completed matches. Seeds: ${report.seeds.join(", ")}. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.`,
    "",
    "The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.",
    "",
    `| Format | Horizon score at ${target} | Courtmates | Opponents | Partners | Mean distinct C/O/P |`,
    "|---|---:|---:|---:|---:|---|",
  ];
  const pct = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
  for (const format of formats) {
    const rows = report.sessions.filter((session) => session.sessionType === format);
    const values = rows.map((session) => {
      const score = session.checkpoints[target]?.socialHorizon321;
      if (!score) throw new Error(`Missing horizon score at ${target} completed matches for ${format}.`);
      return score;
    });
    const mean = (nums: Array<number | null>) => {
      const present = nums.filter((item): item is number => item !== null);
      return present.reduce((sum, item) => sum + item, 0) / present.length;
    };
    const meanFacet = (key: SocialHorizonFacet) => mean(values.map((value) => value.facetMean[key]));
    const meanDistinct = (key: SocialHorizonFacet) => mean(values.map((value) => value.averageDistinctCount[key]));
    const score = mean(values.map((value) => value.score));
    const court = meanFacet("courtmates");
    const opponent = meanFacet("opponents");
    const partner = meanFacet("partners");
    const distinct = facets.map((facet) => meanDistinct(facet).toFixed(2)).join(" / ");
    lines.push(`| ${format} | ${pct(score)} | ${pct(court)} | ${pct(opponent)} | ${pct(partner)} | ${distinct} |`);
  }
  lines.push("", "Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.", "");
  return lines.join("\n");
}

describe("social horizon 321 benchmark export", () => {
  it.skipIf(!enabled)("runs exact completed-match horizons and checks scores against completed layouts", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_HORIZON_SEEDS);
    const enginePolicy = process.env.BENCHMARK_HORIZON_POLICY ?? "current";
    const targetMatches = Number(process.env.BENCHMARK_HORIZON_TARGET_MATCHES ?? "21");
    const coverageGainMetric = process.env.BENCHMARK_HORIZON_COVERAGE_GAIN_METRIC === "social-horizon-321"
      ? "social-horizon-321"
      : "legacy-equal";
    if (targetMatches !== 21 && targetMatches !== 400) throw new Error("Horizon benchmark target must be 21 or 400 completed matches.");
    const sourceRevision = process.env.BENCHMARK_HORIZON_SOURCE_REVISION ?? "recorded by runner";
    const sourceProvenance = process.env.BENCHMARK_HORIZON_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_HORIZON_SOURCE_PROVENANCE)
      : undefined;
    const jsonPath = process.env.BENCHMARK_HORIZON_OUTPUT_JSON;
    const markdownPath = process.env.BENCHMARK_HORIZON_OUTPUT_MARKDOWN;
    if (!jsonPath || !markdownPath) throw new Error("The horizon runner must provide JSON and Markdown output paths.");
    if (resolve(jsonPath) === resolve(markdownPath)) throw new Error("Horizon JSON and Markdown outputs must use distinct paths.");

    const report = runSocialHorizonCoverageBenchmark({
      seeds,
      enginePolicy: enginePolicy as "current" | "strict" | "baseline" | "type-first" | "replay-envelope",
      sourceRevision,
      sourceProvenance,
      targetMatches,
      coverageGainMetric,
    });
    const reportForDisk = { ...report, validationStatus: "pending" };
    const jsonAbsolutePath = resolve(jsonPath);
    const markdownAbsolutePath = resolve(markdownPath);
    const pendingPath = `${jsonAbsolutePath}.pending`;
    mkdirSync(dirname(jsonAbsolutePath), { recursive: true });
    mkdirSync(dirname(markdownAbsolutePath), { recursive: true });
    writeFileSync(pendingPath, `${JSON.stringify(reportForDisk, null, 2)}\n`, "utf8");

    expect(report.schemaVersion).toBe("social-horizon-321-v1");
    expect(report.targetMatches).toBe(targetMatches);
    expect(report.seeds).toEqual(seeds);
    expect(report.sessions).toHaveLength(seeds.length * 3);

    for (const session of report.sessions) {
      const checkpoint21 = session.checkpoints["21"];
      const targetCheckpoint = session.checkpoints[String(targetMatches)];
      const completedHistory = session.completedHistory;
      const horizon21 = checkpoint21.socialHorizon321;
      const horizonTarget = targetCheckpoint.socialHorizon321;
      if (!completedHistory || !horizon21 || !horizonTarget) throw new Error("The horizon report is missing its completed history or score details.");
      expect(checkpoint21.completedMatches).toBe(21);
      expect(targetCheckpoint.completedMatches).toBe(targetMatches);
      expect(completedHistory).toHaveLength(targetMatches);
      expect(completedHistory.map((match) => match.completedMatchNumber)).toEqual(
        Array.from({ length: targetMatches }, (_, index) => index + 1)
      );
      expect(checkpoint21.playerMatchCounts).toHaveLength(14);
      expect(checkpoint21.playerMatchCounts.reduce((sum, player) => sum + player.matchesPlayed, 0)).toBe(84);
      expect(targetCheckpoint.playerMatchCounts.reduce((sum, player) => sum + player.matchesPlayed, 0)).toBe(targetMatches * 4);

      for (const completedMatch of completedHistory) {
        const ids = [...completedMatch.team1, ...completedMatch.team2];
        expect(completedMatch.team1).toHaveLength(2);
        expect(completedMatch.team2).toHaveLength(2);
        expect(new Set(ids).size).toBe(4);
      }

      for (const count of [21, targetMatches] as const) {
        const layouts = completedHistory.slice(0, count);
        const independentlyScored = independentScoreFromCompletedLayouts(
          (count === 21 ? horizon21 : horizonTarget).players.map((player) => player.userId),
          layouts
        );
        expectSameScore(count === 21 ? horizon21 : horizonTarget, independentlyScored);
      }
      const meanUnique = (facet: SocialHorizonFacet) =>
        horizon21.players.reduce((sum, player) => sum + player.facets[facet].uniqueCount, 0) / horizon21.players.length;
      expect(meanUnique("partners")).toBeLessThanOrEqual(6);
      expect(meanUnique("opponents")).toBeLessThanOrEqual(12);
      expect(meanUnique("courtmates")).toBeLessThanOrEqual(13);
      expect(horizon21.score).toBeCloseTo((3 * horizon21.facetMean.courtmates! +
        2 * horizon21.facetMean.opponents! + horizon21.facetMean.partners!) / 6, 12);
    }

    const validatedReport = { ...report, validationStatus: "passed" };
    writeAtomically(markdownAbsolutePath, `${formatMarkdown(report)}\n`);
    writeAtomically(jsonAbsolutePath, `${JSON.stringify(validatedReport, null, 2)}\n`);
    unlinkSync(pendingPath);
  }, 1_800_000);
});
