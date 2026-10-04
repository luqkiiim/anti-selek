import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode, SessionType } from "../../../types/enums";
import { buildSocialVarietyContext, buildSocialVarietySnapshot } from "./socialVariety";
import {
  advanceReplayOriginOnCompletion,
  classifyReplayOriginForBenchmark,
  findLowerZeroTypeGainCompetitor,
  formatBenchmarkHuman,
  getLegacySocialRestVectorForBenchmark,
  measureIndependentCoverageGainForBenchmark,
  matchBenchmarkBaselineToCurrentSessions,
  runSocialCoverageRegressionProbe,
  runSocialCoverageBenchmark,
  type BenchmarkReport,
} from "./socialCoverageBenchmark";

const runManualBenchmark = process.env.RUN_SOCIAL_COVERAGE_BENCHMARK === "1";
const renderSavedReport = process.env.RUN_SOCIAL_COVERAGE_REPORT_RENDER === "1";
const historicalPolicy = ["baseline", "strict", "type-first", "replay-envelope"].includes(process.env.BENCHMARK_ENGINE_POLICY ?? "");

function parseSeeds(value: string | undefined, fallback: number[]) {
  if (!value?.trim()) return fallback;
  return value.split(",").map((seed) => Number(seed.trim())).filter(Number.isFinite);
}

