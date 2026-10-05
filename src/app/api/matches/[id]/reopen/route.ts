import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MatchStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:matches:id:reopen:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:matches:id:reopen");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        status: true,
        session: {
          select: {
            clubId: true,
          },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(_request, "api:matches:id:reopen");
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return sportingJson({ error: "Match is not pending approval" }, { status: 400 });
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, clubId: match.session.clubId },
      userId: session.user.id,
      acceptedOnly: true,
    });

    const canOperate = !!session.user.isAdmin || !!operatorMembership;
    if (!canOperate) {
      return sportingJson({ error: "Only admins or staff can reopen score entry" }, { status: 403 });
    }

    const updatedResult = await prisma.match.updateMany({
      where: { id, status: MatchStatus.PENDING_APPROVAL },
      data: {
        status: MatchStatus.IN_PROGRESS,
        team1Score: null,
        team2Score: null,
        winnerTeam: null,
        team1EloChange: null,
        team2EloChange: null,
        completedAt: null,
        scoreSubmittedByUserId: null,
        scoreSubmittedByPlayerId: null,
      },
    });

    if (updatedResult.count === 0) {
      return sportingJson(
        { error: "Match was already updated by someone else." },
        { status: 409 }
      );
    }

    const updatedMatch = await prisma.match.findUnique({
      where: { id },
      include: {
        team1Player1: { select: { id: true, name: true } },
        team1Player2: { select: { id: true, name: true } },
        team2Player1: { select: { id: true, name: true } },
        team2Player2: { select: { id: true, name: true } },
      },
    });

    return sportingJson(updatedMatch);
  } catch (error) {
    logError("Reopen score error", error);
    return safeErrorResponse();
  }
}
