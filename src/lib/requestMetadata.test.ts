import { describe, expect, it } from "vitest";

import { getRequestIp, getRequestUserAgent } from "@/lib/requestMetadata";

describe("request metadata", () => {
  it("extracts the first forwarded IP and user agent", () => {
    const headers = new Headers({
      "user-agent": "Vitest Agent",
      "x-forwarded-for": "203.0.113.10, 198.51.100.7",
    });

    expect(getRequestIp({ headers })).toBe("203.0.113.10");
    expect(getRequestUserAgent({ headers })).toBe("Vitest Agent");
  });

  it("falls back through alternate proxy headers", () => {
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
});
