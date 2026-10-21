import type { MemberProfileData, RecordedSessionSummary } from "./memberProfile";

/** Every completed session already has a summary in the rating timeline,
 * including unrated sessions and gaps. Reuse it for history instead of
 * requesting and rebuilding the entire profile for every page. */
export function getMemberProfileSessionHistory(profile: Pick<MemberProfileData, "timeline" | "history">) {
  const summaries = new Map<string, RecordedSessionSummary>();
  for (const point of profile.timeline) {
    if (point.session) summaries.set(point.session.id, point.session);
  }
  for (const summary of profile.history.items) summaries.set(summary.id, summary);
  return [...summaries.values()].sort(
    (left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime() || left.id.localeCompare(right.id)
  );
}
