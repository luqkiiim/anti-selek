import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { prisma } from "@/lib/prisma";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/serverAudit";
import {
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";

export const dynamic = "force-dynamic";

function toCurrentUserPayload(
  user: {
    id: string;
    email: string | null;
    name: string;
    avatarKey: string | null;
    isClaimed: boolean;
    gender: string;
    partnerPreference: string;
    mixedSideOverride: string | null;
    elo: number;
    createdAt: Date;
    selfNameChangedAt: Date | null;
  },
  session: Session
) {
  return {
    ...serializeAvatarEntity(user),
    isAdmin:
      !session.user.isQuickAccess &&
      (!!session.user.isAdmin || isGlobalAdminEmail(user.email)),
    isQuickAccess: !!session.user.isQuickAccess,
    quickAccessCommunityId: session.user.quickAccessCommunityId ?? null,
    selfNameChangedAt: user.selfNameChangedAt,
    canRenameName:
      user.isClaimed &&
      !session.user.isQuickAccess &&
      user.selfNameChangedAt === null,
  };
}

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
      selfNameChangedAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: toCurrentUserPayload(user, session),
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

async function updateCurrentUserRoute(request: Request) {
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

  const { name } = body as { name?: unknown };
  if (typeof name !== "string") {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const nextName = name.trim();
  if (!normalizeNameLookupKey(nextName)) {
    return NextResponse.json(
      { error: "Player name must include letters or numbers" },
      { status: 400 }
    );
  }

  const currentUser = await prisma.user.findUnique({
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
      selfNameChangedAt: true,
    },
  });

  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!currentUser.isClaimed) {
    return NextResponse.json(
      { error: "Only full accounts can change player names" },
      { status: 403 }
    );
  }

  if (nextName === currentUser.name) {
    return NextResponse.json({
      user: toCurrentUserPayload(currentUser, session),
    });
  }

  if (currentUser.selfNameChangedAt !== null) {
    return NextResponse.json(
      { error: "Player name can only be changed once" },
      { status: 409 }
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      name: nextName,
      selfNameChangedAt: new Date(),
    },
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
      selfNameChangedAt: true,
    },
  });

  logAuditEvent({
    action: "user.rename_self",
    actor: {
      email: currentUser.email ?? session.user.email ?? null,
      isGlobalAdmin: !!session.user.isAdmin,
      userId: currentUser.id,
    },
    details: {
      previousName: currentUser.name,
      nextName,
    },
    outcome: "success",
    request,
    scope: {
      route: "/api/user/me",
    },
    target: {
      id: updatedUser.id,
      name: updatedUser.name,
      type: "user",
    },
  });

  return NextResponse.json({
    user: toCurrentUserPayload(updatedUser, session),
  });
}

export async function PATCH(...args: Parameters<typeof updateCurrentUserRoute>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:user:me:patch", {
      limit: 15,
      windowMs: 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    return await updateCurrentUserRoute(...args);
  } catch (error) {
    logError("Update current user error", error);
    return safeErrorResponse();
  }
}
