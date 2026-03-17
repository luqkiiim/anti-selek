import type { MatchmakingCreditPlayer } from "../matchmakingCredit";
import type {
  DoublesPartition,
  PartitionCandidate,
  RotationHistory,
} from "../partitioning";

export interface RotationLoadCandidate extends MatchmakingCreditPlayer {
  userId: string;
  availableSince: Date;
}

export type RankedRotationLoadCandidate<
  T extends RotationLoadCandidate = RotationLoadCandidate,
> = T & {
  _random: number;
  rank: number;
  rotationLoad: number;
  waitMs: number;
};

export interface FairnessSummary {
  maxLoadGap: number;
  rankSum: number;
  totalLoadGap: number;
}

export interface V2Selection extends FairnessSummary {
  ids: [string, string, string, string];
  partition: DoublesPartition;
  objectiveScore: number;
  pointDiffGap: number;
  randomScore: number;
  rotationPenalty: number;
  score: number;
  exactPartitionPenalty: number;
}

export interface V2BatchSelection {
  selections: V2Selection[];
}

export interface MatchmakingContext {
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: RotationHistory;
}
