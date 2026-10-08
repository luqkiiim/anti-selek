import { describe, expect, it, vi } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestBalancedMatureRecurrenceSelection as findFrozenRecurrence } from "./__tests__/fixtures/balancedRecurrenceExhaustive";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import { runBalancedCandidateWithProductionFallback } from "./balancedCandidateAcceptance";
import type { MatchmakerV3Player, SocialHistoryMatch, V3SelectionConstraints } from "./types";

function createPlayers(size = 8): MatchmakerV3Player[] {
  return Array.from({ length: size }, (_value, index) => {
    const upperCount = Math.floor(size / 2);
    const upper = index < upperCount;
    const side = upper ? "U" : "L";
    const sideIndex = upper ? index + 1 : index - upperCount + 1;
    return {
      userId: side + sideIndex,
      matchesPlayed: 7,
      matchmakingBaseline: 7,
      availableSince: new Date("2026-01-01T00:00:00.000Z"),
      restTurns: 1,
      strength: 1000,
      pointDiff: 0,
      gender: upper ? "MALE" : "FEMALE",
      partnerPreference: upper ? "OPEN" : "FEMALE_FLEX",
      mixedSideOverride: upper ? "UPPER" : "LOWER",
      isBusy: false,
      isPaused: false,
    };
  });
}

function openingPlayers(size: number): MatchmakerV3Player[] {
  return createPlayers(size).map((player) => ({
    ...player,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    restTurns: 1,
    isBusy: false,
    isPaused: false,
  }));
}

function completedMatch(
  id: string,
  team1: readonly [string, string],
  team2: readonly [string, string],
  ordinal: number
): SocialHistoryMatch {
  return {
    id,
    team1: [...team1],
    team2: [...team2],
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ordinal)),
  };
}

