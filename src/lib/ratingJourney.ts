import type { MemberProfileTimelineEntry } from "./memberProfile";

/** One point per session, selected by session date rather than ledger insertion date. */
export function ratingJourneyPoints(timeline: MemberProfileTimelineEntry[], allTime: boolean) {
  const groups = new Map<string, MemberProfileTimelineEntry[]>();
  for (const point of timeline) {
    if (!point.sessionId) continue;
    const group = groups.get(point.sessionId) ?? [];
    group.push(point);
    groups.set(point.sessionId, group);
  }
  const sessionPoints = [...groups.values()].map(group => {
    const sorted = [...group].sort((a,b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""));
    const last = sorted[sorted.length - 1];
    const summary = group.find(p => p.session)?.session;
    return { ...last, session: summary, date: summary?.date ?? last.date,
      label: summary?.name ?? last.label,
      delta: group.some(p => p.kind === "GAP") ? null : summary?.ratingChange ?? last.delta };
  }).sort((a,b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""));
  const completed = sessionPoints.filter(p => p.kind !== "ACTIVE");
  const selected = allTime ? completed : completed.slice(-10);
  const earliest = selected.length ? Date.parse(selected[0].date ?? "") : -Infinity;
  const manual = timeline.filter(p => p.kind === "MANUAL" && (allTime || Date.parse(p.date ?? "") >= earliest));
  return [...selected, ...manual, ...sessionPoints.filter(p => p.kind === "ACTIVE")]
    .sort((a,b) => Date.parse(a.date ?? "") - Date.parse(b.date ?? ""));
}
