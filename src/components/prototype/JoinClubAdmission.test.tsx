// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdmissionDiscovery, AdmissionRequest } from "./admissionTypes";
import { JoinClubAdmission } from "./JoinClubAdmission";

vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span className="avatar">{name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, children, busy }: { open?: boolean; title: string; children: ReactNode; busy?: boolean }) => open
    ? <div role="dialog" aria-label={title}><fieldset disabled={busy}>{children}</fieldset></div>
    : null,
}));

function makeRequest(overrides: Partial<AdmissionRequest> = {}): AdmissionRequest {
  return {
    id: "request-1",
    clubId: "club-1",
    kind: "NEW_PLAYER",
    status: "PENDING",
    revision: 0,
    requestedPlayerId: null,
    proposedPlayerName: "Ari",
    proposedGender: "FEMALE",
    note: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    ...overrides,
  };
}

function makeDiscovery(overrides: Partial<AdmissionDiscovery> = {}): AdmissionDiscovery {
  return {
    requiresJoinCode: false,
    club: { id: "club-1", name: "Riverside", avatarUrl: null, isPasswordProtected: false, allowJoinRequests: true },
    players: [{ id: "player-1", name: "Ari Tan", elo: 1080, matchesPlayed: 12, lastPlayedAt: "2026-09-28T00:00:00.000Z" }],
    requests: [],
    membership: null,
    access: null,
    ...overrides,
  };
}

function button(container: HTMLElement, label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent?.includes(label));
  if (!found) throw new Error(`Button not found: ${label}`);
  return found as HTMLButtonElement;
}

