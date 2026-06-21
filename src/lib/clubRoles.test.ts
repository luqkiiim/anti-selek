import { describe, expect, it } from "vitest";
import {
  getClubRoleLabel,
  getHighestClubRole,
  isClubAdminRole,
  isClubOperatorRole,
  normalizeClubRole,
} from "./clubRoles";
import { ClubRole } from "@/types/enums";

describe("club roles", () => {
  it("normalizes unknown roles to member", () => {
    expect(normalizeClubRole("ADMIN")).toBe(ClubRole.ADMIN);
    expect(normalizeClubRole("STAFF")).toBe(ClubRole.STAFF);
    expect(normalizeClubRole("wat")).toBe(ClubRole.MEMBER);
    expect(normalizeClubRole(null)).toBe(ClubRole.MEMBER);
  });

  it("splits admin-only from session operator roles", () => {
    expect(isClubAdminRole("ADMIN")).toBe(true);
    expect(isClubAdminRole("STAFF")).toBe(false);
    expect(isClubOperatorRole("ADMIN")).toBe(true);
    expect(isClubOperatorRole("STAFF")).toBe(true);
    expect(isClubOperatorRole("MEMBER")).toBe(false);
  });

  it("uses admin greater than staff greater than member precedence", () => {
    expect(getHighestClubRole("MEMBER", "STAFF")).toBe(ClubRole.STAFF);
    expect(getHighestClubRole("STAFF", "ADMIN")).toBe(ClubRole.ADMIN);
    expect(getHighestClubRole("MEMBER", "ADMIN")).toBe(ClubRole.ADMIN);
  });

  it("returns friendly labels", () => {
    expect(getClubRoleLabel("ADMIN")).toBe("Admin");
    expect(getClubRoleLabel("STAFF")).toBe("Staff");
    expect(getClubRoleLabel("MEMBER")).toBe("Member");
  });
});
