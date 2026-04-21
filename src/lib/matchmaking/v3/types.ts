export interface MatchmakerV3Player {
  userId: string;
  matchesPlayed: number;
  matchmakingBaseline: number;
  availableSince: Date;
  strength: number;
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
  waitMs: number;
  randomScore: number;
  rank: number;
};

export interface V3FairnessBand<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  effectiveMatchCount: number;
  players: T[];
}

export interface V3WaitingTimeTieZone<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  requiredSlots: number;
  cutoffWaitMs: number;
  minimumIncludedWaitMs: number;
  players: T[];
}

export interface V3DoublesPartition {
  team1: [string, string];
  team2: [string, string];
}

export interface V3BalancedPartition {
  partition: V3DoublesPartition;
  balanceGap: number;
  mixedSideGap: number;
}

export interface V3WaitSummary {
  totalWaitMs: number;
  minimumWaitMs: number;
  waitVector: number[];
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
  tieZone: V3WaitingTimeTieZone<T> | null;
}

export interface V3SingleCourtSelection<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  ids: [string, string, string, string];
  players: [T, T, T, T];
  partition: V3DoublesPartition;
  waitSummary: V3WaitSummary;
  balanceGap: number;
  partnerRepeatPenalty: number;
  exactRematchPenalty: number;
  randomScore: number;
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
  chosenPartnerRepeatPenalty: number | null;
  chosenExactRematchPenalty: number | null;
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
  waitSummary: V3WaitSummary;
  maxBalanceGap: number;
  totalBalanceGap: number;
  totalPartnerRepeatPenalty: number;
  totalExactRematchPenalty: number;
  totalRandomScore: number;
}

export interface V3BatchDebug {
  eligiblePlayerIds: string[];
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
  chosenQuartets: Array<[string, string, string, string]>;
  chosenMaxBalanceGap: number | null;
  chosenTotalBalanceGap: number | null;
  chosenTotalPartnerRepeatPenalty: number | null;
  chosenTotalExactRematchPenalty: number | null;
}

export interface V3BatchResult<
  T extends ActiveMatchmakerV3Player = ActiveMatchmakerV3Player,
> {
  selection: V3BatchSelection<T> | null;
  debug: V3BatchDebug;
}
