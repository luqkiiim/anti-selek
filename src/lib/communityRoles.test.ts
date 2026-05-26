import { describe, expect, it } from "vitest";
import {
  getCommunityRoleLabel,
  getHighestCommunityRole,
  isCommunityAdminRole,
  isCommunityOperatorRole,
  normalizeCommunityRole,
} from "./communityRoles";
import { CommunityRole } from "@/types/enums";

describe("community roles", () => {
  it("normalizes unknown roles to member", () => {
    expect(normalizeCommunityRole("ADMIN")).toBe(CommunityRole.ADMIN);
    expect(normalizeCommunityRole("STAFF")).toBe(CommunityRole.STAFF);
    expect(normalizeCommunityRole("wat")).toBe(CommunityRole.MEMBER);
    expect(normalizeCommunityRole(null)).toBe(CommunityRole.MEMBER);
  });

  it("splits admin-only from session operator roles", () => {
    expect(isCommunityAdminRole("ADMIN")).toBe(true);
    expect(isCommunityAdminRole("STAFF")).toBe(false);
    expect(isCommunityOperatorRole("ADMIN")).toBe(true);
    expect(isCommunityOperatorRole("STAFF")).toBe(true);
    expect(isCommunityOperatorRole("MEMBER")).toBe(false);
  });

  it("uses admin greater than staff greater than member precedence", () => {
    expect(getHighestCommunityRole("MEMBER", "STAFF")).toBe(CommunityRole.STAFF);
    expect(getHighestCommunityRole("STAFF", "ADMIN")).toBe(CommunityRole.ADMIN);
    expect(getHighestCommunityRole("MEMBER", "ADMIN")).toBe(CommunityRole.ADMIN);
  });

  it("returns friendly labels", () => {
    expect(getCommunityRoleLabel("ADMIN")).toBe("Admin");
    expect(getCommunityRoleLabel("STAFF")).toBe("Staff");
    expect(getCommunityRoleLabel("MEMBER")).toBe("Member");
  });
});
