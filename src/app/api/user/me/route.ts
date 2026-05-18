import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

async function getCurrentUserRoute(_request: Request) {
  void _request;

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatarKey: true,
      isClaimed: true,
      gender: true,
      partnerPreference: true,
      mixedSideOverride: true,
      elo: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      ...serializeAvatarEntity(user),
      isAdmin:
        !session.user.isQuickAccess &&
        (!!session.user.isAdmin || isGlobalAdminEmail(user.email)),
      isQuickAccess: !!session.user.isQuickAccess,
      quickAccessCommunityId: session.user.quickAccessCommunityId ?? null,
    },
  });
}

export async function GET(...args: Parameters<typeof getCurrentUserRoute>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:user:me:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await getCurrentUserRoute(...args);
  } catch (error) {
    logError("Load current user error", error);
    return safeErrorResponse();
  }
}
