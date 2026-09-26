import type { MemberProfileMatchSource, MemberProfileMatchEloAdjustmentSource, MemberProfileRatingAdjustmentSource } from "./memberProfile";

/** Infer only a continuous legacy prefix from the first saved before-rating. Never persist it. */
export function reconstructLegacyRatings(userId: string, clubId: string | undefined,
  matches: MemberProfileMatchSource[], recorded: MemberProfileMatchEloAdjustmentSource[],
  manual: MemberProfileRatingAdjustmentSource[]) {
  if (!clubId) return [];
  const ordered = [...matches].sort((a,b) => time(a.completedAt) - time(b.completedAt));
  const ledger = new Map(recorded.filter(a => a.userId === userId).map(a => [a.matchId,a]));
  const anchorIndex = ordered.findIndex(m => ledger.has(m.id));
  if (anchorIndex <= 0) return [];
  const anchorMatch = ordered[anchorIndex];
  const anchor = ledger.get(anchorMatch.id)!;
  // A later correction is not an anchor for the original match's earlier date.
  if (!time(anchorMatch.completedAt) || Math.abs(time(anchor.createdAt)-time(anchorMatch.completedAt)) > 300_000) return [];
  let rating = anchor.beforeElo;
  const events = [
    ...ordered.slice(0,anchorIndex).map(match => ({date:time(match.completedAt),match, adjustment:null})),
    ...manual.filter(a => time(a.createdAt)<time(anchorMatch.completedAt)).map(adjustment => ({date:time(adjustment.createdAt),match:null,adjustment})),
  ].sort((a,b)=>b.date-a.date);
  const inferred: MemberProfileMatchEloAdjustmentSource[]=[];
  for (let i=0;i<events.length;i++) {
    const event=events[i];
    if (!event.date || events[i+1]?.date===event.date) break;
    if (event.adjustment) {
      if (event.adjustment.afterElo!==rating) break;
      rating=event.adjustment.beforeElo;
      continue;
    }
    const match=event.match!;
    if (match.session.clubId!==clubId || match.session.status!=="COMPLETED" ||
      !match.session.players?.some(p=>p.userId===userId&&!p.isGuest)) break;
    const delta=[match.team1User1Id,match.team1User2Id].includes(userId)?match.team1EloChange:match.team2EloChange;
    if (delta===null || !Number.isFinite(delta)) break;
    inferred.push({id:`reconstructed:${match.id}:${userId}`,userId,clubId,matchId:match.id,
      beforeElo:rating-delta,afterElo:rating,delta,createdAt:match.completedAt,reconstructed:true});
    rating-=delta;
  }
  return inferred;
}

function time(value: Date|string|null) { return value ? new Date(value).getTime() : 0; }
