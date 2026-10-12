import type { Prisma, PrismaClient } from "@prisma/client";
import { ClubAdmissionError } from "./clubAdmissions";
import { removeClubPlayerOwnership } from "./clubPlayerOwnership";

type Db = Prisma.TransactionClient | PrismaClient;
export class PlayerReleaseError extends ClubAdmissionError {
  constructor(message: string, readonly code = "PLAYER_RELEASE_BLOCKED", status = 409) { super(message, status); }
}
async function localAdmin(db: Db, clubId: string, actorUserId: string) {
  const [account, access, club] = await Promise.all([
    db.user.findUnique({ where: { id: actorUserId }, select: { isActive: true } }),
    db.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: actorUserId } } }),
    db.club.findUnique({ where: { id: clubId }, select: { isTutorial: true } }),
  ]);
  if (!account?.isActive || !club || club.isTutorial || access?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(access.role))
    throw new PlayerReleaseError("Active club admin access required.", "ADMIN_REQUIRED", 403);
}
export async function removedOwnedPlayers(db: Db, clubId: string, actorUserId: string) {
  await localAdmin(db, clubId, actorUserId);
  const members = await db.clubMember.findMany({
    where: { clubId, archivedAt: { not: null }, retiredByAdmissionEventId: null, ownerUserId: { not: null } },
    select: { player: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" },
  });
  return { players: members.map(m => m.player) };
}
/** Disconnect this club's retained removed link; other clubs are untouched. */
export async function disconnectRemovedPlayer(db: Prisma.TransactionClient, input: { clubId: string; playerId: string; actorUserId: string }) {
  return removeClubPlayerOwnership(db, { ...input, mode: "DISCONNECT" });
}
export async function claimReleaseAuthorization(db: Prisma.TransactionClient, invitationId: string, userId: string) {
  const rows = await db.$queryRaw<Array<{ releaseId: string }>>`SELECT "releaseId" FROM "ClaimReleaseAuthorization" WHERE "invitationId"=${invitationId} AND "recipientUserId"=${userId} ORDER BY "releaseId" LIMIT 1`;
  return rows[0]?.releaseId ?? null;
}
/** Old global claim receipts are immutable and cannot authorize new grants. */
export async function recordReleaseClaim(_db: Prisma.TransactionClient, _releaseId: string, _invitationId: string, _userId: string): Promise<never> {
  throw new PlayerReleaseError("Global release receipts are closed. Use the local ownership event.", "LEGACY_IDENTITY_WRITER_CLOSED", 410);
}
