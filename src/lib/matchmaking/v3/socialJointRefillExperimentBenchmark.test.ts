import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";
import { runSocialJointRefillExperiment } from "./socialJointRefillExperiment";

const runExperiment = process.env.RUN_SOCIAL_JOINT_REFILL_EXPERIMENT === "1";

describe("Social joint-refill experiment bridge", () => {
  it.skipIf(!runExperiment)("writes one scenario as pending raw input for independent validation", async () => {
    const scenarioId = process.env.JOINT_REFILL_SCENARIO_ID;
    const jsonPath = process.env.JOINT_REFILL_JSON_PATH;
    const seedsValue = process.env.JOINT_REFILL_SEEDS;
    const targetValue = process.env.JOINT_REFILL_TARGET_MATCHES;
    const provenanceValue = process.env.JOINT_REFILL_PROVENANCE;
    if (!scenarioId || !jsonPath || !seedsValue || !targetValue || !provenanceValue) {
      throw new Error("The joint-refill runner must set scenario, seeds, target, output, and provenance inputs.");
    }

    const seeds = JSON.parse(seedsValue) as number[];
    const targetCompletedMatches = Number(targetValue);
    const sourceProvenance = JSON.parse(provenanceValue) as Record<string, unknown>;
    if (!Array.isArray(seeds) || seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
      throw new Error("JOINT_REFILL_SEEDS must be a nonempty JSON array of positive safe integers.");
    }
    if (!Number.isSafeInteger(targetCompletedMatches) || targetCompletedMatches < 1 || targetCompletedMatches > 100) {
      throw new Error("JOINT_REFILL_TARGET_MATCHES must be an integer from 1 to 100.");
    }

    const absolutePath = resolve(jsonPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(`${absolutePath}.pending`, JSON.stringify({
      validationStatus: "pending",
      scenarioId,
      seeds,
      targetCompletedMatches,
      sourceProvenance,
    }, null, 2) + "\n", { flag: "wx" });

    const generatedAt = new Date().toISOString();
    const report = await runSocialJointRefillExperiment({
      scenarioIds: [scenarioId],
      seeds,
      targetCompletedMatches,
      onProgress: (session, completedSessions, totalSessions) => {
        console.log(`[joint-refill] ${completedSessions}/${totalSessions} ${session.scenario.id}/${session.engineVersion}/${session.scheduler}/seed${session.seed}: ${session.status}, ${session.completedHistory.length}/${targetCompletedMatches} matches`);
      },
    });

    writeFileSync(absolutePath, JSON.stringify({
      ...report,
      validationStatus: "pending",
      generatedAt,
      sourceProvenance,
    }, null, 2) + "\n", { flag: "wx" });
  }, 10 * 60 * 1000);
});
