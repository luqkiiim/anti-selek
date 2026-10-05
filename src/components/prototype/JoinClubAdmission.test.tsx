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
    players: [{ id: "player-1", name: "Ari Tan", elo: 1080, matchesPlayed: 12, lastPlayedAt: "2026-09-28T00:00:00.000Z" }],
    ownedPlayers: [],
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
    await act(async () => button(container, "I’m new to this club").click());
    expect(container.textContent).toContain("Use a Player profile you already own");
    await act(async () => button(container, "Ari Tan").click());
    await act(async () => button(container, "Request to use this Player").click());
    expect(submitted).toMatchObject({ kind: "OWNED_PLAYER", requestedPlayerId: "owned-player" });
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
    await act(async () => button(container, "I’m new to this club").click());
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
});
