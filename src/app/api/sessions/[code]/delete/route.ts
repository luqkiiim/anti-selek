import { isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { assertSessionMutationActor } from "@/lib/sessionProfileIdentity";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  collectGuestUserIds,
  deleteEphemeralGuestUsers,
  reverseSessionEloChanges,
} from "@/lib/sessionLifecycle";
import { SessionStatus } from "@/types/enums";
import { getAccountClubContext } from "@/lib/playerIdentity";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:delete:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:delete");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const targetSession = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        clubId: true,
        isTest: true,
        collaborationVersion: true,
        status: true,
      },
    });

    if (!targetSession) {
      return invalidTargetResponse(request, "api:sessions:code:delete");
    }

    const hostClubContext = targetSession.clubId
      ? await getAccountClubContext(prisma, {
          userId: session.user.id,
          clubId: targetSession.clubId,
          isGlobalAdmin: !!session.user.isAdmin,
        })
      : null;
    if (!hostClubContext?.canOperate) {
      return sportingJson({ error: "Host only" }, { status: 403 });
    }

    if (
      !targetSession.isTest &&
      targetSession.status === SessionStatus.COMPLETED
    ) {
      return sportingJson(
        {
          error: "Completed tournaments must be rolled back from club history",
        },
        { status: 400 }
      );
    }

    await admissionTransaction(prisma, async (tx) => {
      await assertSessionMutationActor(tx, { session: targetSession, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, hostOnly: true });
      // Recheck inside the writer: deleting an active shared session would bypass reset consent.
      const current = await tx.session.findUnique({ where: { id: targetSession.id }, select: { status: true, collaborationVersion: true } });
      if (current && isUpgradedCollaboration(current) && current.status !== SessionStatus.WAITING) {
        throw new IdentityConflictError("Both clubs must approve a reset before this shared session can be deleted.");
      }
      const sessionPlayers = await tx.sessionPlayer.findMany({
        where: { sessionId: targetSession.id },
        select: { playerId: true, isGuest: true },
      });
      const guestUserIds = collectGuestUserIds(sessionPlayers);

      if (!targetSession.isTest) {
        await reverseSessionEloChanges(tx, {
          sessionId: targetSession.id,
          clubId: targetSession.clubId,
        });
      }

      await tx.court.updateMany({
        where: { sessionId: targetSession.id },
        data: { currentMatchId: null },
      });
      await tx.match.deleteMany({
        where: { sessionId: targetSession.id },
      });
      await tx.sessionPlayer.deleteMany({
        where: { sessionId: targetSession.id },
      });
      await tx.session.delete({
        where: { id: targetSession.id },
      });
      await deleteEphemeralGuestUsers(tx, guestUserIds);
    });

    logAuditEvent({
      action: targetSession.isTest ? "session.delete_test" : "session.cancel",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        clubId: targetSession.clubId ?? undefined,
        route: "/api/sessions/[code]/delete",
        sessionCode: targetSession.code,
      },
      target: {
        id: targetSession.code,
        type: "session",
      },
    });

    return sportingJson({
      success: true,
      code: targetSession.code,
      clubId: targetSession.clubId,
    });
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Delete session error", error);
    return safeErrorResponse();
  }
}
