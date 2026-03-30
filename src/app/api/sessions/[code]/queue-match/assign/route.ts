import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { prisma } from "@/lib/prisma";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import { createQueuedMatchAssignment } from "../../generate-match/assignments";
import { buildMatchmakingState } from "../../generate-match/selection";
import {
  GenerateMatchError,
  loadCourtRecords,
  loadSessionRecord,
} from "../../generate-match/shared";
import { validateManualMatchRequest } from "../../generate-match/manual";

async function ensureManagePermission(
  communityId: string | null | undefined,
  userId: string,
  requesterIsAdmin: boolean
) {
  if (requesterIsAdmin) {
    return;
  }

  if (!communityId) {
    throw new GenerateMatchError(403, "Unauthorized");
  }

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId,
      },
    },
    select: { role: true },
  });

  if (membership?.role !== "ADMIN") {
    throw new GenerateMatchError(403, "Unauthorized");
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const sessionData = await loadSessionRecord(code);

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await ensureManagePermission(
      sessionData.communityId,
      session.user.id,
      !!session.user.isAdmin
    );

    if (sessionData.status !== "ACTIVE") {
      throw new GenerateMatchError(400, "Session not active");
    }

    if (!sessionData.queuedMatch) {
      throw new GenerateMatchError(404, "No queued match to assign.");
    }

    const openCourts = await prisma.court.findMany({
      where: {
        sessionId: sessionData.id,
        currentMatchId: null,
      },
      orderBy: { courtNumber: "asc" },
      include: { currentMatch: true },
    });

    const targetCourt = openCourts[0];
    if (!targetCourt) {
      throw new GenerateMatchError(409, "No free court available for the queued match.");
    }

    const { playersById, rotationHistory } = await buildMatchmakingState(
      sessionData,
      { reserveQueuedPlayers: false }
    );
    const busyPlayerIds = getBusyPlayerIds(sessionData.matches);
    const partition = {
      team1: [
        sessionData.queuedMatch.team1User1Id,
        sessionData.queuedMatch.team1User2Id,
      ] as [string, string],
      team2: [
        sessionData.queuedMatch.team2User1Id,
        sessionData.queuedMatch.team2User2Id,
      ] as [string, string],
    };

    validateManualMatchRequest({
      sessionData,
      targetCourt,
      parsedTeams: partition,
      busyPlayerIds,
      playersById,
      rotationHistory,
    });

    const match = await createQueuedMatchAssignment({
      sessionId: sessionData.id,
      queuedMatchId: sessionData.queuedMatch.id,
      courtId: targetCourt.id,
      partition,
    });

    return NextResponse.json({
      ...match,
      courtId: targetCourt.id,
      assignedCourt: {
        id: targetCourt.id,
        label: getCourtDisplayLabel(targetCourt),
      },
    });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Assign queued match error:", error);
    return NextResponse.json(
      { error: "Failed to assign queued match" },
      { status: 500 }
    );
  }
}
