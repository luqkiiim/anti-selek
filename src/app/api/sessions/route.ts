import { sportingJson } from "@/lib/sportingResponse";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { createSessionForUser } from "./createSessionService";
import { listSessionsForClub } from "./listSessionsService";
import { SessionRouteError } from "./sessionRouteShared";
import {
  ClubContractAliasConflictError,
  readAliasedSearchParam,
  withLegacyClubAliases,
} from "@/lib/clubContractAliases";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import {
  canQuickAccessClub,
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return sportingJson(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const input = parseCreateSessionRequest(body, {
      canonicalRoute: "/api/sessions",
      request,
      surface: "api",
    });
    const createdSession = await createSessionForUser({
      requesterId: session.user.id,
      requesterIsAdmin: !!session.user.isAdmin,
      input,
    });

    return sportingJson(withLegacyClubAliases(createdSession));
  } catch (error) {
    if (error instanceof SessionRouteError) {
      return sportingJson({ error: error.message }, { status: error.status });
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
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const clubId = readAliasedSearchParam(
      url.searchParams,
      "clubId",
      "communityId",
      "club identifier",
      {
        canonicalRoute: "/api/sessions",
        request,
        surface: "api",
      }
    );
    if (!clubId) {
      return sportingJson([]);
    }
    if (!canQuickAccessClub(session, clubId)) {
      return sportingJson({ error: "Not authorized" }, { status: 403 });
    }

    const sessions = await listSessionsForClub({
      clubId,
      viewerId: session.user.id,
      viewerIsAdmin: !isQuickAccessSession(session) && !!session.user.isAdmin,
    });

    return sportingJson(sessions);
  } catch (error) {
    if (error instanceof ClubContractAliasConflictError) {
      return sportingJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof SessionRouteError) {
      return sportingJson({ error: error.message }, { status: error.status });
    }

    logError("Session list error", error);
    return safeErrorResponse();
  }
}
