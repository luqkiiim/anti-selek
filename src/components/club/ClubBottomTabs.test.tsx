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
    expect(markup.indexOf('aria-label="Club"')).toBeLessThan(markup.indexOf('aria-label="Sessions"'));
    expect(markup.indexOf('aria-label="Sessions"')).toBeLessThan(markup.indexOf('aria-label="Player profile"'));
    expect(markup).not.toContain('aria-label="Host setup"');
    expect(markup).not.toContain('aria-label="Leaderboard"');
  });
});
