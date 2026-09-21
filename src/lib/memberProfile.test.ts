import { describe, expect, it } from "vitest";
import { buildMemberProfileData, type MemberProfileMatchSource } from "./memberProfile";

const person = (id: string) => ({ id, name: id });
function match(index: number, status = "COMPLETED"): MemberProfileMatchSource {
  return {
    id: `m${index}`, completedAt: new Date(2026, 0, index + 1),
    session: { id: `s${index}`, code: `code${index}`, name: `Session ${index}`, status },
    team1User1Id: "a", team1User2Id: "b", team2User1Id: "c", team2User2Id: "d",
    team1User1: person("a"), team1User2: person("b"), team2User1: person("c"), team2User2: person("d"),
    team1Score: 21, team2Score: 15, winnerTeam: 1, team1EloChange: 99, team2EloChange: -99,
  };
}
describe("member profile", () => {
  it("keeps active results separate and paginates completed sessions", () => {
    const data = buildMemberProfileData({ userId: "a", memberStatus: "CORE", matches: [...Array.from({length:12},(_,i)=>match(i)),match(13,"ACTIVE")], historyLimit:10 })!;
    expect(data.latestSession?.name).toBe("Session 11");
    expect(data.history.items).toHaveLength(10);
    expect(data.history.nextOffset).toBe(10);
    expect(data.recentForm).toHaveLength(6);
    expect(data.timeline.some(p=>p.kind === "ACTIVE")).toBe(true);
  });
  it("uses saved adjustments instead of legacy match deltas and preserves gaps", () => {
    const data = buildMemberProfileData({ userId:"a", matches:[match(0),match(1)], matchEloAdjustments:[{id:"ledger",matchId:"m1",userId:"a",beforeElo:1000,afterElo:1008,delta:8,createdAt:new Date(2026,0,2)}], manualRatingAdjustments:[{id:"manual",beforeElo:1008,afterElo:1050,createdAt:new Date(2026,0,3)}] })!;
    expect(data.latestSession?.ratingChange).toBe(8);
    expect(data.history.items[1].ratingVerified).toBe(false);
    expect(data.timeline.find(p=>p.sessionId==="s0")?.rating).toBeNull();
    expect(data.timeline.find(p=>p.kind==="MANUAL")?.delta).toBe(42);
    expect(data.records.highestRating?.value).toBe(1050);
    expect(data.recentForm.find(m=>m.id==="m0")?.eloChange).toBeNull();
  });
  it("serves occasional and new members without core relationship summaries", () => {
    const data=buildMemberProfileData({userId:"a",memberStatus:"OCCASIONAL",matches:[match(0),match(1)],currentCoreMemberIds:["a","b","c","d"]})!;
    expect(data.latestSession).not.toBeNull();
    expect(data.relationships).toEqual({partner:null,rival:null});
    expect(buildMemberProfileData({userId:"new",memberStatus:"CORE",matches:[]})?.latestSession).toBeNull();
  });
  it("excludes guest partners and occasional opponents", () => {
    const matches=[match(0),match(1),match(2)];
    matches.forEach(m=>{m.session.players=[{userId:"b",isGuest:true,sessionPoints:0,user:person("b")}];});
    const data=buildMemberProfileData({userId:"a",memberStatus:"CORE",matches,currentCoreMemberIds:["a","b","c"]})!;
    expect(data.relationships.partner).toBeNull();
    expect(data.relationships.rival?.id).toBe("c");
  });
  it("uses corrected results and marks active rating events separately", () => {
    const corrected = {...match(0), winnerTeam:2, team1Score:15, team2Score:21};
    const data=buildMemberProfileData({userId:"a",matches:[corrected,match(1,"ACTIVE")],matchEloAdjustments:[
      {id:"corrected",matchId:"m0",userId:"a",beforeElo:1000,afterElo:992,createdAt:new Date(2026,0,1)},
      {id:"active",matchId:"m1",userId:"a",beforeElo:992,afterElo:1001,createdAt:new Date(2026,0,2)},
    ]})!;
    expect(data.latestSession?.losses).toBe(1);
    expect(data.latestSession?.ratingChange).toBe(-8);
    expect(data.recentForm).toHaveLength(1);
    expect(data.timeline.find(p=>p.id==="active")?.kind).toBe("ACTIVE");
    expect(data.records.longestStreak).toBeNull();
  });
  it("bounds large history pages without losing older sessions", () => {
    const data=buildMemberProfileData({userId:"a",matches:Array.from({length:130},(_,i)=>match(i)),historyOffset:120,historyLimit:100})!;
    expect(data.history.items).toHaveLength(10);
    expect(data.history.nextOffset).toBeNull();
    expect(data.history.items.at(-1)?.id).toBe("s0");
    expect(data.timeline).toHaveLength(130);
  });
});
