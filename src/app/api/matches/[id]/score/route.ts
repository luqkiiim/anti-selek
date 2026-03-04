import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidBadmintonScore } from "@/lib/matchRules";
import { MatchStatus } from "@/types/enums";

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
        status: true,
        session: {
          select: {
            communityId: true,
          },
        },
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
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

    const isAdmin = isCommunityAdmin;
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

    // Update match with pending approval status using atomic updateMany
    const updatedResult = await prisma.match.updateMany({
      where: { id, status: MatchStatus.IN_PROGRESS },
      data: {
        team1Score,
        team2Score,
        winnerTeam,
        status: MatchStatus.PENDING_APPROVAL,
        completedAt: new Date(),
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
