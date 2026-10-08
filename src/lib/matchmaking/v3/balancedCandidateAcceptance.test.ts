import { describe, expect, it, vi } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import {
  isBalancedStrictReplayRescueAdmissible,
  resolveBalancedCandidatePolicy,
  runBalancedCandidateWithProductionFallback,
  verifyBalancedCandidateAcceptance,
  verifyBalancedProductionFallback,
  withBalancedCandidateDecision,
} from "./balancedCandidateAcceptance";
import type {
  BalancedCandidateDecision,
  BalancedCandidateSelectionResult,
} from "./balancedCandidateAcceptance";
import type { BalancedRecurrenceOptions } from "./balancedRecurrence";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import { findBestRotationBatchSelection } from "./socialBatch";
import * as socialBatch from "./socialBatch";
import type { RotationBatchOptions } from "./socialBatch";
import type { MatchmakerV3Player } from "./types";

const makePlayers = (count = 4): MatchmakerV3Player[] => Array.from({ length: count }, (_, index) => ({
  userId: `P${index}`,
  matchesPlayed: 0,
  matchmakingBaseline: 0,
  availableSince: new Date("2026-10-01T00:00:00.000Z"),
  strength: 1000,
  restTurns: 0,
}));

function makeOptions(players: MatchmakerV3Player[], respectPlayerRest = true) {
  const legacy: RotationBatchOptions<MatchmakerV3Player> = {
    courtCount: 1,
    sessionMode: SessionMode.MEXICANO,
    sessionType: SessionType.POINTS,
    respectPlayerRest,
    rotationPlayerCount: players.length,
    completedMatches: [],
    socialHistoryMatches: [],
    randomFn: () => 0,
  };
  const candidate: BalancedRecurrenceOptions<MatchmakerV3Player> = {
    ...legacy,
    sessionType: SessionType.POINTS,
    recurrencePolicy: "strict-replay-rescue",
    socialStructuralOpportunityConstraints: [],
  };
  return { legacy, candidate };
}

function setBalancedCandidateFlag(value: string | undefined): () => void {
  const original = process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED;
  if (value === undefined) delete process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED;
  else process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED = value;
  return () => {
    if (original === undefined) delete process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED;
    else process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED = original;
  };
}

function invalidCandidateResult(
  structuralOpportunityVocabulary: unknown = [],
): BalancedCandidateSelectionResult<MatchmakerV3Player> {
  const debug = {
    fairnessCertified: false,
    scheduleCertified: false,
    starvationCertified: false,
    balanceCertified: false,
    replayCertified: false,
    coverageGateCertified: false,
    recurrenceCertified: false,
    recurrenceFrontierCertified: false,
    recurrenceAdmissionCertified: false,
    selectedAdmissionEligible: false,
    varietyOptimal: false,
    searchLimitReached: false,
    failureReason: null,
    balancedMatureRecurrencePolicy: "strict-replay-rescue",
    structuralOpportunityVocabulary,
  };
  return {
    selection: null,
    debug,
    structuralOpportunityVocabulary,
  } as unknown as BalancedCandidateSelectionResult<MatchmakerV3Player>;
}

function makeCertifiedCandidate() {
  const players = makePlayers();
  const { legacy, candidate } = makeOptions(players);
  const result = findBestBalancedRecurrenceSelection(players, candidate);
  return { players, legacy, candidate, result };
}

