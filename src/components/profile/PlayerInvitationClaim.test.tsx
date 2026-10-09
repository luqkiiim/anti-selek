// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const now = "2026-10-08T10:00:00.000Z";
const correctionContext = {
  status: "MATCHED",
  invitationId: "invite-correction",
  purpose: "CORRECTION",
  expiresAt: "2026-10-15T00:00:00.000Z",
  recipient: { accountId: "account-recipient", accountRef: "A-32A1", displayName: "Alex Lee" },
  authorizedBy: { accountId: "account-admin", displayName: "Club Admin", authorizedAt: now },
  club: { id: "club-1", name: "Test Club" },
  target: {
    playerId: "original-player", name: "Alex Lee", rating: 1280, isActive: true,
    member: { memberId: "original-member", archivedAt: null, retiredByAdmissionEventId: null },
    history: { matchesPlayed: 20, lastPlayedAt: now, blockers: [] },
  },
  source: {
    playerId: "source-player", name: "Alex Lee 2", rating: 1050, isActive: true,
    member: { memberId: "source-member", archivedAt: null, retiredByAdmissionEventId: null },
    history: { matchesPlayed: 0, lastPlayedAt: null, blockers: [] },
  },
  authorizedAccessAction: "PRESERVE_ACTIVE",
  restoreArchivedRoster: false,
  reason: "Administrator verified the account connection.",
  completedReceipt: null,
  supersedableRecoveryRequest: null,
};

function receipt(purpose: "CORRECTION" | "ACCESS_RESTORE") {
  return {
    requestId: "invitation-issuance-1",
    purpose,
    actorAccountId: "account-recipient",
    authorizedByAccountId: "account-admin",
    authorizedAt: now,
    confirmedAt: now,
    clubId: "club-1",
    targetPlayerId: "original-player",
    sourcePlayerId: purpose === "CORRECTION" ? "source-player" : null,
    accessOutcome: purpose === "CORRECTION" ? "PRESERVED_ACTIVE" : "RESTORED_MEMBER",
    accessBefore: { accessId: "access-old", status: purpose === "CORRECTION" ? "ACTIVE" : "REVOKED", role: purpose === "CORRECTION" ? "MEMBER" : "ADMIN", revision: 4 },
    accessAfter: { accessId: "access-new", status: "ACTIVE", role: purpose === "CORRECTION" ? "MEMBER" : "MEMBER", revision: 5 },
    rosterOutcome: purpose === "CORRECTION" ? "UNCHANGED" : "UNARCHIVED_EXISTING",
    sourceRetired: purpose === "CORRECTION",
    destination: "/club/club-1",
    supersededRecoveryRequest: null,
  };
}

