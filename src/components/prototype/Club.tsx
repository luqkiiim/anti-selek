"use client";
import Image from "next/image";
import { useState } from "react";
import {
  CalendarBlank,
  CaretRight,
  ArrowLeft,
  ArrowUp,
  GearSix,
  Plus,
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
}: {
  club: DashboardClub;
  onSwitch: () => void;
  onAccountSaved: () => Promise<unknown>;
  onClubsChanged: () => Promise<unknown>;
}) {
  const resource = useResource<Snapshot>("/api/clubs/" + club.id);
  const data = resource.data;
  const profile = useResource<Profile>(
    data?.viewer
      ? `/api/users/${data.viewer.id}/stats?clubId=${club.id}`
      : null,
  );
  const achievements = useResource<AchievementCollection>(data?.viewer ? `/api/clubs/${club.id}/achievements` : null);
  const [achievementRequest, setAchievementRequest] = useState<{id:AchievementId;nonce:number}>();
  async function saveAchievementPreferences(body: unknown) {
    await api(`/api/clubs/${club.id}/achievements`, "PATCH", body);
    await achievements.refresh();
  }
  const [memberStack, setMemberStack] = useState<string[]>([]);
  const [page, setPage] = useState("club"),
    [sessionCode, setSessionCode] = useState(""),
    [recap, setRecap] = useState<PlayerProfileSessionSummary | null>(null);
  async function refresh() {
    await Promise.all([resource.refresh(), profile.refresh(), achievements.refresh()]);
  }
  const action = useAction(refresh);
  const canManage =
    data?.club.role === "ADMIN" ||
    data?.club.role === "STAFF" ||
    data?.viewer.isAdmin;
  const canAdmin = data?.club.role === "ADMIN" || data?.viewer.isAdmin;
  const sessions = data?.sessions.filter((s) => !s.isTest) || [];
  const live = sessions.filter((s) => s.status === "ACTIVE");
  const upcoming = sessions.filter((s) => s.status === "WAITING");
  const recent = profile.data?.recentSessions?.find(r=>sessions.some(s=>s.id===r.id&&s.status==="COMPLETED"));
  const member = data?.clubMembers.find((p) => p.id === data.viewer.id);
  const rating = profile.data?.user.elo ?? member?.elo;
  const rank = profile.data?.context?.rankContext;
  function openMember(id: string) { setMemberStack(stack => stack.includes(id) ? stack.slice(0, stack.indexOf(id) + 1) : [...stack, id]); }
  function rankedMember(id: string): RankedMember | undefined {
    const found = data?.clubMembers.find(p => p.id === id);
    if (!found) return undefined;
    const ranked = data!.clubMembers.filter(p => p.status === "CORE" && (p.matchesPlayed ?? 0) > 0).sort((a,b) => b.elo-a.elo || a.name.localeCompare(b.name,undefined,{sensitivity:"base"}));
    const index=ranked.findIndex(p => p.id===id);
    return {...found,currentRank:index<0?null:index+1};
  }


  function go(p: string) {
    setMemberStack([]);
    setPage(p);
  }

  const memberOverlay = data ? memberStack.map((id,index) => { const target=rankedMember(id); return target ? <MemberProfileOverlay key={id} member={target} clubId={club.id} clubName={data.club.name} onBack={() => setMemberStack(stack => stack.slice(0,index))} onNavigate={go}><PlayerProfilePage clubId={club.id} clubName={data.club.name} member={target} isSelf={target.id===data.viewer.id} onOpenMember={openMember} onAccountSaved={async () => { await Promise.all([refresh(), onAccountSaved()]); }} achievements={target.id===data.viewer.id ? renderAchievement() : undefined} milestone={target.id===data.viewer.id ? renderMilestone() : undefined} /></MemberProfileOverlay> : null; }) : null;
  function openSession(code: string) {
    setSessionCode(code);
    go("session");
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
              <ArrowUp size={14} />
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
      <LiveSession
        code={sessionCode}
        onBack={() => {
          go("sessions");
          void refresh().catch(() => {});
        }}
        onEnded={async () => {
          await refresh();
          go("sessions");
        }}
      />
    );
  if (page === "recap-history" && recap)
    return (
      <div className="pc-app">
        <SessionMatchHistory
          code={recap.code}
          onBack={() => go("recap")}
          onMutated={refresh}
        />
      </div>
    );
  if (page === "admin" && data && canAdmin)
    return (
      <><Admin
        snapshot={data}
        refresh={async () => { await Promise.all([refresh(), onClubsChanged()]); }}
        onDeleted={async () => { await onClubsChanged(); onSwitch(); }}
        onBack={() => go("club")}
        onNavigate={go}
        onOpenProfile={openMember}
      />{memberOverlay}</>
    );
  return (
    <div className="pc-app">
      <header className="pc-header">
        {mainPages.includes(page as (typeof mainPages)[number]) ? (
          <>
            <button
              className="club-switcher"
              aria-label={
                "Switch club, current " + (data?.club.name || club.name)
              }
              onClick={onSwitch}
            >
              <small>YOUR CLUB</small>
              <strong>
                {data?.club.name || club.name}
                <CaretRight size={16} />
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
      <Pager pages={mainPages.includes(page as (typeof mainPages)[number]) ? mainPages : [page]} active={page} onChange={go}>{page => <>
          <ErrorText error={resource.error || profile.error || achievements.error || action.error} />
          {!data && <p role="status">Loading club…</p>}
          {data && page === "club" && (
            <>
              <div className="club-welcome">
                <div>
                  <span className="eyebrow">
                    {canManage ? "YOUR CLUB, TOGETHER" : "GOOD TO SEE YOU"}
                  </span>
                  <h1>
                    {canManage
                      ? "Ready for a rally?"
                      : `Welcome back, ${data.viewer.name}.`}
                  </h1>
                </div>
                <Image src="/spark.png" alt="Friendly spark" width={92} height={92} />
              </div>
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
              <UpcomingSessions sessions={upcoming} canManage={!!canManage} onOpen={openSession} onViewAll={() => go("sessions")} />
              {recent && <SessionUpdate session={recent} onOpen={() => { setRecap(recent); go("recap"); }} />}
              <ClubHighlights items={data.clubPulse?.sessionNews ?? []} onOpen={openSession} />
              <div className="section-heading">
                <h3>Your progress here</h3>
                <button className="text-button" onClick={() => go("profile")}>
                  View profile
                </button>
              </div>
              {renderStats()}
              {achievements.data && <NextMilestone collection={achievements.data} onOpen={id => { go("profile"); setAchievementRequest({id,nonce:Date.now()}); }} />}
              <PartnerChemistry onOpenProfile={openMember} pairs={data.clubPulse?.partnerships ?? []} />
              <TopRivalries onOpenProfile={openMember} rivalries={data.clubPulse?.rivalries ?? []} />
              {data.club.rules && <details className="club-rules"><summary>Club rules</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.club.rules}</p></details>}
            </>
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
              <UpcomingSessions sessions={upcoming} canManage={!!canManage} onOpen={openSession} />
              <details className="past-sessions">
                <summary>
                  <span>Past sessions <span className="past-sessions-count">{sessions.filter((s) => s.status === "COMPLETED").length}</span></span>
                  <CaretRight size={20} aria-hidden="true" />
                </summary>
              {sessions
                .filter((s) => s.status === "COMPLETED")
                .map((s) => (
                  <button
                    className="recent-card"
                    key={s.id}
                    onClick={() => {
                      const item = profile.data?.recentSessions.find(
                        (r) => r.id === s.id,
                      );
                      if (item) {
                        setRecap(item);
                        go("recap");
                      } else openSession(s.code);
                    }}
                  >
                    <CalendarBlank size={22} />
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {new Date(
                          s.endedAt || s.createdAt,
                        ).toLocaleDateString()}
                      </small>
                    </span>
                    <CaretRight size={18} />
                  </button>
                ))}
              {!sessions.some((s) => s.status === "COMPLETED") && (
                <p className="muted">No completed sessions yet.</p>
              )}
              </details>
            </>
          )}
          {data && page === "rankings" && <Rankings onOpenProfile={openMember} members={data.clubMembers} viewerId={data.viewer.id} clubName={data.club.name} hasCompletedSession={data.sessions.some(session => session.status === "COMPLETED" && !session.isTest)} />}
          {data && page === "profile" && member && <PlayerProfilePage clubId={club.id} clubName={data.club.name} member={rankedMember(data.viewer.id)!} isSelf onOpenMember={openMember} onAccountSaved={async () => { await Promise.all([refresh(), onAccountSaved()]); }} achievements={renderAchievement()} milestone={renderMilestone()} />}
          {page === "recap" && recap && (
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
                    {recap.ratingChange > 0 ? "+" : ""}
                    {recap.ratingChange}
                  </strong>
                </div>
                <div>
                  <small>Session result</small>
                  <strong>
                    {recap.wins} / {recap.matches}
                  </strong>
                  <small>wins</small>
                </div>
              </div>
              <button className="secondary full" onClick={() => go("recap-history")}>
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
          {data && page === "setup" && canManage && <SessionSetup clubId={club.id} members={data.clubMembers} onCreated={openSession} />}
      </>}</Pager>
      {!["setup", "recap"].includes(page) && (
        <MainNav active={page} onNavigate={go} />
      )}
      {memberOverlay}
    </div>
  );
}
