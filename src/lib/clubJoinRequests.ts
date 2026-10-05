import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
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
    const access = await getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: session.user.isAdmin });
    if (!access?.canAdmin)
      return {
        response: NextResponse.json(
          { error: "Club admin access required" },
          { status: 403 },
        ),
      } as const;
  }
  return { userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin } as const;
}
