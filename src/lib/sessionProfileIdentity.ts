import type { Prisma, PrismaClient } from "@prisma/client";
import { admissionTransaction } from "@/lib/clubAdmissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { COMMUNITY_OPERATOR_ROLES } from "@/lib/clubRoles";
import { getAcceptedSessionClubIds, getSessionAdminMembership, getSessionOperatorMembership } from "@/lib/sessionCollab";

type Db = Prisma.TransactionClient | PrismaClient;
export interface SessionProfilePair {
  playerId: string; profileClubId: string; clubName: string; playerName: string;
  ownerUserId: string | null; elo: number; preferredPool: string;
}
export async function getEligibleSessionProfiles(db: Db, { userId, clubIds }: { userId: string; clubIds: string[] }): Promise<SessionProfilePair[]> {
  const access = await db.clubAccess.findMany({ where: { userId, status: "ACTIVE", ...(clubIds.length ? { clubId: { in: clubIds } } : {}) }, select: { clubId: true } });
  const rows = await db.clubMember.findMany({ where: { ownerUserId: userId, clubId: { in: access.map(a => a.clubId) }, archivedAt: null, retiredByAdmissionEventId: null, player: { isActive: true } }, include: { player: { select: { name: true } }, club: { select: { name: true } } }, orderBy: [{ clubId: "asc" }, { playerId: "asc" }] });
  return rows.map(m => ({ playerId: m.playerId, profileClubId: m.clubId, clubName: m.club.name, playerName: m.player.name, ownerUserId: m.ownerUserId, elo: m.elo, preferredPool: m.preferredPool }));
}
export async function resolveSessionProfilePair(db: Db, args: { userId: string; clubIds: string[]; playerId?: string | null; profileClubId?: string | null; isGlobalAdmin?: boolean }): Promise<SessionProfilePair> {
  let pairs = await getEligibleSessionProfiles(db, args);
  if (args.playerId) pairs = pairs.filter(p => p.playerId === args.playerId);
  if (args.profileClubId) pairs = pairs.filter(p => p.profileClubId === args.profileClubId);
  if (pairs.length === 1) return pairs[0];
  if (pairs.length > 1) throw new IdentityConflictError("Choose which club profile will participate in this tournament.");
  if (!args.playerId) throw new IdentityConflictError("Choose an eligible club profile before joining this tournament.");
  // Operators may add only a profile in a club they actually operate.
  const access = args.isGlobalAdmin ? null : await db.clubAccess.findMany({ where: { userId: args.userId, status: "ACTIVE", role: { in: [...COMMUNITY_OPERATOR_ROLES] }, ...(args.clubIds.length ? { clubId: { in: args.clubIds } } : {}) }, select: { clubId: true } });
  const manageable = args.isGlobalAdmin ? (args.clubIds.length ? args.clubIds : null) : (access ?? []).map(a => a.clubId);
  const members = await db.clubMember.findMany({ where: { playerId: args.playerId, archivedAt: null, retiredByAdmissionEventId: null, player: { isActive: true }, ...(args.profileClubId ? { clubId: args.profileClubId } : manageable ? { clubId: { in: manageable } } : {}) }, include: { player: { select: { name: true } }, club: { select: { name: true } } } });
  const candidates = members.filter(m => !manageable || manageable.includes(m.clubId));
  if (candidates.length !== 1) throw new IdentityConflictError(candidates.length ? "Choose which club profile will participate in this tournament." : "You need active ownership or staff access to this exact club profile.");
  const m = candidates[0];
  if (m.ownerUserId) {
    const grant = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: m.clubId, userId: m.ownerUserId } }, select: { status: true } });
    if (grant?.status !== "ACTIVE") throw new IdentityConflictError("The selected profile owner needs active access to that club before joining.");
  }
  return { playerId: m.playerId, profileClubId: m.clubId, clubName: m.club.name, playerName: m.player.name, ownerUserId: m.ownerUserId, elo: m.elo, preferredPool: m.preferredPool };
}
/** Revalidate under the shared writer reservation, including claims since preflight. */
export async function assertSessionAccountSeatAvailable(db: Db, sessionId: string, pair: { playerId: string; ownerUserId: string | null }, excludePlayerId?: string) {
  if (!pair.ownerUserId) return;
  const seats = await db.sessionPlayer.findMany({ where: { sessionId, ...(excludePlayerId ? { playerId: { not: excludePlayerId } } : {}) }, select: { playerId: true, participantAccountId: true, profileClubId: true, representingClubId: true, isGuest: true } });
  for (const seat of seats) {
    if (seat.playerId === pair.playerId) continue;
    if (seat.participantAccountId === pair.ownerUserId) throw new IdentityConflictError("This account already has a player in this tournament.");
    if (seat.isGuest) continue;
    const owners = await getSessionParticipantOwners(db, { id: sessionId }, [seat.playerId]);
    if (owners.get(seat.playerId) === pair.ownerUserId) throw new IdentityConflictError("This account already has a player in this tournament.");
  }
}
/** Current local ownership and access authorize; the account snapshot never grants access. */
export async function getSessionParticipantOwners(db: Db, session: { id: string; clubId?: string | null }, playerIds?: string[]) {
  const clubIds = await getAcceptedSessionClubIds(db, session);
  const seats = await db.sessionPlayer.findMany({ where: { sessionId: session.id, ...(playerIds ? { playerId: { in: playerIds } } : {}) }, select: { playerId: true, profileClubId: true, representingClubId: true, isGuest: true } });
  const result = new Map<string, string | null>();
  for (const seat of seats) {
    if (seat.isGuest) { result.set(seat.playerId, null); continue; }
    const context = seat.profileClubId ?? seat.representingClubId ?? (clubIds.length === 1 ? clubIds[0] : null);
    const memberships = await db.clubMember.findMany({ where: { playerId: seat.playerId, retiredByAdmissionEventId: null, archivedAt: null, player: { isActive: true }, ...(context ? { clubId: context } : clubIds.length ? { clubId: { in: clubIds } } : {}) }, select: { clubId: true, ownerUserId: true } });
    // Missing/ambiguous legacy context must never authorize an arbitrary profile.
    if (memberships.length !== 1 || !memberships[0].ownerUserId || (context && clubIds.length && !clubIds.includes(context))) { result.set(seat.playerId, null); continue; }
    const member = memberships[0];
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: member.clubId, userId: member.ownerUserId! } }, select: { status: true } });
    result.set(seat.playerId, access?.status === "ACTIVE" ? member.ownerUserId : null);
  }
  return result;
}
export async function getSelectedSessionSelf(db: Db, session: { id: string; clubId?: string | null }, userId: string) {
  const owners = await getSessionParticipantOwners(db, session);
  const ids = [...owners].filter(([, owner]) => owner === userId).map(([id]) => id);
  return ids.length === 1 ? { playerId: ids[0] } : null;
}
export async function withSessionProfileRatings<T extends { playerId: string; profileClubId?: string | null; isGuest?: boolean; player: { elo: number } }>(db: Db, session: { id?: string; clubId?: string | null; ratingPolicyVersion?: number }, players: T[]): Promise<T[]> {
  const owners = players.length && session.id ? await getSessionParticipantOwners(db, { id: session.id, clubId: session.clubId }) : null;
  return Promise.all(players.map(async seat => {
    let elo = seat.player.elo;
    if (session.ratingPolicyVersion === 2 && !seat.isGuest) {
      if (!seat.profileClubId) throw new IdentityConflictError("This tournament has a player without a selected club profile. Refresh or ask an administrator to review it.");
      const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId: seat.profileClubId, playerId: seat.playerId } }, select: { elo: true } });
      if (!member) throw new IdentityConflictError("The selected club rating is unavailable; no other club rating can be substituted.");
      elo = member.elo;
    }
    return { ...seat, player: { ...seat.player, elo, ...(owners ? { isClaimed: !!owners.get(seat.playerId), email: null } : {}) } };
  }));
}

