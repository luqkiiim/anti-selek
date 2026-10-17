import { assertCollaborationPermission, assertRulesAgreed, isUpgradedCollaboration, collaborationEvent } from "@/lib/sessionCollaboration";
import { isLineupRowReady, validateLineupPlayers } from "@/lib/sessionLineup";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { assertSessionMutationActor, assertSessionProfileContextsUnambiguous } from "@/lib/sessionProfileIdentity";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { withSessionProfileRatings } from "@/lib/sessionProfileIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { getClubEloByUserId, withClubElo } from "@/lib/clubElo";
import {
  getPlayerClubBadges,
  getSessionOperatorMembership,
  getSessionClubLinks,
  withPlayerClubBadges,
} from "@/lib/sessionCollab";
import {
  PlayerGender,
  SessionPairingMode,
  SessionPool,
  SessionStatus,
} from "@/types/enums";
import { SessionClubStatus } from "@/types/enums";
import {
  ensureInterclubSessionReady,
} from "../generate-match/interclub";
import { GenerateMatchError } from "../generate-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:start:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:start");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: {
        players: {
          include: { player: { select: { name: true } } },
        },
        sessionClubs: true,
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:start");
    }

    const operatorMembership = await getSessionOperatorMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });
    if (!session.user.isAdmin && !operatorMembership) {
      return sportingJson({ error: "Admin or staff only" }, { status: 403 });
    }

    if (sessionData.status !== SessionStatus.WAITING) {
      return sportingJson(
        { error: "Tournament already started" },
        { status: 400 }
      );
    }
    const clubLinks = await getSessionClubLinks(prisma, sessionData);
    const pendingPartner = clubLinks.find(
      (link) => link.status !== SessionClubStatus.ACCEPTED
    );
    if (pendingPartner) {
      return sportingJson(
        { error: "Partner club must approve this collab before it can start" },
        { status: 409 }
      );
    }
    ensureInterclubSessionReady(sessionData);
    if (sessionData.poolsEnabled) {
      const activeRoster = sessionData.players.filter(
        (player) => !player.isPaused
      );
      const competitiveCount = activeRoster.filter(
        (player) => player.pool === SessionPool.A
      ).length;
      const socialCount = activeRoster.filter(
        (player) => player.pool === SessionPool.B
      ).length;
      if (competitiveCount < 2 || socialCount < 2) {
        return sportingJson(
          {
            error:
              "Player groups require at least 2 Competitive and 2 Social players before starting",
          },
          { status: 400 }
        );
      }
    }
    if (sessionData.pairingMode === SessionPairingMode.MIXED) {
      const playerMissingGender = sessionData.players.find(
        (player) =>
          player.gender !== PlayerGender.MALE &&
          player.gender !== PlayerGender.FEMALE
      );
      if (playerMissingGender) {
        return sportingJson(
          {
            error:
              `Mixed pairing requires a gender for ${playerMissingGender.player.name}`,
          },
          { status: 400 }
        );
      }
    }

    const startedAt = new Date();
    const updated = await admissionTransaction(prisma, async tx => {
      await assertSessionMutationActor(tx, { session: sessionData, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin });
      const fresh = await tx.session.findUnique({ where: { id: sessionData.id }, select: { status: true, collaborationVersion: true } });
      if (fresh && isUpgradedCollaboration(fresh)) {
        const { session: current } = await assertCollaborationPermission(tx, { sessionId: sessionData.id, userId: session.user.id, isGlobalAdmin: !!session.user.isAdmin, kind: "host" });
        assertRulesAgreed(current);
        if (current.schedulingMode === "LINEUP") {
          const rows = await tx.sessionLineupRow.findMany({ where: { sessionId: current.id, matchId: null, cancelled: false } });
          let ready = false;
          for (const row of rows.filter(isLineupRowReady)) {
            try { await validateLineupPlayers(tx, current.id, row, true); ready = true; break; }
            catch (error) { if (!(error instanceof IdentityConflictError)) throw error; }
          }
          if (!ready) throw new IdentityConflictError("Confirm at least one available lineup match before starting.");
        } else {
          const players = await tx.sessionPlayer.findMany({ where: { sessionId: current.id, isPaused: false } });
          if (current.collabFormat === "INTERCLUB" && current.sessionClubs.some(club => players.filter(p => p.representingClubId === club.clubId).length < 2)) throw new IdentityConflictError("Each club needs at least two available players.");
          if (current.collabFormat !== "INTERCLUB" && players.length < 4) throw new IdentityConflictError("Choose at least four available players.");
        }
        await collaborationEvent(tx, current.id, session.user.id, "SESSION_START");
      }
      if (fresh?.status !== SessionStatus.WAITING) throw new IdentityConflictError("Tournament already started");
      const links = await getSessionClubLinks(tx, sessionData);
      if (links.some(link => link.status !== SessionClubStatus.ACCEPTED)) throw new IdentityConflictError("Partner club must approve this collab before it can start");
      await assertSessionProfileContextsUnambiguous(tx, sessionData);
      return tx.session.update({
      where: { code },
      data: {
        status: SessionStatus.ACTIVE,
        poolACourtAssignments: 0,
        poolBCourtAssignments: 0,
        poolAMissedTurns: 0,
        poolBMissedTurns: 0,
        players: {
          updateMany: {
            where: {},
            data: { availableSince: startedAt },
          },
        },
      },
      include: {
        courts: { include: { currentMatch: true } },
        players: {
          include: {
            player: { select: { id: true, name: true, avatarKey: true, elo: true } },
          },
        },
      },
    });

    });

    const linkedClubIds = clubLinks.map((link) => link.clubId);
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
    const serializedPlayers = players.map((player) => ({
      ...player,
      player: serializeAvatarEntity(player.player),
    }));


    return sportingJson({ ...updated, players: serializedPlayers });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return sportingJson(
        { error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Start session error", error);
    return safeErrorResponse();
  }
}
