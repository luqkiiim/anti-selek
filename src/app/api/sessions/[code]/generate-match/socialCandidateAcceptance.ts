import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import { isValidPartitionForMode } from "@/lib/matchmaking/v3/balance";
import { createSocialCourtmatePriorityScorer } from "@/lib/matchmaking/v3/socialCourtmatePriority";
import { buildSocialStructuralVarietyContext } from "@/lib/matchmaking/v3/socialVariety";
import { findBestRotationBatchSelection } from "@/lib/matchmaking/v3/socialBatch";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialPriorityPolicy,
  V3DoublesPartition,
} from "@/lib/matchmaking/v3/types";
import { SessionType } from "@/types/enums";
import type {
  RotationBatchOptions,
  SocialBatchResult,
} from "@/lib/matchmaking/v3/socialBatch";

export type SocialCandidatePolicy = Extract<SocialPriorityPolicy, "courtmate-beneficial-rescue">;

/** Resolve the production policy from the effective session format only. */
export function resolveSocialCandidatePolicy(
  sessionType: SessionType,
  requestedPolicy?: SocialCandidatePolicy,
): SocialCandidatePolicy | undefined {
  if (sessionType !== SessionType.SOCIAL_MIX) return undefined;
  return requestedPolicy ?? "courtmate-beneficial-rescue";
}

export type SocialCandidateDecision = {
  version: 1;
  requestedPolicy: SocialCandidatePolicy;
  appliedPolicy: SocialCandidatePolicy | "production" | "none";
  outcome: "candidate-exact" | "production-fallback" | "no-certified-selection";
  reasonCodes: string[];
  candidateProof: {
    selectionPresent: boolean;
    echoedPolicy: boolean;
    fairnessCertified: boolean;
    scheduleCertified: boolean;
    starvationCertified: boolean;
    gmaxCertified: boolean;
    priorityCertified: boolean;
    varietyOptimal: boolean;
    searchLimitReached: boolean;
    scheduleIndex: number | null;
    chosenCourtmateGain: number | null;
    courtmateGainMaximum: number | null;
    chosenCourtmateGainDeficit: number | null;
    chosenRollingMatchTypeGain: number | null;
    bestRollingMatchTypeGainAtGmax: number | null;
  };
  fallbackProof?: {
    selectionPresent: boolean;
    fairnessCertified: boolean;
    scheduleCertified: boolean;
    starvationCertified: boolean;
    replayCertified: boolean;
    coverageGateCertified: boolean;
    searchLimitReached: boolean;
  };
};

export type SocialCandidateRun<T extends MatchmakerV3Player> = {
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>;
  decision: SocialCandidateDecision;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getCandidateProof<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null
): SocialCandidateDecision["candidateProof"] {
  const debug = result?.debug;
  return {
    selectionPresent: Boolean(result?.selection),
    echoedPolicy: result?.socialPriorityPolicy === "courtmate-beneficial-rescue" &&
      debug?.socialPriorityPolicy === "courtmate-beneficial-rescue",
    fairnessCertified: result?.fairnessCertified === true && debug?.fairnessCertified === true,
    scheduleCertified: result?.scheduleCertified === true && debug?.scheduleCertified === true,
    starvationCertified: result?.starvationCertified === true && debug?.starvationCertified === true,
    gmaxCertified: result?.courtmateGainMaximumCertified === true &&
      debug?.courtmateGainMaximumCertified === true,
    priorityCertified: result?.priorityCertified === true && debug?.priorityCertified === true,
    varietyOptimal: result?.varietyOptimal === true && debug?.varietyOptimal === true,
    searchLimitReached: debug?.searchLimitReached !== false,
    scheduleIndex: result?.scheduleIndex ?? null,
    chosenCourtmateGain: finiteOrNull(result?.chosenNewCourtmatePairCount),
    courtmateGainMaximum: finiteOrNull(result?.courtmateGainMaximum),
    chosenCourtmateGainDeficit: finiteOrNull(result?.chosenCourtmateGainDeficit),
    chosenRollingMatchTypeGain: finiteOrNull(result?.chosenRollingMatchTypeGain),
    bestRollingMatchTypeGainAtGmax: finiteOrNull(result?.bestRollingMatchTypeGainAtGmax),
  };
}

