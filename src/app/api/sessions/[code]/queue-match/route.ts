import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSessionPoolMap,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
import {
  GenerateMatchError,
  loadSessionRecord,
} from "../generate-match/shared";
import { parseManualTeams } from "../generate-match/request";
import { validateManualMatchRequest } from "../generate-match/manual";
import { buildMatchmakingState } from "../generate-match/selection";
import {
  createManualQueuedMatchForSession,
  createQueuedMatchForSession,
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
  request: Request,
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

    const body = await parseQueueMatchBody(request);
    if (body.manualTeams !== undefined) {
      const parsedTeams = parseManualTeams(body.manualTeams);
      const { busyPlayerIds, playersById, rotationHistory } =
        await buildMatchmakingState(sessionData);

      validateManualMatchRequest({
        sessionData,
        targetCourt: { currentMatch: null } as Parameters<
          typeof validateManualMatchRequest
        >[0]["targetCourt"],
        parsedTeams,
        busyPlayerIds,
        playersById,
        rotationHistory,
        ignorePools: body.ignorePools === true,
      });

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
          poolSummary.dominantPool
        ),
      });
    }

    return NextResponse.json({
      queuedMatch: await createQueuedMatchForSession(sessionData),
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
