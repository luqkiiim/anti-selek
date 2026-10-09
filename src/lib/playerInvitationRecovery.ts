import type { ClubAdmissionRequest, PlayerInvitation, Prisma, PrismaClient } from "@prisma/client";
import { admissionInclude, ClubAdmissionError, type ReviewAdmission } from "./clubAdmissions";
import { continuationInvitation, PlayerInvitationError, validInvitation } from "./playerInvitations";
import { assertNoOtherOwnedPlayer, IdentityConflictError, linkUnownedPlayer } from "./playerIdentity";
import { playerRetirementBlockers } from "./playerRetirement";
import type { InvitationAvailability, RecoveryEligibility, RecoveryStatus } from "@/types/playerRecovery";

type Db = Prisma.TransactionClient;
type ReadDb = Db | PrismaClient;
const conflict = (message: string, code = "RECOVERY_CONFLICT") => new PlayerInvitationError(message, code);
export function invitationAvailability(invite: Pick<PlayerInvitation, "status" | "revocationReason" | "expiresAt"> | null, now = new Date()): InvitationAvailability {
  if (!invite) return "UNAVAILABLE";
  if (invite.status === "REVOKED") return invite.revocationReason === "REPLACED" ? "REPLACED" : "REVOKED";
  if (invite.status === "REDEEMED") return "REDEEMED";
  if (invite.status === "EXPIRED" || invite.expiresAt <= now) return "EXPIRED";
  return invite.status === "ACTIVE" ? "ACTIVE" : "UNAVAILABLE";
}

export async function recoveryEligibility(db: ReadDb, request: ClubAdmissionRequest, now = new Date()): Promise<RecoveryEligibility> {
  const [invite, account, access, target] = await Promise.all([
    request.originInvitationId ? db.playerInvitation.findUnique({ where: { id: request.originInvitationId } }) : null,
    db.user.findUnique({ where: { id: request.requesterUserId }, select: { isActive: true } }),
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId: request.clubId, userId: request.requesterUserId } } }),
    request.requestedPlayerId ? db.player.findUnique({ where: { id: request.requestedPlayerId }, select: {
      id: true, ownerUserId: true, isActive: true,
      clubMemberships: { select: { id: true, clubId: true, archivedAt: true, retiredByAdmissionEventId: true } },
    } }) : null,
  ]);
  let availability = invitationAvailability(invite, now);
  const member = target?.clubMemberships.find(m => m.id === invite?.clubMemberId && m.clubId === request.clubId);
  if (availability === "ACTIVE" && (!member || member.archivedAt || member.retiredByAdmissionEventId || !target?.isActive || target.ownerUserId)) availability = "UNAVAILABLE";
  const blockers: string[] = [];
  if (availability !== "ACTIVE") blockers.push(`The original invitation is ${availability.toLowerCase()}. Ask an admin for a fresh invitation.`);
  if (!account?.isActive) blockers.push("The requesting account is no longer active.");
  if (invite && (invite.clubId !== request.clubId || invite.playerId !== request.requestedPlayerId || invite.createdByUserId === request.requesterUserId)) blockers.push("The invitation does not authorize this request.");
  const conflicts = await db.clubMember.findMany({ where: {
    clubId: { in: [...new Set([request.clubId, ...(target?.clubMemberships.map(m => m.clubId) ?? [])])] },
    retiredByAdmissionEventId: null, playerId: { not: request.requestedPlayerId ?? "" }, player: { ownerUserId: request.requesterUserId },
  }, select: { id: true, clubId: true, playerId: true, player: { select: { name: true } } } });
  const ids = [...new Set(conflicts.map(m => m.playerId))];
  let duplicate: RecoveryEligibility["duplicate"] = null;
  if (ids.length > 1) blockers.push("Multiple owned Players conflict across the target's clubs. A separate identity review is required.");
  else if (ids.length === 1) {
    const source = conflicts.find(m => m.clubId === request.clubId);
    if (!source) blockers.push("The conflicting Player belongs to another club. Recovery cannot retire it.");
    else {
      const sourceBlockers = await playerRetirementBlockers(db, source.playerId);
      duplicate = { id: source.playerId, memberId: source.id, name: source.player.name, eligible: sourceBlockers.length === 0, blockers: sourceBlockers };
      blockers.push(...sourceBlockers);
    }
  }
  return { invitationAvailability: availability, needsAccessRestore: !!access && access.status !== "ACTIVE", duplicate, blockers, canApprove: request.status === "PENDING" && blockers.length === 0 };
}

