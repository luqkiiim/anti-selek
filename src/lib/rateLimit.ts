import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { logError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getRequestIp, getRequestUserAgent } from "@/lib/requestMetadata";

if (typeof window !== "undefined") {
  throw new Error("Rate limiting helpers are server-only.");
}

interface HeaderCarrier {
  headers: Headers;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitArgs {
  consume?: boolean;
  key: string;
  max: number;
  now?: number;
  scope?: string;
  windowMs: number;
}

interface RateLimitOptions {
  applyHighRiskBucket?: boolean;
  consume?: boolean;
  identity?: string | null;
  limit?: number;
  now?: number;
  windowMs?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

type RateLimitStore = Map<string, RateLimitEntry>;

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;
const HIGH_RISK_LIMIT = 5;
const HIGH_RISK_WINDOW_MS = 60_000;
const INVALID_TARGET_LIMIT = 5;
const INVALID_TARGET_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_RESPONSE_BODY = {
  success: false,
  error: "Rate limit exceeded",
};
const UNAUTHORIZED_RESPONSE_BODY = {
  success: false,
  error: "Unauthorized",
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __antiSelekRateLimitStore?: RateLimitStore;
};

function getRateLimitStore(): RateLimitStore {
  if (!globalForRateLimit.__antiSelekRateLimitStore) {
    globalForRateLimit.__antiSelekRateLimitStore = new Map();
  }

  return globalForRateLimit.__antiSelekRateLimitStore;
}

function shouldDisableRateLimits() {
  return (
    process.env.E2E_DISABLE_RATE_LIMITS === "true" ||
    (process.env.NODE_ENV === "test" &&
      process.env.ENABLE_RATE_LIMIT_TESTS !== "true")
  );
}

function pruneExpiredEntries(now: number) {
  const store = getRateLimitStore();

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function normalizeKeyPart(part: string | null | undefined) {
  if (typeof part !== "string") {
    return "unknown";
  }

  const normalized = part.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "unknown";
}

function getRequestHeader(
  request: HeaderCarrier | undefined,
  name: string
): string | null {
  return request?.headers.get(name) ?? null;
}

function getRequestSource(request: HeaderCarrier | undefined) {
  return getRequestIp(request) ?? "unknown";
}

function toTimestamp(value: Date | string | number) {
  if (value instanceof Date) {
    return value.getTime();
  }

  return new Date(value).getTime();
}

function retryAfterSeconds(resetAt: number, now: number) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(RATE_LIMIT_RESPONSE_BODY, {
    headers: {
      "Retry-After": String(result.retryAfterSeconds),
    },
    status: 429,
  });
}

export function buildRateLimitKey(parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizeKeyPart(part)).join(":");
}

export function buildRateLimitStorageKey(
  parts: Array<string | null | undefined>
) {
  return createHash("sha256").update(buildRateLimitKey(parts)).digest("hex");
}

export function getRequestRateLimitSource(
  request: HeaderCarrier | undefined
) {
  return getRequestSource(request);
}

export function isHighRiskRequest(request: HeaderCarrier | undefined) {
  const userAgent = getRequestUserAgent(request);
  const accept = getRequestHeader(request, "accept");
  const acceptLanguage = getRequestHeader(request, "accept-language");
  const secFetchSite = getRequestHeader(request, "sec-fetch-site");

  if (!userAgent || !accept) {
    return true;
  }

  if (
    /\b(bot|crawler|spider|curl|wget|python|httpie|postman|insomnia|okhttp|axios|node-fetch|undici)\b/i.test(
      userAgent
    )
  ) {
    return true;
  }

  return !acceptLanguage && !secFetchSite && !/\bmozilla\//i.test(userAgent);
}

export function applyRateLimit({
  consume = true,
  key,
  max,
  now = Date.now(),
  windowMs,
}: RateLimitArgs): RateLimitResult {
  pruneExpiredEntries(now);

  const store = getRateLimitStore();
  let entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    store.set(key, entry);
  }

