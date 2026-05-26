import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { getQuickAccessDeniedMessage, isQuickAccessSession } from "@/lib/quickAccess";
import { rateLimit } from "@/lib/rateLimit";
import { resetTutorialPlayground } from "@/lib/tutorialPlayground";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:tutorial-playground:reset:post",
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
      playground: await resetTutorialPlayground(session.user.id),
    });
  } catch (error) {
    logError("Reset tutorial playground error", error);
    return safeErrorResponse();
  }
}
