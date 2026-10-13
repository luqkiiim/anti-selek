import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AccountProfileSyncError, syncAccountProfile } from "./accountProfileSync";

type Db = Prisma.TransactionClient;
export class ClubPlayerOwnershipError extends Error {
  constructor(message: string, readonly statusCode = 409, readonly code = "LOCAL_OWNERSHIP_CONFLICT") {
    super(message); this.name = "ClubPlayerOwnershipError";
  }
}
function retryable(error: unknown) {
  const e = error as { code?: string; message?: string };
  return e.code === "P2034" || /SQLITE_BUSY|database is locked|deadlock|write conflict/i.test(e.message ?? "");
}
/** Reserve the writer before ownership, access or session participation reads. */
export async function clubOwnershipTransaction<T>(db: PrismaClient, operation: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$executeRaw`UPDATE "CommunityMember" SET "ownershipRevision"="ownershipRevision" WHERE 0`;
        return operation(tx);
      });
    } catch (error) {
      if (retryable(error) && attempt < 3) { await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt)); continue; }
      const message = (error as Error).message ?? "";
      if (/LOCAL_SESSION_PARTICIPATION_CONFLICT|SESSION_PROFILE_INVALID|SESSION_PROFILE_IMMUTABLE/.test(message))
        throw new ClubPlayerOwnershipError("This profile has ambiguous or duplicate participation in an unfinished session. Leave or finish that session first.", 409, "SESSION_PARTICIPATION_CONFLICT");
      if (/LOCAL_CLAIM_INVALID|LOCAL_RELEASE_INVALID|LOCAL_OWNERSHIP_SNAPSHOT_INVALID|LOCAL_OWNERSHIP_EVENT_REQUIRED|LOCAL_PENDING_WORK_OPEN|SHARED_PLAYER_OWNERSHIP_CONFLICT|CommunityMember_nonretired_owner_key|SessionPlayer_sessionId_participantAccountId_key/.test(message))
        throw new ClubPlayerOwnershipError("This club profile or its access changed. Refresh before trying again.");
      throw error;
    }
  }
}