describe("social relationship coverage benchmark", () => {
  it("retains the baseline entropy-first total-rest then descending-rest tie vector", () => {
    expect(getLegacySocialRestVectorForBenchmark([-1, -2, -3, -4])).toEqual([-10, -1, -4, -3, -2, -1]);
  });

  it("matches a presentation baseline to the current profile, format, and seed subset", () => {
    const session = (profile: "narrow" | "wide", sessionType: SessionType, seed: number) => ({ profile, sessionType, seed });
    const current = { sessions: [session("narrow", SessionType.SOCIAL_MIX, 1)] } as unknown as BenchmarkReport;
    const baseline = {
      seedCount: 2,
      wideSeedCount: 1,
      sessions: [
        session("narrow", SessionType.SOCIAL_MIX, 1),
        session("narrow", SessionType.SOCIAL_MIX, 4729),
        session("narrow", SessionType.POINTS, 1),
        session("wide", SessionType.POINTS, 30011),
      ],
    } as unknown as BenchmarkReport;

    const matched = matchBenchmarkBaselineToCurrentSessions(current, baseline);
    expect(matched.sessions).toEqual([session("narrow", SessionType.SOCIAL_MIX, 1)]);
    expect(matched.seedCount).toBe(1);
    expect(matched.wideSeedCount).toBe(0);
  });

  it.skipIf(historicalPolicy)("independently scores first exposures over the shared four-facet vocabulary", async () => {
    const { createSocialVarietyCoverageScorer } = await import("./socialVariety");
    const players = Array.from({ length: 4 }, (_value, index) => ({
      userId: `P${index + 1}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      strength: 10 + index,
      gender: index < 2 ? PlayerGender.MALE : PlayerGender.FEMALE,
      partnerPreference: index < 2 ? PartnerPreference.OPEN : PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: null,
    }));
    const partition = {
      team1: ["P1", "P3"] as [string, string],
      team2: ["P2", "P4"] as [string, string],
    };
    const context = buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO });
    const oracleGain = measureIndependentCoverageGainForBenchmark(partition, players, []);
    const sharedScorer = createSocialVarietyCoverageScorer(context);
    const sharedUnits = sharedScorer.getPartitionGainUnits(partition);
    expect(BigInt(oracleGain.numerator)).toBe(sharedUnits);
    expect(BigInt(oracleGain.denominator)).toBe(sharedScorer.denominator);
    expect(oracleGain.normalized).toBe(sharedScorer.toNormalizedScore(sharedUnits));
    expect(sharedUnits > BigInt(0)).toBe(true);

    const priorMatch = { ...partition, socialVariety: buildSocialVarietySnapshot(partition, players) };
    const repeatedGain = measureIndependentCoverageGainForBenchmark(partition, players, [priorMatch]);
    expect(BigInt(repeatedGain.numerator)).toBe(BigInt(0));
  });

  it.skipIf(!renderSavedReport)("renders a saved benchmark report without rerunning its simulation", () => {
    const reportPath = process.env.BENCHMARK_RENDER_REPORT_JSON;
    const outputPath = process.env.BENCHMARK_RENDER_OUTPUT_MARKDOWN;
    if (!reportPath || !outputPath) throw new Error("Set BENCHMARK_RENDER_REPORT_JSON and BENCHMARK_RENDER_OUTPUT_MARKDOWN.");
    const report = JSON.parse(readFileSync(resolve(reportPath), "utf8")) as BenchmarkReport;
    const baselinePath = process.env.BENCHMARK_RENDER_BASELINE_JSON;
    const baseline = baselinePath ? JSON.parse(readFileSync(resolve(baselinePath), "utf8")) as BenchmarkReport : undefined;
    mkdirSync(dirname(resolve(outputPath)), { recursive: true });
    writeFileSync(resolve(outputPath), `${formatBenchmarkHuman(report, baseline).trimEnd()}\n`, "utf8");
  });

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
    }, "type-first")).toBe("type_entropy_priority_override");
    expect(classifyReplayOriginForBenchmark({
      ...replayTrace,
      acceptedPlusOneReplay: true,
    }, "replay-envelope")).toBe("accepted_plus_one_replay_origin");
    origin = advanceReplayOriginOnCompletion(origin, null); // a rest-positive match completed
    expect(origin).toBeNull();
  });

  it.skipIf(!runManualBenchmark)("runs and saves deterministic asynchronous session checkpoints", () => {
    const seeds = parseSeeds(process.env.BENCHMARK_SEEDS, [1, 4729, 104729, 130363, 2097593]);
    const wideSeeds = parseSeeds(process.env.BENCHMARK_WIDE_SEEDS, [30011, 65537, 999983]);
    const includeWide = process.env.BENCHMARK_INCLUDE_WIDE !== "0";
    const requestedPolicy = process.env.BENCHMARK_ENGINE_POLICY;
    const enginePolicy = requestedPolicy === "baseline" || requestedPolicy === "strict" ||
      requestedPolicy === "type-first" || requestedPolicy === "replay-envelope"
      ? requestedPolicy : "current";
    const sourceRevision = process.env.BENCHMARK_SOURCE_REVISION ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const sourceProvenance = process.env.BENCHMARK_SOURCE_PROVENANCE
      ? JSON.parse(process.env.BENCHMARK_SOURCE_PROVENANCE)
      : { commitSha: sourceRevision, workingTreeDirty: false, workingTreeNote: "No extra change note supplied.", policyLabel: enginePolicy, engineSourceSha256: null, measurementHarnessSha256: null, coreEngineTrackedDiffPaths: [], sharedVarietyTrackedDiffPaths: [], measurementHarnessTrackedDiffPaths: [] };
    const report = runSocialCoverageBenchmark({ seeds, wideSeeds, includeWide, enginePolicy, sourceRevision, sourceProvenance });

    for (const session of report.sessions) {
      const checkpoint21 = session.checkpoints["21"];
      expect(checkpoint21.completedMatches).toBe(21);
      expect(session.checkpoints["400"].completedMatches).toBe(400);
      expect(checkpoint21.playerMatchCounts).toHaveLength(14);
      expect(checkpoint21.playerMatchCounts.reduce((sum, item) => sum + item.matchesPlayed, 0)).toBe(84);
      expect(checkpoint21.minimumPlayerMatchCount).toBe(Math.min(...checkpoint21.playerMatchCounts.map((item) => item.matchesPlayed)));
      expect(checkpoint21.maximumPlayerMatchCount).toBe(Math.max(...checkpoint21.playerMatchCounts.map((item) => item.matchesPlayed)));
      expect(checkpoint21.matchCountSpread).toBe(checkpoint21.maximumPlayerMatchCount - checkpoint21.minimumPlayerMatchCount);
      expect(checkpoint21.allPlayersExactlySixMatches).toBe(checkpoint21.playerMatchCounts.every((item) => item.matchesPlayed === 6));
      expect(session.completedMatchTypes).toHaveLength(400);
      expect(checkpoint21.completedMatchTypeCounts.MIXED + checkpoint21.completedMatchTypeCounts.OWN_SIDE).toBe(21);
      expect(session.checkpoints["400"].completedMatchTypeCounts.MIXED + session.checkpoints["400"].completedMatchTypeCounts.OWN_SIDE).toBe(400);
      expect(checkpoint21.completedMatchTypeCounts.MIXED).toBe(session.completedMatchTypes.slice(0, 21).filter((type) => type === "MIXED").length);
      expect(checkpoint21.completedMatchTypeCounts.OWN_SIDE).toBe(session.completedMatchTypes.slice(0, 21).filter((type) => type === "OWN_SIDE").length);
      expect(checkpoint21.coverageGate.refillDecisions).toBe(20);
      // Twenty-one completed matches can create at most forty-two new partner pairs.
      expect(session.structuralOpportunityAudit.partnerPairs).toBe(91);
      expect(checkpoint21.partnerCoverage).toBeLessThanOrEqual(42 / 91 + 1e-12);
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
        const checkpoint400 = session.checkpoints["400"];
        const replay = checkpoint400.replayEnvelope;
        const gate = checkpoint400.coverageGate;
        expect(replay.policyApplied).toBe(true);
        expect(replay.productionReplayEnvelopeCertifiedDecisions).toBe(replay.productionRefillDecisions);
        expect(replay.productionUncertifiedDecisions).toBe(0);
        expect(replay.acceptedPlusOneDecisions).toBeLessThanOrEqual(replay.productionReplayEnvelopeCertifiedDecisions);
        expect(gate.policyApplied).toBe(true);
        expect(gate.refillDecisions).toBe(399);
        expect(gate.certifiedDecisions).toBe(gate.refillDecisions);
        expect(gate.uncertifiedDecisions).toBe(0);
        expect(gate.noStarvationCertifiedDecisions).toBe(gate.noStarvationRefillDecisions);
        expect(gate.noStarvationUncertifiedDecisions).toBe(0);
        for (const witness of replay.witnesses) {
          expect(witness.allowedImmediateReplayCount).toBe(witness.bestImmediateReplayCount + 1);
          expect(witness.chosenImmediateReplayCount).toBeLessThanOrEqual(witness.allowedImmediateReplayCount);
          expect(witness.selected.zeroRestCount).toBe(witness.chosenImmediateReplayCount);
          if (witness.strongestRejectedCandidate) {
            expect(witness.strongestRejectedCandidate.zeroRestCount).toBeGreaterThan(witness.allowedImmediateReplayCount);
            expect(witness.strongestRejectedCandidate.effectiveCombinedEntropyGain).toBeGreaterThan(witness.selected.effectiveCombinedEntropyGain);
          }
        }
        for (const witness of gate.witnesses) {
          expect(witness.allowedImmediateReplayCount).toBe(witness.bestImmediateReplayCount + 1);
          expect(witness.chosenImmediateReplayCount).toBeLessThanOrEqual(witness.allowedImmediateReplayCount);
          expect(witness.chosenReplayCoverageEligible).toBe(true);
          expect(witness.minimumReplayCoverageGainIsZero)
            .toBe(witness.bestMinimumReplayCoverageGain === 0);
          if (witness.chosenImmediateReplayCount === witness.bestImmediateReplayCount + 1) {
            expect(witness.chosenImmediateCoverageGain).toBeGreaterThan(witness.bestMinimumReplayCoverageGain);
          }
          if (witness.bestCoverageRejectedPlusOne) {
            expect(witness.bestCoverageRejectedPlusOne.zeroRestCount).toBe(witness.bestImmediateReplayCount + 1);
            expect(witness.bestCoverageRejectedPlusOne.immediateCoverageGain)
              .toBeLessThanOrEqual(witness.bestMinimumReplayCoverageGain);
          }
          if (witness.higherTypeGainRejectedPlusOne) {
            expect(witness.higherTypeGainRejectedPlusOne.zeroRestCount).toBe(witness.bestImmediateReplayCount + 1);
            expect(witness.higherTypeGainRejectedPlusOne.immediateCoverageGainNumerator).toBe("0");
            expect(witness.selected.immediateCoverageGainNumerator).toBe("0");
            expect(witness.higherTypeGainRejectedPlusOne.effectiveMatchTypeGain)
              .toBeGreaterThan(witness.selected.effectiveMatchTypeGain);
            expect(witness.higherTypeGainRejectedPlusOneCandidateCount).toBeGreaterThan(0);
            expect(witness.fairnessVector).toHaveLength(9);
            expect(witness.starvationVector).toHaveLength(3);
          }
        }
        for (const episode of session.fiveGapEpisodes) {
          if (episode.classification === "accepted_plus_one_replay_origin") {
            expect(episode.initiatingReplay?.acceptedPlusOneReplay).toBe(true);
            expect(episode.initiatingReplay?.marginalPlayerAttribution).toBe("decision_level_only");
          }
        }
        expect(gate.zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions).toBeGreaterThan(0);
        expect(gate.zeroCoverageFrontierHigherTypeGainRejectedPlusOneCandidates)
          .toBeGreaterThanOrEqual(gate.zeroCoverageFrontierHigherTypeGainRejectedPlusOneDecisions);
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
