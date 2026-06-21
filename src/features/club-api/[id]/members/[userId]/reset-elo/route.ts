import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { prisma } from "@/lib/prisma";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:members:userId:reset-elo:post", { limit: 15, windowMs: 60_000 });
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

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id:members:userId:reset-elo");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const adminAccess = await getClubAdminAccess(prisma, {
      clubId,
      userId: session.user.id,
      isGlobalAdmin: !!session.user.isAdmin,
    });

    if (!adminAccess?.canAdmin) {
      return invalidTargetResponse(request, "api:communities:id:members:userId:reset-elo");
    }

    const targetMembership = await prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!targetMembership) {
      return invalidTargetResponse(request, "api:communities:id:members:userId:reset-elo");
    }

    const [updatedMembership, updatedUser] = await prisma.$transaction([
      prisma.clubMember.update({
        where: {
          clubId_userId: {
            clubId,
            userId,
          },
        },
        data: { elo: 1000 },
        select: { role: true, elo: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          isClaimed: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      ...updatedUser,
      role: updatedMembership.role,
      elo: updatedMembership.elo,
    });
  } catch (error: unknown) {
    logError("Club admin reset ELO error", error);
    return safeErrorResponse();
  }
}

