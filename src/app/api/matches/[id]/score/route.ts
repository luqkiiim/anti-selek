import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalizeMatchResult } from "@/lib/matchCompletion";
import { shouldRequireOpponentApproval } from "@/lib/matchApprovalRules";
import { prisma } from "@/lib/prisma";
import { isValidBadmintonScore } from "@/lib/matchRules";
import { MatchStatus } from "@/types/enums";
import { autoAssignQueuedMatch } from "../../_lib/autoAssignQueuedMatch";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { team1Score, team2Score } = body as {
      team1Score?: unknown;
      team2Score?: unknown;
    };

    const match = await prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        sessionId: true,
        courtId: true,
        status: true,
        session: {
          select: {
            communityId: true,
            type: true,
            isTest: true,
          },
        },
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
        team1User1: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team1User2: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team2User1: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
        team2User2: {
          select: { id: true, name: true, elo: true, isClaimed: true },
        },
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    let isCommunityAdmin = false;
    if (match.session.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: match.session.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    const isAdmin = !!session.user.isAdmin || isCommunityAdmin;
    const isParticipant = [
      match.team1User1Id,
      match.team1User2Id,
      match.team2User1Id,
      match.team2User2Id,
    ].includes(session.user.id);

    if (!isAdmin && !isParticipant) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (typeof team1Score !== "number" || typeof team2Score !== "number") {
      return NextResponse.json({ error: "Invalid score" }, { status: 400 });
    }
    if (!isValidBadmintonScore(team1Score, team2Score)) {
      return NextResponse.json(
        { error: "Score must be 21+ win by 2, or 30-29 cap" },
        { status: 400 }
      );
    }

    const winnerTeam = team1Score > team2Score ? 1 : 2;
    const claimedByUserId = new Map<string, boolean>([
      [match.team1User1.id, match.team1User1.isClaimed],
      [match.team1User2.id, match.team1User2.isClaimed],
      [match.team2User1.id, match.team2User1.isClaimed],
      [match.team2User2.id, match.team2User2.isClaimed],
    ]);
    const requiresApproval = shouldRequireOpponentApproval({
      match,
      submitterUserId: session.user.id,
      submitterIsAdmin: isAdmin,
      claimedByUserId,
    });

    if (!requiresApproval) {
      try {
        const updated = await finalizeMatchResult({
          match,
          expectedStatus: MatchStatus.IN_PROGRESS,
          finalTeam1Score: team1Score,
          finalTeam2Score: team2Score,
          scoreSubmittedByUserId: session.user.id,
        });
        const { autoAssignedMatch, queuedMatchCleared } =
          await autoAssignQueuedMatch(match.sessionId);
        return NextResponse.json({
          ...updated,
          autoAssignedMatch,
          queuedMatchCleared,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message === "ALREADY_PROCESSED") {
          return NextResponse.json(
            { error: "Match already completed or updated." },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    const updatedResult = await prisma.match.updateMany({
      where: { id, status: MatchStatus.IN_PROGRESS },
      data: {
        team1Score,
        team2Score,
        winnerTeam,
        status: MatchStatus.PENDING_APPROVAL,
        completedAt: new Date(),
        scoreSubmittedByUserId: session.user.id,
      },
    });

    if (updatedResult.count === 0) {
      // Re-fetch to see current status for better error message
      const currentMatch = await prisma.match.findUnique({ where: { id } });
      return NextResponse.json(
        {
          error: `Cannot submit score. Match is currently ${currentMatch?.status || "unknown"}. Expected ${MatchStatus.IN_PROGRESS}.`,
          status: currentMatch?.status,
        },
        { status: 409 }
      );
    }

    // Fetch updated match for the response
    const updated = await prisma.match.findUnique({
      where: { id },
      include: {
        team1User1: { select: { id: true, name: true } },
        team1User2: { select: { id: true, name: true } },
        team2User1: { select: { id: true, name: true } },
        team2User2: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Score submission error:", error);
    return NextResponse.json({ error: "Failed to submit score" }, { status: 500 });
  }
}
