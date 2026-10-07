import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateNoCatchUpMatchmakingCredit } from "../matchmakingCredit";
import {
  runSocialGeneralizationBenchmark,
  runSocialGeneralizationSession,
  type SocialGeneralizationArm,
  type SocialGeneralizationBenchmarkReport,
} from "./socialGeneralizationBenchmark";
import type { SocialGeneralizationScenario } from "./socialGeneralizationScenarios";

const runManualBenchmark = process.env.RUN_SOCIAL_GENERALIZATION_BENCHMARK === "1";

function smallScenario(
  id: string,
  initialUpper: number,
  initialLower: number,
  courtCount: number,
  shortHorizonMatches: number,
  events: SocialGeneralizationScenario["events"] = [],
): SocialGeneralizationScenario {
  return { id, initialUpper, initialLower, courtCount, shortHorizonMatches, longDiagnostic: false, events };
}

describe("variable Social court generalization harness", () => {
  it("certifies a single-feasible-type, four-player candidate without inventing a rescue concession", async () => {
    const scenario = smallScenario("contract-single-type", 4, 0, 1, 2);
    const session = await runSocialGeneralizationSession({
      scenario,
      seed: 4729,
      arm: "courtmate-beneficial-rescue",
    });

    expect(session.status).toBe("completed");
    expect(session.completedHistory).toHaveLength(2);
    expect(session.checkpoints.map((checkpoint) => checkpoint.completedMatches)).toEqual([2]);
    expect(session.checkpoints[0]?.scores.structural.typeEligiblePlayerCount).toBe(4);
    expect(session.checkpoints[0]?.scores.structural.oneTypePlayerCount).toBe(4);
    expect(session.decisions.length).toBeGreaterThan(0);
    for (const decision of session.decisions) {
      expect(decision.engine.socialPriorityPolicy).toBe("courtmate-beneficial-rescue");
      expect(decision.engine.priorityCertified).toBe(true);
      expect(decision.audit?.complete).toBe(true);
      expect(decision.audit?.beneficialRescueAdmitted).toBe(true);
      expect(decision.rescue?.chosenCourtmateGainDeficit).toBe(0);
      expect(decision.rescue?.conditionalTypeBenefit).toBeNull();
      expect(decision.assignmentsStarted).toBe(1);
      expect(decision.assignmentRestTurns).toHaveLength(4);
    }
    expect(session.completedHistory.every((match) => match.socialVariety?.courtType === "UPPER")).toBe(true);
  });

  it("applies a late-entry credit to the current nonpaused roster and records the type-vocabulary change", async () => {
    const scenario = smallScenario("contract-late-entry", 4, 3, 1, 6, [
      { type: "join", afterCompletedMatches: 4, players: [{ userId: "P8", side: "LOWER" }] },
    ]);
    const session = await runSocialGeneralizationSession({ scenario, seed: 104729, arm: "production" });

    expect(session.status).toBe("completed");
    expect(session.completedHistory).toHaveLength(6);
    const event = session.eventApplications.find((application) => application.type === "join");
    expect(event?.status).toBe("applied");
    expect(event?.appliedAfterCompletedMatches).toBe(4);
    expect(event?.matchmakingCreditChanges).toHaveLength(1);
    const preJoinCounts = Array.from({ length: 7 }, (_value, index) => {
      const userId = `P${index + 1}`;
      return {
        matchesPlayed: session.completedHistory.slice(0, 4)
          .filter((match) => [...match.team1, ...match.team2].includes(userId)).length,
        matchmakingMatchesCredit: 0,
      };
    });
    const expectedCredit = calculateNoCatchUpMatchmakingCredit({
      player: { matchesPlayed: 0, matchmakingMatchesCredit: 0 },
      activePlayers: preJoinCounts,
    });
    expect(event?.matchmakingCreditChanges?.[0]?.nextCredit).toBe(expectedCredit);
    const afterJoinDecision = session.decisions.find((decision) => decision.afterCompletedMatches === 4);
    const joinedPlayer = afterJoinDecision?.structuralRosterSnapshot.find((player) => player.userId === "P8");
    expect(joinedPlayer?.matchmakingBaseline).toBe(expectedCredit);
    expect(joinedPlayer?.arrivalPriorityAt).not.toBeNull();
    expect(session.checkpoints[0]?.fairness.playerMatchCounts.find((player) => player.userId === "P8")
      ?.matchmakingMatchesCredit).toBe(expectedCredit);
    const oldLowerBefore = event?.structuralBefore?.find((player) => player.userId === "P5");
    const oldLowerAfter = event?.structuralAfter?.find((player) => player.userId === "P5");
    expect(oldLowerBefore?.feasibleMatchTypes).toEqual(["MIXED"]);
    expect(oldLowerAfter?.feasibleMatchTypes).toEqual(["MIXED", "OWN_SIDE"]);
    expect(session.completedHistory.slice(0, 4).every((match) => match.socialVariety?.effectiveSideByUserId)).toBe(true);
  });

  it.skipIf(!runManualBenchmark)("writes one scenario's matched-arm run as pending input for the independent validator", async () => {
    const scenarioId = process.env.GENERALIZATION_SCENARIO_ID;
    const mode = process.env.GENERALIZATION_MODE ?? "short";
    const jsonPath = process.env.GENERALIZATION_JSON_PATH;
    const seedsValue = process.env.GENERALIZATION_SEEDS;
    const provenanceValue = process.env.GENERALIZATION_PROVENANCE;
    if (!scenarioId || !jsonPath || !seedsValue || !provenanceValue) {
      throw new Error("The generalization runner must set scenario, seed, output, and provenance inputs.");
    }
    if (mode !== "short" && mode !== "selected-long") throw new Error("GENERALIZATION_MODE must be short or selected-long.");
    const seeds = JSON.parse(seedsValue) as number[];
    const sourceProvenance = JSON.parse(provenanceValue) as Record<string, unknown>;
    if (!Array.isArray(seeds) || seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
      throw new Error("GENERALIZATION_SEEDS must be a nonempty JSON array of positive safe integers.");
    }
    const scenario = (await import("./socialGeneralizationScenarios")).getSocialGeneralizationScenario(scenarioId);
    const absolutePath = resolve(jsonPath);
    const pendingPath = `${absolutePath}.pending`;
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(pendingPath, JSON.stringify({ validationStatus: "pending", scenarioId, seeds, mode }), { flag: "wx" });
    const generatedAt = new Date().toISOString();
    const sessions: SocialGeneralizationBenchmarkReport["sessions"] = [];
    const writeSnapshot = () => {
      const partialReport = {
        schemaVersion: "social-generalization-v1",
        validationStatus: "pending",
        generatedAt,
        seeds,
        scenarios: [scenario],
        arms: ["production", "courtmate-beneficial-rescue"] as SocialGeneralizationArm[],
        methodology: {
          history: "Completed-only prefix history with assignment-time SocialVarietySnapshots; active reservations are supplied to production selection but excluded from endpoint scores and independent rescue audits.",
          rest: "Discrete completed-match events while available; paused and busy players do not accrue rest turns; no time-based rest. longestOtherCompletionGap counts intervening events only; maximumOwnCompletionEventDistance includes both completion endpoints.",
          arrivalCredit: "Production calculateNoCatchUpMatchmakingCredit applied against all nonpaused roster members, including busy players.",
          departure: "The current production DELETE route rejects a player with match history. A played participant leaving permanently is represented as an indefinite pause and remains in structural opportunity sets.",
          candidatePolicy: "courtmate-beneficial-rescue; unchanged matcher ordering and strict signed rolling-T guard.",
          largeSearch: "The matcher uses its default search budget; production may continue with a returned fair heuristic selection while searchLimitReached is retained, while an uncertified experimental selection stops that candidate session.",
        },
        sourceProvenance,
        sessions,
      };
      writeFileSync(absolutePath, `${JSON.stringify(partialReport, null, 2)}\n`, "utf8");
    };
    writeSnapshot();
    const report = await runSocialGeneralizationBenchmark({
      scenarioIds: [scenarioId],
      seeds,
      includeSelectedLongDiagnostics: mode === "selected-long",
      onProgress: ({ session }) => {
        sessions.push(session);
        writeSnapshot();
        console.info(`[generalization] ${sessions.length}/${seeds.length * 2} ${session.scenarioId} seed=${session.seed} arm=${session.arm} status=${session.status} completed=${session.completedHistory.length}`);
      },
    });
    const finalReport = { ...report, sourceProvenance };
    writeFileSync(absolutePath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
    expect(finalReport.validationStatus).toBe("pending");
    expect(finalReport.sourceProvenance).toEqual(sourceProvenance);
    expect(finalReport.sessions).toHaveLength(seeds.length * 2);
    expect(finalReport.sessions.every((session) => session.status !== "error")).toBe(true);
  }, 1_800_000);
});
