import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:admin:players:id:reset-elo:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();

    if (!session?.user?.isAdmin) {
      return invalidTargetResponse(request, "api:admin:players:id:reset-elo");
    }

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:admin:players:id:reset-elo");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id:reset-elo");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { elo: 1000 },
      select: {
        id: true,
        name: true,
        email: true,
        elo: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    logError("Reset ELO error", error);
    return safeErrorResponse();
  }
}