async function membership(db: Db, clubId: string, playerId: string) {
  const member = await db.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } }, include: { player: true, club: true } });
  if (!member || member.retiredByAdmissionEventId) throw new ClubPlayerOwnershipError("Club profile not found.", 404);
  return member;
}
async function activeAccount(db: Db, userId: string) {
  const account = await db.user.findUnique({ where: { id: userId } });
  if (!account?.isActive) throw new ClubPlayerOwnershipError("An active account is required.", 403, "ACCOUNT_REQUIRED");
  return account;
}
async function localAdmin(db: Db, clubId: string, userId: string) {
  await activeAccount(db, userId);
  const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId } } });
  if (access?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(access.role))
    throw new ClubPlayerOwnershipError("Active club admin access required.", 403, "ADMIN_REQUIRED");
}
async function rawSnapshot(db: Db, memberId: string) {
  const rows = await db.$queryRaw<Array<{ metadata: string; archivedAtJson: string }>>`
    SELECT json_object('name',p."name",'avatarKey',p."avatarKey") AS metadata,json_quote(m."archivedAt") AS archivedAtJson
    FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" WHERE m."id"=${memberId}`;
  // Prisma maps a raw DATETIME column to Date, which would normalize preserved
  // legacy SQLite integers/text. JSON quoting retains its exact storage value.
  return { metadata: rows[0].metadata, archivedAt: JSON.parse(rows[0].archivedAtJson) as string | number | null };
}
export async function assertLocalClaimAvailable(db: Db, input: { clubId: string; playerId: string; userId: string }) {
  const own = await db.clubMember.findFirst({ where: { clubId: input.clubId, ownerUserId: input.userId, retiredByAdmissionEventId: null, playerId: { not: input.playerId } }, select: { id: true } });
  if (own) throw new ClubPlayerOwnershipError("You already own another profile in this club.", 409, "IDENTITY_CONFLICT");
  const shared = await db.clubMember.findFirst({ where: { playerId: input.playerId, retiredByAdmissionEventId: null, ownerUserId: { not: input.userId }, NOT: { ownerUserId: null } }, select: { id: true } });
  if (shared) throw new ClubPlayerOwnershipError("This legacy profile is still connected to another account in a club. Ask an admin to disconnect that local link first.", 409, "IDENTITY_CONFLICT");
}
type Access = NonNullable<Awaited<ReturnType<Db["clubAccess"]["findUnique"]>>>;
type AccessTransition = {
  id: string | null; previousRevision: number | null; newRevision: number | null;
  previousStatus: string | null; newStatus: string | null; previousRole: string | null; newRole: string | null;
};
function accessTransition(access: Access | null, userId: string | null, status: "ACTIVE" | "REVOKED", restore = false): AccessTransition {
  if (!userId) return { id: null, previousRevision: null, newRevision: null, previousStatus: null, newStatus: null, previousRole: null, newRole: null };
  const role = restore ? "MEMBER" : access?.role ?? "MEMBER";
  return {
    id: access?.id ?? randomUUID(), previousRevision: access?.revision ?? null,
    newRevision: access ? access.revision + (access.status !== status || access.role !== role ? 1 : 0) : 0,
    previousStatus: access?.status ?? null, newStatus: status, previousRole: access?.role ?? null, newRole: role,
  };
}
async function insertEvent(db: Db, data: {
  clubId: string; memberId: string; playerId: string; actorUserId: string; action: string; previousOwner: string | null; newOwner: string | null;
  ownershipRevision: number; access: AccessTransition; invitationId?: string | null; admissionRequestId?: string | null; releaseEventId?: string | null;
  metadataBefore: string; metadataAfter: string; details: Record<string, unknown>; reason: string; now?: Date;
}) {
  const id = randomUUID(); const now = (data.now ?? new Date()).getTime(); const details = JSON.stringify(data.details); const a = data.access;
  // INSERT is the ownership CAS: guards compare the exact previous revisions,
  // then apply the local transition atomically and preserve every sport field.
  await db.$executeRaw`INSERT INTO "ClubPlayerOwnershipEvent"(
   "id","clubId","clubMemberId","playerId","actorUserId","action","previousOwnerUserId","newOwnerUserId",
   "previousOwnershipRevision","newOwnershipRevision","accessId","previousAccessRevision","newAccessRevision",
   "previousAccessStatus","newAccessStatus","previousAccessRole","newAccessRole","invitationId","admissionRequestId","releaseEventId",
   "metadataBeforeJson","metadataAfterJson","detailsJson","reason","createdAt") VALUES (
   ${id},${data.clubId},${data.memberId},${data.playerId},${data.actorUserId},${data.action},${data.previousOwner},${data.newOwner},
   ${data.ownershipRevision},${data.ownershipRevision + 1},${a.id},${a.previousRevision},${a.newRevision},
   ${a.previousStatus},${a.newStatus},${a.previousRole},${a.newRole},${data.invitationId ?? null},${data.admissionRequestId ?? null},${data.releaseEventId ?? null},
   ${data.metadataBefore},${data.metadataAfter},${details},${data.reason},${now})`;
  const member = await db.clubMember.findUniqueOrThrow({ where: { id: data.memberId } });
  if (member.ownershipRevision !== data.ownershipRevision + 1 || member.ownerUserId !== data.newOwner)
    throw new ClubPlayerOwnershipError("This club profile changed. Refresh before trying again.");
  if (a.id) {
    const final = await db.clubAccess.findUniqueOrThrow({ where: { id: a.id } });
    if (final.revision !== a.newRevision || final.status !== a.newStatus || final.role !== a.newRole)
      throw new ClubPlayerOwnershipError("Club access changed. Refresh before trying again.");
  }
  return id;
}

