import { randomUUID } from "node:crypto";
import type { PlayerInvitation, Prisma, PrismaClient } from "@prisma/client";
import { nonretiredPlayer, linkUnownedPlayer } from "@/lib/playerIdentity";
import { playerRetirementBlockerDetails } from "@/lib/playerRetirement";
import {
  continuationInvitation,
  hashInvitationSecret,
  INVITATION_TTL_MS,
  newInvitationSecret,
  PlayerInvitationError,
  expirePlayerInvitationReservations,
} from "@/lib/playerInvitations";
import type {
  AuthorizedAccessAction,
  AuthorizedInvitationContext,
  CreateAccessRestoreInvitationInput,
  CreateAuthorizedInvitationResponse,
  CreateCorrectionInvitationInput,
  IdentityAccessSnapshot,
  IdentityAccountReference,
  IdentityHistorySummary,
  IdentityInvitationSummary,
  IdentityMemberSnapshot,
  IdentityOptionsResponse,
  InvitationExecutionReceipt,
  PlayerInvitationPurpose,
  SupersedableRecoveryRequest,
  SupersedeRecoveryRequestInput,
} from "@/types/playerRecovery";

type Db = Prisma.TransactionClient;
type ReadDb = Db | PrismaClient;
type AuthorizedPurpose = Exclude<PlayerInvitationPurpose, "CLAIM">;
type CreateInput = (CreateCorrectionInvitationInput | CreateAccessRestoreInvitationInput) & {
  clubId: string; targetPlayerId: string; issuerAccountId: string;
};
const fail = (message: string, code = "IDENTITY_INVITATION_INVALID", status = 409): never => {
  throw new PlayerInvitationError(message, code, status);
};
const identityConflictMessage = "This account owns another nonretired Player; manual identity review is required.";
function requireValue<T>(value: T | null | undefined, message: string, code = "IDENTITY_INVITATION_INVALID", status = 409): T {
  if (value === null || value === undefined) throw new PlayerInvitationError(message, code, status);
  return value;
}
const destinationFor = (clubId: string) => `/club/${encodeURIComponent(clubId)}?tab=profile`;
const accountRef = (id: string) => `Account ·${id.slice(-6)}`;

function maskedEmail(email: string | null | undefined) {
  if (!email) return null;
  const [local, domain] = email.split("@", 2);
  if (!domain) return "••••••";
  return `${local.slice(0, 1) || "•"}•••@${domain}`;
}

function accountReference(account: { id: string; name: string; email: string | null; isActive: boolean }): IdentityAccountReference {
  return { accountId: account.id, accountRef: accountRef(account.id), displayName: account.name, maskedEmail: maskedEmail(account.email), isActive: account.isActive };
}

function accessSnapshot(access: { id: string; role: string; status: string; revision: number } | null): IdentityAccessSnapshot {
  if (!access) return { accessId: null, status: "NONE", role: null, revision: null };
  return { accessId: access.id, status: access.status as "ACTIVE" | "REVOKED", role: access.role as IdentityAccessSnapshot["role"], revision: access.revision };
}

function memberSnapshot(member: { id: string; archivedAt: Date | null; retiredByAdmissionEventId: string | null } | null): IdentityMemberSnapshot | null {
  return member ? { memberId: member.id, archivedAt: member.archivedAt?.toISOString() ?? null, retiredByAdmissionEventId: member.retiredByAdmissionEventId } : null;
}

function invitationSummary(invite: Pick<PlayerInvitation, "id" | "purpose" | "status" | "expiresAt">): IdentityInvitationSummary {
  return { id: invite.id, purpose: invite.purpose as PlayerInvitationPurpose, status: invite.status as IdentityInvitationSummary["status"], expiresAt: invite.expiresAt.toISOString() };
}

async function localIssuerAccess(db: ReadDb, clubId: string, userId: string) {
  const [club, account, access] = await Promise.all([
    db.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, isTutorial: true } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, isActive: true } }),
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId } } }),
  ]);
  const checkedClub = requireValue(club, "Club not found.", "CLUB_NOT_FOUND", 404);
  const checkedAccount = requireValue(account, "An active account is required.", "ACCOUNT_REQUIRED", 403);
  const checkedAccess = requireValue(access, "Active local club ADMIN or OWNER access required.", "ADMIN_REQUIRED", 403);
  if (checkedClub.isTutorial) fail("Club not found.", "CLUB_NOT_FOUND", 404);
  if (!checkedAccount.isActive) fail("An active account is required.", "ACCOUNT_REQUIRED", 403);
  if (checkedAccess.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(checkedAccess.role)) fail("Active local club ADMIN or OWNER access required.", "ADMIN_REQUIRED", 403);
  return { club: checkedClub, account: checkedAccount, access: checkedAccess };
}

function historyWhere(playerId: string) {
  return { OR: [
    { team1Player1Id: playerId }, { team1Player2Id: playerId },
    { team2Player1Id: playerId }, { team2Player2Id: playerId },
    { scoreSubmittedByPlayerId: playerId },
  ] } satisfies Prisma.MatchWhereInput;
}

