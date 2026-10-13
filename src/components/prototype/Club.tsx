"use client";
import Image from "next/image";
import { useState } from "react";
import { useAppLocation } from "@/components/app/AppShell";
import { changeAppQuery, clubHref, getClubTab, sessionHref } from "@/lib/appNavigation";
import {
  CalendarBlank,
  CaretRight,
  CaretLeft,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ClockCounterClockwise,
  GearSix,
  Plus,
  Table,
  UsersThree,
} from "@phosphor-icons/react";
import type { DashboardClub } from "@/components/dashboard/dashboardTypes";
import type {
  ClubPageUser,
  ClubPageClub,
  ClubPageMember,
  ClubPageSession,
  ClubClaimRequest,
} from "@/components/club/clubTypes";
import type {
  PlayerProfileSessionSummary,
  PlayerProfileMatchHistoryEntry,
} from "@/lib/profileStats";
import { api, useResource, useAction } from "./api";
import {
  Avatar,
  ErrorText,
} from "./Primitives";
import { Pager } from "./Pager";
import { SessionUpdate } from "./SessionUpdate";
import { ClubHighlights } from "./ClubHighlights";
import { MonthlyClimbers } from "./MonthlyClimbers";
import { UpcomingSessions } from "./UpcomingSessions";
import { NextMilestone, AchievementCabinet } from "./Achievements";
import type { AchievementCollection, AchievementId } from "@/lib/clubAchievements";
import Admin from "./Admin";
import { MainNav, mainPages } from "./MainNav";
import { PlayerProfilePage, MemberProfileOverlay, type RankedMember } from "./PlayerProfilePage";
import { Rankings } from "./Rankings";
import { SessionSetup } from "./SessionSetup";
import { PartnerChemistry } from "./PartnerChemistry";
import { TopRivalries } from "./TopRivalries";
import type { ClubPulseSnapshot } from "@/lib/clubPulse";
import LiveSession from "./LiveSession";
import SessionMatchHistory from "./SessionMatchHistory";
import { formatProfileDate } from "./profileDate";
export type Snapshot = {
  viewer: ClubPageUser;
  club: ClubPageClub;
  clubMembers: ClubPageMember[];
  sessions: ClubPageSession[];
  claimRequests: ClubClaimRequest[];
  clubPulse?: ClubPulseSnapshot;
};
type Profile = {
  user: { name: string; avatarUrl: string | null; elo: number };
  context?: {
    rankContext: {
      currentRank: number | null;
      previousRank: number | null;
      rankDelta: number | null;
    };
  };
  recentSessions: PlayerProfileSessionSummary[];
  matchHistory: PlayerProfileMatchHistoryEntry[];
};
export default function Club({
  club,
  onSwitch,
  onAccountSaved,
  onClubsChanged,
  globalView = false,
  initialPage = "club",
  onRoute,
  onRouteBack,
}: {
  club: Omit<DashboardClub, "role" | "isPasswordProtected"> & { role?: DashboardClub["role"] | null; isPasswordProtected?: boolean };
  globalView?: boolean;
  initialPage?: "club" | "profile" | "admin";
  onRoute?: (href: string, replace?: boolean) => void;
  onRouteBack?: (fallback: string) => void;
  onSwitch: () => void;
  onAccountSaved: () => Promise<unknown>;
  onClubsChanged: () => Promise<unknown>;
}) {
  const resource = useResource<Snapshot>("/api/clubs/" + club.id + (globalView ? "?view=global" : ""));
  const data = resource.data;
  const readOnly = globalView || !!data?.club.readOnly;
  const pages: readonly string[] = readOnly ? mainPages.filter(p => p !== "profile") : mainPages;
  const viewerPlayerId = readOnly ? null : data?.viewer.playerId ?? null;
  const profile = useResource<Profile>(
    viewerPlayerId
      ? `/api/users/${encodeURIComponent(viewerPlayerId)}/stats?clubId=${encodeURIComponent(club.id)}`
      : null,
  );
  const achievements = useResource<AchievementCollection>(viewerPlayerId ? `/api/clubs/${club.id}/achievements` : null);
  const [achievementRequest, setAchievementRequest] = useState<{id:AchievementId;nonce:number}>();
  async function saveAchievementPreferences(body: unknown) {
    await api(`/api/clubs/${club.id}/achievements`, "PATCH", body);
    await achievements.refresh();
  }
  const href = useAppLocation();
  const route = new URL(href, "https://anti-selek.local");
  const [localMemberStack, setMemberStack] = useState<string[]>([]);
  const memberStack = onRoute ? route.searchParams.getAll("member") : localMemberStack;
  const [localPage, setPage] = useState<string>(globalView ? "club" : initialPage),
    [sessionCode, setSessionCode] = useState(""),
    [recap, setRecap] = useState<PlayerProfileSessionSummary | null>(null);
  const page = onRoute ? (route.pathname.endsWith("/admin") ? "admin" : route.searchParams.get("tab") === "recap" ? "recap" : getClubTab(route.searchParams.get("tab"))) : localPage;
  const [pastSessionPagination, setPastSessionPagination] = useState(() => {
    let visibleCount = 5;
    try { const saved = Number(sessionStorage.getItem(`anti-selek:past-sessions:${club.id}`)); if (Number.isSafeInteger(saved) && saved >= 5) visibleCount = saved; } catch {}
    return { clubId: club.id, visibleCount };
  });
  if (pastSessionPagination.clubId !== club.id) {
    setPastSessionPagination({ clubId: club.id, visibleCount: 5 });
  }
  async function refresh() {
    await Promise.all([resource.refresh(), profile.refresh(), achievements.refresh()]);
  }
  const action = useAction(refresh);
  const canManage = !readOnly && (
    data?.club.role === "ADMIN" ||
    data?.club.role === "STAFF" ||
    data?.viewer.isAdmin);
  const canAdmin = !readOnly && (data?.club.role === "ADMIN" || data?.viewer.isAdmin);
  const sessions = data?.sessions.filter((s) => !s.isTest) || [];
  const live = sessions.filter((s) => s.status === "ACTIVE");
  const upcoming = sessions.filter((s) => s.status === "WAITING");
  const completedSessions = sessions
    .filter((s) => s.status === "COMPLETED")
    .sort(
      (left, right) =>
        new Date(right.endedAt || right.createdAt).getTime() -
        new Date(left.endedAt || left.createdAt).getTime(),
    );
  const visiblePastSessionCount = pastSessionPagination.visibleCount;
  const recent = profile.data?.recentSessions?.find(r=>sessions.some(s=>s.id===r.id&&s.status==="COMPLETED"));
  const displayedRecap = onRoute && page === "recap" ? profile.data?.recentSessions.find(r => r.code === route.searchParams.get("session")) ?? recap : recap;
  const member = viewerPlayerId ? data?.clubMembers.find((p) => p.id === viewerPlayerId) : undefined;
  const rating = profile.data?.user.elo ?? member?.elo;
  const rank = profile.data?.context?.rankContext;
  function openMember(id: string) {
    const next = memberStack.includes(id) ? memberStack.slice(0, memberStack.indexOf(id) + 1) : [...memberStack, id];
    if (onRoute) onRoute(changeAppQuery(href, { member: next }));
    else setMemberStack(next);
  }
  function closeMember(index: number) {
    const fallback = changeAppQuery(href, { member: memberStack.slice(0, index) });
    if (onRouteBack) onRouteBack(fallback);
    else setMemberStack(stack => stack.slice(0, index));
  }
  function rankedMember(id: string): RankedMember | undefined {
    const found = data?.clubMembers.find(p => p.id === id);
    if (!found) return undefined;
    const ranked = data!.clubMembers.filter(p => p.status === "CORE" && (p.matchesPlayed ?? 0) > 0).sort((a,b) => b.elo-a.elo || a.name.localeCompare(b.name,undefined,{sensitivity:"base"}));
    const index=ranked.findIndex(p => p.id===id);
    return {...found,currentRank:index<0?null:index+1};
  }


  function go(p: string) {
    setMemberStack([]);
    if (onRoute) onRoute(p === "admin" ? `/club/${encodeURIComponent(club.id)}/admin?tab=players` : clubHref(club.id, p, readOnly));
    else setPage(p);
  }

  const memberOverlay = data ? memberStack.map((id,index) => { const target=rankedMember(id); const isSelf=target?.id===viewerPlayerId&&!data.viewer.isQuickAccess; return target ? <MemberProfileOverlay key={id} member={target} clubId={club.id} clubName={data.club.name} onBack={() => closeMember(index)} onNavigate={go} readOnly={readOnly}><PlayerProfilePage clubId={club.id} clubName={data.club.name} member={target} isSelf={isSelf} globalView={readOnly} canInvite={!!canAdmin} onOpenMember={openMember} onOpenSession={openSession} onAccountSaved={async () => { await Promise.all([refresh(), onAccountSaved()]); }} achievements={isSelf ? renderAchievement() : undefined} milestone={isSelf ? renderMilestone() : undefined} /></MemberProfileOverlay> : null; }) : null;
  function openSession(code: string) {
    if (onRoute) onRoute(sessionHref(code, readOnly ? club.id : undefined));
    else { setSessionCode(code); go("session"); }
  }
  function renderStats() {
    return (
      <div className="stats-card">
        <div>
          <small>Club rating</small>
          <strong className="big-number">{rating ?? "—"}</strong>
          {recent && (
            <span
              className={"gain " + (recent.ratingChange < 0 ? "negative" : "")}
            >
              {recent.ratingChange > 0 && <ArrowUp size={14} aria-hidden="true" />}
              {recent.ratingChange < 0 && <ArrowDown size={14} aria-hidden="true" />}
              {recent.ratingChange > 0 ? "+" : ""}
              {recent.ratingChange}
              <em>last session</em>
            </span>
          )}
        </div>
        <div>
          <small>Club rank</small>
          <strong className="big-number">
            {rank?.currentRank ? "#" + rank.currentRank : "—"}
          </strong>
          <span className="gain">
            <em>
              {rank?.previousRank
                ? "from #" + rank.previousRank
                : "Not ranked yet"}
            </em>
          </span>
        </div>
      </div>
    );
  }
  function renderMilestone() {
    return achievements.data ? <NextMilestone embedded collection={achievements.data} onOpen={id => setAchievementRequest({id,nonce:Date.now()})} /> : null;
  }
  function renderAchievement() {
    return achievements.data ? <AchievementCabinet embedded collection={achievements.data} openRequest={achievementRequest}
      onSaveShowcase={showcase => saveAchievementPreferences({showcase})}
      onSeen={seen => saveAchievementPreferences({seen})}
      onOpenSession={openSession} /> : <ErrorText error={achievements.error} />;
  }
  if (page === "session")
    return (
      <><LiveSession
        globalClubId={readOnly ? club.id : undefined}
        code={sessionCode}
        onBack={() => {
          go("sessions");
          void refresh().catch(() => {});
        }}
        onEnded={async () => {
          await refresh();
        }}
        onDeleted={async () => {
          go("sessions");
          await refresh();
        }}
        onOpenMember={openMember}
        profileMemberIds={data?.clubMembers.map((member) => member.id) ?? []}
      />{memberOverlay}</>
    );
  if (page === "recap-history" && displayedRecap)
    return (
      <div className="pc-app">
        <SessionMatchHistory
          globalClubId={readOnly ? club.id : undefined}
          code={displayedRecap.code}
          onBack={() => go("recap")}
          onMutated={refresh}
        />
      </div>
    );
  if (page === "admin" && data && !canAdmin) return <div className="pc-app"><main className="pc-content"><ErrorText error="You do not have access to manage this club." /><button className="secondary" onClick={() => go("club")}>Back to club</button></main></div>;
  if (page === "setup" && data && !canManage) return <div className="pc-app"><main className="pc-content"><ErrorText error="You do not have access to host a session." /><button className="secondary" onClick={() => go("club")}>Back to club</button></main></div>;
  if (page === "admin" && data && canAdmin)
    return (
      <><Admin
        snapshot={data}
        refresh={async () => { await Promise.all([refresh(), onClubsChanged()]); }}
        onDeleted={async () => { await onClubsChanged(); onSwitch(); }}
        onBack={() => go("club")}
        onNavigate={go}
        onOpenProfile={openMember}
        onRoute={onRoute}
      />{memberOverlay}</>
    );
  return (
    <div className="pc-app">
      <header className="pc-header">
        {pages.includes(page) ? (
          <>
            <button
              className="club-switcher"
              aria-label={
                "Switch club, current " + (data?.club.name || club.name)
              }
              onClick={onSwitch}
            >
              <small>{readOnly ? "CLUB" : "YOUR CLUB"}</small>
              <strong>
                <CaretLeft size={16} aria-hidden="true" />
                {data?.club.name || club.name}
              </strong>
            </button>
            <div className="club-header-actions">
            {canAdmin && <button
              className="icon-button"
              aria-label="Manage club"
              title="Manage club"
              onClick={() => go("admin")}
            >
              <GearSix size={25} />
            </button>}
            <span aria-label={`${data?.club.name || club.name} club photo`}><Avatar name={data?.club.name || club.name} url={data ? data.club.avatarUrl : club.avatarUrl} /></span>
            </div>
          </>
        ) : (
          <>
            <button
              className="icon-button"
              aria-label="Back"
              onClick={() => go("club")}
            >
              <ArrowLeft size={23} />
            </button>
            <strong>{page === "setup" ? "New session" : recap?.name}</strong>
            <span />
          </>
        )}
      </header>
      <Pager pages={pages.includes(page) ? pages : [page]} active={page} onChange={go}>{page => <>
          <ErrorText error={resource.error || profile.error || achievements.error || action.error} />
          {!data && <p role="status">Loading club…</p>}
          {data && page === "club" && (
            <div className="club-dashboard-grid">
              <div className="club-dashboard-intro">
                <div className="club-welcome">
                  <div>
                    <span className="eyebrow">
                      {canManage ? "YOUR CLUB, TOGETHER" : "GOOD TO SEE YOU"}
                    </span>
                    <h1>
                      {canManage
                        ? "Ready for a rally?"
                        : readOnly ? data.club.name : `Welcome back, ${data.viewer.name}.`}
                    </h1>
                  </div>
                  <Image src="/spark.png" alt="Friendly spark" width={68} height={68} />
                </div>

              </div>
              <div className="club-dashboard-session-cards">
                {live.length ? (
                  <div className="session-tile">
                    <span className="eyebrow">LIVE NOW</span>
                    <h2>{live[0].name}</h2>
                    <p>{live[0].players.length} players</p>
                    <button
                      className="primary"
                      onClick={() => openSession(live[0].code)}
                    >
                      {canManage ? "Continue hosting" : "View session"}
                      <CaretRight size={19} />
                    </button>
                  </div>
                ) : null}
                <UpcomingSessions sessions={upcoming} clubId={club.id} busy={action.busy} onReview={canAdmin ? (code, status) => void action.run(() => api(`/api/sessions/${encodeURIComponent(code)}/collab`, "PATCH", { status })) : undefined} canManage={!!canManage} onOpen={openSession} onViewAll={() => go("sessions")} />
                {recent && <SessionUpdate session={recent} onOpen={() => { setRecap(recent); if (onRoute) onRoute(changeAppQuery(clubHref(club.id, "recap", readOnly), { session: recent.code })); else go("recap"); }} />}
              </div>
              {canManage && !live.length && !upcoming.length && <div className="club-start-session"><button className="primary" onClick={() => go("setup")}><Plus size={18} />New session</button></div>}
                <section className="club-activity-totals" aria-label="Club activity">
                  <button type="button" onClick={() => go("sessions")} aria-label={`${(data.clubPulse?.metrics.completedTournaments ?? completedSessions.length).toLocaleString()} Sessions, view sessions`}>
                    <CalendarBlank size={19} aria-hidden="true" />
                    <strong>{(data.clubPulse?.metrics.completedTournaments ?? completedSessions.length).toLocaleString()}</strong>
                    <span>Sessions</span>
                  </button>
                  <div>
                    <Table size={19} aria-hidden="true" />
                    <strong>{data.clubPulse?.metrics.totalMatches.toLocaleString() ?? "—"}</strong>
                    <span>Matches</span>
                  </div>
                  <button type="button" onClick={() => go("rankings")} aria-label={`${data.clubMembers.length.toLocaleString()} Members, view rankings`}>
                    <UsersThree size={19} aria-hidden="true" />
                    <strong>{data.clubMembers.length.toLocaleString()}</strong>
                    <span>Members</span>
                  </button>
                  <div>
                    <ClockCounterClockwise size={19} aria-hidden="true" />
                    <strong className="club-activity-date">{data.clubPulse?.metrics.lastPlayedAt ? formatProfileDate(data.clubPulse.metrics.lastPlayedAt) : "Not yet"}</strong>
                    <span>Last played</span>
                  </div>
                </section>
              {!completedSessions.length && <p className="club-initial-empty">Your first completed session will appear here.</p>}
              {data.club.isTutorial && onRoute && <a className="text-button specialist-tools" href={changeAppQuery(clubHref(club.id), { tools: "practice" })}>Practice sessions</a>}
              <ClubHighlights items={data.clubPulse?.sessionNews ?? []} onOpen={openSession} />
              {data.clubPulse?.monthlyClimbers && <MonthlyClimbers climbers={data.clubPulse.monthlyClimbers} month={data.clubPulse.monthlyClimbersMonth} onOpenProfile={openMember} />}
              {!readOnly && viewerPlayerId && <div className="club-dashboard-progress">
                <div className="section-heading">
                  <h3>Your progress here</h3>
                  <button className="text-button" onClick={() => go("profile")}>
                    View profile
                  </button>
                </div>
                {renderStats()}
              </div>}
              <PartnerChemistry onOpenProfile={openMember} pairs={data.clubPulse?.partnerships ?? []} />
              <TopRivalries onOpenProfile={openMember} rivalries={data.clubPulse?.rivalries ?? []} />
              {data.club.rules && <details className="club-rules"><summary>Club rules</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.club.rules}</p></details>}
            </div>
          )}
          {data && page === "sessions" && (
            <>
              <div className="section-heading">
                <h1>Sessions</h1>
                {canManage && (
                  <button className="secondary" onClick={() => go("setup")}>
                    <Plus size={18} />
                    New
                  </button>
                )}
              </div>
              {live.map((s) => (
                <div className="session-tile" key={s.code}>
                  <span className="eyebrow">
                    LIVE NOW
                  </span>
                  <h2>{s.name}</h2>
                  <p>{s.players.length} players</p>
                  <button
                    className="primary"
                    onClick={() => openSession(s.code)}
                  >
                    {canManage ? "Continue hosting" : "View session"}
                  </button>
                </div>
              ))}
              <UpcomingSessions sessions={upcoming} clubId={club.id} busy={action.busy} onReview={canAdmin ? (code, status) => void action.run(() => api(`/api/sessions/${encodeURIComponent(code)}/collab`, "PATCH", { status })) : undefined} canManage={!!canManage} onOpen={openSession} />
              <section className="past-sessions" aria-labelledby="past-sessions-heading">
                <div className="past-sessions-heading">
                  <h2 id="past-sessions-heading">Past sessions</h2>
                  <span className="past-sessions-count">{completedSessions.length}</span>
                </div>
                <div className="past-sessions-list">
                  {completedSessions.slice(0, visiblePastSessionCount).map((s) => (
                    <button
                      className="recent-card"
                      key={s.id}
                      onClick={() => openSession(s.code)}
                    >
                      <CalendarBlank size={22} />
                      <span>
                        <strong>{s.name}</strong>
                        <small>
                          {formatProfileDate(s.endedAt || s.createdAt)}
                        </small>
                      </span>
                      <CaretRight size={18} />
                    </button>
                  ))}
                </div>
                {completedSessions.length === 0 && (
                  <p className="muted">No completed sessions yet.</p>
                )}
                {visiblePastSessionCount < completedSessions.length && (
                  <button
                    className="text-button past-sessions-load-more"
                    type="button"
                    onClick={() =>
                      setPastSessionPagination((current) => {
                        const visibleCount = (current.clubId === club.id ? current.visibleCount : 5) + 5;
                        try { sessionStorage.setItem(`anti-selek:past-sessions:${club.id}`, String(visibleCount)); } catch {}
                        return { clubId: club.id, visibleCount };
                      })
                    }
                  >
                    Load more sessions
                  </button>
                )}
              </section>
            </>
          )}
          {data && page === "rankings" && <Rankings onOpenProfile={openMember} members={data.clubMembers} viewerId={viewerPlayerId ?? ""} clubName={data.club.name} hasCompletedSession={data.sessions.some(session => session.status === "COMPLETED" && !session.isTest)} />}
          {data && page === "profile" && member && viewerPlayerId && <PlayerProfilePage clubId={club.id} clubName={data.club.name} member={rankedMember(viewerPlayerId)!} isSelf={!data.viewer.isQuickAccess} onOpenMember={openMember} onOpenSession={openSession} onAccountSaved={async () => { await Promise.all([refresh(), onAccountSaved()]); }} achievements={renderAchievement()} milestone={renderMilestone()} />}
          {data && page === "profile" && !viewerPlayerId && <div className="profile-empty"><h2>Your Player profile will appear here.</h2><p>Join this club with a Player profile to see your sporting history and preferences.</p></div>}
          {page === "recap" && displayedRecap && (
            <>
              <div className="celebration">
                <Image width={240} height={240} src="/medallion.png" alt="Celebrating your session" />
                <h1>Session complete!</h1>
                <p>Great games today, {data?.viewer.name}.</p>
              </div>
              <div className="stats-card recap-stats">
                <div>
                  <small>Rating change</small>
                  <strong>
                    {displayedRecap.ratingChange > 0 ? "+" : ""}
                    {displayedRecap.ratingChange}
                  </strong>
                </div>
                <div>
                  <small>Session result</small>
                  <strong>
                    {displayedRecap.wins} / {displayedRecap.matches}
                  </strong>
                  <small>wins</small>
                </div>
              </div>
              <button className="secondary full" onClick={() => openSession(displayedRecap.code)}>
                Full session results
              </button>
              <button className="secondary full" onClick={() => onRoute ? onRoute(`/session/${encodeURIComponent(displayedRecap.code)}/history`) : go("recap-history")}>
                Match history
              </button>
              {renderAchievement()}
              <button className="primary" onClick={() => go("profile")}>
                View progress
              </button>
              <button className="text-button" onClick={() => go("club")}>
                Back to club
              </button>
            </>
          )}
          {data && page === "setup" && canManage && <SessionSetup clubId={club.id} members={data.clubMembers} onCreated={openSession} onAdvanced={onRoute ? () => onRoute(changeAppQuery(clubHref(club.id, "host"), { tools: "advanced" })) : undefined} />}
      </>}</Pager>
      {!["setup", "recap"].includes(page) && (
        <MainNav active={page} onNavigate={go} readOnly={readOnly} />
      )}
      {memberOverlay}
    </div>
  );
}
