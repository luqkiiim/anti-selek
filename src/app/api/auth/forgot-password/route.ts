import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimit } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  buildPasswordResetUrl,
  generatePasswordResetToken,
  getPasswordResetExpiresAt,
  hashPasswordResetToken,
} from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/passwordResetEmail";

export const dynamic = "force-dynamic";

const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "If that email belongs to a claimed account, we've sent a reset link.";
const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;
const FORGOT_PASSWORD_WINDOW_MS = 60 * 60 * 1000;

function successResponse() {
  return NextResponse.json({
    success: true,
    message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
  });
}

export async function POST(request: Request) {
  let normalizedEmail: string | null = null;

  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:auth:forgot-password:post",
      { limit: 10, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email } = body as { email?: unknown };
    if (typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const credentialRateLimit = await checkRateLimit(request, "auth:forgot-password", {
      applyHighRiskBucket: false,
      identity: normalizedEmail,
      limit: FORGOT_PASSWORD_MAX_ATTEMPTS,
      windowMs: FORGOT_PASSWORD_WINDOW_MS,
    });

    if (!credentialRateLimit.allowed) {
      logAuditEvent({
        action: "auth.forgot_password",
        actor: {
          email: normalizedEmail,
        },
        details: {
          reason: "rate_limited",
          retryAfterSeconds: credentialRateLimit.retryAfterSeconds,
        },
        outcome: "denied",
        request,
        scope: {
          route: "/api/auth/forgot-password",
        },
        target: {
          id: normalizedEmail,
          type: "user",
        },
      });

      return NextResponse.json(
        { success: false, error: "Rate limit exceeded" },
        {
          headers: {
            "Retry-After": String(credentialRateLimit.retryAfterSeconds),
          },
          status: 429,
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        isClaimed: true,
      },
    });

    if (!user?.isClaimed || !user.email) {
      logAuditEvent({
        action: "auth.forgot_password",
        actor: {
          email: normalizedEmail,
        },
        details: {
          reason: "no_claimed_account",
        },
        outcome: "success",
        request,
        scope: {
          route: "/api/auth/forgot-password",
        },
        target: {
          id: normalizedEmail,
          type: "user",
        },
      });

      return successResponse();
    }

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const now = new Date();
    const expiresAt = getPasswordResetExpiresAt(now);

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    try {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl: buildPasswordResetUrl(token, request),
      });

      logAuditEvent({
        action: "auth.forgot_password",
        actor: {
          email: normalizedEmail,
          userId: user.id,
        },
        outcome: "success",
        request,
        scope: {
          route: "/api/auth/forgot-password",
        },
        target: {
          id: user.id,
          name: user.name,
          type: "user",
        },
      });
    } catch (emailError) {
      logAuditEvent({
        action: "auth.forgot_password",
        actor: {
          email: normalizedEmail,
          userId: user.id,
        },
        details: {
          errorMessage:
            emailError instanceof Error ? emailError.message : "Unknown error",
          reason: "email_send_failed",
        },
        outcome: "error",
        request,
        scope: {
          route: "/api/auth/forgot-password",
        },
        target: {
          id: user.id,
          name: user.name,
          type: "user",
        },
      });
      logError("Password reset email send error", emailError);
    }

    return successResponse();
  } catch (error) {
    logAuditEvent({
      action: "auth.forgot_password",
      actor: normalizedEmail
        ? {
            email: normalizedEmail,
          }
        : undefined,
      details: {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        reason: "forgot_password_error",
      },
      outcome: "error",
      request,
      scope: {
        route: "/api/auth/forgot-password",
      },
      target: normalizedEmail
        ? {
            id: normalizedEmail,
            type: "user",
          }
        : {
            type: "user",
          },
    });
    logError("Forgot password route error", error);
    return safeErrorResponse();
  }
}