async function historySummary(db: ReadDb, playerId: string, blockers: string[] = []): Promise<IdentityHistorySummary> {
  const where = { ...historyWhere(playerId), status: "COMPLETED" };
  const [matchesPlayed, latest] = await Promise.all([
    db.match.count({ where }),
    db.match.findFirst({ where, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
  ]);
  return { matchesPlayed, lastPlayedAt: latest?.completedAt?.toISOString() ?? null, blockers };
}

function accessActionFor(snapshot: IdentityAccessSnapshot, requested?: CreateInput["authorizedAccessAction"]): AuthorizedAccessAction {
  if (snapshot.status === "ACTIVE") {
    if (requested !== undefined && requested !== "PRESERVE_ACTIVE") fail("Active access is preserved as-is; it cannot be changed through this invitation.", "ACCESS_ACTION_MISMATCH");
    return "PRESERVE_ACTIVE";
  }
  const required = snapshot.status === "NONE" ? "GRANT_MEMBER" : "RESTORE_MEMBER";
  if (requested !== required) fail(`Explicitly authorize ${required === "GRANT_MEMBER" ? "granting MEMBER access" : "restoring access as MEMBER"}.`, "ACCESS_ACTION_REQUIRED");
  return required;
}

async function sourceBlockers(db: ReadDb, sourcePlayerId: string, selectedInviteId?: string, now = new Date()) {
  const details = await playerRetirementBlockerDetails(db as Db, sourcePlayerId);
  const blockers = details.filter(row => row.code !== "ROSTER_NOT_ARCHIVED").map(row => row.message);
  const nowMs = now.getTime();
  const otherActiveSourceInvitation = await db.$queryRaw<Array<{ id: string }>>`
    SELECT i."id" FROM "PlayerInvitation" i
    WHERE i."purpose"='CORRECTION' AND i."sourcePlayerId"=${sourcePlayerId} AND i."status"='ACTIVE'
      AND i."id" IS NOT ${selectedInviteId ?? ""}
      AND ((CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN CAST(i."expiresAt" AS REAL)
        WHEN julianday(i."expiresAt") IS NOT NULL THEN round((julianday(i."expiresAt")-2440587.5)*86400000)
        ELSE NULL END IS NULL)
        OR (CASE WHEN typeof(i."expiresAt") IN ('integer','real') THEN CAST(i."expiresAt" AS REAL)
          WHEN julianday(i."expiresAt") IS NOT NULL THEN round((julianday(i."expiresAt")-2440587.5)*86400000)
          ELSE NULL END) > ${nowMs})
    LIMIT 1`;
  if (otherActiveSourceInvitation.length) blockers.push("Another active correction invitation already reserves this duplicate profile.");
  return [...new Set(blockers)];
}

async function globalOwnedConflict(db: ReadDb, accountId: string, allowedPlayerId: string) {
  return db.player.findFirst({
    where: { ownerUserId: accountId, id: { not: allowedPlayerId }, ...nonretiredPlayer },
    select: { id: true },
  });
}

async function targetForClub(db: ReadDb, clubId: string, targetPlayerId: string) {
  const target = requireValue(await db.player.findUnique({
    where: { id: targetPlayerId },
    include: { clubMemberships: { where: { clubId }, take: 1 } },
  }), "The selected Player is not in this club.", "TARGET_NOT_FOUND", 404);
  const member = requireValue(target.clubMemberships[0], "The selected Player is not in this club.", "TARGET_NOT_FOUND", 404);
  if (member.retiredByAdmissionEventId) fail("This roster profile is permanently retired.", "TARGET_RETIRED");
  return { target, member };
}

async function accountAccessSnapshot(db: ReadDb, clubId: string, accountId: string) {
  return accessSnapshot(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: accountId } } }));
}

/** Read-only, club-scoped ADMIN/OWNER identity picker. */
export async function identityOptions(db: ReadDb, input: { clubId: string; targetPlayerId: string; issuerAccountId: string; purpose: AuthorizedPurpose; now?: Date }): Promise<IdentityOptionsResponse> {
  const now = input.now ?? new Date();
  await localIssuerAccess(db, input.clubId, input.issuerAccountId);
  const { target, member } = await targetForClub(db, input.clubId, input.targetPlayerId);
  const [owner, targetAccess, targetHistory, active, otherOwned] = await Promise.all([
    target.ownerUserId ? db.user.findUnique({ where: { id: target.ownerUserId }, select: { id: true, name: true, email: true, isActive: true } }) : null,
    target.ownerUserId ? accountAccessSnapshot(db, input.clubId, target.ownerUserId) : null,
    historySummary(db, target.id),
    db.playerInvitation.findFirst({ where: { clubId: input.clubId, playerId: input.targetPlayerId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true, purpose: true, status: true, expiresAt: true } }),
    input.purpose === "ACCESS_RESTORE" && target.ownerUserId ? globalOwnedConflict(db, target.ownerUserId, target.id) : Promise.resolve(null),
  ]);
  const candidates: IdentityOptionsResponse["correctionCandidates"] = [];
  if (input.purpose === "CORRECTION") {
    const sources = await db.clubMember.findMany({
      where: { clubId: input.clubId, retiredByAdmissionEventId: null, player: { ownerUserId: { not: null } } },
      include: { player: { select: { id: true, ownerUserId: true, name: true, elo: true, isActive: true } } },
      orderBy: { createdAt: "asc" },
    });
    for (const sourceMember of sources) {
      const accountId = sourceMember.player.ownerUserId;
      if (!accountId) continue;
      const [account, access, retirement, otherOwned] = await Promise.all([
        db.user.findUnique({ where: { id: accountId }, select: { id: true, name: true, email: true, isActive: true } }),
        accountAccessSnapshot(db, input.clubId, accountId),
        sourceBlockers(db, sourceMember.player.id, active?.purpose === "CORRECTION" ? active.id : undefined, now),
        globalOwnedConflict(db, accountId, sourceMember.player.id),
      ]);
      if (!account) continue;
      const blockers = [...retirement];
      if (!account.isActive) blockers.push("The owning account is inactive.");
      if (sourceMember.player.id === target.id) blockers.push("The duplicate and original Player must be different records.");
      if (target.ownerUserId) blockers.push("The original Player already has an owner.");
      if (!target.isActive) blockers.push("The original Player is inactive.");
      if (member.archivedAt) blockers.push("The original Player's club roster is archived; use the explicit access restore flow if this account already owns it.");
      if (otherOwned) blockers.push("This account owns another nonretired Player; manual identity review is required.");
      candidates.push({
        account: accountReference(account),
        source: {
          playerId: sourceMember.player.id, name: sourceMember.player.name, rating: sourceMember.elo,
          isActive: sourceMember.player.isActive, memberId: sourceMember.id, archivedAt: sourceMember.archivedAt?.toISOString() ?? null,
          clubAccess: access, history: await historySummary(db, sourceMember.player.id, retirement),
        },
        eligible: blockers.length === 0,
        blockers: [...new Set(blockers)],
      });
    }
  }
  return {
    purpose: input.purpose,
    target: {
      playerId: target.id, name: target.name, rating: member.elo, isActive: target.isActive,
      ownerAccount: owner ? accountReference(owner) : null,
      member: memberSnapshot(member), clubAccess: targetAccess, history: targetHistory,
      activeInvitation: active ? invitationSummary(active as PlayerInvitation) : null,
      accessRestoreBlockers: otherOwned ? [identityConflictMessage] : [],
    },
    correctionCandidates: candidates,
  };
}

