import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PlayerInvitation, Prisma } from "@prisma/client";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getOwnedClubPlayer, linkUnownedPlayer } from "@/lib/playerIdentity";
import { ClubAdmissionError } from "@/lib/clubAdmissions";

type Db = Prisma.TransactionClient;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CONTINUATION_TTL_MS = 30 * 60 * 1000;
export class PlayerInvitationError extends ClubAdmissionError {
  constructor(message: string, readonly code: string, status = 409) { super(message, status); }
}
export const newInvitationSecret = () => randomBytes(32).toString("base64url");
export const hashInvitationSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
export const continuationCookieName = (id: string) => `player-invite-${id}`;
export const invitationPath = (id: string) => `/player-invites/${encodeURIComponent(id)}`;
export function buildPlayerInvitationUrl(origin: string, id: string, secret: string) {
  return `${origin}${invitationPath(id)}#${secret}`;
}
function unavailable(): never {
  throw new PlayerInvitationError("This invitation is no longer available. Ask a club admin for a new invitation.", "INVITATION_UNAVAILABLE", 410);
}
function matchesHash(secret: string, expected: string) {
  return timingSafeEqual(Buffer.from(hashInvitationSecret(secret), "hex"), Buffer.from(expected, "hex"));
}
export function invitationSummary(invite: PlayerInvitation) {
  return { id: invite.id, status: invite.status, createdAt: invite.createdAt, expiresAt: invite.expiresAt };
}
async function eligibleTarget(db: Db, clubId: string, playerId: string, memberId?: string) {
  const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } }, include: { player: true, club: true } });
  if (!member || (memberId && member.id !== memberId) || member.archivedAt || !member.player.isActive || member.player.ownerUserId || member.club.isTutorial) unavailable();
  return member;
}
async function authorizedAdmin(db: Db, clubId: string, userId: string) {
  const [account, access] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
    getClubAdminAccess(db, { clubId, userId }),
  ]);
  // Invitations require club ADMIN/OWNER authority, not a roster role or STAFF.
  if (!account?.isActive || !access?.canAdmin) throw new PlayerInvitationError("Active club ADMIN or OWNER access required.", "ADMIN_REQUIRED", 403);
}
export async function managePlayerInvitation(db: Db, input: {
  clubId: string; playerId: string; userId: string; action: "CREATE" | "REPLACE" | "REVOKE"; invitationId?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  await authorizedAdmin(db, input.clubId, input.userId);
  await db.playerInvitation.updateMany({ where: { clubId: input.clubId, playerId: input.playerId, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const active = await db.playerInvitation.findFirst({ where: { clubId: input.clubId, playerId: input.playerId, status: "ACTIVE" } });
  if (input.action !== "CREATE") {
    if (!active || active.id !== input.invitationId) throw new PlayerInvitationError("The invitation changed. Refresh before replacing or revoking it.", "INVITATION_CHANGED");
    const revoked = await db.playerInvitation.updateMany({ where: { id: active.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedByUserId: input.userId, revokedAt: now, revocationReason: input.action === "REPLACE" ? "REPLACED" : "ADMIN_REVOKED" } });
    if (revoked.count !== 1) throw new PlayerInvitationError("The invitation changed. Refresh before trying again.", "INVITATION_CHANGED");
    if (input.action === "REVOKE") return { invitation: null };
  }
  await eligibleTarget(db, input.clubId, input.playerId);
  if (input.action === "CREATE" && active) return { invitation: invitationSummary(active) };
  const member = await eligibleTarget(db, input.clubId, input.playerId);
  const secret = newInvitationSecret();
  const invitation = await db.playerInvitation.create({ data: { clubId: input.clubId, playerId: input.playerId, clubMemberId: member.id, createdByUserId: input.userId, tokenHash: hashInvitationSecret(secret), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } });
  return { invitation: invitationSummary(invitation), secret };
}
export async function activePlayerInvitation(db: Db, clubId: string, playerId: string, userId: string, now = new Date()) {
  await authorizedAdmin(db, clubId, userId);
  await eligibleTarget(db, clubId, playerId);
  const active = await db.playerInvitation.findFirst({ where: { clubId, playerId, status: "ACTIVE", expiresAt: { gt: now } } });
  return { invitation: active ? invitationSummary(active) : null };
}
async function validInvitation(db: Db, id: string, now: Date) {
  const invite = await db.playerInvitation.findUnique({ where: { id } });
  if (!invite || invite.status !== "ACTIVE" || invite.expiresAt <= now) unavailable();
  await eligibleTarget(db, invite.clubId, invite.playerId, invite.clubMemberId);
  return invite;
}
export async function exchangeInvitationSecret(db: Db, id: string, secret: string, now = new Date()) {
  const invite = await validInvitation(db, id, now);
  if (!matchesHash(secret, invite.tokenHash)) unavailable();
  const handle = newInvitationSecret();
  const expiresAt = new Date(Math.min(now.getTime() + CONTINUATION_TTL_MS, invite.expiresAt.getTime()));
  await db.playerInvitationContinuation.deleteMany({ where: { invitationId: id, expiresAt: { lte: now } } });
  await db.playerInvitationContinuation.create({ data: { invitationId: id, handleHash: hashInvitationSecret(handle), expiresAt } });
  return { handle, expiresAt };
}
async function continuationInvitation(db: Db, id: string, handle: string | undefined, now: Date) {
  if (!handle || !/^[A-Za-z0-9_-]{43}$/.test(handle)) throw new PlayerInvitationError("Reopen the original invitation link to continue.", "CONTINUATION_REQUIRED", 401);
  const continuation = await db.playerInvitationContinuation.findUnique({ where: { handleHash: hashInvitationSecret(handle) } });
  if (!continuation || continuation.invitationId !== id || continuation.expiresAt <= now) throw new PlayerInvitationError("Your invitation session expired. Reopen the original invitation link.", "CONTINUATION_REQUIRED", 401);
  const invite = await db.playerInvitation.findUnique({ where: { id } });
  if (!invite) unavailable();
  return invite;
}
export async function invitationContext(db: Db, id: string, handle: string | undefined, now = new Date()) {
  const invite = await continuationInvitation(db, id, handle, now);
  await validInvitation(db, id, now);
  const member = await eligibleTarget(db, invite.clubId, invite.playerId, invite.clubMemberId);
  const where = { status: "COMPLETED", OR: [{ team1Player1Id: invite.playerId }, { team1Player2Id: invite.playerId }, { team2Player1Id: invite.playerId }, { team2Player2Id: invite.playerId }], session: { isTest: false, OR: [{ clubId: invite.clubId }, { sessionClubs: { some: { clubId: invite.clubId, status: "ACCEPTED" } } }] } };
  const [matchesPlayed, last] = await Promise.all([db.match.count({ where }), db.match.findFirst({ where, orderBy: { completedAt: "desc" }, select: { completedAt: true } })]);
  // Never serialize Account relations, emails, roster roles or token material.
  return { player: { id: member.playerId, name: member.player.name, avatarKey: member.player.avatarKey, rating: member.elo, matchesPlayed, lastPlayedAt: last?.completedAt ?? null }, club: { id: member.clubId, name: member.club.name }, expiresAt: invite.expiresAt };
}
export async function redeemPlayerInvitation(db: Db, id: string, handle: string | undefined, userId: string, now = new Date()) {
  const account = await db.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!account?.isActive) throw new PlayerInvitationError("An active account is required.", "ACCOUNT_REQUIRED", 403);
  const invite = await db.playerInvitation.findUnique({ where: { id } });
  if (!invite) unavailable();
  const result = { playerId: invite.playerId, clubId: invite.clubId, destination: `/club/${encodeURIComponent(invite.clubId)}?tab=profile` };
  // Return the receipt only. Never repeat grants after access has subsequently changed.
  if (invite.status === "REDEEMED" && invite.redeemedByUserId === userId) return result;
  await continuationInvitation(db, id, handle, now);
  await validInvitation(db, id, now);
  if (invite.createdByUserId === userId) throw new PlayerInvitationError("Another club admin must invite you to claim this profile.", "SELF_APPROVAL", 403);
  const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: invite.clubId, userId } } });
  if (access && access.status !== "ACTIVE") throw new PlayerInvitationError("Your club access was revoked. A club admin must review and restore access before you can claim this profile.", "ACCESS_REVIEW_REQUIRED");
  const existingOwned = await getOwnedClubPlayer(db, { clubId: invite.clubId, userId });
  if (existingOwned && existingOwned.playerId !== invite.playerId) throw new PlayerInvitationError("You already own another Player in this club. Ask an admin to review your profiles.", "IDENTITY_CONFLICT");
  const memberships = await db.clubMember.findMany({ where: { playerId: invite.playerId }, select: { clubId: true } });
  const conflict = await db.clubMember.findFirst({ where: { clubId: { in: memberships.map(m => m.clubId) }, playerId: { not: invite.playerId }, player: { ownerUserId: userId } } });
  if (conflict) throw new PlayerInvitationError("You already own another Player in one of this profile's clubs. Ask an admin to review your profiles.", "IDENTITY_CONFLICT");
  const consumed = await db.playerInvitation.updateMany({ where: { id, status: "ACTIVE", expiresAt: { gt: now } }, data: { status: "REDEEMED", redeemedByUserId: userId, redeemedAt: now } });
  if (consumed.count !== 1) unavailable();
  await linkUnownedPlayer(db, invite.playerId, userId);
  if (!access) await db.clubAccess.create({ data: { clubId: invite.clubId, userId, status: "ACTIVE", role: "MEMBER" } });
  return result;
}
