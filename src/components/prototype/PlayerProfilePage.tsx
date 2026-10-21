"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, CaretRight, ChartLineUp, CalendarBlank } from "@phosphor-icons/react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import type { PlayerProfileSessionSummary, PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import type { MemberProfileData, RecordedSessionSummary } from "@/lib/memberProfile";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import { api } from "./api";
import { AchievementCabinet, NextMilestone } from "./Achievements";
import type { AchievementCollection, AchievementId } from "@/lib/clubAchievements";
import { MemberPins, type PublicAchievementCollection } from "./MemberPins";
import { ProfileActivityHistory } from "./ProfileActivityHistory";
import { formatProfileDate as dateLabel } from "./profileDate";
import { ProfilePeople, ProfileRecords } from "./ProfileHighlights";
import { ratingJourneyPoints } from "@/lib/ratingJourney";
import { normalizeMixedSideOverrideForGender } from "@/lib/mixedSide";
import { MainNav } from "./MainNav";
import "./player-profile.css";
import { useClubResource } from "@/components/app/ClubDataProvider";
import { clubProfileUrl } from "@/components/app/clubReadStore";
import { ProfileMatchDetails, ProfileMatchList } from "@/components/profile/ProfileMatchList";
import { useScrollRestoration } from "@/components/app/useScrollRestoration";

const AccountSettings = dynamic(() => import("./AccountSettings").then(module => module.AccountSettings));
export type MemberProfileResponse = {
  user: { id: string; name: string; avatarUrl?: string | null; elo: number };
  profile?: MemberProfileData;
};
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export function PlayerProfilePage({ clubId, clubName, member, isSelf, canEdit = true, canInvite = false, globalView = false, achievements, milestone, onOpenMember, onAccountSaved, onOpenSession }: {
  clubId: string; clubName: string; member: RankedMember; isSelf: boolean;
  onAccountSaved?: () => Promise<unknown>;
  onOpenSession?: (code: string) => void;
  canInvite?: boolean; globalView?: boolean; canEdit?: boolean;
  achievements?: ReactNode; milestone?: ReactNode; onOpenMember: (id: string) => void;
}) {
  const resource = useClubResource<MemberProfileResponse>(clubProfileUrl(clubId, member.id, { globalView }));
  const pins = useClubResource<PublicAchievementCollection>(isSelf ? null : `/api/clubs/${encodeURIComponent(clubId)}/achievements?userId=${encodeURIComponent(member.id)}${globalView ? "&view=global" : ""}`);
  const data = resource.data?.profile;
  const user = resource.data?.user;
  const ownerName = user?.name ?? member.name;
  const [accountOpen, setAccountOpen] = useState(false);
  const [recap, setRecap] = useState<PlayerProfileSessionSummary | null>(null);
  const [match, setMatch] = useState<PlayerProfileMatchHistoryEntry | null>(null);
  return <article className="player-profile" aria-label={`${member.name}’s club profile`}>
    <header className="player-profile-identity">{!isSelf && <span className="eyebrow">{clubName}</span>}{isSelf ? <button className="profile-account-button" aria-label="Account settings" disabled={!canEdit} onClick={() => setAccountOpen(true)}><Avatar large name={user?.name ?? member.name} url={user?.avatarUrl ?? member.avatarUrl} /></button> : <Avatar large name={user?.name ?? member.name} url={user?.avatarUrl ?? member.avatarUrl} />}<h1>{user?.name ?? member.name}</h1>{!isSelf && <span className="player-profile-membership">{member.status === "CORE" ? "Core member" : "Occasional member"}</span>}</header>
      <div className="player-standing profile-overview-stats"><div><span>Club rating</span><strong>{user?.elo ?? member.elo}</strong></div><div><span>Club rank</span><strong>{member.currentRank ? `#${member.currentRank}` : "—"}</strong>{member.rankDelta != null && member.rankDelta !== 0 && member.previousRank != null && <small className={member.rankDelta > 0 ? "positive" : "negative"}>{member.rankDelta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(member.rankDelta)} {Math.abs(member.rankDelta) === 1 ? "place" : "places"}</small>}</div><p className="profile-activity-totals">{data ? new Set(data.matchHistory.map(m => m.sessionId)).size : "\u2014"} {data && new Set(data.matchHistory.map(m => m.sessionId)).size === 1 ? "session" : "sessions"} {"\u00b7"} {data?.matchHistory.length ?? "\u2014"} {data?.matchHistory.length === 1 ? "match" : "matches"}</p></div>
      {canInvite && !isSelf && <span className="profile-connection-status">Account {member.isClaimed ? "connected" : "not connected"}</span>}
    {resource.error && <div className="profile-load-error"><ErrorText error={resource.error} /><button className="secondary" disabled={resource.loading || resource.retryAt > 0} onClick={() => void resource.refresh().catch(() => {})}>Try again</button></div>}
    {!data && !resource.error && <div className="profile-loading" role="status">Loading the story so far…</div>}
    {data && data.matchHistory.length === 0 && <div className="profile-empty"><CalendarBlank size={28} weight="duotone" /><h2>No completed sessions yet.</h2></div>}
    {data && data.matchHistory.length > 0 && <>
      {data.latestSession ? <section className="profile-latest"><div className="section-heading"><h2>{isSelf ? "Your latest session" : "Latest session"}</h2><span>{dateLabel(data.latestSession.date)}</span></div><button className="profile-latest-card" onClick={() => setRecap(data.latestSession)}><span className="eyebrow">{data.latestSession.name}</span><strong>{data.latestSession.wins === data.latestSession.matches && data.latestSession.matches > 1 ? "A clean sweep." : data.latestSession.ratingVerified !== false && data.latestSession.ratingChange > 0 ? "Moving up." : `${data.latestSession.wins} ${data.latestSession.wins === 1 ? "win" : "wins"} on the board.`}</strong><span className="profile-latest-result"><b>{data.latestSession.wins}W <span>·</span> {data.latestSession.losses}L</b><span className={data.latestSession.ratingChange >= 0 ? "positive" : "negative"}>{data.latestSession.ratingMode === "UNRATED" ? "Unrated" : data.latestSession.ratingVerified === false ? "Rating unavailable" : `${signed(data.latestSession.ratingChange)} rating`}</span></span><span className="profile-card-link">View session<CaretRight size={17} /></span></button></section> : <div className="profile-empty"><CalendarBlank size={28} weight="duotone" /><h2>The story starts on court.</h2><p>{isSelf ? "Your first completed session will appear here." : "No completed sessions in this club yet."}</p></div>}
      {!!data.recentForm.length && <section className="profile-form"><div className="section-heading"><h2>Recent form</h2><small>Latest first</small></div><div>{data.recentForm.map(m => <button key={m.id} className={m.result === "WIN" ? "win" : "loss"} aria-label={`${m.result === "WIN" ? "Win" : "Loss"}, ${m.score}, ${m.sessionName}`} onClick={() => setMatch(m)}>{m.result === "WIN" ? "W" : "L"}</button>)}</div></section>}
      {data.timeline.length > 0 && <RatingJourney timeline={data.timeline} onOpenSession={id => { const session = data.timeline.find(p => p.sessionId === id && p.session)?.session ?? data.history.items.find(s => s.id === id); if (session) setRecap(session); }} />}
      {isSelf ? <section className="profile-achievements" aria-label="Achievements"><div className="section-heading"><h2>Achievements</h2></div>{achievements ?? <OwnAchievements disabled={!canEdit} clubId={clubId} onOpenSession={onOpenSession} />}{milestone}</section> : pins.data?.earned.length ? <MemberPins collection={pins.data} /> : <ErrorText error={pins.error} />}
      <ProfilePeople key={`${clubId}:${member.id}`} relationships={data.relationships} matches={data.matchHistory} ownerName={ownerName} onOpenMatch={setMatch} isSelf={isSelf} onOpenMember={onOpenMember} />
      <ProfileRecords records={data.records} onOpenSession={setRecap} />
      <ProfileActivityHistory key={member.id} profile={data} ownerName={ownerName} onOpen={setRecap} onOpenMatch={setMatch} />
    </>}
    <details className="profile-rating-help"><summary>How ratings work</summary><p>Ratings and ranks belong to this club. Match results change your rating; manual adjustments are marked separately. Achievements are separate from matchmaking ratings.</p></details>
    {isSelf && accountOpen && <AccountSettings disabled={!canEdit} clubContext={{ clubId, clubName, playerId: member.id, gender: member.gender, mixedSideOverride: normalizeMixedSideOverrideForGender(member.gender, member.mixedSideOverride, member.partnerPreference) }} open onClose={() => setAccountOpen(false)} onSaved={async () => { await Promise.all([resource.refresh(), onAccountSaved?.()]); }} />}
    <Sheet open={!!recap} title="Session recap" onClose={() => setRecap(null)}>{recap && <div className="profile-recap"><Avatar name={user?.name ?? member.name} url={user?.avatarUrl ?? member.avatarUrl} /><h3>{ownerName}</h3><h2>{recap.name}</h2><p className="muted">{dateLabel(recap.date)}</p><div className="player-standing"><div><span>Result</span><strong>{recap.wins}W · {recap.losses}L</strong></div><div><span>Rating change</span><strong>{(recap as RecordedSessionSummary).ratingMode === "UNRATED" ? "Unrated" : (recap as RecordedSessionSummary).ratingVerified === false ? "—" : signed(recap.ratingChange)}</strong></div></div><div className="profile-recap-matches"><ProfileMatchList matches={data?.matchHistory.filter(m => m.sessionId === recap.id) ?? []} ownerName={ownerName} onOpen={setMatch} showSession={false} /></div>{recap.id === data?.records.bestSession?.id && <details className="profile-rating-help"><summary>What makes this the best session?</summary><p>Most wins first, then win rate, point difference, games played, and most recent session to break ties.</p></details>}</div>}</Sheet>
    <ProfileMatchDetails match={match} ownerName={ownerName} onClose={() => setMatch(null)} />
  </article>;
}

function OwnAchievements({ clubId, onOpenSession, disabled }: { clubId: string; onOpenSession?: (code: string) => void; disabled: boolean }) {
  const [openRequest, setOpenRequest] = useState<{ id: AchievementId; nonce: number }>();
  const resource = useClubResource<AchievementCollection>(`/api/clubs/${encodeURIComponent(clubId)}/achievements`);
  async function save(body: unknown) { if (disabled) return; await api(`/api/clubs/${encodeURIComponent(clubId)}/achievements`, "PATCH", body); await resource.refresh(); }
  return resource.data ? <><AchievementCabinet disabled={disabled} embedded openRequest={openRequest} collection={resource.data} onSaveShowcase={showcase => save({ showcase })} onSeen={seen => save({ seen })} onOpenSession={code => { if (onOpenSession) onOpenSession(code); else location.href = `/session/${encodeURIComponent(code)}`; }} /><NextMilestone embedded collection={resource.data} onOpen={id => setOpenRequest({ id, nonce: Date.now() })} /></> : <ErrorText error={resource.error} />;
}

export type RankedMember = ClubPageMember & { currentRank?: number | null };

function RatingJourney({ timeline, onOpenSession }: { timeline: MemberProfileData["timeline"]; onOpenSession: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const points = ratingJourneyPoints(timeline, all);
  const selected = points.find(p => p.id === selectedId) ?? points.at(-1);
  const known = points.filter(p => p.rating !== null);
  const ratings = known.map(p => p.rating!);
  const min = Math.min(...ratings), max = Math.max(...ratings);
  const x = (i: number) => 18 + (points.length <= 1 ? 142 : i / (points.length - 1) * 284);
  const y = (n: number) => 118 - (max === min ? .5 : (n - min) / (max - min)) * 96;
  function trackPoint(event: PointerEvent<HTMLDivElement>) {
    if (!points.length) return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const position=(event.clientX-bounds.left)/bounds.width*320;
    const index=Math.max(0,Math.min(points.length-1,Math.round((position-18)/284*(points.length-1))));
    setSelectedId(points[index].id);
  }
  const lines: string[] = []; let current: string[] = [];
  points.forEach((p, i) => { if (p.rating === null) { if (current.length) lines.push(current.join(" ")); current = []; } else current.push(`${x(i)},${y(p.rating)}`); }); if (current.length) lines.push(current.join(" "));
  return <section className="profile-journey"><div className="section-heading"><h2>Rating journey</h2><ChartLineUp size={22} weight="duotone" /></div><div className="profile-chart-tabs" aria-label="Rating history range"><button aria-pressed={!all} onClick={() => { setAll(false); setSelectedId(null); }}>Last 10 sessions</button><button aria-pressed={all} onClick={() => { setAll(true); setSelectedId(null); }}>All time</button></div>
    {points.length ? <><div className="profile-chart-touch" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); trackPoint(event); }} onPointerMove={trackPoint}><svg viewBox="0 0 320 140" className="profile-chart" role="img" aria-label="Recorded club rating over time">{selected && <line x1={x(points.indexOf(selected))} x2={x(points.indexOf(selected))} y1="12" y2="124" stroke="#bca6dc" strokeDasharray="3 4" />}<path d="M18 118H302" stroke="#e7dcef" />{lines.map((line, i) => <polyline key={i} points={line} fill="none" stroke="#7040cf" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}{points.map((p,i) => p.rating === null ? null : <g key={p.id} onClick={() => setSelectedId(p.id)}><circle cx={x(i)} cy={y(p.rating)} r="24" fill="transparent" /><circle cx={x(i)} cy={y(p.rating)} r={selected?.id === p.id ? 5 : 3} fill={p.kind === "MANUAL" ? "#ad731c" : p.kind === "ACTIVE" ? "#80718b" : "#7040cf"} /></g>)}</svg></div><div className="profile-chart-selection"><label><select aria-label="Rating history point" value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value)}>{points.map(p => <option key={p.id} value={p.id}>{p.label} · {dateLabel(p.date)}</option>)}</select></label>{selected && <><div className="profile-chart-summary"><div className="profile-chart-value"><strong>{selected.rating ?? "—"}</strong><span>{selected.kind === "MANUAL" ? "Manual adjustment" : selected.kind === "ACTIVE" ? "Session in progress" : selected.kind === "UNRATED" ? "Unrated session" : selected.kind === "GAP" ? "Historical rating unavailable" : selected.reconstructed ? "Reconstructed rating" : "Club rating"}</span></div>{selected.delta !== null && <small>{signed(selected.delta)} rating</small>}{selected.sessionId && (selected.kind === "SESSION" || selected.kind === "GAP" || selected.kind === "UNRATED") && <button className="text-button" onClick={() => onOpenSession(selected.sessionId!)}>View session<CaretRight size={15} /></button>}</div></>}</div>{points.some(p => p.kind === "GAP") && <p className="profile-footnote">Gaps indicate ratings that were not recorded.</p>}</> : <p className="profile-footnote">The journey appears once a rating change is recorded.</p>}
  </section>;
}

export function MemberProfileOverlay({ member, clubId, clubName, onBack, onNavigate, children, readOnly = false }: { readOnly?: boolean; member: ClubPageMember; clubId: string; clubName: string; onBack: () => void; onNavigate: (page: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef, `${clubId}/member/${member.id}`);
  useEffect(() => { const node=ref.current; const trigger=document.activeElement as HTMLElement | null; node?.showModal(); return () => {node?.close(); trigger?.focus({preventScroll:true});}; }, []);
  return <dialog ref={ref} className="member-profile-dialog" aria-label={`${member.name} profile in ${clubName}`} onCancel={e => {e.preventDefault();onBack();}} data-club-id={clubId}><div className="pc-app"><header className="pc-header"><button className="icon-button" aria-label="Back to previous page" onClick={onBack}><ArrowLeft size={23} /></button><strong>Player profile</strong><span /></header><div ref={scrollRef} className="pc-scroll" key={member.id}><main className="pc-content">{children}</main></div><MainNav active="" onNavigate={onNavigate} readOnly={readOnly} /></div></dialog>;
}
