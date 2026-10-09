import type { Prisma, PrismaClient } from "@prisma/client";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getOwnedClubPlayer, IdentityConflictError, linkUnownedPlayer, nonretiredPlayer } from "@/lib/playerIdentity";
import { normalizeClaimName } from "@/lib/clubClaimRules";

type Db = Prisma.TransactionClient;
type AdmissionKind = "EXISTING_PLAYER" | "NEW_PLAYER" | "OWNED_PLAYER";
export class ClubAdmissionError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}
export const admissionInclude = {
  requester: { select: { id: true, name: true, email: true } },
  requestedPlayer: { select: { id: true, name: true, ownerUserId: true, avatarKey: true } },
  approvedPlayer: { select: { id: true, name: true } },
  club: { select: { id: true, name: true } },
} satisfies Prisma.ClubAdmissionRequestInclude;

async function event(db: Db, requestId: string, actorUserId: string, action: string, revision: number, details: Record<string, unknown>) {
  await db.clubAdmissionEvent.create({ data: { admissionRequestId: requestId, actorUserId, action, revision, detailsJson: JSON.stringify(details) } });
}

function retryable(error: unknown) {
  const e = error as { code?: string; message?: string };
  return e.code === "P2034" || e.code === "P2002" || /SQLITE_BUSY|database is locked|deadlock|write conflict/i.test(e.message ?? "");
}
export async function admissionTransaction<T>(db: PrismaClient, operation: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(async tx => {
      // Prisma/libSQL begin deferred transactions. Reserve the SQLite writer before
      // reading to avoid two clients deadlocking while upgrading shared snapshots.
      // WHERE 0 changes no rows, revisions, timestamps, or audit records.
      await tx.$executeRaw`UPDATE "ClubJoinRequest" SET "revision"="revision" WHERE 0`;
      return operation(tx);
    }); }
    catch (error) {
      if (retryable(error) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
        continue;
      }
      if (error instanceof IdentityConflictError) throw new ClubAdmissionError(error.message, 409);
      if (/owned.*player|owner.*club|ownership.*conflict|same.club/i.test((error as Error).message ?? "")) throw new ClubAdmissionError("This account already owns a different Player in one of this Player's clubs. No history has been changed.", 409);
      throw error;
    }
  }
}

export interface SubmitAdmission {
  clubId: string; requesterUserId: string; kind: AdmissionKind; requestedPlayerId?: string | null;
  proposedPlayerName?: string | null; proposedGender?: string | null; note?: string | null; idempotencyKey?: string | null;
}
function normalizedOptional(value: string | null | undefined) { return value?.trim() || null; }

function sameAdmissionPayload(request: {
  clubId: string; kind: string; requestedPlayerId: string | null; proposedPlayerName: string | null;
  proposedGender: string | null; note: string | null;
}, input: SubmitAdmission) {
  return request.clubId === input.clubId && request.kind === input.kind &&
    request.requestedPlayerId === (input.requestedPlayerId ?? null) &&
    request.proposedPlayerName === normalizedOptional(input.proposedPlayerName) &&
    request.proposedGender === (input.proposedGender ?? null) &&
    request.note === normalizedOptional(input.note);
}