describe("Balanced strict replay rescue acceptance boundary", () => {
  it("keeps the strict T exception exact: ties fail, +1 may pass, and +2 always fails", () => {
    const base = {
      chosenReplayCount: 3,
      minimumReplayCount: 2,
      chosenCoverageGainUnits: BigInt(10),
      bestMinimumReplayCoverageGainUnits: BigInt(10),
      chosenMatureDeltaTUnits: BigInt(7),
      bestMatureDeltaTAtMinimumReplayUnits: BigInt(7),
    };
    expect(isBalancedStrictReplayRescueAdmissible(base)).toBe(false);
    expect(isBalancedStrictReplayRescueAdmissible({
      ...base,
      chosenMatureDeltaTUnits: BigInt(8),
    })).toBe(true);
    expect(isBalancedStrictReplayRescueAdmissible({
      ...base,
      chosenReplayCount: 4,
      chosenMatureDeltaTUnits: BigInt(100),
    })).toBe(false);
    expect(isBalancedStrictReplayRescueAdmissible({
      ...base,
      chosenCoverageGainUnits: BigInt(11),
    })).toBe(true);
  });

  it("fails closed on missing mirrored certification and rejects an omitted structural vocabulary", () => {
    const players = makePlayers(6);
    const { legacy, candidate } = makeOptions(players);
    const missingCertificates = verifyBalancedCandidateAcceptance(
      players, candidate, legacy, invalidCandidateResult(),
    );
    expect(missingCertificates).toContain("FAIRNESS_UNCERTIFIED");
    expect(missingCertificates).toContain("RECURRENCE_FRONTIER_UNCERTIFIED");

    const omittedVocabulary = verifyBalancedCandidateAcceptance(
      players, candidate, legacy, invalidCandidateResult([]),
    );
    expect(omittedVocabulary).toContain("STRUCTURAL_OPPORTUNITY_VOCABULARY_MISMATCH");
  });

  it("recomputes a zero-T candidate's structural vocabulary and requires an explicit unconstrained definition", () => {
    const { players, legacy, candidate, result } = makeCertifiedCandidate();
    expect(result.chosenMatureDeltaTUnits).toBe("0");
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, result)).toEqual([]);

    const noDefinition = { ...candidate } as BalancedRecurrenceOptions<MatchmakerV3Player> & {
      socialStructuralOpportunityConstraints?: BalancedRecurrenceOptions<MatchmakerV3Player>["socialStructuralOpportunityConstraints"];
    };
    delete noDefinition.socialStructuralOpportunityConstraints;
    expect(verifyBalancedCandidateAcceptance(
      players, noDefinition as BalancedRecurrenceOptions<MatchmakerV3Player>, legacy, result,
    )).toContain("STRUCTURAL_OPPORTUNITY_DEFINITION_MISSING");

    const omitted = {
      ...result,
      structuralOpportunityVocabulary: [],
    } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, omitted))
      .toContain("STRUCTURAL_OPPORTUNITY_VOCABULARY_MISMATCH");
  });

  it("uses the exact candidate by default when the flag is absent", () => {
    const restoreFlag = setBalancedCandidateFlag(undefined);
    try {
      const players = makePlayers();
      const { legacy, candidate } = makeOptions(players);
      const run = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: legacy,
        candidateOptions: candidate,
      });
      expect(run.decision.requestedPolicy).toBe("strict-replay-rescue");
      expect(run.decision.outcome).toBe("candidate-exact");
      expect(run.decision.appliedPolicy).toBe("strict-replay-rescue");
      expect(run.decision.candidateProof.structuralVocabularyVerified).toBe(true);
      expect(run.decision.fallbackSearch).toBeUndefined();
      expect(run.result.selection?.selections).toHaveLength(1);
    } finally {
      restoreFlag();
    }
  });

  it("honors an explicit strict request even with the rollback switch set", () => {
    const restoreFlag = setBalancedCandidateFlag("0");
    try {
      const players = makePlayers();
      const { legacy, candidate } = makeOptions(players);
      const run = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: legacy,
        candidateOptions: candidate,
        requestedPolicy: "strict-replay-rescue",
      });
      expect(run.decision.outcome).toBe("candidate-exact");
      expect(run.decision.appliedPolicy).toBe("strict-replay-rescue");
      expect(run.decision.candidateProof.structuralVocabularyVerified).toBe(true);
      expect(run.decision.fallbackSearch).toBeUndefined();
      expect(run.result.selection?.selections).toHaveLength(1);
    } finally {
      restoreFlag();
    }
  });

  it("rejects busy, locked, excluded, and altered court layouts using authoritative inputs", () => {
    const { players, legacy, candidate, result } = makeCertifiedCandidate();
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, result)).toEqual([]);
    const chosenIds = result.selection!.selections[0].ids;
    const busyPlayers = players.map((player) => player.userId === chosenIds[0]
      ? { ...player, isBusy: true }
      : player);
    expect(verifyBalancedCandidateAcceptance(busyPlayers, candidate, legacy, result))
      .toContain("INELIGIBLE_PLAYER_SELECTED");

    const locked = { ...candidate, lockedPlayerIds: new Set([chosenIds[0]]) };
    expect(verifyBalancedCandidateAcceptance(players, locked, legacy, result))
      .toContain("LOCKED_INPUT_NOT_CERTIFIED");
    const excluded = { ...candidate, excludedQuartetKeys: new Set([chosenIds.slice().sort().join("|")]) };
    expect(verifyBalancedCandidateAcceptance(players, excluded, legacy, result))
      .toContain("EXCLUDED_QUARTET_SELECTED");

    const alteredSelection = {
      ...result,
      selection: {
        ...result.selection!,
        selections: result.selection!.selections.map((court, index) => index === 0
          ? { ...court, ids: ["missing", ...court.ids.slice(1)] as [string, string, string, string] }
          : court),
      },
    } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, alteredSelection))
      .toContain("AUTHORITATIVE_PLAYER_MISSING");
  });

  it("rejects outer/debug certificate disagreement and falsified exact C, chosen T, or T frontier units", () => {
    const { players, legacy, candidate, result } = makeCertifiedCandidate();
    const replayMismatch = { ...result, replayCertified: false } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, replayMismatch))
      .toContain("REPLAY_UNCERTIFIED");

    const changedCoverageUnits = (BigInt(result.chosenImmediateCoverageGainUnits!) + BigInt(1)).toString();
    const coverageTamper = {
      ...result,
      chosenImmediateCoverageGainUnits: changedCoverageUnits,
      debug: { ...result.debug, chosenImmediateCoverageGainUnits: changedCoverageUnits },
    } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, coverageTamper))
      .toContain("EXACT_COVERAGE_UNITS_INVALID_OR_FALSIFIED");

    const chosenTTamper = {
      ...result,
      chosenMatureDeltaTUnits: "1",
      debug: { ...result.debug, chosenMatureDeltaTUnits: "1" },
    } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, chosenTTamper))
      .toContain("CHOSEN_T_RECOMPUTATION_MISMATCH");

    const frontierTamper = {
      ...result,
      bestMatureDeltaTAtRminUnits: "1",
      debug: { ...result.debug, bestMatureDeltaTAtRminUnits: "1" },
    } as typeof result;
    expect(verifyBalancedCandidateAcceptance(players, candidate, legacy, frontierTamper))
      .toContain("T_FRONTIER_PROOF_INVALID");
  });

  it("defaults to Balanced Points/Elo and honors the explicit rollback switch", () => {
    const restoreFlag = setBalancedCandidateFlag(undefined);
    try {
      expect(resolveBalancedCandidatePolicy(SessionType.POINTS)).toBe("strict-replay-rescue");
      expect(resolveBalancedCandidatePolicy(SessionType.ELO)).toBe("strict-replay-rescue");
      expect(resolveBalancedCandidatePolicy(SessionType.SOCIAL_MIX, "strict-replay-rescue")).toBeUndefined();

      process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED = "0";
      expect(resolveBalancedCandidatePolicy(SessionType.POINTS)).toBeUndefined();
      expect(resolveBalancedCandidatePolicy(SessionType.ELO)).toBeUndefined();
      expect(resolveBalancedCandidatePolicy(SessionType.POINTS, "strict-replay-rescue")).toBe("strict-replay-rescue");

      process.env.BALANCED_RECURRENCE_CANDIDATE_ENABLED = "1";
      expect(resolveBalancedCandidatePolicy(SessionType.POINTS)).toBe("strict-replay-rescue");
      expect(resolveBalancedCandidatePolicy(SessionType.SOCIAL_MIX)).toBeUndefined();
      expect(resolveBalancedCandidatePolicy(SessionType.LADDER, "strict-replay-rescue")).toBeUndefined();
    } finally {
      restoreFlag();
    }
  });

  it("replays the caller's random prefix for rest-disabled production fallback and refuses an uncertified fallback", () => {
    const restoreFlag = setBalancedCandidateFlag(undefined);
    try {
      const players = makePlayers();
      const { legacy: baseLegacy, candidate } = makeOptions(players, false);
      const randomValues = [0.13, 0.27, 0.41, 0.59, 0.73, 0.89];
      let directDraws = 0;
      const direct = findBestRotationBatchSelection(players, {
        ...baseLegacy,
        randomFn: () => randomValues[directDraws++ % randomValues.length],
      });
      let wrapperSourceDraws = 0;
      const legacy = {
        ...baseLegacy,
        randomFn: () => randomValues[wrapperSourceDraws++ % randomValues.length],
      };
      const fallback = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: legacy,
        candidateOptions: candidate,
      });
      expect(fallback.decision.outcome).toBe("production-fallback");
      expect(fallback.decision.reasonCodes).toContain("CANDIDATE_MATCHER_ERROR");
      expect(fallback.decision.reasonCodes).toContain("REPLAY_GATES_DISABLED");
      expect(fallback.decision.fallbackProof).toMatchObject({
        certified: true,
        replayCertified: true,
        coverageGateCertified: true,
        recurrenceCertified: false,
        lateVarietyCertified: false,
      });
      expect(fallback.result.selection?.selections).toHaveLength(1);
      expect(fallback.result.replayEnvelopeStatus).toBe("DISABLED");
      expect(fallback.result.coverageGateStatus).toBe("DISABLED");
      expect(fallback.decision.fallbackSearch?.randomDrawCount).toBe(directDraws);
      expect(fallback.result.selection?.selections.map(({ ids, partition }) => ({ ids, partition })))
        .toEqual(direct.selection?.selections.map(({ ids, partition }) => ({ ids, partition })));

      const coreOnly = {
        ...fallback.result,
        varietyOptimal: false,
        debug: { ...fallback.result.debug, varietyOptimal: false, searchLimitReached: true },
      };
      const coreProof = verifyBalancedProductionFallback(players, legacy, coreOnly);
      expect(coreProof.proof).toMatchObject({ certified: true, certificationScope: "core-only", lateVarietyCertified: false });

      const rejectsEveryQuartet = { isQuartetAllowed: () => false };
      const blocked = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: {
          ...legacy,
          selectionConstraints: rejectsEveryQuartet,
        },
        candidateOptions: { ...candidate, selectionConstraints: rejectsEveryQuartet },
      });
      expect(blocked.decision.outcome).toBe("no-certified-selection");
      expect(blocked.decision.fallbackProof?.certified).toBe(false);
      expect(blocked.result.selection).toBeNull();
      expect(blocked.result.debug.searchLimitReached).toBe(false);
      expect(blocked.result.debug.failureReason).toBe("NOT_ENOUGH_NON_OVERLAPPING_COURTS");
    } finally {
      restoreFlag();
    }
  });

  it("preserves an exhaustive Mixed infeasibility for the caller's court-count retry", () => {
    const restoreFlag = setBalancedCandidateFlag(undefined);
    try {
      const players = makePlayers();
      const { legacy, candidate } = makeOptions(players);
      const rejectsEveryQuartet = { isQuartetAllowed: () => false };
      const mixedLegacy = {
        ...legacy,
        sessionType: SessionType.ELO as const,
        sessionMode: SessionMode.MIXICANO,
        selectionConstraints: rejectsEveryQuartet,
      };
      const mixedCandidate = {
        ...candidate,
        sessionType: SessionType.ELO as const,
        sessionMode: SessionMode.MIXICANO,
        selectionConstraints: rejectsEveryQuartet,
      };
      const run = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: mixedLegacy,
        candidateOptions: mixedCandidate,
      });
      expect(run.decision.outcome).toBe("no-certified-selection");
      expect(run.result.selection).toBeNull();
      expect(run.result.debug.searchLimitReached).toBe(false);
      expect(run.result.debug.failureReason).toBe("NO_VALID_MIXED_QUARTETS");
    } finally {
      restoreFlag();
    }
  });

  it("keeps search-limit fail-closed when a selected production result fails verification", () => {
    const restoreFlag = setBalancedCandidateFlag(undefined);
    try {
      const players = makePlayers();
      const { legacy, candidate } = makeOptions(players, false);
      const validProductionResult = findBestRotationBatchSelection(players, legacy);
      expect(validProductionResult.selection).not.toBeNull();
      const rejectsEveryQuartet = { isQuartetAllowed: () => false };
      const selectorSpy = vi.spyOn(socialBatch, "findBestRotationBatchSelection");
      try {
        selectorSpy.mockReturnValue(validProductionResult);
        const run = runBalancedCandidateWithProductionFallback({
          candidatePlayers: players,
          productionPlayers: players,
          options: {
            ...legacy,
            selectionConstraints: rejectsEveryQuartet,
          },
          candidateOptions: {
            ...candidate,
            selectionConstraints: rejectsEveryQuartet,
          },
        });
        expect(run.decision.outcome).toBe("no-certified-selection");
        expect(run.decision.fallbackProof?.selectionPresent).toBe(true);
        expect(run.decision.reasonCodes).toContain("SCHEDULE_CONSTRAINT_VIOLATED");
        expect(run.result.selection).toBeNull();
        expect(run.result.debug.searchLimitReached).toBe(true);
        expect(run.result.debug.failureReason).toBe("SEARCH_LIMIT_REACHED");
      } finally {
        selectorSpy.mockRestore();
      }
    } finally {
      restoreFlag();
    }
  });

  it("rejects an Rmin+1 production fallback without a strict coverage improvement", () => {
    const players = makePlayers(8).map((player) => ({
      ...player,
      restTurns: player.userId < "P4" ? 0 : 1,
    }));
    const { legacy } = makeOptions(players);
    const production = findBestRotationBatchSelection(players, legacy);
    expect(production.bestImmediateReplayCount).toBe(0);
    expect(production.selection).not.toBeNull();

    // All players have the same history and balance, so this alternate legal
    // quartet has the same first-exposure coverage as the Rmin baseline while
    // containing one immediate replay.
    const ids = ["P0", "P4", "P5", "P6"] as [string, string, string, string];
    const sourceCourt = production.selection!.selections[0];
    const selectedPlayers = ids.map((userId, rank) => {
      const player = players.find((entry) => entry.userId === userId)!;
      return {
        ...player,
        effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline ?? 0),
        restTurns: player.restTurns ?? 0,
        randomScore: sourceCourt.players[0].randomScore,
        rank,
      };
    });
    const malformedProduction = {
      ...production,
      selection: {
        ...production.selection!,
        selections: production.selection!.selections.map((court, index) => index === 0
          ? {
              ...court,
              ids,
              players: selectedPlayers,
              partition: { team1: ["P0", "P4"], team2: ["P5", "P6"] },
            }
          : court),
      },
      chosenImmediateReplayCount: 1,
      chosenReplayCoverageEligible: false,
      debug: {
        ...production.debug,
        chosenQuartets: [ids],
        chosenImmediateReplayCount: 1,
        chosenReplayCoverageEligible: false,
      },
    } as typeof production;

    const validation = verifyBalancedProductionFallback(players, legacy, malformedProduction);
    expect(validation.reasons).toContain("PRODUCTION_FALLBACK_COVERAGE_ADMISSION_VIOLATED");
    expect(validation.proof.certified).toBe(false);
  });

  it("preserves the prior production-only wrapper path when the rollback switch is set", () => {
    const restoreFlag = setBalancedCandidateFlag("0");
    try {
      const players = makePlayers();
      const { legacy } = makeOptions(players, false);
      const direct = findBestRotationBatchSelection(players, legacy);
      const passthrough = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        productionPlayers: players,
        options: legacy,
      });
      expect(passthrough.decision.requestedPolicy).toBe("none");
      expect(passthrough.decision.reasonCodes).toContain("POLICY_NOT_REQUESTED");
      expect(passthrough.result.selection?.selections.map(({ ids, partition }) => ({ ids, partition })))
        .toEqual(direct.selection?.selections.map(({ ids, partition }) => ({ ids, partition })));
    } finally {
      restoreFlag();
    }
  });

  it("adds decision metadata without replacing Social reason fields", () => {
    const decision: BalancedCandidateDecision = {
      version: 1,
      requestedPolicy: "strict-replay-rescue",
      appliedPolicy: "strict-replay-rescue",
      outcome: "candidate-exact",
      reasonCodes: [],
      candidateProof: {
        selectionPresent: true, echoedPolicy: true, fairnessCertified: true, scheduleCertified: true,
        starvationCertified: true, balanceCertified: true, replayCertified: true, coverageGateCertified: true,
        recurrenceFrontierCertified: true, recurrenceAdmissionCertified: true, fullSearchCertified: true,
        structuralVocabularyVerified: true, structuralVocabularyPlayerCount: 4, chosenReplayCount: 0,
        replayMinimum: 0, chosenCoverageGainUnits: "0", chosenMatureDeltaTUnits: "0",
        bestMatureDeltaTAtRminUnits: "0",
      },
      candidateSearch: { exploredBranches: 4, prunedBranches: 0, searchLimitReached: false, elapsedMs: 1, randomDrawCount: 3 },
      wrapperElapsedMs: 1,
    };
    const merged = withBalancedCandidateDecision({
      matchmakingReasonJson: JSON.stringify({ socialPolicyDecision: { applied: "legacy" } }),
      selected: true,
    }, decision);
    expect(JSON.parse(merged.matchmakingReasonJson!).socialPolicyDecision).toEqual({ applied: "legacy" });
    expect(merged.balancedPolicyDecision).toBe(decision);
  });
});
