import { afterEach, describe, expect, it } from "vitest";
import {
  applyRateLimit,
  buildRateLimitKey,
  clearRateLimitStore,
} from "@/lib/rateLimit";

describe("rate limiting", () => {
  afterEach(() => {
    clearRateLimitStore();
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
});
