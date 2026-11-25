import { SessionBalanceMetric, SessionMode } from "@/types/enums";
import { findBestSkillBatchSelection, type LevelSelectionOptions } from "./levelSelection";
import type { LevelSelectionContext, LevelSelectionDiagnostics } from "./levelPolicy";
import type { ClubPlayDistributionSnapshot } from "./clubPlayDistribution";
import type { MatchmakerLadderPlayer } from "./types";

export type ClubPlaySelectionContext = LevelSelectionContext;

export interface ClubPlaySelectionDiagnostics extends Omit<LevelSelectionDiagnostics,
  "levelMatchType" | "levelDistribution"> {
  clubPlayMatchType?: ClubPlayDistributionSnapshot;
  distribution?: LevelSelectionDiagnostics["levelDistribution"];
  clubPlayBoosted: boolean;
  clubPlayPlayedUp: readonly string[];
  fallback: "none" | "balance-baseline" | "quality";
}

export type ClubPlaySelectionOptions<T extends MatchmakerLadderPlayer> = Pick<LevelSelectionOptions<T>,
  "courtCount" | "respectPlayerRest" | "randomFn" | "lockedPlayerIds" | "excludedQuartetKeys" |
  "excludedPartitionKey" | "searchLimits" | "searchBudget" | "history"> & {
  selectionContext?: ClubPlaySelectionContext;
  requiredPartitionKey?: string;
  sessionMode?: SessionMode;
};

export function findBestClubPlayBatchSelection<T extends MatchmakerLadderPlayer>(
  players: T[], { requiredPartitionKey, sessionMode = SessionMode.MIXICANO, ...options }: ClubPlaySelectionOptions<T>,
) {
  return findBestSkillBatchSelection(players, {
    ...options,
    // Stable ordering is useful for retries and reservations; the search's
    // fairness and relationship objectives do the actual rotation.
    randomFn: options.randomFn ?? (() => 0),
    sessionMode,
    levelPolicy: { metric: SessionBalanceMetric.RATING },
    clubPlay: { requiredPartitionKey },
  });
}
