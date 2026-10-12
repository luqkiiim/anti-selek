import type { PlayerInvitation, Prisma, PrismaClient } from "@prisma/client";
import { PlayerInvitationError } from "@/lib/playerInvitations";
import type { AuthorizedAccessAction, AuthorizedInvitationContext, CreateAccessRestoreInvitationInput, CreateAuthorizedInvitationResponse, CreateCorrectionInvitationInput, IdentityAccessSnapshot, IdentityHistorySummary, IdentityMemberSnapshot, IdentityOptionsResponse, InvitationExecutionReceipt, PlayerInvitationPurpose, SupersedeRecoveryRequestInput } from "@/types/playerRecovery";
type Db = Prisma.TransactionClient;
type ReadDb = Db | PrismaClient;
type AuthorizedPurpose = Exclude<PlayerInvitationPurpose, "CLAIM">;
type CreateInput = (CreateCorrectionInvitationInput | CreateAccessRestoreInvitationInput) & { clubId: string; targetPlayerId: string; issuerAccountId: string };
const destinationFor = (clubId: string) => `/club/${encodeURIComponent(clubId)}?tab=profile`;
const accountRef = (id: string) => `Account ·${id.slice(-6)}`;


function legacyFlowDisabled(): never {
  throw new PlayerInvitationError("Use a normal claim invitation after removing and disconnecting the other profile in this club.", "LEGACY_IDENTITY_FLOW_DISABLED", 410);
}

function accessSnapshot(access: { id: string; role: string; status: string; revision: number } | null): IdentityAccessSnapshot {
  if (!access) return { accessId: null, status: "NONE", role: null, revision: null };
  return { accessId: access.id, status: access.status as "ACTIVE" | "REVOKED", role: access.role as IdentityAccessSnapshot["role"], revision: access.revision };
}

function memberSnapshot(member: { id: string; archivedAt: Date | null; retiredByAdmissionEventId: string | null } | null): IdentityMemberSnapshot | null {
  return member ? { memberId: member.id, archivedAt: member.archivedAt?.toISOString() ?? null, retiredByAdmissionEventId: member.retiredByAdmissionEventId } : null;
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

async function accountAccessSnapshot(db: ReadDb, clubId: string, accountId: string) {
  return accessSnapshot(await db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: accountId } } }));
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

export async function identityOptions(db: ReadDb, input: { clubId: string; targetPlayerId: string; issuerAccountId: string; purpose: AuthorizedPurpose; now?: Date }): Promise<IdentityOptionsResponse> {
  return legacyFlowDisabled();
}

export async function createAuthorizedInvitation(db: Db, purpose: AuthorizedPurpose, input: CreateInput, now = new Date()): Promise<CreateAuthorizedInvitationResponse> {
  return legacyFlowDisabled();
}

export async function confirmAuthorizedInvitation(db: Db, purpose: AuthorizedPurpose, input: { invitationId: string; handle?: string; userId: string; supersedeRecoveryRequest?: SupersedeRecoveryRequestInput; now?: Date }): Promise<{ receipt: InvitationExecutionReceipt }> {
  return legacyFlowDisabled();
}

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
  return genericContext("UNAVAILABLE", "This old invitation is no longer supported. Ask the club admin for a normal claim invitation.");
}