function checkCandidateSelection<T extends MatchmakerV3Player>(
  players: readonly T[],
  options: RotationBatchOptions<T>,
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>
): string[] {
  const failures: string[] = [];
  const debug = result.debug;
  const proof = getCandidateProof(result);

  if (!proof.selectionPresent) failures.push("NO_CANDIDATE_SELECTION");
  if (!proof.echoedPolicy) failures.push("POLICY_ECHO_MISMATCH");
  if (!proof.fairnessCertified) failures.push("FAIRNESS_UNCERTIFIED");
  if (!proof.scheduleCertified) failures.push("SCHEDULE_UNCERTIFIED");
  if (!proof.starvationCertified) failures.push("STARVATION_UNCERTIFIED");
  if (!proof.gmaxCertified) failures.push("GMAX_OR_TMAX_UNCERTIFIED");
  if (!proof.priorityCertified) failures.push("FULL_PRIORITY_UNCERTIFIED");
  if (!proof.varietyOptimal) failures.push("VARIETY_SEARCH_INCOMPLETE");
  if (debug.searchLimitReached !== false) failures.push("SEARCH_LIMIT_REACHED_OR_UNKNOWN");
  if (debug.failureReason !== null) failures.push("NON_NULL_FAILURE_REASON");
  if (options.socialStructuralOpportunityConstraints === undefined) {
    failures.push("STRUCTURAL_OPPORTUNITY_DEFINITION_MISSING");
  }

  const scheduleCount = options.schedules?.length ?? 1;
  const scheduleIndex = result.scheduleIndex;
  if (!Number.isInteger(scheduleIndex) || scheduleIndex === null ||
    scheduleIndex < 0 || scheduleIndex >= scheduleCount) {
    failures.push("SCHEDULE_INDEX_INVALID");
  }

  const gmax = result.courtmateGainMaximum;
  const chosenGain = result.chosenNewCourtmatePairCount;
  const deficit = result.chosenCourtmateGainDeficit;
  const chosenT = result.chosenRollingMatchTypeGain;
  const bestGmaxT = result.bestRollingMatchTypeGainAtGmax;
  if (
    typeof gmax !== "number" || !Number.isFinite(gmax) ||
    typeof chosenGain !== "number" || !Number.isFinite(chosenGain) ||
    typeof deficit !== "number" || !Number.isFinite(deficit) ||
    typeof chosenT !== "number" || !Number.isFinite(chosenT) ||
    typeof bestGmaxT !== "number" || !Number.isFinite(bestGmaxT)
  ) {
    failures.push("PRIORITY_METRICS_MISSING_OR_NONFINITE");
  } else {
    if (!Number.isInteger(gmax) || !Number.isInteger(chosenGain) || !Number.isInteger(deficit) ||
      gmax < 0 || chosenGain < 0 || chosenGain > gmax || gmax > options.courtCount * 6) {
      failures.push("COURTMATE_GAIN_OUT_OF_RANGE");
    }
    if (deficit !== gmax - chosenGain || (deficit !== 0 && deficit !== 1)) {
      failures.push("COURTMATE_GAIN_DEFICIT_INVALID");
    } else if (deficit === 0 && chosenT !== bestGmaxT) {
      failures.push("GMAX_TMAX_FRONTIER_MISMATCH");
    } else if (deficit === 1 && !(chosenT > bestGmaxT)) {
      failures.push("RESCUE_NOT_STRICTLY_BENEFICIAL");
    }
    if (debug.courtmateGainMaximum !== gmax ||
      debug.chosenNewCourtmatePairCount !== chosenGain ||
      debug.chosenCourtmateGainDeficit !== deficit ||
      debug.chosenRollingMatchTypeGain !== chosenT ||
      debug.bestRollingMatchTypeGainAtGmax !== bestGmaxT) {
      failures.push("OUTER_DEBUG_PRIORITY_MISMATCH");
    }
  }

  const selections = result.selection?.selections ?? [];
  if (selections.length !== options.courtCount) failures.push("COURT_COUNT_MISMATCH");
  const originalAvailableIds = new Set(
    players
      .filter((player) => !player.isPaused && !player.isBusy)
      .map((player) => player.userId)
  );
  const candidatePoolIds = options.candidatePool
    ? new Set(options.candidatePool.candidatePlayers.map((player) => player.userId))
    : null;
  const activePlayerIds = candidatePoolIds
    ? new Set([...originalAvailableIds].filter((userId) => candidatePoolIds.has(userId)))
    : originalAvailableIds;
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const constraintPlayersById = new Map(
    players
      .filter((player) => !player.isPaused && !player.isBusy)
      .map((player) => [player.userId, player as ActiveMatchmakerV3Player<T>])
  );
  const selectedIds = new Set<string>();
  for (const [courtIndex, selection] of selections.entries()) {
    const ids = [...selection.ids];
    const quartetIds = selection.players.map((player) => player.userId);
    const partitionIds = [...selection.partition.team1, ...selection.partition.team2];
    const sortedIds = [...ids].sort();
    if (ids.length !== 4 || new Set(ids).size !== 4 ||
      [...quartetIds].sort().join("\u0000") !== sortedIds.join("\u0000") ||
      [...partitionIds].sort().join("\u0000") !== sortedIds.join("\u0000")) {
      failures.push("COURT_QUARTET_STRUCTURE_INVALID");
    }
    if (selection.partition.team1.length !== 2 || selection.partition.team2.length !== 2 ||
      new Set(partitionIds).size !== 4) {
      failures.push("PARTITION_STRUCTURE_INVALID");
    }
    for (const userId of ids) {
      if (!activePlayerIds.has(userId)) failures.push("INELIGIBLE_PLAYER_SELECTED");
      if (selectedIds.has(userId)) failures.push("OVERLAPPING_COURTS");
      selectedIds.add(userId);
    }
    const quartetKey = [...ids].sort().join("|");
    if (options.excludedQuartetKeys?.has(quartetKey)) failures.push("EXCLUDED_QUARTET_SELECTED");
    if (options.excludedPartitionKey && getExactPartitionKey(selection.partition) === options.excludedPartitionKey) {
      failures.push("EXCLUDED_PARTITION_SELECTED");
    }
    const profileConstraint = Number.isInteger(scheduleIndex) && scheduleIndex !== null
      ? options.schedules?.[scheduleIndex]?.courts[courtIndex]
      : undefined;
    const constraint = options.schedules ? profileConstraint : options.selectionConstraints;
    const authoritativePlayers = ids.map((userId) => playersById.get(userId));
    if (authoritativePlayers.some((player) => !player)) {
      failures.push("AUTHORITATIVE_PLAYER_MISSING");
    } else {
      const quartet = authoritativePlayers as [
        ActiveMatchmakerV3Player<T>,
        ActiveMatchmakerV3Player<T>,
        ActiveMatchmakerV3Player<T>,
        ActiveMatchmakerV3Player<T>,
      ];
      try {
        if (constraint?.isQuartetAllowed && !constraint.isQuartetAllowed(quartet)) {
          failures.push("SCHEDULE_CONSTRAINT_VIOLATED");
        }
      } catch {
        failures.push("SCHEDULE_CONSTRAINT_CHECK_FAILED");
      }
      try {
        if (!isValidPartitionForMode(selection.partition, playersById, options.sessionMode)) {
          failures.push("PARTITION_MODE_LAW_VIOLATED");
        }
      } catch {
        failures.push("PARTITION_MODE_LAW_CHECK_FAILED");
      }
      try {
        if (constraint?.normalizePartition) {
          const normalized = constraint.normalizePartition({
            partition: selection.partition,
            players: quartet,
            playersById: constraintPlayersById,
          });
          if (!normalized || getOrderedPartitionKey(normalized) !== getOrderedPartitionKey(selection.partition)) {
            failures.push("PARTITION_NORMALIZATION_MISMATCH");
          }
        }
      } catch {
        failures.push("PARTITION_NORMALIZATION_CHECK_FAILED");
      }
    }
  }

  const implicitlyLockedIds = options.candidatePool?.lockedPlayers.map((player) => player.userId) ?? [];
  const requiredLockedIds = new Set([...(options.lockedPlayerIds ?? []), ...implicitlyLockedIds]);
  const reportedLockedIds = new Set(result.debug.lockedPlayerIds);
  for (const lockedId of requiredLockedIds) {
    if (!reportedLockedIds.has(lockedId)) failures.push("LOCKED_INPUT_NOT_CERTIFIED");
    if (!selectedIds.has(lockedId)) failures.push("LOCKED_PLAYER_OMITTED");
  }

  if (result.selection) {
    try {
      const structuralContext = buildSocialStructuralVarietyContext(players, options.completedMatches ?? [], {
        sessionMode: options.sessionMode,
        opportunityConstraints: options.socialStructuralOpportunityConstraints,
      });
      const scorer = createSocialCourtmatePriorityScorer(
        structuralContext,
        options.completedMatches ?? []
      );
      const recomputed = scorer.getBatchMetrics(result.selection.selections.map(({ partition }) => partition));
      const recomputedT = scorer.toNormalizedRollingTypeGain(recomputed.rollingMatchTypeGainUnits);
      if (recomputed.newCourtmatePairs !== result.chosenNewCourtmatePairCount) {
        failures.push("SELECTED_G_RECOMPUTATION_MISMATCH");
      }
      if (recomputedT !== result.chosenRollingMatchTypeGain) {
        failures.push("SELECTED_T_RECOMPUTATION_MISMATCH");
      }
    } catch {
      failures.push("SELECTED_PRIORITY_RECOMPUTATION_FAILED");
    }
  }

  return [...new Set(failures)];
}

