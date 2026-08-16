import { describe, expect, it } from "vitest";
import {
  getAuthorizedClubSection,
  getAuthorizedClubSections,
} from "./clubNavigation";

describe("club navigation", () => {
  it("uses the same authorized order for every responsive navigation", () => {
    expect(
      getAuthorizedClubSections({ canManageClub: true, hasUser: true }).map(
        (section) => section.key
      )
    ).toEqual([
      "overview",
      "tournaments",
      "host",
      "leaderboard",
      "profile",
    ]);

    expect(
      getAuthorizedClubSections({ canManageClub: false, hasUser: true }).map(
        (section) => section.key
      )
    ).toEqual(["overview", "tournaments", "leaderboard", "profile"]);
  });

  it("rejects unavailable or unknown URL sections", () => {
    const memberSections = getAuthorizedClubSections({
      canManageClub: false,
      hasUser: true,
    });

    expect(getAuthorizedClubSection("host", memberSections)).toBeNull();
    expect(getAuthorizedClubSection("settings", memberSections)).toBeNull();
    expect(getAuthorizedClubSection("profile", memberSections)).toBe(
      "profile"
    );
  });
});