describe("JoinClubAdmission", () => {
  let container: HTMLDivElement;
  let root: Root;
  let discovery: AdmissionDiscovery;
  let submitted: Record<string, unknown> | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    discovery = makeDiscovery();
    submitted = null;
    vi.stubGlobal("crypto", { randomUUID: () => "admission-key" });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      if (String(_input).startsWith("/api/clubs/join-entry")) {
        discovery = { ...discovery, requiresJoinCode: false };
        return { ok: true, json: async () => ({ clubId: "club-1", verified: true }) } as Response;
      }
      if (init?.method === "POST") {
        submitted = body;
        return { ok: true, json: async () => makeRequest({
          kind: body?.kind as AdmissionRequest["kind"],
          requestedPlayerId: typeof body?.requestedPlayerId === "string" ? body.requestedPlayerId : null,
        }) } as Response;
      }
      return { ok: true, json: async () => discovery } as Response;
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function openSheet() {
    await act(async () => root.render(<JoinClubAdmission open initialValue="club-1" accountName="Ari" accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />));
  }

  it("submits a played-before claim against the selected Player ID", async () => {
    await openSheet();
    expect(container.textContent).toContain("Have you played with this club before?");
    await act(async () => button(container, "Yes, find my profile").click());
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to connect this Player").click());
    expect(submitted).toMatchObject({ clubId: "club-1", kind: "EXISTING_PLAYER", requestedPlayerId: "player-1" });
    expect(container.textContent).toContain("Waiting for admin approval");
  });

  it("asks an admin to create a new Player only after approval", async () => {
    await openSheet();
    await act(async () => button(container, "I’m new to this club").click());
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ kind: "NEW_PLAYER", proposedPlayerName: "Ari", proposedGender: "FEMALE" });
    expect(submitted).not.toHaveProperty("requestedPlayerId");
    expect(container.textContent).toContain("Waiting for admin approval");
  });


  it("shows existing pending, rejected, and approved admission status", async () => {
    discovery = makeDiscovery({ requests: [makeRequest({ status: "PENDING" })] });
    await openSheet();
    expect(container.textContent).toContain("Waiting for admin approval");

    await act(async () => root.unmount());
    root = createRoot(container);
    discovery = makeDiscovery({ requests: [makeRequest({ status: "REJECTED" })] });
    await openSheet();
    expect(container.textContent).toContain("Your last request was declined.");

    await act(async () => root.unmount());
    root = createRoot(container);
    discovery = makeDiscovery({ access: { role: "MEMBER", status: "ACTIVE" }, membership: { playerId: "player-1" } });
    await openSheet();
    expect(container.textContent).toContain("You’re already a member.");
  });

  it("still lets an account with club access request a Player profile", async () => {
    discovery = makeDiscovery({ access: { role: "MEMBER", status: "ACTIVE" }, membership: null });
    await openSheet();
    expect(container.textContent).toContain("Your account already has club access.");
    expect(container.textContent).toContain("Have you played with this club before?");
  });

  function input(label: string) {
    const found = Array.from(container.querySelectorAll("label")).find(item => item.textContent?.includes(label))?.querySelector("input");
    if (!found) throw new Error(`Input not found: ${label}`);
    return found;
  }

  async function type(label: string, value: string) {
    await act(async () => {
      const field = input(label);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("requires the club join code before the played-before question, including ordinary invite links", async () => {
    discovery = makeDiscovery({ requiresJoinCode: true, players: [], club: { ...makeDiscovery().club, isPasswordProtected: true } });
    await act(async () => root.render(<JoinClubAdmission open initialValue="https://example.test/?join=club-1" accountName="Ari" accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />));
    expect(container.textContent).toContain("Enter the club join code");
    expect(container.textContent).not.toContain("Have you played with this club before?");
    expect(button(container, "Continue").disabled).toBe(true);
    await type("Club join code", "private-code");
    await act(async () => button(container, "Continue").click());
    expect(fetch).toHaveBeenCalledWith("/api/clubs/join-entry", expect.objectContaining({ method: "POST", body: JSON.stringify({ clubId: "club-1", password: "private-code" }) }));
    expect(container.textContent).toContain("Have you played with this club before?");
    expect(container.innerHTML).not.toContain("private-code");
  });

  it("shows wrong-code errors, clears the raw code and keeps the entry prompt", async () => {
    discovery = makeDiscovery({ requiresJoinCode: true, players: [] });
    await openSheet();
    await type("Club join code", "wrong-code");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Incorrect club join code", code: "INVALID_JOIN_CODE" }) } as Response);
    await act(async () => button(container, "Continue").click());
    expect(container.textContent).toContain("Incorrect club join code");
    expect(input("Club join code").value).toBe("");
    expect(container.textContent).not.toContain("Have you played with this club before?");
  });

  it("returns to the code prompt when a verified entry expires during submission", async () => {
    await openSheet();
    await act(async () => button(container, "I’m new to this club").click());
    discovery = makeDiscovery({ requiresJoinCode: true, players: [] });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Enter the current club join code", code: "JOIN_CODE_REQUIRED" }) } as Response);
    await act(async () => button(container, "Send request").click());
    expect(container.textContent).toContain("Enter the club join code");
    expect(container.textContent).not.toContain("Have you played with this club before?");
  });

  it("prioritizes pending, closed, member and approved states above a join code", async () => {
    for (const scenario of [
      { requests: [makeRequest()], expected: "Waiting for admin approval" },
      { club: { ...makeDiscovery().club, allowJoinRequests: false }, expected: "Requests are closed" },
      { access: { role: "MEMBER", status: "ACTIVE" }, membership: { playerId: "p1" }, expected: "Open club" },
      { requests: [makeRequest({ status: "APPROVED" })], expected: "Open club" },
    ]) {
      await act(async () => root.unmount());
      root = createRoot(container);
      discovery = makeDiscovery({ requiresJoinCode: true, players: [], ...scenario });
      await openSheet();
      expect(container.textContent).toContain(scenario.expected);
      expect(container.textContent).not.toContain("Enter the club join code");
      expect(container.textContent).not.toContain("Have you played with this club before?");
    }
  });

  it("refreshes pending status and allows cancellation", async () => {
    discovery = makeDiscovery({ requests: [makeRequest()] });
    await openSheet();
    expect(container.textContent).not.toContain("Have you played with this club before?");
    discovery = makeDiscovery({ requests: [makeRequest({ status: "APPROVED" })] });
    await act(async () => button(container, "Refresh status").click());
    expect(container.textContent).toContain("Open club");
    await act(async () => root.unmount());
    root = createRoot(container);
    discovery = makeDiscovery({ requests: [makeRequest()] });
    await openSheet();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => makeRequest({ status: "CANCELLED" }) } as Response);
    await act(async () => button(container, "Cancel request").click());
    expect(container.textContent).toContain("Have you played with this club before?");
  });

  it("advises about matching unclaimed profiles without blocking a new-player request", async () => {
    await openSheet();
    await act(async () => button(container, "I’m new to this club").click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 330)); });
    expect(container.textContent).toContain("Could one of these profiles be yours?");
    expect(container.textContent).toContain("1080 rating · 12 matches");
    expect(container.textContent).toContain("last played");
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ kind: "NEW_PLAYER" });
  });

  it("debounces partial club-name searches, aborts obsolete queries, and ignores stale responses", async () => {
    vi.useFakeTimers();
    try {
      let resolveOld: (response: Response) => void = () => {};
      let oldSignal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (new URL(String(url), "https://example.test").searchParams.get("q") === "Ri") {
          oldSignal = init?.signal as AbortSignal;
          return new Promise<Response>(resolve => { resolveOld = resolve; });
        }
        return { ok: true, json: async () => ({ clubs: [{ id: "new", name: "New Riverside", avatarUrl: null, isPasswordProtected: true }] }) } as Response;
      });
      await act(async () => root.render(<JoinClubAdmission open initialValue="" accountName="Ari" accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />));
      await type("Search clubs by name", "R");
      await act(async () => vi.advanceTimersByTimeAsync(400));
      expect(fetch).not.toHaveBeenCalled();
      await type("Search clubs by name", "Ri");
      await act(async () => vi.advanceTimersByTimeAsync(299));
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTimeAsync(1));
      await type("Search clubs by name", "River");
      expect(oldSignal?.aborted).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(container.textContent).toContain("New Riverside");
      await act(async () => resolveOld({ ok: true, json: async () => ({ clubs: [{ id: "old", name: "Old result", avatarUrl: null, isPasswordProtected: false }] }) } as Response));
      expect(container.textContent).not.toContain("Old result");
      expect(container.textContent).toContain("Club join code required");
    } finally { vi.useRealTimers(); }
  });

  it("requires admin help for an inactive or revoked club identity instead of requesting another profile", async () => {
    discovery = makeDiscovery({ identityReviewRequired: true, requests: [makeRequest({ status: "APPROVED" })], access: { role: "MEMBER", status: "REVOKED" } });
    await openSheet();
    expect(container.textContent).toContain("Ask an admin to restore your Player profile");
    expect(container.textContent).not.toContain("Open club");
    expect(container.textContent).not.toContain("Have you played with this club before?");
  });

  it("invalidates the selected existing profile as the search query changes", async () => {
    await openSheet(); await act(async () => button(container, "Yes, find my profile").click());
    await act(async () => button(container, "Ari Tan").click());
    expect(button(container, "Request to connect this Player").disabled).toBe(false);
    await type("Search by name", "Different");
    expect(button(container, "Request to connect this Player").disabled).toBe(true);
  });

  it("checks the currently entered name with a safe query limit and preserves the form on advisory failures", async () => {
    vi.useFakeTimers();
    try {
      await openSheet(); await act(async () => button(container, "I’m new to this club").click());
      const name = "B".repeat(100);
      await type("Player name", name);
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Matching profiles unavailable" }) } as Response);
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(fetch).toHaveBeenLastCalledWith(`/api/clubs/join-requests?clubId=club-1&q=${"B".repeat(64)}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(input("Player name").value).toBe(name);
      expect(container.textContent).toContain("Matching profiles unavailable");
      expect(button(container, "Send request").disabled).toBe(false);
      await act(async () => button(container, "Send request").click());
      expect(submitted).toMatchObject({ kind: "NEW_PLAYER", proposedPlayerName: name });
    } finally { vi.useRealTimers(); }
  });

  it("ignores stale duplicate matches after the entered player name changes", async () => {
    vi.useFakeTimers();
    try {
      await openSheet(); await act(async () => button(container, "I’m new to this club").click());
      let resolveOld: (response: Response) => void = () => {};
      let oldSignal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation(async (url, init) => {
        if (new URL(String(url), "https://example.test").searchParams.get("q") === "Old") {
          oldSignal = init?.signal as AbortSignal;
          return new Promise<Response>(resolve => { resolveOld = resolve; });
        }
        return { ok: true, json: async () => makeDiscovery({ players: [{ id: "new", name: "New Person" }] }) } as Response;
      });
      await type("Player name", "Old"); await act(async () => vi.advanceTimersByTimeAsync(300));
      await type("Player name", "New"); expect(oldSignal?.aborted).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(container.textContent).toContain("New Person");
      await act(async () => resolveOld({ ok: true, json: async () => makeDiscovery({ players: [{ id: "old", name: "Old Person" }] }) } as Response));
      expect(container.textContent).not.toContain("Old Person");
      expect(input("Player name").value).toBe("New");
    } finally { vi.useRealTimers(); }
  });

});