export async function submitClubAdmission(db: Db, input: SubmitAdmission) {
  const club = await db.club.findUnique({ where: { id: input.clubId } });
  if (!club || club.isTutorial) throw new ClubAdmissionError("Club not found", 404);
  const account = await db.user.findUnique({ where: { id: input.requesterUserId } });
  if (!account?.isActive) throw new ClubAdmissionError("An active account is required", 403);
  if (input.idempotencyKey) {
    const previous = await db.clubAdmissionRequest.findUnique({ where: { requesterUserId_idempotencyKey: { requesterUserId: input.requesterUserId, idempotencyKey: input.idempotencyKey } }, include: admissionInclude });
    if (previous) {
      if (previous.originInvitationId || !sameAdmissionPayload(previous, input)) throw new ClubAdmissionError("This request key was already used for a different request", 409);
      return previous;
    }
  }
  const pending = await db.clubAdmissionRequest.findFirst({ where: { clubId: input.clubId, requesterUserId: input.requesterUserId, status: "PENDING" }, include: admissionInclude });
  if (pending) {
    if (pending.originInvitationId || !sameAdmissionPayload(pending, input)) throw new ClubAdmissionError("Cancel your pending request before changing its details", 409);
    return pending;
  }
  if (!["EXISTING_PLAYER", "OWNED_PLAYER", "NEW_PLAYER"].includes(input.kind)) throw new ClubAdmissionError("Choose an existing profile or a new player");
  if (input.kind !== "NEW_PLAYER") {
    if (!input.requestedPlayerId) throw new ClubAdmissionError("Select a Player");
    const player = await db.player.findUnique({ where: { id: input.requestedPlayerId }, include: { clubMemberships: { where: { clubId: input.clubId } } } });
    if (!player?.isActive) throw new ClubAdmissionError("Player not found", 404);
    if (input.kind === "EXISTING_PLAYER" && !player.clubMemberships.length) throw new ClubAdmissionError("Player not found in this club", 404);
    if (player.ownerUserId && player.ownerUserId !== input.requesterUserId) throw new ClubAdmissionError("This Player already has an owner", 409);
    if (input.kind === "OWNED_PLAYER" && player.ownerUserId !== input.requesterUserId) throw new ClubAdmissionError("Select one of your owned Player profiles", 403);
  } else if (!input.proposedPlayerName?.trim() || !["MALE", "FEMALE"].includes(input.proposedGender ?? "")) {
    throw new ClubAdmissionError("Enter the new Player's name and gender for Mixed pairing");
  }
  const owned = await getOwnedClubPlayer(db, { userId: input.requesterUserId, clubId: input.clubId });
  if (owned?.playerId === input.requestedPlayerId) {
    // Still allow a MEMBER access request when ownership exists but access was revoked.
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.requesterUserId } } });
    if (access?.status === "ACTIVE" && !owned.archivedAt && owned.player.isActive) return { id: undefined, status: "MEMBER", clubId: input.clubId, approvedPlayerId: owned.playerId };
  }
  if (!club.allowJoinRequests) throw new ClubAdmissionError("This club is not accepting join requests", 403);
  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: input.clubId, requesterUserId: input.requesterUserId, kind: input.kind,
    requestedPlayerId: input.requestedPlayerId ?? null, proposedPlayerName: normalizedOptional(input.proposedPlayerName),
    proposedGender: input.proposedGender ?? null, note: normalizedOptional(input.note), idempotencyKey: input.idempotencyKey ?? null,
  }, include: admissionInclude });
  await event(db, request.id, input.requesterUserId, "SUBMIT", 0, { kind: input.kind, requestedPlayerId: input.requestedPlayerId ?? null });
  return request;
}