function getOrderedPartitionKey(partition: V3DoublesPartition) {
  return [
    [...partition.team1].sort().join("|"),
    [...partition.team2].sort().join("|"),
  ].join("||");
}

function makeDecision<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null,
  reasonCodes: string[],
  accepted: boolean,
  fallback?: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
  fallbackAccepted = true,
): SocialCandidateDecision {
  const fallbackProof = fallback
    ? {
        selectionPresent: Boolean(fallback.selection),
        fairnessCertified: fallback.fairnessCertified === true && fallback.debug.fairnessCertified === true,
        scheduleCertified: fallback.scheduleCertified === true && fallback.debug.scheduleCertified === true,
        starvationCertified: fallback.starvationCertified === true && fallback.debug.starvationCertified === true,
        replayCertified: fallback.debug.replayCertified === true,
        coverageGateCertified: fallback.debug.coverageGateCertified === true,
        searchLimitReached: fallback.debug.searchLimitReached,
      }
    : undefined;
  return {
    version: 1,
    requestedPolicy: "courtmate-beneficial-rescue",
    appliedPolicy: accepted ? "courtmate-beneficial-rescue" : fallbackAccepted ? "production" : "none",
    outcome: accepted ? "candidate-exact" : fallbackAccepted ? "production-fallback" : "no-certified-selection",
    reasonCodes,
    candidateProof: getCandidateProof(result),
    ...(fallbackProof ? { fallbackProof } : {}),
  };
}

