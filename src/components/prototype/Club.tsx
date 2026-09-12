"use client";
import Image from "next/image";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  UserCircle,
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
  Row,
  Sheet,
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
import { Rankings } from "./Rankings";
import { PartnerChemistry } from "./PartnerChemistry";
import { TopRivalries } from "./TopRivalries";
import type { ClubPulseSnapshot } from "@/lib/clubPulse";
import LiveSession from "./LiveSession";
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
}: {
  club: DashboardClub;
  onSwitch: () => void;
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
  const [page, setPage] = useState("club"),
    [sheet, setSheet] = useState(""),
    [sessionCode, setSessionCode] = useState(""),
    [sessionName, setSessionName] = useState(""),
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
  function go(p: string) {
    setSheet("");
    setPage(p);
  }

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
  function renderRecent(item = recent) {
    return item ? (
      <button
        className="recent-card"
        onClick={() => {
          setRecap(item);
          go("recap");
        }}
      >
        <CalendarBlank size={22} />
        <span>
          <small>Recent session</small>
          <strong>{item.name}</strong>
          <span className="result">
            <b>
              {item.wins} / {item.matches}
            </b>{" "}
            wins
          </span>
        </span>
        <CaretRight size={18} />
      </button>
    ) : null;
  }
  function renderAchievement() {
    return achievements.data ? <AchievementCabinet collection={achievements.data} openRequest={achievementRequest}
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
  if (page === "admin" && data && canAdmin)
    return (
      <Admin
        snapshot={data}
        refresh={refresh}
        onBack={() => go("club")}
        onNavigate={go}
      />
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
            <button
              className="icon-button"
              aria-label="Account settings"
              onClick={() => setSheet("account")}
            >
              <UserCircle size={26} />
            </button>
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
              ) : !upcoming.length ? (
                <div className="card">
                  <h2>
                    {sessions.length
                      ? "All caught up."
                      : "Make your first session."}
                  </h2>
                  <p className="muted">No live session in this club.</p>
                  <button
                    className="primary"
                    onClick={() => go(canManage ? "setup" : "sessions")}
                  >
                    {canManage ? "Prepare a session" : "Browse sessions"}
                  </button>
                </div>
              ) : null}
              <UpcomingSessions sessions={upcoming} canManage={!!canManage} onOpen={openSession} onViewAll={() => go("sessions")} />
              {canAdmin && <div className="link-group">
                  <Row
                    title="Manage club"
                    sub="Players, requests and settings"
                    icon={GearSix}
                    onClick={() => go("admin")}
                  />
              </div>}
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
              <PartnerChemistry pairs={data.clubPulse?.partnerships ?? []} />
              <TopRivalries rivalries={data.clubPulse?.rivalries ?? []} />
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
          {data && page === "rankings" && <Rankings members={data.clubMembers} viewerId={data.viewer.id} clubName={data.club.name} />}
          {data && page === "profile" && (
            <>
              <div className="profile-heading">
                <Avatar
                  large
                  name={data.viewer.name}
                  url={profile.data?.user.avatarUrl || data.viewer.avatarUrl}
                />
                <h1>{data.viewer.name}</h1>
                <p>{data.club.name}</p>
              </div>
              {renderStats()}
              <div className="section-heading">
                <h3>Recent form</h3>
                <small>
                  Last {profile.data?.matchHistory.slice(0, 6).length || 0}{" "}
                  matches
                </small>
              </div>
              <div className="form-strip">
                {profile.data?.matchHistory.slice(0, 6).map((m) => (
                  <span
                    key={m.id}
                    className={m.result === "WIN" ? "win" : "loss"}
                  >
                    {m.result === "WIN" ? "W" : "L"}
                  </span>
                ))}
              </div>
              {renderRecent()}
              {renderAchievement()}
              <div className="link-group">
                <Row
                  title="Account settings"
                  sub="Your name and preferences"
                  icon={GearSix}
                  onClick={() => setSheet("account")}
                />
              </div>
              <details>
                <summary>How ratings work</summary>
                <p>
                  Club ratings reflect match results. Achievements are separate
                  from the rating used to balance teams.
                </p>
              </details>
            </>
          )}
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
              {renderAchievement()}
              <button className="primary" onClick={() => go("profile")}>
                View progress
              </button>
              <button className="text-button" onClick={() => go("club")}>
                Back to club
              </button>
            </>
          )}
          {data && page === "setup" && canManage && (
            <>
              <h1>Get everyone playing.</h1>
              <p className="muted">A few details, then you&apos;re ready.</p>
              <label className="field-label">
                Session name
                <input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                />
              </label>
              <div className="setting-line">
                <span>Courts</span>
                <strong>2</strong>
              </div>
              <div className="setting-line">
                <span>Matchmaking</span>
                <strong>Balanced</strong>
              </div>
              <div className="setting-line">
                <span>Players</span>
                <strong>{data.clubMembers.length} selected</strong>
              </div>
              {canAdmin && (
                <button className="secondary full" onClick={() => go("admin")}>
                  Manage roster
                </button>
              )}
              <button
                className="primary"
                disabled={
                  action.busy ||
                  !sessionName.trim() ||
                  data.clubMembers.length < 2
                }
                onClick={() =>
                  void action.run(
                    async () => {
                      const created = await api<{ code: string }>(
                        "/api/sessions",
                        "POST",
                        {
                          name: sessionName,
                          clubId: club.id,
                          courtCount: 2,
                          matchmakingStyle: "BALANCED",
                          balanceMetric: "RATING",
                          scoringType: "POINTS",
                          pairingMode: "OPEN",
                          playerIds: data.clubMembers.map((p) => p.id),
                          autoQueueEnabled: true,
                        },
                      );
                      setSessionCode(created.code);
                      go("session");
                    },
                    () => go("session"),
                  )
                }
              >
                Prepare session
              </button>
            </>
          )}
      </>}</Pager>
      {!["setup", "recap"].includes(page) && (
        <MainNav active={page} onNavigate={go} />
      )}
      <Sheet open={!!sheet}
          title={
            sheet === "account"
              ? "Your account"
              : "Strong Start"
          }
          onClose={() => setSheet("")}
        >
          {sheet === "account" ? (
            <>
              <Avatar
                large
                name={data?.viewer.name || ""}
                url={data?.viewer.avatarUrl}
              />
              <p>{data?.viewer.name}</p>
              <p className="muted">{data?.viewer.email}</p>
              <button className="primary" onClick={() => setSheet("")}>
                Done
              </button>
              <button
                className="text-button"
                onClick={() => void signOut({ callbackUrl: "/signin" })}
              >
                Sign out
              </button>
            </>
          ) : null}
        </Sheet>
    </div>
  );
}
