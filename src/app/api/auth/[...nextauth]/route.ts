import { handlers } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const { GET: nextAuthGET, POST: nextAuthPOST } = handlers;

export async function GET(...args: Parameters<typeof nextAuthGET>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:auth:nextauth:get", { limit: 10, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await nextAuthGET(...args);
  } catch (error) {
    logError("NextAuth GET error", error);
    return safeErrorResponse();
  }
}

export async function POST(...args: Parameters<typeof nextAuthPOST>) {
  try {
    const rateLimitResponse = await rateLimit(args[0], "api:auth:nextauth:post", { limit: 10, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    return await nextAuthPOST(...args);
  } catch (error) {
    logError("NextAuth POST error", error);
    return safeErrorResponse();
  }
}
