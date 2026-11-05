import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth, signIn } from "@/lib/auth";
import { hasAccountPassword } from "@/lib/accountPassword";
import { getSafeCallbackUrl } from "@/lib/authCallback";
import { sameOriginJsonGuard } from "@/lib/clubJoinEntry";
import { isGoogleEnrollmentOpen, isGoogleSignInConfigured } from "@/lib/googleAuthConfig";
import { clearGoogleCompletion, writeGoogleIntent } from "@/lib/googleAuthCookies";
import { checkGooglePasswordRateLimit, googleAccountSelect, isPasswordOnlyEmail } from "@/lib/googleAccounts";
import { getSessionAccountId } from "@/lib/quickAccess";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { logError, safeErrorResponse } from "@/lib/errors";

const startRequest = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("sign-in"), callbackUrl: z.string().max(2048).optional() }),
  z.object({ mode: z.literal("connect"), password: z.string().min(1) }),
]);

export async function POST(request: Request) {
  try {
    const guard = sameOriginJsonGuard(request);
    if (guard) return guard;
    const limited = await rateLimit(request, "api:auth:google:start", { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    if (!isGoogleSignInConfigured()) {
      return NextResponse.json({ error: "Google sign-in is unavailable." }, { status: 503 });
    }
    const input = startRequest.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json({ error: "Invalid Google sign-in request." }, { status: 400 });
    }

    let link: { accountId: string; sessionVersion: number } | undefined;
    let callbackUrl = "/";
    if (input.data.mode === "connect") {
      const accountId = getSessionAccountId(await auth());
      if (!accountId) return NextResponse.json({ error: "Sign in to connect Google." }, { status: 401 });
      const attempts = await checkGooglePasswordRateLimit(request, accountId);
      if (!attempts.allowed) {
        return NextResponse.json({ error: "Too many attempts. Try again later." }, {
          status: 429,
          headers: { "Retry-After": String(attempts.retryAfterSeconds) },
        });
      }

      const account = await prisma.user.findUnique({ where: { id: accountId }, select: googleAccountSelect });
      if (!isGoogleEnrollmentOpen() || !account?.isActive || account.googleIdentity ||
          isPasswordOnlyEmail(account.email) || !hasAccountPassword(account.passwordHash)) {
        return NextResponse.json({ error: "Google linking is unavailable for this account." }, { status: 403 });
      }
      if (!await bcrypt.compare(input.data.password, account.passwordHash)) {
        return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
      }
      link = { accountId, sessionVersion: account.sessionVersion };
      callbackUrl = "/settings";
    } else {
      callbackUrl = getSafeCallbackUrl(input.data.callbackUrl);
    }

    const authorizationUrl = new URL(await signIn("google", {
      redirect: false,
      redirectTo: callbackUrl,
    }, { prompt: "select_account" }));
    const state = authorizationUrl.searchParams.get("state");
    if (authorizationUrl.origin !== "https://accounts.google.com" || !state) {
      return NextResponse.json({ error: "Could not start Google sign-in. Try again." }, { status: 503 });
    }

    await clearGoogleCompletion(request);
    await writeGoogleIntent(request, state, callbackUrl, link);
    return NextResponse.json({ url: authorizationUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("Start Google sign-in", error);
    return safeErrorResponse();
  }
}
