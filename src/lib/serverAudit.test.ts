import { afterEach, describe, expect, it, vi } from "vitest";

import { logAuditEvent } from "@/lib/serverAudit";

describe("server audit logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a structured audit payload with request metadata", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const headers = new Headers({
      "user-agent": "Vitest Agent",
      "x-forwarded-for": "203.0.113.10, 198.51.100.7",
    });

    logAuditEvent({
      action: "auth.sign_in",
      actor: {
        email: "user@example.com",
      },
      details: {
        reason: "invalid_credentials",
      },
      outcome: "denied",
      request: { headers },
      scope: {
        route: "/api/auth/[...nextauth]",
      },
      target: {
        id: "user@example.com",
        type: "auth_credentials",
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe("[audit]");

    const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[1])) as {
      action: string;
      actor: {
        email: string | null;
        isGlobalAdmin: boolean;
        userId: string | null;
      };
      details: Record<string, unknown>;
      outcome: string;
      request: {
        ip: string | null;
        userAgent: string | null;
      };
      scope: {
        route: string;
      };
      target: {
        id: string;
        type: string;
      };
      timestamp: string;
    };

    expect(payload).toMatchObject({
      action: "auth.sign_in",
      actor: {
        email: "user@example.com",
        isGlobalAdmin: false,
        userId: null,
      },
      details: {
        reason: "invalid_credentials",
      },
      outcome: "denied",
      request: {
        ip: "203.0.113.10",
        userAgent: "Vitest Agent",
      },
      scope: {
        route: "/api/auth/[...nextauth]",
      },
      target: {
        id: "user@example.com",
        type: "auth_credentials",
      },
    });
    expect(typeof payload.timestamp).toBe("string");
  });
});
