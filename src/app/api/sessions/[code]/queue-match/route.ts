import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildMatchmakingState,
  ensureEnoughPlayers,
  getRankedCandidates,
  selectSingleCourtMatch,
} from "../generate-match/service";
import { GenerateMatchError, loadSessionRecord } from "../generate-match/shared";

function buildQueuedMatchResponse(
  sessionData: NonNullable<Awaited<ReturnType<typeof loadSessionRecord>>>,
  queuedMatch: {
    id: string;
    createdAt: Date;
    team1User1Id: string;
    team1User2Id: string;
    team2User1Id: string;
    team2User2Id: string;
  }
) {
  const playerById = new Map(
    sessionData.players.map((player) => [player.userId, player.user])
  );

  return {
    id: queuedMatch.id,
    createdAt: queuedMatch.createdAt,
    team1User1: playerById.get(queuedMatch.team1User1Id),
    team1User2: playerById.get(queuedMatch.team1User2Id),
    team2User1: playerById.get(queuedMatch.team2User1Id),
    team2User2: playerById.get(queuedMatch.team2User2Id),
  };
}

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

    if (sessionData.queuedMatch) {
      throw new GenerateMatchError(409, "A next match is already queued.");
    }

    const courts = await prisma.court.findMany({
      where: { sessionId: sessionData.id },
      select: {
        id: true,
        currentMatchId: true,
      },
    });

    if (courts.some((court) => court.currentMatchId === null)) {
      throw new GenerateMatchError(
        400,
        "Queue next match is only available when all courts are in use."
      );
    }

    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { availableCandidates, rankedCandidates } = getRankedCandidates(
      sessionData,
      busyPlayerIds
    );

    ensureEnoughPlayers(availableCandidates.length, rankedCandidates.length, 1);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    const queuedMatch = await prisma.queuedMatch.create({
      data: {
        sessionId: sessionData.id,
        team1User1Id: selection.partition.team1[0],
        team1User2Id: selection.partition.team1[1],
        team2User1Id: selection.partition.team2[0],
        team2User2Id: selection.partition.team2[1],
      },
    });

    return NextResponse.json({
      queuedMatch: buildQueuedMatchResponse(sessionData, queuedMatch),
    });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Queue next match error:", error);
    return NextResponse.json(
      { error: "Failed to queue next match" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await prisma.queuedMatch.deleteMany({
      where: { sessionId: sessionData.id },
    });

    return NextResponse.json({ ok: true, queuedMatch: null });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Clear queued match error:", error);
    return NextResponse.json(
      { error: "Failed to clear queued match" },
      { status: 500 }
    );
  }
}
