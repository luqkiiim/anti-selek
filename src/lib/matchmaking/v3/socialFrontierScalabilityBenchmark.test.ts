import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runSocialFrontierScalabilityBenchmark,
  runSocialFrontierScalabilitySession,
  type SocialFrontierEngineVersion,
  type SocialFrontierScalabilityScenario,
  type SocialFrontierScalabilitySession,
} from "./socialFrontierScalabilityBenchmark";

const runManualBenchmark = process.env.RUN_SOCIAL_FRONTIER_SCALABILITY_BENCHMARK === "1";
const contractEngines: SocialFrontierEngineVersion[] = existsSync(resolve(
  "benchmarks/fixtures/social-frontier-control/src/lib/matchmaking/v3/socialBatch.ts",
)) ? ["original-control", "current"] : ["current"];

function scenario(overrides: Partial<SocialFrontierScalabilityScenario> = {}): SocialFrontierScalabilityScenario {
  return {
    id: "contract-single-type-4-1c",
    upperCount: 4,
    lowerCount: 0,
    courtCount: 1,
    ...overrides,
  };
}

function parseJson<T>(value: string | undefined, label: string): T {
  if (!value) throw new Error(`The frontier runner must provide ${label}.`);
  return JSON.parse(value) as T;
}

describe("Social courtmate frontier scaling harness", () => {
  it.each(contractEngines)("records default-budget timing and a fully certified small batch (%s)", async (engineVersion) => {
    const run = await runSocialFrontierScalabilitySession({
      scenario: scenario(),
      seed: 4729,
      engineVersion,
      targetMatches: 1,
    });
    const decision = run.decisions[0];

    expect(run.status).toBe("completed");
    expect(run.engineVersion).toBe(engineVersion);
    expect(run.completedHistory).toHaveLength(1);
    expect(run.diagnostics.defaultSearchBudgets).toBe(true);
    expect(run.diagnostics.attemptedCalls).toBe(1);
    expect(run.diagnostics.certifiedCalls).toBe(1);
    expect(decision?.kind).toBe("opening");
    expect(decision?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(decision?.executed).toBe(true);
    expect(decision?.result.fairnessCertified).toBe(true);
    expect(decision?.result.starvationCertified).toBe(true);
    expect(decision?.result.courtmateGainMaximumCertified).toBe(true);
    expect(decision?.result.priorityCertified).toBe(true);
    expect(decision?.result.searchLimitReached).toBe(false);
  });

  it("records opening diagnostics without executing the proposal", async () => {
    const run = await runSocialFrontierScalabilitySession({
      scenario: scenario({ id: "contract-opening-only", openingOnly: true }),
      seed: 1,
      targetMatches: 1,
    });

    expect(run.status).toBe("opening-probe");
    expect(run.completedHistory).toHaveLength(0);
    expect(run.decisions).toHaveLength(1);
    expect(run.decisions[0]?.certificationSucceeded).toBe(true);
    expect(run.decisions[0]?.selectedAssignments).toHaveLength(1);
    expect(run.decisions[0]?.executed).toBe(false);
  });

  it.skipIf(!runManualBenchmark)("writes target-sized scaling sessions as pending input for independent comparison", async () => {
    const scenarioId = process.env.FRONTIER_SCALABILITY_SCENARIO_ID;
    const outputPath = process.env.FRONTIER_SCALABILITY_JSON_PATH;
    const seeds = parseJson<number[]>(process.env.FRONTIER_SCALABILITY_SEEDS, "a JSON seed array");
    const targetMatches = Number(process.env.FRONTIER_SCALABILITY_TARGET_MATCHES ?? "100");
    const engineVersions = process.env.FRONTIER_SCALABILITY_ENGINE_VERSIONS
      ? parseJson<SocialFrontierEngineVersion[]>(process.env.FRONTIER_SCALABILITY_ENGINE_VERSIONS, "engine versions")
      : ["original-control", "current"] as const;
    const sourceProvenance = parseJson<Record<string, unknown>>(
      process.env.FRONTIER_SCALABILITY_PROVENANCE,
      "source provenance",
    );
    if (!scenarioId || !outputPath) throw new Error("The frontier runner must provide scenario and output paths.");
    if (!seeds.length || seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
      throw new Error("FRONTIER_SCALABILITY_SEEDS must contain positive safe integers.");
    }
    if (!Number.isSafeInteger(targetMatches) || targetMatches < 1 || targetMatches > 100) {
      throw new Error("FRONTIER_SCALABILITY_TARGET_MATCHES must be between 1 and 100.");
    }
    const absolutePath = resolve(outputPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(`${absolutePath}.pending`, JSON.stringify({ validationStatus: "pending", scenarioId, seeds, engineVersions, targetMatches }), { flag: "wx" });
    const generatedAt = new Date().toISOString();
    const sessions: SocialFrontierScalabilitySession[] = [];
    const writeSnapshot = () => {
      writeFileSync(absolutePath, `${JSON.stringify({
        schemaVersion: "social-frontier-scalability-v1",
        validationStatus: "pending",
        generatedAt,
        seeds,
        targetMatches,
        scenarios: sessions.length ? [sessions[0].scenario] : [],
        policy: "courtmate-beneficial-rescue",
        engineVersions: [...engineVersions],
        methodology: {
          engineBudget: "Default matcher budgets; no candidate/search limit overrides.",
          execution: "Only batches with returned selections and fairness, starvation, Gmax, and full priority certificates execute; uncertified proposals are recorded and stop that session.",
          scheduler: "Park–Miller seeds and asynchronous court completion fallback match the frozen Social generalization harness; active assignments enter socialHistoryMatches, while completedMatches remains completed-only.",
        },
        sourceProvenance,
        sessions,
      }, null, 2)}\n`, "utf8");
    };
    writeSnapshot();
    const report = await runSocialFrontierScalabilityBenchmark({
      scenarioIds: [scenarioId],
      seeds,
      targetMatches,
      engineVersions,
      onProgress: (session, completed, total) => {
        sessions.push(session);
        writeSnapshot();
        console.info(`[frontier-scale] ${completed}/${total} ${scenarioId} engine=${session.engineVersion} seed=${session.seed} status=${session.status} completed=${session.completedHistory.length} calls=${session.diagnostics.attemptedCalls}`);
      },
    });
    const finalReport = { ...report, sourceProvenance };
    writeFileSync(absolutePath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
    expect(finalReport.validationStatus).toBe("pending");
    expect(finalReport.sourceProvenance).toEqual(sourceProvenance);
    expect(finalReport.sessions).toHaveLength(seeds.length * engineVersions.length);
    expect(finalReport.sessions.every((session) => session.status !== "completed" || session.completedHistory.length === targetMatches)).toBe(true);
  }, 1_800_000);
});
