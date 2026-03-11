import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatchStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

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
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.status !== MatchStatus.PENDING_APPROVAL) {
      return NextResponse.json({ error: "Match is not pending approval" }, { status: 400 });
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
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can reopen score entry" }, { status: 403 });
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
      },
    });

    if (updatedResult.count === 0) {
      return NextResponse.json(
        { error: "Match was already updated by someone else." },
        { status: 409 }
      );
    }

    const updatedMatch = await prisma.match.findUnique({
      where: { id },
      include: {
        team1User1: { select: { id: true, name: true } },
        team1User2: { select: { id: true, name: true } },
        team2User1: { select: { id: true, name: true } },
        team2User2: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error("Reopen score error:", error);
    return NextResponse.json({ error: "Failed to reopen score entry" }, { status: 500 });
  }
}
