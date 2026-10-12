import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nonretiredPlayer } from "@/lib/playerIdentity";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

import { clubOwnershipTransaction, ClubPlayerOwnershipError } from "@/lib/clubPlayerOwnership";
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

    return await clubOwnershipTransaction(prisma, async tx => {
    const user = await tx.player.findFirst({
      where: { id, ...nonretiredPlayer },
    });

    if (!user) {
      return invalidTargetResponse(request, "api:admin:players:id:reset-elo");
    }

    const updated = await tx.player.update({
      where: { id },
      data: { elo: 1000 },
      select: {
        id: true,
        name: true,
        clubMemberships: { where: { retiredByAdmissionEventId: null, ownerUserId: { not: null } }, select: { ownerUserId: true } },
        elo: true,
        isActive: true,

        createdAt: true,
      },
    });

    const { clubMemberships, ...player } = updated;
    return NextResponse.json({ ...player, email: null, isClaimed: clubMemberships.length > 0 });
    });
  } catch (error: unknown) {
    if (error instanceof ClubPlayerOwnershipError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    logError("Reset ELO error", error);
    return safeErrorResponse();
  }
}
