import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";
import {
  ensureTutorialPlayground,
  getTutorialPlaygroundSummary,
} from "@/lib/tutorialPlayground";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:tutorial-playground:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json({ playground: null });
    }

    return NextResponse.json({
      playground: await getTutorialPlaygroundSummary(session.user.id),
    });
  } catch (error) {
    logError("Load tutorial playground error", error);
    return safeErrorResponse();
  }
}

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:tutorial-playground:post",
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

    return NextResponse.json({
      playground: await ensureTutorialPlayground(session.user.id),
    });
  } catch (error) {
    logError("Open tutorial playground error", error);
    return safeErrorResponse();
  }
}
