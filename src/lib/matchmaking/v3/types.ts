export interface MatchmakerV3Player {
  userId: string;
  matchesPlayed: number;
  matchmakingBaseline: number;
  availableSince: Date;
  restTurns?: number;
  /** Legacy persisted flag retained for compatibility; matchmaking ignores it. */
  needsMoreRest?: boolean;
  /** Legacy court-count input target retained for compatibility; matchmaking ignores it. */
  moreRestTarget?: number;
  arrivalPriorityAt?: Date | string | null;
  strength: number;
  pointDiff?: number;
  isBusy?: boolean;
  isPaused?: boolean;
  gender?: string;
  partnerPreference?: string;
  mixedSideOverride?: string | null;
  pool?: string | null;
  lastPartnerId?: string | null;
}

export interface V3CompletedMatch {
  team1: [string, string];
  team2: [string, string];
  completedAt?: Date | null;
}

export interface SocialVarietySnapshot {
  version: 1;
  basis: "EFFECTIVE_MIXED_SIDE";
  courtType: "MIXED" | "UPPER" | "LOWER" | null;
  effectiveSideByUserId: Record<string, "UPPER" | "LOWER" | null>;
}

export interface SocialHistoryMatch extends V3CompletedMatch {
  id?: string;
  socialVariety?: SocialVarietySnapshot;
}

export interface SocialVarietyGains {
  courtmates: number;
  partners: number;
  opponents: number;
  matchType: number;
}

export interface V3SocialStarvationSummary {
  idealRestGap: number;
  availableOverdueCount: number;
  selectedOverdueCount: number;
  leftOutOverdueCount: number;
  highestLeftOutRestTurns: number;
  totalLeftOutRestTurns: number;
}

/** A fixed admissibility envelope established inside the best rotation class. */
export interface V3BalanceGuardrail {
  mode: "POINTS" | "RATING";
  bestMaxBalanceGap: number;
  bestTotalBalanceGap: number;
  nearBestWindow: number;
  absoluteCeiling: number | null;
  allowedMaxBalanceGap: number;
  allowedTotalBalanceGap: number | null;
  ceilingFeasible: boolean;
  baselineCertified: boolean;
}

export type V3FinalTieBreak = "EXACT_REMATCH" | "RANDOM" | "DETERMINISTIC";

export type ActiveMatchmakerV3Player<
  T extends MatchmakerV3Player = MatchmakerV3Player,
> = T & {
  effectiveMatchCount: number;
  restTurns: number;
  randomScore: number;
  rank: number;
};

export interface V3FairnessBand<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  effectiveMatchCount: number;
  players: T[];
}

export interface V3RestTurnTieZone<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  requiredSlots: number;
  cutoffRestTurns: number;
  players: T[];
}

export interface V3DoublesPartition {
  team1: [string, string];
  team2: [string, string];
}

export interface V3BalancedPartition {
  partition: V3DoublesPartition;
  balanceGap: number;
  pointDiffGap: number;
  mixedSideGap: number;
}

export interface V3SelectionConstraints<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  isQuartetAllowed?: (players: [T, T, T, T]) => boolean;
  normalizePartition?: ({
    partition,
    players,
    playersById,
  }: {
    partition: V3DoublesPartition;
    players: [T, T, T, T];
    playersById: Map<string, T>;
  }) => V3DoublesPartition | null;
}

export interface V3RestSummary {
  totalRestTurns: number;
  minimumRestTurns: number;
  restTurnVector: number[];
}

export type V3BatchPairingRandomMode = "combined" | "side-balanced";

export interface V3BatchPairingRandomSalts {
  combined: number;
  sides: [number, number];
}

export interface V3CandidatePool<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  requiredPlayerCount: number;
  activePlayers: T[];
  fairnessBands: V3FairnessBand<T>[];
  lowestBand: number | null;
  includedBandValues: number[];
  widened: boolean;
  insufficientPlayers: boolean;
  lockedPlayers: T[];
  selectionBand: V3FairnessBand<T> | null;
  selectionBandEffectiveMatchCount: number | null;
  requiredSelectableCount: number;
  selectablePlayers: T[];
  candidatePlayers: T[];
  tieZone: V3RestTurnTieZone<T> | null;
}

