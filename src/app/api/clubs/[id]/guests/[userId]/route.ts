import { NextResponse } from "next/server";
import { getGuestRating } from "@/lib/guestRating";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { clubGuestWhere } from "@/lib/clubGuest";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(request: Request, { params }: {
  params: Promise<{ id: string; userId: string }>;
}) {
  try {
    const limited = await rateLimit(request, "api:clubs:guests:promote", { limit: 15, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (isQuickAccessSession(session)) return NextResponse.json({ error: "Sign in to manage club players" }, { status: 403 });
    const { id: clubId, userId } = await params;
    const access = await getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
    if (!access?.canAdmin) return NextResponse.json({ error: "Only club admins can add players" }, { status: 403 });
    const membership = await prisma.$transaction(async (tx) => {
      const guest = await tx.sessionPlayer.findFirst({
        where: clubGuestWhere(clubId, userId),
        select: { player: { select: { elo: true } } },
      });
      if (!guest) return null;
      const elo = await getGuestRating(tx, userId, guest.player.elo);
      return tx.clubMember.upsert({
        where: { clubId_playerId: { clubId, playerId: userId } },
        update: {},
        create: { clubId, playerId: userId, status: "OCCASIONAL", elo },
        select: { playerId: true },
      });
    });
    if (!membership) return NextResponse.json({ error: "Guest must belong to a completed club tournament" }, { status: 404 });
    return NextResponse.json({ userId: membership.playerId });
  } catch (error) {
    logError("Add guest to club error", error);
    return safeErrorResponse();
  }
}
