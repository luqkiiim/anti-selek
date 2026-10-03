import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import {
  advanceReplayOriginOnCompletion,
  classifyReplayOriginForBenchmark,
  findLowerZeroTypeGainCompetitor,
  formatBenchmarkHuman,
  runSocialCoverageRegressionProbe,
  runSocialCoverageBenchmark,
  type BenchmarkReport,
} from "./socialCoverageBenchmark";

const runManualBenchmark = process.env.RUN_SOCIAL_COVERAGE_BENCHMARK === "1";

function parseSeeds(value: string | undefined, fallback: number[]) {
  if (!value?.trim()) return fallback;
  return value.split(",").map((seed) => Number(seed.trim())).filter(Number.isFinite);
}

describe("social relationship coverage benchmark", () => {
  it.skipIf(runManualBenchmark)("keeps partner variety and both match types recurring in late mixed-session events", () => {
    const sessionTypes = [SessionType.SOCIAL_MIX, SessionType.POINTS, SessionType.ELO] as const;
    const sessions = sessionTypes.map((sessionType) => runSocialCoverageRegressionProbe(sessionType, 4729, 120));
    const schedules = sessions.map((session) => JSON.stringify(session.externalCompletionSchedule));
    expect(new Set(schedules).size).toBe(1);
    for (const session of sessions) {
      const checkpoint = session.checkpoints["120"];
      expect(checkpoint.completedMatches).toBe(120);
      expect(checkpoint.partnerCoverage).toBeGreaterThan(0.75);
      expect(checkpoint.replayEnvelope.policyApplied).toBe(true);
      expect(checkpoint.replayEnvelope.productionReplayEnvelopeCertifiedDecisions)
        .toBe(checkpoint.replayEnvelope.productionRefillDecisions);
      expect(checkpoint.replayEnvelope.productionUncertifiedDecisions).toBe(0);
      expect(checkpoint.replayEnvelope.noStarvationReplayEnvelopeCertifiedDecisions)
        .toBe(checkpoint.replayEnvelope.noStarvationRefillDecisions);
      expect(checkpoint.replayEnvelope.noStarvationUncertifiedDecisions).toBe(0);
      for (const witness of checkpoint.replayEnvelope.witnesses) {
        expect(witness.allowedImmediateReplayCount).toBe(witness.bestImmediateReplayCount + 1);
        expect(witness.chosenImmediateReplayCount).toBeLessThanOrEqual(witness.allowedImmediateReplayCount);
      }
      const lateTypes = session.completedMatchTypes.slice(-20);
      expect(lateTypes).toContain("MIXED");
      expect(lateTypes).toContain("OWN_SIDE");
      expect(session.structuralOpportunityAudit.partnerPairs).toBe(91);
    }
  }, 180_000);

  it("counts a type-priority override only when a stronger-type choice accepts more immediate replays", () => {
    const selected = {
      ids: ["P1", "P2", "P8", "P9"],
      partition: { team1: ["P1", "P8"] as [string, string], team2: ["P2", "P9"] as [string, string] },
      zeroRestCount: 2,
      effectiveMatchTypeGain: 0.8,
      effectiveRelationshipGain: 0.4,
      softRest: [-1, -1, -2, -3],
    };
    const lowerZeroCompetitor = {
      ids: ["P1", "P3", "P8", "P10"],
      partition: { team1: ["P1", "P8"] as [string, string], team2: ["P3", "P10"] as [string, string] },
      zeroRestCount: 1,
      effectiveMatchTypeGain: 0.6,
      effectiveRelationshipGain: 0.9,
      softRest: [-1, -2, -3, -4],
    };
    const strongerTypeButNoReplayAlternative = {
      ids: ["P1", "P4", "P8", "P11"],
      partition: { team1: ["P1", "P8"] as [string, string], team2: ["P4", "P11"] as [string, string] },
      zeroRestCount: 2,
      effectiveMatchTypeGain: 0.9,
      effectiveRelationshipGain: 0.1,
      softRest: [-1, -1, -2, -3],
    };
    expect(findLowerZeroTypeGainCompetitor(selected, [lowerZeroCompetitor, strongerTypeButNoReplayAlternative])).toEqual(lowerZeroCompetitor);
    expect(findLowerZeroTypeGainCompetitor(selected, [strongerTypeButNoReplayAlternative])).toBeNull();
  });

  it("carries a rest-zero replay witness into its following rest episode, then clears it on completion", () => {
    const replayTrace = {
      assignmentId: "decision-2-court-0",
      assignedAfterCompletedMatches: 8,
      priorOwnCompletionEvent: 8,
      fairAlternativeSetsWithoutPlayer: 120,
      starvationEquivalentAlternativeSetsWithoutPlayer: 90,
      balanceAdmissibleAlternativeSetsWithoutPlayer: 70,
      betterZeroRestSetsWithoutPlayer: 5,
      smootherBalanceAdmissibleSetsWithoutPlayer: 5,
      betterTypeGainLowerZeroRestSetsWithoutPlayer: 0,
    };
    let origin = null as typeof replayTrace | null;
    expect(origin).toBeNull(); // the immediate replay has not completed yet
    origin = advanceReplayOriginOnCompletion(origin, replayTrace);
    const laterLongWait = { restGap: 5, initiatingReplay: origin };
    expect(laterLongWait.initiatingReplay?.assignmentId).toBe(replayTrace.assignmentId);
    expect(classifyReplayOriginForBenchmark(laterLongWait.initiatingReplay!)).toBe("avoidable_equal_priority_zero_rest_alternative");
    expect(classifyReplayOriginForBenchmark({
      ...replayTrace,
      betterTypeGainLowerZeroRestSetsWithoutPlayer: 1,
    })).toBe("type_entropy_priority_override");
    origin = advanceReplayOriginOnCompletion(origin, null); // a rest-positive match completed
    expect(origin).toBeNull();
  });

  it.skipIf(!runManualBenchmark)("runs and saves deterministic asynchronous session checkpoints", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_SEEDS, [1, 4729, 104729, 130363, 2097593]);
    const wideSeeds = parseSeeds(process.env.BENCHMARK_WIDE_SEEDS, [30011, 65537, 999983]);
    const includeWide = process.env.BENCHMARK_INCLUDE_WIDE !== "0";
    const enginePolicy = process.env.BENCHMARK_ENGINE_POLICY === "baseline"
      ? "baseline"
      : process.env.BENCHMARK_ENGINE_POLICY === "strict" ? "strict" : "current";
    const sourceRevision = process.env.BENCHMARK_SOURCE_REVISION ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const sourceProvenance = process.env.BENCHMARK_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_SOURCE_PROVENANCE)
      : { commitSha: sourceRevision, workingTreeDirty: false, workingTreeNote: "No extra change note supplied.", policyLabel: enginePolicy, engineSourceSha256: null, measurementHarnessSha256: null, coreEngineTrackedDiffPaths: [], sharedVarietyTrackedDiffPaths: [], measurementHarnessTrackedDiffPaths: [] };
    const report = runSocialCoverageBenchmark({ seeds, wideSeeds, includeWide, enginePolicy, sourceRevision, sourceProvenance });

    for (const session of report.sessions) {
      expect(session.checkpoints["20"].completedMatches).toBe(20);
      expect(session.checkpoints["400"].completedMatches).toBe(400);
      expect(session.completedMatchTypes).toHaveLength(400);
      expect(session.checkpoints["20"].completedMatchTypeCounts.MIXED + session.checkpoints["20"].completedMatchTypeCounts.OWN_SIDE).toBe(20);
      expect(session.checkpoints["400"].completedMatchTypeCounts.MIXED + session.checkpoints["400"].completedMatchTypeCounts.OWN_SIDE).toBe(400);
      expect(session.checkpoints["20"].completedMatchTypeCounts.MIXED).toBe(session.completedMatchTypes.slice(0, 20).filter((type) => type === "MIXED").length);
      expect(session.checkpoints["20"].completedMatchTypeCounts.OWN_SIDE).toBe(session.completedMatchTypes.slice(0, 20).filter((type) => type === "OWN_SIDE").length);
      // Twenty completed matches can create at most forty new partner pairs.
      expect(session.structuralOpportunityAudit.partnerPairs).toBe(91);
      expect(session.checkpoints["20"].partnerCoverage).toBeLessThanOrEqual(40 / 91 + 1e-12);
      if (enginePolicy === "strict") for (const episode of session.fiveGapEpisodes) {
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
      if (enginePolicy === "current") {
        const replay = session.checkpoints["400"].replayEnvelope;
        expect(replay.policyApplied).toBe(true);
        expect(replay.productionReplayEnvelopeCertifiedDecisions).toBe(replay.productionRefillDecisions);
        expect(replay.productionUncertifiedDecisions).toBe(0);
        expect(replay.acceptedPlusOneDecisions).toBeLessThanOrEqual(replay.productionReplayEnvelopeCertifiedDecisions);
        for (const witness of replay.witnesses) {
          expect(witness.allowedImmediateReplayCount).toBe(witness.bestImmediateReplayCount + 1);
          expect(witness.chosenImmediateReplayCount).toBeLessThanOrEqual(witness.allowedImmediateReplayCount);
          expect(witness.selected.zeroRestCount).toBe(witness.chosenImmediateReplayCount);
          if (witness.strongestRejectedCandidate) {
            expect(witness.strongestRejectedCandidate.zeroRestCount).toBeGreaterThan(witness.allowedImmediateReplayCount);
            expect(witness.strongestRejectedCandidate.effectiveCombinedEntropyGain).toBeGreaterThan(witness.selected.effectiveCombinedEntropyGain);
          }
        }
        for (const episode of session.fiveGapEpisodes) {
          if (episode.classification === "accepted_plus_one_replay_origin") {
            expect(episode.initiatingReplay?.acceptedPlusOneReplay).toBe(true);
            expect(episode.initiatingReplay?.marginalPlayerAttribution).toBe("decision_level_only");
          }
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
