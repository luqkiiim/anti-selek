import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  applyRateLimit,
  buildRateLimitKey,
  getRequestRateLimitSource,
} from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/serverAudit";

export const dynamic = "force-dynamic";

const SIGN_UP_MAX_ATTEMPTS = 5;
const SIGN_UP_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  let normalizedEmail: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email, password, name } = body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof name !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    if (!normalizedEmail || !normalizedName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const rateLimit = applyRateLimit({
      key: buildRateLimitKey([
        "auth",
        "signup",
        normalizedEmail,
        getRequestRateLimitSource(request),
      ]),
      max: SIGN_UP_MAX_ATTEMPTS,
      windowMs: SIGN_UP_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      logAuditEvent({
        action: "auth.sign_up",
        actor: {
          email: normalizedEmail,
        },
        details: {
          reason: "rate_limited",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        outcome: "denied",
        request,
        scope: {
          route: "/api/auth/signup",
        },
        target: {
          id: normalizedEmail,
          type: "user",
        },
      });
      return NextResponse.json(
        { error: "Too many signup attempts. Please wait and try again." },
        {
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
          status: 429,
        }
      );
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const passwordHash = await bcrypt.hash(password, 10);

    if (existingByEmail?.isClaimed || existingByEmail?.passwordHash) {
      logAuditEvent({
        action: "auth.sign_up",
        actor: {
          email: normalizedEmail,
        },
        details: {
          reason: "email_already_registered",
        },
        outcome: "denied",
        request,
        scope: {
          route: "/api/auth/signup",
        },
        target: {
          id: normalizedEmail,
          type: "user",
        },
      });
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    let user;
    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          name: normalizedName,
          passwordHash,
          isClaimed: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: normalizedName,
          isClaimed: true,
        },
      });
    }

    logAuditEvent({
      action: "auth.sign_up",
      actor: {
        email: user.email ?? normalizedEmail,
        userId: user.id,
      },
      outcome: "success",
      request,
      scope: {
        route: "/api/auth/signup",
      },
      target: {
        id: user.id,
        name: user.name,
        type: "user",
      },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      isClaimed: user.isClaimed,
    });
  } catch (error) {
    logAuditEvent({
      action: "auth.sign_up",
      actor: normalizedEmail
        ? {
            email: normalizedEmail,
          }
        : undefined,
      details: {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        reason: "sign_up_error",
      },
      outcome: "error",
      request,
      scope: {
        route: "/api/auth/signup",
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
    console.error("Signup error details:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
