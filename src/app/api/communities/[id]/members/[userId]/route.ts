import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartnerPreference, PlayerGender } from "@/types/enums";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId, userId } = await params;
    const canManage = await requireCommunityAdmin(
      communityId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
      return NextResponse.json({ error: "Player not found in this community" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, email, elo, isActive, gender, partnerPreference, role } = body as {
      name?: unknown;
      email?: unknown;
      elo?: unknown;
      isActive?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
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
    if (
      gender !== undefined &&
      (typeof gender !== "string" ||
        ![PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
          gender as PlayerGender
        ))
    ) {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }
    if (
      partnerPreference !== undefined &&
      (typeof partnerPreference !== "string" ||
        ![PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
          partnerPreference as PartnerPreference
        ))
    ) {
      return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
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

    const resolvedPartnerPreference =
      typeof partnerPreference === "string"
        ? (partnerPreference as PartnerPreference)
        : gender === PlayerGender.FEMALE
          ? PartnerPreference.FEMALE_FLEX
          : undefined;

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
        partnerPreference: resolvedPartnerPreference,
        isActive: typeof isActive === "boolean" ? isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        gender: true,
        partnerPreference: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });

    const updatedMembership =
      typeof elo === "number" || shouldPromoteToAdmin
        ? await prisma.communityMember.update({
            where: {
              communityId_userId: {
                communityId,
                userId,
              },
            },
            data: {
              ...(typeof elo === "number" ? { elo } : {}),
              ...(shouldPromoteToAdmin ? { role: "ADMIN" } : {}),
            },
            select: { role: true, elo: true },
          })
        : await prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId,
                userId,
              },
            },
            select: { role: true, elo: true },
          });

    return NextResponse.json({
      ...updatedUser,
      role: updatedMembership?.role ?? membership.role,
      elo: updatedMembership?.elo ?? membership.elo,
    });
  } catch (error) {
    console.error("Community admin update player error:", error);
    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: communityId, userId } = await params;
    const canManage = await requireCommunityAdmin(
      communityId,
      session.user.id,
      !!session.user.isAdmin
    );
    if (!canManage) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
      return NextResponse.json({ error: "Player not found in this community" }, { status: 404 });
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
    console.error("Community admin remove player error:", error);
    return NextResponse.json({ error: "Failed to remove player from community" }, { status: 500 });
  }
}
