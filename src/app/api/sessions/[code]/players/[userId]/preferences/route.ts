import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isValidMixedSide,
  isValidPartnerPreference,
  isValidPlayerGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { isValidSessionPool } from "@/lib/sessionPools";
import { prisma } from "@/lib/prisma";
import { getSessionAdminMembership } from "@/lib/sessionCollab";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { PlayerGender, SessionMode, SessionPool, SessionStatus } from "@/types/enums";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:players:userId:preferences:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId } = await params;

    if (typeof code !== "string" || code.length === 0 || typeof userId !== "string" || userId.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:players:userId:preferences");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { gender, partnerPreference, mixedSideOverride, pool } = body as {
      gender?: unknown;
      partnerPreference?: unknown;
      mixedSideOverride?: unknown;
      pool?: unknown;
    };

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
    if (pool !== undefined && !isValidSessionPool(pool)) {
      return NextResponse.json({ error: "Invalid pool" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        communityId: true,
        mode: true,
        status: true,
        poolsEnabled: true,
      },
    });
    if (!sessionData) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId:preferences");
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already completed" }, { status: 400 });
    }

    const adminMembership = await getSessionAdminMembership(prisma, {
      session: sessionData,
      userId: session.user.id,
      acceptedOnly: true,
    });

    if (!session.user.isAdmin && !adminMembership) {
      return NextResponse.json({ error: "Only admins can update preferences" }, { status: 403 });
    }

    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: {
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        pool: true,
      },
    });
    if (!existing) {
      return invalidTargetResponse(request, "api:sessions:code:players:userId:preferences");
    }

    const nextGender =
      typeof gender === "string"
        ? (gender as PlayerGender)
        : (existing.gender as PlayerGender | undefined) ?? PlayerGender.UNSPECIFIED;

    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(nextGender)
    ) {
      return NextResponse.json(
        { error: `${mixedModeLabel} requires MALE/FEMALE gender for all players` },
        { status: 400 }
      );
    }

    const resolvedMixedState = resolveMixedSideState({
      gender: nextGender,
      mixedSideOverride:
        isValidMixedSide(mixedSideOverride) || mixedSideOverride === null
          ? mixedSideOverride
          : typeof gender === "string"
            ? null
            : existing.mixedSideOverride,
      partnerPreference: isValidPartnerPreference(partnerPreference)
        ? partnerPreference
        : typeof gender === "string"
          ? undefined
          : existing.partnerPreference,
    });

    const updated = await prisma.sessionPlayer.update({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      data: {
        gender: typeof gender === "string" ? gender : undefined,
        partnerPreference: resolvedMixedState.partnerPreference,
        mixedSideOverride: resolvedMixedState.mixedSideOverride,
        pool:
          sessionData.poolsEnabled && isValidSessionPool(pool)
            ? pool
            : sessionData.poolsEnabled
              ? existing.pool
              : SessionPool.A,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logError("Update session preference error", error);
    return safeErrorResponse();
  }
}
