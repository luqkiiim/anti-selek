export interface LadderRecord {
  wins: number;
  losses: number;
  pointDiff: number;
  ladderScore: number;
}

export interface MatchmakerLadderPlayer extends LadderRecord {
  userId: string;
  matchesPlayed: number;
  matchmakingBaseline: number;
  availableSince: Date;
  restTurns?: number;
  needsMoreRest?: boolean;
  moreRestTarget?: number;
  arrivalPriorityAt?: Date | string | null;
  strength: number;
  isBusy?: boolean;
  isPaused?: boolean;
  gender?: string;
  partnerPreference?: string;
  mixedSideOverride?: string | null;
  pool?: string | null;
  lastPartnerId?: string | null;
}

export interface LadderHistoryMatch {
  team1: [string, string];
  team2: [string, string];
  team1Score?: number | null;
  team2Score?: number | null;
  status?: string | null;
  completedAt?: Date | null;
}

export type ActiveMatchmakerLadderPlayer<
  T extends MatchmakerLadderPlayer = MatchmakerLadderPlayer,
> = T & {
  effectiveMatchCount: number;
  restTurns: number;
  needsMoreRest: boolean;
  moreRestTarget: number;
  moreRestDeficit: number;
  randomScore: number;
  rank: number;
};

export interface LadderFairnessBand<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  effectiveMatchCount: number;
  players: T[];
}

export interface LadderRestTurnTieZone<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  requiredSlots: number;
  cutoffRestTurns: number;
  players: T[];
}

export interface LadderCandidatePool<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  requiredPlayerCount: number;
  activePlayers: T[];
  fairnessBands: LadderFairnessBand<T>[];
  lowestBand: number | null;
  includedBandValues: number[];
  widened: boolean;
  insufficientPlayers: boolean;
  lockedPlayers: T[];
  selectionBand: LadderFairnessBand<T> | null;
  selectionBandEffectiveMatchCount: number | null;
  requiredSelectableCount: number;
  selectablePlayers: T[];
  candidatePlayers: T[];
  tieZone: LadderRestTurnTieZone<T> | null;
}

export interface LadderDoublesPartition {
  team1: [string, string];
  team2: [string, string];
}

export interface LadderBalancedPartition {
  partition: LadderDoublesPartition;
  balanceGap: number;
  pointDiffGap: number;
  strengthGap: number;
}

export interface LadderGroupingSummary {
  maxLadderGap: number;
  totalLadderGap: number;
  pointDiffSpread: number;
  totalPointDiffGap: number;
}

export interface LadderRestSummary {
  totalRestTurns: number;
  minimumRestTurns: number;
  restTurnVector: number[];
}

export interface LadderSingleCourtSelection<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  ids: [string, string, string, string];
  players: [T, T, T, T];
  partition: LadderDoublesPartition;
  restSummary: LadderRestSummary;
  groupingSummary: LadderGroupingSummary;
  balanceGap: number;
  pointDiffGap: number;
  strengthGap: number;
  randomScore: number;
}

export interface LadderSingleCourtDebug {
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
  chosenGrouping: LadderGroupingSummary | null;
  chosenBalanceGap: number | null;
}

export interface LadderSingleCourtResult<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  selection: LadderSingleCourtSelection<T> | null;
  debug: LadderSingleCourtDebug;
}

export interface LadderBatchSelection<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  selections: LadderSingleCourtSelection<T>[];
  restSummary: LadderRestSummary;
  maxLadderGap: number;
  totalLadderGap: number;
  totalPointDiffGap: number;
  maxBalanceGap: number;
  totalBalanceGap: number;
  maxPointDiffBalanceGap: number;
  totalPointDiffBalanceGap: number;
  maxStrengthGap: number;
  totalStrengthGap: number;
  totalRandomScore: number;
}

export interface LadderBatchDebug {
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
  chosenMaxLadderGap: number | null;
  chosenTotalLadderGap: number | null;
  chosenTotalPointDiffGap: number | null;
  chosenMaxBalanceGap: number | null;
  chosenTotalBalanceGap: number | null;
  chosenMaxPointDiffBalanceGap: number | null;
  chosenTotalPointDiffBalanceGap: number | null;
  chosenMaxStrengthGap: number | null;
  chosenTotalStrengthGap: number | null;
}

export interface LadderBatchResult<
  T extends ActiveMatchmakerLadderPlayer = ActiveMatchmakerLadderPlayer,
> {
  selection: LadderBatchSelection<T> | null;
  debug: LadderBatchDebug;
}
