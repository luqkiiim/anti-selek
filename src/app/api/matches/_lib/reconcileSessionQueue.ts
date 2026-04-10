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
  sessionId: string
): Promise<SessionQueueReconciliation> {
  const { autoAssignedMatch, queuedMatchCleared } =
    await autoAssignQueuedMatch(sessionId);
  const queuedMatch = await tryRebuildQueuedMatchForSessionId(sessionId);

  return {
    autoAssignedMatch,
    queuedMatchCleared,
    queuedMatch,
  };
}
