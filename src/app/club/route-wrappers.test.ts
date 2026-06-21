import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  ANTI_SELEK_DEPRECATED_HEADER,
  DEPRECATED_COMMUNITY_CONTRACT_MESSAGE,
  DEPRECATION_HEADER,
  LINK_HEADER,
} from "@/lib/deprecatedCommunityContracts";
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

describe("club page route wrappers", () => {
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
  });

  it("scopes page deprecation middleware to legacy community routes", () => {
    expect(config.matcher).toEqual(["/community/:path*"]);
  });
});