/** Mutation guard for reopening/backfilling unfinished legacy rosters. */
export async function assertSessionProfileContextsUnambiguous(db: Db, session: { id: string; clubId?: string | null; ratingPolicyVersion?: number }, playerIds?: string[], options: { historical?: boolean } = {}) {
  const clubIds = await getAcceptedSessionClubIds(db, session);
  const seats = await db.sessionPlayer.findMany({ where: { sessionId: session.id, ...(playerIds ? { playerId: { in: playerIds } } : {}) }, select: { playerId: true, profileClubId: true, representingClubId: true, participantAccountId: true, isGuest: true } });
  const accounts = new Set<string>();
  for (const seat of seats) {
    if (seat.isGuest) continue;
    const clubId = seat.profileClubId ?? seat.representingClubId ?? (clubIds.length === 1 ? clubIds[0] : null);
    if (session.ratingPolicyVersion === 2 && !seat.profileClubId) throw new IdentityConflictError("A selected club profile is missing. This tournament needs administrator review before it can be reopened.");
    const members = await db.clubMember.findMany({ where: { playerId: seat.playerId, retiredByAdmissionEventId: null, ...(!options.historical ? { archivedAt: null } : {}), ...(clubId ? { clubId } : clubIds.length ? { clubId: { in: clubIds } } : {}) }, select: { ownerUserId: true } });
    if (members.length > 1 || (session.ratingPolicyVersion === 2 && members.length === 0)) throw new IdentityConflictError("This tournament has ambiguous club profile context. Choose one exact club profile before reopening or adding players.");
    const seatAccounts = new Set((options.historical ? [seat.participantAccountId ?? members[0]?.ownerUserId] : [seat.participantAccountId, members[0]?.ownerUserId]).filter((id): id is string => !!id));
    for (const accountId of seatAccounts) {
      if (accounts.has(accountId)) throw new IdentityConflictError("This account appears more than once in this tournament. Administrator review is required before reopening it.");
      accounts.add(accountId);
    }
  }
}

