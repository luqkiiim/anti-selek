import { afterEach, describe, expect, it } from "vitest";

import { getRequestIp, getRequestUserAgent } from "@/lib/requestMetadata";

describe("request metadata", () => {
  const originalTrustProxyHeaders = process.env.TRUST_PROXY_HEADERS;
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (typeof originalTrustProxyHeaders === "undefined") {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxyHeaders;
    }

    if (typeof originalVercel === "undefined") {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = originalVercel;
    }
  });

  it("extracts the first forwarded IP and user agent", () => {
    process.env.VERCEL = "1";

    const headers = new Headers({
      "user-agent": "Vitest Agent",
      "x-forwarded-for": "203.0.113.10, 198.51.100.7",
    });

    expect(getRequestIp({ headers })).toBe("203.0.113.10");
    expect(getRequestUserAgent({ headers })).toBe("Vitest Agent");
  });

  it("falls back through alternate proxy headers", () => {
    process.env.TRUST_PROXY_HEADERS = "true";

    expect(
      getRequestIp({
        headers: new Headers({
          "x-real-ip": "198.51.100.11",
        }),
      })
    ).toBe("198.51.100.11");

    expect(
      getRequestIp({
        headers: new Headers({
          "cf-connecting-ip": "198.51.100.12",
        }),
      })
    ).toBe("198.51.100.12");
  });

  it("ignores spoofable proxy IP headers when they are not trusted", () => {
    delete process.env.VERCEL;
    delete process.env.TRUST_PROXY_HEADERS;

    expect(
      getRequestIp({
        headers: new Headers({
          "x-forwarded-for": "203.0.113.10",
          "x-real-ip": "198.51.100.11",
        }),
      })
    ).toBeNull();
  });
});
