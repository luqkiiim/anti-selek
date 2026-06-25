import { NextResponse } from "next/server";
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
import { SessionStatus } from "@/types/enums";
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:start");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      include: {
        players: true,
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
      return NextResponse.json({ error: "Admin or staff only" }, { status: 403 });
    }

    if (sessionData.status !== SessionStatus.WAITING) {
      return NextResponse.json({ error: "Session already started" }, { status: 400 });
    }
    const clubLinks = await getSessionClubLinks(prisma, sessionData);
    const pendingPartner = clubLinks.find(
      (link) => link.status !== SessionClubStatus.ACCEPTED
    );
    if (pendingPartner) {
      return NextResponse.json(
        { error: "Partner club must approve this collab before it can start" },
        { status: 409 }
      );
    }
    ensureInterclubSessionReady(sessionData);

    const startedAt = new Date();
    const updated = await prisma.session.update({
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
            user: { select: { id: true, name: true, avatarKey: true, elo: true } },
          },
        },
      },
    });

    const linkedClubIds = clubLinks.map((link) => link.clubId);
    const playerIds = updated.players.map((p) => p.userId);
    const players =
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
    const serializedPlayers = players.map((player) => ({
      ...player,
      user: serializeAvatarEntity(player.user),
    }));

    return NextResponse.json({ ...updated, players: serializedPlayers });
  } catch (error) {
    if (error instanceof GenerateMatchError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    logError("Start session error", error);
    return safeErrorResponse();
  }
}
