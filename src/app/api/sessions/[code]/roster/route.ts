import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { COMMUNITY_OPERATOR_ROLES } from "@/lib/clubRoles";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import {
  getAcceptedInterclubClubIds,
  isInterclubSession,
} from "@/lib/sessionCollabFormat";
import {
  ClubPlayerStatus,
  PlayerGender,
  SessionPool,
  SessionClubStatus,
} from "@/types/enums";
import { isValidSessionPool } from "@/lib/sessionPools";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:sessions:code:roster:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:roster");
    }

    const { code } = await params;
    if (typeof code !== "string" || code.length === 0) {
      return sportingJson(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:sessions:code:roster"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        clubId: true,
        collabFormat: true,
        sessionClubs: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:roster");
    }

    const acceptedClubIds = getAcceptedInterclubClubIds(sessionData);
    if (isInterclubSession(sessionData) && acceptedClubIds.length !== 2) {
      return sportingJson(
        { error: "Club vs club roster requires two accepted clubs" },
        { status: 400 }
      );
    }
    if (acceptedClubIds.length < 2) {
      return sportingJson(
        { error: "Tournament roster requires accepted partner clubs" },
        { status: 400 }
      );
    }

    const clubNameById = new Map(
      sessionData.sessionClubs
        .filter((link) => link.status === SessionClubStatus.ACCEPTED)
        .map((link) => [link.clubId, link.club.name])
    );
    const clubOrderById = new Map(
      acceptedClubIds.map((clubId, index) => [clubId, index])
    );

    const manageableClubIds = session.user.isAdmin
      ? acceptedClubIds
      : (
          await prisma.clubAccess.findMany({
            where: {
              clubId: { in: acceptedClubIds },
              userId: session.user.id,
              status: "ACTIVE",
              role: { in: [...COMMUNITY_OPERATOR_ROLES] },
            },
            select: {
              clubId: true,
            },
          })
        ).map((membership) => membership.clubId);

    const uniqueManageableClubIds = Array.from(
      new Set(
        manageableClubIds.filter((clubId) => acceptedClubIds.includes(clubId))
      )
    );
    if (uniqueManageableClubIds.length === 0) {
      return invalidTargetResponse(request, "api:sessions:code:roster");
    }

    const memberships = await prisma.clubMember.findMany({
      where: {
        clubId: { in: uniqueManageableClubIds },
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
          },
        },
        player: {
          select: {
            id: true,
            name: true,
            avatarKey: true,
            gender: true,
            partnerPreference: true,
            mixedSideOverride: true,
            isActive: true,
            ownerUserId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return sportingJson(
      memberships
        .map((membership) => ({
          id: membership.player.id,
          name: membership.player.name,
          email: null,
          avatarUrl: serializeAvatarEntity(membership.player).avatarUrl,
          preferredPool: isValidSessionPool(membership.preferredPool)
            ? membership.preferredPool
            : SessionPool.B,
          status:
            membership.status === ClubPlayerStatus.OCCASIONAL
              ? ClubPlayerStatus.OCCASIONAL
              : ClubPlayerStatus.CORE,
          gender: [PlayerGender.MALE, PlayerGender.FEMALE].includes(
            membership.player.gender as PlayerGender
          )
            ? membership.player.gender
            : PlayerGender.MALE,
          partnerPreference: membership.player.partnerPreference,
          mixedSideOverride:
            typeof membership.player.mixedSideOverride === "string"
              ? membership.player.mixedSideOverride
              : null,
          elo: membership.elo,
          isActive: membership.player.isActive,
          isClaimed: !!membership.player.ownerUserId,
          ownerUserId: membership.player.ownerUserId,
          createdAt: membership.player.createdAt,
          wins: 0,
          losses: 0,
          role: "MEMBER",
          representingClubId: membership.clubId,
          representingClubName:
            membership.club.name ??
            clubNameById.get(membership.clubId) ??
            "Club",
        }))
        .sort((left, right) => {
          const clubOrder =
            (clubOrderById.get(left.representingClubId) ?? 0) -
            (clubOrderById.get(right.representingClubId) ?? 0);

          return clubOrder === 0
            ? left.name.localeCompare(right.name, undefined, {
                sensitivity: "base",
              })
            : clubOrder;
        })
    );
  } catch (error) {
    logError("Load session roster error", error);
    return safeErrorResponse();
  }
}
