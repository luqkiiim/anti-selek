import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:admin:community:reset:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { confirmation } = body as { confirmation?: unknown };

    if (confirmation !== "RESET") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    // Use a transaction to reset everything performance-related
    await prisma.$transaction([
      // 1. Reset all players ELO to 1000
      prisma.user.updateMany({
        data: { elo: 1000 }
      }),
      // 2. Delete all matches
      prisma.match.deleteMany({}),
      // 3. Delete all session players
      prisma.sessionPlayer.deleteMany({}),
      // 4. Delete all sessions
      prisma.session.deleteMany({}),
    ]);

    logAuditEvent({
      action: "admin.community.reset_all",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        route: "/api/admin/community/reset",
      },
      target: {
        type: "platform",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError("Community reset error", error);
    return safeErrorResponse();
  }
}
