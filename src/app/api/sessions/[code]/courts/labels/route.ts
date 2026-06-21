import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

interface CourtLabelUpdateRequest {
  courts?: Array<{
    courtId?: unknown;
    label?: unknown;
  }>;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:courts:labels:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:courts:labels");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = (await request.json().catch(() => null)) as CourtLabelUpdateRequest | null;
    if (!body || !Array.isArray(body.courts) || body.courts.length === 0) {
      return NextResponse.json({ error: "Court labels are required" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        courts: {
          select: {
            id: true,
            courtNumber: true,
          },
        },
      },
    });

    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:courts:labels");
    }

    let isClubOperator = false;
    if (!session.user.isAdmin) {
      const membership = await getSessionOperatorMembership(prisma, {
        session: sessionData,
        userId: session.user.id,
        acceptedOnly: true,
      });
      isClubOperator = !!membership;
    }

    if (!session.user.isAdmin && !isClubOperator) {
      return invalidTargetResponse(request, "api:sessions:code:courts:labels");
    }

    const knownCourtIds = new Set(sessionData.courts.map((court) => court.id));
    const seenCourtIds = new Set<string>();
    const updates: Array<{ courtId: string; label: string | null }> = [];

    for (const court of body.courts) {
      if (typeof court?.courtId !== "string") {
        return NextResponse.json({ error: "Invalid court label payload" }, { status: 400 });
      }

      if (seenCourtIds.has(court.courtId)) {
        return NextResponse.json({ error: "Duplicate court label entry" }, { status: 400 });
      }
      seenCourtIds.add(court.courtId);

      if (!knownCourtIds.has(court.courtId)) {
        return invalidTargetResponse(request, "api:sessions:code:courts:labels");
      }

      if (court.label !== undefined && typeof court.label !== "string") {
        return NextResponse.json({ error: "Invalid court label value" }, { status: 400 });
      }

      const normalizedLabel = typeof court.label === "string" ? court.label.trim() : "";
      if (normalizedLabel.length > 24) {
        return NextResponse.json(
          { error: "Court labels must be 24 characters or fewer" },
          { status: 400 }
        );
      }

      updates.push({
        courtId: court.courtId,
        label: normalizedLabel.length > 0 ? normalizedLabel : null,
      });
    }

    await prisma.$transaction(
      updates.map((court) =>
        prisma.court.update({
          where: { id: court.courtId },
          data: { label: court.label },
        })
      )
    );

    const updatedCourts = await prisma.court.findMany({
      where: { sessionId: sessionData.id },
      orderBy: { courtNumber: "asc" },
      select: {
        id: true,
        courtNumber: true,
        label: true,
      },
    });

    return NextResponse.json({
      courts: updatedCourts,
    });
  } catch (error) {
    logError("Update court labels error", error);
    return safeErrorResponse();
  }
}