export async function claimClubPlayer(db: Db, input: {
  clubId: string; playerId: string; userId: string; actorUserId: string; invitationId?: string | null;
  admissionRequestId?: string | null; releaseEventId?: string | null; expectedOwnershipRevision?: number; reason?: string; now?: Date;
}) {
  const member = await membership(db, input.clubId, input.playerId);
  const account = await activeAccount(db, input.userId);
  await activeAccount(db, input.actorUserId);
  if (!member.player.isActive || member.club.isTutorial) throw new ClubPlayerOwnershipError("This profile is unavailable.", 409);
  if (input.expectedOwnershipRevision !== undefined && member.ownershipRevision !== input.expectedOwnershipRevision)
    throw new ClubPlayerOwnershipError("This club profile changed. Refresh before trying again.");
  if (member.ownerUserId === input.userId) return { playerId: member.playerId, clubId: member.clubId, eventId: null, alreadyOwned: true };
  if (member.ownerUserId) throw new ClubPlayerOwnershipError("This club profile already belongs to another account.", 409, "IDENTITY_CONFLICT");
  await assertLocalClaimAvailable(db, input);
  const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.userId } } });
  if (access?.status === "REVOKED" && !input.releaseEventId)
    throw new ClubPlayerOwnershipError("Your club access was revoked. Ask an admin for a fresh invitation after a local disconnect.", 409, "ACCESS_REVIEW_REQUIRED");
  if (access?.status === "ACTIVE" && input.releaseEventId) throw new ClubPlayerOwnershipError("This release receipt is no longer current.");
  const snapshot = await rawSnapshot(db, member.id);
  // Resolve from fresh transaction reads only when this claim will complete.
  // Preserve the raw nonblank reference; trimming is solely a missing-photo test.
  const photoSource = account.avatarKey?.trim() ? "ACCOUNT" : member.player.avatarKey?.trim() ? "PLACEHOLDER" : "NONE";
  const avatarKey = photoSource === "PLACEHOLDER" ? member.player.avatarKey : account.avatarKey;
  if (photoSource === "PLACEHOLDER") {
    try {
      // The exact metadata snapshot above must precede fanout, which can include
      // this physical Player when another local club already belongs to the account.
      await syncAccountProfile(db, { userId: input.userId, changes: { avatarKey }, expectedAvatarKey: account.avatarKey });
    } catch (error) {
      if (error instanceof AccountProfileSyncError) throw new ClubPlayerOwnershipError(error.message, error.statusCode);
      throw error;
    }
  }
  const eventId = await insertEvent(db, {
    clubId: member.clubId, memberId: member.id, playerId: member.playerId, actorUserId: input.actorUserId, action: "CLAIM",
    previousOwner: null, newOwner: input.userId, ownershipRevision: member.ownershipRevision,
    access: accessTransition(access, input.userId, "ACTIVE", access?.status === "REVOKED"),
    invitationId: input.invitationId, admissionRequestId: input.admissionRequestId, releaseEventId: input.releaseEventId,
    metadataBefore: snapshot.metadata, metadataAfter: JSON.stringify({ name: account.name, avatarKey }),
    details: { previousArchivedAt: snapshot.archivedAt, newArchivedAt: null, photoSource, accountAvatarBefore: account.avatarKey, accountAvatarAfter: photoSource === "PLACEHOLDER" ? avatarKey : account.avatarKey },
    reason: input.reason ?? "Account claimed this club profile; sporting history retained.", now: input.now,
  });
  return { playerId: member.playerId, clubId: member.clubId, eventId, alreadyOwned: false };
}

/** Cancel only pending work that depends on this exact local link. */
async function cancelLocalPending(db: Db, input: { clubId: string; playerId: string; ownerUserId: string | null; actorUserId: string; now: Date }) {
  const pending = await db.clubAdmissionRequest.findMany({ where: {
    clubId: input.clubId, status: "PENDING", OR: [
      { requestedPlayerId: input.playerId }, { approvedPlayerId: input.playerId },
      ...(input.ownerUserId ? [{ requesterUserId: input.ownerUserId }] : []),
    ],
  } });
  for (const request of pending) {
    const revision = request.revision + 1;
    await db.clubAdmissionEvent.create({ data: { admissionRequestId: request.id, actorUserId: input.actorUserId, action: "LOCAL_OWNERSHIP_CANCEL", revision,
      detailsJson: JSON.stringify({ reason: "CLUB_PROFILE_REMOVED", playerId: input.playerId, before: { status: request.status, kind: request.kind, revision: request.revision, requestedPlayerId: request.requestedPlayerId, originInvitationId: request.originInvitationId } }) } });
    const updated = await db.clubAdmissionRequest.updateMany({ where: { id: request.id, status: "PENDING", revision: request.revision }, data: { status: "CANCELLED", decision: "CLUB_PROFILE_REMOVED", revision, reviewedByUserId: input.actorUserId, reviewedAt: input.now } });
    if (updated.count !== 1) throw new ClubPlayerOwnershipError("A pending request changed. Refresh before trying again.");
  }
  const claims = await db.claimRequest.findMany({ where: { clubId: input.clubId, status: "PENDING", OR: [{ targetPlayerId: input.playerId }, ...(input.ownerUserId ? [{ requesterUserId: input.ownerUserId }] : [])] } });
  await db.claimRequest.updateMany({ where: { id: { in: claims.map(r => r.id) }, status: "PENDING" }, data: { status: "REJECTED", reviewedById: input.actorUserId, reviewedAt: input.now } });
  const invitations = await db.playerInvitation.findMany({ where: { clubId: input.clubId, status: "ACTIVE", OR: [{ playerId: input.playerId }, { sourcePlayerId: input.playerId }, ...(input.ownerUserId ? [{ targetAccountUserId: input.ownerUserId }] : [])] } });
  await db.playerInvitation.updateMany({ where: { id: { in: invitations.map(r => r.id) }, status: "ACTIVE" }, data: { status: "REVOKED", revokedByUserId: input.actorUserId, revokedAt: input.now, revocationReason: "CLUB_PROFILE_REMOVED" } });
  const links = await db.offlineIdentityLinkRequest.findMany({ where: { status: "PENDING", OR: [{ sourceClubId: input.clubId, sourcePlayerId: input.playerId }, { targetClubId: input.clubId, targetPlayerId: input.playerId }] } });
  await db.offlineIdentityLinkRequest.updateMany({ where: { id: { in: links.map(r => r.id) }, status: "PENDING" }, data: { status: "REJECTED", reviewedById: input.actorUserId, reviewedAt: input.now } });
  return { admissions: pending.map(r => r.id), claims: claims.map(r => ({ id: r.id, status: r.status, requesterUserId: r.requesterUserId, targetPlayerId: r.targetPlayerId })), invitations: invitations.map(r => r.id), offlineLinks: links.map(r => ({ id: r.id, status: r.status, sourceClubId: r.sourceClubId, sourcePlayerId: r.sourcePlayerId, targetClubId: r.targetClubId, targetPlayerId: r.targetPlayerId })) };
}

