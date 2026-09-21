import { expect, it } from "vitest";
import { ratingJourneyPoints } from "./ratingJourney";
import type { MemberProfileTimelineEntry } from "./memberProfile";

it("uses the latest ten sessions, with one point per session rather than every match", () => {
  const points: MemberProfileTimelineEntry[] = Array.from({length:12},(_,i)=>Array.from({length:4},(_,j)=>({
    id:`${i}-${j}`,kind:"SESSION" as const,sessionId:`s${i}`,date:new Date(2026,0,i+1,j).toISOString(),rating:1000+i*4+j,delta:1,label:`Session ${i}`,
  }))).flat();
  expect(ratingJourneyPoints(points,false).map(p=>p.sessionId)).toEqual(Array.from({length:10},(_,i)=>`s${i+2}`));
  expect(ratingJourneyPoints(points,false)[0].rating).toBe(1011);
  expect(ratingJourneyPoints(points,true)).toHaveLength(12);
});

it("does not pull an old session into the range when its ledger was corrected recently", () => {
  const points: MemberProfileTimelineEntry[] = Array.from({length:12},(_,i)=>({id:`p${i}`,kind:"SESSION",sessionId:`s${i}`,date:new Date(2026,0,i+1).toISOString(),rating:1000+i,delta:1,label:`Session ${i}`,session:{id:`s${i}`,code:`s${i}`,name:`Session ${i}`,date:new Date(2026,0,i+1).toISOString(),matches:1,wins:1,losses:0,winRate:100,pointDifferential:1,ratingChange:1}}));
  points[0].date=new Date(2026,2,1).toISOString();
  points.push({id:"manual",kind:"MANUAL",date:new Date(2026,0,8).toISOString(),rating:1200,delta:100,label:"Manual adjustment"});
  const filtered=ratingJourneyPoints(points,false);
  expect(filtered.some(p=>p.sessionId==="s0")).toBe(false);
  expect(filtered.filter(p=>p.kind==="SESSION")).toHaveLength(10);
  expect(filtered.some(p=>p.kind==="MANUAL")).toBe(true);
});
