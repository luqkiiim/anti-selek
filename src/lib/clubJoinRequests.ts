import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
export async function joinRequestAccess(request: Request, clubId?: string) {
  const limited = await rateLimit(request, "api:club-join-requests", {
    limit: 30,
    windowMs: 60000,
  });
  if (limited) return { response: limited } as const;
  const session = await auth();
  if (!session?.user?.id)
    return {
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    } as const;
  if (isQuickAccessSession(session))
    return {
      response: NextResponse.json(
        { error: "Sign in with an account to manage join requests." },
        { status: 403 },
      ),
    } as const;
  if (clubId) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        createdById: true,
        members: { where: { userId: session.user.id }, select: { role: true } },
      },
    });
    if (
      !club ||
      (!session.user.isAdmin &&
        club.createdById !== session.user.id &&
        !club.members.some((m) => m.role === "ADMIN"))
    )
      return {
        response: NextResponse.json(
          { error: "Club admin access required" },
          { status: 403 },
        ),
      } as const;
  }
  return { userId: session.user.id } as const;
}
