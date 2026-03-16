import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { createSessionForUser } from "./createSessionService";
import { listSessionsForCommunity } from "./listSessionsService";
import { SessionRouteError } from "./sessionRouteShared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    console.error("Session creation error details:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");
    if (!communityId) {
      return NextResponse.json([]);
    }

    const sessions = await listSessionsForCommunity({
      communityId,
      viewerId: session.user.id,
      viewerIsAdmin: !!session.user.isAdmin,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof SessionRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Session list error:", error);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
