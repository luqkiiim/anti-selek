import type { MatchmakingSearchBudget } from "@/lib/matchmaking/v3/searchBudget";
import { SessionMode, SessionType } from "@/types/enums";

export function usesGroupedMixedCapacityBudget({
  poolsEnabled,
  sessionType,
  sessionMode,
  requestedMatchCount,
  eligiblePlayerCount,
}: {
  poolsEnabled: boolean;
  sessionType: SessionType;
  sessionMode: SessionMode;
  requestedMatchCount: number;
  eligiblePlayerCount: number;
}) {
  return poolsEnabled &&
    sessionType === SessionType.POINTS &&
    sessionMode === SessionMode.MIXICANO &&
    requestedMatchCount === 3 &&
    eligiblePlayerCount >= 12 &&
    eligiblePlayerCount <= 24;
}

/** Preserve enough of the original clock for a useful optional queue search. */
export function canAttemptQueueWithinSearchBudget(searchBudget?: MatchmakingSearchBudget) {
  return !searchBudget || (
    searchBudget.remainingMs() >= 250 &&
    searchBudget.capAtElapsedMs(4_500).remainingMs() >= 250
  );
}
