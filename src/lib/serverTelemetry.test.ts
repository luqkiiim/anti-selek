import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_COMMUNITY_ROUTE_USED_EVENT,
  logTelemetryEvent,
} from "@/lib/serverTelemetry";

describe("server telemetry logging", () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof originalVercel === "undefined") {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = originalVercel;
    }
  });

  it("emits a structured telemetry payload with request metadata", () => {
    process.env.VERCEL = "1";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/communities/club-1", {
      headers: {
        "user-agent": "Vitest Agent",
        "x-forwarded-for": "203.0.113.10, 198.51.100.7",
      },
    });

    logTelemetryEvent({
      details: {
        method: "GET",
        route: "/api/communities/[id]",
        surface: "api",
      },
      event: LEGACY_COMMUNITY_ROUTE_USED_EVENT,
      request,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe("[telemetry]");

    const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[1])) as {
      details: Record<string, unknown>;
      event: string;
      request: {
        ip: string | null;
        userAgent: string | null;
      };
      timestamp: string;
    };

    expect(payload).toMatchObject({
      details: {
        method: "GET",
        route: "/api/communities/[id]",
        surface: "api",
      },
      event: LEGACY_COMMUNITY_ROUTE_USED_EVENT,
      request: {
        ip: "203.0.113.10",
        userAgent: "Vitest Agent",
      },
    });
    expect(typeof payload.timestamp).toBe("string");
  });
});
