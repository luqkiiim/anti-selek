import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getClubRoster } from "@/lib/clubRoster";
import { isQuickAccessSession, canQuickAccessClub, normalizeNameLookupKey } from "@/lib/quickAccess";
import { isValidPlayerGender, isValidPartnerPreference, resolveMixedSideState } from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { rateLimit } from "@/lib/rateLimit";
import { logError, safeErrorResponse } from "@/lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await rateLimit(request, "api:communities:id:members:get", { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { id } = await params;
    const quick = isQuickAccessSession(session);
    const access = quick ? null : await getClubAdminAccess(prisma, { clubId: id, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
    if (quick ? !canQuickAccessClub(session, id) : !access || (!access.membershipRole && !access.canAdmin)) return NextResponse.json({ error: "Club access required" }, { status: 403 });
    return NextResponse.json(await getClubRoster(prisma, id));
  } catch (error) { logError("List club players", error); return safeErrorResponse(); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await rateLimit(request, "api:communities:id:members:post", { limit: 15, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (isQuickAccessSession(session)) return NextResponse.json({ error: "Sign in with an account." }, { status: 403 });
    const { id } = await params;
    const access = await getClubAdminAccess(prisma, { clubId: id, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
    if (!access?.canAdmin) return NextResponse.json({ error: "Club admin access required" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100 || !normalizeNameLookupKey(body.name)) return NextResponse.json({ error: "Enter a player name from 2 to 100 characters." }, { status: 400 });
    if (body.email || body.password || body.ownerUserId) return NextResponse.json({ error: "Create an offline Player here. Account ownership requires an approved admission request." }, { status: 400 });
    if (!isValidPlayerGender(body.gender) || body.gender === "UNSPECIFIED") return NextResponse.json({ error: "Choose the player's gender." }, { status: 400 });
    if (body.partnerPreference !== undefined && !isValidPartnerPreference(body.partnerPreference)) return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
    if (body.status !== undefined && !["CORE", "OCCASIONAL"].includes(body.status)) return NextResponse.json({ error: "Invalid roster status" }, { status: 400 });
    if (body.preferredPool !== undefined && !isValidSessionPool(body.preferredPool)) return NextResponse.json({ error: "Invalid preferred game group" }, { status: 400 });
    const existing = await prisma.clubMember.findMany({ where: { clubId: id, archivedAt: null }, include: { player: true } });
    const duplicate = existing.find(member => normalizeNameLookupKey(member.player.name) === normalizeNameLookupKey(body.name));
    if (duplicate && body.allowDuplicateName !== true) return NextResponse.json({ error: "A player with this name already exists. Review that profile before creating another.", existingPlayerId: duplicate.playerId }, { status: 409 });
    const mixed = resolveMixedSideState({ gender: body.gender, partnerPreference: body.partnerPreference, mixedSideOverride: body.mixedSideOverride });
    const player = await prisma.$transaction(async tx => {
      const created = await tx.player.create({ data: { name: body.name.trim(), gender: body.gender, ...mixed } });
      await tx.clubMember.create({ data: { clubId: id, playerId: created.id, ownerUserId: null, status: body.status ?? "CORE", preferredPool: body.preferredPool ?? "B" } });
      return created;
    });
    return NextResponse.json((await getClubRoster(prisma, id)).find(member => member.id === player.id), { status: 201 });
  } catch (error) { logError("Create offline club Player", error); return safeErrorResponse(); }
}
