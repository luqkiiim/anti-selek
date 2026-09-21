"use client";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarBlank, CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";
import type { MemberProfileData, RecordedSessionSummary } from "@/lib/memberProfile";
import { formatProfileDate } from "./profileDate";
import { api } from "./api";
import { ErrorText, Sheet } from "./Primitives";

function SessionRow({ session, onOpen }: { session: PlayerProfileSessionSummary; onOpen: (session: PlayerProfileSessionSummary) => void }) {
  return <button className="profile-history-row" onClick={() => onOpen(session)}><CalendarBlank size={22} weight="duotone" /><span><strong>{session.name}</strong><small>{formatProfileDate(session.date)} · {session.wins}W–{session.losses}L</small></span><b className={session.ratingChange >= 0 ? "positive" : "negative"}>{(session as RecordedSessionSummary).ratingVerified === false ? "—" : `${session.ratingChange > 0 ? "+" : ""}${session.ratingChange}`}</b><CaretRight size={16} /></button>;
}
export function ProfileHistory({ clubId, userId, history, onOpen, controls, title = "Session history" }: { controls?: ReactNode; title?: string; clubId: string; userId: string; history: MemberProfileData["history"]; onOpen: (session: PlayerProfileSessionSummary) => void }) {
  const [open,setOpen]=useState(false);
  return <section className="profile-history"><div className="section-heading"><h2>{title}</h2>{history.items.length > 0 && <button className="text-button" onClick={() => setOpen(true)}>View history<CaretRight size={15} /></button>}</div>{controls}{history.items.length ? <div className="profile-joined-list">{history.items.slice(0,3).map(s => <SessionRow key={s.id} session={s} onOpen={onOpen} />)}</div> : <p className="profile-footnote">Completed sessions will appear here.</p>}
    <Sheet open={open} title="Session history" onClose={() => setOpen(false)}><HistoryContents clubId={clubId} userId={userId} onOpen={onOpen} /></Sheet>
  </section>;
}
function HistoryContents({clubId,userId,onOpen}:{clubId:string;userId:string;onOpen:(session:PlayerProfileSessionSummary)=>void}) {
  const [offset,setOffset]=useState(0),[retry,setRetry]=useState(0);
  const [rows,setRows]=useState<PlayerProfileSessionSummary[]>([]);
  const [next,setNext]=useState<number|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
  useEffect(() => { let cancelled=false; void api<{profile:MemberProfileData}>(`/api/users/${userId}/stats?clubId=${encodeURIComponent(clubId)}&historyOffset=${offset}&historyLimit=10`).then(result=>{if(cancelled)return;setRows(old=>offset===0?result.profile.history.items:[...old,...result.profile.history.items.filter(s=>!old.some(x=>x.id===s.id))]);setNext(result.profile.history.nextOffset);setBusy(false);setError("");}).catch(e=>{if(!cancelled){setError(e instanceof Error?e.message:"Unable to load history");setBusy(false);}});return()=>{cancelled=true;};},[clubId,userId,offset,retry]);
  return <div className="profile-history-contents"><div className="profile-joined-list">{rows.map(s=><SessionRow key={s.id} session={s} onOpen={onOpen}/>)}</div>{busy&&<p role="status">Loading sessions…</p>}<ErrorText error={error}/>{error ? <button className="secondary full" onClick={()=>{setBusy(true);setRetry(n=>n+1);}}>Try again</button> : next!==null&&<button className="secondary full" disabled={busy} onClick={()=>{setBusy(true);setOffset(next);}}>Load more</button>}</div>;
}
