import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { getClubStatUserResolver } from "./offlineIdentities";
import { buildClubAchievements, type AchievementCollection, type AchievementId, type AchievementSession } from "./clubAchievements";

type Database = PrismaClient | Prisma.TransactionClient;
function parseObject(value: string): Record<string, unknown> {
  try { const parsed=JSON.parse(value); return parsed && typeof parsed==="object" && !Array.isArray(parsed)?parsed:{}; } catch { return {}; }
}
function strings(value: unknown): string[] { return Array.isArray(value)?value.filter((v):v is string=>typeof v==="string"):[]; }
export async function captureAchievementEligibility(db: Database, sessionId: string, clubIds: string[]) {
  const session=await db.session.findUniqueOrThrow({where:{id:sessionId},select:{achievementEligibilityJson:true}});
  const snapshot=parseObject(session.achievementEligibilityJson);
  for(const clubId of new Set(clubIds)) if(!Array.isArray(snapshot[clubId])) {
    const members=await db.clubMember.findMany({where:{clubId},select:{userId:true}});
    snapshot[clubId]=members.map(m=>m.userId);
  }
  await db.session.update({where:{id:sessionId},data:{achievementEligibilityJson:JSON.stringify(snapshot)}});
}

export async function getClubAchievementCollection(clubId: string,userId: string): Promise<AchievementCollection> {
  const members=await prisma.clubMember.findMany({where:{clubId},select:{userId:true,createdAt:true,achievementPreferencesJson:true}});
  const member=members.find(m=>m.userId===userId);
  if(!member) throw new Error("Achievement member unavailable");
  const resolve=await getClubStatUserResolver(prisma,{clubId,memberUserIds:members.map(m=>m.userId)});
  const sessions=await prisma.session.findMany({
    where:{status:"COMPLETED",isTest:false,OR:[{clubId},{sessionClubs:{some:{clubId,status:"ACCEPTED"}}}]},
    orderBy:[{endedAt:"asc"},{id:"asc"}],
    include:{players:{select:{userId:true,isGuest:true}},sessionClubs:{where:{role:"HOST",status:"ACCEPTED"},select:{clubId:true,requestedById:true}},matches:{where:{status:"COMPLETED",winnerTeam:{in:[1,2]}},include:{eloAdjustments:{where:{clubId}}}}}
  });
  const sources: AchievementSession[]=[];
  for(const session of sessions) {
    const date=(session.endedAt??session.createdAt).toISOString();
    let snapshot=parseObject(session.achievementEligibilityJson);
    if(!Array.isArray(snapshot[clubId])) {
      // Legacy sessions have no historical roster snapshot. Freeze known members
      // who had joined by the session date; future joins will not rewrite it.
      await prisma.$transaction(async tx=>{
        const fresh=await tx.session.findUniqueOrThrow({where:{id:session.id},select:{achievementEligibilityJson:true}});
        snapshot=parseObject(fresh.achievementEligibilityJson);
        if(!Array.isArray(snapshot[clubId])) {
          snapshot[clubId]=members.filter(m=>m.createdAt.toISOString()<=date).map(m=>m.userId);
          await tx.session.update({where:{id:session.id},data:{achievementEligibilityJson:JSON.stringify(snapshot)}});
        }
      });
    }
    const host=session.sessionClubs.find(s=>s.clubId===clubId)?.requestedById??null;
    sources.push({id:session.id,code:session.code,name:session.name,date,hostId:host?resolve(host):null,
      eligibleIds:[...new Set(strings(snapshot[clubId]).map(resolve))],
      guests:session.players.filter(p=>p.isGuest).map(p=>resolve(p.userId)),
      matches:session.matches.filter(m=>m.team1Score!==null&&m.team2Score!==null).map(m=>{
        const ratingDelta:Record<string,number>={};
        for(const adjustment of m.eloAdjustments) ratingDelta[resolve(adjustment.userId)]=(ratingDelta[resolve(adjustment.userId)]??0)+adjustment.delta;
        // Legacy owning-club matches predate the per-player adjustment ledger.
        if(!m.eloAdjustments.length && session.clubId===clubId) {
          if(m.team1EloChange!==null) for(const id of [m.team1User1Id,m.team1User2Id]) ratingDelta[resolve(id)]=m.team1EloChange;
          if(m.team2EloChange!==null) for(const id of [m.team2User1Id,m.team2User2Id]) ratingDelta[resolve(id)]=m.team2EloChange;
        }
        return {id:m.id,date:(m.completedAt??session.endedAt??session.createdAt).toISOString(),team1:[...new Set([m.team1User1Id,m.team1User2Id].map(resolve))],team2:[...new Set([m.team2User1Id,m.team2User2Id].map(resolve))],winner:m.winnerTeam!,score1:m.team1Score!,score2:m.team2Score!,ratingDelta};
      })});
  }
  const achievements=buildClubAchievements(userId,members.map(m=>m.userId),sources);
  const preferences=parseObject(member.achievementPreferencesJson);
  const earned=achievements.flatMap(a=>a.tiers.filter(t=>t.earnedAt).map(t=>({id:a.id,tier:t.tier})));
  const seen=new Set(strings(preferences.seen));
  const savedShowcase=Array.isArray(preferences.showcase)?strings(preferences.showcase):achievements.filter(a=>a.earnedTier>0).slice(0,3).map(a=>a.id);
  const showcase=savedShowcase.filter((id):id is AchievementId=>achievements.some(a=>a.id===id&&a.earnedTier>0)).slice(0,3);
  return {achievements,showcase,unseen:earned.filter(e=>!seen.has(`${e.id}:${e.tier}`))};
}

export async function saveAchievementPreferences(clubId:string,userId:string,input:{showcase?:AchievementId[];seen?:{id:AchievementId;tier:number}[]}) {
  const collection=await getClubAchievementCollection(clubId,userId);
  const valid=new Set(collection.achievements.flatMap(a=>a.tiers.filter(t=>t.earnedAt).map(t=>`${a.id}:${t.tier}`)));
  if(input.showcase && (input.showcase.length>3||new Set(input.showcase).size!==input.showcase.length||input.showcase.some(id=>!collection.achievements.some(a=>a.id===id&&a.earnedTier)))) return false;
  if(input.seen?.some(e=>!valid.has(`${e.id}:${e.tier}`))) return false;
  await prisma.$transaction(async tx=>{
    const member=await tx.clubMember.findUniqueOrThrow({where:{clubId_userId:{clubId,userId}},select:{achievementPreferencesJson:true}});
    const preferences=parseObject(member.achievementPreferencesJson);
    if(input.showcase) preferences.showcase=input.showcase;
    if(input.seen) preferences.seen=[...new Set([...strings(preferences.seen),...input.seen.map(e=>`${e.id}:${e.tier}`)])];
    await tx.clubMember.update({where:{clubId_userId:{clubId,userId}},data:{achievementPreferencesJson:JSON.stringify(preferences)}});
  });
  return true;
}
