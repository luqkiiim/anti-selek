import type { Prisma, PrismaClient } from "@prisma/client";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getOwnedClubPlayer, IdentityConflictError } from "@/lib/playerIdentity";
import { assertLocalClaimAvailable, claimClubPlayer, ClubPlayerOwnershipError, clubOwnershipTransaction } from "@/lib/clubPlayerOwnership";
import { hasClubEntry, type ClubEntryProof } from "@/lib/clubJoinEntry";
import { normalizeClaimName } from "@/lib/clubClaimRules";

type Db = Prisma.TransactionClient;
type AdmissionKind = "EXISTING_PLAYER" | "NEW_PLAYER" | "OWNED_PLAYER";
export class ClubAdmissionError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code?: string) { super(message); }
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

export async function admissionTransaction<T>(db: PrismaClient, operation: (tx: Db) => Promise<T>): Promise<T> {
  try { return await clubOwnershipTransaction(db, operation); }
  catch (error) {
      if (error instanceof IdentityConflictError || error instanceof ClubPlayerOwnershipError) throw new ClubAdmissionError(error.message, error.statusCode);
      if (/owned.*player|owner.*club|ownership.*conflict|same.club/i.test((error as Error).message ?? "")) throw new ClubAdmissionError("This account already owns a different Player in one of this Player's clubs. No history has been changed.", 409);
      throw error;
  }
}

export interface SubmitAdmission {
  clubId: string; requesterUserId: string; kind: AdmissionKind; requestedPlayerId?: string | null;
  proposedPlayerName?: string | null; proposedGender?: string | null; note?: string | null; idempotencyKey?: string | null;
}
function normalizedOptional(value: string | null | undefined) { return value?.trim() || null; }
function accountPlayerDetails(account: { name: string; gender: string }) {
  if (!account.name.trim() || !["MALE", "FEMALE"].includes(account.gender)) {
    throw new ClubAdmissionError("Complete your name and gender in Account Settings before joining a club.", 400, "ACCOUNT_PROFILE_INCOMPLETE");
  }
  return { name: account.name, gender: account.gender };
}

function sameAdmissionPayload(request: {
  clubId: string; kind: string; requestedPlayerId: string | null; proposedPlayerName: string | null;
  proposedGender: string | null; note: string | null;
}, input: SubmitAdmission) {
  return request.clubId === input.clubId && request.kind === input.kind &&
    request.requestedPlayerId === (input.requestedPlayerId ?? null) &&
    (input.kind === "NEW_PLAYER" || (request.proposedPlayerName === normalizedOptional(input.proposedPlayerName) &&
      request.proposedGender === (input.proposedGender ?? null))) &&
    request.note === normalizedOptional(input.note);
}

