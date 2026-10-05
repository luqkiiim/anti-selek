import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeAvatarEntity } from "@/lib/avatar";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionAccountId, getQuickAccessPlayerId, normalizeNameLookupKey } from "@/lib/quickAccess";
import { logError, safeErrorResponse } from "@/lib/errors";
import { logAuditEvent } from "@/lib/serverAudit";
import { z } from "zod";

export const dynamic = "force-dynamic";
const accountSelect = { id: true, email: true, name: true, avatarKey: true, gender: true, isActive: true, selfNameChangedAt: true, selfGenderChangedAt: true, createdAt: true } as const;
const ownedPlayerSelect = { id: true, name: true, avatarKey: true, gender: true, clubMemberships: { select: { clubId: true, club: { select: { name: true } } } } } as const;
function accountPayload<T extends { avatarKey: string | null; selfNameChangedAt: Date | null; selfGenderChangedAt: Date | null }>(user: T, isAdmin: boolean) {
  return { ...serializeAvatarEntity(user), isClaimed: true, isQuickAccess: false, isAdmin, canRenameName: user.selfNameChangedAt === null, canChangeGender: user.selfGenderChangedAt === null };
}
export async function GET(request: Request) {
  try {
    const limited = await rateLimit(request, "api:user:me:get", { limit: 30, windowMs: 60000 }); if (limited) return limited;
    const session = await auth();
    const userId = getSessionAccountId(session);
    if (!userId) {
      const guestPlayerId = getQuickAccessPlayerId(session);
      const player = guestPlayerId ? await prisma.player.findUnique({ where: { id: guestPlayerId }, select: { id: true, name: true, avatarKey: true, gender: true, ownerUserId: true, isActive: true } }) : null;
      if (!player?.isActive || player.ownerUserId !== null) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      return NextResponse.json({ user: { ...serializeAvatarEntity(player), id: session!.user.id, playerId: player.id, email: null, isClaimed: false, isQuickAccess: true, quickAccessClubId: session!.user.quickAccessClubId ?? null, quickAccessCommunityId: session!.user.quickAccessClubId ?? null, isAdmin: false, canRenameName: false, canChangeGender: false }, players: [] });
    }
    const [user, players] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: accountSelect }), prisma.player.findMany({ where: { ownerUserId: userId }, select: ownedPlayerSelect })]);
    if (!user?.isActive) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ user: accountPayload(user, !!session?.user.isAdmin), players: players.map(serializeAvatarEntity) });
  } catch (error) { logError("Load account", error); return safeErrorResponse(); }
}
export async function PATCH(request: Request) {
  try {
    const limited = await rateLimit(request, "api:user:me:patch", { limit: 15, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); const userId = getSessionAccountId(session);
    if (!userId) return NextResponse.json({ error: "Sign in with an account to edit account settings" }, { status: 403 });
    const parsed = z.object({ name: z.string().trim().min(1).max(100).optional(), gender: z.enum(["MALE", "FEMALE"]).optional() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success || (!parsed.data.name && !parsed.data.gender)) return NextResponse.json({ error: "Supply a valid name or gender" }, { status: 400 });
    if (parsed.data.name && !normalizeNameLookupKey(parsed.data.name)) return NextResponse.json({ error: "Name must include letters or numbers" }, { status: 400 });
    const current = await prisma.user.findUnique({ where: { id: userId }, select: accountSelect });
    if (!current?.isActive) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const nameChanged = parsed.data.name !== undefined && parsed.data.name !== current.name;
    const genderChanged = parsed.data.gender !== undefined && parsed.data.gender !== current.gender;
    if ((nameChanged && current.selfNameChangedAt) || (genderChanged && current.selfGenderChangedAt)) return NextResponse.json({ error: "This account field can only be changed once" }, { status: 409 });
    const user = nameChanged || genderChanged ? await prisma.user.update({ where: { id: userId, ...(nameChanged ? { selfNameChangedAt: null } : {}), ...(genderChanged ? { selfGenderChangedAt: null } : {}) }, data: {
      ...(nameChanged ? { name: parsed.data.name, selfNameChangedAt: new Date() } : {}), ...(genderChanged ? { gender: parsed.data.gender, selfGenderChangedAt: new Date() } : {}),
    }, select: accountSelect }) : current;
    // Account defaults never overwrite the sporting identity of an owned Player.
    logAuditEvent({ action: "user.update_account", actor: { userId }, outcome: "success", request, target: { id: userId, type: "account" } });
    return NextResponse.json({ user: accountPayload(user, !!session?.user.isAdmin) });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "This account field can only be changed once" }, { status: 409 });
    logError("Edit account", error); return safeErrorResponse();
  }
}