function getUncertifiedProductionFallbackReasons<T extends MatchmakerV3Player>(
  result: SocialBatchResult<ActiveMatchmakerV3Player<T>>,
  options: RotationBatchOptions<T>
) {
  const reasons: string[] = [];
  if (!result.selection) reasons.push("PRODUCTION_FALLBACK_NO_SELECTION");
  if (result.fairnessCertified !== true || result.debug.fairnessCertified !== true) {
    reasons.push("PRODUCTION_FALLBACK_FAIRNESS_UNCERTIFIED");
  }
  if (result.scheduleCertified !== true || result.debug.scheduleCertified !== true) {
    reasons.push("PRODUCTION_FALLBACK_SCHEDULE_UNCERTIFIED");
  }
  if (result.starvationCertified !== true || result.debug.starvationCertified !== true) {
    reasons.push("PRODUCTION_FALLBACK_STARVATION_UNCERTIFIED");
  }
  if (options.respectPlayerRest !== false) {
    if (result.debug.replayCertified !== true) reasons.push("PRODUCTION_FALLBACK_REPLAY_UNCERTIFIED");
    if (result.debug.coverageGateCertified !== true) reasons.push("PRODUCTION_FALLBACK_COVERAGE_UNCERTIFIED");
  }
  return reasons;
}

