import {
  getQueuedMatchForSessionId,
  tryRebuildQueuedMatchForSessionId,
  type QueuedMatchResponse,
} from "@/app/api/sessions/[code]/queue-match/shared";
import { autoAssignQueuedMatch } from "./autoAssignQueuedMatch";

export interface SessionQueueReconciliation {
  autoAssignedMatch: Awaited<ReturnType<typeof autoAssignQueuedMatch>>["autoAssignedMatch"];
  queuedMatchCleared: boolean;
  queuedMatch: QueuedMatchResponse | null;
}

export async function reconcileSessionQueueAfterCourtChange(
  sessionId: string,
  options?: { generateAutomaticIfMissing?: boolean }
): Promise<SessionQueueReconciliation> {
  const result = await autoAssignQueuedMatch(sessionId, {
    generateIfMissing: options?.generateAutomaticIfMissing,
  });
  const { autoAssignedMatch, queuedMatchCleared } = result;
  const queuedMatch = "skipQueueRefill" in result && result.skipQueueRefill
    ? await getQueuedMatchForSessionId(sessionId)
    : await tryRebuildQueuedMatchForSessionId(sessionId);

  return {
    autoAssignedMatch,
    queuedMatchCleared,
    queuedMatch,
  };
}
