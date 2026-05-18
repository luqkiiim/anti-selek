import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { CommunityPlayerStatus, PlayerGender } from "@/types/enums";

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
    const partnerCommunityId = url.searchParams.get("partnerCommunityId");
    if (
      typeof hostCommunityId !== "string" ||
      hostCommunityId.length === 0 ||
      !partnerCommunityId ||
      partnerCommunityId === hostCommunityId
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

    const hostMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: hostCommunityId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });
    if (!session.user.isAdmin && hostMembership?.role !== "ADMIN") {
      return invalidTargetResponse(request, "api:communities:id:collab-roster");
    }

    const memberships = await prisma.communityMember.findMany({
      where: {
        communityId: { in: [hostCommunityId, partnerCommunityId] },
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

    const byUserId = new Map<
      string,
      {
        user: (typeof memberships)[number]["user"];
        memberships: Array<{
          id: string;
          name: string;
          elo: number;
          status: string;
          role: string;
        }>;
      }
    >();

    for (const membership of memberships) {
      const current =
        byUserId.get(membership.userId) ??
        {
          user: membership.user,
          memberships: [],
        };
      current.memberships.push({
        id: membership.community.id,
        name: membership.community.name,
        elo: membership.elo,
        status: membership.status,
        role: membership.role,
      });
      byUserId.set(membership.userId, current);
    }

    return NextResponse.json(
      Array.from(byUserId.values())
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
              preferred.status === CommunityPlayerStatus.OCCASIONAL
                ? CommunityPlayerStatus.OCCASIONAL
                : CommunityPlayerStatus.CORE,
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
