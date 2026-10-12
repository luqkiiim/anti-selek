import type { Prisma } from "@prisma/client";
import type { PlayerGender } from "@/types/enums";
import { resolveMixedSideState } from "./mixedSide";

/** Never fall back to deprecated shared Player or Account pairing fields. */
export function deriveClubPairingPreferences(member: { player: { gender: string }; mixedSideOverride?: string | null }) {
  return resolveMixedSideState({ gender: member.player.gender as PlayerGender, mixedSideOverride: member.mixedSideOverride ?? null });
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