function recipientAccessColumns(snapshot: IdentityAccessSnapshot) {
  return {
    recipientAccessId: snapshot.accessId,
    recipientAccessStatus: snapshot.status,
    recipientAccessRole: snapshot.role,
    recipientAccessRevision: snapshot.revision,
  };
}

/** Create or explicitly replace an exact, purpose-bound invitation. */
export async function createAuthorizedInvitation(db: Db, purpose: AuthorizedPurpose, input: CreateInput, now = new Date()): Promise<CreateAuthorizedInvitationResponse> {
  if ((purpose === "CORRECTION") !== ("sourcePlayerId" in input)) fail("Invitation purpose does not match this route.", "PURPOSE_MISMATCH", 400);
  const { access: issuerAccess, account: issuer } = await localIssuerAccess(db, input.clubId, input.issuerAccountId);
  const recipientId = input.recipientAccountId;
  if (recipientId === input.issuerAccountId) fail("Choose a different recipient account.", "SELF_APPROVAL", 403);
  const recipient = requireValue(await db.user.findUnique({ where: { id: recipientId }, select: { id: true, isActive: true } }), "The selected recipient account is inactive or unavailable.", "RECIPIENT_UNAVAILABLE", 409);
  if (!recipient.isActive) fail("The selected recipient account is inactive or unavailable.", "RECIPIENT_UNAVAILABLE", 409);
  const { target, member } = await targetForClub(db, input.clubId, input.targetPlayerId);
  if (!target.isActive) fail("The original Player is inactive and cannot be activated by this invitation.", "TARGET_INACTIVE");
  const selectedReplacementBeforeExpiry = input.replaceInvitationId
    ? await db.playerInvitation.findUnique({ where: { id: input.replaceInvitationId }, select: { id: true, clubId: true, playerId: true, status: true } })
    : null;
  // Expire only timestamps that parse as a known numeric-ms or ISO/Julianday value.
  // Invalid stored timestamps remain active and require manual review.
  await expirePlayerInvitationReservations(db, target.id, now);
  const active = await db.playerInvitation.findFirst({ where: { clubId: input.clubId, playerId: target.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (active) {
    if (!input.replaceInvitationId) return { purpose, invitation: null, replacementRequired: invitationSummary(active) };
    if (input.replaceInvitationId !== active.id) fail("The invitation selected for replacement is no longer the active target invitation; refresh before issuing a new one.", "INVITATION_CHANGED");
    const replaced = await db.playerInvitation.updateMany({
      where: { id: active.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedByUserId: issuer.id, revokedAt: now, revocationReason: "REPLACED" },
    });
    if (replaced.count !== 1) fail("The existing invitation changed; refresh and try again.", "INVITATION_CHANGED");
  } else if (input.replaceInvitationId) {
    const selectedReplacement = await db.playerInvitation.findUnique({ where: { id: input.replaceInvitationId }, select: { id: true, clubId: true, playerId: true, status: true } });
    const wasJustProvenExpired = selectedReplacementBeforeExpiry?.id === input.replaceInvitationId
      && selectedReplacementBeforeExpiry.clubId === input.clubId
      && selectedReplacementBeforeExpiry.playerId === target.id
      && selectedReplacementBeforeExpiry.status === "ACTIVE"
      && selectedReplacement?.id === input.replaceInvitationId
      && selectedReplacement.clubId === input.clubId
      && selectedReplacement.playerId === target.id
      && selectedReplacement.status === "EXPIRED";
    if (!wasJustProvenExpired) fail("The invitation selected for replacement is no longer active; refresh before issuing a new one.", "INVITATION_CHANGED");
  }
  if (purpose === "CORRECTION") {
    const correction = input as CreateCorrectionInvitationInput & CreateInput;
    if (correction.retireSourcePlayerId !== correction.sourcePlayerId) fail("Explicitly confirm retiring the exact selected duplicate Player.", "RETIREMENT_CONFIRMATION_REQUIRED", 400);
    if (correction.restoreArchivedRoster !== false) fail("Correction invitations cannot restore an archived original roster row.", "ROSTER_RESTORE_NOT_ALLOWED", 400);
    if (target.ownerUserId || member.archivedAt) fail("Correction requires an unowned original Player with an active club roster row.", "TARGET_UNAVAILABLE");
    if (!correction.reason.trim() || correction.reason.trim().length > 1000) fail("Provide a reason of 1 to 1000 characters.", "REASON_REQUIRED", 400);
    const source = await db.clubMember.findUnique({ where: { id: correction.sourceMemberId }, include: { player: true } });
    if (!source || source.clubId !== input.clubId || source.playerId !== correction.sourcePlayerId || source.player.ownerUserId !== recipientId || source.retiredByAdmissionEventId) fail("The selected duplicate no longer belongs to this recipient in this club.", "SOURCE_CHANGED");
    const checkedSource = requireValue(source, "The selected duplicate no longer belongs to this recipient in this club.", "SOURCE_CHANGED");
    await expirePlayerInvitationReservations(db, checkedSource.playerId, now);
    const [blockers, otherOwned] = await Promise.all([sourceBlockers(db, checkedSource.playerId, undefined, now), globalOwnedConflict(db, recipientId, checkedSource.playerId)]);
    if (blockers.length) fail(blockers.join(" "), "SOURCE_INELIGIBLE");
    if (otherOwned) fail("This account owns another nonretired Player; manual identity review is required.", "IDENTITY_CONFLICT");
  } else {
    const restore = input as CreateAccessRestoreInvitationInput & CreateInput;
    if (target.ownerUserId !== recipientId) fail("Access restore must be issued to the exact account that owns this Player.", "OWNER_MISMATCH");
    if (await globalOwnedConflict(db, recipientId, target.id)) fail(identityConflictMessage, "IDENTITY_CONFLICT");
    if (restore.restoreArchivedRoster !== !!member.archivedAt) fail(member.archivedAt ? "Explicitly confirm restoring this exact archived roster row." : "The selected roster row is already active; do not request an archived-roster restore.", "ROSTER_RESTORE_CONFIRMATION_REQUIRED", 400);
  }
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) fail("Provide a reason of 1 to 1000 characters.", "REASON_REQUIRED", 400);
  const before = await accountAccessSnapshot(db, input.clubId, recipientId);
  const requestedAction = input.authorizedAccessAction;
  const authorizedAccessAction = accessActionFor(before, requestedAction);
  const secret = newInvitationSecret();
  const invite = await db.playerInvitation.create({ data: {
    clubId: input.clubId, playerId: target.id, clubMemberId: member.id, createdByUserId: issuer.id,
    purpose, targetAccountUserId: recipientId,
    sourcePlayerId: purpose === "CORRECTION" ? (input as CreateCorrectionInvitationInput).sourcePlayerId : null,
    sourceMemberId: purpose === "CORRECTION" ? (input as CreateCorrectionInvitationInput).sourceMemberId : null,
    retireSourcePlayerId: purpose === "CORRECTION" ? (input as CreateCorrectionInvitationInput).retireSourcePlayerId : null,
    authorizedAccessAction, restoreArchivedRoster: input.restoreArchivedRoster,
    authorizationReason: reason, authorizerAccessId: issuerAccess.id, authorizerAccessRevision: issuerAccess.revision,
    ...recipientAccessColumns(before), tokenHash: hashInvitationSecret(secret), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
  } });
  return { purpose, invitation: invitationSummary(invite), secret };
}

function safeSnapshot(value: unknown): IdentityAccessSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as IdentityAccessSnapshot;
  if (!["NONE", "ACTIVE", "REVOKED"].includes(snapshot.status)) return null;
  return snapshot;
}

function safeSupersededRecoveryRequest(value: unknown): InvitationExecutionReceipt["supersededRecoveryRequest"] {
  if (!value || typeof value !== "object") return null;
  const superseded = value as NonNullable<InvitationExecutionReceipt["supersededRecoveryRequest"]>;
  if (typeof superseded.requestId !== "string" || !Number.isInteger(superseded.previousRevision)
    || !Number.isInteger(superseded.cancelledRevision) || typeof superseded.cancellationEventId !== "string"
    || typeof superseded.originInvitationId !== "string") return null;
  return {
    requestId: superseded.requestId, previousRevision: superseded.previousRevision,
    cancelledRevision: superseded.cancelledRevision, cancellationEventId: superseded.cancellationEventId,
    originInvitationId: superseded.originInvitationId,
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

async function executionParts(db: ReadDb, invite: PlayerInvitation) {
  const request = await db.clubAdmissionRequest.findFirst({ where: { originInvitationId: invite.id }, include: { events: { orderBy: { revision: "desc" } } } });
  const executionAction = invite.purpose === "CORRECTION" ? "EXECUTE_AUTHORIZED_CORRECTION" : "EXECUTE_AUTHORIZED_ACCESS_RESTORE";
  const execution = request?.events.find(event => event.action === executionAction) ?? null;
  const issuance = await db.playerInvitationEvent.findFirst({ where: { invitationId: invite.id, action: executionAction === "EXECUTE_AUTHORIZED_CORRECTION" ? "CORRECTION_RETIRE_AUTHORIZED" : "ACCESS_RESTORE_AUTHORIZED" }, orderBy: { createdAt: "asc" } });
  return { request, execution, issuance };
}

/** Return only the immutable completed receipt; this function never grants access. */
export async function invitationExecutionReceipt(db: ReadDb, invite: PlayerInvitation): Promise<InvitationExecutionReceipt | null> {
  if (invite.purpose === "CLAIM") return null;
  const { request, execution, issuance } = await executionParts(db, invite);
  if (!request || request.status !== "APPROVED" || !execution || !issuance) return null;
  const details = parseJsonObject(execution.detailsJson);
  const before = safeSnapshot(details.accessBefore);
  const after = safeSnapshot(details.accessAfter);
  const superseded = safeSupersededRecoveryRequest(details.supersededRecoveryRequest);
  if (!before || !after) return null;
  if (details.supersededRecoveryRequest !== undefined && details.supersededRecoveryRequest !== null && !superseded) return null;
  return {
    requestId: request.id, purpose: invite.purpose as AuthorizedPurpose,
    actorAccountId: execution.actorUserId ?? request.requesterUserId,
    authorizedByAccountId: execution.authorizedByUserId ?? invite.createdByUserId,
    authorizedAt: issuance.createdAt.toISOString(), confirmedAt: execution.createdAt.toISOString(),
    clubId: invite.clubId, targetPlayerId: invite.playerId, sourcePlayerId: invite.sourcePlayerId,
    destination: destinationFor(invite.clubId),
    accessOutcome: details.accessOutcome as InvitationExecutionReceipt["accessOutcome"],
    accessBefore: before, accessAfter: after,
    rosterOutcome: details.rosterOutcome as InvitationExecutionReceipt["rosterOutcome"],
    sourceRetired: details.sourceRetired === true,
    supersededRecoveryRequest: superseded,
  };
}

function genericContext(status: "ACCOUNT_REQUIRED" | "WRONG_ACCOUNT" | "CONTINUATION_REQUIRED" | "UNAVAILABLE", message: string) {
  return { status, message } as const;
}

type PendingInvitationRequest = {
  id: string;
  revision: number;
  kind: string;
  requestedPlayerId: string | null;
  originInvitationId: string | null;
};

async function pendingInvitationRequests(db: ReadDb, invite: PlayerInvitation, userId: string): Promise<PendingInvitationRequest[]> {
  return db.clubAdmissionRequest.findMany({
    where: { clubId: invite.clubId, requesterUserId: userId, status: "PENDING" },
    select: { id: true, revision: true, kind: true, requestedPlayerId: true, originInvitationId: true },
    orderBy: { createdAt: "asc" },
  });
}

async function supersedableRecoveryRequest(
  db: ReadDb,
  invite: PlayerInvitation,
  requests: PendingInvitationRequest[],
  now: Date,
): Promise<SupersedableRecoveryRequest | null> {
  if (requests.length !== 1) return null;
  const request = requests[0];
  if (request.kind !== "EXISTING_PLAYER" || request.requestedPlayerId !== invite.playerId || !request.originInvitationId || request.originInvitationId === invite.id) return null;
  const old = await db.playerInvitation.findUnique({ where: { id: request.originInvitationId }, select: { id: true, clubId: true, playerId: true, purpose: true, status: true, expiresAt: true, revocationReason: true } });
  if (!old || old.purpose !== "CLAIM" || old.clubId !== invite.clubId || old.playerId !== invite.playerId) return null;
  const availability = old.status === "EXPIRED" || (old.status === "ACTIVE" && old.expiresAt <= now)
    ? "EXPIRED"
    : old.status === "REVOKED" ? (old.revocationReason === "REPLACED" ? "REPLACED" : "REVOKED") : null;
  if (!availability) return null;
  return { requestId: request.id, revision: request.revision, originInvitationId: old.id, invitationAvailability: availability };
}

/** Purpose-aware recipient context. Wrong-account responses contain no identity data. */
export async function authorizedInvitationContext(db: ReadDb, invitationId: string, handle: string | undefined, userId: string | null, now = new Date()) {
  if (!userId) return genericContext("ACCOUNT_REQUIRED", "Sign in with the invited account to continue.");
  const invite = await db.playerInvitation.findUnique({ where: { id: invitationId } });
  if (!invite || invite.purpose === "CLAIM") return genericContext("UNAVAILABLE", "This invitation is unavailable.");
  if (invite.targetAccountUserId !== userId) return genericContext("WRONG_ACCOUNT", "Switch to the exact account that was invited, or ask the issuing admin for help.");
  const recipient = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, isActive: true } });
  if (!recipient?.isActive) return genericContext("ACCOUNT_REQUIRED", "An active invited account is required.");
  if (invite.status === "REDEEMED" && invite.redeemedByUserId === userId) {
    const completedReceipt = await invitationExecutionReceipt(db, invite);
    if (completedReceipt) {
      const [target, source, club, issuer, issuance, targetHistory] = await Promise.all([
        db.player.findUnique({ where: { id: invite.playerId }, include: { clubMemberships: { where: { id: invite.clubMemberId }, take: 1 } } }),
        invite.sourcePlayerId ? db.player.findUnique({ where: { id: invite.sourcePlayerId }, include: { clubMemberships: { where: { id: invite.sourceMemberId ?? "" }, take: 1 } } }) : null,
        db.club.findUnique({ where: { id: invite.clubId }, select: { id: true, name: true } }),
        db.user.findUnique({ where: { id: invite.createdByUserId }, select: { name: true } }),
        db.playerInvitationEvent.findFirst({ where: { invitationId: invite.id, action: invite.purpose === "CORRECTION" ? "CORRECTION_RETIRE_AUTHORIZED" : "ACCESS_RESTORE_AUTHORIZED" }, orderBy: { createdAt: "asc" } }),
        historySummary(db, invite.playerId),
      ]);
      const targetMember = target?.clubMemberships[0] ?? null;
      if (!target || !targetMember || !club) return genericContext("UNAVAILABLE", "The completed invitation receipt is unavailable.");
      const sourceMember = source?.clubMemberships[0] ?? null;
      return {
        status: "MATCHED", invitationId: invite.id, purpose: invite.purpose as AuthorizedPurpose, expiresAt: invite.expiresAt.toISOString(),
        recipient: { accountId: recipient.id, accountRef: accountRef(recipient.id), displayName: recipient.name },
        authorizedBy: { accountId: invite.createdByUserId, displayName: issuer?.name ?? "Club administrator", authorizedAt: issuance?.createdAt.toISOString() ?? completedReceipt.authorizedAt },
        club: { id: club.id, name: club.name },
        target: { playerId: target.id, name: target.name, rating: targetMember.elo, isActive: target.isActive, member: memberSnapshot(targetMember), history: targetHistory },
        source: source && sourceMember ? { playerId: source.id, name: source.name, rating: sourceMember.elo, isActive: source.isActive, member: memberSnapshot(sourceMember)!, clubAccess: await accountAccessSnapshot(db, invite.clubId, userId), history: await historySummary(db, source.id, []) } : null,
        authorizedAccessAction: invite.authorizedAccessAction as AuthorizedAccessAction,
        restoreArchivedRoster: invite.restoreArchivedRoster, reason: invite.authorizationReason ?? "", completedReceipt,
        supersedableRecoveryRequest: null,
      } satisfies AuthorizedInvitationContext;
    }
  }
  if (invite.status !== "ACTIVE" || invite.expiresAt <= now) return genericContext("UNAVAILABLE", "This invitation is no longer available. Ask the issuing admin for a replacement.");
  try { await continuationInvitation(db as Db, invitationId, handle, now); }
  catch (error) {
    if (error instanceof PlayerInvitationError && error.code === "CONTINUATION_REQUIRED") return genericContext("CONTINUATION_REQUIRED", error.message);
    return genericContext("UNAVAILABLE", "This invitation is no longer available. Ask the issuing admin for a replacement.");
  }
  const [issuerAuthority, target, club, source, issuance] = await Promise.all([
    db.clubAccess.findUnique({ where: { id: invite.authorizerAccessId ?? "" } }),
    db.player.findUnique({ where: { id: invite.playerId }, include: { clubMemberships: { where: { id: invite.clubMemberId }, take: 1 } } }),
    db.club.findUnique({ where: { id: invite.clubId }, select: { id: true, name: true } }),
    invite.sourcePlayerId ? db.player.findUnique({ where: { id: invite.sourcePlayerId }, include: { clubMemberships: { where: { id: invite.sourceMemberId ?? "" }, take: 1 } } }) : null,
    db.playerInvitationEvent.findFirst({ where: { invitationId: invite.id, action: invite.purpose === "CORRECTION" ? "CORRECTION_RETIRE_AUTHORIZED" : "ACCESS_RESTORE_AUTHORIZED" }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!issuerAuthority || issuerAuthority.userId !== invite.createdByUserId || issuerAuthority.clubId !== invite.clubId || issuerAuthority.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(issuerAuthority.role) || issuerAuthority.revision !== invite.authorizerAccessRevision) return genericContext("UNAVAILABLE", "The issuing administrator's authority has changed. Ask for a new invitation.");
  if (!target || !club || target.clubMemberships.length !== 1 || !target.clubMemberships[0]) return genericContext("UNAVAILABLE", "The selected profile is no longer available.");
  if (invite.purpose === "CORRECTION" && (!source || source.clubMemberships.length !== 1 || !source.clubMemberships[0])) return genericContext("UNAVAILABLE", "The duplicate profile is no longer available.");
  const [targetHistory, sourceDetails] = await Promise.all([
    historySummary(db, target.id),
    source ? sourceBlockers(db, source.id, invite.id) : Promise.resolve([]),
  ]);
  const sourceHistory = source ? await historySummary(db, source.id, sourceDetails) : null;
  const [recipientAccess, pendingRequests] = await Promise.all([
    accountAccessSnapshot(db, invite.clubId, userId),
    pendingInvitationRequests(db, invite, userId),
  ]);
  if (recipientAccess.status !== invite.recipientAccessStatus || recipientAccess.accessId !== invite.recipientAccessId || recipientAccess.role !== invite.recipientAccessRole || recipientAccess.revision !== invite.recipientAccessRevision) return genericContext("UNAVAILABLE", "Your club access changed after this invitation was issued. Ask for a new invitation.");
  const supersedable = await supersedableRecoveryRequest(db, invite, pendingRequests, now);
  return {
    status: "MATCHED", invitationId: invite.id, purpose: invite.purpose as AuthorizedPurpose, expiresAt: invite.expiresAt.toISOString(),
    recipient: { accountId: recipient.id, accountRef: accountRef(recipient.id), displayName: recipient.name },
    authorizedBy: { accountId: invite.createdByUserId, displayName: (await db.user.findUnique({ where: { id: invite.createdByUserId }, select: { name: true } }))?.name ?? "Club administrator", authorizedAt: issuance?.createdAt.toISOString() ?? invite.createdAt.toISOString() },
    club: { id: club.id, name: club.name },
    target: { playerId: target.id, name: target.name, rating: target.clubMemberships[0].elo, isActive: target.isActive, member: memberSnapshot(target.clubMemberships[0]), history: targetHistory },
    source: source && source.clubMemberships[0] ? { playerId: source.id, name: source.name, rating: source.clubMemberships[0].elo, isActive: source.isActive, member: memberSnapshot(source.clubMemberships[0])!, clubAccess: await accountAccessSnapshot(db, invite.clubId, userId), history: sourceHistory! } : null,
    authorizedAccessAction: invite.authorizedAccessAction as AuthorizedAccessAction,
    restoreArchivedRoster: invite.restoreArchivedRoster, reason: invite.authorizationReason ?? "", completedReceipt: null,
    supersedableRecoveryRequest: supersedable,
  } satisfies AuthorizedInvitationContext;
}

function sameRecipientSnapshot(invite: PlayerInvitation, current: IdentityAccessSnapshot) {
  return current.status === invite.recipientAccessStatus && current.accessId === invite.recipientAccessId
    && current.role === invite.recipientAccessRole && current.revision === invite.recipientAccessRevision;
}

async function currentAuthorizer(db: Db, invite: PlayerInvitation) {
  const [account, access] = await Promise.all([
    db.user.findUnique({ where: { id: invite.createdByUserId }, select: { isActive: true } }),
    invite.authorizerAccessId ? db.clubAccess.findUnique({ where: { id: invite.authorizerAccessId } }) : null,
  ]);
  if (!account?.isActive) {
    fail("The issuing administrator's authority changed. Ask for a new invitation.", "AUTHORIZER_CHANGED");
  }
  const checkedAccess = requireValue(access, "The issuing administrator's authority changed. Ask for a new invitation.", "AUTHORIZER_CHANGED");
  if (checkedAccess.userId !== invite.createdByUserId || checkedAccess.clubId !== invite.clubId
    || checkedAccess.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(checkedAccess.role) || checkedAccess.revision !== invite.authorizerAccessRevision) {
    fail("The issuing administrator's authority changed. Ask for a new invitation.", "AUTHORIZER_CHANGED");
  }
  return checkedAccess;
}

function validateAccessBefore(invite: PlayerInvitation, snapshot: IdentityAccessSnapshot) {
  if (!sameRecipientSnapshot(invite, snapshot)) fail("Your club access changed after authorization. Ask the issuing admin to review it again.", "RECIPIENT_ACCESS_CHANGED");
  const required = snapshot.status === "ACTIVE" ? "PRESERVE_ACTIVE" : snapshot.status === "NONE" ? "GRANT_MEMBER" : "RESTORE_MEMBER";
  if (invite.authorizedAccessAction !== required) fail("The authorized access action no longer matches your current access.", "RECIPIENT_ACCESS_CHANGED");
}

async function revalidateCorrection(db: Db, invite: PlayerInvitation, userId: string, now: Date) {
  if (invite.sourcePlayerId) await expirePlayerInvitationReservations(db, invite.sourcePlayerId, now);
  const [targetValue, sourceMemberValue, sourcePlayerValue, blockers, otherOwned] = await Promise.all([
    db.player.findUnique({ where: { id: invite.playerId }, include: { clubMemberships: { where: { id: invite.clubMemberId }, take: 1 } } }),
    invite.sourceMemberId ? db.clubMember.findUnique({ where: { id: invite.sourceMemberId } }) : null,
    invite.sourcePlayerId ? db.player.findUnique({ where: { id: invite.sourcePlayerId } }) : null,
    invite.sourcePlayerId ? sourceBlockers(db, invite.sourcePlayerId, invite.id, now) : Promise.resolve(["The selected duplicate is missing."]),
    invite.sourcePlayerId ? globalOwnedConflict(db, userId, invite.sourcePlayerId) : Promise.resolve(null),
  ]);
  const target = requireValue(targetValue, "The original Player is no longer available for correction.", "TARGET_CHANGED");
  const targetMember = requireValue(target.clubMemberships[0], "The original Player is no longer available for correction.", "TARGET_CHANGED");
  const sourceMember = requireValue(sourceMemberValue, "The bound duplicate profile changed.", "SOURCE_CHANGED");
  const sourcePlayer = requireValue(sourcePlayerValue, "The bound duplicate profile changed.", "SOURCE_CHANGED");
  if (target.ownerUserId || !target.isActive || targetMember.archivedAt || targetMember.retiredByAdmissionEventId) fail("The original Player is no longer available for correction.", "TARGET_CHANGED");
  if (sourceMember.clubId !== invite.clubId || sourceMember.playerId !== invite.sourcePlayerId || sourceMember.retiredByAdmissionEventId
    || sourcePlayer.ownerUserId !== userId || invite.retireSourcePlayerId !== invite.sourcePlayerId) fail("The bound duplicate profile changed.", "SOURCE_CHANGED");
  if (blockers.length) fail(blockers.join(" "), "SOURCE_INELIGIBLE");
  if (otherOwned) fail("This account owns another nonretired Player; manual identity review is required.", "IDENTITY_CONFLICT");
  return { target, targetMember, sourceMember, sourcePlayer };
}

async function revalidateAccessRestore(db: Db, invite: PlayerInvitation, userId: string) {
  const { target, member } = await targetForClub(db, invite.clubId, invite.playerId);
  if (target.ownerUserId !== userId || !target.isActive) fail("The exact owned Player is no longer available for access restore.", "TARGET_CHANGED");
  if (await globalOwnedConflict(db, userId, target.id)) fail(identityConflictMessage, "IDENTITY_CONFLICT");
  if (invite.restoreArchivedRoster !== !!member.archivedAt) fail("The exact roster row changed after authorization.", "ROSTER_CHANGED");
  return { target, member };
}

function expectedAfter(before: IdentityAccessSnapshot, action: AuthorizedAccessAction, newId: string | null): IdentityAccessSnapshot {
  if (action === "PRESERVE_ACTIVE") return before;
  if (action === "GRANT_MEMBER") return { accessId: newId, status: "ACTIVE", role: "MEMBER", revision: 0 };
  return { accessId: before.accessId, status: "ACTIVE", role: "MEMBER", revision: (before.revision ?? 0) + 1 };
}

/** The shared transactional engine for the recipient's one-time purpose confirmation. */
export async function confirmAuthorizedInvitation(db: Db, purpose: AuthorizedPurpose, input: { invitationId: string; handle?: string; userId: string; supersedeRecoveryRequest?: SupersedeRecoveryRequestInput; now?: Date }) {
  const now = input.now ?? new Date();
  const invite = requireValue(await db.playerInvitation.findUnique({ where: { id: input.invitationId } }), "This invitation is unavailable for that confirmation action.", "PURPOSE_MISMATCH", 410);
  if (invite.purpose !== purpose) fail("This invitation is unavailable for that confirmation action.", "PURPOSE_MISMATCH", 410);
  if (invite.targetAccountUserId !== input.userId) fail("Switch to the exact account that was invited.", "WRONG_ACCOUNT", 403);
  const recipient = requireValue(await db.user.findUnique({ where: { id: input.userId }, select: { isActive: true } }), "An active invited account is required.", "ACCOUNT_REQUIRED", 403);
  if (!recipient.isActive) fail("An active invited account is required.", "ACCOUNT_REQUIRED", 403);
  if (invite.status === "REDEEMED" && invite.redeemedByUserId === input.userId) {
    const receipt = await invitationExecutionReceipt(db, invite);
    if (receipt) return { receipt };
  }
  if (invite.status !== "ACTIVE" || invite.expiresAt <= now) fail("This invitation is no longer available. Ask the issuing admin for a replacement.", "INVITATION_UNAVAILABLE", 410);
  await continuationInvitation(db, invite.id, input.handle, now);
  if (invite.createdByUserId === input.userId) fail("The issuing administrator cannot confirm their own invitation.", "SELF_APPROVAL", 403);
  const authorizer = await currentAuthorizer(db, invite);
  const before = await accountAccessSnapshot(db, invite.clubId, input.userId);
  validateAccessBefore(invite, before);
  const sourceCheck = purpose === "CORRECTION" ? await revalidateCorrection(db, invite, input.userId, now) : null;
  const restoreCheck = purpose === "ACCESS_RESTORE" ? await revalidateAccessRestore(db, invite, input.userId) : null;
  const target = purpose === "CORRECTION"
    ? requireValue(sourceCheck, "The duplicate profile is no longer available.", "SOURCE_CHANGED").target
    : requireValue(restoreCheck, "The owned Player is no longer available.", "TARGET_CHANGED").target;
  const targetMember = purpose === "CORRECTION"
    ? requireValue(sourceCheck, "The duplicate profile is no longer available.", "SOURCE_CHANGED").targetMember
    : requireValue(restoreCheck, "The owned Player is no longer available.", "TARGET_CHANGED").member;
  const existingPending = await db.clubAdmissionRequest.findFirst({ where: { clubId: invite.clubId, requesterUserId: input.userId, status: "PENDING" } });
  const pendingRequests = await pendingInvitationRequests(db, invite, input.userId);
  let supersededRecoveryRequest: InvitationExecutionReceipt["supersededRecoveryRequest"] = null;
  if (existingPending) {
    const candidate = requireValue(
      await supersedableRecoveryRequest(db, invite, pendingRequests, now),
      "Resolve your existing pending club request before confirming this invitation.",
      "PENDING_REQUEST_CONFLICT",
    );
    const supersedeConsent = requireValue(
      input.supersedeRecoveryRequest,
      "Explicitly confirm cancellation of the unavailable invitation's pending recovery request.",
      "PENDING_REQUEST_SUPERSEDE_REQUIRED",
    );
    if (supersedeConsent.requestId !== candidate.requestId || supersedeConsent.revision !== candidate.revision) fail("The pending recovery request changed. Refresh before confirming.", "PENDING_REQUEST_CHANGED");
    const { reviewInvitationRecovery } = await import("./playerInvitationRecovery");
    const cancelled = await reviewInvitationRecovery(db, {
      clubId: invite.clubId, requestId: candidate.requestId, reviewerUserId: input.userId,
      action: "CANCEL", revision: candidate.revision,
      reason: `Superseded by authorized invitation ${invite.id}`,
      supersededByInvitationId: invite.id,
    });
    if (cancelled.status !== "CANCELLED" || cancelled.revision !== candidate.revision + 1 || cancelled.originInvitationId !== candidate.originInvitationId) fail("The pending recovery request changed before cancellation.", "PENDING_REQUEST_CHANGED");
    const cancellationEvent = requireValue(
      await db.clubAdmissionEvent.findUnique({ where: { admissionRequestId_revision: { admissionRequestId: candidate.requestId, revision: cancelled.revision } } }),
      "The pending recovery cancellation could not be verified.",
      "PENDING_REQUEST_CHANGED",
    );
    if (cancellationEvent.action !== "CANCEL" || cancellationEvent.actorUserId !== input.userId) fail("The pending recovery cancellation could not be verified.", "PENDING_REQUEST_CHANGED");
    supersededRecoveryRequest = {
      requestId: candidate.requestId, previousRevision: candidate.revision,
      cancelledRevision: cancelled.revision, cancellationEventId: cancellationEvent.id,
      originInvitationId: candidate.originInvitationId,
    };
  } else if (input.supersedeRecoveryRequest) {
    fail("The pending recovery request changed. Refresh before confirming.", "PENDING_REQUEST_CHANGED");
  }
  await expirePlayerInvitationReservations(db, invite.playerId, now);
  const action = invite.authorizedAccessAction as AuthorizedAccessAction;
  const grantAccessId = before.status === "NONE" ? randomUUID() : null;
  const afterExpected = expectedAfter(before, action, grantAccessId);
  const rosterOutcome = purpose === "ACCESS_RESTORE" && invite.restoreArchivedRoster ? "UNARCHIVED_EXISTING" : "UNCHANGED";
  const details = {
    originInvitationId: invite.id, targetPlayerId: invite.playerId,
    sourcePlayerId: invite.sourcePlayerId, sourceMemberId: invite.sourceMemberId,
    retireSourcePlayerId: invite.retireSourcePlayerId, reason: invite.authorizationReason,
    authorizedAccessAction: action, restoreArchivedRoster: invite.restoreArchivedRoster,
    supersededRecoveryRequest,
    accessOutcome: action === "PRESERVE_ACTIVE" ? "PRESERVED_ACTIVE" : action === "GRANT_MEMBER" ? "GRANTED_MEMBER" : "RESTORED_MEMBER",
    accessBefore: before, accessAfter: afterExpected, accessAfterId: afterExpected.accessId,
    accessAfterRole: afterExpected.role, accessAfterStatus: afterExpected.status, accessAfterRevision: afterExpected.revision,
    rosterOutcome, sourceRetired: purpose === "CORRECTION",
  };
  const request = await db.clubAdmissionRequest.create({ data: {
    clubId: invite.clubId, requesterUserId: input.userId, kind: "EXISTING_PLAYER", status: "PENDING",
    requestedPlayerId: invite.playerId, originInvitationId: invite.id, note: invite.authorizationReason,
  } });
  const claimed = await db.clubAdmissionRequest.updateMany({ where: { id: request.id, status: "PENDING", revision: 0 }, data: { revision: 1 } });
  if (claimed.count !== 1) fail("The execution receipt changed before confirmation.", "INVITATION_CHANGED");
  const eventAction = purpose === "CORRECTION" ? "EXECUTE_AUTHORIZED_CORRECTION" : "EXECUTE_AUTHORIZED_ACCESS_RESTORE";
  const event = await db.clubAdmissionEvent.create({ data: {
    admissionRequestId: request.id, actorUserId: input.userId, authorizedByUserId: invite.createdByUserId,
    action: eventAction, revision: 1, detailsJson: JSON.stringify(details),
  } });
  const consumed = await db.playerInvitation.updateMany({
    where: { id: invite.id, status: "ACTIVE", expiresAt: { gt: now }, targetAccountUserId: input.userId },
    data: { status: "REDEEMED", redeemedByUserId: input.userId, redeemedAt: now },
  });
  if (consumed.count !== 1) fail("The invitation changed before confirmation.", "INVITATION_CHANGED");
  if (purpose === "CORRECTION") {
    const source = sourceCheck!;
    if (!source.sourceMember.archivedAt) await db.clubMember.update({ where: { id: source.sourceMember.id }, data: { archivedAt: now } });
    await db.$executeRaw`UPDATE "User" SET "isActive"=0 WHERE "id"=${source.sourcePlayer.id} AND "ownerUserId"=${input.userId}`;
    const retired = await db.clubMember.updateMany({ where: { id: source.sourceMember.id, retiredByAdmissionEventId: null, archivedAt: { not: null } }, data: { retiredByAdmissionEventId: event.id } });
    if (retired.count !== 1) fail("The selected duplicate changed before retirement.", "SOURCE_CHANGED");
  }
  if (target.ownerUserId === null) await linkUnownedPlayer(db, target.id, input.userId);
  if (purpose === "ACCESS_RESTORE" && invite.restoreArchivedRoster && targetMember.archivedAt) {
    const restored = await db.clubMember.updateMany({ where: { id: targetMember.id, archivedAt: { not: null }, retiredByAdmissionEventId: null }, data: { archivedAt: null } });
    if (restored.count !== 1) fail("The selected roster row changed before restoration.", "ROSTER_CHANGED");
  }
  if (action === "GRANT_MEMBER") await db.clubAccess.create({ data: { id: grantAccessId!, clubId: invite.clubId, userId: input.userId, status: "ACTIVE", role: "MEMBER" } });
  else if (action === "RESTORE_MEMBER") {
    const accessId = requireValue(before.accessId, "The revoked access record is unavailable.", "RECIPIENT_ACCESS_CHANGED");
    const revision = requireValue(before.revision, "The revoked access record is unavailable.", "RECIPIENT_ACCESS_CHANGED");
    const restored = await db.clubAccess.updateMany({ where: { id: accessId, clubId: invite.clubId, userId: input.userId, status: "REVOKED", revision }, data: { role: "MEMBER", status: "ACTIVE" } });
    if (restored.count !== 1) fail("Your club access changed during confirmation.", "RECIPIENT_ACCESS_CHANGED");
  }
  const after = await accountAccessSnapshot(db, invite.clubId, input.userId);
  if (JSON.stringify(after) !== JSON.stringify(afterExpected)) fail("The access result changed during confirmation.", "RECIPIENT_ACCESS_CHANGED");
  const stillPending = await db.clubAdmissionRequest.findFirst({ where: { id: { not: request.id }, clubId: invite.clubId, requesterUserId: input.userId, status: "PENDING" } });
  if (stillPending) fail("Resolve the pending club request before completing this invitation.", "PENDING_REQUEST_CONFLICT");
  const finalized = await db.clubAdmissionRequest.updateMany({
    where: { id: request.id, status: "PENDING", revision: 1 },
    data: { status: "APPROVED", revision: 1, approvedPlayerId: invite.playerId,
      decision: eventAction, reviewedByUserId: authorizer.userId, reviewedAt: now },
  });
  if (finalized.count !== 1) fail("The execution receipt changed before it could be finalized.", "INVITATION_CHANGED");
  const approved = requireValue(await db.playerInvitation.findUnique({ where: { id: invite.id } }), "The invitation receipt is unavailable.", "INVITATION_UNAVAILABLE", 410);
  const receipt = await invitationExecutionReceipt(db, approved);
  if (!receipt) fail("The completed invitation receipt could not be verified.", "RECEIPT_INVALID");
  return { receipt };
}
