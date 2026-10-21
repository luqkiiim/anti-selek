"use client";
import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft } from "@phosphor-icons/react";
import { PlayerProfilePage, MemberProfileOverlay, type MemberProfileResponse } from "@/components/prototype/PlayerProfilePage";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";
import { ErrorText } from "@/components/prototype/Primitives";
import { useClubResource } from "./ClubDataProvider";
import { clubProfileUrl } from "./clubReadStore";
import type { Snapshot } from "@/components/prototype/Club";
import { AppShell, useAppLocation } from "./AppShell";
import { backInApp, clubHref, navigateApp, sessionHref } from "@/lib/appNavigation";
import { withCallbackUrl } from "@/lib/authCallback";
import { useScrollRestoration } from "./useScrollRestoration";
import { useAppReady } from "./AppStartup";

function ScopedProfile({ playerId, clubId, globalView = false, onBack, onOpenMember, overlay = false }: {
  playerId: string; clubId: string; globalView?: boolean; onBack: () => void;
  onOpenMember: (id: string, clubId: string | null) => void; overlay?: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, `${clubId}/profile/${playerId}`);
  const snapshot = useClubResource<Snapshot>(clubId ? `/api/clubs/${encodeURIComponent(clubId)}${globalView ? "?view=global" : ""}` : null);
  const data = snapshot.data;
  const member = data?.clubMembers.find(p => p.id === playerId);
  const profile = useClubResource<MemberProfileResponse>(member ? clubProfileUrl(clubId, playerId, { globalView }) : null);
  useAppReady(!overlay && (!clubId || !!snapshot.error || (!!data && (!member || !!profile.data || !!profile.error))));
  const ranked = data?.clubMembers.filter(p => p.status === "CORE" && (p.matchesPlayed ?? 0) > 0).sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) ?? [];
  const rank = ranked.findIndex(p => p.id === playerId);
  const rankedMember = member ? { ...member, currentRank: rank < 0 ? null : rank + 1 } : null;
  const navigate = (tab: string) => navigateApp(router, clubHref(clubId, tab, globalView));
  const content = member && data ? <><ErrorText error={snapshot.error} />{snapshot.error && <button className="secondary" disabled={snapshot.loading || snapshot.retryAt > 0} onClick={() => void snapshot.refresh().catch(() => {})}>Try again</button>}<PlayerProfilePage
    key={`${clubId}:${playerId}`} clubId={clubId} clubName={data.club.name} member={rankedMember!}
    isSelf={!globalView && !data.viewer.isQuickAccess && data.viewer.playerId === playerId} globalView={globalView}
    canEdit={snapshot.validated} canInvite={snapshot.validated && !globalView && (data.club.role === "ADMIN" || !!data.viewer.isAdmin)}
    onOpenSession={code => navigateApp(router, sessionHref(code, globalView ? clubId : undefined))}
    onOpenMember={id => onOpenMember(id, clubId)} onAccountSaved={snapshot.refresh}
  /></> : !clubId || data ? <div className="profile-specialist"><PlayerProfileView key={`${clubId}:${playerId}`} playerId={playerId} clubId={clubId} mode="embedded" readOnly={globalView} onBack={onBack} /></div>
    : <><ErrorText error={snapshot.error} />{snapshot.error ? <button className="secondary" disabled={snapshot.loading || snapshot.retryAt > 0} onClick={() => void snapshot.refresh().catch(() => {})}>Try again</button> : <p role="status">Loading profile…</p>}</>;
  if (overlay && member && data) return <MemberProfileOverlay member={member} clubId={clubId} clubName={data.club.name} onBack={onBack} onNavigate={navigate} readOnly={globalView}>{content}</MemberProfileOverlay>;
  return <div className="pc-app"><header className="pc-header"><button className="icon-button" aria-label="Back" onClick={onBack}><ArrowLeft size={23} /></button><strong>Player profile</strong><span /></header><div ref={scrollRef} className="pc-scroll"><main className="pc-content">{content}</main></div></div>;
}
export function ProfileOverlay(props: Parameters<typeof ScopedProfile>[0]) { return <ScopedProfile {...props} overlay />; }
export default function ProfileRoute() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: auth, status } = useSession();
  const href = useAppLocation();
  const query = new URL(href, "https://anti-selek.local").searchParams;
  const clubId = query.get("clubId") ?? "";
  const globalView = query.getAll("view").includes("global");
  useEffect(() => { if (status === "unauthenticated") router.replace(withCallbackUrl("/signin", href)); }, [status, router, href]);
  return <AppShell>{status !== "unauthenticated" && auth?.user?.id ? <ScopedProfile playerId={id} clubId={clubId} globalView={globalView}
    onBack={() => backInApp(router, clubId ? clubHref(clubId, "rankings", globalView) : "/")}
    onOpenMember={(playerId, profileClubId) => navigateApp(router, `/profile/${encodeURIComponent(playerId)}${profileClubId ? `?clubId=${encodeURIComponent(profileClubId)}${globalView ? "&view=global" : ""}` : ""}`)}
  /> : <p className="route-loading" role="status">Loading profile…</p>}</AppShell>;
}
