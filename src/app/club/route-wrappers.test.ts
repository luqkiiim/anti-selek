import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTI_SELEK_DEPRECATED_HEADER,
  DEPRECATED_COMMUNITY_CONTRACT_MESSAGE,
  DEPRECATION_HEADER,
  LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV,
  LINK_HEADER,
  SUNSET_HEADER,
} from "@/lib/deprecatedCommunityContracts";
import { LEGACY_COMMUNITY_ROUTE_USED_EVENT } from "@/lib/serverTelemetry";
import { config, proxy } from "@/proxy";

const pageMocks = vi.hoisted(() => ({
  adminPage: vi.fn(),
  clubPage: vi.fn(),
}));

vi.mock("@/features/club-page/ClubPage", () => ({
  default: pageMocks.clubPage,
}));

vi.mock("@/features/club-admin-page/ClubAdminPage", () => ({
  default: pageMocks.adminPage,
}));

const mutableEnv = process.env as Record<string, string | undefined>;
const previousSunsetDate =
  mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];

describe("club page route wrappers", () => {
  beforeEach(() => {
    delete mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];
  });

  afterEach(() => {
    if (previousSunsetDate === undefined) {
      delete mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];
    } else {
      mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV] = previousSunsetDate;
    }
    vi.restoreAllMocks();
  });

  it("routes canonical and legacy club pages through the shared page module", async () => {
    const [canonical, legacy] = await Promise.all([
      import("@/app/club/[id]/page"),
      import("@/app/community/[id]/page"),
    ]);

    expect(canonical.default).toBe(pageMocks.clubPage);
    expect(legacy.default).toBe(pageMocks.clubPage);
  });

  it("routes canonical and legacy club admin pages through the shared admin module", async () => {
    const [canonical, legacy] = await Promise.all([
      import("@/app/club/[id]/admin/page"),
      import("@/app/community/[id]/admin/page"),
    ]);

    expect(canonical.default).toBe(pageMocks.adminPage);
    expect(legacy.default).toBe(pageMocks.adminPage);
  });

  it("adds deprecation headers to legacy community page routes", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = proxy(
      new NextRequest("http://localhost/community/club-1/admin?tab=members")
    );

    expect(response.headers.get(DEPRECATION_HEADER)).toBe("true");
    expect(response.headers.get(LINK_HEADER)).toBe(
      '</club/club-1/admin?tab=members>; rel="successor-version"'
    );
    expect(response.headers.get(ANTI_SELEK_DEPRECATED_HEADER)).toBe(
      DEPRECATED_COMMUNITY_CONTRACT_MESSAGE
    );
    expect(response.headers.get(SUNSET_HEADER)).toBeNull();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toBe("[telemetry]");

    const payload = JSON.parse(String(infoSpy.mock.calls[0]?.[1])) as {
      details: Record<string, unknown>;
      event: string;
    };

    expect(payload).toMatchObject({
      details: {
        method: "GET",
        responseStatus: 200,
        route: "/community/[id]/admin",
        successorPath: "/club/[id]/admin",
        surface: "page",
      },
      event: LEGACY_COMMUNITY_ROUTE_USED_EVENT,
    });
    expect(JSON.stringify(payload)).not.toContain("club-1");
  });

  it("adds a configured Sunset header to legacy community page routes", () => {
    mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV] = "2026-08-01";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = proxy(
      new NextRequest("http://localhost/community/club-1")
    );

    expect(response.headers.get(DEPRECATION_HEADER)).toBe("true");
    expect(response.headers.get(SUNSET_HEADER)).toBe(
      "Sat, 01 Aug 2026 00:00:00 GMT"
    );
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("scopes page deprecation middleware to legacy community routes", () => {
    expect(config.matcher).toEqual(["/community/:path*"]);
  });
});
