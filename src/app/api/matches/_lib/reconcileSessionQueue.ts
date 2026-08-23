import {
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
  const { autoAssignedMatch, queuedMatchCleared } =
    await autoAssignQueuedMatch(sessionId, {
      generateIfMissing: options?.generateAutomaticIfMissing,
    });
  const queuedMatch = await tryRebuildQueuedMatchForSessionId(sessionId);

  return {
    autoAssignedMatch,
    queuedMatchCleared,
    queuedMatch,
  };
}
