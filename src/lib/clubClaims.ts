import type { Prisma } from "@prisma/client";
import { ClubAdmissionError, reviewClubAdmission } from "@/lib/clubAdmissions";
/** Legacy symbol retained for callers; claims no longer merge or move history. */
export { ClubAdmissionError as ClubClaimError };
export function isClaimableClubPlaceholder(player: { ownerUserId: string | null }) { return player.ownerUserId === null; }
export async function approveClubClaimRequest(tx: Prisma.TransactionClient, input: { clubId: string; requestId: string; reviewerUserId: string; isGlobalAdmin?: boolean }) {
  return reviewClubAdmission(tx, { ...input, action: "APPROVE" });
}
