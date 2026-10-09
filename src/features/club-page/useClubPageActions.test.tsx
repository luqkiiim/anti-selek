// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { useClubPageActions } from "./useClubPageActions";

const player: ClubPageMember = {
  id: "player-1",
  name: "Ari Tan",
  status: "CORE" as ClubPageMember["status"],
  preferredPool: "B" as ClubPageMember["preferredPool"],
  gender: "FEMALE" as ClubPageMember["gender"],
  partnerPreference: "OPEN" as ClubPageMember["partnerPreference"],
  elo: 1100,
  wins: 0,
  losses: 0,
  isClaimed: false,
  role: "MEMBER",
};

describe("legacy placeholder claim password proof", () => {
  let container: HTMLDivElement;
  let root: Root;
  let error = "";
  let success = "";
  const refreshClubData = vi.fn(async () => {});

  function Harness() {
    const [message, setMessage] = useState("");
    const [notice, setNotice] = useState("");
    const actions = useClubPageActions({
      clubId: "club-1",
      canManageClub: false,
      canAdminClub: false,
      router: { push: vi.fn() },
      refreshClubData,
      setError: value => { setMessage(typeof value === "function" ? value(message) : value); error = typeof value === "function" ? value(message) : value; },
      setSuccess: value => { setNotice(typeof value === "function" ? value(notice) : value); success = typeof value === "function" ? value(notice) : value; },
    });
    return <div><button type="button" onClick={() => void actions.requestClaim(player)}>Request claim</button><p role="alert">{message}</p><p>{notice}</p></div>;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    error = "";
    success = "";
    refreshClubData.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderHarness() {
    await act(async () => root.render(<Harness />));
  }

  it("verifies the password in the proof endpoint and retries the unchanged legacy claim request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("prompt", vi.fn(() => "club-secret"));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/clubs/club-1/claim-requests" && calls.filter(call => call.url === url).length === 1) {
        return Response.json({ code: "PASSWORD_REQUIRED", error: "Enter the club password to continue." }, { status: 428 });
      }
      return Response.json({ status: "OK" }, { status: 200 });
    }));
    await renderHarness();

    await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(calls.map(call => call.url)).toEqual([
      "/api/clubs/club-1/claim-requests",
      "/api/clubs/join-proof",
      "/api/clubs/club-1/claim-requests",
    ]);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ targetUserId: "player-1" });
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ clubId: "club-1", password: "club-secret" });
    expect(JSON.parse(calls[2].init?.body as string)).toEqual({ targetUserId: "player-1" });
    expect(calls.every(call => !call.url.includes("club-secret"))).toBe(true);
    expect(refreshClubData).toHaveBeenCalledOnce();
    expect(success).toContain("Claim request sent for Ari Tan");
    expect(error).toBe("");
  });

  it("stops without issuing proof or retrying when the user cancels the password prompt", async () => {
    const calls: string[] = [];
    vi.stubGlobal("prompt", vi.fn(() => null));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json({ code: "PASSWORD_REQUIRED", error: "Enter the club password to continue." }, { status: 428 });
    }));
    await renderHarness();

    await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(calls).toEqual(["/api/clubs/club-1/claim-requests"]);
    expect(error).toContain("Your claim request was not submitted");
    expect(refreshClubData).not.toHaveBeenCalled();
  });

  it("does not retry the legacy claim when password verification fails", async () => {
    const calls: string[] = [];
    vi.stubGlobal("prompt", vi.fn(() => "wrong-password"));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/clubs/club-1/claim-requests") return Response.json({ code: "PASSWORD_REQUIRED", error: "Enter the club password to continue." }, { status: 428 });
      return Response.json({ code: "INVALID_PASSWORD", error: "The club password is incorrect." }, { status: 403 });
    }));
    await renderHarness();

    await act(async () => { container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(calls).toEqual(["/api/clubs/club-1/claim-requests", "/api/clubs/join-proof"]);
    expect(error).toBe("The club password is incorrect.");
    expect(refreshClubData).not.toHaveBeenCalled();
  });
});