async function recoveryStatusFor(db: ReadDb, request: Prisma.ClubAdmissionRequestGetPayload<{ include: typeof admissionInclude }>, now = new Date()): Promise<RecoveryStatus> {
  return {
    request: { id: request.id, clubId: request.clubId, requestedPlayerId: request.requestedPlayerId, originInvitationId: request.originInvitationId,
      status: request.status, revision: request.revision, targetName: request.requestedPlayer?.name ?? null, clubName: request.club.name },
    recovery: await recoveryEligibility(db, request, now),
    ...(request.status === "APPROVED" ? { destination: `/club/${encodeURIComponent(request.clubId)}?tab=profile` } : {}),
  };
}
export async function getInvitationRecoveryStatus(db: ReadDb, invitationId: string, userId: string, now = new Date()): Promise<RecoveryStatus> {
  const account = await db.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!account?.isActive) throw new PlayerInvitationError("An active account is required.", "ACCOUNT_REQUIRED", 403);
  const request = await db.clubAdmissionRequest.findFirst({ where: { originInvitationId: invitationId, requesterUserId: userId }, include: admissionInclude, orderBy: { createdAt: "desc" } });
  return request ? recoveryStatusFor(db, request, now) : { request: null, recovery: null };
}

export async function submitInvitationRecovery(db: Db, input: { invitationId: string; handle?: string; userId: string; idempotencyKey: string; note?: string; now?: Date }) {
  const now = input.now ?? new Date();
  const account = await db.user.findUnique({ where: { id: input.userId }, select: { isActive: true } });
  if (!account?.isActive) throw new PlayerInvitationError("An active account is required.", "ACCOUNT_REQUIRED", 403);
  await continuationInvitation(db, input.invitationId, input.handle, now);
  const invite = await validInvitation(db, input.invitationId, now);
  if (invite.createdByUserId === input.userId) throw new PlayerInvitationError("Another club admin must invite and approve you.", "SELF_APPROVAL", 403);
  const note = input.note?.trim() || null;
  const previous = await db.clubAdmissionRequest.findUnique({ where: { requesterUserId_idempotencyKey: { requesterUserId: input.userId, idempotencyKey: input.idempotencyKey } }, include: admissionInclude });
  if (previous) {
    if (previous.originInvitationId !== invite.id || previous.clubId !== invite.clubId || previous.requestedPlayerId !== invite.playerId || previous.note !== note) throw conflict("This request key was used for a different request.");
    return recoveryStatusFor(db, previous, now);
  }
  const pending = await db.clubAdmissionRequest.findFirst({ where: { clubId: invite.clubId, requesterUserId: input.userId, status: "PENDING" }, include: admissionInclude });
  if (pending) {
    if (pending.originInvitationId === invite.id && pending.requestedPlayerId === invite.playerId && pending.note === note) return recoveryStatusFor(db, pending, now);
    const old = pending.originInvitationId ? await db.playerInvitation.findUnique({ where: { id: pending.originInvitationId } }) : null;
    if (!pending.originInvitationId || pending.requestedPlayerId !== invite.playerId || invitationAvailability(old, now) === "ACTIVE") throw conflict("Cancel your existing pending request before submitting this recovery.", "PENDING_REQUEST_CONFLICT");
    const cancelled = await db.clubAdmissionRequest.updateMany({ where: { id: pending.id, status: "PENDING", revision: pending.revision }, data: { status: "CANCELLED", revision: { increment: 1 }, decision: "INVITATION_UNAVAILABLE", reviewedByUserId: input.userId, reviewedAt: now } });
    if (cancelled.count !== 1) throw conflict("The previous request changed. Refresh before trying again.");
    await db.clubAdmissionEvent.create({ data: { admissionRequestId: pending.id, actorUserId: input.userId, action: "CANCEL", revision: pending.revision + 1, detailsJson: JSON.stringify({ reason: `INVITATION_${invitationAvailability(old, now)}`, replacementInvitationId: invite.id }) } });
  }
  const request = await db.clubAdmissionRequest.create({ data: { clubId: invite.clubId, requesterUserId: input.userId, kind: "EXISTING_PLAYER", requestedPlayerId: invite.playerId, originInvitationId: invite.id, idempotencyKey: input.idempotencyKey, note }, include: admissionInclude });
  await db.clubAdmissionEvent.create({ data: { admissionRequestId: request.id, actorUserId: input.userId, action: "SUBMIT_RECOVERY", revision: 0, detailsJson: JSON.stringify({ originInvitationId: invite.id, targetPlayerId: invite.playerId }) } });
  return recoveryStatusFor(db, request, now);
}

