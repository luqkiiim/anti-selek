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
    club: { id: "club-1", name: "Riverside", allowJoinRequests: true },
    passwordProof: { status: "NOT_REQUIRED", expiresAt: null },
    players: [{ id: "player-1", name: "Ari Tan", elo: 1080, matchesPlayed: 12, lastPlayedAt: "2026-09-28T00:00:00.000Z" }],
    ownedPlayers: [],
    identityReviewRequired: false,
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

function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("JoinClubAdmission", () => {
  let container: HTMLDivElement;
  let root: Root;
  let discovery: AdmissionDiscovery;
  let submitted: Record<string, unknown> | null;
  let passwordProtected: boolean;
  let proofIssued: boolean;
  let expireProofOnSubmit: boolean;
  let holdPasswordRelock: boolean;
  let passwordRelockStarted: boolean;
  let releasePasswordRelock: (() => void) | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    discovery = makeDiscovery();
    submitted = null;
    passwordProtected = false;
    proofIssued = false;
    expireProofOnSubmit = false;
    holdPasswordRelock = false;
    passwordRelockStarted = false;
    releasePasswordRelock = null;
    vi.stubGlobal("crypto", { randomUUID: () => "admission-key" });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(_input), window.location.origin);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      if (url.pathname === "/api/clubs/join-proof") {
        proofIssued = true;
        return { ok: true, json: async () => ({ ok: true, clubId: "club-1", expiresAt: "2026-10-08T12:10:00.000Z" }) } as Response;
      }
      if (url.pathname === "/api/clubs/join-requests" && init?.method === "POST" && expireProofOnSubmit) {
        proofIssued = false;
        discovery = { ...discovery, passwordProof: { status: "PASSWORD_REQUIRED", expiresAt: null }, players: [], ownedPlayers: [] };
        return { ok: false, status: 428, json: async () => ({ code: "PASSWORD_REQUIRED", error: "Enter the club password to continue." }) } as Response;
      }
      if (url.pathname === "/api/clubs/join-requests" && init?.method !== "POST" && holdPasswordRelock && !proofIssued) {
        passwordRelockStarted = true;
        await new Promise<void>(resolve => { releasePasswordRelock = resolve; });
      }
      if (init?.method === "POST") {
        submitted = body;
        return { ok: true, json: async () => makeRequest({
          kind: body?.kind as AdmissionRequest["kind"],
          requestedPlayerId: typeof body?.requestedPlayerId === "string" ? body.requestedPlayerId : null,
        }) } as Response;
      }
      const result = passwordProtected
        ? { ...discovery, passwordProof: { status: proofIssued ? "VERIFIED" as const : "PASSWORD_REQUIRED" as const, expiresAt: proofIssued ? "2026-10-08T12:10:00.000Z" : null }, players: proofIssued ? discovery.players : [], ownedPlayers: proofIssued ? discovery.ownedPlayers : [] }
        : discovery;
      return { ok: true, json: async () => result } as Response;
    }));
  });

  afterEach(async () => {
    releasePasswordRelock?.();
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
    expect(container.textContent).toContain("Request sent");
  });

  it("asks an admin to create a new Player only after approval", async () => {
    await openSheet();
    await act(async () => button(container, "I’m new to this club").click());
    await act(async () => button(container, "Send request").click());
    expect(submitted).toMatchObject({ kind: "NEW_PLAYER", proposedPlayerName: "Ari", proposedGender: "FEMALE" });
    expect(submitted).not.toHaveProperty("requestedPlayerId");
    expect(container.textContent).toContain("Request sent");
  });

  it("requires an account with existing Player profiles to choose one instead of requesting a duplicate", async () => {
    discovery = makeDiscovery({ ownedPlayers: [{ id: "owned-player", name: "Ari Tan" }] });
    await openSheet();
    await act(async () => button(container, "Use a Player you own").click());
    expect(container.textContent).toContain("Use a Player profile you already own");
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to use this Player").click());
    expect(submitted).toMatchObject({ kind: "OWNED_PLAYER", requestedPlayerId: "owned-player" });
    expect(submitted).not.toHaveProperty("proposedPlayerName");
  });

  it("requires admin review instead of offering a new Player when the only owned identity is inactive", async () => {
    discovery = makeDiscovery({ identityReviewRequired: true });
    await openSheet();

    expect(container.textContent).toContain("An inactive Player identity on this account still needs admin review.");
    const newPlayerChoice = button(container, "Admin review is needed before creating another Player");
    expect(newPlayerChoice.disabled).toBe(true);
    expect(container.textContent).not.toContain("Request a new Player profile");
    expect(submitted).toBeNull();
  });

  it("keeps active owned profiles selectable when an additional inactive identity needs review", async () => {
    discovery = makeDiscovery({
      identityReviewRequired: true,
      ownedPlayers: [{ id: "active-owned-player", name: "Ari Tan" }],
    });
    await openSheet();

    await act(async () => button(container, "Use a Player you own").click());
    expect(container.textContent).toContain("An inactive Player identity also needs admin review.");
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to use this Player").click());
    expect(submitted).toMatchObject({ kind: "OWNED_PLAYER", requestedPlayerId: "active-owned-player" });
    expect(submitted).not.toHaveProperty("proposedPlayerName");
  });

  it("shows existing pending, rejected, and approved admission status", async () => {
    discovery = makeDiscovery({ requests: [makeRequest({ status: "PENDING" })] });
    await openSheet();
    expect(container.textContent).toContain("Request sent");

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

  it("lets an account with revoked access request to connect its owned Player", async () => {
    discovery = makeDiscovery({
      access: { role: "MEMBER", status: "REVOKED" },
      membership: { playerId: "owned-player" },
      ownedPlayers: [{ id: "owned-player", name: "Ari Tan" }],
    });
    await openSheet();

    expect(container.textContent).not.toContain("You’re already a member.");
    await act(async () => button(container, "Use a Player you own").click());
    expect(container.textContent).toContain("Use a Player profile you already own");
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to use this Player").click());

    expect(submitted).toMatchObject({
      clubId: "club-1",
      kind: "OWNED_PLAYER",
      requestedPlayerId: "owned-player",
    });
    expect(container.textContent).toContain("Request sent");
  });

  it("keeps protected roster details hidden until the password is verified", async () => {
    passwordProtected = true;
    discovery = makeDiscovery({ passwordProof: { status: "PASSWORD_REQUIRED", expiresAt: null } });
    await openSheet();

    expect(container.textContent).toContain("Verify the club password to browse Player profiles.");
    expect(container.textContent).not.toContain("Ari Tan");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("sends the password in the proof request, then loads candidates without URL credentials", async () => {
    passwordProtected = true;
    discovery = makeDiscovery({ passwordProof: { status: "PASSWORD_REQUIRED", expiresAt: null } });
    await openSheet();

    const password = container.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      changeInput(password, "club-secret");
    });
    await act(async () => button(container, "Continue").click());

    expect(container.textContent).toContain("Have you played with this club before?");
    expect(container.textContent).not.toContain("Ari Tan");
    await act(async () => button(container, "Yes, find my profile").click());
    expect(container.textContent).toContain("Ari Tan");
    const calls = vi.mocked(fetch).mock.calls;
    const proofCall = calls.find(([input]) => new URL(String(input), window.location.origin).pathname === "/api/clubs/join-proof");
    expect(proofCall?.[1]?.body).toBe(JSON.stringify({ clubId: "club-1", password: "club-secret" }));
    expect(calls.every(([input]) => !String(input).includes("club-secret"))).toBe(true);
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to connect this Player").click());
    expect(submitted).toMatchObject({ kind: "EXISTING_PLAYER", requestedPlayerId: "player-1" });
    expect(submitted).not.toHaveProperty("password");
    expect(submitted).not.toHaveProperty("proof");
  });

  it("re-locks candidate details and asks for the password again after proof expiry", async () => {
    passwordProtected = true;
    proofIssued = true;
    expireProofOnSubmit = true;
    holdPasswordRelock = true;
    discovery = makeDiscovery({
      passwordProof: { status: "VERIFIED", expiresAt: "2026-10-08T12:10:00.000Z" },
      ownedPlayers: [{ id: "owned-player", name: "Owned Alex" }],
    });
    await openSheet();
    await act(async () => button(container, "Yes, find my profile").click());
    expect(container.textContent).toContain("Owned Alex");
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => {
      button(container, "Request to connect this Player").click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(passwordRelockStarted).toBe(true);
    expect(container.textContent).not.toContain("Ari Tan");
    expect(container.textContent).not.toContain("Owned Alex");
    expect(container.textContent).toContain("Verify the club password to browse Player profiles.");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    releasePasswordRelock?.();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("The password check expired.");
  });

  it("keeps an account's own pending request status visible when its password proof expires", async () => {
    passwordProtected = true;
    discovery = makeDiscovery({
      passwordProof: { status: "PASSWORD_REQUIRED", expiresAt: null },
      players: [],
      requests: [{ id: "request-1", clubId: "club-1", kind: "NEW_PLAYER", status: "PENDING", revision: 2, createdAt: "2026-10-04T00:00:00.000Z" }],
    });
    await openSheet();

    expect(container.textContent).toContain("Request sent");
    expect(container.textContent).not.toContain("Ari Tan");
    expect(container.textContent).not.toContain("Verify the club password");
  });
});
