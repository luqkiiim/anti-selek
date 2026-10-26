"use client";
import { formatProfileDate } from "./profileDate";
import { useState } from "react";
import { CaretRight, Fire, Trophy, ChartLineUp, UsersThree } from "@phosphor-icons/react";
import type { MemberProfileData } from "@/lib/memberProfile";
import type { PlayerProfileMatchHistoryEntry, PlayerProfileSessionSummary } from "@/lib/profileStats";
import type { ProfileConnectionSelection } from "@/lib/profileConnectionHistory";
import { ConnectionMatchHistorySheet } from "@/components/profile/ConnectionMatchHistorySheet";
import { Avatar, Sheet } from "./Primitives";
import { ProfileMatchList } from "@/components/profile/ProfileMatchList";

export function ProfilePeople({ relationships, matches, ownerName, onOpenMatch, onOpenMember, isSelf }: {
  isSelf: boolean;
  relationships: MemberProfileData["relationships"];
  matches: PlayerProfileMatchHistoryEntry[];
  ownerName: string;
  onOpenMatch: (match: PlayerProfileMatchHistoryEntry) => void;
  onOpenMember: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<"partners" | "rivals" | null>(null);
  const [connection, setConnection] = useState<ProfileConnectionSelection | null>(null);
  const partners = relationships.partners ?? (relationships.partner ? [relationships.partner] : []);
  const rivals = relationships.rivals ?? (relationships.rival ? [relationships.rival] : []);
  function openMember(id: string) {
    setConnection(null);
    setExpanded(null);
    onOpenMember(id);
  }
  function rows(kind: "partners" | "rivals", full = false) {
    const list = kind === "partners" ? partners : rivals;
    return <div className="profile-joined-list">{(full ? list : list.slice(0, 3)).map((person, index) => {
      const role = kind === "partners" ? "partner" : "opponent";
      return <div key={person.id} className="profile-person-row">
        <span className="chemistry-rank">{index + 1}</span>
        <button type="button" className="profile-person-photo" aria-label={`View ${person.name}’s profile`} onClick={() => openMember(person.id)}><Avatar name={person.name} url={person.avatarUrl} /></button>
        <button type="button" className="profile-person-history" aria-label={`Matches ${role === "partner" ? "with" : "against"} ${person.name}`} onClick={() => setConnection({ id: person.id, name: person.name, role })}>
          <span><strong>{person.name}</strong>{kind === "partners" && <small>{Math.round(person.wins / Math.max(1, person.wins + person.losses) * 100)}% win rate</small>}</span>
          <span className="profile-person-stat">{person.wins}W · {person.losses}L</span>
          <CaretRight size={16} />
        </button>
      </div>;
    })}</div>;
  }
  if (!partners.length && !rivals.length) return null;
  return <section className="profile-people">
    <div className="section-heading"><h2>{isSelf ? "Your people" : "Connections"}</h2><UsersThree size={22} weight="duotone" /></div>
    {(["partners", "rivals"] as const).filter(kind => (kind === "partners" ? partners : rivals).length > 0).map(kind => <div key={kind} className="profile-people-group">
      <div className="section-heading"><h3>{kind === "partners" ? "Best partners" : "Top rivalries"}</h3>{(kind === "partners" ? partners : rivals).length > 3 && <button className="text-button" onClick={() => setExpanded(kind)}>View all</button>}</div>
      {rows(kind)}
    </div>)}
    <Sheet open={!!expanded} title={expanded === "partners" ? "Best partners" : "Top rivalries"} onClose={() => setExpanded(null)}>{expanded && rows(expanded, true)}</Sheet>
    <ConnectionMatchHistorySheet connection={connection} matches={matches} onClose={() => setConnection(null)} renderMatches={items => <ProfileMatchList matches={items} ownerName={ownerName} onOpen={onOpenMatch} highlightPlayerId={connection?.id} />} />
  </section>;
}

export function ProfileRecords({records,onOpenSession}:{records:MemberProfileData["records"];onOpenSession:(session:PlayerProfileSessionSummary)=>void}) {
  const [detail,setDetail]=useState<"rating"|"streak"|null>(null);
  if (!records.highestRating && !records.longestStreak && !records.bestSession) return null;
  return <section className="profile-records"><div className="section-heading"><h2>Personal bests</h2><Trophy size={22} weight="duotone" /></div><div className="profile-record-grid">
    {records.highestRating && <button onClick={()=>setDetail("rating")}><ChartLineUp size={25} weight="duotone"/><strong>{records.highestRating?.value??"—"}</strong><span>Highest rating</span></button>}
    {records.longestStreak && <button onClick={()=>setDetail("streak")}><Fire size={25} weight="duotone"/><strong>{records.longestStreak?.value??"—"}</strong><span>Winning streak</span></button>}
    {records.bestSession && <button onClick={()=>records.bestSession&&onOpenSession(records.bestSession)}><Trophy size={25} weight="duotone"/><strong>{records.bestSession?`${records.bestSession.wins}W`:"—"}</strong><span>Best session</span></button>}
  </div><Sheet open={!!detail} title={detail==="rating"?"Highest recorded rating":"Longest winning streak"} onClose={()=>setDetail(null)}><div className="profile-record-detail"><strong>{detail==="rating"?records.highestRating?.value:records.longestStreak?.value}</strong><p>{detail==="rating"?"The highest rating in this club’s saved records, including manual adjustments.":"Consecutive wins across completed sessions. A loss ends the streak."}</p><small>{formatProfileDate(detail==="rating"?records.highestRating?.date:records.longestStreak?.date)}</small></div></Sheet></section>;
}
