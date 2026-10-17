import type { PrismaClient } from "@prisma/client";
import { claimClubPlayer, clubOwnershipTransaction } from "../src/lib/clubPlayerOwnership";
import { normalizeNameLookupKey } from "../src/lib/quickAccess";

const SBC_CLUB_ID = "cmvbwqrqw000gr3krwbaad7pl";

/**
 * One-off SBC repair. The caller supplies the reviewed database connection only
 * after backup and explicit production writer approval. No connection or CLI is
 * created here. A repeated invocation rejects before adding another profile.
 */
export async function repairSbcCreator(db: PrismaClient) {
  return clubOwnershipTransaction(db, async tx => {
    const club = await tx.club.findUnique({
      where: { id: SBC_CLUB_ID },
      include: { createdBy: true },
    });
    if (!club || club.name !== "SBC" || club.isTutorial || club.tutorialOwnerId !== null) {
      throw new Error("SBC repair stopped: expected real SBC club was not found.");
    }
    const creator = club.createdBy;
    if (!creator.isActive || creator.name !== "Luqman") {
      throw new Error("SBC repair stopped: expected active creator Luqman was not found.");
    }
    const access = await tx.clubAccess.findUnique({
      where: { clubId_userId: { clubId: club.id, userId: creator.id } },
    });
    if (access?.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(access.role)) {
      throw new Error("SBC repair stopped: creator no longer has active owner/admin access.");
    }
    const members = await tx.clubMember.findMany({
      where: { clubId: club.id },
      include: { player: { select: { name: true } } },
    });
    if (members.some(member => member.ownerUserId === creator.id)) {
      throw new Error("SBC repair stopped: creator already owns a club profile.");
    }
    if (members.some(member => normalizeNameLookupKey(member.player.name) === normalizeNameLookupKey(creator.name))) {
      throw new Error("SBC repair stopped: a matching-name roster profile requires review.");
    }
    const priorClaim = await tx.clubPlayerOwnershipEvent.findFirst({
      where: { clubId: club.id, action: "CLAIM" }, select: { id: true },
    });
    if (priorClaim) {
      throw new Error("SBC repair stopped: club already has a claim event.");
    }
    const pendingAdmission = await tx.clubAdmissionRequest.findFirst({
      where: { clubId: club.id, requesterUserId: creator.id, status: "PENDING" }, select: { id: true },
    });
    const pendingLegacyClaim = await tx.claimRequest.findFirst({
      where: { clubId: club.id, requesterUserId: creator.id, status: "PENDING" }, select: { id: true },
    });
    const pendingInvitation = await tx.playerInvitation.findFirst({
      where: { clubId: club.id, targetAccountUserId: creator.id, status: "ACTIVE" }, select: { id: true },
    });
    if (pendingAdmission || pendingLegacyClaim || pendingInvitation) {
      throw new Error("SBC repair stopped: creator has pending admission or invitation work.");
    }

    const player = await tx.player.create({
      data: { name: creator.name, avatarKey: creator.avatarKey, gender: creator.gender },
      select: { id: true },
    });
    const member = await tx.clubMember.create({ data: { clubId: club.id, playerId: player.id } });
    const claim = await claimClubPlayer(tx, {
      clubId: club.id, playerId: player.id, userId: creator.id, actorUserId: creator.id,
      reason: "Approved SBC creator repair: add Luqman's missing local player profile; preserve existing roster and owner access.",
    });
    if (!claim.eventId || claim.alreadyOwned) throw new Error("SBC repair stopped: expected a new ownership audit.");
    const finalAccess = await tx.clubAccess.findUniqueOrThrow({ where: { id: access.id } });
    if (JSON.stringify(finalAccess) !== JSON.stringify(access)) {
      throw new Error("SBC repair stopped: creator access changed unexpectedly.");
    }
    return { clubId: club.id, ownerUserId: creator.id, playerId: player.id, clubMemberId: member.id, eventId: claim.eventId };
  });
}
