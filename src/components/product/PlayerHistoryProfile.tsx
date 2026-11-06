"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerProfileDerivedData, PlayerProfileMatchHistoryEntry, PlayerProfileSessionSummary } from "@/lib/profileStats";
import type { MemberProfileData } from "@/lib/memberProfile";
import { navigateApp, sessionHref } from "@/lib/appNavigation";
import { deletePlayerAvatar, uploadPlayerAvatar } from "@/lib/avatarClient";
import { useResource } from "./api";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import { RatingJourney } from "./PlayerProfilePage";
import { ProfilePeople } from "./ProfileHighlights";
import { ProfileMatchDetails, ProfileMatchList } from "@/components/profile/ProfileMatchList";
import { AdjustClubRating } from "@/components/profile/AdjustClubRating";
import { AddGuestToClub } from "@/components/profile/AddGuestToClub";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { AvatarPreviewModal } from "@/components/ui/AvatarPreviewModal";
import { formatProfileDate } from "./profileDate";
import "./player-profile.css";

export type PlayerHistoryResponse = PlayerProfileDerivedData & {
  profile?: MemberProfileData;
  user: { id: string; name: string; avatarUrl: string | null; elo: number; isRetired?: boolean };
  context?: { clubId: string; viewerCanManageClub: boolean; canAddGuestToClub?: boolean; rankContext: { currentRank: number | null } } | null;
};