export interface ReviewAdmission {
  clubId: string; requestId: string; reviewerUserId: string; isGlobalAdmin?: boolean;
  action: "APPROVE" | "REJECT" | "CANCEL"; playerId?: string | null; asNew?: boolean; revision?: number; reason?: string;
  confirmRestoreAccess?: boolean; retireEmptyPlayerId?: string;
  /** Set only by the authorized invitation executor when cancelling an exact obsolete recovery request. */
  supersededByInvitationId?: string;
  /** Server-derived HTTP guard; omitted only by trusted internal callers. */
  requestOriginValid?: boolean;
}
export async function reviewClubAdmission(db: Db, input: ReviewAdmission) {
  const request = await db.clubAdmissionRequest.findUnique({ where: { id: input.requestId }, include: admissionInclude });
  if (!request || request.clubId !== input.clubId) throw new ClubAdmissionError("Request not found", 404);
  if (request.originInvitationId) {
    // Load after this module initializes: invitations share the admission error type.
    const { reviewInvitationRecovery } = await import("./playerInvitationRecovery");
    return reviewInvitationRecovery(db, input);
  }
  if (input.confirmRestoreAccess !== undefined || input.retireEmptyPlayerId !== undefined) throw new ClubAdmissionError("Recovery confirmation requires an invitation-backed request", 400);
  if (input.action === "CANCEL") {
    if (request.requesterUserId !== input.reviewerUserId) throw new ClubAdmissionError("You can only cancel your own request", 403);
  } else {
    const access = await getClubAdminAccess(db, { clubId: input.clubId, userId: input.reviewerUserId, isGlobalAdmin: input.isGlobalAdmin });
    if (!access?.canAdmin) throw new ClubAdmissionError("Club admin access required", 403);
    if (input.action === "APPROVE" && request.requesterUserId === input.reviewerUserId) throw new ClubAdmissionError("Another admin must approve your request", 403);
  }
  const desired = input.action === "APPROVE" ? "APPROVED" : input.action === "REJECT" ? "REJECTED" : "CANCELLED";
  if (request.status !== "PENDING") {
    if (request.status === desired && (!input.playerId || request.approvedPlayerId === input.playerId) && (!input.asNew || request.decision === "CREATE_NEW")) return request;
    throw new ClubAdmissionError("This request has already been reviewed", 409);
  }
  if (input.revision !== undefined && request.revision !== input.revision) throw new ClubAdmissionError("This request changed. Refresh before reviewing it", 409);
  const revision = request.revision + 1;
  // Acquire the request decision before touching ownership. Every failure rolls back this CAS.
  const claimed = await db.clubAdmissionRequest.updateMany({ where: { id: request.id, status: "PENDING", revision: request.revision }, data: { revision } });
  if (claimed.count !== 1) throw new ClubAdmissionError("This request changed. Refresh before reviewing it", 409);
  let approvedPlayerId: string | null = null;
  let decision: string = input.action;
  if (input.action === "APPROVE") {
    const requester = await db.user.findUnique({ where: { id: request.requesterUserId } });
    if (!requester?.isActive) throw new ClubAdmissionError("The requesting account is no longer active", 409);
    const existingOwned = await getOwnedClubPlayer(db, { userId: request.requesterUserId, clubId: input.clubId });
    const targetId = input.asNew ? null : input.playerId ?? request.requestedPlayerId;
    if (targetId) {
      const target = await db.player.findUnique({ where: { id: targetId }, include: { clubMemberships: { select: { clubId: true } } } });
      if (!target?.isActive) throw new ClubAdmissionError("Player not found", 404);
      const inClub = target.clubMemberships.some(m => m.clubId === input.clubId);
      if (!inClub && target.ownerUserId !== request.requesterUserId) throw new ClubAdmissionError("Select an existing Player in this club", 400);
      if (target.ownerUserId && target.ownerUserId !== request.requesterUserId) throw new ClubAdmissionError("This Player is already owned by another account", 409);
      if (existingOwned && existingOwned.playerId !== target.id) throw new ClubAdmissionError("This account already owns another Player in this club. A future merge review is required", 409);
      const targetClubIds = [...new Set([input.clubId, ...target.clubMemberships.map(m => m.clubId)])];
      const conflict = await db.clubMember.findFirst({ where: { clubId: { in: targetClubIds }, retiredByAdmissionEventId: null, playerId: { not: target.id }, player: { ownerUserId: request.requesterUserId } } });
      if (conflict) throw new ClubAdmissionError("This account already owns a different Player in one of the target's clubs. No history has been changed", 409);
      if (target.ownerUserId === null) {
        // Prisma's @updatedAt and Date serialization would normalize a legacy timestamp.
        // This parameterized CAS writes only the new ownership column; triggers project it to rosters.
        await linkUnownedPlayer(db, target.id, request.requesterUserId);
      }
      if (!inClub) await db.clubMember.create({ data: { clubId: input.clubId, playerId: target.id } });
      else await db.clubMember.updateMany({ where: { clubId: input.clubId, playerId: target.id, archivedAt: { not: null } }, data: { archivedAt: null } });
      approvedPlayerId = target.id;
      decision = target.ownerUserId === request.requesterUserId ? "REUSE_OWNED" : "CONNECT_EXISTING";
    } else {
      if (existingOwned) throw new ClubAdmissionError("This account already owns a Player in this club. Select that profile instead", 409);
      // Avoid a new identity for an account already owning a global Player; admins must choose it explicitly.
      const anyOwned = await db.player.findFirst({ where: { ownerUserId: request.requesterUserId, ...nonretiredPlayer } });
      if (anyOwned) throw new ClubAdmissionError("This account already owns a Player. Select that profile to join the club", 409);
      const name = request.proposedPlayerName?.trim() || request.requester.name;
      const gender = request.proposedGender ?? requester.gender;
      if (!name || !["MALE", "FEMALE"].includes(gender ?? "")) throw new ClubAdmissionError("A name and gender are required before approving a new Player");
      const player = await db.player.create({ data: { name, gender: gender!, ownerUserId: request.requesterUserId } });
      await db.clubMember.create({ data: { clubId: input.clubId, playerId: player.id } });
      approvedPlayerId = player.id;
      decision = "CREATE_NEW";
    }
    // Player ownership never supplies roles from the historical roster membership.
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: request.requesterUserId } } });
    if (!access) await db.clubAccess.create({ data: { clubId: input.clubId, userId: request.requesterUserId, role: "MEMBER" } });
    else if (access.status !== "ACTIVE") await db.clubAccess.update({ where: { id: access.id }, data: { status: "ACTIVE", role: "MEMBER" } });
  }
  const result = await db.clubAdmissionRequest.update({ where: { id: request.id }, data: { status: desired, approvedPlayerId, decision, reviewedByUserId: input.reviewerUserId, reviewedAt: new Date() }, include: admissionInclude });
  await event(db, request.id, input.reviewerUserId, input.action, revision, { requestedPlayerId: request.requestedPlayerId, approvedPlayerId, decision, reason: input.reason ?? null });
  return result;
}

export function obviousDuplicateName(left: string, right: string) { return normalizeClaimName(left) === normalizeClaimName(right); }
