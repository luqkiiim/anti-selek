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
  Sheet: ({ open, title, children, footer, busy }: { open?: boolean; title: string; children: ReactNode; footer?: ReactNode; busy?: boolean }) => open
    ? <div role="dialog" aria-label={title}><fieldset disabled={busy} className="sheet-content">{children}</fieldset>{footer && <fieldset disabled={busy} className="sheet-footer">{footer}</fieldset>}</div>
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
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ clubId: "club-1", kind: "EXISTING_PLAYER", requestedPlayerId: "player-1" });
    expect(container.textContent).toContain("Waiting for admin approval");
  });

  it("asks an admin to create a new Player only after approval", async () => {
    await openSheet();
    await act(async () => button(container, "I’m new to this club").click());
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ kind: "NEW_PLAYER" });
    expect(submitted).not.toHaveProperty("proposedPlayerName");
    expect(submitted).not.toHaveProperty("proposedGender");
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
    expect(button(container, "Send request").disabled).toBe(false);
    await type("Search by name", "Different");
    expect(container.querySelector(".sheet-footer")).toBeNull();
  });

  it("checks the currently entered name with a safe query limit and preserves the form on advisory failures", async () => {
    vi.useFakeTimers();
    try {
      await openSheet(); await act(async () => button(container, "I’m new to this club").click());
      const name = "B".repeat(100);
      await act(async () => root.render(<JoinClubAdmission open initialValue="club-1" accountName={name} accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />));
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Matching profiles unavailable" }) } as Response);
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(fetch).toHaveBeenLastCalledWith(`/api/clubs/join-requests?clubId=club-1&q=${"B".repeat(64)}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(container.querySelector(".admission-account-summary")?.textContent).toContain(name);
      expect(container.textContent).toContain("Matching profiles unavailable");
      expect(button(container, "Send request").disabled).toBe(false);
      await act(async () => button(container, "Send request").click());
      expect(submitted).toMatchObject({ kind: "NEW_PLAYER" });
      expect(submitted).not.toHaveProperty("proposedPlayerName");
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
      await act(async () => root.render(<JoinClubAdmission open initialValue="club-1" accountName="Old" accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />)); await act(async () => vi.advanceTimersByTimeAsync(300));
      await act(async () => root.render(<JoinClubAdmission open initialValue="club-1" accountName="New" accountGender="FEMALE" onClose={() => {}} onOpenClub={() => {}} />)); expect(oldSignal?.aborted).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(container.textContent).toContain("New Person");
      await act(async () => resolveOld({ ok: true, json: async () => makeDiscovery({ players: [{ id: "old", name: "Old Person" }] }) } as Response));
      expect(container.textContent).not.toContain("Old Person");
      expect(container.querySelector(".admission-account-summary")?.textContent).toContain("New");
    } finally { vi.useRealTimers(); }
  });

  it("shows the selected profile and Send request in the footer immediately", async () => {
    await openSheet(); await act(async () => button(container, "Yes, find my profile").click());
    expect(container.querySelector(".sheet-footer")).toBeNull();
    await act(async () => button(container, "Ari Tan").click());
    expect(container.querySelector(".sheet-footer")?.textContent).toContain("Ari Tan");
    expect(container.querySelector(".sheet-content .primary")).toBeNull();
    await act(async () => button(container, "Back").click());
    expect(container.querySelector(".sheet-footer")).toBeNull();
  });

  it("confirms account details without editable name or gender and keeps notes optional", async () => {
    await openSheet(); await act(async () => button(container, "I’m new to this club").click());
    expect(container.querySelector(".admission-account-summary")?.textContent).toContain("AriFemale");
    expect(container.querySelector("select")).toBeNull();
    expect(Array.from(container.querySelectorAll("label")).some(label => label.textContent?.startsWith("Player name"))).toBe(false);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.querySelector("summary")?.textContent).toBe("Add note (optional)");
  });

  it("distinguishes loading account details from an incomplete legacy profile and preserves the new mode on return", async () => {
    const complete = vi.fn();
    const render = (open: boolean, ready: boolean, gender: string) => root.render(<JoinClubAdmission open={open} initialValue="club-1" accountName="Ari" accountGender={gender} accountReady={ready} onCompleteAccountDetails={complete} onClose={() => {}} onOpenClub={() => {}} />);
    await act(async () => render(true, false, ""));
    await act(async () => button(container, "I’m new to this club").click());
    expect(container.textContent).toContain("Loading your account details");
    expect(container.textContent).not.toContain("Complete your account details");
    expect(button(container, "Send request").disabled).toBe(true);
    await act(async () => render(true, true, "UNSPECIFIED"));
    await act(async () => button(container, "Complete account details").click()); expect(complete).toHaveBeenCalledOnce();
    const calls = vi.mocked(fetch).mock.calls.length;
    await act(async () => render(false, true, "UNSPECIFIED"));
    await act(async () => render(true, true, "FEMALE"));
    expect(container.textContent).toContain("Request a new Player profile");
    expect(button(container, "Send request").disabled).toBe(false);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it("puts submission errors beside the CTA and retries the same logical request with one key", async () => {
    const uuid = vi.fn().mockReturnValueOnce("first-key").mockReturnValueOnce("second-key"); vi.stubGlobal("crypto", { randomUUID: uuid });
    await openSheet(); await act(async () => button(container, "Yes, find my profile").click()); await act(async () => button(container, "Ari Tan").click());
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Please retry" }) } as Response);
    await act(async () => button(container, "Send request").click());
    expect(container.querySelector(".sheet-footer [role=alert]")?.textContent).toBe("Please retry");
    expect(container.querySelector(".sheet-content [role=alert]")).toBeNull();
    await act(async () => button(container, "Send request").click());
    expect(submitted?.idempotencyKey).toBe("first-key"); expect(uuid).toHaveBeenCalledOnce();
    expect(container.querySelector(".sheet-footer")).toBeNull();
  });

  it("handles the server account-incomplete error through account completion", async () => {
    await openSheet(); await act(async () => button(container, "I’m new to this club").click());
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "Complete account details", code: "ACCOUNT_PROFILE_INCOMPLETE" }) } as Response);
    await act(async () => button(container, "Send request").click());
    expect(container.textContent).toContain("Complete your account details"); expect(button(container, "Complete account details")).toBeDefined();
  });

  it("completes legacy account details without losing the selected existing profile", async () => {
    const complete = vi.fn();
    const render = (open: boolean, gender: string) => root.render(<JoinClubAdmission open={open} initialValue="club-1" accountName="Ari" accountGender={gender} accountReady onCompleteAccountDetails={complete} onClose={() => {}} onOpenClub={() => {}} />);
    await act(async () => render(true, "UNSPECIFIED"));
    await act(async () => button(container, "Yes, find my profile").click()); await act(async () => button(container, "Ari Tan").click());
    expect(container.querySelector(".sheet-footer")?.textContent).toContain("Ari Tan");
    expect(Array.from(container.querySelectorAll("button")).some(item => item.textContent === "Send request")).toBe(false);
    await act(async () => button(container, "Complete account details").click()); expect(complete).toHaveBeenCalledOnce();
    await act(async () => render(false, "UNSPECIFIED")); await act(async () => render(true, "FEMALE"));
    expect(container.querySelector(".sheet-footer")?.textContent).toContain("Ari Tan");
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ kind: "EXISTING_PLAYER", requestedPlayerId: "player-1" });
  });

  it("keeps the retry key after saved account details change because the POST body stays the same", async () => {
    const uuid = vi.fn(() => "stable-key"); vi.stubGlobal("crypto", { randomUUID: uuid });
    await openSheet(); await act(async () => button(container, "I’m new to this club").click());
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Retry this request" }) } as Response);
    await act(async () => button(container, "Send request").click());
    await act(async () => root.render(<JoinClubAdmission open initialValue="club-1" accountName="Updated Ari" accountGender="MALE" accountReady onClose={() => {}} onOpenClub={() => {}} />));
    await act(async () => button(container, "Send request").click());
    expect(submitted?.idempotencyKey).toBe("stable-key"); expect(uuid).toHaveBeenCalledOnce();
    expect(submitted).not.toHaveProperty("proposedPlayerName"); expect(submitted).not.toHaveProperty("proposedGender");
  });

  it("starts a new logical retry when the optional note changes", async () => {
    const uuid = vi.fn().mockReturnValueOnce("first-key").mockReturnValueOnce("edited-key"); vi.stubGlobal("crypto", { randomUUID: uuid });
    await openSheet(); await act(async () => button(container, "Yes, find my profile").click()); await act(async () => button(container, "Ari Tan").click());
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "Retry this request" }) } as Response);
    await act(async () => button(container, "Send request").click());
    await act(async () => { const textarea = container.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Updated note"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ idempotencyKey: "edited-key", note: "Updated note" }); expect(uuid).toHaveBeenCalledTimes(2);
  });

});