export async function removeClubPlayerOwnership(db: Db, input: {
  clubId: string; playerId: string; actorUserId: string; mode?: "REMOVE" | "DISCONNECT" | "LEAVE";
  expectedOwnershipRevision?: number; reason?: string; now?: Date;
}) {
  const mode = input.mode ?? "REMOVE";
  const member = await membership(db, input.clubId, input.playerId);
  await activeAccount(db, input.actorUserId);
  if (mode === "LEAVE") {
    // Check before the no-op branch: a disconnected former owner cannot act on
    // a later account's profile. A receipt retry can return success safely.
    if (member.ownerUserId !== input.actorUserId) {
      const receipt = await db.clubPlayerOwnershipEvent.findFirst({ where: { clubMemberId: member.id, actorUserId: input.actorUserId, action: "LEAVE" }, orderBy: { newOwnershipRevision: "desc" } });
      if (receipt && !member.ownerUserId && member.archivedAt) return { disconnected: true as const, alreadyRemoved: true, eventId: receipt.id };
      throw new ClubPlayerOwnershipError("You can only leave your own club profile.", 403);
    }
  } else await localAdmin(db, input.clubId, input.actorUserId);
  // Repetition must be a receipt-only read. In particular, do not touch a
  // ClubAccess grant that somebody restored after the first removal.
  if (member.archivedAt && !member.ownerUserId) return { disconnected: true as const, alreadyRemoved: true, eventId: null };
  if (input.expectedOwnershipRevision !== undefined && member.ownershipRevision !== input.expectedOwnershipRevision)
    throw new ClubPlayerOwnershipError("This club profile changed. Refresh before trying again.");
  if (mode === "DISCONNECT" && !member.archivedAt) throw new ClubPlayerOwnershipError("Remove this profile from the club before disconnecting the account.");
  if (member.club.isTutorial || member.ownerUserId === member.club.createdById)
    throw new ClubPlayerOwnershipError("The club owner's profile cannot be removed.", 403);
  const access = member.ownerUserId ? await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: member.ownerUserId } } }) : null;
  if (access?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(access.role)) {
    const admins = await db.clubAccess.count({ where: { clubId: input.clubId, userId: { not: member.ownerUserId! }, status: "ACTIVE", role: { in: ["ADMIN", "OWNER"] }, user: { isActive: true } } });
    if (!admins) throw new ClubPlayerOwnershipError("Promote another active club admin before removing the last admin.", 403);
  }
  const now = input.now ?? new Date();
  const snapshot = await rawSnapshot(db, member.id);
  const cancelled = await cancelLocalPending(db, { clubId: input.clubId, playerId: input.playerId, ownerUserId: member.ownerUserId, actorUserId: input.actorUserId, now });
  const eventId = await insertEvent(db, {
    clubId: member.clubId, memberId: member.id, playerId: member.playerId, actorUserId: input.actorUserId,
    action: member.ownerUserId ? mode : "ARCHIVE", previousOwner: member.ownerUserId, newOwner: null, ownershipRevision: member.ownershipRevision,
    access: accessTransition(access, member.ownerUserId, "REVOKED"), metadataBefore: snapshot.metadata, metadataAfter: snapshot.metadata,
    details: { previousArchivedAt: snapshot.archivedAt, newArchivedAt: snapshot.archivedAt ?? now.getTime(), cancelled },
    reason: input.reason ?? "Club profile removed and locally disconnected; sporting history retained.", now,
  });
  return { disconnected: true as const, alreadyRemoved: !!member.archivedAt, eventId };
}
