import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getClubRoster } from "@/lib/clubRoster";
import { isValidClubRole } from "@/lib/clubRoles";
import { isQuickAccessSession, normalizeNameLookupKey } from "@/lib/quickAccess";
import { isValidMixedSide, isValidPartnerPreference, isValidPlayerGender, resolveMixedSideState } from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { propagatePreferredPoolToClubSessions } from "@/lib/playerGroupPreferences";
import { tryRebuildAutomaticQueuedMatchForSessionId } from "@/app/api/sessions/[code]/queue-match/shared";
import { rateLimit } from "@/lib/rateLimit";
import { ClubAdmissionError } from "@/lib/clubAdmissions";
import { ClubPlayerOwnershipError, clubOwnershipTransaction, removeClubPlayerOwnership } from "@/lib/clubPlayerOwnership";
import { AccountProfileSyncError, syncAccountProfile } from "@/lib/accountProfileSync";
import { logError, safeErrorResponse } from "@/lib/errors";

type Context = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const limited = await rateLimit(request, "api:communities:id:members:userId:patch", { limit: 15, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (isQuickAccessSession(session)) return NextResponse.json({ error: "Sign in with an account." }, { status: 403 });
    const { id: clubId, userId: playerId } = await params; // Compatibility URL parameter is a Player ID.
    const [access, member] = await Promise.all([
      getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin }),
      prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } }, include: { player: true } }),
    ]);
    if (!member || member.archivedAt) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (!access?.isGlobalAdmin && !access?.membershipRole) return NextResponse.json({ error: "Active club access required" }, { status: 403 });
    if (member.retiredByAdmissionEventId) return NextResponse.json({ error: "Retired player profiles cannot be changed" }, { status: 409 });
    const self = member.ownerUserId === session.user.id;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const staffGroupOnly = access?.membershipRole === "STAFF" && Object.keys(body).length === 1 && body.preferredPool !== undefined;
    if (!access?.canAdmin && !self && !staffGroupOnly) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (body.email !== undefined || body.password !== undefined || body.ownerUserId !== undefined || body.elo !== undefined) return NextResponse.json({ error: "Account ownership and rating changes use their dedicated flows." }, { status: 400 });
    if (!access?.canAdmin && !staffGroupOnly && ["role", "status", "preferredPool", "isActive"].some(field => body[field] !== undefined)) return NextResponse.json({ error: "Club admin access required" }, { status: 403 });
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100 || !normalizeNameLookupKey(body.name))) return NextResponse.json({ error: "Invalid player name" }, { status: 400 });
    if (body.gender !== undefined && !isValidPlayerGender(body.gender)) return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    if (body.partnerPreference !== undefined && !isValidPartnerPreference(body.partnerPreference)) return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
    if (body.mixedSideOverride !== undefined && body.mixedSideOverride !== null && !isValidMixedSide(body.mixedSideOverride)) return NextResponse.json({ error: "Invalid player level" }, { status: 400 });
    if (body.status !== undefined && !["CORE", "OCCASIONAL"].includes(body.status)) return NextResponse.json({ error: "Invalid roster status" }, { status: 400 });
    if (body.preferredPool !== undefined && !isValidSessionPool(body.preferredPool)) return NextResponse.json({ error: "Invalid preferred game group" }, { status: 400 });
    // Legacy rest toggles stay ignored; this identity refactor does not change queue behavior.
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") return NextResponse.json({ error: "Invalid player status" }, { status: 400 });
    if (body.role !== undefined && (!isValidClubRole(body.role) || body.role === "OWNER")) return NextResponse.json({ error: "Invalid role update" }, { status: 400 });
    const mixedChanged = ["gender", "partnerPreference", "mixedSideOverride"].some(field => body[field] !== undefined);
    if (body.role !== undefined) {
      if (!member.ownerUserId) return NextResponse.json({ error: "Only a registered account can receive club permissions." }, { status: 400 });
      if (member.ownerUserId === session.user.id || member.ownerUserId === access?.createdById) return NextResponse.json({ error: "Cannot change your own or the club owner's role." }, { status: 400 });
    }
    await clubOwnershipTransaction(prisma, async tx => {
      const current = await tx.clubMember.findUnique({ where: { id: member.id }, include: { player: true } });
      const currentAccess = await getClubAdminAccess(tx, { clubId, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
      if (!current || current.archivedAt || current.retiredByAdmissionEventId) throw new ClubAdmissionError("This player changed. Refresh before editing.", 409);
      const currentSelf = current.ownerUserId === session.user.id;
      const currentStaffGroupOnly = currentAccess?.membershipRole === "STAFF" && Object.keys(body).length === 1 && body.preferredPool !== undefined;
      if (!currentAccess?.canAdmin && !currentSelf && !currentStaffGroupOnly) throw new ClubAdmissionError("Not authorized", 403);
      if (!currentAccess?.isGlobalAdmin && !currentAccess?.membershipRole) throw new ClubAdmissionError("Active club access required", 403);
      if (!currentAccess?.canAdmin && !currentStaffGroupOnly && ["role", "status", "preferredPool", "isActive"].some(field => body[field] !== undefined)) throw new ClubAdmissionError("Club admin access required", 403);
      const personalChanged = body.name !== undefined || mixedChanged;
      const connected = await tx.clubMember.findFirst({ where: { playerId, ownerUserId: { not: null }, retiredByAdmissionEventId: null }, select: { id: true } });
      if (personalChanged && connected && !currentSelf) throw new ClubAdmissionError("The account owner manages their personal profile.", 403);
      if (connected && body.isActive !== undefined && body.isActive !== current.player.isActive) throw new ClubAdmissionError("Remove club membership to disconnect a player from this club.", 403);
      if (body.role !== undefined && current.ownerUserId) {
        if (current.ownerUserId === session.user.id || current.ownerUserId === currentAccess?.createdById) throw new ClubAdmissionError("Cannot change your own or the club owner's role.", 400);
        const grant = await tx.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: current.ownerUserId } } });
        if (!grant || grant.status !== "ACTIVE") throw new ClubAdmissionError("Approve account admission before changing club permissions.");
        if (["ADMIN", "OWNER"].includes(grant.role) && !currentAccess?.isOwner && !currentAccess?.isGlobalAdmin) throw new ClubAdmissionError("Only the club owner can demote admins.", 403);
        await tx.clubAccess.update({ where: { id: grant.id }, data: { role: body.role } });
      }
      if (personalChanged && currentSelf) {
        await syncAccountProfile(tx, { userId: session.user.id, changes: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.gender !== undefined ? { gender: body.gender } : {}), ...(body.partnerPreference !== undefined ? { partnerPreference: body.partnerPreference } : {}), ...(body.mixedSideOverride !== undefined ? { mixedSideOverride: body.mixedSideOverride } : {}) } });
      } else if (personalChanged) {
        const currentMixed = resolveMixedSideState({ gender: body.gender ?? current.player.gender, partnerPreference: body.partnerPreference ?? (body.mixedSideOverride !== undefined ? undefined : current.player.partnerPreference), mixedSideOverride: body.mixedSideOverride !== undefined ? body.mixedSideOverride : current.player.mixedSideOverride });
        await tx.player.update({ where: { id: playerId }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.gender !== undefined ? { gender: body.gender } : {}), ...(mixedChanged ? currentMixed : {}) } });
      }
      if (typeof body.isActive === "boolean") await tx.player.update({ where: { id: playerId }, data: { isActive: body.isActive } });
      if (body.status !== undefined || body.preferredPool !== undefined) await tx.clubMember.update({ where: { id: member.id }, data: { ...(body.status !== undefined ? { status: body.status } : {}), ...(body.preferredPool !== undefined ? { preferredPool: body.preferredPool } : {}) } });
    });
    let preferencePropagation = { immediateSessionCount: 0, deferredSessionCount: 0 };
    if (isValidSessionPool(body.preferredPool)) {
      const result = await propagatePreferredPoolToClubSessions(prisma, { clubId, playerId, preferredPool: body.preferredPool });
      preferencePropagation = result;
      await Promise.all(result.automaticQueueSessionIds.map(id => tryRebuildAutomaticQueuedMatchForSessionId(id)));
    }
    return NextResponse.json({ ...(await getClubRoster(prisma, clubId)).find(player => player.id === playerId), preferencePropagation });
  } catch (error) { if (error instanceof ClubAdmissionError || error instanceof ClubPlayerOwnershipError || error instanceof AccountProfileSyncError) return NextResponse.json({ error: error.message }, { status: error.statusCode }); logError("Update club Player", error); return safeErrorResponse(); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const limited = await rateLimit(request, "api:communities:id:members:userId:delete", { limit: 15, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id || isQuickAccessSession(session)) return NextResponse.json({ error: "Sign in with an account." }, { status: 401 });
    const { id: clubId, userId: playerId } = await params;
    const access = await getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
    if (!access?.canAdmin) return NextResponse.json({ error: "Club admin access required" }, { status: 403 });
    const member = await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId } }, select: { retiredByAdmissionEventId: true } });
    if (!member) return NextResponse.json({ error: "Club profile not found" }, { status: 404 });
    if (member.retiredByAdmissionEventId) return NextResponse.json({ error: "Retired player profiles cannot be changed" }, { status: 409 });
    const removalBody = await request.text();
    if (removalBody) {
      const destination = new URL(request.url); destination.host = request.headers.get("host") ?? destination.host;
      if (request.headers.get("origin") !== destination.origin || !request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Same-origin JSON request required." }, { status: 403 });
      let body;
      try { body = JSON.parse(removalBody); } catch { return NextResponse.json({ error: "Invalid removal action." }, { status: 400 }); }
      if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || body.disconnectAccount !== true) return NextResponse.json({ error: "Invalid removal action." }, { status: 400 });
    }
    await clubOwnershipTransaction(prisma, tx => removeClubPlayerOwnership(tx, { clubId, playerId, actorUserId: session.user.id, mode: "REMOVE" }));
    return NextResponse.json({ success: true });
  } catch (error) { if (error instanceof ClubAdmissionError || error instanceof ClubPlayerOwnershipError) return NextResponse.json({ error: error.message }, { status: error.statusCode }); logError("Archive club Player", error); return safeErrorResponse(); }
}
