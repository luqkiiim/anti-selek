import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import {
  buildSessionPoolMap,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
import {
  GenerateMatchError,
  loadSessionRecord,
} from "../generate-match/shared";
import {
  ensureInterclubSessionReady,
  getInterclubTeamClubIdsForPartition,
} from "../generate-match/interclub";
import { parseManualTeams } from "../generate-match/request";
import { validateManualMatchRequest } from "../generate-match/manual";
import { buildMatchmakingState } from "../generate-match/selection";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  createManualQueuedMatchForSession,
  createQueuedMatchForSession,
  replaceQueuedMatchPlayerForSession,
  reshuffleQueuedMatchForSession,
} from "./shared";

async function parseQueueMatchBody(request: Request) {
  const text = await request.text();
  if (!text) {
    return {};
  }

  try {
    const body = JSON.parse(text) as unknown;
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new GenerateMatchError(400, "Invalid request body");
  }
}

async function ensureManagePermission(
  sessionId: string,
  clubId: string | null | undefined,
  userId: string,
  requesterIsAdmin: boolean
) {
  if (requesterIsAdmin) {
    return;
  }

  const membership = await getSessionOperatorMembership(prisma, {
    session: { id: sessionId, clubId },
    userId,
    acceptedOnly: true,
  });

  if (!membership) {
    throw new GenerateMatchError(403, "Unauthorized");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:queue-match:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:queue-match");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await loadSessionRecord(code);

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:queue-match");
    }

    await ensureManagePermission(
      sessionData.id,
      sessionData.clubId,
      session.user.id,
      !!session.user.isAdmin
    );

    const body = await parseQueueMatchBody(request);
    const wantsReshuffle = body.reshuffle === true;
    const excludedUserId =
      typeof body.excludeUserId === "string" ? body.excludeUserId : undefined;
    const replaceUserId =
      typeof body.replaceUserId === "string" ? body.replaceUserId : undefined;

    if (body.excludeUserId !== undefined && !excludedUserId) {
      throw new GenerateMatchError(400, "Invalid excluded player");
    }
    if (body.replaceUserId !== undefined && !replaceUserId) {
      throw new GenerateMatchError(400, "Invalid replacement player");
    }

    ensureInterclubSessionReady(sessionData);

    if (wantsReshuffle) {
      if (replaceUserId) {
        throw new GenerateMatchError(
          400,
          "Replace player cannot be combined with reshuffle."
        );
      }
      if (body.manualTeams !== undefined) {
        throw new GenerateMatchError(
          400,
          "Manual queueing cannot be combined with reshuffle."
        );
      }

      return NextResponse.json({
        queuedMatch: await reshuffleQueuedMatchForSession(sessionData, {
          excludedUserId,
        }),
      });
    }

    if (replaceUserId) {
      if (excludedUserId) {
        throw new GenerateMatchError(
          400,
          "Replace player cannot be combined with excluded-player reshuffle."
        );
      }
      if (body.manualTeams !== undefined) {
        throw new GenerateMatchError(
          400,
          "Replace player cannot be combined with manual queueing."
        );
      }

      return NextResponse.json({
        queuedMatch: await replaceQueuedMatchPlayerForSession(
          sessionData,
          replaceUserId
        ),
      });
    }

    if (excludedUserId) {
      throw new GenerateMatchError(
        400,
        "Excluded-player queue reshuffle must be combined with reshuffle."
      );
    }

    if (body.manualTeams !== undefined) {
      const parsedTeams = parseManualTeams(body.manualTeams);
      const { busyPlayerIds } = await buildMatchmakingState(sessionData);

      validateManualMatchRequest({
        sessionData,
        targetCourt: { currentMatch: null } as Parameters<
          typeof validateManualMatchRequest
        >[0]["targetCourt"],
        parsedTeams,
        busyPlayerIds,
      });
      const teamClubIds = getInterclubTeamClubIdsForPartition(
        sessionData,
        parsedTeams
      );

      const poolSummary = summarizeSessionPoolMembership(
        [
          parsedTeams.team1[0],
          parsedTeams.team1[1],
          parsedTeams.team2[0],
          parsedTeams.team2[1],
        ],
        buildSessionPoolMap(
          sessionData.players,
          (player) => player.userId,
          (player) => player.pool
        )
      );

      return NextResponse.json({
        queuedMatch: await createManualQueuedMatchForSession(
          sessionData,
          parsedTeams,
          poolSummary.dominantPool,
          teamClubIds
        ),
      });
    }

    return NextResponse.json({
      queuedMatch: await createQueuedMatchForSession(sessionData),
    });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      if (error.status === 403) {
        return invalidTargetResponse(request, "api:sessions:code:queue-match");
      }

      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError("Queue next match error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:queue-match:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:queue-match");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await loadSessionRecord(code);

    if (!sessionData) {
      return invalidTargetResponse(_request, "api:sessions:code:queue-match");
    }

    await ensureManagePermission(
      sessionData.id,
      sessionData.clubId,
      session.user.id,
      !!session.user.isAdmin
    );

    await prisma.queuedMatch.deleteMany({
      where: { sessionId: sessionData.id },
    });

    return NextResponse.json({ ok: true, queuedMatch: null });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      if (error.status === 403) {
        return invalidTargetResponse(_request, "api:sessions:code:queue-match");
      }

      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError("Clear queued match error", error);
    return safeErrorResponse();
  }
}
