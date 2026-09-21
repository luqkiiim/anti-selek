"use client";
import { formatProfileDate } from "./profileDate";
import { useState } from "react";
import { CaretRight, Fire, Trophy, ChartLineUp, UsersThree } from "@phosphor-icons/react";
import type { MemberProfileData } from "@/lib/memberProfile";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";
import { Avatar, Sheet } from "./Primitives";

export function ProfilePeople({relationships,onOpenMember,isSelf}:{isSelf:boolean;relationships:MemberProfileData["relationships"];onOpenMember:(id:string)=>void}) {
  const [expanded,setExpanded]=useState<"partners"|"rivals"|null>(null);
  const partners=relationships.partners ?? (relationships.partner ? [relationships.partner] : []);
  const rivals=relationships.rivals ?? (relationships.rival ? [relationships.rival] : []);
  function rows(kind:"partners"|"rivals", full=false) {
    const list=kind==="partners"?partners:rivals;
    return <div className="profile-joined-list">{(full?list:list.slice(0,3)).map((person,index)=><button key={person.id} className="profile-person-row" onClick={()=>onOpenMember(person.id)}><span className="chemistry-rank">{index+1}</span><Avatar name={person.name} url={person.avatarUrl}/><span><strong>{person.name}</strong>{kind==="partners" && <small>{person.wins} wins together</small>}</span><span className="profile-person-stat">{kind==="partners"?`${Math.round(person.wins/Math.max(1,person.wins+person.losses)*100)}%`:`${person.wins}–${person.losses}`}{kind==="partners"&&<small>win rate</small>}</span><CaretRight size={16}/></button>)}</div>;
  }
  return <section className="profile-people"><div className="section-heading"><h2>{isSelf ? "Your people" : "Connections"}</h2><UsersThree size={22} weight="duotone" /></div>{(["partners","rivals"] as const).map(kind=><div key={kind} className="profile-people-group"><div className="section-heading"><h3>{kind==="partners"?"Best partners":"Top rivalries"}</h3>{(kind==="partners"?partners:rivals).length>3&&<button className="text-button" onClick={()=>setExpanded(kind)}>View all</button>}</div>{(kind==="partners"?partners:rivals).length?rows(kind):<p className="profile-footnote">More games with core members will build this list.</p>}</div>)}<Sheet open={!!expanded} title={expanded==="partners"?"Best partners":"Top rivalries"} onClose={()=>setExpanded(null)}>{expanded&&rows(expanded,true)}</Sheet></section>;
}

export function ProfileRecords({records,onOpenSession}:{records:MemberProfileData["records"];onOpenSession:(session:PlayerProfileSessionSummary)=>void}) {
  const [detail,setDetail]=useState<"rating"|"streak"|null>(null);
  return <section className="profile-records"><div className="section-heading"><h2>Personal bests</h2><Trophy size={22} weight="duotone" /></div><div className="profile-record-grid">
    <button disabled={!records.highestRating} onClick={()=>setDetail("rating")}><ChartLineUp size={25} weight="duotone"/><strong>{records.highestRating?.value??"—"}</strong><span>Highest rating</span></button>
    <button disabled={!records.longestStreak} onClick={()=>setDetail("streak")}><Fire size={25} weight="duotone"/><strong>{records.longestStreak?.value??"—"}</strong><span>Winning streak</span></button>
    <button disabled={!records.bestSession} onClick={()=>records.bestSession&&onOpenSession(records.bestSession)}><Trophy size={25} weight="duotone"/><strong>{records.bestSession?`${records.bestSession.wins}W`:"—"}</strong><span>Best session</span></button>
  </div><Sheet open={!!detail} title={detail==="rating"?"Highest recorded rating":"Longest winning streak"} onClose={()=>setDetail(null)}><div className="profile-record-detail"><strong>{detail==="rating"?records.highestRating?.value:records.longestStreak?.value}</strong><p>{detail==="rating"?"The highest rating in this club’s saved records, including manual adjustments.":"Consecutive wins across completed sessions. A loss ends the streak."}</p><small>{formatProfileDate(detail==="rating"?records.highestRating?.date:records.longestStreak?.date)}</small></div></Sheet></section>;
}
