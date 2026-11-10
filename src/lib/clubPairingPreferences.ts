import type { Prisma } from "@prisma/client";
import { SessionStatus, type MixedSide, type PlayerGender } from "@/types/enums";
import { resolveMixedSideState } from "./mixedSide";

/** Never fall back to deprecated shared Player or Account pairing fields. */
export function deriveClubPairingPreferences(member: { player: { gender: string }; mixedSideOverride?: string | null }) {
  return resolveMixedSideState({ gender: member.player.gender as PlayerGender, mixedSideOverride: member.mixedSideOverride ?? null });
}

/** Update the selected club's unfinished seats without rewriting recorded matches. */
export async function propagateClubPairingPreferencesToSessionsInTransaction(
  tx: Prisma.TransactionClient,
  { clubId, playerId, mixedSideOverride }: { clubId: string; playerId: string; mixedSideOverride: MixedSide | null }
) {
  const seats = await tx.sessionPlayer.findMany({
    where: {
      playerId,
      profileClubId: clubId,
      isGuest: false,
      session: { status: { in: [SessionStatus.WAITING, SessionStatus.ACTIVE] } },
    },
    select: {
      id: true, sessionId: true, gender: true, mixedSideOverride: true, partnerPreference: true,
      session: { select: { autoQueueEnabled: true, queuedMatch: { select: { isAutomatic: true } } } },
    },
  });
  const automaticQueueSessionIds: string[] = [];
  for (const seat of seats) {
    const state = resolveMixedSideState({ gender: seat.gender as PlayerGender, mixedSideOverride });
    const changed = state.mixedSideOverride !== seat.mixedSideOverride || state.partnerPreference !== seat.partnerPreference;
    if (changed) await tx.sessionPlayer.update({ where: { id: seat.id }, data: state });
    // Any changed candidate can affect the best pairing, even outside the queued four.
    if ((changed && seat.session.queuedMatch?.isAutomatic) || (seat.session.autoQueueEnabled && !seat.session.queuedMatch)) {
      automaticQueueSessionIds.push(seat.sessionId);
    }
  }
  if (automaticQueueSessionIds.length) {
    await tx.queuedMatch.deleteMany({ where: { sessionId: { in: automaticQueueSessionIds }, isAutomatic: true } });
  }
  return { automaticQueueSessionIds };
}

/** Gender is identity-wide; each membership keeps and normalizes its own choice. */
export async function normalizeClubMembershipPreferencesForGender(tx: Prisma.TransactionClient, playerIds: string[], gender: PlayerGender) {
  if (!playerIds.length) return;
  const members = await tx.clubMember.findMany({ where: { playerId: { in: playerIds } }, select: { id: true, mixedSideOverride: true } });
  for (const member of members) {
    const state = resolveMixedSideState({ gender, mixedSideOverride: member.mixedSideOverride });
    if (state.mixedSideOverride !== member.mixedSideOverride) await tx.clubMember.update({ where: { id: member.id }, data: { mixedSideOverride: state.mixedSideOverride } });
  }
}
