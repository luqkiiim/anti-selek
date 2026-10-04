import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertHorizon21MatchesLegacyPrefix, rescoreSocialHorizonHistory } from "./socialHorizonCoverageReport";
import type { SocialHorizonCoverageReport } from "./socialCoverageBenchmark";
import type { BenchmarkReport } from "./socialCoverageBenchmark";

const enabled = process.env.RUN_SOCIAL_HORIZON_PREFIX_AUDIT === "1";
const artifacts = [
  {
    policy: "baseline",
    horizon: "benchmarks/social-horizon-321/baseline/social-horizon-21-baseline-legacy-gate.json",
    legacy: "benchmarks/social-coverage-21/social-coverage-full21-entropy-first.json",
  },
  {
    policy: "strict",
    horizon: "benchmarks/social-horizon-321/strict/social-horizon-21-strict-legacy-gate.json",
    legacy: "benchmarks/social-coverage-21/social-coverage-full21-strict-cadence.json",
  },
  {
    policy: "type-first",
    horizon: "benchmarks/social-horizon-321/type-first/social-horizon-21-type-first-legacy-gate.json",
    legacy: "benchmarks/social-coverage-21/type-first-final/social-coverage-full21-type-entropy-first.json",
  },
  {
    policy: "replay-envelope",
    horizon: "benchmarks/social-horizon-321/replay-envelope/social-horizon-21-replay-envelope-legacy-gate.json",
    legacy: "benchmarks/social-coverage-21/replay-envelope/social-coverage-full21-replay-envelope.json",
  },
  {
    policy: "current legacy gate",
    horizon: "benchmarks/social-horizon-321/current/social-horizon-21-current-legacy-gate.json",
    legacy: "benchmarks/social-coverage-21/coverage-gated/social-coverage-full21-coverage-gated.json",
  },
] as const;

describe("saved Social Horizon legacy-prefix audit", () => {
  it.skipIf(!enabled)("independently checks the five measured prefixes against their canonical 400-match reports", () => {
    for (const artifact of artifacts) {
      const horizon = JSON.parse(readFileSync(resolve(artifact.horizon), "utf8")) as SocialHorizonCoverageReport & { validationStatus?: string };
      const legacy = JSON.parse(readFileSync(resolve(artifact.legacy), "utf8")) as BenchmarkReport;
      expect(horizon.validationStatus).toBe("passed");
      expect(horizon.schemaVersion).toBe("social-horizon-321-v1");
      expect(horizon.matcherCoverageGainMetric).toBe("legacy-equal");
      const oldByKey = new Map(legacy.sessions.map((session) => [`${session.profile}|${session.sessionType}|${session.seed}`, session]));
      const narrow = horizon.sessions.filter((session) => session.profile === "narrow");
      expect(narrow).toHaveLength(15);
      for (const session of narrow) {
        const key = `${session.profile}|${session.sessionType}|${session.seed}`;
        const oldSession = oldByKey.get(key);
        expect(oldSession, `${artifact.policy} is missing its canonical prefix ${key}`).toBeDefined();
        assertHorizon21MatchesLegacyPrefix(session, oldSession!);
        const independentlyScored = rescoreSocialHorizonHistory(session, 21);
        const stored = session.checkpoints["21"].socialHorizon321;
        expect(stored).toBeDefined();
        expect(independentlyScored.score).toBeCloseTo(stored!.score!, 12);
        for (const facet of ["courtmates", "opponents", "partners"] as const) {
          expect(independentlyScored.facetMean[facet]).toBeCloseTo(stored!.facetMean[facet]!, 12);
          expect(independentlyScored.averageDistinctCount[facet]).toBeCloseTo(stored!.averageDistinctCount[facet]!, 12);
        }
      }
    }
  }, 1_800_000);
});
