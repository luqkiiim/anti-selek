import { describe, expect, it } from "vitest";
import { buildMemberProfileData, type MemberProfileMatchSource } from "./memberProfile";
import { getMemberProfileSessionHistory } from "./profileHistory";

const person = (id: string) => ({id,name:id});
function match(index:number): MemberProfileMatchSource {
  return {id:`match-${index}`,completedAt:new Date(Date.UTC(2026,0,1+Math.floor(index/2))),
    session:{id:`session-${Math.floor(index/2)}`,code:`code-${Math.floor(index/2)}`,name:`Session ${Math.floor(index/2)}`,status:"COMPLETED",clubId:"club",ratingMode:index%6===0?"UNRATED":"RATED"},
    team1User1Id:"a",team1User2Id:"b",team2User1Id:"c",team2User2Id:"d",
    team1User1:person("a"),team1User2:person("b"),team2User1:person("c"),team2User2:person("d"),
    team1Score:21,team2Score:15,winnerTeam:1,team1EloChange:8,team2EloChange:-8};
}
describe("history from the loaded rating timeline",()=>{
  it("matches every server history page without losing gaps, unrated sessions or older matches",()=>{
    const matches=Array.from({length:48},(_,i)=>match(i));
    matches.push({...match(50),session:{...match(50).session,status:"ACTIVE"}},
      {...match(52),session:{...match(52).session,type:"PRACTICE"}},
      {...match(54),session:{...match(54).session,isTest:true}});
    const input={userId:"a",clubId:"club",matches,matchEloAdjustments:matches.slice(5,18).map(m=>({id:`ledger-${m.id}`,matchId:m.id,userId:"a",beforeElo:1000,afterElo:1008,createdAt:m.completedAt}))};
    const profile=buildMemberProfileData(input)!;
    const history=getMemberProfileSessionHistory(profile);
    expect(history).toHaveLength(24);
    expect(history.some(s=>s.ratingVerified===false)).toBe(true);
    expect(history.some(s=>s.ratingMode==="UNRATED")).toBe(true);
    for(let offset=0;offset<history.length;offset+=10){
      const serverPage=buildMemberProfileData({...input,historyOffset:offset,historyLimit:10})!.history;
      expect(history.slice(offset,offset+10)).toEqual(serverPage.items);
    }
    expect(history.at(-1)?.id).toBe("session-0");
  });
});
