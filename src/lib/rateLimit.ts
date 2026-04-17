import { getRequestIp } from "@/lib/requestMetadata";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitArgs {
  key: string;
  max: number;
  now?: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

type RateLimitStore = Map<string, RateLimitEntry>;

const globalForRateLimit = globalThis as typeof globalThis & {
  __antiSelekRateLimitStore?: RateLimitStore;
};

function getRateLimitStore(): RateLimitStore {
  if (!globalForRateLimit.__antiSelekRateLimitStore) {
    globalForRateLimit.__antiSelekRateLimitStore = new Map();
  }

  return globalForRateLimit.__antiSelekRateLimitStore;
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

export function buildRateLimitKey(parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizeKeyPart(part)).join(":");
}

export function getRequestRateLimitSource(
  request: { headers: Headers } | undefined
) {
  return getRequestIp(request) ?? "unknown";
}

export function applyRateLimit({
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
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000)
      ),
    };
  }

  entry.count += 1;

  return {
    allowed: true,
    remaining: Math.max(0, max - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function clearRateLimitStore() {
  getRateLimitStore().clear();
}