export async function submitClubAdmission(db: Db, input: SubmitAdmission, entryProof?: ClubEntryProof) {
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
  if (!await hasClubEntry(db, club, account, entryProof)) throw new ClubAdmissionError("Enter the club join code to continue", 403, "JOIN_CODE_REQUIRED");
  if (input.kind === "OWNED_PLAYER") throw new ClubAdmissionError("Choose a profile in this club or create a new local profile. Profiles from another club cannot be reused.", 409);
  if (!["EXISTING_PLAYER", "NEW_PLAYER"].includes(input.kind)) throw new ClubAdmissionError("Choose an existing profile or a new player");
  const accountDetails = accountPlayerDetails(account);
  if (input.kind !== "NEW_PLAYER") {
    if (!input.requestedPlayerId) throw new ClubAdmissionError("Select a Player");
    const player = await db.player.findUnique({ where: { id: input.requestedPlayerId }, include: { clubMemberships: { where: { clubId: input.clubId } } } });
    if (!player?.isActive) throw new ClubAdmissionError("Player not found", 404);
    const member = player.clubMemberships.find(m => !m.retiredByAdmissionEventId);
    if (!member) throw new ClubAdmissionError("Player not found in this club", 404);
    if (member.ownerUserId && member.ownerUserId !== input.requesterUserId) throw new ClubAdmissionError("This club profile already has an owner", 409);
    await assertLocalClaimAvailable(db, { clubId: input.clubId, playerId: player.id, userId: input.requesterUserId });
  }
  const newPlayerDetails = input.kind === "NEW_PLAYER" ? accountDetails : null;
  const owned = await getOwnedClubPlayer(db, { userId: input.requesterUserId, clubId: input.clubId });
  if (owned?.playerId === input.requestedPlayerId) {
    // Still allow a MEMBER access request when ownership exists but access was revoked.
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.requesterUserId } } });
    if (access?.status === "ACTIVE" && !owned.archivedAt && owned.player.isActive) return { id: undefined, status: "MEMBER", clubId: input.clubId, approvedPlayerId: owned.playerId };
  }
  if (!club.allowJoinRequests) throw new ClubAdmissionError("This club is not accepting join requests", 403);
  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: input.clubId, requesterUserId: input.requesterUserId, kind: input.kind,
    requestedPlayerId: input.requestedPlayerId ?? null, proposedPlayerName: newPlayerDetails?.name ?? normalizedOptional(input.proposedPlayerName),
    proposedGender: newPlayerDetails?.gender ?? input.proposedGender ?? null, note: normalizedOptional(input.note), idempotencyKey: input.idempotencyKey ?? null,
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
  if (request.originInvitationId && request.status === "PENDING") throw new ClubAdmissionError("Legacy profile recovery is closed. Ask an admin for a new local invitation.", 410);
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
    if (request.kind === "OWNED_PLAYER") throw new ClubAdmissionError("Profiles from another club cannot be reused. Submit a new local request.", 409);
    const requester = await db.user.findUnique({ where: { id: request.requesterUserId } });
    if (!requester?.isActive) throw new ClubAdmissionError("The requesting account is no longer active", 409);
    const existingOwned = await getOwnedClubPlayer(db, { userId: request.requesterUserId, clubId: input.clubId });
    const targetId = input.asNew ? null : input.playerId ?? request.requestedPlayerId;
    if (targetId) {
      const target = await db.player.findUnique({ where: { id: targetId }, include: { clubMemberships: { where: { clubId: input.clubId, retiredByAdmissionEventId: null } } } });
      if (!target?.isActive) throw new ClubAdmissionError("Player not found", 404);
      const member = target.clubMemberships[0];
      if (!member) throw new ClubAdmissionError("Select an existing profile in this club", 400);
      if (member.ownerUserId && member.ownerUserId !== request.requesterUserId) throw new ClubAdmissionError("This club profile is already owned by another account", 409);
      if (existingOwned && existingOwned.playerId !== target.id) throw new ClubAdmissionError("This account already owns another Player in this club. A future merge review is required", 409);
      if (member.ownerUserId === request.requesterUserId) {
        const grant = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: request.requesterUserId } } });
        if (member.archivedAt || grant?.status !== "ACTIVE") throw new ClubAdmissionError("Retained removed ownership requires an explicit local disconnect before a fresh invitation.", 409);
      } else await claimClubPlayer(db, { clubId: input.clubId, playerId: target.id, userId: request.requesterUserId, actorUserId: input.reviewerUserId, admissionRequestId: request.id });
      approvedPlayerId = target.id;
      decision = member.ownerUserId === request.requesterUserId ? "REUSE_LOCAL" : "CONNECT_EXISTING";
    } else {
      if (existingOwned) throw new ClubAdmissionError("This account already owns a Player in this club. Select that profile instead", 409);
      // Submitted/legacy details remain an immutable audit snapshot; the account
      // reread in this approval transaction supplies the new profile's metadata.
      const { name, gender } = accountPlayerDetails(requester);
      const player = await db.player.create({ data: { name, gender } });
      await db.clubMember.create({ data: { clubId: input.clubId, playerId: player.id } });
      await claimClubPlayer(db, { clubId: input.clubId, playerId: player.id, userId: request.requesterUserId, actorUserId: input.reviewerUserId, admissionRequestId: request.id });
      approvedPlayerId = player.id;
      decision = "CREATE_NEW";
    }
    // The local claim event grants MEMBER access or preserves an active grant.
  }
  const result = await db.clubAdmissionRequest.update({ where: { id: request.id }, data: { status: desired, approvedPlayerId, decision, reviewedByUserId: input.reviewerUserId, reviewedAt: new Date() }, include: admissionInclude });
  await event(db, request.id, input.reviewerUserId, input.action, revision, { requestedPlayerId: request.requestedPlayerId, approvedPlayerId, decision, reason: input.reason ?? null });
  return result;
}

export function obviousDuplicateName(left: string, right: string) { return normalizeClaimName(left) === normalizeClaimName(right); }
