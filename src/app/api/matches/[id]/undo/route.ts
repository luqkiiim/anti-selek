import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  undoCompletedMatchResult,
  UndoCompletedMatchError,
} from "@/lib/matchCompletion";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:matches:id:undo:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:matches:id:undo");
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
            status: true,
          },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(_request, "api:matches:id:undo");
    }

    if (match.status !== MatchStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Only completed matches can be undone." },
        { status: 400 }
      );
    }

    if (match.session.status !== SessionStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Only active sessions can undo completed matches." },
        { status: 400 }
      );
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: { id: match.sessionId, clubId: match.session.clubId },
      userId: session.user.id,
      acceptedOnly: true,
    });

    const canManage =
      !isQuickAccessSession(session) &&
      (!!session.user.isAdmin || !!operatorMembership);

    if (!canManage) {
      return invalidTargetResponse(_request, "api:matches:id:undo");
    }

    const result = await undoCompletedMatchResult({ matchId: match.id });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof UndoCompletedMatchError) {
      if (error.code === "MATCH_NOT_FOUND") {
        return invalidTargetResponse(_request, "api:matches:id:undo");
      }

      if (error.code === "NOT_LATEST_COMPLETED_MATCH") {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logError("Undo completed match error", error);
    return safeErrorResponse();
  }
}