/**
 * API acceptance boundary for the resolved Social policy. An uncertified
 * candidate is discarded, and the unchanged matcher is rerun with the same
 * initial random draws.
 */
export function runSocialCandidateWithProductionFallback<T extends MatchmakerV3Player>({
  candidatePlayers,
  productionPlayers = candidatePlayers,
  options,
  candidateOptions = options,
}: {
  candidatePlayers: T[];
  productionPlayers?: T[];
  options: RotationBatchOptions<T>;
  candidateOptions?: RotationBatchOptions<T>;
}): SocialCandidateRun<T> {
  if (candidateOptions.sessionType !== SessionType.SOCIAL_MIX) {
    const decision = makeDecision<T>(null, ["UNSUPPORTED_SESSION_TYPE"], false);
    console.warn("social-matchmaking-policy-fallback", {
      requestedPolicy: decision.requestedPolicy,
      appliedPolicy: decision.appliedPolicy,
      reasonCodes: decision.reasonCodes,
      sessionType: options.sessionType,
    });
    const productionResult = findBestRotationBatchSelection(productionPlayers, {
        ...options,
        socialPriorityPolicy: undefined,
      });
    return { result: productionResult, decision };
  }

  const sourceRandom = candidateOptions.randomFn ?? options.randomFn ?? Math.random;
  const recordedDraws: number[] = [];
  const candidateRandom = () => {
    const value = sourceRandom();
    recordedDraws.push(value);
    return value;
  };
  let candidateResult: SocialBatchResult<ActiveMatchmakerV3Player<T>> | null = null;
  let candidateThrew = false;
  try {
    candidateResult = findBestRotationBatchSelection(candidatePlayers, {
      ...candidateOptions,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      randomFn: candidateRandom,
    });
  } catch {
    candidateThrew = true;
  }

  const failures = candidateThrew
    ? ["CANDIDATE_MATCHER_ERROR"]
    : checkCandidateSelection(candidatePlayers, candidateOptions, candidateResult!);
  if (candidateResult && failures.length === 0) {
    return {
      result: candidateResult,
      decision: makeDecision(candidateResult, [], true),
    };
  }

  let replayIndex = 0;
  const replayRandom = () => replayIndex < recordedDraws.length
    ? recordedDraws[replayIndex++]
    : sourceRandom();
  const productionResult = findBestRotationBatchSelection(productionPlayers, {
      ...options,
      socialPriorityPolicy: undefined,
      randomFn: replayRandom,
    });
  const productionFailures = getUncertifiedProductionFallbackReasons(productionResult, options);
  const fallbackAccepted = productionFailures.length === 0;
  const decision = makeDecision(candidateResult, [...failures, ...productionFailures], false, productionResult, fallbackAccepted);
  console.warn("social-matchmaking-policy-fallback", {
    requestedPolicy: decision.requestedPolicy,
    appliedPolicy: decision.appliedPolicy,
    reasonCodes: decision.reasonCodes,
    candidateProof: decision.candidateProof,
    fallbackProof: decision.fallbackProof,
  });
  return {
    result: productionFailures.length === 0
      ? productionResult
      : { ...productionResult, selection: null, scheduleIndex: null },
    decision,
  };
}

export function withSocialCandidateDecision<T extends { matchmakingReasonJson?: string | null }>(
  selection: T,
  decision: SocialCandidateDecision | undefined
): T {
  if (!decision) return selection;
  const reasonJson = selection.matchmakingReasonJson;
  let matchmakingReasonJson: string;
  try {
    const parsed: unknown = reasonJson ? JSON.parse(reasonJson) : {};
    matchmakingReasonJson = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? JSON.stringify({ ...parsed, socialPolicyDecision: decision })
      : JSON.stringify({ socialPolicyDecision: decision, originalReasonJson: reasonJson ?? null });
  } catch {
    matchmakingReasonJson = JSON.stringify({ socialPolicyDecision: decision, originalReasonJson: reasonJson ?? null });
  }
  return { ...selection, socialPolicyDecision: decision, matchmakingReasonJson };
}
