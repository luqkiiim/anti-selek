import type { PrismaClient } from "@prisma/client";
import { clubOwnershipTransaction } from "./clubPlayerOwnership";

const blockers: Record<string, string> = {
  TUTORIAL: "Use the playground controls for this club.",
  SESSION_HISTORY: "This club has sessions or shared session history and cannot be deleted.",
  ADMISSION_HISTORY: "This club has admission history that must be retained and cannot be deleted.",
  INVITATION_HISTORY: "This club has Player invitation history that must be retained and cannot be deleted.",
  OTHER_MEMBERS: "This club has profiles connected to other accounts and cannot be deleted.",
  ACCESS_HISTORY: "This club has access for other accounts and cannot be deleted.",
  OWNERSHIP_HISTORY: "This club has player ownership history beyond its initial setup and cannot be deleted.",
  SHARED_PROFILE: "This club's player profile is shared with another club and cannot be deleted.",
  RATING_HISTORY: "This club has rating history and cannot be deleted.",
  PROFILE_HISTORY: "This club's player profile has linked history and cannot be deleted.",
  LINKED_HISTORY: "This club has linked history that must be retained and cannot be deleted.",
};

export class ClubDeletionError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message);
    this.name = "ClubDeletionError";
  }
}

/** Reserve the writer before authority/eligibility reads so activity and deletion
 * cannot both commit against an earlier, empty-club snapshot. */
export async function deleteUnusedClub(db: PrismaClient, input: {
  clubId: string; actorUserId: string; isGlobalAdmin: boolean;
}) {
  return clubOwnershipTransaction(db, async tx => {
    const account = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { isActive: true } });
    if (!account?.isActive) throw new ClubDeletionError("Not authorized", 404, "INVALID_TARGET");

    const club = await tx.club.findUnique({ where: { id: input.clubId }, select: { id: true, isTutorial: true } });
    if (!club) {
      const receipt = await tx.clubDeletionReceipt.findUnique({ where: { clubId: input.clubId } });
      if (receipt && (receipt.actorUserId === input.actorUserId || receipt.creatorUserId === input.actorUserId || input.isGlobalAdmin)) return;
      throw new ClubDeletionError("Club not found", 404, "INVALID_TARGET");
    }
    const access = await tx.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.actorUserId } } });
    if (!input.isGlobalAdmin && (access?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(access.role))) {
      throw new ClubDeletionError("Not authorized", 404, "INVALID_TARGET");
    }

    const reasons = await tx.$queryRaw<Array<{ reason: string }>>`
      SELECT DISTINCT "reason" FROM "UnusedClubDeletionBlocker" WHERE "clubId"=${input.clubId}`;
    // Prefer specific club-level history over secondary profile blockers.
    const reason = Object.keys(blockers).find(key => reasons.some(row => row.reason === key));
    if (reason || reasons.length) {
      throw new ClubDeletionError(blockers[reason ?? "LINKED_HISTORY"], 409, reason ?? "LINKED_HISTORY");
    }

    // INSERT validates and applies all cleanup in one database statement. The
    // snapshot is read from the database, never supplied by the client.
    await tx.$executeRaw`INSERT INTO "ClubDeletionReceipt" (
      "clubId","clubName","creatorUserId","actorUserId","clubMemberId","playerId","setupEventId","setupEventJson","cleanupJson","createdAt"
    ) SELECT "clubId","clubName","creatorUserId",${input.actorUserId},"clubMemberId","playerId","setupEventId","setupEventJson","cleanupJson",${Date.now()}
      FROM "UnusedClubDeletionSetup" WHERE "clubId"=${input.clubId}`;
    if (await tx.club.findUnique({ where: { id: input.clubId }, select: { id: true } })) {
      throw new Error("Unused club deletion did not complete");
    }
  });
}
