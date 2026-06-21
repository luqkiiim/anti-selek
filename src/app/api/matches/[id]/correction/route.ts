import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  correctCompletedMatchScore,
  CorrectCompletedMatchScoreError,
} from "@/lib/matchCompletion";
import { MATCH_SCORE_ERROR_MESSAGE, isValidMatchScore } from "@/lib/matchRules";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/serverAudit";
import { getSessionAdminMembership } from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getUnknownCorrectionErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof errorWithCode.code === "string" ? errorWithCode.code : undefined,
    };
  }

  return { value: String(error) };
}

function correctionErrorResponse(error: CorrectCompletedMatchScoreError) {
  if (error.code === "MATCH_NOT_FOUND") {
    return null;
  }

  if (
    error.code === "NEWER_OUTSIDE_MATCHES" ||
    error.code === "LEGACY_COLLAB_REPLAY_UNSUPPORTED"
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ error: error.message }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:matches:id:correction:post",
      { limit: 10, windowMs: 60_000 }
    );
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

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:matches:id:correction"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { team1Score, team2Score } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
    };
    if (typeof team1Score !== "number" || typeof team2Score !== "number") {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (!isValidMatchScore(team1Score, team2Score)) {
      return NextResponse.json(
        { error: MATCH_SCORE_ERROR_MESSAGE },
        { status: 400 }
      );
    }

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        team1Score: true,
        team2Score: true,
        sessionId: true,
        session: {
          select: {
            id: true,
            code: true,
            name: true,
            clubId: true,
            isTest: true,
            status: true,
          },
        },
      },
    });

    if (!match) {
      return invalidTargetResponse(request, "api:matches:id:correction");
    }
    if (!canQuickAccessClub(session, match.session.clubId)) {
      return invalidTargetResponse(request, "api:matches:id:correction");
    }
    if (match.status !== MatchStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Only completed matches can be corrected." },
        { status: 400 }
      );
    }
    if (match.session.status !== SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Only ended sessions can correct completed scores." },
        { status: 400 }
      );
    }
    if (match.session.isTest) {
      return NextResponse.json(
        { error: "Test sessions do not support completed score correction." },
        { status: 400 }
      );
    }
    if (match.team1Score === team1Score && match.team2Score === team2Score) {
      return NextResponse.json(
        { error: "Enter a different score to correct this match." },
        { status: 400 }
      );
    }

    const adminMembership = await getSessionAdminMembership(prisma, {
      session: match.session,
      userId: session.user.id,
      acceptedOnly: true,
    });
    const canCorrect =
      !isQuickAccessSession(session) &&
      (!!session.user.isAdmin || !!adminMembership);

    if (!canCorrect) {
      return invalidTargetResponse(request, "api:matches:id:correction");
    }

    const result = await correctCompletedMatchScore({
      matchId: match.id,
      finalTeam1Score: team1Score,
      finalTeam2Score: team2Score,
    });

    logAuditEvent({
      action: "match.score_correction",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      details: {
        newScore: result.newScore,
        oldScore: result.oldScore,
        replayedMatchIds: result.replayedMatchIds,
      },
      outcome: "success",
      request,
      scope: {
        clubId: match.session.clubId ?? undefined,
        route: "/api/matches/[id]/correction",
        sessionCode: match.session.code,
      },
      target: {
        id: match.id,
        name: match.session.name,
        type: "match",
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof CorrectCompletedMatchScoreError) {
      const response = correctionErrorResponse(error);
      return (
        response ??
        invalidTargetResponse(request, "api:matches:id:correction")
      );
    }

    console.error(
      "Correct completed match score error",
      getUnknownCorrectionErrorDetails(error)
    );
    logError("Correct completed match score error", error);
    return safeErrorResponse();
  }
}
