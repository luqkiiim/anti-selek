import { NextResponse } from "next/server";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getClubMemberAccessContext } from "../../clubApiAccess";

const RATE_LIMIT_KEY = "api:clubs:id:notifications:read";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, RATE_LIMIT_KEY, {
      limit: 30,
      windowMs: 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const access = await getClubMemberAccessContext({
      clubId: id,
      rateLimitKey: RATE_LIMIT_KEY,
      request,
    });
    if ("response" in access) return access.response;

    await prisma.clubNotification.updateMany({
      where: {
        clubId: id,
        recipientUserId: access.context.viewerId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return NextResponse.json({ unreadCount: 0 });
  } catch (error) {
    logError("Mark club notifications read error", error);
    return safeErrorResponse();
  }
}