export interface V3SingleCourtSelection<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  ids: [string, string, string, string];
  players: [T, T, T, T];
  partition: V3DoublesPartition;
  restSummary: V3RestSummary;
  balanceGap: number;
  pointDiffGap: number;
  sharedCourtRepeatPenalty: number;
  sharedCourtEncounterFrequencyPenalty?: number;
  partnerCoveragePenalty: number;
  opponentCoveragePenalty: number;
  partnerRepeatPenalty: number;
  opponentRepeatPenalty: number;
  exactRematchPenalty: number;
  socialVarietyGain?: number;
  socialVarietyGains?: SocialVarietyGains;
  socialVariety?: SocialVarietySnapshot;
  socialStarvation?: V3SocialStarvationSummary;
  balanceGuardrail?: V3BalanceGuardrail;
  finalTieBreak?: V3FinalTieBreak | null;
  fairnessVector?: number[];
  schedulingRank?: number;
  consecutivePlayCount: number;
  consecutivePlayMaxBurden: number;
  consecutivePlayTotalBurden: number;
  randomScore: number;
  pairingRandomScore: number;
}

export interface V3SingleCourtDebug {
  eligiblePlayerIds: string[];
  lowestBand: number | null;
  includedBandValues: number[];
  widened: boolean;
  lockedPlayerIds: string[];
  tieZonePlayerIds: string[];
  candidatePlayerIds: string[];
  quartetCount: number;
  validPartitionCount: number;
  chosenIds: [string, string, string, string] | null;
  chosenBalanceGap: number | null;
  chosenPointDiffGap: number | null;
  chosenPartnerRepeatPenalty: number | null;
  chosenOpponentRepeatPenalty: number | null;
  chosenExactRematchPenalty: number | null;
  chosenSharedCourtEncounterFrequencyPenalty?: number | null;
  chosenConsecutivePlayCount: number | null;
  chosenConsecutivePlayMaxBurden: number | null;
  chosenConsecutivePlayTotalBurden: number | null;
  chosenSocialVarietyGain?: number | null;
  chosenSocialVarietyGains?: SocialVarietyGains | null;
  /** Raw entropy facet diagnostics; policy compares the existing combined gain. */
  chosenMatchTypeEntropyGain?: number | null;
  chosenRelationshipEntropyGain?: number | null;
  /** Count of selected players with restTurns === 0, including first assignments. */
  chosenZeroRestPlayerCount?: number | null;
  chosenAscendingRestTurns?: number[] | null;
  bestImmediateReplayCount?: number | null;
  allowedImmediateReplayCount?: number | null;
  chosenImmediateReplayCount?: number | null;
  replayCertified?: boolean;
  replayEnvelopeStatus?: V3ReplayEnvelopeStatus;
  fairnessOptimal?: boolean;
  fairnessCertified?: boolean;
  starvationCertified?: boolean;
  balanceCertified?: boolean;
  balanceGuardrail?: V3BalanceGuardrail;
  fairnessVector?: number[];
  schedulingRank?: number;
  finalTieBreak?: V3FinalTieBreak | null;
  socialIdealRestGap?: number;
  availableOverduePlayerCount?: number;
  selectedOverduePlayerCount?: number | null;
  leftOutOverduePlayerCount?: number | null;
  highestLeftOutRestTurns?: number | null;
  totalLeftOutRestTurns?: number | null;
  varietyOptimal?: boolean;
  searchLimitReached?: boolean;
  failureReason?: V3BatchFailureReason | null;
}

export interface V3SingleCourtResult<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  selection: V3SingleCourtSelection<T> | null;
  debug: V3SingleCourtDebug;
}

