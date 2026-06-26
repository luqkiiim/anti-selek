import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ClubBottomTabs } from "./ClubBottomTabs";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

describe("ClubBottomTabs", () => {
  it("keeps club navigation visible through tablet widths", () => {
    const markup = renderToStaticMarkup(
      <ClubBottomTabs
        activeTab="overview"
        canManageClub
        clubId="club-1"
        currentUserId="user-1"
      />
    );

    expect(markup).toContain('aria-label="Club navigation"');
    expect(markup).toContain("xl:hidden");
    expect(markup).not.toContain("sm:hidden");
  });
});