export async function reviewInvitationRecovery(db: Db, input: ReviewAdmission) {
  const request = await db.clubAdmissionRequest.findUnique({ where: { id: input.requestId }, include: admissionInclude });
  if (!request?.originInvitationId || request.clubId !== input.clubId) throw new ClubAdmissionError("Recovery request not found", 404);
  if (input.requestOriginValid === false) throw new PlayerInvitationError("Same-origin JSON request required.", "ORIGIN_REQUIRED", 403);
  const reviewer = await db.user.findUnique({ where: { id: input.reviewerUserId }, select: { isActive: true } });
  if (!reviewer?.isActive) throw new PlayerInvitationError("An active account is required.", "ACCOUNT_REQUIRED", 403);
  if (input.action === "CANCEL") {
    if (request.requesterUserId !== input.reviewerUserId) throw new PlayerInvitationError("You can only cancel your own recovery request.", "ACCOUNT_REQUIRED", 403);
  } else {
    const authority = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.reviewerUserId } } });
    if (authority?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(authority.role)) throw new PlayerInvitationError("Active club ADMIN or OWNER access required.", "ADMIN_REQUIRED", 403);
    if (request.requesterUserId === input.reviewerUserId && input.action === "APPROVE") throw new PlayerInvitationError("Another admin must approve your recovery.", "SELF_APPROVAL", 403);
  }
  if (input.asNew || (input.playerId && input.playerId !== request.requestedPlayerId)) throw conflict("An invitation-backed recovery cannot be changed to another Player.");
  if (input.revision === undefined) throw conflict("Refresh the request before reviewing it. A revision is required.");
  const desired = input.action === "APPROVE" ? "APPROVED" : input.action === "REJECT" ? "REJECTED" : "CANCELLED";
  if (request.status !== "PENDING") {
    if (request.status !== desired) throw conflict("This recovery request has already been reviewed.");
    if (input.action === "APPROVE") {
      const approval = await db.clubAdmissionEvent.findUnique({ where: { admissionRequestId_revision: { admissionRequestId: request.id, revision: request.revision } } });
      const source = approval ? JSON.parse(approval.detailsJson).sourcePlayerId : null;
      if ((input.retireEmptyPlayerId ?? null) !== (source ?? null)) throw conflict("The completed recovery has a different retirement decision.");
    }
    return request; // receipt only; never repeat grants after later revocation
  }
  if (input.revision !== request.revision) throw conflict("This request changed. Refresh before reviewing it.");
  const now = new Date();
  const revision = request.revision + 1;
  const acquired = await db.clubAdmissionRequest.updateMany({ where: { id: request.id, status: "PENDING", revision: request.revision }, data: { revision } });
  if (acquired.count !== 1) throw conflict("This request changed. Refresh before reviewing it.");
  let approvedPlayerId: string | null = null;
  if (input.action === "APPROVE") {
    const invite = await validInvitation(db, request.originInvitationId, now);
    const eligibility = await recoveryEligibility(db, request, now);
    if (!eligibility.canApprove) throw conflict(eligibility.blockers.join(" ") || "This recovery is no longer eligible.", "RECOVERY_BLOCKED");
    if (invite.createdByUserId === request.requesterUserId) throw conflict("This invitation cannot authorize self-approval.");
    if (eligibility.needsAccessRestore && input.confirmRestoreAccess !== true) throw conflict("Explicitly confirm restoring access as MEMBER.", "RESTORE_CONFIRMATION_REQUIRED");
    const source = eligibility.duplicate;
    if (source && (input.retireEmptyPlayerId !== source.id || !input.reason?.trim())) throw conflict("Confirm the specific empty duplicate and provide a retirement reason.", "RETIREMENT_CONFIRMATION_REQUIRED");
    if (!source && input.retireEmptyPlayerId) throw conflict("The conflicting Player changed. Refresh before approving.");
    if (source) {
      // No owner release, replacement IDs, rating changes, or timestamp normalization.
      await db.$executeRaw`UPDATE "User" SET "isActive"=0 WHERE "id"=${source.id} AND "ownerUserId"=${request.requesterUserId}`;
    }
    const event = await db.clubAdmissionEvent.create({ data: { admissionRequestId: request.id, actorUserId: input.reviewerUserId, action: "APPROVE_RECOVERY", revision, detailsJson: JSON.stringify({
      originInvitationId: invite.id, targetPlayerId: invite.playerId, sourcePlayerId: source?.id ?? null, sourceMemberId: source?.memberId ?? null,
      confirmRestoreAccess: input.confirmRestoreAccess === true, restoredAccess: eligibility.needsAccessRestore, reason: input.reason?.trim() || null,
    }) } });
    if (source) await db.clubMember.update({ where: { id: source.memberId }, data: { retiredByAdmissionEventId: event.id } });
    // Retire the exact eligible duplicate before checking account-wide ownership.
    // This preserves recovery while returning a typed conflict before the CLAIM
    // trigger can turn a disjoint-club conflict into a generic database error.
    try {
      await assertNoOtherOwnedPlayer(db, request.requesterUserId, invite.playerId);
    } catch (error) {
      if (error instanceof IdentityConflictError) throw conflict(error.message, "IDENTITY_CONFLICT");
      throw error;
    }
    const consumedAt = new Date();
    const consumed = await db.playerInvitation.updateMany({ where: { id: invite.id, status: "ACTIVE", expiresAt: { gt: consumedAt } }, data: { status: "REDEEMED", redeemedByUserId: request.requesterUserId, redeemedAt: consumedAt } });
    if (consumed.count !== 1) throw conflict("The invitation changed before approval.");
    await linkUnownedPlayer(db, invite.playerId, request.requesterUserId);
    const access = await db.clubAccess.findUnique({ where: { clubId_userId: { clubId: request.clubId, userId: request.requesterUserId } } });
    if (!access) await db.clubAccess.create({ data: { clubId: request.clubId, userId: request.requesterUserId, role: "MEMBER", status: "ACTIVE" } });
    else if (access.status !== "ACTIVE") await db.clubAccess.update({ where: { id: access.id }, data: { role: "MEMBER", status: "ACTIVE" } });
    approvedPlayerId = invite.playerId;
  } else {
    await db.clubAdmissionEvent.create({ data: { admissionRequestId: request.id, actorUserId: input.reviewerUserId, action: input.action, revision, detailsJson: JSON.stringify({
      reason: input.reason?.trim() || null,
      ...(input.action === "CANCEL" && input.supersededByInvitationId ? { supersededByInvitationId: input.supersededByInvitationId } : {}),
    }) } });
  }
  return db.clubAdmissionRequest.update({ where: { id: request.id }, data: { status: desired, approvedPlayerId, decision: input.action === "APPROVE" ? "RECOVER_INVITED_PLAYER" : input.action, reviewedByUserId: input.reviewerUserId, reviewedAt: now }, include: admissionInclude });
}
