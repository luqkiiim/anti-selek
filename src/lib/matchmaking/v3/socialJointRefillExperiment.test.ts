import { describe, expect, it } from "vitest";
import {
  SOCIAL_JOINT_REFILL_SCENARIOS,
  evaluateConditionalWait,
  runSocialJointRefillSession,
  type SocialJointRefillFuturePreview,
  type SocialJointRefillPreview,
} from "./socialJointRefillExperiment";

const SCENARIO_BY_ID = new Map(SOCIAL_JOINT_REFILL_SCENARIOS.map((scenario) => [scenario.id, scenario]));

function scenario(id: string) {
  const found = SCENARIO_BY_ID.get(id);
  if (!found) throw new Error(`Missing Social joint-refill fixture ${id}`);
  return found;
}

function preview(overrides: Partial<SocialJointRefillPreview> = {}): SocialJointRefillPreview {
  return {
    status: "certified",
    certified: true,
    waitCertified: true,
    requiredCertificates: [],
    reasons: [],
      matcherCertificates: {
      selectionReturned: true,
      courtCountCertified: true,
      fairnessCertified: true,
      starvationCertified: true,
      replayCertified: true,
      coverageGateCertified: true,
      coverageGateStatus: "CERTIFIED",
      gMaxCertified: true,
      priorityCertified: true,
      matcherVarietyOptimal: true,
      reportedVarietyOptimal: true,
      searchLimitReached: false,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      exploredBranches: 0,
      prunedBranches: 0,
      chosenCourtmateGain: 0,
      courtmateGainMaximum: 0,
      chosenCourtmateGainDeficit: 0,
      chosenRollingMatchTypeGain: 0,
      bestRollingMatchTypeGainAtGmax: 0,
    },
    availablePlayerIds: [],
    completedHistoryMatchIds: [],
    playerStateSnapshot: [],
    activeReservationSnapshots: [],
    chosenAssignments: [],
    candidateCourtTypes: [],
    feasibleMatchTypePlayerCounts: { MIXED: 0, OWN_SIDE: 0 },
    chosenCourtmateGain: 0,
    courtmateGainMaximum: 0,
    chosenCourtmateGainDeficit: 0,
    chosenRollingMatchTypeGain: 0,
    bestRollingMatchTypeGainAtGmax: 0,
    gains: {
      newCourtmatePairCount: 0,
      rollingMatchTypeGain: 0,
      perCourtNewCourtmatePairs: 0,
      perCourtRollingMatchTypeGain: 0,
    },
    randomDraws: 0,
    randomStateBefore: 1,
    randomStateAfter: 1,
    ...overrides,
  };
}

function future(
  overrides: Partial<SocialJointRefillPreview> = {},
  predictedGapMinutes = 5,
): SocialJointRefillFuturePreview {
  return {
    completionAtMinutes: 25,
    predictedGapMinutes,
    finishingCourtIndices: [1],
    fillCourtIndices: [0, 1],
    remainingBusyCourtIndices: [],
    simulatedCompletionMatchIds: [],
    simulatedRestUpdates: [],
    preview: preview(overrides),
  };
}

function evaluate(
  current: SocialJointRefillPreview,
  next: SocialJointRefillFuturePreview | null,
  options: Partial<Parameters<typeof evaluateConditionalWait>[0]> = {},
) {
  return evaluateConditionalWait({
    scheduler: "conditional-wait",
    isOpening: false,
    currentPreview: current,
    futurePreview: next,
    wakeThresholdMinutes: 5,
    minimumNewCourtmateGainPerCourt: 1,
    minimumRollingTypeGainPerCourt: 0.5,
    ...options,
  });
}