/** Call after acquiring the shared SQLite writer, immediately before mutation. */
export async function assertSessionMutationActor(db: Db, args: { session: { id: string; clubId?: string | null }; userId: string; isGlobalAdmin?: boolean; playerId?: string; adminOnly?: boolean; hostOnly?: boolean; allowContextlessParticipant?: boolean }) {
  if (args.isGlobalAdmin) return;
  const session = args.hostOnly ? { id: args.session.id, clubId: args.session.clubId } : args.session;
  const role = args.hostOnly && session.clubId
    ? await db.clubAccess.findFirst({ where: { clubId: session.clubId, userId: args.userId, status: "ACTIVE", role: { in: args.adminOnly ? ["OWNER", "ADMIN"] : [...COMMUNITY_OPERATOR_ROLES] } }, select: { clubId: true } })
    : args.adminOnly ? await getSessionAdminMembership(db, { session, userId: args.userId, acceptedOnly: true }) : await getSessionOperatorMembership(db, { session, userId: args.userId, acceptedOnly: true });
  if (role) return;
  if (args.playerId && !args.adminOnly && !args.hostOnly) {
    const owners = await getSessionParticipantOwners(db, session, [args.playerId]);
    if (owners.get(args.playerId) === args.userId) return;
  }
  if (args.allowContextlessParticipant && (await getAcceptedSessionClubIds(db, session)).length === 0) {
    const owners = await getSessionParticipantOwners(db, session);
    if ([...owners.values()].filter(owner => owner === args.userId).length === 1) return;
  }
  throw new IdentityConflictError("Your ownership or club access changed. Refresh before making this change.");
}

export interface SessionMutationActor { userId: string; isGlobalAdmin?: boolean }
/** Match/queue writers validate a fresh roster and actor after reserving SQLite. */
export async function sessionMatchMutationTransaction<T>(db: PrismaClient, sessionId: string, actor: SessionMutationActor | undefined, op: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return admissionTransaction(db, async tx => {
    const session = await tx.session.findUnique({ where: { id: sessionId }, select: { id: true, clubId: true, status: true, ratingPolicyVersion: true } });
    if (!session || session.status !== "ACTIVE") throw new IdentityConflictError("This tournament is no longer active. Refresh before creating or changing a match.");
    if (actor) await assertSessionMutationActor(tx, { session, ...actor });
    await assertSessionProfileContextsUnambiguous(tx, session);
    return op(tx);
  });
}
