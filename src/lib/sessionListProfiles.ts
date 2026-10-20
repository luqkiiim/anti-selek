import type { PrismaClient } from "@prisma/client";
import { IdentityConflictError } from "./playerIdentity";

type Seat = { playerId: string; profileClubId?: string | null; representingClubId?: string | null; isGuest: boolean; gender?: string; partnerPreference?: string; mixedSideOverride?: string | null; player: { elo: number } };
type ListedSession = { id: string; clubId: string | null; ratingPolicyVersion?: number; sessionClubs: { clubId: string; status: string }[]; players: Seat[] };

/** Resolve display ownership and ratings once for the whole session list. */
export async function getSessionListProfiles(db: PrismaClient, sessions: ListedSession[]) {
  const clubsFor = (session: ListedSession) => [...new Set([...(session.clubId ? [session.clubId] : []), ...session.sessionClubs.filter(link => link.status === "ACCEPTED").map(link => link.clubId)])];
  const seats = sessions.flatMap(session => session.players.filter(seat => !seat.isGuest));
  const result = new Map<string, Map<string, { owned: boolean; elo?: number }>>();
  if (!seats.length) return result;
  const clubIds = [...new Set(sessions.flatMap(session => [...clubsFor(session), ...session.players.flatMap(seat => [seat.profileClubId, seat.representingClubId].filter((id): id is string => !!id))]))];
  const unscoped = sessions.some(session => !clubsFor(session).length && session.players.some(seat => !seat.isGuest && !seat.profileClubId && !seat.representingClubId));
  const members = await db.clubMember.findMany({
    where: { playerId: { in: [...new Set(seats.map(seat => seat.playerId))] }, ...(!unscoped ? { clubId: { in: clubIds } } : {}) },
    select: { playerId: true, clubId: true, ownerUserId: true, elo: true, archivedAt: true, retiredByAdmissionEventId: true, player: { select: { isActive: true } } },
  });
  const ownerIds = [...new Set(members.flatMap(member => member.ownerUserId ? [member.ownerUserId] : []))];
  const access = ownerIds.length ? await db.clubAccess.findMany({ where: { userId: { in: ownerIds }, clubId: { in: [...new Set(members.map(member => member.clubId))] }, status: "ACTIVE" }, select: { userId: true, clubId: true } }) : [];
  const key = (clubId: string, playerId: string) => JSON.stringify([clubId, playerId]);
  const grants = new Set(access.map(grant => key(grant.clubId, grant.userId)));
  const byPlayer = new Map<string, typeof members>();
  for (const member of members) {
    const rows = byPlayer.get(member.playerId) ?? [];
    rows.push(member); byPlayer.set(member.playerId, rows);
  }
  for (const session of sessions) {
    const clubIds = clubsFor(session);
    const profiles = new Map<string, { owned: boolean; elo?: number }>();
    for (const seat of session.players) {
      if (seat.isGuest) { profiles.set(seat.playerId, { owned: false }); continue; }
      const rows = byPlayer.get(seat.playerId) ?? [];
      const context = seat.profileClubId ?? seat.representingClubId ?? (clubIds.length === 1 ? clubIds[0] : null);
      const candidates = rows.filter(row => !row.archivedAt && !row.retiredByAdmissionEventId && row.player.isActive && (context ? row.clubId === context : !clubIds.length || clubIds.includes(row.clubId)));
      const member = candidates.length === 1 ? candidates[0] : null;
      const owned = !!member?.ownerUserId && (!context || !clubIds.length || clubIds.includes(context)) && grants.has(key(member.clubId, member.ownerUserId));
      let elo: number | undefined;
      if (session.ratingPolicyVersion === 2) {
        if (!seat.profileClubId) throw new IdentityConflictError("This tournament has a player without a selected club profile. Refresh or ask an administrator to review it.");
        const rating = rows.find(row => row.clubId === seat.profileClubId);
        if (!rating) throw new IdentityConflictError("The selected club rating is unavailable; no other club rating can be substituted.");
        elo = rating.elo;
      }
      profiles.set(seat.playerId, { owned, elo });
    }
    result.set(session.id, profiles);
  }
  return result;
}

export function withSessionListProfiles<T extends Seat>(players: T[], profiles: Map<string, { owned: boolean; elo?: number }> | undefined): T[] {
  return players.map(seat => ({ ...seat, player: {
    ...seat.player, elo: profiles?.get(seat.playerId)?.elo ?? seat.player.elo,
    ...(seat.gender !== undefined ? { gender: seat.gender } : {}),
    ...(seat.partnerPreference !== undefined ? { partnerPreference: seat.partnerPreference } : {}),
    ...(seat.mixedSideOverride !== undefined ? { mixedSideOverride: seat.mixedSideOverride } : {}),
    isClaimed: profiles?.get(seat.playerId)?.owned ?? false, email: null,
  } }));
}
