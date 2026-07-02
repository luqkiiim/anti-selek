export interface MatchmakerV3Player {
  userId: string;
  matchesPlayed: number;
  matchmakingBaseline: number;
  availableSince: Date;
  restTurns?: number;
  needsMoreRest?: boolean;
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

export type ActiveMatchmakerV3Player<
  T extends MatchmakerV3Player = MatchmakerV3Player,
> = T & {
  effectiveMatchCount: number;
  restTurns: number;
  needsMoreRest: boolean;
  moreRestTarget: number;
  moreRestDeficit: number;
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
  partnerCoveragePenalty: number;
  opponentCoveragePenalty: number;
  partnerRepeatPenalty: number;
  opponentRepeatPenalty: number;
  exactRematchPenalty: number;
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
  chosenConsecutivePlayCount: number | null;
  chosenConsecutivePlayMaxBurden: number | null;
  chosenConsecutivePlayTotalBurden: number | null;
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
  totalPartnerCoveragePenalty: number;
  totalOpponentCoveragePenalty: number;
  totalPartnerRepeatPenalty: number;
  totalOpponentRepeatPenalty: number;
  totalExactRematchPenalty: number;
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
}

export interface V3BatchResult<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  selection: V3BatchSelection<T> | null;
  debug: V3BatchDebug;
}