describe("PlayerInvitationClaim purpose handling", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; fetch: typeof fetch }).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = mocks.fetch as typeof fetch;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useSession.mockReturnValue({ data: { user: { id: "account-recipient", name: "Alex Lee" } }, status: "authenticated" });
    mocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  async function settle() {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  }

  async function render() {
    await act(async () => root.render(<PlayerInvitationClaim invitationId="invite-1" />));
    await settle();
  }

  function click(element: Element | null) {
    if (!element) throw new Error("Expected control was not rendered");
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("keeps wrong-account context generic and makes no recovery-status request", async () => {
    mocks.fetch.mockImplementation((input: string | Request | URL) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse({ status: "WRONG_ACCOUNT", message: "This invitation is for another Account. Switch accounts to continue." }));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("This invitation is for another Account");
    expect(container.textContent).not.toContain("original-player");
    expect(container.textContent).not.toContain("source-player");
    expect(container.textContent).not.toContain("Club Admin");
    expect(container.querySelector("button")?.textContent).toBe("Switch account");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("recovery-request"))).toBe(false);
  });

  it("confirms only the bound correction and renders the authorizer and recipient receipt", async () => {
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/confirm-correction" && init?.method === "POST") return Promise.resolve(jsonResponse({ receipt: receipt("CORRECTION") }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(correctionContext));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Account A-32A1");
    expect(container.textContent).toContain("source-player");
    expect(container.textContent).toContain("Club Admin");
    expect(container.textContent).not.toContain("Request admin review");
    expect(container.textContent).not.toContain("Claim my profile");
    await act(async () => click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Confirm Player correction") ?? null));
    await settle();

    const post = mocks.fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/player-invites/invite-1/confirm-correction");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ confirm: true });
    expect(container.textContent).toContain("Profile correction completed");
    expect(container.textContent).toContain("Confirmed by Account A-32A1");
    expect(container.textContent).toContain("Authorized by Club Admin");
    expect(container.textContent).toContain("Source Player source-player was retired");
    expect(container.textContent).toContain("Existing active club access was preserved");
  });

  it("allows an eligible inactive source with an archived membership to be retired", async () => {
    const context = {
      ...correctionContext,
      source: {
        ...correctionContext.source,
        isActive: false,
        member: { ...correctionContext.source.member, archivedAt: "2026-10-07T12:00:00.000Z" },
      },
    };
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/confirm-correction" && init?.method === "POST") return Promise.resolve(jsonResponse({ receipt: receipt("CORRECTION") }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(context));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    const confirm = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Confirm Player correction");
    expect(container.textContent).toContain("inactive Player");
    expect(container.textContent).toContain("membership source-member (archived)");
    expect(confirm?.disabled).toBe(false);
    await act(async () => click(confirm ?? null));
    await settle();

    const post = mocks.fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/player-invites/invite-1/confirm-correction");
    expect(container.textContent).toContain("Source Player source-player was retired");
  });

  it("requires explicit consent to supersede the exact obsolete pending request and shows its receipt", async () => {
    const context = {
      ...correctionContext,
      supersedableRecoveryRequest: {
        requestId: "old-recovery-request",
        revision: 7,
        originInvitationId: "old-claim-invitation",
        invitationAvailability: "REPLACED",
      },
    };
    const completedReceipt = {
      ...receipt("CORRECTION"),
      supersededRecoveryRequest: {
        requestId: "old-recovery-request",
        previousRevision: 7,
        cancelledRevision: 8,
        cancellationEventId: "cancel-event-1",
        originInvitationId: "old-claim-invitation",
      },
    };
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/confirm-correction" && init?.method === "POST") return Promise.resolve(jsonResponse({ receipt: completedReceipt }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(context));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("old-recovery-request");
    expect(container.textContent).toContain("revision 7");
    expect(container.textContent).toContain("old-claim-invitation");
    expect(container.textContent).toContain("replaced");
    const confirm = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Confirm Player correction");
    expect(confirm?.disabled).toBe(true);

    const consent = container.querySelector('input[type="checkbox"]');
    if (!consent) throw new Error("Expected supersession consent checkbox");
    await act(async () => click(consent));
    expect(confirm?.disabled).toBe(false);
    await act(async () => click(confirm ?? null));
    await settle();

    const post = mocks.fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/player-invites/invite-1/confirm-correction");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
      confirm: true,
      supersedeRecoveryRequest: { requestId: "old-recovery-request", revision: 7 },
    });
    expect(container.textContent).toContain("Pending recovery request old-recovery-request (revision 7) was canceled at revision 8");
    expect(container.textContent).toContain("Prior invitation old-claim-invitation; cancellation event cancel-event-1");
  });

  it("renders access-restoration replay as completed without offering claim or retirement", async () => {
    const context = {
      ...correctionContext,
      purpose: "ACCESS_RESTORE",
      source: null,
      authorizedAccessAction: "RESTORE_MEMBER",
      restoreArchivedRoster: true,
      completedReceipt: receipt("ACCESS_RESTORE"),
    };
    mocks.fetch.mockImplementation((input: string | Request | URL) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(context));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Access restoration completed");
    expect(container.textContent).toContain("Revoked club access was restored as MEMBER");
    expect(container.textContent).toContain("existing roster membership was unarchived");
    expect(container.textContent).not.toContain("Claim my profile");
    expect(container.textContent).not.toContain("newly claimed");
    expect(container.textContent).not.toContain("Confirm access restoration");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("recovery-request"))).toBe(false);
  });

  it("uses the access-restore confirmation route and cannot retire a source Player", async () => {
    const context = {
      ...correctionContext,
      purpose: "ACCESS_RESTORE",
      source: null,
      authorizedAccessAction: "GRANT_MEMBER",
      restoreArchivedRoster: false,
      completedReceipt: null,
    };
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/confirm-access-restore" && init?.method === "POST") return Promise.resolve(jsonResponse({ receipt: receipt("ACCESS_RESTORE") }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse(context));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Confirm access restoration");
    expect(container.textContent).toContain("Grant club access as MEMBER");
    expect(container.textContent).not.toContain("Source Player to retire");
    await act(async () => click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Confirm access restoration") ?? null));
    await settle();

    const post = mocks.fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/player-invites/invite-1/confirm-access-restore");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ confirm: true });
    expect(container.textContent).toContain("Access restoration completed");
    expect(container.textContent).not.toContain("Source Player");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("recovery-request"))).toBe(false);
  });

  it("retains normal CLAIM redemption and recovery status requests", async () => {
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/recovery-request")) return Promise.resolve(jsonResponse({ request: null, recovery: null }));
      if (url === "/api/player-invites/invite-1/redeem" && init?.method === "POST") return Promise.resolve(jsonResponse({ destination: "/club/club-1" }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse({
        purpose: "CLAIM",
        player: { id: "player-claim", name: "Alex Lee", avatarUrl: null, rating: 1270, matchesPlayed: 12, lastPlayedAt: now },
        club: { id: "club-1", name: "Test Club" },
      }));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Claim my profile");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes("recovery-request"))).toBe(true);
    await act(async () => click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Claim my profile") ?? null));
    const post = mocks.fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/player-invites/invite-1/redeem");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ confirm: true });
    expect(mocks.router.replace).toHaveBeenCalledWith("/club/club-1");
  });

  it("loads and lets the signed-in owner cancel their pending request when the CLAIM link is unavailable", async () => {
    const recovery = {
      request: {
        id: "request-pending", clubId: "club-1", requestedPlayerId: "original-player", originInvitationId: "old-claim",
        status: "PENDING", revision: 4, targetName: "Original Player", clubName: "Test Club",
      },
      recovery: { invitationAvailability: "REPLACED", needsAccessRestore: false, duplicate: null, blockers: [], canApprove: false },
    };
    mocks.fetch.mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/recovery-request" && init?.method === "PATCH") return Promise.resolve(jsonResponse({ ok: true }));
      if (url === "/api/player-invites/invite-1/recovery-request") return Promise.resolve(jsonResponse(recovery));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse({
        purpose: "CLAIM", status: "UNAVAILABLE", invitationAvailability: "REPLACED", message: "This claim invitation is no longer available.",
      }));
      if (url === "/api/clubs/club-1/join-requests/request-pending" && init?.method === "PATCH") return Promise.resolve(jsonResponse({ ok: true }));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(mocks.fetch.mock.calls.some(([input]) => String(input) === "/api/player-invites/invite-1/recovery-request")).toBe(true);
    expect(container.textContent).toContain("Recovery request pending");
    expect(container.textContent).toContain("Original Player · Test Club");
    expect(container.textContent).toContain("The original invitation is replaced");
    await act(async () => click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Cancel recovery request") ?? null));
    await settle();

    const cancel = mocks.fetch.mock.calls.find(([input, init]) => String(input) === "/api/clubs/club-1/join-requests/request-pending" && (init as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse((cancel?.[1] as RequestInit).body as string)).toEqual({ action: "CANCEL", revision: 4 });
  });

  it("shows the signed-in owner's completed recovery status on an unavailable CLAIM link", async () => {
    mocks.fetch.mockImplementation((input: string | Request | URL) => {
      const url = String(input);
      if (url === "/api/player-invites/invite-1/recovery-request") return Promise.resolve(jsonResponse({
        request: {
          id: "request-approved", clubId: "club-1", requestedPlayerId: "original-player", originInvitationId: "old-claim",
          status: "APPROVED", revision: 5, targetName: "Original Player", clubName: "Test Club",
        },
        recovery: { invitationAvailability: "REPLACED", needsAccessRestore: false, duplicate: null, blockers: [], canApprove: false },
        destination: "/club/club-1",
      }));
      if (url === "/api/player-invites/invite-1") return Promise.resolve(jsonResponse({
        purpose: "CLAIM", status: "CONTINUATION_REQUIRED", invitationAvailability: "ACTIVE", message: "Reopen the original invitation to continue.",
      }));
      throw new Error(`Unexpected request ${url}`);
    });
    await render();

    expect(container.textContent).toContain("Recovery request approved");
    expect(container.textContent).toContain("Your original Player profile has been connected");
    expect(container.querySelector('a[href="/club/club-1"]')?.textContent).toBe("Continue to club");
    expect(mocks.fetch.mock.calls.some(([input]) => String(input) === "/api/player-invites/invite-1/recovery-request")).toBe(true);
  });
});
