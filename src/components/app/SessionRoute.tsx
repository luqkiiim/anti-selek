"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import LiveSession from "@/components/prototype/LiveSession";
import SessionMatchHistory from "@/components/prototype/SessionMatchHistory";
import type { SessionData } from "@/components/session/sessionTypes";
import { AppShell, useAppLocation } from "./AppShell";
import { ProfileOverlay } from "./ProfileRoute";
import { backInApp, changeAppQuery, clubHref, getSessionTab, navigateApp, sessionHref } from "@/lib/appNavigation";
import { withCallbackUrl } from "@/lib/authCallback";
const SessionTools = dynamic(() => import("@/app/session/[code]/SessionTools"));

export default function SessionRoute({ historyView = false }: { historyView?: boolean }) {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: auth, status } = useSession();
  const href = useAppLocation();
  const params = new URL(href, "https://anti-selek.local").searchParams;
  const isGlobal = params.getAll("view").includes("global");
  const globalIds = params.getAll("clubId");
  const globalClubId = isGlobal ? globalIds[0] : undefined;
  const [session, setSession] = useState<SessionData | null>(null);
  const fallback = session?.clubId ? clubHref(session.clubId, "sessions", !!globalClubId) : "/";
  useEffect(() => {
    if (status === "unauthenticated") router.replace(withCallbackUrl("/signin", href));
  }, [status, router, href]);
  if (status === "unauthenticated" || !auth?.user?.id) return <AppShell><div className="pc-app"><p role="status" className="route-loading">Loading session…</p></div></AppShell>;
  if (isGlobal && (params.getAll("view").length !== 1 || globalIds.length !== 1 || !globalClubId || globalClubId.trim() !== globalClubId || globalClubId.length > 100)) return <AppShell ready><div className="pc-app"><main className="pc-content"><p role="alert">This read-only session link needs a valid club.</p><button className="secondary" onClick={() => navigateApp(router, "/?chooser=1")}>Back to clubs</button></main></div></AppShell>;
  if (!isGlobal && params.get("tools") === "practice") return <AppShell specialist><a className="specialist-back" href={sessionHref(code)}>Back to session</a><SessionTools /></AppShell>;
  const member = params.get("member");
  const openMember = (id: string, profileClubId: string | null) => navigateApp(router, changeAppQuery(href, { member: id, profileClubId }));
  return <AppShell>{historyView ? <div className="pc-app"><SessionMatchHistory code={code} globalClubId={globalClubId} onBack={() => backInApp(router, sessionHref(code, globalClubId))} onNavigate={href => navigateApp(router, href)} /></div> : <LiveSession
    code={code} globalClubId={globalClubId}
    activeTab={getSessionTab(params.get("tab"))}
    onTabChange={tab => navigateApp(router, changeAppQuery(href, { tab: tab.toLowerCase() }))}
    onSessionData={setSession}
    onOpenProfile={openMember}
    onHistory={() => navigateApp(router, `/session/${encodeURIComponent(code)}/history${globalClubId ? `?view=global&clubId=${encodeURIComponent(globalClubId)}` : ""}`)}
    onPracticeTools={() => navigateApp(router, changeAppQuery(href, { tools: "practice" }))}
    onBack={() => navigateApp(router, "/", true)}
    onEnded={async () => {}}
    onDeleted={async () => navigateApp(router, fallback, true)}
  />}{member && <ProfileOverlay playerId={member} clubId={params.get("profileClubId") ?? ""} globalView={!!globalClubId} onBack={() => backInApp(router, changeAppQuery(href, { member: null, profileClubId: null }))} onOpenMember={openMember} />}</AppShell>;
}
export function SessionHistoryRoute() { return <SessionRoute historyView />; }
