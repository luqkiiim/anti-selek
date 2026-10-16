import { assertCollaborationPermission, collaborationEvent, isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { assertSessionMutationActor } from "@/lib/sessionProfileIdentity";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { withSessionProfileRatings } from "@/lib/sessionProfileIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { captureAchievementEligibility } from "@/lib/clubAchievementService";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getAcceptedSessionClubIds,
  getPlayerClubBadges,
  getSessionOperatorMembership,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import { MatchStatus, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(_request, "api:sessions:code:end:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(_request, "api:sessions:code:end");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        endedAt: true,
        collaborationVersion: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(_request, "api:sessions:code:end");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    if (!session.user.isAdmin && !operatorMembership) {
      return sportingJson({ error: "Admin or staff only" }, { status: 403 });
    }

    const endBody = await _request.json().catch(() => ({}));
    const endedAt = sessionData.endedAt ?? new Date();
    const updated = await admissionTransaction(prisma, async (tx) => {
      await assertSessionMutationActor(tx, { session: sessionData, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
      if (isUpgradedCollaboration(sessionData)) {
        const {session: current} = await assertCollaborationPermission(tx, {sessionId: sessionData.id, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, kind: "host"});
        if (current.status !== "ACTIVE") throw new IdentityConflictError("Only an active session can be ended.");
        if (await tx.match.count({where:{sessionId:current.id,status:{in:["PENDING","IN_PROGRESS","PENDING_APPROVAL"]}}})) throw new IdentityConflictError("Complete or undo the unfinished matches before ending this session.");
        const remaining = await tx.sessionLineupRow.count({where:{sessionId:current.id,matchId:null,cancelled:false}});
        if (remaining && endBody?.acknowledgeRemainingLineup !== true) throw new IdentityConflictError("Confirm ending with unplayed lineup matches.");
        await tx.sessionLineupRow.updateMany({where:{sessionId:current.id,matchId:null,cancelled:false},data:{cancelled:true,revision:{increment:1},hostConfirmedRevision:null,partnerConfirmedRevision:null}});
        await collaborationEvent(tx,current.id,session.user.id,"SESSION_END",{unplayedRows:remaining});
      }
      await tx.queuedMatch.deleteMany({
        where: { sessionId: sessionData.id },
      });

      await tx.court.updateMany({
        where: { sessionId: sessionData.id },
        data: { currentMatchId: null },
      });

      await tx.match.deleteMany({
        where: {
          sessionId: sessionData.id,
          status: {
            in: [
              MatchStatus.PENDING,
              MatchStatus.IN_PROGRESS,
              MatchStatus.PENDING_APPROVAL,
            ],
          },
        },
      });

      await tx.sessionPlayer.updateMany({
        where: {
          sessionId: sessionData.id,
        },
        data: { pendingPool: null, isPaused: false, pausedAt: null },
      });

      const ended = await tx.session.update({
        where: { code },
        data: { status: SessionStatus.COMPLETED, endedAt },
        include: {
          courts: { include: { currentMatch: true } },
          players: {
            include: {
              player: {
                select: { id: true, name: true, avatarKey: true, elo: true },
              },
            },
          },
        },
      });
      const achievementClubIds = await getAcceptedSessionClubIds(tx, ended);
      await captureAchievementEligibility(tx, ended.id, achievementClubIds);
      return ended;
    });

    const linkedClubIds = await getAcceptedSessionClubIds(
      prisma,
      updated
    );
    const playerIds = updated.players.map((p) => p.playerId);
    const legacyPlayers =
      updated.ratingPolicyVersion === 2 ? updated.players :
      linkedClubIds.length > 1 && updated.players.length > 0
        ? withPlayerClubBadges(
            updated.players,
            await getPlayerClubBadges(prisma, linkedClubIds, playerIds),
            updated.clubId
          )
        : updated.clubId && updated.players.length > 0
          ? withClubElo(
              updated.players,
              await getClubEloByUserId(updated.clubId, playerIds)
            )
          : updated.players;

    const players = await withSessionProfileRatings(prisma, updated, legacyPlayers);

    return sportingJson({
      ...updated,
      players: players.map((player) => ({
        ...player,
        player: serializeAvatarEntity(player.player),
      })),
      queuedMatch: null,
    });
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("End session error", error);
    return safeErrorResponse();
  }
}
