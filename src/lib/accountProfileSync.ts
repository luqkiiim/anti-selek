import type { Prisma } from "@prisma/client";
import { resolveMixedSideState } from "./mixedSide";
import { normalizeClubMembershipPreferencesForGender } from "./clubPairingPreferences";
import { normalizeNameLookupKey } from "./quickAccess";
import { nonretiredPlayer } from "./playerIdentity";
import type { MixedSide, PlayerGender } from "@/types/enums";

export class AccountProfileSyncError extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}

export interface AccountProfileChanges {
  name?: string;
  avatarKey?: string | null;
  gender?: PlayerGender;
}

/** Caller must hold the admission writer reservation before reading ownership. */
export async function syncAccountProfile(tx: Prisma.TransactionClient, input: {
  userId: string; changes: AccountProfileChanges; expectedAvatarKey?: string | null;
  clubPreferences?: { clubId: string; playerId: string; mixedSideOverride: MixedSide | null };
}) {
  const { userId, changes } = input;
  const current = await tx.user.findUnique({ where: { id: userId } });
  if (!current?.isActive) throw new AccountProfileSyncError("Account not found", 404);
  if (input.expectedAvatarKey !== undefined && current.avatarKey !== input.expectedAvatarKey) {
    throw new AccountProfileSyncError("Your photo changed. Refresh and try again");
  }
  if (changes.name !== undefined && (!changes.name.trim() || changes.name.length > 100 || !normalizeNameLookupKey(changes.name))) {
    throw new AccountProfileSyncError("Name must include letters or numbers", 400);
  }
  if (changes.gender !== undefined && changes.gender !== "MALE" && changes.gender !== "FEMALE") {
    throw new AccountProfileSyncError("Choose male or female", 400);
  }
  const nameChanged = changes.name !== undefined && changes.name !== current.name;
  const genderChanged = changes.gender !== undefined && changes.gender !== current.gender;
  if ((nameChanged && current.selfNameChangedAt) || (genderChanged && current.selfGenderChangedAt)) {
    throw new AccountProfileSyncError("This account field can only be changed once");
  }
  const preferenceMember = input.clubPreferences ? await tx.clubMember.findUnique({
    where: { clubId_playerId: { clubId: input.clubPreferences.clubId, playerId: input.clubPreferences.playerId } }, include: { player: true },
  }) : null;
  if (input.clubPreferences) {
    const access = await tx.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubPreferences.clubId, userId } }, select: { status: true } });
    if (!preferenceMember || preferenceMember.ownerUserId !== userId || preferenceMember.archivedAt || preferenceMember.retiredByAdmissionEventId || !preferenceMember.player.isActive || access?.status !== "ACTIVE") {
      throw new AccountProfileSyncError("Active ownership of this exact club profile is required", 403);
    }
    const retired = await tx.clubMember.findFirst({ where: { playerId: preferenceMember.playerId, retiredByAdmissionEventId: { not: null } }, select: { id: true } });
    if (retired) throw new AccountProfileSyncError("Retired player profiles cannot be changed", 409);
  }
  const players = await tx.player.findMany({ where: {
    AND: [nonretiredPlayer, { clubMemberships: { some: { ownerUserId: userId, retiredByAdmissionEventId: null } } }],
  }, select: { id: true, avatarKey: true, clubMemberships: { select: { ownerUserId: true, retiredByAdmissionEventId: true } } } });
  if (Object.values(changes).some(value => value !== undefined) && players.some(player => player.clubMemberships.some(member => member.retiredByAdmissionEventId === null && member.ownerUserId !== null && member.ownerUserId !== userId))) {
    throw new AccountProfileSyncError("A shared profile belongs to another account. An administrator must review it before editing");
  }
  const playerData: Prisma.PlayerUpdateManyMutationInput = {};
  const accountData: Prisma.UserUpdateInput = {};
  if (changes.name !== undefined) { playerData.name = changes.name; if (nameChanged) { accountData.name = changes.name; accountData.selfNameChangedAt = new Date(); } }
  if (changes.avatarKey !== undefined) { playerData.avatarKey = changes.avatarKey; accountData.avatarKey = changes.avatarKey; }
  if (changes.gender !== undefined) { playerData.gender = changes.gender; if (genderChanged) { accountData.gender = changes.gender; accountData.selfGenderChangedAt = new Date(); } }
  const account = Object.keys(accountData).length ? await tx.user.update({ where: { id: userId }, data: accountData }) : current;
  if (players.length && Object.keys(playerData).length) await tx.player.updateMany({ where: { id: { in: players.map(player => player.id) } }, data: playerData });
  if (changes.gender !== undefined) await normalizeClubMembershipPreferencesForGender(tx, players.map(player => player.id), changes.gender);
  let clubPreferences;
  if (input.clubPreferences && preferenceMember) {
    const state = resolveMixedSideState({ gender: (changes.gender ?? preferenceMember.player.gender) as PlayerGender, mixedSideOverride: input.clubPreferences.mixedSideOverride });
    await tx.clubMember.update({ where: { id: preferenceMember.id }, data: { mixedSideOverride: state.mixedSideOverride } });
    clubPreferences = { clubId: preferenceMember.clubId, playerId: preferenceMember.playerId, ...state };
  }
  return { account, clubPreferences, playerIds: players.map(player => player.id), previousAvatarKeys: [...new Set([current.avatarKey, ...players.map(player => player.avatarKey)])] };
}
