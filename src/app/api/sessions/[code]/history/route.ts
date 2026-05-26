import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canQuickAccessCommunity, isQuickAccessSession } from "@/lib/quickAccess";
import {
  getSessionMembership,
  getSessionOperatorMembership,
} from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getSessionHistory(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;

  if (typeof code !== "string" || code.length === 0) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:history");

  if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

  const sessionData = await prisma.session.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      communityId: true,
      name: true,
      status: true,
      type: true,
      mode: true,
      createdAt: true,
      endedAt: true,
      players: {
        select: {
          userId: true,
        },
      },
      matches: {
        where: {
          status: {
            in: [MatchStatus.COMPLETED, MatchStatus.PENDING_APPROVAL],
          },
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true,
          winnerTeam: true,
          team1Score: true,
          team2Score: true,
          team1EloChange: true,
          team2EloChange: true,
          court: {
            select: {
              courtNumber: true,
              label: true,
            },
          },
          team1User1: { select: { id: true, name: true } },
          team1User2: { select: { id: true, name: true } },
          team2User1: { select: { id: true, name: true } },
          team2User2: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!sessionData) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }
  if (!canQuickAccessCommunity(session, sessionData.communityId)) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }

  const membership = await getSessionMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const operatorMembership = await getSessionOperatorMembership(prisma, {
    session: sessionData,
    userId: session.user.id,
    acceptedOnly: true,
  });
  const communityRole = membership?.role ?? null;

  const isSessionPlayer = sessionData.players.some((player) => player.userId === session.user.id);
  const viewerCanManage =
    !isQuickAccessSession(session) &&
    (!!session.user.isAdmin || !!operatorMembership);
  const canView =
    viewerCanManage ||
    !!communityRole ||
    isSessionPlayer;
  if (!canView) {
    return invalidTargetResponse(_request, "api:sessions:code:history");
  }

  const undoableMatchId =
    viewerCanManage && sessionData.status === SessionStatus.ACTIVE
      ? (sessionData.matches.find(
          (match) => match.status === MatchStatus.COMPLETED
        )?.id ?? null)
      : null;

  return NextResponse.json({
    session: {
      id: sessionData.id,
      code: sessionData.code,
      communityId: sessionData.communityId,
      name: sessionData.name,
      status: sessionData.status,
      type: sessionData.type,
      mode: sessionData.mode,
      createdAt: sessionData.createdAt,
      endedAt: sessionData.endedAt,
    },
    viewerCanManage,
    undoableMatchId,
    matches: sessionData.matches,
  });
}

export async function GET(...args: Parameters<typeof getSessionHistory>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:sessions:code:history:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getSessionHistory(...args);
  } catch (error) {
    logError("Load session history error", error);
    return safeErrorResponse();
  }
}
