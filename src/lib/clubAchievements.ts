export type AchievementId = "first-serve" | "familiar-face" | "mix-it-up" | "rhythm" | "on-the-board" | "down-to-wire" | "clean-sweep" | "back-in-business" | "raising-bar" | "good-together" | "making-it-happen";
export interface AchievementTier { tier: number; target: number; earnedAt: string | null; sessionCode: string | null; sessionName: string | null; }
export interface ClubAchievement { id: AchievementId; name: string; description: string; unit: string; progress: number; progressLabel: string; tiers: AchievementTier[]; earnedTier: number; optional: boolean; }
export interface AchievementCollection { achievements: ClubAchievement[]; showcase: AchievementId[]; unseen: { id: AchievementId; tier: number }[]; }

export interface AchievementMatch { id: string; date: string; team1: string[]; team2: string[]; winner: number; score1: number; score2: number; ratingDelta: Record<string, number>; }
export interface AchievementSession { id: string; code: string; name: string; date: string; hostId: string | null; eligibleIds: string[]; guests: string[]; matches: AchievementMatch[]; }
const definitions: { id: AchievementId; name: string; description: string; unit: string; targets: number[]; optional?: boolean }[] = [
  { id: "first-serve", name: "First Serve", description: "Finish a session with at least one recorded game.", unit: "sessions", targets: [1] },
  { id: "familiar-face", name: "A Familiar Face", description: "Play at least one recorded game in each completed session.", unit: "sessions", targets: [5,20,50] },
  { id: "mix-it-up", name: "Mix It Up", description: "Partner with 25%, 50%, then 100% of eligible clubmates. Eligible members have played a completed session; you and temporary guests are excluded. Earned tiers survive membership changes.", unit: "%", targets: [25,50,100] },
  { id: "rhythm", name: "Finding Your Rhythm", description: "Play in consecutive Monday–Sunday calendar weeks (UTC). Optional: earned tiers stay yours when a streak ends.", unit: "weeks", targets: [3,6,12], optional: true },
  { id: "on-the-board", name: "On the Board", description: "Win recorded games in completed sessions.", unit: "wins", targets: [10,50,150] },
  { id: "down-to-wire", name: "Down to the Wire", description: "Win games by one or two points.", unit: "close wins", targets: [3,10,25] },
  { id: "clean-sweep", name: "Clean Sweep", description: "Win every game you played in a session, with at least four games.", unit: "perfect sessions", targets: [1,3,10] },
  { id: "back-in-business", name: "Back in Business", description: "After at least two consecutive losses, win your next game in the same session. Each recovery counts once.", unit: "comebacks", targets: [1,5,15] },
  { id: "raising-bar", name: "Raising the Bar", description: "After your first ten rated games, gain 50, 100, then 200 points through matches. Manual adjustments do not count.", unit: "rating points", targets: [50,100,200] },
  { id: "good-together", name: "Good Together", description: "Win alongside the same doubles partner. Each partnership is tracked separately; your strongest partnership supplies progress.", unit: "partner wins", targets: [5,15,30] },
  { id: "making-it-happen", name: "Making It Happen", description: "Create and host completed sessions with at least four participating players and four recorded games. Older sessions without a recorded creator cannot count.", unit: "hosted sessions", targets: [1,10,30] },
];
const weekOf = (date: string) => Math.floor((Date.parse(date) - Date.UTC(1970,0,5)) / 604800000);

