import { logError } from "@/lib/errors";
import type { SessionMutationActor } from "@/lib/sessionProfileIdentity";
import {
  MatchmakingSearchBudgetExceededError,
  type MatchmakingSearchBudget,
} from "@/lib/matchmaking/v3/searchBudget";
import {
  getQueuedMatchForSessionId,
  tryRebuildQueuedMatchForSessionId,
} from "../queue-match/shared";
import { canAttemptQueueWithinSearchBudget } from "./queueBudget";

export async function rebuildQueueAfterCommitDetailed(
  sessionId: string,
  searchBudget?: MatchmakingSearchBudget,
  mutationActor?: SessionMutationActor,
) {
  let deferred = !canAttemptQueueWithinSearchBudget(searchBudget);
  try {
    if (!deferred) {
      const queuedMatch = await tryRebuildQueuedMatchForSessionId(sessionId, searchBudget, mutationActor);
      // A selection may finish without a queue after exhausting the admitted
      // window. Preserve recovery intent only if the window was consumed.
      deferred = !queuedMatch && !canAttemptQueueWithinSearchBudget(searchBudget);
      return { queuedMatch, deferred };
    }
    console.info("Automatic queue deferred after match creation: search window below 250ms", {
      sessionId,
      remainingMs: searchBudget?.remainingMs() ?? null,
    });
  } catch (error) {
    deferred = error instanceof MatchmakingSearchBudgetExceededError ||
      !canAttemptQueueWithinSearchBudget(searchBudget);
    logError("Failed to rebuild queued match after committed match creation", error);
  }

  try {
    return { queuedMatch: await getQueuedMatchForSessionId(sessionId), deferred };
  } catch (error) {
    logError("Failed to read queued match after committed match creation", error);
    return { queuedMatch: null, deferred };
  }
}

export async function rebuildQueueAfterCommit(
  sessionId: string,
  searchBudget?: MatchmakingSearchBudget,
  mutationActor?: SessionMutationActor,
) {
  return (await rebuildQueueAfterCommitDetailed(sessionId, searchBudget, mutationActor)).queuedMatch;
}
