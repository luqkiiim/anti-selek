import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:end:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:end");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        endedAt: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(_request, "api:sessions:code:end");
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

    const endedAt = sessionData.endedAt ?? new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.queuedMatch.deleteMany({
        where: { sessionId: sessionData.id },
      });

      await tx.court.updateMany({
        where: { sessionId: sessionData.id },
        data: { currentMatchId: null },
      });

      await tx.match.deleteMany({
        where: {
          sessionId: sessionData.id,
          status: {
            in: [
              MatchStatus.PENDING,
              MatchStatus.IN_PROGRESS,
              MatchStatus.PENDING_APPROVAL,
            ],
          },
        },
      });

      return tx.session.update({
        where: { code },
        data: { status: SessionStatus.COMPLETED, endedAt },
        include: {
          courts: { include: { currentMatch: true } },
          players: {
            include: { user: { select: { id: true, name: true, elo: true } } },
          },
        },
      });
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

    return NextResponse.json({ ...updated, players, queuedMatch: null });
  } catch (error) {
    logError("End session error", error);
    return safeErrorResponse();
  }
}
