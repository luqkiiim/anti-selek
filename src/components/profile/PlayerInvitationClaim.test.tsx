// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedInvitationContext } from "@/types/playerRecovery";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: mocks.useSession, signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: () => null }));

import { PlayerInvitationClaim } from "./PlayerInvitationClaim";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

const claimContext = {
  purpose: "CLAIM" as const,
  player: { id: "local-player", name: "Alex's club profile", avatarUrl: null, rating: 1270, matchesPlayed: 12, lastPlayedAt: "2026-10-08T10:00:00.000Z" },
  club: { id: "club-1", name: "North Club" },
};

function legacyContext(purpose: "CORRECTION" | "ACCESS_RESTORE", completed = false) {
  return {
    status: "MATCHED",
    invitationId: "old-invite",
    purpose,
    completedReceipt: completed ? {
      requestId: "old-issuance",
      purpose,
      actorAccountId: "account-1",
      authorizedByAccountId: "admin-1",
      authorizedAt: "2026-10-07T00:00:00.000Z",
      confirmedAt: "2026-10-08T00:00:00.000Z",
      clubId: "club-1",
      targetPlayerId: "local-player",
      sourcePlayerId: null,
      sourceRetired: false,
      accessOutcome: "PRESERVED_ACTIVE",
      accessBefore: { accessId: "access-1", status: "ACTIVE", role: "MEMBER", revision: 1 },
      accessAfter: { accessId: "access-1", status: "ACTIVE", role: "MEMBER", revision: 1 },
      rosterOutcome: "UNCHANGED",
      supersededRecoveryRequest: null,
      destination: "/club/club-1",
    } : null,
  } as unknown as AuthorizedInvitationContext;
}

describe("PlayerInvitationClaim", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; fetch: typeof fetch }).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = mocks.fetch as typeof fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useSession.mockReturnValue({ data: { user: {
      id: "account-1",
      name: "Alex Lee",
      clubProfiles: [{ playerId: "profile-in-another-club", profileClubId: "club-2" }],
    } }, status: "authenticated" });
    mocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  async function render() {
    await act(async () => root.render(<PlayerInvitationClaim invitationId="invite-1" />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  function click(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
    if (!button) throw new Error(`Button not found: ${label}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("claims a local profile normally even when the account has a profile in another club", async () => {
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/redeem" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ destination: "/club/club-1" }));
      }
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(claimContext));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Alex's club profile");
    expect(container.textContent).toContain("copies your account name and photo");
    expect(container.textContent).toContain("including clearing its photo if your account has none");
    expect(container.textContent).toContain("history and rating stay with the profile");
    expect(container.textContent).not.toContain("profile-in-another-club");
    expect(container.textContent).not.toContain("Request admin review");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("recovery-request"))).toBe(false);

    await act(async () => click("Claim my profile"));
    const redeem = mocks.fetch.mock.calls.find(([input, init]) => String(input) === "/api/player-invites/invite-1/redeem" && (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse((redeem?.[1] as RequestInit).body as string)).toEqual({ confirm: true });
    expect(mocks.router.replace).toHaveBeenCalledWith("/club/club-1");
  });

  it.each(["CORRECTION", "ACCESS_RESTORE"] as const)(
    "directs a pending legacy %s invitation to the normal club admin flow",
    async (purpose) => {
      mocks.fetch.mockResolvedValue(jsonResponse(legacyContext(purpose)));
      await render();

      expect(container.textContent).toContain("This older invitation is no longer active");
      expect(container.textContent).toContain("remove the profile from this club, then invite the correct profile");
      expect(container.textContent).not.toContain("Confirm Player correction");
      expect(container.textContent).not.toContain("Confirm access restoration");
      expect(container.textContent).not.toContain("Request admin review");
      expect(container.querySelectorAll("button")).toHaveLength(0);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(String(mocks.fetch.mock.calls[0][0])).toBe("/api/player-invites/invite-1");
    }
  );

  it("keeps completed legacy receipts readable and read-only", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(legacyContext("CORRECTION", true)));
    await render();

    expect(container.textContent).toContain("Historical invitation completed");
    expect(container.textContent).toContain("local-player");
    expect(container.querySelector('a[href="/club/club-1"]')?.textContent).toBe("Continue to club");
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
