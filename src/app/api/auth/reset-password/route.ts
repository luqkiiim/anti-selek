import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isPasswordResetTokenExpired, PASSWORD_RESET_MIN_LENGTH, hashPasswordResetToken } from "@/lib/passwordReset";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const INVALID_TOKEN_ERROR = "Reset link is invalid or expired";

export async function POST(request: Request) {
  let tokenHash: string | null = null;

  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:auth:reset-password:post",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, password } = body as {
      token?: unknown;
      password?: unknown;
    };

    if (typeof token !== "string" || token.trim().length === 0) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < PASSWORD_RESET_MIN_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    tokenHash = hashPasswordResetToken(token.trim());
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isClaimed: true,
          },
        },
      },
    });

    if (
      !resetToken ||
      resetToken.usedAt !== null ||
      isPasswordResetTokenExpired(resetToken.expiresAt) ||
      !resetToken.user.isClaimed ||
      !resetToken.user.email
    ) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 10);
    let consumedToken = false;

    await prisma.$transaction(async (tx) => {
      const consumeResult = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (consumeResult.count !== 1) {
        return;
      }
      consumedToken = true;

      await tx.user.update({
        where: { id: resetToken.user.id },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.user.id,
          usedAt: null,
          id: {
            not: resetToken.id,
          },
        },
        data: {
          usedAt: now,
        },
      });
    });

    if (!consumedToken) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
    }

    logAuditEvent({
      action: "auth.reset_password",
      actor: {
        email: resetToken.user.email,
        userId: resetToken.user.id,
      },
      outcome: "success",
      request,
      scope: {
        route: "/api/auth/reset-password",
      },
      target: {
        id: resetToken.user.id,
        name: resetToken.user.name,
        type: "user",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logAuditEvent({
      action: "auth.reset_password",
      details: {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        reason: "reset_password_error",
      },
      outcome: "error",
      request,
      scope: {
        route: "/api/auth/reset-password",
      },
      target: tokenHash
        ? {
            id: tokenHash,
            type: "password_reset_token",
          }
        : {
            type: "password_reset_token",
          },
    });
    logError("Reset password route error", error);
    return safeErrorResponse();
  }
}