  if (entry.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: retryAfterSeconds(entry.resetAt, now),
    };
  }

  if (consume) {
    entry.count += 1;
  }

  return {
    allowed: true,
    remaining: Math.max(0, max - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

async function applyPersistentRateLimit({
  consume = true,
  key,
  max,
  now = Date.now(),
  scope = "rate-limit",
  windowMs,
}: RateLimitArgs): Promise<RateLimitResult> {
  const nowDate = new Date(now);
  const nextResetAt = new Date(now + windowMs);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM "RateLimitBucket"
        WHERE "resetAt" <= ${nowDate}
      `;

      const rows = await tx.$queryRaw<
        Array<{ count: number; resetAt: Date | string | number }>
      >`
        SELECT "count", "resetAt"
        FROM "RateLimitBucket"
        WHERE "key" = ${key}
        LIMIT 1
      `;
      const existing = rows[0] ?? null;
      const existingResetAt = existing ? toTimestamp(existing.resetAt) : 0;

      if (!existing || existingResetAt <= now) {
        const count = consume ? 1 : 0;
        await tx.$executeRaw`
          INSERT INTO "RateLimitBucket" (
            "key",
            "scope",
            "count",
            "resetAt",
            "createdAt",
            "updatedAt"
          )
          VALUES (${key}, ${scope}, ${count}, ${nextResetAt}, ${nowDate}, ${nowDate})
          ON CONFLICT("key") DO UPDATE SET
            "scope" = ${scope},
            "count" = ${count},
            "resetAt" = ${nextResetAt},
            "updatedAt" = ${nowDate}
        `;

        return {
          allowed: true,
          remaining: Math.max(0, max - count),
          resetAt: nextResetAt.getTime(),
          retryAfterSeconds: Math.max(
            0,
            Math.ceil((nextResetAt.getTime() - now) / 1000)
          ),
        };
      }

      const count = Number(existing.count);
      if (count >= max) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: existingResetAt,
          retryAfterSeconds: retryAfterSeconds(existingResetAt, now),
        };
      }

      const nextCount = consume ? count + 1 : count;
      if (consume) {
        await tx.$executeRaw`
          UPDATE "RateLimitBucket"
          SET "count" = ${nextCount},
              "updatedAt" = ${nowDate}
          WHERE "key" = ${key}
        `;
      }

      return {
        allowed: true,
        remaining: Math.max(0, max - nextCount),
        resetAt: existingResetAt,
        retryAfterSeconds: Math.max(
          0,
          Math.ceil((existingResetAt - now) / 1000)
        ),
      };
    });

    if (!result || typeof result.allowed !== "boolean") {
      throw new Error("Rate limit storage returned an invalid result");
    }

    return result;
  } catch (error) {
    logError("Rate limit storage error", error);
    return {
      allowed: true,
      remaining: max,
      resetAt: now + windowMs,
      retryAfterSeconds: 0,
    };
  }
}

export async function checkRateLimit(
  request: HeaderCarrier | undefined,
  keyPrefix: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now();

  if (shouldDisableRateLimits()) {
    return {
      allowed: true,
      remaining: limit,
      resetAt: now + windowMs,
      retryAfterSeconds: 0,
    };
  }

  const source = getRequestSource(request);
  const storageKey = buildRateLimitStorageKey([
    keyPrefix,
    options.identity,
    source,
  ]);
  const result = await applyPersistentRateLimit({
    consume: options.consume,
    key: storageKey,
    max: limit,
    now,
    scope: keyPrefix,
    windowMs,
  });

  if (!result.allowed || options.applyHighRiskBucket === false) {
    return result;
  }

  if (!isHighRiskRequest(request)) {
    return result;
  }

  return applyPersistentRateLimit({
    consume: options.consume,
    key: buildRateLimitStorageKey(["high-risk", keyPrefix, source]),
    max: HIGH_RISK_LIMIT,
    now,
    scope: `high-risk:${keyPrefix}`,
    windowMs: HIGH_RISK_WINDOW_MS,
  });
}

export async function rateLimit(
  request: HeaderCarrier | undefined,
  keyPrefix: string,
  options: RateLimitOptions = {}
) {
  const result = await checkRateLimit(request, keyPrefix, options);
  return result.allowed ? null : rateLimitResponse(result);
}

export async function checkInvalidTargetRateLimit(
  request: HeaderCarrier | undefined,
  keyPrefix: string
) {
  return rateLimit(request, `invalid-target:${keyPrefix}`, {
    applyHighRiskBucket: false,
    consume: false,
    limit: INVALID_TARGET_LIMIT,
    windowMs: INVALID_TARGET_WINDOW_MS,
  });
}

export async function invalidTargetResponse(
  request: HeaderCarrier | undefined,
  keyPrefix: string
) {
  const limited = await rateLimit(request, `invalid-target:${keyPrefix}`, {
    applyHighRiskBucket: false,
    limit: INVALID_TARGET_LIMIT,
    windowMs: INVALID_TARGET_WINDOW_MS,
  });

  return (
    limited ??
    NextResponse.json(UNAUTHORIZED_RESPONSE_BODY, {
      status: 403,
    })
  );
}

export function clearRateLimitStore() {
  getRateLimitStore().clear();
}
