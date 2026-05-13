import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { createSessionForUser } from "./createSessionService";
import { listSessionsForCommunity } from "./listSessionsService";
import { SessionRouteError } from "./sessionRouteShared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import {
  canQuickAccessCommunity,
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
} from "@/lib/quickAccess";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:post", { limit: 15, windowMs: 60_000 });
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
    const input = parseCreateSessionRequest(body);
    const createdSession = await createSessionForUser({
      requesterId: session.user.id,
      requesterIsAdmin: !!session.user.isAdmin,
      input,
    });

    return NextResponse.json(createdSession);
  } catch (error) {
    if (error instanceof SessionRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError("Session creation error details", error);
    return safeErrorResponse();
  }
}

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");
    if (!communityId) {
      return NextResponse.json([]);
    }
    if (!canQuickAccessCommunity(session, communityId)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const sessions = await listSessionsForCommunity({
      communityId,
      viewerId: session.user.id,
      viewerIsAdmin: !isQuickAccessSession(session) && !!session.user.isAdmin,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof SessionRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError("Session list error", error);
    return safeErrorResponse();
  }
}
