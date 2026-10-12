import type { ClubAdmissionRequest, PlayerInvitation, Prisma, PrismaClient } from "@prisma/client";
import { admissionInclude, type ReviewAdmission } from "./clubAdmissions";
import { PlayerInvitationError } from "./playerInvitations";
import type { InvitationAvailability, RecoveryEligibility, RecoveryStatus } from "@/types/playerRecovery";

type Db = Prisma.TransactionClient;
type ReadDb = Db | PrismaClient;
function throwLegacyRecoveryDisabled(): never {
  throw new PlayerInvitationError("Ask the club admin to remove and disconnect the other profile in this club, then send a normal claim invitation.", "LEGACY_IDENTITY_FLOW_DISABLED", 410);
}
export function invitationAvailability(invite: Pick<PlayerInvitation, "status" | "revocationReason" | "expiresAt"> | null, now = new Date()): InvitationAvailability {
  if (!invite) return "UNAVAILABLE";
  if (invite.status === "REVOKED") return invite.revocationReason === "REPLACED" ? "REPLACED" : "REVOKED";
  if (invite.status === "REDEEMED") return "REDEEMED";
  if (invite.status === "EXPIRED" || invite.expiresAt <= now) return "EXPIRED";
  return invite.status === "ACTIVE" ? "ACTIVE" : "UNAVAILABLE";
}

export async function recoveryEligibility(db: ReadDb, request: ClubAdmissionRequest, now = new Date()): Promise<RecoveryEligibility> {
  const invite = request.originInvitationId ? await db.playerInvitation.findUnique({ where: { id: request.originInvitationId } }) : null;
  return { invitationAvailability: invitationAvailability(invite, now), needsAccessRestore: false, duplicate: null,
    blockers: ["This historical recovery flow is closed. Ask the club admin for a normal claim invitation."], canApprove: false };
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

export async function submitInvitationRecovery(db: Db, input: { invitationId: string; handle?: string; userId: string; idempotencyKey: string; note?: string; now?: Date }): Promise<RecoveryStatus> {
  return throwLegacyRecoveryDisabled();
}

export async function reviewInvitationRecovery(db: Db, input: ReviewAdmission): Promise<Prisma.ClubAdmissionRequestGetPayload<{ include: typeof admissionInclude }>> {
  return throwLegacyRecoveryDisabled();
}
