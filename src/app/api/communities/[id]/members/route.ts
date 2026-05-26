import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import {
  getCommunityStatUserResolver,
  getOfflineIdentityInfoByUserId,
} from "@/lib/offlineIdentities";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import {
  CommunityPlayerStatus,
  PlayerGender,
} from "@/types/enums";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";

function isValidCommunityPlayerStatus(
  value: unknown
): value is CommunityPlayerStatus {
  return (
    value === CommunityPlayerStatus.CORE ||
    value === CommunityPlayerStatus.OCCASIONAL
  );
}

async function findDuplicateUnclaimedMemberName({
  communityId,
  name,
  excludeUserId,
}: {
  communityId: string;
  name: string;
  excludeUserId?: string;
}) {
  const lookupName = normalizeNameLookupKey(name);
  if (!lookupName) return null;

  const members = await prisma.communityMember.findMany({
    where: { communityId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isClaimed: true,
        },
      },
    },
  });

  return (
    members.find(
      (member) =>
        member.user.id !== excludeUserId &&
        !member.user.isClaimed &&
        member.user.email === null &&
        normalizeNameLookupKey(member.user.name) === lookupName
    ) ?? null
  );
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return invalidTargetResponse(request, "api:communities:id:members");
    }

    const members = await prisma.communityMember.findMany({
      where: { communityId: id },
      include: {
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

    const completedMatches = await prisma.match.findMany({
      where: {
        status: "COMPLETED",
        session: {
          isTest: false,
          OR: [
            { communityId: id },
            {
              sessionCommunities: {
                some: {
                  communityId: id,
                  status: "ACCEPTED",
                },
              },
            },
          ],
        },
      },
      select: {
        winnerTeam: true,
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
      },
    });

    const statsByUserId = new Map<string, { wins: number; losses: number }>();
    const offlineIdentityInfoByUserId = await getOfflineIdentityInfoByUserId(
      prisma,
      members.map((member) => member.user.id)
    );
    for (const member of members) {
      statsByUserId.set(member.user.id, { wins: 0, losses: 0 });
    }
    const resolveStatUserId = await getCommunityStatUserResolver(prisma, {
      communityId: id,
      memberUserIds: members.map((member) => member.user.id),
    });

    for (const match of completedMatches) {
      if (match.winnerTeam !== 1 && match.winnerTeam !== 2) {
        continue;
      }

      const team1Ids = [match.team1User1Id, match.team1User2Id].map(
        resolveStatUserId
      );
      const team2Ids = [match.team2User1Id, match.team2User2Id].map(
        resolveStatUserId
      );
      const winners = match.winnerTeam === 1 ? team1Ids : team2Ids;
      const losers = match.winnerTeam === 1 ? team2Ids : team1Ids;

      for (const winnerId of winners) {
        const stat = statsByUserId.get(winnerId);
        if (stat) stat.wins += 1;
      }

      for (const loserId of losers) {
        const stat = statsByUserId.get(loserId);
        if (stat) stat.losses += 1;
      }
    }

    return NextResponse.json(
      members.map((m) => {
        const offlineIdentityInfo = offlineIdentityInfoByUserId.get(m.user.id);

        return {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatarUrl: serializeAvatarEntity(m.user).avatarUrl,
          status:
            m.status === CommunityPlayerStatus.OCCASIONAL
              ? CommunityPlayerStatus.OCCASIONAL
              : CommunityPlayerStatus.CORE,
          gender:
            [PlayerGender.MALE, PlayerGender.FEMALE].includes(m.user.gender as PlayerGender)
              ? m.user.gender
              : PlayerGender.MALE,
          partnerPreference: m.user.partnerPreference,
          mixedSideOverride:
            typeof m.user.mixedSideOverride === "string"
              ? m.user.mixedSideOverride
              : null,
          elo: m.elo,
          isActive: m.user.isActive,
          isClaimed: m.user.isClaimed,
          createdAt: m.user.createdAt,
          wins: statsByUserId.get(m.user.id)?.wins ?? 0,
          losses: statsByUserId.get(m.user.id)?.losses ?? 0,
          role: m.role,
          offlineIdentityId: offlineIdentityInfo?.offlineIdentityId ?? null,
          linkedCommunityBadges:
            offlineIdentityInfo?.linkedCommunityBadges ?? [],
        };
      })
    );
  } catch (error) {
    logError("List community members error", error);
    return safeErrorResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const canManage = requesterMembership?.role === "ADMIN" || session.user.isAdmin;
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:members");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      email,
      password,
      gender,
      partnerPreference,
      mixedSideOverride,
      status,
    } =
      body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      status?: unknown;
    };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Player name must be at least 2 characters" }, { status: 400 });
    }
    if (email !== undefined && typeof email !== "string") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (password !== undefined && typeof password !== "string") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    if (gender !== undefined && !isValidPlayerGender(gender)) {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }
    if (
      partnerPreference !== undefined &&
      !isValidPartnerPreference(partnerPreference)
    ) {
      return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
    }
    if (
      mixedSideOverride !== undefined &&
      mixedSideOverride !== null &&
      !isValidMixedSide(mixedSideOverride)
    ) {
      return NextResponse.json({ error: "Invalid mixed side override" }, { status: 400 });
    }
    if (status !== undefined && !isValidCommunityPlayerStatus(status)) {
      return NextResponse.json({ error: "Invalid roster status" }, { status: 400 });
    }

    const normalizedName = name.trim();
    const normalizedEmail =
      typeof email === "string" && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    const normalizedPassword =
      typeof password === "string" && password.length > 0 ? password : null;

    if (!normalizeNameLookupKey(normalizedName)) {
      return NextResponse.json({ error: "Player name must include letters or numbers" }, { status: 400 });
    }
    if (!normalizedEmail) {
      const duplicate = await findDuplicateUnclaimedMemberName({
        communityId: id,
        name: normalizedName,
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "An unclaimed player with this name already exists in this community" },
          { status: 409 }
        );
      }
    }

    let user: {
      id: string;
      name: string;
      email: string | null;
      avatarKey: string | null;
      gender: string;
      partnerPreference: string;
      mixedSideOverride: string | null;
      isActive: boolean;
      isClaimed: boolean;
      createdAt: Date;
    };
    let userWasCreated = false;
    if (normalizedEmail) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
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
      });

      if (existingUser) {
        user = existingUser;
      } else {
        const passwordHash = normalizedPassword ? await bcrypt.hash(normalizedPassword, 10) : null;
        user = await prisma.user.create({
          data: {
            name: normalizedName,
            email: normalizedEmail,
            passwordHash,
            isClaimed: !!passwordHash,
          },
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
        });
        userWasCreated = true;
      }
    } else {
      user = await prisma.user.create({
        data: {
          name: normalizedName,
          email: null,
          passwordHash: null,
          isClaimed: false,
        },
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
      });
      userWasCreated = true;
    }

    const requestedGender =
      gender === PlayerGender.MALE || gender === PlayerGender.FEMALE
        ? (gender as PlayerGender)
        : undefined;
    const resolvedGender =
      requestedGender ??
      ([PlayerGender.MALE, PlayerGender.FEMALE].includes(user.gender as PlayerGender)
        ? (user.gender as PlayerGender)
        : PlayerGender.MALE);

    const resolvedMixedState = resolveMixedSideState({
      gender: resolvedGender,
      mixedSideOverride:
        isValidMixedSide(mixedSideOverride) || mixedSideOverride === null
          ? mixedSideOverride
          : requestedGender !== undefined
            ? null
            : user.mixedSideOverride,
      partnerPreference:
        isValidPartnerPreference(partnerPreference)
          ? partnerPreference
          : requestedGender !== undefined || userWasCreated
            ? undefined
            : user.partnerPreference,
    });

    if (
      resolvedGender !== user.gender ||
      resolvedMixedState.partnerPreference !== user.partnerPreference ||
      resolvedMixedState.mixedSideOverride !== user.mixedSideOverride
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          gender: resolvedGender,
          partnerPreference: resolvedMixedState.partnerPreference,
          mixedSideOverride: resolvedMixedState.mixedSideOverride,
        },
      });
    }

    const membership = await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        communityId: id,
        userId: user.id,
        role: "MEMBER",
        status: isValidCommunityPlayerStatus(status)
          ? status
          : CommunityPlayerStatus.CORE,
      },
      select: {
        role: true,
        elo: true,
        status: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: serializeAvatarEntity(user).avatarUrl,
      status:
        membership.status === CommunityPlayerStatus.OCCASIONAL
          ? CommunityPlayerStatus.OCCASIONAL
          : CommunityPlayerStatus.CORE,
      gender: resolvedGender,
      partnerPreference: resolvedMixedState.partnerPreference,
      mixedSideOverride: resolvedMixedState.mixedSideOverride,
      elo: membership.elo,
      isActive: user.isActive,
      isClaimed: user.isClaimed,
      createdAt: user.createdAt,
      role: membership.role,
    });
  } catch (error) {
    logError("Add community member error", error);
    return safeErrorResponse();
  }
}
