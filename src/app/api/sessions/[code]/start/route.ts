import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:start:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:start");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: { players: true },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:start");
    }

    let isCommunityAdmin = false;
    if (sessionData.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }
    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (sessionData.status !== SessionStatus.WAITING) {
      return NextResponse.json({ error: "Session already started" }, { status: 400 });
    }

    const startedAt = new Date();
    const updated = await prisma.session.update({
      where: { code },
      data: {
        status: SessionStatus.ACTIVE,
        poolACourtAssignments: 0,
        poolBCourtAssignments: 0,
        poolAMissedTurns: 0,
        poolBMissedTurns: 0,
        players: {
          updateMany: {
            where: {},
            data: { availableSince: startedAt },
          },
        },
      },
      include: {
        courts: { include: { currentMatch: true } },
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    const players =
      updated.communityId && updated.players.length > 0
        ? withCommunityElo(
            updated.players,
            await getCommunityEloByUserId(
              updated.communityId,
              updated.players.map((p) => p.userId)
            )
          )
        : updated.players;

    return NextResponse.json({ ...updated, players });
  } catch (error) {
    logError("Start session error", error);
    return safeErrorResponse();
  }
}
