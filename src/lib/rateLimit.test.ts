import { afterEach, describe, expect, it } from "vitest";
import {
  applyRateLimit,
  areRateLimitsDisabled,
  buildRateLimitStorageKey,
  buildRateLimitKey,
  clearRateLimitStore,
  isHighRiskRequest,
} from "@/lib/rateLimit";

describe("rate limiting", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalDisableRateLimits = process.env.LOCAL_DISABLE_RATE_LIMITS;
  const originalE2EDisableRateLimits = process.env.E2E_DISABLE_RATE_LIMITS;
  const originalEnableRateLimitTests = process.env.ENABLE_RATE_LIMIT_TESTS;

  afterEach(() => {
    clearRateLimitStore();
    env.NODE_ENV = originalNodeEnv;

    if (typeof originalLocalDisableRateLimits === "undefined") {
      delete process.env.LOCAL_DISABLE_RATE_LIMITS;
    } else {
      process.env.LOCAL_DISABLE_RATE_LIMITS = originalLocalDisableRateLimits;
    }

    if (typeof originalE2EDisableRateLimits === "undefined") {
      delete process.env.E2E_DISABLE_RATE_LIMITS;
    } else {
      process.env.E2E_DISABLE_RATE_LIMITS = originalE2EDisableRateLimits;
    }

    if (typeof originalEnableRateLimitTests === "undefined") {
      delete process.env.ENABLE_RATE_LIMIT_TESTS;
    } else {
      process.env.ENABLE_RATE_LIMIT_TESTS = originalEnableRateLimitTests;
    }
  });

  it("allows requests until the configured limit", () => {
    const key = buildRateLimitKey(["auth", "signin", "user@example.com", "ip"]);

    const first = applyRateLimit({
      key,
      max: 2,
      now: 1_000,
      windowMs: 60_000,
    });
    const second = applyRateLimit({
      key,
      max: 2,
      now: 1_001,
      windowMs: 60_000,
    });
    const third = applyRateLimit({
      key,
      max: 2,
      now: 1_002,
      windowMs: 60_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets the bucket after the window expires", () => {
    const key = buildRateLimitKey(["auth", "signup", "user@example.com", "ip"]);

    applyRateLimit({
      key,
      max: 1,
      now: 5_000,
      windowMs: 10_000,
    });

    const blocked = applyRateLimit({
      key,
      max: 1,
      now: 5_001,
      windowMs: 10_000,
    });
    const reset = applyRateLimit({
      key,
      max: 1,
      now: 15_001,
      windowMs: 10_000,
    });

    expect(blocked.allowed).toBe(false);
    expect(reset.allowed).toBe(true);
  });

  it("does not consume a bucket when consume is false", () => {
    const key = buildRateLimitKey(["api", "read", "ip"]);

    const checked = applyRateLimit({
      consume: false,
      key,
      max: 1,
      now: 1_000,
      windowMs: 60_000,
    });
    const consumed = applyRateLimit({
      key,
      max: 1,
      now: 1_001,
      windowMs: 60_000,
    });
    const blocked = applyRateLimit({
      key,
      max: 1,
      now: 1_002,
      windowMs: 60_000,
    });

    expect(checked.allowed).toBe(true);
    expect(consumed.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
  });

  it("hashes storage keys instead of exposing raw identifiers", () => {
    const key = buildRateLimitStorageKey([
      "auth",
      "signin",
      "user@example.com",
      "203.0.113.10",
    ]);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("user@example.com");
    expect(key).not.toContain("203.0.113.10");
  });

  it("classifies missing or automated request headers as high risk", () => {
    const browserRequest = {
      headers: new Headers({
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36",
      }),
    };
    const botRequest = {
      headers: new Headers({
        accept: "*/*",
        "user-agent": "curl/8.0.1",
      }),
    };

    expect(isHighRiskRequest(undefined)).toBe(true);
    expect(isHighRiskRequest(botRequest)).toBe(true);
    expect(isHighRiskRequest(browserRequest)).toBe(false);
  });

  it("supports invalid target throttling semantics", () => {
    const key = buildRateLimitKey(["invalid-target", "sessions", "ip"]);
    let result = applyRateLimit({
      key,
      max: 5,
      now: 1_000,
      windowMs: 10 * 60_000,
    });

    for (let i = 0; i < 4; i += 1) {
      result = applyRateLimit({
        key,
        max: 5,
        now: 1_001 + i,
        windowMs: 10 * 60_000,
      });
    }

    const blocked = applyRateLimit({
      key,
      max: 5,
      now: 1_100,
      windowMs: 10 * 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
  });

  it("supports a local-only env switch for disabling rate limits during verification", () => {
    env.NODE_ENV = "development";
    process.env.LOCAL_DISABLE_RATE_LIMITS = "true";
    process.env.ENABLE_RATE_LIMIT_TESTS = "true";
    delete process.env.E2E_DISABLE_RATE_LIMITS;

    expect(areRateLimitsDisabled()).toBe(true);

    env.NODE_ENV = "production";
    expect(areRateLimitsDisabled()).toBe(false);
  });
});
