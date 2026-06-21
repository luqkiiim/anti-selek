import { describe, expect, it, vi } from "vitest";

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
});