function matureHistory(): SocialHistoryMatch[] {
  const history = [
    completedMatch("mixed-1", ["U1", "L1"], ["U2", "L2"], 1),
    completedMatch("mixed-2", ["U3", "L3"], ["U4", "L4"], 2),
  ];
  for (let index = 0; index < 6; index += 1) {
    history.push(completedMatch("upper-" + index, ["U1", "U2"], ["U3", "U4"], index + 3));
    history.push(completedMatch("lower-" + index, ["L1", "L2"], ["L3", "L4"], index + 9));
  }
  return history;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = state * 48_271 % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function recurrenceOptions(
  completedMatches: SocialHistoryMatch[],
  overrides: Partial<{
    courtCount: number;
    sessionType: SessionType.POINTS | SessionType.ELO;
    sessionMode: SessionMode;
    rotationPlayerCount: number;
  }> = {}
) {
  return {
    sessionType: (overrides.sessionType ?? SessionType.POINTS) as SessionType.POINTS | SessionType.ELO,
    sessionMode: overrides.sessionMode ?? SessionMode.MIXICANO,
    courtCount: overrides.courtCount ?? 1,
    respectPlayerRest: true,
    rotationPlayerCount: overrides.rotationPlayerCount ?? 8,
    completedMatches,
    socialHistoryMatches: completedMatches,
    socialStructuralOpportunityConstraints: [],
    pairingRandomMode: "combined" as const,
    randomFn: seededRandom(4729),
    recurrencePolicy: "strict-replay-rescue" as const,
  };
}

function quartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function quartetGroupsForRoster(size: number): string[][] {
  const sideCount = Math.floor(size / 2);
  return Array.from({ length: Math.floor(sideCount / 2) }, (_value, index) => {
    const first = index * 2 + 1;
    const second = first + 1;
    return [`U${first}`, `U${second}`, `L${first}`, `L${second}`];
  });
}

function constraintsForQuartets(quartets: readonly (readonly string[])[]): V3SelectionConstraints {
  const allowed = new Set(quartets.map(quartetKey));
  return {
    isQuartetAllowed: (players) => allowed.has(quartetKey(players.map((player) => player.userId))),
  };
}

type RecurrenceTestOverrides = {
  selectionConstraints?: V3SelectionConstraints;
  schedules?: Array<{ rank: number; courts: Array<V3SelectionConstraints | undefined> }>;
  socialStructuralOpportunityConstraints?: V3SelectionConstraints[];
  lockedPlayerIds?: ReadonlySet<string>;
  excludedQuartetKeys?: ReadonlySet<string>;
};

type SharedCertificateFields = {
  scheduleIndex: number | null;
  scheduleCertified: boolean;
  fairnessCertified: boolean;
  starvationCertified: boolean;
  bestImmediateReplayCount: number | null;
  allowedImmediateReplayCount: number | null;
  chosenImmediateReplayCount: number | null;
  replayCertified: boolean;
  replayEnvelopeStatus: string;
  bestMinimumReplayCoverageGain: number | null;
  chosenImmediateCoverageGain: number | null;
  coverageGateCertified: boolean;
  coverageGateStatus: string;
  coverageGainMetric: string;
  chosenReplayCoverageEligible: boolean | null;
  varietyOptimal: boolean;
  balanceCertified?: boolean;
  balancedMatureRecurrencePolicy: string;
  recurrenceCertified: boolean;
  matureTypeEligiblePlayerCount: number;
  firstExposureCompletePlayerCount: number;
  chosenMatureDeltaT: number | null;
  chosenMatureDeltaTUnits: string | null;
  matureDeltaTDenominator: string;
  bestMatureDeltaTAtRmin: number | null;
  bestMatureDeltaTAtRminUnits: string | null;
  bestMatureDeltaTAtRminDenominator: string | null;
  recurrenceFrontierCertified: boolean | null;
  chosenRecurrenceRescue: boolean | null;
  conditionalTBenefit: number | null;
  coverageExceptionEligible: boolean | null;
  recurrenceExceptionEligible: boolean | null;
  recurrenceAdmissionCertified: boolean;
  selectedAdmissionEligible: boolean | null;
  admissionReasons: unknown;
  matureRecurrencePlayers: unknown[];
  debug: { searchLimitReached: boolean };
};

function sharedCertificateFields(result: SharedCertificateFields) {
  return {
    scheduleIndex: result.scheduleIndex,
    scheduleCertified: result.scheduleCertified,
    fairnessCertified: result.fairnessCertified,
    starvationCertified: result.starvationCertified,
    bestImmediateReplayCount: result.bestImmediateReplayCount,
    allowedImmediateReplayCount: result.allowedImmediateReplayCount,
    chosenImmediateReplayCount: result.chosenImmediateReplayCount,
    replayCertified: result.replayCertified,
    replayEnvelopeStatus: result.replayEnvelopeStatus,
    bestMinimumReplayCoverageGain: result.bestMinimumReplayCoverageGain,
    chosenImmediateCoverageGain: result.chosenImmediateCoverageGain,
    coverageGateCertified: result.coverageGateCertified,
    coverageGateStatus: result.coverageGateStatus,
    coverageGainMetric: result.coverageGainMetric,
    chosenReplayCoverageEligible: result.chosenReplayCoverageEligible,
    varietyOptimal: result.varietyOptimal,
    balanceCertified: result.balanceCertified,
    balancedMatureRecurrencePolicy: result.balancedMatureRecurrencePolicy,
    recurrenceCertified: result.recurrenceCertified,
    matureTypeEligiblePlayerCount: result.matureTypeEligiblePlayerCount,
    firstExposureCompletePlayerCount: result.firstExposureCompletePlayerCount,
    chosenMatureDeltaT: result.chosenMatureDeltaT,
    chosenMatureDeltaTUnits: result.chosenMatureDeltaTUnits,
    matureDeltaTDenominator: result.matureDeltaTDenominator,
    bestMatureDeltaTAtRmin: result.bestMatureDeltaTAtRmin,
    bestMatureDeltaTAtRminUnits: result.bestMatureDeltaTAtRminUnits,
    bestMatureDeltaTAtRminDenominator: result.bestMatureDeltaTAtRminDenominator,
    recurrenceFrontierCertified: result.recurrenceFrontierCertified,
    chosenRecurrenceRescue: result.chosenRecurrenceRescue,
    conditionalTBenefit: result.conditionalTBenefit,
    coverageExceptionEligible: result.coverageExceptionEligible,
    recurrenceExceptionEligible: result.recurrenceExceptionEligible,
    recurrenceAdmissionCertified: result.recurrenceAdmissionCertified,
    selectedAdmissionEligible: result.selectedAdmissionEligible,
    admissionReasons: result.admissionReasons,
    matureRecurrencePlayers: result.matureRecurrencePlayers,
    searchLimitReached: result.debug.searchLimitReached,
  };
}

describe("optimized Balanced recurrence exactness", () => {
  it("matches the frozen strict-replay-rescue oracle and exposes full structural opportunities", () => {
    const history = matureHistory();
    const players = createPlayers().map((player) =>
      player.userId === "U4" ? { ...player, isPaused: true } :
        player.userId === "L4" ? { ...player, isBusy: true } : player
    );
    const options = recurrenceOptions(history);
    const frozen = findFrozenRecurrence(createPlayersWithAvailability(players), {
      ...options,
      randomFn: seededRandom(4729),
    });
    const optimized = findBestBalancedRecurrenceSelection(createPlayersWithAvailability(players), {
      ...options,
      randomFn: seededRandom(4729),
    });

    expect(optimized.selection).toEqual(frozen.selection);
    expect(optimized.recurrenceCertified).toBe(frozen.recurrenceCertified);
    expect(optimized.recurrenceFrontierCertified).toBe(frozen.recurrenceFrontierCertified);
    expect(optimized.bestMatureDeltaTAtRminUnits).toBe(frozen.bestMatureDeltaTAtRminUnits);
    expect(optimized.chosenMatureDeltaTUnits).toBe(frozen.chosenMatureDeltaTUnits);
    expect(optimized.admissionReasons).toEqual(frozen.admissionReasons);
    expect(optimized.structuralOpportunityVocabulary.map((row) => row.userId))
      .toEqual(["L1", "L2", "L3", "L4", "U1", "U2", "U3", "U4"]);
    expect(optimized.structuralOpportunityVocabulary.find((row) => row.userId === "U4"))
      .toMatchObject({ feasibleMatchTypes: ["MIXED", "OWN_SIDE"] });
    expect(optimized.structuralOpportunityVocabulary.find((row) => row.userId === "L4"))
      .toMatchObject({ feasibleMatchTypes: ["MIXED", "OWN_SIDE"] });
    expect(optimized.chosenImmediateCoverageGainUnits).toMatch(/^\d+$/);
    expect(optimized.bestMinimumReplayCoverageGainUnits).toMatch(/^\d+$/);
    expect(optimized.coverageGainDenominator).toMatch(/^\d+$/);
    expect(optimized.debug.chosenImmediateCoverageGainUnits).toBe(optimized.chosenImmediateCoverageGainUnits);
    expect(optimized.debug.bestMinimumReplayCoverageGainUnits).toBe(optimized.bestMinimumReplayCoverageGainUnits);
    expect(optimized.debug.coverageGainDenominator).toBe(optimized.coverageGainDenominator);
  });

  it("matches certified layouts and proof fields across practical Points/Elo roster shapes", () => {
    const scenarios = [
      { name: "8 Points / 1 court / empty", size: 8, courts: 1, type: SessionType.POINTS, history: "empty", seed: 1_021 },
      { name: "10 Elo / 1 court / mature constrained lock+exclude", size: 10, courts: 1, type: SessionType.ELO, history: "mature", seed: 90_217, constraintGroups: [0, 1], lock: "U1", excludeGroup: 1 },
      { name: "12 Points / 2 courts / scheduled fallback", size: 12, courts: 2, type: SessionType.POINTS, history: "mature", seed: 88_901, scheduleFallback: true, lock: "U1", excludeGroup: 2 },
      { name: "14 Elo / 2 courts / empty constrained lock+exclude", size: 14, courts: 2, type: SessionType.ELO, history: "empty", seed: 70_003, lock: "U5", excludeGroup: 0 },
      { name: "8 Elo / 2 courts / mature excluded quartet", size: 8, courts: 2, type: SessionType.ELO, history: "mature", seed: 44_729, excludeGroup: 0 },
    ] as const;

    for (const scenario of scenarios) {
      const players = createPlayers(scenario.size);
      const groups = quartetGroupsForRoster(scenario.size);
      const completedMatches = scenario.history === "mature" ? matureHistory() : [];
      const options = recurrenceOptions(completedMatches, {
        courtCount: scenario.courts,
        sessionType: scenario.type,
        rotationPlayerCount: scenario.size,
      });
      const overrides: RecurrenceTestOverrides = {};
      if ("scheduleFallback" in scenario && scenario.scheduleFallback) {
        const oneGroup = constraintsForQuartets([groups[0]!]);
        const allGroups = constraintsForQuartets(groups);
        overrides.schedules = [
          { rank: 0, courts: [oneGroup, oneGroup] },
          { rank: 1, courts: [allGroups, allGroups] },
        ];
        overrides.socialStructuralOpportunityConstraints = [oneGroup, allGroups];
      } else if ("constraintGroups" in scenario) {
        const constraint = constraintsForQuartets(
          scenario.constraintGroups.map((index) => groups[index]!)
        );
        overrides.selectionConstraints = constraint;
        overrides.socialStructuralOpportunityConstraints = [constraint];
      } else if (scenario.size === 14) {
        const constraint = constraintsForQuartets(groups);
        overrides.selectionConstraints = constraint;
        overrides.socialStructuralOpportunityConstraints = [constraint];
      }
      if ("lock" in scenario && scenario.lock) overrides.lockedPlayerIds = new Set([scenario.lock]);
      if ("excludeGroup" in scenario && scenario.excludeGroup !== undefined) {
        overrides.excludedQuartetKeys = new Set([quartetKey(groups[scenario.excludeGroup]!)]);
      }
      const caseOptions = { ...options, ...overrides };
      const optimized = findBestBalancedRecurrenceSelection(players, {
        ...caseOptions,
        randomFn: seededRandom(scenario.seed),
      });
      const frozen = findFrozenRecurrence(players, {
        ...caseOptions,
        randomFn: seededRandom(scenario.seed),
        // Diagnostic-only oracle budget; the optimized selector keeps its
        // unchanged production defaults and every fixture is constrained small.
        searchLimits: { maxBranches: 250_000, maxMs: 10_000 },
      });

      expect(optimized.selection, scenario.name).not.toBeNull();
      expect(frozen.selection, scenario.name).not.toBeNull();
      expect(optimized.debug.searchLimitReached, scenario.name).toBe(false);
      expect(frozen.debug.searchLimitReached, scenario.name).toBe(false);
      expect(optimized.scheduleCertified, scenario.name).toBe(true);
      expect(optimized.fairnessCertified, scenario.name).toBe(true);
      expect(optimized.starvationCertified, scenario.name).toBe(true);
      expect(optimized.replayCertified, scenario.name).toBe(true);
      expect(optimized.coverageGateCertified, scenario.name).toBe(true);
      expect(optimized.balanceCertified, scenario.name).toBe(true);
      expect(optimized.recurrenceFrontierCertified, scenario.name).toBe(true);
      expect(optimized.recurrenceCertified, scenario.name).toBe(true);
      expect(optimized.varietyOptimal, scenario.name).toBe(true);
      expect(optimized.selection, scenario.name).toEqual(frozen.selection);
      expect(sharedCertificateFields(optimized), scenario.name)
        .toEqual(sharedCertificateFields(frozen));
    }
  }, 120_000);

  it("certifies the identically-zero T frontier without an appearance threshold", () => {
    const players = openingPlayers(8);
    const options = recurrenceOptions([], { courtCount: 2 });
    const frozen = findFrozenRecurrence(players, { ...options, randomFn: seededRandom(130_363) });
    const optimized = findBestBalancedRecurrenceSelection(players, {
      ...options,
      randomFn: seededRandom(130_363),
    });

    expect(optimized.recurrenceFrontierCertified).toBe(true);
    expect(optimized.bestMatureDeltaTAtRminUnits).toBe("0");
    expect(optimized.recurrenceCertified).toBe(true);
    expect(optimized.selection).toEqual(frozen.selection);
    expect(optimized.debug.searchLimitReached).toBe(false);
  });

  it("preserves the frozen result for constrained fractional-strength three-court profiles", () => {
    const players = createPlayers(12).map((player, index) => ({
      ...player,
      strength: 1000 + index * 0.1,
      pointDiff: index * 0.13,
    }));
    const allowedQuartets = new Set([
      ["U1", "U2", "L1", "L2"],
      ["U3", "U4", "L3", "L4"],
      ["U5", "U6", "L5", "L6"],
    ].map((ids) => ids.sort().join("|")));
    const constraints: V3SelectionConstraints = {
      isQuartetAllowed: (quartet) => allowedQuartets.has(
        quartet.map((player) => player.userId).sort().join("|")
      ),
    };
    const baseOptions = recurrenceOptions([], { courtCount: 3, rotationPlayerCount: 12 });
    const options = {
      ...baseOptions,
      schedules: [{ rank: 0, courts: [constraints, constraints, constraints] }],
    };
    const frozen = findFrozenRecurrence(players, { ...options, randomFn: seededRandom(57_241) });
    const optimized = findBestBalancedRecurrenceSelection(players, {
      ...options,
      randomFn: seededRandom(57_241),
    });

    expect(optimized.selection).toEqual(frozen.selection);
    expect(optimized.recurrenceCertified).toBe(frozen.recurrenceCertified);
    expect(optimized.recurrenceFrontierCertified).toBe(frozen.recurrenceFrontierCertified);
    expect(optimized.bestMatureDeltaTAtRminUnits).toBe(frozen.bestMatureDeltaTAtRminUnits);
    expect(optimized.chosenMatureDeltaTUnits).toBe(frozen.chosenMatureDeltaTUnits);
    expect(optimized.admissionReasons).toEqual(frozen.admissionReasons);
    expect(optimized.chosenImmediateCoverageGain).toBe(frozen.chosenImmediateCoverageGain);
    expect(optimized.bestMinimumReplayCoverageGain).toBe(frozen.bestMinimumReplayCoverageGain);
  });

  it("fails closed when an explicit branch limit interrupts certification", () => {
    const players = openingPlayers(8);
    const options = recurrenceOptions([], { courtCount: 2 });
    const result = findBestBalancedRecurrenceSelection(players, {
      ...options,
      randomFn: seededRandom(4729),
      searchLimits: { maxBranches: 1, maxMs: 10_000 },
    });

    expect(result.selection).toBeNull();
    expect(result.recurrenceCertified).toBe(false);
    expect(result.recurrenceFrontierCertified).toBe(false);
    expect(result.debug.searchLimitReached).toBe(true);
  });

  it(
    "keeps multi-court openings exact or fails closed within the normal search budget",
    () => {
      for (const [rosterSize, courtCount] of [[16, 2], [15, 3], [16, 3], [18, 3]] as const) {
        const players = openingPlayers(rosterSize);
        const seed = 4729 + rosterSize + courtCount;
        const result = findBestBalancedRecurrenceSelection(players, {
          ...recurrenceOptions([], { courtCount, rotationPlayerCount: rosterSize }),
          randomFn: seededRandom(seed),
        });
        const label = rosterSize + " players / " + courtCount + " courts";
        if (rosterSize === 16 && courtCount === 2) {
          expect(result.selection, label).not.toBeNull();
          expect(result.recurrenceCertified, label).toBe(true);
          expect(result.recurrenceFrontierCertified, label).toBe(true);
          expect(result.debug.searchLimitReached, label).toBe(false);
        }
        if (result.recurrenceCertified) {
          expect(result.selection, label).not.toBeNull();
          expect(result.recurrenceFrontierCertified, label).toBe(true);
          expect(result.varietyOptimal, label).toBe(true);
          expect(result.debug.searchLimitReached, label).toBe(false);
        } else {
          expect(result.selection, label).toBeNull();
          // An earlier T-frontier phase may finish before final ranking hits
          // its budget. That proof cannot certify an incomplete selection.
          expect(result.recurrenceAdmissionCertified, label).toBe(false);
          expect(result.chosenMatureDeltaTUnits, label).toBeNull();
          expect(result.selectedAdmissionEligible, label).toBeNull();
          expect(result.debug.searchLimitReached, label).toBe(true);
        }
      }
    },
    120_000
  );
  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s defaults to a certified candidate or certified fallback for larger multi-court openings",
    (sessionType) => {
      vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", undefined);
      try {
        for (const [rosterSize, courtCount] of [[16, 2], [15, 3], [16, 3], [18, 3]] as const) {
          const players = openingPlayers(rosterSize);
          const options = recurrenceOptions([], { courtCount, rotationPlayerCount: rosterSize, sessionType });
          const run = runBalancedCandidateWithProductionFallback({ candidatePlayers: players, options });
          const label = rosterSize + " players / " + courtCount + " courts";
          expect(run.decision.requestedPolicy, label).toBe("strict-replay-rescue");
          expect(run.result.selection, label).not.toBeNull();
          if (run.decision.outcome === "candidate-exact") {
            expect(run.decision.candidateProof.fullSearchCertified, label).toBe(true);
            expect(run.decision.candidateProof.recurrenceFrontierCertified, label).toBe(true);
            expect(run.decision.candidateProof.recurrenceAdmissionCertified, label).toBe(true);
            expect(run.decision.candidateSearch.searchLimitReached, label).toBe(false);
          } else {
            expect(run.decision.outcome, label).toBe("production-fallback");
            expect(run.decision.fallbackProof?.certified, label).toBe(true);
            expect(run.decision.fallbackProof?.recurrenceCertified, label).toBe(false);
          }
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
    120_000
  );
});

function createPlayersWithAvailability(players: MatchmakerV3Player[]): MatchmakerV3Player[] {
  return players.map((player) => ({ ...player }));
}
