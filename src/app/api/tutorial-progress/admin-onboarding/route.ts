import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ADMIN_ONBOARDING_TUTORIAL_KEY,
  buildAdminOnboardingProgress,
  normalizeAdminOnboardingStepIds,
  parseAdminOnboardingStepIds,
} from "@/lib/adminOnboarding";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { prisma } from "@/lib/prisma";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getAdminOnboardingProgress(userId: string, isGlobalAdmin: boolean) {
  const [progress, memberships] = await Promise.all([
    prisma.tutorialProgress.findUnique({
      where: {
        userId_tutorialKey: {
          userId,
          tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        },
      },
    }),
    prisma.communityMember.findMany({
      where: {
        userId,
        ...(isGlobalAdmin ? {} : { role: "ADMIN" }),
      },
      include: {
        community: {
          select: {
            id: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                sessions: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const adminCommunityIds = memberships.map((membership) => membership.communityId);
  const hasRosteredSession =
    adminCommunityIds.length > 0
      ? Boolean(
          await prisma.session.findFirst({
            where: {
              communityId: { in: adminCommunityIds },
              players: { some: {} },
            },
            select: { id: true },
          })
        )
      : false;

  return buildAdminOnboardingProgress({
    completedStepIds: parseAdminOnboardingStepIds(
      progress?.completedStepIdsJson
    ),
    dismissedAt: progress?.dismissedAt ?? null,
    primaryCommunityId: memberships[0]?.communityId ?? null,
    hasAdminCommunity: memberships.length > 0,
    hasRosterPlayers: memberships.some(
      (membership) => membership.community._count.members > 1
    ),
    hasAnySession: memberships.some(
      (membership) => membership.community._count.sessions > 0
    ),
    hasRosteredSession,
  });
}

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:tutorial_progress:admin_onboarding:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        buildAdminOnboardingProgress({
          completedStepIds: [],
          dismissedAt: null,
          primaryCommunityId: null,
          hasAdminCommunity: false,
          hasRosterPlayers: false,
          hasAnySession: false,
          hasRosteredSession: false,
        })
      );
    }

    return NextResponse.json(
      await getAdminOnboardingProgress(
        session.user.id,
        !!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null)
      )
    );
  } catch (error) {
    logError("Load admin onboarding progress error", error);
    return safeErrorResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:tutorial_progress:admin_onboarding:patch",
      { limit: 15, windowMs: 60_000 }
    );
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { completedStepIds, dismissed } = body as {
      completedStepIds?: unknown;
      dismissed?: unknown;
    };
    const normalizedStepIds =
      completedStepIds === undefined
        ? undefined
        : normalizeAdminOnboardingStepIds(completedStepIds);
    if (completedStepIds !== undefined && normalizedStepIds === null) {
      return NextResponse.json(
        { error: "completedStepIds must be an array" },
        { status: 400 }
      );
    }
    if (dismissed !== undefined && typeof dismissed !== "boolean") {
      return NextResponse.json(
        { error: "dismissed must be a boolean" },
        { status: 400 }
      );
    }

    const existing = await prisma.tutorialProgress.findUnique({
      where: {
        userId_tutorialKey: {
          userId: session.user.id,
          tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        },
      },
    });
    const completedStepIdsJson =
      normalizedStepIds === undefined
        ? existing?.completedStepIdsJson ?? "[]"
        : JSON.stringify(normalizedStepIds);
    const dismissedAt =
      dismissed === undefined
        ? existing?.dismissedAt ?? null
        : dismissed
          ? new Date()
          : null;

    await prisma.tutorialProgress.upsert({
      where: {
        userId_tutorialKey: {
          userId: session.user.id,
          tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        },
      },
      create: {
        userId: session.user.id,
        tutorialKey: ADMIN_ONBOARDING_TUTORIAL_KEY,
        completedStepIdsJson,
        dismissedAt,
      },
      update: {
        completedStepIdsJson,
        dismissedAt,
      },
    });

    return NextResponse.json(
      await getAdminOnboardingProgress(
        session.user.id,
        !!session.user.isAdmin || isGlobalAdminEmail(session.user.email ?? null)
      )
    );
  } catch (error) {
    logError("Update admin onboarding progress error", error);
    return safeErrorResponse();
  }
}
