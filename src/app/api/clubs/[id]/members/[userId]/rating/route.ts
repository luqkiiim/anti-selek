import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";
import { logError, safeErrorResponse } from "@/lib/errors";

type Context = { params: Promise<{ id: string; userId: string }> };
async function authorize(request: Request, context: Context) {
  const limited = await rateLimit(request, "api:clubs:member:rating", { limit: 30, windowMs: 60_000 });
  if (limited) return { error: limited };
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (isQuickAccessSession(session)) return { error: NextResponse.json({ error: "Sign in to manage ratings" }, { status: 403 }) };
  const { id: clubId, userId } = await context.params;
  const access = await getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
  if (!access?.canAdmin) return { error: NextResponse.json({ error: "Only club admins can adjust ratings" }, { status: 403 }) };
  return { clubId, userId, actorId: session.user.id, actorName: session.user.name || "Club admin" };
}
export async function GET(request: Request, context: Context) {
  try {
    const access = await authorize(request, context);
    if (access.error) return access.error;
    const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: access.clubId!, userId: access.userId! } }, select: { elo: true, ratingAdjustments: { orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!member) return NextResponse.json({ error: "Club player not found" }, { status: 404 });
    return NextResponse.json({ rating: member.elo, history: member.ratingAdjustments });
  } catch (error) { logError("Read rating history", error); return safeErrorResponse(); }
}
export async function POST(request: Request, context: Context) {
  try {
    const access = await authorize(request, context);
    if (access.error) return access.error;
    const body = await request.json().catch(() => null);
    if (!body || !Number.isInteger(body.rating) || body.rating < 0 || body.rating > 5000 || !Number.isInteger(body.expectedRating) || typeof body.reason !== "string" || !body.reason.trim() || body.reason.trim().length > 300) {
      return NextResponse.json({ error: "Enter a rating from 0 to 5000 and a reason (up to 300 characters)" }, { status: 400 });
    }
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.clubMember.findUnique({ where: { clubId_userId: { clubId: access.clubId!, userId: access.userId! } } });
      if (!member) return { status: 404, error: "Club player not found" };
      if (member.elo !== body.expectedRating) return { status: 409, error: "Rating changed since you opened this panel. Reopen it to review the latest rating." };
      if (member.elo === body.rating) return { status: 400, error: "Choose a different rating" };
      const updated = await tx.clubMember.updateMany({ where: { id: member.id, elo: body.expectedRating }, data: { elo: body.rating } });
      if (!updated.count) return { status: 409, error: "Rating changed. Reopen this panel and try again." };
      await tx.clubRatingAdjustment.create({ data: { memberId: member.id, actorId: access.actorId!, actorName: access.actorName!, beforeElo: member.elo, afterElo: body.rating, reason: body.reason.trim() } });
      return { status: 200, rating: body.rating };
    });
    return NextResponse.json(result, { status: result.status });
  } catch (error) { logError("Adjust club rating", error); return safeErrorResponse(); }
}
