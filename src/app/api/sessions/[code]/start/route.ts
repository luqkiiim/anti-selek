import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import {
  getPlayerCommunityBadges,
  getSessionAdminMembership,
  getSessionCommunityLinks,
  withPlayerCommunityBadges,
} from "@/lib/sessionCollab";
import { SessionStatus } from "@/types/enums";
import { SessionCommunityStatus } from "@/types/enums";
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
      include: { players: true },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:start");
    }

    const adminMembership = await getSessionAdminMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: false,
    });
    if (!session.user.isAdmin && !adminMembership) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (sessionData.status !== SessionStatus.WAITING) {
      return NextResponse.json({ error: "Session already started" }, { status: 400 });
    }
    const communityLinks = await getSessionCommunityLinks(prisma, sessionData);
    const pendingPartner = communityLinks.find(
      (link) => link.status !== SessionCommunityStatus.ACCEPTED
    );
    if (pendingPartner) {
      return NextResponse.json(
        { error: "Partner community must approve this collab before it can start" },
        { status: 409 }
      );
    }

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
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    const linkedCommunityIds = communityLinks.map((link) => link.communityId);
    const playerIds = updated.players.map((p) => p.userId);
    const players =
      linkedCommunityIds.length > 1 && updated.players.length > 0
        ? withPlayerCommunityBadges(
            updated.players,
            await getPlayerCommunityBadges(prisma, linkedCommunityIds, playerIds),
            updated.communityId
          )
        : updated.communityId && updated.players.length > 0
          ? withCommunityElo(
              updated.players,
              await getCommunityEloByUserId(updated.communityId, playerIds)
            )
          : updated.players;

    return NextResponse.json({ ...updated, players });
  } catch (error) {
    logError("Start session error", error);
    return safeErrorResponse();
  }
}
