import { describe, expect, it } from "vitest";
import {
  isClaimableCommunityPlaceholder,
  mergeCommunityRoles,
} from "./communityClaims";

describe("community claim helpers", () => {
  it("keeps admin role if either side is admin", () => {
    expect(mergeCommunityRoles("ADMIN", "MEMBER")).toBe("ADMIN");
    expect(mergeCommunityRoles("MEMBER", "ADMIN")).toBe("ADMIN");
    expect(mergeCommunityRoles("ADMIN", "ADMIN")).toBe("ADMIN");
  });

  it("keeps member role when neither side is admin", () => {
    expect(mergeCommunityRoles("MEMBER", "MEMBER")).toBe("MEMBER");
  });

  it("only allows email-less unclaimed placeholders to be claimed", () => {
    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: false,
        email: null,
      })
    ).toBe(true);

    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: true,
        email: null,
      })
    ).toBe(false);

    expect(
      isClaimableCommunityPlaceholder({
        isClaimed: false,
        email: "placeholder@example.com",
      })
    ).toBe(false);
  });
});
