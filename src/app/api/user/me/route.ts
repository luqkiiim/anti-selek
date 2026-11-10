import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasAccountPassword } from "@/lib/accountPassword";
import { isGoogleEnrollmentOpen, isGoogleSignInConfigured } from "@/lib/googleAuthConfig";
import { isPasswordOnlyEmail } from "@/lib/googleAccounts";
import { prisma } from "@/lib/prisma";
import { serializeAvatarEntity } from "@/lib/avatar";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionAccountId, getQuickAccessPlayerId } from "@/lib/quickAccess";
import { logError, safeErrorResponse } from "@/lib/errors";
import { logAuditEvent } from "@/lib/serverAudit";
import { nonretiredPlayer } from "@/lib/playerIdentity";
import { clubOwnershipTransaction } from "@/lib/clubPlayerOwnership";
import { AccountProfileSyncError, syncAccountProfile } from "@/lib/accountProfileSync";
import { deriveClubPairingPreferences, propagateClubPairingPreferencesToSessionsInTransaction } from "@/lib/clubPairingPreferences";
import { tryRebuildAutomaticQueuedMatchForSessionId } from "@/app/api/sessions/[code]/queue-match/shared";
import { z } from "zod";
import type { PlayerGender, MixedSide } from "@/types/enums";

export const dynamic = "force-dynamic";
const accountSelect = { id: true, email: true, name: true, avatarKey: true, gender: true, isActive: true, selfNameChangedAt: true, selfGenderChangedAt: true, createdAt: true } as const;
function accountPayload<T extends { avatarKey: string | null; selfNameChangedAt: Date | null; selfGenderChangedAt: Date | null }>(user: T, isAdmin: boolean) {
  return { ...serializeAvatarEntity(user), isClaimed: true, isQuickAccess: false, isAdmin, canRenameName: user.selfNameChangedAt === null, canChangeGender: user.selfGenderChangedAt === null };
}
export async function GET(request: Request) {
  try {
    const limited = await rateLimit(request, "api:user:me:get", { limit: 30, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); const userId = getSessionAccountId(session);
    if (!userId) {
      const playerId = getQuickAccessPlayerId(session); const clubId = session?.user.quickAccessClubId;
      const membership = playerId && clubId ? await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } }, include: { player: true } }) : null;
      if (!membership || membership.ownerUserId !== null || membership.archivedAt || membership.retiredByAdmissionEventId || !membership.player.isActive) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      const { name, avatarKey, gender, isActive } = membership.player;
      return NextResponse.json({ user: { ...serializeAvatarEntity({ name, avatarKey, gender, isActive }), id: session!.user.id, playerId, email: null, isClaimed: false, isQuickAccess: true, quickAccessClubId: clubId, quickAccessCommunityId: clubId, isAdmin: false, canRenameName: false, canChangeGender: false }, players: [], clubProfiles: [] });
    }
    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { ...accountSelect, passwordHash: true } }),
      prisma.clubMember.findMany({ where: { ownerUserId: userId, retiredByAdmissionEventId: null, player: nonretiredPlayer }, include: { player: true, club: { select: { name: true } } } }),
    ]);
    if (!user?.isActive) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const players = [...new Set(memberships.map(member => member.playerId))].map(id => {
      const owned = memberships.filter(member => member.playerId === id);
      const { id: playerId, name, avatarKey, gender } = owned[0].player;
      return serializeAvatarEntity({ id: playerId, name, avatarKey, gender, clubMemberships: owned.map(member => ({ clubId: member.clubId, club: member.club })) });
    });
    const clubProfiles = memberships.map(member => serializeAvatarEntity({ memberId: member.id, clubId: member.clubId, clubName: member.club.name, playerId: member.playerId, name: member.player.name, avatarKey: member.player.avatarKey, status: member.status, gender: member.player.gender, ...deriveClubPairingPreferences(member) }));
    const { passwordHash, ...publicAccount } = user;
    let googleConnection: "connected" | "available" | undefined;
    if (isGoogleSignInConfigured() && !isPasswordOnlyEmail(user.email)) {
      const googleIdentity = await prisma.googleIdentity.findUnique({ where: { userId }, select: { userId: true } });
      if (googleIdentity) googleConnection = "connected";
      else if (isGoogleEnrollmentOpen() && hasAccountPassword(passwordHash)) googleConnection = "available";
    }
    return NextResponse.json({ user: { ...accountPayload(publicAccount, !!session?.user.isAdmin), googleConnection }, players, clubProfiles });
  } catch (error) { logError("Load account", error); return safeErrorResponse(); }
}
export async function PATCH(request: Request) {
  try {
    const limited = await rateLimit(request, "api:user:me:patch", { limit: 15, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); const userId = getSessionAccountId(session);
    if (!userId) return NextResponse.json({ error: "Sign in with an account to edit account settings" }, { status: 403 });
    const parsed = z.object({ name: z.string().trim().min(1).max(100).optional(), gender: z.enum(["MALE", "FEMALE"]).optional(), clubPreferences: z.object({ clubId: z.string().min(1), playerId: z.string().min(1), mixedSideOverride: z.enum(["UPPER", "LOWER"]).nullable() }).strict().optional() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success || !Object.keys(parsed.data).length) return NextResponse.json({ error: "Supply valid account settings" }, { status: 400 });
    const result = await clubOwnershipTransaction(prisma, async tx => {
      const synced = await syncAccountProfile(tx, { userId, changes: { name: parsed.data.name, gender: parsed.data.gender as PlayerGender | undefined }, clubPreferences: parsed.data.clubPreferences as { clubId: string; playerId: string; mixedSideOverride: MixedSide | null } | undefined });
      const propagation = synced.clubPreferences
        ? await propagateClubPairingPreferencesToSessionsInTransaction(tx, synced.clubPreferences)
        : { automaticQueueSessionIds: [] };
      return { ...synced, ...propagation };
    });
    const queueResults = await Promise.allSettled(result.automaticQueueSessionIds.map(id => tryRebuildAutomaticQueuedMatchForSessionId(id)));
    const queueRebuildFailed = queueResults.some(result => result.status === "rejected");
    if (queueRebuildFailed) {
      try { logError("Rebuild automatic queue after account preference update", { code: "QUEUE_REBUILD_FAILED", userId }); } catch { /* Preserve the committed response. */ }
    }
    logAuditEvent({ action: "user.update_account", actor: { userId }, outcome: "success", request, target: { id: userId, type: "account" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: accountSelect });
    return NextResponse.json({ user: accountPayload(user, !!session?.user.isAdmin), synchronizedPlayerIds: result.playerIds, ...(result.clubPreferences ? { clubPreferences: result.clubPreferences } : {}), ...(queueRebuildFailed ? { warnings: [{ code: "QUEUE_REBUILD_FAILED", message: "Player saved. The automatic queue could not be refreshed." }] } : {}) });
  } catch (error) {
    if (error instanceof AccountProfileSyncError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    logError("Edit account", error); return safeErrorResponse();
  }
}
