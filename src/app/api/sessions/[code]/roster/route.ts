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
  SessionClubStatus,
} from "@/types/enums";

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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:roster");
    }

    const { code } = await params;
    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json(
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

    const acceptedClubIds = getAcceptedInterclubClubIds(sessionData).slice(0, 2);
    if (!isInterclubSession(sessionData) || acceptedClubIds.length !== 2) {
      return NextResponse.json(
        { error: "Club vs club roster requires two accepted clubs" },
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
          await prisma.clubMember.findMany({
            where: {
              clubId: { in: acceptedClubIds },
              userId: session.user.id,
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
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarKey: true,
            gender: true,
            partnerPreference: true,
            mixedSideOverride: true,
            isActive: true,
            isClaimed: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      memberships
        .map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          avatarUrl: serializeAvatarEntity(membership.user).avatarUrl,
          needsMoreRest: membership.needsMoreRest,
          status:
            membership.status === ClubPlayerStatus.OCCASIONAL
              ? ClubPlayerStatus.OCCASIONAL
              : ClubPlayerStatus.CORE,
          gender: [PlayerGender.MALE, PlayerGender.FEMALE].includes(
            membership.user.gender as PlayerGender
          )
            ? membership.user.gender
            : PlayerGender.MALE,
          partnerPreference: membership.user.partnerPreference,
          mixedSideOverride:
            typeof membership.user.mixedSideOverride === "string"
              ? membership.user.mixedSideOverride
              : null,
          elo: membership.elo,
          isActive: membership.user.isActive,
          isClaimed: membership.user.isClaimed,
          createdAt: membership.user.createdAt,
          wins: 0,
          losses: 0,
          role: membership.role,
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