export interface V3BatchSelection<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  selections: V3SingleCourtSelection<T>[];
  restSummary: V3RestSummary;
  maxBalanceGap: number;
  totalBalanceGap: number;
  maxPointDiffGap: number;
  totalPointDiffGap: number;
  totalSharedCourtRepeatPenalty: number;
  totalSharedCourtEncounterFrequencyPenalty?: number;
  totalPartnerCoveragePenalty: number;
  totalOpponentCoveragePenalty: number;
  totalPartnerRepeatPenalty: number;
  totalOpponentRepeatPenalty: number;
  totalExactRematchPenalty: number;
  totalSocialVarietyGain?: number;
  totalSocialVarietyGains?: SocialVarietyGains;
  /** Raw entropy facet diagnostics; the shared engine compares their combined gain. */
  totalMatchTypeEntropyGain?: number;
  totalRelationshipEntropyGain?: number;
  balanceGuardrail?: V3BalanceGuardrail;
  finalTieBreak?: V3FinalTieBreak | null;
  fairnessVector?: number[];
  schedulingRank?: number;
  totalRandomScore: number;
  totalPairingRandomScore: number;
  sidePairingLayoutKeys: [string, string];
  sidePairingRandomScores: [number, number];
}

export type V3BatchFailureReason =
  | "INSUFFICIENT_PLAYERS"
  | "NO_VALID_MIXED_QUARTETS"
  | "NOT_ENOUGH_NON_OVERLAPPING_COURTS"
  | "LOCKED_PLAYERS_CANNOT_ALL_FIT"
  | "SEARCH_LIMIT_REACHED";

export interface V3BatchDebug {
  eligiblePlayerIds: string[];
  availableCandidateCount: number;
  consideredCandidateCount: number;
  candidateCap: number | null;
  lowestBand: number | null;
  includedBandValues: number[];
  widened: boolean;
  lockedPlayerIds: string[];
  tieZonePlayerIds: string[];
  candidatePlayerIds: string[];
  quartetCount: number;
  validQuartetCount: number;
  exploredBranches: number;
  prunedBranches: number;
  searchAttemptCount: number;
  searchLimitReached: boolean;
  failureReason: V3BatchFailureReason | null;
  chosenQuartets: Array<[string, string, string, string]>;
  chosenMaxBalanceGap: number | null;
  chosenTotalBalanceGap: number | null;
  chosenMaxPointDiffGap: number | null;
  chosenTotalPointDiffGap: number | null;
  chosenTotalPartnerRepeatPenalty: number | null;
  chosenTotalOpponentRepeatPenalty: number | null;
  chosenTotalExactRematchPenalty: number | null;
  chosenTotalSharedCourtEncounterFrequencyPenalty?: number | null;
  chosenTotalSocialVarietyGain?: number | null;
  chosenTotalSocialVarietyGains?: SocialVarietyGains | null;
  /** Raw entropy layers; priority comparison applies format-specific bucketing. */
  chosenMatchTypeEntropyGain?: number | null;
  chosenRelationshipEntropyGain?: number | null;
  /** Count of selected players with restTurns === 0, including first assignments. */
  chosenZeroRestPlayerCount?: number | null;
  chosenAscendingRestTurns?: number[] | null;
  bestImmediateReplayCount: number | null;
  allowedImmediateReplayCount: number | null;
  chosenImmediateReplayCount: number | null;
  replayCertified: boolean;
  replayEnvelopeStatus: V3ReplayEnvelopeStatus;
  fairnessOptimal?: boolean;
  fairnessCertified?: boolean;
  starvationCertified?: boolean;
  balanceCertified?: boolean;
  balanceGuardrail?: V3BalanceGuardrail;
  fairnessVector?: number[];
  schedulingRank?: number;
  finalTieBreak?: V3FinalTieBreak | null;
  varietyOptimal?: boolean;
  socialIdealRestGap?: number;
  availableOverduePlayerCount?: number;
  selectedOverduePlayerCount?: number | null;
  leftOutOverduePlayerCount?: number | null;
  highestLeftOutRestTurns?: number | null;
  totalLeftOutRestTurns?: number | null;
}

export type V3ReplayEnvelopeStatus = "DISABLED" | "CERTIFIED" | "UNCERTIFIED" | "NO_SELECTION";

export interface V3BatchResult<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  selection: V3BatchSelection<T> | null;
  debug: V3BatchDebug;
}