/** Replay corrected results against frozen eligibility; no login is needed to earn. */
export function buildClubAchievements(userId: string, currentMemberIds: string[], sessions: AchievementSession[], now = new Date()): ClubAchievement[] {
  const achievements: ClubAchievement[] = definitions.map(d => ({id:d.id,name:d.name,description:d.description,unit:d.unit,progress:0,progressLabel:"",optional:!!d.optional,earnedTier:0,tiers:d.targets.map((target,i)=>({tier:i+1,target,earnedAt:null,sessionCode:null,sessionName:null}))}));
  const byId = new Map(achievements.map(a=>[a.id,a]));
  const set = (id: AchievementId, progress: number, session: AchievementSession) => {
    const item = byId.get(id)!;
    item.progress = progress;
    for (const tier of item.tiers) if (!tier.earnedAt && progress >= tier.target) {
      tier.earnedAt = session.date; tier.sessionCode = session.code; tier.sessionName = session.name;
      item.earnedTier = Math.max(item.earnedTier,tier.tier);
    }
  };
  let played=0,wins=0,close=0,perfect=0,comebacks=0,hosted=0,rated=0,ratingGain=0,ratingPeak=0,weekStreak=0,lastWeek: number|null=null;
  const partners = new Set<string>(), eligiblePlayed = new Set<string>(), partnerWins = new Map<string,number>();
  const ordered=[...sessions].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  for (const session of ordered) {
    const guests=new Set(session.guests);
    const matches=[...session.matches].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const participants=new Set(matches.flatMap(m=>[...m.team1,...m.team2]));
    for(const id of participants) if(!guests.has(id)) eligiblePlayed.add(id);
    if(session.hostId===userId && participants.size>=4 && matches.length>=4) set("making-it-happen",++hosted,session);
    const mine=matches.filter(m=>m.team1.includes(userId)||m.team2.includes(userId));
    if(!mine.length || guests.has(userId)) continue;
    played++; let sessionWins=0,lossRun=0;
    for(const match of mine) {
      const side=match.team1.includes(userId)?1:2, team=side===1?match.team1:match.team2;
      const partner=team.find(id=>id!==userId);
      if(partner && !guests.has(partner)) partners.add(partner);
      if(match.winner===side) {
        wins++; sessionWins++;
        if(Math.abs(match.score1-match.score2)>=1 && Math.abs(match.score1-match.score2)<=2) close++;
        if(lossRun>=2) comebacks++;
        lossRun=0;
        if(partner) partnerWins.set(partner,(partnerWins.get(partner)??0)+1);
      } else lossRun++;
      if(Object.hasOwn(match.ratingDelta,userId)) {
        rated++;
        if(rated>10) { ratingGain+=match.ratingDelta[userId]; ratingPeak=Math.max(ratingPeak,ratingGain); }
      }
    }
    if(mine.length>=4 && sessionWins===mine.length) perfect++;
    const week=weekOf(session.date);
    if(week!==lastWeek) { weekStreak=lastWeek!==null && week===lastWeek+1?weekStreak+1:1; lastWeek=week; }
    const eligible=session.eligibleIds.filter(id=>id!==userId && eligiblePlayed.has(id));
    const coverage=eligible.length?eligible.filter(id=>partners.has(id)).length/eligible.length*100:0;
    set("first-serve",1,session);set("familiar-face",played,session);set("mix-it-up",coverage,session);
    set("rhythm",weekStreak,session);set("on-the-board",wins,session);set("down-to-wire",close,session);
    set("clean-sweep",perfect,session);set("back-in-business",comebacks,session);set("raising-bar",ratingPeak,session);
    set("good-together",Math.max(0,...partnerWins.values()),session);
  }
  const currentEligible=[...new Set(currentMemberIds)].filter(id=>id!==userId && eligiblePlayed.has(id));
  const paired=currentEligible.filter(id=>partners.has(id)).length;
  const mix=byId.get("mix-it-up")!;
  mix.progress=currentEligible.length?paired/currentEligible.length*100:0;
  mix.progressLabel=currentEligible.length?`${paired} of ${currentEligible.length} clubmates · ${Math.round(mix.progress)}%`:"No eligible clubmates yet";
  if(lastWeek===null || weekOf(now.toISOString())-lastWeek>1) byId.get("rhythm")!.progress=0;
  for(const item of achievements) if(!item.progressLabel) item.progressLabel=item.id==="raising-bar" && rated<10?`${rated} of 10 rated games to establish your baseline`:`${item.progress} ${item.progress === 1 ? item.unit.replace(/s$/, "") : item.unit}`;
  return achievements;
}
