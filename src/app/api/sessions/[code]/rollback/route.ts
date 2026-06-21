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
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:rollback:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:rollback");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        clubId: true,
        isTest: true,
        club: {
          select: {
            isTutorial: true,
            tutorialOwnerId: true,
          },
        },
      },
    });

    if (!targetSession) {
      return invalidTargetResponse(_request, "api:sessions:code:rollback");
    }
    if (targetSession.isTest) {
      return NextResponse.json(
        { error: "Test sessions use reset or delete instead of rollback" },
        { status: 400 }
      );
    }
    if (targetSession.club?.isTutorial) {
      if (targetSession.club.tutorialOwnerId !== session.user.id) {
        return invalidTargetResponse(_request, "api:sessions:code:rollback");
      }
      return NextResponse.json(
        { error: "Tutorial playground history is restored with reset." },
        { status: 400 }
      );
    }
    if (targetSession.status !== SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Only completed tournaments can be rolled back" },
        { status: 400 }
      );
    }

    let isClubAdmin = false;
    if (targetSession.clubId) {
      const membership = await prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: targetSession.clubId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isClubAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isClubAdmin) {
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
          clubId: true,
          endedAt: true,
          createdAt: true,
          isTest: true,
          club: {
            select: {
              isTutorial: true,
            },
          },
        },
      });

      if (!freshTarget) {
        throw new Error("NOT_FOUND");
      }
      if (freshTarget.isTest) {
        throw new Error("IS_TEST");
      }
      if (freshTarget.club?.isTutorial) {
        throw new Error("IS_TUTORIAL");
      }
      if (freshTarget.status !== SessionStatus.COMPLETED) {
        throw new Error("NOT_COMPLETED");
      }

      const latestCompleted = await tx.session.findFirst({
        where: {
          clubId: freshTarget.clubId,
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
          id: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1EloChange: true,
          team2EloChange: true,
        },
      });

      const ledgerAdjustments = await tx.matchEloAdjustment.findMany({
        where: {
          matchId: { in: completedMatches.map((match) => match.id) },
        },
        select: {
          clubId: true,
          userId: true,
          delta: true,
        },
      });

      const reversedPlayerKeys = new Set<string>();
      if (ledgerAdjustments.length > 0) {
        const reverseDeltaByClubAndUserId = new Map<
          string,
          { clubId: string; userId: string; delta: number }
        >();
        for (const adjustment of ledgerAdjustments) {
          const key = `${adjustment.clubId}:${adjustment.userId}`;
          const current = reverseDeltaByClubAndUserId.get(key) ?? {
            clubId: adjustment.clubId,
            userId: adjustment.userId,
            delta: 0,
          };
          current.delta -= adjustment.delta;
          reverseDeltaByClubAndUserId.set(key, current);
        }

        for (const item of reverseDeltaByClubAndUserId.values()) {
          if (item.delta === 0) continue;
          await tx.clubMember.updateMany({
            where: {
              clubId: item.clubId,
              userId: item.userId,
            },
            data: {
              elo: { increment: item.delta },
            },
          });
          reversedPlayerKeys.add(`${item.clubId}:${item.userId}`);
        }
      } else {
        const eloReverseDeltaByUserId = computeRollbackEloDeltas(
          completedMatches,
          isGuestByUserId
        );

        for (const [userId, delta] of eloReverseDeltaByUserId.entries()) {
          if (delta === 0) continue;
          if (freshTarget.clubId) {
            await tx.clubMember.updateMany({
              where: {
                clubId: freshTarget.clubId,
                userId,
              },
              data: {
                elo: { increment: delta },
              },
            });
            reversedPlayerKeys.add(`${freshTarget.clubId}:${userId}`);
          } else {
            await tx.user.updateMany({
              where: { id: userId },
              data: {
                elo: { increment: delta },
              },
            });
            reversedPlayerKeys.add(userId);
          }
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
        reversedPlayers: reversedPlayerKeys.size,
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
      return invalidTargetResponse(_request, "api:sessions:code:rollback");
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
    if (message === "IS_TUTORIAL") {
      return NextResponse.json(
        { error: "Tutorial playground history is restored with reset." },
        { status: 400 }
      );
    }
    if (message === "NOT_LATEST_COMPLETED") {
      return NextResponse.json(
        { error: "Only the latest completed tournament can be rolled back" },
        { status: 409 }
      );
    }

    logError("Rollback tournament error", error);
    return safeErrorResponse();
  }
}
