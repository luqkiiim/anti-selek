import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { isValidClubRole } from "@/lib/clubRoles";
import { prisma } from "@/lib/prisma";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { ClubPlayerStatus, ClubRole, PlayerGender } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";

function isValidClubPlayerStatus(
  value: unknown
): value is ClubPlayerStatus {
  return (
    value === ClubPlayerStatus.CORE ||
    value === ClubPlayerStatus.OCCASIONAL
  );
}

async function findDuplicateUnclaimedMemberName({
  clubId,
  name,
  excludeUserId,
}: {
  clubId: string;
  name: string;
  excludeUserId?: string;
}) {
  const lookupName = normalizeNameLookupKey(name);
  if (!lookupName) return null;

  const members = await prisma.clubMember.findMany({
    where: { clubId },
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

    const { id: clubId, userId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const adminAccess = await getClubAdminAccess(prisma, {
      clubId,
      userId: session.user.id,
      isGlobalAdmin: !!session.user.isAdmin,
    });
    if (!adminAccess?.canAdmin) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const membership = await prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
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
    if (status !== undefined && !isValidClubPlayerStatus(status)) {
      return NextResponse.json({ error: "Invalid roster status" }, { status: 400 });
    }
    if (role !== undefined && !isValidClubRole(role)) {
      return NextResponse.json({ error: "Invalid role update" }, { status: 400 });
    }

    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;
    const requestedRole = isValidClubRole(role) ? role : undefined;
    const nextRole =
      requestedRole && requestedRole !== membership.role ? requestedRole : undefined;
    const shouldPromoteToAdmin = nextRole === ClubRole.ADMIN;
    const shouldGrantStaff = nextRole === ClubRole.STAFF;
    const shouldRevokeStaff = nextRole === ClubRole.MEMBER;
    const targetIsOwner = adminAccess.createdById === userId;
    const requesterCanDemoteAdmin =
      adminAccess.isOwner || adminAccess.isGlobalAdmin;

    if (targetIsOwner && nextRole) {
      return NextResponse.json(
        { error: "The club owner role cannot be changed" },
        { status: 400 }
      );
    }
    if (userId === session.user.id && nextRole) {
      return NextResponse.json(
        { error: "Cannot change your own club role" },
        { status: 400 }
      );
    }
    if (
      membership.role === ClubRole.ADMIN &&
      (shouldGrantStaff || shouldRevokeStaff) &&
      !requesterCanDemoteAdmin
    ) {
      return NextResponse.json(
        { error: "Only the club owner can demote admins" },
        { status: 403 }
      );
    }
    if (shouldRevokeStaff && membership.role !== ClubRole.STAFF) {
      if (membership.role !== ClubRole.ADMIN) {
        return NextResponse.json(
          { error: "Only staff members can be changed back to member here" },
          { status: 400 }
        );
      }
    }

    if (
      shouldPromoteToAdmin ||
      (shouldGrantStaff && membership.role !== ClubRole.ADMIN)
    ) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isClaimed: true },
      });
      if (!targetUser?.isClaimed) {
        return NextResponse.json(
          {
            error: shouldPromoteToAdmin
              ? "Only claimed members can be promoted to admin"
              : "Only claimed members can be made staff",
          },
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
        avatarKey: true,
        isClaimed: true,
        isActive: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
      },
    });
    if (!currentUser) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const nextName = typeof name === "string" ? name.trim() : currentUser.name;
    const nextEmail =
      email !== undefined
        ? typeof normalizedEmail === "string" && normalizedEmail.length > 0
          ? normalizedEmail
          : null
        : currentUser.email;
    if (!normalizeNameLookupKey(nextName)) {
      return NextResponse.json(
        { error: "Player name must include letters or numbers" },
        { status: 400 }
      );
    }
    if (
      typeof name === "string" &&
      currentUser.isClaimed &&
      nextName !== currentUser.name
    ) {
      return NextResponse.json(
        { error: "Claimed members manage their own account name" },
        { status: 403 }
      );
    }
    if (
      currentUser.isClaimed &&
      email !== undefined &&
      nextEmail !== currentUser.email
    ) {
      return NextResponse.json(
        { error: "Claimed members manage their own account email" },
        { status: 403 }
      );
    }
    if (
      currentUser.isClaimed &&
      typeof isActive === "boolean" &&
      isActive !== currentUser.isActive
    ) {
      return NextResponse.json(
        { error: "Claimed members manage their own account status" },
        { status: 403 }
      );
    }

    if (!currentUser.isClaimed && nextEmail === null) {
      const duplicate = await findDuplicateUnclaimedMemberName({
        clubId,
        name: nextName,
        excludeUserId: userId,
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "An unclaimed player with this name already exists in this club" },
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
        avatarKey: true,
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
      shouldGrantStaff ||
      shouldRevokeStaff ||
      isValidClubPlayerStatus(status)
        ? await prisma.clubMember.update({
            where: {
              clubId_userId: {
                clubId,
                userId,
              },
            },
            data: {
              ...(typeof elo === "number" ? { elo } : {}),
              ...(isValidClubPlayerStatus(status) ? { status } : {}),
              ...(nextRole ? { role: nextRole } : {}),
            },
            select: { role: true, elo: true, status: true },
          })
        : await prisma.clubMember.findUnique({
            where: {
              clubId_userId: {
                clubId,
                userId,
              },
            },
            select: { role: true, elo: true, status: true },
          });

    return NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      gender: updatedUser.gender,
      partnerPreference: updatedUser.partnerPreference,
      mixedSideOverride: updatedUser.mixedSideOverride,
      isActive: updatedUser.isActive,
      isClaimed: updatedUser.isClaimed,
      createdAt: updatedUser.createdAt,
      avatarUrl: serializeAvatarEntity(updatedUser).avatarUrl,
      role: updatedMembership?.role ?? membership.role,
      isOwner: targetIsOwner,
      elo: updatedMembership?.elo ?? membership.elo,
      status:
        updatedMembership?.status === ClubPlayerStatus.OCCASIONAL
          ? ClubPlayerStatus.OCCASIONAL
          : ClubPlayerStatus.CORE,
    });
  } catch (error) {
    logError("Club admin update player error", error);
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

    const { id: clubId, userId } = await params;

    if (typeof clubId !== "string" || clubId.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const adminAccess = await getClubAdminAccess(prisma, {
      clubId,
      userId: session.user.id,
      isGlobalAdmin: !!session.user.isAdmin,
    });
    if (!adminAccess?.canAdmin) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }

    const membership = await prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId,
        },
      },
      select: { id: true, role: true },
    });
    if (!membership) {
      return invalidTargetResponse(request, "api:communities:id:members:userId");
    }
    if (adminAccess.createdById === userId) {
      return NextResponse.json(
        { error: "The club owner cannot be removed" },
        { status: 400 }
      );
    }
    const isSelfRemoval = userId === session.user.id;
    if (isSelfRemoval) {
      if (membership.role !== ClubRole.ADMIN) {
        return NextResponse.json(
          { error: "Cannot remove yourself from the club" },
          { status: 400 }
        );
      }

      const otherAdmins = await prisma.clubMember.findMany({
        where: {
          clubId,
          role: ClubRole.ADMIN,
          userId: { not: userId },
        },
        select: { id: true },
        take: 1,
      });
      if (otherAdmins.length === 0) {
        return NextResponse.json(
          { error: "Make another member an admin before leaving this club" },
          { status: 400 }
        );
      }
    } else if (membership.role === ClubRole.ADMIN) {
      return NextResponse.json(
        { error: "Demote admins before removing them" },
        { status: 400 }
      );
    }

    const sessionRows = await prisma.session.findMany({
      where: { clubId },
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

      await tx.clubMember.delete({
        where: {
          clubId_userId: {
            clubId,
            userId,
          },
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Club admin remove player error", error);
    return safeErrorResponse();
  }
}

