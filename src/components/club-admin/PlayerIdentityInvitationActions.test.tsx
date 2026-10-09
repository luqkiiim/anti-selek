// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityOptionsResponse } from "@/types/playerRecovery";

import { PlayerIdentityInvitationActions } from "./PlayerIdentityInvitationActions";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function identityOptions(purpose: "CORRECTION" | "ACCESS_RESTORE", overrides?: Partial<IdentityOptionsResponse>): IdentityOptionsResponse {
  return {
    purpose,
    target: {
      playerId: "original-player",
      name: "Original Player",
      rating: 1210,
      isActive: true,
      ownerAccount: null,
      member: { memberId: "original-member", archivedAt: null, retiredByAdmissionEventId: null },
      clubAccess: null,
      history: { matchesPlayed: 18, lastPlayedAt: "2026-06-08T00:00:00.000Z", blockers: [] },
      activeInvitation: null,
      accessRestoreBlockers: [],
    },
    correctionCandidates: [],
    ...overrides,
  };
}

describe("PlayerIdentityInvitationActions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function settle() {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }

  function click(element: Element | null) {
    if (!element) throw new Error("Expected control was not rendered");
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function changeText(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("requires explicit retirement, binds it to the exact archived source, and does not auto-exclude that source", async () => {
    const options = identityOptions("CORRECTION", {
      target: {
        ...identityOptions("CORRECTION").target,
        activeInvitation: { id: "expired-target-invite", purpose: "CLAIM", status: "ACTIVE", expiresAt: "2000-01-01T00:00:00.000Z" },
      },
      correctionCandidates: [{
        account: { accountId: "account-recipient", accountRef: "A-91F2", displayName: "Alex Lee", maskedEmail: "a•••@example.test", isActive: true },
        source: {
          playerId: "source-player",
          name: "Alex Lee 2",
          rating: 1090,
          isActive: true,
          memberId: "source-member",
          archivedAt: "2026-05-01T00:00:00.000Z",
          clubAccess: { accessId: "access-1", status: "ACTIVE", role: "MEMBER", revision: 4 },
          history: { matchesPlayed: 0, lastPlayedAt: null, blockers: [] },
        },
        eligible: true,
        blockers: [],
      }],
    });
    fetchMock.mockImplementation(async (input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("identity-options")) return jsonResponse(options);
      if (init?.method === "POST") return jsonResponse({
        purpose: "CORRECTION",
        invitation: { id: "invite-1", purpose: "CORRECTION", status: "ACTIVE", expiresAt: "2026-10-15T00:00:00.000Z" },
        secret: "one-time-secret",
      });
      throw new Error(`Unexpected request ${url}`);
    });

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="original-player" connected={false} />));
    await act(async () => click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Correct existing account connection") ?? null));
    await settle();

    expect(container.textContent).toContain("The previous invitation expired");
    expect(container.textContent).not.toContain("Replacement requires explicit confirmation");
    expect(container.textContent).toContain("archived 5/1/2026");
    const sourceRadio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(sourceRadio.disabled).toBe(false);
    await act(async () => click(sourceRadio));
    const textareas = container.querySelectorAll("textarea");
    await act(async () => changeText(textareas[0], "The linked account belongs to this source profile owner."));
    const consent = container.querySelectorAll('input[type="checkbox"]');
    expect(consent).toHaveLength(2);
    await act(async () => click(consent[0]));
    await act(async () => click(consent[1]));
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Create correction invitation");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await act(async () => click(submit ?? null));
    await settle();

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/clubs/club-1/players/original-player/correction-invitations");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toMatchObject({
      recipientAccountId: "account-recipient",
      sourcePlayerId: "source-player",
      sourceMemberId: "source-member",
      retireSourcePlayerId: "source-player",
      authorizedAccessAction: "PRESERVE_ACTIVE",
      restoreArchivedRoster: false,
      reason: "The linked account belongs to this source profile owner.",
    });
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).not.toHaveProperty("replaceInvitationId");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).not.toHaveProperty("purpose");
  });

  it("requires exact access and existing archived-roster authorization for owned Player restoration", async () => {
    const options = identityOptions("ACCESS_RESTORE", {
      target: {
        ...identityOptions("ACCESS_RESTORE").target,
        ownerAccount: { accountId: "account-owner", accountRef: "A-0B12", displayName: "Morgan Lee", maskedEmail: "m•••@example.test", isActive: true },
        member: { memberId: "existing-member", archivedAt: "2026-05-01T00:00:00.000Z", retiredByAdmissionEventId: null },
        clubAccess: { accessId: "access-revoked", status: "REVOKED", role: "ADMIN", revision: 8 },
        activeInvitation: { id: "expired-restore-target", purpose: "ACCESS_RESTORE", status: "ACTIVE", expiresAt: "2000-01-01T00:00:00.000Z" },
      },
    });
    fetchMock.mockImplementation(async (input: string | Request | URL, init?: RequestInit) => {
      if (String(input).includes("identity-options")) return jsonResponse(options);
      if (init?.method === "POST") return jsonResponse({
        purpose: "ACCESS_RESTORE",
        invitation: { id: "restore-1", purpose: "ACCESS_RESTORE", status: "ACTIVE", expiresAt: "2026-10-15T00:00:00.000Z" },
        secret: "one-time-secret",
      });
      throw new Error(`Unexpected request ${String(input)}`);
    });

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="original-player" connected />));
    await settle();
    expect(container.textContent).toContain("former elevated role will not be reinstated");
    expect(container.textContent).toContain("previous invitation expired");
    await act(async () => changeText(container.querySelector("textarea") as HTMLTextAreaElement, "Restore the existing account access after confirming ownership."));
    const consent = container.querySelectorAll('input[type="checkbox"]');
    expect(consent).toHaveLength(3);
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Create access restoration invitation") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await act(async () => click(consent[0]));
    await act(async () => click(consent[1]));
    await act(async () => click(consent[2]));
    expect(submit.disabled).toBe(false);
    await act(async () => click(submit));
    await settle();

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/clubs/club-1/players/original-player/access-restore-invitations");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toMatchObject({
      recipientAccountId: "account-owner",
      authorizedAccessAction: "RESTORE_MEMBER",
      restoreArchivedRoster: true,
      reason: "Restore the existing account access after confirming ownership.",
    });
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).not.toHaveProperty("replaceInvitationId");
  });

  it("requires explicit MEMBER grant when the exact Account has no club access", async () => {
    const options = identityOptions("ACCESS_RESTORE", {
      target: {
        ...identityOptions("ACCESS_RESTORE").target,
        ownerAccount: { accountId: "account-owner", accountRef: "A-0B12", displayName: "Morgan Lee", maskedEmail: null, isActive: true },
        member: { memberId: "existing-member", archivedAt: null, retiredByAdmissionEventId: null },
        clubAccess: { accessId: null, status: "NONE", role: null, revision: null },
      },
    });
    fetchMock.mockImplementation(async (input: string | Request | URL, init?: RequestInit) => {
      if (String(input).includes("identity-options")) return jsonResponse(options);
      if (init?.method === "POST") return jsonResponse({
        purpose: "ACCESS_RESTORE",
        invitation: { id: "restore-2", purpose: "ACCESS_RESTORE", status: "ACTIVE", expiresAt: "2026-10-15T00:00:00.000Z" },
        secret: "one-time-secret",
      });
      throw new Error(`Unexpected request ${String(input)}`);
    });

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="original-player" connected />));
    await settle();
    expect(container.textContent).toContain("Club access will be granted as MEMBER");
    await act(async () => changeText(container.querySelector("textarea") as HTMLTextAreaElement, "Grant club access to the existing owner."));
    const consent = container.querySelectorAll('input[type="checkbox"]');
    expect(consent).toHaveLength(2);
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Create access restoration invitation") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await act(async () => click(consent[0]));
    await act(async () => click(consent[1]));
    expect(submit.disabled).toBe(false);
    await act(async () => click(submit));
    await settle();

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toMatchObject({
      authorizedAccessAction: "GRANT_MEMBER",
      restoreArchivedRoster: false,
      reason: "Grant club access to the existing owner.",
    });
  });

  it("blocks access restoration for a distinct nonretired owned identity without exposing its details", async () => {
    const options = identityOptions("ACCESS_RESTORE", {
      target: {
        ...identityOptions("ACCESS_RESTORE").target,
        ownerAccount: { accountId: "account-owner", accountRef: "A-0B12", displayName: "Morgan Lee", maskedEmail: "m•••@example.test", isActive: true },
        member: { memberId: "existing-member", archivedAt: null, retiredByAdmissionEventId: null },
        clubAccess: { accessId: "access-revoked", status: "REVOKED", role: "ADMIN", revision: 3 },
        accessRestoreBlockers: ["This account owns another nonretired Player; manual identity review is required."],
      },
    });
    fetchMock.mockResolvedValue(jsonResponse(options));

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="original-player" connected />));
    await settle();

    expect(container.textContent).toContain("This account owns another nonretired Player; manual identity review is required.");
    expect(container.textContent).not.toContain("other-private-player");
    expect(container.textContent).not.toContain("Other Person");

    await act(async () => changeText(container.querySelector("textarea") as HTMLTextAreaElement, "Review access to the existing profile."));
    const confirmations = container.querySelectorAll("input[type=checkbox]");
    expect(confirmations).toHaveLength(2);
    await act(async () => click(confirmations[0]));
    await act(async () => click(confirmations[1]));
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Create access restoration invitation") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await act(async () => click(submit));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("lets a scoped admin revoke an exact legacy CLAIM invite on an already-owned Player", async () => {
    const activeOptions = identityOptions("ACCESS_RESTORE", {
      target: {
        ...identityOptions("ACCESS_RESTORE").target,
        ownerAccount: { accountId: "account-owner", accountRef: "A-0B12", displayName: "Morgan Lee", maskedEmail: "m•••@example.test", isActive: true },
        member: { memberId: "existing-member", archivedAt: null, retiredByAdmissionEventId: null },
        clubAccess: { accessId: "access-active", status: "ACTIVE", role: "MEMBER", revision: 3 },
        activeInvitation: { id: "legacy-claim-1", purpose: "CLAIM", status: "ACTIVE", expiresAt: "2026-10-15T00:00:00.000Z" },
      },
    });
    let currentOptions = activeOptions;
    fetchMock.mockImplementation(async (input: string | Request | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("identity-options")) return jsonResponse(currentOptions);
      if (init?.method === "POST") {
        currentOptions = {
          ...activeOptions,
          target: { ...activeOptions.target, activeInvitation: null },
        };
        return jsonResponse({ invitation: null });
      }
      throw new Error(`Unexpected request ${url}`);
    });

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="owned-player" connected />));
    await settle();

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const revoke = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Revoke this profile invitation");
    expect(revoke).not.toBeNull();
    await act(async () => click(revoke ?? null));
    await settle();

    expect(confirm).toHaveBeenCalledWith("Revoke profile invitation legacy-claim-1? Its link will stop working.");
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/clubs/club-1/members/owned-player/invitations");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ action: "REVOKE", invitationId: "legacy-claim-1" });
    expect(container.textContent).toContain("The profile invitation was revoked");
    expect(Array.from(container.querySelectorAll("button")).some(button => button.textContent === "Revoke this profile invitation")).toBe(false);
  });

  it("offers to clear an expired invitation row that is still stored as ACTIVE", async () => {
    const options = identityOptions("ACCESS_RESTORE", {
      target: {
        ...identityOptions("ACCESS_RESTORE").target,
        ownerAccount: { accountId: "account-owner", accountRef: "A-0B12", displayName: "Morgan Lee", maskedEmail: null, isActive: true },
        member: { memberId: "existing-member", archivedAt: null, retiredByAdmissionEventId: null },
        clubAccess: { accessId: "access-active", status: "ACTIVE", role: "MEMBER", revision: 3 },
        activeInvitation: { id: "stale-claim-1", purpose: "CLAIM", status: "ACTIVE", expiresAt: "2000-01-01T00:00:00.000Z" },
      },
    });
    fetchMock.mockImplementation(async (input: string | Request | URL, init?: RequestInit) => {
      if (String(input).includes("identity-options")) return jsonResponse(options);
      if (init?.method === "POST") return jsonResponse({ invitation: null });
      throw new Error(`Unexpected request ${String(input)}`);
    });

    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="owned-player" connected />));
    await settle();

    expect(container.textContent).toContain("This profile invitation expired");
    const clear = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Close expired profile invitation");
    expect(clear).not.toBeNull();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => click(clear ?? null));
    await settle();

    expect(confirm).toHaveBeenCalledWith("Close expired profile invitation stale-claim-1? Its link will stop working.");
    expect(container.textContent).toContain("The profile invitation was closed as expired");
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ action: "REVOKE", invitationId: "stale-claim-1" });
  });

  it("hides the identity action panel when scoped identity authorization returns 403", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));
    await act(async () => root.render(<PlayerIdentityInvitationActions clubId="club-1" playerId="original-player" connected />));
    await settle();
    expect(container.textContent).toBe("");
  });
});
