import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  advanceReplayOriginOnCompletion,
  classifyReplayOriginForBenchmark,
  formatBenchmarkHuman,
  runSocialCoverageBenchmark,
  type BenchmarkReport,
} from "./socialCoverageBenchmark";

const runManualBenchmark = process.env.RUN_SOCIAL_COVERAGE_BENCHMARK === "1";

function parseSeeds(value: string | undefined, fallback: number[]) {
  if (!value?.trim()) return fallback;
  return value.split(",").map((seed) => Number(seed.trim())).filter(Number.isFinite);
}

describe("social relationship coverage benchmark", () => {
  it("carries a rest-zero replay witness into its following rest episode, then clears it on completion", () => {
    const replayTrace = {
      assignmentId: "decision-2-court-0",
      assignedAfterCompletedMatches: 8,
      priorOwnCompletionEvent: 8,
      fairAlternativeSetsWithoutPlayer: 120,
      starvationEquivalentAlternativeSetsWithoutPlayer: 90,
      balanceAdmissibleAlternativeSetsWithoutPlayer: 70,
      smootherBalanceAdmissibleSetsWithoutPlayer: 5,
    };
    let origin = null as typeof replayTrace | null;
    expect(origin).toBeNull(); // the immediate replay has not completed yet
    origin = advanceReplayOriginOnCompletion(origin, replayTrace);
    const laterLongWait = { restGap: 5, initiatingReplay: origin };
    expect(laterLongWait.initiatingReplay?.assignmentId).toBe(replayTrace.assignmentId);
    expect(classifyReplayOriginForBenchmark(laterLongWait.initiatingReplay!)).toBe("avoidable_equal_priority_smoother_alternative");
    origin = advanceReplayOriginOnCompletion(origin, null); // a rest-positive match completed
    expect(origin).toBeNull();
  });

  it.skipIf(!runManualBenchmark)("runs and saves deterministic asynchronous session checkpoints", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_SEEDS, [1, 4729, 104729, 130363, 2097593]);
    const wideSeeds = parseSeeds(process.env.BENCHMARK_WIDE_SEEDS, [30011, 65537, 999983]);
    const includeWide = process.env.BENCHMARK_INCLUDE_WIDE !== "0";
    const enginePolicy = process.env.BENCHMARK_ENGINE_POLICY === "baseline" ? "baseline" : "current";
    const sourceRevision = process.env.BENCHMARK_SOURCE_REVISION ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const report = runSocialCoverageBenchmark({ seeds, wideSeeds, includeWide, enginePolicy, sourceRevision });

    for (const session of report.sessions) {
      expect(session.checkpoints["20"].completedMatches).toBe(20);
      expect(session.checkpoints["400"].completedMatches).toBe(400);
      // Twenty completed matches can create at most forty new partner pairs.
      expect(session.structuralOpportunityAudit.partnerPairs).toBe(91);
      expect(session.checkpoints["20"].partnerCoverage).toBeLessThanOrEqual(40 / 91 + 1e-12);
      if (enginePolicy === "current") for (const episode of session.fiveGapEpisodes) {
        if (episode.currentWaitClassification === "cadence_tie_later_tiebreak") {
          expect(episode.cadenceOptimalAlternativeWitness?.bestCandidateVsChosenCadence).toBe("equal");
        }
        if (episode.currentWaitClassification === "avoidable_equal_priority_smoother_alternative") {
          expect(episode.strictlyBetterCadenceWitness?.bestCandidateVsChosenCadence).toBe("strictly_better");
        }
        if (episode.currentWaitClassification === "cadence_priority_exclusion") {
          expect(episode.cadenceSuboptimalAlternativeWitness?.bestCandidateVsChosenCadence).toBe("worse");
        }
      }
    }
    for (const seed of seeds) {
      const sameSeed = report.sessions.filter((session) => session.profile === "narrow" && session.seed === seed);
      expect(new Set(sameSeed.map((session) => JSON.stringify(session.externalCompletionSchedule))).size).toBe(1);
    }

    const baselinePath = process.env.BENCHMARK_BASELINE_JSON;
    const baseline = baselinePath
      ? JSON.parse(readFileSync(baselinePath, "utf8")) as BenchmarkReport
      : undefined;
    const jsonPath = process.env.BENCHMARK_OUTPUT_JSON;
    const markdownPath = process.env.BENCHMARK_OUTPUT_MARKDOWN;
    if (jsonPath) {
      mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
      writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    if (markdownPath) {
      mkdirSync(dirname(resolve(markdownPath)), { recursive: true });
      writeFileSync(resolve(markdownPath), `${formatBenchmarkHuman(report, baseline)}\n`, "utf8");
    }
  }, 1_800_000);
});
