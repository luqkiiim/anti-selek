import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { serializeAvatarEntity } from "@/lib/avatar";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const limited = await rateLimit(request, "api:admin:players:post", { limit: 15, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); if (!session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100) return NextResponse.json({ error: "Enter a player name" }, { status: 400 });
    if (body.email || body.password || body.ownerUserId) return NextResponse.json({ error: "Create an offline Player here. Accounts register and request an approved profile connection separately." }, { status: 400 });
    const player = await prisma.player.create({ data: { name: body.name.trim() } });
    return NextResponse.json({ ...serializeAvatarEntity(player), email: null, isClaimed: false });
  } catch (error) { logError("Admin add player", error); return safeErrorResponse(); }
}
export async function GET(request: Request) {
  try {
    const limited = await rateLimit(request, "api:admin:players:get", { limit: 20, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); if (!session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const players = await prisma.player.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, avatarKey: true, elo: true, ownerUserId: true, isActive: true, createdAt: true } });
    return NextResponse.json(players.map(player => ({ ...serializeAvatarEntity(player), email: null, isClaimed: !!player.ownerUserId })));
  } catch (error) { logError("Admin list players", error); return safeErrorResponse(); }
}