describe("Social conditional joint-refill decision", () => {
  it("treats opening batches, immediate mode, and incomplete certificates as non-waitable", () => {
    const current = preview();
    const later = future({ gains: { ...current.gains, perCourtNewCourtmatePairs: 4 } });

    expect(evaluate(current, later, { isOpening: true })).toEqual({
      waited: false,
      reason: "opening-batch-must-start",
    });
    expect(evaluate(current, later, { scheduler: "immediate" })).toEqual({
      waited: false,
      reason: "not-conditional-arm",
    });
    expect(evaluate(preview({ waitCertified: false }), later)).toEqual({
      waited: false,
      reason: "current-preview-uncertified",
    });
    expect(evaluate(current, future({ waitCertified: false }))).toEqual({
      waited: false,
      reason: "future-preview-uncertified",
    });
  });

  it("uses inclusive per-court C/T thresholds and the inclusive five-minute wake cap", () => {
    const current = preview({
      gains: {
        newCourtmatePairCount: 0,
        rollingMatchTypeGain: 0,
        perCourtNewCourtmatePairs: 2,
        perCourtRollingMatchTypeGain: -0.25,
      },
    });
    const exactCourtmateThreshold = future({
      gains: {
        newCourtmatePairCount: 0,
        rollingMatchTypeGain: 0,
        perCourtNewCourtmatePairs: 3,
        perCourtRollingMatchTypeGain: -0.25,
      },
    });
    expect(evaluate(current, exactCourtmateThreshold)).toEqual({
      waited: true,
      reason: "waited-for-next-completion",
    });

    const exactRollingThreshold = future({
      gains: {
        newCourtmatePairCount: 0,
        rollingMatchTypeGain: 0,
        perCourtNewCourtmatePairs: 2.25,
        perCourtRollingMatchTypeGain: 0.25,
      },
    });
    expect(evaluate(current, exactRollingThreshold)).toEqual({
      waited: true,
      reason: "waited-for-next-completion",
    });
    expect(evaluate(current, future(exactCourtmateThreshold.preview, 5.001))).toEqual({
      waited: false,
      reason: "wake-gap-too-long",
    });

    const belowBoth = future({
      gains: {
        newCourtmatePairCount: 0,
        rollingMatchTypeGain: 0,
        perCourtNewCourtmatePairs: 2.999,
        perCourtRollingMatchTypeGain: 0.249,
      },
    });
    expect(evaluate(current, belowBoth)).toEqual({ waited: false, reason: "no-material-gain" });
  });

  it("declines a future preview with missing gain evidence", () => {
    const current = preview();
    const noC = future({
      gains: {
        newCourtmatePairCount: null,
        rollingMatchTypeGain: null,
        perCourtNewCourtmatePairs: null,
        perCourtRollingMatchTypeGain: null,
      },
    });
    expect(evaluate(current, noC)).toEqual({ waited: false, reason: "future-preview-uncertified" });
    expect(evaluate(current, null)).toEqual({ waited: false, reason: "no-busy-court" });
  });

  it("waits once in the no-bench 8-player case, while immediate refill repeats the completed quartet", async () => {
    const timing = {
      baseDurationMinutes: 20,
      durationJitterFraction: 0,
      wakeThresholdMinutes: 5,
      minimumNewCourtmateGainPerCourt: 1,
      minimumRollingTypeGainPerCourt: 0.5,
      durationMinutesOverrides: {
        "0:1": 20,
        "1:1": 24,
        "0:2": 20,
        "1:2": 20,
      },
    } as const;
    const oneSide = scenario("edge-8-8-0-2c");
    const rejectedLookaheadTiming = {
      ...timing,
      minimumNewCourtmateGainPerCourt: 1_000,
      minimumRollingTypeGainPerCourt: 1_000,
    } as const;
    const [immediate, conditional, rejectedLookahead] = await Promise.all([
      runSocialJointRefillSession({
        scenario: oneSide,
        seed: 4729,
        scheduler: "immediate",
        engineVersion: "courtmate-beneficial-rescue",
        targetCompletedMatches: 4,
        timing,
      }),
      runSocialJointRefillSession({
        scenario: oneSide,
        seed: 4729,
        scheduler: "conditional-wait",
        engineVersion: "courtmate-beneficial-rescue",
        targetCompletedMatches: 4,
        timing,
      }),
      runSocialJointRefillSession({
        scenario: oneSide,
        seed: 4729,
        scheduler: "conditional-wait",
        engineVersion: "courtmate-beneficial-rescue",
        targetCompletedMatches: 4,
        timing: rejectedLookaheadTiming,
      }),
    ]);

    expect(immediate.status).toBe("completed");
    expect(conditional.status).toBe("completed");
    expect(rejectedLookahead.status).toBe("completed");
    expect(immediate.completedHistory).toHaveLength(4);
    expect(conditional.completedHistory).toHaveLength(4);

    const firstWave = immediate.assignments.filter((assignment) => assignment.assignmentOrdinal === 1);
    expect(firstWave).toHaveLength(2);
    expect(new Set(firstWave.flatMap((assignment) => assignment.ids))).toEqual(
      new Set(Array.from({ length: 8 }, (_value, index) => `P${index + 1}`)),
    );
    const firstFinish = firstWave.find((assignment) => assignment.courtIndex === 0);
    expect(firstFinish?.completedAtMinutes).toBe(20);
    const immediateDecision = immediate.decisions.find((decision) =>
      decision.currentlyFreeCourtIndices.length === 1 && decision.atMinutes === 20);
    expect(immediateDecision?.immediatePreview.availablePlayerIds).toEqual(firstFinish?.ids.slice().sort());
    expect(immediateDecision?.immediatePreview.candidateCourtTypes).toEqual(["OWN_SIDE"]);
    expect(immediateDecision?.execution?.chosenAssignments).toHaveLength(1);
    expect(immediateDecision?.execution?.chosenAssignments[0]?.ids.slice().sort()).toEqual(firstFinish?.ids.slice().sort());
    expect(immediateDecision?.execution?.gains.newCourtmatePairCount).toBe(0);

    const waitedDecision = conditional.decisions.find((decision) =>
      decision.currentlyFreeCourtIndices.length === 1 && decision.atMinutes === 20);
    expect(waitedDecision?.futurePreview?.predictedGapMinutes).toBe(4);
    expect(waitedDecision?.futurePreview?.finishingCourtIndices).toEqual([1]);
    expect(waitedDecision?.futurePreview?.fillCourtIndices).toEqual([0, 1]);
    expect(waitedDecision?.futurePreview?.remainingBusyCourtIndices).toEqual([]);
    expect(waitedDecision?.futurePreview?.preview.availablePlayerIds).toHaveLength(8);
    expect(waitedDecision?.futurePreview?.preview.candidateCourtTypes).toEqual(["OWN_SIDE", "OWN_SIDE"]);
    expect(waitedDecision?.futurePreview?.simulatedCompletionMatchIds).toEqual([
      conditional.completedHistory.find((match) => match.id === "M2")?.id,
    ]);
    expect(waitedDecision?.futurePreview?.preview.completedHistoryMatchIds).toHaveLength(2);
    expect(waitedDecision?.immediatePreview.completedHistoryMatchIds).toHaveLength(1);
    expect(waitedDecision?.waited).toBe(true);
    expect(waitedDecision?.waitReason).toBe("waited-for-next-completion");
    expect(waitedDecision?.executedAtMinutes).toBe(24);
    expect(waitedDecision?.executedCourtIndices).toEqual([0, 1]);
    expect(waitedDecision?.execution?.chosenAssignments).toHaveLength(2);
    expect(waitedDecision?.execution?.gains.newCourtmatePairCount).toBeGreaterThan(0);
    expect(conditional.waiting.waitsTaken).toBe(1);

    const assertRandomStreamIsolated = (run: typeof conditional) => {
      let previousDrawsAfter: number | null = null;
      let previousStateAfter: number | null = null;
      for (const decision of run.decisions) {
        if (!decision.execution) continue;
        expect(decision.execution.randomStateBefore).toBe(decision.actualRandomStateBefore);
        expect(decision.execution.randomStateAfter).toBe(decision.actualRandomStateAfter);
        expect(decision.execution.randomDraws).toBe(
          (decision.actualRandomDrawsAfter ?? 0) - (decision.actualRandomDrawsBefore ?? 0),
        );
        expect(decision.immediatePreview.randomStateBefore).toBe(decision.actualRandomStateBefore);
        if (decision.futurePreview) {
          expect(decision.futurePreview.preview.randomStateBefore).toBe(decision.actualRandomStateBefore);
        }
        if (previousDrawsAfter !== null) {
          expect(decision.actualRandomDrawsBefore).toBe(previousDrawsAfter);
          expect(decision.actualRandomStateBefore).toBe(previousStateAfter);
        }
        previousDrawsAfter = decision.actualRandomDrawsAfter;
        previousStateAfter = decision.actualRandomStateAfter;
        expect(decision.execution.matcherCertificates.fairnessCertified).toBe(true);
        expect(decision.execution.matcherCertificates.starvationCertified).toBe(true);
        expect(decision.execution.matcherCertificates.gMaxCertified).toBe(true);
        expect(decision.execution.matcherCertificates.priorityCertified).toBe(true);
        expect(decision.execution.matcherCertificates.matcherVarietyOptimal).toBe(true);
        expect(decision.execution.matcherCertificates.searchLimitReached).toBe(false);
      }
    };
    assertRandomStreamIsolated(conditional);
    assertRandomStreamIsolated(rejectedLookahead);
    const declinedDecision = rejectedLookahead.decisions.find((decision) => decision.atMinutes === 20);
    expect(declinedDecision?.futurePreview).not.toBeNull();
    expect(declinedDecision?.waited).toBe(false);
    expect(declinedDecision?.waitReason).toBe("no-material-gain");
    expect(rejectedLookahead.waiting.waitsTaken).toBe(0);
    const assignmentSignature = (run: typeof immediate) => run.assignments.map((assignment) => ({
      courtIndex: assignment.courtIndex,
      assignmentOrdinal: assignment.assignmentOrdinal,
      ids: [...assignment.ids].sort(),
      team1: [...assignment.partition.team1].sort(),
      team2: [...assignment.partition.team2].sort(),
      plannedDurationMinutes: assignment.plannedDurationMinutes,
    }));
    expect(assignmentSignature(rejectedLookahead)).toEqual(assignmentSignature(immediate));
    expect(rejectedLookahead.completedHistory.map((match) => [match.team1, match.team2]))
      .toEqual(immediate.completedHistory.map((match) => [match.team1, match.team2]));

    const conditionalRefill = conditional.assignments.filter((assignment) => assignment.assignmentOrdinal === 2);
    expect(conditionalRefill).toHaveLength(2);
    const previousFinishByPlayer = new Map<string, number>();
    for (const assignment of firstWave) {
      expect(assignment.completedAtMinutes).not.toBeNull();
      for (const userId of assignment.ids) previousFinishByPlayer.set(userId, assignment.completedAtMinutes!);
    }
    for (const assignment of conditionalRefill) {
      expect(assignment.startedAtMinutes).toBe(24);
      for (const player of assignment.playerStateAtAssignment) {
        expect(player.priorMatchesPlayed).toBe(1);
        const previousFinishAt = previousFinishByPlayer.get(player.userId);
        expect(player.priorCompletedAtMinutes).toBe(previousFinishAt);
        expect(player.elapsedRestMinutes).toBe(24 - previousFinishAt!);
        const futureState = waitedDecision?.futurePreview?.preview.playerStateSnapshot
          .find((snapshot) => snapshot.userId === player.userId);
        expect(futureState?.matchesPlayed).toBe(player.priorMatchesPlayed);
        expect(futureState?.restTurns).toBe(player.restTurns);
        expect(player.restTurns).toBe(previousFinishAt === 20 ? 1 : 0);
      }
    }

    const simulatedRestUpdates = waitedDecision?.futurePreview?.simulatedRestUpdates ?? [];
    expect(simulatedRestUpdates.length).toBeGreaterThan(0);
    for (const update of simulatedRestUpdates) {
      const previewState = waitedDecision?.futurePreview?.preview.playerStateSnapshot
        .find((snapshot) => snapshot.userId === update.userId);
      expect(previewState?.restTurns).toBe(update.after);
    }

    const durationByCourtOrdinal = (run: typeof immediate) => new Map(
      run.assignments.map((assignment) => [
        `${assignment.courtIndex}:${assignment.assignmentOrdinal}`,
        assignment.plannedDurationMinutes,
      ]),
    );
    const immediateDurations = durationByCourtOrdinal(immediate);
    for (const [key, duration] of durationByCourtOrdinal(conditional)) {
      if (immediateDurations.has(key)) expect(duration).toBe(immediateDurations.get(key));
    }
  }, 120_000);

  it("records the 5/5 mixed-lock and its own-side mirror from actual openings", async () => {
    const balanced = scenario("balanced-10-5-5-2c");
    const sessions = await Promise.all([1, 4729, 104729].map((seed) =>
      runSocialJointRefillSession({
        scenario: balanced,
        seed,
        scheduler: "conditional-wait",
        engineVersion: "courtmate-beneficial-rescue",
        targetCompletedMatches: 4,
        timing: {
          baseDurationMinutes: 20,
          durationJitterFraction: 0,
          durationMinutesOverrides: { "0:1": 20, "1:1": 24, "0:2": 20, "1:2": 20 },
        },
      }),
    ));

    let sawMixedOpening = false;
    let sawOwnSideOpening = false;
    for (const session of sessions) {
      expect(session.status).toBe("completed");
      const opening = session.assignments.filter((assignment) => assignment.assignmentOrdinal === 1);
      expect(opening).toHaveLength(2);
      const openingTypes = opening.map((assignment) => assignment.courtType).sort();
      const decision = session.decisions.find((row) => row.atMinutes === 20 && row.currentlyFreeCourtIndices.length === 1);
      expect(decision).toBeDefined();
      const currentSides = countScenarioSides(decision!.availablePlayerIds, 5);
      const future = decision!.futurePreview;
      expect(future?.predictedGapMinutes).toBe(4);
      expect(future?.preview.availablePlayerIds).toHaveLength(10);
      expect(countScenarioSides(future!.preview.availablePlayerIds, 5)).toEqual({ upper: 5, lower: 5 });

      if (openingTypes.every((type) => type === "MIXED")) {
        sawMixedOpening = true;
        expect(currentSides).toEqual({ upper: 3, lower: 3 });
        expect(decision!.immediatePreview.feasibleMatchTypePlayerCounts.OWN_SIDE).toBe(10);
        expect(decision!.immediatePreview.candidateCourtTypes).toEqual(["MIXED"]);
        expect(future!.preview.candidateCourtTypes).toHaveLength(2);
        expect(future!.preview.feasibleMatchTypePlayerCounts.OWN_SIDE).toBe(10);
      } else {
        expect(openingTypes).toEqual(["LOWER", "UPPER"]);
        sawOwnSideOpening = true;
        const currentTypeCounts = decision!.immediatePreview.feasibleMatchTypePlayerCounts;
        expect(currentTypeCounts.MIXED).toBe(10);
        expect(decision!.immediatePreview.candidateCourtTypes).toEqual(["OWN_SIDE"]);
        const firstFinishedOwnCourt = opening.find((assignment) => assignment.courtIndex === 0);
        expect(firstFinishedOwnCourt).toBeDefined();
        expect(currentSides).toEqual(firstFinishedOwnCourt?.courtType === "UPPER"
          ? { upper: 5, lower: 1 }
          : { upper: 1, lower: 5 });
        expect(future!.preview.candidateCourtTypes).toHaveLength(2);
        expect(future!.preview.feasibleMatchTypePlayerCounts.MIXED).toBe(10);
      }
    }
    expect(sawMixedOpening || sawOwnSideOpening).toBe(true);
  }, 120_000);

  it("forecasts a two-court refill after the next of two active courts while the third stays busy", async () => {
    const session = await runSocialJointRefillSession({
      scenario: scenario("balanced-12-6-6-3c"),
      seed: 104729,
      scheduler: "conditional-wait",
      engineVersion: "courtmate-beneficial-rescue",
      targetCompletedMatches: 5,
      timing: {
        baseDurationMinutes: 20,
        durationJitterFraction: 0,
        durationMinutesOverrides: { "0:1": 20, "1:1": 24, "2:1": 28 },
      },
    });

    expect(session.status).toBe("completed");
    const decision = session.decisions.find((row) => row.atMinutes === 20 && row.currentlyFreeCourtIndices.length === 1);
    expect(decision).toBeDefined();
    expect(decision!.futurePreview?.predictedGapMinutes).toBe(4);
    expect(decision!.futurePreview?.fillCourtIndices).toEqual([0, 1]);
    expect(decision!.futurePreview?.remainingBusyCourtIndices).toEqual([2]);
    expect(decision!.futurePreview?.preview.availablePlayerIds).toHaveLength(8);
    expect(decision!.futurePreview?.preview.activeReservationSnapshots.map((row) => row.courtIndex)).toEqual([2]);
    expect(decision!.futurePreview?.preview.playerStateSnapshot.filter((player) => player.isBusy)).toHaveLength(4);
    expect(decision!.waited).toBe(true);
    expect(decision!.execution?.chosenAssignments).toHaveLength(2);
    expect(session.waiting.waitsTaken).toBe(1);
  }, 120_000);

  it("accepts production's recorded heuristic flag while requiring exact candidate executions", async () => {
    const session = await runSocialJointRefillSession({
      scenario: scenario("balanced-10-5-5-2c"),
      seed: 1,
      scheduler: "immediate",
      engineVersion: "production",
      targetCompletedMatches: 4,
      timing: { durationJitterFraction: 0, baseDurationMinutes: 20 },
    });

    expect(session.status).toBe("completed");
    expect(session.completedHistory).toHaveLength(4);
    expect(session.decisions.some((decision) => decision.execution !== null)).toBe(true);
    for (const decision of session.decisions) {
      if (!decision.execution) continue;
      expect(decision.execution.certified).toBe(true);
      expect(decision.execution.matcherCertificates.selectionReturned).toBe(true);
      expect(decision.execution.matcherCertificates.fairnessCertified).toBe(true);
      expect(decision.execution.matcherCertificates.starvationCertified).toBe(true);
      expect(decision.execution.matcherCertificates.replayCertified).toBe(true);
      expect(decision.execution.matcherCertificates.coverageGateCertified).toBe(true);
      expect(decision.execution.matcherCertificates.reportedVarietyOptimal)
        .toBe(decision.execution.matcherCertificates.matcherVarietyOptimal);
    }
  }, 120_000);

  it("stops at completion 100 and censors the other tied three-court finishes", async () => {
    const durationMinutesOverrides: Record<string, number> = {};
    for (let courtIndex = 0; courtIndex < 3; courtIndex += 1) {
      for (let assignmentOrdinal = 1; assignmentOrdinal <= 40; assignmentOrdinal += 1) {
        durationMinutesOverrides[`${courtIndex}:${assignmentOrdinal}`] = 20;
      }
    }
    const session = await runSocialJointRefillSession({
      scenario: scenario("balanced-12-6-6-3c"),
      seed: 1,
      scheduler: "immediate",
      engineVersion: "production",
      targetCompletedMatches: 100,
      timing: { baseDurationMinutes: 20, durationJitterFraction: 0, durationMinutesOverrides },
    });

    expect(session.status).toBe("completed");
    expect(session.completedHistory).toHaveLength(100);
    const cutoffGroup = session.completionGroups.find((group) => group.completedMatchNumbers.includes(100));
    expect(session.completionGroups[0]?.eventIndex).toBe(1);
    expect(cutoffGroup?.completedMatchNumbers).toEqual([100]);
    expect(cutoffGroup?.finishingCourtIndices).toHaveLength(3);
    expect(cutoffGroup?.countedCourtIndices).toHaveLength(1);
    expect(cutoffGroup?.censoredCourtIndices).toHaveLength(2);
    expect(session.assignments.filter((assignment) => assignment.censoredAtTarget)).toHaveLength(2);
    expect(session.assignments.filter((assignment) => assignment.censoredAtTarget)
      .every((assignment) => assignment.completedAtMinutes === null && assignment.completedMatchNumber === null)).toBe(true);
    expect(session.finalTime.elapsedMinutes).toBe(cutoffGroup?.completedAtMinutes);
    const checkpoint = session.checkpoints.find((row) => row.completedMatches === 100);
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.atMinutes).toBe(cutoffGroup?.completedAtMinutes);
    expect(checkpoint?.time.elapsedMinutes).toBe(session.finalTime.elapsedMinutes);
    expect(checkpoint?.time.busyCourtMinutes).toBe(session.finalTime.busyCourtMinutes);
    expect(checkpoint?.time.idleCourtMinutes).toBe(session.finalTime.idleCourtMinutes);
    expect(checkpoint?.time.closedRefillDelayCount).toBe(session.finalTime.closedRefillDelayCount);
    expect(checkpoint?.time.terminalOpenRefillIntervalCount).toBe(session.finalTime.terminalOpenRefillIntervalCount);
  }, 120_000);
});

function countScenarioSides(userIds: readonly string[], upperCount: number) {
  const upper = userIds.filter((userId) => Number(userId.slice(1)) <= upperCount).length;
  return { upper, lower: userIds.length - upper };
}
