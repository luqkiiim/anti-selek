// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { backInApp, changeAppQuery, clubHref, getClubTab, getSessionTab, navigateApp, registerAppDestination, sessionHref } from "./appNavigation";

afterEach(() => { history.replaceState(null, "", "/"); sessionStorage.clear(); });
describe("canonical app navigation", () => {
  it("translates existing club tabs and encodes exact identifiers", () => {
    expect(["overview", "tournaments", "leaderboard", "host", "profile"].map(getClubTab)).toEqual(["club", "sessions", "rankings", "setup", "profile"]);
    expect(clubHref("club / A", "sessions", true)).toBe("/club/club%20%2F%20A?tab=sessions&view=global");
    expect(sessionHref("A/B", "club 2", "standings")).toBe("/session/A%2FB?tab=standings&view=global&clubId=club+2");
    expect(getSessionTab("unknown")).toBe("Courts");
  });
  it("preserves read scope while opening and closing profile stacks", () => {
    const href = "/club/c?tab=rankings&view=global#top";
    const open = changeAppQuery(href, { member: ["first", "second"] });
    expect(new URL(open, location.origin).searchParams.getAll("member")).toEqual(["first", "second"]);
    expect(changeAppQuery(open, { member: null })).toBe(href);
  });
  it("adds one history entry for a settled tab and none for the same tab", () => {
    history.replaceState(null, "", "/club/c?tab=club");
    const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
    const count = history.length;
    navigateApp(router, "/club/c?tab=sessions");
    expect(history.length).toBe(count + 1);
    expect(history.state.antiSelekFrom).toBe("/club/c?tab=club");
    navigateApp(router, "/club/c?tab=sessions");
    expect(history.length).toBe(count + 1);
    expect(router.push).not.toHaveBeenCalled();
    backInApp(router, "/");
    expect(router.back).toHaveBeenCalledOnce();
  });
  it("uses the router across pages and records an app-local return destination", () => {
    const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
    navigateApp(router, "/session/LIVE?tab=courts");
    expect(router.push).toHaveBeenCalledWith("/session/LIVE?tab=courts", { scroll: false });
    history.replaceState(null, "", "/session/LIVE?tab=courts");
    registerAppDestination();
    expect(history.state.antiSelekFrom).toBe("/");
  });
  it("uses a safe fallback on cold links rather than leaving the app", () => {
    history.replaceState(null, "", "/session/LIVE");
    const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
    backInApp(router, "/club/c?tab=sessions");
    expect(router.replace).toHaveBeenCalledWith("/club/c?tab=sessions", { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });
});
