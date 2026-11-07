import { describe, expect, it } from "vitest";
import { normalizeProductHref } from "./productNavigation";

describe("compatibility navigation uses current screens", () => {
  it.each([
    ["/signin?callbackUrl=%2Fsession%2FA1%3Ftab%3Dstandings", "/signin?callbackUrl=%2Fsession%2FA1%3Ftab%3Dstandings"],
    ["/signup?callbackUrl=%2Fclub%2Fc1", "/signup?callbackUrl=%2Fclub%2Fc1"],
    ["/club/c1?tab=recap&session=DONE", "/club/c1?tab=recap&session=DONE"],
    ["/community/c1?tools=advanced&tab=host", "/club/c1?tab=setup"],
    ["/club/c1?tools=practice", "/club/c1?tab=sessions"],
    ["/club/c1?tab=tournaments&tools=advanced", "/club/c1?tab=sessions"],
    ["/community/c1/admin?tools=advanced&tab=claims", "/club/c1/admin?tab=requests"],
    ["/club/c1/admin?tools=practice", "/club/c1/admin?tab=settings"],
    ["/club/c1/admin?tab=members", "/club/c1/admin?tab=players"],
    ["/session/A1?tools=practice&tab=players#details", "/session/A1?tab=players#details"],
    ["/session/A1?practice=1&tab=standings&view=global&clubId=c1", "/session/A1?tab=standings&view=global&clubId=c1"],
    ["/session/A1?tools=advanced&tab=standings", "/session/A1?tab=standings"],
    ["/profile/p1?clubId=c1&view=global", "/profile/p1?clubId=c1&view=global"],
  ])("normalizes %s", (before, after) => {
    expect(normalizeProductHref(before)).toBe(after);
    expect(normalizeProductHref(after)).toBe(after);
  });
  it("preserves callback destinations, exact profile context, and duplicate read-only flags for validation", () => {
    const url = new URL(normalizeProductHref("/session/A1?tools=advanced&view=global&view=member&clubId=c1&clubId=c2&member=p1&profileClubId=c3&callbackUrl=%2Fclub%2Fc4%3Ftab%3Dprofile"), "https://test.local");
    expect(url.searchParams.getAll("view")).toEqual(["global", "member"]);
    expect(url.searchParams.getAll("clubId")).toEqual(["c1", "c2"]);
    expect(url.searchParams.get("profileClubId")).toBe("c3");
    expect(url.searchParams.get("member")).toBe("p1");
    expect(url.searchParams.get("callbackUrl")).toBe("/club/c4?tab=profile");
  });
});
