"use client";
import { useState, type ReactNode } from "react";
import { CalendarBlank, CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";
import type { RecordedSessionSummary } from "@/lib/memberProfile";
import { formatProfileDate } from "./profileDate";
import { Sheet } from "./Primitives";

function SessionRow({ session, onOpen }: { session: PlayerProfileSessionSummary; onOpen: (session: PlayerProfileSessionSummary) => void }) {
  return <button className="profile-history-row" onClick={() => onOpen(session)}><CalendarBlank size={22} weight="duotone" /><span><strong>{session.name}</strong><small>{formatProfileDate(session.date)} · {session.wins}W–{session.losses}L</small></span><b className={session.ratingChange >= 0 ? "positive" : "negative"}>{(session as RecordedSessionSummary).ratingMode === "UNRATED" ? "Unrated" : (session as RecordedSessionSummary).ratingVerified === false ? "—" : `${session.ratingChange > 0 ? "+" : ""}${session.ratingChange}`}</b><CaretRight size={16} /></button>;
}
export function ProfileHistory({ sessions, onOpen, controls, title = "Session history" }: { controls?: ReactNode; title?: string; sessions: RecordedSessionSummary[]; onOpen: (session: PlayerProfileSessionSummary) => void }) {
  const [open,setOpen]=useState(false);
  return <section className="profile-history"><div className="section-heading"><h2>{title}</h2>{sessions.length > 0 && <button className="text-button" onClick={() => setOpen(true)}>View history<CaretRight size={15} /></button>}</div>{controls}{sessions.length ? <div className="profile-joined-list">{sessions.slice(0,3).map(s => <SessionRow key={s.id} session={s} onOpen={onOpen} />)}</div> : <p className="profile-footnote">Completed sessions will appear here.</p>}
    <Sheet open={open} title="Session history" onClose={() => setOpen(false)}><HistoryContents sessions={sessions} onOpen={onOpen} /></Sheet>
  </section>;
}
function HistoryContents({sessions,onOpen}:{sessions:RecordedSessionSummary[];onOpen:(session:PlayerProfileSessionSummary)=>void}) {
  const [limit,setLimit]=useState(10);
  return <div className="profile-history-contents"><div className="profile-joined-list">{sessions.slice(0,limit).map(s=><SessionRow key={s.id} session={s} onOpen={onOpen}/>)}</div>{limit<sessions.length&&<button className="secondary full" onClick={()=>setLimit(n=>n+10)}>Load more</button>}</div>;
}
