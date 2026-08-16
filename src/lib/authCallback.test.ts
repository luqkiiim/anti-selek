import { describe, expect, it } from "vitest";

import {
  getCurrentAppPath,
  getQuickAccessCallbackUrl,
  getSafeCallbackUrl,
  resolveQuickAccessCallbackUrl,
  withCallbackUrl,
} from "./authCallback";

describe("authentication callback URLs", () => {
  it.each([
    ["/club/club-1", "/club/club-1"],
    ["/session/ABC123?tab=standings#leader", "/session/ABC123?tab=standings#leader"],
    ["/settings", "/settings"],
  ])("keeps an app-local destination", (value, expected) => {
    expect(getSafeCallbackUrl(value)).toBe(expected);
  });

  it.each([
    null,
    "",
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
    "/api/clubs",
    "/_next/static/file.js",
    "/signin",
    "/signin/",
    "/signin?callbackUrl=%2Fclub%2Fclub-1",
    "/%73ignin",
    "/%2Fexample.com/steal",
    "/%5Cexample.com/steal",
    "/signup",
    "/forgot-password",
    "/reset-password?token=secret",
    "/club/club-1\nSet-Cookie: bad",
  ])("falls back for an unsafe or looping destination: %s", (value) => {
    expect(getSafeCallbackUrl(value, "/fallback")).toBe("/fallback");
  });

  it("adds only a sanitized callback parameter", () => {
    expect(withCallbackUrl("/signin", "/club/club 1?tab=host")).toBe(
      "/signin?callbackUrl=%2Fclub%2Fclub%25201%3Ftab%3Dhost"
    );
    expect(withCallbackUrl("/signup?source=signin", "https://example.com")).toBe(
      "/signup?source=signin"
    );
  });

  it("captures the complete in-app browser destination", () => {
    expect(
      getCurrentAppPath({
        pathname: "/session/ABC123",
        search: "?tab=standings",
        hash: "#leader",
      })
    ).toBe("/session/ABC123?tab=standings#leader");
  });

  it("limits synchronous Quick access callbacks to the exact club page", () => {
    expect(getQuickAccessCallbackUrl("/club/club-1?tab=profile", "club-1")).toBe(
      "/club/club-1?tab=profile"
    );
    expect(getQuickAccessCallbackUrl("/club/club-1/admin", "club-1")).toBe(
      "/club/club-1"
    );
    expect(getQuickAccessCallbackUrl("/session/ABC123", "club-1")).toBe(
      "/club/club-1"
    );
    expect(getQuickAccessCallbackUrl("/club/club-2", "club-1")).toBe(
      "/club/club-1"
    );
    expect(getQuickAccessCallbackUrl("/settings", "club-1")).toBe(
      "/club/club-1"
    );
    expect(getQuickAccessCallbackUrl("/club/club-1", null)).toBe("/");
  });

  it("honors only server-readable Quick access tournament callbacks", async () => {
    const readable = async (code: string) => code === "OWN123";

    await expect(
      resolveQuickAccessCallbackUrl(
        "/session/OWN123?tab=standings",
        "club-1",
        readable
      )
    ).resolves.toBe("/session/OWN123?tab=standings");
    await expect(
      resolveQuickAccessCallbackUrl(
        "/session/OWN123/history",
        "club-1",
        readable
      )
    ).resolves.toBe("/session/OWN123/history");
    await expect(
      resolveQuickAccessCallbackUrl("/session/OTHER456", "club-1", readable)
    ).resolves.toBe("/club/club-1");
    await expect(
      resolveQuickAccessCallbackUrl("/club/club-1/admin", "club-1", readable)
    ).resolves.toBe("/club/club-1");
  });
});
