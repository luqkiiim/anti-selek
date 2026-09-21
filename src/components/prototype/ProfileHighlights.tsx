"use client";
import { useState } from "react";
import { CaretRight, Fire, Trophy, ChartLineUp, UsersThree } from "@phosphor-icons/react";
import type { MemberProfileData } from "@/lib/memberProfile";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";
import { Avatar, Sheet } from "./Primitives";

export function ProfilePeople({relationships,onOpenMember,isSelf}:{isSelf:boolean;relationships:MemberProfileData["relationships"];onOpenMember:(id:string)=>void}) {
  const {partner,rival}=relationships;
  return <section className="profile-people"><div className="section-heading"><h2>{isSelf ? "Your people" : "Connections"}</h2><UsersThree size={22} weight="duotone" /></div><div className="profile-joined-list">{partner&&<button className="profile-person-row" onClick={()=>onOpenMember(partner.id)}><Avatar name={partner.name} url={partner.avatarUrl}/><span><small>Best partner</small><strong>{partner.name}</strong><em>{partner.wins} wins together</em></span><CaretRight size={18}/></button>}{rival&&<button className="profile-person-row" onClick={()=>onOpenMember(rival.id)}><Avatar name={rival.name} url={rival.avatarUrl}/><span><small>Closest rivalry</small><strong>{rival.name}</strong><em>{rival.wins}–{rival.losses} head-to-head</em></span><CaretRight size={18}/></button>}</div>{!partner&&!rival&&<p className="profile-footnote">Partnerships and rivalries appear after more games with core members.</p>}</section>;
}
export function ProfileRecords({records,onOpenSession}:{records:MemberProfileData["records"];onOpenSession:(session:PlayerProfileSessionSummary)=>void}) {
  const [detail,setDetail]=useState<"rating"|"streak"|null>(null);
  return <section className="profile-records"><div className="section-heading"><h2>Personal bests</h2><Trophy size={22} weight="duotone" /></div><div className="profile-record-grid">
    <button disabled={!records.highestRating} onClick={()=>setDetail("rating")}><ChartLineUp size={25} weight="duotone"/><strong>{records.highestRating?.value??"—"}</strong><span>Highest rating</span></button>
    <button disabled={!records.longestStreak} onClick={()=>setDetail("streak")}><Fire size={25} weight="duotone"/><strong>{records.longestStreak?.value??"—"}</strong><span>Winning streak</span></button>
    <button disabled={!records.bestSession} onClick={()=>records.bestSession&&onOpenSession(records.bestSession)}><Trophy size={25} weight="duotone"/><strong>{records.bestSession?`${records.bestSession.wins}W`:"—"}</strong><span>Best session</span></button>
  </div><Sheet open={!!detail} title={detail==="rating"?"Highest recorded rating":"Longest winning streak"} onClose={()=>setDetail(null)}><div className="profile-record-detail"><strong>{detail==="rating"?records.highestRating?.value:records.longestStreak?.value}</strong><p>{detail==="rating"?"The highest rating in this club’s saved records, including manual adjustments.":"Consecutive wins across completed sessions. A loss ends the streak."}</p><small>{(detail==="rating"?records.highestRating?.date:records.longestStreak?.date)?new Date((detail==="rating"?records.highestRating?.date:records.longestStreak?.date)!).toLocaleDateString():"Date unavailable"}</small></div></Sheet></section>;
}