/** A historical profile never fabricates an active club membership. */
export function PlayerHistoryProfile({ playerId, clubId, readOnly }: { playerId: string; clubId: string; readOnly: boolean }) {
  const router = useRouter();
  const params = new URLSearchParams();
  if (clubId) params.set("clubId", clubId);
  if (readOnly) params.set("view", "global");
  const resource = useResource<PlayerHistoryResponse>(`/api/users/${encodeURIComponent(playerId)}/stats${params.size ? `?${params}` : ""}`);
  const viewer = useResource<{ user?: { isAdmin?: boolean; isQuickAccess?: boolean; isClaimed?: boolean }; players?: { id: string }[] }>("/api/user/me");
  const [match, setMatch] = useState<PlayerProfileMatchHistoryEntry | null>(null);
  const [recap, setRecap] = useState<PlayerProfileSessionSummary | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const data = resource.data;
  if (!data) return <><ErrorText error={resource.error} />{resource.error ? <button className="secondary" onClick={() => void resource.refresh().catch(() => {})}>Try again</button> : <p role="status">Loading profile…</p>}</>;
  const canManage = !readOnly && !data.user.isRetired && !!clubId && !!data.context?.viewerCanManageClub;
  const canManagePhoto = !readOnly && !data.user.isRetired && !!clubId && !!viewer.data?.user && !viewer.data.user.isQuickAccess && (viewer.data.user.isAdmin || canManage || (viewer.data.user.isClaimed && viewer.data.players?.some(player => player.id === playerId)));
  const relationships: MemberProfileData["relationships"] = {
    partner: null, rival: null,
    partners: data.partners.best.map(person => ({ id: person.user.id, name: person.user.name, avatarUrl: person.user.avatarUrl, matches: person.matches, wins: person.wins, losses: person.losses })),
    rivals: data.opponents.toughest.map(person => ({ id: person.user.id, name: person.user.name, avatarUrl: person.user.avatarUrl, wins: person.wins, losses: person.losses })),
  };
  function profileHref(id: string, context: string | null | undefined = clubId) {
    const query = new URLSearchParams();
    if (context) query.set("clubId", context);
    if (readOnly) query.set("view", "global");
    return `/profile/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`;
  }
  function openMember(id: string) {
    const person = [...data!.partners.best, ...data!.opponents.toughest].find(item => item.user.id === id)?.user;
    navigateApp(router, profileHref(id, person?.profileClubId === undefined ? clubId : person.profileClubId));
  }
  const sessions = [...data.recentSessions].reverse();
  let rating = data.user.elo - sessions.reduce((total, item) => total + item.ratingChange, 0);
  const timeline = data.profile?.timeline ?? sessions.map(item => {
    rating += item.ratingChange;
    return { id: item.id, kind: "SESSION" as const, reconstructed: true, date: item.date, rating, delta: item.ratingChange, sessionId: item.id, sessionCode: item.code, label: item.name, session: item };
  });
  return <article className="player-profile" aria-label={`${data.user.name}’s profile`}>
    <header className="player-profile-identity">
      {canManagePhoto ? <AvatarUploader name={data.user.name} avatarUrl={data.user.avatarUrl} presentation="menu" onPreviewAvatar={setPhoto} onUpload={async file => { await uploadPlayerAvatar(playerId, file, clubId); await resource.refresh(); }} onRemove={async () => { await deletePlayerAvatar(playerId, clubId); await resource.refresh(); }} /> : <button className="profile-account-button" disabled={!data.user.avatarUrl} aria-label={`View ${data.user.name} photo`} onClick={() => setPhoto(data.user.avatarUrl)}><Avatar large name={data.user.name} url={data.user.avatarUrl} /></button>}
      <h1>{data.user.name}</h1>{data.user.isRetired && <span className="player-profile-membership">Archived profile</span>}
    </header>
    <ErrorText error={resource.error} />
    <div className="player-standing profile-overview-stats"><div><span>{clubId ? "Club rating" : "Rating"}</span><strong>{data.user.elo}</strong></div><div><span>Win rate</span><strong>{Math.round(data.stats.winRate)}%</strong></div><p className="profile-activity-totals">{data.stats.sessionsPlayed} {data.stats.sessionsPlayed === 1 ? "session" : "sessions"} · {data.stats.totalMatches} {data.stats.totalMatches === 1 ? "match" : "matches"}</p></div>
    {canManage && !data.context?.canAddGuestToClub && <AdjustClubRating clubId={clubId} userId={playerId} name={data.user.name} onChanged={() => { void resource.refresh().catch(() => {}); }} />}
    {!readOnly && !data.user.isRetired && clubId && data.context?.canAddGuestToClub && <AddGuestToClub clubId={clubId} userId={playerId} name={data.user.name} />}
    {!data.matchHistory.length ? <div className="profile-empty"><h2>No completed sessions yet.</h2></div> : <>
      {data.sessions.latest && <section className="profile-latest"><h2>Latest session</h2><button className="profile-latest-card" onClick={() => setRecap(data.sessions.latest)}><strong>{data.sessions.latest.name}</strong><span>{data.sessions.latest.wins}W · {data.sessions.latest.losses}L · {formatProfileDate(data.sessions.latest.date)}</span></button></section>}
      <section className="profile-form"><h2>Recent form</h2><div>{data.matchHistory.slice(0, 10).map(item => <button key={item.id} className={item.result === "WIN" ? "win" : "loss"} aria-label={`${item.result}, ${item.score}, ${item.sessionName}`} onClick={() => setMatch(item)}>{item.result === "WIN" ? "W" : "L"}</button>)}</div></section>
      <RatingJourney timeline={timeline} onOpenSession={id => setRecap(timeline.find(item => item.sessionId === id)?.session ?? data.recentSessions.find(item => item.id === id) ?? null)} />
      <ProfilePeople relationships={relationships} matches={data.matchHistory} ownerName={data.user.name} onOpenMatch={setMatch} onOpenMember={openMember} isSelf={false} />
      <details className="profile-rating-help"><summary>Statistics</summary><dl className="history-profile-stats"><dt>Wins / losses</dt><dd>{data.stats.wins} / {data.stats.losses}</dd><dt>Points scored / conceded</dt><dd>{data.stats.pointsScored} / {data.stats.pointsConceded}</dd><dt>Point difference</dt><dd>{data.stats.pointDifferential}</dd><dt>Matches per session</dt><dd>{data.stats.averageMatchesPerSession.toFixed(1)}</dd><dt>Recent rating change</dt><dd>{data.trend.ratingChange}</dd><dt>Current streak</dt><dd>{data.recentForm.currentStreak.result ? `${data.recentForm.currentStreak.count} ${data.recentForm.currentStreak.result === "WIN" ? "wins" : "losses"}` : "—"}</dd></dl>{data.sessions.best && <button className="text-button" onClick={() => setRecap(data.sessions.best)}>Best session · {data.sessions.best.name}</button>}</details>
      <details className="profile-rating-help"><summary>Achievements</summary>{data.achievements.map(item => <div key={item.id}><h3>{item.title}</h3><p>{item.description}</p><small>{item.progressLabel}</small>{item.earnedFromSession && <button className="text-button" onClick={() => navigateApp(router, sessionHref(item.earnedFromSession!.code, readOnly ? clubId : undefined))}>View session</button>}</div>)}</details>
      <section><h2>Session history</h2>{data.recentSessions.map(item => <button key={item.id} className="recent-card" onClick={() => setRecap(item)}><strong>{item.name}</strong><span>{item.wins}W · {item.losses}L · {item.ratingChange > 0 ? "+" : ""}{item.ratingChange} rating</span></button>)}</section>
      <section><h2>Match history</h2><ProfileMatchList matches={data.matchHistory} ownerName={data.user.name} onOpen={setMatch} /></section>
    </>}
    <Sheet open={!!recap} title="Session recap" onClose={() => setRecap(null)}>{recap && <div className="profile-recap"><h2>{recap.name}</h2><p>{recap.wins}W · {recap.losses}L</p><ProfileMatchList matches={data.matchHistory.filter(item => item.sessionId === recap.id)} ownerName={data.user.name} onOpen={setMatch} showSession={false} /><button className="secondary full" onClick={() => navigateApp(router, sessionHref(recap.code, readOnly ? clubId : undefined))}>View session</button></div>}</Sheet>
    <ProfileMatchDetails match={match} ownerName={data.user.name} onClose={() => setMatch(null)} renderParticipant={person => <a href={profileHref(person.id, person.profileClubId === undefined ? clubId : person.profileClubId)} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigateApp(router, event.currentTarget.getAttribute("href")!); } }}>{person.name}</a>} sessionAction={match && <button className="text-button" onClick={() => navigateApp(router, sessionHref(match.sessionCode, readOnly ? clubId : undefined))}>View session</button>} />
    <AvatarPreviewModal name={data.user.name} avatarUrl={photo} onClose={() => setPhoto(null)} />
  </article>;
}
