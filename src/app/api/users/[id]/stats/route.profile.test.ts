import { beforeEach, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ matches: [] as Array<Record<string, unknown>>, ledger: [] as Array<Record<string, unknown>> }));
const findMatches = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: async () => ({user:{id:"account",isAdmin:false}}) }));
vi.mock("@/lib/prisma", () => ({prisma:{
  player:{findUnique:async()=>({id:"a",name:"Alex",avatarKey:null,elo:1000,createdAt:new Date("2026-01-01"),clubMemberships:[]})},
  clubAccess:{findUnique:async()=>({status:"ACTIVE",role:"MEMBER"})},
  clubMember:{findUnique:async()=>({id:"member-a",elo:1218,status:"CORE"}),findMany:async()=>["a","b","c","d"].map(playerId=>({playerId,elo:1200,player:{name:playerId}}))},
  match:{findMany:findMatches},
  matchEloAdjustment:{findMany:async()=>fixtures.ledger},
  clubRatingAdjustment:{findMany:async()=>[{id:"manual",beforeElo:1100,afterElo:1150,createdAt:new Date("2026-01-14"),reason:"Correction"}]},
}}));
vi.mock("@/lib/offlineIdentities",()=>({getClubStatUserResolver:async()=>(id:string)=>id}));
vi.mock("@/lib/rateLimit",()=>({rateLimit:async()=>null,checkInvalidTargetRateLimit:async()=>null,invalidTargetResponse:async()=>Response.json({error:"Unauthorized"},{status:403})}));

import { GET } from "./route";

beforeEach(()=>{
  vi.clearAllMocks();
  fixtures.matches=[];fixtures.ledger=[];
  for(let day=0;day<13;day++){
    const players=["a","b","c","d"].map(id=>({playerId:id,profileClubId:"club",isGuest:false,sessionPoints:6,player:{id,name:id,avatarKey:null}}));
    const session={id:`session-${day}`,code:`CODE${day}`,name:`Day ${day}`,status:"COMPLETED",clubId:"club",ratingPolicyVersion:2,ratingMode:day===4?"UNRATED":"RATED",isTest:false,type:"POINTS",createdAt:new Date(Date.UTC(2026,0,day+1)),endedAt:new Date(Date.UTC(2026,0,day+1,3)),players,matches:[] as Array<Record<string,unknown>>};
    for(let i=0;i<3;i++){
      const completedAt=new Date(Date.UTC(2026,0,day+1,1,i));
      const match={id:`match-${day}-${i}`,sessionId:session.id,session,completedAt,
        team1Player1Id:"a",team1Player2Id:"b",team2Player1Id:"c",team2Player2Id:"d",
        team1Player1:players[0].player,team1Player2:players[1].player,team2Player1:players[2].player,team2Player2:players[3].player,
        scoringFormat:"SINGLE_GAME",gameScoresJson:null,team1Score:i===1?18:21,team2Score:i===1?21:18,winnerTeam:i===1?2:1,team1EloChange:99,team2EloChange:-99};
      session.matches.push({...match,session:undefined});fixtures.matches.push(match);
      if(day%2===0&&day!==4)fixtures.ledger.push({id:`ledger-${day}-${i}`,matchId:match.id,playerId:"a",beforeElo:1100+i*8,afterElo:1108+i*8,delta:8,createdAt:completedAt});
    }
  }
  findMatches.mockImplementation(async(query)=>{
    if(!query.include)return fixtures.matches;
    if(query.include.session.select.matches)return fixtures.matches;
    return fixtures.matches.map(({session,...match})=>({...match,session:{...(session as object),matches:undefined}}));
  });
});

async function read(section=""){
  const response=await GET(new Request(`http://localhost/api/users/a/stats?clubId=club${section?`&section=${section}`:""}`),{params:Promise.resolve({id:"a"})});
  expect(response.status).toBe(200);return response.json();
}

it("keeps the complete ledger profile identical when unused legacy sources and fields are omitted",async()=>{
  const full=await read();findMatches.mockClear();
  const compact=await read("profile");
  expect(compact.profile).toEqual(full.profile);
  expect(compact.user).toEqual(full.user);
  expect(compact.profile.matchHistory).toHaveLength(39);
  expect(compact.profile.timeline.some((p:{kind:string})=>p.kind==="UNRATED")).toBe(true);
  expect(compact.profile.timeline.some((p:{kind:string})=>p.kind==="GAP")).toBe(true);
  expect(compact.profile.records.highestRating.value).toBe(1150);
  expect(findMatches).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length);
});

it("keeps Home's exact legacy recent-session ratings and rank context in its smaller response",async()=>{
  const full=await read();const overview=await read("overview");
  expect(overview.recentSessions).toEqual(full.recentSessions);
  expect(overview.context).toEqual(full.context);
  expect(overview.user).toEqual(full.user);
  expect(overview).not.toHaveProperty("profile");
  expect(overview).not.toHaveProperty("matchHistory");
});
