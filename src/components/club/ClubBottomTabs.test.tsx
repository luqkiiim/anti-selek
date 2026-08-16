import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ClubBottomTabs } from "./ClubBottomTabs";
import { getAuthorizedClubSections } from "./clubNavigation";

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
        clubId="club-1"
        sections={getAuthorizedClubSections({
          canManageClub: true,
          hasUser: true,
        })}
      />
    );

    expect(markup).toContain('aria-label="Club navigation"');
    expect(markup).toContain("xl:hidden");
    expect(markup).not.toContain("sm:hidden");
    expect(markup.indexOf("Overview")).toBeLessThan(
      markup.indexOf("Tournaments")
    );
    expect(markup.indexOf("Tournaments")).toBeLessThan(
      markup.indexOf("Host")
    );
    expect(markup.indexOf("Host")).toBeLessThan(
      markup.indexOf("Leaderboard")
    );
    expect(markup.indexOf("Leaderboard")).toBeLessThan(
      markup.indexOf("Profile")
    );
  });
});
