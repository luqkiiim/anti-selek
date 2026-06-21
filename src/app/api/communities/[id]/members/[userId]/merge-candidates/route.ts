import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import { DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE } from "@/lib/clubAdminDisabledFeatures";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:communities:id:members:userId:merge-candidates:get",
      { limit: 30, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(
      { error: DISABLED_CROSS_COMMUNITY_PLAYER_ADMIN_MESSAGE },
      { status: 403 }
    );
  } catch (error) {
    logError("List duplicate merge candidates error", error);
    return safeErrorResponse();
  }
}
