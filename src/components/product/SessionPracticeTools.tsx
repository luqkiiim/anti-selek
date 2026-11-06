"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionData } from "@/components/session/sessionTypes";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";
import { navigateApp, sessionHref, clubHref } from "@/lib/appNavigation";
import { ErrorText, Sheet } from "./Primitives";

export function SessionPracticeTools({ session, open, onClose, refresh }: { session: SessionData; open: boolean; onClose: () => void; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const [choice, setChoice] = useState<"reset" | "real" | null>(null);
  const [includeResults, setIncludeResults] = useState(session.matches?.some(match => match.status === "COMPLETED") ?? false);
  const action = useAdminAction(refresh);
  const canManage = session.viewerCanUseAdminSessionControls && !session.viewerIsQuickAccess;
  const canConvert = !!session.clubId && session.viewerAdminClubIds?.includes(session.clubId);
  const completed = (session.matches ?? []).filter(match => match.status === "COMPLETED").length;
  if (!canManage || (!session.isTest && !session.isTutorialClub)) return null;
  return <Sheet open={open} title="Practice tools" busy={action.busy} onClose={() => { setChoice(null); onClose(); }}>
    <ErrorText error={action.error} />
    {choice === "reset" ? <><p>Clear the games and results in this practice session and start again?</p><button className="primary full" disabled={action.busy || action.uncertain} onClick={() => void action.run(signal => adminApi(`/api/sessions/${session.code}/reset`, "POST", undefined, { signal }), () => { setChoice(null); onClose(); })}>Confirm reset</button></> : choice === "real" ? <>
      <p>Create a real session from this test session?</p>
      <label className="setup-toggle"><span>Include {completed} completed results</span><input type="checkbox" checked={includeResults} disabled={!completed} onChange={event => setIncludeResults(event.target.checked)} /></label>
      <p className="muted">Unfinished games stay in the test session. Included results affect real ratings and history.</p>
      <button className="primary full" disabled={!canConvert || action.busy || action.uncertain} onClick={() => void action.run(signal => adminApi<{ code: string }>(`/api/sessions/${session.code}/create-real`, "POST", { includeResults }, { signal }), result => navigateApp(router, sessionHref(result.code)))}>Create real session</button>
    </> : <>{session.status === "ACTIVE" && <button className="secondary full" onClick={() => setChoice("reset")}>Reset practice session</button>}{canConvert && session.isTest && !session.isTutorialClub && <button className="secondary full" onClick={() => { setIncludeResults(completed > 0); setChoice("real"); }}>Create real session</button>}</>}
    {choice && <button className="text-button" onClick={() => setChoice(null)}>Keep practicing</button>}
    {action.uncertain && <><p>Review the session or club list before trying this action again.</p><button className="text-button" onClick={() => navigateApp(router, session.clubId ? clubHref(session.clubId, "sessions") : "/")}>View club sessions</button></>}
    {action.refreshWarning && <p role="status">{action.refreshWarning}<button className="text-button" onClick={() => void action.retryRefresh()}>Refresh details</button></p>}
  </Sheet>;
}
