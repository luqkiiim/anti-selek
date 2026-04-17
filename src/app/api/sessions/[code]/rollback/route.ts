import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import {
  collectGuestUserIds,
  computeRollbackEloDeltas,
  deleteEphemeralGuestUsers,
} from "@/lib/sessionLifecycle";
import { MatchStatus, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

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
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        communityId: true,
        isTest: true,
      },
    });

    if (!targetSession) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (targetSession.isTest) {
      return NextResponse.json(
        { error: "Test sessions use reset or delete instead of rollback" },
        { status: 400 }
      );
    }
    if (targetSession.status !== SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Only completed tournaments can be rolled back" },
        { status: 400 }
      );
    }

    let isCommunityAdmin = false;
    if (targetSession.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: targetSession.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const freshTarget = await tx.session.findUnique({
        where: { id: targetSession.id },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          communityId: true,
          endedAt: true,
          createdAt: true,
          isTest: true,
        },
      });

      if (!freshTarget) {
        throw new Error("NOT_FOUND");
      }
      if (freshTarget.isTest) {
        throw new Error("IS_TEST");
      }
      if (freshTarget.status !== SessionStatus.COMPLETED) {
        throw new Error("NOT_COMPLETED");
      }

      const latestCompleted = await tx.session.findFirst({
        where: {
          communityId: freshTarget.communityId,
          status: SessionStatus.COMPLETED,
          isTest: false,
        },
        orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });

      if (!latestCompleted || latestCompleted.id !== freshTarget.id) {
        throw new Error("NOT_LATEST_COMPLETED");
      }

      const sessionPlayers = await tx.sessionPlayer.findMany({
        where: { sessionId: freshTarget.id },
        select: { userId: true, isGuest: true },
      });

      const isGuestByUserId = new Map<string, boolean>(
        sessionPlayers.map((row) => [row.userId, row.isGuest])
      );
      const guestUserIds = collectGuestUserIds(sessionPlayers);

      const completedMatches = await tx.match.findMany({
        where: {
          sessionId: freshTarget.id,
          status: MatchStatus.COMPLETED,
        },
        select: {
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1EloChange: true,
          team2EloChange: true,
        },
      });

      const eloReverseDeltaByUserId = computeRollbackEloDeltas(
        completedMatches,
        isGuestByUserId
      );

      for (const [userId, delta] of eloReverseDeltaByUserId.entries()) {
        if (delta === 0) continue;
        if (freshTarget.communityId) {
          await tx.communityMember.updateMany({
            where: {
              communityId: freshTarget.communityId,
              userId,
            },
            data: {
              elo: { increment: delta },
            },
          });
        } else {
          await tx.user.updateMany({
            where: { id: userId },
            data: {
              elo: { increment: delta },
            },
          });
        }
      }

      await tx.court.updateMany({
        where: { sessionId: freshTarget.id },
        data: { currentMatchId: null },
      });
      await tx.match.deleteMany({
        where: { sessionId: freshTarget.id },
      });
      await tx.sessionPlayer.deleteMany({
        where: { sessionId: freshTarget.id },
      });
      await tx.session.delete({
        where: { id: freshTarget.id },
      });

      await deleteEphemeralGuestUsers(tx, guestUserIds);

      return {
        sessionCode: freshTarget.code,
        sessionName: freshTarget.name,
        reversedPlayers: eloReverseDeltaByUserId.size,
      };
    });

    logAuditEvent({
      action: "session.rollback",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      details: {
        reversedPlayers: result.reversedPlayers,
      },
      outcome: "success",
      request: _request,
      scope: {
        route: "/api/sessions/[code]/rollback",
        sessionCode: result.sessionCode,
      },
      target: {
        id: result.sessionCode,
        name: result.sessionName,
        type: "session",
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (message === "NOT_COMPLETED") {
      return NextResponse.json(
        { error: "Only completed tournaments can be rolled back" },
        { status: 400 }
      );
    }
    if (message === "IS_TEST") {
      return NextResponse.json(
        { error: "Test sessions use reset or delete instead of rollback" },
        { status: 400 }
      );
    }
    if (message === "NOT_LATEST_COMPLETED") {
      return NextResponse.json(
        { error: "Only the latest completed tournament can be rolled back" },
        { status: 409 }
      );
    }

    console.error("Rollback tournament error:", error);
    return NextResponse.json(
      { error: "Failed to rollback tournament" },
      { status: 500 }
    );
  }
}
