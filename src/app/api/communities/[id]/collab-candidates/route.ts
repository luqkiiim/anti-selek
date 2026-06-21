import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isClubOperatorRole } from "@/lib/clubRoles";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { prisma } from "@/lib/prisma";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:collab-candidates:get",
      { limit: 40, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(
        request,
        "api:communities:id:collab-candidates"
      );
    }

    const { id: hostClubId } = await params;
    if (typeof hostClubId !== "string" || hostClubId.length === 0) {
      return NextResponse.json(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:communities:id:collab-candidates"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const isGlobalAdmin =
      !!session.user.isAdmin ||
      isGlobalAdminEmail(session.user.email ?? null);
    const [hostClub, hostMembership] = await Promise.all([
      prisma.club.findUnique({
        where: { id: hostClubId },
        select: { id: true, isTutorial: true },
      }),
      isGlobalAdmin
        ? Promise.resolve(null)
        : prisma.clubMember.findUnique({
            where: {
              clubId_userId: {
                clubId: hostClubId,
                userId: session.user.id,
              },
            },
            select: { role: true },
          }),
    ]);

    if (
      !hostClub ||
      hostClub.isTutorial ||
      (!isGlobalAdmin && !isClubOperatorRole(hostMembership?.role))
    ) {
      return invalidTargetResponse(
        request,
        "api:communities:id:collab-candidates"
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    if (search.length < 2) {
      return NextResponse.json([]);
    }

    const candidates = await prisma.club.findMany({
      where: {
        id: { not: hostClubId },
        isTutorial: false,
        name: { contains: search },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 10,
    });

    return NextResponse.json(
      candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        membersCount: candidate._count.members,
      }))
    );
  } catch (error) {
    logError("Search collab candidate clubs error", error);
    return safeErrorResponse();
  }
}
