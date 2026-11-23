import type { MatchPayload } from "@/app/session/[code]/sessionDataMutations";
import type { SessionData } from "@/components/session/sessionTypes";

export type ScoreSaveResponse = MatchPayload & {
  queuedMatch?: SessionData["queuedMatch"];
  autoAssignedMatch?: MatchPayload | null;
};

/** Apply the accepted score response before starting any follow-up reads. */
export async function saveScoreWithBackgroundRefresh<T>(
  submit: () => Promise<T>,
  apply: (response: T) => void,
  refresh: () => Promise<unknown>,
) {
  const response = await submit();
  apply(response);
  void Promise.resolve().then(refresh).catch(() => {});
  return response;
}
