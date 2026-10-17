import { assertSessionMutationActor } from "@/lib/sessionProfileIdentity";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { assertSelectedProfileLedger } from "@/lib/matchCompletion";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccountClubContext } from "@/lib/playerIdentity";
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
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
      return sportingJson(
        { error: "Test tournaments use reset or delete instead of rollback" },
        { status: 400 }
      );
    }
    if (targetSession.club?.isTutorial) {
      if (targetSession.club.tutorialOwnerId !== session.user.id) {
        return invalidTargetResponse(_request, "api:sessions:code:rollback");
      }
      return sportingJson(
        { error: "Tutorial playground history is restored with reset." },
        { status: 400 }
      );
    }
    if (targetSession.status !== SessionStatus.COMPLETED) {
      return sportingJson(
        { error: "Only completed tournaments can be rolled back" },
        { status: 400 }
      );
    }

    const hostClubContext = targetSession.clubId
      ? await getAccountClubContext(prisma, {
          userId: session.user.id,
          clubId: targetSession.clubId,
          isGlobalAdmin: !!session.user.isAdmin,
        })
      : null;

    if (!hostClubContext?.canAdmin) {
      return sportingJson({ error: "Admin only" }, { status: 403 });
    }

    const result = await admissionTransaction(prisma, async (tx) => {
      await assertSessionMutationActor(tx, { session: targetSession, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, hostOnly: true, adminOnly: true });
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
          ratingPolicyVersion: true,
          ratingMode: true,
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
        select: { playerId: true, isGuest: true },
      });

      const isGuestByUserId = new Map<string, boolean>(
        sessionPlayers.map((row) => [row.playerId, row.isGuest])
      );
      const guestUserIds = collectGuestUserIds(sessionPlayers);

      const completedMatches = await tx.match.findMany({
        where: {
          sessionId: freshTarget.id,
          status: MatchStatus.COMPLETED,
        },
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          team1Player1Id: true,
          team1Player2Id: true,
          team2Player1Id: true,
          team2Player2Id: true,
          team1EloChange: true,
          team2EloChange: true,
        },
      });

      const ledgerAdjustments = await tx.matchEloAdjustment.findMany({
        where: {
          matchId: { in: completedMatches.map((match) => match.id) },
        },
        select: {
          matchId: true,
          clubId: true,
          playerId: true,
          delta: true,
        },
      });

      const isRated = freshTarget.ratingMode !== "UNRATED";
      if (!isRated && ledgerAdjustments.length > 0) throw new IdentityConflictError("Unrated results unexpectedly contain rating ledger rows; rollback is blocked.");
      if (isRated && freshTarget.ratingPolicyVersion === 2) {
        for (const match of completedMatches) await assertSelectedProfileLedger(tx, freshTarget.id, [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id], ledgerAdjustments.filter(a => a.matchId === match.id));
      }
      // Removing earlier Elo updates would change the inputs used by later
      // results. This endpoint reverses one tournament; it cannot replay others.
      if (isRated && completedMatches.length > 0) {
        const affectedProfiles = ledgerAdjustments.length > 0
          ? ledgerAdjustments.filter(adjustment => adjustment.delta !== 0).map(({ clubId, playerId }) => ({ clubId, playerId }))
          : freshTarget.ratingPolicyVersion !== 2 && freshTarget.clubId
            ? completedMatches.flatMap(match => [
                ...((match.team1EloChange ?? 0) !== 0 ? [match.team1Player1Id, match.team1Player2Id] : []),
                ...((match.team2EloChange ?? 0) !== 0 ? [match.team2Player1Id, match.team2Player2Id] : []),
              ].filter(playerId => !isGuestByUserId.get(playerId)).map(playerId => ({ clubId: freshTarget.clubId!, playerId })))
            : [];
        if (affectedProfiles.length > 0) {
          const affectedClubIds = [...new Set(affectedProfiles.map(profile => profile.clubId))];
          const affectedPlayerIds = [...new Set(affectedProfiles.map(profile => profile.playerId))];
          const firstResultAt = new Date(Math.min(...completedMatches.map(match => (match.completedAt ?? match.createdAt).getTime())));
          const laterAffectedMatch = await tx.match.findFirst({
            where: {
              sessionId: { not: freshTarget.id },
              status: MatchStatus.COMPLETED,
              session: { isTest: false, ratingMode: "RATED" },
              AND: [
                { OR: [{ completedAt: { gte: firstResultAt } }, { completedAt: null, createdAt: { gte: firstResultAt } }] },
                { OR: [
                  { eloAdjustments: { some: { OR: affectedProfiles } } },
                  {
                    AND: [
                      { session: { OR: [{ clubId: { in: affectedClubIds } }, { sessionClubs: { some: { clubId: { in: affectedClubIds }, status: "ACCEPTED" } } }] } },
                      { OR: [{ team1Player1Id: { in: affectedPlayerIds } }, { team1Player2Id: { in: affectedPlayerIds } }, { team2Player1Id: { in: affectedPlayerIds } }, { team2Player2Id: { in: affectedPlayerIds } }] },
                    ],
                  },
                ] },
              ],
            },
            select: { id: true },
          });
          if (laterAffectedMatch) throw new IdentityConflictError("Later rated results use these club ratings. Roll back those tournaments first.");
        }
      }
      const reversedPlayerKeys = new Set<string>();
      if (isRated && ledgerAdjustments.length > 0) {
        const reverseDeltaByClubAndUserId = new Map<
          string,
          { clubId: string; playerId: string; delta: number }
        >();
        for (const adjustment of ledgerAdjustments) {
          const key = `${adjustment.clubId}:${adjustment.playerId}`;
          const current = reverseDeltaByClubAndUserId.get(key) ?? {
            clubId: adjustment.clubId,
            playerId: adjustment.playerId,
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
              playerId: item.playerId,
            },
            data: {
              elo: { increment: item.delta },
            },
          });
          reversedPlayerKeys.add(`${item.clubId}:${item.playerId}`);
        }
      } else if (isRated && freshTarget.ratingPolicyVersion !== 2) {
        const eloReverseDeltaByUserId = computeRollbackEloDeltas(
          completedMatches,
          isGuestByUserId
        );

        for (const [playerId, delta] of eloReverseDeltaByUserId.entries()) {
          if (delta === 0) continue;
          if (freshTarget.clubId) {
            await tx.clubMember.updateMany({
              where: {
                clubId: freshTarget.clubId,
                playerId,
              },
              data: {
                elo: { increment: delta },
              },
            });
            reversedPlayerKeys.add(`${freshTarget.clubId}:${playerId}`);
          } else {
            await tx.player.updateMany({
              where: { id: playerId },
              data: {
                elo: { increment: delta },
              },
            });
            reversedPlayerKeys.add(playerId);
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

    return sportingJson({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") {
      return invalidTargetResponse(_request, "api:sessions:code:rollback");
    }
    if (message === "NOT_COMPLETED") {
      return sportingJson(
        { error: "Only completed tournaments can be rolled back" },
        { status: 400 }
      );
    }
    if (message === "IS_TEST") {
      return sportingJson(
        { error: "Test tournaments use reset or delete instead of rollback" },
        { status: 400 }
      );
    }
    if (message === "IS_TUTORIAL") {
      return sportingJson(
        { error: "Tutorial playground history is restored with reset." },
        { status: 400 }
      );
    }
    if (message === "NOT_LATEST_COMPLETED") {
      return sportingJson(
        { error: "Only the latest completed tournament can be rolled back" },
        { status: 409 }
      );
    }

    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Rollback tournament error", error);
    return safeErrorResponse();
  }
}
