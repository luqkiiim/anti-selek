import { SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { RotationBatchOptions } from "./socialBatch";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3SelectionConstraints,
  V3SingleCourtResult,
} from "./types";

export type V3SingleCourtOptions<T extends MatchmakerV3Player> =
  Omit<RotationBatchOptions<T>, "courtCount"> & {
    sessionType: SessionType;
    targetPool?: string;
    minimumTargetPoolPlayers?: number;
    excludedQuartetKey?: string;
  };

/** A single court uses the same rotation policy and admissibility as a batch. */
export function findBestSingleCourtSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  options: V3SingleCourtOptions<T>
): V3SingleCourtResult<ActiveMatchmakerV3Player<T>> {
  const excluded = new Set(options.excludedQuartetKeys);
  if (options.excludedQuartetKey) excluded.add(options.excludedQuartetKey);
  const constraints = options.selectionConstraints;
  const selectionConstraints: V3SelectionConstraints<ActiveMatchmakerV3Player<T>> | undefined =
    options.targetPool || constraints ? {
      ...constraints,
      isQuartetAllowed: (quartet) =>
        (!options.targetPool || quartet.filter((player) => player.pool === options.targetPool).length >= (options.minimumTargetPoolPlayers ?? 1)) &&
        (constraints?.isQuartetAllowed?.(quartet) ?? true),
    } : undefined;
  const result = findBestRotationBatchSelection(players, {
    ...options,
    courtCount: 1,
    excludedQuartetKeys: excluded,
    selectionConstraints,
  });
  const selection = result.selection?.selections[0] ?? null;
  return {
    selection,
    debug: {
      eligiblePlayerIds: result.debug.eligiblePlayerIds,
      lowestBand: result.debug.lowestBand,
      includedBandValues: result.debug.includedBandValues,
      widened: result.debug.widened,
      lockedPlayerIds: result.debug.lockedPlayerIds,
      tieZonePlayerIds: result.debug.tieZonePlayerIds,
      candidatePlayerIds: result.debug.candidatePlayerIds,
      quartetCount: result.debug.quartetCount,
      validPartitionCount: result.debug.validQuartetCount,
      chosenIds: selection?.ids ?? null,
      chosenBalanceGap: selection?.balanceGap ?? null,
      chosenPointDiffGap: selection?.pointDiffGap ?? null,
      chosenPartnerRepeatPenalty: selection?.partnerRepeatPenalty ?? null,
      chosenOpponentRepeatPenalty: selection?.opponentRepeatPenalty ?? null,
      chosenExactRematchPenalty: selection?.exactRematchPenalty ?? null,
      chosenSharedCourtEncounterFrequencyPenalty: selection?.sharedCourtEncounterFrequencyPenalty ?? null,
      chosenConsecutivePlayCount: selection?.consecutivePlayCount ?? null,
      chosenConsecutivePlayMaxBurden: selection?.consecutivePlayMaxBurden ?? null,
      chosenConsecutivePlayTotalBurden: selection?.consecutivePlayTotalBurden ?? null,
      chosenSocialVarietyGain: selection?.socialVarietyGain ?? null,
      chosenSocialVarietyGains: selection?.socialVarietyGains ?? null,
      chosenMatchTypeEntropyGain: result.debug.chosenMatchTypeEntropyGain ?? null,
      chosenRelationshipEntropyGain: result.debug.chosenRelationshipEntropyGain ?? null,
      chosenZeroRestPlayerCount: selection?.restSummary.restTurnVector.filter((turns) => turns === 0).length ?? null,
      chosenAscendingRestTurns: selection
        ? [...selection.restSummary.restTurnVector].sort((left, right) => left - right)
        : null,
      fairnessCertified: result.fairnessCertified,
      scheduleCertified: result.scheduleCertified,
      starvationCertified: result.starvationCertified,
      bestImmediateReplayCount: result.debug.bestImmediateReplayCount,
      allowedImmediateReplayCount: result.debug.allowedImmediateReplayCount,
      chosenImmediateReplayCount: result.debug.chosenImmediateReplayCount,
      replayCertified: result.debug.replayCertified,
      replayEnvelopeStatus: result.debug.replayEnvelopeStatus,
      bestMinimumReplayCoverageGain: result.debug.bestMinimumReplayCoverageGain,
      chosenImmediateCoverageGain: result.debug.chosenImmediateCoverageGain,
      coverageGainMetric: result.debug.coverageGainMetric,
      coverageGateCertified: result.debug.coverageGateCertified,
      coverageGateUpperBoundCertified: result.debug.coverageGateUpperBoundCertified,
      coverageGateStatus: result.debug.coverageGateStatus,
      chosenReplayCoverageEligible: result.debug.chosenReplayCoverageEligible,
      socialIdealRestGap: result.debug.socialIdealRestGap,
      availableOverduePlayerCount: result.debug.availableOverduePlayerCount,
      selectedOverduePlayerCount: result.debug.selectedOverduePlayerCount,
      leftOutOverduePlayerCount: result.debug.leftOutOverduePlayerCount,
      highestLeftOutRestTurns: result.debug.highestLeftOutRestTurns,
      totalLeftOutRestTurns: result.debug.totalLeftOutRestTurns,
      varietyOptimal: result.varietyOptimal,
      socialPriorityPolicy: result.socialPriorityPolicy,
      priorityCertified: result.priorityCertified,
      chosenNewCourtmatePairCount: result.chosenNewCourtmatePairCount,
      chosenPostBatchCourtmateCoverage: result.chosenPostBatchCourtmateCoverage,
      chosenRollingMatchTypeGain: result.chosenRollingMatchTypeGain,
      courtmateGainMaximumCertified: result.courtmateGainMaximumCertified,
      courtmateGainMaximum: result.courtmateGainMaximum,
      chosenCourtmateGainDeficit: result.chosenCourtmateGainDeficit,
      bestRollingMatchTypeGainAtGmax: result.bestRollingMatchTypeGainAtGmax,
      searchLimitReached: result.debug.searchLimitReached,
      failureReason: result.debug.failureReason,
      balanceGuardrail: result.debug.balanceGuardrail,
      balanceCertified: result.debug.balanceCertified,
      fairnessVector: result.debug.fairnessVector,
      schedulingRank: result.debug.schedulingRank,
      finalTieBreak: result.debug.finalTieBreak,
    },
  };
}
