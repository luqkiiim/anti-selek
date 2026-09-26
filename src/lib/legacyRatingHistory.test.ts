import { expect, it } from "vitest";
import { reconstructLegacyRatings } from "./legacyRatingHistory";
import { buildMemberProfileData, type MemberProfileMatchSource, type MemberProfileMatchEloAdjustmentSource } from "./memberProfile";

function game(day:number,delta:number|null): MemberProfileMatchSource {
  const person=(id:string)=>({id,name:id});
  return {id:`m${day}`,completedAt:new Date(2026,0,day),session:{id:`s${day}`,code:`s${day}`,name:`Session ${day}`,clubId:"club",status:"COMPLETED",players:[{userId:"a",isGuest:false,sessionPoints:0,user:person("a")}]},team1User1Id:"a",team1User2Id:"b",team2User1Id:"c",team2User2Id:"d",team1User1:person("a"),team1User2:person("b"),team2User1:person("c"),team2User2:person("d"),team1Score:21,team2Score:18,winnerTeam:1,team1EloChange:delta,team2EloChange:delta===null?null:-delta};
}
const anchor:MemberProfileMatchEloAdjustmentSource={id:"exact",matchId:"m4",clubId:"club",userId:"a",beforeElo:1020,afterElo:1028,delta:8,createdAt:new Date(2026,0,4)};
it("reconstructs a continuous prefix backward without assuming a starting rating",()=>{
 const result=reconstructLegacyRatings("a","club",[game(1,12),game(2,-5),game(3,13),game(4,8)],[anchor],[]);
 expect(result.map(p=>[p.beforeElo,p.afterElo])).toEqual([[1007,1020],[1012,1007],[1000,1012]]);
 expect(result.every(p=>p.reconstructed)).toBe(true);
 const profile=buildMemberProfileData({userId:"a",clubId:"club",matches:[game(1,12),game(2,-5),game(3,13),game(4,8)],matchEloAdjustments:[anchor]})!;
 expect(profile.timeline.filter(p=>p.kind==="GAP")).toHaveLength(0);
 expect(profile.matchHistory.find(m=>m.id==="m1")?.eloChange).toBe(12);
 expect(profile.timeline.find(p=>p.sessionId==="s1")?.reconstructed).toBe(true);
});
it("stops at missing changes, guests, or another club",()=>{
 for(const bad of [game(2,null),{...game(2,-5),session:{...game(2,-5).session,clubId:"other"}},{...game(2,-5),session:{...game(2,-5).session,players:[{userId:"a",isGuest:true,sessionPoints:0,user:{id:"a",name:"a"}}]}}]) {
  expect(reconstructLegacyRatings("a","club",[game(1,12),bad,game(3,13),game(4,8)],[anchor],[]).map(p=>p.matchId)).toEqual(["m3"]);
 }
});
it("crosses consistent manual changes but stops at a discontinuity",()=>{
 const manual={id:"manual",beforeElo:990,afterElo:1007,createdAt:new Date(2026,0,2,12)};
 const result=reconstructLegacyRatings("a","club",[game(1,12),game(2,-5),game(3,13),game(4,8)],[anchor],[manual]);
 expect(result.find(p=>p.matchId==="m2")?.afterElo).toBe(990);
 expect(reconstructLegacyRatings("a","club",[game(1,12),game(2,-5),game(3,13),game(4,8)],[anchor],[{...manual,afterElo:1008}])).toHaveLength(1);
});
it("never guesses without an anchor or from a later correction",()=>{
 const matches=[game(1,12),game(4,8)];
 expect(reconstructLegacyRatings("a","club",matches,[],[])).toEqual([]);
 expect(reconstructLegacyRatings("a","club",matches,[{...anchor,createdAt:new Date(2026,1,1)}],[])).toEqual([]);
});
