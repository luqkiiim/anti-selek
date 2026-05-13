import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { CommunityPlayerStatus, PlayerGender } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
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

export const dynamic = "force-dynamic";

async function requireCommunityAdmin(
  communityId: string,
  requesterId: string,
  isGlobalAdmin: boolean
) {
  if (isGlobalAdmin) return true;

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_userId: {
        communityId,
        userId: requesterId,
      },
    },
    select: { role: true },
  });

  return membership?.role === "ADMIN";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:userId:patch", { limit: 15, windowMs: 60_000 });
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

    const { id: communityId, userId } = await params;

    if (typeof communityId !== "string" || communityId.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const canManage = await requireCommunityAdmin(
      communityId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });
    if (!membership) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      email,
      elo,
      isActive,
      gender,
      partnerPreference,
      mixedSideOverride,
      status,
      role,
    } = body as {
      name?: unknown;
      email?: unknown;
      elo?: unknown;
      isActive?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      status?: unknown;
      role?: unknown;
    };

    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (
      email !== undefined &&
      email !== null &&
      (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    ) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (
      elo !== undefined &&
      (typeof elo !== "number" || !Number.isInteger(elo) || elo < 0 || elo > 5000)
    ) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json({ error: "Invalid isActive value" }, { status: 400 });
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
    if (role !== undefined && role !== "ADMIN") {
      return NextResponse.json({ error: "Invalid role update" }, { status: 400 });
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;
    const shouldPromoteToAdmin = role === "ADMIN" && membership.role !== "ADMIN";

    if (shouldPromoteToAdmin) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isClaimed: true },
      });
      if (!targetUser?.isClaimed) {
        return NextResponse.json(
          { error: "Only claimed members can be promoted to admin" },
          { status: 400 }
        );
      }
    }

    if (typeof normalizedEmail === "string" && normalizedEmail.length > 0) {
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        return NextResponse.json({ error: "Email already registered" }, { status: 400 });
      }
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        isClaimed: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
      },
    });
    if (!currentUser) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const nextName = typeof name === "string" ? name.trim() : currentUser.name;
    if (!normalizeNameLookupKey(nextName)) {
      return NextResponse.json(
        { error: "Player name must include letters or numbers" },
        { status: 400 }
      );
    }

    const nextEmail =
      email !== undefined
        ? typeof normalizedEmail === "string" && normalizedEmail.length > 0
          ? normalizedEmail
          : null
        : currentUser.email;
    if (!currentUser.isClaimed && nextEmail === null) {
      const duplicate = await findDuplicateUnclaimedMemberName({
        communityId,
        name: nextName,
        excludeUserId: userId,
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "An unclaimed player with this name already exists in this community" },
          { status: 409 }
        );
      }
    }

    const nextGender =
      typeof gender === "string"
        ? (gender as PlayerGender)
        : (currentUser.gender as PlayerGender | undefined) ?? PlayerGender.UNSPECIFIED;
    const resolvedMixedState = resolveMixedSideState({
      gender: nextGender,
      mixedSideOverride:
        isValidMixedSide(mixedSideOverride) || mixedSideOverride === null
          ? mixedSideOverride
          : typeof gender === "string"
            ? null
            : currentUser.mixedSideOverride,
      partnerPreference: isValidPartnerPreference(partnerPreference)
        ? partnerPreference
        : typeof gender === "string"
          ? undefined
          : currentUser.partnerPreference,
    });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: typeof name === "string" ? name.trim() : undefined,
        email:
          email !== undefined
            ? typeof normalizedEmail === "string" && normalizedEmail.length > 0
              ? normalizedEmail
              : null
            : undefined,
        gender: typeof gender === "string" ? gender : undefined,
        partnerPreference: resolvedMixedState.partnerPreference,
        mixedSideOverride: resolvedMixedState.mixedSideOverride,
        isActive: typeof isActive === "boolean" ? isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });

    const updatedMembership =
      typeof elo === "number" ||
      shouldPromoteToAdmin ||
      isValidCommunityPlayerStatus(status)
        ? await prisma.communityMember.update({
            where: {
              communityId_userId: {
                communityId,
                userId,
              },
            },
            data: {
              ...(typeof elo === "number" ? { elo } : {}),
              ...(isValidCommunityPlayerStatus(status) ? { status } : {}),
              ...(shouldPromoteToAdmin ? { role: "ADMIN" } : {}),
            },
            select: { role: true, elo: true, status: true },
          })
        : await prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId,
                userId,
              },
            },
            select: { role: true, elo: true, status: true },
          });

    return NextResponse.json({
      ...updatedUser,
      role: updatedMembership?.role ?? membership.role,
      elo: updatedMembership?.elo ?? membership.elo,
      status:
        updatedMembership?.status === CommunityPlayerStatus.OCCASIONAL
          ? CommunityPlayerStatus.OCCASIONAL
          : CommunityPlayerStatus.CORE,
    });
  } catch (error) {
    logError("Community admin update player error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:userId:delete", { limit: 15, windowMs: 60_000 });
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

    const { id: communityId, userId } = await params;

    if (typeof communityId !== "string" || communityId.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const canManage = await requireCommunityAdmin(
      communityId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }
    if (userId === session.user.id) {
      return NextResponse.json({ error: "Cannot remove yourself from the community" }, { status: 400 });
    }

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const sessionRows = await prisma.session.findMany({
      where: { communityId },
      select: { id: true },
    });
    const sessionIds = sessionRows.map((s) => s.id);

    await prisma.$transaction(async (tx) => {
      if (sessionIds.length > 0) {
        await tx.sessionPlayer.deleteMany({
          where: {
            sessionId: { in: sessionIds },
            userId,
          },
        });
      }

      await tx.communityMember.delete({
        where: {
          communityId_userId: {
            communityId,
            userId,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Community admin remove player error", error);
    return safeErrorResponse();
  }
}
