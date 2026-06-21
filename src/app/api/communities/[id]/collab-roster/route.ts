import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { isClubOperatorRole } from "@/lib/clubRoles";
import { logError, safeErrorResponse } from "@/lib/errors";
import { getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import { prisma } from "@/lib/prisma";
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

    const { id: hostCommunityId } = await params;
    const url = new URL(request.url);
    const partnerClubId = url.searchParams.get("partnerCommunityId");
    if (
      typeof hostCommunityId !== "string" ||
      hostCommunityId.length === 0 ||
      !partnerClubId ||
      partnerClubId === hostCommunityId
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
      prisma.community.findUnique({
        where: { id: hostCommunityId },
        select: { isTutorial: true },
      }),
      prisma.community.findUnique({
        where: { id: partnerClubId },
        select: { isTutorial: true },
      }),
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: hostCommunityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      session.user.isAdmin
        ? Promise.resolve(null)
        : prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId: partnerClubId,
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
              sourceCommunityId: hostCommunityId,
              targetCommunityId: partnerClubId,
            },
            {
              sourceCommunityId: partnerClubId,
              targetCommunityId: hostCommunityId,
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

    const memberships = await prisma.communityMember.findMany({
      where: {
        communityId: { in: [hostCommunityId, partnerClubId] },
      },
      include: {
        community: { select: { id: true, name: true } },
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
        id: membership.community.id,
        name: membership.community.name,
        userId: membership.userId,
        elo: membership.elo,
        status: membership.status,
        role: membership.role,
      });
      if (membership.community.id === hostCommunityId) {
        current.user = membership.user;
      }
      byIdentityKey.set(groupKey, current);
    }

    return NextResponse.json(
      Array.from(byIdentityKey.values())
        .map(({ user, memberships: userMemberships }) => {
          const preferred =
            userMemberships.find((membership) => membership.id === hostCommunityId) ??
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
                left.id === hostCommunityId
                  ? -1
                  : right.id === hostCommunityId
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
    logError("Load collab roster error", error);
    return safeErrorResponse();
  }
}
