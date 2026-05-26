import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

    const { id: hostCommunityId } = await params;
    if (typeof hostCommunityId !== "string" || hostCommunityId.length === 0) {
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
    const [hostCommunity, hostMembership] = await Promise.all([
      prisma.community.findUnique({
        where: { id: hostCommunityId },
        select: { id: true, isTutorial: true },
      }),
      isGlobalAdmin
        ? Promise.resolve(null)
        : prisma.communityMember.findUnique({
            where: {
              communityId_userId: {
                communityId: hostCommunityId,
                userId: session.user.id,
              },
            },
            select: { role: true },
          }),
    ]);

    if (
      !hostCommunity ||
      hostCommunity.isTutorial ||
      (!isGlobalAdmin && hostMembership?.role !== "ADMIN")
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

    const candidates = await prisma.community.findMany({
      where: {
        id: { not: hostCommunityId },
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
    logError("Search collab candidate communities error", error);
    return safeErrorResponse();
  }
}
