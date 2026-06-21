import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { isClubOperatorRole } from "@/lib/clubRoles";
import { logError, safeErrorResponse } from "@/lib/errors";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import { prisma } from "@/lib/prisma";
import {
  ClubContractAliasConflictError,
  readAliasedSearchParam,
} from "@/lib/clubContractAliases";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  ClubPlayerStatus,
  OfflineIdentityLinkStatus,
  PlayerGender,
} from "@/types/enums";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:collab-roster:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:communities:id:collab-roster");
    }

    const { id: hostClubId } = await params;
    const url = new URL(request.url);
    const partnerClubId = readAliasedSearchParam(
      url.searchParams,
      "partnerClubId",
      "partnerCommunityId",
      "partner club identifier"
    );
    if (
      typeof hostClubId !== "string" ||
      hostClubId.length === 0 ||
      !partnerClubId ||
      partnerClubId === hostClubId
    ) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:collab-roster"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const [
      hostClub,
      partnerClub,
      hostMembership,
      partnerMembership,
      acceptedIdentityLink,
    ] = await Promise.all([
      prisma.club.findUnique({
        where: { id: hostClubId },
        select: { isTutorial: true },
      }),
      prisma.club.findUnique({
        where: { id: partnerClubId },
        select: { isTutorial: true },
      }),
      prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: hostClubId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      session.user.isAdmin
        ? Promise.resolve(null)
        : prisma.clubMember.findUnique({
            where: {
              clubId_userId: {
                clubId: partnerClubId,
                userId: session.user.id,
              },
            },
            select: { role: true },
          }),
      prisma.offlineIdentityLinkRequest.findFirst({
        where: {
          status: OfflineIdentityLinkStatus.ACCEPTED,
          OR: [
            {
              sourceClubId: hostClubId,
              targetClubId: partnerClubId,
            },
            {
              sourceClubId: partnerClubId,
              targetClubId: hostClubId,
            },
          ],
        },
        select: { id: true },
      }),
    ]);
    const hasPartnerRosterAccess =
      session.user.isAdmin ||
      isClubOperatorRole(partnerMembership?.role) ||
      !!acceptedIdentityLink;

    if (
      !hostClub ||
      !partnerClub ||
      hostClub.isTutorial ||
      partnerClub.isTutorial ||
      (!session.user.isAdmin &&
        (!isClubOperatorRole(hostMembership?.role) ||
          !hasPartnerRosterAccess))
    ) {
      return invalidTargetResponse(request, "api:communities:id:collab-roster");
    }

    const memberships = await prisma.clubMember.findMany({
      where: {
        clubId: { in: [hostClubId, partnerClubId] },
      },
      include: {
        club: { select: { id: true, name: true } },
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

    const offlineIdentityInfoByUserId = await getOfflineIdentityInfoByUserId(
      prisma,
      memberships.map((membership) => membership.userId)
    );

    const byIdentityKey = new Map<
      string,
      {
        user: (typeof memberships)[number]["user"];
        offlineIdentityId: string | null;
        memberships: Array<{
          id: string;
          name: string;
          userId: string;
          elo: number;
          status: string;
          role: string;
        }>;
      }
    >();

    for (const membership of memberships) {
      const offlineIdentityInfo = offlineIdentityInfoByUserId.get(
        membership.userId
      );
      const groupKey = offlineIdentityInfo?.offlineIdentityId ?? membership.userId;
      const current =
        byIdentityKey.get(groupKey) ??
        {
          user: membership.user,
          offlineIdentityId: offlineIdentityInfo?.offlineIdentityId ?? null,
          memberships: [],
        };
      current.memberships.push({
        id: membership.club.id,
        name: membership.club.name,
        userId: membership.userId,
        elo: membership.elo,
        status: membership.status,
        role: membership.role,
      });
      if (membership.club.id === hostClubId) {
        current.user = membership.user;
      }
      byIdentityKey.set(groupKey, current);
    }

    return NextResponse.json(
      Array.from(byIdentityKey.values())
        .map(({ user, memberships: userMemberships }) => {
          const preferred =
            userMemberships.find((membership) => membership.id === hostClubId) ??
            userMemberships[0];

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: serializeAvatarEntity(user).avatarUrl,
            status:
              preferred.status === ClubPlayerStatus.OCCASIONAL
                ? ClubPlayerStatus.OCCASIONAL
                : ClubPlayerStatus.CORE,
            gender: [PlayerGender.MALE, PlayerGender.FEMALE].includes(
              user.gender as PlayerGender
            )
              ? user.gender
              : PlayerGender.MALE,
            partnerPreference: user.partnerPreference,
            mixedSideOverride:
              typeof user.mixedSideOverride === "string"
                ? user.mixedSideOverride
                : null,
            elo: preferred.elo,
            isActive: user.isActive,
            isClaimed: user.isClaimed,
            createdAt: user.createdAt,
            wins: 0,
            losses: 0,
            role: preferred.role,
            offlineIdentityId:
              offlineIdentityInfoByUserId.get(user.id)?.offlineIdentityId ?? null,
            communityBadges: userMemberships
              .slice()
              .sort((left, right) =>
                left.id === hostClubId
                  ? -1
                  : right.id === hostClubId
                    ? 1
                    : left.name.localeCompare(right.name)
              )
              .map((membership) => ({
                id: membership.id,
                name: membership.name,
                userId: membership.userId,
                elo: membership.elo,
              })),
            linkedClubBadges: userMemberships.map((membership) => ({
              id: membership.id,
              name: membership.name,
              userId: membership.userId,
              elo: membership.elo,
            })),
          };
        })
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
        )
    );
  } catch (error) {
    if (error instanceof ClubContractAliasConflictError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logError("Load collab roster error", error);
    return safeErrorResponse();
  }
}
